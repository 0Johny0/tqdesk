import { $ } from './utils.js';
import { S, bus } from './state.js';
import { boot, initAuth } from './auth.js';
import { initStatus, markOnline } from './status.js';
import { initProducts } from './products.js';
import { initFavorites } from './favorites.js';
import { initQuote, loadQuote } from './quote.js';
import { initSpot, loadSpot } from './spot.js';
import { initKline, loadKline } from './kline.js';
import { initTable } from './table.js';

function refreshAll() {
  if (S.refreshing) return;
  S.refreshing = true;
  const btn = $('refreshAll');
  btn.disabled = true;
  btn.textContent = '刷新中…';
  Promise.allSettled([loadQuote(), loadSpot(), loadKline()]).then(() => {
    S.refreshing = false;
    btn.disabled = false;
    btn.textContent = '刷 新';
  });
}

function init() {
  window.__appBooted = true;      // 看门狗标记：模块图已正常启动

  initAuth();
  initStatus();
  initProducts();
  initFavorites();
  initQuote();
  initSpot();
  initKline();
  initTable();

  $('refreshAll').addEventListener('click', refreshAll);

  bus.on('logged-in', () => {
    markOnline();
  });
  bus.on('connection-restored', () => {
    if (S.currentSymbol) refreshAll();
  });

  boot();
}

init();