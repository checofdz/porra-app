// Geography, walking network (course as barrier) and CTA routing
import { RACE, SPOTM, ST, RUNS, BIDIR, LOOP_CONT, XFERS, HW, LN } from "./race-chicago.js";
import { S } from "./state.js";

export const MI = 1.609344, TOTAL = 42.195;
const B = RACE.bounds;
const K = 111320 * Math.cos(41.892 * Math.PI / 180) / 10, KY = 110574 / 10;
export const P = (lat, lng) => [(lng - B.w) * K, (B.n - lat) * KY];            // SVG units (10 m)
export const unP = (x, y) => [B.n - y / KY, x / K + B.w];
export const W = (B.e - B.w) * K, H = (B.n - B.s) * KY;
export function hvm(la1, ln1, la2, ln2) { const R = 6371000, t = Math.PI / 180; const dl = (la2 - la1) * t, dg = (ln2 - ln1) * t; const x = Math.sin(dl / 2) ** 2 + Math.cos(la1 * t) * Math.cos(la2 * t) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

export let MD, C, SPOTS = [], byId = {}, START = null;
let WG, WN, NN, off, aTo, aLen, aX, aNm, edgeFrom, isCourse, grid;
export const WMPM = 72, CROSS_MIN = 4, AVOID_PEN = 30;

export function ptAtKm(k) { k = Math.max(0, Math.min(TOTAL, k)); for (let i = 1; i < C.length; i++) { if (k <= C[i][2]) { const f = (k - C[i - 1][2]) / ((C[i][2] - C[i - 1][2]) || 1); return [C[i - 1][0] + (C[i][0] - C[i - 1][0]) * f, C[i - 1][1] + (C[i][1] - C[i - 1][1]) * f]; } } const l = C[C.length - 1]; return [l[0], l[1]]; }
export function streetAtKm(k) { let s = MD.segs[0][1]; for (const g of MD.segs) { if (g[0] <= k + 1e-6) s = g[1]; } return s; }

// ---------- init ----------
export function initEngine(md, wg) {
  MD = md; C = md.course; WG = wg; WN = wg.nodes; NN = WN.length;
  SPOTS = Object.keys(md.spots).map(id => { const v = md.spots[id]; return Object.assign({ id, lat: v[0], lng: v[1], km: v[2], mile: v[2] / MI, sides: wg.spots[id] }, SPOTM[id]); }).sort((a, b) => a.km - b.km);
  byId = {}; SPOTS.forEach(s => (byId[s.id] = s));
  // CSR adjacency
  off = new Int32Array(NN + 1); wg.edges.forEach(e => { off[e[0] + 1]++; off[e[1] + 1]++; }); for (let i = 0; i < NN; i++) off[i + 1] += off[i];
  const M2 = wg.edges.length * 2; aTo = new Int32Array(M2); aLen = new Float32Array(M2); aX = new Float32Array(M2); aNm = new Int32Array(M2); edgeFrom = new Int32Array(M2);
  const fill = off.slice(0, NN); isCourse = new Uint8Array(NN);
  wg.edges.forEach(e => { if (e[3] >= 0) { isCourse[e[0]] = 1; isCourse[e[1]] = 1; } for (const [u, v] of [[e[0], e[1]], [e[1], e[0]]]) { const k = fill[u]++; aTo[k] = v; aLen[k] = e[2]; aX[k] = e[3]; aNm[k] = e[4]; edgeFrom[k] = u; } });
  // spatial grid (cells of 20 units = 200 m)
  grid = new Map(); for (let i = 0; i < NN; i++) { const k = ((WN[i][0] / 20) | 0) + "," + ((WN[i][1] / 20) | 0); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  initTransit();
  setStart(S.start);
}
export function nearestNode(lat, lng, allowCourse) {
  const [x, y] = P(lat, lng); const cx = (x / 20) | 0, cy = (y / 20) | 0; let best = -1, bd = 1e18;
  for (let r = 0; r < 6 && best < 0; r++) { for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++) { const L = grid.get(gx + "," + gy); if (!L) continue; for (const i of L) { if (!allowCourse && isCourse[i]) continue; const d = (WN[i][0] - x) ** 2 + (WN[i][1] - y) ** 2; if (d < bd) { bd = d; best = i; } } } }
  return best < 0 ? 0 : best;
}
export function setStart(st) {
  const d = st || { name: RACE.defaultStart.name, lat: MD.hotel[0], lng: MD.hotel[1], address: RACE.defaultStart.address };
  START = { id: "start", name: d.name, address: d.address || "", lat: d.lat, lng: d.lng, km: null, node: nearestNode(d.lat, d.lng) };
  byId.start = START; optCache.clear();
}
export function place(id) { return byId[id]; }
export function gpsPlace(lat, lng) { return { id: "gps", name: "Tu ubicación", lat, lng, km: null, node: nearestNode(lat, lng), nocache: true }; }

// ---------- walking Dijkstra ----------
class Heap { constructor() { this.k = []; this.v = []; } push(n, w) { const k = this.k, v = this.v; let i = k.length; k.push(n); v.push(w); while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= w) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = n; v[i] = w; }
  pop() { const k = this.k, v = this.v; const top = k[0]; const ln = k.pop(), lw = v.pop(); if (k.length) { let i = 0; const n = k.length; while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && v[c + 1] < v[c]) c++; if (v[c] >= lw) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = ln; v[i] = lw; } return top; } get size() { return this.k.length; } }
const walkCache = new Map();
export function walkD(src, nocache) {
  const key = src + "|" + (S.avoid ? 1 : 0); if (!nocache && walkCache.has(key)) return walkCache.get(key);
  const w = new Float32Array(NN).fill(1e9), rt = new Float32Array(NN), cx = new Uint8Array(NN), pe = new Int32Array(NN).fill(-1);
  const h = new Heap(); w[src] = 0; h.push(src, 0);
  while (h.size) { const u = h.pop(); const wu = w[u];
    for (let k = off[u]; k < off[u + 1]; k++) { const v = aTo[k]; let t = aLen[k] / WMPM, pen = 0; if (aX[k] >= 0) { t += CROSS_MIN; if (S.avoid) pen = AVOID_PEN; }
      const nw = wu + t + pen; if (nw < w[v] - 1e-6) { w[v] = nw; rt[v] = rt[u] + t; cx[v] = cx[u] + (aX[k] >= 0 ? 1 : 0); pe[v] = k; h.push(v, nw); } } }
  const D = { src, w, rt, cx, pe }; if (!nocache) { if (walkCache.size > 80) walkCache.clear(); walkCache.set(key, D); } return D;
}
function walkPath(D, n) { const ks = []; let u = n, guard = 0; while (u !== D.src && D.pe[u] >= 0 && guard++ < 50000) { const k = D.pe[u]; ks.unshift(k); u = edgeFrom[k]; } return ks; }

// ---------- transit graph ----------
const G = {}; let STA = {}; const TT = {};
function edge(a, b, c, m) { (G[a] = G[a] || []).push({ to: b, c, m }); }
function addRun(color, dir, seq, runId) { for (let i = 0; i < seq.length; i++) { const s = seq[i][0], p = `P|${runId}|${s}`; edge("S|" + s, p, HW[color] / 2 + 0.5, { t: "board", color, dir, st: s }); edge(p, "S|" + s, 0.5, { t: "alight", color, st: s }); if (i < seq.length - 1) edge(p, `P|${runId}|${seq[i + 1][0]}`, seq[i + 1][1], { t: "ride", color, dir, from: s, to: seq[i + 1][0] }); } }
function initTransit() {
  RUNS.forEach((r, i) => { const id = r[3] || ("r" + i); addRun(r[0], r[1], r[2], id); if (BIDIR[r[0]]) { const rev = []; const s = r[2]; for (let j = s.length - 1; j >= 0; j--) rev.push([s[j][0], j < s.length - 1 ? s[j + 1][1] : 0]); addRun(r[0], BIDIR[r[0]], rev, id + "b"); } });
  LOOP_CONT.forEach(([a, b, s]) => edge(`P|${a}|${s}`, `P|${b}|${s}`, 0, { t: "stay" }));
  XFERS.forEach(([a, b, c]) => { edge("S|" + a, "S|" + b, c, { t: "xfer", a, b }); edge("S|" + b, "S|" + a, c, { t: "xfer", a: b, b: a }); });
  STA = {}; for (const s in ST) { const [x, y] = P(ST[s][1], ST[s][2]); const list = []; let best = null, bd = 1e9;
    for (let i = 0; i < NN; i++) { const d = Math.hypot(WN[i][0] - x, WN[i][1] - y) * 10; if (d < 90) list.push({ n: i, min: d / WMPM + 1 }); if (d < bd) { bd = d; best = i; } }
    if (!list.length) list.push({ n: best, min: bd / WMPM + 1 }); STA[s] = list; }
  for (const s in ST) { const dist = {}, prev = {}; const h = [["S|" + s, 0]]; dist["S|" + s] = 0; const done = new Set();
    while (h.length) { h.sort((a, b) => a[1] - b[1]); const [u, du] = h.shift(); if (done.has(u)) continue; done.add(u);
      for (const e of (G[u] || [])) { const nd = du + e.c; if (nd < (dist[e.to] ?? 1e9)) { dist[e.to] = nd; prev[e.to] = [u, e]; h.push([e.to, nd]); } } }
    TT[s] = { dist, prev }; }
}
function toStation(D, s) { let b = null; for (const a of STA[s]) { const w = D.w[a.n] + a.min; if (!b || w < b.w) b = { w, rt: D.rt[a.n] + a.min, cx: D.cx[a.n], n: a.n, ent: a.min }; } return b; }
export function transitSteps(s, e) {
  const T = TT[s]; const edges = []; let u = "S|" + e; while (u !== "S|" + s) { const [p, ed] = T.prev[u]; edges.unshift(ed); u = p; }
  const steps = []; for (const ed of edges) { const m = ed.m;
    if (m.t === "board") steps.push({ k: "wait", color: m.color, dir: m.dir, st: m.st, min: ed.c });
    else if (m.t === "ride") { const last = steps[steps.length - 1]; const pB = P(ST[m.to][1], ST[m.to][2]);
      if (last && last.k === "ride" && last.color === m.color) { last.to = m.to; last.stops++; last.min += ed.c; last.pts.push(pB); last.stations.push(m.to); last.hops.push(ed.c); }
      else steps.push({ k: "ride", color: m.color, dir: m.dir, from: m.from, to: m.to, stops: 1, min: ed.c, pts: [P(ST[m.from][1], ST[m.from][2]), pB], stations: [m.from, m.to], hops: [ed.c] }); }
    else if (m.t === "alight") { const last = steps[steps.length - 1]; if (last && last.k === "ride") last.min += ed.c; }
    else if (m.t === "xfer") steps.push({ k: "xfer", from: ST[m.a][0], to: ST[m.b][0], min: ed.c, pts: [P(ST[m.a][1], ST[m.a][2]), P(ST[m.b][1], ST[m.b][2])] }); }
  return steps;
}
// ---------- walking directions ----------
const CARD = ["este", "noreste", "norte", "noroeste", "oeste", "suroeste", "sur", "sureste"];
const card = (dx, dy) => CARD[((Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
function walkStep(ks, reverse, fromName, toName, extraMin) {
  let seq = ks.map(k => ({ k, u: edgeFrom[k], v: aTo[k] })); if (reverse) seq = seq.reverse().map(o => ({ k: o.k, u: o.v, v: o.u }));
  const pts = []; const dirs = []; const cross = []; let m = 0;
  seq.forEach((o, i) => { if (!i) pts.push(WN[o.u]); pts.push(WN[o.v]); m += aLen[o.k];
    if (aX[o.k] >= 0) { cross.push({ st: streetAtKm(aX[o.k]), km: aX[o.k] }); dirs.push({ x: true, st: streetAtKm(aX[o.k]), km: aX[o.k] }); return; }
    const nm = WG.names[aNm[o.k]]; const last = dirs[dirs.length - 1];
    if (last && !last.x && last.nm === nm) { last.m += aLen[o.k]; last.b = WN[o.v]; } else dirs.push({ nm, m: aLen[o.k], a: WN[o.u], b: WN[o.v] }); });
  const out = []; dirs.forEach(d => { if (!d.x && d.m < 25 && out.length && !out[out.length - 1].x) { const l = out[out.length - 1]; l.m += d.m; l.b = d.b; } else out.push(d); });
  out.forEach(d => { if (!d.x) d.dir = card(d.b[0] - d.a[0], d.b[1] - d.a[1]); });
  return { k: "walk", from: fromName, to: toName, m, min: m / WMPM + cross.length * CROSS_MIN + (extraMin || 0), dirs: out, x: cross, pts };
}
// ---------- options between places ----------
export const optCache = new Map();
export function srcNode(a, side) { return a.sides ? a.sides[side] : a.node; }
function destNodes(b) { return b.sides ? b.sides : [b.node]; }
export function options(a, aSide, b) {
  const key = a.id + ":" + srcNode(a, aSide) + ">" + b.id + ":" + destNodes(b).join(",") + "|" + (S.avoid ? 1 : 0);
  if (!a.nocache && optCache.has(key)) return optCache.get(key);
  let res = [];
  if (a.id && b.id && a.id.startsWith("m29") && b.id.startsWith("m29")) { res = [{ key: "stay", label: "Te quedas", w: 0, rt: 0, cx: 0, side: aSide, stay: true, aSide }]; optCache.set(key, res); return res; }
  const Da = walkD(srcNode(a, aSide), a.nocache); const bn = destNodes(b); const Db = bn.map(n => walkD(n));
  const wk = bn.map((n, k) => ({ k, w: Da.w[n], rt: Da.rt[n], cx: Da.cx[n] })).sort((x, y) => x.w - y.w)[0];
  if (wk.rt < 120) res.push({ key: "walk", label: "Todo a pie", w: wk.w, rt: wk.rt, cx: wk.cx, side: wk.k, walk: true, walkMin: wk.rt });
  const WA = {}, WB = {};
  for (const s in ST) { const t = toStation(Da, s); if (t && t.rt < 32) WA[s] = t;
    let bb = null; Db.forEach((D, k) => { const x = toStation(D, s); if (x && (!bb || x.w < bb.w)) bb = Object.assign({ side: k }, x); }); if (bb && bb.rt < 32) WB[s] = bb; }
  const combos = []; for (const s in WA) for (const e in WB) { if (s === e) continue; const T = TT[s].dist["S|" + e]; if (T == null) continue;
    combos.push({ key: s + ">" + e, s, e, w: WA[s].w + T + WB[e].w, rt: WA[s].rt + T + WB[e].rt, cx: WA[s].cx + WB[e].cx, side: WB[e].side, T, walkMin: WA[s].rt + WB[e].rt }); }
  combos.sort((x, y) => x.w - y.w);
  const best = Math.min(combos.length ? combos[0].w : 1e9, res.length ? res[0].w : 1e9);
  const pick = [];
  for (const c of combos) { if (pick.length >= 4 || c.w > best + 25) break; const lines = transitSteps(c.s, c.e).filter(x => x.k === "ride").map(x => x.color).join("+");
    if (pick.some(p => (p.s === c.s && p.lines === lines) || (p.s === c.s && p.e === c.e))) continue; c.lines = lines; pick.push(c); }
  pick.forEach(c => { c.label = `${c.lines.split("+").map(l => LN[l]).join(" + ")} desde ${ST[c.s][0]}`; c.sub = `bajas en ${ST[c.e][0]}`; });
  res = res.concat(pick);
  const wo = res.find(o => o.walk); const minRt = Math.min(...res.map(o => o.rt));
  res = res.filter(o => { if (o.walk) return o.rt <= minRt + 25 || res.length === 1; if (wo && wo.rt <= o.rt + 2 && wo.cx <= o.cx) return false; return o.rt <= minRt + 20; });
  res.sort((x, y) => x.w - y.w);
  if (!res.length) res = [{ key: "none", label: "Sin ruta", w: 999, rt: 999, cx: 0, side: 0 }];
  res.forEach(o => { o.aSide = aSide; });
  if (!a.nocache) optCache.set(key, res); return res;
}
export function optSteps(a, b, o) {
  if (o.stay) return [{ k: "stay" }];
  if (o.key === "none") return [];
  const Da = walkD(srcNode(a, o.aSide), a.nocache);
  const bn = destNodes(b);
  if (o.walk) return [walkStep(walkPath(Da, bn[o.side]), false, a.name, b.name)];
  const wa = toStation(Da, o.s); const Db = walkD(bn[o.side]); const wb = toStation(Db, o.e);
  const s1 = walkStep(walkPath(Da, wa.n), false, a.name, "estación " + ST[o.s][0], wa.ent); s1.station = o.s; s1.pts.push(P(ST[o.s][1], ST[o.s][2]));
  const s3 = walkStep(walkPath(Db, wb.n), true, "estación " + ST[o.e][0], b.name, wb.ent); s3.pts.unshift(P(ST[o.e][1], ST[o.e][2]));
  return [s1].concat(transitSteps(o.s, o.e), [s3]);
}
export function sideName(s, side) {
  if (s.km == null) return "";
  const a = ptAtKm(s.km - 0.03), b = ptAtKm(s.km + 0.03); const dE = (b[1] - a[1]) * 0.744, dN = b[0] - a[0]; let nE = -dN, nN = dE; if (side === 1) { nE = -nE; nN = -nN; }
  return Math.abs(nE) > Math.abs(nN) ? (nE > 0 ? "este" : "oeste") : (nN > 0 ? "norte" : "sur");
}
export function clearRouteCaches() { optCache.clear(); walkCache.clear(); }
