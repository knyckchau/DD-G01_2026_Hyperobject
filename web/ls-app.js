// DD-G01 HYPEROBJECT — Life safety page. Geometry and checks are derived from the model data on every load
// (project-data.js + the core model in detail-data.js), so a new FBX export converted with tools/build_data.py
// updates stairs, elevators, lobbies, floors and programme here without code changes.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { generate, DEFAULTS, CATS, M2FT2 } from './engine.js?v=20261019c'; // keep in step with APP_V in ls.html
import { viewTools, renderTiled } from './viewtools.js?v=20261019c';
import { lifeSafety, clusterDetail } from './lifesafety.js?v=20261019c';
import { LS_Q } from './ls-codes.js?v=20261019c';
import { collect, toOBJ, to3dm } from './export3d.js?v=20261019c';

const P = window.PROJECT;
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const SS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

// assumptions are shared with the MEP page (same localStorage keys), so occupant loads match
let A = { ...DEFAULTS, ...(LS('mep.A') || {}) };
let C = JSON.parse(JSON.stringify(CATS)); { const s = LS('mep.C'); if (s) for (const k in s) Object.assign(C[k] ||= {}, s[k]); }
let model = null, R = null, G = { elevators: [], lobbies: [] }, detailState = 0;
let tab = 'sum', floorSel = -1, ortho = true, dark = false, selected = null, kpiSel = null, explode = 0;
const L = P.levels, roofIdx = L.length - 1;
const flName = i => i === -1 ? 'B1' : i === roofIdx ? 'RT' : 'L' + String(i + 1).padStart(2, '0');

// ---------- colours ----------
const STC = { ok: '#2b8a3e', warn: '#e67700', fail: '#c92a2a', info: '#5c7cfa' };
const GRPCOL = { 'A-1': '#d6336c', 'A-2': '#f76707', 'A-3': '#f2b705', B: '#339af0', M: '#9775fa', '-': '#adb5bd' };
const grpOf = cat => C[cat]?.grp || '-';
const COLR = { stair: '#2b8a3e', vest: '#12b886', elev: '#495057', fse: '#e03131', elobby: '#4dabf7', sp: '#a61e4d', atr: '#fd7e14', imm: '#7048e8', tech: '#e8b04a', fcc: '#1971c2' };
const MARK = { ok: '✓', warn: '!', fail: '✕', info: 'i' };

// ---------- three setup ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.localClippingEnabled = true; renderer.setPixelRatio(Math.min(2, devicePixelRatio));
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const BG = { light: new THREE.Color('#f7f7f4'), dark: new THREE.Color('#15171a') };
scene.background = BG.light;
const pcam = new THREE.PerspectiveCamera(28, 1, 0.5, 3000), ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
let camera = ocam;
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.12;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(60, -80, 140); scene.add(sun);
const bmin = new THREE.Vector3(Infinity, Infinity, P.basementZ ?? L[0].z), bmax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
for (const l of L) for (const t of l.tris) for (let k = 0; k < 6; k += 2) { bmin.x = Math.min(bmin.x, t[k]); bmin.y = Math.min(bmin.y, t[k + 1]); bmax.x = Math.max(bmax.x, t[k]); bmax.y = Math.max(bmax.y, t[k + 1]); }
for (const v of P.volumes) bmax.z = Math.max(bmax.z, v.zmax);
const center = bmin.clone().add(bmax).multiplyScalar(0.5), radius = bmin.distanceTo(bmax) / 2;
const clipLo = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e4), clipHi = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4), CLIP = [clipLo, clipHi];

// ---------- layers ----------
// [key, label, default on, swatch]; 'line:'/'dline:' swatches draw a solid / dashed line sample
const LAYERS = [
  ['Base', [['slabs', 'Slabs', 1], ['labels', 'Floor labels + egress status', 1], ['occ', 'Programme by occupancy group', 1, 'tree'], ['occTags', 'Occupant load tags', 1], ['core', 'Core walls (core model)', 1], ['walls', 'Walls cut at +1.0 m (routing)', 1, '#343a40']]],
  ['Vertical exits', [['stairs', 'Exit stair enclosures', 1, COLR.stair], ['stairGeo', 'Stair flights (core model)', 0], ['stairTags', 'Stair ID tags', 1], ['vest', 'Smokeproof vestibules', 1, COLR.vest], ['roof', 'Stairway to roof', 1, 'tup:' + STC.fail], ['base', 'Basement exits', 1, 'tdn:' + STC.fail], ['cutdoor', 'Stair doors opening onto no floor', 1, STC.fail]]],
  ['Horizontal egress', [['heat', 'Walking distance to nearest exit (map)', 0, 'grad'], ['paths', 'Path of travel (most remote point of each space → nearest exit)', 1, 'oline:' + STC.ok], ['cpet', 'Common path of egress travel', 1, 'cline:' + STC.ok], ['travel2', 'Second exit path (Group A)', 0, 'pline:' + STC.ok], ['sep', 'Exit separation vs ⅓ diagonal', 0, 'chline:#868e96'], ['unreach', 'Floor with no path to a stair', 1, STC.fail]]],
  ['Elevators', [['elev', 'Elevator cars', 1, COLR.elev], ['fse', 'Fire service access elevator (candidates)', 1, COLR.fse], ['elobby', 'Elevator lobby', 1, COLR.elobby]]],
  ['Hazards & separation', [['atrium', 'Multi-storey volumes (atrium)', 1, COLR.atr], ['imm', 'Immersive halls (§411)', 0, COLR.imm], ['mix', 'Mixed-occupancy floors (§508.4)', 0, 'dline:' + STC.fail]]],
  ['Context', [['shell', 'Basement / site context', 0], ['tech', 'Basement technical rooms', 1, COLR.tech]]],
];
const SVGL = (stroke, w, dash = '', cap = 'butt', op = 1) => `<svg width="22" height="10" style="vertical-align:middle;flex:none"><line x1="2" y1="5" x2="20" y2="5" stroke="${stroke}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="${cap}" opacity="${op}"/></svg>`;
const BOX = (fill, op = 1, border = '') => `<i class="sw" style="background:${fill};opacity:${op};${border ? `outline:1.5px solid ${border};outline-offset:-1.5px;` : ''}flex:none"></i>`;
const OUT = c => `<i class="sw" style="background:transparent;outline:2px solid ${c};outline-offset:-2px;flex:none"></i>`;
const TAG = c => `<i style="display:inline-block;width:18px;height:10px;background:#fff;border:1px solid #c9ccd1;border-left:3px solid ${c};flex:none"></i>`;
const DOT = (c, r = 4) => `<svg width="22" height="10" style="vertical-align:middle;flex:none"><circle cx="11" cy="5" r="${r}" fill="${c}"/></svg>`;
const GRAD = '<i class="sw" style="width:22px;background:linear-gradient(90deg,#d3f9d8,#ffe066 33%,#f76707 53%,#c92a2a 67%,#862e9c);flex:none"></i>';
const INK = 'var(--ink)';
// [legend row: 1 = areas / volumes, 2 = lines, markers and tags, swatch, legend text]
const LEG = {
  slabs: [1, BOX('#d9dbd6', 1, '#7c8189'), 'Slab'],
  labels: [2, TAG(STC.ok), 'Floor label (status)'],
  occTags: [2, TAG(GRPCOL['A-3']), 'Occupant load (group colour)'],
  core: [1, BOX('#c9ccd1', 0.5, '#6c727a'), 'Core walls'],
  walls: [2, SVGL('#343a40', 2), 'Wall cut at +1.0 m'],
  stairs: [1, BOX(COLR.stair, 0.45, COLR.stair), 'Exit stair'],
  stairGeo: [1, BOX('#c3e6cb'), 'Stair flights'],
  stairTags: [2, TAG(COLR.stair), 'Stair ID'],
  vest: [1, BOX(COLR.vest, 0.6, COLR.vest), 'Smokeproof vestibule'],
  roof: [2, `<svg width="22" height="15" style="vertical-align:middle;flex:none">${[0, 6, 12].map(y => `<path d="M8.5 ${y + 3}L11 ${y}L13.5 ${y + 3}Z" fill="${STC.fail}"/>`).join('')}</svg>`, 'No stair to roof (missing run, up)'],
  base: [2, `<svg width="22" height="15" style="vertical-align:middle;flex:none">${[0, 6, 12].map(y => `<path d="M8.5 ${y}L11 ${y + 3}L13.5 ${y}Z" fill="${STC.fail}"/>`).join('')}</svg>`, 'No stair to basement (missing run, down)'],
  cutdoor: [2, TAG(STC.fail), 'Stair door onto no floor'],
  heat: [1, GRAD, 'Walking distance 0 · 75 · 150 · 240 ft'],
  cpet: [2, SVGL(STC.ok, 3.6), 'Common path of egress travel'],
  paths: [2, SVGL(STC.ok, 3.6, '0.5 10.1', 'round'), 'Path of travel'],
  travel2: [2, SVGL(STC.ok, 3.6, '0.5 2.6 0.5 7', 'round'), '2nd exit (Group A)'],
  sep: [2, '<svg width="22" height="12" style="vertical-align:middle;flex:none" opacity="0.5"><line x1="2" y1="3" x2="20" y2="3" stroke="#868e96" stroke-width="1.3" stroke-dasharray="7 2"/><line x1="2" y1="0.5" x2="2" y2="5.5" stroke="#868e96" stroke-width="1.4"/><line x1="20" y1="0.5" x2="20" y2="5.5" stroke="#868e96" stroke-width="1.4"/><line x1="2" y1="9" x2="20" y2="9" stroke="' + STC.ok + '" stroke-width="2" stroke-dasharray="7 2"/><line x1="2" y1="6.5" x2="2" y2="11.5" stroke="' + STC.ok + '" stroke-width="1.8"/><line x1="20" y1="6.5" x2="20" y2="11.5" stroke="' + STC.ok + '" stroke-width="1.8"/></svg>', 'Max diagonal × ⅓ · exit separation (door to door)'],
  unreach: [1, BOX(STC.fail, 0.45), 'Floor with no route to a stair'],
  elev: [1, BOX(COLR.elev, 0.5, COLR.elev), 'Elevator car'],
  fse: [1, OUT(COLR.fse), 'FSE candidate'],
  elobby: [1, BOX(COLR.elobby, 0.45, COLR.elobby), 'Elevator lobby'],
  atrium: [1, OUT(COLR.atr), 'Multi-storey volume (atrium)'],
  imm: [1, BOX(COLR.imm, 0.35), 'Immersive hall (§411)'],
  mix: [2, SVGL(STC.fail, 2.2, '7 2'), 'Mixed-occupancy floor (§508.4)'],
  shell: [1, BOX('#bfc3c8', 0.4, '#9a9fa6'), 'Basement / site context'],
  tech: [1, BOX(COLR.tech, 0.35, COLR.tech), 'Basement technical room'],
};
const STATUS_LAYERS = ['paths', 'cpet', 'travel2', 'labels', 'sep'];
const savedLay = LS('ls.layers') || {};
const sw = s => !s ? '' : s === 'grad' ? '<span class="sw" style="width:16px;background:linear-gradient(90deg,#d3f9d8,#ffe066,#f76707,#c92a2a)"></span>' : s.startsWith('cline:') ? `<span class="ln" style="border-color:${s.slice(6)};border-top-width:2.24px"></span>` : s.startsWith('sline:') ? `<svg width="16" height="8" style="vertical-align:middle"><line x1="2" y1="4" x2="15" y2="4" stroke="${s.slice(6)}" stroke-width="2" stroke-dasharray="0.5 5" stroke-linecap="round"/></svg>` : s.startsWith('pline:') ? `<svg width="16" height="8" style="vertical-align:middle"><line x1="2" y1="4" x2="15" y2="4" stroke="${s.slice(6)}" stroke-width="2.24" stroke-dasharray="0.35 1.8 0.35 5" stroke-linecap="round"/></svg>` : s.startsWith('oline:') ? `<svg width="16" height="8" style="vertical-align:middle"><line x1="2" y1="4" x2="15" y2="4" stroke="${s.slice(6)}" stroke-width="2.24" stroke-dasharray="0.35 7.15" stroke-linecap="round"/></svg>` : s.startsWith('line:') ? `<span class="ln" style="border-color:${s.slice(5)}"></span>` : s.startsWith('tup:') || s.startsWith('tdn:') ? `<svg width="16" height="15" style="vertical-align:middle">${[0, 6, 12].map(y => s.startsWith('tup:') ? `<path d="M5.5 ${y + 3}L8 ${y}L10.5 ${y + 3}Z" fill="${s.slice(4)}"/>` : `<path d="M5.5 ${y}L8 ${y + 3}L10.5 ${y}Z" fill="${s.slice(4)}"/>`).join('')}</svg>` : s.startsWith('gbox:') ? `<span class="sw" style="background:${s.slice(5)}26;outline:1.5px solid ${s.slice(5)};outline-offset:-1.5px"></span>` : s.startsWith('chline:') ? `<svg width="16" height="8" style="vertical-align:middle"><line x1="1" y1="4" x2="15" y2="4" stroke="${s.slice(7)}" stroke-width="1.6" stroke-dasharray="6 2" opacity="0.5"/></svg>` : s.startsWith('dline:') ? `<span class="ln d" style="border-color:${s.slice(6)}"></span>` : `<span class="sw" style="background:${s}"></span>`;
// layer list: group headings switch a whole group; Clear selection turns every layer off
const ALWAYS = new Set();
let volOp = Math.min(0.3, Math.max(0.05, LS('ls.volOp') ?? 0.07));
{
  const grps = [...new Set(P.volumes.map(v => grpOf(v.cat)))].sort();
  const row = (k, l, on, s) => {
    const chk = ALWAYS.has(k) || (savedLay[k] ?? !!on), dis = ALWAYS.has(k) ? 'disabled title="Always shown"' : '';
    if (s === 'tree') return `<div class="tnode"><div class="trow"><span class="caret">▶</span><label class="chk"><input type="checkbox" data-layer="${k}" ${chk ? 'checked' : ''}>${l}</label></div><div class="tkids" hidden>${grps.map(g => `<label class="chk"><input type="checkbox" data-grp="${g}" checked><span class="sw" style="background:${GRPCOL[g] || '#999'}"></span>${g === '-' ? 'Other / accessory' : 'Group ' + g} <small style="color:var(--mute)">${P.volumes.filter(v => grpOf(v.cat) === g).length}</small></label>`).join('')}</div></div>`
      + `<div class="row" style="margin-left:34px"><label>Opacity</label><input type="range" id="volOp" min="0.05" max="0.3" step="0.01" value="${volOp}" style="width:100px"></div>`;
    return `<label class="chk"><input type="checkbox" data-layer="${k}" ${chk ? 'checked' : ''} ${dis}>${LEG[k] ? LEG[k][1] : sw(s)}${l}</label>`;
  };
  $('#layers').innerHTML = `<button class="btn" id="bLayClear" style="width:100%;margin-bottom:8px">Clear selection</button>`
    + `<div class="row" style="gap:10px;font-size:11px;color:var(--mute);margin:0 0 6px">Line colour = status ${[['ok', 'OK'], ['fail', 'Fails']].map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--ink)"><i class="sw" style="background:${STC[k]}"></i>${l}</span>`).join('')}</div>`
    + LAYERS.map(([h, ls]) => `<div class="tnode lgh">${groupHead(h)}<div class="tkids">${ls.map(([k, l, on, s]) => row(k, l, on, s)).join('')}</div></div>`).join('');
  $$('#layers .lgh').forEach(wireLayerGroup); alignLayerRows($('#layers'));
}
const syncGroups = () => window.syncLayerGroups();
const setLayers = on => { for (const [, ls] of LAYERS) for (const [k, , d] of ls) { const c = $(`[data-layer="${k}"]`); if (c && !c.disabled) c.checked = on === 'defaults' ? !!d : !!on; } $$('[data-grp]').forEach(c => c.checked = true); syncGroups(); applyVis(); };
$('#bLayClear').onclick = () => setLayers(false);
document.addEventListener('input', e => { if (e.target.id === 'volOp') { volOp = +e.target.value; SS('ls.volOp', volOp); for (const id in volObj) { const m = volObj[id].mesh; if (m !== hiObj) m.material.opacity = volOp; else m.userData.op0 = volOp; } } });
document.addEventListener('click', e => { const c = e.target.closest('.caret'); if (!c || c.classList.contains('leaf')) return; const k = c.parentElement.nextElementSibling; k.hidden = !k.hidden; c.classList.toggle('open', !k.hidden); });
// the layer list carries the swatches, so the view has no separate legend box
$('#legend').style.display = 'none';

// ---------- object helpers ----------
const root = new THREE.Group(); scene.add(root);
const statG = new THREE.Group(), dynG = new THREE.Group(); root.add(statG, dynG);
const pickables = [], lineMats = [];
function put(parent, layer, o, fl = null) { o.userData.layer = layer; o.userData.fl = fl; parent.add(o); return o; }
function meshFrom(v, t) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(t); g.computeVertexNormals(); return g; }
function boxObj(b, color, op, clip = true, edgeOp = 0.9) {
  const g = new THREE.BoxGeometry(Math.max(b[3] - b[0], 0.05), Math.max(b[4] - b[1], 0.05), Math.max(b[5] - b[2], 0.05));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: clip ? CLIP : null }));
  m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color, transparent: true, opacity: edgeOp, clippingPlanes: clip ? CLIP : null })));
  return m;
}
function line(pts, color, w = 3, dashed = false, dash = 1, gap = 0.6, world = false) {   // world: w in metres instead of pixels
  const g = new LineGeometry(); g.setPositions(pts.flat());
  const m = new LineMaterial({ color, linewidth: w, dashed, dashSize: dash, gapSize: gap, transparent: true, depthTest: false, worldUnits: world });
  m.resolution.set(view.clientWidth || 800, view.clientHeight || 600); lineMats.push(m);
  const l = new Line2(g, m); l.computeLineDistances(); l.renderOrder = 6; return l;
}
function chain(a, b, color, w = 2, pat = [2, 0.5, 0.2, 0.5]) {   // dash-dot line (long dash, gap, short dash, gap), one segment set
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, P = [], at = t => a.map((v, k) => v + (b[k] - v) * t / L);
  for (let t = 0, i = 0; t < L; t += pat[i % 4], i++) if (i % 2 === 0) P.push(...at(t), ...at(Math.min(t + pat[i % 4], L)));
  const g = new LineSegmentsGeometry(); g.setPositions(P);
  const m = new LineMaterial({ color, linewidth: w, transparent: true, depthTest: false });
  m.resolution.set(view.clientWidth || 800, view.clientHeight || 600); lineMats.push(m);
  const l = new LineSegments2(g, m); l.renderOrder = 6; return l;
}
// split a route where it moves more than 0.5 m away from a reference polyline (the common path): [shared length m, rest]
function leaveAt(pts, ref) {
  if (!ref || ref.length < 2 || !pts || pts.length < 2) return [0, pts];
  const sd = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
  const off = q => { let m = Infinity; for (let n = 1; n < ref.length; n++) m = Math.min(m, sd(q, ref[n - 1], ref[n])); return m > 0.5; };
  let acc = 0;
  for (let n = 1; n < pts.length; n++) {
    const a = pts[n - 1], b = pts[n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= L; t += 0.1) { const m = [a[0] + (b[0] - a[0]) * t / (L || 1), a[1] + (b[1] - a[1]) * t / (L || 1)]; if (off(m)) return [acc + t, [m, ...pts.slice(n)]]; }
    acc += L;
  }
  return [acc, [pts[pts.length - 1]]];
}
function arrowsV(a, b, color, h = 0.5, r = 0.3) {   // vertical run of triangles (cones) pointing from a to b, one arrow height apart: up to the roof, down to the basement
  const L = Math.abs(b[2] - a[2]), up = b[2] > a[2], n = Math.max(1, Math.round(L / (2 * h))), hh = L / n;   // hh = step = arrow + gap
  const m = new THREE.InstancedMesh(new THREE.ConeGeometry(r, hh / 2, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }), n);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(up ? Math.PI / 2 : -Math.PI / 2, 0, 0)), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
  for (let i = 0; i < n; i++) m.setMatrixAt(i, M.compose(V.set(a[0], a[1], a[2] + (up ? 1 : -1) * (i + 0.5) * hh), Q, S));
  m.renderOrder = 8; m.userData.poly = [a, b]; m.userData.polyStyle = up ? 'triU' : 'triD'; m.userData.polyN = n; return m;
}
function dots(pts, color, step = 0.55, r = 0.11, pair = 0) {   // pair > 0: two dots this far apart at every step (second exit path)
  const P = []; let carry = 0;
  for (let n = 1; n < pts.length; n++) {
    const a = pts[n - 1], b = pts[n], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const at = t => [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L, a[2] + (b[2] - a[2]) * t / L];
    for (let t = carry; t <= L; t += step) { P.push(at(t)); if (pair && t + pair <= L) P.push(at(t + pair)); }
    carry = ((carry - L) % step + step) % step;
  }
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }), P.length);
  const M = new THREE.Matrix4(); P.forEach((p, i) => m.setMatrixAt(i, M.makeTranslation(p[0], p[1], p[2]))); m.renderOrder = 8; m.userData.poly = pts; m.userData.polyStyle = pair ? 'dots2' : 'dots'; return m;
}
function arrows(pts, color, step = 2.2, size = 0.55) {   // thin line with chevrons pointing to the exit
  const g = new THREE.Group(); g.add(line(pts, color, 1.6));
  const shape = new THREE.BufferGeometry(); shape.setAttribute('position', new THREE.Float32BufferAttribute([size, 0, 0, -size * 0.7, size * 0.6, 0, -size * 0.3, 0, 0, -size * 0.7, -size * 0.6, 0, size, 0, 0, -size * 0.3, 0, 0], 3));
  const T = []; let carry = step / 2;
  for (let n = 1; n < pts.length; n++) { const a = pts[n - 1], b = pts[n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = carry; t <= L; t += step) T.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L, a[2], Math.atan2(b[1] - a[1], b[0] - a[0])]); carry = ((carry - L) % step + step) % step; }
  const m = new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, side: THREE.DoubleSide }), Math.max(T.length, 1));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), S1 = new THREE.Vector3(1, 1, 1);
  T.forEach((t, i) => m.setMatrixAt(i, M.compose(new THREE.Vector3(t[0], t[1], t[2]), Q.setFromAxisAngle(Z, t[3]), S1))); m.count = T.length; m.renderOrder = 7; g.add(m); return g;
}
function dim(a, b, z, color, w = 2, dashed = false, op = 1) {   // dimension line: straight measurement with end ticks; dashed = 'chain' draws dash-dot; op: opacity
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.8, ny = dx / L * 0.8;
  const g = new THREE.Group(); g.add(dashed === 'chain' ? chain([...a, z], [...b, z], color, w) : line([[...a, z], [...b, z]], color, w, dashed, 3, 1));   // long dashes
  for (const p of [a, b]) g.add(line([[p[0] - nx, p[1] - ny, z], [p[0] + nx, p[1] + ny, z]], color, w + 1));
  if (op < 1) g.traverse(o => { if (o.material) o.material.opacity = op; });
  return g;
}
function dot(p, color, r = 0.35) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true })); m.position.set(...p); m.renderOrder = 7; return m; }
function tag(txt, color = '#868e96', size = 1) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), F = '600 30px IBM Plex Mono, monospace';
  x.font = F; const w = Math.ceil(x.measureText(txt).width) + 22; c.width = w; c.height = 56; x.font = F;
  x.fillStyle = 'rgba(255,255,255,0.93)'; x.fillRect(0, 6, w, 44); x.fillStyle = color; x.fillRect(0, 6, 6, 44); x.fillStyle = '#1d1f22'; x.fillText(txt, 12, 39);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.userData.text = txt; s.userData.px = Math.max(12, 15 * size); s.userData.asp = w / 56; s.scale.set(s.userData.asp, 1, 1); s.center.set(0, 0); s.renderOrder = 10; return s;
}
const RAMP = [[0, '#d3f9d8'], [0.5, '#ffe066'], [0.8, '#f76707'], [1, '#c92a2a'], [1.6, '#862e9c']].map(([t, c]) => [t, new THREE.Color(c)]);
const ramp = t => { for (let n = 1; n < RAMP.length; n++) if (t <= RAMP[n][0]) { const [a, ca] = RAMP[n - 1], [b, cb] = RAMP[n]; return ca.clone().lerp(cb, (t - a) / (b - a)); } return RAMP[RAMP.length - 1][1].clone(); };
const at = (s, x, y, z) => { s.position.set(x, y, z); return s; };
// length labels sit at the middle of their line, turned to run along it like a dimension (placed in layoutTags)
const along = (s, pts, z) => { s.userData.along = pts.map(p => [p[0], p[1]]); s.center.set(0.5, -0.25); const m = pts[Math.floor(pts.length / 2)]; s.position.set(m[0], m[1], z); return s; };
const bctr = b => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2];

// ---------- static scene: slabs, programme, context ----------
L.forEach((l, i) => {
  const v = [], t = []; for (const tr of l.tris) { const b = v.length / 3; v.push(tr[0], tr[1], l.z, tr[2], tr[3], l.z, tr[4], tr[5], l.z); t.push(b, b + 1, b + 2); }
  const g = meshFrom(v, t);
  put(statG, 'slabs', new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd9dbd6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })), i);
  put(statG, 'slabs', new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), new THREE.LineBasicMaterial({ color: 0x7c8189, transparent: true, opacity: 0.8 })), i);
});
const volObj = {};
for (const vm of P.volMeshes || []) {
  const vol = P.volumes.find(v => v.id === vm.id); if (!vol) continue;
  const g = meshFrom(vm.v, vm.t), col = GRPCOL[grpOf(vol.cat)] || '#999';
  const me = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: volOp, depthWrite: false, side: THREE.DoubleSide }));
  me.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.7 })));
  me.userData.pick = { type: 'zone', id: vol.id }; me.userData.grp = grpOf(vol.cat);
  put(statG, 'occ', me, vol.floor); pickables.push(me); volObj[vol.id] = { mesh: me, g };
}
for (const m of P.shell || []) { const g = meshFrom(m.v, m.t); put(statG, 'shell', new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xbfc3c8, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }))); put(statG, 'shell', new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: 0x9a9fa6, transparent: true, opacity: 0.5 }))); }
for (const m of P.context || []) if (m.layer === 'technical_room_availability_basement') {
  const g = meshFrom(m.v, m.t);
  put(statG, 'tech', new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: COLR.tech, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })), -1);
  put(statG, 'tech', new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: COLR.tech })), -1);
}

// core model: walls + stair flights for display, elevator / lobby clusters for the checks
function loadDetail() {
  detailState = 1;
  return new Promise(res => {
    if (window.DETAIL) return res(window.DETAIL);
    const sc = document.createElement('script'); sc.src = (window.DATA_DIR || '') + 'detail-data.js?v=' + (window.APP_V || '');
    sc.onload = () => res(window.DETAIL); sc.onerror = () => res(null); document.head.appendChild(sc);
  }).then(D => {
    if (!D) { detailState = 3; toast('Core model (detail-data.js) not found — elevator checks limited'); regen(); return; }
    const b64 = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
    for (const l of D.layers) {
      const key = l.name === '00_WALLS' ? 'core' : l.name === '01_STAIRS' ? 'stairGeo' : null; if (!key) continue;
      const q = b64(l.v, Int16Array), pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i += 3) { pos[i] = q[i] / 100 + D.origin[0]; pos[i + 1] = q[i + 1] / 100 + D.origin[1]; pos[i + 2] = q[i + 2] / 100 + D.origin[2]; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(b64(l.t, Uint32Array), 1)); g.computeVertexNormals();
      if (key === 'core') {
        put(statG, key, new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc9ccd1, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: CLIP })));
        put(statG, key, new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x6c727a, transparent: true, opacity: 0.3, clippingPlanes: CLIP })));
      } else put(statG, key, new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#c3e6cb', roughness: 0.8, side: THREE.DoubleSide, clippingPlanes: CLIP })));
    }
    G = clusterDetail(D, L.map(l => l.z)); detailState = 2; regen();
  });
}

// ---------- analysis overlays (rebuilt on every regen) ----------
function buildLS() {
  dynG.traverse(o => { o.geometry?.dispose(); if (o.material?.map) o.material.map.dispose(); });
  dynG.clear(); lineMats.length = 0;
  for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData.dyn) pickables.splice(i, 1);
  const pk = (o, pick) => { o.userData.pick = pick; o.userData.dyn = true; pickables.push(o); return o; };
  const lz = i => L[i].z;
  // flat footprint on each floor (vertical boxes are edge-on in plan views)
  const plan = (layer, b, color, op, floors, pick, planOnly = false) => { for (const i of floors) { const m = new THREE.Mesh(new THREE.PlaneGeometry(b[3] - b[0], b[4] - b[1]), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, L[i].z + 0.12); m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color })));
    if (planOnly) m.userData.planOnly = 1; put(dynG, layer, pick ? pk(m, pick) : m, i); } };
  const flIn = b => L.map((l, i) => i).filter(i => b[2] <= L[i].z + 0.5 && b[5] >= L[i].z + 0.5);
  // floor labels with egress status
  R.rows.forEach(r => { const s = tag(`${r.name} +${r.z.toFixed(1)}  ${MARK[r.status]} ${fmt(r.occ)} occ`, STC[r.status], 1.3); s.center.set(1, 0); put(dynG, 'labels', at(s, bmin.x - 2, bmax.y + 2, r.z + 0.3), r.idx); });
  // occupant tags per zone
  R.rows.forEach(r => r.zones.forEach(z => { if (z.synthetic) return;
    put(dynG, 'occTags', at(tag(`${z.grp} · ${fmt(z.occ)}`, GRPCOL[z.grp] || '#999', 0.9), z.p[0], z.p[1], r.z + 2.2), r.idx); }));
  // stairs and vestibules (standpipes are on the MEP page)
  for (const s of R.stairs) {
    put(dynG, 'stairs', pk(boxObj(s.b, COLR.stair, 0.16), { type: 'stair', id: s.id }));
    const c = bctr(s.b);
    for (const i of s.floors) put(dynG, 'stairTags', at(tag(s.id, COLR.stair, 0.9), c[0], c[1], lz(i) + 1.0), i);
    plan('stairs', s.b, COLR.stair, 0.35, s.floors, { type: 'stair', id: s.id }, true);
    if (s.vest) { put(dynG, 'vest', pk(boxObj(s.vest.b, COLR.vest, 0.3), { type: 'lobby', id: s.vest.id })); plan('vest', s.vest.b, COLR.vest, 0.45, flIn(s.vest.b), { type: 'lobby', id: s.vest.id }); }
  }
  // stairway to roof
  const roofZ = L[roofIdx].z, toRoof = R.stairs.filter(s => s.toRoof);
  if (toRoof.length) for (const s of toRoof) { const c = bctr(s.b); put(dynG, 'roof', at(tag(`${s.id} → roof ✓`, STC.ok), c[0], c[1], roofZ + 1.5), roofIdx); }
  else {
    const s = [...R.stairs].sort((a, b) => b.top - a.top)[0];
    if (s) { const c = bctr(s.b);
      put(dynG, 'roof', arrowsV([c[0], c[1], s.top], [c[0], c[1], roofZ + 0.2], STC.fail), roofIdx);   // up arrows: the missing stair run to the roof
      put(dynG, 'roof', at(tag(`No stair to roof · ${s.id} stops at +${s.top.toFixed(1)}`, STC.fail), c[0], c[1], roofZ + 1.2), roofIdx); }
  }
  // basement exits
  if (P.basementZ != null && P.basementZ < L[0].z - 1) {
    const toB = R.stairs.filter(s => s.toBase);
    if (!toB.length) for (const s of R.stairs) { const c = bctr(s.b); put(dynG, 'base', arrowsV([c[0], c[1], s.bot], [c[0], c[1], P.basementZ], STC.fail), -1); }   // down arrows: the missing stair run to the basement
    const t = (P.mep?.tech || [])[0]?.bbox;
    put(dynG, 'base', at(tag(toB.length ? `Basement exits: ${toB.map(s => s.id).join(', ')}` : 'Basement: no exit stair in the model', toB.length ? STC.ok : STC.fail), t ? t[0] : bmin.x, t ? t[1] : bmin.y, P.basementZ + 1.5), -1);
  }
  // per floor egress geometry
  for (const r of R.rows) {
    const z = r.z + 0.25;
    const mid = pth => pth[Math.floor(pth.length / 2)] ?? pth[0];
    for (const zn of r.zones) if (zn.path) {
      // path of travel: from the most remote point of the space to the nearest reachable exit
      // the common part is the solid line; the dots continue from where the two routes separate
      if (zn.rpath?.length > 1) put(dynG, 'paths', dots(zn.rpath.map(q => [...q, z]), STC[zn.status], 1.6, 0.182), r.idx);   // same rhythm as the second exit path: one dot per step there, two here
      const tp = zn.rpath?.length > 1 ? zn.rpath : zn.path; put(dynG, 'paths', along(tag(`travel ${zn.rpath?.length > 1 && zn.cpet != null ? `${Math.round(zn.cpet)} + ${Math.round(zn.dist) - Math.round(zn.cpet)} = ` : ''}${fmt(zn.dist)} / ${zn.lim} ft → ${zn.stair}`, STC[zn.status], 0.8), tp, z + 0.4), r.idx);
      // common path of egress travel: the shared part before the routes to two exits separate
      if (zn.cpath?.length > 1) {
        put(dynG, 'cpet', line(zn.cpath.map(q => [...q, z]), STC[zn.cpStatus], 0.364, false, 1, 0.6, true), r.idx);   // width = path-of-travel dot diameter (2 × 0.182 m)
        const core = line(zn.cpath.map(q => [...q, z]), STC[zn.cpStatus], 1.5); core.userData.noExport = 1; put(dynG, 'cpet', core, r.idx);   // 1.5 px core: a world-width line thinner than ~2 px breaks up when zoomed out
      }
      { const cs = tag(`common path ${fmt(zn.cpet)} / ${zn.cpLim} ft${zn.oneExit ? ' (one exit)' : ''}`, STC[zn.cpStatus], 0.8); put(dynG, 'cpet', zn.cpath?.length > 1 ? along(cs, zn.cpath, z + 0.4) : at(cs, zn.p[0], zn.p[1], z + 1.3), r.idx); }
      if (zn.path2) { const st = zn.dist2 > zn.lim2 ? 'fail' : 'ok';
        const [sh, rest2] = leaveAt(zn.path2, zn.path), shFt = sh * 3.28084;   // drawn only where it leaves the first route (common path + path of travel), so they never overlap
        if (rest2.length > 1) put(dynG, 'travel2', dots(rest2.map(q => [...q, z + 0.1]), STC[st], 1.6, 0.182, 0.525), r.idx);
        const t2 = rest2.length > 1 ? rest2 : zn.path2; put(dynG, 'travel2', along(tag(`2nd exit ${shFt >= 0.5 ? `${Math.round(shFt)} + ${Math.round(zn.dist2) - Math.round(shFt)} = ` : ''}${fmt(zn.dist2)} / ${zn.lim2} ft → ${zn.stair2}`, STC[st], 0.75), t2, z + 0.4), r.idx); }
    }
    for (const c of r.cutDoors || []) put(dynG, 'cutdoor', at(tag(`${c.id}: door opens onto no floor`, STC.fail, 0.85), c.p[0], c.p[1], r.z + 0.6), r.idx);
    if (r.diagPts[0] && r.occ) {
      put(dynG, 'sep', dim(r.diagPts[0], r.diagPts[1], z, '#868e96', 1.6, true, 0.5), r.idx);
      put(dynG, 'sep', along(tag(`diagonal ${fmt(r.diag)} ft × ${fmt(A.sepFraction, 2)} = ${fmt(r.sepReq)} ft${r.grade ? ' between exterior exit doors (not in the model)' : ''}`, '#868e96', 0.8), r.diagPts, z + 0.6), r.idx);
      if (r.pair) {
        const st = r.st.sep, sc = st === 'info' ? '#868e96' : STC[st];   // grade floor: not checked, shown grey
        put(dynG, 'sep', dim(r.pair.pts[0], r.pair.pts[1], z + 0.1, sc, 2.5, true, 0.5), r.idx);
        put(dynG, 'sep', along(tag(`${r.pair.ids.join('–')} ${fmt(r.sepEdge)} ft (door to door)`, sc, 0.8), r.pair.pts, z + 0.6), r.idx);
      }
    }
    if (r.heat?.length) {   // walking distance to the nearest exit, coloured against the 150 ft Group A limit
      const n = r.heat.length / 3, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(r.heatCell, r.heatCell), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), n);
      const M = new THREE.Matrix4();
      for (let q = 0; q < n; q++) { im.setMatrixAt(q, M.makeTranslation(r.heat[q * 3], r.heat[q * 3 + 1], r.z + 0.03)); im.setColorAt(q, ramp(r.heat[q * 3 + 2] / A.travelA1)); }
      im.renderOrder = 1; put(dynG, 'heat', im, r.idx);
    }
    const wl = G.walls?.[r.idx];
    if (wl?.length) { const v = new Float32Array(wl.length / 2 * 3); for (let n = 0, m = 0; n < wl.length; n += 2, m += 3) { v[m] = wl[n]; v[m + 1] = wl[n + 1]; v[m + 2] = r.z + 0.06; }
      const gw = new THREE.BufferGeometry(); gw.setAttribute('position', new THREE.BufferAttribute(v, 3));
      put(dynG, 'walls', new THREE.LineSegments(gw, new THREE.LineBasicMaterial({ color: 0x343a40 })), r.idx); }
    if (r.unreachCells?.length) { const v = new Float32Array(r.unreachCells.length * 3); r.unreachCells.forEach((c, n) => { v[n * 3] = c[0]; v[n * 3 + 1] = c[1]; v[n * 3 + 2] = r.z + 0.08; });
      // one square per grid cell, sized in metres (screen-size points vanish in a large export)
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(r.cell, r.cell), new THREE.MeshBasicMaterial({ color: STC.fail, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), r.unreachCells.length), M = new THREE.Matrix4();
      for (let n = 0; n < r.unreachCells.length; n++) im.setMatrixAt(n, M.makeTranslation(v[n * 3], v[n * 3 + 1], v[n * 3 + 2]));
      put(dynG, 'unreach', im, r.idx);
      if (r.unreachM2 > 2 && !r.roof) { const c = r.unreachCells[Math.floor(r.unreachCells.length / 2)]; put(dynG, 'unreach', at(tag(`${fmt(r.unreachM2)} m² no path to a stair`, STC.fail, 0.85), c[0], c[1], r.z + 1), r.idx); } }
    if (r.groups.length > 1) {
      const v = [], t = []; for (const tr of L[r.idx].tris) { const b = v.length / 3; v.push(tr[0], tr[1], r.z + 0.15, tr[2], tr[3], r.z + 0.15, tr[4], tr[5], r.z + 0.15); t.push(b, b + 1, b + 2); }
      { const eg = new THREE.EdgesGeometry(meshFrom(v, t), 1), pa = eg.attributes.position.array; for (let q = 0; q < pa.length; q += 6) put(dynG, 'mix', line([[pa[q], pa[q + 1], pa[q + 2]], [pa[q + 3], pa[q + 4], pa[q + 5]]], STC.fail, 2.5, true, 2.6, 0.7), r.idx); }
      put(dynG, 'mix', at(tag(`${r.groups.join(' / ')} · separation per Table 508.4`, STC.fail, 0.85), bmax.x + 2, bmin.y, r.z + 0.3), r.idx);
    }
  }
  // elevators and lobbies
  for (const e of R.elevators) {
    put(dynG, 'elev', pk(boxObj(e.b, COLR.elev, 0.28), { type: 'elev', id: e.id }));
    plan(e.fse ? 'fse' : 'elev', e.b, e.fse ? COLR.fse : COLR.elev, 0.35, e.floors, { type: 'elev', id: e.id }, true);   // shaft is continuous; floor footprints only in single-floor views
    if (e.fse) put(dynG, 'fse', boxObj([e.b[0] - 0.08, e.b[1] - 0.08, e.b[2], e.b[3] + 0.08, e.b[4] + 0.08, e.b[5]], COLR.fse, 0.05, true, 1));
    const c = bctr(e.b);
    put(dynG, 'elev', at(tag(`${e.id} ${e.kind[0].toUpperCase()}`, COLR.elev, 0.75), c[0], c[1], e.top + 0.5));
  }
  const fse = R.elevators.filter(e => e.fse);
  if (fse.length) { const b = fse.map(e => e.b), c = [Math.min(...b.map(x => x[0])), Math.min(...b.map(x => x[1]))];
    for (const i of fse[0].floors) put(dynG, 'fse', at(tag(`FSE candidate ${fse.map(e => e.id).join('/')}`, COLR.fse, 0.85), c[0], c[1] - 1.5, L[i].z + 1.8), i); }
  for (const l of R.lobbies) if (l.role === 'elevator lobby') { put(dynG, 'elobby', pk(boxObj(l.b, COLR.elobby, 0.22), { type: 'lobby', id: l.id })); plan('elobby', l.b, COLR.elobby, 0.35, flIn(l.b), { type: 'lobby', id: l.id }); }
  // atrium / immersive
  for (const v of P.volumes) {
    const r = R.rows[v.floor], vo = volObj[v.id]; if (!vo) continue;
    if (r && v.zmax > (L[v.floor + 1]?.z ?? Infinity) + 0.5) put(dynG, 'atrium', new THREE.LineSegments(new THREE.EdgesGeometry(vo.g, 25), new THREE.LineBasicMaterial({ color: COLR.atr })), v.floor);
    if (v.cat === 'immersive') put(dynG, 'imm', new THREE.Mesh(vo.g, new THREE.MeshBasicMaterial({ color: COLR.imm, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })), v.floor);
  }
  applyVis();
}

// ---------- visibility ----------
const DETAIL_TAGS = new Set(['occTags', 'paths', 'cpet', 'travel2', 'sep', 'stairTags', 'fse', 'cutdoor']);
function layState() { return Object.fromEntries($$('[data-layer]').map(c => [c.dataset.layer, c.checked])); }
function applyVis() {
  const lay = layState(), gr = Object.fromEntries($$('[data-grp]').map(c => [c.dataset.grp, c.checked]));
  SS('ls.layers', lay);
  const onFl = f => f == null || floorSel === -1 || (floorSel === -2 ? f === -1 : f === floorSel);
  for (const g of [statG, dynG]) for (const o of g.children) {
    const k = o.userData.layer; let v = !!lay[k] && onFl(o.userData.fl);
    if (k === 'occ') v = v && gr[o.userData.grp] !== false;
    if (k === 'shell') v = v && floorSel < 0;
    if (o.isSprite && floorSel === -1 && DETAIL_TAGS.has(k)) v = false;
    if (o.userData.planOnly && floorSel === -1) v = false;   // per-floor tags only in single-floor views
    // explode: each floor's objects rise by floor × spacing; full-height objects (cores, stair and elevator shafts) hide, as on the MEP page
    const fl = o.userData.fl; if (o.userData.z0 === undefined) o.userData.z0 = o.position.z;
    o.position.z = o.userData.z0 + (fl == null ? 0 : fl * explode);
    if (explode > 0 && fl == null) v = false;
    o.visible = v;
  }
  if (floorSel === -2) { clipLo.constant = -((P.basementZ ?? 0) - 1 - explode); clipHi.constant = L[0].z + 0.5 - explode; }
  else if (floorSel >= 0) { const e = floorSel * explode, z0 = L[floorSel].z - 0.05 + e, z1 = (L[floorSel + 1]?.z ?? L[floorSel].z + 9) - 0.05 + e; clipLo.constant = -z0; clipHi.constant = z1; }
  else { clipLo.constant = 1e4; clipHi.constant = 1e4; }
  status();
}
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.layer || t.dataset.grp) { syncGroups(); applyVis(); }
  else if (t.dataset.a) { const v = parseFloat(t.value); if (isNaN(v)) return; A[t.dataset.a] = v; const s = LS('mep.A') || {}; s[t.dataset.a] = v; SS('mep.A', s); clearTimeout(regen.t); regen.t = setTimeout(regen, 150); }
});

// ---------- assumptions ----------
const AF = [['auditoriumSeats', 'Auditorium fixed seats (0 = 7 net)', 1], ['stairClearIn', 'Stair clear width (in)', 0.5], ['stairFactor', 'Stair capacity (in/occ)', 0.05], ['sepFraction', 'Exit separation × diagonal', 0.01],
  ['travelA1', 'Travel A, primary (ft)', 10], ['travelA2', 'Travel A, secondary (ft)', 10], ['travelM', 'Travel M / S (ft)', 10], ['travelB', 'Travel B (ft)', 10], ['travelAtrium', 'Travel within atrium (ft)', 10]];
function buildInputs() { $('#aInputs').innerHTML = AF.map(([k, l, st]) => `<div class="row"><label>${l}</label><input type="number" step="${st}" data-a="${k}" value="${+(+A[k]).toFixed(3)}"></div>`).join(''); }
$('#bReset').onclick = () => { const s = LS('mep.A') || {}; for (const [k] of AF) { A[k] = DEFAULTS[k]; delete s[k]; } SS('mep.A', s); buildInputs(); regen(); };

// ---------- camera, resize, picking ----------
function resize() {
  const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h);
  pcam.aspect = w / h; pcam.updateProjectionMatrix();
  const s = radius * 1.1; ocam.left = -s * w / h; ocam.right = s * w / h; ocam.top = s; ocam.bottom = -s; ocam.updateProjectionMatrix();
  lineMats.forEach(m => m.resolution.set(w, h));
}
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
  side('lgrip', '--lw', 'ls.lw', 220, x => x, '--rw');
  side('rgrip', '--rw', 'ls.rw', 300, x => innerWidth - x, '--lw');
}
// B1: fit the plan to the basement technical rooms (the basement has no floor plate in the model)
const B1T = P.mep?.tech || [], B1B = B1T.length ? [Math.min(...B1T.map(t => t.bbox[0])), Math.min(...B1T.map(t => t.bbox[1])), Math.max(...B1T.map(t => t.bbox[3])), Math.max(...B1T.map(t => t.bbox[4]))] : null;
const b1Centre = z => B1B ? new THREE.Vector3((B1B[0] + B1B[2]) / 2, (B1B[1] + B1B[3]) / 2, z) : new THREE.Vector3(center.x, center.y, z);
const b1Zoom = () => B1B ? 0.7 * Math.min(2 * ocam.right / (B1B[2] - B1B[0] + 1), 2 * ocam.top / (B1B[3] - B1B[1] + 1)) : 1;
function setView(v) {
  const dirs = { iso: [-1, -1.15, 0.85], iso2: [1.1, -1, 0.8], top: [0, -0.001, 1], front: [0, -1, 0.02], side: [1, 0, 0.02] };
  const d = new THREE.Vector3(...dirs[v]).normalize();
  let tgt = floorSel === -2 ? b1Centre((P.basementZ ?? 0) - explode) : center.clone().add(new THREE.Vector3(0, 0, explode * L.length / 2)), zoom = 1;
  if (floorSel === -2 && v === 'top') zoom = b1Zoom();
  if (floorSel >= 0) {   // fit the floor plate
    const xs = [], ys = []; for (const t of L[floorSel].tris) for (let k = 0; k < 6; k += 2) { xs.push(t[k]); ys.push(t[k + 1]); }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), s = radius * 1.1, asp = view.clientWidth / view.clientHeight;
    tgt = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, L[floorSel].z + floorSel * explode);
    if (v === 'top') zoom = 0.82 * Math.min(2 * s * asp / (x1 - x0 + 1), 2 * s / (y1 - y0 + 1));
  }
  controls.target.copy(tgt); camera.position.copy(tgt).add(d.multiplyScalar(radius * 3.2));
  if (camera === ocam) { ocam.zoom = zoom; ocam.updateProjectionMatrix(); }
  controls.update();
  if (floorSel === -1 && v !== 'top') {   // the floor labels here are long: shift the building right so they stay in view
    camera.updateMatrixWorld(); const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), k = -radius * 0.22;
    controls.target.addScaledVector(right, k); camera.position.addScaledVector(right, k); controls.update();
  }
  markView(v);
}
// the active view button stays highlighted until the camera is rotated away from that direction
let viewDir = null;
function markView(v) { $$('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v)); viewDir = v ? camera.position.clone().sub(controls.target).normalize() : null; }
controls.addEventListener('change', () => { if (viewDir && camera.position.clone().sub(controls.target).normalize().dot(viewDir) < 0.9995) markView(null); });

function setProj(o) { ortho = o; const p = camera.position.clone(), t = controls.target.clone(); camera = o ? ocam : pcam; camera.position.copy(p); controls.object = camera; controls.target.copy(t); controls.update(); $('#bProj').textContent = o ? 'Ortho' : 'Perspective'; $('#bProj').classList.add('on'); }
$('#floorSel').innerHTML = '<option value="-1">All floors</option><option value="-2">B1 · basement</option>' + L.map((l, i) => `<option value="${i}">${flName(i)} · +${l.z.toFixed(1)}</option>`).join('');
$('#explode').oninput = e => { explode = +e.target.value; applyVis(); };
const setFloor = i => { floorSel = i; $('#floorSel').value = i; applyVis(); setView(i === -1 ? 'iso' : 'top'); renderPane(); };
$('#floorSel').onchange = e => setFloor(+e.target.value);
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
  const order = { stair: 0, elev: 1, lobby: 2, zone: 3 };
  const hits = ray.intersectObjects(pickables.filter(o => o.visible), false).filter(h => !h.object.material.clippingPlanes || CLIP.every(p => p.distanceToPoint(h.point) >= -0.01));
  hits.sort((a, b) => order[a.object.userData.pick.type] - order[b.object.userData.pick.type] || a.distance - b.distance);
  select(hits[0]?.object.userData.pick || null);
});
let hiObj = null;
function select(p) {
  if (hiObj) { hiObj.material.opacity = hiObj.userData.op0; hiObj = null; }
  selected = p;
  if (p) { const o = pickables.find(x => x.userData.pick.type === p.type && x.userData.pick.id === p.id); if (o) { hiObj = o; o.userData.op0 = o.material.opacity; o.material.opacity = Math.min(0.6, o.material.opacity * 3 + 0.1); } tab = 'ins'; syncTabs(); }
  renderPane();
}

// ---------- right panel ----------
function syncTabs() { $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); }
$('#tabs').onclick = e => { if (e.target.dataset.t) { tab = e.target.dataset.t; syncTabs(); renderPane(); } };
addEventListener('keydown', e => { if (e.key === 'Escape' && kpiSel) { kpiSel = null; renderPane(); } });
const pill = s => `<span class="pill ${s}">${s}</span>`;
const quotes = k => (LS_Q[k] || []).map(([ref, txt, url]) => `<blockquote><b>${esc(ref)}</b><span>${/Table/.test(ref) && !/§/.test(ref) ? esc(txt) : '“' + esc(txt) + '”'}</span><a href="${url}" target="_blank" rel="noopener">source</a></blockquote>`).join('');
const checked = () => R.rows.filter(r => r.occ && !r.grade && !r.roof);
const worstBy = f => checked().reduce((a, r) => (a == null || f(r) > f(a) ? r : a), null);
const rank = { fail: 3, warn: 2, info: 1, ok: 0 };
const worstSt = arr => arr.reduce((a, s) => rank[s] > rank[a] ? s : a, 'ok');
const item = k => R.items.find(i => i.k === k);

function kpis() {
  // building-wide figures: how many storeys / spaces meet each requirement (not the single worst storey)
  const rows = checked(), n = rows.length, zs = rows.flatMap(r => r.zones);
  const span = n ? `${rows[0].name}–${rows[n - 1].name}` : '–';
  const okN = k => rows.filter(r => r.st[k] === 'ok').length;
  const occAll = R.rows.reduce((a, r) => a + r.occ, 0);
  const cutN = R.rows.reduce((a, r) => a + r.cut.length, 0), ur = R.rows.filter(r => r.unreachM2 > 2 && !r.roof).reduce((a, r) => a + r.unreachM2, 0);
  const fse = R.elevators.filter(e => e.fse), toRoof = R.stairs.filter(s => s.toRoof);
  return [
    ['occ', 'Egress', fmt(occAll), `Occupant load, all storeys (${R.rows.filter(r => r.occ).length} storeys)`, 'info'],
    ['exits', 'Egress', `${okN('exits')} / ${n}`, `Storeys with enough exits (${span})`, worstSt(rows.map(r => r.st.exits))],
    ['cap', 'Egress', `${okN('cap')} / ${n}`, `Storeys within stair capacity, ${fmt(R.capPer)} occ per stair (${span})`, worstSt(rows.map(r => r.st.cap))],
    ['sep', 'Egress', `${okN('sep')} / ${n}`, `Storeys with exit separation ≥ ⅓ diagonal (${span})`, worstSt(rows.map(r => r.st.sep))],
    ['travel', 'Egress', `${zs.filter(z => z.status === 'ok').length} / ${zs.length}`, 'Spaces within the path of travel limit', worstSt(zs.map(z => z.status))],
    ['cpet', 'Egress', `${zs.filter(z => z.cpStatus === 'ok').length} / ${zs.length}`, 'Spaces within the common path limit', worstSt(zs.map(z => z.cpStatus))],
    ['reach', 'Egress', `${cutN}`, `Stair doors opening onto no floor${ur ? ` · ${fmt(ur)} m² with no route` : ''}`, cutN || ur ? 'fail' : 'ok'],
    ['hr', 'High-rise', `${fmt(R.hf)} ft`, 'Top occupied floor above lowest level', item('hr')?.status || 'ok'],
    ['fse', 'Vertical transport', fse.length ? fse.map(e => e.id).join('/') : (detailState < 2 ? '…' : 'none'), 'Fire service access elevator (candidates)', item('fse')?.status || 'info'],
    ['roof', 'Vertical transport', toRoof.length ? toRoof.map(s => s.id).join(', ') : 'none', 'Stairway to roof', item('roof')?.status || 'ok'],
    ['haz', 'High-rise', `${R.rows.filter(r => r.multi.length).length} storeys`, 'Atrium · special amusement · mixed occupancy', 'info'],
  ];
}
function kpiInfo(k) {
  const rows = checked(), ln = a => a.join('\n');
  const olf = (z, i) => { const c = C[z.cat] || {}; return i === 0 && c.olfGrade ? c.olfGrade : c.olf; };
  const I = {
    occ: ['Occupant load', 'NYC BC §1004.1, Table 1004.1.3, §1004.3 (same basis as the MEP page)',
      'per zone: occupants = ⌈area ft² ÷ load factor⌉ (auditorium = fixed seats)\n' + ln(R.rows.filter(r => r.occ).map(r => `${r.name}: ` + r.zones.filter(z => z.occ).map(z => `${z.cat} ${fmt(z.area * M2FT2)} ft²${z.cat === 'auditorium' && A.auditoriumSeats > 0 ? ' (seats)' : ' ÷ ' + olf(z, r.idx)} = ${z.occ}`).join(' + ') + ` = ${fmt(r.occ)}`)),
      'Each storey is taken on its own for stair capacity (§1005.3.1).'],
    exits: ['Number of exits per storey', 'NYC BC §1006.3.1, Table 1006.3.1; stairs sharing a wall count as one (§1007.1.1); a stair counts only if a path on the floor plate reaches its door',
      '1–500 → 2 · 501–1,000 → 3 · > 1,000 → 4\n' + ln(rows.map(r => `${r.name}: ${fmt(r.occ)} occ → ${r.req} required · stairs ${r.stairs.join(', ') || 'none'} → ${r.nExits} ${MARK[r.st.exits]}`)),
      'The grade floor discharges directly outside (doors not in the model) and is shown as info.'],
    cap: ['Stair capacity', 'NYC BC §1005.3.1 (0.3 in per occupant, no sprinkler reduction in NYC); handrails do not reduce the required width (§1005.7.2 → §1014.8)',
      `per stair = clear width ÷ factor = ${A.stairClearIn} in ÷ ${A.stairFactor} = ${fmt(R.capPer)} occupants\n` + ln(rows.map(r => `${r.name}: ${r.stairs.length} × ${fmt(R.capPer)} = ${fmt(r.cap)} vs ${fmt(r.occ)} occ → needs ${fmt(r.capReqIn, 1)} in total${r.stairs.length ? ` (${fmt(r.capReqIn / r.stairs.length, 1)} in per stair)` : ''} ${MARK[r.st.cap]}`)),
      'Stair clear width is not readable from the model; set it under Assumptions.'],
    sep: ['Exit separation', 'NYC BC §1007.1.1 Exception 2 (sprinklered: ⅓ of the maximum overall diagonal of the area served)',
      `required = diagonal × ${fmt(A.sepFraction, 3)}; provided = straight line between the doors of the two farthest exits (stair door, or vestibule door where there is one), stair centre-to-centre in brackets\n` + ln(rows.map(r => `${r.name}: ${fmt(r.diag)} ft × ${fmt(A.sepFraction, 2)} = ${fmt(r.sepReq)} · ${r.pair ? r.pair.ids.join('–') : '—'} ${fmt(r.sepEdge)} (${fmt(r.sepCtr)}) ft ${r.st.sep === 'warn' ? '! only centre-to-centre' : MARK[r.st.sep]}`)),
      'The code measures between exit doors; door positions are not in the model, so the edge gap is the conservative reading and the centre gap the optimistic one.'],
    travel: ['Exit access travel distance (path of travel)', 'NYC BC §1017.2, Table 1017.2 (B 300, M 200 ft sprinklered); Group A per §1029.7, Table 1029.7 (primary 150, secondary 250 ft sprinklered); atrium §404.9.3',
      'from the most remote point of each occupied space, walking on the floor plate to the nearest reachable stair door: around walls (cut at +1.0 m), through openings, never over voids\n' + ln(rows.flatMap(r => r.zones.map(z => `${r.name} ${z.cat} (${z.grp}): ${fmt(z.dist)} / ${z.lim} ft → ${z.stair || '–'}${z.lim2 ? ` · 2nd exit ${fmt(z.dist2)} / ${z.lim2} ft` : ''} ${MARK[z.status]}`))),
      'Rooms in the programme model have no walls or doors yet, so routes leave a space wherever it meets the floor.'],
    cpet: ['Common path of egress travel', 'NYC BC §1006.2.1, Table 1006.2.1 (sprinklered: A and M 75 ft, B 100 ft; column reading to verify); dead ends §1020.4',
      'from the same most remote point: the length of the route to the nearest exit that is shared with the route to a second, different exit (they separate where the purple line ends); one reachable exit = the whole route is common\n' + ln(rows.flatMap(r => r.zones.map(z => `${r.name} ${z.cat} (${z.grp}): ${fmt(z.cpet)} / ${z.cpLim} ft${z.oneExit ? ' (one exit reachable)' : ''} ${MARK[z.cpStatus]}`))),
      'Dead-end corridors (§1020.4) need corridors in the model and are not computed yet.'],
    reach: ['Stairs reachable from each floor', 'NYC BC §1006.3.1 (exits per storey), §1023 (exit stair enclosure)',
      ln(R.rows.filter(r => r.cut.length || (r.unreachM2 > 2 && !r.roof)).map(r => `${r.name}: ${r.cut.length ? `${r.cut.join(', ')} pass the floor but the door opens onto no floor plate` : ''}${r.unreachM2 > 2 ? `${r.cut.length ? ' · ' : ''}${fmt(r.unreachM2)} m² of floor has no route to any stair` : ''}`)) || 'Every stair that passes a floor can be reached from it.',
      'Extend the slab to the stair door, add a door on the side that meets the floor, or confirm the stair does not serve that floor.'],
    hr: ['High-rise', 'NYC BC §403 (occupied floor > 75 ft above the lowest level of fire department vehicle access)',
      `H = (${L[roofIdx - 1].z.toFixed(2)} − ${L[0].z.toFixed(2)}) m × 3.281 = ${fmt(R.hf)} ft\n> 75 ft: smokeproof enclosures, fire command center, standby and emergency power, voice alarm\n> 120 ft: fire service access elevator`,
      'Lowest level of fire department vehicle access taken as the grade floor slab.'],
    fse: ['Fire service access elevator', 'NYC BC §403.6.1, §3007.1',
      R.elevators.length ? ln(R.elevators.map(e => `${e.id} ${e.kind}: +${e.bot.toFixed(1)} → +${e.top.toFixed(1)} m · ${e.floors.length} floors · lobby ${e.lobby || 'none'}${e.lobbyStair ? ' (adjoins ' + e.lobbyStair + ')' : ''}${e.fse ? ' → candidate' : ''}`)) + `\nfloors not reached by any car: ${L.map((l, i) => i).filter(i => !R.elevators.some(e => e.floors.includes(i))).map(flName).join(', ') || 'none'}` : 'Elevators are read from the core model (detail-data.js), which is not loaded.',
      item('fse')?.detail],
    roof: ['Stairway to roof', 'NYC BC §1011.12; Appendix Q (NFPA 14 §7.3.2.1 roof manifold)',
      ln(R.stairs.map(s => `${s.id}: +${s.bot.toFixed(1)} → +${s.top.toFixed(1)} m ${s.toRoof ? '✓ reaches the roof' : `✕ roof at +${L[roofIdx].z.toFixed(1)}`}`)), item('roof')?.detail],
    haz: ['Atrium, special amusement, mixed occupancy', 'NYC BC §404, §411.1, §508.4',
      ln(['atr', 'imm', 'mix'].map(item).filter(Boolean).map(i => `${i.item}: ${i.detail}`)), ''],
  }[k];
  if (!I) return '';
  return `<div class="kinfo"><button class="x" data-kx title="Close">✕</button><h4>${I[0]}</h4><div class="code">${I[1]}</div>${quotes(k)}<div class="f">${esc(I[2])}</div>${I[3] ? `<p>${esc(I[3])}</p>` : ''}</div>`;
}
// cards are grouped under text headings; the left bar colour is the status (legend above the cards)
const STL = { ok: 'OK', fail: 'Fails', info: 'Info' };   // no 'Check' status on this page
const card = ([k, , v, l, st]) => `<div class="kpi s-${st}${kpiSel === k ? ' sel' : ''}" data-k="${k}" title="${STL[st]}"><b>${v}</b><small>${l}</small></div>`;
function renderPane() {
  const pane = $('#pane'); if (!R) return;
  const cnt = R.items.reduce((a, x) => (a[x.status] = (a[x.status] || 0) + 1, a), {});
  const pills = c => ['fail', 'warn', 'ok', 'info'].map(k => c[k] ? `<span class="pill ${k}">${c[k]} ${k}</span> ` : '').join('');
  if (tab === 'sum') {
    const K = kpis(), groups = [...new Set(K.map(x => x[1]))];
    const legend = `<div class="row" style="gap:10px;font-size:11px;color:var(--mute);margin:0 0 8px">Bar colour = status ${Object.entries(STL).map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--ink)"><i style="display:inline-block;width:3px;height:12px;background:var(--${k})"></i>${l}</span>`).join('')}</div>`;
    // detail box goes after the row (pair of cards) holding the selected card, within its group
    const grid = G => { let cards = ''; G.forEach((x, i) => { cards += card(x); const rowEnd = i % 2 === 1 || i === G.length - 1; if (kpiSel && rowEnd && (x[0] === kpiSel || (i % 2 === 1 && G[i - 1][0] === kpiSel))) cards += kpiInfo(kpiSel); }); return `<div class="kpis${kpiSel ? ' focus' : ''}">${cards}</div>`; };
    pane.innerHTML = legend + groups.map(g => `<h3 style="font-size:12px;margin:10px 0 6px">${g}</h3>` + grid(K.filter(x => x[1] === g))).join('') + `
    <h3 style="font-size:12px;margin:6px 0">Checks</h3><div>${pills(cnt)}</div>
    <h3 style="font-size:12px;margin:12px 0 6px">Floors</h3>
    <table><tr><th>Floor</th><th>Occ</th><th>Exits</th><th>Cap</th><th>Sep</th><th>Travel</th><th>CP</th></tr>${R.rows.map(r => `<tr data-f="${r.idx}" class="${floorSel === r.idx ? 'sel' : ''}"><td>${pill(r.status)} ${r.name}</td><td>${fmt(r.occ)}</td>${['exits', 'cap', 'sep', 'travel', 'cpet'].map(k => `<td class="${r.st[k]}">${MARK[r.st[k]]}</td>`).join('')}</tr>`).join('')}</table>
    <div class="note">Click a card for the code text and the calculation with the current numbers. Everything is recomputed from the model on load, so new cores, stairs or programme appear here after re-running tools/build_data.py. DD estimates from straight-line geometry, not a code compliance review.</div>`;
    pane.querySelectorAll('.kpi[data-k]').forEach(el => el.onclick = () => { kpiSel = kpiSel === el.dataset.k ? null : el.dataset.k; renderPane(); });
    pane.querySelector('[data-kx]')?.addEventListener('click', () => { kpiSel = null; renderPane(); });
    pane.querySelectorAll('tr[data-f]').forEach(r => r.onclick = () => setFloor(+r.dataset.f));
  } else if (tab === 'flo') {
    const f = floorSel >= 0 ? R.rows[floorSel] : null;
    pane.innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Floor</th><th>ft</th><th>Occ</th><th>Groups</th><th>Exits req/prov</th><th>Stairs reached</th><th>Cap occ/cap</th><th>⅓ diag</th><th>Sep edge (ctr)</th><th>Travel / lim</th><th>Common path / lim</th><th>2nd / lim</th></tr></thead><tbody>
    ${R.rows.map(r => `<tr data-f="${r.idx}" class="${floorSel === r.idx ? 'sel' : ''}"><td>${pill(r.status)} ${r.name}</td><td>${fmt(r.ft)}</td><td>${fmt(r.occ)}</td><td>${r.groups.join('/') || '–'}</td><td class="${r.st.exits}">${r.req} / ${r.nExits ?? '–'}</td><td style="text-align:left">${r.stairs.join(' ') || '–'}${r.cut.length ? ` <span style="color:var(--fail)">✕ ${r.cut.join(' ')}</span>` : ''}</td><td class="${r.st.cap}">${fmt(r.occ)} / ${fmt(r.cap)}</td><td>${fmt(r.sepReq)}</td><td class="${r.st.sep}">${fmt(r.sepEdge)} (${fmt(r.sepCtr)})</td><td class="${r.st.travel}">${fmt(r.travel)} / ${r.lim1}</td><td class="${r.st.cpet}">${fmt(r.cpet)} / ${r.cpLim}</td><td>${r.lim2 ? `${fmt(r.travel2)} / ${r.lim2}` : '–'}</td></tr>`).join('')}
    </tbody></table></div>
    <h3 style="font-size:12px;margin:14px 0 6px">Zones ${f ? f.name : '(click a floor row)'}</h3>
    ${f ? `<table><tr><th>Zone</th><th>Type</th><th>Group</th><th>m²</th><th>Occ</th><th>Exit</th><th>Travel / lim</th><th>Common / lim</th><th>2nd / lim</th></tr>${f.zones.map(z => `<tr><td>${z.id}</td><td>${z.cat}</td><td>${z.grp}</td><td>${fmt(z.area)}</td><td>${fmt(z.occ)}</td><td>${z.stair || '–'}</td><td class="${z.status}">${fmt(z.dist)} / ${z.lim}</td><td class="${z.cpStatus}">${fmt(z.cpet)} / ${z.cpLim}</td><td>${z.lim2 ? `${fmt(z.dist2)} / ${z.lim2}` : '–'}</td></tr>`).join('')}</table>
    <div class="note">Paths run on the floor plate only (no slab, no passage), around walls cut at +1.0 m and through their openings. Each route starts at the most remote point inside its space. Path of travel runs to the nearest reachable exit; the common path is the part shared with the route to a second exit.${f.cut.length ? ` Stairs passing this floor with no opening onto it: ${f.cut.join(', ')}.` : ''}${f.unreachM2 > 2 ? ` ${fmt(f.unreachM2)} m² of floor has no path to any stair.` : ''}</div>` : ''}`;
    pane.querySelectorAll('tr[data-f]').forEach(r => r.onclick = () => setFloor(+r.dataset.f));
  } else if (tab === 'st') {
    pane.innerHTML = `<table><tr><th>Stair</th><th>Bottom</th><th>Top</th><th>Floors</th><th>Vestibule</th><th>Roof</th><th>Cap</th></tr>${R.stairs.map(s => `<tr data-s="${s.id}"><td>${s.id}</td><td>${s.bot.toFixed(1)}</td><td>${s.top.toFixed(1)}</td><td style="text-align:left">${s.floors.map(flName).join(' ')}</td><td>${s.vest ? s.vest.id : '–'}</td><td class="${s.toRoof ? 'ok' : 'fail'}">${s.toRoof ? '✓' : '✕'}</td><td>${fmt(R.capPer)}</td></tr>`).join('')}</table>
    <div class="note">Stairs come from the 01_STAIRS layer inside the CORES volumes (tools/build_data.py); vestibules are small 04_LOBBY_AREAS pieces touching a stair. Capacity = ${A.stairClearIn} in ÷ ${A.stairFactor} in/occ per storey. Enclosures 2-hour (§1023.2).</div>`;
    pane.querySelectorAll('tr[data-s]').forEach(r => r.onclick = () => select({ type: 'stair', id: r.dataset.s }));
  } else if (tab === 'el') {
    pane.innerHTML = detailState < 2 ? '<p style="color:var(--mute)">Loading the core model…</p>' : `<table><tr><th>Car</th><th>Type</th><th>Bottom</th><th>Top</th><th>Floors</th><th>Lobby</th><th>FSE</th></tr>${R.elevators.map(e => `<tr data-e="${e.id}"><td>${e.id}</td><td>${e.kind}</td><td>${e.bot.toFixed(1)}</td><td>${e.top.toFixed(1)}</td><td>${e.floors.length}</td><td>${e.lobby || '–'}${e.lobbyStair ? ' ↔ ' + e.lobbyStair : ''}</td><td class="${e.fse ? 'ok' : ''}">${e.fse ? 'candidate' : '–'}</td></tr>`).join('')}</table>
    <h3 style="font-size:12px;margin:14px 0 6px">Lobbies and vestibules</h3>
    <table><tr><th>ID</th><th>Role</th><th>Plan (m)</th><th>Top</th></tr>${R.lobbies.map(l => `<tr data-l="${l.id}"><td>${l.id}</td><td>${l.role}</td><td>${(l.b[3] - l.b[0]).toFixed(2)} × ${(l.b[4] - l.b[1]).toFixed(2)}</td><td>${l.b[5].toFixed(1)}</td></tr>`).join('')}</table>
    <div class="note">Cars and lobbies are read from the core model layers 02_PASSENGER_ELEVATORS, 03_FREIGHT_ELEVATOR and 04_LOBBY_AREAS. A car is an FSE candidate when it has an enclosed lobby and reaches the top occupied floor; the lobby should open directly to an exit stair. Designation, car size, standby power and water protection still to be confirmed (§3007).</div>`;
    pane.querySelectorAll('tr[data-e]').forEach(r => r.onclick = () => select({ type: 'elev', id: r.dataset.e }));
    pane.querySelectorAll('tr[data-l]').forEach(r => r.onclick = () => select({ type: 'lobby', id: r.dataset.l }));
  } else if (tab === 'aud') {
    pane.innerHTML = `<div style="margin-bottom:8px">${pills(cnt)}</div>` + R.items.map(a => `<div class="aud"><div class="t">${pill(a.status)}${a.item}</div><p>${esc(a.detail)}</p><div class="ref">${a.ref}</div></div>`).join('');
  } else if (tab === 'ins') {
    const p = selected;
    if (!p) { pane.innerHTML = '<p style="color:var(--mute)">Click a stair, elevator, lobby or programme volume in the model, or a row in the Stairs / Elevators tabs.</p>'; return; }
    let h = '', rows = [];
    if (p.type === 'stair') { const s = R.stairs.find(x => x.id === p.id); h = `Exit stair ${s.id}`;
      rows = [['Plan (m)', `${(s.b[3] - s.b[0]).toFixed(2)} × ${(s.b[4] - s.b[1]).toFixed(2)}`], ['Bottom / top', `+${s.bot.toFixed(2)} / +${s.top.toFixed(2)} m`], ['Floors served', s.floors.map(flName).join(', ')], ['Capacity per storey', `${fmt(R.capPer)} occupants (${A.stairClearIn} in clear)`], ['Vestibule', s.vest ? `${s.vest.id} (${(s.vest.b[3] - s.vest.b[0]).toFixed(2)} × ${(s.vest.b[4] - s.vest.b[1]).toFixed(2)} m)` : 'none'], ['Reaches roof', s.toRoof ? 'yes' : 'no'], ['Reaches basement', s.toBase ? 'yes' : 'no'], ['Counted as exit', R.exitOf[s.id] === s.id ? 'separate exit' : 'shares a wall with ' + R.exitOf[s.id]], ['Standpipe', 'yes (schematic), hose valve at each landing'], ['Enclosure', '2-hour fire barrier (§1023.2)']]; }
    else if (p.type === 'elev') { const e = R.elevators.find(x => x.id === p.id); h = `Elevator ${e.id} (${e.kind})`;
      rows = [['Shaft plan (m)', `${(e.b[3] - e.b[0]).toFixed(2)} × ${(e.b[4] - e.b[1]).toFixed(2)}`], ['Bottom / top', `+${e.bot.toFixed(2)} / +${e.top.toFixed(2)} m`], ['Floors served', e.floors.map(flName).join(', ')], ['Lobby', e.lobby || 'none'], ['Lobby adjoins stair', e.lobbyStair || 'no'], ['FSE candidate', e.fse ? 'yes' : 'no']]; }
    else if (p.type === 'lobby') { const l = R.lobbies.find(x => x.id === p.id); h = `${l.role[0].toUpperCase() + l.role.slice(1)} ${l.id}`;
      rows = [['Plan (m)', `${(l.b[3] - l.b[0]).toFixed(2)} × ${(l.b[4] - l.b[1]).toFixed(2)} = ${((l.b[3] - l.b[0]) * (l.b[4] - l.b[1])).toFixed(1)} m²`], ['Bottom / top', `+${l.b[2].toFixed(2)} / +${l.b[5].toFixed(2)} m`], ['Serves', l.role === 'vestibule' ? R.stairs.find(s => s.vest?.id === l.id)?.id : R.elevators.filter(e => e.lobby === l.id).map(e => e.id).join(', ')]]; }
    else if (p.type === 'zone') { const v = P.volumes.find(x => x.id === p.id), r = R.rows[v.floor], z = r.zones.find(q => q.id === v.id) || {}; h = C[v.cat]?.label || v.cat;
      rows = [['Volume', v.id], ['Floor', r.name], ['Occupancy group', grpOf(v.cat)], ['Area', `${fmt(v.area)} m² (${fmt(v.area * M2FT2)} ft²)`], ['Occupants', fmt(z.occ)], ['Height', `+${v.zmin.toFixed(1)} → +${v.zmax.toFixed(1)} m${r.multi.includes(v.cat) ? ' (multi-storey)' : ''}`], ['Nearest stair', r.grade ? 'grade floor: exits are the exterior doors (not in the model)' : z.stair ? `${z.stair}, ${fmt(z.dist)} ft (limit ${z.lim})` : 'none'], ['Special', v.cat === 'immersive' ? '§411 special amusement if the exit path is not readily apparent' : v.cat === 'auditorium' ? 'fixed seats §1004.3, aisles §1029' : '–']]; }
    pane.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px">${esc(h)}</h3><div class="kv">${rows.map(([k, v]) => `<div>${k}</div><div>${esc(v ?? '–')}</div>`).join('')}</div><button class="btn" style="margin-top:12px" id="bDesel">Clear</button>`;
    $('#bDesel').onclick = () => select(null);
  }
}
function status() {
  if (!R) return;
  const f = R.rows.filter(r => r.status === 'fail').length;
  $('#status').innerHTML = `<b style="color:var(--ink)">${R.stairs.length}</b> exit stairs · ${R.elevators.length} elevators · ${fmt(R.hf)} ft · <span style="color:${f ? STC.fail : STC.ok}">${f} floors failing</span> · ${floorSel === -1 ? 'ALL' : floorSel === -2 ? 'B1' : flName(floorSel)}`;
}
function regen() {
  model = generate(P, A, C); model.cats = C;
  R = lifeSafety(P, A, model, G);
  buildLS(); renderPane();
}

// ---------- exports ----------
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.opacity = 0, 2600); };
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
function download(name, data, type) { const b = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
// renders rect (screen px of the view, may reach beyond it) at w × h with a transparent background (export dialog)
function renderImage(w, h, rect) { return renderTiled({ renderer, scene, camera, view, w, h, rect, lineMats: lineMats, before: () => scaleTags(view.clientHeight), after: resize }); }
const selName = () => floorSel === -1 ? 'ALL' : floorSel === -2 ? 'B1' : flName(floorSel);
$('#bPng').onclick = () => VT.openExport('png4');
$('#bSvg').onclick = () => VT.openExport('svg');
$('#bPng8').onclick = () => VT.openExport('png8');
// Rhino / OBJ: what is visible now, one layer per layer-list entry (LS::group::layer); tags become text dots in Rhino
const LPATH = Object.fromEntries(LAYERS.flatMap(([g, ls]) => ls.map(([k, l]) => [k, `LS::${g.replace(/&/g, 'and')}::${l.replace(/\s*\(.*\)/, '').replace(/ \+ /g, ' and ')}`])));
const visItems = () => { const ex = explode; if (ex) { explode = 0; const vis = []; for (const g of [statG, dynG]) for (const o of g.children) vis.push(o.visible); applyVis(); let n = 0; for (const g of [statG, dynG]) for (const o of g.children) o.visible = vis[n++]; } const items = collectItems(); if (ex) { explode = ex; applyVis(); } return items; };
const collectItems = () => collect([root], {
  layerOf: own => { const k = own.userData.layer; return LPATH[k] || 'LS::Other::' + k; },
  zRange: floorSel >= 0 ? [L[floorSel].z - 0.05, (L[floorSel + 1]?.z ?? L[floorSel].z + 9) - 0.05] : floorSel === -2 ? [(P.basementZ ?? 0) - 1, L[0].z + 0.5] : null,
});
$('#b3dm').onclick = async () => {
  toast('Loading rhino3dm…');
  try { const { bytes, n } = await to3dm(visItems()); download(`2GBX_LifeSafety_${selName()}_${stamp()}.3dm`, new Blob([bytes], { type: 'application/octet-stream' })); toast(`Rhino .3dm exported · ${n} objects (metres)`); }
  catch (err) { console.error(err); toast('rhino3dm unavailable, exporting OBJ instead'); $('#bObj').click(); }
};
$('#bObj').onclick = () => {
  const base = `2GBX_LifeSafety_${selName()}`, { obj, mtl } = toOBJ(visItems(), base, 'DD-G01 Hyperobject · Life safety');
  download(base + '.obj', obj, 'text/plain'); setTimeout(() => download(base + '.mtl', mtl, 'text/plain'), 300); toast('OBJ + MTL exported (metres, Z up)');
};
$('#bCsv').onclick = () => {
  const H = ['floor', 'elev_m', 'height_ft', 'occupants', 'groups', 'exits_required', 'exits_provided', 'stairs', 'stair_capacity', 'diagonal_ft', 'sep_required_ft', 'sep_edge_ft', 'sep_centre_ft', 'travel_ft', 'travel_limit_ft', 'second_exit_ft', 'second_limit_ft', 'status'];
  const rows = R.rows.map(r => [r.name, r.z, r.ft.toFixed(0), r.occ, r.groups.join('/'), r.req, r.nExits ?? '', r.stairs.join(' '), r.cap == null ? '' : Math.round(r.cap), r.diag.toFixed(0), r.sepReq.toFixed(0), r.sepEdge?.toFixed(0) ?? '', r.sepCtr?.toFixed(0) ?? '', r.travel?.toFixed(0) ?? '', r.lim1, r.travel2?.toFixed(0) ?? '', r.lim2 ?? '', r.status]);
  download(`2GBX_LifeSafety_${stamp()}.csv`, [H, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n'), 'text/csv');
};
$('#bJson').onclick = () => download(`2GBX_LifeSafety_${stamp()}.json`, JSON.stringify({ project: P.name, assumptions: Object.fromEntries(AF.map(([k]) => [k, A[k]])), ...R }, null, 1), 'application/json');

// ---------- go ----------
syncGroups(); buildInputs(); resize(); regen(); setProj(true); setView('iso'); loadDetail();
// tags keep a constant on-screen size (px) whatever the zoom
const _v = new THREE.Vector3();
function scaleTags(H = view.clientHeight) {
  const wppO = (ocam.top - ocam.bottom) / ocam.zoom / H, k = 2 * Math.tan(THREE.MathUtils.degToRad(pcam.fov / 2)) / H;
  for (const g of [statG, dynG]) for (const o of g.children) if (o.isSprite && o.visible) { const h = o.userData.px * (camera === ocam ? wppO : o.getWorldPosition(_v).distanceTo(camera.position) * k); o.scale.set(h * o.userData.asp, h, 1); }
}
// floor labels sit at the corner of the building that is left-most in the current view
const _lc = new THREE.Vector3();
function placeLabels(list) {
  let best = null, bx = Infinity;
  for (const [x, y] of [[bmin.x, bmin.y], [bmax.x, bmin.y], [bmax.x, bmax.y], [bmin.x, bmax.y]]) { _lc.set(x, y, center.z).project(camera); if (_lc.x < bx) { bx = _lc.x; best = [x, y]; } }
  const px = best[0] + Math.sign(best[0] - center.x) * 2, py = best[1] + Math.sign(best[1] - center.y) * 2;
  for (const s of list) { s.position.x = px; s.position.y = py; }
}
// annotation tags: each tag sits next to the point it describes, on whichever side (of 8 around it) covers the least of
// the drawing and of the tags already placed. No leaders. The tag keeps its 3D anchor; only its screen offset (sprite centre) changes.
// The layout is recomputed only when the view, floor or layers change.
let tagKey = '';
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function layoutTags() {
  const VW = view.clientWidth, VH = view.clientHeight;
  const key = camera.matrixWorld.elements.map(v => v.toFixed(3)).join() + camera.zoom.toFixed(4) + VW + 'x' + VH + floorSel + explode + root.children.map(g => g.children.filter(o => o.visible).length).join();
  if (key === tagKey) return; tagKey = key;
  const toS = v => [(v.x + 1) / 2 * VW, (1 - v.y) / 2 * VH];
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  // drawing to keep clear: route, dimension and wall segments, stair / lift / lobby boxes (screen space)
  const segs = [], boxes = [];
  const pt = (x, y, z) => toS(_b.set(x, y, z).project(camera));
  for (const g of [statG, dynG]) for (const o of g.children) { if (!shown(o) || o.isSprite) continue;
    o.traverse(c => { if (!shown(c)) return; c.updateMatrixWorld();
      if (c.userData.poly) { const P = c.userData.poly; for (let n = 1; n < P.length; n++) segs.push([...pt(...P[n - 1]), ...pt(...P[n])]); return; }
      if (c.isLineSegments2) { const st = c.geometry.attributes.instanceStart, en = c.geometry.attributes.instanceEnd; if (!st) return;
        for (let n = 0; n < st.count && segs.length < 6000; n++) { _a.set(st.getX(n), st.getY(n), st.getZ(n)).applyMatrix4(c.matrixWorld); const A = toS(_a.project(camera)); _a.set(en.getX(n), en.getY(n), en.getZ(n)).applyMatrix4(c.matrixWorld); segs.push([...A, ...toS(_a.project(camera))]); } return; }
      if (c.isMesh && !c.isInstancedMesh && c.geometry?.type === 'BoxGeometry') { c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox, r = [Infinity, Infinity, -Infinity, -Infinity];
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const [sx, sy] = toS(_a.set(x, y, z).applyMatrix4(c.matrixWorld).project(camera)); r[0] = Math.min(r[0], sx); r[1] = Math.min(r[1], sy); r[2] = Math.max(r[2], sx); r[3] = Math.max(r[3], sy); }
        if ((r[2] - r[0]) * (r[3] - r[1]) < VW * VH * 0.25) boxes.push(r); } }); }
  const hits = (x0, y0, x1, y1, s) => {   // segment s crosses rectangle (Liang-Barsky)
    let t0 = 0, t1 = 1; const dx = s[2] - s[0], dy = s[3] - s[1];
    for (const [p, q] of [[-dx, s[0] - x0], [dx, x1 - s[0]], [-dy, s[1] - y0], [dy, y1 - s[1]]]) { if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } }
    return true; };
  const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  // placed labels are kept as quads (4 screen corners) so that turned labels are tested exactly, not by their bounding box
  const quad = (cx, cy, w, h, ang) => { const c = Math.cos(ang), s2 = Math.sin(ang), ux = c, uy = -s2, vx = -s2, vy = -c;   // u: along the text, v: its 'up' (screen y down)
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + ux * a * w / 2 + vx * b * h / 2, cy + uy * a * w / 2 + vy * b * h / 2]); };
  const rq = r => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  const sep = (A, B) => { for (const P of [A, B]) for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4], nx2 = q[1] - p[1], ny2 = p[0] - q[0];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const t of A) { const d = t[0] * nx2 + t[1] * ny2; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const t of B) { const d = t[0] * nx2 + t[1] * ny2; b0 = Math.min(b0, d); b1 = Math.max(b1, d); } if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return true; } return false; };
  const touch = (A, B) => !sep(A, B);
  const placed = [];
  for (const g of [statG, dynG]) for (const o of g.children) if (o.isSprite && o.userData.along && shown(o)) {   // length labels: middle of the line, along it
    const P = o.userData.along; let L = 0; for (let n = 1; n < P.length; n++) L += Math.hypot(P[n][0] - P[n - 1][0], P[n][1] - P[n - 1][1]);
    let acc = 0, n = 1; for (; n < P.length; n++) { const l = Math.hypot(P[n][0] - P[n - 1][0], P[n][1] - P[n - 1][1]); if (acc + l >= L / 2) break; acc += l; }
    n = Math.min(n, P.length - 1); const a = P[n - 1], b = P[n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = (L / 2 - acc) / l;
    o.position.x = a[0] + (b[0] - a[0]) * t; o.position.y = a[1] + (b[1] - a[1]) * t;
    o.updateMatrixWorld(); o.getWorldPosition(_a); const zz = _a.z, pa = toS(_b.set(a[0], a[1], zz).project(camera)), pb = toS(_b.set(b[0], b[1], zz).project(camera));
    let ang = Math.atan2(-(pb[1] - pa[1]), pb[0] - pa[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < 2) ang = 0;   // line seen end-on: keep the label level
    o.material.rotation = ang; o.userData.off = null;
    // where two length labels would overlap (routes sharing a corridor), the later one steps off the line: above, below, further out
    const [cx, cy] = toS(_a.project(camera)), w = o.userData.px * o.userData.asp, h = o.userData.px, ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
    const nx = -Math.sin(ang), ny = -Math.cos(ang), hw = (w * ca + h * sa) / 2, hh = (w * sa + h * ca) / 2;   // n: screen 'up' of the text
    // candidates: on the line, then stepped off it (above / below) and slid along it; the one touching the fewest placed labels wins
    let pick = null, pc = Infinity; const ux = Math.cos(ang), uy = -Math.sin(ang);
    for (const sl of [0, 0.6, -0.6]) for (const cyv of [-0.25, -1.45, 1.35, -2.65, 2.55]) {
      const k = (0.5 - cyv) * h, r = quad(cx + nx * k + ux * sl * w, cy + ny * k + uy * sl * w, w, h, ang), n = placed.filter(p => touch(p, r)).length;
      if (n < pc) { pc = n; pick = [sl, cyv, r]; } if (!n) break; }
    o.center.set(0.5 - pick[0], pick[1]); placed.push(pick[2]); }
  for (const g of [statG, dynG]) for (const o of g.children) if (o.isSprite && o.userData.text && o.userData.layer !== 'labels' && !o.userData.along) {
    if (!shown(o)) { o.center.set(0, 0); o.userData.off = null; continue; }
    o.getWorldPosition(_a); const z = _a.project(camera); if (z.z < -1 || z.z > 1) continue;
    const h = o.userData.px, w = h * o.userData.asp, [x, y] = toS(z), m = 6;
    const cands = [[m, -h / 2], [m, -h - m], [m, m], [-w - m, -h / 2], [-w - m, -h - m], [-w - m, m], [-w / 2, -h - m], [-w / 2, m],
      [m * 4, -h / 2], [-w - m * 4, -h / 2], [-w / 2, -h - m * 4], [-w / 2, m * 4]];   // (dx, dy) of the tag's top-left from the point, screen px
    let best = null, bs = Infinity;
    cands.forEach(([dx, dy], n) => { const r = [x + dx, y + dy, x + dx + w, y + dy + h];
      let sc = n * 0.5 + (n >= 8 ? 20 : 0);   // prefer the first, closest positions
      if (r[0] < 2 || r[1] < 2 || r[2] > VW - 2 || r[3] > VH - 2) sc += 1e4;
      const R4 = rq(r); for (const p of placed) if (touch(p, R4)) sc += w * h * 5;
      for (const b of boxes) sc += ov(r, b) * 0.3;
      for (const s of segs) if (hits(r[0], r[1], r[2], r[3], s)) sc += 40;
      if (sc < bs) { bs = sc; best = r; } });
    placed.push(rq(best));
    o.center.set(-(best[0] - x) / w, -(y - best[3]) / h); o.userData.off = [best[0] - x, y - best[3]];
  }
}
const plateBox = (tris, z0, z1) => { const b = new THREE.Box3(); for (const t of tris) for (let k = 0; k < 6; k += 2) { b.expandByPoint(new THREE.Vector3(t[k], t[k + 1], z0)); b.expandByPoint(new THREE.Vector3(t[k], t[k + 1], z1)); } return b; };
// Centre + drawing scale under the View buttons
const VT = viewTools({ exp: { renderImage, svgItems: () => collectItems(), fileStem: () => `2GBX_LifeSafety_${selName()}_${stamp()}`, title: () => `DD-G01 HYPEROBJECT · Life safety · ${selName() === 'ALL' ? 'All floors' : selName()}${VT.scale() && camera === ocam ? ' · ' + VT.scaleText() : ''}` }, view, ocam, pcam, controls, getCamera: () => camera, setOrtho: o => setProj(o), key: 'ls', getBox: () => { if (floorSel >= 0) return plateBox(L[floorSel].tris, L[floorSel].z + floorSel * explode, (L[floorSel + 1]?.z ?? L[floorSel].z + 9) + floorSel * explode); if (floorSel === -2 && B1B) return new THREE.Box3(new THREE.Vector3(B1B[0], B1B[1], (P.basementZ ?? 0) - explode), new THREE.Vector3(B1B[2], B1B[3], L[0].z - explode)); return new THREE.Box3(bmin.clone(), bmax.clone().add(new THREE.Vector3(0, 0, explode * L.length))).expandByScalar(radius * 0.25); } });   // margin for the long floor labels
renderer.setAnimationLoop(() => { controls.update(); VT.tick(); placeLabels(dynG.children.filter(o => o.userData.layer === 'labels')); scaleTags(); layoutTags(); renderer.render(scene, camera); });
