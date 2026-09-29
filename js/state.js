// Persistent app state (localStorage) + clock (Chicago time, with race-day simulation)
import { RACE, RUNNER_COLORS } from "./race-chicago.js";

const KEY = "porra:" + RACE.id + ":v2";
const uid = () => Math.random().toString(36).slice(2, 9);

export const DEFAULTS = () => ({
  runners: [],
  start: null,            // {name, lat, lng, address}; null = race default
  lang: null, onboarded: false, sound: true,
  buf: 5, linger: 2, maxs: 5, avoid: true,
  paceMargin: 3,          // ±% uncertainty on pace
  fatigue: 2,             // % slower per km after km 30
  plan: null, choice: {},
  streets: true, cta: true,
  scrub: null,
  sim: { on: false, start: 480, speed: 1, wall: 0, gps: null },
  live: { on: false, idx: 0, phase: "pre", boardT: null, seen: {}, sent: {}, feed: [], seenR: {} },
  notif: false, wake: false
});
export function newRunner(i, o) {
  return Object.assign({ id: uid(), name: "", bib: "", prio: i === 0 ? 1 : 2, corral: "H", goal: "4:05", color: RUNNER_COLORS[i % RUNNER_COLORS.length], splits: {} }, o || {});
}

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  const d = DEFAULTS();
  if (!s) return d;
  for (const k in d) if (s[k] === undefined) s[k] = d[k];
  s.sim = Object.assign(d.sim, s.sim || {});
  s.live = Object.assign(d.live, s.live || {});
  // migrate v1: drop example runners, wave → corral
  const W2C = { pro: "HP", w1: "C", w2: "H", w3: "L" };
  s.runners = (s.runners || []).filter(r => !/\(ejemplo\)/.test(r.name || ""));
  s.runners.forEach((r, i) => { r.id = r.id || uid(); r.splits = r.splits || {}; r.color = r.color || RUNNER_COLORS[i % RUNNER_COLORS.length]; r.prio = r.prio || 1; if (!r.corral) r.corral = W2C[r.wave] || "H"; delete r.wave; delete r.delay; });
  if (!s.runners.length) { s.onboarded = false; s.plan = null; }
  s.live.seenR = s.live.seenR || {};
  return s;
}
export const S = load();
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
export function resetAll() { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); }
export { uid };

// ---- Event bus ----
const bus = new EventTarget();
export const on = (n, f) => bus.addEventListener(n, e => f(e.detail));
export const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));

// ---- Clock: minutes since midnight in Chicago ----
const fmtTZ = new Intl.DateTimeFormat("en-US", { timeZone: RACE.tz, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
export function realNow() {
  const p = {}; fmtTZ.formatToParts(new Date()).forEach(x => (p[x.type] = x.value));
  return (+p.hour) * 60 + (+p.minute) + (+p.second) / 60;
}
export function now() {
  if (S.sim.on) return S.sim.start + ((Date.now() - S.sim.wall) / 60000) * S.sim.speed;
  return realNow();
}
export function setSim(on, startMin, speed) {
  S.sim.on = on; if (startMin != null) S.sim.start = startMin; if (speed) S.sim.speed = speed; S.sim.wall = Date.now(); save();
}
export const parseHM = s => { const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };
export const fmt = t => { if (t == null || !isFinite(t)) return "—"; t = Math.round(t); const h = Math.floor(t / 60), mm = ((t % 60) + 60) % 60; return h + ":" + String(mm).padStart(2, "0"); };
export const fmtPace = p => { if (!p || !isFinite(p)) return "—"; const sec = Math.round(p * 60); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
