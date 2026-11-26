import { $, fmt, fmtTs, dec, toast, isQuietErr, isForming, playBeep, barLabel } from './utils.js';
import { S, bus } from './state.js';
import { fetchKline } from './api.js';

const VALID_DURS = [60, 300, 900, 1800, 3600, 86400];

/* 完成检测：跟踪上一次最后一根 bar 的状态 */
let prevState = null;

/* 空态：无选中 / 加载失败 共用 */
export function clearKline() {
  S.chartRows = [];
  S.hoverIdx = null;
  prevState = null;
  $('tip').style.display = 'none';
  bus.emit('chart-updated');
}

export async function loadKline() {
  if (!S.currentSymbol) return;
  const my = ++S.seqK;
  const lim = $('limitSel').value;
  try {
    const d = await fetchKline(S.currentSymbol, S.currentDur, lim);
    if (my !== S.seqK) return;
    S.chartRows = (d.rows || []).filter(r => r[0] && r[1] != null);
    S.hoverIdx = null;

    /* 检测"进行中 → 完成"转换，触发提示音 */
    const rows = S.chartRows;
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      const forming = isForming(last[0], S.currentDur, S.currentSymbol);
      const sameCtx = prevState &&
        prevState.sym === S.currentSymbol &&
        prevState.dur === S.currentDur;
      const justCompleted = sameCtx && prevState.forming &&
        (!forming || prevState.barTs !== last[0]);
      if (justCompleted && $('soundOn')?.checked) {
        playBeep(parseFloat($('volRange')?.value || '12') / 100);
      }
      prevState = { sym: S.currentSymbol, dur: S.currentDur, barTs: last[0], forming };
    }

    bus.emit('chart-updated');
  } catch (e) {
    if (my === S.seqK && !isQuietErr(e.message)) {
      clearKline();
      toast("K线获取失败：" + e.message);
    }
  }
}

function drawChart() {
  const wrap = $('chartWrap'), cv = $('kchart');
  if (wrap.classList.contains('hidden')) return;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const rows = S.chartRows;
  if (!rows.length) {
    ctx.fillStyle = "#565d70"; ctx.font = "13px 'IBM Plex Mono'";
    ctx.fillText("暂无数据 — 选择品种后自动加载", 20, 32);
    return;
  }
  const padL = 14, padR = 70, padT = 16, padB = 26;
  const plotW = W - padL - padR, innerH = H - padT - padB;
  const volH = innerH * 0.2, priceH = innerH - volH - 10;

  let hi = -Infinity, lo = Infinity, vmax = 0;
  for (const r of rows) {
    if (r[2] != null) hi = Math.max(hi, r[2]);
    if (r[3] != null) lo = Math.min(lo, r[3]);
    vmax = Math.max(vmax, r[5] || 0);
  }
  if (!isFinite(hi) || hi <= lo) { hi = (lo || 0) + 1; lo = (lo || 0) - 1; }
  const pd = (hi - lo) * 0.06; hi += pd; lo -= pd;

  const step = plotW / rows.length;
  const X = i => padL + step * (i + 0.5);
  const Y = p => padT + priceH * (1 - (p - lo) / (hi - lo));
  const VY = v => padT + priceH + 10 + volH * (1 - v / (vmax || 1));
  const dd = hi < 10 ? 2 : 1;

  ctx.font = "10px 'IBM Plex Mono'"; ctx.textAlign = "left";
  for (let s = 0; s <= 5; s++) {
    const p = lo + (hi - lo) * s / 5, y = Math.round(Y(p)) + 0.5;
    ctx.strokeStyle = "#20252f"; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#666d80"; ctx.fillText(p.toFixed(dd), padL + plotW + 10, y + 3);
  }

  const bw = Math.max(1.5, step * 0.62);
  const nLast = rows.length - 1;
  rows.forEach((r, i) => {
    const [, o, h, l, c, v] = r;
    const up = c >= o, col = up ? "#ff5252" : "#2ecc8f";
    const forming = i === nLast && isForming(r[0], S.currentDur, S.currentSymbol);
    const x = X(i);
    ctx.globalAlpha = forming ? 0.55 : 1;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, Y(h)); ctx.lineTo(x, Y(l)); ctx.stroke();
    const top = Y(Math.max(o, c)), bot = Y(Math.min(o, c));
    ctx.fillStyle = col;
    ctx.fillRect(x - bw / 2, top, bw, Math.max(1, bot - top));
    ctx.globalAlpha = forming ? 0.2 : 0.42;
    const vt = VY(v || 0);
    ctx.fillRect(x - bw / 2, vt, bw, padT + priceH + 10 + volH - vt);
    ctx.globalAlpha = 1;
  });

  const lastC = rows[nLast][4];
  const ly = Math.round(Y(lastC)) + 0.5;
  ctx.strokeStyle = "#ffb454"; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + plotW, ly); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffb454";
  ctx.fillRect(padL + plotW + 5, ly - 9, 60, 18);
  ctx.fillStyle = "#16120a"; ctx.font = "600 10px 'IBM Plex Mono'";
  ctx.fillText(lastC.toFixed(dd), padL + plotW + 10, ly + 4);

  ctx.fillStyle = "#666d80"; ctx.font = "10px 'IBM Plex Mono'"; ctx.textAlign = "center";
  const n = Math.min(7, rows.length);
  for (let k = 0; k < n; k++) {
    const i = Math.round(k * (rows.length - 1) / (n - 1 || 1));
    ctx.fillText(fmtTs(rows[i][0]), X(i), H - 8);
  }

  if (S.hoverIdx != null && S.hoverIdx >= 0 && S.hoverIdx < rows.length) {
    const x = X(S.hoverIdx);
    ctx.strokeStyle = "rgba(255,180,84,.55)"; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + priceH + 10 + volH); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function bindHover() {
  const wrap = $('chartWrap'), tip = $('tip');
  wrap.addEventListener('mousemove', e => {
    const rows = S.chartRows;
    if (!rows.length) return;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const padL = 14, padR = 70, plotW = rect.width - padL - padR;
    const step = plotW / rows.length;
    S.hoverIdx = Math.max(0, Math.min(rows.length - 1, Math.floor((mx - padL) / step)));
    drawChart();
    const r = rows[S.hoverIdx];
    const prev = rows[S.hoverIdx - 1];
    const chg = prev ? r[4] - prev[4] : null;
    const d = dec(r[4]);
    const forming = S.hoverIdx === rows.length - 1 && isForming(r[0], S.currentDur, S.currentSymbol);
    const tLabel = barLabel(r[0], S.currentDur);
    tip.innerHTML = `<b>${tLabel}${forming ? ' <span style="color:var(--accent)">进行中</span>' : ''}</b><br>
      开 ${fmt(r[1], d)} &nbsp; 收 <span style="color:${r[4] >= r[1] ? "#ff5252" : "#2ecc8f"}">${fmt(r[4], d)}</span><br>
      高 ${fmt(r[2], d)} &nbsp; 低 ${fmt(r[3], d)}<br>
      幅 ${chg == null ? "--" : (chg >= 0 ? "+" : "") + fmt(chg, 2)}<br>
      量 ${fmt(r[5], 0)} &nbsp; 持 ${fmt(r[6], 0)}`;
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(mx + 16, rect.width - tw - 12) + "px";
    tip.style.top = "14px";
  });
  wrap.addEventListener('mouseleave', () => {
    S.hoverIdx = null; tip.style.display = "none"; drawChart();
  });
}

/* ---------- 六项设置：持久化（localStorage）----------
   kDur    K线周期    默认 86400 日线
   kLimit  K线根数    默认 120
   kChart  显示K线图  默认 off
   kAuto   自动刷新   默认 off
   kSound  声音提示   默认 on
   kVolume 提示音量   默认 12 (0~50)
----------------------------------------------- */
function restoreSettings() {
  const savedDur = parseInt(localStorage.getItem('kDur') || '86400', 10);
  S.currentDur = VALID_DURS.includes(savedDur) ? savedDur : 86400;
  document.querySelectorAll('#periodSeg button').forEach(b =>
    b.classList.toggle('active', +b.dataset.d === S.currentDur));

  const savedLimit = localStorage.getItem('kLimit') || '120';
  if ([...$('limitSel').options].some(o => o.value === savedLimit)) $('limitSel').value = savedLimit;

  const showChart = localStorage.getItem('kChart') === '1';
  $('showChart').checked = showChart;
  if (showChart) $('chartWrap').classList.remove('hidden');

  $('autoQ').checked = localStorage.getItem('kAuto') === '1';
  $('soundOn').checked = localStorage.getItem('kSound') !== '0';

  const savedVol = parseInt(localStorage.getItem('kVolume') || '12', 10);
  $('volRange').value = String(Math.max(0, Math.min(50, savedVol)));
  $('volValue').textContent = $('volRange').value + '%';
}

export function initKline() {
  restoreSettings();

  /* ⚙ 设置面板：开合 + 点外关闭 */
  $('gearBtn').addEventListener('click', e => {
    e.stopPropagation();
    $('gearPanel').classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.gear-wrap')) $('gearPanel').classList.remove('open');
  });

  document.querySelectorAll('#periodSeg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#periodSeg button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    S.currentDur = +b.dataset.d;
    localStorage.setItem('kDur', String(S.currentDur));
    bus.emit('period-change');              // 通知 table 切换模板
    loadKline();
  }));

  $('limitSel').addEventListener('change', () => {
    localStorage.setItem('kLimit', $('limitSel').value);
    loadKline();
  });

  $('showChart').addEventListener('change', e => {
    localStorage.setItem('kChart', e.target.checked ? '1' : '0');
    const w = $('chartWrap');
    if (e.target.checked) { w.classList.remove('hidden'); drawChart(); }
    else w.classList.add('hidden');
  });

  $('autoQ').addEventListener('change', e => {
    localStorage.setItem('kAuto', e.target.checked ? '1' : '0');
  });

  $('soundOn').addEventListener('change', e => {
    localStorage.setItem('kSound', e.target.checked ? '1' : '0');
    if (e.target.checked) playBeep(parseFloat($('volRange')?.value || '12') / 100);
  });

  $('volRange').addEventListener('input', e => {
    $('volValue').textContent = e.target.value + '%';
  });
  $('volRange').addEventListener('change', e => {
    localStorage.setItem('kVolume', e.target.value);
    playBeep(parseFloat(e.target.value) / 100);
  });

  bus.on('selection', loadKline);
  bus.on('contract-change', loadKline);
  bus.on('selection-cleared', clearKline);
  bus.on('chart-updated', drawChart);
  bindHover();
  window.addEventListener('resize', drawChart);
}