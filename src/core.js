// ===== Wave core: geometry + USBR DS-13 / CEM + SPM 1984 =====
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64IDX = {}; for (let i = 0; i < 64; i++) B64IDX[B64[i]] = i;
const G = 9.80665;

function decodeRings(s) {
  return s.split('.').map(r => {
    const vals = []; let v = 0, sh = 0;
    for (let i = 0; i < r.length; i++) {
      const d = B64IDX[r[i]];
      v += (d & 31) * Math.pow(2, sh); sh += 5;
      if (d < 32) { vals.push(v % 2 ? -(v + 1) / 2 : v / 2); v = 0; sh = 0; }
    }
    const pts = []; let la = 0, lo = 0;
    for (let i = 0; i < vals.length; i += 2) { la += vals[i]; lo += vals[i + 1]; pts.push([lo / 1e5, la / 1e5]); }
    return pts;
  });
}

// ---- UTM (WGS84) forward / inverse ----
const UTM_A = 6378137, UTM_F = 1 / 298.257223563, UTM_K0 = 0.9996;
const UTM_E2 = UTM_F * (2 - UTM_F), UTM_EP2 = UTM_E2 / (1 - UTM_E2);
function llToUTM(lon, lat, zone) {
  const D = Math.PI / 180, phi = lat * D, lam = lon * D, lam0 = (zone * 6 - 183) * D;
  const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi), e2 = UTM_E2;
  const N = UTM_A / Math.sqrt(1 - e2 * s * s), T = t * t, C = UTM_EP2 * c * c, A = c * (lam - lam0);
  const M = UTM_A * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const E = UTM_K0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * UTM_EP2) * A ** 5 / 120) + 500000;
  const Nn = UTM_K0 * (M + N * t * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * UTM_EP2) * A ** 6 / 720));
  return [E, Nn];
}
function utmToLL(E, N, zone) {
  const a = UTM_A, k0 = UTM_K0, e2 = UTM_E2, ep2 = UTM_EP2;
  const x = E - 500000, M = N / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5), D = x / (N1 * k0);
  const lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
  return [zone * 6 - 183 + lon * 180 / Math.PI, lat * 180 / Math.PI];
}
function makeUTM(rings, zone) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const r of rings) for (const [lo, la] of r) {
    if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
    if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
  }
  return { zone, bounds: { minLat, maxLat, minLon, maxLon }, fwd: (lon, lat) => llToUTM(lon, lat, zone), inv: (E, N) => utmToLL(E, N, zone) };
}

function buildSegments(rings, proj) {
  let n = 0; for (const r of rings) n += r.length - 1;
  const S = new Float64Array(n * 4); let k = 0;
  for (const r of rings) {
    let [px, py] = proj.fwd(r[0][0], r[0][1]);
    for (let i = 1; i < r.length; i++) {
      const [x, y] = proj.fwd(r[i][0], r[i][1]);
      S[k++] = px; S[k++] = py; S[k++] = x; S[k++] = y; px = x; py = y;
    }
  }
  return S;
}
// segments from rings already in metres; closes each ring
function segsFromXY(rings, close = true) {
  let n = 0; for (const r of rings) n += close ? r.length : r.length - 1;
  const S = new Float64Array(Math.max(0, n) * 4); let k = 0;
  for (const r of rings) {
    const m = close ? r.length : r.length - 1;
    for (let i = 0; i < m; i++) { const a = r[i], b = r[(i + 1) % r.length]; S[k++] = a[0]; S[k++] = a[1]; S[k++] = b[0]; S[k++] = b[1]; }
  }
  return S;
}

function inWater(x, y, S) {
  let c = 0;
  for (let i = 0; i < S.length; i += 4) {
    const ay = S[i + 1], by = S[i + 3];
    if ((ay > y) !== (by > y)) {
      const ax = S[i], bx = S[i + 2];
      if (x < ax + (y - ay) * (bx - ax) / (by - ay)) c++;
    }
  }
  return c % 2 === 1;
}

// Brute-force distance (m) from (x,y) along azimuth deg (clockwise from grid north) to the first segment crossing
function castRay(x, y, deg, S, tmin = 1e-6) {
  const th = deg * Math.PI / 180, dx = Math.sin(th), dy = Math.cos(th);
  let best = Infinity;
  for (let i = 0; i < S.length; i += 4) {
    const ax = S[i], ay = S[i + 1], ex = S[i + 2] - ax, ey = S[i + 3] - ay;
    const den = dx * ey - dy * ex;
    if (den === 0) continue;
    const wx = ax - x, wy = ay - y;
    const t = (wx * ey - wy * ex) / den;
    if (t <= tmin || t >= best) continue;
    const u = (wx * dy - wy * dx) / den;
    if (u >= 0 && u <= 1) best = t;
  }
  return best;
}

// Uniform-grid index over segments; rays walk the grid cell by cell (Amanatides–Woo) so each ray tests only nearby segments
function buildIndex(S, cell = 250) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < S.length; i += 4) {
    x0 = Math.min(x0, S[i], S[i + 2]); x1 = Math.max(x1, S[i], S[i + 2]);
    y0 = Math.min(y0, S[i + 1], S[i + 3]); y1 = Math.max(y1, S[i + 1], S[i + 3]);
  }
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), ny = Math.max(1, Math.ceil((y1 - y0) / cell));
  const cnt = new Int32Array(nx * ny + 1);
  const span = (i, f) => {
    const cx0 = Math.floor((Math.min(S[i], S[i + 2]) - x0) / cell), cx1 = Math.floor((Math.max(S[i], S[i + 2]) - x0) / cell);
    const cy0 = Math.floor((Math.min(S[i + 1], S[i + 3]) - y0) / cell), cy1 = Math.floor((Math.max(S[i + 1], S[i + 3]) - y0) / cell);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) f(cy * nx + cx);
  };
  for (let i = 0; i < S.length; i += 4) span(i, c => cnt[c + 1]++);
  for (let c = 0; c < nx * ny; c++) cnt[c + 1] += cnt[c];
  const fill = cnt.slice(0, nx * ny), idx = new Int32Array(cnt[nx * ny]);
  for (let i = 0; i < S.length; i += 4) span(i, c => { idx[fill[c]++] = i; });
  return { S, x0, y0, x1, y1, cell, nx, ny, start: cnt, idx };
}
function castIdx(x, y, deg, IX, tmin = 1e-6) {
  const { S, x0, y0, cell, nx, ny, start, idx } = IX;
  if (x <= IX.x0 || y <= IX.y0 || x >= IX.x1 || y >= IX.y1) return castRay(x, y, deg, S, tmin);
  const th = deg * Math.PI / 180, dx = Math.sin(th), dy = Math.cos(th);
  let cx = Math.min(nx - 1, Math.floor((x - x0) / cell)), cy = Math.min(ny - 1, Math.floor((y - y0) / cell));
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = Math.abs(dx) < 1e-12 ? Infinity : cell / Math.abs(dx), tdy = Math.abs(dy) < 1e-12 ? Infinity : cell / Math.abs(dy);
  let tmx = Math.abs(dx) < 1e-12 ? Infinity : (x0 + (cx + (dx > 0 ? 1 : 0)) * cell - x) / dx;
  let tmy = Math.abs(dy) < 1e-12 ? Infinity : (y0 + (cy + (dy > 0 ? 1 : 0)) * cell - y) / dy;
  let best = Infinity;
  for (;;) {
    const c = cy * nx + cx;
    for (let k = start[c], e = start[c + 1]; k < e; k++) {
      const i = idx[k];
      const ax = S[i], ay = S[i + 1], ex = S[i + 2] - ax, ey = S[i + 3] - ay;
      const den = dx * ey - dy * ex;
      if (den === 0) continue;
      const wx = ax - x, wy = ay - y;
      const t = (wx * ey - wy * ex) / den;
      if (t <= tmin || t >= best) continue;
      const u = (wx * dy - wy * dx) / den;
      if (u >= 0 && u <= 1) best = t;
    }
    if (best <= Math.min(tmx, tmy)) return best;
    if (tmx < tmy) { cx += sx; if (cx < 0 || cx >= nx) return best; tmx += tdx; }
    else { cy += sy; if (cy < 0 || cy >= ny) return best; tmy += tdy; }
  }
}

function allRadials(x, y, step, castFn) {
  const out = [];
  for (let d = 0; d < 360 - 1e-9; d += step) out.push({ deg: Math.round(d * 100) / 100, L: castFn(x, y, d) });
  return out;
}

// Centred moving average of n radials (circular). n=1 => straight-line fetch.
function effectiveFetch(rad, n) {
  const m = rad.length, h = (n - 1) / 2;
  return rad.map((r, i) => {
    let s = 0;
    for (let k = -h; k <= h; k++) s += rad[(i + k + m) % m].L;
    return s / n;
  });
}

// CEM / USBR duration ratio U_t / U_3600 (t in seconds)
function durRatio(t) {
  return t < 3600 ? 1.277 + 0.296 * Math.tanh(0.9 * Math.log10(45 / t))
                  : -0.15 * Math.log10(t) + 1.5334;
}

// USBR DS-13 Ch.6 (2021) Appendix B eqs 1–4 (= CEM EM 1110-2-1100 Part II-2, fetch-limited)
function usbrDS13(Fm, U1h) {
  const Fmi = Fm / 1609.344; let t = 3600, U = U1h, V = 0;
  for (let it = 0; it < 200; it++) {
    U = U1h * durRatio(t); V = U / 0.44704;
    const tn = 1.87 * Math.pow(Fmi, 0.67) / Math.pow(V, 0.34) * 3600;
    if (Math.abs(tn - t) < 0.01) { t = tn; break; }
    t = tn;
  }
  U = U1h * durRatio(t); V = U / 0.44704;
  const c = 1.1 + 0.0156 * V;
  const Hs = 0.0245 * Math.sqrt(Fmi) * V * Math.sqrt(c) * 0.3048;
  const T = 0.464 * Math.cbrt(Fmi) * Math.cbrt(V) * Math.pow(c, 1 / 6);
  return { tmin: t, U, Hs, T, L: G * T * T / (2 * Math.PI) };
}

// Shore Protection Manual 1984 (basis of USBR ACER Tech. Memo No. 2), deep water, fetch-limited
function spm84(Fm, U1h) {
  let t = 3600, U = U1h, UA = 0;
  for (let it = 0; it < 300; it++) {
    U = U1h * durRatio(t); UA = 0.71 * Math.pow(U, 1.23);
    const tn = 68.8 * Math.pow(G * Fm / (UA * UA), 2 / 3) * UA / G;
    if (Math.abs(tn - t) < 0.01) { t = tn; break; }
    t = tn;
  }
  U = U1h * durRatio(t); UA = 0.71 * Math.pow(U, 1.23);
  const Hs = 1.6e-3 * UA * Math.sqrt(Fm / G);
  const T = 0.2857 * UA / G * Math.cbrt(G * Fm / (UA * UA));
  return { tmin: t, U, UA, Hs, T, L: G * T * T / (2 * Math.PI) };
}
