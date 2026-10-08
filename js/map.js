// SVG street map with course, CTA, spots, runners, you, and highlighted routes
import { ST, CTAG, CTAC, LC, VIEWS } from "./race-chicago.js";
import { S, now, emit } from "./state.js";
import { MD, C, P, unP, W, H, MI, TOTAL, SPOTS, ptAtKm, place } from "./engine.js";
import { proj, kmAt, livePoint, rawAge } from "./pace.js";
import { t } from "./i18n.js";

const NS = "http://www.w3.org/2000/svg";
let svg, gStreets, gCTA, gHL, gO, SE = {}, riverEl, cLine, cHalo;
let V = { x: 0, y: 0, w: 0, h: 0 };
export const mapState = { HL: null, pick: null, gps: null, time: null, follow: false };
function el(t, a, parent) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); (parent || svg).appendChild(e); return e; }
const pathLL = (pts, close) => pts.map((p, i) => { const [x, y] = P(p[0], p[1]); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") + (close ? "Z" : "");
const pathXY = (pts, close) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("") + (close ? "Z" : "");
const txt = (parent, x, y, s, attrs) => { const t = el("text", Object.assign({ x, y, "font-family": "IBM Plex Sans, system-ui, sans-serif" }, attrs), parent); t.textContent = s; return t; };

export function initMap(svgEl) {
  svg = svgEl; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  el("rect", { x: -3000, y: -3000, width: W + 6000, height: H + 6000, fill: "var(--land)" });
  const SH = MD.shore;
  const shoreX = y => { for (let i = 1; i < SH.length; i++) { if (y <= SH[i][1]) { const f = (y - SH[i - 1][1]) / ((SH[i][1] - SH[i - 1][1]) || 1); return SH[i - 1][0] + (SH[i][0] - SH[i - 1][0]) * f; } } return SH[SH.length - 1][0]; };
  const LPW = [[41.958, -87.6452], [41.9530, -87.6445], [41.9475, -87.6418], [41.9398, -87.6402], [41.9330, -87.6398], [41.9290, -87.6382], [41.9256, -87.6368], [41.9230, -87.6365], [41.9170, -87.6345], [41.9112, -87.6322]];
  { const pts = LPW.map(p => P(p[0], p[1])); const yb = pts[pts.length - 1][1], yt = pts[0][1]; for (let y = yb; y >= yt; y -= 5) pts.push([shoreX(y) + 40, y]); el("path", { d: pathXY(pts, true), fill: "var(--park)" }); }
  { const t = P(41.8846, -87.6243), b = P(41.8675, -87.6243); const pts = [t, b]; for (let y = b[1]; y >= t[1]; y -= 5) pts.push([shoreX(y) + 40, y]); el("path", { d: pathXY(pts, true), fill: "var(--park)" }); }
  el("path", { d: pathXY([[SH[0][0], -3000]].concat(SH).concat([[SH[SH.length - 1][0], H + 3000], [W + 3000, H + 3000], [W + 3000, -3000]]), true), fill: "var(--water)" });
  riverEl = el("path", { d: MD.river, fill: "none", stroke: "var(--water)", "stroke-width": 6, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" });
  gStreets = el("g", {});
  [["l", "--st-l"], ["c", "--st-c"], ["a", "--st-a"], ["x", "--st-x"]].forEach(([k, v]) => { SE[k] = el("path", { d: MD.streets[k], fill: "none", stroke: `var(${v})`, "stroke-width": 1, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" }, gStreets); });
  gCTA = el("g", {});
  Object.entries(CTAG).forEach(([k, p]) => el("path", { d: pathLL(p), fill: "none", stroke: CTAC[k], "stroke-width": 3, "stroke-opacity": .8, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, gCTA));
  const cd = pathLL(C);
  cHalo = el("path", { d: cd, fill: "none", stroke: "var(--halo)", "stroke-width": 9, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round" });
  cLine = el("path", { d: cd, fill: "none", stroke: "var(--course)", "stroke-width": 5, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round" });
  // wide invisible hit area: tap the course to create your own cheer spot
  const hit = el("path", { d: cd, fill: "none", stroke: "transparent", "stroke-width": 22, "vector-effect": "non-scaling-stroke", "pointer-events": "stroke", style: "cursor:copy" });
  hit.addEventListener("click", e => { if (mapState.pick) return; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); const [lat, lng] = unP(q.x, q.y); emit("coursetap", { lat, lng }); });
  gHL = el("g", {}); gO = el("g", {});
  bindPanZoom();
  svg.addEventListener("click", e => {
    if (!mapState.pick || e.target.closest(".pin")) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    const [lat, lng] = unP(q.x, q.y); const cb = mapState.pick; mapState.pick = null; svg.classList.remove("picking"); cb(lat, lng);
  });
}
export function startPick(cb) { mapState.pick = cb; svg.classList.add("picking"); }

function upp() { const r = svg.getBoundingClientRect(); return Math.max(V.w / r.width, V.h / r.height) || 1; }
export function setView(v) { V = v; svg.setAttribute("viewBox", `${V.x} ${V.y} ${V.w} ${V.h}`); draw(); }
export function viewFor(n, s, w, e) { const [x1, y1] = P(n, w), [x2, y2] = P(s, e); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
export function fit(v, pad) { pad = pad || 1.1; const r = svg.getBoundingClientRect(); const ar = (r.width || 1) / (r.height || 1); let w = v.w * pad, h = v.h * pad; let x = v.x - (w - v.w) / 2, y = v.y - (h - v.h) / 2; if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y -= (nh - h) / 2; h = nh; } return { x, y, w, h }; }
export function goView(name) { setView(fit(viewFor(...VIEWS[name]), 1.04)); }
export function viewXY(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }); const w = Math.max(60, x1 - x0), h = Math.max(60, y1 - y0); return { x: (x0 + x1) / 2 - w * 0.6, y: (y0 + y1) / 2 - h * 0.6, w: w * 1.2, h: h * 1.45 }; }
export function focusLL(lat, lng, span) { const [x, y] = P(lat, lng); const s = span || 120; setView(fit({ x: x - s / 2, y: y - s / 2, w: s, h: s }, 1)); }
export function showPts(pts) { if (pts.length) setView(fit(viewXY(pts), 1.05)); else draw(); }

export function draw() {
  if (!svg) return;
  gO.innerHTML = ""; gHL.innerHTML = ""; const u = upp(); const fs = 11 * u;
  const r = svg.getBoundingClientRect(); const vx0 = V.x - (u * r.width - V.w) / 2, vy0 = V.y - (u * r.height - V.h) / 2, vx1 = vx0 + u * r.width, vy1 = vy0 + u * r.height;
  gStreets.style.display = S.streets ? "" : "none"; gCTA.style.display = S.cta ? "" : "none";
  const z = u < 0.35 ? 3 : u < 0.7 ? 2 : u < 1.4 ? 1 : 0;
  SE.l.setAttribute("stroke-width", [0.5, 0.9, 1.8, 3.2][z]); SE.l.setAttribute("stroke-opacity", [0.55, 0.85, 1, 1][z]);
  SE.c.setAttribute("stroke-width", [0.9, 1.4, 2.6, 4.2][z]); SE.a.setAttribute("stroke-width", [1.3, 2, 3.4, 5.4][z]); SE.x.setAttribute("stroke-width", [1.8, 2.6, 4, 6][z]);
  riverEl.setAttribute("stroke-width", [4, 6, 10, 16][z]); cLine.setAttribute("stroke-width", [4, 5, 6, 7][z]); cHalo.setAttribute("stroke-width", [7, 9, 11, 13][z]);
  const placed = [];
  if (u < 0.75) SPOTS.forEach(sp => { const [x, y] = P(sp.lat, sp.lng); const cx = (x - vx0) / u, cy = (y - vy0) / u; const wpx = sp.name.length * 6.6 + 8; const box = [cx + 14 + wpx / 2, cy - 10, wpx, 15];
    if (cx < 0 || cx > r.width || cy < 0 || cy > r.height) return; if (placed.some(p => Math.abs(p[0] - box[0]) < (p[2] + box[2]) / 2 && Math.abs(p[1] - box[1]) < (p[3] + box[3]) / 2)) return; placed.push(box);
    txt(gO, x + 14 * u, y - 6 * u, sp.name, { "font-size": 11 * u, "font-weight": 600, fill: "var(--accent)", stroke: "var(--land)", "stroke-width": 3.5 * u, "paint-order": "stroke", "pointer-events": "none" }); });
  if (S.streets) { const maxR = u < 0.45 ? 3 : u < 0.95 ? 2 : u < 2.4 ? 1 : -1; const lfs = 10.5 * u;
    const cand = MD.labels.filter(l => l[4] <= maxR && l[1] > vx0 && l[1] < vx1 && l[2] > vy0 && l[2] < vy1).sort((a, b) => a[4] - b[4]);
    for (const l of cand) { const wpx = l[0].length * 6.2 + 6, hpx = 13; const cx = (l[1] - vx0) / u, cy = (l[2] - vy0) / u; const rad = l[3] * Math.PI / 180; const bw = Math.abs(Math.cos(rad)) * wpx + Math.abs(Math.sin(rad)) * hpx, bh = Math.abs(Math.sin(rad)) * wpx + Math.abs(Math.cos(rad)) * hpx;
      if (placed.some(p => Math.abs(p[0] - cx) < (p[2] + bw) / 2 && Math.abs(p[1] - cy) < (p[3] + bh) / 2)) continue; placed.push([cx, cy, bw, bh]); if (placed.length > 260) break;
      txt(gO, l[1], l[2], l[0], { "font-size": lfs, "text-anchor": "middle", "dominant-baseline": "central", fill: "var(--label)", stroke: "var(--label-halo)", "stroke-width": 3 * u, "paint-order": "stroke", "font-weight": l[4] <= 1 ? 600 : 500, transform: `rotate(${l[3]} ${l[1]} ${l[2]})`, "pointer-events": "none" }); } }
  // highlighted routes
  const used = new Set(); const HLsteps = mapState.HL ? mapState.HL() : [];
  HLsteps.forEach(s => { if (!s.pts) return;
    if (s.k === "ride") { (s.stations || []).forEach(x => used.add(x)); el("path", { d: pathXY(s.pts), fill: "none", stroke: "var(--halo)", "stroke-width": 11, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" }, gHL); el("path", { d: pathXY(s.pts), fill: "none", stroke: LC[s.color], "stroke-width": 7, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" }, gHL); }
    else { el("path", { d: pathXY(s.pts), fill: "none", stroke: "var(--halo)", "stroke-width": 7, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" }, gHL); el("path", { d: pathXY(s.pts), fill: "none", stroke: "var(--hl)", "stroke-width": 4, "stroke-dasharray": "1 7", "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" }, gHL); }
    (s.x || []).forEach(x => { const [la, ln] = ptAtKm(x.km); const [px, py] = P(la, ln); el("circle", { cx: px, cy: py, r: 9 * u, fill: "var(--warn)", stroke: "var(--halo)", "stroke-width": 2 * u }, gHL); txt(gHL, px, py + 4 * u, "!", { "text-anchor": "middle", "font-size": 12 * u, "font-weight": 700, fill: "#fff" }); }); });
  if (S.cta) for (const k in ST) { const [x, y] = P(ST[k][1], ST[k][2]); if (x < vx0 - 50 || x > vx1 + 50 || y < vy0 - 50 || y > vy1 + 50) continue; const on = used.has(k); const sz = (on ? 11 : 7) * u;
    el("rect", { x: x - sz / 2, y: y - sz / 2, width: sz, height: sz, rx: 2 * u, fill: "var(--panel)", stroke: on ? "var(--hl)" : "var(--fg)", "stroke-width": (on ? 2.5 : 1.4) * u }, gO);
    if (u < 1.5 || on) txt(gO, x + 8 * u, y + 3.5 * u, ST[k][0], { "font-size": fs * 0.9, "font-weight": 600, fill: "var(--fg)", stroke: "var(--land)", "stroke-width": 3 * u, "paint-order": "stroke", "pointer-events": "none" }); }
  for (let mm = 1; mm <= 26; mm++) { if (u > 2.2 && mm % 5) continue; const [la, ln] = ptAtKm(mm * MI); const [x, y] = P(la, ln); el("circle", { cx: x, cy: y, r: 7 * u, fill: "var(--course)", stroke: "var(--halo)", "stroke-width": 1.5 * u }, gO); txt(gO, x, y + 3.4 * u, mm, { "text-anchor": "middle", "font-size": 9 * u, "font-weight": 700, fill: "var(--halo)", "font-family": "IBM Plex Mono, monospace", "pointer-events": "none" }); }
  [[t("SALIDA"), C[0]], [t("META"), C[C.length - 1]]].forEach(([n, p]) => { const [x, y] = P(p[0], p[1]); el("rect", { x: x + 9 * u, y: y - 8 * u, width: (n.length * 7 + 10) * u, height: 16 * u, rx: 3 * u, fill: "var(--course)" }, gO); txt(gO, x + 14 * u, y + 4.5 * u, n, { "font-size": 11 * u, "font-weight": 700, fill: "var(--halo)", "font-family": "Barlow Condensed, sans-serif" }); });
  const order = {}; (S.plan || []).forEach((id, i) => (order[id] = i + 1));
  SPOTS.forEach(s => { let [x, y] = P(s.lat, s.lng); if (s.id === "m29s") x -= 12 * u; if (s.id === "m29n") x += 12 * u; const sel = order[s.id]; const seen = S.live.on && S.live.seen[s.id];
    const g = el("g", { class: "pin", tabindex: 0, role: "button", "aria-label": (sel ? t("Quitar") : t("Agregar")) + " " + s.name, style: "cursor:pointer" }, gO);
    el("circle", { cx: x, cy: y, r: (sel ? 12 : 8.5) * u, fill: sel ? (seen ? "var(--muted)" : "var(--accent)") : "var(--pin)", stroke: sel ? "var(--halo)" : "var(--accent)", "stroke-width": 2.5 * u }, g);
    if (sel) txt(g, x, y + 5 * u, sel, { "text-anchor": "middle", "font-size": 14 * u, "font-weight": 700, fill: "var(--accent-ink)", "font-family": "Barlow Condensed, sans-serif" });
    const tl = el("title", {}, g); tl.textContent = `${s.name} · ${t("milla")} ${s.mile.toFixed(1)}`;
    g.addEventListener("click", e => { e.stopPropagation(); emit("togglespot", s.id); });
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); emit("togglespot", s.id); } }); });
  { const st = place("start"); const [x, y] = P(st.lat, st.lng); const rr = 11 * u; let d = ""; for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, q = i % 2 ? rr * 0.45 : rr; d += (i ? "L" : "M") + (x + Math.cos(a) * q) + " " + (y + Math.sin(a) * q); }
    el("path", { d: d + "Z", fill: "var(--fg)", stroke: "var(--land)", "stroke-width": 1.5 * u }, gO); txt(gO, x - 14 * u, y - 10 * u, st.name, { "text-anchor": "end", "font-size": fs * 1.05, "font-weight": 700, fill: "var(--fg)", stroke: "var(--land)", "stroke-width": 3.5 * u, "paint-order": "stroke" }); }
  const tt = mapState.time != null ? mapState.time : (S.live.on ? now() : (S.scrub || 540));
  S.runners.forEach((rn, i) => { const k = kmAt(proj(rn), tt); if (k < 0 || k > TOTAL) return; const [la, ln] = ptAtKm(k); const [x, y] = P(la, ln); const rr = (rn.prio === 1 ? 10 : 8) * u;
    el("circle", { cx: x, cy: y, r: rr, fill: rn.color, stroke: "var(--halo)", "stroke-width": 2.5 * u }, gO); txt(gO, x, y + 4 * u, initial(rn.name), { "text-anchor": "middle", "font-size": 11 * u, "font-weight": 700, fill: "#fff", "font-family": "Barlow Condensed, sans-serif", "pointer-events": "none" }); });
  // real GPS position of tracked runners (ring), when the data is fresh
  S.runners.forEach(rn => { const lv = livePoint(rn.id); const g = lv && lv.raw; if (!g || rawAge(g) > 20) return; const [x, y] = P(g.lat, g.lng);
    el("circle", { cx: x, cy: y, r: 13 * u, fill: "none", stroke: rn.color, "stroke-width": 3 * u, "stroke-dasharray": `${4 * u} ${3 * u}` }, gO);
    el("circle", { cx: x, cy: y, r: 3.5 * u, fill: rn.color, stroke: "var(--halo)", "stroke-width": 1.2 * u }, gO);
    const tl = el("title", {}, gO); tl.textContent = `${rn.name} · GPS`; });
  if (mapState.gps) { const g = mapState.gps; const [x, y] = P(g.lat, g.lng); const acc = Math.max(4 * u, (g.acc || 0) / 10);
    el("circle", { cx: x, cy: y, r: acc, fill: "var(--accent)", "fill-opacity": .15, stroke: "var(--accent)", "stroke-opacity": .4, "stroke-width": 1 * u }, gO);
    el("circle", { cx: x, cy: y, r: 7 * u, fill: "var(--accent)", stroke: "#fff", "stroke-width": 3 * u }, gO); }
}
const initial = n => { const w = (n || "?").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(x => !/^corredor/i.test(x)); return ((w[0] || n || "?")[0] || "?").toUpperCase(); };
// pan / zoom
function bindPanZoom() {
  const ptrs = new Map(); let pinch0 = null, moved = 0;
  const zoomAt = (f, cx, cy) => { const r = svg.getBoundingClientRect(); const u = upp(); const px = V.x + (cx - r.left) * u - (u * r.width - V.w) / 2, py = V.y + (cy - r.top) * u - (u * r.height - V.h) / 2; const nw = Math.max(25, Math.min(W * 1.8, V.w * f)), nh = V.h * (nw / V.w); setView({ x: px - (px - V.x) * (nw / V.w), y: py - (py - V.y) * (nh / V.h), w: nw, h: nh }); };
  svg.addEventListener("wheel", e => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive: false });
  svg.addEventListener("pointerdown", e => { if (e.target.closest && e.target.closest(".pin")) return; moved = 0; ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  svg.addEventListener("pointermove", e => { if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
    if (moved > 4 && !svg.hasPointerCapture(e.pointerId)) { try { svg.setPointerCapture(e.pointerId); } catch (x) {} svg.classList.add("drag"); mapState.follow = false; }
    if (ptrs.size === 1 && moved > 4) { const u = upp(); V.x -= (e.clientX - prev[0]) * u; V.y -= (e.clientY - prev[1]) * u; svg.setAttribute("viewBox", `${V.x} ${V.y} ${V.w} ${V.h}`); }
    else if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt(pinch0 / d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch0 = d; } });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; if (!ptrs.size) { svg.classList.remove("drag"); draw(); } };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("click", e => { if (moved > 4) { e.stopImmediatePropagation(); } }, true);
  window.zoomMap = f => { const r = svg.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); };
}
