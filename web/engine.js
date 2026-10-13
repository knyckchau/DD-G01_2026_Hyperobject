// 2GBX MEP Designer — DD draft generation engine (pure JS, no DOM).
// Geometry in metres (Z-up, same as the FBX/Rhino model). Engineering values in US units (NYC codes).
export const FT = 3.28084, M2FT2 = 10.7639, IN = 0.0254;

// ---------- Category assumptions (editable in UI) ----------
// olf = occupant load factor ft²/person (NYC BC 2022 Table 1004.1.3), olfGrade = factor on the grade floor where the table differs,
// Rp/Ra = ASHRAE 62.1 / NYC MC 403 rates,
// lpd/epd = lighting / plug+media W/ft², haz = NFPA 13 hazard, grp = occupancy group for fixture counts.
export const CATS = {
  gallery:    { label: 'Exhibition gallery (open plan)', olf: 30, Rp: 7.5, Ra: 0.06, lpd: 1.0, epd: 1.5,   haz: 'LH',  grp: 'A-3', color: '#74a9f7' },
  immersive:  { label: 'Immersive hall (360° projection)', olf: 30, Rp: 7.5, Ra: 0.06, lpd: 0.3, epd: 1,  haz: 'LH',  grp: 'A-3', color: '#a78bfa' },
  auditorium: { label: 'Auditorium',              olf: 7,   Rp: 5,   Ra: 0.06, lpd: 0.8, epd: 4,   haz: 'LH',  grp: 'A-1', color: '#f78f8f' },
  food:       { label: 'Food court / events',     olf: 15,  Rp: 7.5, Ra: 0.18, lpd: 0.8, epd: 8,   haz: 'OH1', grp: 'A-2', color: '#f5c542' },
  lobby:      { label: 'Lobby / cafe / cloak',    olf: 15,  Rp: 5,   Ra: 0.06, lpd: 0.8, epd: 1.5, haz: 'LH',  grp: 'A-3', color: '#69db7c' },
  shop:       { label: 'Shop / library',          olf: 60,  olfGrade: 30, Rp: 7.5, Ra: 0.12, lpd: 1.1, epd: 2,   haz: 'OH2', grp: 'M',   color: '#ffa94d' },
  office:     { label: 'Offices (desks + PCs)',   olf: 100, Rp: 5,   Ra: 0.06, lpd: 0.64, epd: 0.25, haz: 'LH',  grp: 'B',   color: '#3bc9db' },
  technical:  { label: 'Roof technical space',    olf: 300, Rp: 0,   Ra: 0.06, lpd: 0.5, epd: 1,   haz: 'OH1', grp: '-',   color: '#adb5bd' },
  restroom:   { label: 'Restrooms',               olf: 0,   Rp: 0,   Ra: 0.06, lpd: 0.6, epd: 0.2, haz: 'LH',  grp: '-',   color: '#b197fc' },
  support:    { label: 'Circulation / support',   olf: 0,   Rp: 0,   Ra: 0.06, lpd: 0.5, epd: 0.5, haz: 'LH',  grp: '-',   color: '#ced4da' },
  terrace:    { label: 'Terrace (exterior)',      olf: 15,  Rp: 0,   Ra: 0,    lpd: 0.2, epd: 0.2, haz: '-',   grp: 'A-3', color: '#96f2d7', exterior: true },
};

export const DEFAULTS = {
  // general / coordination
  structDepth: 0.75,     // m, slab + beam zone below the slab above
  minClear: 3.6,         // m, target finished clear height in public floors
  auditoriumSeats: 182,  // fixed seats (P3 drawing) → occupant load = seat count, NYC BC §1004.3; 0 = chairs only at 7 net
  // HVAC
  concept: 'floorAHU',   // 'floorAHU' (DOAS on roof + floor-by-floor AHUs) | 'central' (central roof AHUs + supply/return shafts)
  supplyDT: 20,          // °F room - supply
  envLoad: 12,           // Btuh/ft² envelope + solar sensible (DD rule of thumb)
  heatLoad: 22,          // Btuh/ft² envelope heating (excl. OA)
  peopleSens: 250, peopleLat: 200,
  Ez: 0.8,               // zone air distribution effectiveness (ceiling supply, heating)
  vMain: 1500, vBranch: 900, vRiser: 2000, maxDuctDepth: 30, // fpm, fpm, fpm, inches
  oaSummer: 92, oaWinter: 15, // °F NYC design (verify against workbook CLIMATE sheet)
  chwDT: 12, hhwDT: 20,
  kWperTon: 1.1,         // air-cooled / heat-recovery chiller incl. aux
  fanWperCfm: 0.9,
  diffuserCfm: 450,
  gridSpacing: 6,        // m, branch spacing for open-plan supply grids
  // immersive halls: ceiling projectors covering every wall
  projImgW: 8.0,         // m, image width per projector on the wall
  projImgH: 5.0,         // m, image height (16:10)
  projOverlap: 0.15,     // edge-blend overlap
  projKW: 2.0,           // kW per laser projector (~30k lm), all becomes heat
  avRackKW: 8,           // kW per hall: media servers, audio, network
  // offices
  deskM2: 10, deskW: 150, // m² per workstation, W per desk (PC + 2 monitors)
  autoShaft: true,       // enlarge shafts automatically when risers do not fit
  // plumbing
  streetPsi: 45, flushValvePsi: 25, frictionPsi: 15, meterBfpPsi: 12, maxFixturePsi: 85,
  rainfall: 3,           // in/hr, NYC PC §1106.1 (100-yr hourly rate fixed at 3 in/hr)
  // electrical
  voltage: 480, demand: 0.8, spare: 0.25, pf: 0.9,
  elevators: 0, elevatorHp: 40, freightHp: 60, // 0 = use count from the core model
  // fire
  genLocation: 'roof', // 'roof' | 'basement'
  standpipeFlow: 0, topOutletPsi: 65, // 0 = auto (NFPA 14 §7.10: 500 gpm + 250 per extra standpipe, max 1000); 65 psi per NYC BC Appendix Q mod. to NFPA 14 §7.8.1
};

const NOM = [[0.75, .824], [1, 1.049], [1.25, 1.38], [1.5, 1.61], [2, 2.067], [2.5, 2.469], [3, 3.068], [4, 4.026], [5, 5.047], [6, 6.065], [8, 7.981], [10, 10.02], [12, 11.938], [14, 13.124], [16, 15.0], [18, 16.876], [20, 18.812]];
const ceil2 = v => Math.max(6, Math.ceil(v / 2) * 2);
const r1 = v => Math.round(v * 10) / 10, r0 = Math.round;

export function ductRect(cfm, fpm, maxDepth) {
  const A = cfm / fpm * 144; // in²
  let h = Math.min(maxDepth, ceil2(Math.sqrt(A / 2)));
  let w = ceil2(A / h);
  if (w < h) w = h;
  return { w, h, ar: r1(w / h), vel: r0(cfm / (w * h / 144)) };
}
export function ductRound(cfm, fpm) { const A = cfm / fpm * 144; const d = ceil2(Math.sqrt(4 * A / Math.PI)); return { d, vel: r0(cfm / (Math.PI * d * d / 4 / 144)) }; }
export function pipeFor(gpm, vmax = v => v) {
  for (const [n, id] of NOM) { const A = Math.PI * (id / 12) ** 2 / 4; const v = gpm / 448.8 / A; if (v <= vmax(n)) return { nom: n, vel: r1(v) }; }
  const n = NOM[NOM.length - 1]; return { nom: n[0], vel: r1(gpm / 448.8 / (Math.PI * (n[1] / 12) ** 2 / 4)), over: true };
}
const hydV = n => (n <= 2 ? 4 : n <= 6 ? 8 : 10);   // hydronic velocity limits fps
const domV = () => 6;                                // domestic water fps
// Hunter curve, flush-valve predominant (IPC/NYC PC Appendix E Table E103.3(3) approx.)
const HUNTER = [[0, 0], [10, 27], [20, 35], [30, 41], [40, 46], [50, 51], [60, 55], [80, 62], [100, 68], [150, 80], [200, 91], [250, 101], [300, 110], [400, 126], [500, 142], [750, 177], [1000, 208], [1500, 269], [2000, 325], [2500, 380], [3000, 433]];
export function wsfuToGpm(w) { for (let i = 1; i < HUNTER.length; i++) { const [a, ga] = HUNTER[i - 1], [b, gb] = HUNTER[i]; if (w <= b) return ga + (gb - ga) * (w - a) / (b - a); } return 433 + (w - 3000) * 0.106; }
const stackSize = dfu => dfu <= 48 ? 3 : dfu <= 500 ? 4 : dfu <= 1100 ? 5 : dfu <= 1900 ? 6 : dfu <= 3600 ? 8 : 10;      // NYC PC Table 710.1(2) stacks (> 3 branch intervals; 3 in kept at 48, conservative)
const drainSize = dfu => dfu <= 180 ? 4 : dfu <= 390 ? 5 : dfu <= 700 ? 6 : dfu <= 1600 ? 8 : dfu <= 2900 ? 10 : dfu <= 4600 ? 12 : 15; // building drain at 1/8 in/ft, NYC PC Table 710.1(1)
const branchSize = dfu => dfu <= 20 ? 3 : dfu <= 160 ? 4 : dfu <= 360 ? 5 : dfu <= 620 ? 6 : 8;                           // horizontal branches, NYC PC Table 710.1(2) (WC min 3")
const leaderSize = gpm => [[2, 30], [3, 92], [4, 192], [5, 360], [6, 563], [8, 1208], [10, 2050]].find(x => gpm <= x[1])?.[0] ?? 12; // NYC PC Table 1106.3 vertical leaders (10 in from Table 1106.2 vertical drain)
const STD_A = [400, 600, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000];
const stdA = a => STD_A.find(x => x >= a) ?? Math.ceil(a / 1000) * 1000;
const GEN = [150, 200, 300, 400, 500, 600, 750, 800, 1000, 1250, 1500, 2000, 2500];

// ---------- fixture counts (NYC PC 2022 Table 403.1, §403.1.1 50/50 split, fractions rounded up) ----------
// A-1 / A-3: WC 1 per 70 (male) / 1 per 35 (female) for the first 210 of each sex, then 1 per 125 / 1 per 65; lav 1 per 200; DF 1 per 500.
// B: stepped NYC counts per sex — WC 1–20:1, 21–45:2, 46–70:3, 71–100:4, 101–140:5, 141–190:6, +1 per 50;
//    lav 1–25:1, 26–50:2, 51–75:3, 76–115:4, 116–160:5, +1 per 60; DF 1 per 100. (verify column assignment against the printed table)
const tier = (n, first, r1, r2) => n <= first ? n / r1 : first / r1 + (n - first) / r2;
const steps = (n, tbl, extra) => { if (n <= 0) return 0; for (const [lim, k] of tbl) if (n <= lim) return k; const [lim, k] = tbl[tbl.length - 1]; return k + Math.ceil((n - lim) / extra); };
const B_WC = [[20, 1], [45, 2], [70, 3], [100, 4], [140, 5], [190, 6]], B_LAV = [[25, 1], [50, 2], [75, 3], [115, 4], [160, 5]];
function fixtureDemand(occByGrp) {
  let wcM = 0, wcF = 0, lavM = 0, lavF = 0, df = 0;
  for (const [g, occ] of Object.entries(occByGrp)) {
    const m = occ / 2, f = occ / 2;
    if (g === 'A-1' || g === 'A-3') { wcM += tier(m, 210, 70, 125); wcF += tier(f, 210, 35, 65); lavM += m / 200; lavF += f / 200; df += occ / 500; }
    else if (g === 'A-2') { wcM += m / 75; wcF += f / 75; lavM += m / 200; lavF += f / 200; df += occ / 500; }
    else if (g === 'B') { const n = Math.ceil(m - 1e-9); wcM += steps(n, B_WC, 50); wcF += steps(n, B_WC, 50); lavM += steps(n, B_LAV, 60); lavF += steps(n, B_LAV, 60); df += occ / 100; }
    else if (g === 'M') { wcM += m / 500; wcF += f / 500; lavM += m / 750; lavF += f / 750; df += occ / 1000; }
  }
  const any = Object.values(occByGrp).some(v => v > 0);
  const c = v => any ? Math.max(1, Math.ceil(v - 1e-9)) : 0;
  return { wcM: c(wcM), wcF: c(wcF), lavM: c(lavM), lavF: c(lavF), df: any ? Math.max(1, Math.ceil(df)) : 0, ss: any ? 1 : 0 };
}

// ---------- geometry helpers ----------
const cr = (ax, ay, bx, by) => ax * by - ay * bx;
export function insideTris(tris, x, y) {
  for (const t of tris) {
    const d1 = cr(t[2] - t[0], t[3] - t[1], x - t[0], y - t[1]), d2 = cr(t[4] - t[2], t[5] - t[3], x - t[2], y - t[3]), d3 = cr(t[0] - t[4], t[1] - t[5], x - t[4], y - t[5]);
    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
  }
  return false;
}

// ---------- main generator ----------
export function generate(P, A = DEFAULTS, cats = CATS) {
  const E = [];           // elements
  let nid = 0;
  const add = (e) => { e.id = 'E' + (++nid); E.push(e); return e; };
  const seg = (sys, sub, floor, a, b, size, props = {}) => add({ sys, sub, floor, kind: size.d ? 'cyl' : 'box', a, b, w: size.w ?? size.d, h: size.h ?? size.d, props });
  const box = (sys, sub, floor, c, dims, props = {}) => add({ sys, sub, floor, kind: 'equip', c, dims, props });

  const L = P.levels, nOcc = L.length - 1, roofIdx = L.length - 1; // last level = roof technical
  const MEP = P.mep || {};
  const bArea = b => (b[3] - b[0]) * (b[4] - b[1]);
  const rr = MEP.restrooms?.[0]?.bbox;
  const SH = MEP.shafts || [];
  const plbS = rr ? SH.find(s => Math.abs(s.bbox[4] - rr[1]) < 0.3 || Math.abs(s.bbox[1] - rr[4]) < 0.3) : null;
  const hvS = SH.filter(s => s !== plbS).sort((a, b) => bArea(b.bbox) - bArea(a.bbox))[0];
  const cx = hvS ? (hvS.bbox[0] + hvS.bbox[3]) / 2 : P.core.x, cy = hvS ? (hvS.bbox[1] + hvS.bbox[4]) / 2 : P.core.y;
  const zBase = P.basementZ ?? (P.levels[0].z - 1);
  const floors = [];
  const slabC = l => { let a = 0, x = 0, y = 0; for (const t of l.tris) { const ar = Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2; a += ar; x += ar * (t[0] + t[2] + t[4]) / 3; y += ar * (t[1] + t[3] + t[5]) / 3; } if (!a) return [cx, cy]; let px = x / a, py = y / a; if (!insideTris(l.tris, px, py)) { let best = null; for (const t of l.tris) { const tx = (t[0] + t[2] + t[4]) / 3, ty = (t[1] + t[3] + t[5]) / 3, d = (tx - px) ** 2 + (ty - py) ** 2, ar = Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2; if (ar > 4 && (!best || d < best[0])) best = [d, tx, ty]; } if (best) { px = best[1]; py = best[2]; } } return [px, py]; };

  // ---- 1. zones & loads per floor ----
  const audArea = P.volumes.filter(v => v.cat === 'auditorium').reduce((s, v) => s + v.area, 0) || 1;
  for (let i = 0; i < L.length; i++) {
    const lv = L[i], zNext = i < L.length - 1 ? L[i + 1].z : Math.max(...P.volumes.filter(v => v.floor === i).map(v => v.zmax), lv.z + 6);
    const vols = P.volumes.filter(v => v.floor === i);
    const progA = vols.filter(v => !cats[v.cat].exterior).reduce((s, v) => s + v.area, 0);
    const zones = vols.map(v => ({ id: v.id, cat: v.cat, area: v.area, x: v.c[0], y: v.c[1], bbox: v.bbox, zmax: v.zmax }));
    const hasRR = rr && lv.z >= rr[2] - 0.2 && lv.z < rr[5] - 0.2 && i !== roofIdx;
    if (hasRR) zones.push({ id: 'RR-' + (i + 1), cat: 'restroom', area: r1(bArea(rr)), x: (rr[0] + rr[3]) / 2, y: (rr[1] + rr[4]) / 2, bbox: null, restroom: true });
    const sup = Math.max(0, lv.area - progA - (hasRR ? bArea(rr) : 0));
    const sc = slabC(lv);
    if (sup > 20 && i !== roofIdx) zones.push({ id: 'SUP-' + (i + 1), cat: 'support', area: r1(sup), x: sc[0], y: sc[1], bbox: null, synthetic: true });
    const f = { idx: i, name: i === roofIdx ? 'RT' : 'L' + String(i + 1).padStart(2, '0'), z: lv.z, zNext, ftf: zNext - lv.z, grossM2: lv.area, zones, occByGrp: {} };
    let T = { occ: 0, oa: 0, cfm: 0, tons: 0, mbh: 0, light: 0, plug: 0, aftCond: 0 };
    for (const zn of zones) {
      const c = cats[zn.cat], aft = zn.area * M2FT2;
      const olf = (i === 0 && c.olfGrade) ? c.olfGrade : c.olf;
      zn.occ = zn.cat === 'auditorium' && A.auditoriumSeats > 0 ? Math.ceil(A.auditoriumSeats * zn.area / audArea) : olf ? Math.ceil(aft / olf) : 0;
      if (c.grp && c.grp !== '-') f.occByGrp[c.grp] = (f.occByGrp[c.grp] || 0) + zn.occ;
      zn.light = c.lpd * aft / 1000; zn.plug = c.epd * aft / 1000; // kW
      if (zn.cat === 'immersive' && zn.bbox) {
        const W = zn.bbox[3] - zn.bbox[0], D = zn.bbox[4] - zn.bbox[1], H = zn.bbox[5] - zn.bbox[2];
        zn.wallPerim = r1(2 * (W + D)); zn.wallH = r1(H);
        zn.projCols = Math.ceil(zn.wallPerim / (A.projImgW * (1 - A.projOverlap)));
        zn.projRows = Math.max(1, Math.ceil(H * 0.9 / (A.projImgH * (1 - A.projOverlap))));
        zn.projectors = zn.projCols * zn.projRows;
        zn.avKW = zn.projectors * A.projKW + A.avRackKW;
        zn.plug += zn.avKW;
      }
      if (zn.cat === 'office') { zn.desks = Math.floor(zn.area / A.deskM2); zn.plug += zn.desks * A.deskW / 1000; }
      if (c.exterior) { zn.oa = zn.cfm = zn.tons = zn.mbh = 0; }
      else {
        zn.oa = Math.ceil((c.Rp * zn.occ + c.Ra * aft) / A.Ez);
        const qs = aft * A.envLoad + zn.occ * A.peopleSens + (zn.light + zn.plug) * 3412;
        zn.cfm = Math.ceil(Math.max(qs / (1.08 * A.supplyDT), zn.oa, aft * 0.4) / 50) * 50;
        const qOA = 4.5 * zn.oa * 13.4; // Btuh, OA enthalpy delta (NYC summer approx.)
        zn.tons = (qs + zn.occ * A.peopleLat + qOA) / 12000;
        zn.mbh = (aft * A.heatLoad + 1.08 * zn.oa * (70 - A.oaWinter)) / 1000;
        T.aftCond += aft;
      }
      zn.cfmft2 = zn.cfm / aft;
      T.occ += zn.occ; T.oa += zn.oa; T.cfm += zn.cfm; T.tons += zn.tons; T.mbh += zn.mbh; T.light += zn.light; T.plug += zn.plug;
    }
    Object.assign(f, T);
    // plumbing per floor
    f.fix = i === roofIdx ? { wcM: 0, wcF: 0, lavM: 0, lavF: 0, df: 0, ss: 1 } : fixtureDemand(f.occByGrp);
    f.hasRR = !!hasRR;
    const pv = MEP.fixtures?.[i];   // fixtures modelled in the core/restroom detail FBX
    f.fixProv = pv ? { wc: pv.WC || 0, ur: pv.urinal || 0, lav: pv.lav || 0, ss: pv.ss || 0, df: pv.df || 0, baby: pv.baby || 0 } : null;
    const fx = f.fix;
    const wc = pv ? (pv.WC || 0) + (pv.urinal || 0) : fx.wcM + fx.wcF, lav = pv ? pv.lav || 0 : fx.lavM + fx.lavF;
    f.fixReqWC = fx.wcM + fx.wcF; f.fixReqLav = fx.lavM + fx.lavF;
    const kitchens = zones.filter(z => z.cat === 'food').length;
    f.wsfuC = wc * 10 + lav * 1.5 + fx.ss * 2.25 + fx.df * 0.25 + kitchens * 12;
    f.wsfuH = lav * 1.5 + fx.ss * 2.25 + kitchens * 8;
    f.wsfuT = wc * 10 + lav * 2 + fx.ss * 3 + fx.df * 0.25 + kitchens * 20;   // total (combined) column, NYC PC Appendix E: lav 2, service sink 3
    f.dfu = wc * 4 + lav * 1 + fx.ss * 3 + fx.df * 0.5 + (wc > 0 ? 2 : 0) + kitchens * 12;
    f.exhaust = wc * 70;
    f.restroomM2 = hasRR ? r1(bArea(rr)) : (wc && !rr ? r1((wc * 3.6 + lav * 1.6) * 1.35 + 4) : 0);
    f.heads = 0;
    floors.push(f);
  }
  const occF = floors.slice(0, nOcc);
  const sum = (arr, k) => arr.reduce((s, f) => s + (f[k] || 0), 0);

  // ---- 2. shafts (sized on the most-loaded segment) ----
  const totOA = sum(floors, 'oa'), totCFM = sum(floors, 'cfm'), totTons = sum(floors, 'tons'), totMBH = sum(floors, 'mbh');
  const ea = f => Math.round(f.oa * 0.85);
  const totEA = floors.reduce((s, f) => s + ea(f), 0);
  const central = A.concept === 'central';
  // real shafts from the model (fallback: synthetic core row)
  const mk = (name, bb) => ({ name, x0: bb[0], x1: bb[3], y0: bb[1], y1: bb[4], z0: bb[2], z1: bb[5], len: r1(bb[3] - bb[0]), dep: r1(bb[4] - bb[1]), area: r1(bArea(bb)), modelled: true });
  const hvB = hvS ? hvS.bbox : [cx - 5, cy - 1.3, zBase, cx + 5, cy + 1.3, L[roofIdx].z];
  const shaftH = mk(hvS ? 'Main MEP shaft (model)' : 'Main MEP shaft (assumed)', hvB);
  if (!hvS) shaftH.modelled = false;
  const maxRiserDepthIn = Math.max(12, (shaftH.dep - 0.3) / IN);
  const riserDuct = cfm => ductRect(cfm, A.vRiser, Math.min(60, maxRiserDepthIn));
  const chwG = t => t * 24 / A.chwDT, hhwG = m => m * 1000 / (500 * A.hhwDT);
  const hvacItems = central
    ? [{ k: 'SA', sub: 'Supply air', d: riserDuct(totCFM) }, { k: 'RA', sub: 'Return air', d: riserDuct(totCFM - totOA) }]
    : [{ k: 'OA', sub: 'Outdoor air', d: riserDuct(totOA) }, { k: 'EA', sub: 'Exhaust air', d: riserDuct(totEA) },
       { k: 'CHWS', sub: 'Chilled water', p: pipeFor(chwG(totTons), hydV) }, { k: 'CHWR', sub: 'Chilled water', p: pipeFor(chwG(totTons), hydV) },
       { k: 'HHWS', sub: 'Heating hot water', p: pipeFor(hhwG(totMBH), hydV) }, { k: 'HHWR', sub: 'Heating hot water', p: pipeFor(hhwG(totMBH), hydV) }];
  // plumbing totals
  const totWsfuC = sum(floors, 'wsfuC'), totWsfuH = sum(floors, 'wsfuH'), totWsfuT = sum(floors, 'wsfuT'), totDFU = sum(floors, 'dfu');
  const roofFt2 = Math.max(...L.map(l => l.area)) * M2FT2;
  const stormGpm = roofFt2 * A.rainfall / 96.23;
  const leaders = Math.max(2, Math.ceil(stormGpm / 563));
  const stormItems = Array.from({ length: leaders }, (_, j) => ({ k: 'ST' + (j + 1), sub: 'Storm', p: { nom: leaderSize(stormGpm / leaders) } }));
  const plbItems = [
    { k: 'CW', sub: 'Domestic cold water', p: pipeFor(wsfuToGpm(totWsfuT), domV) },
    { k: 'HW', sub: 'Domestic hot water', p: pipeFor(wsfuToGpm(totWsfuH), domV) },
    { k: 'HWR', sub: 'Domestic hot water', p: { nom: 1 } },
    { k: 'SAN', sub: 'Sanitary', p: { nom: stackSize(totDFU) } },
    { k: 'V', sub: 'Vent', p: { nom: Math.max(2, stackSize(totDFU) - 1) } },
  ];
  // storm leaders need to reach the roof: in the main shaft when the plumbing chase stops below the roof
  const plbB = plbS ? plbS.bbox : null;
  const stormInMain = !plbB || plbB[5] < L[roofIdx].z - 0.5;
  if (!stormInMain) plbItems.push(...stormItems);
  const elecItems = [{ k: 'BUS', sub: 'Busway riser', fp: [0.6, 0.35] }, { k: 'EM', sub: 'Emergency feeder', fp: [0.35, 0.35] }];
  const mainItems = [...hvacItems, ...(stormInMain ? stormItems : []), ...elecItems];
  const footprint = it => it.fp ? it.fp : it.d ? [it.d.w * IN, it.d.h * IN] : [(it.p.nom + 3) * IN, (it.p.nom + 3) * IN];
  // lay risers in rows along the shaft length (north face first); grow the shaft south if needed
  const layout = (items, sh, gap = 0.15, startX = null, grow = false) => {
    const rows = [[]]; let x = gap;
    for (const it of items) { const [w] = footprint(it); if (x + w + gap > sh.len && rows[rows.length - 1].length) { rows.push([]); x = gap; } it.ox = x + w / 2; x += w + gap; rows[rows.length - 1].push(it); }
    let yo = gap, maxX = 0;
    for (const r of rows) { const d = Math.max(...r.map(it => footprint(it)[1])); r.forEach(it => it.oy = yo + d / 2); yo += d + gap; maxX = Math.max(maxX, ...r.map(it => it.ox + footprint(it)[0] / 2 + gap)); }
    if (startX != null && rows.length === 1) { const shift = Math.max(0, Math.min(sh.len - maxX, startX - sh.x0 - items[0].ox)); items.forEach(it => it.ox += shift); }
    sh.reqLen = r1(Math.min(maxX, sh.len)); sh.reqDep = r1(yo); sh.reqArea = r1(sh.reqLen * yo * 1.1); // +10% access/fire-stopping allowance
    sh.fits = maxX <= sh.len + 0.01 && yo <= sh.dep + 0.01;
    if (!sh.fits && grow) { sh.origArea = sh.area; sh.origY0 = sh.y0; sh.y0 = r1(sh.y1 - Math.max(yo * 1.1, sh.dep) - 0.05); sh.dep = r1(sh.y1 - sh.y0); sh.area = r1(sh.len * sh.dep); sh.enlarged = true; sh.fits = true; sh.name = sh.name.replace('(model)', '(enlarged)'); }
    items.forEach(it => { it.x = sh.x0 + it.ox; it.y = sh.y1 - it.oy; it.shaft = sh.name; });
  };
  layout(mainItems, shaftH, 0.15, null, A.autoShaft);
  const shaftP = plbB ? mk('Plumbing chase (model)', plbB) : mk('Plumbing shaft (assumed)', [cx - 9, cy - 0.5, zBase, cx - 6, cy + 0.5, L[roofIdx].z]);
  const riserPt = MEP.risers?.[0];
  plbItems.sort((a, b) => (a.k === 'SAN' ? -1 : b.k === 'SAN' ? 1 : 0));
  layout(plbItems, shaftP, 0.12, riserPt ? riserPt[0] : null);
  const elecX = elecItems[0].x;
  const shaftE = { name: 'Electrical riser (in main shaft)', x0: elecItems[0].x - 0.4, x1: elecItems[1].x + 0.3, y0: shaftH.y0, y1: shaftH.y1, len: 1.4, dep: shaftH.dep };
  // stairs (standpipes) from the model
  const stairs = (MEP.stairs?.length ? MEP.stairs : [{ id: 'S1', bbox: [cx + 6, cy - 3, zBase, cx + 9, cy + 3, L[nOcc - 1].z + 2] }, { id: 'S2', bbox: [P.stair2.x - 1.5, P.stair2.y - 3, zBase, P.stair2.x + 1.5, P.stair2.y + 3, L[nOcc - 1].z + 2] }])
    .map(s => ({ ...s, sx: s.bbox[0] + 0.35, sy: s.bbox[1] + 0.35, top: s.bbox[5] }));
  const mainStair = stairs.slice().sort((a, b) => Math.hypot((a.bbox[0] + a.bbox[3]) / 2 - cx, (a.bbox[1] + a.bbox[4]) / 2 - cy) - Math.hypot((b.bbox[0] + b.bbox[3]) / 2 - cx, (b.bbox[1] + b.bbox[4]) / 2 - cy))[0];
  const shaftF = { name: `Stair ${mainStair.id} (standpipe / FCV)`, x0: mainStair.bbox[0], x1: mainStair.bbox[3], y0: mainStair.bbox[1], y1: mainStair.bbox[4] };
  const shafts = { HVAC: shaftH, Plumbing: shaftP };
  const nStand = stairs.length;
  const spFlow = A.standpipeFlow || Math.min(1000, 500 + 250 * (nStand - 1));

  // ---- 3. per-floor horizontal distribution ----
  const yS = shaftH.y0 - 1.5;                 // AHU line + supply trunk (south face of main shaft)
  const yE = yS;                              // cable tray (higher band)
  const yF = yS - 1.4;                        // sprinkler main
  const yP = shaftP.y0 - 0.9;                 // plumbing trunk (kitchens)
  const yX = shaftH.y0 - 0.25;                // toilet-exhaust run, between trunk and shaft
  const outside = []; const clearIssues = [];

  // trunk + branches helper
  function trunk(sys, sub, fl, ox, ty, z, branches, sizeMain, sizeBr, props = {}) {
    const res = [];
    for (const side of [-1, 1]) {
      const br = branches.filter(b => (side < 0 ? b.x < ox : b.x >= ox)).sort((a, b) => Math.abs(a.x - ox) - Math.abs(b.x - ox));
      let x = ox, remaining = br.reduce((s, b) => s + b.load, 0);
      for (const b of br) {
        if (Math.abs(b.x - x) > 0.05) res.push(seg(sys, sub, fl, [x, ty, z], [b.x, ty, z], sizeMain(remaining), { ...props, role: 'main', load: r0(remaining) }));
        if (Math.abs(b.y - ty) > 0.3) res.push(seg(sys, sub, fl, [b.x, ty, z], [b.x, b.y, z], sizeBr(b.load), { ...props, role: 'branch', zone: b.zone, load: r0(b.load) }));
        remaining -= b.load; x = b.x;
      }
    }
    return res;
  }
  const dSize = (fpm) => cfm => { const d = ductRect(cfm, fpm, A.maxDuctDepth); return { w: d.w * IN, h: d.h * IN, info: d }; };
  const pSize = nom => ({ d: (nom + 0.5) * IN });

  for (const f of floors.slice(0, nOcc)) {
    const zTop = f.zNext - A.structDepth, fl = f.idx;
    const cond = f.zones.filter(z => z.cfm > 0);
    // --- HVAC
    const mainSz = dSize(A.vMain), brSz = dSize(A.vBranch);
    const sideL = cond.filter(z => z.x < cx).reduce((a, z) => a + z.cfm, 0), sideR = f.cfm - sideL;
    const maxMain = ductRect(Math.max(sideL, sideR, 500), A.vMain, A.maxDuctDepth);
    const zDuct = zTop - 0.6 - maxMain.h * IN / 2;
    f.ductDepthIn = maxMain.h; f.mainDuct = `${maxMain.w}×${maxMain.h} in`;
    f.ceiling = r1(zDuct - maxMain.h * IN / 2 - 0.15 - f.z); // clear height to underside of services
    let ox = (shaftH.x0 + shaftH.x1) / 2;
    const hv = k => mainItems.find(i => i.k === k);
    if (!central) {
      const Wm = 2.4, Hm = Math.min(2.6, f.ftf - A.structDepth - 1.2);
      const Lm = Math.min(Math.max(3, shaftE.x0 - shaftH.x0 - 0.3), 2.5 + f.cfm / 6000);
      ox = shaftH.x0 + 0.15 + Lm / 2;
      const ahuY = yS;
      f.ahuRoomM2 = r1((Lm + 2.4) * (Wm + 2.0));
      box('HVAC', 'Air handling unit', fl, [ox, ahuY, f.z + Hm / 2], [Lm, Wm, Hm], { tag: `AHU-${f.name}`, cfm: f.cfm, oa_cfm: f.oa, tons: r1(f.tons), mbh: r0(f.mbh), mech_room_m2_needed: f.ahuRoomM2, note: 'Floor AHU w/ CHW+HHW coils, plenum return. Mech room not yet in model.' });
      seg('HVAC', 'Supply air', fl, [ox, ahuY, f.z + Hm], [ox, ahuY, zDuct], mainSz(f.cfm), { role: 'AHU discharge', load: f.cfm });
      seg('HVAC', 'Return air', fl, [ox - Lm / 2, ahuY, f.z + Hm * 0.7], [ox - Lm / 2 - 2.0, ahuY, f.z + Hm * 0.7], dSize(A.vBranch)(f.cfm - f.oa), { role: 'plenum return intake', load: f.cfm - f.oa });
      const oaIt = hv('OA');
      seg('HVAC', 'Outdoor air', fl, [oaIt.x, shaftH.y0, zTop - 0.35], [oaIt.x, ahuY + Wm / 2, zTop - 0.35], dSize(A.vBranch)(f.oa), { role: 'OA to AHU', load: f.oa });
      for (const k of ['CHWS', 'CHWR', 'HHWS', 'HHWR']) {
        const it = hv(k); const g = k.startsWith('CHW') ? chwG(f.tons) : hhwG(f.mbh); const p = pipeFor(g, hydV);
        seg('HVAC', it.sub, fl, [it.x, shaftH.y0, zTop - 0.45], [it.x, ahuY + 0.6, zTop - 0.45], pSize(p.nom), { tag: k, gpm: r0(g), size_in: p.nom });
        seg('HVAC', it.sub, fl, [it.x, ahuY + 0.6, zTop - 0.45], [it.x, ahuY + 0.6, f.z + Hm], pSize(p.nom), { tag: k, gpm: r0(g), size_in: p.nom, role: 'drop to AHU coil' });
      }
    } else {
      const sa = hv('SA'); ox = sa.x;
      seg('HVAC', 'Supply air', fl, [ox, shaftH.y0, zDuct], [ox, yS, zDuct], mainSz(f.cfm), { role: 'shaft takeoff', load: f.cfm });
      const ra = hv('RA');
      seg('HVAC', 'Return air', fl, [ra.x, shaftH.y0, zDuct], [ra.x, shaftH.y0 - 2.0, zDuct], dSize(A.vBranch)(f.cfm - f.oa), { role: 'plenum return', load: f.cfm - f.oa });
    }
    trunk('HVAC', 'Supply air', fl, ox, yS, zDuct, cond.filter(z => !z.restroom).map(z => ({ x: z.x, y: z.y, load: z.cfm, zone: z.id })), mainSz, brSz, { unit: 'cfm' });
    // zone distribution: open-plan grids for galleries / immersive halls / lobby / food; header + diffusers elsewhere
    const OPEN = { gallery: 1, immersive: 1, lobby: 1, food: 1 };
    for (const z of cond.filter(z => !z.restroom)) {
      const bb = z.bbox;
      if (bb && OPEN[z.cat]) {
        const inset = z.cat === 'immersive' ? Math.min(4, (Math.min(bb[3] - bb[0], bb[4] - bb[1])) * 0.2) : 1.5; // keep projection walls clear
        const x0 = bb[0] + inset, x1 = bb[3] - inset, y0 = bb[1] + inset, y1 = bb[4] - inset;
        const nRun = Math.max(1, Math.round((y1 - y0) / A.gridSpacing) + 1), sp = nRun > 1 ? (y1 - y0) / (nRun - 1) : 0;
        const ys = Array.from({ length: nRun }, (_, k) => nRun > 1 ? y0 + k * sp : (y0 + y1) / 2);
        const hdr = ductRect(z.cfm, A.vBranch, A.maxDuctDepth);
        const tall = z.zmax && z.zmax > f.zNext + 0.5, zz = tall ? z.zmax - A.structDepth - 0.6 - hdr.h * IN / 2 : zDuct;  // multi-storey halls: distribute at their own ceiling
        if (tall) { seg('HVAC', 'Supply air', fl, [z.x, z.y, zDuct], [z.x, z.y, zz], { w: hdr.w * IN, h: hdr.h * IN }, { role: 'riser to high ceiling', zone: z.id, load: z.cfm }); z.layout = 'high-level'; }
        seg('HVAC', 'Supply air', fl, [z.x, ys[0], zz], [z.x, ys[ys.length - 1], zz], { w: hdr.w * IN, h: hdr.h * IN }, { role: 'zone header', zone: z.id, load: z.cfm, size: `${hdr.w}×${hdr.h} in` });
        const per = z.cfm / nRun, rd = ductRound(per / 2, A.vBranch);
        const nd = Math.min(60, Math.max(2, Math.ceil(z.cfm / A.diffuserCfm))), perRun = Math.max(1, Math.round(nd / nRun));
        let placed = 0;
        for (const y of ys) {
          seg('HVAC', 'Supply air', fl, [x0, y, zz], [x1, y, zz], { d: rd.d * IN }, { role: 'run-out', zone: z.id, load: r0(per), size: `Ø${rd.d} in` });
          for (let k = 0; k < perRun; k++) { const x = x0 + (x1 - x0) * (k + 0.5) / perRun; if (insideTris(P.levels[fl].tris, x, y)) { box('HVAC', 'Diffuser', fl, [x, y, zz - rd.d * IN / 2 - 0.08], [0.6, 0.6, 0.12], { zone: z.id, cfm: r0(z.cfm / nd), type: z.cat === 'immersive' ? 'low-velocity ceiling (no sidewall grilles — projection walls)' : 'ceiling / linear' }); placed++; } }
        }
        z.diffusers = placed; z.layout = `open-plan grid ${nRun} run-outs @ ${r1(sp)} m${tall ? ', at hall ceiling +' + r1(zz) : ''}`;
      } else {
        const half = bb ? Math.min((bb[3] - bb[0]) * 0.35, 12) : 4;
        const hdr = ductRound(z.cfm / 2, A.vBranch);
        for (const s of [-1, 1]) seg('HVAC', 'Supply air', fl, [z.x, z.y, zDuct], [z.x + s * half, z.y, zDuct], { d: hdr.d * IN }, { role: 'zone header', zone: z.id, load: r0(z.cfm / 2), size: `Ø${hdr.d} in` });
        const n = Math.min(24, Math.max(2, Math.ceil(z.cfm / A.diffuserCfm)));
        for (let k = 0; k < n; k++) box('HVAC', 'Diffuser', fl, [z.x - half + (2 * half) * (k + 0.5) / n, z.y, zDuct - hdr.d * IN / 2 - 0.08], [0.6, 0.6, 0.12], { zone: z.id, cfm: r0(z.cfm / n) });
        z.diffusers = n;
      }
      if (!insideTris(P.levels[fl].tris, z.x, z.y)) outside.push(`${f.name} ${z.id}: zone centroid outside slab`);
      // immersive halls: ceiling projector ring aimed at every wall + AV rack
      if (z.projectors) {
        const [bx0, by0, bz0, bx1, by1, bz1] = bb, off = Math.min(5, Math.min(bx1 - bx0, by1 - by0) * 0.3);
        const rx0 = bx0 + off, rx1 = bx1 - off, ry0 = by0 + off, ry1 = by1 - off, per = 2 * ((rx1 - rx0) + (ry1 - ry0));
        const pt = t => { let d = t * per; const W = rx1 - rx0, D = ry1 - ry0; if (d < W) return [rx0 + d, ry0, 0]; d -= W; if (d < D) return [rx1, ry0 + d, 1]; d -= D; if (d < W) return [rx1 - d, ry1, 2]; d -= W; return [rx0, ry1 - d, 3]; };
        for (let r = 0; r < z.projRows; r++) for (let k = 0; k < z.projCols; k++) {
          const [x, y, side] = pt((k + 0.5 + r * 0.5) / z.projCols % 1);
          box('AV', 'Projector', fl, [x, y, bz1 - 0.55 - r * 0.45], side % 2 ? [0.6, 0.7, 0.3] : [0.7, 0.6, 0.3], { zone: z.id, kW: A.projKW, aims_at: ['south wall', 'east wall', 'north wall', 'west wall'][side], tier: r + 1, note: 'Laser projector ~30k lm, ceiling truss mount, dedicated circuit + data' });
        }
        box('AV', 'AV rack', fl, [bx0 + 1, by0 + 1, f.z + 1.0], [1.2, 0.8, 2.0], { zone: z.id, kW: A.avRackKW, note: 'Media servers / audio / network — needs 24/7 cooling (consider dedicated split or CHW fan coil)' });
        // high-level exhaust/return at the projector ring (projector heat stays at ceiling)
        const rH = ductRound(Math.round(z.projectors * A.projKW * 3412 / (1.08 * 25)), A.vBranch);
        seg('HVAC', 'Return air', fl, [rx0, (ry0 + ry1) / 2, bz1 - 0.35], [rx1, (ry0 + ry1) / 2, bz1 - 0.35], { d: rH.d * IN }, { role: 'high-level return over projectors', zone: z.id, cfm: r0(z.projectors * A.projKW * 3412 / (1.08 * 25)) });
      }
    }
    // restroom (from model) + toilet exhaust
    const rrb = f.hasRR ? rr : null;
    const restroomC = rrb ? [(rrb[0] + rrb[3]) / 2, (rrb[1] + rrb[4]) / 2] : [(shaftP.x0 + shaftP.x1) / 2, shaftP.y1 + 2];
    if (f.restroomM2) {
      const pv = f.fixProv || {};
      box('Plumbing', 'Restroom core', fl, [restroomC[0], restroomC[1], f.z + 1.5], rrb ? [rrb[3] - rrb[0], rrb[4] - rrb[1], 3.0] : [5, 4, 3], { tag: `TR-${f.name}`, area_m2: f.restroomM2, WC_provided: pv.wc, lav_provided: pv.lav, service_sink: pv.ss, baby_change: pv.baby, WC_required: f.fixReqWC, lav_required: f.fixReqLav, DF_required: f.fix.df, ghost: true });
      const ex = Math.max(f.exhaust, 200), eaIt = hv('EA') || hv('RA');
      const ed = dSize(A.vBranch)(ex);
      seg('HVAC', 'Exhaust air', fl, [restroomC[0], restroomC[1], zTop - 0.35], [restroomC[0], yX, zTop - 0.35], ed, { role: 'toilet exhaust', load: f.exhaust, rate: '70 cfm / WC' });
      seg('HVAC', 'Exhaust air', fl, [restroomC[0], yX, zTop - 0.35], [eaIt.x, yX, zTop - 0.35], ed, { role: 'toilet exhaust', load: f.exhaust });
      seg('HVAC', 'Exhaust air', fl, [eaIt.x, yX, zTop - 0.35], [eaIt.x, shaftH.y0, zTop - 0.35], ed, { role: 'toilet exhaust', load: f.exhaust });
    }
    // --- Plumbing
    const zP = zTop - 0.42;
    const pk = k => plbItems.find(i => i.k === k);
    const cwIt = pk('CW'), hwIt = pk('HW'), sanIt = pk('SAN'), vIt = pk('V');
    const px = it => it.x;
    if (f.restroomM2) {
      const gC = wsfuToGpm(f.wsfuT), gH = wsfuToGpm(f.wsfuH), ry = rrb ? rrb[1] + 0.6 : restroomC[1];
      seg('Plumbing', 'Domestic cold water', fl, [px(cwIt), shaftP.y1, zP], [px(cwIt), ry, zP], pSize(pipeFor(gC, domV).nom), { wsfu: r0(f.wsfuT), gpm: r0(gC), size_in: pipeFor(gC, domV).nom });
      seg('Plumbing', 'Domestic cold water', fl, [rrb ? rrb[0] + 0.5 : px(cwIt) - 3, ry, zP], [rrb ? rrb[3] - 0.5 : px(cwIt) + 3, ry, zP], pSize(pipeFor(gC, domV).nom), { role: 'wet-wall header' });
      seg('Plumbing', 'Domestic hot water', fl, [px(hwIt), shaftP.y1, zP - 0.12], [px(hwIt), ry + 0.15, zP - 0.12], pSize(pipeFor(gH, domV).nom), { wsfu: r0(f.wsfuH), gpm: r0(gH), size_in: pipeFor(gH, domV).nom });
      seg('Plumbing', 'Domestic hot water', fl, [rrb ? rrb[0] + 0.5 : px(hwIt) - 3, ry + 0.15, zP - 0.12], [rrb ? rrb[3] - 0.5 : px(hwIt) + 3, ry + 0.15, zP - 0.12], pSize(pipeFor(gH, domV).nom), { role: 'wet-wall header' });
      const bsz = branchSize(f.dfu);
      seg('Plumbing', 'Sanitary', fl, [rrb ? rrb[0] + 0.5 : px(sanIt) - 3, ry - 0.1, f.z - 0.45], [rrb ? rrb[3] - 0.5 : px(sanIt) + 3, ry - 0.1, f.z - 0.45], pSize(bsz), { dfu: r0(f.dfu), size_in: bsz, slope: '1/8 in/ft min (≥3 in)', role: 'fixture branch (below slab)' });
      seg('Plumbing', 'Sanitary', fl, [px(sanIt), ry - 0.1, f.z - 0.45], [px(sanIt), (shaftP.y0 + shaftP.y1) / 2, f.z - 0.45], pSize(bsz), { dfu: r0(f.dfu) });
      seg('Plumbing', 'Vent', fl, [rrb ? rrb[0] + 0.6 : px(vIt), ry + 0.3, f.z + 1.2], [rrb ? rrb[3] - 0.6 : px(vIt) + 3, ry + 0.3, f.z + 1.2], pSize(2), { size_in: 2, role: 'vent header in wet wall' });
    }
    const kitchens = f.zones.filter(z => z.cat === 'food');
    if (kitchens.length) {
      trunk('Plumbing', 'Domestic cold water', fl, px(cwIt), yP, zP, kitchens.map(z => ({ x: z.x, y: z.y, load: 12, zone: z.id })), () => pSize(1.5), () => pSize(1.25), { note: 'Food-service fixtures TBD' });
      trunk('Plumbing', 'Domestic hot water', fl, px(hwIt), yP - 0.25, zP - 0.12, kitchens.map(z => ({ x: z.x + 0.25, y: z.y, load: 8, zone: z.id })), () => pSize(1.25), () => pSize(1), {});
      trunk('Plumbing', 'Sanitary', fl, px(sanIt), yP - 0.5, f.z - 0.5, kitchens.map(z => ({ x: z.x + 0.5, y: z.y, load: 12, zone: z.id })), () => pSize(4), () => pSize(4), { note: 'Grease interceptor required for food service — TBD' });
      seg('Plumbing', 'Domestic cold water', fl, [px(cwIt), shaftP.y0, zP], [px(cwIt), yP, zP], pSize(1.5), {});
      seg('Plumbing', 'Domestic hot water', fl, [px(hwIt), shaftP.y0, zP - 0.12], [px(hwIt), yP - 0.25, zP - 0.12], pSize(1.25), {});
      seg('Plumbing', 'Sanitary', fl, [px(sanIt), yP - 0.5, f.z - 0.5], [px(sanIt), shaftP.y0, f.z - 0.5], pSize(4), {});
    }
    // --- Electrical
    const zE = zTop - 0.12, eo = elecItems[0].x;
    const fkva = (f.light + f.plug + f.cfm * A.fanWperCfm / 1000) / A.pf;
    f.kva = fkva;
    box('Electrical', 'Panelboards', fl, [eo, shaftH.y0 - 0.45, f.z + 1.1], [1.4, 0.35, 2.2], { tag: `EP-${f.name}`, connected_kVA: r0(fkva), lighting_kW: r0(f.light), plug_media_kW: r0(f.plug), note: 'Normal + emergency panels — electrical closet not yet in model (~6–8 m² per floor)' });
    seg('Electrical', 'Cable tray', fl, [eo, shaftH.y0, zE], [eo, yE, zE], { w: 0.6, h: 0.1 }, { size: '24 in tray' });
    const traySz = kva => ({ w: kva > 300 ? 0.6 : kva > 120 ? 0.45 : 0.3, h: 0.1 });
    trunk('Electrical', 'Cable tray', fl, eo, yE, zE, f.zones.map(z => ({ x: z.x, y: z.y, load: (z.light + z.plug) / A.pf, zone: z.id })), traySz, () => ({ w: 0.3, h: 0.1 }), { unit: 'kVA' });
    // --- Fire protection (sprinklers) — floor control valve at the stair nearest the core that reaches this floor
    const zF = zTop - 0.28;
    const st = stairs.filter(s => s.top >= f.z + 1).sort((a, b) => (a === mainStair ? -1 : b === mainStair ? 1 : 0))[0] || mainStair;
    const fo = st.sx;
    seg('Fire', 'Sprinkler main', fl, [fo, st.sy, zF], [fo, yF, zF], pSize(4), { size_in: 4, note: `Floor control valve assembly in stair ${st.id}` });
    const sprZones = f.zones.filter(z => z.bbox && !cats[z.cat].exterior);
    for (const z of f.zones.filter(z => !z.bbox)) { z.heads = Math.ceil(z.area * M2FT2 / 225); f.heads += z.heads; f.headsEst = (f.headsEst || 0) + z.heads; }
    trunk('Fire', 'Sprinkler main', fl, fo, yF, zF, sprZones.map(z => ({ x: z.x, y: z.y, load: 1, zone: z.id })), () => pSize(4), () => pSize(2.5), { size: 'Cross main 4 in / feed 2.5 in (placeholder — hydraulic calculation required)' });
    for (const z of sprZones) {
      const haz = cats[z.cat].haz, sp = haz === 'LH' ? 4.57 : 3.35; // NFPA 13: LH 15 ft (225 ft², hydraulically calculated) / OH 11 ft (121 ft² ≤ 130 ft² max)
      const [x0, y0, , x1, y1] = z.bbox; const ix0 = x0 + sp / 2, iy0 = y0 + sp / 2;
      const zFz = z.zmax > f.zNext + 0.5 ? z.zmax - A.structDepth - 0.28 : zF;
      if (zFz !== zF) seg('Fire', 'Sprinkler main', fl, [z.x, z.y, zF], [z.x, z.y, zFz], pSize(2.5), { zone: z.id, role: 'riser to high ceiling' });
      let heads = 0; const pts = [];
      for (let y = iy0; y < y1; y += sp) {
        let first = null, last = null;
        for (let x = ix0; x < x1; x += sp) if (insideTris(P.levels[fl].tris, x, y)) { pts.push([x, y]); heads++; first ??= x; last = x; }
        if (first !== null && last - first > 0.1) seg('Fire', 'Sprinkler branch', fl, [first, y, zFz - 0.1], [last, y, zFz - 0.1], pSize(1.25), { zone: z.id, hazard: haz });
      }
      z.heads = heads; f.heads += heads;
      if (pts.length) add({ sys: 'Fire', sub: 'Sprinkler head', floor: fl, kind: 'points', pts: pts.map(p => [p[0], p[1], zFz - 0.18]), props: { zone: z.id, hazard: haz, heads, spacing_ft: haz === 'LH' ? 15 : 11 } });
    }
    // coordination check
    if (f.ceiling < A.minClear) clearIssues.push(`${f.name}: clear height ${f.ceiling} m < target ${A.minClear} m (main duct ${f.mainDuct}, F-F ${r1(f.ftf)} m)`);
  }

  // ---- 4. risers (per-floor segments, tapering) ----
  const zBot = zBase, zRoof = L[roofIdx].z;
  const segRange = i => [i === 0 ? zBot : L[i].z, L[i + 1] ? L[i + 1].z : zRoof + 1];
  const plbTop = shaftP.z1 ?? zRoof;
  for (let i = 0; i < roofIdx; i++) {
    const [z0, z1] = segRange(i);
    const below = floors.slice(0, i + 1), above = floors.slice(i, nOcc);
    for (const it of hvacItems) {
      let sz, props;
      // plant on roof: segment i carries floors 0..i
      if (it.d) { const cfm = it.k === 'SA' ? sum(below, 'cfm') : it.k === 'RA' ? sum(below, 'cfm') - sum(below, 'oa') : it.k === 'OA' ? sum(below, 'oa') : below.reduce((s, f) => s + ea(f), 0); const d = riserDuct(Math.max(cfm, 100)); sz = { w: d.w * IN, h: d.h * IN }; props = { tag: it.k + ' riser', cfm: r0(cfm), size: `${d.w}×${d.h} in`, vel_fpm: d.vel }; }
      else { const g = it.k.startsWith('CHW') ? chwG(sum(below, 'tons')) : hhwG(sum(below, 'mbh')); const p = pipeFor(g, hydV); sz = pSize(p.nom); props = { tag: it.k + ' riser', gpm: r0(g), size_in: p.nom, vel_fps: p.vel }; }
      seg('HVAC', it.sub, i, [it.x, it.y, Math.max(z0, L[0].z - 0.5)], [it.x, it.y, z1], sz, { ...props, role: 'riser', shaft: it.shaft });
    }
    for (const it of [...plbItems, ...(stormInMain ? stormItems : [])]) {
      const inChase = !stormInMain || !it.k.startsWith('ST');
      if (inChase && z0 >= plbTop - 0.01) continue;              // chase ends below the roof
      let nom = it.p.nom, props = {};
      if (it.k === 'CW') { const g = wsfuToGpm(sum(above, 'wsfuT')); nom = pipeFor(g, domV).nom; props = { gpm: r0(g), wsfu: r0(sum(above, 'wsfuT')) }; }
      if (it.k === 'HW') { const g = wsfuToGpm(sum(above, 'wsfuH')); nom = pipeFor(g, domV).nom; props = { gpm: r0(g) }; }
      if (it.k === 'SAN') props = { dfu_total: r0(totDFU), note: 'Stack sized for total DFU (no reduction)' };
      if (it.k.startsWith('ST')) props = { roof_ft2: r0(roofFt2 / leaders), gpm: r0(stormGpm / leaders), rainfall_in_hr: A.rainfall };
      seg('Plumbing', it.sub, i, [it.x, it.y, z0], [it.x, it.y, inChase ? Math.min(z1, plbTop) : z1], pSize(nom), { tag: it.k + ' riser', size_in: nom, ...props, role: 'riser', shaft: it.shaft });
    }
    // electrical busway: carries floors >= i plus roof plant
    const kvaUp = sum(above, 'kva');
    seg('Electrical', 'Busway riser', i, [elecItems[0].x, elecItems[0].y, z0], [elecItems[0].x, elecItems[0].y, z1], { w: 0.6, h: 0.3 }, { role: 'riser', kVA_floors_above: r0(kvaUp) });
    seg('Electrical', 'Emergency feeder', i, [elecItems[1].x, elecItems[1].y, z0], [elecItems[1].x, elecItems[1].y, z1], pSize(4), { role: 'riser', note: 'Separate 2-hr rated emergency/life-safety feeders' });
    // standpipes in every stair
    for (const s of stairs) if (z0 < s.top - 0.5) seg('Fire', 'Standpipe', i, [s.sx, s.sy, z0], [s.sx, s.sy, Math.min(z1, s.top)], pSize(6), { role: 'riser', tag: `SP-${s.id} (combined)`, size_in: 6, note: 'Hose valve at each floor landing' });
    // shafts as ghost boxes
    for (const [sys, sh] of Object.entries(shafts)) { const top = Math.min(z1, sh.z1 ?? z1); if (top > z0) box(sys, 'Shaft', i, [(sh.x0 + sh.x1) / 2, (sh.y0 + sh.y1) / 2, (z0 + top) / 2], [sh.x1 - sh.x0, sh.y1 - sh.y0, top - z0], { tag: sh.name, area_m2: sh.area, required_m2: sh.reqArea, ghost: true, rating: '2-hr (≥4 stories, NYC BC 713.4)' }); }
  }
  // vent stack must extend through the roof: offset from the top of the plumbing chase to the main shaft
  if (plbTop < zRoof - 0.5) {
    const vIt = plbItems.find(i => i.k === 'V'), lastF = floors.find(f => plbTop >= f.z - 0.1 && plbTop < f.zNext) || floors[nOcc - 1];
    const fi = Math.max(0, floors.indexOf(lastF) - 1), zo = plbTop - A.structDepth - 0.3, tx = shaftH.x0 + 0.3, ty = shaftH.y0 + 0.2;
    seg('Plumbing', 'Vent', fi, [vIt.x, vIt.y, plbTop], [vIt.x, vIt.y, zo], pSize(vIt.p.nom), { role: 'vent offset (chase stops below roof)' });
    seg('Plumbing', 'Vent', fi, [vIt.x, vIt.y, zo], [vIt.x, ty, zo], pSize(vIt.p.nom), { role: 'vent offset' });
    seg('Plumbing', 'Vent', fi, [vIt.x, ty, zo], [tx, ty, zo], pSize(vIt.p.nom), { role: 'vent offset to main shaft' });
    seg('Plumbing', 'Vent', fi, [tx, ty, zo], [tx, ty, zRoof + 1], pSize(vIt.p.nom), { role: 'vent riser in main shaft' });
  }

  // ---- 5. plant ----
  const tot = { occ: sum(floors, 'occ'), oa: totOA, cfm: totCFM, tons: totTons, mbh: totMBH, ea: totEA, light: sum(floors, 'light'), plug: sum(floors, 'plug'), heads: sum(floors, 'heads'), aftCond: sum(floors, 'aftCond'), grossFt2: L.reduce((s, l) => s + l.area, 0) * M2FT2 };
  const roofEq = [];
  const nCh = Math.max(2, Math.ceil(totTons / 350)) + 1;
  for (let k = 0; k < nCh; k++) roofEq.push({ sys: 'HVAC', sub: 'Chiller / heat-recovery chiller', dims: [11, 2.3, 2.5], props: { tag: `CH-${k + 1}`, tons: r0(totTons / (nCh - 1)), redundancy: 'N+1', kW: r0(totTons / (nCh - 1) * A.kWperTon) } });
  const nHP = Math.max(2, Math.ceil(totMBH / 1500));
  for (let k = 0; k < nHP; k++) roofEq.push({ sys: 'HVAC', sub: 'Air-to-water heat pump', dims: [6, 2.3, 2.4], props: { tag: `HP-${k + 1}`, mbh: r0(totMBH / nHP), note: 'All-electric heating assumed (LL97) — confirm' } });
  if (central) { const n = Math.ceil(totCFM / 40000); for (let k = 0; k < n; k++) roofEq.push({ sys: 'HVAC', sub: 'Central AHU', dims: [11, 4, 3.8], props: { tag: `AHU-R${k + 1}`, cfm: r0(totCFM / n) } }); }
  else { const n = Math.max(1, Math.ceil(totOA / 20000)); for (let k = 0; k < n; k++) roofEq.push({ sys: 'HVAC', sub: 'DOAS with energy recovery', dims: [9, 3, 3], props: { tag: `DOAS-${k + 1}`, oa_cfm: r0(totOA / n), ea_cfm: r0(totEA / n) } }); }
  for (const t of ['CHWP-1', 'CHWP-2', 'HHWP-1', 'HHWP-2']) roofEq.push({ sys: 'HVAC', sub: 'Pump', dims: [1.4, 0.8, 1.0], props: { tag: t } });
  const nPass = A.elevators || MEP.elevators?.passenger || 4, nFr = MEP.elevators?.freight ?? 1;
  const genLS = 0.1 * tot.light + 10 + 4 * 15 * 0.746 + A.elevatorHp * 0.746 * 1.5;
  const fpElevFt = (L[roofIdx].z - zBase + 1) * FT;
  const fpHeadPsi = A.topOutletPsi + fpElevFt * 0.433 + 15 - A.streetPsi * 0.8; // to the roof manifold (NYC BC Appendix Q, NFPA 14 §7.3.2.1)
  const fpHp = Math.ceil(spFlow * fpHeadPsi * 2.31 / (3960 * 0.7) / 25) * 25;
  const genKW = GEN.find(g => g >= (genLS + fpHp * 0.746) * 1.25) ?? 3000;
  const genItem = { sys: 'Electrical', sub: 'Emergency/standby generator', dims: [6 + genKW / 300, 2.5, 3], props: { tag: 'GEN-1', kW: genKW, note: 'Diesel w/ day tank, or verify battery/alt. strategy' } };
  if (A.genLocation !== 'basement') roofEq.push(genItem);
  // shelf-pack a list of equipment into rectangles; returns plant footprint incl. clearance and overflow list
  const CLR = 1.0;
  function pack(items, rooms, z, floorIdx) {
    const st = rooms.map(r => ({ ...r, placed: [], used: 0 }));
    const over = []; let foot = 0;
    const okIn = (r, x0, y0, x1, y1) => !r.tris || [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]].every(([x, y]) => insideTris(r.tris, x, y));
    for (const q of items.sort((a, b) => b.dims[0] * b.dims[1] - a.dims[0] * a.dims[1])) {
      let placed = false;
      for (const r of st) {
        for (const rot of [false, true]) {
          if (placed) break;
          const [l, w] = rot ? [q.dims[1], q.dims[0]] : q.dims; const h = q.dims[2];
          for (let y = r.bbox[1] + CLR; !placed && y + w <= r.bbox[4] - CLR + 1e-6; y += 0.5)
            for (let x = r.bbox[0] + CLR; x + l <= r.bbox[3] - CLR + 1e-6; x += 0.5) {
              if (r.placed.some(p => x < p[2] + CLR && x + l + CLR > p[0] && y < p[3] + CLR && y + w + CLR > p[1])) continue;
              if (!okIn(r, x - CLR * 0.5, y - CLR * 0.5, x + l + CLR * 0.5, y + w + CLR * 0.5)) continue;
              box(q.sys, q.sub, floorIdx, [x + l / 2, y + w / 2, z + h / 2], [l, w, h], { ...q.props, room: r.id });
              r.placed.push([x, y, x + l, y + w]); r.used += (l + CLR) * (w + CLR); placed = true; break;
            }
        }
        if (placed) break;
      }
      if (!placed) over.push(q);
      foot += (q.dims[0] + CLR) * (q.dims[1] + CLR);
    }
    return { foot, over, rooms: st };
  }
  // roof: the roof technical volume
  const rt = P.volumes.find(v => v.cat === 'technical'); const rb = rt ? rt.bbox : [cx - 10, cy - 10, zRoof, cx + 10, cy + 10, zRoof + 6];
  const roofRes = pack(roofEq, [{ id: 'Roof technical space', bbox: rb, tris: L[roofIdx].tris }], zRoof, roofIdx);
  // basement: technical rooms available in the model
  const techRooms = (MEP.tech || []).map(t => ({ id: 'B1 tech ' + t.id.replace('Object_', '#'), bbox: t.bbox, area: t.area })).sort((a, b) => b.area - a.area);
  const bEq = [
    { sys: 'Electrical', sub: 'Main switchboard', dims: [8, 1.2, 2.3], props: { tag: 'MSB', service_kVA: 0, note: 'NEC 110.26 working clearance ≥ 1.2 m front' } },
    { sys: 'Electrical', sub: 'Main switchboard', dims: [4, 1.0, 2.3], props: { tag: 'EM-SWBD / ATS', note: 'Emergency + legally required standby (separate room, 2-hr)' } },
    { sys: 'Electrical', sub: 'Utility transformer vault', dims: [6, 4, 3], props: { tag: 'XFMR (Con Edison)', note: 'Network vault — location per utility (often sidewalk vault)' } },
    { sys: 'Fire', sub: 'Fire pump', dims: [3.5, 1.5, 1.5], props: { tag: 'FP-1', gpm: spFlow, psi: 0, hp: fpHp, note: 'Dedicated 2-hr fire pump room, NFPA 20' } },
    { sys: 'Plumbing', sub: 'Domestic booster pump', dims: [3, 1.5, 1.6], props: { tag: 'DWBP-1', note: 'Duplex/triplex variable-speed booster set (one standby). Pressure zones split with PRVs.' } },
    { sys: 'Plumbing', sub: 'Water heater', dims: [2, 2, 2.2], props: { tag: 'WH-1', note: 'Heat-pump water heater assumed' } },
    { sys: 'Plumbing', sub: 'Water heater', dims: [2, 2, 2.2], props: { tag: 'WH-2' } },
    { sys: 'Plumbing', sub: 'Water meter + backflow', dims: [2, 1.2, 1.5], props: { tag: 'WM/RPZ', note: 'Water meter + RPZ backflow preventer' } },
  ];
  if (A.genLocation === 'basement') bEq.push(genItem);
  // pumps that do not fit on the roof move to the basement plant rooms
  const movedPumps = roofRes.over.filter(q => q.sub === 'Pump'); roofRes.over = roofRes.over.filter(q => q.sub !== 'Pump');
  movedPumps.forEach(q => { q.props = { ...q.props, note: 'Relocated to basement (roof full)' }; bEq.push(q); });
  const zB = zBase;
  const basRes = techRooms.length ? pack(bEq, techRooms, zB, -1) : { foot: 0, over: bEq, rooms: [] };
  const se = P.serviceEntry;
  basRes.over.forEach((q, k) => box(q.sys, q.sub, -1, [se.x - 4 - k * 5, cy - 12, zB + q.dims[2] / 2], q.dims, { ...q.props, overflow: true, note: 'Does not fit the modelled technical rooms' }));
  const ground = Object.fromEntries(E.filter(e => e.kind === 'equip' && e.props.tag).map(e => [e.props.tag, e]));
  if (ground['FP-1']) ground['FP-1'].props.psi = r0(fpHeadPsi);
  const plantFt = roofRes.foot, overflow = roofRes.over.length > 0;
  roofRes.over.forEach((q, k) => box(q.sys, q.sub, roofIdx, [rb[3] + 3 + q.dims[0] / 2, rb[1] + k * 4, zRoof + q.dims[2] / 2], q.dims, { ...q.props, overflow: true, note: 'Does not fit the roof technical space' }));
  // roof plant connections to shaft
  const zR = zRoof + 3.2;
  for (const it of [...hvacItems, ...(stormInMain ? stormItems : [])]) {
    const sz = it.d ? { w: it.d.w * IN, h: it.d.h * IN } : pSize(it.p.nom), sys = it.sub === 'Storm' ? 'Plumbing' : 'HVAC';
    seg(sys, it.sub, roofIdx, [it.x, it.y, zRoof + 1], [it.x, it.y, zR], sz, { role: sys === 'HVAC' ? 'riser to plant' : 'roof drain connection' });
    if (sys === 'HVAC') seg(sys, it.sub, roofIdx, [it.x, it.y, zR], [it.x, Math.min(rb[4] - 2, Math.max(rb[1] + 2, it.y + 4)), zR], sz, { role: 'plant header' });
  }
  // basement services: building drain, water service, fire service, electrical feeders
  const tr = techRooms[0]?.bbox || [se.x - 10, cy - 14, zB, se.x, cy - 8, zB + 4];
  const trC = [(tr[0] + tr[3]) / 2, (tr[1] + tr[4]) / 2];
  const sanIt = plbItems.find(i => i.k === 'SAN'), cwIt0 = plbItems.find(i => i.k === 'CW');
  seg('Plumbing', 'Sanitary', -1, [sanIt.x, sanIt.y, zB - 0.6], [sanIt.x, trC[1], zB - 0.6], pSize(drainSize(totDFU)), { role: 'building drain (below B1 slab)', note: 'Invert / sewer connection / backwater valve — missing' });
  seg('Plumbing', 'Sanitary', -1, [sanIt.x, trC[1], zB - 0.6], [se.x + 6, trC[1], zB - 0.9], pSize(drainSize(totDFU)), { role: 'building drain → street sewer (direction assumed)', slope: '1/8 in/ft' });
  for (const st of stormItems) seg('Plumbing', 'Storm', -1, [st.x, st.y, zB], [st.x, st.y, zB - 0.5], pSize(st.p.nom), { role: 'leader base' });
  seg('Plumbing', 'Storm', -1, [stormItems[0].x, stormItems[0].y, zB - 0.5], [se.x + 6, stormItems[0].y, zB - 0.8], pSize(leaderSize(stormGpm) + 2), { role: 'storm building drain (direction assumed)', note: 'NYC DEP detention may apply' });
  seg('Plumbing', 'Domestic cold water', -1, [se.x + 6, trC[1] + 1, zB + 2.5], [cwIt0.x, trC[1] + 1, zB + 2.5], pSize(cwIt0.p.nom), { role: 'water service → booster', note: 'Meter + RPZ backflow preventer' });
  seg('Plumbing', 'Domestic cold water', -1, [cwIt0.x, trC[1] + 1, zB + 2.5], [cwIt0.x, cwIt0.y, zB + 2.5], pSize(cwIt0.p.nom), {});
  seg('Electrical', 'Service feeders', -1, [se.x + 6, trC[1] - 1, zB + 2.8], [trC[0], trC[1] - 1, zB + 2.8], { w: 0.6, h: 0.3 }, { note: 'Service from Con Edison (point of entry assumed)' });
  seg('Electrical', 'Service feeders', -1, [trC[0], trC[1] - 1, zB + 2.8], [elecItems[0].x, trC[1] - 1, zB + 2.8], { w: 0.6, h: 0.3 }, { role: 'MSB → busway riser' });
  seg('Electrical', 'Service feeders', -1, [elecItems[0].x, trC[1] - 1, zB + 2.8], [elecItems[0].x, elecItems[0].y, zB + 2.8], { w: 0.6, h: 0.3 }, {});
  seg('Fire', 'Fire service', -1, [se.x + 6, trC[1] + 2, zB + 2.2], [mainStair.sx, trC[1] + 2, zB + 2.2], pSize(8), { size_in: 8, note: 'Fire service + Siamese at street (location assumed)' });
  seg('Fire', 'Fire service', -1, [mainStair.sx, trC[1] + 2, zB + 2.2], [mainStair.sx, mainStair.sy, zB + 2.2], pSize(8), {});

  // ---- 6. totals: electrical & water ----
  const hvacKW = totTons * A.kWperTon + totCFM * A.fanWperCfm / 1000 + totTons * 0.1;
  const elevKW = (nPass * A.elevatorHp + nFr * A.freightHp) * 0.746;
  const connKVA = (tot.light + tot.plug + hvacKW + elevKW + fpHp * 0.746) / A.pf;
  const demandKVA = connKVA * A.demand * (1 + A.spare);
  const amps = demandKVA * 1000 / (Math.sqrt(3) * A.voltage);
  const svcA = stdA(amps);
  if (ground['MSB']) { ground['MSB'].props.service_kVA = r0(demandKVA); ground['MSB'].props.amps = r0(amps); ground['MSB'].props.rating = `${svcA} A @ ${A.voltage}Y/277 V`; }
  const topFixFt = (L[nOcc - 1].z - L[0].z + 1.2) * FT;
  const reqPsi = A.flushValvePsi + topFixFt * 0.433 + A.frictionPsi + A.meterBfpPsi;
  const boosterPsi = Math.max(0, reqPsi - A.streetPsi);
  const zoneFt = (A.maxFixturePsi - A.flushValvePsi) / 0.433;
  const pZones = Math.ceil(topFixFt / zoneFt);
  const gpmPeak = wsfuToGpm(totWsfuT);
  if (ground['DWBP-1']) Object.assign(ground['DWBP-1'].props, { gpm: r0(gpmPeak), boost_psi: r0(boosterPsi), pressure_zones: pZones });
  floors.forEach(f => { f.boosted = (f.z - L[0].z + 1.2) * FT * 0.433 + A.flushValvePsi + A.frictionPsi + A.meterBfpPsi > A.streetPsi; });

  const summary = {
    ...tot, hvacKW, elevKW, connKVA, demandKVA, amps, svcA, genKW, fpHp, fpHeadPsi, reqPsi, boosterPsi, pZones, gpmPeak,
    stormGpm, leaders, leaderIn: leaderSize(stormGpm / leaders), totDFU, stackIn: stackSize(totDFU), totWsfu: totWsfuT,
    shafts, plantM2: plantFt, roofTechM2: rt ? rt.area : 0, overflow, concept: A.concept, nPass, nFr, nStand, spFlow, stairs: stairs.map(s => ({ id: s.id, top: s.top })),
    basement: { rooms: basRes.rooms.map(r => ({ id: r.id, area: r.area, used: r1(r.used) })), over: basRes.over.map(q => q.props.tag), foot: r1(basRes.foot) }, roofOver: roofRes.over.map(q => q.props.tag),
    fixtures: floors.reduce((s, f) => { for (const k in f.fix) s[k] = (s[k] || 0) + f.fix[k]; return s; }, {}),
    heightFt: (L[nOcc - 1].z - L[0].z) * FT, roofFt2, genLS, fpElevFt, topFixFt,
  };

  // ---- 7. audit / code-oriented DD checks ----
  const audit = [];
  const ck = (status, area, item, detail, ref) => audit.push({ status, area, item, detail, ref });
  const hf = summary.heightFt;
  ck(hf > 75 ? 'warn' : 'ok', 'Building', 'High-rise classification', `Highest occupied floor ≈ ${r0(hf)} ft above lowest level (>75 ft) → high-rise provisions: sprinklers, fire command center, smoke control / pressurized stairs, emergency + standby power, voice alarm, ERRCS.`, 'NYC BC §403');
  ck(hf > 120 ? 'warn' : 'ok', 'Building', 'Fire service access elevators', `Occupied floor >120 ft → fire service access elevator(s) with standby power and lobby.`, 'NYC BC §403.6.1 / §3007');
  ck('ok', 'HVAC', 'Outdoor air (ventilation rate procedure)', `Total OA ${r0(totOA).toLocaleString()} cfm computed per zone (Rp·Pz + Ra·Az)/Ez with Ez=${A.Ez}. Occupancy from egress loads, NYC BC Table 1004.1.3 (conservative).`, 'NYC MC §403 / ASHRAE 62.1');
  const ductHi = E.filter(e => e.sys === 'HVAC' && e.props.role === 'main' && e.props.load && ductRect(e.props.load, A.vMain, A.maxDuctDepth).ar > 4).length;
  ck(ductHi ? 'warn' : 'ok', 'HVAC', 'Duct aspect ratio', ductHi ? `${ductHi} main segments exceed 4:1 at max depth ${A.maxDuctDepth} in — split mains or raise duct depth.` : 'All mains ≤ 4:1.', 'SMACNA / DD practice');
  ck(A.vMain <= 1500 ? 'ok' : 'warn', 'HVAC', 'Duct velocity for gallery acoustics', `Mains ${A.vMain} fpm, branches ${A.vBranch} fpm. Museum galleries usually target NC 25–30.`, 'ASHRAE Handbook (Noise)');
  ck(clearIssues.length ? 'fail' : 'ok', 'Coordination', 'Ceiling clear height', clearIssues.length ? clearIssues.join(' · ') : `All floors ≥ ${A.minClear} m below services.`, 'Design target');
  ck(overflow ? 'fail' : 'ok', 'HVAC', 'Roof plant fit', `Plant footprint incl. 1.0 m service clearance ≈ ${r0(plantFt)} m² vs roof technical volume ${r0(summary.roofTechM2)} m².${overflow ? ` Not fitting: ${roofRes.over.map(q => q.props.tag).join(', ')} — enlarge plant area, move items to the basement, or change concept.` : ''}`, 'DD coordination');
  ck(outside.length ? 'warn' : 'ok', 'Coordination', 'Routes outside slab', outside.length ? outside.join(' · ') : 'All zone terminals on slab.', 'Model check');
  ck(boosterPsi > 0 ? 'warn' : 'ok', 'Plumbing', 'Domestic water pressure', `Required at street ${r0(reqPsi)} psi vs available ${A.streetPsi} psi (assumed) → booster ${r0(boosterPsi)} psi; ${pZones} pressure zone(s) to keep fixtures ≤ ${A.maxFixturePsi} psi.`, 'NYC PC §604.6 / §604.8');
  { const short = [], noRR = [];
    for (const f of floors.slice(0, nOcc)) {
      if (!f.occ) continue;
      if (!f.fixProv) { noRR.push(`${f.name} (${f.occ} occ.)`); continue; }
      if (f.fixProv.wc + f.fixProv.ur < f.fixReqWC || f.fixProv.lav < f.fixReqLav) short.push(`${f.name}: WC ${f.fixProv.wc}/${f.fixReqWC}, lav ${f.fixProv.lav}/${f.fixReqLav}`);
    }
    const df = floors.slice(0, nOcc).reduce((a, f) => a + (f.fixProv ? f.fixProv.df : 0), 0);
    ck(short.length ? 'fail' : 'ok', 'Plumbing', 'Fixtures provided vs required', short.length ? `Provided/required per floor: ${short.join(' · ')}. (Required per NYC PC Table 403.1, 50/50 split, no urinals; modelled restrooms appear all-gender single-occupancy WCs — confirm.)` : 'Modelled fixtures meet the per-floor requirement.', 'NYC PC Table 403.1');
    ck(noRR.length ? 'warn' : 'ok', 'Plumbing', 'Floors without restrooms', noRR.length ? `${noRR.join(', ')} — no restroom in the model. Fixtures may serve adjacent floors only within NYC PC §403.3 travel/one-story limits; otherwise extend the restroom stack.` : 'Every occupied floor has a restroom.', 'NYC PC §403.3');
    ck(df ? 'ok' : 'warn', 'Plumbing', 'Drinking fountains', df ? `${df} modelled.` : `None modelled — ${summary.fixtures.df} required (bottle fillers count toward half).`, 'NYC PC §410');
  }
  ck(!shaftH.fits ? 'fail' : shaftH.enlarged ? 'warn' : 'ok', 'Coordination', 'Main MEP shaft capacity', `${shaftH.name}: ${shaftH.len}×${shaftH.dep} m = ${shaftH.area} m². Risers need ≈ ${shaftH.reqArea} m² incl. ${stormInMain ? 'storm leaders, ' : ''}busway, EM feeder and 10% access allowance.${shaftH.enlarged ? ` Enlarged from ${shaftH.origArea} m²: extend the shaft south to Y ${shaftH.y0} (was ${shaftH.origY0}) in Rhino.` : ''}${shaftH.fits ? '' : ' Shaft undersized.'}`, 'DD coordination / NYC BC 713');
  ck(shaftP.fits ? 'ok' : 'fail', 'Coordination', 'Plumbing chase capacity', `${shaftP.name}: ${shaftP.len}×${shaftP.dep} m; required ≈ ${shaftP.reqLen}×${shaftP.reqDep} m. Stack at X ${riserPt ? riserPt[0] : '–'} / Y ${riserPt ? riserPt[1] : '–'}.`, 'DD coordination');
  if (plbTop < zRoof - 0.5) ck('warn', 'Plumbing', 'Vent through roof', `Plumbing chase stops at +${plbTop}; the vent stack is offset at the top floor into the main shaft to reach the roof (modelled). Storm leaders run in the main shaft.`, 'NYC PC §903');
  ck('warn', 'Coordination', 'Rooms not yet modelled', `${central ? '' : `Floor AHU rooms (≈${r0(Math.max(...floors.map(f => f.ahuRoomM2 || 0)))} m² each), `}electrical closets (≈6–8 m² per floor, stacked), fire command center, and fire pump room are placed by the tool but not in the model.`, 'DD coordination');
  ck(basRes.over.length ? 'fail' : 'ok', 'Coordination', 'Basement plant fit', `${techRooms.length} technical rooms (${r0(techRooms.reduce((a, r) => a + r.area, 0))} m²). ${basRes.over.length ? 'Not fitting: ' + basRes.over.map(q => q.props.tag).join(', ') + '.' : 'All service equipment fits with 1.0 m clearance.'}`, 'DD coordination');
  ck('warn', 'Plumbing', 'Storm design rate', `Using ${A.rainfall} in/hr (NYC PC §1106.1) → ${r0(stormGpm)} gpm, ${leaders} leaders × ${summary.leaderIn} in. Secondary drains tied into primary: 6 in/hr combined (§1108.3). Confirm DEP detention/release rate.`, 'NYC PC §1106.1 / §1108.3 / DEP');
  ck('warn', 'Plumbing', 'Sanitary stack', `${r0(totDFU)} DFU → ${summary.stackIn} in stack; building drain ${drainSize(totDFU)} in at 1/8 in/ft. Kitchen grease interceptor TBD.`, 'NYC PC Tables 710.1(1)/(2)');
  ck(svcA > 4000 ? 'warn' : 'ok', 'Electrical', 'Service size', `Connected ${r0(connKVA)} kVA → demand+spare ${r0(demandKVA)} kVA ≈ ${r0(amps)} A → ${svcA} A @ ${A.voltage}Y/277 V${svcA > 4000 ? ' (exceeds 4000 A: multiple services / spot network per Con Edison)' : ''}.`, 'NYC EC Art. 220/230');
  ck('warn', 'Electrical', 'Emergency & standby power', `Generator ≈ ${genKW} kW (egress lighting, FA, smoke control, fire pump ${fpHp} hp, fire service elevator). Separate emergency risers, 2-hr protection.`, 'NYC BC §403.4.8 / EC Art. 700/701');
  ck('warn', 'Fire', 'Standpipes & fire pump', `${nStand} combined standpipes (6 in), one per modelled stair (${stairs.map(s => s.id + ' to +' + r1(s.top)).join(', ')}). Fire pump ≈ ${spFlow} gpm @ ${r0(fpHeadPsi)} psi (${fpHp} hp) for ${A.topOutletPsi} psi at the roof manifold. ${fpHeadPsi + A.streetPsi > 175 ? 'System pressure >175 psi → high-pressure components / zoning.' : ''}`, 'NYC BC §905 / App. Q (NFPA 14 §7.8.1 mod.) / NFPA 20');
  ck(nPass + nFr ? 'warn' : 'fail', 'Building', 'Elevators', `${nPass} passenger + ${nFr} freight in the model. Confirm which car is the fire service access elevator (lobby, standby power) and car capacities for the electrical load.`, 'NYC BC §3007');
  { const imm = floors.flatMap(f => f.zones.filter(z => z.projectors)); const np = imm.reduce((a, z) => a + z.projectors, 0);
    ck('warn', 'AV / HVAC', 'Immersive halls', `${imm.length} halls, ${np} ceiling projectors (${A.projImgW} m image width, ${r0(A.projOverlap * 100)}% blend, ${A.projKW} kW each) + AV racks = ${r0(imm.reduce((a, z) => a + z.avKW, 0))} kW of heat. Supply via low-velocity ceiling diffusers inset from the projection walls; high-level return over the projector ring; light-tight, NC 25 target. Confirm projector model, throw distances and whether the floor is projected too.`, 'Design basis');
    const desks = floors.reduce((a, f) => a + f.zones.filter(z => z.desks).reduce((b, z) => b + z.desks, 0), 0);
    if (desks) ck('ok', 'Electrical', 'Office workstations', `${desks} desks at ${A.deskM2} m²/desk, ${A.deskW} W each (PC + 2 monitors) + 0.25 W/ft² misc.`, 'Design basis');
  }
  ck('ok', 'Fire', 'Sprinkler layout', `${tot.heads} heads incl. ${floors.reduce((a, f) => a + (f.headsEst || 0), 0)} estimated in unassigned circulation/support (LH 15 ft / OH 11 ft spacing; OH max 130 ft²/head). Hydraulic calc not performed.`, 'NYC BC §903 / NFPA 13');
  ck('info', 'All', 'Code verification', 'Values cited as basis only; editions & amendments must be verified by licensed NYC MEP/FP engineers. Not a permit compliance certification.', '—');

  return { elements: E, floors, summary, audit, shafts, hvacItems, plbItems };
}

export const MISSING = [
  ['Floor mechanical & electrical rooms', 'Where the floor AHU room (~40 m²) and stacked electrical closet (~6–8 m²) sit on each floor, next to the main shaft. Currently placed by the tool south of the shaft.'],
  ['Room-by-room program & occupants', 'Net areas, design occupants (not egress maximums), hours, and media/AV heat per immersive room — biggest driver of cooling, OA and fixture demand.'],
  ['Structure & ceiling zones', 'Slab + beam depth and required clear heights per space; 5 m floor-to-floor currently leaves ~2.7 m under services.'],
  ['Roof plant area / cellar plant', 'Roof technical space (476 m²) cannot hold chillers + heat pumps + DOAS; confirm extra roof area, cellar plant or a different concept.'],
  ['Restroom strategy', 'All-gender single-user vs gendered rooms, urinals, L01 (short 2 WCs) and L11 (none), drinking fountains/bottle fillers.'],
  ['Museum environmental classes', 'Which galleries need collections-grade T/RH (ASHRAE Class AA/A/B) vs comfort only.'],
  ['Envelope performance', 'Wall/roof/glazing U-values, SHGC, glazing ratio by façade.'],
  ['Utility points of entry', 'Street frontage for Con Edison service, water, sewer, fire service + Siamese; basement tech room assignments.'],
  ['Water & sewer data', 'Hydrant flow test, street pressure, sewer invert, DEP detention.'],
  ['Electrical data', 'Service voltage, vault type/location, elevator capacities/speeds, kitchen and AV/IT loads.'],
  ['Life-safety strategy', 'Generator vs battery, fire service access elevator, smoke control/stair pressurization fans, fire command center location.'],
  ['Fire protection basis', 'Hazard classes per room, gaseous suppression for collections, fire pump room.'],
  ['Code editions & filing date', 'Confirm NYC BC/MC/PC/EC/NYCECC editions in force at filing.'],
];
