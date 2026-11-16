import { api } from './utils.js';

export const fetchStatus = () => api('/api/status');
export const postLogin = (user, pwd) => api('/api/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user, pwd }),
});
export const postLogout = () => api('/api/logout', { method: 'POST' });
export const fetchProducts = () => api('/api/products');
export const fetchQuote = symbol => api('/api/quote?symbol=' + encodeURIComponent(symbol));
export const fetchKline = (symbol, duration, limit) =>
  api(`/api/kline?symbol=${encodeURIComponent(symbol)}&duration=${duration}&limit=${limit}`);
export const fetchSpot = (name, product) =>
  api(`/api/spot?name=${encodeURIComponent(name)}&product=${encodeURIComponent(product)}`);
export const fetchWatch = () => api('/api/watch');
export const syncWatch = symbols => api('/api/watch/sync', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbols }),
});