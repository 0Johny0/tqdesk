export const $ = id => document.getElementById(id);

export function fmt(v, d) {
  if (v === null || v === undefined || Number.isNaN(v)) return "--";
  return Number(v).toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function num(v) {
  if (v === null || v === undefined) return null;
  const f = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(f) ? f : null;
}
export function dec(v) { return Math.abs(v) >= 100 ? 1 : 2; }
export function pad(n) { return String(n).padStart(2, "0"); }
export function fmtTs(ms) {
  if (!ms) return "--";
  const t = new Date(ms);
  return `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}
export function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.style.display = "block";
  clearTimeout(el._t); el._t = setTimeout(() => el.style.display = "none", 3200);
}
export function isQuietErr(msg) {
  const m = String(msg || "");
  return m.includes("已被更新") || m.includes("尚未登录") || m.includes("连接中断");
}
export async function api(path, opt) {
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || r.statusText);
  return j;
}

/* 从合约代码取品种：KQ.m@CFFEX.T / CFFEX.T2603 -> "T" */
function productOf(symbol) {
  const m = String(symbol || "").match(/\.([A-Za-z]+)\d*$/);
  return m ? m[1].toUpperCase() : "";
}

/* 日盘收盘时刻：商品/股指 15:00；国债期货(T/TF/TS/TL) 15:15 */
const BOND_PRODUCTS = new Set(["T", "TF", "TS", "TL"]);
function dayCloseHour(symbol) {
  return BOND_PRODUCTS.has(productOf(symbol)) ? 15.25 : 15;
}

/* 判断某根 K 线是否"进行中"（尚未收完）
   日内周期：未到 bar 结束时刻即进行中
   日线：bar 的交易日 == 当前交易日，且处于该品种的交易时段内 */
export function isForming(startMs, durSec, symbol = "") {
  const now = Date.now();
  if (durSec < 86400) {
    return now < startMs + durSec * 1000;
  }
  const barDay = new Date(startMs + 12 * 3600 * 1000);
  barDay.setHours(0, 0, 0, 0);
  const d = new Date(now);
  const hm = d.getHours() + d.getMinutes() / 60;
  const today = new Date(d);
  today.setHours(0, 0, 0, 0);
  const close = dayCloseHour(symbol);
  if (hm >= 21) return barDay.getTime() > today.getTime();
  if (hm < 3) return barDay.getTime() === today.getTime();
  if (hm >= 9 && hm < close) return barDay.getTime() === today.getTime();
  return false;
}

/* ---- K 线完成提示音：Web Audio 合成双音"叮" ---- */
let _audioCtx = null;
export function playBeep(vol = 0.12) {
  if (vol <= 0) return;
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = _audioCtx.currentTime;
    const mkTone = (freq, start, dur, v) => {
      const osc = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain); gain.connect(_audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(v, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    };
    mkTone(832, t, 0.06, vol);
    mkTone(1247, t + 0.08, 0.10, vol);
  } catch (e) { /* 静默 */ }
}

/* ---- 交易日推导（日期归属，与 isForming 共用同一 +12h 技巧）----
   规则：date(ts + 12h)，周末顺延至下周一
   例：11-17 23:55 bar → 交易日 11-18；周五 22:45 bar → 周一 */
export function tradingDay(ts) {
  const d = new Date(ts + 12 * 3600 * 1000);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* bar 展示标签（明细表时间列 / 十字光标浮层共用）
   日线 = 交易日（2026-11-18）
   日内 = 交易日短格式 + 结束钟表时刻（11-18 22:50） */
export function barLabel(startMs, durSec) {
  const td = tradingDay(startMs);
  if (durSec >= 86400) return td;
  const t = new Date(startMs + durSec * 1000);
  return `${td.slice(5)} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}