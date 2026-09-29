// Plan: priority groups, spot windows, legs and the optimizer
import { S } from "./state.js";
import { SPOTS, byId, place, options, optSteps } from "./engine.js";
import { proj, at } from "./pace.js";

// Main group = priority 1 (must see all at every point). Fallback: best-priority runner.
export function groups() {
  const rs = S.runners;
  let main = rs.filter(r => r.prio === 1);
  if (!main.length) { const p2 = rs.filter(r => r.prio === 2); main = p2.length ? [p2[0]] : rs.slice(0, 1); }
  const bonus = rs.filter(r => r.prio === 2 && !main.includes(r));
  const follow = rs.filter(r => r.prio === 3);
  return { main, bonus, follow };
}
export function windowAt(spot) {
  const { main } = groups();
  if (!main.length) return { earliest: 0, latest: 0, depart: 0 };
  let earliest = 1e9, latest = -1e9;
  for (const r of main) { const o = proj(r); earliest = Math.min(earliest, at(o, spot.km, "fast")); latest = Math.max(latest, at(o, spot.km, "slow")); }
  return { earliest, latest, depart: latest + (+S.linger) };
}
export function bonusAt(spot, youArrive, depart) {
  const { bonus } = groups();
  return bonus.map(r => { const o = proj(r); const f = at(o, spot.km, "fast"), s = at(o, spot.km, "slow");
    let st = "no"; if (f >= youArrive && s <= depart) st = "si"; else if (s >= youArrive && f <= depart + 8) st = "quizas";
    return { r, f, s, st, wait: Math.max(0, Math.round(s - depart)) }; });
}
function chooseOpt(opts, a, b) { const want = S.choice[a.id + ">" + b.id]; return (want && opts.find(o => o.key === want)) || opts[0]; }
export function mkLeg(a, aSide, b, forceBest) {
  const opts = options(a, aSide, b); const o = forceBest ? opts[0] : chooseOpt(opts, a, b);
  const W = windowAt(b);
  if (!a.km && a.km !== 0 || a.id === "start") { const depart = W.earliest - o.rt - (+S.buf); return { a, b, aSide, opts, o, rt: o.rt, depart, arrive: depart + o.rt, earliest: W.earliest, W, slack: null, first: true }; }
  const Wa = windowAt(a); const depart = Wa.depart;
  return { a, b, aSide, opts, o, rt: o.rt, depart, arrive: depart + o.rt, earliest: W.earliest, W, slack: W.earliest - (depart + o.rt + (+S.buf)) };
}
export function bestLeg(a, b) {
  if (!a.sides) return mkLeg(a, 0, b, true);
  const l0 = mkLeg(a, 0, b, true), l1 = mkLeg(a, 1, b, true); return l0.o.w <= l1.o.w ? l0 : l1;
}
let LEGS = null;
export function invalidatePlan() { LEGS = null; }
export function planLegs() {
  if (LEGS) return LEGS;
  if (!S.runners.length) return (LEGS = []);
  const from = place(S.from || "start") || place("start"); let prev = from, side = 0;
  LEGS = (S.plan || []).filter(id => byId[id]).map(id => { const s = byId[id]; const l = mkLeg(prev, side, s); l.steps = optSteps(prev, s, l.o); side = l.o.side; l.arrSide = side; l.bonus = bonusAt(s, l.arrive, windowAt(s).depart); prev = s; return l; });
  return LEGS;
}
// Optimizer: maximize points where you see ALL priority-1 runners; tie-break by priority-2 sightings, then minimum slack.
export function optimize() {
  // DP over (spot, arrival sidewalk): maximize points where all main runners are seen,
  // tie-break by "if possible" sightings, then by the smallest buffer.
  const from = place("start"); const maxs = +S.maxs;
  if (!S.runners.length) return [];
  const cand = SPOTS.slice(); const N = cand.length;
  const better = (x, y) => !y || x.c > y.c || (x.c === y.c && x.v > y.v);
  const dp = cand.map(() => [0, 1].map(() => Array(maxs + 1).fill(null)));
  const W = cand.map(s => windowAt(s));
  cand.forEach((s, j) => {
    const l = mkLeg(from, 0, s, true); const side = l.o.side;
    const c1 = bonusAt(s, l.arrive, W[j].depart).filter(x => x.st === "si").length;
    const st = { c: c1, v: 60, p: null }; if (better(st, dp[j][side][1])) dp[j][side][1] = st;
  });
  for (let j = 0; j < N; j++) for (let sd = 0; sd < 2; sd++) for (let c = 1; c < maxs; c++) {
    const cur = dp[j][sd][c]; if (!cur) continue;
    for (let k = j + 1; k < N; k++) {
      if (cand[k].km <= cand[j].km) continue;
      const l = mkLeg(cand[j], sd, cand[k], true); if (l.slack < 0) continue;
      const cc = bonusAt(cand[k], l.arrive, W[k].depart).filter(x => x.st === "si").length;
      const nx = { c: cur.c + cc, v: Math.min(cur.v, l.slack), p: [j, sd] };
      if (better(nx, dp[k][l.o.side][c + 1])) dp[k][l.o.side][c + 1] = nx;
    }
  }
  for (let c = maxs; c >= 1; c--) {
    let best = null, bj = -1, bs = 0;
    for (let j = 0; j < N; j++) for (let sd = 0; sd < 2; sd++) if (dp[j][sd][c] && better(dp[j][sd][c], best)) { best = dp[j][sd][c]; bj = j; bs = sd; }
    if (bj >= 0) { const path = []; let j = bj, sd = bs, cc = c; while (j != null && cc > 0) { path.unshift(cand[j].id); const pr = dp[j][sd][cc].p; if (!pr) break; [j, sd] = pr; cc--; } return path; }
  }
  return [];
}
