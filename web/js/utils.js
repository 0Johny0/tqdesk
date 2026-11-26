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

/* 自然日：bar 时间戳的日历日期（分钟线日期归属用） */
export function naturalDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* 交易日推导（仅供 isForming 日线判定使用，不参与展示）
   规则：hour >= 21 → 次日；周末顺延下周一 */
function tradingDay(ts) {
  const d = new Date(ts);
  if (d.getHours() >= 21) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* 从合约代码取品种 */
function productOf(symbol) {
  const m = String(symbol || "").match(/\.([A-Za-z]+)\d*$/);
  return m ? m[1].toUpperCase() : "";
}

const BOND_PRODUCTS = new Set(["T", "TF", "TS", "TL"]);
function dayCloseHour(symbol) {
  return BOND_PRODUCTS.has(productOf(symbol)) ? 15.25 : 15;
}

/* 判断某根 K 线是否"进行中"
   日内：未到 bar 结束时刻即进行中
   日线：bar 的交易日 == 当前交易日，且处于交易时段 */
export function isForming(startMs, durSec, symbol = "") {
  const now = Date.now();
  if (durSec < 86400) {
    return now < startMs + durSec * 1000;
  }
  const barDayStr = tradingDay(startMs);
  const todayStr = tradingDay(now);
  const d = new Date(now);
  const hm = d.getHours() + d.getMinutes() / 60;
  const close = dayCloseHour(symbol);
  return (hm >= 21 || hm < 3 || (hm >= 9 && hm < close)) && barDayStr === todayStr;
}

/* K 线完成提示音 */
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

/* bar 展示标签（明细表时间列 / 十字光标浮层共用）
   日线 = 自然日期；日内 = 自然日期短格式 + 结束钟表时刻 */
export function barLabel(startMs, durSec) {
  const nd = naturalDate(startMs);
  if (durSec >= 86400) return nd;
  const t = new Date(startMs + durSec * 1000);
  return `${nd.slice(5)} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}