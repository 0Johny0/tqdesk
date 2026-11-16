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

/* 判断某根 K 线是否"进行中"（尚未收完，数据还会变）
   日内周期：未到 bar 结束时刻即进行中（11:04 时 11:00 的 15 分线 → true）
   日线：再限定交易时段（夜盘 21 点后 / 凌晨 3 点前 / 日盘 9~15 点），避免收盘后误标 */
export function isForming(startMs, durSec) {
  const now = Date.now();
  if (now >= startMs + durSec * 1000) return false;
  if (durSec < 86400) return true;
  const h = new Date(now).getHours();
  return h >= 21 || h < 3 || (h >= 9 && h < 15);
}