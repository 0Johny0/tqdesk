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

/* 判断某根 K 线是否"进行中"（尚未收完）
   日内周期：未到 bar 结束时刻即进行中（11:04 时 11:00 的 15 分线 → true）
   日线：bar 的交易日 == 当前交易日才进行中
     交易日归属：21 点后 → 明天；凌晨 3 点前 → 今天(夜盘延续)；9:00~15:15 → 今天
     bar 时间戳 +12h 归一化到交易日（兼容零点 / 前日21:00 两种惯例） */
export function isForming(startMs, durSec) {
  const now = Date.now();

  if (durSec < 86400) {
    return now < startMs + durSec * 1000;
  }

  // +12h：把 bar 时间戳归一到"交易日"（零点→当日中午；前日21:00→当日9点，日期都是交易日）
  const barDay = new Date(startMs + 12 * 3600 * 1000);
  barDay.setHours(0, 0, 0, 0);

  const d = new Date(now);
  const hm = d.getHours() + d.getMinutes() / 60;
  const today = new Date(d);
  today.setHours(0, 0, 0, 0);

  if (hm >= 21) {
    // 夜盘开盘：当日日线已收完，只有更晚日期的 bar（下一交易日）在进行中
    return barDay.getTime() > today.getTime();
  }
  if (hm < 3) {
    // 夜盘延续（凌晨）：今日交易日的 bar 进行中
    return barDay.getTime() === today.getTime();
  }
  if (hm >= 9 && hm < 15.25) {
    // 日盘：今日 bar 进行中
    return barDay.getTime() === today.getTime();
  }
  return false;      // 非交易时段
}