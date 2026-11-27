import { api } from './utils.js';

/* 需要同步到服务端的 key 列表（与 localStorage 同名） */
const PREF_KEYS = [
  'favSymbols',                                    // 自选列表
  'copyTplMin', 'copyTplDay',                      // 复制模板
  'kDur', 'kLimit', 'kChart', 'kAuto', 'kSound', 'kVolume',  // K线设置
  'favListH', 'plistH',                            // 侧栏高度
];

const _origSetItem = localStorage.setItem.bind(localStorage);
let _pushTimer = null;

/* 防抖推送到服务端（800ms） */
function _debouncedPush() {
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(_push, 800);
}

async function _push() {
  const prefs = {};
  for (const key of PREF_KEYS) {
    const v = localStorage.getItem(key);
    if (v !== null) prefs[key] = v;
  }
  try {
    await api('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
  } catch (e) { /* 静默：服务端暂不可用 */ }
}

/* Monkey-patch localStorage.setItem：所有设置写入自动同步服务端
   现有代码（table/kline/state/app）无需任何修改 */
localStorage.setItem = function (key, value) {
  _origSetItem(key, String(value));
  if (PREF_KEYS.includes(key)) _debouncedPush();
};

/* 启动时从服务端拉取设置写入 localStorage（不触发推送） */
export async function syncFromServer() {
  try {
    const prefs = await api('/api/prefs');
    for (const key of PREF_KEYS) {
      if (prefs[key] !== undefined && prefs[key] !== null) {
        _origSetItem(key, typeof prefs[key] === 'string' ? prefs[key] : JSON.stringify(prefs[key]));
      }
    }
  } catch (e) { /* 服务端不可用时用 localStorage 本地缓存 */ }
}