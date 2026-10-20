// DD-G01 HYPEROBJECT — Structure page. Shows the structure model (structure-data.js, written by tools/build_data.py
// from models/*structure*.fbx) against the current slabs and programme, layer by layer.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATS } from './engine.js?v=20261019c'; // keep in step with APP_V in st.html
import { viewTools, renderTiled } from './viewtools.js?v=20261019c';
import { collect, toOBJ, to3dm } from './export3d.js?v=20261019c';

const P = window.PROJECT;
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const SS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const L = P.levels, roofIdx = L.length - 1;
const flName = i => i === -1 ? 'B1' : i === roofIdx ? 'RT' : 'L' + String(i + 1).padStart(2, '0');
const STRCOL = n => /RC|concrete|slab-on-grade|RAMP|pre-cast/i.test(n) ? '#b5aea2' : /TRUSS|BRACING/i.test(n) ? '#d9480f' : /PILLAR/i.test(n) ? '#5c6f82' : '#8a9bb0';
let tab = 'sum', floorSel = -1, ortho = true, dark = false, selected = null, S = null;
let volOp = Math.min(0.3, Math.max(0.05, LS('st.volOp') ?? 0.07)), strOp = LS('st.strOp') ?? 0.85;

// ---------- three ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.localClippingEnabled = true; renderer.setPixelRatio(Math.min(2, devicePixelRatio)); view.prepend(renderer.domElement);
const scene = new THREE.Scene(), BG = { light: new THREE.Color('#f7f7f4'), dark: new THREE.Color('#15171a') }; scene.background = BG.light;
const pcam = new THREE.PerspectiveCamera(28, 1, 0.5, 3000), ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
let camera = ocam;
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.12;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(60, -80, 140); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-80, 60, 40); scene.add(fill);
const bmin = new THREE.Vector3(Infinity, Infinity, P.basementZ ?? L[0].z), bmax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
for (const l of L) for (const t of l.tris) for (let k = 0; k < 6; k += 2) { bmin.x = Math.min(bmin.x, t[k]); bmin.y = Math.min(bmin.y, t[k + 1]); bmax.x = Math.max(bmax.x, t[k]); bmax.y = Math.max(bmax.y, t[k + 1]); }
for (const v of P.volumes) bmax.z = Math.max(bmax.z, v.zmax);
const center = bmin.clone().add(bmax).multiplyScalar(0.5), radius = bmin.distanceTo(bmax) / 2;
const clipLo = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e4), clipHi = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4), CLIP = [clipLo, clipHi];
const root = new THREE.Group(); scene.add(root);
const put = (layer, o, fl = null) => { o.userData.layer = layer; o.userData.fl = fl; root.add(o); return o; };
function meshFrom(v, t) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(t); g.computeVertexNormals(); return g; }
function textSprite(txt) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), F = '600 30px IBM Plex Mono, monospace'; x.font = F; const w = Math.ceil(x.measureText(txt).width) + 22;
  c.width = w; c.height = 56; x.font = F; x.fillStyle = 'rgba(255,255,255,0.93)'; x.fillRect(0, 6, w, 44); x.fillStyle = '#868e96'; x.fillRect(0, 6, 6, 44); x.fillStyle = '#1d1f22'; x.fillText(txt, 12, 39);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.userData.text = txt; s.userData.px = 19; s.userData.asp = w / 56; s.center.set(1, 0); s.renderOrder = 10; return s;
}

// context: slabs, floor labels, programme
L.forEach((l, i) => {
  const v = [], t = []; for (const tr of l.tris) { const b = v.length / 3; v.push(tr[0], tr[1], l.z, tr[2], tr[3], l.z, tr[4], tr[5], l.z); t.push(b, b + 1, b + 2); }
  const g = meshFrom(v, t);
  put('slabs', new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd9dbd6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })), i);
  put('slabs', new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), new THREE.LineBasicMaterial({ color: 0x7c8189, transparent: true, opacity: 0.8 })), i);
  const s = textSprite(`${flName(i)} +${l.z.toFixed(1)}`); s.position.set(bmin.x - 2, bmax.y + 2, l.z + 0.3); put('labels', s, i);
});
const volMeshes = [];
for (const vm of P.volMeshes || []) {
  const vol = P.volumes.find(v => v.id === vm.id); if (!vol) continue;
  const col = CATS[vol.cat]?.color || '#999', g = meshFrom(vm.v, vm.t);
  const me = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: volOp, depthWrite: false, side: THREE.DoubleSide }));
  me.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 })));
  put('occ', me, vol.floor); me.userData.cat = vol.cat; volMeshes.push(me);
}

// structure model
const SL = P.structureLayers || [], SGRP = [...new Set(SL.map(l => l[0]))];
const strMeshes = [];
function loadStructure() {
  return new Promise(res => {
    if (window.STRUCTURE) return res(window.STRUCTURE);
    const sc = document.createElement('script'); sc.src = (window.DATA_DIR || '') + 'structure-data.js?v=' + (window.APP_V || '');
    sc.onload = () => res(window.STRUCTURE); sc.onerror = () => res(null); document.head.appendChild(sc);
  }).then(D => {
    if (!D) { S = { missing: true }; renderPane(); return; }
    const b64 = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
    const rows = [];
    for (const l of D.layers) {
      const q = b64(l.v, Int16Array), pos = new Float32Array(q.length), b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < q.length; i += 3) for (let k = 0; k < 3; k++) { const v = q[i + k] / 100 + D.origin[k]; pos[i + k] = v; b[k] = Math.min(b[k], v); b[k + 3] = Math.max(b[k + 3], v); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(b64(l.t, Uint32Array), 1)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: STRCOL(l.name), roughness: 0.7, metalness: 0.1, transparent: true, opacity: strOp, depthWrite: strOp > 0.95, side: THREE.DoubleSide, clippingPlanes: CLIP }));
      m.userData = { layer: 'str', grp: l.group, name: l.name, fl: null }; root.add(m); strMeshes.push(m);
      rows.push({ grp: l.group, name: l.name, nt: l.nt, nv: l.nv, b, col: STRCOL(l.name) });
    }
    S = { source: D.source, rows };
    applyVis(); renderPane();
  });
}

// ---------- layer list ----------
const sw = c => `<span class="sw" style="background:${c}"></span>`;
const cats = [...new Set(P.volumes.map(v => v.cat))];
const row = (attr, label, on, swatch = '') => `<label class="chk"><input type="checkbox" ${attr} ${on ? 'checked' : ''}>${swatch}${label}</label>`;
$('#layers').innerHTML = `<button class="btn" id="bLayClear" style="width:100%;margin-bottom:8px">Clear selection</button>`
  + `<div class="tnode lgh">${groupHead('Context')}<div class="tkids">`
  + row('data-layer="slabs"', 'Slabs (261004)', 1, sw('#d9dbd6'))
  + row('data-layer="labels"', 'Floor labels', 1, '<i style="display:inline-block;width:18px;height:10px;background:#fff;border:1px solid #c9ccd1;border-left:3px solid #868e96;box-sizing:border-box;flex:none"></i>')
  + `<div class="tnode"><div class="trow"><span class="caret">▶</span>${row('data-layer="occ"', 'Programme volumes (261004)', 0)}</div><div class="tkids" hidden>${cats.map(c => row(`data-vcat="${c}"`, CATS[c]?.label || c, 1, sw(CATS[c]?.color || '#999'))).join('')}</div></div>`
  + `<div class="row" style="margin-left:34px"><label>Opacity</label><input type="range" id="volOp" min="0.05" max="0.3" step="0.01" value="${volOp}" style="width:100px"></div>`
  + `</div></div>`
  + SGRP.map(gname => `<div class="tnode lgh">${groupHead(esc(gname))}<div class="tkids">${SL.filter(l => l[0] === gname).map(l => row(`data-slayer="${esc(gname + '|' + l[1])}"`, esc(l[1]), 1, sw(STRCOL(l[1])))).join('')}</div></div>`).join('')
  + `<div class="row" style="margin:8px 0 0 34px"><label>Structure opacity</label><input type="range" id="strOp" min="0.05" max="1" step="0.05" value="${strOp}" style="width:100px"></div>`;
$$('#layers .lgh').forEach(wireLayerGroup); alignLayerRows($('#layers'));
document.addEventListener('click', e => { const c = e.target.closest('.caret'); if (!c || c.classList.contains('leaf')) return; const k = c.parentElement.nextElementSibling; k.hidden = !k.hidden; c.classList.toggle('open', !k.hidden); });
$('#bLayClear').onclick = () => { $$('#layers input[type=checkbox]').forEach(c => { if (!c.dataset.hgrp) c.checked = false; }); syncLayerGroups(); applyVis(); };
document.addEventListener('change', e => { if (e.target.closest('#layers')) { requestAnimationFrame(syncLayerGroups); applyVis(); } });
document.addEventListener('input', e => {
  if (e.target.id === 'volOp') { volOp = +e.target.value; SS('st.volOp', volOp); volMeshes.forEach(m => m.material.opacity = volOp); }
  if (e.target.id === 'strOp') { strOp = +e.target.value; SS('st.strOp', strOp); strMeshes.forEach(m => { if (m !== selected?.mesh) { m.material.opacity = strOp; m.material.depthWrite = strOp > 0.95; } }); }
});

function applyVis() {
  const on = k => $(`[data-layer="${k}"]`)?.checked;
  const vc = Object.fromEntries($$('[data-vcat]').map(c => [c.dataset.vcat, c.checked])), sl = Object.fromEntries($$('[data-slayer]').map(c => [c.dataset.slayer, c.checked]));
  const onFl = f => f == null || floorSel === -1 || f === floorSel;   // B1 (-2): only the structure, clipped to the basement
  for (const o of root.children) {
    const k = o.userData.layer;
    if (k === 'str') o.visible = sl[o.userData.grp + '|' + o.userData.name] !== false;
    else if (k !== 'occ') o.visible = !!on(k) && onFl(o.userData.fl);
  }
  // programme categories
  (P.volMeshes || []).forEach((vm, i) => { const v = P.volumes.find(q => q.id === vm.id), m = volMeshes[i]; if (m && v) m.visible = !!on('occ') && onFl(v.floor) && vc[v.cat] !== false; });
  if (floorSel === -2) { clipLo.constant = -((P.basementZ ?? 0) - 1); clipHi.constant = L[0].z + 0.5; }
  else if (floorSel >= 0) { const z0 = L[floorSel].z - 0.05, z1 = (L[floorSel + 1]?.z ?? L[floorSel].z + 9) - 0.05; clipLo.constant = -z0; clipHi.constant = z1; }
  else { clipLo.constant = 1e4; clipHi.constant = 1e4; }
  status();
}

// ---------- camera, panels, picking ----------
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h); pcam.aspect = w / h; pcam.updateProjectionMatrix(); const s = radius * 1.1; ocam.left = -s * w / h; ocam.right = s * w / h; ocam.top = s; ocam.bottom = -s; ocam.updateProjectionMatrix(); }
addEventListener('resize', resize);
{
  const main = document.querySelector('main');
  const cur = v => parseFloat(getComputedStyle(main).getPropertyValue(v)) || (v === '--lw' ? 250 : 390);
  const side = (gripId, cssVar, key, min, widthFrom, otherVar) => {
    const grip = $('#' + gripId);
    const setW = w => { w = Math.round(Math.min(Math.max(w, min), Math.max(min, innerWidth - cur(otherVar) - 420))); main.style.setProperty(cssVar, w + 'px'); return w; };
    let w = LS(key); if (w) setW(w); let drag = false;
    grip.addEventListener('pointerdown', e => { drag = true; grip.classList.add('on'); document.body.classList.add('resizing'); grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', e => { if (!drag) return; w = setW(widthFrom(e.clientX)); resize(); });
    const end = () => { if (!drag) return; drag = false; grip.classList.remove('on'); document.body.classList.remove('resizing'); SS(key, w); resize(); };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    grip.addEventListener('dblclick', () => { main.style.removeProperty(cssVar); w = null; SS(key, null); resize(); });
  };
  side('lgrip', '--lw', 'st.lw', 220, x => x, '--rw');
  side('rgrip', '--rw', 'st.rw', 300, x => innerWidth - x, '--lw');
}
function setView(v) {
  const dirs = { iso: [-1, -1.15, 0.85], iso2: [1.1, -1, 0.8], top: [0, -0.001, 1], front: [0, -1, 0.02], side: [1, 0, 0.02] };
  const d = new THREE.Vector3(...dirs[v]).normalize(); let tgt = center.clone(), zoom = 1;
  if (floorSel === -2) tgt = new THREE.Vector3(center.x, center.y, P.basementZ ?? 0);   // underground structure spans the whole site: show it all
  if (floorSel >= 0) {
    const xs = [], ys = []; for (const t of L[floorSel].tris) for (let k = 0; k < 6; k += 2) { xs.push(t[k]); ys.push(t[k + 1]); }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), s = radius * 1.1, asp = view.clientWidth / view.clientHeight;
    tgt = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, L[floorSel].z); if (v === 'top') zoom = 0.82 * Math.min(2 * s * asp / (x1 - x0 + 1), 2 * s / (y1 - y0 + 1));
  }
  controls.target.copy(tgt); camera.position.copy(tgt).add(d.multiplyScalar(radius * 3.2));
  if (camera === ocam) { ocam.zoom = zoom; ocam.updateProjectionMatrix(); } controls.update();
  markView(v);
}
// the active view button stays highlighted until the camera is rotated away from that direction
let viewDir = null;
function markView(v) { $$('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v)); viewDir = v ? camera.position.clone().sub(controls.target).normalize() : null; }
controls.addEventListener('change', () => { if (viewDir && camera.position.clone().sub(controls.target).normalize().dot(viewDir) < 0.9995) markView(null); });

function setProj(o) { ortho = o; const p = camera.position.clone(), t = controls.target.clone(); camera = o ? ocam : pcam; camera.position.copy(p); controls.object = camera; controls.target.copy(t); controls.update(); $('#bProj').textContent = o ? 'Ortho' : 'Perspective'; $('#bProj').classList.add('on'); }
$('#floorSel').innerHTML = '<option value="-1">All floors</option><option value="-2">B1 · basement</option>' + L.map((l, i) => `<option value="${i}">${flName(i)} · +${l.z.toFixed(1)}</option>`).join('');
$('#floorSel').onchange = e => { floorSel = +e.target.value; applyVis(); setView(floorSel === -1 ? 'iso' : 'top'); };
$$('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
$('#bProj').onclick = () => setProj(!ortho);
$('#bFit').onclick = () => setView('iso');
$('#bBg').onclick = () => { dark = !dark; scene.background = dark ? BG.dark : BG.light; $('#bBg').textContent = dark ? 'Light bg' : 'Dark bg'; };
const ray = new THREE.Raycaster(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const hit = ray.intersectObjects(strMeshes.filter(m => m.visible), false).find(h => CLIP.every(p => p.distanceToPoint(h.point) >= -0.01));
  select(hit ? hit.object : null, hit?.point);
});
function select(m, pt) {
  if (selected?.mesh) { selected.mesh.material.emissive.set(0x000000); selected.mesh.material.opacity = strOp; }
  selected = m ? { mesh: m, pt } : null;
  if (m) { m.material.emissive.set(0x5c4a00); m.material.opacity = Math.max(strOp, 0.95); tab = 'ins'; syncTabs(); }
  renderPane();
}
// sprites keep a constant on-screen size
const _v = new THREE.Vector3();
function scaleTags(H = view.clientHeight) {
  const wppO = (ocam.top - ocam.bottom) / ocam.zoom / H, k = 2 * Math.tan(THREE.MathUtils.degToRad(pcam.fov / 2)) / H;
  for (const o of root.children) if (o.isSprite && o.visible) { const h = o.userData.px * (camera === ocam ? wppO : o.getWorldPosition(_v).distanceTo(camera.position) * k); o.scale.set(h * o.userData.asp, h, 1); }
}

// ---------- right panel ----------
function syncTabs() { $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); }
$('#tabs').onclick = e => { if (e.target.dataset.t) { tab = e.target.dataset.t; syncTabs(); renderPane(); } };
const dims = b => `${fmt(b[3] - b[0], 1)} × ${fmt(b[4] - b[1], 1)} m`;
// summary cards: grouped under text headings, the left bar colour is the status
const STL = { ok: 'OK', warn: 'Check', fail: 'Fails', info: 'Info' };
const stLegend = () => `<div class="row" style="gap:10px;font-size:11px;color:var(--mute);margin:0 0 8px">Bar colour = status ${Object.entries(STL).map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--ink)"><i style="display:inline-block;width:3px;height:12px;background:var(--${k})"></i>${l}</span>`).join('')}</div>`;
function renderPane() {
  const pane = $('#pane');
  if (!S) { pane.innerHTML = '<p style="color:var(--mute)">Loading the structure model…</p>'; return; }
  if (S.missing) { pane.innerHTML = '<p style="color:var(--mute)">structure-data.js not found. Put a *structure*.fbx in models/ and run python tools/build_data.py.</p>'; return; }
  const rows = S.rows, tri = rows.reduce((a, r) => a + r.nt, 0);
  const B = rows.reduce((b, r) => [0, 1, 2].map(k => Math.min(b[k], r.b[k])).concat([3, 4, 5].map(k => Math.max(b[k], r.b[k]))), [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  if (tab === 'sum') {
    const grp = SGRP.map(g => ({ g, n: rows.filter(r => r.grp === g).length, nt: rows.filter(r => r.grp === g).reduce((a, r) => a + r.nt, 0) }));
    pane.innerHTML = stLegend() + `<h3 style="font-size:12px;margin:10px 0 6px">Structure model</h3><div class="kpis">
      <div class="kpi s-info"><b>${SGRP.length}</b><small>FBX groups</small></div><div class="kpi s-info"><b>${rows.length}</b><small>Layers</small></div>
      <div class="kpi s-info"><b>${fmt(tri)}</b><small>Triangles</small></div><div class="kpi s-info"><b>${fmt(B[5] - B[2], 1)} m</b><small>Height ${fmt(B[2], 1)} → ${fmt(B[5], 1)} m</small></div></div>
      <h3 style="font-size:12px;margin:10px 0 6px">Source</h3><div class="kpis"><div class="kpi s-warn" style="grid-column:1/-1"><b style="font-size:14px">${esc(S.source)}</b><small>Source model · plan extent ${dims(B)} · older than the 261004 models, check alignment</small></div></div>
    <h3 style="font-size:12px;margin:6px 0">Groups</h3>
    <table><tr><th>Group</th><th>Layers</th><th>Triangles</th></tr>${grp.map(x => `<tr><td>${esc(x.g)}</td><td>${x.n}</td><td>${fmt(x.nt)}</td></tr>`).join('')}</table>
    <div class="note">The structure model (${esc(S.source)}) predates the 261004 programme and core models, so check alignment before reading it against slabs, cores or shafts. Turn on Programme volumes under Context to compare. Click a member in the model to inspect its layer.</div>`;
  } else if (tab === 'lay') {
    pane.innerHTML = `<table><thead><tr><th>Layer</th><th>Group</th><th>Triangles</th><th>z (m)</th><th>Plan</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-i="${i}"><td><span class="sw" style="background:${r.col}"></span> ${esc(r.name)}</td><td>${esc(r.grp)}</td><td>${fmt(r.nt)}</td><td>${fmt(r.b[2], 1)} → ${fmt(r.b[5], 1)}</td><td>${dims(r.b)}</td></tr>`).join('')}</tbody></table>`;
    pane.querySelectorAll('tr[data-i]').forEach(t => t.onclick = () => select(strMeshes[+t.dataset.i]));
  } else {
    const m = selected?.mesh;
    if (!m) { pane.innerHTML = '<p style="color:var(--mute)">Click a structural member in the model, or a row in the Layers tab.</p>'; return; }
    const r = rows[strMeshes.indexOf(m)], p = selected.pt;
    const kv = [['Layer', r.name], ['Group', r.grp], ['Triangles', fmt(r.nt)], ['Vertices', fmt(r.nv)], ['z range', `${fmt(r.b[2], 2)} → ${fmt(r.b[5], 2)} m`], ['Plan extent', dims(r.b)], ['Source', S.source]];
    if (p) kv.push(['Picked point', `${fmt(p.x, 2)}, ${fmt(p.y, 2)}, ${fmt(p.z, 2)}`]);
    pane.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px"><span class="sw" style="background:${r.col}"></span> ${esc(r.name)}</h3><div class="kv">${kv.map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div><button class="btn" style="margin-top:12px" id="bDesel">Clear</button>`;
    $('#bDesel').onclick = () => select(null);
  }
}
function status() { $('#status').innerHTML = S?.rows ? `<b style="color:var(--ink)">${S.rows.length}</b> structure layers · ${esc(S.source)} · ${selName()}` : 'Loading structure…'; }

// ---------- exports ----------
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.opacity = 0, 2600); };
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
function download(name, data, type) { const b = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
// renders rect (screen px of the view, may reach beyond it) at w × h with a transparent background (export dialog)
function renderImage(w, h, rect) { return renderTiled({ renderer, scene, camera, view, w, h, rect, lineMats: [], before: () => scaleTags(view.clientHeight), after: resize }); }
const selName = () => floorSel === -1 ? 'ALL' : floorSel === -2 ? 'B1' : flName(floorSel);
$('#bPng').onclick = () => VT.openExport('png4');
$('#bSvg').onclick = () => VT.openExport('svg');
$('#bPng8').onclick = () => VT.openExport('png8');
// Rhino / OBJ: what is visible now; structure keeps its FBX group and layer, context goes under Context
const CTX = { slabs: 'Slabs 261004', labels: 'Floor labels' };
const visItems = () => collect([root], {
  layerOf: own => { const u = own.userData; return u.layer === 'str' ? `Structure::${u.grp}::${u.name}` : u.layer === 'occ' ? `Context::Programme volumes 261004::${CATS[u.cat]?.label || u.cat}` : CTX[u.layer] ? 'Context::' + CTX[u.layer] : null; },
  zRange: floorSel >= 0 ? [L[floorSel].z - 0.05, (L[floorSel + 1]?.z ?? L[floorSel].z + 9) - 0.05] : floorSel === -2 ? [(P.basementZ ?? 0) - 1, L[0].z + 0.5] : null,
});
$('#b3dm').onclick = async () => {
  toast('Loading rhino3dm…');
  try { const { bytes, n } = await to3dm(visItems()); download(`2GBX_Structure_${selName()}_${stamp()}.3dm`, new Blob([bytes], { type: 'application/octet-stream' })); toast(`Rhino .3dm exported · ${n} objects (metres)`); }
  catch (err) { console.error(err); toast('rhino3dm unavailable, exporting OBJ instead'); $('#bObj').click(); }
};
$('#bObj').onclick = () => {
  const base = `2GBX_Structure_${selName()}`, { obj, mtl } = toOBJ(visItems(), base, 'DD-G01 Hyperobject · Structure');
  download(base + '.obj', obj, 'text/plain'); setTimeout(() => download(base + '.mtl', mtl, 'text/plain'), 300); toast('OBJ + MTL exported (metres, Z up)');
};
$('#bJson').onclick = () => { if (!S?.rows) return; download(`2GBX_Structure_${stamp()}.json`, JSON.stringify({ project: P.name, units: 'm', source: S.source, groups: SGRP, layers: S.rows.map(r => ({ group: r.grp, layer: r.name, triangles: r.nt, vertices: r.nv, colour: r.col, bbox_m: { min: r.b.slice(0, 3), max: r.b.slice(3) } })) }, null, 1), 'application/json'); };
$('#bCsv').onclick = () => { if (!S?.rows) return; download(`2GBX_Structure_layers_${stamp()}.csv`, [['group', 'layer', 'triangles', 'vertices', 'zmin_m', 'zmax_m', 'xsize_m', 'ysize_m'], ...S.rows.map(r => [r.grp, r.name, r.nt, r.nv, r.b[2].toFixed(2), r.b[5].toFixed(2), (r.b[3] - r.b[0]).toFixed(2), (r.b[4] - r.b[1]).toFixed(2)])].map(r => r.map(v => `"${v}"`).join(',')).join('\n'), 'text/csv'); };

// ---------- go ----------
resize(); setProj(true); setView('iso'); applyVis(); renderPane(); loadStructure();
// floor labels sit at the corner of the building that is left-most in the current view
const _lc = new THREE.Vector3();
function placeLabels(list) {
  let best = null, bx = Infinity;
  for (const [x, y] of [[bmin.x, bmin.y], [bmax.x, bmin.y], [bmax.x, bmax.y], [bmin.x, bmax.y]]) { _lc.set(x, y, center.z).project(camera); if (_lc.x < bx) { bx = _lc.x; best = [x, y]; } }
  const px = best[0] + Math.sign(best[0] - center.x) * 2, py = best[1] + Math.sign(best[1] - center.y) * 2;
  for (const s of list) { s.position.x = px; s.position.y = py; }
}
const labelSprites = root.children.filter(o => o.userData.layer === 'labels');
const plateBox = (tris, z0, z1) => { const b = new THREE.Box3(); for (const t of tris) for (let k = 0; k < 6; k += 2) { b.expandByPoint(new THREE.Vector3(t[k], t[k + 1], z0)); b.expandByPoint(new THREE.Vector3(t[k], t[k + 1], z1)); } return b; };
// Centre + drawing scale under the View buttons
const VT = viewTools({ exp: { renderImage, svgItems: () => visItems(), fileStem: () => `2GBX_Structure_${selName()}_${stamp()}`, title: () => `DD-G01 HYPEROBJECT · Structure · ${selName() === 'ALL' ? 'All floors' : selName()}${VT.scale() && camera === ocam ? ' · ' + VT.scaleText() : ''}` }, view, ocam, pcam, controls, getCamera: () => camera, setOrtho: o => setProj(o), key: 'st', getBox: () => { if (floorSel >= 0) return plateBox(L[floorSel].tris, L[floorSel].z, L[floorSel + 1]?.z ?? L[floorSel].z + 9); if (floorSel === -2) return new THREE.Box3(new THREE.Vector3(bmin.x, bmin.y, (P.basementZ ?? 0) - 1), new THREE.Vector3(bmax.x, bmax.y, L[0].z)); return new THREE.Box3(bmin.clone(), bmax.clone()); } });
renderer.setAnimationLoop(() => { controls.update(); VT.tick(); placeLabels(labelSprites); scaleTags(); renderer.render(scene, camera); });
