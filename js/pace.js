// Runner projection: average pace vs. recent trend, with uncertainty window and fatigue
import { WAVES, CPS } from "./race-chicago.js";
import { S, parseHM, now } from "./state.js";
import { TOTAL } from "./engine.js";

let cache = new Map();
export function invalidatePace() { cache = new Map(); }

export function points(r) {
  const planned = WAVES[r.wave].t + (+r.delay || 0);
  const start = r.splits["0"] != null ? r.splits["0"] : planned;
  const pts = [[0, start]];
  for (const cp of CPS) { if (cp.km > 0 && r.splits[cp.k] != null) pts.push([cp.km, r.splits[cp.k]]); }
  pts.sort((a, b) => a[0] - b[0]);
  return { pts, start, startedReal: r.splits["0"] != null };
}

export function proj(r) {
  if (cache.has(r.id)) return cache.get(r.id);
  const { pts, start, startedReal } = points(r);
  const goal = parseHM(r.goal); const goalP = goal ? goal / TOTAL : 6.4;
  const m = (+S.paceMargin || 0) / 100;
  let o;
  if (pts.length < 2) {
    o = { pts, start, last: pts[0], avg: null, recent: null, trend: goalP, planP: goalP, fastP: goalP * (1 - m), slowP: goalP * (1 + m), basis: startedReal ? "start" : "plan", goalP };
  } else {
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const avg = (last[1] - start) / last[0];
    const recent = (last[1] - prev[1]) / (last[0] - prev[0]);
    // Recent segment carries more weight: if the runner is pushing, that's the new pace
    const trend = pts.length > 2 ? 0.65 * recent + 0.35 * avg : avg;
    const lo = Math.min(avg, trend), hi = Math.max(avg, trend);
    const mm = m * 0.6; // splits reduce uncertainty
    o = { pts, start, last, avg, recent, trend, planP: trend, fastP: lo * (1 - mm), slowP: hi * (1 + mm), basis: "splits", goalP };
  }
  o.state = recent_state(o);
  cache.set(r.id, o); return o;
}
function recent_state(o) {
  if (o.recent == null || o.avg == null || o.pts.length < 3) return null;
  const d = o.recent / o.avg - 1;
  if (d < -0.02) return "acelerando"; if (d > 0.03) return "bajando ritmo"; return "ritmo estable";
}
// Clock time at km for a pace variant: "fast" (earliest), "plan", "slow" (latest)
export function at(o, km, which) {
  const pts = o.pts; const last = o.last;
  if (km <= last[0]) { // interpolate known splits
    for (let i = 1; i < pts.length; i++) if (km <= pts[i][0]) { const f = (km - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]); }
    return last[1];
  }
  const p = o[(which || "plan") + "P"]; const f = (+S.fatigue || 0) / 100;
  const over = Math.max(0, km - Math.max(last[0], 30));
  return last[1] + (km - last[0]) * p + over * p * f;
}
export function kmAt(o, t) {
  const pts = o.pts, last = o.last;
  if (t <= pts[0][1]) return (t - pts[0][1]) / o.planP; // negative = not started
  if (t <= last[1]) { for (let i = 1; i < pts.length; i++) if (t <= pts[i][1]) { const f = (t - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1]); return pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]); } }
  // invert with fatigue by simple iteration
  let k = last[0] + (t - last[1]) / o.planP;
  for (let i = 0; i < 4; i++) { const tt = at(o, k, "plan"); k -= (tt - t) / o.planP; }
  return Math.min(TOTAL + 0.5, k);
}
export function nextCP(r) { const o = proj(r); return CPS.find(c => c.km > o.last[0] + 0.01 && (c.k !== "0")) || null; }
export function firstMissingCP(r) { return CPS.find(c => r.splits[c.k] == null) || null; }
// Is a checkpoint overdue (should have passed and we have no data)?
export function overdue(r, t) {
  const cp = firstMissingCP(r); if (!cp) return null; const o = proj(r);
  const exp = cp.km === 0 ? o.start : at(o, cp.km, "slow");
  return t > exp + 4 ? { cp, exp } : null;
}
