import { $, toast } from './utils.js';
import { S, bus } from './state.js';
import { fetchStatus } from './api.js';

export function markOnline() {
  S.wasOffline = false;
  const dot = $('connDot');
  dot.classList.remove('warn');
  dot.classList.add('on');
  $('connText').textContent = '已连接 · 行情在线';
}

export function markOffline(err) {
  const dot = $('connDot');
  dot.classList.remove('on');
  dot.classList.add('warn');
  $('connText').textContent = err ? '连接中断 · 自动重连中…' : '未连接';
  S.wasOffline = true;
}

async function pollStatus() {
  try {
    const s = await fetchStatus();
    if (s.logged_in) {
      if (S.wasOffline) {
        markOnline();
        toast('连接已恢复');
        bus.emit('connection-restored');
      } else {
        markOnline();
      }
    } else {
      markOffline(s.error);
    }
  } catch (e) { /* 静默 */ }
}

export function initStatus() {
  setInterval(pollStatus, 8000);
}