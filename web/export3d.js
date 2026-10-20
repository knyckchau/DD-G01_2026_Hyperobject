// OBJ and Rhino .3dm export of what is currently visible in a three.js scene (Structure and Life safety pages).
// collect() walks the scene and returns plain items; toOBJ() and to3dm() write them out. Units: metres, Z up.
import * as THREE from 'three';

const RHINO = 'https://cdn.jsdelivr.net/npm/rhino3dm@8.35.0/';
let rhinoP = null;

const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const hex = c => '#' + (c?.getHexString ? c.getHexString() : '888888');

// layerOf(o) -> 'Group::Layer' path or null to skip; zRange [z0, z1] keeps only geometry of one floor
export function collect(roots, { layerOf, zRange = null, fallback = null, skip = null }) {   // skip: Set of objects (with their children) to leave out   // fallback: layer for objects with no tagged owner
  const out = []; let zr = null;   // zRange only trims objects not already assigned to a floor (cores, structure)
  const inZ = z => !zr || (z >= zr[0] && z <= zr[1]);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), M = new THREE.Matrix4(), C = new THREE.Color();
  roots.forEach(r => r.updateMatrixWorld(true));
  const owner = o => { for (let p = o; p; p = p.parent) if (p.userData?.layer) return p; return null; };
  roots.forEach(r => r.traverse(o => {
    if (!(o.isMesh || o.isLine || o.isLineSegments || o.isSprite) || !shown(o)) return;
    if (skip) for (let p = o; p; p = p.parent) if (skip.has(p)) return;
    if (o.userData.noExport) return;   // display-only helpers
    const own = owner(o); if (!own && !fallback) return;
    const layer = own ? layerOf(own, o) : fallback; if (!layer) return;
    zr = own?.userData.fl == null ? zRange : null;
    const mat = o.material, col = hex(mat?.color), op = mat?.transparent ? mat.opacity ?? 1 : 1;   // op, lw, dash: used by the SVG export
    const wu = mat?.worldUnits ? 1 : 0, lw = mat?.isLineMaterial ? mat.linewidth : 1, dash = mat?.dashed || mat?.isLineDashedMaterial ? (mat.dashSize >= 2 ? 2 : 1) : 0,   // 2 = long dashes
      look = o.userData.polyStyle || '';
    if (o.isSprite) { if (o.userData.text) { o.getWorldPosition(v); if (inZ(v.z)) out.push({ kind: 'text', layer, col, text: o.userData.text, p: v.toArray(), off: o.userData.off || null, rot: o.material?.rotation || 0, ctr: [o.center.x, o.center.y], along: !!o.userData.along }); } return; }
    if (o.userData.poly) { const pts = o.userData.poly.filter(p => inZ(p[2])); if (pts.length > 1) out.push({ kind: 'line', layer, col, op, lw, dash, look, pts }); return; }
    if (o.isLineSegments2) {   // fat lines: consecutive segments in instanceStart / instanceEnd
      const s = o.geometry.attributes.instanceStart, e = o.geometry.attributes.instanceEnd; if (!s) return;
      let pts = [];
      const flush = () => { if (pts.length > 1) out.push({ kind: 'line', layer, col, op, lw, wu, dash, pts }); pts = []; };
      for (let i = 0; i < s.count; i++) {
        v.set(s.getX(i), s.getY(i), s.getZ(i)).applyMatrix4(o.matrixWorld); w.set(e.getX(i), e.getY(i), e.getZ(i)).applyMatrix4(o.matrixWorld);
        if (!inZ((v.z + w.z) / 2)) { flush(); continue; }
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(last[0] - v.x, last[1] - v.y, last[2] - v.z) > 1e-6) { flush(); pts.push(v.toArray()); }
        pts.push(w.toArray());
      }
      flush(); return;
    }
    const g = o.geometry, pos = g?.attributes?.position; if (!pos) return;
    if (o.isLine || o.isLineSegments) {
      const step = o.isLineSegments ? 2 : 1, n = g.index ? g.index.count : pos.count, ix = i => g.index ? g.index.getX(i) : i;
      const P = i => v.set(pos.getX(ix(i)), pos.getY(ix(i)), pos.getZ(ix(i))).applyMatrix4(o.matrixWorld).toArray();
      if (o.isLineSegments) for (let i = 0; i + 1 < n; i += step) { const a = P(i), b = P(i + 1); if (inZ((a[2] + b[2]) / 2)) out.push({ kind: 'line', layer, col, op, lw, dash, pts: [a, b] }); }
      else { const pts = []; for (let i = 0; i < n; i++) pts.push(P(i)); if (pts.some(p => inZ(p[2]))) out.push({ kind: 'line', layer, col, op, lw, dash, pts }); }
      return;
    }
    // meshes; instanced meshes are merged into one mesh, with per-vertex colours when instances are coloured
    const n = o.isInstancedMesh ? o.count : 1, V = [], F = [], VC = o.isInstancedMesh && o.instanceColor ? [] : null;
    const idx = g.index ? Array.from(g.index.array) : [...Array(pos.count).keys()];
    for (let k = 0; k < n; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, M); M.premultiply(o.matrixWorld); if (VC) o.getColorAt(k, C); } else M.copy(o.matrixWorld);
      const base = V.length / 3, loc = [];
      for (let i = 0; i < pos.count; i++) { v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(M); loc.push(v.x, v.y, v.z); }
      const keep = [];
      for (let i = 0; i < idx.length; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2]; if (inZ((loc[a * 3 + 2] + loc[b * 3 + 2] + loc[c * 3 + 2]) / 3)) keep.push(a, b, c); }
      if (!keep.length) continue;
      for (let i = 0; i < loc.length; i++) V.push(loc[i]); for (let i = 0; i < keep.length; i++) F.push(base + keep[i]);
      if (VC) for (let i = 0; i < pos.count; i++) VC.push(C.r, C.g, C.b);
    }
    if (F.length) out.push({ kind: 'mesh', layer, col, op, v: V, f: F, vc: VC, dots: !!mat?.userData?.dots });   // dots: stipple fill (SVG pattern)
  }));
  return out;
}

// Wavefront OBJ + MTL (one material per layer colour; text items are skipped, OBJ has no text)
export function toOBJ(items, base, title, off = 1, header = true) {   // off: first vertex index when appending to another OBJ
  let obj = header ? `# ${title} · units: metres, Z up\nmtllib ${base}.mtl\n` : '', mtl = '', n = 0; const used = {};
  const key = s => s.replace(/[^\w]+/g, '_');
  for (const it of items) {
    if (it.kind === 'text') continue;
    const m = key(it.layer + '_' + it.col.slice(1));
    if (!used[m]) { used[m] = 1; const c = new THREE.Color(it.col); mtl += `newmtl ${m}\nKd ${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}\n\n`; }
    obj += `o ${key(it.layer)}_${++n}\ng ${key(it.layer)}\nusemtl ${m}\n`;
    if (it.kind === 'mesh') {
      for (let i = 0; i < it.v.length; i += 3) obj += `v ${it.v[i].toFixed(4)} ${it.v[i + 1].toFixed(4)} ${it.v[i + 2].toFixed(4)}${it.vc ? ` ${it.vc[i].toFixed(3)} ${it.vc[i + 1].toFixed(3)} ${it.vc[i + 2].toFixed(3)}` : ''}\n`;
      for (let i = 0; i < it.f.length; i += 3) obj += `f ${it.f[i] + off} ${it.f[i + 1] + off} ${it.f[i + 2] + off}\n`;
      off += it.v.length / 3;
    } else {
      it.pts.forEach(p => obj += `v ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}\n`);
      obj += 'l ' + it.pts.map((_, i) => i + off).join(' ') + '\n'; off += it.pts.length;
    }
  }
  return { obj, mtl, n };
}

// Rhino .3dm: nested layers from the 'A::B::C' paths, meshes, polylines and text dots, object colours kept
export const rhinoLib = () => (rhinoP ||= import(RHINO + 'rhino3dm.module.min.js').then(m => m.default({ locateFile: f => RHINO + f })));
const rgb = h => { const c = new THREE.Color(h); return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255), a: 255 }; };
// adds collected items to an open File3dm; layer(path, colour) returns the layer index
export function addTo3dm(rhino, doc, items, layer) {
  let n = 0;
  for (const it of items) {
    const a = new rhino.ObjectAttributes(); a.layerIndex = layer(it.layer, it.col);
    a.colorSource = rhino.ObjectColorSource.ColorFromObject; a.objectColor = rgb(it.col); a.name = it.layer.split('::').pop();
    if (it.kind === 'text') { doc.objects().add(new rhino.TextDot(it.text, it.p), a); n++; continue; }
    if (it.kind === 'line') {
      if (it.pts.length === 2) doc.objects().add(new rhino.LineCurve(it.pts[0], it.pts[1]), a);
      else { const pl = new rhino.Polyline(it.pts.length); it.pts.forEach(p => pl.add(p[0], p[1], p[2])); doc.objects().add(pl.toPolylineCurve(), a); }
      n++; continue;
    }
    const m = new rhino.Mesh();
    for (let i = 0; i < it.v.length; i += 3) m.vertices().add(it.v[i], it.v[i + 1], it.v[i + 2]);
    for (let i = 0; i < it.f.length; i += 3) m.faces().addTriFace(it.f[i], it.f[i + 1], it.f[i + 2]);
    if (it.vc) for (let i = 0; i < it.vc.length; i += 3) m.vertexColors().add(Math.round(it.vc[i] * 255), Math.round(it.vc[i + 1] * 255), Math.round(it.vc[i + 2] * 255));
    m.normals().computeNormals(); m.compact(); doc.objects().add(m, a); n++;
  }
  return n;
}
export async function to3dm(items) {
  const rhino = await rhinoLib(), doc = new rhino.File3dm(); doc.settings().modelUnitSystem = rhino.UnitSystem.Meters;
  const layers = {};
  const layer = (path, col) => {
    if (layers[path] != null) return layers[path];
    const parts = path.split('::'), L = new rhino.Layer(); L.name = parts[parts.length - 1]; L.color = rgb(col);
    if (parts.length > 1) L.parentLayerId = doc.layers().findIndex(layer(parts.slice(0, -1).join('::'), col)).id;
    return layers[path] = doc.layers().add(L);
  };
  const n = addTo3dm(rhino, doc, items, layer);
  return { bytes: doc.toByteArray(), n };
}
