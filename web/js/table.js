import { $, fmt, pad, dec, toast, isForming, tradingDay, barLabel } from './utils.js';
import { S, bus } from './state.js';

const DEFAULT_TPL_MIN = "{time_start}-{time_end}\\t{open}-{close}（{high}/{low}）\\t{volume}\\t{oi}";
const DEFAULT_TPL_DAY = "{date}\\t{open}-{close}（{high}/{low}）\\t{volume}\\t{oi}";

/* 双模板存储 key 与默认值（随周期类型联动） */
function tplKey()     { return S.currentDur >= 86400 ? 'copyTplDay' : 'copyTplMin'; }
function tplDefault() { return S.currentDur >= 86400 ? DEFAULT_TPL_DAY : DEFAULT_TPL_MIN; }

function loadTplInput() { $('copyTpl').value = localStorage.getItem(tplKey()) || tplDefault(); }
function saveTpl()      { localStorage.setItem(tplKey(), $('copyTpl').value); }

function renderTable() {
  const N = 80;
  const rows = S.chartRows.slice(-N);
  const base = S.chartRows.length - rows.length;
  $('copyAllBtn').textContent = S.chartRows.length ? `复制全部(${S.chartRows.length})` : '复制全部';
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
    const forming = isForming(r[0], S.currentDur, S.currentSymbol);
    return `<tr class="${forming ? 'forming' : ''}" data-gi="${gi}" title="${forming ? '进行中 · 点击复制此行' : '点击复制此行'}">
      <td>${barLabel(r[0], S.currentDur)}${forming ? ' <i class="doing">进行中</i>' : ''}</td>
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

/* ---- 核心：按模板格式化一行（11 个变量，零分支）----
   {date}       交易日（唯一推导）    {start}     完整起始
   {end}        完整结束              {time_start} 钟表起始
   {time_end}   钟表结束              {open} {close} {high} {low} {volume} {oi} {chg}
   兼容兜底：{range} {start_full} */
function formatRow(r, gi) {
  const startMs = r[0];
  const endMs = startMs + S.currentDur * 1000;
  const dateStr = tradingDay(startMs);

  const fmtFull = ms => {
    const t = new Date(ms);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  };
  const fmtClock = ms => {
    const t = new Date(ms);
    return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  };

  const prev = S.chartRows[gi - 1];
  const chg = prev ? r[4] - prev[4] : null;
  const d = dec(r[4]);
  const tc = fmtClock(startMs), te = fmtClock(endMs);

  const map = {
    date: dateStr,
    start: fmtFull(startMs),
    end: fmtFull(endMs),
    time_start: tc,
    time_end: te,
    // 旧变量映射兜底
    range: S.currentDur >= 86400 ? dateStr : `${tc}-${te}`,
    start_full: fmtFull(startMs),
    // 价格量仓
    open: fmt(r[1], d), close: fmt(r[4], d),
    high: fmt(r[2], d), low: fmt(r[3], d),
    volume: fmt(r[5], 0), oi: fmt(r[6], 0),
    chg: chg == null ? "--" : (chg >= 0 ? "+" : "") + fmt(chg, 2),
  };
  let tpl = $('copyTpl').value || tplDefault();
  for (const [k, v] of Object.entries(map)) tpl = tpl.split("{" + k + "}").join(v);
  return tpl.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
}

function copyRow(gi) {
  const r = S.chartRows[gi];
  if (!r) return;
  const text = formatRow(r, gi);
  copyText(text);
  toast("已复制：" + text.replace(/\t/g, "  |  "));
}

function copyAll() {
  const rows = S.chartRows;
  if (!rows.length) { toast("暂无数据"); return; }
  const text = rows.map((r, gi) => formatRow(r, gi).replace(/\n+$/, "")).join("\n");
  copyText(text);
  toast(`已复制 ${rows.length} 根K线数据（按模板格式）`);
}

export function initTable() {
  // 迁移旧 key: copyTpl → copyTplMin + copyTplDay
  const legacy = localStorage.getItem('copyTpl');
  if (legacy) {
    localStorage.setItem('copyTplMin', legacy);
    localStorage.setItem('copyTplDay', legacy);
    localStorage.removeItem('copyTpl');
  }

  loadTplInput();

  $('copyTpl').addEventListener('change', saveTpl);
  $('copyTpl').addEventListener('blur', saveTpl);
  $('tplReset').addEventListener('click', () => {
    localStorage.removeItem(tplKey());
    $('copyTpl').value = tplDefault();
    toast('已恢复默认模板');
  });
  $('copyAllBtn').addEventListener('click', copyAll);

  $('kTbody').addEventListener('click', e => {
    const tr = e.target.closest('tr');
    if (!tr || tr.dataset.gi === undefined) return;
    copyRow(+tr.dataset.gi);
  });

  bus.on('chart-updated', renderTable);
  bus.on('period-change', loadTplInput);   // 切换周期 → 切换模板输入框内容
}