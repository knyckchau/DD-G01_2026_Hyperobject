// View tools shared by all pages:
//  - Centre view: re-frame the model or the selected floor without changing the view direction
//  - imperial drawing scale (e.g. 1/16" = 1'-0") for the orthographic view, with a scale bar
//  - image export (PNG 4K / 8K and scaled SVG vector) with a preview dialog: transparent background,
//    optional legend (from the visible layers) and drawing title
import * as THREE from 'three';

const M_PER_FT = 0.3048, CSS_DPI = 96;
// feet per drawing inch
export const SCALES = [[64, '1/64"'], [32, '1/32"'], [16, '1/16"'], [32 / 3, '3/32"'], [8, '1/8"'], [16 / 3, '3/16"'], [4, '1/4"']];
const NICE = [1, 2, 4, 8, 10, 16, 20, 32, 40, 50, 64, 80, 100, 160, 200, 400, 500, 1000];
const FONT = '"IBM Plex Mono", monospace', INK = '#1d1f22';
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// exp: { renderImage(w, h) -> canvas with transparent background, svgItems() -> export3d items, title(), fileStem() }
// Raster export, drawn in tiles of at most 2048 px: a single large WebGL canvas can be silently clamped by the browser or GPU,
// which crops or rescales the drawing. Pixel-width lines are widened by the output scale so the image looks like the screen.
// dot (stipple) fill for programme volumes: screen-space dot grid, so stacked volumes do not darken; DOTFILL.px = device px per CSS px (export: output px per screen px)
export const DOTFILL = { px: { value: 1 } };
export function dotMaterial(color, opacity) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.FrontSide });
  m.onBeforeCompile = sh => { sh.uniforms.uDotPx = DOTFILL.px; sh.fragmentShader = 'uniform float uDotPx;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
    '#include <dithering_fragment>\n  { vec2 q = gl_FragCoord.xy / uDotPx; float r = floor(q.y / 5.0); vec2 c = vec2(mod(q.x + mod(r, 2.0) * 2.5, 5.0), mod(q.y, 5.0)) - 2.5; if (dot(c, c) > 0.3) discard; }'); };
  m.customProgramCacheKey = () => 'dotfill'; m.userData.dots = true; return m;
}
export function renderTiled({ renderer, scene, camera, view, w, h, rect, lineMats = [], before = null, after = null }) {
  w = Math.min(w, 16384); h = Math.min(h, 16384);
  const vw = view.clientWidth, vh = view.clientHeight, pr = renderer.getPixelRatio(), k = w / rect.w, T = 2048;
  const out = document.createElement('canvas'); out.width = w; out.height = h; const ctx = out.getContext('2d');
  const lw = lineMats.map(m => m.linewidth), dpx = DOTFILL.px.value; DOTFILL.px.value = k; lineMats.forEach(m => { if (!m.worldUnits) m.linewidth *= k; });
  before?.(); const bg = scene.background; scene.background = null; renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
  for (let ty = 0; ty < h; ty += T) for (let tx = 0; tx < w; tx += T) {
    const tw = Math.min(T, w - tx), th = Math.min(T, h - ty);
    renderer.setSize(tw, th, false); lineMats.forEach(m => m.resolution.set(tw, th));
    camera.setViewOffset(vw, vh, rect.x + tx / k, rect.y + ty / k, tw / k, th / k);
    renderer.render(scene, camera); ctx.drawImage(renderer.domElement, 0, 0, tw, th, tx, ty, tw, th);
  }
  camera.clearViewOffset(); scene.background = bg; DOTFILL.px.value = dpx; lineMats.forEach((m, i) => m.linewidth = lw[i]);
  renderer.setPixelRatio(pr); renderer.setSize(vw, vh, false); renderer.domElement.style.width = vw + 'px'; renderer.domElement.style.height = vh + 'px'; after?.();
  return out;
}

export function viewTools({ view, ocam, pcam, controls, getCamera, setOrtho, getBox, key, exp }) {
  let ftPerIn = 0;   // 0 = free zoom
  try { ftPerIn = +JSON.parse(localStorage.getItem(key + '.scale')) || 0; } catch { }

  // ---- controls under the View buttons
  const grid = document.querySelector('#bProj').closest('.grid2');
  const row = document.createElement('div'); row.className = 'grid2'; row.style.marginTop = '6px';
  row.innerHTML = `<button class="btn" id="bCentre" title="Re-frame the model or the selected floor without changing the view direction">Centre view</button>`
    + `<select id="scaleSel" class="btn" title="Drawing scale for the orthographic view (zoom is locked while a scale is set)" style="padding:5px 6px">`
    + `<option value="0">Scale: free</option>${SCALES.map(([f, l]) => `<option value="${f}">${l} = 1'-0"</option>`).join('')}</select>`;
  grid.after(row);
  const sel = row.querySelector('#scaleSel'); sel.value = String(ftPerIn);
  if (sel.value !== String(ftPerIn)) { ftPerIn = 0; sel.value = '0'; }

  // ---- scale bar overlay (bottom left of the 3D view)
  const bar = document.createElement('div');
  bar.style.cssText = `position:absolute;left:12px;bottom:12px;z-index:5;pointer-events:none;font:500 11px ${FONT};color:${INK};background:rgba(255,255,255,0.85);border:1px solid #e2e2dc;border-radius:6px;padding:5px 8px`;
  view.appendChild(bar);

  const pxPerFt = (H = view.clientHeight) => H * ocam.zoom / (ocam.top - ocam.bottom) * M_PER_FT;   // ortho, image of height H
  const zoomFor = f => (CSS_DPI / (f * M_PER_FT)) * (ocam.top - ocam.bottom) / view.clientHeight;
  const scaleText = () => ftPerIn ? `${SCALES.find(s => s[0] === ftPerIn)?.[1]} = 1'-0"` : `1" ≈ ${fmtFt(CSS_DPI / pxPerFt())}`;
  const fmtFt = f => f >= 10 ? `${Math.round(f)}'` : `${f.toFixed(1)}'`;
  const barSpec = ppf => { const L = NICE.reduce((b, n) => (n * ppf <= 160 ? n : b), NICE[0]); return { L, px: L * ppf }; };
  // a scale bar only reads true in orthographic plan or elevation, not in an axonometric
  const _d = new THREE.Vector3();
  const measurable = () => { const cam = getCamera(); if (cam !== ocam) return false; cam.getWorldDirection(_d); return Math.max(Math.abs(_d.x), Math.abs(_d.y), Math.abs(_d.z)) > 0.999; };
  function drawBar() {
    if (!measurable()) { bar.style.display = 'none'; return; }
    const { L, px } = barSpec(pxPerFt());
    bar.style.display = '';
    bar.innerHTML = `<div style="margin-bottom:4px">${scaleText()}${ftPerIn ? '' : ' on screen'}</div><div style="width:${px}px;height:6px;border:1px solid ${INK};background:linear-gradient(90deg,${INK} 25%,#fff 25%,#fff 50%,${INK} 50%,${INK} 75%,#fff 75%)"></div><div style="display:flex;justify-content:space-between;width:${px + 14}px;margin-left:-4px;margin-top:2px"><span>0</span><span>${L / 2}'</span><span>${L}'</span></div>`;
  }

  function setScale(f) {
    ftPerIn = f; sel.value = String(f);
    try { localStorage.setItem(key + '.scale', JSON.stringify(f)); } catch { }
    if (f && getCamera() !== ocam) setOrtho(true);
    controls.enableZoom = !f;
  }
  sel.onchange = () => setScale(+sel.value);
  controls.enableZoom = !ftPerIn;

  // ---- Centre view: keep the direction, put the box in the middle and fit it (zoom stays at the drawing scale if one is set)
  function centre() {
    const cam = getCamera(), box = getBox(), c = box.getCenter(new THREE.Vector3());
    const dir = cam.position.clone().sub(controls.target).normalize(), dist = cam.position.distanceTo(controls.target);
    controls.target.copy(c); cam.position.copy(c).addScaledVector(dir, dist); cam.updateMatrixWorld(); controls.update();
    const inv = cam.matrixWorldInverse, p = new THREE.Vector3(); let mx = 0, my = 0;
    for (let i = 0; i < 8; i++) { p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv); mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y)); }
    if (cam === ocam) { if (!ftPerIn) { ocam.zoom = 0.9 * Math.min(ocam.right / mx, ocam.top / my); ocam.updateProjectionMatrix(); } }
    else {
      const t = Math.tan(THREE.MathUtils.degToRad(pcam.fov / 2)), need = Math.max(my / t, mx / (t * pcam.aspect)) / 0.9;
      const r = box.getSize(new THREE.Vector3()).length() / 2;
      cam.position.copy(c).addScaledVector(dir, need + r * 0.5); controls.update();
    }
  }
  row.querySelector('#bCentre').onclick = centre;

  // ---- per frame: hold the drawing scale, refresh the bar
  function tick() {
    if (ftPerIn && getCamera() !== ocam) setScale(0);   // perspective has no drawing scale
    if (ftPerIn) { const z = zoomFor(ftPerIn); if (Math.abs(ocam.zoom - z) > 1e-6) { ocam.zoom = z; ocam.updateProjectionMatrix(); } }
    drawBar();
  }

  // ================= export =================
  // legend entries: the checked layer rows that carry a swatch
  function legendEntries() {
    const aside = document.querySelector('main > aside');
    return [...aside.querySelectorAll('label.chk')].filter(l => { const c = l.querySelector('input[type=checkbox]'); return c && c.checked && !c.dataset.hgrp && !c.disabled && l.querySelector('.lg')?.firstElementChild; })
      .map(l => ({ name: l.querySelector('.nm')?.textContent.trim() || l.textContent.trim(), el: l.querySelector('.lg').firstElementChild }));
  }
  const isClear = c => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  function swatchSpec(el) {
    const r = el.getBoundingClientRect(), w = Math.max(r.width, 10), h = Math.max(r.height, 6);
    if (el.tagName.toLowerCase() === 'svg') { const s = el.cloneNode(true); s.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); s.removeAttribute('style'); return { svg: new XMLSerializer().serializeToString(s), w: +el.getAttribute('width') || w, h: +el.getAttribute('height') || h }; }
    const cs = getComputedStyle(el);
    if (el.classList.contains('ln')) return { line: true, color: cs.borderTopColor, lw: parseFloat(cs.borderTopWidth) || 2, dashed: cs.borderTopStyle === 'dashed', w, h: 10 };
    const grad = cs.backgroundImage && cs.backgroundImage !== 'none' ? (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []) : [];
    return { w, h, fill: isClear(cs.backgroundColor) ? null : cs.backgroundColor, grad, op: +cs.opacity || 1,
      outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? { c: cs.outlineColor, w: parseFloat(cs.outlineWidth) } : null,
      border: cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0 ? { c: cs.borderTopColor, w: parseFloat(cs.borderTopWidth) } : null,
      left: parseFloat(cs.borderLeftWidth) > parseFloat(cs.borderTopWidth) + 0.5 ? { c: cs.borderLeftColor, w: parseFloat(cs.borderLeftWidth) } : null };
  }
  const loadSvg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src); });

  // sheet layout: drawing title in a band above, legend in a column to the right, scale bar on the drawing (bottom left).
  // Bands are added around the drawing, so the drawing itself keeps its size and scale.
  function sheetLayout(W, H, o, k, ctx) {
    const th = o.title && o.titleText ? 40 * k : 0, E = o.legend ? legendEntries() : [];
    let lw = 0, cols = 0, rows = 0, colW = 0;
    if (E.length) {
      ctx.font = `500 ${11 * k}px ${FONT}`; const rh = 17 * k, sw = 24 * k;
      const maxRows = Math.max(4, Math.floor((H - 40 * k) / rh)); cols = Math.ceil(E.length / maxRows); rows = Math.ceil(E.length / cols);
      colW = Math.max(...E.map(e => ctx.measureText(e.name).width)) + sw + 22 * k; lw = cols * colW + 24 * k;
    }
    return { th, E, lw, cols, rows, colW, TW: W + lw, TH: H + th };
  }
  async function composeCanvas(base, o, k) {   // k = output px per screen px
    const W = base.width, H = base.height, meas = document.createElement('canvas').getContext('2d');
    const Ly = sheetLayout(W, H, o, k, meas);
    const out = document.createElement('canvas'); out.width = Math.round(Ly.TW); out.height = Math.round(Ly.TH);
    const x = out.getContext('2d'); x.drawImage(base, 0, Ly.th); x.textBaseline = 'middle';
    if (Ly.th) { x.fillStyle = INK; x.font = `600 ${15 * k}px ${FONT}`; x.fillText(o.titleText, 12 * k, Ly.th / 2); x.fillStyle = '#c9ccd1'; x.fillRect(0, Ly.th - k, Ly.TW, k); }
    if (Ly.E.length) {
      const X0 = W + 12 * k, Y0 = Ly.th + 12 * k, rh = 17 * k, sw = 24 * k, fs = 11 * k;
      x.fillStyle = '#c9ccd1'; x.fillRect(W, Ly.th, k, H);
      x.fillStyle = INK; x.font = `600 ${fs}px ${FONT}`; x.fillText('Legend', X0, Y0 + 4 * k); x.font = `500 ${fs}px ${FONT}`;
      for (let i = 0; i < Ly.E.length; i++) {
        const cx = X0 + Math.floor(i / Ly.rows) * Ly.colW, cy = Y0 + 18 * k + (i % Ly.rows) * rh;
        await drawSwatch(x, swatchSpec(Ly.E[i].el), cx, cy, sw, 11 * k, k);
        x.fillStyle = INK; x.fillText(Ly.E[i].name, cx + sw + 8 * k, cy + 5.5 * k);
      }
    }
    if (measurable()) {
      const ppf = pxPerFt() * k, { L } = barSpec(ppf / k), bw = L * ppf, X = 20 * k, Y = Ly.th + H - 42 * k;
      x.fillStyle = 'rgba(255,255,255,0.88)'; x.fillRect(12 * k, Y - 18 * k, bw + 34 * k, 52 * k);
      x.fillStyle = INK; x.font = `500 ${11 * k}px ${FONT}`; x.textBaseline = 'alphabetic'; x.fillText(scaleText(), X, Y - 4 * k);
      for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#fff' : INK; x.fillRect(X + i * bw / 4, Y + 2 * k, bw / 4, 6 * k); }
      x.strokeStyle = INK; x.lineWidth = k; x.strokeRect(X, Y + 2 * k, bw, 6 * k);
      x.fillStyle = INK; x.fillText('0', X - 3 * k, Y + 22 * k); x.fillText(`${L / 2}'`, X + bw / 2 - 6 * k, Y + 22 * k); x.fillText(`${L}'`, X + bw - 8 * k, Y + 22 * k);
    }
    return out;
  }
  async function drawSwatch(x, s, X, Y, w, h, k) {
    if (s.svg) { const im = await loadSvg(s.svg); if (im) x.drawImage(im, X, Y + h / 2 - s.h * k / 2, s.w * k, s.h * k); return; }
    if (s.line) { x.strokeStyle = s.color; x.lineWidth = s.lw * k; x.setLineDash(s.dashed ? [4 * k, 3 * k] : []); x.beginPath(); x.moveTo(X, Y + h / 2); x.lineTo(X + w * 0.8, Y + h / 2); x.stroke(); x.setLineDash([]); return; }
    const bw = Math.min(w, s.w * k), bh = Math.min(h, s.h * k), by = Y + (h - bh) / 2;
    x.globalAlpha = s.op;
    if (s.grad.length > 1) { const g = x.createLinearGradient(X, 0, X + bw, 0); s.grad.forEach((c, i) => g.addColorStop(i / (s.grad.length - 1), c)); x.fillStyle = g; x.fillRect(X, by, bw, bh); }
    else if (s.fill) { x.fillStyle = s.fill; x.fillRect(X, by, bw, bh); }
    if (s.border) { x.strokeStyle = s.border.c; x.lineWidth = s.border.w * k; x.strokeRect(X, by, bw, bh); }
    if (s.outline) { x.strokeStyle = s.outline.c; x.lineWidth = s.outline.w * k; x.strokeRect(X + s.outline.w * k / 2, by + s.outline.w * k / 2, bw - s.outline.w * k, bh - s.outline.w * k); }
    if (s.left) { x.fillStyle = s.left.c; x.fillRect(X, by, s.left.w * k, bh); }
    x.globalAlpha = 1;
  }

  // ---- extent of everything on the visible layers, in screen px of the current view (can reach past the viewport)
  function contentRect(items) {
    const W = view.clientWidth, H = view.clientHeight, cam = getCamera(); cam.updateMatrixWorld();
    const v = new THREE.Vector3(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, z) => { v.set(x, y, z).project(cam); if (v.z < -1 || v.z > 1) return null; const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); return [px, py]; };
    for (const it of items) {
      if (it.kind === 'mesh') for (let i = 0; i < it.v.length; i += 3) add(it.v[i], it.v[i + 1], it.v[i + 2]);
      else if (it.kind === 'line') it.pts.forEach(p => add(p[0], p[1], p[2]));
      else if (it.kind === 'text') { const q = add(it.p[0], it.p[1], it.p[2]); if (q) { x0 = Math.min(x0, q[0] - it.text.length * 6.5); y0 = Math.min(y0, q[1] - 14); } }
    }
    if (!isFinite(x0)) return { x: 0, y: 0, w: W, h: H };
    const pad = 24; x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad); x1 = Math.ceil(x1 + pad); y1 = Math.ceil(y1 + pad);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---- scaled SVG vector of the current view (orthographic views print true to scale at 100 %)
  function buildSVG(o, items, R) {
    const VW = view.clientWidth, VH = view.clientHeight, W = R.w, H = R.h, cam = getCamera(); cam.updateMatrixWorld();
    const v = new THREE.Vector3();
    const P = p => { v.set(p[0], p[1], p[2]).project(cam); return [(v.x + 1) / 2 * VW - R.x, (1 - v.y) / 2 * VH - R.y, v.z]; };
    const f = n => Math.round(n * 10) / 10, out = [], lines = [], texts = [];
    const meshes = [], pats = new Map();   // dot-fill patterns by colour, on one user-space grid so overlapping faces do not darken
    for (const it of items) {
      if (it.kind === 'mesh') {
        const pv = []; for (let i = 0; i < it.v.length; i += 3) pv.push(P([it.v[i], it.v[i + 1], it.v[i + 2]]));
        const groups = new Map(); let zsum = 0, zn = 0, znear = Infinity;
        for (let i = 0; i < it.f.length; i += 3) {
          const a = pv[it.f[i]]; let b = pv[it.f[i + 1]], c = pv[it.f[i + 2]];
          if ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]) < 0) [b, c] = [c, b];   // one winding on screen: with nonzero fill, a top and a bottom face no longer cancel into a hole
          if ([a, b, c].some(q => q[2] < -1 || q[2] > 1)) continue;
          if (Math.max(a[0], b[0], c[0]) < 0 || Math.min(a[0], b[0], c[0]) > W || Math.max(a[1], b[1], c[1]) < 0 || Math.min(a[1], b[1], c[1]) > H) continue;
          if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) < 0.04) continue;
          const col = it.vc ? '#' + new THREE.Color(it.vc[it.f[i] * 3], it.vc[it.f[i] * 3 + 1], it.vc[it.f[i] * 3 + 2]).getHexString() : it.col;
          let d = groups.get(col); if (!d) groups.set(col, d = []);
          d.push(`M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}L${f(c[0])} ${f(c[1])}Z`); zsum += a[2] + b[2] + c[2]; zn += 3; znear = Math.min(znear, a[2], b[2], c[2]);
        }
        const fill = c => { if (!it.dots) return c; const id = 'dot' + c.slice(1); if (!pats.has(id)) pats.set(id, `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.25" cy="1.25" r="0.55" fill="${c}"/><circle cx="3.75" cy="3.75" r="0.55" fill="${c}"/></pattern>`); return `url(#${id})`; };
        if (zn) meshes.push({ z: it.dots ? znear : zsum / zn, svg: `<g opacity="${f(it.op ?? 1) || 0.1}" data-layer="${esc(it.layer)}">${[...groups].map(([c, d]) => `<path fill="${fill(c)}" d="${d.join('')}"/>`).join('')}</g>` });
      } else if (it.kind === 'line') {
        if (it.look === 'triU' || it.look === 'triD') {   // vertical run of triangles pointing along the line
          const [a0, b0] = it.pts, L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]), n = Math.max(1, Math.round(L / 1.0)), pa = P(a0), pb = P(b0);   // same as the view: a 0.5 m triangle every 1 m (one arrow of gap)
          const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, s = Math.max(1.5, dl / n / 4);
          let d = '';
          for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, w = [a0[0] + (b0[0] - a0[0]) * t, a0[1] + (b0[1] - a0[1]) * t, a0[2] + (b0[2] - a0[2]) * t], q = P(w); if (q[2] < -1 || q[2] > 1) continue;
            d += `M${f(q[0] + ux * s)} ${f(q[1] + uy * s)}L${f(q[0] - ux * s - uy * s * 1.2)} ${f(q[1] - uy * s + ux * s * 1.2)}L${f(q[0] - ux * s + uy * s * 1.2)} ${f(q[1] - uy * s - ux * s * 1.2)}Z`; }
          if (d) lines.push(`<path fill="${it.col}" fill-opacity="${f(it.op ?? 1)}" data-layer="${esc(it.layer)}" d="${d}"/>`);
          continue;
        }
        const pts = it.pts.map(P).filter(q => q[2] >= -1 && q[2] <= 1); if (pts.length < 2) continue;
        const sw = it.look?.startsWith('dots') || it.wu ? 3 : Math.max(0.5, (it.lw || 1) * 0.75), dash = it.look === 'dots' ? ' stroke-dasharray="0 15" stroke-linecap="round"' : it.look === 'dots2' ? ' stroke-dasharray="0 5 0 10" stroke-linecap="round"' : it.dash === 2 ? ' stroke-dasharray="14 5"' : it.dash ? ' stroke-dasharray="6 4"' : '';
        lines.push(`<polyline fill="none" stroke="${it.col}" stroke-opacity="${f(it.op ?? 1)}" stroke-width="${f(sw)}"${dash} data-layer="${esc(it.layer)}" points="${pts.map(q => f(q[0]) + ',' + f(q[1])).join(' ')}"/>`);
      } else if (it.kind === 'text') {
        const q = P(it.p); if (q[2] < -1 || q[2] > 1 || q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > H) continue;
        if (it.off) { q[0] += it.off[0]; q[1] -= it.off[1]; }   // tag moved off the drawing (screen px, y up)
        if (it.along) {   // length label: on the line's midpoint, turned along it (slid / stepped off as in the view)
          const tw = it.text.length * 9 * 0.6, th2 = 11;
          texts.push(`<text transform="translate(${f(q[0])} ${f(q[1])}) rotate(${f(-(it.rot || 0) * 180 / Math.PI)})" x="${f((0.5 - it.ctr[0]) * tw)}" y="${f(it.ctr[1] * th2 - 2)}" text-anchor="middle" font-family='${FONT}' font-size="9" fill="${INK}" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(it.text)}</text>`); continue; }
        texts.push(`<text x="${f(q[0])}" y="${f(q[1])}" font-family='${FONT}' font-size="9" fill="${INK}" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(it.text)}</text>`);
      }
    }
    meshes.sort((a, b) => b.z - a.z); meshes.forEach(m => out.push(m.svg));
    const meas = document.createElement('canvas').getContext('2d'), Ly = sheetLayout(W, H, o, 1, meas), th = Ly.th, ov = [];
    const T = (x, y, t, fs = 11, wt = 500) => `<text x="${f(x)}" y="${f(y)}" font-family='${FONT}' font-size="${fs}" font-weight="${wt}" fill="${INK}" dominant-baseline="middle">${esc(t)}</text>`;
    if (th) ov.push(T(12, th / 2, o.titleText, 15, 600) + `<rect x="0" y="${th - 1}" width="${f(Ly.TW)}" height="1" fill="#c9ccd1"/>`);
    if (Ly.E.length) {
      const X0 = W + 12, Y0 = th + 12; let g = `<rect x="${W}" y="${th}" width="1" height="${H}" fill="#c9ccd1"/>` + T(X0, Y0 + 4, 'Legend', 11, 600);
      Ly.E.forEach((e, i) => { const cx = X0 + Math.floor(i / Ly.rows) * Ly.colW, cy = Y0 + 18 + (i % Ly.rows) * 17; g += svgSwatch(swatchSpec(e.el), cx, cy, 24, 11) + T(cx + 32, cy + 5.5, e.name); });
      ov.push(`<g data-name="legend">${g}</g>`);
    }
    if (measurable()) {
      const ppf = pxPerFt(), { L } = barSpec(ppf), bw = L * ppf, X = 20, Y = th + H - 42;
      let g = `<rect x="12" y="${f(Y - 18)}" width="${f(bw + 34)}" height="52" fill="#fff" fill-opacity="0.88"/><text x="${X}" y="${f(Y - 4)}" font-family='${FONT}' font-size="11" fill="${INK}">${esc(scaleText())}</text>`;
      for (let i = 0; i < 4; i++) g += `<rect x="${f(X + i * bw / 4)}" y="${f(Y + 2)}" width="${f(bw / 4)}" height="6" fill="${i % 2 ? '#fff' : INK}"/>`;
      g += `<rect x="${X}" y="${f(Y + 2)}" width="${f(bw)}" height="6" fill="none" stroke="${INK}" stroke-width="1"/>`
        + [['0', X - 3], [`${L / 2}'`, X + bw / 2 - 6], [`${L}'`, X + bw - 8]].map(([t, tx]) => `<text x="${f(tx)}" y="${f(Y + 22)}" font-family='${FONT}' font-size="11" fill="${INK}">${t}</text>`).join('');
      ov.push(`<g data-name="scale bar">${g}</g>`);
    }
    const scaled = measurable(), TW = Math.ceil(Ly.TW), TH = Math.ceil(Ly.TH);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${(TW / CSS_DPI).toFixed(3)}in" height="${(TH / CSS_DPI).toFixed(3)}in" viewBox="0 0 ${TW} ${TH}">`
      + `<desc>${esc(o.titleText || '')} · ${scaled ? scaleText() + ' when printed at 100 %' : 'not to scale (axonometric or perspective view)'}</desc>`
      + `<defs><clipPath id="vp"><rect width="${W}" height="${H}"/></clipPath>${[...pats.values()].join('')}</defs><g transform="translate(0 ${th})"><g clip-path="url(#vp)" data-name="drawing">${out.join('')}${lines.join('')}${texts.join('')}</g></g>${ov.join('')}</svg>`;
  }
  function svgSwatch(s, X, Y, w, h) {
    const f = n => Math.round(n * 10) / 10;
    if (s.svg) { const inner = s.svg.replace(/^<svg/, `<svg x="${f(X)}" y="${f(Y + h / 2 - s.h / 2)}"`); return inner; }
    if (s.line) return `<line x1="${f(X)}" y1="${f(Y + h / 2)}" x2="${f(X + w * 0.8)}" y2="${f(Y + h / 2)}" stroke="${s.color}" stroke-width="${s.lw}"${s.dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
    const bw = Math.min(w, s.w), bh = Math.min(h, s.h), by = Y + (h - bh) / 2; let g = '';
    if (s.grad.length > 1) { const id = 'g' + Math.random().toString(36).slice(2, 8); g += `<defs><linearGradient id="${id}">${s.grad.map((c, i) => `<stop offset="${i / (s.grad.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs><rect x="${f(X)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" fill="url(#${id})"/>`; }
    else if (s.fill) g += `<rect x="${f(X)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" fill="${s.fill}"/>`;
    if (s.border) g += `<rect x="${f(X)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" fill="none" stroke="${s.border.c}" stroke-width="${s.border.w}"/>`;
    if (s.outline) g += `<rect x="${f(X + s.outline.w / 2)}" y="${f(by + s.outline.w / 2)}" width="${f(bw - s.outline.w)}" height="${f(bh - s.outline.w)}" fill="none" stroke="${s.outline.c}" stroke-width="${s.outline.w}"/>`;
    if (s.left) g += `<rect x="${f(X)}" y="${f(by)}" width="${s.left.w}" height="${f(bh)}" fill="${s.left.c}"/>`;
    return `<g opacity="${s.op}">${g}</g>`;
  }

  // ---- export dialog: preview, legend / title checkboxes, file name
  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(20,22,25,0.45);display:none;align-items:center;justify-content:center';
  dlg.innerHTML = `<div style="background:var(--panel,#fff);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.25);width:min(920px,94vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid var(--line,#e2e2dc);display:flex;align-items:center;gap:10px"><b id="xTitle" style="font-size:13px"></b><span id="xInfo" style="color:var(--mute,#6b7078);font-size:12px"></span><span style="flex:1"></span><button class="btn" id="xClose">✕</button></div>
    <div style="flex:1;min-height:0;padding:12px 16px;display:flex;align-items:center;justify-content:center;background-color:#fff;background-image:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0"><img id="xPrev" style="max-width:100%;max-height:60vh;border:1px solid #d5d6d2"></div>
    <div style="padding:12px 16px;border-top:1px solid var(--line,#e2e2dc);display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;font-size:12px">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="xLeg" checked>Legend</label><span style="color:var(--mute,#6b7078)">Visible layers that have a swatch in the layer list</span>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="xTit" checked>Drawing title</label><input id="xTitText" style="font:inherit;padding:4px 6px;border:1px solid var(--line,#e2e2dc);border-radius:5px">
      <span>File name</span><input id="xFile" style="font:inherit;padding:4px 6px;border:1px solid var(--line,#e2e2dc);border-radius:5px">
    </div>
    <div style="padding:10px 16px;border-top:1px solid var(--line,#e2e2dc);display:flex;justify-content:flex-end;gap:8px"><button class="btn" id="xCancel">Cancel</button><button class="btn pri" id="xGo">Export</button></div></div>`;
  document.body.appendChild(dlg);
  const $x = s => dlg.querySelector(s);
  let job = null, prevUrl = null;
  const close = () => { dlg.style.display = 'none'; if (prevUrl) URL.revokeObjectURL(prevUrl); prevUrl = null; job = null; };
  $x('#xClose').onclick = close; $x('#xCancel').onclick = close;
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  const opts = () => ({ legend: $x('#xLeg').checked, title: $x('#xTit').checked, titleText: $x('#xTitText').value.trim() });
  async function preview() {
    if (!job) return; const o = opts(); let blob;
    if (job.kind === 'svg') blob = new Blob([buildSVG(o, job.items, job.rect)], { type: 'image/svg+xml' });
    else {   // the preview is the export itself, scaled down: one full-resolution render serves both
      job.base ||= exp.renderImage(job.w, job.h, job.rect);
      const full = await composeCanvas(job.base, o, job.k), s = Math.min(1, 1400 / Math.max(full.width, full.height)), c = document.createElement('canvas');
      c.width = Math.round(full.width * s); c.height = Math.round(full.height * s); const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(full, 0, 0, c.width, c.height);
      blob = await new Promise(r => c.toBlob(r, 'image/png'));
    }
    if (prevUrl) URL.revokeObjectURL(prevUrl); prevUrl = URL.createObjectURL(blob); $x('#xPrev').src = prevUrl;
  }
  ['#xLeg', '#xTit'].forEach(s => $x(s).onchange = preview);
  $x('#xTitText').oninput = () => { clearTimeout(preview.t); preview.t = setTimeout(preview, 300); };
  $x('#xGo').onclick = async () => {
    if (!job) return; const o = opts(), name = ($x('#xFile').value.trim() || exp.fileStem()).replace(/[\\/:*?"<>|]+/g, '_');
    let blob;
    if (job.kind === 'svg') blob = new Blob([buildSVG(o, job.items, job.rect)], { type: 'image/svg+xml' });
    else { const c = await composeCanvas(job.base ||= exp.renderImage(job.w, job.h, job.rect), o, job.k); blob = await new Promise(r => c.toBlob(r, 'image/png')); if (job.dpi) blob = await withDpi(blob, job.dpi); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + (job.kind === 'svg' ? '.svg' : '.png'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    close();
  };
  function openExport(kind) {
    const scaled = ftPerIn && getCamera() === ocam, items = exp.svgItems(), rect = contentRect(items);   // everything on the visible layers
    if (kind === 'svg') job = { kind, items, rect, k: 1, w: rect.w, h: rect.h };
    else {
      const dpi = kind === 'png8' ? 600 : 300, k = scaled ? dpi / CSS_DPI : (kind === 'png8' ? 7680 : 3840) / Math.max(rect.w, rect.h);
      job = { kind, items, rect, k, dpi: scaled ? dpi : 0, w: Math.round(rect.w * k), h: Math.round(rect.h * k) };
    }
    const meas = measurable();
    $x('#xTitle').textContent = kind === 'svg' ? 'Export scaled SVG' : `Export ${kind === 'png8' ? 'PNG 8K' : 'PNG 4K'}`;
    $x('#xInfo').textContent = kind === 'svg'
      ? `drawing ${(job.w / CSS_DPI).toFixed(2)} × ${(job.h / CSS_DPI).toFixed(2)} in · ${meas ? scaleText() + ' at 100 %' : 'not to scale in this view'} · transparent background`
      : `drawing ${job.w} × ${job.h} px${job.dpi ? ` · ${job.dpi} dpi · ${scaleText()}` : ''} · transparent background · title and legend are added as bands around the drawing`;
    $x('#xTitText').value = exp.title(); $x('#xFile').value = exp.fileStem() + (kind === 'svg' ? '' : job.dpi ? `_${job.dpi}dpi` : kind === 'png8' ? '_8K' : '_4K');
    dlg.style.display = 'flex'; preview();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.style.display !== 'none') close(); });

  return { tick, centre, openExport, scale: () => ftPerIn, scaleText };
}

// insert a pHYs chunk (pixels per metre) right after IHDR
async function withDpi(blob, dpi) {
  const a = new Uint8Array(await blob.arrayBuffer()), ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 8 + 25;   // signature + IHDR
  const out = new Uint8Array(a.length + 21); out.set(a.subarray(0, at)); out.set(chunk, at); out.set(a.subarray(at), at + 21);
  return new Blob([out], { type: 'image/png' });
}
let CRC = null;
function crc32(u) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff; for (const b of u) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
