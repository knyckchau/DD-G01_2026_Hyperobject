// DD-G01 HYPEROBJECT — life-safety DD checks (pure JS, no DOM; runs in the browser and in node).
// Everything is derived from the model data (slabs, program volumes, stairs from tools/build_data.py, and elevator /
// lobby geometry clustered from the core model layers), so the checks re-run automatically when new FBX exports are
// converted. Nothing here refers to a specific floor, stair or elevator by name.
// Basis: NYC Building Code 2022 (Ch. 4, 10, 30). DD estimates from straight-line geometry, not a compliance review.
const FT = 3.28084;

// ---------- geometry helpers (plan, metres) ----------
const uniq = l => { const m = new Map(); for (const t of l.tris) for (let j = 0; j < 6; j += 2) m.set(t[j].toFixed(2) + ',' + t[j + 1].toFixed(2), [t[j], t[j + 1]]); return [...m.values()]; };
function maxDiag(pts) { let d = 0, a = null, b = null; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const e = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (e > d) { d = e; a = pts[i]; b = pts[j]; } } return { d, a, b }; }
const clampPt = (p, b) => [Math.min(Math.max(p[0], b[0]), b[3]), Math.min(Math.max(p[1], b[1]), b[4])];
const toBox = (p, b) => { const q = clampPt(p, b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
const edgeGap = (a, b) => Math.hypot(Math.max(0, a[0] - b[3], b[0] - a[3]), Math.max(0, a[1] - b[4], b[1] - a[4]));
const zOverlap = (a, b) => a[2] < b[5] - 0.2 && b[2] < a[5] - 0.2;
const ctr = b => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2];
// closest pair of points between two plan boxes
function boxPair(a, b) {
  const ax = (lo1, hi1, lo2, hi2) => hi1 < lo2 ? [hi1, lo2] : hi2 < lo1 ? [lo1, hi2] : [(Math.max(lo1, lo2) + Math.min(hi1, hi2)) / 2, (Math.max(lo1, lo2) + Math.min(hi1, hi2)) / 2];
  const x = ax(a[0], a[3], b[0], b[3]), y = ax(a[1], a[4], b[1], b[4]);
  return [[x[0], y[0]], [x[1], y[1]]];
}
// ---------- walkable floor plate (paths may only run where there is slab) ----------
// The slab triangles are rasterised to a grid; elevator hoistways and MEP shafts are removed. Stairs are the targets.
const CELL = 0.2;   // m
const CLR = 0.3;    // m: a route keeps this far from walls and edges where the space allows (12 in, half a person's width)
function walkGrid(level, obst, floors = [], walls = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of level.tris) for (let j = 0; j < 6; j += 2) { x0 = Math.min(x0, t[j]); x1 = Math.max(x1, t[j]); y0 = Math.min(y0, t[j + 1]); y1 = Math.max(y1, t[j + 1]); }
  x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
  const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((y1 - y0) / CELL), walk = new Uint8Array(W * H);
  for (const t of level.tris) {
    const [ax, ay, bx, by, cx, cy] = t, den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / CELL)), i1 = Math.min(W - 1, Math.floor((Math.max(ax, bx, cx) - x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / CELL)), j1 = Math.min(H - 1, Math.floor((Math.max(ay, by, cy) - y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * CELL, py = y0 + (j + 0.5) * CELL;
      const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) walk[j * W + i] = 1;
    }
  }
  const slab = walk.slice();                                   // cells that count for travel distance
  for (const b of floors) forBox(b, 0.35, W, H, x0, y0, k => walk[k] = 1);   // stair landings, vestibules, lobbies and door thresholds (core model); walls re-block below
  for (const b of obst) forBox(b, 0, W, H, x0, y0, k => { walk[k] = 0; slab[k] = 0; });
  if (walls) for (let n = 0; n < walls.length; n += 4) {        // walls cut at +1.0 m block; openings and doors stay open
    const ax = walls[n], ay = walls[n + 1], bx = walls[n + 2], by = walls[n + 3], m = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 4)) + 1;
    for (let q = 0; q <= m; q++) { const i = Math.floor((ax + (bx - ax) * q / m - x0) / CELL), j = Math.floor((ay + (by - ay) * q / m - y0) / CELL); if (i >= 0 && j >= 0 && i < W && j < H) { walk[j * W + i] = 0; slab[j * W + i] = 0; } }
  }
  // clearance: distance (m) from each walkable cell to the nearest wall or edge, two-pass chamfer transform
  const clear = new Float32Array(W * H), D1 = CELL, D2 = CELL * Math.SQRT2;
  for (let k = 0; k < W * H; k++) clear[k] = walk[k] ? 1e9 : 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!clear[k]) continue; let v = clear[k];
    if (i > 0) v = Math.min(v, clear[k - 1] + D1); if (j > 0) { v = Math.min(v, clear[k - W] + D1); if (i > 0) v = Math.min(v, clear[k - W - 1] + D2); if (i < W - 1) v = Math.min(v, clear[k - W + 1] + D2); }
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1) v = Math.min(v, CELL); clear[k] = v; }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (!clear[k]) continue; let v = clear[k];
    if (i < W - 1) v = Math.min(v, clear[k + 1] + D1); if (j < H - 1) { v = Math.min(v, clear[k + W] + D1); if (i < W - 1) v = Math.min(v, clear[k + W + 1] + D2); if (i > 0) v = Math.min(v, clear[k + W - 1] + D2); } clear[k] = v; }
  return { x0, y0, W, H, walk, slab, clear };
}
function forBox(b, pad, W, H, x0, y0, fn) {
  const i0 = Math.max(0, Math.floor((b[0] - pad - x0) / CELL)), i1 = Math.min(W - 1, Math.floor((b[3] + pad - x0) / CELL));
  const j0 = Math.max(0, Math.floor((b[1] - pad - y0) / CELL)), j1 = Math.min(H - 1, Math.floor((b[4] + pad - y0) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = x0 + (i + 0.5) * CELL, py = y0 + (j + 0.5) * CELL; if (px >= b[0] - pad && px <= b[3] + pad && py >= b[1] - pad && py <= b[4] + pad) fn(j * W + i); }
}
// shortest walking distance (8-connected Dijkstra) from every walkable cell to the entrance of an exit:
// the stair enclosure, or its smokeproof vestibule where there is one (the vestibule is part of the enclosure, §1023.11)
function field(g, box, doorPt = null) {   // doorPt: a known door (vestibule) — routes end exactly there
  // nobody walks through a stair enclosure or vestibule to get somewhere else: every enclosure on the floor is solid for routing,
  // except this exit's own region when its doors are found from the openings (no known door)
  const { W, H } = g, N = W * H, walk = g.walk.slice(), own = new Uint8Array(N);
  if (!doorPt) for (const b of Array.isArray(box[0]) ? box : [box]) forBox(b, 0, W, H, g.x0, g.y0, k => own[k] = 1);
  for (const b of g.encl || []) forBox(b, 0, W, H, g.x0, g.y0, k => { if (!own[k]) walk[k] = 0; });
  const d = new Float64Array(N).fill(Infinity), len = new Float64Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), seed = new Uint8Array(N);
  const heap = []; const push = (k, v) => { heap.push([v, k]); let i = heap.length - 1; while (i) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  // the exit region (stair enclosure, plus its vestibule); its doors are the region cells that open onto walkable cells outside it
  const inT = new Uint8Array(N);
  for (const b of Array.isArray(box[0]) ? box : [box]) forBox(b, 0, W, H, g.x0, g.y0, k => { if (walk[k]) inT[k] = 1; });
  const door = [];
  for (let k = 0; k < N; k++) if (inT[k]) { const i = k % W, j = (k - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = nj * W + ni; if (walk[n] && !inT[n]) { door.push(k); break; } } }
  if (doorPt) {   // the vestibule's door: seed only the door opening (1 m wide), so every route ends at it
    const near = []; forBox([doorPt[0] - 0.5, doorPt[1] - 0.5, 0, doorPt[0] + 0.5, doorPt[1] + 0.5, 0], 0, W, H, g.x0, g.y0, k => { if (walk[k]) near.push(k); });
    if (near.length) { door.length = 0; door.push(...near); } else doorPt = null; }
  for (const k of door) { seed[k] = 1; d[k] = 0; len[k] = 0; push(k, 0); }   // routes end at a door, not somewhere inside the enclosure
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let reached = 0; const order = [];
  while (heap.length) {
    const [v, k] = pop(); if (v > d[k]) continue;
    order.push(k);
    if (g.slab[k] && !seed[k]) reached++;
    const i = k % W, j = (k - i) / W;
    for (const [di, dj, c] of NB) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni; if (!walk[n]) continue;
      if (di && dj && !(walk[j * W + ni] && walk[nj * W + i])) continue;   // no corner cutting past wall ends
      const nv = v + c * CELL * (g.clear[n] < CLR ? 3 : 1); if (nv < d[n]) { d[n] = nv; len[n] = len[k] + c * CELL; par[n] = k; push(n, nv); }   // near a wall costs more: routes keep off walls where there is room
    }
  }
  // door openings: connected groups of door cells. The main door is the one most of the floor plate walks to
  // (a gap in the modelled walls can open a stray 'door' that almost nobody uses; it must not set the exit separation)
  const use = new Float64Array(N);
  for (let n = order.length - 1; n >= 0; n--) { const k = order[n]; if (g.slab[k] && !seed[k]) use[k] += 1; if (par[k] >= 0) use[par[k]] += use[k]; }
  // a door is the run of door cells along one face of the enclosure, up to 2.5 m long; its midpoint is the door point.
  // A longer run means that face has no wall in the model (open side): there the point is simply where the route arrives.
  const outSide = k => { const i = k % W, j = (k - i) / W; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = nj * W + ni; if (walk[n] && !inT[n]) return [di, dj]; } return null; };
  const doorAt = k => { const sd = outSide(k); if (!sd) return cxy(g, k); const i0 = k % W, j0 = (k - i0) / W, ax = sd[0] ? [0, 1] : [1, 0], run = [k];
    for (const dir of [1, -1]) for (let t = 1; t < 40; t++) { const ni = i0 + ax[0] * t * dir, nj = j0 + ax[1] * t * dir; if (ni < 0 || nj < 0 || ni >= W || nj >= H) break; const n = nj * W + ni; const o2 = seed[n] && outSide(n); if (!o2 || o2[0] !== sd[0] || o2[1] !== sd[1]) break; run.push(n); }
    if (run.length * CELL > 2.5) return cxy(g, k);
    const P = run.map(n => cxy(g, n)); return [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length]; };
  // main door: the door cell most of the floor plate walks to (a stray gap in the modelled walls that almost nobody uses must not set the exit separation)
  let kMain = -1; for (const k of door) if (kMain < 0 || use[k] > use[kMain]) kMain = k;
  // the stair is an exit on this floor only if a path through an opening reaches the floor plate
  if (doorPt) return { d: len, cost: d, par, seed, walk, doorAt: () => doorPt, door: doorPt, ok: reached * CELL * CELL > 4 };
  return { d: len, cost: d, par, seed, walk, doorAt, door: kMain >= 0 ? doorAt(kMain) : null, ok: reached * CELL * CELL > 4 };
}
// cells under a programme volume: its mesh triangles projected to plan (top and bottom faces fill it)
function footprint(g, m) {
  const out = new Set(), v = m.v, t = m.t;
  for (let n = 0; n < t.length; n += 3) {
    const ax = v[t[n] * 3], ay = v[t[n] * 3 + 1], bx = v[t[n + 1] * 3], by = v[t[n + 1] * 3 + 1], cx = v[t[n + 2] * 3], cy = v[t[n + 2] * 3 + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-6) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - g.x0) / CELL)), i1 = Math.min(g.W - 1, Math.floor((Math.max(ax, bx, cx) - g.x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - g.y0) / CELL)), j1 = Math.min(g.H - 1, Math.floor((Math.max(ay, by, cy) - g.y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = g.x0 + (i + 0.5) * CELL, py = g.y0 + (j + 0.5) * CELL;
      const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      if (u >= -1e-6 && w >= -1e-6 && u + w <= 1 + 1e-6) out.add(j * g.W + i);
    }
  }
  return [...out];
}
const cxy = (g, k) => [g.x0 + (k % g.W + 0.5) * CELL, g.y0 + (Math.floor(k / g.W) + 0.5) * CELL];
const cellAt = (g, p) => { const i = Math.floor((p[0] - g.x0) / CELL), j = Math.floor((p[1] - g.y0) / CELL); return i < 0 || j < 0 || i >= g.W || j >= g.H ? -1 : j * g.W + i; };
function nearestWalk(g, p) {
  const k = cellAt(g, p); if (k >= 0 && g.slab[k]) return k;
  let best = -1, bd = Infinity; for (let n = 0; n < g.walk.length; n++) if (g.slab[n]) { const q = cxy(g, n), e = Math.hypot(q[0] - p[0], q[1] - p[1]); if (e < bd) { bd = e; best = n; } } return best;
}
// cell chain → shortest polyline that stays on walkable cells (string pulling); length in m
const chain = (f, k) => { const ch = []; for (let c = k; c >= 0; c = f.par[c]) ch.push(c); return ch; };
function pathFrom(g, f, k) { const ch = chain(f, k), pts = ch.map(c => cxy(g, c)), e = ch[ch.length - 1]; if (f.doorAt) pts.push(f.doorAt(e)); return pull(g, pts, f.walk); }   // ends at the door midpoint
// common path of egress travel: the part of the route to the nearest exit that is shared with the route to a second,
// distinct exit (both are shortest walking routes; they are treated as shared while within 0.4 m of each other)
// Common path: walk along the (straightened) route to the nearest exit and stop where it moves more than 0.5 m away
// from the route to a second, different exit. The split point lies on the route itself, so the common part and the
// rest of the path of travel are one continuous line.
const segDist = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
const lineDist = (q, pts) => { let m = Infinity; for (let n = 1; n < pts.length; n++) m = Math.min(m, segDist(q, pts[n - 1], pts[n])); return m; };
function cutAt(pts, s) {   // polyline split at arc length s
  const a = [pts[0]]; let acc = 0;
  for (let n = 1; n < pts.length; n++) {
    const p = pts[n - 1], q = pts[n], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (acc + L >= s) { const t = L ? (s - acc) / L : 0, m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; a.push(m); return [a, [m, ...pts.slice(n)]]; }
    a.push(q); acc += L;
  }
  return [a, [pts[pts.length - 1]]];
}
function commonPath(g, f1, f2, k) {
  const p1 = pathFrom(g, f1, k), p2 = pathFrom(g, f2, k);
  let s = 0, acc = 0;
  walk: for (let n = 1; n < p1.pts.length; n++) {
    const a = p1.pts[n - 1], b = p1.pts[n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= L; t += 0.1) { if (lineDist([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L], p2.pts) > 0.5) { s = acc + t; break walk; } }
    acc += L; s = acc;
  }
  const [cpts, rest] = cutAt(p1.pts, s);
  return { common: { pts: cpts, len: s }, rest, path: p1 };
}
function pull(g, pts, walk = g.walk) {
  const cl = p => { const c = cellAt(g, p); return c < 0 ? 0 : g.clear[c]; };
  const ok = (a, b) => { const need = Math.min(CLR, cl(a), cl(b)) - 1e-6, n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 3)); for (let s = 1; s < n; s++) { const c = cellAt(g, [a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); if (c < 0 || !walk[c] || g.clear[c] < need) return false; } return true; };   // straight runs keep the clearance
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !ok(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
  let len = 0; for (let n = 1; n < out.length; n++) len += Math.hypot(out[n][0] - out[n - 1][0], out[n][1] - out[n - 1][1]);
  return { pts: out, len };
}

const exitsRequired = occ => occ <= 0 ? 0 : occ <= 500 ? 2 : occ <= 1000 ? 3 : 4;   // NYC BC Table 1006.3.1
const worst = s => s.includes('fail') ? 'fail' : s.includes('warn') ? 'warn' : s.includes('info') ? 'info' : 'ok';

// ---------- core model (detail-data.js) → elevator cars and lobbies ----------
// Layers follow the core model convention: 02_PASSENGER_ELEVATORS, 03_FREIGHT_ELEVATOR, 04_LOBBY_AREAS.
// Meshes are split into connected pieces, then pieces that overlap in plan are merged into vertical columns.
export function clusterDetail(D, levelZ = []) {
  const out = { elevators: [], lobbies: [], walls: levelZ.map(() => []) };
  if (!D) return out;
  const dec = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
  const cols = l => {
    const q = dec(l.v, Int16Array), t = dec(l.t, Uint32Array), n = q.length / 3, p = new Int32Array(n).map((_, i) => i);
    const f = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
    for (let i = 0; i < t.length; i += 3) { const a = f(t[i]); p[f(t[i + 1])] = a; p[f(t[i + 2])] = a; }
    const bb = new Map();
    for (let i = 0; i < n; i++) {
      const r = f(i), x = q[i * 3] / 100 + D.origin[0], y = q[i * 3 + 1] / 100 + D.origin[1], z = q[i * 3 + 2] / 100 + D.origin[2];
      let b = bb.get(r); if (!b) bb.set(r, b = [x, y, z, x, y, z]);
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z);
    }
    let C = [...bb.values()], ch = true;
    const ov = (b, c) => b[0] <= c[3] + 0.05 && b[3] >= c[0] - 0.05 && b[1] <= c[4] + 0.05 && b[4] >= c[1] - 0.05;
    while (ch) { ch = false; const o = []; for (const b of C) { const c = o.find(c => ov(b, c)); if (c) { for (let k = 0; k < 3; k++) { c[k] = Math.min(c[k], b[k]); c[k + 3] = Math.max(c[k + 3], b[k + 3]); } ch = true; } else o.push([...b]); } C = o; }
    return C.filter(b => (b[3] - b[0]) * (b[4] - b[1]) > 0.5).map(b => b.map(v => Math.round(v * 100) / 100)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };
  for (const l of D.layers) {
    if (l.name === '02_PASSENGER_ELEVATORS') cols(l).forEach(b => out.elevators.push({ kind: 'passenger', b }));
    else if (l.name === '03_FREIGHT_ELEVATOR') cols(l).forEach(b => out.elevators.push({ kind: 'freight', b }));
    else if (l.name === '04_LOBBY_AREAS') cols(l).forEach(b => out.lobbies.push(b));
    else if (levelZ.length && ['00_WALLS', 'WALL', 'PARTITION'].includes(l.name)) {   // plan cut of walls at floor + 1.0 m
      const q = dec(l.v, Int16Array), t = dec(l.t, Uint32Array), o = D.origin;
      const V = i => [q[i * 3] / 100 + o[0], q[i * 3 + 1] / 100 + o[1], q[i * 3 + 2] / 100 + o[2]];
      for (let n = 0; n < t.length; n += 3) {
        const p = [V(t[n]), V(t[n + 1]), V(t[n + 2])], zl = Math.min(p[0][2], p[1][2], p[2][2]), zh = Math.max(p[0][2], p[1][2], p[2][2]);
        levelZ.forEach((lz, li) => {
          const zs = lz + 1.0; if (zs <= zl || zs >= zh) return;
          const c = []; for (let a = 0; a < 3; a++) { const A = p[a], B = p[(a + 1) % 3]; if ((A[2] - zs) * (B[2] - zs) < 0) { const f = (zs - A[2]) / (B[2] - A[2]); c.push(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f); } }
          if (c.length === 4) out.walls[li].push(...c);
        });
      }
    }
  }
  out.walls = out.walls.map(w => new Float32Array(w));
  const wl = D.layers.find(l => l.name === '00_WALLS');   // core wall vertices: the modelled height of each shaft
  if (wl) { const q = dec(wl.v, Int16Array), v = new Float32Array(q.length); for (let i = 0; i < q.length; i++) v[i] = q[i] / 100 + D.origin[i % 3]; out.coreV = v; }
  out.elevators.sort((a, b) => a.b[0] - b.b[0] || a.b[1] - b.b[1]).forEach((e, i) => e.id = 'E' + (i + 1));
  return out;
}

export function lifeSafety(P, A, model, G = {}) {
  const L = P.levels, F = model.floors, roofIdx = L.length - 1, nOcc = L.length - 1;
  const MEP = P.mep || {};
  const capPer = A.stairClearIn / A.stairFactor;                 // occupants per stair, §1005.3.1
  const z0 = L[0].z, hiZ = L[nOcc - 1].z, roofZ = L[roofIdx].z;
  const items = [];
  const it = (status, item, detail, ref, k) => items.push({ status, item, detail, ref, k });

  // ---------- stairs, vestibules, exits ----------
  // an enclosure (stair shaft, vestibule, lobby, hoistway) is a room: its height is that of the core walls around it, not the top of the flight or floor patch inside it
  // (no core model loaded: the slab above the highest floor it serves)
  const ceil = i => L[i + 1]?.z ?? L[i].z + (L[i].z - L[i - 1].z);
  const topFloor = z => L.reduce((m, l, i) => l.z <= z + 0.1 ? i : m, 0);
  const CV = G.coreV;
  const wallTop = b => { if (!CV) return null;   // nearest core walls: widen the search until some are found (cars in a bank share the bank's walls)
    for (const m of [0.5, 1.5, 3]) { let t = -Infinity; for (let i = 0; i < CV.length; i += 3) if (CV[i] > b[0] - m && CV[i] < b[3] + m && CV[i + 1] > b[1] - m && CV[i + 1] < b[4] + m && CV[i + 2] > t) t = CV[i + 2]; if (isFinite(t)) return t; }
    return null; };
  const roomTop = (b, fl) => Math.max(b[5], wallTop(b) ?? ceil(fl));
  const lob = (G.lobbies || []).map((b, i) => ({ id: 'LB' + (i + 1), b: [...b.slice(0, 5), roomTop(b, topFloor(b[5]))] }));
  const stairs = (MEP.stairs || []).map(s => ({ id: s.id, b: [...s.bbox], bot: s.bbox[2], top: s.bbox[5] }));
  for (const s of stairs) {
    const v = lob.filter(l => edgeGap(l.b, s.b) < 0.4 && zOverlap(l.b, s.b)).sort((a, c) => (a.b[3] - a.b[0]) * (a.b[4] - a.b[1]) - (c.b[3] - c.b[0]) * (c.b[4] - c.b[1]))[0];
    s.vest = v && (v.b[3] - v.b[0]) * (v.b[4] - v.b[1]) < 12 ? v : null;   // small lobby attached to the stair = vestibule
    if (s.vest) s.vest.role = 'vestibule';
    s.toRoof = s.top >= roofZ - 0.3; s.toBase = P.basementZ != null && s.bot <= P.basementZ + 1;
    s.floors = L.map((l, i) => i).filter(i => s.bot <= L[i].z + 1 && s.top >= L[i].z + 1);
    if (s.floors.length) s.b[5] = roomTop(s.b, Math.max(...s.floors));
  }
  // stairs sharing a wall count as one exit stairway (§1007.1.1)
  const exitOf = {}; stairs.forEach((s, i) => { exitOf[s.id] = s.id; for (let j = 0; j < i; j++) if (edgeGap(s.b, stairs[j].b) < 0.3) exitOf[s.id] = exitOf[stairs[j].id]; });

  // ---------- elevators and lobbies ----------
  const elev = (G.elevators || []).map(e => ({ ...e, b: [...e.b], bot: e.b[2], top: e.b[5] }));
  for (const e of elev) {
    const l = lob.filter(x => x.role !== 'vestibule' && edgeGap(x.b, e.b) < 0.4 && zOverlap(x.b, e.b))[0];
    e.lobby = l ? l.id : null; if (l) l.role = 'elevator lobby';
    e.lobbyStair = l ? (stairs.filter(s => edgeGap(s.b, l.b) < 0.6).map(s => s.id)[0] || null) : null;
    e.reachesTop = e.top >= hiZ;
    e.floors = L.map((x, i) => i).filter(i => e.bot <= L[i].z + 0.5 && e.top >= L[i].z + 0.5);
    if (e.floors.length) e.b[5] = roomTop(e.b, Math.max(...e.floors));
    e.fse = !!(e.lobby && e.reachesTop);
  }
  lob.forEach(l => l.role ||= 'lobby');

  // ---------- per floor ----------
  const obst = [...elev.map(e => e.b), ...(MEP.shafts || []).map(x => x.bbox)];
  const rows = F.map((f, i) => {
    const z = L[i].z, zNext = i < roofIdx ? L[i + 1].z : Infinity;
    const serve = stairs.filter(s => s.bot <= z + 1 && s.top >= z + 1);
    const occ = f.occ || 0, grade = i === 0;
    const grpOf = cat => (cat && model.cats?.[cat]?.grp) || null;
    const groups = [...new Set(f.zones.map(zn => grpOf(zn.cat)).filter(g => g && g !== '-'))];
    const vols = P.volumes.filter(v => v.floor === i);
    const multi = vols.filter(v => v.zmax > zNext + 0.5);
    const pts = uniq(L[i]);
    const D = maxDiag(pts), diag = D.d * FT, sepReq = diag * A.sepFraction;
    // walkable floor plate: slab minus hoistways and shafts; walking distance to each stair that the slab reaches
    const at = b => b[2] <= z + 0.5 && b[5] >= z + 0.5;
    const g = walkGrid(L[i], obst.filter(at), [...serve.map(s => s.b), ...lob.map(l => l.b).filter(at)], G.walls?.[i] || null);
    // smokeproof vestibule: corridor → vestibule → stair, so its floor door is on the face opposite the one it shares with the stair;
    // if that face has no floor in front of it, the face (other than the shared one) with the most floor in front of it
    const vestDoor = (v, sb) => {
      const sides = [['W', v[0], (v[1] + v[4]) / 2, -1, 0, Math.abs(v[0] - sb[3])], ['E', v[3], (v[1] + v[4]) / 2, 1, 0, Math.abs(v[3] - sb[0])],
        ['S', (v[0] + v[3]) / 2, v[1], 0, -1, Math.abs(v[1] - sb[4])], ['N', (v[0] + v[3]) / 2, v[4], 0, 1, Math.abs(v[4] - sb[1])]];
      const shared = sides.reduce((b, x) => x[5] < b[5] ? x : b), opp = { W: 'E', E: 'W', S: 'N', N: 'S' }[shared[0]];
      const front = x => { let n = 0; const len2 = x[3] ? v[4] - v[1] : v[3] - v[0];
        for (let t = -len2 / 2 + 0.1; t <= len2 / 2 - 0.1; t += CELL) for (const dd of [0.5, 0.9]) { const p = x[3] ? [x[1] + x[3] * dd, x[2] + t] : [x[1] + t, x[2] + x[4] * dd]; const c = cellAt(g, p); if (c >= 0 && g.slab[c]) n++; } return n; };
      const cand = sides.filter(x => x !== shared), o = cand.find(x => x[0] === opp);
      const pick = o && front(o) > 3 ? o : cand.reduce((b, x) => front(x) > front(b) ? x : b);
      return [pick[1] + pick[3] * 0.15, pick[2] + pick[4] * 0.15];   // just outside the face, on the floor side
    };
    g.encl = [...serve.map(s => s.b), ...serve.filter(s => s.vest && at(s.vest.b)).map(s => s.vest.b)];   // stair enclosures and vestibules on this floor
    g.inEncl = new Uint8Array(g.W * g.H); for (const b of g.encl) forBox(b, 0, g.W, g.H, g.x0, g.y0, k => g.inEncl[k] = 1);   // not floor area for travel / reach
    const fields = serve.map(s => { const hasV = s.vest && at(s.vest.b);
      return { s, ex: exitOf[s.id], f: field(g, hasV ? [s.b, s.vest.b] : s.b, hasV ? vestDoor(s.vest.b, s.b) : null) }; });
    const reach = fields.filter(x => x.f.ok), cut = fields.filter(x => !x.f.ok).map(x => x.s.id);
    const cutDoors = fields.filter(x => !x.f.ok).map(x => { let kk = -1, dd = -1; for (let k = 0; k < x.f.d.length; k++) if (isFinite(x.f.d[k]) && x.f.d[k] > dd) { dd = x.f.d[k]; kk = k; } return { id: x.s.id, p: kk >= 0 ? cxy(g, kk) : ctr(x.s.b) }; });
    const rs = reach.map(x => x.s);
    // exit separation (§1007.1.1): straight line between the exit doors, i.e. the stair door, or the vestibule door where there is one
    let sepEdge = 0, sepCtr = 0, pair = null;
    for (let a = 0; a < rs.length; a++) for (let c = a + 1; c < rs.length; c++) {
      if (exitOf[rs[a].id] === exitOf[rs[c].id]) continue;
      const pa = reach[a].f.door, pc = reach[c].f.door; if (!pa || !pc) continue;
      const e = Math.hypot(pa[0] - pc[0], pa[1] - pc[1]) * FT;
      if (e > sepEdge) { sepEdge = e; pair = { ids: [rs[a].id, rs[c].id], pts: [pa, pc] }; }
      const ca = ctr(rs[a].b), cc = ctr(rs[c].b); sepCtr = Math.max(sepCtr, Math.hypot(ca[0] - cc[0], ca[1] - cc[1]) * FT);
    }
    // limits by occupancy: A per §1029.7 (primary / secondary), M 200, B 300 (Table 1017.2, sprinklered)
    const hasA = groups.some(g => g.startsWith('A'));
    const lims = groups.map(g => g.startsWith('A') ? A.travelA1 : g === 'B' ? A.travelB : A.travelM);
    let lim1 = lims.length ? Math.min(...lims) : A.travelM; const lim2 = hasA ? A.travelA2 : null;
    // floor plate area with no route to any stair
    let unreach = 0, walkN = 0;
    const unreachCells = [];
    const near = k => reach.map(x => ({ x, d: x.f.d[k] })).filter(o => isFinite(o.d)).sort((p, q) => p.d - q.d);
    for (let k = 0; k < g.walk.length; k++) if (g.slab[k] && !g.inEncl[k]) { walkN++; if (!near(k).length) { unreach++; unreachCells.push(cxy(g, k)); } }
    const unreachM2 = unreach * CELL * CELL;
    const heat = [];
    for (let j = 0; j < g.H; j += 2) for (let i = 0; i < g.W; i += 2) { const k = j * g.W + i; if (!g.slab[k] || g.inEncl[k]) continue; let m = Infinity; for (const x of reach) m = Math.min(m, x.f.d[k]); if (isFinite(m)) heat.push(...cxy(g, k), m * FT); }
    // routes start inside each programme space: from its most remote point (§1017.1 / §1029.7 measure from the most remote point)
    const vm = new Map((P.volMeshes || []).map(m => [m.id, m]));
    const zones = f.zones.filter(zn => zn.occ > 0 && !zn.restroom && !zn.synthetic).map(zn => {
      const gp = grpOf(zn.cat), isA = !!gp && gp.startsWith('A');
      const lim = !gp || gp === '-' ? A.travelM : isA ? A.travelA1 : gp === 'B' ? A.travelB : A.travelM;
      let cells = vm.has(zn.id) ? footprint(g, vm.get(zn.id)).filter(k => g.slab[k] && !g.inEncl[k]) : [];
      if (!cells.length) { const k = nearestWalk(g, [zn.x, zn.y]); if (k >= 0) cells = [k]; }
      let o1 = null, o2 = null, cut = 0;
      const cand = [];
      for (const k of cells) {
        const ds = near(k); if (!ds.length) { cut++; continue; }
        cand.push({ k, d: ds[0].d, x: ds[0].x });
        const d2 = ds.find(o => o.x.ex !== ds[0].x.ex);
        if (isA && d2 && (!o2 || d2.d > o2.d)) o2 = { k, d: d2.d, x: d2.x };
      }
      cand.sort((p, q) => q.d - p.d);
      for (const c of cand.slice(0, 40)) { const len = pathFrom(g, c.x.f, c.k).len; if (!o1 || len > o1.len) o1 = { ...c, len }; }
      // common path from the same most remote point (§1006.2.1); with one reachable exit the whole route is common
      const alt = o1 && near(o1.k).find(o => o.x.ex !== o1.x.ex);
      const split = o1 && alt ? commonPath(g, o1.x.f, alt.x.f, o1.k) : null;
      const p1 = split ? split.path : o1 && pathFrom(g, o1.x.f, o1.k), p2 = o2 && pathFrom(g, o2.x.f, o2.k);
      const cp = split ? split.common : p1;
      const cpet = cp ? cp.len * FT : null, cpLim = gp === 'B' ? A.cpetB : A.cpetA;
      const cpStatus = cpet == null ? 'fail' : cpet > cpLim ? 'fail' : 'ok';
      const dist = p1 ? p1.len * FT : null, dist2 = p2 ? p2.len * FT : null, lim2z = isA ? A.travelA2 : null;
      const cutM2 = cut * CELL * CELL;
      const status = dist == null || cutM2 > 2 || dist > lim || (lim2z && dist2 != null && dist2 > lim2z) ? 'fail' : 'ok';
      return { id: zn.id, cat: zn.cat, grp: gp, occ: zn.occ, area: zn.area, p: p1 ? p1.pts[0] : [zn.x, zn.y], path: p1?.pts, stair: o1?.x.s.id, dist, lim,
        p2: p2?.pts[0], path2: p2?.pts, stair2: o2?.x.s.id, dist2, lim2: lim2z, cutM2, status, cpath: cp?.pts, rpath: split ? split.rest : null, cpet, cpLim, cpStatus, oneExit: !!o1 && !alt };
    });
    // the governing space on the floor: worst ratio of route to limit
    const zw = zones.filter(z => z.dist != null).sort((p, q) => q.dist / q.lim - p.dist / p.lim)[0];
    const zw2 = zones.filter(z => z.dist2 != null).sort((p, q) => q.dist2 - p.dist2)[0];
    const far = zw ? { p: zw.p, path: zw.path, d1: zw.dist / FT, s1: zw.stair, zone: zw.id } : null;
    const far2 = zw2 && hasA ? { p: zw2.p2, path: zw2.path2, d: zw2.dist2 / FT, s: zw2.stair2, zone: zw2.id } : null;
    const travel = zw ? zw.dist : null, travel2 = far2 ? zw2.dist2 : null;
    if (zw) lim1 = zw.lim;
    const zc = zones.filter(z => z.cpet != null).sort((p, q) => q.cpet / q.cpLim - p.cpet / p.cpLim)[0];
    const nExits = new Set(reach.map(x => x.ex)).size;
    const req = exitsRequired(occ), cap = reach.length * capPer;
    const st = {};
    if (!occ) { st.exits = st.cap = st.sep = st.travel = st.cpet = 'ok'; }
    else if (grade) { st.exits = st.cap = st.sep = st.travel = st.cpet = 'info'; }
    else {
      st.exits = nExits >= req ? 'ok' : 'fail';
      st.cap = cap >= occ ? 'ok' : 'fail';
      st.cpet = !zones.length ? 'ok' : zones.some(z => z.cpStatus === 'fail') ? 'fail' : 'ok';
      st.sep = nExits < 2 ? 'fail' : sepEdge >= sepReq ? 'ok' : 'fail';   // measured door to door; centre-to-centre is reported only
      st.travel = travel == null || unreachM2 > 2 || zones.some(z => z.status === 'fail') ? 'fail' : travel > lim1 || (lim2 && travel2 != null && travel2 > lim2) ? 'fail'
        : multi.length && travel > A.travelAtrium ? 'fail' : 'ok';
    }
    const row = { heat: new Float32Array(heat), heatCell: CELL * 2, idx: i, name: f.name, z, ft: (z - z0) * FT, occ, occByGrp: f.occByGrp, groups, req, stairs: reach.map(x => x.s.id), cut, unreachM2, unreachCells, cell: CELL, walled: !!G.walls?.[i], walkM2: walkN * CELL * CELL, nExits, cap, capReqIn: occ * A.stairFactor,
      diag, diagPts: [D.a, D.b], sepReq, sepEdge, sepCtr, pair, travel, travel2, lim1, lim2, far, far2, zones, cpet: zc?.cpet ?? null, cpLim: zc?.cpLim ?? A.cpetA, cpZone: zc?.id, cutDoors, multi: multi.map(v => v.cat), grade, roof: i === roofIdx, st,
      status: grade && occ ? 'info' : worst(Object.values(st)) };
    // level of exit discharge: its exits are the exterior doors (§1007.1.1, §1028), which the model does not contain.
    // Routes, spacing and capacity measured to the stairs do not apply here, so they are dropped rather than shown.
    if (grade) Object.assign(row, { heat: new Float32Array(0), stairs: [], nExits: null, cap: null, sepEdge: null, sepCtr: null, pair: null, travel: null, travel2: null, far: null, far2: null,
      cpet: null, cpZone: null, unreachM2: 0, unreachCells: [], exteriorDoors: false,
      zones: zones.map(z => ({ ...z, path: null, path2: null, cpath: null, rpath: null, dist: null, dist2: null, cpet: null, stair: null, stair2: null, status: 'info', cpStatus: 'info', oneExit: false })) });
    return row;
  });

  // ---------- building-wide ----------
  const hf = (hiZ - z0) * FT;
  const toRoof = stairs.filter(s => s.toRoof);
  it(hf > 75 ? 'info' : 'ok', 'High-rise', `Highest occupied floor ≈ ${Math.round(hf)} ft above the lowest level${hf > 75 ? ' (> 75 ft): high-rise provisions of §403 apply (fire command center, smokeproof enclosures, standby and emergency power, voice alarm, fire service access elevator above 120 ft).' : '.'}`, 'NYC BC §202, §403', 'hr');
  it(toRoof.length ? 'ok' : 'fail', 'Stairway to roof', toRoof.length ? `${toRoof.map(s => s.id).join(', ')} reach the roof (+${roofZ.toFixed(1)} m).` : `No stair reaches the roof level (+${roofZ.toFixed(1)} m); highest stair top +${Math.max(...stairs.map(s => s.top), 0).toFixed(1)} m. One stairway must extend to the roof through a bulkhead; the standpipe roof manifold also depends on it.`, 'NYC BC §1011.12; App. Q (NFPA 14 §7.3.2.1)', 'roof');
  const tech = (MEP.tech || []).length;
  if (P.basementZ != null && P.basementZ < z0 - 1) {
    const toB = stairs.filter(s => s.toBase);
    it(toB.length ? 'ok' : (tech ? 'fail' : 'info'), 'Basement exits', toB.length ? `${toB.map(s => s.id).join(', ')} reach the basement (${P.basementZ.toFixed(1)} m).` : `No modelled stair reaches the basement (${P.basementZ.toFixed(1)} m)${tech ? `, which has ${tech} technical rooms` : ''}. Provide exit stairs or confirm the basement egress route (Table 1006.3.1).`, 'NYC BC §1006.3.1, Table 1006.3.1', 'base');
  }
  { const short = [...stairs.filter(s => s.floors.length).map(s => [s.id, s.b[5], ceil(Math.max(...s.floors))]), ...elev.filter(e => e.floors.length).map(e => [e.id, e.b[5], ceil(Math.max(...e.floors))])].filter(x => x[1] < x[2] - 0.3);
    it(short.length ? 'fail' : 'ok', 'Shaft enclosure continuity', short.length ? `Core walls stop below the slab above the top floor served: ${short.map(x => `${x[0]} +${x[1].toFixed(1)} (slab +${x[2].toFixed(1)})`).join(', ')}. Stair and hoistway enclosures must run to the underside of the slab or roof deck above, or be capped with construction of equal rating; the model shows neither.` : 'Every stair and hoistway enclosure reaches the slab above its top floor.', 'NYC BC §707.5, §713.12, §1023.2', 'shaft'); }
  const nEx = new Set(stairs.map(s => exitOf[s.id])).size;
  it('info', 'Exit stairways', `${stairs.length} stairs in the model${nEx < stairs.length ? `, but stairs sharing a wall count as one exit: ${nEx} exits` : ''}. Capacity ${A.stairClearIn} in ÷ ${A.stairFactor} in/occ = ${Math.floor(capPer)} occupants per stair per storey. Enclosures 2-hour (four or more storeys).`, 'NYC BC §1005.3.1, §1007.1.1, §1023.2', 'cap');
  if (hf > 75) {
    const need = stairs.filter(s => s.floors.some(i => i < nOcc && (L[i].z - z0) * FT > 75));
    const noV = need.filter(s => !s.vest || s.vest.b[5] < Math.max(...s.floors.filter(i => i < nOcc).map(i => L[i].z)) + 0.5);
    it(noV.length ? 'fail' : 'ok', 'Smokeproof enclosures', noV.length ? `Stairs without a vestibule over their full height: ${noV.map(s => s.id).join(', ')}.` : `Every stair serving floors above 75 ft has an attached vestibule in the model (${need.map(s => `${s.id}→${s.vest.id}`).join(', ')}). Ventilation or pressurisation per §909.20 still to be designed.`, 'NYC BC §403.5.4, §909.20, §1023.11', 'smoke');
  }
  if (hf > 120) {
    const fse = elev.filter(e => e.fse);
    const top = Math.max(...elev.map(e => e.top), -Infinity);
    const missF = fse.length ? L.map((l, i) => i).filter(i => !fse[0].floors.includes(i)).map(i => F[i].name) : [];
    it(!elev.length ? 'fail' : fse.length ? 'ok' : 'fail', 'Fire service access elevator', elev.length
      ? `Occupied floor > 120 ft: at least one FSE serving every floor. Model: ${elev.length} cars (${elev.map(e => `${e.id} ${e.kind}`).join(', ')}), top +${top.toFixed(1)} m. ${fse.length ? `Candidates with an enclosed lobby reaching the top occupied floor: ${fse.map(e => e.id).join(', ')}; lobby ${fse[0].lobby}${fse[0].lobbyStair ? ` adjoins stair ${fse[0].lobbyStair}` : ' does not adjoin an exit stair'}.${missF.length ? ` Floors not reached: ${missF.join(', ')}.` : ''} Designate one and confirm lobby, standby power and water protection per §3007.` : 'No car has an enclosed lobby and reaches the top occupied floor.'}`
      : `Occupied floor > 120 ft: at least one FSE required. Core model elevator layers not found (load detail data).`, 'NYC BC §403.6.1, §3007.1', 'fse');
    it('info', 'Occupant evacuation elevators', 'Permitted but not required (§403.6.2); if provided, §3008 applies.', 'NYC BC §403.6.2, §3008', 'oee');
  }
  const multiAll = rows.filter(r => r.multi.length);
  if (multiAll.length) it('info', 'Multi-storey volumes (atrium / vertical opening)', `Volumes spanning more than one storey: ${multiAll.map(r => `${r.name} (${r.multi.join(', ')})`).join(' · ')}. Treat as atrium (smoke control, enclosure, ≤ ${A.travelAtrium} ft of travel within the atrium) or enclose as shafts.`, 'NYC BC §404, §404.9.3, §712', 'atr');
  const imm = P.volumes.filter(v => v.cat === 'immersive');
  if (imm.length) it('info', 'Immersive halls — special amusement', `${imm.length} immersive halls (${[...new Set(imm.map(v => v.floor))].sort((a, b) => a - b).map(i => F[i]?.name).join(', ')}). If the egress path is not readily apparent (darkened, LED-enclosed), §411 applies: Group A (75 or more occupants), automatic fire detection, exit marking, voice alarm.`, 'NYC BC §411.1', 'imm');
  const aud = P.volumes.filter(v => v.cat === 'auditorium');
  if (aud.length) it('info', 'Auditorium', `${aud.length} auditorium volume(s) on ${[...new Set(aud.map(v => F[v.floor]?.name))].join(', ')}; occupant load ${A.auditoriumSeats > 0 ? `= ${A.auditoriumSeats} fixed seats (§1004.3)` : 'at 7 net (chairs only)'}. Aisles, main exit and travel per §1029.`, 'NYC BC §1004.3, §1029', 'aud');
  const grpAll = [...new Set(rows.flatMap(r => r.groups))].sort();
  if (grpAll.length > 1) it('info', 'Mixed occupancy', `Groups in the model: ${grpAll.join(', ')}. With separated occupancies each pair needs fire barriers per Table 508.4 (sprinklered values). Floors with more than one group: ${rows.filter(r => r.groups.length > 1).map(r => `${r.name} (${r.groups.join('/')})`).join(' · ') || 'none'}.`, 'NYC BC §508.4, Table 508.4', 'mix');
  const ur = rows.filter(r => r.unreachM2 > 2 && !r.roof);
  if (ur.length) it('fail', 'Floor area with no path to an exit stair', `Walking on the floor plate only, around walls and through openings: ${ur.map(r => `${r.name} ${Math.round(r.unreachM2)} m²`).join(' · ')}. Either the area is enclosed without a door in the model or it is cut off from every stair.`, 'NYC BC §1006.3, §1016', 'ur');
  const cutAll = rows.filter(r => r.cut.length);
  if (cutAll.length) it('fail', 'Stair not reachable from the floor', cutAll.map(r => `${r.name}: ${r.cut.join(', ')}`).join(' · ') + '. The stair passes the floor but no opening connects it to the floor plate (no slab at the door, or no door in the enclosure).', 'NYC BC §1006.3.1, §1023', 'cut');
  const cpF = rows.filter(r => !r.grade && r.zones.some(z => z.cpStatus !== 'ok'));
  if (cpF.length) it('fail', 'Common path of egress travel', cpF.map(r => `${r.name}: ` + r.zones.filter(z => z.cpStatus !== 'ok').map(z => `${z.cat} ${Math.round(z.cpet)} / ${z.cpLim} ft${z.oneExit ? ' (one exit reachable)' : ''}`).join(', ')).join(' · ') + '. Measured from the most remote point of each space until the routes to two different exits separate.', 'NYC BC §1006.2.1, Table 1006.2.1', 'cpet');
  const fl = rows.filter(r => r.status === 'fail').map(r => r.name);
  it(fl.length ? 'fail' : 'ok', 'Floor egress checks', fl.length ? `Floors failing at least one check: ${fl.join(', ')} (see Floors).` : 'All floors pass the geometric checks.', 'NYC BC §1005, §1006, §1007, §1017, §1029.7', 'flo');

  return { rows, items, stairs, elevators: elev, lobbies: lob, capPer, hf, exitOf };
}
