# -*- coding: utf-8 -*-
"""现货/基差业务：生意社现期表抓取（AKShare）+ 合约代码硬校验匹配 + 表预热"""
import datetime as _dt
import re
import threading
from functools import lru_cache

from data.spot_alias import SPOT_ALIAS

_spot_lock = threading.Lock()


@lru_cache(maxsize=64)
def _spot_fetch(date: str):
    """抓取某日现期表全量数据 -> (records, err)。串行抓取，防止并发重复请求。"""
    import akshare as ak
    with _spot_lock:
        try:
            df = ak.futures_spot_price(date=date)
            recs = df.to_dict("records")
            return (recs, None) if recs else ([], "空表")
        except Exception as e:
            return [], f"{type(e).__name__}: {e}"


def warm_spot_table():
    """后台预热今天起 10 天内的现期表，消灭当天首次请求的 1~3s 延迟"""
    def worker():
        for b in range(10):
            d = (_dt.date.today() - _dt.timedelta(days=b)).strftime("%Y%m%d")
            rows, _ = _spot_fetch(d)
            if rows:
                break                      # 找到最近有数据的交易日即停

    threading.Thread(target=worker, daemon=True, name="spot-warm").start()


def _get(row, *keys):
    for k in keys:
        v = row.get(k)
        if v is not None and str(v) != "" and str(v).lower() != "nan":
            return v
    return None


def _num(v):
    """'7,887.5' -> 7887.5，非法 -> None"""
    if v is None:
        return None
    try:
        s = str(v).replace(",", "").strip()
        if s == "" or s.lower() == "nan":
            return None
        return float(s)
    except Exception:
        return None


def _code_letters(s):
    """合约代码的字母部分：fu2701 -> FU；纯数字 2701 -> '' """
    m = re.match(r"^([A-Za-z]+)", str(s).strip())
    return m.group(1).upper() if m else ""


def fetch_spot(name=None, product=None, date=None) -> dict:
    """按品种匹配现货价格与基差，返回接口响应体。"""
    prod_up = (product or "").strip().upper()
    kws = []
    if name and str(name).strip():
        kws.append(str(name).strip())
    for a in SPOT_ALIAS.get(prod_up, []):
        if a not in kws:
            kws.append(a)
    if prod_up and prod_up not in kws:
        kws.append(prod_up)
    if not kws:
        return {"date": None, "spot": None, "source": "生意社基准价"}

    dates = [date] if date else [
        (_dt.date.today() - _dt.timedelta(days=b)).strftime("%Y%m%d") for b in range(10)
    ]
    best, notes = None, []
    for d in dates:
        rows, err = _spot_fetch(d)
        notes.append(f"{d}: {len(rows)}行" + (f" [{err}]" if err else ""))
        for r in rows:
            sym = str(_get(r, "symbol", "商品", "品种", "名称", "var", "symbol2") or "").strip()
            domc = str(_get(r, "dominant_contract", "主力合约", "dom_symbol") or "").strip()
            nearc = str(_get(r, "near_contract", "近月合约", "near_symbol") or "").strip()
            letters = _code_letters(domc) or _code_letters(nearc)
            # 硬校验：合约代码字母部分必须等于品种代码，防止 FU 匹配到玉米 C 这类串行
            if prod_up and letters and letters != prod_up:
                continue
            score = 5 if (prod_up and letters == prod_up) else 0
            sym_u = sym.upper()
            for kw in kws:
                if not kw:
                    continue
                kw_u = kw.upper()
                if sym_u == kw_u:
                    score = max(score, 4)
                elif any("\u4e00" <= ch <= "\u9fff" for ch in kw):
                    if kw in sym or (sym and sym in kw):
                        score = max(score, 2)
            if score and (best is None or score > best[0]):
                best = (score, d, r)
        if best and best[0] >= 4:
            break

    if not best:
        return {"date": None, "spot": None, "source": "生意社基准价",
                "kws": kws, "debug": notes}
    _, d, r = best
    return {
        "date": d,
        "symbol": _get(r, "symbol", "商品", "品种", "名称", "var", "symbol2"),
        "spot": _num(_get(r, "spot_price", "现货价格", "sp")),
        "dom_contract": _get(r, "dominant_contract", "主力合约", "dom_symbol"),
        "dom_price": _num(_get(r, "dominant_contract_price", "主力合约价格", "dom_price")),
        "dom_basis": _num(_get(r, "dom_basis", "主力基差")),
        "dom_basis_rate": _num(_get(r, "dom_basis_rate", "主力基差率")),
        "source": "生意社基准价",
    }