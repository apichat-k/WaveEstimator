
// Point-in-water test through the grid index: count shoreline crossings to the right of (x, y), each counted in the cell that holds it
function inWaterIdx(x, y, IX) {
  const { S, x0, y0, cell, nx, ny, start, idx } = IX;
  if (x <= IX.x0 || y <= IX.y0 || x >= IX.x1 || y >= IX.y1) return false;
  const cy = Math.min(ny - 1, Math.floor((y - y0) / cell));
  let c = 0;
  for (let cx = Math.min(nx - 1, Math.floor((x - x0) / cell)); cx < nx; cx++) {
    const xa = x0 + cx * cell, xb = xa + cell, cc = cy * nx + cx;
    for (let k = start[cc], e = start[cc + 1]; k < e; k++) {
      const i = idx[k], ay = S[i + 1], by = S[i + 3];
      if ((ay > y) !== (by > y)) {
        const ax = S[i], bx = S[i + 2], xi = ax + (y - ay) * (bx - ax) / (by - ay);
        if (xi > x && xi >= xa && xi < xb) c++;
      }
    }
  }
  return c % 2 === 1;
}

// ===== Sites =====
// Excel reference points: BB located by matching the radials of 00_Wave Estimation BB.xlsx on the Hydro_aw shoreline (median radial error 7–14 m);
// SNR re-fitted the same way against 00_Wave Estimation SNR.xlsx (median 19–112 m: the Excel used a different shoreline).
const RES = {
  BB: {
    th: 'อ่างเก็บน้ำเขื่อนภูมิพล', short: 'ภูมิพล', code: 'BB-PV', zone: 47, prj: 'BB', gust: 150, gustSrc: '00_Wave Estimation BB.xlsx',
    presets: [
      { name: 'F1', lat: 17.24731, lon: 98.91881, excel: { F: 7.032, dir: 339, Hs: 1.334, Hd: 2.228, T: null, t: 1.249, secA: 327, secB: 0 } },
      { name: 'F2', lat: 17.25984, lon: 98.89898, excel: { F: 5.788, dir: 6, Hs: 1.224, Hd: 2.044, T: null, t: 1.093, secA: 351, secB: 24 } },
      { name: 'F3', lat: 17.24465, lon: 98.92290, excel: { F: 4.672, dir: 156, Hs: 1.113, Hd: 1.858, T: null, t: 0.943, secA: 144, secB: 177 } },
    ],
  },
  SNR: {
    th: 'อ่างเก็บน้ำเขื่อนศรีนครินทร์', short: 'ศรีนครินทร์', code: 'SNR-PV1', zone: 47, prj: 'SNR', gust: 140, gustSrc: '00_Wave Estimation SNR.xlsx',
    presets: [
      { name: 'F1', lat: 14.49013, lon: 99.05885, excel: { F: 18.942, dir: 351, Hs: 1.902, Hd: 3.177, T: 4.44, t: 2.522, secA: 333, secB: 6 } },
      { name: 'F2', lat: 14.47853, lon: 99.07132, excel: { F: 7.782, dir: 24, Hs: 1.282, Hd: 2.142, T: null, t: 1.370, secA: 15, secB: 48 } },
      { name: 'F3', lat: 14.46648, lon: 99.06949, excel: { F: 6.481, dir: 147, Hs: 1.182, Hd: 1.974, T: null, t: 1.209, secA: 135, secB: 168 } },
    ],
  },
  VRK: { th: 'อ่างเก็บน้ำเขื่อนวชิราลงกรณ', short: 'วชิราลงกรณ', code: 'VRK-PV1', zone: 47, prj: 'VRK', gust: 140, gustSrc: null, presets: [] },
  UBR: { th: 'อ่างเก็บน้ำเขื่อนอุบลรัตน์', short: 'อุบลรัตน์', code: 'UR-PV', zone: 48, prj: null, gust: 140, gustSrc: null, presets: [] },
  SRD: { th: 'อ่างเก็บน้ำเขื่อนสิรินธร', short: 'สิรินธร', code: 'SRD-PV', zone: 48, prj: null, gust: 150, gustSrc: null, presets: [] },
};
const RES_ORDER = ['BB', 'SNR', 'VRK', 'UBR', 'SRD'];

let ZONE = 47;
let STANDALONE = false;           // true when online map tiles are reachable (HTML opened directly in a browser)
const STEP = 3;
const HFAC = { 0.004: 1.67, 0.01: 1.52, 0.02: 1.40, 0.04: 1.27 };   // DS-13 Table B-2
const HLBL = { 0.004: 'Maximum, H<sub>max</sub>', 0.01: 'H (คลื่นเกิน 1%)', 0.02: 'H<sub>5</sub>', 0.04: 'H<sub>10</sub>' };
const HSHORT = { 0.004: 'Hmax', 0.01: 'H 1%', 0.02: 'H5', 0.04: 'H10' };

const st = {
  res: 'BB', rings: null, proj: null, S: null, IX: null,
  pt: null, presetIdx: 0,
  rad: null, eff: null, dirIdx: 0, radOpen: null, effOpen: null,
  mode: 'all', view: { cx: 0, cy: 0, s: 0.01 },
  prjLayers: [], pvRings: [], pvS: new Float64Array(0),
};
const $ = id => document.getElementById(id);
const fmtInt = v => Math.round(v).toLocaleString('en-US');
const fmt = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);
let toastTimer = 0;
function toast(msg, ms = 3500) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, ms); }
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

function setShoreline(rings) {
  st.rings = rings;
  st.proj = makeUTM(rings, ZONE);
  st.S = buildSegments(rings, st.proj);
  st.IX = buildIndex(st.S, 250);
  buildPath();
}
const castShore = (x, y, d) => castIdx(x, y, d, st.IX);
const wet = (x, y) => inWaterIdx(x, y, st.IX);
const shelterOn = () => $('chkShelter').checked && st.pvRings.length > 0;
// Ray caster for a point: shoreline, plus PV blocks as obstacles when "แพ PV บังคลื่น" is on (blocks that contain the point are skipped)
function pointCast(x, y) {
  if (!shelterOn()) return castShore;
  const S = segsFromXY(st.pvRings.filter(r => !pip(x, y, [r])));
  return (px, py, d) => Math.min(castShore(px, py, d), castRay(px, py, d, S, 0.5));
}

// ---------- map ----------
const cv = $('map'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, waterPath = null;
function buildPath() {
  waterPath = new Path2D();
  for (const r of st.rings) {
    r.forEach(([lo, la], i) => { const [x, y] = st.proj.fwd(lo, la); i ? waterPath.lineTo(x, -y) : waterPath.moveTo(x, -y); });
    waterPath.closePath();
  }
}
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  draw();
}
// keep the view near the reservoir: limited pan and zoom-out stop tile floods far outside the project area
function clampView() {
  if (!st.IX || !W || !H) return;
  const { x0, y0, x1, y1 } = st.IX, span = Math.max(x1 - x0, y1 - y0);
  const sMin = Math.min(W, H) / (span * 1.4 + 6000);
  st.view.s = Math.max(sMin, Math.min(40, st.view.s));
  const m = 0.12 * span + 2500;
  st.view.cx = Math.max(x0 - m, Math.min(x1 + m, st.view.cx));
  st.view.cy = Math.max(y0 - m, Math.min(y1 + m, st.view.cy));
}
function fitBox(x0, y0, x1, y1, pad = 30) {
  st.view.cx = (x0 + x1) / 2; st.view.cy = (y0 + y1) / 2;
  st.view.s = Math.min((W - 2 * pad) / Math.max(x1 - x0, 50), (H - 2 * pad - 80) / Math.max(y1 - y0, 50));
  clampView();
}
function fitView() { const b = st.IX; fitBox(b.x0, b.y0, b.x1, b.y1); }
function zoomTo(x, y, spanM) { st.view.cx = x; st.view.cy = y; st.view.s = Math.min(W, H) / spanM; clampView(); }
const toScreen = (x, y) => [W / 2 + (x - st.view.cx) * st.view.s, H / 2 - (y - st.view.cy) * st.view.s];
const toWorld = (px, py) => [st.view.cx + (px - W / 2) / st.view.s, st.view.cy - (py - H / 2) / st.view.s];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';
const FONT_SANS = 'Inter, "Noto Sans Thai", system-ui, sans-serif';

function palette(imgVis) {
  const c = {
    land: css('--map-land'), water: css('--map-water'), shore: css('--map-shore'), grid: css('--map-grid'), ray: css('--map-ray'),
    sel: css('--map-sel'), pv: css('--map-pv'), fg: css('--ink'), fg2: css('--muted'), bg: css('--canvas'),
    ok: css('--success'), near: css('--warning'), over: css('--error'), muted: css('--muted'),
  };
  if (imgVis) Object.assign(c, { shore: 'rgba(170,220,255,0.9)', grid: 'rgba(255,255,255,0.30)', ray: 'rgba(255,255,255,0.40)', pv: 'rgba(255,255,255,0.20)', over: '#FF4D5E', muted: '#d0d0d0' });
  return c;
}
const mobileMQ = matchMedia('(max-width: 900px)');

function draw() {
  if (!st.S || !W) return;
  clampView();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const imgVis = STANDALONE && BM.on && !(BASES[BM.src].needsKey && !GS.session);
  const c = palette(imgVis);
  ctx.fillStyle = c.land; ctx.fillRect(0, 0, W, H);
  if (imgVis) { drawBasemap(); if (BM.labels) drawTiles(LABELS, 'labels', 1); }
  // water + shoreline
  ctx.save();
  ctx.translate(W / 2 - st.view.cx * st.view.s, H / 2 + st.view.cy * st.view.s);
  ctx.scale(st.view.s, st.view.s);
  if (!imgVis) { ctx.fillStyle = c.water; ctx.fill(waterPath, 'evenodd'); }
  ctx.lineWidth = (imgVis ? 1.4 : 1) / st.view.s; ctx.strokeStyle = c.shore; ctx.stroke(waterPath);
  ctx.restore();
  // UTM grid
  const [wl, wt] = toWorld(0, 0), [wr, wb] = toWorld(W, H);
  const gstep = niceStep((wr - wl) / (W < 560 ? 2.6 : 5));
  const labInk = imgVis ? '#ffffff' : c.fg2;
  ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.font = '10px ' + FONT_MONO;
  const labBg = t => { if (imgVis) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3; } t(); if (imgVis) ctx.restore(); };
  for (let e = Math.ceil(wl / gstep) * gstep; e < wr; e += gstep) {
    const [sx] = toScreen(e, 0);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    ctx.fillStyle = labInk; labBg(() => ctx.fillText(fmtInt(e) + 'E', sx + 4, H - 30));
  }
  for (let n = Math.ceil(wb / gstep) * gstep; n < wt; n += gstep) {
    const [, sy] = toScreen(0, n);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    ctx.fillStyle = labInk; labBg(() => ctx.fillText(fmtInt(n) + 'N', 6, sy - 4));
  }
  drawLayers(c, imgVis, labBg);
  // radials
  if (st.pt && st.rad) {
    const [px, py] = st.pt.xy;
    const win = windowIdx();
    ctx.lineWidth = 1; ctx.strokeStyle = c.ray;
    ctx.beginPath();
    st.rad.forEach((r, i) => {
      if (!isFinite(r.L) || win.has(i)) return;
      const th = r.deg * Math.PI / 180;
      const [a, b] = toScreen(px, py), [e, f] = toScreen(px + Math.sin(th) * r.L, py + Math.cos(th) * r.L);
      ctx.moveTo(a, b); ctx.lineTo(e, f);
    });
    ctx.stroke();
    ctx.strokeStyle = c.sel; ctx.fillStyle = c.sel; ctx.lineWidth = 1.5;
    for (const i of win) {
      const r = st.rad[i]; if (!isFinite(r.L)) continue;
      const th = r.deg * Math.PI / 180;
      const [a, b] = toScreen(px, py), [e, f] = toScreen(px + Math.sin(th) * r.L, py + Math.cos(th) * r.L);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(e, f); ctx.stroke();
      ctx.beginPath(); ctx.arc(e, f, 2.2, 0, 7); ctx.fill();
    }
    const cr = st.rad[st.dirIdx];
    if (cr && isFinite(cr.L)) {
      const th = cr.deg * Math.PI / 180;
      const Lm = Math.min(cr.L, 60 / st.view.s + 0.35 * cr.L);
      const [sx, sy] = toScreen(px, py), [tx, ty] = toScreen(px + Math.sin(th) * Lm, py + Math.cos(th) * Lm);
      const ang = Math.atan2(sy - ty, sx - tx);
      ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx - Math.cos(ang) * 12, sy - Math.sin(ang) * 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - Math.cos(ang) * 8, sy - Math.sin(ang) * 8);
      ctx.lineTo(sx - Math.cos(ang) * 20 + Math.sin(ang) * 6, sy - Math.sin(ang) * 20 - Math.cos(ang) * 6);
      ctx.lineTo(sx - Math.cos(ang) * 20 - Math.sin(ang) * 6, sy - Math.sin(ang) * 20 + Math.cos(ang) * 6);
      ctx.closePath(); ctx.fill();
    }
  }
  drawCheck(c, imgVis, labBg);
  // site marker
  if (st.pt) {
    const [sx, sy] = toScreen(...st.pt.xy);
    ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, 7); ctx.fillStyle = c.bg; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = c.sel; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 7); ctx.fillStyle = c.ok; ctx.fill();
  }
  drawMeas();
  // scale bar + north arrow (grid north)
  const target = niceStep(110 / st.view.s), pxl = target * st.view.s;
  ctx.fillStyle = labInk; ctx.strokeStyle = labInk; ctx.lineWidth = 1.5;
  const bx = 14, by = H - 46;
  labBg(() => { ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + pxl, by); ctx.lineTo(bx + pxl, by - 4); ctx.stroke(); });
  ctx.font = '10px ' + FONT_MONO;
  labBg(() => ctx.fillText(target >= 1000 ? (target / 1000) + ' km' : target + ' m', bx + pxl + 6, by + 3));
  const miniTop = !$('mini').hidden && !mobileMQ.matches;
  const nx = W - 28, ny = miniTop ? 168 : 28;
  labBg(() => { ctx.beginPath(); ctx.moveTo(nx, ny - 14); ctx.lineTo(nx + 6, ny + 4); ctx.lineTo(nx, ny); ctx.lineTo(nx - 6, ny + 4); ctx.closePath(); ctx.fill(); });
  ctx.font = '500 11px ' + FONT_SANS; labBg(() => ctx.fillText('N', nx - 3.5, ny + 17));
}

function polyPath(rings) {
  const p = new Path2D();
  for (const r of rings) { r.forEach(([x, y], i) => { const [sx, sy] = toScreen(x, y); i ? p.lineTo(sx, sy) : p.moveTo(sx, sy); }); p.closePath(); }
  return p;
}
function drawLayers(c, imgVis, labBg) {
  for (const L of st.prjLayers) {
    if (!L.vis) continue;
    const pv = L.role === 'pv';
    for (const f of L.feats) {
      ctx.strokeStyle = c.fg; ctx.setLineDash(pv ? [] : [7, 4]); ctx.lineWidth = pv ? 1.2 : 1.6;
      const p = polyPath(f.rings);
      if (pv) { ctx.fillStyle = c.pv; ctx.fill(p, 'evenodd'); ctx.stroke(p); }
      else if (f.open) {
        const r = f.rings[0];
        ctx.beginPath(); r.forEach(([x, y], i) => { const [sx, sy] = toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.stroke();
        ctx.save(); ctx.globalAlpha = 0.35; ctx.setLineDash([2, 4]);
        const [ax, ay] = toScreen(...r[r.length - 1]), [bx2, by2] = toScreen(...r[0]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.stroke(); ctx.restore();
      } else ctx.stroke(p);
      ctx.setLineDash([]);
      if (pv && st.view.s > 0.12) {
        const [lx, ly] = toScreen(...f.label);
        ctx.font = '500 10.5px ' + FONT_MONO; ctx.fillStyle = c.fg; ctx.textAlign = 'center';
        labBg(() => ctx.fillText(f.short, lx, ly + 4));
        ctx.textAlign = 'left';
      }
    }
  }
}

// pointer interaction: drag to pan, wheel/pinch to zoom, tap to pick (or open a checked stretch)
const ptrs = new Map(); let downAt = null, moved = false, pinch0 = null;
cv.addEventListener('pointerdown', e => {
  $('hint').hidden = true;
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (ptrs.size === 1) { downAt = { x: e.offsetX, y: e.offsetY }; moved = false; MEAS.cand = MEAS.on ? measHit(e.offsetX, e.offsetY, measTol(e)) : -1; MEAS.drag = -1; }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: st.view.s }; moved = true; MEAS.cand = MEAS.drag = -1; }
});
cv.addEventListener('pointermove', e => {
  const [wx, wy] = toWorld(e.offsetX, e.offsetY), [lo, la] = st.proj.inv(wx, wy);
  $('readout').textContent = 'UTM ' + ZONE + 'N  E ' + fmtInt(wx) + '  N ' + fmtInt(wy) + '  ·  ' + la.toFixed(5) + '°N ' + lo.toFixed(5) + '°E';
  if (!ptrs.has(e.pointerId)) {
    if (MEAS.on) {
      if (e.pointerType === 'mouse') { cv.classList.toggle('onvert', measHit(e.offsetX, e.offsetY, 10) >= 0); if (!MEAS.done && MEAS.pts.length) { MEAS.hover = [wx, wy]; scheduleDraw(); } }
      return;
    }
    if (e.pointerType === 'mouse') hoverPiece(e.offsetX, e.offsetY); return;
  }
  const prev = ptrs.get(e.pointerId);
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (ptrs.size === 2 && pinch0) {
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, [wx0, wy0] = toWorld(mx, my);
    st.view.s = pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d;
    clampView();
    const [wx1, wy1] = toWorld(mx, my); st.view.cx += wx0 - wx1; st.view.cy += wy0 - wy1;
    afterView(true); return;
  }
  if (downAt && Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y) > 5) moved = true;
  if (moved && MEAS.cand >= 0 && ptrs.size === 1) { MEAS.drag = MEAS.cand; MEAS.pts[MEAS.drag] = [wx, wy]; MEAS.hover = null; measRender(); return; }
  if (moved) { st.view.cx -= (e.offsetX - prev.x) / st.view.s; st.view.cy += (e.offsetY - prev.y) / st.view.s; afterView(true); }
});
function endPtr(e) {
  const wasTap = ptrs.size === 1 && !moved && downAt;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch0 = null;
  if (MEAS.drag >= 0) { MEAS.drag = MEAS.cand = -1; measRender(); }
  else if (wasTap && e.type === 'pointerup' && MEAS.on) measTap(e.offsetX, e.offsetY, e);
  else if (wasTap && e.type === 'pointerup') {
    const pc = pickPiece(e.offsetX, e.offsetY);
    if (pc) showPop(pc, true);
    else { hidePop(true); const [wx, wy] = toWorld(e.offsetX, e.offsetY); st.presetIdx = -1; setPointUTM(wx, wy); }
  }
  if (ptrs.size === 0) downAt = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { if (!POP.pinned) hidePop(); cv.classList.remove('onpiece'); if (MEAS.hover) { MEAS.hover = null; scheduleDraw(); } });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const [wx0, wy0] = toWorld(e.offsetX, e.offsetY);
  st.view.s *= Math.exp(-e.deltaY * 0.0015);
  clampView();
  const [wx1, wy1] = toWorld(e.offsetX, e.offsetY); st.view.cx += wx0 - wx1; st.view.cy += wy0 - wy1;
  afterView(true);
}, { passive: false });
let lastInteract = 0, settleTimer = 0;
function afterView(interactive = false) {
  if (interactive) { lastInteract = performance.now(); clearTimeout(settleTimer); settleTimer = setTimeout(scheduleDraw, 220); }
  scheduleDraw(); placePop();
}
$('zin').onclick = () => { st.view.s *= 1.5; afterView(); };
$('zout').onclick = () => { st.view.s /= 1.5; afterView(); };
$('zfit').onclick = () => { fitView(); afterView(); };
$('zoomSite').onclick = () => { if (st.pt && st.rad) { const L = Math.max(...st.rad.filter(r => isFinite(r.L)).map(r => r.L)); zoomTo(...st.pt.xy, Math.min(2.3 * L, 90000)); afterView(); } };
function zoomProject() { const b = prjBBox(); if (b) { fitBox(b[0], b[1], b[2], b[3], 50); afterView(); } }
$('zoomPrj').onclick = zoomProject;

// ---------- computation ----------
function windowIdx() {
  const n = +$('fmethod').value, h = (n - 1) / 2, m = st.rad.length, s = new Set();
  for (let k = -h; k <= h; k++) s.add((st.dirIdx + k + m) % m);
  return s;
}
function sectorSet(a, b) {
  const s = new Set(); a = ((Math.round(a / STEP) * STEP) % 360 + 360) % 360; b = ((Math.round(b / STEP) * STEP) % 360 + 360) % 360;
  let d = a; for (let g = 0; g < 200; g++) { s.add(d / STEP); if (d === b) break; d = (d + STEP) % 360; }
  return s;
}
function modeSet(m) {
  const n = 360 / STEP;
  if (m === 'sector') return sectorSet(+$('secA').value, +$('secB').value);
  if (m === 'fixed') return new Set([((Math.round(+$('fixDir').value / STEP) % n) + n) % n]);
  return new Set([...Array(n).keys()]);
}
function u1h() { return (+$('gust').value) / 3.6 / (+$('gf').value || 1) * (+$('rl').value || 1); }
function maxIn(set, eff = st.eff) { let bi = -1, bv = -1; for (const i of set) if (eff[i] > bv && isFinite(eff[i])) { bv = eff[i]; bi = i; } return bi; }

function setPointUTM(E, N) { const [lo, la] = st.proj.inv(E, N); setPoint(la, lo); }
function setPoint(lat, lon) {
  const [x, y] = st.proj.fwd(lon, lat);
  st.pt = { lat, lon, xy: [x, y], wet: wet(x, y) };
  $('lat').value = lat.toFixed(6); $('lon').value = lon.toFixed(6);
  $('ptE').value = x.toFixed(1); $('ptN').value = y.toFixed(1);
  $('gmaps').href = 'https://www.google.com/maps/@' + lat.toFixed(6) + ',' + lon.toFixed(6) + ',3000m/data=!3m1!1e3';
  document.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === st.presetIdx)));
  castPoint();
}
function castPoint() {
  if (!st.pt) return;
  const [x, y] = st.pt.xy;
  st.rad = allRadials(x, y, STEP, pointCast(x, y));
  st.radOpen = shelterOn() ? allRadials(x, y, STEP, castShore) : null;
  recompute();
}

function recompute() {
  if (!st.pt) return;
  const n = +$('fmethod').value;
  st.eff = effectiveFetch(st.rad, n);
  st.effOpen = st.radOpen ? effectiveFetch(st.radOpen, n) : st.eff;
  st.dirIdx = maxIn(modeSet(st.mode));
  if (st.dirIdx < 0) st.dirIdx = 0;
  render();
}

function render() {
  const ok = st.pt.wet && st.rad.every(r => isFinite(r.L));
  const ps = $('ptStatus');
  ps.classList.toggle('bad', !ok);
  ps.lastElementChild.textContent = !st.pt.wet ? 'จุดอยู่บนบก' : ok ? 'บนผิวน้ำ' + (shelterOn() ? ' · แพบังคลื่น' : '') : 'รัศมีไม่ชนขอบ';
  const U1 = u1h(), F = st.eff[st.dirIdx], dir = st.rad[st.dirIdx].deg;
  const p = +$('hp').value, kf = HFAC[p];
  const r = ok ? usbrDS13(F, U1) : null, q = ok ? spm84(F, U1) : null;
  $('oHdLbl').innerHTML = HLBL[p] + ' ×' + kf.toFixed(2);
  $('oHs').innerHTML = r ? fmt(r.Hs, 2) + '<small>m</small>' : '—';
  $('oHd').innerHTML = r ? fmt(r.Hs * kf, 2) + '<small>m</small>' : '—';
  $('oFv').innerHTML = ok ? fmt(F / 1000, 2) + '<small>km</small>' : '—';
  $('oDirS').innerHTML = dir + '°<small>' + compass(dir) + '</small>';
  $('oT').innerHTML = r ? fmt(r.T, 2) + '<small>s</small>' : '—';
  $('oL').textContent = r ? fmt(r.L, 1) + ' m' : '—';
  $('oF').textContent = +$('fmethod').value === 9 ? 'เฉลี่ย 9 รัศมี ±12°' : 'รัศมีเดี่ยว';
  $('oDir').textContent = dir + '°  (' + compass(dir) + ')';
  $('oTmin').textContent = r ? fmt(r.tmin / 3600, 2) + ' h  (' + Math.round(r.tmin / 60) + ' min)' : '—';
  $('oU1').textContent = fmt(U1, 2) + ' m/s';
  $('oUt').textContent = r ? fmt(r.U, 2) + ' m/s' : '—';
  const d = parseFloat($('depth').value);
  $('oDeep').textContent = !r ? '—' : !(d > 0) ? 'ใส่ความลึก (ต้อง > ' + fmt(r.L / 2, 1) + ' m)' : d > r.L / 2 ? 'น้ำลึก ✓ (d/L = ' + fmt(d / r.L, 2) + ')' : 'ไม่ผ่าน: d < L/2 ใช้สมการน้ำตื้น';

  const gi = maxIn(modeSet('all'));
  const flag = $('sectorFlag');
  if (ok && st.mode !== 'all' && st.eff[gi] > F * 1.05) {
    const g = usbrDS13(st.eff[gi], U1);
    flag.hidden = false;
    flag.innerHTML = '<b>มีทิศที่แรงกว่า</b> fetch สูงสุดจริงอยู่ที่ ' + st.rad[gi].deg + '° (F = ' + fmt(st.eff[gi] / 1000, 2) + ' km, Hs = ' + fmt(g.Hs, 2) + ' m) ซึ่งอยู่นอกทิศที่เลือก';
  } else flag.hidden = true;

  const rows = [];
  if (r) {
    rows.push(['USBR DS-13 / CEM' + (shelterOn() ? ' (แพบัง)' : ''), F / 1000, r.Hs, r.Hs * kf, r.T, r.tmin / 3600, true]);
    rows.push(['SPM 1984 (ACER TM 2)', F / 1000, q.Hs, q.Hs * kf, q.T, q.tmin / 3600]);
    if (st.radOpen) {
      const gO = maxIn(modeSet(st.mode), st.effOpen), wO = usbrDS13(st.effOpen[gO], U1);
      rows.push(['DS-13 ผิวน้ำเปิด (ไม่คิดแพบัง) @' + st.radOpen[gO].deg + '°', st.effOpen[gO] / 1000, wO.Hs, wO.Hs * kf, wO.T, wO.tmin / 3600]);
    }
    const pr = RES[st.res].presets[st.presetIdx];
    if (pr) {
      const ex = pr.excel, sIdx = maxIn(sectorSet(ex.secA, ex.secB), st.effOpen), Fs = st.effOpen[sIdx], rs = usbrDS13(Fs, U1);
      rows.push(['DS-13 ผิวน้ำเปิด ช่วงทิศเดียวกับ Excel (' + ex.secA + '°–' + ex.secB + '°)', Fs / 1000, rs.Hs, rs.Hs * kf, rs.T, rs.tmin / 3600]);
      rows.push(['Excel ' + pr.name + ' (Summary) @' + ex.dir + '°', ex.F, ex.Hs, p === 0.004 ? ex.Hd : ex.Hs * kf, ex.T, ex.t]);
    }
  }
  $('cmpBody').innerHTML = rows.map(rw => '<tr' + (rw[6] ? ' class="sel"' : '') + '><td>' + rw[0] + '</td><td>' + fmt(rw[1], 2) + '</td><td>' + fmt(rw[2], 2) + '</td><td>' + fmt(rw[3], 2) + '</td><td>' + fmt(rw[4], 2) + '</td><td>' + fmt(rw[5], 2) + '</td></tr>').join('')
    || '<tr><td colspan="6" style="color:var(--muted)">เลือกจุดบนผิวน้ำ</td></tr>';

  let html = '';
  st.rad.forEach((rr, i) => {
    const w = ok ? usbrDS13(st.eff[i], U1) : null;
    html += '<tr' + (i === st.dirIdx ? ' class="sel"' : '') + '><td>' + rr.deg + '</td><td>' + fmt(rr.L / 1000, 3) + '</td><td>' + fmt(st.eff[i] / 1000, 3) + '</td><td>' + (w ? fmt(w.Hs, 2) : '—') + '</td><td>' + (w ? fmt(w.T, 2) : '—') + '</td></tr>';
  });
  $('radBody').innerHTML = html;
  // collapsed-section summaries + floating card
  $('vDir').textContent = modeText() + ' · ' + dir + '° ' + compass(dir);
  $('vWind').textContent = (+$('gust').value) + ' km/h · U1h ' + fmt(U1, 1) + ' m/s';
  $('vDetail').textContent = r ? 'tmin ' + fmt(r.tmin / 3600, 2) + ' h · L0 ' + fmt(r.L, 1) + ' m' : '—';
  $('vPt').textContent = (st.presetIdx >= 0 && RES[st.res].presets[st.presetIdx] ? RES[st.res].presets[st.presetIdx].name + ' · ' : '') + 'E ' + fmtInt(st.pt.xy[0]) + ' N ' + fmtInt(st.pt.xy[1]);
  $('vCmp').textContent = r ? 'SPM ' + (q.Hs >= r.Hs ? '+' : '') + Math.round(100 * (q.Hs / r.Hs - 1)) + '% จาก DS-13' : '—';
  $('miniHs').innerHTML = r ? fmt(r.Hs, 2) + '<small>m</small>' : '—';
  $('miniHd').innerHTML = r ? fmt(r.Hs * kf, 2) + '<small>m</small>' : '—';
  $('miniHdK').textContent = HSHORT[p];
  $('miniMeta').textContent = ok ? 'F ' + fmt(F / 1000, 2) + ' km · ' + dir + '° ' + compass(dir) + ' · Tp ' + fmt(r.T, 2) + ' s' : 'เลือกจุดบนผิวน้ำ';
  drawRose();
  scheduleDraw();
}
function compass(d) { return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(d / 22.5) % 16]; }

// fetch (m) at which DS-13 gives Hs = A for the current wind (Hs grows monotonically with F)
function fetchForHs(A, U1) {
  if (!(A > 0)) return NaN;
  let lo = 1, hi = 3e5;
  if (usbrDS13(hi, U1).Hs < A) return Infinity;
  if (usbrDS13(lo, U1).Hs > A) return 0;
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); if (usbrDS13(m, U1).Hs < A) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- fetch rose (SVG): petals = F_eff by direction, coloured by Hs against the PV Array allowable ----------
const ROSE_APP = { face: 'var(--raised)', hair: 'var(--hair)', muted: 'var(--muted)', ink: 'var(--ink)', bg: 'var(--canvas)', ok: 'var(--success)', near: 'var(--warning)', over: 'var(--error)', sector: 'rgba(255,255,255,0.06)', font: 'JetBrains Mono, monospace' };
const ROSE_PRINT = { face: '#F7F7F5', hair: '#D9D9D6', muted: '#6B6B6B', ink: '#141413', bg: '#FFFFFF', ok: '#16A34A', near: '#D97706', over: '#DC2626', sector: 'rgba(0,0,0,0.06)', font: 'JetBrains Mono, monospace' };
function roseData() {
  const U1 = u1h(), A = allowFor('pv');
  const vals = st.rad.map(r => isFinite(r.L) ? r.L : 0), eff = st.eff.map(v => isFinite(v) ? v : 0);
  const cls = eff.map(v => { if (!(v > 0) || !isFinite(A)) return 'ok'; const r = usbrDS13(v, U1).Hs / A; return r > 1 + 1e-9 ? 'over' : r >= 0.9 ? 'near' : 'ok'; });
  const cnt = { ok: 0, near: 0, over: 0 }; cls.forEach((k, i) => { if (eff[i] > 0) cnt[k]++; });
  return { U1, A, vals, eff, cls, cnt, Fa: fetchForHs(A, U1) };
}
function roseSVG(pal, D = roseData()) {
  const R = 118, cx = 150, cy = 150, { vals, eff, cls, Fa } = D;
  const vmax = Math.max(1, ...vals, ...eff);
  const tick = niceStep(vmax / 1000 / 3), top = Math.ceil(vmax / 1000 / tick) * tick;
  const sc = R / (top * 1000);
  const pt = (deg, v) => { const t = deg * Math.PI / 180; return [cx + Math.sin(t) * v * sc, cy - Math.cos(t) * v * sc]; };
  const P = ([x, y]) => x.toFixed(1) + ',' + y.toFixed(1);
  let s = '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fetch rose แยกสีตามความสูงคลื่น">';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + pal.face + '" stroke="none"/>';
  if (st.mode === 'sector') for (const i of sectorSet(+$('secA').value, +$('secB').value)) { const d = st.rad[i].deg; s += '<path d="M' + cx + ',' + cy + 'L' + P(pt(d - 1.5, top * 1000)) + 'L' + P(pt(d + 1.5, top * 1000)) + 'Z" fill="' + pal.sector + '"/>'; }
  for (let k = tick; k <= top + 1e-9; k += tick) {
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (k * 1000 * sc).toFixed(1) + '" fill="none" stroke="' + pal.hair + '" stroke-width="1"/>';
    s += '<text x="' + (cx + 3) + '" y="' + (cy - k * 1000 * sc - 3).toFixed(1) + '" font-size="9" font-family="' + pal.font + '" fill="' + pal.muted + '">' + +k.toFixed(2) + '</text>';
  }
  for (let d = 0; d < 360; d += 30) { const [x, y] = pt(d, top * 1000); s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + pal.hair + '" stroke-width="1"/>'; }
  eff.forEach((v, i) => {
    if (!(v > 0)) return;
    const d = st.rad[i].deg;
    s += '<path d="M' + cx + ',' + cy + 'L' + P(pt(d - 1.45, v)) + 'L' + P(pt(d + 1.45, v)) + 'Z" fill="' + pal[cls[i]] + '" fill-opacity="' + (i === st.dirIdx ? 1 : 0.8) + '"/>';
  });
  s += '<polygon points="' + vals.map((v, i) => P(pt(st.rad[i].deg, v))).join(' ') + '" fill="none" stroke="' + pal.muted + '" stroke-opacity="0.6" stroke-width="0.8"/>';
  if (isFinite(Fa) && Fa > 0 && Fa < top * 1000) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (Fa * sc).toFixed(1) + '" fill="none" stroke="' + pal.ink + '" stroke-width="1.2" stroke-dasharray="4 3"/>';
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, d]) => { const [x, y] = pt(d, top * 1000 * 1.13); s += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="500" font-family="' + pal.font + '" fill="' + pal.muted + '">' + l + '</text>'; });
  const [sx, sy] = pt(st.rad[st.dirIdx].deg, eff[st.dirIdx]);
  s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + sx.toFixed(1) + '" y2="' + sy.toFixed(1) + '" stroke="' + pal.ink + '" stroke-width="2"/>';
  s += '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="4.5" fill="' + pal.ink + '" stroke="' + pal.bg + '" stroke-width="1.5"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="' + pal.ink + '"/>';
  return s + '</svg>';
}
function roseLegendHTML(D, pal) {
  const Atxt = isFinite(D.A) ? D.A.toFixed(2) + ' m' : '—', c = D.cnt;
  return '<span><i style="background:' + pal.ok + '"></i><em>H<sub>s</sub> &lt; 90% · ' + c.ok + ' ทิศ</em></span><span><i style="background:' + pal.near + '"></i><em>90–100% · ' + c.near + '</em></span><span><i style="background:' + pal.over + '"></i><em>เกิน ' + Atxt + ' · ' + c.over + '</em></span>'
    + (isFinite(D.Fa) && D.Fa > 0 ? '<span><i style="border:1.2px dashed ' + pal.ink + ';background:none"></i><em>F ' + fmt(D.Fa / 1000, 2) + ' km ทำให้ H<sub>s</sub> = ' + Atxt + '</em></span>' : '');
}
function drawRose() {
  const D = roseData();
  $('rose').innerHTML = roseSVG(ROSE_APP, D).replace('</svg>', '<circle cx="150" cy="150" r="142" fill="transparent" id="roseHit" style="cursor:' + (st.mode === 'fixed' ? 'pointer' : 'default') + '"/></svg>');
  $('roseLegend').innerHTML = roseLegendHTML(D, ROSE_APP);
  $('roseHit').addEventListener('click', e => {
    if (st.mode !== 'fixed') return;                     // clicking the rose only picks a direction in "กำหนดทิศ" mode
    const svg = e.currentTarget.ownerSVGElement, b = svg.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width * 300 - 150, y = (e.clientY - b.top) / b.height * 300 - 150;
    let deg = Math.atan2(x, -y) * 180 / Math.PI; if (deg < 0) deg += 360;
    $('fixDir').value = (Math.round(deg / STEP) * STEP) % 360; recompute(); updateModeLbl(); markStale();
  });
}

// ---------- controls ----------
function modeText() { return st.mode === 'all' ? 'สูงสุดทุกทิศ' : st.mode === 'sector' ? 'ช่วง ' + (+$('secA').value) + '°–' + (+$('secB').value) + '°' : 'ทิศ ' + (+$('fixDir').value) + '°'; }
function setMode(m) {
  st.mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('sectorRow').hidden = m !== 'sector'; $('fixedRow').hidden = m !== 'fixed';
  if (m === 'fixed' && st.rad) $('fixDir').value = st.rad[st.dirIdx].deg;
  updateModeLbl();
}
function updateModeLbl() { $('chkModeLbl').textContent = modeText(); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { setMode(b.dataset.mode); recompute(); markStale(); });
['gust', 'gf', 'rl', 'fmethod', 'secA', 'secB', 'fixDir'].forEach(id => $(id).addEventListener('input', () => { recompute(); updateModeLbl(); markStale(); }));
$('depth').addEventListener('input', recompute);
$('hp').addEventListener('input', () => { recompute(); refreshCheck(); });
let coordSrc = 'utm';
['ptE', 'ptN'].forEach(id => $(id).addEventListener('input', () => coordSrc = 'utm'));
['lat', 'lon'].forEach(id => $(id).addEventListener('input', () => coordSrc = 'geo'));
['ptE', 'ptN', 'lat', 'lon'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('goPt').click(); }));
$('goPt').onclick = () => {
  const num = id => parseFloat(String($(id).value).replace(/[,\s]/g, ''));
  st.presetIdx = -1;
  if (coordSrc === 'utm') {
    const E = num('ptE'), N = num('ptN');
    if (!(E > 100000 && E < 900000 && N > 0 && N < 10000000)) { toast('E/N ไม่อยู่ในช่วงของ UTM ' + ZONE + 'N'); return; }
    setPointUTM(E, N);
  } else {
    const la = num('lat'), lo = num('lon');
    if (!(Math.abs(la) <= 90 && Math.abs(lo) <= 180)) { toast('Latitude/Longitude ไม่ถูกต้อง'); return; }
    setPoint(la, lo);
  }
  zoomTo(...st.pt.xy, 16000); afterView();
};
async function copyText(txt, okEl, fallbackEl, okMsg) {
  const say = m => okEl ? (okEl.textContent = m) : toast(m, 4000);
  try { await navigator.clipboard.writeText(txt); say(okMsg); if (fallbackEl) fallbackEl.hidden = true; }
  catch (err) { if (fallbackEl) { fallbackEl.hidden = false; fallbackEl.value = txt; fallbackEl.focus(); fallbackEl.select(); } say('กด Ctrl/Cmd+C เพื่อคัดลอก'); }
}
$('copyTsv').onclick = () => {
  const U1 = u1h();
  const lines = ['# FPV Wave Estimator · ' + RES[st.res].th + ' · UTM ' + ZONE + 'N E ' + st.pt.xy[0].toFixed(1) + ' N ' + st.pt.xy[1].toFixed(1) + ' (lat ' + st.pt.lat.toFixed(6) + ' lon ' + st.pt.lon.toFixed(6) + ') · U1h ' + U1.toFixed(2) + ' m/s · fetch ' + ($('fmethod').value === '9' ? '9-radial avg' : 'single radial') + (shelterOn() ? ' · PV shelter' : ''),
    'Direction_deg\tRadial_km\tFeff_km\tHs_m\tTp_s\ttmin_h'];
  st.rad.forEach((r, i) => { const w = usbrDS13(st.eff[i], U1); lines.push(r.deg + '\t' + (r.L / 1000).toFixed(4) + '\t' + (st.eff[i] / 1000).toFixed(4) + '\t' + w.Hs.toFixed(3) + '\t' + w.T.toFixed(3) + '\t' + (w.tmin / 3600).toFixed(3)); });
  copyText(lines.join('\n'), $('copied'), $('tsvFallback'), 'คัดลอกแล้ว ' + st.rad.length + ' แถว');
};

// ---------- project layers (Boundary_*.kmz / PV_Array_*.kmz from the engineering team) ----------
const toUTMpts = pts => pts.map(([lo, la]) => llToUTM(lo, la, ZONE));
function centroid(r) { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; }
function featBounds(feats) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of feats) for (const r of f.rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function pip(x, y, rings) {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Block numbering: BB-PV right → left (columns east to west, north → south inside a column); others north → south, then west → east
function orderBlocks(key, blocks) {
  if (key === 'BB') {
    const cols = [];
    for (const b of blocks.slice().sort((a, c) => c.c[0] - a.c[0])) {
      const col = cols.find(k => Math.abs(k.x - b.c[0]) < 0.0006);
      if (col) col.items.push(b); else cols.push({ x: b.c[0], items: [b] });
    }
    return cols.flatMap(k => k.items.sort((a, c) => c.c[1] - a.c[1]));
  }
  return blocks.slice().sort((a, b) => (Math.abs(a.c[1] - b.c[1]) > 0.0006 ? b.c[1] - a.c[1] : a.c[0] - b.c[0]));
}
function buildProjectLayers() {
  const key = RES[st.res].prj;
  st.prjLayers = []; st.pvRings = []; st.pvS = new Float64Array(0);
  if (!key) return;
  const P = PROJECTS[key], vis = lsGet('fwe-prjvis') || {};
  const mk = f => { f.rings = f.ll.map(toUTMpts); f.label = centroid(f.rings[0]); return f; };
  const bnd = { id: 'prj-bnd', role: 'bnd', name: 'Project Boundary', vis: vis.bnd !== false, feats: P.bnd.map(r => mk({ name: 'Project Boundary', ll: [r], open: P.bndOpen })) };
  const blocks = orderBlocks(key, P.pv.map(r => ({ r, c: centroid(r) })));
  const pv = { id: 'prj-pv', role: 'pv', name: 'PV Array', vis: vis.pv !== false, feats: blocks.map((b, i) => mk({ name: 'แพ ' + (i + 1), short: String(i + 1), ll: [b.r] })) };
  [bnd, pv].forEach(L => L.bbox = featBounds(L.feats));
  st.prjLayers = [bnd, pv];
  st.pvRings = pv.feats.map(f => f.rings[0]);
  st.pvS = segsFromXY(st.pvRings);
}
function prjBBox() {
  if (!st.prjLayers.length) return null;
  const b = st.prjLayers.map(L => L.bbox);
  return [Math.min(...b.map(v => v[0])), Math.min(...b.map(v => v[1])), Math.max(...b.map(v => v[2])), Math.max(...b.map(v => v[3]))];
}
function ringLen(r, closed) { let s = 0; for (let i = 0; i < r.length - (closed ? 0 : 1); i++) { const a = r[i], b = r[(i + 1) % r.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; }
function renderPrjCard() {
  const key = RES[st.res].prj;
  $('zoomPrj').hidden = !key;
  $('chkPrj').textContent = key ? RES[st.res].code : RES[st.res].code + ' · ยังไม่มีผัง';
  $('chkRun').disabled = !key;
  const ul = $('prjList'); ul.innerHTML = '';
  if (!key) { ul.innerHTML = '<li class="note">' + RES[st.res].code + ' ยังไม่มีไฟล์ Project Boundary / PV Array แสดงเฉพาะขอบอ่าง</li>'; $('prjNote').hidden = true; $('vLay').textContent = 'ขอบอ่างเท่านั้น'; return; }
  const P = PROJECTS[key];
  st.prjLayers.forEach(L => {
    const li = document.createElement('li');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = L.vis; cb.id = 'cb_' + L.id;
    cb.onchange = () => { L.vis = cb.checked; lsSet('fwe-prjvis', { bnd: st.prjLayers[0].vis, pv: st.prjLayers[1].vis }); updateLayVal(); draw(); markStale(); };
    const sw = document.createElement('span'); sw.className = L.role === 'bnd' ? 'sw-bnd' : 'sw-pv';
    const nm = document.createElement('label'); nm.className = 'nm'; nm.htmlFor = cb.id; nm.textContent = L.name;
    const ct = document.createElement('span'); ct.className = 'ct';
    const per = L.feats.reduce((s, f) => s + ringLen(f.rings[0], !f.open), 0);
    ct.textContent = (L.role === 'pv' ? L.feats.length + ' แพ · ' : '') + 'เส้นรอบรูป ' + (per / 1000).toFixed(2) + ' km';
    li.append(cb, sw, nm, ct); ul.appendChild(li);
  });
  const nt = $('prjNote');
  nt.hidden = !P.bndOpen && st.res !== 'BB';
  nt.textContent = (P.bndOpen ? 'เส้น Project Boundary ในไฟล์ไม่ปิดรูปฝั่งที่ติดตลิ่ง แอปแสดงเส้นปิดเป็นเส้นจาง แต่ไม่นำเส้นปิดนั้นมาตรวจ ' : '') + (st.res === 'BB' ? 'แพของ BB-PV นับเลขจากขวาไปซ้าย (คอลัมน์เดียวกันนับจากเหนือลงใต้)' : '');
  updateLayVal();
}
function updateLayVal() { const v = st.prjLayers.filter(L => L.vis).map(L => L.role === 'pv' ? 'PV ' + L.feats.length + ' แพ' : 'Boundary'); $('vLay').textContent = (v.join(' · ') || 'ซ่อนผังโครงการ') + (STANDALONE && BM.on ? ' · ดาวเทียม' : ''); }

// =====================================================================
// ---------- wave-capacity check along PV Array / Project Boundary ----------
// =====================================================================
const CHK = { res: null, running: false, token: 0, stale: false, showAll: false };
const ROLE_LBL = { bnd: 'Project Boundary', pv: 'PV Array' };
function allowFor(role) { const v = parseFloat($(role === 'pv' ? 'allowPV' : 'allowBnd').value); return v > 0 ? v : NaN; }
function checkLayers() { return st.prjLayers.filter(L => L.vis); }

// ---------- Wave Breaker: efficiency needed to bring Hs at a perimeter piece down to the allowable Hs ----------
// Kt = Ht/Hi ≤ Hallow/Hs  →  η = 1 − Kt (wave-height reduction) or 1 − Kt² (wave-energy reduction), rounded UP to a whole %.
const WB_RAMP = ['#994a00', '#c56604', '#ef852e', '#ffb071', '#ffe0bf'];   // one-hue ordinal ramp, low → high η, checked on the dark water surface
const WB_BASE = 'rgba(161,161,161,0.55)';
const WB = { view: 'chk', def: 'h' };
{ const p = lsGet('fwe-wb'); if (p) { if (p.view === 'wb') WB.view = 'wb'; if (p.def === 'e') WB.def = 'e'; } }
const saveWB = () => lsSet('fwe-wb', { view: WB.view, def: WB.def });
const WB_DEF_TXT = { h: 'η = 1 − H<sub>t</sub>/H<sub>i</sub> (ลดความสูงคลื่น)', e: 'η = 1 − (H<sub>t</sub>/H<sub>i</sub>)<sup>2</sup> (ลดพลังงานคลื่น)' };
function wbEta(Hs, A) { if (!(Hs > A) || !(A > 0)) return 0; const k = A / Hs; return WB.def === 'e' ? 1 - k * k : 1 - k; }
const etaPct = e => Math.ceil(e * 100 - 1e-9);
const wbStepOf = mx => { const m = mx * 100; return m <= 25 ? 5 : m <= 50 ? 10 : 20; };
const wbBand = (e, s) => Math.min(4, Math.floor(e * 100 / s + 1e-9));
const wbBandLbl = (b, s) => b === 4 ? '≥ ' + 4 * s + '%' : b * s + '–' + (b + 1) * s + '%';
const L0of = T => 9.80665 * T * T / (2 * Math.PI);
function wbPrep(R) {
  let mx = 0;
  for (const p of R.pieces) { p.eta = p.cls === 'over' ? wbEta(p.Hs, allowFor(p.tg.role)) : 0; if (p.eta > mx) mx = p.eta; }
  R.wbMax = mx; R.wbS = wbStepOf(mx);
}
function wbRole(R, role) {
  const ps = R.pieces.filter(p => p.tg.role === role); if (!ps.length) return null;
  const o = ps.filter(p => p.cls === 'over');
  const mx = o.length ? o.reduce((a, p) => (p.eta > a.eta ? p : a)) : null;
  const bands = [0, 0, 0, 0, 0]; o.forEach(p => { bands[wbBand(p.eta, R.wbS)] += p.len; });
  return { A: allowFor(role), n: o.length, len: o.reduce((t, p) => t + p.len, 0), mx, bands };
}
function wbHTML(R) {
  const roles = ['pv', 'bnd'].map(r => [r, wbRole(R, r)]).filter(x => x[1]);
  if (!roles.length) return '';
  const any = roles.some(([, w]) => w.n);
  let h = '<div class="sum" id="wbSum"><div class="sumhead"><b>Wave Breaker ที่ต้องใช้</b>' + (any ? '<span class="tag">ประสิทธิภาพขั้นต่ำ</span>' : '<span class="badge ok">ไม่ต้องใช้</span>') + '</div>';
  h += '<div class="wbgrid">' + roles.map(([role, w]) => '<div class="wbk"><span class="k">' + ROLE_LBL[role] + '</span>'
    + (w.n ? '<span class="v">≥ ' + etaPct(w.mx.eta) + '<small>%</small></span><span class="s">K<sub>t</sub> ≤ ' + (w.A / w.mx.Hs).toFixed(2) + '</span><span class="s">ยาว ' + fmtInt(w.len) + ' m</span>'
      + '<span class="s">H<sub>s</sub> ' + w.mx.Hs.toFixed(2) + ' → ' + w.A.toFixed(2) + ' m</span><span class="s">T<sub>p</sub> ' + w.mx.T.toFixed(1) + ' s · L<sub>0</sub> ' + L0of(w.mx.T).toFixed(0) + ' m</span>'
      : '<span class="v none">ไม่ต้องใช้</span><span class="s">H<sub>s</sub> ไม่เกิน ' + w.A.toFixed(2) + ' m ทุกช่วง</span>') + '</div>').join('') + '</div>';
  if (any) {
    const rows = [4, 3, 2, 1, 0].filter(b => roles.some(([, w]) => w.bands[b] > 0));
    h += '<div class="tblwrap"><table class="wbtbl"><thead><tr><th><span class="nocase">η</span> ที่ต้องใช้</th>' + roles.map(([r]) => '<th>' + (r === 'pv' ? 'PV' : 'Boundary') + ' <span class="nocase">(m)</span></th>').join('') + '</tr></thead><tbody>'
      + rows.map(b => '<tr><td><i class="sw" style="background:' + WB_RAMP[b] + '"></i>' + wbBandLbl(b, R.wbS) + '</td>' + roles.map(([, w]) => '<td>' + (w.bands[b] ? fmtInt(w.bands[b]) : '—') + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></div>'
      + '<div class="wbrow"><span class="tag">สีบนแผนที่</span><div class="seg sm" role="group" aria-label="สีบนแผนที่">'
      + [['chk', 'ผลตรวจ H<sub>s</sub>'], ['wb', 'η ของ WB']].map(([k, t]) => '<button data-wbv="' + k + '" aria-pressed="' + (WB.view === k) + '">' + t + '</button>').join('') + '</div></div>'
      + '<label class="wbdef"><span>นิยาม</span><select id="wbDef"><option value="h"' + (WB.def === 'h' ? ' selected' : '') + '>η = 1 − Ht/Hi (ลดความสูงคลื่น)</option><option value="e"' + (WB.def === 'e' ? ' selected' : '') + '>η = 1 − (Ht/Hi)² (ลดพลังงานคลื่น)</option></select></label>'
      + '<p class="note">เลือก WB ที่ให้ K<sub>t</sub> ไม่เกินค่านี้ที่คาบคลื่น T<sub>p</sub> ข้างต้น (เทียบกราฟของผู้ผลิต) และให้แนว WB ยื่นเลยปลายช่วงที่เกินออกไป เพราะคลื่นอ้อมปลาย WB ได้</p>';
  }
  return h + '</div>';
}
function renderLegend() {
  const R = CHK.res, el = $('legend');
  if (!R) { el.hidden = true; return; }
  if (WB.view === 'wb' && R.wbMax > 0) {
    const present = [...new Set(R.pieces.filter(p => p.cls === 'over').map(p => wbBand(p.eta, R.wbS)))].sort((a, b) => a - b);
    el.innerHTML = '<span><em>η ของ WB</em></span>' + present.map(b => '<span><i class="lg" style="background:' + WB_RAMP[b] + '"></i>' + wbBandLbl(b, R.wbS) + '</span>').join('')
      + '<span><i class="lg base"></i>ไม่ต้องใช้</span><span><i class="lg na"></i>บนบก / ไม่มีทิศรับลม</span>';
  } else el.innerHTML = '<span><i class="lg ok"></i>ไม่เกิน 90%</span><span><i class="lg near"></i>90–100%</span><span><i class="lg over"></i>เกินค่าที่รับได้</span><span><i class="lg na"></i>บนบก / ไม่มีทิศรับลม</span>';
  el.hidden = false;
}
function capLegend() {
  const R = CHK.res;
  if (WB.view === 'wb' && R && R.wbMax > 0) {
    const present = [...new Set(R.pieces.filter(p => p.cls === 'over').map(p => wbBand(p.eta, R.wbS)))].sort((a, b) => a - b);
    return { title: 'η WB', items: present.map(b => [WB_RAMP[b], wbBandLbl(b, R.wbS)]) };
  }
  return { title: '', items: [['#22C55E', '< 90%'], ['#F59E0B', '90–100%'], ['#DC2626', 'เกิน']] };
}
function makePieces(step) {
  const pieces = [], targets = [];
  for (const L of checkLayers()) for (const f of L.feats) {
    for (const r of f.rings) {
      const closed = !f.open;
      const tg = { id: targets.length, L, f, role: L.role, name: f.name, closed, pieces: [] };
      targets.push(tg);
      let ch = 0;
      const m = closed ? r.length : r.length - 1;
      for (let i = 0; i < m; i++) {
        const a = r[i], b = r[(i + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.01) continue;
        const ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len;
        let nx = ey, ny = -ex;                                   // right-hand normal …
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (pip(mx + nx * 0.5, my + ny * 0.5, f.rings)) { nx = -nx; ny = -ny; }   // … turned to point out of the shape
        const n = Math.max(1, Math.ceil(len / step - 1e-9));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, tm = (k + 0.5) / n;
          const pc = {
            tg, x0: a[0] + (b[0] - a[0]) * t0, y0: a[1] + (b[1] - a[1]) * t0, x1: a[0] + (b[0] - a[0]) * t1, y1: a[1] + (b[1] - a[1]) * t1,
            x: a[0] + (b[0] - a[0]) * tm, y: a[1] + (b[1] - a[1]) * tm, nx, ny, ch: ch + len * tm, len: len / n,
          };
          tg.pieces.push(pc); pieces.push(pc);
        }
        ch += len;
      }
    }
  }
  return { pieces, targets };
}
function evalPiece(pc, P) {
  if (!wet(pc.x, pc.y)) { pc.status = 'land'; return; }
  const cast = P.shelter ? (x, y, d) => Math.min(castShore(x, y, d), castRay(x, y, d, P.pvS, 0.5)) : castShore;
  const rad = allRadials(pc.x, pc.y, STEP, cast);
  if (!rad.every(r => isFinite(r.L))) { pc.status = 'open'; return; }
  const eff = effectiveFetch(rad, P.n);
  let cand = P.list;
  if (P.exposed && pc.nx != null) cand = cand.filter(i => { const t = rad[i].deg * Math.PI / 180; return Math.sin(t) * pc.nx + Math.cos(t) * pc.ny > 1e-6; });
  const bi = maxIn(cand, eff);
  if (bi < 0) { pc.status = 'lee'; return; }
  const w = usbrDS13(eff[bi], P.U1);
  pc.status = 'ok'; pc.dir = rad[bi].deg; pc.F = eff[bi]; pc.Hs = w.Hs; pc.T = w.T;
}
function classify(pc) {
  if (pc.Hs == null) return pc.status;
  const A = allowFor(pc.tg.role);
  if (!isFinite(A)) return 'ok';
  const r = pc.Hs / A;
  return r > 1 + 1e-9 ? 'over' : r >= 0.9 ? 'near' : 'ok';
}
async function runCheck() {
  if (CHK.running) return;
  if (!checkLayers().length) { toast('เปิดเลเยอร์ PV Array หรือ Project Boundary ก่อน', 5000); return; }
  if (!isFinite(allowFor('pv')) || !isFinite(allowFor('bnd'))) { toast('กรอก Hs ที่รับได้ให้มากกว่า 0 m', 4000); return; }
  const step = +$('chkStep').value;
  const { pieces, targets } = makePieces(step);
  const P = { n: +$('fmethod').value, list: [...modeSet(st.mode)], exposed: $('chkExposed').checked, shelter: shelterOn(), U1: u1h(), pvS: st.pvS, step, modeLbl: modeText() };
  const token = ++CHK.token; CHK.running = true;
  const btn = $('chkRun'); btn.disabled = true; hidePop(true);
  const t0 = performance.now(); let tYield = t0;
  for (let i = 0; i < pieces.length; i++) {
    evalPiece(pieces[i], P);
    if (performance.now() - tYield > 40) {
      $('chkProg').textContent = 'กำลังคำนวณ ' + Math.round(100 * (i + 1) / pieces.length) + '% · ' + (i + 1).toLocaleString('en-US') + '/' + pieces.length.toLocaleString('en-US') + ' ช่วง';
      await new Promise(r => setTimeout(r, 0));
      tYield = performance.now();
      if (token !== CHK.token) return;
    }
  }
  CHK.running = false; btn.disabled = false;
  CHK.res = { pieces, targets, P, ms: performance.now() - t0, res: st.res };
  CHK.stale = false; CHK.showAll = false; $('chkStale').hidden = true;
  $('chkProg').textContent = pieces.length.toLocaleString('en-US') + ' ช่วง · ' + (CHK.res.ms / 1000).toFixed(1) + ' s';
  saveChkPrefs();
  refreshCheck();
}
function clearCheck() {
  CHK.token++; CHK.running = false; CHK.res = null; CHK.stale = false;
  $('chkRun').disabled = !RES[st.res].prj; $('chkProg').textContent = ''; $('chkStale').hidden = true;
  $('chkOut').hidden = true; $('chkOut').innerHTML = ''; $('legend').hidden = true;
  $('chkMiniSum').textContent = RES[st.res].prj ? 'ยังไม่ได้คำนวณ' : '';
  hidePop(true); scheduleDraw();
}
function markStale() { if (CHK.res && !CHK.stale) { CHK.stale = true; $('chkStale').hidden = false; } }
const chain = m => Math.floor(m / 1000) + '+' + String(Math.round(m % 1000) % 1000).padStart(3, '0');
function runsOf(tg) {
  const ps = tg.pieces, runs = [];
  let cur = null;
  ps.forEach(p => {
    if (p.cls === 'over') { if (!cur) { cur = { tg, list: [] }; runs.push(cur); } cur.list.push(p); }
    else cur = null;
  });
  if (tg.closed && runs.length > 1 && ps[0].cls === 'over' && ps[ps.length - 1].cls === 'over') {
    const last = runs.pop(); runs[0].list = [...last.list, ...runs[0].list];
  }
  for (const r of runs) {
    r.len = r.list.reduce((s, p) => s + p.len, 0);
    r.max = r.list.reduce((a, p) => (p.Hs > a.Hs ? p : a), r.list[0]);
    r.ch0 = Math.max(0, r.list[0].ch - r.list[0].len / 2); r.ch1 = r.list[r.list.length - 1].ch + r.list[r.list.length - 1].len / 2;
    r.wrap = r.ch1 < r.ch0;
    r.whole = tg.closed && r.list.length === ps.length;
  }
  return runs;
}
function refreshCheck() {
  const R = CHK.res, out = $('chkOut');
  if (!R) { out.hidden = true; $('legend').hidden = true; scheduleDraw(); return; }
  R.pieces.forEach(p => p.cls = classify(p));
  wbPrep(R);
  const kf = HFAC[+$('hp').value];
  let html = '', allRuns = [];
  for (const role of ['pv', 'bnd']) {
    const ps = R.pieces.filter(p => p.tg.role === role);
    if (!ps.length) continue;
    const A = allowFor(role);
    const len = k => ps.filter(p => p.cls === k).reduce((s, p) => s + p.len, 0);
    const Lok = len('ok'), Lnear = len('near'), Lover = len('over'), Lna = len('land') + len('lee') + len('open');
    const tot = Lok + Lnear + Lover + Lna, wetL = Lok + Lnear + Lover;
    const mx = ps.filter(p => p.Hs != null).reduce((a, p) => (!a || p.Hs > a.Hs ? p : a), null);
    const runs = R.targets.filter(t => t.role === role).flatMap(runsOf);
    allRuns.push(...runs);
    const badge = Lover > 0 ? '<span class="badge over">เกิน ' + runs.length + ' ช่วง</span>' : wetL > 0 ? '<span class="badge ok">ผ่านทุกช่วง</span>' : '<span class="badge na">ไม่มีช่วงบนผิวน้ำ</span>';
    const pc = v => tot ? (100 * v / tot) : 0;
    html += '<div class="sum"><div class="sumhead"><b>' + ROLE_LBL[role] + ' <span class="tag">≤ ' + fmt(A, 2) + ' m</span></b>' + badge + '</div>'
      + '<div class="bar" role="img" aria-label="สัดส่วนความยาวตามผลตรวจ"><i class="ok" style="width:' + pc(Lok) + '%"></i><i class="near" style="width:' + pc(Lnear) + '%"></i><i class="over" style="width:' + pc(Lover) + '%"></i><i class="na" style="width:' + pc(Lna) + '%"></i></div>'
      + '<div class="sumline"><span>H<sub>s</sub> สูงสุด</span><span>' + (mx ? fmt(mx.Hs, 2) + ' m · ' + (mx.Hs / A * 100).toFixed(0) + '% · ' + mx.dir + '° · H<sub>max</sub> ' + fmt(mx.Hs * kf, 2) : '—') + '</span>'
      + '<span>ความยาวที่เกิน</span><span>' + fmtInt(Lover) + ' / ' + fmtInt(wetL) + ' m' + (wetL ? ' (' + (100 * Lover / wetL).toFixed(1) + '%)' : '') + '</span></div></div>';
  }
  allRuns.sort((a, b) => b.max.Hs - a.max.Hs);
  R.runs = allRuns;
  html += wbHTML(R);
  if (allRuns.length) {
    const nShow = CHK.showAll || CARD.state === 'max' ? Math.min(allRuns.length, 200) : Math.min(allRuns.length, 5);
    html += '<div class="sum"><div class="sumhead"><b>ช่วงที่เกิน</b><span class="tag">เรียงจาก H<sub>s</sub> สูงสุด</span></div><div class="runs">'
      + allRuns.slice(0, nShow).map((r, i) => '<button class="run" data-run="' + i + '"><span class="t">' + (r.tg.role === 'pv' ? r.tg.name : 'Boundary') + '</span><span class="h">' + fmt(r.max.Hs, 2) + ' m · η ' + etaPct(r.max.eta) + '%</span>'
        + '<span class="s">' + (r.whole ? 'ทั้งรอบ' : 'กม. ' + chain(r.ch0) + '–' + chain(r.ch1) + (r.wrap ? ' (ผ่านจุดเริ่ม)' : '')) + ' · ' + fmtInt(r.len) + ' m · ลมจาก ' + r.max.dir + '° · F ' + fmt(r.max.F / 1000, 2) + ' km</span></button>').join('')
      + '</div>' + (allRuns.length > 5 ? '<button class="btn ghost sm" id="runsAll">' + (CHK.showAll ? 'แสดงน้อยลง' : 'แสดงทั้งหมด ' + allRuns.length + ' ช่วง') + '</button>' : '') + '</div>';
  }
  const P = R.P;
  html += '<div class="sum"><p class="note">U<sub>1h</sub> ' + fmt(P.U1, 2) + ' m/s · ' + P.modeLbl + (P.exposed ? ' · เฉพาะลมเข้าด้านนอก' : '') + (P.shelter ? ' · แพ PV บังคลื่น' : ' · ผิวน้ำเปิด') + ' · ทุก ' + P.step + ' m</p>'
    + '<div class="copyrow"><button class="btn secondary sm" id="chkCopy">คัดลอกผลทุกช่วง (TSV)</button><span class="copied" id="chkCopied"></span></div><textarea class="fallback" id="chkFallback" hidden readonly></textarea></div>';
  out.innerHTML = html; out.hidden = false;
  $('chkMiniSum').textContent = miniSum(R);
  out.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
    const r = R.runs[+b.dataset.run];
    const xs = r.list.flatMap(p => [p.x0, p.x1]), ys = r.list.flatMap(p => [p.y0, p.y1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 300);
    zoomTo((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, span * 2.2);
    draw(); showPop(r.max, true);
  });
  if ($('runsAll')) $('runsAll').onclick = () => { CHK.showAll = !CHK.showAll; refreshCheck(); };
  $('chkCopy').onclick = () => copyText(checkTSV(), $('chkCopied'), $('chkFallback'), 'คัดลอกแล้ว ' + R.pieces.length.toLocaleString('en-US') + ' แถว');
  out.querySelectorAll('[data-wbv]').forEach(b => b.onclick = () => {
    WB.view = b.dataset.wbv; saveWB();
    out.querySelectorAll('[data-wbv]').forEach(x => x.setAttribute('aria-pressed', x.dataset.wbv === WB.view));
    renderLegend(); scheduleDraw();
  });
  if ($('wbDef')) $('wbDef').onchange = () => { WB.def = $('wbDef').value; saveWB(); refreshCheck(); if (POP.pc) showPop(POP.pc, POP.pinned); };
  renderLegend();
  scheduleDraw(); placePop();
}
function checkTSV() {
  const R = CHK.res, kf = HFAC[+$('hp').value];
  const lines = ['# FPV Wave Estimator · wave check · ' + RES[R.res].th + ' (' + RES[R.res].code + ') · UTM ' + ZONE + 'N · U1h ' + R.P.U1.toFixed(2) + ' m/s · ' + R.P.modeLbl + (R.P.exposed ? ' · exposed only' : '') + (R.P.shelter ? ' · PV shelter' : ' · open water') + ' · step ' + R.P.step + ' m',
    'Layer\tFeature\tChainage_m\tE\tN\tLat\tLon\tStatus\tWindFrom_deg\tFeff_km\tHs_m\tHd_m\tTp_s\tAllowHs_m\tRatio\tKt_req\tWB_eta_req_pct (' + (WB.def === 'e' ? '1-Kt^2' : '1-Kt') + ')'];
  for (const p of R.pieces) {
    const [lo, la] = utmToLL(p.x, p.y, ZONE), A = allowFor(p.tg.role);
    lines.push([ROLE_LBL[p.tg.role], p.tg.name, p.ch.toFixed(1), p.x.toFixed(1), p.y.toFixed(1), la.toFixed(6), lo.toFixed(6), p.cls,
      p.dir ?? '', p.F != null ? (p.F / 1000).toFixed(4) : '', p.Hs != null ? p.Hs.toFixed(3) : '', p.Hs != null ? (p.Hs * kf).toFixed(3) : '', p.T != null ? p.T.toFixed(2) : '', A.toFixed(2), p.Hs != null ? (p.Hs / A).toFixed(3) : '',
      p.cls === 'over' ? (A / p.Hs).toFixed(3) : '', p.cls === 'over' ? etaPct(p.eta) : (p.Hs != null ? 0 : '')].join('\t'));
  }
  return lines.join('\n');
}
// draw results batched by class: one path per colour keeps thousands of 1 m pieces fast while panning
function drawCheck(c, imgVis, labBg) {
  const R = CHK.res; if (!R || R.res !== st.res) return;
  if (WB.view === 'wb' && R.wbMax > 0) { drawWB(R, c); return; }
  const paths = { ok: new Path2D(), near: new Path2D(), over: new Path2D(), na: new Path2D() }, used = {};
  for (const p of R.pieces) {
    const [ax, ay] = toScreen(p.x0, p.y0), [bx, by] = toScreen(p.x1, p.y1);
    if (Math.max(ax, bx) < -10 || Math.min(ax, bx) > W + 10 || Math.max(ay, by) < -10 || Math.min(ay, by) > H + 10) continue;
    const k = paths[p.cls] ? p.cls : 'na';
    paths[k].moveTo(ax, ay); paths[k].lineTo(bx, by); used[k] = true;
  }
  ctx.lineCap = 'butt';
  if (used.na) { ctx.strokeStyle = c.muted; ctx.lineWidth = 2.5; ctx.setLineDash([3, 3]); ctx.stroke(paths.na); ctx.setLineDash([]); }
  const col = { ok: c.ok, near: c.near, over: c.over };
  for (const k of ['ok', 'near', 'over']) if (used[k]) { ctx.strokeStyle = col[k]; ctx.lineWidth = k === 'over' ? 5 : 4; ctx.stroke(paths[k]); }
  for (const role of ['pv', 'bnd']) {
    const mx = R.pieces.filter(p => p.tg.role === role && p.Hs != null).reduce((a, p) => (!a || p.Hs > a.Hs ? p : a), null);
    if (!mx) continue;
    const [sx, sy] = toScreen(mx.x, mx.y);
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fillStyle = c.bg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = col[mx.cls] || c.fg; ctx.stroke();
    ctx.font = '500 11px ' + FONT_MONO; ctx.fillStyle = '#ffffff';
    const lbl = (role === 'pv' ? 'PV ' : 'BND ') + 'Hs ' + mx.Hs.toFixed(2) + ' m', tw = ctx.measureText(lbl).width;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
    ctx.fillText(lbl, sx + 9 + tw > W - 8 ? sx - 9 - tw : sx + 9, role === 'pv' ? sy - 8 : sy + 18); ctx.restore();
  }
  if (POP.pc) {
    const p = POP.pc, [ax, ay] = toScreen(p.x0, p.y0), [bx, by] = toScreen(p.x1, p.y1);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
const onScr = (ax, ay, bx, by) => !(Math.max(ax, bx) < -10 || Math.min(ax, bx) > W + 10 || Math.max(ay, by) < -10 || Math.min(ay, by) > H + 10);
function drawWB(R, c) {
  const bands = [0, 1, 2, 3, 4].map(() => new Path2D()), base = new Path2D(), na = new Path2D(), used = new Set();
  for (const p of R.pieces) {
    const [ax, ay] = toScreen(p.x0, p.y0), [bx, by] = toScreen(p.x1, p.y1);
    if (!onScr(ax, ay, bx, by)) continue;
    let path, k;
    if (p.cls === 'over') { k = wbBand(p.eta, R.wbS); path = bands[k]; }
    else if (p.cls === 'ok' || p.cls === 'near') { k = 'base'; path = base; }
    else { k = 'na'; path = na; }
    path.moveTo(ax, ay); path.lineTo(bx, by); used.add(k);
  }
  ctx.lineCap = 'butt';
  if (used.has('na')) { ctx.strokeStyle = c.muted; ctx.lineWidth = 2.5; ctx.setLineDash([3, 3]); ctx.stroke(na); ctx.setLineDash([]); }
  if (used.has('base')) { ctx.strokeStyle = WB_BASE; ctx.lineWidth = 3; ctx.stroke(base); }
  for (let k = 0; k < 5; k++) if (used.has(k)) { ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 7; ctx.stroke(bands[k]); ctx.strokeStyle = WB_RAMP[k]; ctx.lineWidth = 5; ctx.stroke(bands[k]); }
  // one label per exceeding stretch at its worst piece, pushed outward; skipped when it would overlap another label
  const boxes = []; let n = 0;
  for (const r of [...(R.runs || [])].sort((a, b) => b.max.eta - a.max.eta)) {
    if (n >= 40) break;
    const p = r.max, [sx, sy] = toScreen(p.x, p.y);
    if (sx < 20 || sy < 20 || sx > W - 20 || sy > H - 20) continue;
    const ox = sx + p.nx * 18, oy = sy - p.ny * 18, t = 'η ' + etaPct(p.eta) + '%';
    ctx.font = '500 11px ' + FONT_MONO; const w = ctx.measureText(t).width + 14;
    const bx = [ox - w / 2, oy - 10, ox + w / 2, oy + 10];
    if (boxHit(bx, boxes)) continue;
    boxes.push(mapPill(t, ox, oy, { stroke: WB_RAMP[wbBand(p.eta, R.wbS)] })); n++;
  }
  if (POP.pc) {
    const p = POP.pc, [ax, ay] = toScreen(p.x0, p.y0), [bx, by] = toScreen(p.x1, p.y1);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
function pickPiece(px, py, tol = 9) {
  const R = CHK.res; if (!R || R.res !== st.res) return null;
  let best = null, bd = tol;
  for (const p of R.pieces) {
    const [ax, ay] = toScreen(p.x0, p.y0), [bx, by] = toScreen(p.x1, p.y1);
    if (Math.min(ax, bx) - tol > px || Math.max(ax, bx) + tol < px || Math.min(ay, by) - tol > py || Math.max(ay, by) + tol < py) continue;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const POP = { pc: null, pinned: false };
function hoverPiece(px, py) {
  const p = pickPiece(px, py);
  cv.classList.toggle('onpiece', !!p);
  if (POP.pinned) return;
  if (p) { if (p !== POP.pc) showPop(p, false); } else if (POP.pc) hidePop();
}
const STATUS_TXT = { land: 'กึ่งกลางช่วงอยู่บนบก ไม่ตรวจ', lee: 'ไม่มีทิศลมที่พัดเข้าด้านนอกในโหมดทิศนี้', open: 'มีรัศมีที่ไม่ชนขอบอ่าง' };
function showPop(p, pin) {
  POP.pc = p; POP.pinned = pin;
  const el = $('pop'), A = allowFor(p.tg.role), kf = HFAC[+$('hp').value];
  const cls = { ok: 'ok', near: 'ok', over: 'over' }[p.cls];
  el.innerHTML = '<div class="pop-head"><b>' + (p.tg.role === 'pv' ? 'PV Array · ' + p.tg.name : 'Project Boundary') + '</b>' + (pin ? '<button class="iconbtn" id="popX" aria-label="ปิด" style="width:28px;height:28px">×</button>' : '') + '</div>'
    + '<span class="tag">กม. ' + chain(p.ch) + ' · E ' + fmtInt(p.x) + ' N ' + fmtInt(p.y) + '</span>'
    + (p.Hs != null ? '<div class="hsline"><span class="num">' + p.Hs.toFixed(2) + '<small>m</small></span><span class="badge ' + cls + '"' + (p.cls === 'near' ? ' style="color:var(--warning);border-color:rgba(245,158,11,.4)"' : '') + '>' + (p.Hs / A * 100).toFixed(0) + '% ของ ' + A.toFixed(2) + ' m</span></div>'
      + '<dl class="kv"><dt>H<sub>s</sub> × ' + kf.toFixed(2) + '</dt><dd>' + (p.Hs * kf).toFixed(2) + ' m</dd><dt>ลมพัดมาจาก</dt><dd>' + p.dir + '° (' + compass(p.dir) + ')</dd><dt>F<sub>eff</sub></dt><dd>' + (p.F / 1000).toFixed(2) + ' km</dd><dt>T<sub>p</sub></dt><dd>' + p.T.toFixed(2) + ' s</dd>'
      + '<dt>Wave Breaker</dt><dd>' + (p.cls === 'over' ? 'η ≥ ' + etaPct(p.eta) + '% · K<sub>t</sub> ≤ ' + (A / p.Hs).toFixed(2) : 'ไม่ต้องใช้') + '</dd></dl>'
      : '<p class="note">' + STATUS_TXT[p.cls] + '</p>')
    + (pin ? '<button class="btn secondary sm" id="popUse">เปิดเป็นจุดพิจารณา</button>' : '');
  el.hidden = false;
  if (pin) {
    $('popX').onclick = () => hidePop(true);
    $('popUse').onclick = () => { const q = POP.pc; hidePop(true); st.presetIdx = -1; setPointUTM(q.x, q.y); toast('ผลคำนวณที่จุดนับทุกทิศตามโหมดทิศ (ไม่ได้ตัดด้านในกรอบ)', 5000); };
  }
  placePop(); scheduleDraw();
}
function hidePop(force) { if (POP.pinned && !force) return; POP.pc = null; POP.pinned = false; $('pop').hidden = true; scheduleDraw(); }
function placePop() {
  const el = $('pop'); if (el.hidden || !POP.pc) return;
  const [sx, sy] = toScreen(POP.pc.x, POP.pc.y), w = el.offsetWidth, h = el.offsetHeight;
  let x = sx + 16, y = sy - h / 2;
  if (x + w > W - 12) x = sx - w - 16;
  x = Math.max(12, Math.min(W - w - 12, x)); y = Math.max(52, Math.min(H - h - 40, y));
  el.style.left = x + 'px'; el.style.top = y + 'px';
}
function saveChkPrefs() { lsSet('fwe-check3', { pv: $('allowPV').value, bnd: $('allowBnd').value, step: $('chkStep').value, exposed: $('chkExposed').checked, shelter: $('chkShelter').checked }); }
function loadChkPrefs() {
  const p = lsGet('fwe-check3'); if (!p) return;
  if (p.pv) $('allowPV').value = p.pv; if (p.bnd) $('allowBnd').value = p.bnd;
  if (p.step) $('chkStep').value = p.step;
  $('chkExposed').checked = p.exposed !== false; $('chkShelter').checked = p.shelter !== false;
}
$('chkRun').onclick = runCheck;
$('chkClear').onclick = clearCheck;
['allowPV', 'allowBnd'].forEach(id => $(id).addEventListener('input', () => { saveChkPrefs(); drawRose(); if (CHK.res) refreshCheck(); }));
['chkStep', 'chkExposed'].forEach(id => $(id).addEventListener('change', () => { saveChkPrefs(); markStale(); }));
$('chkShelter').addEventListener('change', () => { saveChkPrefs(); castPoint(); markStale(); });

// ---------- live basemap: Web Mercator XYZ tiles drawn onto the UTM canvas (only where outside images can load) ----------
// Speed-ups: one tile per screen pixel (not per device pixel), centre-first requests with a cap on downloads in flight,
// no new requests mid-gesture, stale downloads cancelled, parent tiles stretched as placeholders, LRU cache.
const esriHost = (x, y) => ((x + y) & 1 ? 'services' : 'server') + '.arcgisonline.com';
const BASES = {
  esri: { name: 'ดาวเทียม Esri', max: 19, url: (z, x, y) => 'https://' + esriHost(x, y) + '/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x, attrib: 'Imagery © Esri, Maxar, Earthstar Geographics & GIS User Community' },
  topo: { name: 'ภูมิประเทศ Esri', max: 19, url: (z, x, y) => 'https://' + esriHost(x, y) + '/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/' + z + '/' + y + '/' + x, attrib: 'Basemap © Esri & contributors' },
  s2: { name: 'Sentinel-2 (2016)', max: 15, url: (z, x, y) => 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/' + z + '/' + y + '/' + x + '.jpg', attrib: 'Sentinel-2 cloudless – s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 & 2017), CC BY 4.0' },
  google: { name: 'Google ดาวเทียม', max: 21, needsKey: true, url: (z, x, y) => 'https://tile.googleapis.com/v1/2dtiles/' + z + '/' + x + '/' + y + '?session=' + encodeURIComponent(GS.session) + '&key=' + encodeURIComponent(GS.key), attrib: 'Google' },
};
const LABELS = { max: 19, url: (z, x, y) => 'https://' + esriHost(x, y) + '/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/' + z + '/' + y + '/' + x };
const BM = { on: false, src: 'esri', labels: false, opacity: 1, cache: new Map(), inflight: 0, stat: {}, warned: {} };
const GS = { key: '', session: null, expiry: 0, pending: null, copyright: '' };
const MAX_INFLIGHT = 16, MAX_TILES = 64, CACHE_MAX = 700;
const tlon = (x, z) => x / Math.pow(2, z) * 360 - 180;
const tlat = (y, z) => { const n = Math.PI * (1 - 2 * y / Math.pow(2, z)); return Math.atan(Math.sinh(n)) * 180 / Math.PI; };
const lon2t = (lon, z) => (lon + 180) / 360 * Math.pow(2, z);
const lat2t = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); };
let drawQueued = false;
function scheduleDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
const AFF = new Map();
function tileAff(z, x, y) {
  const k = ZONE + '/' + z + '/' + x + '/' + y;
  let a = AFF.get(k);
  if (!a) {
    const UL = llToUTM(tlon(x, z), tlat(y, z), ZONE), UR = llToUTM(tlon(x + 1, z), tlat(y, z), ZONE), LL = llToUTM(tlon(x, z), tlat(y + 1, z), ZONE);
    a = { a: (UR[0] - UL[0]) / 256, d: (UR[1] - UL[1]) / 256, b: (LL[0] - UL[0]) / 256, e: (LL[1] - UL[1]) / 256, c: UL[0], f: UL[1] };
    if (AFF.size > 4000) AFF.clear();
    AFF.set(k, a);
  }
  return a;
}
function cacheGet(k) { const t = BM.cache.get(k); if (t) { BM.cache.delete(k); BM.cache.set(k, t); } return t; }
function loadTile(layer, key, z, x, y) {
  const k = key + '/' + z + '/' + x + '/' + y, url = layer.url(z, x, y);
  const t = { img: null, ok: false, err: false, done: false, key };
  const s = BM.stat[key] || (BM.stat[key] = { ok: 0, err: 0 });
  const fin = () => { if (!t.done) { t.done = true; BM.inflight--; } };
  // first try with CORS so the canvas stays exportable for Capture; if the server refuses CORS, load it plainly (Capture then omits the imagery)
  const start = cors => {
    const im = new Image(); im.decoding = 'async'; if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => { if (t.cancelled) return; t.img = im; fin(); t.ok = true; s.ok++; if (!cors) { BM.tainted = true; BM.noCors = true; } scheduleDraw(); };
    im.onerror = () => { if (t.cancelled) return; if (cors && !BM.noCors) { start(false); return; } fin(); t.err = true; s.err++; warnBase(key); };
    t.img = im; im.src = url;
  };
  BM.inflight++;
  start(!BM.noCors);
  BM.cache.set(k, t);
  if (BM.cache.size > CACHE_MAX) for (const kk of BM.cache.keys()) { const o = BM.cache.get(kk); if (o.done) BM.cache.delete(kk); if (BM.cache.size <= CACHE_MAX - 100) break; }
}
function warnBase(key) {
  const s = BM.stat[key];
  if (BM.warned[key] || s.ok > 0 || s.err < 6) return;
  BM.warned[key] = true;
  const nm = key === 'labels' ? 'ชื่อสถานที่' : BASES[key].name;
  toast('โหลดภาพจาก ' + nm + ' ไม่ได้ ตรวจการเชื่อมต่ออินเทอร์เน็ตหรือไฟร์วอลล์ขององค์กร' + (key === 'google' ? ' และสิทธิ์ของ API key' : ''), 8000);
  $('baseStatus').textContent = 'โหลด ' + nm + ' ไม่ได้';
}
function viewLL() {
  const pts = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, 0], [W / 2, H], [0, H / 2], [W, H / 2]].map(([x, y]) => st.proj.inv(...toWorld(x, y)));
  return { w: Math.min(...pts.map(p => p[0])), e: Math.max(...pts.map(p => p[0])), s: Math.min(...pts.map(p => p[1])), n: Math.max(...pts.map(p => p[1])) };
}
function drawTiles(layer, key, alpha) {
  const b = viewLL();
  if (![b.w, b.e, b.s, b.n].every(isFinite)) return 0;
  const la = st.proj.inv(st.view.cx, st.view.cy)[1];
  let z = Math.round(Math.log2(156543.034 * Math.cos(la * Math.PI / 180) * st.view.s) + (DPR > 1.25 ? 0.3 : 0));
  z = Math.max(3, Math.min(layer.max, z));
  const range = zz => { const m = Math.pow(2, zz) - 1, c = v => Math.max(0, Math.min(m, Math.floor(v))); return { x0: c(lon2t(b.w, zz)), x1: c(lon2t(b.e, zz)), y0: c(lat2t(b.n, zz)), y1: c(lat2t(b.s, zz)) }; };
  let r = range(z);
  while (z > 3 && (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAX_TILES) { z--; r = range(z); }
  const settled = performance.now() - lastInteract > 200;
  const want = [], wantKeys = new Set();
  const ccx = lon2t((b.w + b.e) / 2, z), ccy = lat2t((b.s + b.n) / 2, z);
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) { want.push([x, y, (x + 0.5 - ccx) ** 2 + (y + 0.5 - ccy) ** 2]); wantKeys.add(key + '/' + z + '/' + x + '/' + y); }
  want.sort((p, q) => p[2] - q[2]);
  // cancel downloads that left the view (only once the gesture has settled)
  if (settled) for (const [k, t] of BM.cache) if (t.key === key && !t.done && !wantKeys.has(k)) { t.cancelled = true; t.img.src = ''; if (!t.done) { t.done = true; BM.inflight--; } BM.cache.delete(k); }
  const limit = settled ? MAX_INFLIGHT : 6;
  ctx.save(); ctx.globalAlpha = alpha;
  const s = st.view.s;
  const put = (img, A, sx, sy, sw) => {
    ctx.setTransform(DPR * s * A.a, -DPR * s * A.d, DPR * s * A.b, -DPR * s * A.e, DPR * (W / 2 + (A.c - st.view.cx) * s), DPR * (H / 2 - (A.f - st.view.cy) * s));
    ctx.drawImage(img, sx, sy, sw, sw, -0.3, -0.3, 256.6, 256.6);
  };
  for (const [x, y] of want) {
    const k = key + '/' + z + '/' + x + '/' + y;
    let t = cacheGet(k);
    if (!t && BM.inflight < limit) { loadTile(layer, key, z, x, y); t = BM.cache.get(k); }
    const A = tileAff(z, x, y);
    if (t && t.ok) { put(t.img, A, 0, 0, 256); continue; }
    // placeholder: stretch the nearest loaded ancestor
    for (let dz = 1; dz <= 6 && z - dz >= 0; dz++) {
      const px = x >> dz, py = y >> dz, pt = BM.cache.get(key + '/' + (z - dz) + '/' + px + '/' + py);
      if (pt && pt.ok) { const sw = 256 >> dz; put(pt.img, A, (x - (px << dz)) * sw, (y - (py << dz)) * sw, sw); break; }
    }
  }
  ctx.restore(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!settled) { clearTimeout(settleTimer); settleTimer = setTimeout(scheduleDraw, 220); }
  return z;
}
function drawBasemap() {
  const L = BASES[BM.src];
  if (L.needsKey && !googleReady()) return false;
  const z = drawTiles(L, BM.src, BM.opacity);
  if (BM.src === 'google') googleCopyright(z);
  return true;
}
function googleReady() {
  if (GS.session && Date.now() / 1000 < GS.expiry - 60) return true;
  if (GS.key && !GS.pending) GS.pending = googleSession().finally(() => { GS.pending = null; });
  return false;
}
async function googleSession() {
  try {
    const r = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(GS.key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapType: 'satellite', language: 'th-TH', region: 'TH' }),
    });
    const j = await r.json();
    if (!r.ok || !j.session) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    GS.session = j.session; GS.expiry = +j.expiry || (Date.now() / 1000 + 3600 * 12);
    $('baseStatus').textContent = 'Google: เชื่อมต่อแล้ว';
    for (const k of [...BM.cache.keys()]) if (k.startsWith('google/')) BM.cache.delete(k);
    scheduleDraw();
  } catch (e) {
    $('baseStatus').textContent = 'Google: ' + e.message;
    toast('สร้าง session ของ Google Map Tiles API ไม่ได้: ' + e.message, 9000);
    GS.key = '';
  }
}
let gcTimer = 0, gcLast = '';
function googleCopyright(z) {
  const b = viewLL(), q = [z, b.n.toFixed(3), b.s.toFixed(3), b.e.toFixed(3), b.w.toFixed(3)].join(',');
  if (q === gcLast) return; gcLast = q;
  clearTimeout(gcTimer);
  gcTimer = setTimeout(async () => {
    try {
      const u = 'https://tile.googleapis.com/tile/v1/viewport?session=' + encodeURIComponent(GS.session) + '&key=' + encodeURIComponent(GS.key) + '&zoom=' + z + '&north=' + b.n + '&south=' + b.s + '&east=' + b.e + '&west=' + b.w;
      const j = await (await fetch(u)).json();
      GS.copyright = j.copyright || ''; updateAttrib();
    } catch (e) { }
  }, 700);
}
function updateAttrib() {
  let ba = '';
  if (STANDALONE && BM.on) ba = BM.src === 'google' ? 'Google' + (GS.copyright ? ' · ' + GS.copyright : '') : BASES[BM.src].attrib + (BM.labels ? ' · Labels © Esri' : '');
  $('attrib').textContent = (ba ? ba + ' · ' : '') + 'Shoreline: Hydro_aw.kmz';
  $('attrib').title = $('attrib').textContent;
}
function syncBaseUI() {
  $('baseToggle').setAttribute('aria-pressed', String(BM.on));
  $('lblToggle').setAttribute('aria-pressed', String(BM.labels));
  $('baseSrc').value = BM.src; $('baseSrc2').value = BM.src;
  $('baseOpacity').value = BM.opacity;
  $('gkeyRow').hidden = BM.src !== 'google';
  if (BM.src !== 'google') $('baseStatus').textContent = BM.on ? BASES[BM.src].name + ' · สูงสุด z' + BASES[BM.src].max : 'ภาพพื้นหลังปิดอยู่';
  lsSet('fwe-base', { on: BM.on, src: BM.src, labels: BM.labels, opacity: BM.opacity });
  updateAttrib(); updateLayVal(); scheduleDraw();
}
function setBaseSrc(v) {
  BM.src = v; BM.on = true;
  if (v === 'google' && !GS.key) { toast('ใส่ Google Maps API key ในหัวข้อเลเยอร์ก่อน (ต้องเปิด Map Tiles API)', 7000); }
  syncBaseUI();
}
function initBasemap() {
  STANDALONE = true;
  $('baseCtl').hidden = false; $('baseCard').hidden = false; $('sandboxNote').hidden = true;
  const saved = lsGet('fwe-base');
  if (saved && BASES[saved.src]) Object.assign(BM, { on: !!saved.on, src: saved.src, labels: !!saved.labels, opacity: +saved.opacity || 1 });
  else BM.on = true;
  GS.key = lsGet('fwe-gkey') || '';
  $('gkey').value = GS.key;
  $('baseToggle').onclick = () => { BM.on = !BM.on; syncBaseUI(); };
  $('lblToggle').onclick = () => { BM.labels = !BM.labels; syncBaseUI(); };
  $('baseSrc').onchange = e => setBaseSrc(e.target.value);
  $('baseSrc2').onchange = e => setBaseSrc(e.target.value);
  $('baseOpacity').addEventListener('input', e => { BM.opacity = +e.target.value; syncBaseUI(); });
  $('gkeySave').onclick = () => {
    GS.key = $('gkey').value.trim(); GS.session = null; GS.expiry = 0;
    lsSet('fwe-gkey', $('gkeyRemember').checked ? GS.key : '');
    $('baseStatus').textContent = GS.key ? 'Google: กำลังเชื่อมต่อ…' : 'ยังไม่มี key';
    BM.src = 'google'; BM.on = true; syncBaseUI();
  };
  syncBaseUI();
}
// probe one Esri tile: if outside images can load here, switch the live basemap on
function probeBasemap() {
  const img = new Image(); let done = false;
  img.onload = () => { if (done) return; done = true; initBasemap(); };
  img.onerror = () => { done = true; };
  setTimeout(() => { done = true; }, 10000);
  img.src = BASES.esri.url(3, 6, 3);
}

// ---------- panel: normal / maximised (two columns, every section open) / minimised (floating result card) ----------
const ICON_MAX = '<svg viewBox="0 0 16 16" fill="none"><path d="M10 2.5h3.5V6M6 13.5H2.5V10M13.5 2.5 9 7M2.5 13.5 7 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_RESTORE = '<svg viewBox="0 0 16 16" fill="none"><path d="M13.5 6H10V2.5M2.5 10H6v3.5M10 6l3.5-3.5M6 10l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let accSaved = null, accBusy = false;
const accs = () => [...document.querySelectorAll('details.acc')];
function setPanel(state) {
  const app = $('app'), prev = app.dataset.panel;
  if (state === 'max' && mobileMQ.matches) state = 'normal';
  accBusy = true;
  if (state === 'max' && prev !== 'max') { accSaved = accs().map(d => d.open); accs().forEach(d => d.open = true); }
  if (prev === 'max' && state !== 'max' && accSaved) accs().forEach((d, i) => d.open = accSaved[i]);
  setTimeout(() => { accBusy = false; }, 0);
  app.dataset.panel = state;
  if (state === 'max') app.style.removeProperty('--pw'); else applyPW();
  $('mini').hidden = state !== 'min';
  const pm = $('pMax');
  pm.innerHTML = state === 'max' ? ICON_RESTORE : ICON_MAX;
  pm.setAttribute('aria-label', state === 'max' ? 'คืนขนาดแผง' : 'ขยายแผง'); pm.title = state === 'max' ? 'คืนขนาดแผง' : 'ขยายแผง (แสดงทุกหัวข้อ)';
  lsSet('fwe-panel', state);
  requestAnimationFrame(() => { resize(); placePop(); });
}
$('pMax').onclick = () => setPanel($('app').dataset.panel === 'max' ? 'normal' : 'max');
$('pMin').onclick = () => setPanel('min');
$('pRestore').onclick = () => setPanel('normal');
function initAccordions() {
  const saved = lsGet('fwe-acc') || { dir: true };
  accs().forEach(d => {
    d.open = !!saved[d.dataset.acc];
    d.addEventListener('toggle', () => {
      if (accBusy || $('app').dataset.panel === 'max') return;
      const o = {}; accs().forEach(x => o[x.dataset.acc] = x.open); lsSet('fwe-acc', o);
    });
  });
}

// ---------- reservoir switching ----------
function renderTabs() {
  const nav = $('resTabs'); nav.innerHTML = '';
  for (const k of RES_ORDER) {
    const r = RES[k], b = document.createElement('button');
    b.className = 'tab'; b.setAttribute('role', 'tab'); b.id = 'tab_' + k;
    b.setAttribute('aria-selected', String(k === st.res));
    b.innerHTML = r.short + ' <span class="code">' + r.code + '</span>';
    b.onclick = () => { if (k !== st.res) setReservoir(k); };
    nav.appendChild(b);
  }
}
function renderPresets() {
  const g = $('presetGrp'), pr = RES[st.res].presets; g.innerHTML = '';
  $('presetBox').hidden = !pr.length;
  pr.forEach((p, i) => {
    const b = document.createElement('button'); b.className = 'pill-f'; b.dataset.preset = i; b.textContent = p.name;
    b.setAttribute('aria-pressed', String(i === st.presetIdx));
    b.title = 'จุด ' + p.name + ' ในไฟล์ Excel (' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + ')';
    b.onclick = () => { st.presetIdx = i; hidePop(true); setPoint(p.lat, p.lon); zoomTo(...st.pt.xy, 16000); afterView(); };
    g.appendChild(b);
  });
}
function defaultPoint() {
  const r = RES[st.res];
  if (r.presets.length) { st.presetIdx = 0; const p = r.presets[0]; return [p.lat, p.lon]; }
  st.presetIdx = -1;
  const tries = [], b = prjBBox();
  if (b) { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; for (let k = 0; k < 60; k++) { const a = k * 2.4, d = k * 60; tries.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]); } }
  const bb = st.IX, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  for (let k = 0; k < 400; k++) { const a = k * 2.4, d = k * 120; tries.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]); }
  for (const [x, y] of tries) if (wet(x, y) && !st.pvRings.some(rg => pip(x, y, [rg]))) { const [lo, la] = st.proj.inv(x, y); return [la, lo]; }
  const [lo, la] = st.proj.inv(cx, cy); return [la, lo];
}
function setReservoir(key, first = false) {
  const r = RES[key];
  if (r.zone !== ZONE) BM.cache.clear();
  st.res = key; ZONE = r.zone;
  clearCheck(); measClear();
  setMode('all');
  setShoreline(decodeRings(SHORES[key]));
  buildProjectLayers();
  renderTabs(); renderPrjCard();
  $('zoneTag').textContent = 'UTM ZONE ' + ZONE + 'N · WGS84 (m)';
  $('resName').innerHTML = r.th + '<span class="tag">' + r.code + '</span>';
  $('miniName').textContent = r.short + ' · ' + r.code;
  $('gust').value = r.gust;
  $('gustNote').textContent = r.gustSrc ? 'ค่าตั้งต้น ' + r.gust + ' km/h และ GF 1.53 (U1h ≈ ' + (r.gust / 3.6 / 1.53).toFixed(1) + ' m/s) ตามไฟล์ ' + r.gustSrc : 'ค่าตั้งต้น ' + r.gust + ' km/h ปรับได้ตามข้อมูลลมของพื้นที่';
  const [la, lo] = defaultPoint();
  renderPresets();
  fitView();
  if (r.prj) { const b = prjBBox(); if (b) fitBox(b[0] - 2500, b[1] - 2500, b[2] + 2500, b[3] + 2500, 40); }
  setPoint(la, lo);
  updateAttrib(); renderVerify();
  if (!first) lsSet('fwe-res', key);
}

// ---------- data check per reservoir (Hydro_aw polygon vs published surface area; dam position vs shoreline) ----------
const VERIFY = {
  BB: { area: 304.8, ref: 300, src: 'Wikipedia', dam: 16, note: 'รวมแม่น้ำปิง แม่น้ำตื่น ทะเลสาบดอยเต่า และอ่างแก่งก้อเป็นผืนน้ำเดียว', excel: 'รัศมีตรงกับ Excel BB ค่ากลาง 7–14 m · F1 แบบผิวน้ำเปิดได้ Hs 1.34 m เทียบ Excel 1.33 m' },
  SNR: { area: 356.4, ref: 419, src: 'EGAT', dam: 63, note: 'พื้นที่เล็กกว่าค่าของ EGAT 15% เส้นขอบน่าจะเป็นระดับน้ำที่ต่ำกว่าระดับเก็บกักสูงสุด ควรหาเส้นขอบที่ระดับน้ำออกแบบมายืนยัน', excel: 'รัศมีต่างจาก Excel SNR ค่ากลาง 19–112 m · F1 ได้ Hs 1.99 m เทียบ Excel 1.90 m' },
  VRK: { area: 367.1, ref: 388, src: 'Wikipedia', dam: 12, note: 'ใช้ polygon อ่างเก็บน้ำเขื่อนเขาแหลม (ชื่อเดิมของเขื่อนวชิราลงกรณ)', excel: 'ไม่มีไฟล์ Excel อ้างอิง' },
  UBR: { area: 382.3, ref: 388, src: 'EGAT', dam: 22, note: 'อยู่ใน UTM zone 48N', excel: 'ไม่มีไฟล์ Excel อ้างอิง · ยังไม่มีผังโครงการ' },
  SRD: { area: 266.2, ref: 288, src: 'Wikipedia', dam: 0, note: 'รวม polygon ลำโดมน้อย 2 ชุดในไฟล์ · อยู่ใน UTM zone 48N', excel: 'ไม่มีไฟล์ Excel อ้างอิง · ยังไม่มีผังโครงการ' },
};
const gustSource = k => RES[k].gustSrc ? 'จาก ' + RES[k].gustSrc : k === 'SRD' ? 'ตามที่กำหนดให้ใช้' : 'ไม่มีแหล่งอ้างอิงในไฟล์ ควรยืนยันกับข้อมูลลมของพื้นที่';
function verifyRow(k, cur) {
  const v = VERIFY[k], r = RES[k], d = (v.area / v.ref - 1) * 100;
  return '<tr' + (cur ? ' class="cur"' : '') + '><td>' + r.short + ' <span class="tag">' + r.code + '</span></td><td>' + r.zone + 'N</td><td>' + v.area.toFixed(1) + '</td><td>' + v.ref + ' <span class="tag">' + v.src + '</span></td><td class="' + (Math.abs(d) <= 10 ? 'ok' : 'warn') + '">' + (d >= 0 ? '+' : '') + d.toFixed(1) + '%</td><td>' + v.dam + ' m</td><td>' + r.gust + ' km/h</td></tr>';
}
function verifyText(k) { const v = VERIFY[k]; return [v.note, v.excel, 'ลมตั้งต้น ' + RES[k].gust + ' km/h ' + gustSource(k)].filter(Boolean).join(' · '); }
function renderVerify() {
  $('verBody').innerHTML = RES_ORDER.map(k => verifyRow(k, k === st.res)).join('');
  $('verNote').className = 'note';
  $('verNote').innerHTML = '<b>' + RES[st.res].short + ':</b> ' + verifyText(st.res) + ' · พื้นที่ต่างไม่เกิน ±10% ถือว่าเส้นขอบใช้ได้ ระยะเขื่อนถึงขอบน้ำวัดจากพิกัดเขื่อนใน Wikipedia';
}

// ---------- wave-check card: normal / minimised / maximised ----------
const CARD = { state: 'normal' };
const ICON_MINUS = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
function setCard(state) {
  CARD.state = state;
  $('chkCard').dataset.state = state;
  $('app').classList.toggle('chk-max', state === 'max');
  $('cMax').innerHTML = state === 'max' ? ICON_RESTORE : ICON_MAX;
  $('cMax').title = state === 'max' ? 'คืนขนาดกล่อง' : 'ขยายกล่อง (ซ่อนหัวข้ออื่น)'; $('cMax').setAttribute('aria-label', $('cMax').title);
  $('cMin').innerHTML = state === 'min' ? ICON_PLUS : ICON_MINUS;
  $('cMin').title = state === 'min' ? 'แสดงกล่องเต็ม' : 'ย่อกล่อง'; $('cMin').setAttribute('aria-label', $('cMin').title);
  lsSet('fwe-card', state);
  if (CHK.res) refreshCheck();
  if (state === 'max') $('panel').scrollTop = 0;
}
$('cMin').onclick = () => setCard(CARD.state === 'min' ? 'normal' : 'min');
$('cMax').onclick = () => setCard(CARD.state === 'max' ? 'normal' : 'max');
function miniSum(R) {
  return ['pv', 'bnd'].map(role => {
    const ps = R.pieces.filter(p => p.tg.role === role); if (!ps.length) return '';
    const n = R.runs.filter(r => r.tg.role === role).length;
    return (role === 'pv' ? 'PV ' : 'BND ') + (n ? 'เกิน ' + n + ' ช่วง' : 'ผ่าน');
  }).filter(Boolean).join(' · ') + (R.wbMax > 0 ? ' · WB η ≥ ' + etaPct(R.wbMax) + '%' : '') + (CHK.stale ? ' · ผลรอบก่อน' : '');
}

// ---------- drag the panel edge to resize ----------
const splitEl = document.querySelector('main.split');
function clampPW(w) { const tot = splitEl.getBoundingClientRect().width || innerWidth; return Math.round(Math.max(340, Math.min(tot - 320, w))); }
function applyPW() { const w = lsGet('fwe-pw'); if (w && !mobileMQ.matches) $('app').style.setProperty('--pw', clampPW(w) + 'px'); else $('app').style.removeProperty('--pw'); }
(() => {
  const rz = $('resizer'); let drag = false, w0 = 0;
  rz.addEventListener('pointerdown', e => {
    if ($('app').dataset.panel === 'max') { lsSet('fwe-pw', $('panel').getBoundingClientRect().width); setPanel('normal'); }
    drag = true; w0 = 0; rz.setPointerCapture(e.pointerId); rz.classList.add('on'); document.body.classList.add('resizing'); e.preventDefault();
  });
  rz.addEventListener('pointermove', e => { if (!drag) return; w0 = clampPW(splitEl.getBoundingClientRect().right - e.clientX); $('app').style.setProperty('--pw', w0 + 'px'); });
  const end = () => { if (!drag) return; drag = false; rz.classList.remove('on'); document.body.classList.remove('resizing'); if (w0) lsSet('fwe-pw', w0); };
  rz.addEventListener('pointerup', end); rz.addEventListener('pointercancel', end);
  rz.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const w = clampPW($('panel').getBoundingClientRect().width + (e.key === 'ArrowLeft' ? 24 : -24));
    $('app').style.setProperty('--pw', w + 'px'); lsSet('fwe-pw', w); e.preventDefault();
  });
  rz.addEventListener('dblclick', () => { lsSet('fwe-pw', null); applyPW(); });
  addEventListener('resize', () => { if ($('app').dataset.panel !== 'max') applyPW(); });
})();

// ---------- Capture: map + title strip + legend → PNG on the clipboard ----------
const LOCAL = () => location.protocol === 'file:' || STANDALONE;
const nowTH = (o = { dateStyle: 'medium', timeStyle: 'short' }) => { try { return new Date().toLocaleString('th-TH', o); } catch (e) { return new Date().toISOString().slice(0, 16).replace('T', ' '); } };
function pointSummary() {
  const U1 = u1h(), p = +$('hp').value, F = st.eff[st.dirIdx], dir = st.rad[st.dirIdx].deg;
  const ok = st.pt.wet && st.rad.every(r => isFinite(r.L)), w = ok ? usbrDS13(F, U1) : null;
  return { U1, p, kf: HFAC[p], F, dir, ok, w };
}
function composeMap(withBase) {
  const keep = BM.on; if (!withBase) BM.on = false;
  draw();
  const s = DPR, hdr = 64, ftr = 30;
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height + Math.round((hdr + ftr) * s);
  const g = c.getContext('2d');
  g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(cv, 0, Math.round(hdr * s));
  if (!withBase) { BM.on = keep; draw(); }
  g.scale(s, s);
  const r = RES[st.res], S = pointSummary(), mono = '"JetBrains Mono", "Noto Sans Thai", monospace';
  g.fillStyle = '#FAFAFA'; g.font = '600 16px "Inter Tight", "Noto Sans Thai", sans-serif'; g.fillText(r.th, 16, 27);
  const tw = g.measureText(r.th).width; g.fillStyle = '#22C55E'; g.font = '400 12px ' + mono; g.fillText(r.code, 16 + tw + 10, 27);
  g.fillStyle = '#A1A1A1'; g.font = '400 11.5px ' + mono;
  const ptTxt = (S.ok ? 'จุด E ' + fmtInt(st.pt.xy[0]) + ' N ' + fmtInt(st.pt.xy[1]) + ' · Hs ' + S.w.Hs.toFixed(2) + ' m · ' + HSHORT[S.p] + ' ' + (S.w.Hs * S.kf).toFixed(2) + ' m · F ' + (S.F / 1000).toFixed(2) + ' km · ลมจาก ' + S.dir + '° · U1h ' + S.U1.toFixed(1) + ' m/s' + (shelterOn() ? ' · แพบังคลื่น' : '') : 'จุดพิจารณาไม่อยู่บนผิวน้ำ');
  let rightW = 0;
  if (CHK.res && CHK.res.res === st.res) {
    const LG = capLegend(), items = LG.items, x0 = W - 16;
    let x = x0; g.font = '400 11px ' + mono; g.textAlign = 'right';
    const rt = 'PV ≤ ' + fmt(allowFor('pv'), 2) + ' m · BND ≤ ' + fmt(allowFor('bnd'), 2) + ' m';
    g.fillStyle = '#A1A1A1'; g.fillText(rt, x0, 49); rightW = g.measureText(rt).width + 24;
    for (const [col, t] of items.slice().reverse()) { g.fillStyle = '#FAFAFA'; g.fillText(t, x, 27); x -= g.measureText(t).width + 6; g.fillStyle = col; g.fillRect(x - 16, 22, 16, 4); x -= 30; }
    if (LG.title) { g.fillStyle = '#A1A1A1'; g.fillText(LG.title + (WB.def === 'e' ? ' (1 − Kt²)' : ' (1 − Kt)'), x + 8, 27); }
    g.textAlign = 'left';
  }
  g.fillStyle = '#A1A1A1'; g.font = '400 11.5px ' + mono;
  let pt = ptTxt; const room = W - 32 - rightW;
  if (g.measureText(pt).width > room) { while (pt.length > 8 && g.measureText(pt + '…').width > room) pt = pt.slice(0, -1); pt += '…'; }
  g.fillText(pt, 16, 49);
  g.fillStyle = '#A1A1A1'; g.font = '400 10.5px ' + mono;
  g.fillText('FPV Wave Estimator · USBR DS-13 / CEM · UTM ' + ZONE + 'N · ' + nowTH() + ' · ' + $('attrib').textContent.slice(0, 140), 16, hdr + H + 19);
  return c;
}
const canvasBlob = c => new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/png'); } catch (e) { rej(e); } });
async function mapBlob() {
  try { return { blob: await canvasBlob(composeMap(true)), base: true }; }
  catch (e) { return { blob: await canvasBlob(composeMap(false)), base: false }; }   // tiles without CORS taint the canvas
}
const blobURL = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
function showCapModal(r) {
  const url = URL.createObjectURL(r.blob);
  $('capImg').src = url;
  $('capNote').textContent = 'หน้านี้คัดลอกภาพเข้า Clipboard เองไม่ได้ คลิกขวาที่ภาพแล้วเลือก "คัดลอกรูปภาพ" (มือถือ: กดค้างที่ภาพ)' + (r.base ? '' : ' · ภาพนี้ไม่รวมภาพดาวเทียม');
  $('capSave').hidden = !LOCAL(); $('capSave').href = url; $('capSave').download = 'map_' + RES[st.res].code + '.png';
  $('capModal').hidden = false;
}
$('capClose').onclick = () => { $('capModal').hidden = true; };
$('capBtn').onclick = () => {
  let info = null;
  const pending = mapBlob().then(r => { info = r; return r.blob; });
  const fail = async () => showCapModal(info || await mapBlob());
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no clipboard');
    navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })])
      .then(() => toast('คัดลอกภาพแผนที่ไปที่ Clipboard แล้ว' + (info && !info.base ? ' (ไม่รวมภาพดาวเทียม เพราะผู้ให้บริการไม่อนุญาตให้ส่งออกภาพ)' : '')))
      .catch(fail);
  } catch (e) { fail(); }
};

// ---------- report: an editable A4 document built from the current state ----------
function roleStats(R, role) {
  const ps = R.pieces.filter(p => p.tg.role === role);
  if (!ps.length) return null;
  const len = k => ps.filter(p => p.cls === k).reduce((s, p) => s + p.len, 0);
  const Lok = len('ok'), Lnear = len('near'), Lover = len('over'), Lna = len('land') + len('lee') + len('open');
  const mx = ps.filter(p => p.Hs != null).reduce((a, p) => (!a || p.Hs > a.Hs ? p : a), null);
  return { A: allowFor(role), Lok, Lnear, Lover, Lna, wet: Lok + Lnear + Lover, mx, runs: R.runs.filter(r => r.tg.role === role) };
}
async function svgToPNG(svg, px = 900) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = px; c.height = px; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); g.drawImage(img, 0, 0, px, px); try { res(c.toDataURL('image/png')); } catch (e) { res(''); } };
    img.onerror = () => res('');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
const T = (rows, head) => '<table border="1" cellpadding="5" style="border-collapse:collapse;width:100%">' + (head ? '<thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead>' : '') + '<tbody>' + rows.map(r => '<tr>' + r.map((c, i) => (head ? '<td>' : i ? '<td>' : '<th>') + c + (head ? '</td>' : i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</tbody></table>';
async function buildReport() {
  const r = RES[st.res], S = pointSummary(), V = VERIFY[st.res];
  const w = S.w, q = S.ok ? spm84(S.F, S.U1) : null;
  let map = { url: '', base: true };
  try { const m = await mapBlob(); map = { url: await blobURL(m.blob), base: m.base }; } catch (e) { }
  const D = roseData(), roseURL = await svgToPNG(roseSVG(ROSE_PRINT, D));
  const modeTxt = modeText(), nWin = +$('fmethod').value;
  const inputs = T([
    ['ลมกระโชก 3 วินาที', $('gust').value + ' km/h (' + gustSource(st.res) + ')'],
    ['Gust factor U<sub>3s</sub>/U<sub>1h</sub>', $('gf').value],
    ['Over-water factor R<sub>L</sub>', $('rl').value],
    ['ลมเฉลี่ย 1 ชม. U<sub>1h</sub>', S.U1.toFixed(2) + ' m/s'],
    ['วิธีหา fetch', nWin === 9 ? 'เฉลี่ย 9 รัศมี ห่างกัน 3° (USBR DS-13 ข้อ B.1)' : 'รัศมีเดี่ยว'],
    ['ทิศลมที่พิจารณา', modeTxt],
    ['แพ PV บังคลื่น', shelterOn() ? 'คิด (รัศมีหยุดที่ขอบแพ)' : 'ไม่คิด (ผิวน้ำเปิด)'],
    ['ความสูงคลื่นออกแบบ', HSHORT[S.p] + ' = ' + S.kf.toFixed(2) + ' H<sub>s</sub>'],
  ]);
  const kpi = (k, v, u) => '<div class="kpi"><span>' + k + '</span><b>' + v + '<small> ' + u + '</small></b></div>';
  const point = S.ok
    ? '<div class="kpis">' + kpi('H<sub>s</sub>', w.Hs.toFixed(2), 'm') + kpi(HSHORT[S.p], (w.Hs * S.kf).toFixed(2), 'm') + kpi('F<sub>eff</sub>', (S.F / 1000).toFixed(2), 'km') + kpi('ลมพัดมาจาก', S.dir + '°', compass(S.dir)) + kpi('T<sub>p</sub>', w.T.toFixed(2), 's') + '</div>'
      + T([['พิกัด UTM ' + ZONE + 'N', 'E ' + st.pt.xy[0].toFixed(1) + ' · N ' + st.pt.xy[1].toFixed(1)], ['ละติจูด / ลองจิจูด', st.pt.lat.toFixed(6) + ', ' + st.pt.lon.toFixed(6)],
        ['t<sub>min</sub>', (w.tmin / 3600).toFixed(2) + ' ชม.'], ['ลมเฉลี่ยช่วง t<sub>min</sub>, U<sub>t</sub>', w.U.toFixed(2) + ' m/s'], ['ความยาวคลื่นน้ำลึก L<sub>0</sub>', w.L.toFixed(1) + ' m (ใช้ได้เมื่อน้ำลึกเกิน ' + (w.L / 2).toFixed(1) + ' m)']])
      + '<h3>เทียบวิธี</h3><table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><thead><tr><th>วิธี</th><th>F (km)</th><th>Hs (m)</th><th>H<sub>d</sub> (m)</th><th>T (s)</th><th>t<sub>min</sub> (h)</th></tr></thead><tbody>' + $('cmpBody').innerHTML + '</tbody></table>'
    : '<p>จุดพิจารณาไม่อยู่บนผิวน้ำ จึงไม่มีผลคำนวณ</p>';
  let chk;
  const R = CHK.res;
  if (R && R.res === st.res) {
    R.pieces.forEach(p => p.cls = classify(p));
    wbPrep(R);
    const rows = [];
    for (const role of ['pv', 'bnd']) {
      const s = roleStats(R, role); if (!s) continue;
      rows.push([ROLE_LBL[role], s.A.toFixed(2), s.mx ? s.mx.Hs.toFixed(2) + ' (' + (s.mx.Hs / s.A * 100).toFixed(0) + '%)' : '—', s.mx ? s.mx.dir + '°' : '—', s.mx ? (s.mx.Hs * S.kf).toFixed(2) : '—',
        fmtInt(s.Lover) + ' / ' + fmtInt(s.wet) + (s.wet ? ' (' + (100 * s.Lover / s.wet).toFixed(1) + '%)' : ''), fmtInt(s.Lnear), s.runs.length ? '<b class="bad">ไม่ผ่าน ' + s.runs.length + ' ช่วง</b>' : '<b class="good">ผ่าน</b>']);
    }
    const runs = (R.runs || []).slice(0, 200).map((x, i) => [i + 1, x.tg.role === 'pv' ? 'PV · ' + x.tg.name : 'Boundary', x.whole ? 'ทั้งรอบ' : chain(x.ch0) + ' – ' + chain(x.ch1), fmtInt(x.len), x.max.Hs.toFixed(2), (x.max.Hs / allowFor(x.tg.role) * 100).toFixed(0) + '%', x.max.dir + '°', (x.max.F / 1000).toFixed(2), etaPct(x.max.eta) + '%']);
    const wbr = ['pv', 'bnd'].map(rl => [rl, wbRole(R, rl)]).filter(x => x[1]), wbAny = wbr.some(([, w]) => w.n);
    const wbSec = '<h3>Wave Breaker ที่ต้องใช้</h3>'
      + (wbAny ? '<p>ช่วงที่ H<sub>s</sub> เกินค่าที่รับได้ต้องลดคลื่นด้วย Wave Breaker ให้ K<sub>t</sub> = H<sub>t</sub>/H<sub>i</sub> ≤ H<sub>s,รับได้</sub>/H<sub>s</sub> · นิยามประสิทธิภาพ ' + WB_DEF_TXT[WB.def] + ' ปัดขึ้นเป็นจำนวนเต็ม %</p>'
        + '<table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><thead><tr><th>แนว</th><th>η ขั้นต่ำ</th><th>K<sub>t</sub> ที่ต้องการ</th><th>ยาวที่ต้องติด WB (m)</th><th>คลื่นออกแบบ H<sub>s</sub> → ค่าที่รับได้ (m)</th><th>T<sub>p</sub> (s)</th><th>L<sub>0</sub> (m)</th><th>ลมจาก</th></tr></thead><tbody>'
        + wbr.map(([rl, w]) => '<tr><td>' + ROLE_LBL[rl] + '</td>' + (w.n ? '<td><b>≥ ' + etaPct(w.mx.eta) + '%</b></td><td>≤ ' + (w.A / w.mx.Hs).toFixed(2) + '</td><td>' + fmtInt(w.len) + '</td><td>' + w.mx.Hs.toFixed(2) + ' → ' + w.A.toFixed(2) + '</td><td>' + w.mx.T.toFixed(1) + '</td><td>' + L0of(w.mx.T).toFixed(0) + '</td><td>' + w.mx.dir + '°</td>' : '<td colspan="7" class="good">ไม่ต้องใช้</td>') + '</tr>').join('')
        + '</tbody></table>'
        + '<p>ความยาวแนวที่ต้องใช้ WB แยกตามประสิทธิภาพที่ต้องการ</p>'
        + T([4, 3, 2, 1, 0].filter(b => wbr.some(([, w]) => w.bands[b] > 0)).map(b => ['<span style="display:inline-block;width:14px;height:6px;border-radius:2px;margin-right:8px;vertical-align:middle;background:' + WB_RAMP[b] + ';border:1px solid #bbb"></span>' + wbBandLbl(b, R.wbS)].concat(wbr.map(([, w]) => w.bands[b] ? fmtInt(w.bands[b]) : '—'))), ['η ที่ต้องใช้'].concat(wbr.map(([rl]) => (rl === 'pv' ? 'PV Array' : 'Project Boundary') + ' (m)')))
        + '<p>ประสิทธิภาพของ Wave Breaker ลอยน้ำขึ้นกับคาบคลื่นและขนาดของ WB จึงควรเลือกผลิตภัณฑ์ที่ให้ K<sub>t</sub> ไม่เกินค่าข้างต้นที่คาบ T<sub>p</sub> ของคลื่นออกแบบ (ตามกราฟของผู้ผลิตหรือผลทดสอบ) และให้แนว WB ยื่นเลยปลายช่วงที่เกินออกไป เพราะคลื่นอ้อมปลาย WB ได้</p>'
        : '<p class="good">H<sub>s</sub> ทุกช่วงไม่เกินค่าที่รับได้ ไม่ต้องใช้ Wave Breaker</p>');
    chk = '<p>ตั้งค่า: แบ่งช่วงทุก ' + R.P.step + ' m · ทิศ ' + R.P.modeLbl + (R.P.exposed ? ' · นับเฉพาะลมที่พัดเข้าด้านนอกของขอบ' : '') + (R.P.shelter ? ' · แพ PV บังคลื่น' : ' · ผิวน้ำเปิด') + ' · U<sub>1h</sub> ' + R.P.U1.toFixed(2) + ' m/s · ' + R.pieces.length.toLocaleString('en-US') + ' ช่วง</p>'
      + (CHK.stale ? '<p class="warn">หมายเหตุ: ค่าลมหรือตัวเลือกถูกเปลี่ยนหลังการคำนวณ ผลในส่วนนี้เป็นของรอบก่อน</p>' : '')
      + '<table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><thead><tr><th>แนว</th><th>H<sub>s</sub> ที่รับได้ (m)</th><th>H<sub>s</sub> สูงสุด (m)</th><th>ลมจาก</th><th>' + HSHORT[S.p] + ' (m)</th><th>ยาวที่เกิน / ยาวบนน้ำ (m)</th><th>ยาวช่วง 90–100% (m)</th><th>ผล</th></tr></thead><tbody>' + rows.map(rw => '<tr>' + rw.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
      + wbSec
      + (runs.length ? '<h3>ช่วงที่เกินค่าที่รับได้ (เรียงจาก H<sub>s</sub> สูงสุด)</h3>' + T(runs, ['#', 'ตำแหน่ง', 'กม. (จากจุดแรกของรูป)', 'ยาว (m)', 'H<sub>s</sub> สูงสุด (m)', '% ของค่าที่รับได้', 'ลมจาก', 'F<sub>eff</sub> (km)', 'η WB']) + (R.runs.length > 200 ? '<p>แสดง 200 จาก ' + R.runs.length + ' ช่วง</p>' : '') : '<p>ไม่มีช่วงที่เกินค่าที่รับได้</p>');
  } else chk = '<p class="warn">ยังไม่ได้ตรวจตามแนวขอบ กด Compute ในกล่อง "ความสามารถรับคลื่นของ PV Array และ Project Boundary" แล้วสร้างรายงานใหม่เพื่อใส่ผลส่วนนี้</p>';
  const vrow = (() => { const d = (V.area / V.ref - 1) * 100; return T([['เส้นขอบอ่าง', 'Hydro_aw.kmz · ' + V.note], ['พื้นที่ผิวน้ำจากไฟล์', V.area.toFixed(1) + ' km² เทียบค่าอ้างอิง ' + V.ref + ' km² (' + V.src + ') ต่าง ' + (d >= 0 ? '+' : '') + d.toFixed(1) + '%' + (Math.abs(d) > 10 ? ' — ควรยืนยันเส้นขอบที่ระดับน้ำออกแบบ' : '')], ['ตำแหน่งเขื่อน', 'ห่างจากขอบน้ำในไฟล์ ' + V.dam + ' m'], ['เทียบไฟล์ Excel', V.excel], ['ผังโครงการ', r.prj ? 'Boundary_' + PROJECTS[r.prj].name + '.kmz และ PV_Array_' + PROJECTS[r.prj].name + '.kmz (' + st.prjLayers[1].feats.length + ' แพ)' + (PROJECTS[r.prj].bndOpen ? ' · เส้น Boundary ในไฟล์ไม่ปิดรูปฝั่งตลิ่ง ไม่ตรวจเส้นปิด' : '') : 'ยังไม่มี']]); })();
  const css = '@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#141413;font-family:Inter,"Noto Sans Thai",system-ui,sans-serif;font-size:10.5pt;line-height:1.55}main{max-width:780px;margin:0 auto;padding:28px 28px 48px;outline:none}h1{font-family:"Inter Tight","Noto Sans Thai",sans-serif;font-size:20pt;font-weight:600;letter-spacing:-.4px;line-height:1.2;margin:0 0 4px}h2{font-family:"Inter Tight","Noto Sans Thai",sans-serif;font-size:13pt;font-weight:600;margin:26px 0 8px;padding-top:10px;border-top:1px solid #ddd}h3{font-size:11pt;font-weight:600;margin:16px 0 6px}.meta{color:#6b6b6b;font:9pt "JetBrains Mono",monospace;letter-spacing:.3px}table{border-collapse:collapse;width:100%;font-size:9.5pt;border-color:#cfcfcf}th,td{border:1px solid #cfcfcf;padding:5px 7px;text-align:left;vertical-align:top}thead th{background:#f3f3f1;font-weight:600}tbody th{background:#fafaf8;font-weight:500;width:34%}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:6px 0 12px}.kpi{border:1px solid #ddd;border-radius:8px;padding:8px 10px}.kpi span{display:block;font-size:8.5pt;color:#6b6b6b}.kpi b{font-family:"Inter Tight",sans-serif;font-size:17pt;font-weight:600}.kpi small{font-size:9pt;color:#6b6b6b;font-weight:400}figure{margin:10px 0;break-inside:avoid}figure img{width:100%;border-radius:6px;border:1px solid #ddd}figcaption{font-size:9pt;color:#6b6b6b;margin-top:4px}.rose{display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:center}.rose img{border:0}.good{color:#15803d}.bad{color:#b91c1c}.warn{color:#92400e}ol{padding-left:20px}li{margin-bottom:4px}.note{border:1px dashed #bbb;border-radius:6px;padding:10px;color:#6b6b6b;min-height:48px}@media print{h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}';
  const legend = '<p>' + roseLegendHTML(D, ROSE_PRINT).replace(/<span><i style="([^"]*)"><\/i><em>/g, '<span style="display:inline-flex;align-items:center;gap:6px;margin-right:12px"><i style="display:inline-block;width:10px;height:10px;$1"></i><em style="font-style:normal">') + '</p>';
  const body = '<main id="rep" contenteditable="true" spellcheck="false">'
    + '<p class="meta">FPV WAVE ESTIMATOR · USBR DS-13 / CEM · ' + nowTH({ dateStyle: 'long', timeStyle: 'short' }) + '</p>'
    + '<h1>รายงานประมาณความสูงคลื่นจากลม<br>' + r.th + ' (' + r.code + ')</h1>'
    + '<p class="meta">UTM ZONE ' + ZONE + 'N · WGS84 · เส้นขอบอ่าง Hydro_aw.kmz</p>'
    + '<h2>1. ข้อมูลลมและเกณฑ์</h2>' + inputs
    + '<h2>2. ผลคำนวณที่จุดพิจารณา</h2>' + point
    + '<h2>3. แผนที่และ Fetch rose</h2>'
    + (map.url ? '<figure><img src="' + map.url + '" alt="แผนที่"><figcaption>รูปที่ 1 แผนที่จุดพิจารณา รัศมี fetch' + (R && R.res === st.res ? (WB.view === 'wb' && R.wbMax > 0 ? ' และประสิทธิภาพ Wave Breaker ที่ต้องใช้ตามแนวขอบ' : ' และผลตรวจตามแนวขอบ') : '') + (map.base ? '' : ' (ไม่รวมภาพดาวเทียม)') + '</figcaption></figure>' : '')
    + '<figure class="rose">' + (roseURL ? '<img src="' + roseURL + '" alt="Fetch rose">' : '') + '<figcaption>รูปที่ 2 Fetch rose ที่จุดพิจารณา ความยาวกลีบคือ F<sub>eff</sub> ของแต่ละทิศ สีบอก H<sub>s</sub> เทียบกับ H<sub>s</sub> ที่ PV Array รับได้ (' + fmt(D.A, 2) + ' m)' + legend + '</figcaption></figure>'
    + '<h2>4. ความสามารถรับคลื่นของ PV Array และ Project Boundary</h2>' + chk
    + '<h2>5. ข้อมูลที่ใช้และการตรวจสอบ</h2>' + vrow
    + '<h2>6. วิธีคำนวณ</h2><ol>' + [...document.querySelectorAll('.steps li')].map(li => '<li>' + li.innerHTML + '</li>').join('') + '</ol>'
    + '<p><b>ข้อจำกัด:</b> ใช้ได้กับน้ำลึกเท่านั้น ไม่รวมการหักเห การเลี้ยวเบน การสะท้อน และคลื่นที่ลอดใต้แพ ผลขึ้นกับระดับน้ำของเส้นขอบอ่าง</p>'
    + '<h2>7. เอกสารอ้างอิง</h2><ol><li>U.S. Bureau of Reclamation. Design Standards No. 13: Embankment Dams, Chapter 6: Freeboard, Phase 4 (Final). September 2012. Appendix B.</li><li>U.S. Army Corps of Engineers. EM 1110-2-1100 Coastal Engineering Manual, Part II, Chapter 2.</li><li>U.S. Army Coastal Engineering Research Center. Shore Protection Manual. 1984.</li></ol>'
    + '<h2>8. หมายเหตุผู้จัดทำ</h2><p class="note">พิมพ์หมายเหตุหรือข้อสรุปที่นี่</p>'
    + '</main>';
  return { css, body, title: 'รายงานคลื่น ' + r.code + ' ' + new Date().toISOString().slice(0, 10) };
}
const repDoc = rp => '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + rp.title + '</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..600&family=Inter+Tight:wght@600&family=JetBrains+Mono:wght@400&family=Noto+Sans+Thai:wght@400..600&display=swap"><style>' + rp.css + '</style></head><body>' + rp.body + '</body></html>';
let REP = null;
$('reportBtn').onclick = async () => {
  const b = $('reportBtn'); b.disabled = true; b.textContent = 'กำลังสร้าง…';
  try {
    REP = await buildReport();
    $('repFrame').srcdoc = repDoc(REP);
    const local = LOCAL();
    $('repPrint').hidden = !local; $('repSave').hidden = !local;
    $('repNote').textContent = 'คลิกที่ตัวหนังสือเพื่อแก้ไขได้' + (local ? '' : ' · หน้านี้พิมพ์และดาวน์โหลดไม่ได้ ใช้ "คัดลอกรายงาน" แล้ววางใน Word หรือเปิดไฟล์ HTML จากเครื่องเพื่อพิมพ์เป็น PDF');
    $('repModal').hidden = false;
  } catch (e) { toast('สร้างรายงานไม่ได้: ' + e.message, 6000); }
  b.disabled = false; b.textContent = 'สร้างรายงาน';
};
$('repClose').onclick = () => { $('repModal').hidden = true; };
const repLive = () => { const d = $('repFrame').contentDocument; return d && d.getElementById('rep') ? d : null; };
$('repPrint').onclick = () => { const w = $('repFrame').contentWindow; try { w.focus(); w.print(); } catch (e) { toast('พิมพ์จากหน้านี้ไม่ได้'); } };
$('repSave').onclick = () => {
  const d = repLive(); if (!d) return;
  const html = '<!doctype html>' + d.documentElement.outerHTML.replace(' contenteditable="true"', '');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = REP.title.replace(/\s+/g, '_') + '.html';
  document.body.appendChild(a); a.click(); a.remove();
};
$('repCopy').onclick = () => {
  const d = repLive(); if (!d) return;
  const main = d.getElementById('rep');
  const html = '<html><head><meta charset="utf-8"><style>' + REP.css + '</style></head><body>' + main.outerHTML.replace(' contenteditable="true"', '') + '</body></html>';
  const viaSelection = () => {
    try { const sel = d.getSelection(); sel.removeAllRanges(); const rg = d.createRange(); rg.selectNodeContents(main); sel.addRange(rg); const okc = d.execCommand('copy'); toast(okc ? 'คัดลอกรายงานแล้ว วางใน Word ได้' : 'เลือกข้อความในรายงานไว้แล้ว กด Ctrl/Cmd+C เพื่อคัดลอก', 6000); }
    catch (e) { toast('คัดลอกไม่ได้ ลากเลือกข้อความในรายงานแล้วกด Ctrl/Cmd+C', 6000); }
  };
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('x');
    navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([main.innerText], { type: 'text/plain' }) })])
      .then(() => toast('คัดลอกรายงานแล้ว วางใน Word หรืออีเมลได้ (รวมรูป)', 5000)).catch(viaSelection);
  } catch (e) { viaSelection(); }
};
addEventListener('keydown', e => { if (e.key === 'Escape') { $('repModal').hidden = true; $('capModal').hidden = true; } });

// =====================================================================
// ---------- measure tool: straight line / polyline / polygon ----------
// Vertices live in UTM metres (map space). Lengths are geodesic on WGS84 (Vincenty inverse); areas come from the UTM
// shoelace area divided by the mean squared UTM point-scale factor, which turns grid area into ground area.
// =====================================================================
const MEAS = { on: false, mode: 'line', pts: [], done: false, hover: null, cand: -1, drag: -1, lu: 'auto', au: 'rngw', stats: null };
const LEN_U = { m: [1, 'm'], km: [1000, 'km'], wa: [2, 'วา'], ft: [0.3048, 'ft'], mi: [1609.344, 'mi'], nmi: [1852, 'NM'] };
const AREA_U = { rai: [1600, 'ไร่'], m2: [1, 'm²'], ha: [1e4, 'ha'], km2: [1e6, 'km²'], ac: [4046.8564224, 'acre'] };
const MEAS_COL = '#60A5FA', MEAS_FILL = 'rgba(96,165,250,0.14)';
const nf = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const sigD = v => v >= 1000 ? 1 : v >= 100 ? 2 : 3;
function lenParts(m, u = MEAS.lu) {
  if (u === 'auto') return m >= 1000 ? [nf(m / 1000, 3), 'km'] : [nf(m, m < 100 ? 2 : 1), 'm'];
  const [f, s] = LEN_U[u], v = m / f; return [nf(v, sigD(v)), s];
}
const fmtLen = (m, u) => lenParts(m, u).join(' ');
function areaParts(a, u = MEAS.au) {
  if (u === 'rngw') {
    const wa = Math.round(a / 4 * 10) / 10, rai = Math.floor(wa / 400), ngan = Math.floor((wa - rai * 400) / 100), w = wa - rai * 400 - ngan * 100;
    return { long: rai.toLocaleString('en-US') + ' ไร่ ' + ngan + ' งาน ' + w.toFixed(1) + ' ตร.ว.', short: rai.toLocaleString('en-US') + '-' + ngan + '-' + w.toFixed(1) + ' ไร่' };
  }
  const [f, s] = AREA_U[u], v = a / f, t = nf(v, v >= 1000 ? 1 : v >= 10 ? 2 : 3) + ' ' + s;
  return { long: t, short: t };
}
function vincenty(la1, lo1, la2, lo2) {
  const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f), rad = Math.PI / 180;
  const L = (lo2 - lo1) * rad, U1 = Math.atan((1 - f) * Math.tan(la1 * rad)), U2 = Math.atan((1 - f) * Math.tan(la2 * rad));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, lamP, it = 0, sinS, cosS, sig, cos2A, cos2Sm;
  do {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sinS = Math.hypot(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl);
    if (sinS === 0) return { d: 0, az: 0 };
    cosS = sU1 * sU2 + cU1 * cU2 * cl; sig = Math.atan2(sinS, cosS);
    const sinA = cU1 * cU2 * sl / sinS; cos2A = 1 - sinA * sinA;
    cos2Sm = cos2A ? cosS - 2 * sU1 * sU2 / cos2A : 0;
    const C = f / 16 * cos2A * (4 + f * (4 - 3 * cos2A));
    lamP = lam; lam = L + (1 - C) * f * sinA * (sig + C * sinS * (cos2Sm + C * cosS * (2 * cos2Sm * cos2Sm - 1)));
  } while (Math.abs(lam - lamP) > 1e-12 && ++it < 200);
  const u2 = cos2A * (a * a - b * b) / (b * b);
  const A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sinS * (cos2Sm + B / 4 * (cosS * (2 * cos2Sm * cos2Sm - 1) - B / 6 * cos2Sm * (4 * sinS * sinS - 3) * (4 * cos2Sm * cos2Sm - 3)));
  const sl = Math.sin(lam), cl = Math.cos(lam);
  return { d: b * A * (sig - dS), az: (Math.atan2(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl) / rad + 360) % 360 };
}
// UTM point-scale factor from easting (k0 = 0.9996), accurate to ~1e-7 over a reservoir
const utmK = E => { const x = (E - 500000) / 0.9996, R = 6.37e6; return 0.9996 * (1 + x * x / (2 * R * R) + x ** 4 / (24 * R ** 4)); };
const measClosed = () => MEAS.mode === 'poly' && MEAS.pts.length >= 3;
function measStats(pts = MEAS.pts, closed = measClosed()) {
  const ll = pts.map(([x, y]) => { const [lo, la] = utmToLL(x, y, ZONE); return [la, lo]; });
  const segs = []; let tot = 0, grid = 0;
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % pts.length, v = vincenty(ll[i][0], ll[i][1], ll[j][0], ll[j][1]), g = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
    segs.push({ d: v.d, az: v.az, g }); tot += v.d; grid += g;
  }
  let area = null, areaGrid = null;
  if (closed) {
    let s = 0, k2 = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; k2 += utmK(p[0]) ** 2; }
    areaGrid = Math.abs(s) / 2; area = areaGrid / (k2 / pts.length);
  }
  return { ll, segs, tot, grid, area, areaGrid };
}
function measHint() {
  const n = MEAS.pts.length, m = MEAS.mode, touch = matchMedia('(pointer: coarse)').matches;
  if (MEAS.done) return 'ลากจุดเพื่อแก้ตำแหน่ง · ' + (touch ? 'แตะ' : 'คลิก') + 'ที่อื่นเพื่อเริ่มวัดใหม่';
  if (!n) return (touch ? 'แตะ' : 'คลิก') + 'บนแผนที่เพื่อวางจุดแรก · ลากเพื่อเลื่อนแผนที่ได้ตามปกติ';
  if (m === 'line') return (touch ? 'แตะ' : 'คลิก') + 'จุดที่สอง';
  if (m === 'path') return n < 2 ? (touch ? 'แตะ' : 'คลิก') + 'จุดถัดไป' : (touch ? 'แตะจุดสุดท้ายซ้ำ' : 'ดับเบิลคลิก, คลิกจุดสุดท้ายซ้ำ หรือกด Enter') + ' เพื่อจบเส้น';
  return n < 3 ? (touch ? 'แตะ' : 'คลิก') + 'จุดถัดไป (อย่างน้อย 3 จุด)' : (touch ? 'แตะจุดแรกเพื่อปิดรูป' : 'คลิกจุดแรก ดับเบิลคลิก หรือกด Enter เพื่อปิดรูป');
}
function measRender() {
  const S = MEAS.stats = MEAS.pts.length ? measStats() : null, poly = MEAS.mode === 'poly';
  const n = MEAS.pts.length, [lv, lu] = lenParts(S ? S.tot : 0);
  $('measK').textContent = poly ? 'เส้นรอบรูป' : MEAS.mode === 'path' ? 'ระยะรวม' : 'ระยะทาง';
  $('measV').innerHTML = n >= 2 ? lv + '<small>' + lu + '</small>' : '—';
  $('measAreaRow').hidden = !poly; $('measAU').hidden = !poly; $('measU').classList.toggle('one', !poly);
  if (poly) $('measA').textContent = S && S.area != null ? areaParts(S.area).long : '—';
  let sub = '';
  if (S && n >= 2) {
    if (MEAS.mode === 'line') sub = 'ทิศ ' + S.segs[0].az.toFixed(1) + '° (' + compass(S.segs[0].az) + ') จากเหนือจริง · กริด UTM ' + nf(S.grid, 1) + ' m';
    else sub = n + ' จุด · ' + S.segs.length + ' ช่วง · กริด UTM ' + nf(S.grid, 1) + ' m' + (poly && S.areaGrid != null ? ' · ' + nf(S.areaGrid, 0) + ' m²' : '');
  } else if (n === 1) sub = '1 จุด · E ' + fmtInt(MEAS.pts[0][0]) + ' N ' + fmtInt(MEAS.pts[0][1]);
  $('measSub').textContent = sub;
  $('measHint').textContent = measHint();
  $('measDone').hidden = MEAS.done || MEAS.mode === 'line' || n < (poly ? 3 : 2);
  $('measUndo').disabled = !n; $('measClear').disabled = !n; $('measCopy').disabled = n < 2;
  document.querySelectorAll('#measMode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === MEAS.mode));
  scheduleDraw();
}
function measSet(on) {
  MEAS.on = on; $('measBtn').setAttribute('aria-pressed', on); $('meas').hidden = !on; cv.classList.toggle('measuring', on); $('app').classList.toggle('measuring', on);
  if (on) { $('hint').hidden = true; hidePop(true); } else { MEAS.pts = []; MEAS.done = false; MEAS.hover = null; }
  measRender();
}
function measFinish() {
  const need = MEAS.mode === 'poly' ? 3 : 2;
  if (MEAS.pts.length < need) { toast(MEAS.mode === 'poly' ? 'พื้นที่ต้องมีอย่างน้อย 3 จุด' : 'ต้องมีอย่างน้อย 2 จุด'); return; }
  MEAS.done = true; MEAS.hover = null; measRender();
}
function measUndo() { if (!MEAS.pts.length) return; MEAS.pts.pop(); MEAS.done = false; measRender(); }
function measClear() { MEAS.pts = []; MEAS.done = false; MEAS.hover = null; measRender(); }
function measHit(px, py, tol) {
  let bi = -1, bd = tol;
  MEAS.pts.forEach((p, i) => { const [sx, sy] = toScreen(p[0], p[1]), d = Math.hypot(sx - px, sy - py); if (d <= bd) { bd = d; bi = i; } });
  return bi;
}
const measTol = e => (e && e.pointerType === 'touch' ? 20 : 10);
function measTap(px, py, e) {
  const w = toWorld(px, py), n = MEAS.pts.length, tol = measTol(e);
  const near = i => { const [sx, sy] = toScreen(...MEAS.pts[i]); return Math.hypot(sx - px, sy - py) <= tol; };
  if (MEAS.done) { MEAS.pts = [w]; MEAS.done = false; }
  else if (MEAS.mode === 'line') { if (n === 1 && near(0)) return; MEAS.pts.push(w); if (MEAS.pts.length === 2) MEAS.done = true; }
  else if (MEAS.mode === 'poly' && n >= 3 && near(0)) MEAS.done = true;
  else if (n >= (MEAS.mode === 'poly' ? 3 : 2) && near(n - 1)) MEAS.done = true;
  else if (n && near(n - 1)) return;
  else MEAS.pts.push(w);
  if (MEAS.done) MEAS.hover = null;
  measRender();
}
function measTSV() {
  const S = measStats(), poly = measClosed(), r = RES[st.res];
  const head = '# FPV Wave Estimator · measure · ' + r.th + ' (' + r.code + ') · UTM ' + ZONE + 'N · ' + { line: 'line', path: 'polyline', poly: 'polygon' }[MEAS.mode] + ' · geodesic WGS84 (Vincenty)';
  const lines = [head, 'Point\tE\tN\tLat\tLon\tSegment_to_next_m\tAzimuth_deg\tCumulative_m'];
  let cum = 0;
  MEAS.pts.forEach((p, i) => {
    const sg = S.segs[i];
    lines.push([i + 1, p[0].toFixed(2), p[1].toFixed(2), S.ll[i][0].toFixed(7), S.ll[i][1].toFixed(7), sg ? sg.d.toFixed(3) : '', sg ? sg.az.toFixed(2) : '', cum.toFixed(3)].join('\t'));
    if (sg) cum += sg.d;
  });
  lines.push('', (poly ? 'Perimeter' : 'Total length') + '_m\t' + S.tot.toFixed(3), 'UTM grid length_m\t' + S.grid.toFixed(3));
  if (poly) lines.push('Area_m2\t' + S.area.toFixed(2), 'Area_rai\t' + (S.area / 1600).toFixed(4), 'Area (rai-ngan-wa)\t' + areaParts(S.area, 'rngw').short, 'Area_ha\t' + (S.area / 1e4).toFixed(4), 'UTM grid area_m2\t' + S.areaGrid.toFixed(2));
  return lines.join('\n');
}
// rounded label pill on the map; returns its box so callers can skip overlapping labels
function mapPill(text, x, y, opt = {}) {
  ctx.font = (opt.big ? '600 12.5px ' : '500 11px ') + '"JetBrains Mono", "Noto Sans Thai", ui-monospace, monospace';
  const w = ctx.measureText(text).width + 14, h = opt.big ? 23 : 19, bx = Math.round(x - w / 2), by = Math.round(y - h / 2);
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, h / 2) : ctx.rect(bx, by, w, h);
  ctx.fillStyle = 'rgba(10,10,10,0.88)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = opt.stroke || 'rgba(255,255,255,0.18)'; ctx.stroke();
  ctx.fillStyle = opt.ink || '#FAFAFA'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + w / 2, by + h / 2 + 0.5);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  return [bx, by, bx + w, by + h];
}
const boxHit = (a, list) => list.some(b => a[0] < b[2] + 4 && a[2] + 4 > b[0] && a[1] < b[3] + 3 && a[3] + 3 > b[1]);
function drawMeas() {
  if (!MEAS.on || !MEAS.pts.length) return;
  const P = MEAS.pts.map(p => toScreen(p[0], p[1])), poly = MEAS.mode === 'poly', S = MEAS.stats;
  const live = !MEAS.done && MEAS.hover ? toScreen(...MEAS.hover) : null;
  const closeIt = poly && (MEAS.done || P.length >= 3);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (poly && (P.length + (live ? 1 : 0)) >= 3) {
    ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); if (live) ctx.lineTo(...live); ctx.closePath();
    ctx.fillStyle = MEAS_FILL; ctx.fill();
  }
  const trace = () => { ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); if (closeIt && !live) ctx.closePath(); };
  trace(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 5; ctx.stroke();
  trace(); ctx.strokeStyle = MEAS_COL; ctx.lineWidth = 2.2; ctx.stroke();
  if (live) {
    ctx.setLineDash([6, 5]); ctx.strokeStyle = MEAS_COL; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(...P[P.length - 1]); ctx.lineTo(...live); if (poly && P.length >= 2) ctx.lineTo(...P[0]); ctx.stroke(); ctx.setLineDash([]);
  }
  // vertices (the first one gets a ring while a polygon can be closed on it)
  P.forEach(([x, y], i) => {
    ctx.beginPath(); ctx.arc(x, y, i === MEAS.drag ? 6 : 4.5, 0, 7); ctx.fillStyle = '#0A0A0A'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = MEAS_COL; ctx.stroke();
    if (i === 0 && poly && !MEAS.done && P.length >= 3) { ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.lineWidth = 1.2; ctx.stroke(); }
  });
  // labels: the total / area first, then one per segment where there is room and no overlap
  const boxes = [];
  if (S && P.length >= 2 && MEAS.mode === 'line') {
    const a = P[0], b = P[1];
    boxes.push(mapPill(fmtLen(S.tot) + ' · ' + S.segs[0].az.toFixed(1) + '°', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 16, { big: true, stroke: MEAS_COL }));
  }
  if (S && MEAS.mode === 'path' && S.segs.length > 1) {
    const [x, y] = P[P.length - 1]; boxes.push(mapPill('รวม ' + fmtLen(S.tot), x, y - 20, { big: true, stroke: MEAS_COL }));
  }
  if (S && poly && S.area != null) {
    let cx = 0, cy = 0; P.forEach(([x, y]) => { cx += x; cy += y; });
    boxes.push(mapPill(areaParts(S.area).short, cx / P.length, cy / P.length, { big: true, stroke: MEAS_COL }));
  }
  if (S && MEAS.mode !== 'line') S.segs.forEach((sg, i) => {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = fmtLen(sg.d); ctx.font = '500 11px ' + FONT_MONO;
    const w = ctx.measureText(t).width + 14, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (L < w + 12 || boxHit([mx - w / 2, my - 10, mx + w / 2, my + 10], boxes)) return;
    boxes.push(mapPill(t, mx, my));
  });
  if (live && P.length) {
    const [lo1, la1] = utmToLL(...MEAS.pts[MEAS.pts.length - 1], ZONE), [lo2, la2] = utmToLL(...MEAS.hover, ZONE);
    const d = vincenty(la1, lo1, la2, lo2);
    let t = fmtLen(d.d) + ' · ' + d.az.toFixed(0) + '°';
    if (MEAS.mode !== 'line' && P.length > 1) t += ' · รวม ' + fmtLen((S ? S.tot - (closeIt ? S.segs[S.segs.length - 1].d : 0) : 0) + d.d);
    if (poly && P.length >= 2) { const s2 = measStats([...MEAS.pts, MEAS.hover], true); t = fmtLen(d.d) + ' · ' + areaParts(s2.area).short; }
    mapPill(t, live[0], live[1] + 22);
  }
}
$('measBtn').onclick = () => measSet(!MEAS.on);
$('measX').onclick = () => measSet(false);
$('measDone').onclick = measFinish;
$('measUndo').onclick = measUndo;
$('measClear').onclick = measClear;
$('measUnits').onclick = () => { const on = !$('meas').classList.contains('units'); $('meas').classList.toggle('units', on); $('measUnits').setAttribute('aria-pressed', on); };
$('measCopy').onclick = () => { if (MEAS.pts.length >= 2) copyText(measTSV(), null, $('measFallback'), 'คัดลอกพิกัดและระยะแล้ว วางใน Excel ได้'); };
document.querySelectorAll('#measMode button').forEach(b => b.onclick = () => {
  if (MEAS.mode === b.dataset.m) return;
  const keep = MEAS.pts.slice(0, b.dataset.m === 'line' ? 2 : undefined);
  MEAS.mode = b.dataset.m; MEAS.pts = keep;
  MEAS.done = MEAS.pts.length >= (MEAS.mode === 'poly' ? 3 : 2) && (MEAS.mode === 'line' || MEAS.done);
  saveMeasPrefs(); measRender();
});
function saveMeasPrefs() { lsSet('fwe-meas', { mode: MEAS.mode, lu: MEAS.lu, au: MEAS.au }); }
$('measLU').onchange = () => { MEAS.lu = $('measLU').value; saveMeasPrefs(); measRender(); };
$('measAU').onchange = () => { MEAS.au = $('measAU').value; saveMeasPrefs(); measRender(); };
{ const p = lsGet('fwe-meas'); if (p) { if (p.mode && ['line', 'path', 'poly'].includes(p.mode)) MEAS.mode = p.mode; if (p.lu && (p.lu === 'auto' || LEN_U[p.lu])) MEAS.lu = p.lu; if (p.au && (p.au === 'rngw' || AREA_U[p.au])) MEAS.au = p.au; } $('measLU').value = MEAS.lu; $('measAU').value = MEAS.au; }
addEventListener('keydown', e => {
  if (!MEAS.on || !$('repModal').hidden || !$('capModal').hidden) return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === 'Enter') { if (!MEAS.done && MEAS.pts.length) { measFinish(); e.preventDefault(); } }
  else if (e.key === 'Backspace' || e.key === 'Delete') { measUndo(); e.preventDefault(); }
  else if (e.key === 'Escape') { if (!MEAS.done && MEAS.pts.length) measClear(); else measSet(false); }
});

// boot
mobileMQ.addEventListener && mobileMQ.addEventListener('change', () => { if (mobileMQ.matches && $('app').dataset.panel === 'max') setPanel('normal'); });
new ResizeObserver(() => { resize(); placePop(); }).observe($('mapwrap'));
initAccordions();
loadChkPrefs();
applyPW();
{ const cs = lsGet('fwe-card'); setCard(cs === 'min' || cs === 'max' ? cs : 'normal'); }
const savedPanel = lsGet('fwe-panel');
setPanel(savedPanel === 'max' || savedPanel === 'min' ? savedPanel : 'normal');
resize();
const savedRes = lsGet('fwe-res');
setReservoir(RES[savedRes] ? savedRes : 'BB', true);
updateModeLbl();
probeBasemap();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
