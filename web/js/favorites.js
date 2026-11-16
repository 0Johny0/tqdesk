import { $, fmt, dec, toast } from './utils.js';
import { S, bus, exchName, saveFavs } from './state.js';
import { fetchWatch, syncWatch } from './api.js';

let watchQ = {};                   // 最近一次 /api/watch 快照，renderFavs 后立即回填避免闪'--'
let dragIdx = null;                // 拖拽排序：拖动中的源索引

function favIndex() { return S.favs.findIndex(f => f.symbol === S.currentSymbol); }

function updateFavBtn() {
  const on = favIndex() >= 0;
  const btn = $('favBtn');
  btn.textContent = on ? '♥' : '♡';
  btn.classList.toggle('on', on);
}

/* 告知后端当前自选列表，用于热订阅 */
function pushWatch() {
  syncWatch(S.favs.map(f => f.symbol)).catch(() => {});
}

function toggleFav() {
  const i = favIndex();
  if (i >= 0) {
    S.favs.splice(i, 1);
  } else if (S.currentProduct && S.currentSymbol) {
    const sel = $('contractSel');
    const label = sel.selectedOptions[0] ? sel.selectedOptions[0].text : S.currentSymbol;
    S.favs.push({
      symbol: S.currentSymbol, name: S.currentProduct.name,
      product: S.currentProduct.product, exchange: S.currentProduct.exchange, label,
    });
  }
  saveFavs();
  updateFavBtn();
  renderFavs();
  pushWatch();
  loadWatch();
  const btn = $('favBtn');
  btn.classList.remove('pop'); void btn.offsetWidth;
  btn.classList.add('pop');
}

/* 拖拽落位：把 dragIdx 移动到 targetIdx 的 before/after 位置 */
function dropAt(targetIdx, after) {
  const from = dragIdx;
  if (from == null) return;
  const item = S.favs.splice(from, 1)[0];
  let insert = targetIdx + (after ? 1 : 0);
  if (from < insert) insert -= 1;
  S.favs.splice(insert, 0, item);
  saveFavs();
  renderFavs();
  applyWatch();
}

function clearDropMarks() {
  document.querySelectorAll('.fav-item').forEach(el =>
    el.classList.remove('dragging', 'drop-before', 'drop-after'));
}

function renderFavs() {
  $('favCount').textContent = S.favs.length;
  const box = $('favList');
  if (!S.favs.length) {
    box.innerHTML = `<div class="fav-empty">暂无自选<br>点击右侧 ♡ 添加</div>`;
    return;
  }
  box.innerHTML = S.favs.map((f, i) => `
    <div class="fav-item ${f.symbol === S.currentSymbol ? "active" : ""}" data-i="${i}" draggable="true">
      <div class="fav-grip" title="拖动排序">⋮⋮</div>
      <div class="fav-body">
        <div class="fav-title">${f.name}<span class="p-code">（${f.product}）</span></div>
        <div class="fav-sub">${f.label} · ${exchName(f.exchange)}</div>
      </div>
      <div class="fav-quote" data-sym="${f.symbol}">
        <div class="fav-price">--</div>
        <div class="fav-pct"></div>
      </div>
      <div class="fav-x" title="移除自选">×</div>
    </div>`).join("");

  box.querySelectorAll('.fav-item').forEach(el => {
    const i = +el.dataset.i;

    /* 点击：选中 / 移除 */
    el.addEventListener('click', e => {
      if (e.target.classList.contains('fav-x')) {
        S.favs.splice(i, 1);
        saveFavs();
        updateFavBtn();
        renderFavs();
        pushWatch();
        return;
      }
      const f = S.favs[i];
      const p = S.allProducts.find(x => x.product === f.product && x.exchange === f.exchange);
      if (p) {
        import('./products.js').then(m => m.selectProduct(p, f.symbol));
      } else {
        toast('该自选合约暂不可用：' + f.symbol);
      }
    });

    /* 拖拽排序 */
    el.addEventListener('dragstart', e => {
      dragIdx = +el.dataset.i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragIdx));   // Safari 需要数据才触发 drop
      requestAnimationFrame(() => el.classList.add('dragging'));
    });

    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      clearDropMarks();
      el.classList.add(after ? 'drop-after' : 'drop-before');
    });

    el.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      const target = +el.dataset.i;
      clearDropMarks();
      dropAt(target, after);
    });

    el.addEventListener('dragend', clearDropMarks);
  });

  applyWatch();                    // 立即用上次快照回填价格，避免闪'--'
}

/* 列表空白区 drop：追加到末尾（从中间拖到列表底部时用） */
$('favList').addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
$('favList').addEventListener('drop', e => {
  e.preventDefault();
  if (dragIdx == null) return;
  clearDropMarks();
  dropAt(S.favs.length - 1, true);   // 末尾之后
});

/* 用 watchQ 回填价格/涨跌幅（红涨绿跌） */
function applyWatch() {
  S.favs.forEach(f => {
    const cell = document.querySelector(`.fav-quote[data-sym="${f.symbol}"]`);
    if (!cell) return;
    const priceEl = cell.querySelector('.fav-price');
    const pctEl = cell.querySelector('.fav-pct');
    const q = watchQ[f.symbol];
    if (!q || q.last == null) {
      priceEl.textContent = '--';
      priceEl.className = 'fav-price';
      pctEl.textContent = '';
      pctEl.className = 'fav-pct';
      return;
    }
    const pct = q.pct;
    const cls = pct == null ? '' : (pct >= 0 ? 'up' : 'down');
    priceEl.textContent = fmt(q.last, dec(q.last));
    priceEl.className = 'fav-price ' + cls;
    pctEl.textContent = pct == null ? '' : (pct >= 0 ? '+' : '') + fmt(pct, 2) + '%';
    pctEl.className = 'fav-pct ' + cls;
  });
}

async function loadWatch() {
  if (!S.favs.length) return;
  try {
    const d = await fetchWatch();
    watchQ = d.quotes || {};
    applyWatch();
  } catch (e) { /* 静默：行情快照轮询失败不打扰 */ }
}

export function initFavorites() {
  renderFavs();
  $('favBtn').addEventListener('click', toggleFav);
  bus.on('selection', () => { updateFavBtn(); renderFavs(); });
  bus.on('contract-change', () => { updateFavBtn(); renderFavs(); });
  bus.on('selection-cleared', () => { updateFavBtn(); renderFavs(); });
  bus.on('logged-in', () => { pushWatch(); loadWatch(); });
  setInterval(loadWatch, 5000);
}