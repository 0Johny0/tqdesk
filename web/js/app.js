import { $ } from './utils.js';
import { S, bus } from './state.js';
import { syncFromServer } from './prefs.js';
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

function initResizers() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  function makeResizable(target, handle, key, minH, maxH) {
    if (!target || !handle) return;
    const saved = parseInt(localStorage.getItem(key) || '0', 10);
    if (saved > 0) target.style.height = saved + 'px';
    let startY, startH;
    handle.addEventListener('mousedown', e => {
      startY = e.clientY;
      startH = target.offsetHeight;
      handle.classList.add('dragging');
      const onMove = ev => {
        const h = Math.max(minH, Math.min(startH + (ev.clientY - startY), maxH));
        target.style.height = h + 'px';
        ev.preventDefault();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.classList.remove('dragging');
        localStorage.setItem(key, String(target.offsetHeight));
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }
  const maxH = Math.max(400, sidebar.clientHeight - 60);
  makeResizable($('favList'),  $('favResizer'),  'favListH', 60,  maxH);
  makeResizable($('plist'),   $('plistResizer'), 'plistH',  100, maxH);
}

/* 切换品种/合约时旧数据标记"更新中"，新数据到达后恢复 */
function initStaleMarkers() {
  const markStale = () =>
    document.querySelectorAll('.hero, .kcard, .tcard')
      .forEach(el => el.classList.add('stale'));
  bus.on('selection', markStale);
  bus.on('contract-change', markStale);
  bus.on('chart-updated', () => {
    document.querySelector('.kcard')?.classList.remove('stale');
    document.querySelector('.tcard')?.classList.remove('stale');
  });
  bus.on('quote-updated', () => {
    document.querySelector('.hero')?.classList.remove('stale');
  });
}

async function init() {
  window.__appBooted = true;

  await syncFromServer();

  initAuth();
  initStatus();
  initProducts();
  initFavorites();
  initQuote();
  initSpot();
  initKline();
  initTable();
  initResizers();
  initStaleMarkers();

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