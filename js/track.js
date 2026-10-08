// Live runner tracking from the runner's own phone (OwnTracks → /api/pos → here).
// Snaps GPS points to the course, detects the start-line crossing and every checkpoint
// automatically, and feeds the real position + recent pace into the projections.
import { S, save, emit, now, raceTime, parseHM, fmtPace } from "./state.js";
import { RACE, CPS, CORRALS, WAVE_T } from "./race-chicago.js";
import { C, P, TOTAL, ptAtKm } from "./engine.js";
import { invalidatePace, setLivePoint, proj, at, rawAge } from "./pace.js";
import { invalidatePlan } from "./plan.js";
import { notify, curLeg } from "./live.js";
import { t } from "./i18n.js";

const PROD = "https://cheer.elevatesports.group";
const onProd = () => /(^|\.)elevatesports\.group$|\.vercel\.app$/.test(location.hostname);
export const apiBase = () => (window.CHEER_API != null ? window.CHEER_API : onProd() ? "" : PROD);
const siteBase = () => (window.CHEER_SITE != null ? window.CHEER_SITE : onProd() ? location.origin : PROD);

export const TRK = { err: null, at: 0, polling: false };
const TR = {}; // runner id → { raw: [...], rx: last received ms, info }

// ---------- tokens ----------
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function readIdOf(w) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(w));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
export async function enableTracking(r) {
  const w = b64u(crypto.getRandomValues(new Uint8Array(18)));
  r.trk = { w, id: await readIdOf(w) }; save(); poll(true); return r.trk;
}
export function disableTracking(r) {
  if (r.auto) for (const k of Object.keys(r.auto)) delete r.splits[k];
  delete r.trk; delete r.auto; delete TR[r.id]; setLivePoint(r.id, null);
  invalidatePace(); invalidatePlan(); save(); emit("trackupdate");
}
const tidOf = n => ((n || "CC").replace(/[^A-Za-zÀ-ÿ ]/g, "").trim().split(/\s+/).map(w => w[0]).join("") + "C").slice(0, 2).toUpperCase();
export function runnerLink(r) {
  if (!r.trk || !r.trk.w) return null;
  const q = new URLSearchParams({ w: r.trk.w, n: r.name || "", tid: tidOf(r.name), l: S.lang || "es" });
  return siteBase() + "/runner#" + q.toString();
}

// ---------- polling ----------
let timer = null, busy = false;
export function startTracking() {
  clearInterval(timer); timer = setInterval(() => poll(), 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  poll(true);
}
export async function poll(force) {
  const rs = S.runners.filter(r => r.trk && r.trk.id);
  if (!rs.length || busy || (document.hidden && !force)) return;
  busy = true; TRK.polling = true;
  try {
    const since = Math.min(...rs.map(r => (TR[r.id] && TR[r.id].rx) || 0));
    const res = await fetch(`${apiBase()}/api/pos?id=${rs.map(r => r.trk.id).join(",")}${since ? "&since=" + since : ""}`, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.ok) { TRK.err = j && j.error === "storage" ? "storage" : "net"; return; }
    TRK.err = null; TRK.at = Date.now(); let changed = false;
    for (const r of rs) {
      const st = TR[r.id] || (TR[r.id] = { raw: [], rx: 0 });
      const fresh = (j.r[r.trk.id] || []).filter(p => (p[6] || p[0]) > st.rx);
      if (!fresh.length) continue;
      for (const p of fresh) { const rt = raceTime(p[0]); st.raw.push({ ms: p[0], day: rt.day, t: rt.min, lat: p[1], lng: p[2], acc: p[3], vel: p[4], batt: p[5] }); st.rx = Math.max(st.rx, p[6] || p[0]); }
      st.raw.sort((a, b) => a.ms - b.ms); changed = true;
    }
    if (changed) processAll();
  } catch (e) { TRK.err = "net"; }
  finally { busy = false; TRK.polling = false; emit("track"); }
}

// ---------- course geometry ----------
let SEG = null;
function segs() {
  if (SEG) return SEG; SEG = [];
  for (let i = 0; i < C.length - 1; i++) { const [ax, ay] = P(C[i][0], C[i][1]), [bx, by] = P(C[i + 1][0], C[i + 1][1]); SEG.push({ ax, ay, bx, by, k0: C[i][2], k1: C[i + 1][2] }); }
  return SEG;
}
// nearest course point with km in [lo, hi]; d in meters
function snap(x, y, lo, hi) {
  let best = null;
  for (const s of segs()) {
    if (s.k1 < lo || s.k0 > hi) continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1e-9, dk = (s.k1 - s.k0) || 1e-9;
    const fLo = Math.max(0, (lo - s.k0) / dk), fHi = Math.min(1, (hi - s.k0) / dk);
    const f = Math.max(fLo, Math.min(fHi, ((x - s.ax) * dx + (y - s.ay) * dy) / L2));
    const d = Math.hypot(s.ax + dx * f - x, s.ay + dy * f - y) * 10;
    if (!best || d < best.d) best = { d, km: s.k0 + f * dk };
  }
  return best;
}
// position relative to the start line: along < 0 = behind it (corrals), lat = sideways (m)
function vsStart(x, y) {
  const [ax, ay] = P(C[0][0], C[0][1]); const b = ptAtKm(0.2); const [bx, by] = P(b[0], b[1]);
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
  return { along: ((x - ax) * dx + (y - ay) * dy) / L * 10, lat: ((x - ax) * dy - (y - ay) * dx) / L * 10 };
}

// ---------- analysis ----------
function analyze(r, st) {
  const day = S.sim.on ? null : RACE.date;
  const pts = st.raw.filter(p => (!day || p.day === day) && (p.acc == null || p.acc <= 120));
  const goal = parseHM(r.goal); const goalP = goal ? goal / TOTAL : 6.4;
  const cr = CORRALS[r.corral] || CORRALS.H; const notBefore = WAVE_T[cr.wave] - 3; // nobody crosses before their wave's gun
  let startT = null, lastKm = null, lastT = null, pre = null, estStart = false; const trk = [];
  for (const p of pts) {
    const [x, y] = P(p.lat, p.lng); const tol = 45 + Math.min(p.acc || 20, 45);
    if (startT == null) {
      const v = vsStart(x, y);
      if (v.along < 0 && v.along > -1600 && Math.abs(v.lat) < 90) { pre = { t: p.t, km: v.along / 1000 }; continue; }
      if (p.t < notBefore) continue;
      // near the start, or (phone turned on late) wherever the clock says they could be
      const el = p.t - notBefore, guess = el / goalP;
      const s = snap(x, y, 0, 2.5) && snap(x, y, 0, 2.5).d < tol ? snap(x, y, 0, 2.5) : snap(x, y, Math.max(0, guess * 0.6 - 2), Math.min(TOTAL, guess * 1.15 + 2));
      if (s && s.d < tol && s.km >= 0.15) {
        if (pre && p.t - pre.t < 5 && s.km < 1.5) startT = pre.t + (-pre.km) / (s.km - pre.km) * (p.t - pre.t);
        else { startT = Math.max(notBefore, p.t - s.km * goalP); estStart = true; }
        trk.push([startT, 0], [p.t, s.km]); lastKm = s.km; lastT = p.t;
      }
      continue;
    }
    const dt = Math.max(0.1, p.t - lastT);
    const s = snap(x, y, lastKm - 0.15, lastKm + dt * 0.5 + 0.25); // ≤ 30 km/h
    if (!s || s.d > tol) continue;
    const km = Math.max(lastKm, s.km);
    trk.push([p.t, km]); lastKm = km; lastT = p.t;
    if (km >= TOTAL - 0.1) break;
  }
  // tracking began after the start: back-calculate it from their real pace over the first km tracked
  if (estStart && trk.length > 2) {
    const a = trk[1]; let j = 2; while (j < trk.length - 1 && trk[j][1] < a[1] + 5) j++; const z = trk[j];
    if (z[1] - a[1] >= 1.5) { const pz = (z[0] - a[0]) / (z[1] - a[1]); if (pz > 2.4 && pz < 16) trk[0][0] = startT = Math.max(notBefore, a[0] - a[1] * pz); }
  }
  // checkpoint times from the track (linear interpolation between GPS points)
  const cps = {};
  if (startT != null) {
    cps["0"] = startT;
    for (const cp of CPS) { if (cp.km <= 0) continue; const lim = Math.min(cp.km, TOTAL - 0.1);
      for (let i = 1; i < trk.length; i++) if (trk[i - 1][1] < lim && trk[i][1] >= lim) { const [ta, ka] = trk[i - 1], [tb, kb] = trk[i]; cps[cp.k] = ta + (lim - ka) / ((kb - ka) || 1e-9) * (tb - ta) + (cp.km - lim) * ((tb - ta) / ((kb - ka) || 1e-9)); break; } }
  }
  // recent pace: last ~3 km of track
  let recentP = null; const last = trk[trk.length - 1];
  if (last && last[1] >= 1) { let j = trk.length - 1; while (j > 0 && trk[j - 1][1] >= last[1] - 3) j--; const a = trk[j]; if (last[1] - a[1] >= 1) { const p = (last[0] - a[0]) / (last[1] - a[1]); if (p > 2.4 && p < 16) recentP = p; } }
  const lastRaw = st.raw[st.raw.length - 1] || null;
  return { startT, estStart, trk, cps, recentP, km: last ? last[1] : null, t: last ? last[0] : null, finished: !!last && last[1] >= TOTAL - 0.1, lastRaw, inCorral: startT == null && !!pre && lastRaw && pre.t === lastRaw.t };
}

function processAll() {
  let dirty = false; const news = [];
  for (const r of S.runners) {
    const st = TR[r.id]; if (!r.trk || !st) continue;
    const a = analyze(r, st); st.info = a;
    setLivePoint(r.id, { km: a.km, t: a.t, recentP: a.recentP, raw: a.lastRaw, finished: a.finished });
    r.auto = r.auto || {}; let newest = null;
    for (const [k, v] of Object.entries(a.cps)) {
      const cur = r.splits[k];
      if (cur != null && !r.auto[k]) continue; // a split typed by hand wins
      const nv = Math.round(v * 10) / 10;
      if (cur != null && Math.abs(cur - nv) < 0.15) continue;
      r.splits[k] = nv; r.auto[k] = k === "0" && a.estStart ? 2 : 1; dirty = true;
      if (cur == null && (!newest || nv > newest.v)) newest = { k, v: nv };
    }
    if (newest && now() - newest.v < 15) news.push([r, newest]); // don't replay old checkpoints after a reload
    // signal lost mid-race
    if (a.startT != null && !a.finished && a.lastRaw && (S.sim.on || a.lastRaw.day === RACE.date)) {
      const gap = now() - a.lastRaw.t;
      if (gap > 6 && gap < 120) notify("stale:" + r.id + ":" + Math.round(a.lastRaw.t), t("Sin señal de {n}", { n: r.name }), t("Su celular no manda ubicación desde hace {m} min. Seguimos estimando con su ritmo.", { m: Math.round(gap) }), 1);
    }
  }
  if (dirty) save();
  invalidatePace(); invalidatePlan();
  for (const [r, { k, v }] of news) {
    const cp = CPS.find(c => c.k === k); const o = proj(r);
    let body = t("A las {h}, detectado por su GPS.", { h: fmtT(v) });
    if (o.recent && o.avg) body += " " + t("Último tramo {a}/km, promedio {b}/km", { a: fmtPace(o.recent), b: fmtPace(o.avg) }) + (o.state ? " (" + t(o.state) + ")" : "") + ".";
    const leg = S.live.on ? curLeg() : null;
    if (leg && leg.b.km > (o.last ? o.last[0] : 0)) body += " " + t("Llega a {s} ~{h}", { s: leg.b.name, h: fmtT(at(o, leg.b.km, "plan")) }) + ".";
    notify("gps:" + r.id + ":" + k, k === "0" ? t("{n} cruzó la salida", { n: r.name }) : t("{r} pasó {cp}", { r: r.name, cp: t(cp.n) }), body, 1);
  }
  emit("trackupdate");
}
const fmtT = v => { const h = Math.floor(v / 60), m = Math.floor(v % 60); return h + ":" + String(m).padStart(2, "0"); };
// re-check stale signal even when no new points arrive
setInterval(() => { if (Object.keys(TR).length) processAll(); }, 60000);

// ---------- status for the UI ----------
const ago = min => min < 1 ? t("hace {s} s", { s: Math.max(1, Math.round(min * 60)) }) : min < 90 ? t("hace {m} min", { m: Math.round(min) }) : t("hace más de 1 h");
export function trackStatus(r) {
  if (!r.trk) return null;
  if (TRK.err === "storage") return { level: "bad", text: t("Falta conectar la base de datos en Vercel (Storage → Upstash).") };
  const st = TR[r.id]; const a = st && st.info;
  if (!st || !st.raw.length) return { level: "warn", text: TRK.err === "net" ? t("Sin conexión con el servidor. Reintentando…") : t("Esperando la primera señal del celular de {n}.", { n: r.name || t("tu corredor") }) };
  const lr = st.raw[st.raw.length - 1];
  const age = Math.max(0, rawAge(lr));
  const parts = [t("Último dato {a}", { a: ago(age) })];
  if (a && a.finished) parts.unshift(t("Terminó"));
  else if (a && a.km != null) parts.unshift("km " + a.km.toFixed(1));
  else if (a && a.inCorral) parts.unshift(t("En el corral"));
  if (a && a.recentP) parts.push(t("ritmo GPS {p}/km", { p: Math.floor(a.recentP) + ":" + String(Math.round((a.recentP % 1) * 60)).padStart(2, "0") }));
  if (lr.batt != null) parts.push("🔋" + lr.batt + "%");
  return { level: age < 3 ? "ok" : age < 10 ? "warn" : "bad", text: parts.join(" · "), age, live: age < 3 };
}
export const hasLive = r => !!(r.trk && TR[r.id] && TR[r.id].raw.length);
