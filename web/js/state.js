export const S = {
  allProducts: [], exchFilter: "ALL", currentProduct: null,
  currentSymbol: "", currentDur: 86400, chartRows: [], hoverIdx: null,
  seqQ: 0, seqS: 0, seqK: 0, refreshing: false, wasOffline: false,
  favs: [],
};

const listeners = {};
export const bus = {
  on(evt, fn) { (listeners[evt] ??= []).push(fn); },
  emit(evt, ...args) { (listeners[evt] || []).slice().forEach(fn => fn(...args)); },
};

export const EXCH_NAMES = {
  SHFE: "上期所", DCE: "大商所", CZCE: "郑商所",
  INE: "能源中心", CFFEX: "中金所", GFEX: "广期所",
};
export const exchName = e => EXCH_NAMES[e] || e;

/* 自选持久化（唯一读写出口） */
export function loadFavs() {
  try { S.favs = JSON.parse(localStorage.getItem('favSymbols') || '[]') || []; }
  catch (e) { S.favs = []; }
}
export function saveFavs() {
  localStorage.setItem('favSymbols', JSON.stringify(S.favs));
}