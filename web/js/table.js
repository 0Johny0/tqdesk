import { $, fmt, fmtTs, dec, toast, isForming } from './utils.js';
import { S, bus } from './state.js';

const DEFAULT_TPL = "{range}\\t{open}-{close}（{high}/{low}）\\t{volume}\\t{oi}";

/* 显示用时间：日内 = K线结束时刻(开始+周期)；日线 = 起始日期（+86400 会跨到次日，不能用） */
function barTime(r) {
  return S.currentDur >= 86400 ? fmtTs(r[0]) : fmtTs(r[0] + S.currentDur * 1000);
}

function renderTable() {
  const N = 80;
  const rows = S.chartRows.slice(-N);
  const base = S.chartRows.length - rows.length;
  if (!rows.length) {
    $('kTbody').innerHTML =
      `<tr><td colspan="8" style="text-align:center;color:var(--faint);cursor:default">暂无数据</td></tr>`;
    return;
  }
  $('kTbody').innerHTML = rows.map((r, j) => {
    const gi = base + j;
    const prev = S.chartRows[gi - 1];
    const chg = prev ? r[4] - prev[4] : null;
    const c = chg == null ? "" : (chg >= 0 ? "up" : "down");
    const d = dec(r[4]);
    const forming = isForming(r[0], S.currentDur);       // 进行中：弱化 + 徽标
    return `<tr class="${forming ? 'forming' : ''}" data-gi="${gi}" title="${forming ? '进行中 · 点击复制此行' : '点击复制此行'}">
      <td>${barTime(r)}${forming ? ' <i class="doing">进行中</i>' : ''}</td>
      <td>${fmt(r[1], d)}</td>
      <td>${fmt(r[4], d)}</td>
      <td>${fmt(r[2], d)}</td>
      <td>${fmt(r[3], d)}</td>
      <td>${fmt(r[5], 0)}</td>
      <td>${fmt(r[6], 0)}</td>
      <td class="${c}">${chg == null ? "--" : (chg >= 0 ? "+" : "") + fmt(chg, 2)}</td>
    </tr>`;
  }).reverse().join("");
}

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
  } else fallbackCopy(t);
}
function fallbackCopy(t) {
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

function copyRow(gi) {
  const r = S.chartRows[gi];
  if (!r) return;
  const daily = S.currentDur >= 86400;
  const startMs = r[0], endMs = startMs + S.currentDur * 1000;
  const fmtT = ms => {
    const t = new Date(ms);
    return daily
      ? `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
      : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  };
  const prev = S.chartRows[gi - 1];
  const chg = prev ? r[4] - prev[4] : null;
  const d = dec(r[4]);
  const startStr = fmtT(startMs);
  const endStr = fmtT(daily ? startMs : endMs);        // 日线结束日期=开始日期
  const map = {
    start: startStr,
    end: endStr,
    range: startStr === endStr ? startStr : `${startStr}-${endStr}`,  // 日线合并为单日期
    start_full: fmtTs(startMs),
    open: fmt(r[1], d), close: fmt(r[4], d),
    high: fmt(r[2], d), low: fmt(r[3], d),
    volume: fmt(r[5], 0), oi: fmt(r[6], 0),
    chg: chg == null ? "--" : (chg >= 0 ? "+" : "") + fmt(chg, 2),
  };
  let tpl = $('copyTpl').value || DEFAULT_TPL;
  for (const [k, v] of Object.entries(map)) tpl = tpl.split("{" + k + "}").join(v);
  // 兜底：旧模板 {start}-{end} 在日线下会渲染成 "X-X"，折叠为 "X"
  if (startStr === endStr) tpl = tpl.split(`${startStr}-${endStr}`).join(startStr);
  tpl = tpl.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
  copyText(tpl);
  toast("已复制：" + tpl.replace(/\t/g, "  |  "));
}

export function initTable() {
  $('copyTpl').value = localStorage.getItem('copyTpl') || DEFAULT_TPL;
  $('copyTpl').addEventListener('change', () => localStorage.setItem('copyTpl', $('copyTpl').value));
  $('copyTpl').addEventListener('blur', () => localStorage.setItem('copyTpl', $('copyTpl').value));
  $('tplReset').addEventListener('click', () => {
    $('copyTpl').value = DEFAULT_TPL;
    localStorage.removeItem('copyTpl');
    toast('已恢复默认模板');
  });
  $('kTbody').addEventListener('click', e => {
    const tr = e.target.closest('tr');
    if (!tr || tr.dataset.gi === undefined) return;
    copyRow(+tr.dataset.gi);
  });
  bus.on('chart-updated', renderTable);
}