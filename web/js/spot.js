import { $, fmt, num, dec, toast } from './utils.js';
import { S, bus } from './state.js';
import { fetchSpot } from './api.js';

function emptyCells(v) {
  return `
    <div class="spot-cell"><span class="k">现货价格</span><span class="v">${v}</span></div>
    <div class="spot-cell"><span class="k">主力基差</span><span class="v">${v}</span></div>
    <div class="spot-cell"><span class="k">基差率</span><span class="v">${v}</span></div>
    <div class="spot-cell"><span class="k">对照合约</span><span class="v">${v}</span></div>`;
}

/* 空态：无选中 / 加载失败 共用 */
export function clearSpot() {
  $('spotBox').innerHTML = emptyCells('--');
  $('spotFoot').textContent = '';
}

export async function loadSpot() {
  const box = $('spotBox'), foot = $('spotFoot');
  if (!S.currentProduct) return;
  const my = ++S.seqS;
  box.innerHTML = emptyCells('加载中…');
  foot.textContent = "";
  try {
    const s = await fetchSpot(S.currentProduct.name, S.currentProduct.product);
    if (my !== S.seqS) return;
    if (s.spot == null) {
      box.innerHTML = emptyCells('--');       // 无现货数据：留空，脚注提示原因
      const dbg = (s.debug || []).slice(-3).join("；");
      foot.textContent = `未匹配到现货数据（关键词: ${(s.kws || []).join(" / ")}）` + (dbg ? " · " + dbg : "");
      return;
    }
    const spot = num(s.spot);
    let basis = num(s.dom_basis);
    if (basis == null && s.dom_price != null) basis = spot - num(s.dom_price);
    let rate = num(s.dom_basis_rate);
    if (rate == null && basis != null && s.dom_price) rate = basis / num(s.dom_price) * 100;
    const bc = basis == null ? "" : (basis >= 0 ? "up" : "down");
    const d = dec(spot);
    box.innerHTML = `
      <div class="spot-cell"><span class="k">现货价格</span><span class="v mono">${fmt(spot, d)}</span></div>
      <div class="spot-cell"><span class="k">主力基差</span><span class="v mono ${bc}">${basis == null ? "--" : (basis >= 0 ? "+" : "") + fmt(basis, d)}</span></div>
      <div class="spot-cell"><span class="k">基差率</span><span class="v mono ${bc}">${rate == null ? "--" : (rate >= 0 ? "+" : "") + fmt(rate, 2) + "%"}</span></div>
      <div class="spot-cell"><span class="k">对照合约</span><span class="v mono">${s.dom_contract || "--"}</span></div>`;
    const md = s.date ? `${s.date.slice(0, 4)}-${s.date.slice(4, 6)}-${s.date.slice(6, 8)}` : "--";
    foot.textContent = `匹配: ${s.symbol || S.currentProduct.name} · ${s.source} · ${md} 日频参考价，非精确成交价`;
  } catch (e) {
    if (my !== S.seqS) return;
    clearSpot();                                // 留空兜底
    toast("现货获取失败：" + e.message);          // 并弹提示
  }
}

export function initSpot() {
  bus.on('selection', loadSpot);
  bus.on('selection-cleared', clearSpot);
}