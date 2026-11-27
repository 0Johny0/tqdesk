import { $, fmt, dec, toast, isQuietErr } from './utils.js';
import { S, bus } from './state.js';
import { fetchQuote } from './api.js';
import { loadKline } from './kline.js';

const STAT_DEFS = [
  ["今开", "open"], ["最高", "high"], ["最低", "low"], ["昨收", "pre_close"], ["昨结", "pre_settle"],
  ["成交量", "volume"], ["持仓量", "oi"], ["买一", "bid1"], ["卖一", "ask1"],
  ["涨停", "up_limit"], ["跌停", "down_limit"],
];

export function clearQuote() {
  $('qSym').textContent = '—';
  $('qLast').textContent = '--';
  $('qLast').className = 'big-price mono';
  $('qChg').textContent = '--';
  $('qChg').className = 'chg mono';
  $('qTime').textContent = '';
  $('qStats').innerHTML = STAT_DEFS.map(([k]) =>
    `<div class="stat"><span class="k">${k}</span><span class="v mono">--</span></div>`).join("");
  bus.emit('quote-updated');             // 空态也算到位
}

export async function loadQuote() {
  if (!S.currentSymbol) return;
  const my = ++S.seqQ;
  try {
    const q = await fetchQuote(S.currentSymbol);
    if (my !== S.seqQ) return;
    const base = q.pre_settle ?? q.pre_close;
    const chg = (q.last != null && base != null) ? q.last - base : null;
    const pct = (chg != null && base) ? chg / base * 100 : null;
    const cls = chg == null ? "" : (chg >= 0 ? "up" : "down");
    $('qSym').textContent = S.currentSymbol.replace('KQ.m@', '主力 · ');
    $('qLast').textContent = q.last != null ? fmt(q.last, dec(q.last)) : "--";
    $('qLast').className = "big-price mono " + cls;
    $('qChg').textContent = chg == null ? "--" :
      `${chg >= 0 ? "+" : ""}${fmt(chg, 2)}  ${pct >= 0 ? "+" : ""}${fmt(pct, 2)}%`;
    $('qChg').className = "chg mono " + cls;
    $('qTime').textContent = q.datetime ? "更新 " + q.datetime.slice(0, 19) : "";
    $('qStats').innerHTML = STAT_DEFS.map(([k, f]) => {
      const v = q[f];
      const c = (f === "high" || f === "up_limit") ? "up" : (f === "low" || f === "down_limit") ? "down" : "";
      return `<div class="stat"><span class="k">${k}</span><span class="v mono ${c}">${v == null ? "--" : fmt(v, dec(v))}</span></div>`;
    }).join("");
    bus.emit('quote-updated');           // 右栏到位
  } catch (e) {
    if (my === S.seqQ && !isQuietErr(e.message)) {
      clearQuote();
      toast("快照获取失败：" + e.message);
    }
  }
}

export function initQuote() {
  bus.on('selection', loadQuote);
  bus.on('contract-change', loadQuote);
  bus.on('selection-cleared', clearQuote);
  let tick = 0;
  setInterval(() => {
    if (!$('autoQ').checked || !S.currentSymbol || S.refreshing) return;
    loadQuote();
    if (++tick % 2 === 0) loadKline();
  }, 5000);
}