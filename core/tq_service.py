# -*- coding: utf-8 -*-
"""行情服务：TqApi 单线程独占 + 任务队列 + 登录限时 + 断线自动重连
+ K线热订阅 + 自适应等待 + 自选实时行情(watch)"""
import math
import queue
import re
import threading
import time
from concurrent.futures import Future
from concurrent.futures import TimeoutError as FutTimeout

from data.product_names import PRODUCT_NAMES

try:
    from tqsdk.exceptions import TqTimeoutError
except Exception:
    class TqTimeoutError(Exception):
        pass


def jn(v):
    """NaN/Inf -> None，保证 JSON 合法"""
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def _log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


class TqService:
    DATA_FNS = ("quote", "kline")

    def __init__(self):
        self._q: "queue.Queue" = queue.Queue()
        self._api = None
        self._logged = False
        self._err = None
        self._creds = None
        self._reconnecting = False
        self._lock = threading.Lock()
        self._pending = {}          # 会话类任务去重：key -> Future
        self._gen = {}              # 数据类任务代数：fn -> 最新代数
        self._kcache = {}           # (sym, dur) -> (kline_serial, depth)，K线热订阅缓存
        self._warm = {}             # (fn, key) -> 上次取数时间，自适应等待用
        self._watch_want = set()    # 前端期望订阅的自选 symbol（断线重连后恢复用）
        self._watch_quotes = {}     # symbol -> tqsdk Quote（自选热订阅）
        threading.Thread(target=self._loop, daemon=True, name="tq-owner").start()

    # ---- 属性 ----
    @property
    def is_logged_in(self):
        return self._logged

    @property
    def error(self):
        return self._err

    # ---- 对外调用 ----
    def call(self, fn, *args, timeout=25):
        if fn in self.DATA_FNS:
            if self._api is None:
                # 未连接 / 重连中：立即失败，不排队等登录任务（避免 25s 假死）
                raise RuntimeError(self._err or "尚未登录")
            with self._lock:
                self._gen[fn] = self._gen.get(fn, 0) + 1
                gen = self._gen[fn]
            fut: Future = Future()
            self._q.put((fn, args, fut, None, gen))
        else:
            key = (fn, args)
            with self._lock:
                fut = self._pending.get(key)
                if fut is None:
                    fut = Future()
                    self._pending[key] = fut
                    self._q.put((fn, args, fut, key, None))
        try:
            return fut.result(timeout=timeout)
        except FutTimeout:
            raise RuntimeError("数据服务响应超时，请重试")
        except Exception as e:
            raise RuntimeError(f"{e}")

    # ---- 后台线程 ----
    def _loop(self):
        while True:
            if self._api is None:
                fn, args, fut, key, gen = self._q.get()
                self._exec(fn, args, fut, key, gen)
                continue
            try:
                fn, args, fut, key, gen = self._q.get(timeout=0.3)
                self._exec(fn, args, fut, key, gen)
            except queue.Empty:
                pass
            api = self._api        # 任务执行后可能已关闭(logout/登录失败)，取局部引用
            if api is None:
                continue
            try:
                api.wait_update(deadline=time.time() + 0.3)
            except TqTimeoutError:
                pass               # 暂无新行情（非交易时段常见），不是断线
            except Exception as e:
                if self._api is api:   # 只有当前连接真断了才判定断线
                    _log(f"连接中断: {e}")
                    self._err = f"连接中断: {e}"
                    self._logged = False
                    self._close()
                    self._spawn_reconnect()

    def _close(self):
        if self._api is not None:
            try:
                self._api.close()
            except Exception:
                pass
            self._api = None
        self._kcache.clear()        # 旧连接的 K 线订阅序列全部失效
        self._warm.clear()
        self._watch_quotes.clear()  # 旧连接的自选 quote 失效（_watch_want 保留，重连后恢复）

    def _need(self):
        if self._api is None:
            raise RuntimeError(self._err or "尚未登录")

    @staticmethod
    def _set(fut, result=None, exc=None):
        if fut.done():
            return
        if exc is not None:
            fut.set_exception(exc)
        else:
            fut.set_result(result)

    def _safe_wait(self, seconds):
        """等待行情刷新；空闲超时（非交易时段）不视为错误，返回缓存数据"""
        try:
            self._api.wait_update(deadline=time.time() + seconds)
        except TqTimeoutError:
            pass

    def _wait_budget(self, fn, key, cold_default=2.0):
        """自适应等待：30 秒内取过的热数据只需短暂收敛（~0.4s），冷数据多等"""
        k = (fn, key)
        warm = (time.time() - self._warm.get(k, 0)) < 30
        self._warm[k] = time.time()
        return 0.4 if warm else cold_default

    # ---- 登录：限时可放弃，网络卡死不阻塞主循环 ----
    def _open_api(self, user, pwd, timeout=12):
        box = {}
        done = threading.Event()

        def worker():
            try:
                from tqsdk import TqApi, TqAuth
                api = TqApi(auth=TqAuth(user, pwd))
                if box.get("abandon"):
                    try:
                        api.close()
                    except Exception:
                        pass
                else:
                    box["api"] = api
            except Exception as e:
                box["err"] = e
            finally:
                done.set()

        threading.Thread(target=worker, daemon=True, name="tq-open").start()
        if not done.wait(timeout):
            box["abandon"] = True
            return None, RuntimeError(f"登录超时({timeout}s)")
        if "err" in box:
            return None, box["err"]
        return box.get("api"), None

    def _spawn_reconnect(self):
        if not self._creds:
            return
        with self._lock:
            if self._reconnecting:
                return
            self._reconnecting = True

        def worker():
            _log("开始自动重连…")
            try:
                for i in range(12):
                    time.sleep(3)
                    try:
                        # 轻量单次尝试，失败由外层循环续期，不长期占住任务线程
                        self.call("login", self._creds[0], self._creds[1], timeout=20)
                        _log("自动重连成功")
                        return
                    except Exception as e:
                        _log(f"自动重连 第{i + 1}次失败: {e}")
            finally:
                with self._lock:
                    self._reconnecting = False

        threading.Thread(target=worker, daemon=True, name="tq-reconnect").start()

    # ---- 自选热订阅（watch）----
    def _sync_watch_subs(self):
        """按 _watch_want 订阅/退订自选 quote（须在已连接状态调用）"""
        want = self._watch_want
        for sym in list(self._watch_quotes):
            if sym not in want:
                del self._watch_quotes[sym]          # 退订不再需要的
        for sym in want:
            if sym not in self._watch_quotes:
                try:
                    self._watch_quotes[sym] = self._api.get_quote(sym)
                except Exception as e:
                    _log(f"watch 订阅失败 {sym}: {e}")
        if want:
            self._safe_wait(0.4)                     # 让首批数据到一点

    def watch_snapshot(self):
        """零等待序列化所有自选 quote（主循环已持续保鲜，读取不占任务队列）"""
        out = {}
        for sym, q in self._watch_quotes.items():
            last = jn(getattr(q, "last_price", None))
            base = jn(getattr(q, "pre_settle", None))
            if base is None:
                base = jn(getattr(q, "pre_close", None))
            chg = (last - base) if (last is not None and base) else None
            pct = (chg / base * 100) if (chg is not None and base) else None
            out[sym] = {
                "symbol": sym, "last": last,
                "change": chg, "pct": pct,
                "datetime": str(getattr(q, "datetime", "") or ""),
            }
        return out

    # ---- 任务执行 ----
    def _exec(self, fn, args, fut, key=None, gen=None):
        try:
            if gen is not None and self._gen.get(fn, 0) != gen:
                self._set(fut, exc=RuntimeError("已被更新的请求取代"))
                return
            if fn == "login":
                user, pwd = args
                self._close()
                self._creds = (user, pwd)
                self._err = None     # 重新登录时清掉残留错误提示
                api, err = self._open_api(user, pwd, timeout=12)
                if not api:
                    _log(f"登录失败: {err}")
                    raise RuntimeError(f"连接失败: {err}")
                self._api = api
                self._logged = True
                self._err = None
                _log("登录成功")
                self._sync_watch_subs()   # 恢复自选订阅
                self._set(fut, True)
            elif fn == "logout":
                self._creds = None
                self._close()
                self._logged = False
                self._err = None     # 主动断开不是错误，清掉残留提示
                self._set(fut, True)
            elif fn == "watch":
                # args[0] = 自选 symbol 元组；未连接时仅记录期望，登录成功后恢复订阅
                self._watch_want = set(args[0] or ())
                if self._api is not None:
                    self._sync_watch_subs()
                self._set(fut, True)
            elif fn == "products":
                self._need()
                self._set(fut, self._build_products())
            elif fn == "quote":
                self._need()
                sym = args[0]
                q = self._api.get_quote(sym)
                if sym not in self._watch_quotes:
                    self._safe_wait(self._wait_budget("quote", sym))
                # 自选已热订阅、主循环持续保鲜：零等待直读
                self._set(fut, self._quote_dict(sym, q))
            elif fn == "kline":
                self._need()
                sym, dur, lim = args
                dur, lim = int(dur), int(lim)
                key_k = (sym, dur)
                entry = self._kcache.get(key_k)
                if entry is None or entry[1] < lim:
                    # 新订阅/加深：tqsdk 单序列上限 8000 根，等数据到齐
                    depth = min(max(lim, 500), 8000)
                    ks = self._api.get_kline_serial(sym, dur, depth)
                    self._kcache[key_k] = (ks, depth)
                    self._safe_wait(2.5)
                    self._warm[("kline", key_k)] = time.time()
                else:
                    ks = entry[0]
                    self._safe_wait(self._wait_budget("kline", key_k))
                sub = ks.iloc[-lim:] if len(ks) > lim else ks
                self._set(fut, self._kline_rows(sub))
            else:
                raise RuntimeError("未知指令")
        except Exception as e:
            self._set(fut, exc=e)
        finally:
            if key is not None:
                with self._lock:
                    self._pending.pop(key, None)

    def _quote_dict(self, sym, q):
        g = lambda a: jn(getattr(q, a, None))
        return {
            "symbol": sym,
            "datetime": str(getattr(q, "datetime", "") or ""),
            "last": g("last_price"), "open": g("open"), "high": g("high"), "low": g("low"),
            "pre_close": g("pre_close"), "pre_settle": g("pre_settle"),
            "volume": g("volume"), "oi": g("open_interest"),
            "bid1": g("bid_price1"), "ask1": g("ask_price1"),
            "bid_vol1": g("bid_volume1"), "ask_vol1": g("ask_volume1"),
            "up_limit": g("upper_limit"), "down_limit": g("lower_limit"),
        }

    def _kline_rows(self, ks):
        rows = []
        for rec in ks.to_dict("records"):
            dtv = rec.get("datetime")
            ts = None
            try:
                if dtv is not None and not (isinstance(dtv, float) and math.isnan(dtv)):
                    ts = int(dtv) // 1_000_000  # 纳秒 -> 毫秒
            except Exception:
                ts = None
            rows.append([ts, jn(rec.get("open")), jn(rec.get("high")), jn(rec.get("low")),
                         jn(rec.get("close")), jn(rec.get("volume")), jn(rec.get("close_oi"))])
        return rows

    def _safe_query(self, api):
        for kwargs in ({"ins_class": "FUTURE"}, {"pattern": "*"}, {}):
            try:
                out = list(api.query_quotes(**kwargs))
                if out:
                    return out
            except Exception:
                continue
        return []

    @staticmethod
    def _clean_name(nm):
        nm = str(nm).strip()
        if not nm or not re.search(r"[\u4e00-\u9fff]", nm):
            return None
        cleaned = re.sub(r"[\d\-_/]+$", "", nm).strip()
        return cleaned or nm

    def _name_from_quote(self, q):
        for attr in ("instrument_name", "ins_name", "name", "insName"):
            nm = getattr(q, attr, None)
            if isinstance(nm, str):
                cleaned = self._clean_name(nm)
                if cleaned:
                    return cleaned
        return None

    def _build_products(self):
        api = self._api
        groups = {}
        for s in self._safe_query(api):
            parts = str(s).split(".")
            if len(parts) != 2:
                continue
            exch, code = parts
            m = re.match(r"^([A-Za-z]+)\d+$", code)
            if not m:
                continue
            # 品种代码保留原始大小写：tqsdk 各交易所写法不同
            # SHFE/DCE/INE 小写(fu2701)；CZCE 大写+3位月份(SA601)；CFFEX 大写(IF2601)
            groups.setdefault((exch, m.group(1)), []).append(code)

        out, pending = [], []
        for (exch, prod), codes in sorted(groups.items()):
            codes.sort()
            name = PRODUCT_NAMES.get(prod.upper())
            out.append({
                "exchange": exch, "product": prod.upper(), "name": name or prod.upper(),
                # KQ 主力连续的品种部分必须与合约代码大小写一致：KQ.m@CZCE.SA / KQ.m@SHFE.fu
                "main_symbol": f"KQ.m@{exch}.{prod}",
                "contracts": [f"{exch}.{c}" for c in codes],
            })
            if not name:
                pending.append((len(out) - 1, f"{exch}.{codes[0]}"))

        if pending:
            quotes = []
            try:
                for idx, sym in pending:
                    quotes.append((idx, api.get_quote(sym)))
                self._safe_wait(2.5)
            except Exception:
                pass
            for idx, q in quotes:
                nm = self._name_from_quote(q)
                if nm:
                    out[idx]["name"] = nm
        return out