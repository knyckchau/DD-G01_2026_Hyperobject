// DD-G01 HYPEROBJECT — Energy page (work in progress). For now it shows the slabs and programme as context;
// the energy checks will be added here as the page is defined.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATS } from './engine.js?v=20261013j'; // keep in step with APP_V in st.html
import { collect, toOBJ, to3dm } from './export3d.js?v=20261013j';

const P = window.PROJECT;
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const SS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const L = P.levels, roofIdx = L.length - 1;
const flName = i => i === -1 ? 'B1' : i === roofIdx ? 'RT' : 'L' + String(i + 1).padStart(2, '0');
let tab = 'sum', floorSel = -1, ortho = true, dark = false, selected = null;
let volOp = Math.min(0.3, Math.max(0.05, LS('en.volOp') ?? 0.15));

// ---------- three ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
  put('occ', me, vol.floor); me.userData.cat = vol.cat; me.userData.vol = vol; volMeshes.push(me);
}

// ---------- layer list ----------
const sw = c => `<span class="sw" style="background:${c}"></span>`;
const cats = [...new Set(P.volumes.map(v => v.cat))];
const row = (attr, label, on, swatch = '') => `<label class="chk"><input type="checkbox" ${attr} ${on ? 'checked' : ''}>${swatch}${label}</label>`;
$('#layers').innerHTML = `<button class="btn" id="bLayClear" style="width:100%;margin-bottom:8px">Clear selection</button>`
  + `<div class="tnode lgh">${groupHead('Context')}<div class="tkids">`
  + row('data-layer="slabs"', 'Slabs (261004)', 1, sw('#d9dbd6'))
  + row('data-layer="labels"', 'Floor labels', 1, '<i style="display:inline-block;width:18px;height:10px;background:#fff;border:1px solid #c9ccd1;border-left:3px solid #868e96;box-sizing:border-box;flex:none"></i>')
  + `<div class="tnode"><div class="trow"><span class="caret">▶</span>${row('data-layer="occ"', 'Programme volumes (261004)', 1)}</div><div class="tkids" hidden>${cats.map(c => row(`data-vcat="${c}"`, CATS[c]?.label || c, 1, sw(CATS[c]?.color || '#999'))).join('')}</div></div>`
  + `<div class="row" style="margin-left:34px"><label>Opacity</label><input type="range" id="volOp" min="0.05" max="0.3" step="0.01" value="${volOp}" style="width:100px"></div>`
  + `</div></div>`;
$$('#layers .lgh').forEach(wireLayerGroup); alignLayerRows($('#layers'));
document.addEventListener('click', e => { const c = e.target.closest('.caret'); if (!c || c.classList.contains('leaf')) return; const k = c.parentElement.nextElementSibling; k.hidden = !k.hidden; c.classList.toggle('open', !k.hidden); });
$('#bLayClear').onclick = () => { $$('#layers input[type=checkbox]').forEach(c => { if (!c.dataset.hgrp) c.checked = false; }); syncLayerGroups(); applyVis(); };
document.addEventListener('change', e => { if (e.target.closest('#layers')) { requestAnimationFrame(syncLayerGroups); applyVis(); } });
document.addEventListener('input', e => {
  if (e.target.id === 'volOp') { volOp = +e.target.value; SS('en.volOp', volOp); volMeshes.forEach(m => { if (m !== selected?.mesh) m.material.opacity = volOp; }); }
});

function applyVis() {
  const on = k => $(`[data-layer="${k}"]`)?.checked;
  const vc = Object.fromEntries($$('[data-vcat]').map(c => [c.dataset.vcat, c.checked]));
  const onFl = f => f == null || floorSel === -1 || f === floorSel;
  for (const o of root.children) {
    const k = o.userData.layer;
    if (k !== 'occ') o.visible = !!on(k) && onFl(o.userData.fl);
  }
  // programme categories
  (P.volMeshes || []).forEach((vm, i) => { const v = P.volumes.find(q => q.id === vm.id), m = volMeshes[i]; if (m && v) m.visible = !!on('occ') && onFl(v.floor) && vc[v.cat] !== false; });
  if (floorSel >= 0) { const z0 = L[floorSel].z - 0.05, z1 = (L[floorSel + 1]?.z ?? L[floorSel].z + 9) - 0.05; clipLo.constant = -z0; clipHi.constant = z1; }
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
  side('lgrip', '--lw', 'en.lw', 220, x => x, '--rw');
  side('rgrip', '--rw', 'en.rw', 300, x => innerWidth - x, '--lw');
}
function setView(v) {
  const dirs = { iso: [-1, -1.15, 0.85], iso2: [1.1, -1, 0.8], top: [0, -0.001, 1], front: [0, -1, 0.02], side: [1, 0, 0.02] };
  const d = new THREE.Vector3(...dirs[v]).normalize(); let tgt = center.clone(), zoom = 1;
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
$('#floorSel').innerHTML = '<option value="-1">All floors</option>' + L.map((l, i) => `<option value="${i}">${flName(i)} · +${l.z.toFixed(1)}</option>`).join('');
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
  const hit = ray.intersectObjects(volMeshes.filter(m => m.visible), false).find(h => CLIP.every(p => p.distanceToPoint(h.point) >= -0.01));
  select(hit ? hit.object : null, hit?.point);
});
function select(m, pt) {
  if (selected?.mesh) selected.mesh.material.opacity = volOp;
  selected = m ? { mesh: m, pt } : null;
  if (m) { m.material.opacity = Math.min(0.6, volOp * 3); tab = 'ins'; syncTabs(); }
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
const PLANNED = [
  ['LL97 carbon', 'Annual energy and EUI estimated from the MEP loads, against the Local Law 97 emissions limits by occupancy for 2024–2029 and 2030–2034.'],
  ['Lighting and plug loads', 'Lighting power density by space type against NYCECC / ASHRAE 90.1, plus plug and media loads.'],
  ['Envelope', 'Wall, roof and glazing performance and window-to-wall ratio against NYCECC. Needs envelope data that the model does not have yet.'],
  ['Solar exposure', 'Incident solar radiation by facade and floor. Needs the final envelope geometry.'],
];
// summary cards: grouped under text headings, the left bar colour is the status
const STL = { ok: 'OK', warn: 'Check', fail: 'Fails', info: 'Info' };
const stLegend = () => `<div class="row" style="gap:10px;font-size:11px;color:var(--mute);margin:0 0 8px">Bar colour = status ${Object.entries(STL).map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--ink)"><i style="display:inline-block;width:3px;height:12px;background:var(--${k})"></i>${l}</span>`).join('')}</div>`;
function renderPane() {
  const pane = $('#pane');
  if (tab === 'sum') {
    pane.innerHTML = stLegend() + `<h3 style="font-size:12px;margin:10px 0 6px">Status</h3><div class="kpis"><div class="kpi s-info" style="grid-column:1/-1"><b style="font-size:14px">Work in progress</b><small>The contents of this page are not decided yet. The model is shown as context.</small></div></div>
    <h3 style="font-size:12px;margin:6px 0">Candidate contents</h3>
    <table><tr><th>Topic</th><th>Scope</th></tr>${PLANNED.map(([t, d]) => `<tr><td style="vertical-align:top;white-space:nowrap">${t}</td><td style="white-space:normal;text-align:left;line-height:1.4">${d}</td></tr>`).join('')}</table>
    <div class="note">Click a programme volume in the model to inspect it.</div>`;
  } else {
    const v = selected?.mesh?.userData.vol;
    if (!v) { pane.innerHTML = '<p style="color:var(--mute)">Click a programme volume in the model.</p>'; return; }
    const kv = [['Space', CATS[v.cat]?.label || v.cat], ['Layer', v.layer], ['Floor', flName(v.floor)], ['Floor area', `${fmt(v.area)} m² · ${fmt(v.area * 10.7639)} ft²`], ['Height', `${fmt(v.zmax - v.zmin, 2)} m`], ['z range', `${fmt(v.zmin, 2)} → ${fmt(v.zmax, 2)} m`]];
    pane.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px"><span class="sw" style="background:${CATS[v.cat]?.color || '#999'}"></span> ${esc(CATS[v.cat]?.label || v.cat)}</h3><div class="kv">${kv.map(([k, x]) => `<div>${k}</div><div>${esc(x)}</div>`).join('')}</div><button class="btn" style="margin-top:12px" id="bDesel">Clear</button>`;
    $('#bDesel').onclick = () => select(null);
  }
}
function status() { $('#status').innerHTML = `Energy · work in progress · ${floorSel === -1 ? 'ALL' : flName(floorSel)}`; }

// ---------- exports ----------
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.opacity = 0, 2600); };
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
function download(name, data, type) { const b = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function exportPNG(w, h) {
  const max = renderer.capabilities.maxTextureSize; if (w > max) { h = Math.round(h * max / w); w = max; }
  const vw = view.clientWidth, vh = view.clientHeight, pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  if (camera === pcam) { pcam.aspect = w / h; pcam.updateProjectionMatrix(); } else { const hh = (ocam.top - ocam.bottom) / 2; ocam.left = -hh * w / h; ocam.right = hh * w / h; ocam.updateProjectionMatrix(); }
  scaleTags(vh); renderer.render(scene, camera);
  renderer.domElement.toBlob(b => download(`2GBX_Energy_${selName()}_${w}x${h}_${stamp()}.png`, b), 'image/png');
  renderer.setPixelRatio(pr); renderer.setSize(vw, vh, false); renderer.domElement.style.width = vw + 'px'; renderer.domElement.style.height = vh + 'px'; resize();
  toast(`PNG ${w}×${h} exported`);
}
const selName = () => floorSel === -1 ? 'ALL' : flName(floorSel);
$('#bPng').onclick = () => exportPNG(3840, 2160);
$('#bPng8').onclick = () => exportPNG(7680, 4320);
// Rhino / OBJ: what is visible now
const CTX = { slabs: 'Slabs 261004', labels: 'Floor labels' };
const visItems = () => collect([root], {
  layerOf: own => { const u = own.userData; return u.layer === 'occ' ? `Context::Programme volumes 261004::${CATS[u.cat]?.label || u.cat}` : CTX[u.layer] ? 'Context::' + CTX[u.layer] : null; },
  zRange: floorSel >= 0 ? [L[floorSel].z - 0.05, (L[floorSel + 1]?.z ?? L[floorSel].z + 9) - 0.05] : null,
});
$('#b3dm').onclick = async () => {
  toast('Loading rhino3dm…');
  try { const { bytes, n } = await to3dm(visItems()); download(`2GBX_Energy_${selName()}_${stamp()}.3dm`, new Blob([bytes], { type: 'application/octet-stream' })); toast(`Rhino .3dm exported · ${n} objects (metres)`); }
  catch (err) { console.error(err); toast('rhino3dm unavailable, exporting OBJ instead'); $('#bObj').click(); }
};
$('#bObj').onclick = () => {
  const base = `2GBX_Energy_${selName()}`, { obj, mtl } = toOBJ(visItems(), base, 'DD-G01 Hyperobject · Energy');
  download(base + '.obj', obj, 'text/plain'); setTimeout(() => download(base + '.mtl', mtl, 'text/plain'), 300); toast('OBJ + MTL exported (metres, Z up)');
};

// CSV / JSON: programme schedule (the energy figures will be added as the page is defined)
const volRows = () => P.volumes.map(v => ({ floor: flName(v.floor), space: CATS[v.cat]?.label || v.cat, layer: v.layer, area_m2: +v.area.toFixed(1), area_ft2: Math.round(v.area * 10.7639), height_m: +(v.zmax - v.zmin).toFixed(2), zmin_m: v.zmin, zmax_m: v.zmax }));
$('#bCsv').onclick = () => { const R = volRows(), H = Object.keys(R[0]); download(`2GBX_Energy_programme_${stamp()}.csv`, [H, ...R.map(r => H.map(k => r[k]))].map(r => r.map(v => `"${v}"`).join(',')).join('\n'), 'text/csv'); };
$('#bJson').onclick = () => download(`2GBX_Energy_${stamp()}.json`, JSON.stringify({ project: P.name, status: 'work in progress', units: 'm', programme: volRows() }, null, 1), 'application/json');

// ---------- go ----------
resize(); setProj(true); setView('iso'); applyVis(); renderPane();
// floor labels sit at the corner of the building that is left-most in the current view
const _lc = new THREE.Vector3();
function placeLabels(list) {
  let best = null, bx = Infinity;
  for (const [x, y] of [[bmin.x, bmin.y], [bmax.x, bmin.y], [bmax.x, bmax.y], [bmin.x, bmax.y]]) { _lc.set(x, y, center.z).project(camera); if (_lc.x < bx) { bx = _lc.x; best = [x, y]; } }
  const px = best[0] + Math.sign(best[0] - center.x) * 2, py = best[1] + Math.sign(best[1] - center.y) * 2;
  for (const s of list) { s.position.x = px; s.position.y = py; }
}
const labelSprites = root.children.filter(o => o.userData.layer === 'labels');
renderer.setAnimationLoop(() => { controls.update(); placeLabels(labelSprites); scaleTags(); renderer.render(scene, camera); });
