import { $, toast } from './utils.js';
import { S, bus, exchName, loadFavs } from './state.js';
import { fetchProducts } from './api.js';

function buildChips() {
  const exs = ["ALL", ...new Set(S.allProducts.map(p => p.exchange))];
  $('exchChips').innerHTML = exs.map(e =>
    `<button class="chip ${e === S.exchFilter ? "active" : ""}" data-e="${e}">${e === "ALL" ? "全部" : exchName(e)}</button>`
  ).join("");
  $('exchChips').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    S.exchFilter = b.dataset.e; buildChips(); renderProducts();
  }));
}

function renderProducts() {
  const q = $('pq').value.trim().toLowerCase();
  const items = S.allProducts.filter(p =>
    (S.exchFilter === "ALL" || p.exchange === S.exchFilter) &&
    (!q || p.product.toLowerCase().includes(q) || p.name.includes(q) ||
     exchName(p.exchange).includes(q) || p.exchange.toLowerCase().includes(q))
  );
  $('plist').innerHTML = items.map(p => {
    const idx = S.allProducts.indexOf(p);
    const active = S.currentProduct && p.product === S.currentProduct.product && p.exchange === S.currentProduct.exchange;
    const title = p.name && p.name !== p.product
      ? `${p.name}<span class="p-code">（${p.product}）</span>`
      : `<span class="p-code" style="margin-left:0">${p.product}</span>`;
    const sub = `${exchName(p.exchange)}<span class="p-code">（${p.exchange}）</span>`;
    return `
    <div class="p-item ${active ? "active" : ""}" data-i="${idx}">
      <div class="p-title">${title}</div>
      <div class="p-sub">${sub}</div>
    </div>`;
  }).join("") || `<div style="padding:24px 20px;color:var(--faint);font-size:12px">无匹配品种</div>`;
  $('plist').querySelectorAll('.p-item').forEach(el =>
    el.addEventListener('click', () => selectProduct(S.allProducts[+el.dataset.i])));
}

export function selectProduct(p, preferSymbol) {
  if (!p) return;
  S.currentProduct = p;
  $('qName').textContent = p.name;
  const sel = $('contractSel');
  // 主力连续置顶，具体合约按月份倒序（近期在上，历史合约沉底）
  sel.innerHTML = `<option value="${p.main_symbol}">主力连续</option>` +
    [...p.contracts].reverse().map(c => `<option value="${c}">${c.split(".")[1].toUpperCase()}</option>`).join("");
  if (preferSymbol && [...sel.options].some(o => o.value === preferSymbol)) sel.value = preferSymbol;
  S.currentSymbol = sel.value;
  renderProducts();
  bus.emit('selection', p, S.currentSymbol);
}

/* 清空选中：自选为空的默认态，也是数据故障时的兜底态 */
export function clearSelection() {
  S.currentProduct = null;
  S.currentSymbol = '';
  $('qName').textContent = '—';
  $('contractSel').innerHTML = '';
  renderProducts();
  bus.emit('selection-cleared');
}

export async function loadProducts() {
  loadFavs();                      // 先读自选，供默认选中使用
  try {
    const d = await fetchProducts();
    S.allProducts = d.products || [];
    buildChips();
    renderProducts();

    // 默认选中：自选第一个 > 无（留空）
    let p = null, prefer;
    const fav0 = S.favs[0];
    if (fav0) {
      p = S.allProducts.find(x => x.product === fav0.product && x.exchange === fav0.exchange);
      if (p) prefer = fav0.symbol;
    }
    if (p) selectProduct(p, prefer);
    else clearSelection();         // 自选为空：所有数据留空
  } catch (e) {
    clearSelection();              // 品种加载失败：同样留空兜底
    toast('品种加载失败：' + e.message);
  }
}

export function initProducts() {
  $('pq').addEventListener('input', renderProducts);
  $('contractSel').addEventListener('change', e => {
    S.currentSymbol = e.target.value;
    bus.emit('contract-change', S.currentSymbol);
  });
  bus.on('logged-in', loadProducts);
}