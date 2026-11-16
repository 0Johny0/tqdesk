import { $ } from './utils.js';
import { bus } from './state.js';
import { postLogin, postLogout, fetchStatus } from './api.js';

function enterApp() {
  $('loginOverlay').classList.add('hide');   // 已登录：收起登录框
  bus.emit('logged-in');
}

export async function boot() {
  try {
    const s = await fetchStatus();
    if (s.logged_in) { enterApp(); return; }   // 刷新/重复打开时走这里
    $('loginOverlay').classList.remove('hide');
    if (s.error) $('loginErr').textContent = s.error;
  } catch (e) {
    $('loginOverlay').classList.remove('hide');
    $('loginErr').textContent = '后台服务异常：' + e.message;
  }
}

async function doLogin() {
  const btn = $('loginBtn');
  btn.disabled = true; btn.textContent = '连接中…'; $('loginErr').textContent = '';
  try {
    await postLogin($('lu').value, $('lp').value);
    enterApp();
  } catch (e) {
    $('loginErr').textContent = e.message;
    btn.disabled = false; btn.textContent = '连 接';
  }
}

export function initAuth() {
  $('loginBtn').addEventListener('click', doLogin);
  $('lp').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('logoutBtn').addEventListener('click', async () => {
    await postLogout().catch(() => {});
    location.reload();
  });
}