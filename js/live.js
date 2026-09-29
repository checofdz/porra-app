// Live race-day assistant: GPS, ETA to next point, real-time slack, transit progress, alerts & notifications
import { S, save, now, emit, fmt, fmtPace } from "./state.js";
import { HW, LN, ST, CPS } from "./race-chicago.js";
import { place, gpsPlace, options, optSteps, hvm, SPOTS, byId, P, rtAt, neededMpm, paceFor, kmh, PACES, AVOID_PEN } from "./engine.js";
import { planLegs, windowAt, groups, invalidatePlan } from "./plan.js";
import { proj, at, kmAt, overdue, invalidatePace, firstMissingCP } from "./pace.js";
import { mapState } from "./map.js";
import { t, t2 } from "./i18n.js";

export const L = { gps: null, fixes: [], watch: null, err: null, calc: null, wake: null, timer: null, route: null, routeAt: 0, lastBand: {}, waitStart: null };

// ---------- GPS ----------
export function startGPS() {
  if (S.sim.on && S.sim.gps) { onFix(Object.assign({ t: Date.now(), acc: 15, speed: 0, sim: true }, S.sim.gps)); return; }
  if (!("geolocation" in navigator)) { L.err = t("Este navegador no tiene GPS."); emit("live"); return; }
  if (L.watch != null) return;
  L.watch = navigator.geolocation.watchPosition(
    p => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, speed: p.coords.speed, t: Date.now() }),
    e => { L.err = e.code === 1 ? t("Permiso de ubicación negado. Actívalo en la configuración del navegador.") : t("No se pudo leer el GPS ({m}).", { m: e.message }); emit("live"); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 });
}
export function stopGPS() { if (L.watch != null) navigator.geolocation.clearWatch(L.watch); L.watch = null; }
export function simFix(lat, lng, speed) { S.sim.gps = { lat, lng }; save(); onFix({ lat, lng, acc: 10, speed: speed || 0, t: Date.now(), sim: true }); }
function onFix(f) {
  const prev = L.fixes[L.fixes.length - 1];
  if (prev && (f.speed == null || isNaN(f.speed))) { const dt = (f.t - prev.t) / 1000; if (dt > 2) f.speed = hvm(prev.lat, prev.lng, f.lat, f.lng) / dt; }
  L.err = null; L.fixes.push(f); if (L.fixes.length > 40) L.fixes.shift(); L.gps = f; mapState.gps = f;
  autoPhase(); compute();
}
// ---------- phases ----------
export const PHASES = { pre: "Aún no sales", walk: "Caminando", wait: "En el andén", ride: "En el metro", arrived: "En el punto" }; // translated at render
export function setPhase(ph) {
  S.live.phase = ph;
  if (ph === "ride") { S.live.boardT = now(); L.frozen = L.route; }
  if (ph === "wait") L.waitStart = now();
  if (ph === "walk" || ph === "pre") { S.live.boardT = null; L.frozen = null; }
  save(); compute(true);
}
function autoPhase() {
  const leg = curLeg(); if (!leg || !L.gps) return;
  const d = hvm(L.gps.lat, L.gps.lng, leg.b.lat, leg.b.lng);
  const fast = L.fixes.slice(-2).every(f => (f.speed || 0) > 7);
  const slow = L.fixes.slice(-3).every(f => (f.speed || 0) < 1.5);
  if (d < 70 && S.live.phase !== "arrived") { S.live.phase = "arrived"; save(); return; }
  if (fast && S.live.phase !== "ride") { S.live.phase = "ride"; S.live.boardT = now(); L.frozen = L.route; save(); return; }
  if (S.live.phase === "pre" && L.fixes.length > 2) { const a = L.fixes[L.fixes.length - 3]; if (hvm(a.lat, a.lng, L.gps.lat, L.gps.lng) > 120) { S.live.phase = "walk"; save(); } }
  if (S.live.phase === "ride" && slow && L.frozen) { const rs = L.frozen.steps.filter(s => s.k === "ride"); const last = rs[rs.length - 1]; if (last) { const st = ST[last.to]; if (hvm(L.gps.lat, L.gps.lng, st[1], st[2]) < 300) { S.live.phase = "walk"; L.frozen = null; save(); } } }
}
// ---------- current leg ----------
export function curLeg() { const legs = planLegs(); return legs[S.live.idx] || null; }
export function markSeen() {
  const leg = curLeg(); if (!leg) return; S.live.seen[leg.b.id] = true; S.live.idx++; S.live.phase = "pre"; S.live.boardT = null; L.frozen = null; L.route = null;
  save(); notify("seen:" + leg.b.id, t("Siguiente punto"), curLeg() ? t("Vas a {s}.", { s: curLeg().b.name }) : t("Terminaste el plan: ve al reencuentro en Grant Park."), 0); compute(true);
}
export function goToIdx(i) { S.live.idx = i; S.live.phase = "pre"; S.live.boardT = null; L.frozen = null; L.route = null; save(); compute(true); }

// ---------- ride progress ----------
function rideProgress(steps, t) {
  const rides = steps.map((s, i) => [s, i]).filter(([s]) => s.k === "ride"); if (!rides.length) return null;
  let cur = rides[0], j = 0, byGps = false;
  if (L.gps && L.gps.acc < 400) {
    let best = null; rides.forEach(([s, i]) => s.stations.forEach((st, k) => { const d = hvm(L.gps.lat, L.gps.lng, ST[st][1], ST[st][2]); if (!best || d < best.d) best = { d, s, i, k }; }));
    if (best && best.d < 700) { cur = [best.s, best.i]; j = best.k; byGps = true; }
  }
  if (!byGps && S.live.boardT != null) { // dead reckoning
    let el = t - S.live.boardT; const s = cur[0]; j = 0; while (j < s.hops.length && el >= s.hops[j]) { el -= s.hops[j]; j++; }
  }
  const [s, i] = cur; let rem = s.hops.slice(j).reduce((a, b) => a + b, 0) + 0.5;
  for (let q = i + 1; q < steps.length; q++) rem += steps[q].min || 0;
  return { step: s, stopsLeft: s.stations.length - 1 - j, alight: ST[s.to][0], line: t(LN[s.color]), color: s.color, rem, byGps };
}

// ---------- main computation ----------
export function compute(force) {
  const t = now(); const legs = planLegs();
  // skip points the main group already passed (you can't make it anymore)
  let guard = 0;
  while (legs[S.live.idx] && S.live.phase !== "arrived" && windowAt(legs[S.live.idx].b).latest < t - 1 && guard++ < 12) {
    const b = legs[S.live.idx].b; notify("missed:" + b.id, t("Ya pasaron por {s}", { s: b.name }), t("No se alcanzó a llegar. Vamos al siguiente punto."), 2); S.live.idx++; L.route = null; if (S.live.phase === "pre") S.live.phase = "walk"; save();
  }
  const leg = legs[S.live.idx];
  if (!leg) { L.calc = { done: true, t }; emit("live"); return; }
  const target = leg.b; const W = windowAt(target); const ph = S.live.phase;
  let eta, route = null, ride = null, mode;
  if (ph === "arrived") { eta = 0; mode = "arrived"; }
  else if (ph === "ride") {
    const base = L.frozen || L.route || { steps: leg.steps };
    ride = rideProgress(base.steps, t);
    if (ride) { eta = ride.rem; mode = "ride"; route = base; }
  }
  let onboard = ph === "ride" && eta == null;
  if (eta == null) {
    if (L.gps) {
      if (force || !L.route || Date.now() - L.routeAt > 20000 || L.route.fix !== L.gps) {
        const gp = gpsPlace(L.gps.lat, L.gps.lng); const opts = options(gp, 0, target);
        const sc = o => rtAt(o, leg.mpm) + (S.avoid ? (o.cx || 0) * AVOID_PEN : 0); const o = opts.reduce((x, y) => (sc(y) < sc(x) ? y : x));
        L.route = { o, steps: optSteps(gp, target, o, leg.mpm), fix: L.gps, opts }; L.routeAt = Date.now();
      }
      route = L.route; eta = rtAt(route.o, leg.mpm); mode = "gps";
      if (onboard) { // already on a train: drop the walk-to-station and platform wait
        const st = route.steps; if (st[0] && st[0].k === "walk" && st[0].min < 4 && st[1] && st[1].k === "wait") { eta -= st[0].min + st[1].min; mode = "ride"; }
      }
    } else { route = { o: leg.o, steps: leg.steps }; eta = leg.rt; mode = ph === "pre" ? "plan" : "nogps"; }
  }
  // arrival estimate
  let arrive;
  if (mode === "plan") arrive = Math.max(t, leg.depart) + eta;
  else if (mode === "nogps") arrive = Math.max(t, leg.arrive);
  else arrive = t + eta;
  const slack = W.earliest - arrive;
  const leaveBy = W.earliest - eta - (+S.buf);
  const delay = arrive - leg.arrive;
  const band = slack >= 5 ? "ok" : slack >= 0 ? "tight" : "late";
  // runners
  const { main, bonus, follow } = groups();
  const runners = S.runners.map(r => { const o = proj(r); const km = kmAt(o, t); const nx = firstMissingCP(r);
    return { r, o, km, nextCP: nx, nextAt: nx ? (nx.km === 0 ? o.start : at(o, nx.km, "plan")) : null, fast: at(o, target.km, "fast"), slow: at(o, target.km, "slow"), plan: at(o, target.km, "plan"), passed: at(o, target.km, "slow") < t - 1, od: overdue(r, t), group: main.includes(r) ? "main" : bonus.includes(r) ? "bonus" : "follow" }; });
  // alternatives if late/tight
  let alts = [];
  if (band !== "ok" && mode !== "arrived") alts = alternatives(t, target);
  // your on-foot speed vs. the speed you need to make it (walking legs only)
  let speed = null;
  if (L.gps && mode === "gps" && route && route.o && !route.o.stay && S.live.phase !== "pre") {
    const recent = L.fixes.slice(-5).filter(f => f.speed != null && f.speed >= 0 && f.speed < 6);
    const cur = recent.length ? recent.reduce((a, f) => a + f.speed, 0) / recent.length * 60 : 0; // m/min
    speed = { cur, need: neededMpm(route.o, W.earliest - t) };
  }
  L.calc = { t, leg, target, W, eta, arrive, slack, leaveBy, delay, band, mode, route, ride, runners, alts, speed };
  rules(L.calc); emit("live");
}
function alternatives(t, target) {
  const from = L.gps ? gpsPlace(L.gps.lat, L.gps.lng) : curLeg().a;
  const out = [];
  for (const c of SPOTS) {
    if (c.id === target.id) continue; const W = windowAt(c); if (W.earliest < t + 3) continue;
    const opts = options(from, 0, c); const o = opts[0]; const sl = W.earliest - (t + o.rt);
    if (sl >= 3) out.push({ c, o, slack: sl, inPlan: (S.plan || []).includes(c.id) });
  }
  out.sort((a, b) => a.c.km - b.c.km);
  return out.slice(0, 3);
}
// ---------- alert rules ----------
function rules(c) {
  const i = S.live.idx, name = c.target.name;
  if (c.mode === "plan" || (S.live.phase === "pre")) {
    const mins = c.leaveBy - c.t;
    if (mins <= 3 && mins > -15) notify("leave:" + i, t("Sal ya"), t("Sal ahora hacia {s}.", { s: name }) + " " + firstInstr(c.route) + " " + t("Holgura {v} min.", { v: sgn(c.slack) }), 2);
    else if (mins <= 12 && mins > 3) notify("leave10:" + i, t("Prepárate para salir"), t("En {m} min sales hacia {s}.", { m: Math.round(mins), s: name }), 1);
  }
  // debounce: a band change must hold for two consecutive readings before we alert
  // a reading must persist ≥25 s (or ≥0.5 race-min in simulation) before alerting
  if (!L.candBand || L.candBand.i !== i || L.candBand.band !== c.band) L.candBand = { i, band: c.band, wall: Date.now(), t: c.t };
  const stable = Date.now() - L.candBand.wall >= 25000 || c.t - L.candBand.t >= 0.5;
  const prev = L.lastBand[i];
  if (c.mode !== "arrived" && prev && prev !== c.band && !stable) return rulesRest(c, i, name, false);
  if (c.mode !== "arrived" && prev && prev !== c.band) {
    if (c.band === "late") notify("band:" + i + ":late:" + Math.floor(c.t / 5), t("No llegas a {s}", { s: name }), t("Llegarías {m} min tarde.", { m: Math.round(-c.slack) }) + " " + (c.alts.length ? t("Mejor: {s} (holgura +{v}).", { s: c.alts[0].c.name, v: Math.round(c.alts[0].slack) }) : t("Quédate donde estás o ve al reencuentro.")), 3);
    else if (c.band === "tight") notify("band:" + i + ":tight:" + Math.floor(c.t / 5), t("Vas justo"), t("Holgura +{v} min para {s}. No te detengas.", { v: Math.round(c.slack), s: name }), 2);
    else notify("band:" + i + ":ok:" + Math.floor(c.t / 5), t("Vas bien"), t("Holgura +{v} min para {s}.", { v: Math.round(c.slack), s: name }), 1);
  }
  L.lastBand[i] = c.band;
  rulesRest(c, i, name, true);
}
function rulesRest(c, i, name, stable) {
  if (c.speed && isFinite(c.speed.need) && c.speed.need > 72 && c.speed.need > c.speed.cur * 1.15) {
    const m = paceFor(c.speed.need); if (m) notify("speed:" + i + ":" + m, t("Acelera"), t("Necesitas {v} km/h ({m}) para llegar a {s}. Vas a {c} km/h.", { v: kmh(c.speed.need), m: t(PACES[m].n).toLowerCase(), s: name, c: kmh(c.speed.cur) }), 2);
  }
  if (c.ride) { const key = "stops:" + i + ":" + c.ride.stopsLeft; if (!S.live.sent[key]) { S.live.sent[key] = 1; toast(t("Línea {l}", { l: c.ride.line }) + ": " + t2(c.ride.stopsLeft, "falta {n} parada", "faltan {n} paradas") + ", " + t("bajas en {s}", { s: c.ride.alight }) + ". " + t("Holgura {v} min.", { v: sgn(c.slack) }), c.band); if (c.ride.stopsLeft === 1) notify("alight:" + i, t("Siguiente parada: bájate"), t("Bájate en {s}.", { s: c.ride.alight }) + " " + t("Holgura {v} min.", { v: sgn(c.slack) }), 2); } }
  const late4 = c.delay >= 4 && c.mode !== "arrived" && S.live.phase !== "pre";
  if (!late4) L.delaySince = null; else if (!L.delaySince) L.delaySince = { wall: Date.now(), t: c.t };
  if (late4 && (Date.now() - L.delaySince.wall >= 25000 || c.t - L.delaySince.t >= 0.5)) notify("delay:" + i + ":" + Math.floor(c.delay / 4), t("Vas atrasado vs. el plan"), t("{m} min más tarde de lo planeado. Holgura real {v} min para {s}.", { m: Math.round(c.delay), v: sgn(c.slack), s: name }), c.slack < 5 ? 2 : 1);
  if (S.live.phase === "wait" && L.waitStart != null) { const line = (c.route && c.route.steps.find(s => s.k === "wait")) || null; const hw = line ? HW[line.color] : 10; if (c.t - L.waitStart > hw + 4) notify("slowtrain:" + i, t("El tren está tardando"), t("Llevas {m} min en el andén.", { m: Math.round(c.t - L.waitStart) }) + " " + t("Holgura {v} min.", { v: sgn(c.slack) }) + (c.alts.length && c.slack < 3 ? " " + t("Alternativa: {s}.", { s: c.alts[0].c.name }) : ""), 2); }
  c.runners.forEach(x => {
    if (x.group === "follow") return;
    const m = x.fast - c.t;
    const seen = (S.live.seenR[c.target.id] || {})[x.r.id];
    if (!x.passed && !seen && m <= 5 && m > 0 && (S.live.phase === "arrived" || c.slack > -2)) notify("near:" + x.r.id + ":" + c.target.id, t("{r} llega en ~{m} min", { r: x.r.name, m: Math.round(m) }), t("Prepárate en {s}. Ventana {a}–{b}.", { s: name, a: fmt(x.fast), b: fmt(x.slow) }), 2);
    // arrival alarm (countdown overlay + sound) when you're there or on time
    if (!seen && m <= 3.2 && c.t <= x.slow + 2 && (S.live.phase === "arrived" || c.slack >= -1)) emit("alarm", { r: x.r, spot: c.target, fast: x.fast, slow: x.slow });
    if (x.od) notify("od:" + x.r.id + ":" + x.od.cp.k, t("¿{r} ya pasó el {cp}?", { r: x.r.name, cp: t(x.od.cp.n) }), t("Debía pasar ~{h}. Revisa la app oficial y márcalo para recalcular.", { h: fmt(x.od.exp) }), 1);
  });
  // auto-advance once the main group has surely passed
  if (S.live.phase === "arrived" && c.t > c.W.depart + 3) { notify("passed:" + c.target.id, t("Ya pasaron por {s}", { s: name }), t("Pasando al siguiente punto."), 1); markSeenSilently(); }
}
export function markRunnerSeen(spotId, rid) {
  S.live.seenR[spotId] = S.live.seenR[spotId] || {}; S.live.seenR[spotId][rid] = true; save();
  const leg = curLeg(); if (leg && leg.b.id === spotId) { const { main } = groups(); if (main.every(r => S.live.seenR[spotId][r.id])) { markSeen(); return; } }
  compute(true);
}
function markSeenSilently() { const leg = curLeg(); if (!leg) return; S.live.seen[leg.b.id] = true; S.live.idx++; S.live.phase = "pre"; S.live.boardT = null; L.frozen = null; L.route = null; save(); }
const sgn = v => (v >= 0 ? "+" : "") + Math.round(v);
function firstInstr(route) {
  if (!route || !route.steps || !route.steps.length) return "";
  const s = route.steps[0];
  if (s.k === "walk") { const d = s.dirs.find(d => !d.x); const st = route.steps.find(q => q.k === "wait"); return d ? t("Camina por {n} hacia el {d}", { n: d.nm, d: t(d.dir) }) + (st ? " " + t("a la estación {s} (Línea {l})", { s: ST[st.st][0], l: t(LN[st.color]) }) : "") + "." : ""; }
  return "";
}
// ---------- splits ----------
export function recordSplit(r, cpk, time) {
  const leg = curLeg(); const before = leg ? at(proj(r), leg.b.km, "plan") : null;
  r.splits[cpk] = time != null ? time : Math.round(now() * 10) / 10;
  invalidatePace(); invalidatePlan(); save();
  const o = proj(r); const cp = CPS.find(c => c.k === cpk);
  let msg = t("{cp} a las {h}.", { cp: t(cp.n), h: fmt(r.splits[cpk]) });
  if (o.recent) msg += " " + t("Último tramo {a}/km, promedio {b}/km", { a: fmtPace(o.recent), b: fmtPace(o.avg) }) + (o.state ? " (" + t(o.state) + ")" : "") + ".";
  if (leg && before != null) { const after = at(o, leg.b.km, "plan"); const d = Math.round(after - before); msg += " " + t("Llega a {s} ~{h}", { s: leg.b.name, h: fmt(after) }) + (d ? " (" + t("{d} min vs. antes", { d: (d > 0 ? "+" : "") + d }) + ")" : "") + "."; }
  notify("split:" + r.id + ":" + cpk + ":" + r.splits[cpk], t("{r} pasó {cp}", { r: r.name, cp: t(cp.n) }), msg, 1);
  compute(true);
}
export function clearSplit(r, cpk) { delete r.splits[cpk]; invalidatePace(); invalidatePlan(); save(); compute(true); }

// ---------- notifications ----------
export function toast(msg, level) { emit("toast", { msg, level }); }
export function notify(key, title, body, level) {
  if (S.live.sent[key]) return; S.live.sent[key] = 1;
  S.live.feed.unshift({ t: now(), title, body, level }); S.live.feed = S.live.feed.slice(0, 40); save();
  emit("toast", { msg: title + ": " + body, level: level >= 3 ? "late" : level >= 2 ? "tight" : "ok" });
  if (level >= 2 && navigator.vibrate) try { navigator.vibrate(level >= 3 ? [300, 120, 300, 120, 300] : [200, 100, 200]); } catch (e) {}
  if (S.notif && "Notification" in window && Notification.permission === "granted") {
    navigator.serviceWorker?.getRegistration().then(reg => { const opts = { body, tag: key.split(":").slice(0, 2).join(":"), renotify: true, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" }; if (reg) reg.showNotification(title, opts); else new Notification(title, opts); }).catch(() => {});
  }
}
export async function enableNotifications() {
  if (!("Notification" in window)) return t("Este navegador no permite notificaciones. En iPhone: agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.");
  const p = await Notification.requestPermission(); S.notif = p === "granted"; save();
  if (S.notif) notify("test:" + Date.now(), t("Notificaciones activas"), t("Así te avisaré durante la carrera."), 1);
  return S.notif ? null : t("No diste permiso de notificaciones.");
}
// ---------- screen wake lock ----------
export async function setWake(onoff) {
  S.wake = onoff; save();
  try { if (onoff && "wakeLock" in navigator) { L.wake = await navigator.wakeLock.request("screen"); } else if (L.wake) { await L.wake.release(); L.wake = null; } } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (S.wake) setWake(true); if (S.live.on) compute(true); } });
// ---------- live on/off ----------
export function startLive() {
  S.live.on = true; if (S.live.idx == null) S.live.idx = 0; save(); startGPS(); if (S.wake) setWake(true);
  clearInterval(L.timer); L.timer = setInterval(() => compute(), S.sim.on && S.sim.speed > 1 ? 4000 : 15000); compute(true);
}
export function stopLive() { S.live.on = false; save(); stopGPS(); clearInterval(L.timer); setWake(false); emit("live"); }
export function resetLive() { S.live = { on: S.live.on, idx: 0, phase: "pre", boardT: null, seen: {}, sent: {}, feed: [], seenR: {} }; L.lastBand = {}; L.frozen = null; L.route = null; save(); compute(true); }
export function statusText() {
  const c = L.calc; if (!c || c.done) return t("Plan de porra terminado.");
  const rs = c.runners.filter(x => x.group !== "follow").map(x => `${x.r.name}: km ${Math.max(0, x.km).toFixed(1)}`).join(" · ");
  const map = L.gps ? ` https://maps.google.com/?q=${L.gps.lat.toFixed(5)},${L.gps.lng.toFixed(5)}` : "";
  return t("Voy a {s}. Llego ~{h}, holgura {v} min.", { s: c.target.name, h: fmt(c.arrive), v: sgn(c.slack) }) + " " + rs + map;
}
