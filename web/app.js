import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generate, DEFAULTS, CATS, MISSING, IN, M2FT2 } from './engine.js?v=20261013g'; // keep in step with APP_V in index.html

const P = window.PROJECT;
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

// ---------- state ----------
const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const SS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
let A = { ...DEFAULTS, ...(LS('mep.A') || {}) };
let C = JSON.parse(JSON.stringify(CATS)); const savedC = LS('mep.C'); if (savedC) for (const k in savedC) Object.assign(C[k] ||= {}, savedC[k]);
let model = null, selected = null, tab = 'sum', floorSel = -1, explode = 0, ortho = true, dark = false;

// ---------- colors ----------
const COL = {
  'Supply air': '#2f6fed', 'Return air': '#d63fb7', 'Outdoor air': '#82c91e', 'Exhaust air': '#f08c00', 'Chilled water': '#15aabf', 'Heating hot water': '#e8384f',
  'Air handling unit': '#748ffc', 'Diffuser': '#91a7ff', 'Chiller / heat-recovery chiller': '#3bc9db', 'Air-to-water heat pump': '#ff8787', 'DOAS with energy recovery': '#94d82d', 'Central AHU': '#748ffc', 'Pump': '#66d9e8',
  'Domestic cold water': '#0ca678', 'Domestic hot water': '#fa5252', 'Sanitary': '#8d6e63', 'Vent': '#adb5bd', 'Storm': '#7048e8', 'Restroom core': '#63e6be', 'Domestic booster pump': '#20c997', 'Water heater': '#ff8787',
  'Cable tray': '#fab005', 'Busway riser': '#f59f00', 'Emergency feeder': '#d9480f', 'Panelboards': '#ffd43b', 'Service feeders': '#f59f00', 'Main switchboard': '#fcc419', 'Utility transformer vault': '#e8b04a', 'Emergency/standby generator': '#fd7e14',
  'Sprinkler main': '#e03131', 'Sprinkler branch': '#ff8787', 'Sprinkler head': '#c92a2a', 'Standpipe': '#a61e4d', 'Fire service': '#e03131', 'Fire pump': '#f03e3e',
  'Shaft': '#868e96', 'Projector': '#e64980', 'AV rack': '#862e9c',
};
const LEGEND = [['Supply air', 'Supply'], ['Return air', 'Return'], ['Outdoor air', 'Outdoor air'], ['Exhaust air', 'Exhaust'], ['Chilled water', 'CHW'], ['Heating hot water', 'HHW'],
  ['Domestic cold water', 'DCW'], ['Domestic hot water', 'DHW'], ['Sanitary', 'Sanitary'], ['Vent', 'Vent'], ['Storm', 'Storm'], ['Cable tray', 'Tray / busway'], ['Emergency feeder', 'Emergency'], ['Sprinkler main', 'Sprinkler'], ['Standpipe', 'Standpipe'], ['Projector', 'Projector / AV']];
// legend lives in the layer list: each system checkbox gets its colour key underneath (collapsible)
{
  // each row switches one kind of run; grouped kinds share a row (the key of the first one sets the colour)
  const SYSLEG = {
    HVAC: [['Supply air', 'Supply'], ['Return air', 'Return'], ['Outdoor air', 'Outdoor air'], ['Exhaust air', 'Exhaust'], ['Chilled water', 'CHW'], ['Heating hot water', 'HHW'], ['Diffuser', 'Diffusers']],
    Plumbing: [['Domestic cold water', 'DCW'], ['Domestic hot water', 'DHW'], ['Sanitary', 'Sanitary'], ['Vent', 'Vent'], ['Storm', 'Storm']],
    Electrical: [['Cable tray|Busway riser', 'Tray / busway'], ['Emergency feeder', 'Emergency']],
    Fire: [['Sprinkler main|Sprinkler branch', 'Sprinkler pipe'], ['Sprinkler head', 'Sprinkler heads'], ['Standpipe', 'Standpipe']],
    AV: [['Projector|AV rack', 'Projector / AV']],
  };
  for (const [sys, items] of Object.entries(SYSLEG)) {
    const lab = document.querySelector(`[data-sys="${sys}"]`)?.closest('label'); if (!lab) continue;
    lab.querySelector(':scope > .sw')?.remove();   // a system has several colours: its key is the list underneath, not one swatch
    if (items.length === 1) { const k = items[0][0].split('|')[0]; lab.querySelector('input').insertAdjacentHTML('afterend', `<span class="sw" style="background:${COL[k]}"></span>`); continue; }   // one kind: a plain row, no sub-list
    const node = document.createElement('div'); node.className = 'tnode';
    node.innerHTML = `<div class="trow"><span class="caret open">▶</span></div><div class="tkids">${items.map(([k, l]) => `<label class="chk"><input type="checkbox" data-sub="${k}" checked><span class="sw" style="background:${COL[k.split('|')[0]]}"></span>${l}</label>`).join('')}</div>`;
    lab.replaceWith(node); node.querySelector('.trow').appendChild(lab); lab.style.flex = '1';
  }
  // the two stand-alone rows now live under their systems
  document.querySelectorAll('aside > .sec > label > [data-sub="Diffuser"], aside > .sec > label > [data-sub="Sprinkler head"]').forEach(c => c.closest('label').remove());
  $('#legend').style.display = 'none';
}

// ---------- three setup ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const BG = { light: new THREE.Color('#f7f7f4'), dark: new THREE.Color('#15171a') };
scene.background = BG.light;
const pcam = new THREE.PerspectiveCamera(28, 1, 0.5, 3000);
const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
let camera = ocam;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.12;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(60, -80, 140); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-80, 60, 40); scene.add(fill);

// bounds
const bmin = new THREE.Vector3(Infinity, Infinity, P.basementZ ?? P.levels[0].z), bmax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
for (const l of P.levels) for (const t of l.tris) for (let k = 0; k < 6; k += 2) { bmin.x = Math.min(bmin.x, t[k]); bmin.y = Math.min(bmin.y, t[k + 1]); bmax.x = Math.max(bmax.x, t[k]); bmax.y = Math.max(bmax.y, t[k + 1]); }
for (const v of P.volumes) bmax.z = Math.max(bmax.z, v.zmax);
const center = bmin.clone().add(bmax).multiplyScalar(0.5), radius = bmin.distanceTo(bmax) / 2;

// groups
const root = new THREE.Group(); scene.add(root);
const shellG = new THREE.Group(); root.add(shellG);
const floorG = P.levels.map(() => { const g = new THREE.Group(); root.add(g); return g; });
const ctx = P.levels.map(() => ({ slab: new THREE.Group(), prog: new THREE.Group(), label: null }));
const mepG = P.levels.map(() => { const g = new THREE.Group(); return g; });
floorG.forEach((g, i) => { g.add(ctx[i].slab, ctx[i].prog, mepG[i]); });

function meshFrom(v, t) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(t); g.computeVertexNormals(); return g; }
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xbfc3c8, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x9a9fa6, transparent: true, opacity: 0.55 });
const slabMat = new THREE.MeshBasicMaterial({ color: 0xd9dbd6, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const slabEdge = new THREE.LineBasicMaterial({ color: 0x7c8189, transparent: true, opacity: 0.8 });
for (const m of P.shell) { const g = meshFrom(m.v, m.t); shellG.add(new THREE.Mesh(g, ghostMat)); shellG.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat)); }
const clipLo = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e4), clipHi = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4);
// cores, shafts and basement technical rooms from the model (context)
const ctxG = new THREE.Group(); root.add(ctxG);
const CTXCOL = { CORES: 0x495057, shaft: 0x2f9e44, RESTROOM: 0x7950f2, technical_room_availability_basement: 0xe8b04a };
for (const m of P.context || []) {
  const g = meshFrom(m.v, m.t), c = CTXCOL[m.layer] ?? 0x888888;
  ctxG.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: m.layer === 'technical_room_availability_basement' ? 0.18 : 0.05, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [clipLo, clipHi] })));
  ctxG.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.55, clippingPlanes: [clipLo, clipHi] })));
}
// detailed cores + restrooms (261004_core_restroom_mod.fbx) — loaded lazily, floor filter by clipping planes
const detG = new THREE.Group(); root.add(detG);
const DETCOL = { '00_WALLS': '#c9ccd1', '01_STAIRS': '#dfe2e6', '02_PASSENGER_ELEVATORS': '#5c636e', '03_FREIGHT_ELEVATOR': '#3d434c', '04_LOBBY_AREAS': '#eef0f2', FLOOR: '#e7e3f6', WALL: '#c8c0e8', PARTITION: '#9c8fd6', DOOR: '#d8d2c4', FIXTURE: '#ffffff', GRAB_BAR: '#868e96', RISER: '#0ca678' };
const GHOST = new Set(['00_WALLS', 'WALL', 'PARTITION', 'DOOR', '04_LOBBY_AREAS', '02_PASSENGER_ELEVATORS', '03_FREIGHT_ELEVATOR']);
let wallOp = 0.1;
$('#wallOp').oninput = e => { wallOp = +e.target.value; detG.children.forEach(m => { if (m.userData.ghost) m.material.opacity = wallOp; }); };
function loadDetail() {
  return new Promise(res => {
    if (window.DETAIL) return res(window.DETAIL);
    const sc = document.createElement('script'); sc.src = (window.DATA_DIR || '') + 'detail-data.js?v=' + (window.APP_V || ''); sc.onload = () => res(window.DETAIL); sc.onerror = () => res(null); document.head.appendChild(sc);
  }).then(D => {
    if (!D) return;
    const b64 = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
    for (const l of D.layers) {
      const q = b64(l.v, Int16Array), pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i += 3) { pos[i] = q[i] / 100 + D.origin[0]; pos[i + 1] = q[i + 1] / 100 + D.origin[1]; pos[i + 2] = q[i + 2] / 100 + D.origin[2]; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(b64(l.t, Uint32Array), 1)); g.computeVertexNormals();
      const ghost = GHOST.has(l.name);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: DETCOL[l.name] || '#cccccc', roughness: 0.8, transparent: true, opacity: ghost ? wallOp : l.name === '01_STAIRS' ? 0.6 : 1, depthWrite: !ghost, side: THREE.DoubleSide, clippingPlanes: [clipLo, clipHi] }));
      m.name = l.name; m.userData.ghost = ghost; detG.add(m);
      if (ghost && l.name !== '04_LOBBY_AREAS') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x6c727a, transparent: true, opacity: 0.35, clippingPlanes: [clipLo, clipHi] })); e.userData.ghostEdge = true; detG.add(e); }
    }
    applyVis();
  });
}
P.levels.forEach((l, i) => {
  const v = [], t = []; for (const tr of l.tris) { const b = v.length / 3; v.push(tr[0], tr[1], l.z, tr[2], tr[3], l.z, tr[4], tr[5], l.z); t.push(b, b + 1, b + 2); }
  const g = meshFrom(v, t); ctx[i].slab.add(new THREE.Mesh(g, slabMat)); ctx[i].slab.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), slabEdge));
});
const volObjs = []; let volOp = 0.07;
for (const vm of P.volMeshes) {
  const vol = P.volumes.find(v => v.id === vm.id); if (!vol) continue;
  const g = meshFrom(vm.v, vm.t);
  const mat = new THREE.MeshBasicMaterial({ color: C[vol.cat].color, transparent: true, opacity: volOp, depthWrite: false, side: THREE.DoubleSide });
  const me = new THREE.Mesh(g, mat); me.userData.vol = vol;
  const ed = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: C[vol.cat].color, transparent: true, opacity: 0.7 }));
  me.add(ed); ctx[vol.floor].prog.add(me); volObjs.push(me);
}
// ---------- collapsible layer trees (Rhino-style) ----------
function treeHTML(n) {
  const kids = n.kids && n.kids.length;
  return `<div class="tnode"><div class="trow"><span class="caret ${kids ? '' : 'leaf'}">${kids ? '▶' : ''}</span><label class="chk"><input type="checkbox" ${n.attr} ${n.checked ? 'checked' : ''}>${n.color ? `<span class="sw" style="background:${n.color}"></span>` : ''}${n.label}${n.count != null ? ` <small style="color:var(--mute)">${n.count}</small>` : ''}</label></div>${kids ? `<div class="tkids" hidden>${n.kids.map(treeHTML).join('')}</div>` : ''}</div>`;
}
document.addEventListener('click', e => { const c = e.target.closest('.caret'); if (!c || c.classList.contains('leaf')) return; const k = c.parentElement.nextElementSibling; k.hidden = !k.hidden; c.classList.toggle('open', !k.hidden); });
{ const cats = [...new Set(P.volumes.map(v => v.cat))];
  $('#treeProgram').innerHTML = treeHTML({ label: 'Program volumes', attr: 'data-layer="program"', checked: false,
    kids: cats.map(c => ({ label: C[c].label, attr: `data-vcat="${c}"`, checked: true, color: C[c].color, count: P.volumes.filter(v => v.cat === c).length })) })
    + '<div class="row" style="margin-left:34px"><label>Opacity</label><input type="range" id="volOp" min="0.05" max="0.3" step="0.01" value="0.07" style="width:100px"></div>'; }
document.addEventListener('input', e => { if (e.target.id === 'volOp') { volOp = +e.target.value; volObjs.forEach(o => { if (o !== selVol) o.material.opacity = volOp; }); } });
// layer list: big groups with caret + heading checkbox, rows aligned as caret | checkbox | legend | name
{
  const sec = $('#treeProgram').closest('.sec'), L = s => sec.querySelector(s)?.closest('label') || null;
  sec.querySelectorAll(':scope > div[style*="height:6px"]').forEach(d => d.remove());
  layerGroup('Model & context', [L('[data-layer=shell]'), L('[data-layer=detail]'), $('#wallOp').closest('.row'), L('[data-layer=slabs]'), $('#treeProgram'), L('[data-layer=ghost]')]);
  layerGroup('Annotation', [L('[data-layer=labels]'), L('[data-layer=tags]'), L('[data-layer=outline]')]);
  alignLayerRows(sec);
  $('#bLayClearM').onclick = () => { sec.querySelectorAll('input[type=checkbox]').forEach(c => { if (!c.disabled && !c.dataset.hgrp) c.checked = false; }); applyVis(); syncLayerGroups(); };
  document.addEventListener('change', () => requestAnimationFrame(syncLayerGroups));
}
function textSprite(txt) {   // floor label: boxed tag, same as the Structure, Life safety and Energy pages
  const c = document.createElement('canvas'), x = c.getContext('2d'), F = '600 30px IBM Plex Mono, monospace'; x.font = F; const w = Math.ceil(x.measureText(txt).width) + 22;
  c.width = w; c.height = 56; x.font = F; x.fillStyle = 'rgba(255,255,255,0.93)'; x.fillRect(0, 6, w, 44); x.fillStyle = '#868e96'; x.fillRect(0, 6, 6, 44); x.fillStyle = '#1d1f22'; x.fillText(txt, 12, 39);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.userData.px = 19; s.userData.asp = w / 56; s.center.set(1, 0); s.renderOrder = 10; return s;
}
// floor labels keep a constant on-screen size whatever the zoom
const _sv = new THREE.Vector3();
function scaleTags(H = view.clientHeight) {
  const wppO = (ocam.top - ocam.bottom) / ocam.zoom / H, k = 2 * Math.tan(THREE.MathUtils.degToRad(pcam.fov / 2)) / H;
  for (const c of ctx) { const o = c.label; if (!o) continue; const h = o.userData.px * (camera === ocam ? wppO : o.getWorldPosition(_sv).distanceTo(camera.position) * k); o.scale.set(h * o.userData.asp, h, 1); }
}

// ---------- materials ----------
const matCache = {};
const mat = (sub, ghost) => {
  const k = sub + (ghost ? '_g' : ''); if (matCache[k]) return matCache[k];
  const c = COL[sub] || '#999';
  return matCache[k] = ghost ? new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 });
};
const outlineMat = new THREE.LineBasicMaterial({ color: 0x2b2f36, transparent: true, opacity: 0.35 });
const hiMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffd400', emissiveIntensity: 0.9 });
const UP = new THREE.Vector3(0, 1, 0);
const pickables = [];
const bG = new THREE.Group(); root.add(bG);            // basement (B1) plant
const flName = i => i === -1 ? 'B1' : model.floors[i]?.name ?? '–';
function tagSprite(txt, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 56; const x = c.getContext('2d');
  x.font = '600 30px IBM Plex Mono, monospace'; const w = Math.min(250, x.measureText(txt).width + 18);
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(0, 6, w, 44); x.fillStyle = color; x.fillRect(0, 6, 6, 44);
  x.fillStyle = '#1d1f22'; x.fillText(txt, 12, 39);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(4.4, 0.96, 1); s.center.set(0, 0); s.renderOrder = 10; s.userData.tag = true; return s;
}
const TAGGED = /pump|heater|switchboard|transformer|generator|chiller|heat pump|DOAS|Central AHU|Air handling|Water meter|AV rack/i;

function buildMEP() {
  [...mepG, bG].forEach(g => { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); g.clear(); });
  pickables.length = 0;
  ctx.forEach(c => { if (c.label) c.slab.remove(c.label); });
  for (const el of model.elements) {
    const g = el.floor === -1 ? bG : mepG[el.floor] || mepG[0]; let obj;
    if (el.kind === 'points') {
      const geo = new THREE.SphereGeometry(0.09, 6, 4);
      obj = new THREE.InstancedMesh(geo, mat(el.sub), el.pts.length);
      const m4 = new THREE.Matrix4(); el.pts.forEach((p, i) => obj.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
    } else if (el.kind === 'equip') {
      const ghost = !!el.props.ghost;
      obj = new THREE.Mesh(new THREE.BoxGeometry(...el.dims), el.props.overflow ? new THREE.MeshStandardMaterial({ color: '#ff6b6b' }) : mat(el.sub, ghost));
      obj.position.set(...el.c);
      if (!ghost && el.props.tag && TAGGED.test(el.sub)) { const t = tagSprite(el.props.tag, COL[el.sub] || '#888'); t.position.set(-el.dims[0] / 2, 0, el.dims[2] / 2 + 0.3); obj.add(t); }
      if (!ghost || el.sub === 'Restroom core') obj.add(new THREE.LineSegments(new THREE.EdgesGeometry(obj.geometry), ghost ? new THREE.LineBasicMaterial({ color: COL[el.sub], transparent: true, opacity: 0.5 }) : outlineMat)).userData.outline = !ghost;
    } else {
      const a = new THREE.Vector3(...el.a), b = new THREE.Vector3(...el.b), d = b.clone().sub(a), len = d.length(); if (len < 1e-3) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      if (el.kind === 'cyl') {
        obj = new THREE.Mesh(new THREE.CylinderGeometry(el.w / 2, el.w / 2, len, 10), mat(el.sub));
        obj.quaternion.setFromUnitVectors(UP, d.normalize());
      } else {
        const vert = Math.abs(d.z) > len * 0.9;
        obj = new THREE.Mesh(vert ? new THREE.BoxGeometry(el.w, el.h, len) : new THREE.BoxGeometry(len, el.w, el.h), mat(el.sub));
        if (!vert) obj.rotation.z = Math.atan2(d.y, d.x);
        obj.add(new THREE.LineSegments(new THREE.EdgesGeometry(obj.geometry), outlineMat)).userData.outline = true;
      }
      obj.position.copy(mid);
    }
    obj.userData.el = el; el.obj = obj; g.add(obj); pickables.push(obj);
  }
  P.levels.forEach((l, i) => { const s = textSprite(model.floors[i].name + ' +' + l.z.toFixed(1)); s.position.set(bmin.x - 6, bmin.y, l.z + 0.6); ctx[i].label = s; ctx[i].slab.add(s); });
  applyVis();
}

function applyVis() {
  const sys = Object.fromEntries($$('[data-sys]').map(c => [c.dataset.sys, c.checked]));
  const sub = Object.fromEntries($$('[data-sub]').flatMap(c => c.dataset.sub.split('|').map(k => [k, c.checked])));
  const lay = Object.fromEntries($$('[data-layer]').map(c => [c.dataset.layer, c.checked]));
  const ctxFloor = $('#ctxFloor').checked;
  shellG.visible = lay.shell && explode === 0 && (floorSel < 0 || ctxFloor);
  ctxG.visible = lay.ghost && explode === 0;
  detG.visible = lay.detail && explode === 0;
  if (floorSel === -2) { clipLo.constant = -((P.basementZ ?? 0) - 1); clipHi.constant = P.levels[0].z + 0.5; }
  else if (floorSel >= 0 && !ctxFloor) { const z0 = floorSel === 0 ? (P.basementZ ?? 0) - 1 : P.levels[floorSel].z - 0.05, z1 = (P.levels[floorSel + 1]?.z ?? P.levels[floorSel].z + 8) - 0.05; clipLo.constant = -z0; clipHi.constant = z1; }
  else { clipLo.constant = 1e4; clipHi.constant = 1e4; }
  floorG.forEach((g, i) => {
    const onFloor = floorSel === -1 || floorSel === i;
    g.visible = onFloor || ctxFloor; g.position.z = i * explode;
    ctx[i].slab.visible = lay.slabs; ctx[i].prog.visible = lay.program && onFloor;
    const vc = Object.fromEntries($$('[data-vcat]').map(c => [c.dataset.vcat, c.checked]));
    ctx[i].prog.children.forEach(m => { if (m.userData.vol) m.visible = vc[m.userData.vol.cat] !== false; });
    if (ctx[i].label) ctx[i].label.visible = lay.labels;
    mepG[i].visible = onFloor;
  });
  bG.visible = floorSel === -1 || floorSel === -2 || ctxFloor;
  if (floorSel === -2) { floorG.forEach((g, i) => { g.visible = i === 0; mepG[i].visible = false; ctx[i].prog.visible = false; }); }
  for (const o of pickables) {
    o.children.forEach(c => { if (c.userData.tag) c.visible = !!lay.tags; });
    const el = o.userData.el;
    o.visible = sys[el.sys] && (sub[el.sub] ?? true) && (!el.props.ghost || lay.ghost);
    o.children.forEach(c => { if (c.userData.outline) c.visible = lay.outline; });
  }
  status();
}

// ---------- camera ----------
function resize() {
  const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h);
  pcam.aspect = w / h; pcam.updateProjectionMatrix();
  const s = radius * 1.1; ocam.left = -s * w / h; ocam.right = s * w / h; ocam.top = s; ocam.bottom = -s; ocam.updateProjectionMatrix();
}
addEventListener('resize', resize);
// side panels: drag the inner edge to resize (widths remembered per browser, double-click to reset)
{
  const main = document.querySelector('main');
  const cur = v => parseFloat(getComputedStyle(main).getPropertyValue(v)) || (v === '--lw' ? 250 : 390);
  const side = (gripId, cssVar, key, def, min, widthFrom, otherVar) => {
    const grip = $('#' + gripId);
    const setW = w => { w = Math.round(Math.min(Math.max(w, min), Math.max(min, innerWidth - cur(otherVar) - 420))); main.style.setProperty(cssVar, w + 'px'); return w; };
    let w = LS(key); if (w) setW(w);
    let drag = false;
    grip.addEventListener('pointerdown', e => { drag = true; grip.classList.add('on'); document.body.classList.add('resizing'); grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', e => { if (!drag) return; w = setW(widthFrom(e.clientX)); resize(); });
    const end = () => { if (!drag) return; drag = false; grip.classList.remove('on'); document.body.classList.remove('resizing'); SS(key, w); resize(); };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    grip.addEventListener('dblclick', () => { main.style.removeProperty(cssVar); w = null; SS(key, null); resize(); });
  };
  side('lgrip', '--lw', 'mep.lw', 250, 200, x => x, '--rw');
  side('rgrip', '--rw', 'mep.rw', 390, 300, x => innerWidth - x, '--lw');
}
addEventListener('keydown', e => { if (e.key === 'Escape' && kpiSel) { kpiSel = null; if (tab === 'sum') renderPane(); } });
function setView(v) {
  const dirs = { iso: [-1, -1.15, 0.85], iso2: [1.1, -1, 0.8], top: [0, -0.001, 1], front: [0, -1, 0.02], side: [1, 0, 0.02] };
  const d = new THREE.Vector3(...dirs[v]).normalize();
  const tr = P.mep?.tech || [], tgt = floorSel === -2 && tr.length ? new THREE.Vector3((Math.min(...tr.map(t => t.bbox[0])) + Math.max(...tr.map(t => t.bbox[3]))) / 2, (Math.min(...tr.map(t => t.bbox[1])) + Math.max(...tr.map(t => t.bbox[4]))) / 2, (P.basementZ ?? 0) + 1) : floorSel === -2 ? new THREE.Vector3(center.x, center.y, (P.basementZ ?? 0) + 1) : floorSel >= 0 ? new THREE.Vector3(center.x, center.y, P.levels[floorSel].z + floorSel * explode + 2) : center.clone().add(new THREE.Vector3(0, 0, explode * P.levels.length / 2));
  controls.target.copy(tgt);
  camera.position.copy(tgt).add(d.multiplyScalar(radius * 3.2));
  if (camera === ocam) { ocam.zoom = floorSel === -2 ? 3 : floorSel !== -1 && v !== 'front' && v !== 'side' ? 1.25 : 1; ocam.updateProjectionMatrix(); }
  controls.update();
}
function setProj(o) {
  ortho = o; const p = camera.position.clone(), t = controls.target.clone();
  camera = o ? ocam : pcam; camera.position.copy(p); controls.object = camera; controls.target.copy(t); controls.update();
  $('#bProj').textContent = o ? 'Ortho' : 'Persp'; $('#bProj').classList.toggle('on', o);
}

// ---------- picking ----------
const ray = new THREE.Raycaster(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const hits = ray.intersectObjects(pickables.filter(o => o.visible && o.parent.visible && o.parent.parent.visible), false).filter(h => !h.object.userData.el.props.ghost || h.object.userData.el.sub === 'Restroom core');
  if (hits[0]) return select(hits[0].object.userData.el);
  const vh = $('[data-layer=program]').checked ? ray.intersectObjects(volObjs.filter(o => o.visible && o.parent.visible && o.parent.parent.visible), false) : [];
  if (vh[0]) return selectZone(vh[0].object);
  select(null);
});
let selVol = null;
function selectZone(o) {
  select(null);
  if (selVol) { selVol.material.opacity = volOp; selVol.children[0].material.opacity = 0.7; }
  selVol = o; o.material.opacity = 0.28; o.children[0].material.opacity = 1;
  selected = { zone: o.userData.vol }; tab = 'ins'; syncTabs(); renderPane();
}
function focusOn(el) {
  if (!el?.obj) return;
  if (floorSel !== -1 && !(el.floor === -1 && floorSel === -2) && el.floor !== floorSel) { floorSel = el.floor === -1 ? -2 : el.floor; $('#floorSel').value = floorSel; applyVis(); }
  const p = new THREE.Vector3(); el.obj.getWorldPosition(p);
  const off = camera.position.clone().sub(controls.target);
  controls.target.copy(p); camera.position.copy(p).add(off);
  if (camera === ocam) { ocam.zoom = Math.max(ocam.zoom, 4); ocam.updateProjectionMatrix(); } else camera.position.copy(p).add(off.setLength(25));
  controls.update();
}
function select(el) {
  if (selVol && el !== undefined) { selVol.material.opacity = volOp; selVol.children[0].material.opacity = 0.7; selVol = null; }
  if (selected?.obj && selected.kind !== 'points') selected.obj.material = selected._mat;
  selected = el;
  if (el?.obj && el.kind !== 'points') { el._mat = el.obj.material; el.obj.material = hiMat; }
  if (el) { tab = 'ins'; syncTabs(); } renderPane();
}

// ---------- UI: assumptions ----------
const AFIELDS = [
  ['General', [['structDepth', 'Slab+structure depth (m)', 0.05], ['minClear', 'Target clear height (m)', 0.1], ['auditoriumSeats', 'Auditorium fixed seats (0 = 7 net)', 1]]],
  ['HVAC', [['supplyDT', 'Supply ΔT (°F)', 1], ['envLoad', 'Envelope load (Btuh/ft²)', 1], ['heatLoad', 'Heating load (Btuh/ft²)', 1], ['Ez', 'Ez (distribution eff.)', 0.05], ['vMain', 'Main velocity (fpm)', 50], ['vBranch', 'Branch velocity (fpm)', 50], ['vRiser', 'Riser velocity (fpm)', 50], ['maxDuctDepth', 'Max duct depth (in)', 2], ['kWperTon', 'Chiller kW/ton', 0.05], ['diffuserCfm', 'cfm / diffuser', 25], ['gridSpacing', 'Open-plan run-out spacing (m)', 0.5]]],
  ['Immersive halls / offices', [['projImgW', 'Projector image width (m)', 0.5], ['projImgH', 'Projector image height (m)', 0.25], ['projOverlap', 'Edge-blend overlap', 0.05], ['projKW', 'kW per projector', 0.1], ['avRackKW', 'AV rack kW per hall', 1], ['deskM2', 'm² per desk', 0.5], ['deskW', 'W per desk', 10]]],
  ['Plumbing', [['streetPsi', 'Street pressure (psi)', 1], ['rainfall', 'Rainfall (in/hr)', 0.01]]],
  ['Electrical', [['voltage', 'Service voltage (V)', 1], ['demand', 'Demand factor', 0.05], ['spare', 'Spare capacity', 0.05], ['elevators', 'Passenger elevators (0 = model)', 1], ['elevatorHp', 'Elevator hp', 5]]],
  ['Fire', [['standpipeFlow', 'Standpipe gpm (0 = auto)', 50], ['topOutletPsi', 'Top outlet psi', 5]]],
];
function buildInputs() {
  $('#aInputs').innerHTML = AFIELDS.map(([g, fs]) => `<div style="margin-top:8px;font-size:11px;color:var(--mute)">${g}</div>` + fs.map(([k, l, st]) => `<div class="row"><label>${l}</label><input type="number" step="${st}" data-a="${k}" value="${A[k]}"></div>`).join('')).join('');
  $('[data-a=concept]').value = A.concept; $('[data-a=genLocation]').value = A.genLocation || 'roof';
  const keys = ['olf', 'Rp', 'Ra', 'lpd', 'epd'];
  $('#catTbl').innerHTML = `<table class="cattbl"><tr><th>Space</th>${keys.map(k => `<th>${k}</th>`).join('')}<th>Haz</th></tr>` + Object.entries(C).map(([c, v]) => `<tr><td title="${v.label}"><i class="sw" style="background:${v.color}"></i> ${c}</td>${keys.map(k => `<td><input type="number" step="any" data-c="${c}.${k}" value="${v[k]}"></td>`).join('')}<td><select data-c="${c}.haz">${['LH', 'OH1', 'OH2', '-'].map(h => `<option ${h === v.haz ? 'selected' : ''}>${h}</option>`).join('')}</select></td></tr>`).join('') + '</table><div class="note">OLF ft²/person · Rp cfm/person · Ra cfm/ft² · LPD/EPD W/ft²</div>';
}
let regenT = 0;
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.a) { A[t.dataset.a] = t.type === 'number' ? parseFloat(t.value) : t.value; SS('mep.A', A); queueRegen(); }
  else if (t.dataset.c) { const [c, k] = t.dataset.c.split('.'); C[c][k] = t.tagName === 'SELECT' ? t.value : parseFloat(t.value); SS('mep.C', Object.fromEntries(Object.entries(C).map(([c, v]) => [c, { olf: v.olf, Rp: v.Rp, Ra: v.Ra, lpd: v.lpd, epd: v.epd, haz: v.haz }]))); queueRegen(); }
  else if (t.dataset.sys || t.dataset.layer || t.dataset.sub || t.dataset.vcat || t.id === 'ctxFloor') applyVis();
});
function queueRegen() { clearTimeout(regenT); regenT = setTimeout(regen, 150); }
$('#bReset').onclick = () => { A = { ...DEFAULTS }; C = JSON.parse(JSON.stringify(CATS)); SS('mep.A', null); SS('mep.C', null); buildInputs(); regen(); };

// floor select
$('#floorSel').innerHTML = '<option value="-1">All floors</option><option value="-2">B1 · basement plant</option>' + P.levels.map((l, i) => `<option value="${i}">${i === P.levels.length - 1 ? 'RT' : 'L' + String(i + 1).padStart(2, '0')} · +${l.z.toFixed(1)} m</option>`).join('');
$('#floorSel').onchange = e => { floorSel = +e.target.value; applyVis(); setView(floorSel === -1 ? 'iso' : floorSel === -2 ? 'iso2' : 'top'); };
$('#explode').oninput = e => { explode = +e.target.value; applyVis(); };
$$('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
$('#bProj').onclick = () => setProj(!ortho);
$('#bFit').onclick = () => setView('iso');
$('#bBg').onclick = () => { dark = !dark; scene.background = dark ? BG.dark : BG.light; edgeMat.color.set(dark ? 0x6c727a : 0x9a9fa6); slabEdge.color.set(dark ? 0x80868e : 0x7c8189); $('#bBg').textContent = dark ? 'Light bg' : 'Dark bg'; };

// ---------- right panel ----------
function syncTabs() { $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); }
$('#tabs').onclick = e => { if (e.target.dataset.t) { tab = e.target.dataset.t; syncTabs(); renderPane(); } };
let kpiSel = null;
// verbatim code text (NYC Admin Code Title 28 via codelibrary.amlegal.com / nyc.gov 2022 PDFs), retrieved Oct 2026
const CODE_Q = {"occ": [["BC §1004.1 Design occupant load", "In determining means of egress requirements, the number of occupants for whom means of egress facilities shall be provided shall be established by the largest number computed in accordance with Section 1004.1.3, unless otherwise permitted by Section 1004.1.3.1, 1004.1.3.2 or 1004.2.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172941"], ["BC §1004.1.3", "The number of occupants shall be computed at the rate of one occupant per unit of area as prescribed in Table 1004.1.3.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172973"], ["BC Table 1004.1.3 (rows used)", "Accessory storage areas, mechanical equipment room — 300 gross · Assembly: Exhibit gallery and museum — 30 net · Assembly with fixed seats — See Section 1004.3 · Assembly without fixed seats: Concentrated (chairs only – not fixed) — 7 net; Standing space / waiting area — 5 net; Unconcentrated (tables and chairs) — 15 net · Business areas, including accessory areas on terraces and rooftops — 100 gross · Mercantile: Areas on other floors — 60 gross; Basement and grade floor areas — 30 gross", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172973"], ["BC §1004.3 Fixed seating", "For areas having fixed seats and aisles, the occupant load shall be determined by the number of fixed seats installed therein. The occupant load for areas in which fixed seating is not installed, such as waiting spaces, shall be determined in accordance with Section 1004.1.3 and added to the number of fixed seats.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-172990"]], "oa": [["MC §403.3.1.1 Outdoor airflow rate", "Ventilation systems shall be designed to have the capacity to supply the minimum outdoor airflow rate determined in accordance with this section. […] The occupant load utilized for design of the ventilation system shall be not less than the number determined from the estimated maximum occupant load rate indicated in Table 403.3.1.1.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-193237"], ["MC §403.3.1.1.1.1 Breathing zone outdoor airflow", "The outdoor airflow rate required in the breathing zone Vbz of the occupiable space or spaces in a zone shall be determined in accordance with Equation 4-1. Vbz = RpPz + RaAz (Equation 4-1)", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-193267"], ["MC §403.3.1.1.1.3 Zone outdoor airflow", "The zone outdoor airflow rate (Voz), shall be determined in accordance with Equation 4-2. Voz = Vbz / Ez (Equation 4-2)", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-193283"]], "gpm": [["PC §403.1 Minimum number of fixtures", "Plumbing fixtures shall be provided for the type of occupancy and in the minimum number shown in Table 403.1. Types of occupancies not shown in Table 403.1 shall be considered individually by the commissioner. The number of occupants shall be determined by the New York City Building Code. Occupancy classification shall be determined in accordance with the New York City Building Code.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-161441"], ["PC §403.1.1 Fixture calculations", "To determine the occupant load of each sex, the total occupant load shall be divided in half. To determine the required number of fixtures, the fixture ratio or ratios for each fixture type shall be applied to the occupant load of each sex in accordance with Table 403.1. Fractional numbers resulting from applying the fixture ratios of Table 403.1 shall be rounded up to the next whole number. For calculations involving multiple occupancies, such fractional numbers for each occupancy shall first be summed and then rounded up to the next whole number. Fixture calculations in Group B office occupancies shall utilize the total occupant load on a given floor to determine the number of fixtures required for that floor.", "https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022PC_Chapter4_FixturesWBwm.pdf"]], "boost": [["PC §604.8 Water pressure-reducing valve or regulator", "Where water pressure within a building exceeds 85 psi (586 kPa) static, an approved valve conforming to ASSE 1003 or CSA B356 with strainer shall be installed to reduce the pressure in the building water distribution piping to not greater than 85 psi (586 kPa) static.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162005"], ["PC Table 604.3 (flushometer rows)", "Water closet, blow out, flushometer valve — flow rate 25 gpm, flow pressure 25 psi · Water closet, siphonic, flushometer valve — flow rate 25 gpm, flow pressure 25 psi", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-161971"]], "stack": [["PC §709.1 Values for fixtures", "Drainage fixture unit values as given in Table 709.1 designate the relative load weight of different kinds of fixtures that shall be employed in estimating the total load carried by a soil or waste pipe, and shall be used in connection with Tables 710.1(1) and 710.1(2) of sizes for soil, waste and vent pipes for which the permissible load is given in terms of fixture units.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162726"], ["PC Table 709.1 (rows used)", "Water closet, flushometer, tank, public or private — 4 · Lavatory — 1 · Drinking fountain — 1/2 · Floor drains — 2 · Sink — 2", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162726"], ["PC §710.1 Maximum fixture unit load", "The maximum number of drainage fixture units connected to a given size of building sewer, building drain or horizontal branch of the building drain shall be determined using Table 710.1(1). The maximum number of drainage fixture units connected to a given size of horizontal branch or vertical soil or waste stack shall be determined using Table 710.1(2).", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-162751"]], "storm": [["PC §1106.1 General", "The size of the vertical conductors and leaders, gutters, building storm drains, building storm sewers and any horizontal branches of such drains or sewers shall be based on the 100-year hourly rainfall rate of 3 inches (76 mm) per hour. Sizing for secondary and combined primary and secondary conductors, leaders and drains shall be in accordance with Section 1108.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-163441"], ["PC §1106.3 Vertical leader sizing", "Vertical leaders shall be sized based on the flow rate from horizontal gutters or the maximum flow rate through roof drains. The flow rate through vertical leaders shall not exceed that specified in Table 1106.3.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-163449"], ["PC Table 1106.3 Vertical Leader Sizing", "Size of leader (inches) — capacity (gpm): 2 — 30 · 3 — 92 · 4 — 192 · 5 — 360 · 6 — 563 · 8 — 1208", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-163449"]], "gen": [["BC §403.4.8 Standby and emergency power", "A standby power system complying with Section 2702 and Section 3003 shall be provided for the standby power loads specified in Section 403.4.8.3. An emergency power system complying with Section 2702 shall be provided for the emergency power loads specified in Section 403.4.8.4.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-166719"]], "heads": [["BC §903.3.1.1 NFPA 13 sprinkler systems", "Where the provisions of this code require that a building or portion thereof be equipped throughout with an automatic sprinkler system in accordance with this section, sprinklers shall be installed throughout in accordance with NFPA 13 except as provided in Sections 903.3.1.1.1 and 903.2 of this code.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-171385"]], "fp": [["BC §905.3.1 Applicability, item 4", "In buildings of any area, constructed in accordance with Section 403, with occupied floors located 75 feet (22 860 mm) or more above the lowest level of Fire Department vehicle access.", "https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-171599"], ["BC Appendix Q, NFPA 14 §7.8.1 (NYC modification)", "Replace the words \"100 psi (6.9 bar)\" with \"65 psi (4.5 bar)\".", "https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_AppendixQ_FireStandardsWBwm.pdf"], ["BC Appendix Q, NFPA 14 §7.3.2.1 (NYC modification, first sentence)", "Roof Manifold. At the top of the highest riser there shall be provided, above the main roof level, a three-way manifold equipped with three 2½ inch (63.5 mm) hose valves with hose valve caps.", "https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_AppendixQ_FireStandardsWBwm.pdf"]]};
const CODE_NOTE = {"heads": "NFPA 13 spacing and coverage limits are a copyrighted standard and are cited, not quoted.", "fp": "NFPA 14 §7.10 flow rates are cited, not quoted.", "gpm": "NYC PC Appendix E (fixture unit values, Hunter curve) not quoted.", "kva": "NYC Electrical Code (NFPA 70 based) is cited, not quoted."};
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kpi = (cls, v, l, k) => `<div class="kpi ${cls}${kpiSel === k ? ' sel' : ''}" data-k="${k}"><b>${v}</b><small>${l}</small></div>`;
// code basis + formula, with the current numbers substituted
function kpiInfo(k, s) {
  const f0 = v => fmt(v), f1 = v => fmt(v, 1), f2 = v => fmt(v, 2);
  const cat = x => C[x] || {};
  const I = {
    area: ['Gross floor area', 'Model slab areas (FBX slab-cut). Zoning floor area per ZR §12-10 is defined differently.',
      `Σ slab area of all levels × 10.7639\n= ${f0(s.grossFt2 / M2FT2)} m² × 10.7639 = ${f0(s.grossFt2)} ft²`, 'Includes the roof technical level; not a zoning FAR figure.'],
    occ: ['Occupant load', 'NYC BC 2022 §1004.1 / Table 1004.1.3; fixed seats §1004.3',
      `Pz = Σ zone area ÷ occupant load factor (rounded up per zone)\n` +
      `Gallery ${cat('gallery').olf} net · Immersive ${cat('immersive').olf} net · Lobby/café ${cat('lobby').olf} net · Food ${cat('food').olf} net\n` +
      `Shop ${cat('shop').olfGrade ?? cat('shop').olf} gross at grade (${cat('shop').olf} other floors) · Office ${cat('office').olf} gross · Technical ${cat('technical').olf} gross\n` +
      `Auditorium = ${A.auditoriumSeats > 0 ? A.auditoriumSeats + ' fixed seats' : cat('auditorium').olf + ' net (chairs only)'}\n= ${f0(s.occ)} persons`,
      'Egress basis; also used for ventilation and fixtures (conservative). Immersive halls use exhibit gallery/museum 30 net; standing event use would be 5 net.'],
    cfm: ['Supply air', 'Design basis (sensible load); minimum per NYC MC §403 outdoor air',
      `per zone: V = max( qs ÷ (1.08 × ΔT), Voz, 0.4 cfm/ft² × area ), rounded up to 50\n` +
      `qs = area × ${A.envLoad} Btuh/ft² + Pz × ${A.peopleSens} + (lighting + plug kW) × 3412\nΔT = ${A.supplyDT} °F\nΣ = ${f0(s.cfm)} cfm`, 'Rule of thumb for DD coordination, not a load calculation.'],
    oa: ['Outdoor air (ventilation rate procedure)', 'NYC MC §403.3 / ASHRAE 62.1 §6.2, Tables 6.2.2.1 & 6.2.2.2',
      `per zone: Voz = (Rp × Pz + Ra × Az) ÷ Ez\nEz = ${A.Ez}  (ceiling supply of warm air)\n` +
      `Rp/Ra: gallery ${cat('gallery').Rp}/${cat('gallery').Ra} · auditorium ${cat('auditorium').Rp}/${cat('auditorium').Ra} · office ${cat('office').Rp}/${cat('office').Ra} · food ${cat('food').Rp}/${cat('food').Ra}\nΣ Voz (100% OA DOAS) = ${f0(s.oa)} cfm`,
      'Pz taken from egress occupant load, so OA is on the high side.'],
    tons: ['Cooling', 'Design basis',
      `per zone: tons = (qs + Pz × ${A.peopleLat} + 4.5 × Voz × 13.4) ÷ 12,000\nΣ = ${f0(s.tons)} tons`, '4.5 × cfm × Δh (13.4 Btu/lb, NYC summer OA). Rule of thumb.'],
    mbh: ['Heating', 'Design basis',
      `per zone: MBH = (area × ${A.heatLoad} Btuh/ft² + 1.08 × Voz × (70 − ${A.oaWinter})) ÷ 1000\nΣ = ${f0(s.mbh)} MBH`, 'No energy-recovery credit (conservative).'],
    gpm: ['Peak domestic water demand', 'NYC PC Appendix E, Table E103.3(2) fixture units; Table E103.3(3) flush-valve curve',
      `WSFU (total) = WC × 10 + lav × 2 + service sink × 3 + DF × 0.25 + kitchen × 20\n= ${f0(s.totWsfu)} WSFU\ngpm = Hunter curve (flush valve) → ${f0(s.gpmPeak)} gpm`, 'Fixture counts from the restroom model where modelled, otherwise from Table 403.1.'],
    boost: ['Booster pump & pressure zones', 'NYC PC Table 604.3 (flushometer 25 psi), §604.8 (85 psi max static)',
      `P_req = ${A.flushValvePsi} psi + H × 0.433 + ${A.frictionPsi} friction + ${A.meterBfpPsi} meter/RPZ\nH = ${f0(s.topFixFt)} ft → P_req = ${f0(s.reqPsi)} psi\nboost = P_req − ${A.streetPsi} psi street = ${f0(s.boosterPsi)} psi\nzones = ⌈H ÷ ((${A.maxFixturePsi} − ${A.flushValvePsi}) ÷ 0.433)⌉ = ${s.pZones}`, 'Street pressure is an assumption until a hydrant flow test is available.'],
    stack: ['Sanitary stack', 'NYC PC Table 709.1 (DFU); Table 710.1(2) stacks; Table 710.1(1) building drain',
      `DFU = WC × 4 + lav × 1 + sink × 2 + DF × 0.5 + floor drain 2 (+ kitchen 12)\n= ${f0(s.totDFU)} DFU\nstack (> 3 branch intervals): ≤ 500 → 4 in, ≤ 1100 → 5 in, ≤ 1900 → 6 in\n→ ${s.stackIn} in stack\nbuilding drain at 1/8 in/ft: ≤ 180 → 4 in, ≤ 390 → 5 in, ≤ 700 → 6 in`, ''],
    storm: ['Storm leaders', 'NYC PC §1106.1 (3 in/hr); Table 1106.3 vertical leaders; §1108.3 secondary drainage',
      `Q = roof area × i ÷ 96.23\n= ${f0(s.roofFt2)} ft² × ${A.rainfall} in/hr ÷ 96.23 = ${f0(s.stormGpm)} gpm\nleaders n = max(2, ⌈Q ÷ 563⌉) = ${s.leaders}\nsize per leader (${f0(s.stormGpm / s.leaders)} gpm): 4 in ≤ 192 · 5 in ≤ 360 · 6 in ≤ 563 → ${s.leaderIn} in`, 'Roof area = largest floor plate (proxy). Secondary drains tied to primary: 6 in/hr combined.'],
    kva: ['Electrical service', 'NYC Electrical Code Art. 220 / 230 (demand factor is a DD assumption)',
      `connected kVA = (lighting ${f0(s.light)} + plug ${f0(s.plug)} + HVAC ${f0(s.hvacKW)} + elevators ${f0(s.elevKW)} + fire pump ${f0(s.fpHp * 0.746)} kW) ÷ pf ${A.pf}\n= ${f0(s.connKVA)} kVA\ndemand = connected × ${A.demand} × (1 + ${A.spare}) = ${f0(s.demandKVA)} kVA\nI = kVA × 1000 ÷ (√3 × ${A.voltage} V) = ${f0(s.amps)} A → ${s.svcA} A`, 'Blanket demand factor, not an Article 220 calculation.'],
    gen: ['Emergency / standby generator', 'NYC BC §403.4.8, §2702, §3007.8; NFPA 110',
      `life-safety kW = 0.1 × lighting + 10 (fire alarm) + 4 × 15 hp × 0.746 (smoke control) + ${A.elevatorHp} hp × 0.746 × 1.5 (FSE)\n= ${f1(s.genLS)} kW\n+ fire pump ${s.fpHp} hp × 0.746 = ${f1(s.fpHp * 0.746)} kW\nsize = next standard ≥ 1.25 × total → ${f0(s.genKW)} kW`, 'Running loads only; fire pump motor starting not included. Smoke-control fan sizes are placeholders.'],
    heads: ['Sprinkler heads', 'NYC BC §903; NFPA 13 Table 10.2.4.2.1(a)/(b)',
      `light hazard: 15 ft × 15 ft = 225 ft²/head (hydraulically calculated)\nordinary hazard: 11 ft × 11 ft = 121 ft²/head (≤ 130 ft² max)\nunassigned areas: area ÷ 225 ft²\nΣ = ${f0(s.heads)} heads`, 'Heads placed only where the slab exists. Hydraulic calculation not performed.'],
    fp: ['Fire pump', 'NFPA 14 §7.10 (flow); NYC BC Appendix Q mod. to NFPA 14 §7.8.1 (65 psi) and §7.3.2.1 (roof manifold); NFPA 20',
      `flow = 500 + 250 × (standpipes − 1), max 1000 = ${f0(s.spFlow)} gpm  (${s.nStand} standpipes)\n` +
      `pressure = ${A.topOutletPsi} psi + ${f0(s.fpElevFt)} ft × 0.433 + 15 friction − 0.8 × ${A.streetPsi} street\n= ${f0(s.fpHeadPsi)} psi\n` +
      `hp = gpm × psi × 2.31 ÷ (3960 × 0.7), rounded up to 25\n= ${f0(s.spFlow)} × ${f0(s.fpHeadPsi)} × 2.31 ÷ 2772 → ${s.fpHp} hp`, 'Suction pressure should come from a hydrant flow test (residual), not 0.8 × static.'],
  }[k];
  if (!I) return '';
  const q = (CODE_Q[k] || []).map(([ref, txt, url]) => `<blockquote><b>${esc(ref)}</b><span>${/Table/.test(ref) && !/§/.test(ref) ? esc(txt) : '“' + esc(txt) + '”'}</span><a href="${url}" target="_blank" rel="noopener">source</a></blockquote>`).join('');
  const n = CODE_NOTE[k] ? `<p class="cn">${esc(CODE_NOTE[k])}</p>` : '';
  return `<div class="kinfo"><button class="x" data-kx title="Close">✕</button><h4>${I[0]}</h4><div class="code">${I[1]}</div>${q}${n}<div class="f">${I[2]}</div>${I[3] ? `<p>${I[3]}</p>` : ''}</div>`;
}
function renderPane() {
  const s = model.summary, pane = $('#pane');
  if (tab === 'sum') {
    const cnt = model.audit.reduce((a, x) => (a[x.status] = (a[x.status] || 0) + 1, a), {});
    const K = [
      ['area', '', fmt(s.grossFt2) + ' ft²', `Gross floor area (${fmt(s.grossFt2 / M2FT2)} m²)`], ['occ', '', fmt(s.occ), 'Occupant load (egress basis)'],
      ['cfm', 'hv', fmt(s.cfm), 'Supply air cfm'], ['oa', 'hv', fmt(s.oa), 'Outdoor air cfm'],
      ['tons', 'hv', fmt(s.tons), 'Cooling tons'], ['mbh', 'hv', fmt(s.mbh), 'Heating MBH'],
      ['gpm', 'pl', fmt(s.gpmPeak) + ' gpm', `Peak domestic demand (${fmt(s.totWsfu)} WSFU)`], ['boost', 'pl', fmt(s.boosterPsi) + ' psi', `Booster boost · ${s.pZones} pressure zones`],
      ['stack', 'pl', s.stackIn + ' in', `Sanitary stack (${fmt(s.totDFU)} DFU)`], ['storm', 'pl', s.leaders + '×' + s.leaderIn + ' in', `Storm leaders (${fmt(s.stormGpm)} gpm)`],
      ['kva', 'el', fmt(s.demandKVA) + ' kVA', `Service demand + spare · ${s.svcA} A`], ['gen', 'el', fmt(s.genKW) + ' kW', 'Emergency / standby generator'],
      ['heads', 'fp', fmt(s.heads), 'Sprinkler heads'], ['fp', 'fp', s.fpHp + ' hp', `Fire pump ${s.spFlow} gpm @ ${fmt(s.fpHeadPsi)} psi`],
    ];
    // detail box goes right after the row of the selected card
    let cards = '';
    K.forEach(([k, c, v, l], i) => { cards += kpi(c, v, l, k); if (kpiSel && i % 2 === 1 && (K[i][0] === kpiSel || K[i - 1][0] === kpiSel)) cards += kpiInfo(kpiSel, s); });
    pane.innerHTML = `<div class="kpis${kpiSel ? ' focus' : ''}">
      ${cards}
    </div>
    <h3 style="font-size:12px;margin:6px 0">Shafts (sized on the most loaded segment)</h3>
    <table><tr><th>Shaft</th><th>L × D (m)</th><th>Area m²</th><th>Needed m²</th></tr>${Object.values(s.shafts).map(x => `<tr><td>${x.name}</td><td>${x.len.toFixed(2)} × ${x.dep.toFixed(2)}</td><td>${x.area}</td><td style="color:${x.fits ? 'var(--ok)' : 'var(--fail)'}">${x.reqArea ?? '–'}</td></tr>`).join('')}</table>
    <h3 style="font-size:12px;margin:12px 0 6px">Basement technical rooms (model)</h3>
    <table><tr><th>Room</th><th>m²</th><th>Used incl. clearance</th></tr>${(s.basement?.rooms || []).map(r => `<tr><td>${r.id}</td><td>${r.area}</td><td>${r.used}</td></tr>`).join('')}</table>
    <div class="note">Core model: ${s.nPass} passenger + ${s.nFr} freight elevators · ${s.nStand} stairs (${s.stairs.map(x => x.id + ' → +' + x.top.toFixed(1)).join(', ')})</div>
    <h3 style="font-size:12px;margin:12px 0 6px">Checks</h3>
    <div>${['fail', 'warn', 'ok', 'info'].map(k => cnt[k] ? `<span class="pill ${k}">${cnt[k]} ${k}</span> ` : '').join('')}</div>
    <h3 style="font-size:12px;margin:12px 0 6px">Load split</h3>
    <table><tr><th>Component</th><th>kW</th></tr><tr><td>Lighting</td><td>${fmt(s.light)}</td></tr><tr><td>Plug / media / process</td><td>${fmt(s.plug)}</td></tr><tr><td>HVAC (chillers, fans, pumps)</td><td>${fmt(s.hvacKW)}</td></tr><tr><td>Elevators</td><td>${fmt(s.elevKW)}</td></tr><tr><td>Fire pump</td><td>${fmt(s.fpHp * 0.746)}</td></tr><tr><td><b>Connected kVA</b></td><td><b>${fmt(s.connKVA)}</b></td></tr></table>
    <div class="note">Concept: ${A.concept === 'central' ? 'central roof AHUs with supply/return shafts' : 'roof DOAS (ERV) + floor-by-floor AHUs, CHW/HHW from roof plant'}. DD rules of thumb, not engineered calculations. Click any element in the model to inspect it.</div>`;
    pane.querySelectorAll('.kpi[data-k]').forEach(el => el.onclick = () => { kpiSel = kpiSel === el.dataset.k ? null : el.dataset.k; renderPane(); });
    pane.querySelector('[data-kx]')?.addEventListener('click', () => { kpiSel = null; renderPane(); });
  } else if (tab === 'flo') {
    pane.innerHTML = `<table><thead><tr><th>Floor</th><th>Elev m</th><th>m²</th><th>Occ</th><th>Supply cfm</th><th>OA cfm</th><th>Tons</th><th>Main duct</th><th>Clear m</th><th>WC prov/req</th><th>kVA</th><th>Heads</th><th>Boost</th></tr></thead><tbody>
    ${model.floors.map(f => `<tr data-f="${f.idx}" class="${floorSel === f.idx ? 'sel' : ''}"><td>${f.name}</td><td>${f.z.toFixed(1)}</td><td>${fmt(f.grossM2)}</td><td>${fmt(f.occ)}</td><td>${fmt(f.cfm)}</td><td>${fmt(f.oa)}</td><td>${fmt(f.tons)}</td><td>${f.mainDuct || '–'}</td><td style="color:${f.ceiling != null && f.ceiling < A.minClear ? 'var(--fail)' : 'inherit'}">${f.ceiling ?? '–'}</td><td style="color:${f.occ && (!f.fixProv || f.fixProv.wc < f.fixReqWC) ? 'var(--fail)' : 'inherit'}">${f.fixProv ? f.fixProv.wc : '–'}/${f.fixReqWC}</td><td>${fmt(f.kva)}</td><td>${fmt(f.heads)}</td><td>${f.boosted ? 'yes' : ''}</td></tr>`).join('')}</tbody></table>
    <h3 style="font-size:12px;margin:14px 0 6px">Zones ${floorSel >= 0 ? model.floors[floorSel].name : '(select a floor row)'}</h3>
    ${floorSel >= 0 ? `<table><tr><th>Zone</th><th>Type</th><th>m²</th><th>Occ</th><th>cfm</th><th>OA</th><th>cfm/ft²</th><th>Tons</th><th>kW</th></tr>${model.floors[floorSel].zones.map(z => `<tr><td>${z.id}</td><td>${z.cat}</td><td>${fmt(z.area)}</td><td>${z.occ}</td><td>${fmt(z.cfm)}</td><td>${fmt(z.oa)}</td><td>${fmt(z.cfmft2, 2)}</td><td>${fmt(z.tons, 1)}</td><td>${fmt(z.light + z.plug)}</td></tr>`).join('')}</table>` : ''}`;
    pane.querySelectorAll('tr[data-f]').forEach(r => r.onclick = () => { floorSel = +r.dataset.f; $('#floorSel').value = floorSel; applyVis(); setView('top'); renderPane(); });
  } else if (tab === 'eq') {
    const eq = model.elements.filter(e => e.kind === 'equip' && !e.props.ghost && !['Diffuser'].includes(e.sub));
    const groups = {}; eq.forEach(e => (groups[e.sys] ||= []).push(e));
    pane.innerHTML = Object.entries(groups).map(([g, list]) => `<h3 style="font-size:12px;margin:10px 0 6px">${g}</h3><table><tr><th>Tag</th><th>Type</th><th>Level</th><th>Key data</th></tr>${list.map(e => `<tr data-id="${e.id}"><td>${e.props.tag || e.id}</td><td style="text-align:left">${e.sub}</td><td>${flName(e.floor)}</td><td style="text-align:left;white-space:normal">${Object.entries(e.props).filter(([k]) => !['tag', 'note', 'ghost'].includes(k)).map(([k, v]) => `${k}: ${typeof v === 'number' ? fmt(v) : v}`).join(' · ')}</td></tr>`).join('')}</table>`).join('');
    pane.querySelectorAll('tr[data-id]').forEach(r => r.onclick = () => { const el = model.elements.find(e => e.id === r.dataset.id); focusOn(el); select(el); });
  } else if (tab === 'aud') {
    pane.innerHTML = model.audit.map(a => `<div class="aud"><div class="t"><span class="pill ${a.status}">${a.status}</span>${a.item}<span style="margin-left:auto;color:var(--mute);font-size:11px">${a.area}</span></div><p>${a.detail}</p><div class="ref">${a.ref}</div></div>`).join('') + '<div class="note">DD coordination checks against code-derived rules. They flag issues; they do not certify NYC permit compliance.</div>';
  } else if (tab === 'miss') {
    pane.innerHTML = `<p style="margin-top:0">Inputs that will most improve accuracy, in priority order:</p><ol class="miss">${MISSING.map(([t, d]) => `<li><b>${t}</b>${d}</li>`).join('')}</ol>`;
  } else if (tab === 'ins') {
    const e = selected;
    if (!e) { pane.innerHTML = '<p style="color:var(--mute)">Click an element in the model. Turn on Program volumes to click rooms.</p>'; return; }
    if (e.zone) {
      const v = e.zone, fl = model.floors[v.floor], z = fl.zones.find(q => q.id === v.id) || {};
      const rows = [['Room / volume', v.id], ['Type', C[v.cat].label], ['In model', `${P.volumes.filter(q => q.cat === v.cat).length} ${C[v.cat].label.toLowerCase()} volumes · ${fmt(P.volumes.filter(q => q.cat === v.cat).reduce((a, q) => a + q.area, 0))} m² total`], ['Level', fl.name + ' · +' + v.zmin.toFixed(2)], ['Height', (v.zmax - v.zmin).toFixed(2) + ' m'], ['Floor area', fmt(v.area) + ' m² / ' + fmt(v.area * M2FT2) + ' ft²'],
        ['Occupants', z.occ], ['Supply air', fmt(z.cfm) + ' cfm (' + fmt(z.cfmft2, 2) + ' cfm/ft²)'], ['Outdoor air', fmt(z.oa) + ' cfm'], ['Cooling', fmt(z.tons, 1) + ' tons'], ['Heating', fmt(z.mbh) + ' MBH'],
        ['Lighting', fmt(z.light, 1) + ' kW'], ['Plug / media / AV', fmt(z.plug, 1) + ' kW'], ['Diffusers', z.diffusers ?? '–'], ['Air distribution', z.layout || 'header + diffusers'], ['Sprinkler heads', z.heads ?? '–'], ['Hazard', C[v.cat].haz]];
      if (z.projectors) rows.push(['Projectors', `${z.projectors} (${z.projCols} around × ${z.projRows} tiers)`], ['Projection wall', `${fmt(z.wallPerim)} m perimeter × ${z.wallH} m`], ['AV heat', fmt(z.avKW) + ' kW']);
      if (z.desks) rows.push(['Workstations', z.desks]);
      pane.innerHTML = `<h3 style="margin:0 0 6px;font-size:14px">${C[v.cat].label}</h3>${descHTML(DESC_ZONE[v.cat])}<div class="kv">${rows.map(([k, x]) => `<div>${k}</div><div>${x ?? '–'}</div>`).join('')}</div><button class="btn" style="margin-top:12px" id="bDesel">Clear selection</button>`;
      $('#bDesel').onclick = () => select(null); return;
    }
    const rows = [['System', e.sys], ['Type', e.sub], ['In model', countFor(e)], ['Level', flName(e.floor)], ['ID', e.id]];
    if (e.a) { const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]); rows.push(['Length', len.toFixed(2) + ' m']); rows.push([e.kind === 'cyl' ? 'Diameter (OD approx.)' : 'Section', e.kind === 'cyl' ? (e.w / IN).toFixed(1) + ' in' : `${(e.w / IN).toFixed(0)} × ${(e.h / IN).toFixed(0)} in (${e.w.toFixed(2)} × ${e.h.toFixed(2)} m)`]); rows.push(['Start', e.a.map(v => v.toFixed(2)).join(', ')]); rows.push(['End', e.b.map(v => v.toFixed(2)).join(', ')]); }
    if (e.c) { rows.push(['Center', e.c.map(v => v.toFixed(2)).join(', ')]); rows.push(['Size L×W×H', e.dims.map(v => v.toFixed(2)).join(' × ') + ' m']); }
    for (const [k, v] of Object.entries(e.props)) if (k !== 'ghost') rows.push([k.replace(/_/g, ' '), typeof v === 'number' ? fmt(v, v % 1 ? 1 : 0) : String(v)]);
    pane.innerHTML = `<h3 style="margin:0 0 6px;font-size:14px">${e.props.tag || e.sub}</h3>${descHTML(DESC[e.sub])}<div class="kv">${rows.map(([k, v]) => `<div>${k}</div><div>${v ?? '–'}</div>`).join('')}</div><button class="btn" style="margin-top:12px" id="bDesel">Clear selection</button> <button class="btn" style="margin-top:12px" id="bFocus">Zoom to</button>`;
    $('#bDesel').onclick = () => select(null); $('#bFocus').onclick = () => focusOn(e);
  }
}

// ---------- component descriptions (inspector) ----------
const DESC = {
  'Supply air': 'Ductwork delivering conditioned air (cooled/heated, filtered, with outdoor air) from the air handler to the rooms. Mains run from the shaft/AHU; branches and run-outs feed the diffusers.',
  'Return air': 'Air drawn back from the rooms to the air handler to be re-conditioned. Mostly via the ceiling plenum; in immersive halls a high-level return removes projector heat.',
  'Outdoor air': 'Fresh air from the roof DOAS (energy-recovery unit) down the shaft to each floor AHU — the ventilation required by NYC MC §403 / ASHRAE 62.1.',
  'Exhaust air': 'Air removed from the building (toilets, general relief) and sent up the shaft to the roof, passing through the energy-recovery wheel before discharge.',
  'Chilled water': 'Pipe loop carrying ~44 °F water from the roof chillers to the AHU cooling coils and back. Sized for the cooling load below each point.',
  'Heating hot water': 'Pipe loop carrying hot water from the roof heat pumps to the AHU heating coils and back.',
  'Air handling unit': 'Floor air handler: fans, filters and CHW/HHW coils. Mixes outdoor air with return air, conditions it and pushes it into the supply ductwork of its floor. Needs a mechanical room next to the shaft.',
  'Diffuser': 'Ceiling outlet that spreads supply air into the room without draughts. In immersive halls they are kept away from the projection walls and run at low velocity for silence.',
  'Chiller / heat-recovery chiller': 'Roof plant that produces chilled water for cooling (and can recover heat). Sized N+1: one unit is standby.',
  'Air-to-water heat pump': 'Roof plant producing heating hot water from outdoor air with electricity (all-electric strategy for NYC Local Law 97).',
  'DOAS with energy recovery': 'Dedicated outdoor-air system: treats 100% fresh air and recovers energy from the exhaust air before supplying it to the floor AHUs.',
  'Central AHU': 'Large roof air handler serving several floors through supply/return shafts (alternative concept).',
  'Pump': 'Circulates chilled or heating water through the hydronic loops (duty + standby).',
  'Domestic cold water': 'Drinking/flushing water from the city main, boosted in the basement and carried up the plumbing chase to restrooms and kitchens.',
  'Domestic hot water': 'Hot water from the basement water heaters to lavatories, sinks and kitchens, with a recirculation line so it arrives hot quickly.',
  'Sanitary': 'Waste pipes taking used water from fixtures by gravity down the stack to the building drain and the city sewer. Must slope ≥ 1/8 in per ft.',
  'Vent': 'Air pipes connected to the drainage system that keep traps from being siphoned and release sewer gas above the roof.',
  'Storm': 'Roof-drain leaders collecting rainwater from the roofs and carrying it to the storm building drain (NYC DEP may require detention).',
  'Restroom core': 'Restroom block from the core model; tool data compares fixtures provided vs. required by NYC PC Table 403.1.',
  'Domestic booster pump': 'Variable-speed pump set in the basement that raises city water pressure so the upper floors get enough pressure; pressure-reducing valves split the building into zones ≤ 80 psi.',
  'Water heater': 'Produces domestic hot water (heat-pump water heater assumed) with storage for peak demand.',
  'Water meter + backflow': 'City water meter and reduced-pressure backflow preventer at the service entry — protects the public main from contamination.',
  'Cable tray': 'Open tray carrying power and data cables from the electrical closet to panels, lighting and equipment on the floor.',
  'Busway riser': 'Vertical bus duct distributing normal power from the main switchboard to the panels on each floor.',
  'Emergency feeder': 'Separate, fire-rated (2-hr) cables for life-safety loads: egress lighting, fire alarm, smoke control, fire pump, fire service elevator.',
  'Panelboards': 'Floor distribution panels (normal + emergency) feeding lighting, receptacles and equipment circuits. Needs a stacked electrical closet.',
  'Service feeders': 'Main incoming power cables from the utility (Con Edison) to the switchboard, and from the switchboard to the riser.',
  'Main switchboard': 'Main electrical distribution equipment where the utility service enters; protects and splits power to the risers and plant.',
  'Utility transformer vault': 'Con Edison transformer stepping utility voltage down to 480Y/277 V. Location and type are set by the utility.',
  'Emergency/standby generator': 'Backup power for life-safety and legally required loads (high-rise requirement). Diesel with day tank assumed.',
  'Sprinkler main': 'Fire-protection pipe from the floor control valve (in the stair) feeding the sprinkler branch lines.',
  'Sprinkler branch': 'Smaller pipes carrying water to the individual sprinkler heads.',
  'Sprinkler head': 'Heat-activated nozzles that open automatically in a fire. Spacing depends on hazard class (15 ft light, 11 ft ordinary — max 130 ft² per head).',
  'Standpipe': 'Vertical fire pipe in each stair with hose valves at every landing, used by the fire department; also feeds the floor sprinklers (combined system).',
  'Fire service': 'Dedicated water main from the street to the fire pump and standpipes, with a Siamese connection for fire-department pumpers.',
  'Fire pump': 'Boosts water pressure for the standpipes and sprinklers so the top hose outlet gets ~100 psi. In a 2-hr rated room (NFPA 20).',
  'Projector': 'Laser projector hung from the ceiling, aimed at the hall walls; overlapping, edge-blended images create the 360° projection. Each one is a heat and power load.',
  'AV rack': 'Media servers, audio processing and network for the immersive hall. Runs 24/7 and needs dedicated cooling.',
  'Shaft': 'Fire-rated vertical shaft containing risers (ducts, pipes, busway). Sized by the tool from what has to fit inside.',
};
const DESC_ZONE = {
  gallery: 'Open-plan exhibition space: ceiling supply grid, comfort conditioning (collections-grade control TBD), light-hazard sprinklers.',
  immersive: 'Immersive hall with 360° projection on every wall: ceiling projector ring, high cooling load from projectors, low-noise ceiling supply away from the walls, light-tight.',
  auditorium: 'Assembly seating with high occupancy: high outdoor air and quiet air distribution.',
  food: 'Food court / events: high ventilation, kitchen plumbing and grease interceptor TBD, ordinary-hazard sprinklers.',
  lobby: 'Entrance lobby / café / cloakroom: open-plan supply, perimeter loads from glazing.',
  shop: 'Retail and library: ordinary-hazard (Group 2) sprinklers for stored goods/books.',
  office: 'Traditional offices with desks and computers: workstation plug loads, standard office ventilation.',
  technical: 'Roof technical space housing the central plant.',
  terrace: 'Exterior terrace: no conditioning; drainage and lighting only.',
};
function countFor(e) {
  const same = model.elements.filter(x => x.sub === e.sub);
  if (e.kind === 'points') return `${fmt(same.reduce((a, x) => a + x.pts.length, 0))} heads in the model (${fmt(e.pts.length)} in this zone)`;
  if (e.a) {
    const len = same.reduce((a, x) => a + Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1], x.b[2] - x.a[2]), 0);
    return `${fmt(same.length)} segments · ${fmt(len)} m total in the model`;
  }
  const lvls = new Set(same.map(x => x.floor)).size;
  return `${fmt(same.length)} in the model${lvls > 1 ? ` (on ${lvls} levels)` : ''}`;
}
const descHTML = t => t ? `<p style="margin:0 0 12px;font-size:12.5px;line-height:1.5;color:#3b3f45;border-left:3px solid var(--line);padding-left:10px">${t}</p>` : '';
function selName() { return floorSel === -1 ? 'ALL' : floorSel === -2 ? 'B1' : model.floors[floorSel].name; }
function status() {
  const s = model.summary;
  $('#status').innerHTML = `<b style="color:var(--ink)">${model.elements.length}</b> elements · ${fmt(s.cfm)} cfm · ${fmt(s.tons)} t · ${s.svcA} A · ${fmt(s.heads)} heads · ${selName()}`;
}

function regen() {
  const sel = selected?.id; selected = null;
  model = generate(P, A, C);
  model.cats = C;
  buildMEP(); renderPane();
  if (sel) { /* ids regenerate; keep selection cleared */ }
}

// ---------- exports ----------
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.opacity = 0, 2600); };
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
function download(name, data, type) { const b = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function exportPNG(w, h) {
  const max = renderer.capabilities.maxTextureSize; if (w > max) { h = Math.round(h * max / w); w = max; }
  const vw = view.clientWidth, vh = view.clientHeight, pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  // keep framing of the current view: match the viewport aspect within the requested frame
  const asp = w / h;
  if (camera === pcam) { pcam.aspect = asp; pcam.updateProjectionMatrix(); }
  else { const hh = (ocam.top - ocam.bottom) / 2; ocam.left = -hh * asp; ocam.right = hh * asp; ocam.updateProjectionMatrix(); }
  scaleTags(vh); renderer.render(scene, camera);
  renderer.domElement.toBlob(b => download(`2GBX_MEP_${selName()}_${w}x${h}_${stamp()}.png`, b), 'image/png');
  renderer.setPixelRatio(pr); renderer.setSize(vw, vh, false); renderer.domElement.style.width = vw + 'px'; renderer.domElement.style.height = vh + 'px'; resize();
  toast(`PNG ${w}×${h} exported`);
}
$('#bPng').onclick = () => exportPNG(3840, 2160);
$('#bPng8').onclick = () => exportPNG(7680, 4320);

function visibleEls() { return model.elements.filter(e => e.obj && e.obj.visible && e.obj.parent.visible && e.obj.parent.parent.visible); }
function worldGeo(o) { // geometry in model coordinates (ignores explode offset)
  const g = o.geometry.clone(); o.updateMatrix(); g.applyMatrix4(o.matrix); return g;
}
function hexRGB(h) { const c = new THREE.Color(h); return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255), a: 255 }; }
let rhinoP = null;
async function export3dm() {
  toast('Loading rhino3dm…');
  try {
    rhinoP ||= import('https://cdn.jsdelivr.net/npm/rhino3dm@8.35.0/rhino3dm.module.min.js').then(m => m.default({ locateFile: f => 'https://cdn.jsdelivr.net/npm/rhino3dm@8.35.0/' + f }));
    const rhino = await rhinoP;
    const doc = new rhino.File3dm();
    doc.settings().modelUnitSystem = rhino.UnitSystem.Meters;
    const layers = {};
    const layer = (path, color) => {
      if (layers[path] != null) return layers[path];
      const parts = path.split('::'); const L = new rhino.Layer(); L.name = parts[parts.length - 1]; L.color = hexRGB(color);
      if (parts.length > 1) { const pi = layer(parts.slice(0, -1).join('::'), color); L.parentLayerId = doc.layers().findIndex(pi).id; }
      return layers[path] = doc.layers().add(L);
    };
    let n = 0;
    for (const e of visibleEls()) {
      const col = e.props.ghost ? '#9aa0a6' : COL[e.sub] || '#888';
      const attr = new rhino.ObjectAttributes();
      attr.name = (e.props.tag || e.sub) + ' ' + e.id;
      for (const [k, v] of Object.entries({ system: e.sys, type: e.sub, level: flName(e.floor), ...e.props })) attr.setUserString(k, String(v));
      if (e.kind === 'points') {
        attr.layerIndex = layer(`MEP::${e.sys}::${e.sub}`, col);
        for (const p of e.pts) { doc.objects().add(new rhino.Point(p), attr); n++; }
        continue;
      }
      attr.layerIndex = layer(`MEP::${e.sys}::${e.props.ghost ? 'Zones (ghost)' : e.sub}`, col);
      const g = worldGeo(e.obj), pos = g.attributes.position, idx = g.index;
      const m = new rhino.Mesh();
      for (let i = 0; i < pos.count; i++) m.vertices().add(pos.getX(i), pos.getY(i), pos.getZ(i));
      for (let i = 0; i < idx.count; i += 3) m.faces().addTriFace(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      m.normals().computeNormals(); m.compact();
      doc.objects().add(m, attr); n++;
      if (e.a) { const a2 = new rhino.ObjectAttributes(); a2.name = attr.name; a2.layerIndex = layer(`MEP_CENTERLINES::${e.sys}::${e.sub}`, col); for (const [k, v] of Object.entries({ system: e.sys, type: e.sub, w_in: (e.w / IN).toFixed(1), h_in: (e.h / IN).toFixed(1), ...e.props })) a2.setUserString(k, String(v)); doc.objects().add(new rhino.LineCurve(e.a, e.b), a2); }
    }
    download(`2GBX_MEP_${selName()}_${stamp()}.3dm`, new Blob([doc.toByteArray()], { type: 'application/octet-stream' }));
    toast(`Rhino .3dm exported · ${n} objects (metres)`);
  } catch (err) { console.error(err); toast('rhino3dm unavailable — exporting OBJ instead'); exportOBJ(); }
}
function exportOBJ() {
  let out = '# 2GBX MEP Designer — units: metres, Z up\n', mtl = '', off = 1; const used = {};
  out += `mtllib 2GBX_MEP.mtl\n`;
  for (const e of visibleEls()) {
    if (e.kind === 'points') continue;
    const key = (e.sys + '_' + e.sub).replace(/[^\w]+/g, '_');
    if (!used[key]) { used[key] = 1; const c = new THREE.Color(COL[e.sub] || '#888'); mtl += `newmtl ${key}\nKd ${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}\n${e.props.ghost ? 'd 0.2\n' : ''}\n`; }
    const g = worldGeo(e.obj), p = g.attributes.position, idx = g.index;
    out += `o ${(e.props.tag || e.sub).replace(/\s+/g, '_')}_${e.id}\ng ${key}\nusemtl ${key}\n`;
    for (let i = 0; i < p.count; i++) out += `v ${p.getX(i).toFixed(4)} ${p.getY(i).toFixed(4)} ${p.getZ(i).toFixed(4)}\n`;
    for (let i = 0; i < idx.count; i += 3) out += `f ${idx.getX(i) + off} ${idx.getX(i + 1) + off} ${idx.getX(i + 2) + off}\n`;
    off += p.count;
  }
  download('2GBX_MEP.obj', out, 'text/plain'); setTimeout(() => download('2GBX_MEP.mtl', mtl, 'text/plain'), 300);
  toast('OBJ + MTL exported (metres, Z up)');
}
$('#b3dm').onclick = export3dm;
$('#bObj').onclick = exportOBJ;
$('#bCsv').onclick = () => {
  const H = ['floor', 'elev_m', 'gross_m2', 'occupants', 'supply_cfm', 'oa_cfm', 'cooling_tons', 'heating_mbh', 'main_duct', 'clear_height_m', 'wc_men', 'wc_women', 'lav', 'df', 'wsfu_total', 'dfu', 'lighting_kW', 'plug_media_kW', 'floor_kVA', 'sprinkler_heads', 'booster_zone'];
  const rows = model.floors.map(f => [f.name, f.z, f.grossM2, f.occ, f.cfm, f.oa, f.tons.toFixed(1), f.mbh.toFixed(0), f.mainDuct || '', f.ceiling ?? '', f.fix.wcM, f.fix.wcF, f.fix.lavM + f.fix.lavF, f.fix.df, f.wsfuT.toFixed(1), f.dfu.toFixed(1), f.light.toFixed(1), f.plug.toFixed(1), (f.kva || 0).toFixed(1), f.heads, f.boosted ? 'yes' : 'no']);
  download(`2GBX_MEP_schedule_${stamp()}.csv`, [H, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n'), 'text/csv');
};
$('#bJson').onclick = () => {
  const strip = e => { const { obj, _mat, ...r } = e; return r; };
  download(`2GBX_MEP_model_${stamp()}.json`, JSON.stringify({ project: P.name, units: 'm (geometry), US customary (engineering)', assumptions: A, categories: C, summary: model.summary, floors: model.floors, audit: model.audit, elements: model.elements.map(strip) }, null, 1), 'application/json');
};

// ---------- go ----------
buildInputs(); resize(); regen(); setProj(true); setView('iso'); loadDetail();
// floor labels sit at the corner of the building that is left-most in the current view
const _lc = new THREE.Vector3();
function placeLabels(list) {
  let best = null, bx = Infinity;
  for (const [x, y] of [[bmin.x, bmin.y], [bmax.x, bmin.y], [bmax.x, bmax.y], [bmin.x, bmax.y]]) { _lc.set(x, y, center.z).project(camera); if (_lc.x < bx) { bx = _lc.x; best = [x, y]; } }
  const px = best[0] + Math.sign(best[0] - center.x) * 2, py = best[1] + Math.sign(best[1] - center.y) * 2;
  for (const s of list) { s.position.x = px; s.position.y = py; }
}
renderer.setAnimationLoop(() => { controls.update(); placeLabels(ctx.map(c => c.label).filter(Boolean)); scaleTags(); renderer.render(scene, camera); });
