// Live race-day assistant: GPS, ETA to next point, real-time slack, transit progress, alerts & notifications
import { S, save, now, emit, fmt, fmtPace } from "./state.js";
import { HW, LN, ST, CPS } from "./race-chicago.js";
import { place, gpsPlace, options, optSteps, hvm, SPOTS, byId, P } from "./engine.js";
import { planLegs, windowAt, groups, invalidatePlan } from "./plan.js";
import { proj, at, kmAt, overdue, invalidatePace, firstMissingCP } from "./pace.js";
import { mapState } from "./map.js";

export const L = { gps: null, fixes: [], watch: null, err: null, calc: null, wake: null, timer: null, route: null, routeAt: 0, lastBand: {}, waitStart: null };

// ---------- GPS ----------
export function startGPS() {
  if (S.sim.on && S.sim.gps) { onFix(Object.assign({ t: Date.now(), acc: 15, speed: 0, sim: true }, S.sim.gps)); return; }
  if (!("geolocation" in navigator)) { L.err = "Este navegador no tiene GPS."; emit("live"); return; }
  if (L.watch != null) return;
  L.watch = navigator.geolocation.watchPosition(
    p => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, speed: p.coords.speed, t: Date.now() }),
    e => { L.err = e.code === 1 ? "Permiso de ubicación negado. Actívalo en la configuración del navegador." : "No se pudo leer el GPS (" + e.message + ")."; emit("live"); },
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
export const PHASES = { pre: "Aún no sales", walk: "Caminando", wait: "En el andén", ride: "En el metro", arrived: "En el punto" };
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
  save(); notify("seen:" + leg.b.id, "Siguiente punto", curLeg() ? `Vas a ${curLeg().b.name}.` : "Terminaste el plan: ve al reencuentro en Grant Park.", 0); compute(true);
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
  return { step: s, stopsLeft: s.stations.length - 1 - j, alight: ST[s.to][0], line: LN[s.color], color: s.color, rem, byGps };
}

// ---------- main computation ----------
export function compute(force) {
  const t = now(); const legs = planLegs();
  // skip points the main group already passed (you can't make it anymore)
  let guard = 0;
  while (legs[S.live.idx] && S.live.phase !== "arrived" && windowAt(legs[S.live.idx].b).latest < t - 1 && guard++ < 12) {
    const b = legs[S.live.idx].b; notify("missed:" + b.id, "Ya pasaron por " + b.name, "No se alcanzó a llegar. Vamos al siguiente punto.", 2); S.live.idx++; L.route = null; if (S.live.phase === "pre") S.live.phase = "walk"; save();
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
        const gp = gpsPlace(L.gps.lat, L.gps.lng); const opts = options(gp, 0, target); const o = opts[0];
        L.route = { o, steps: optSteps(gp, target, o), fix: L.gps, opts }; L.routeAt = Date.now();
      }
      route = L.route; eta = route.o.rt; mode = "gps";
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
  L.calc = { t, leg, target, W, eta, arrive, slack, leaveBy, delay, band, mode, route, ride, runners, alts };
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
    if (mins <= 3 && mins > -15) notify("leave:" + i, "Sal ya", `Sal ahora hacia ${name}. ${firstInstr(c.route)} Holgura ${sgn(c.slack)} min.`, 2);
    else if (mins <= 12 && mins > 3) notify("leave10:" + i, "Prepárate para salir", `En ${Math.round(mins)} min sales hacia ${name}.`, 1);
  }
  // debounce: a band change must hold for two consecutive readings before we alert
  // a reading must persist ≥25 s (or ≥0.5 race-min in simulation) before alerting
  if (!L.candBand || L.candBand.i !== i || L.candBand.band !== c.band) L.candBand = { i, band: c.band, wall: Date.now(), t: c.t };
  const stable = Date.now() - L.candBand.wall >= 25000 || c.t - L.candBand.t >= 0.5;
  const prev = L.lastBand[i];
  if (c.mode !== "arrived" && prev && prev !== c.band && !stable) return rulesRest(c, i, name, false);
  if (c.mode !== "arrived" && prev && prev !== c.band) {
    if (c.band === "late") notify("band:" + i + ":late:" + Math.floor(c.t / 5), "No llegas a " + name, `Llegarías ${Math.round(-c.slack)} min tarde. ${c.alts.length ? "Mejor: " + c.alts[0].c.name + ` (holgura +${Math.round(c.alts[0].slack)}).` : "Quédate donde estás o ve al reencuentro."}`, 3);
    else if (c.band === "tight") notify("band:" + i + ":tight:" + Math.floor(c.t / 5), "Vas justo", `Holgura +${Math.round(c.slack)} min para ${name}. No te detengas.`, 2);
    else notify("band:" + i + ":ok:" + Math.floor(c.t / 5), "Vas bien", `Holgura +${Math.round(c.slack)} min para ${name}.`, 1);
  }
  L.lastBand[i] = c.band;
  rulesRest(c, i, name, true);
}
function rulesRest(c, i, name, stable) {
  if (c.ride) { const key = "stops:" + i + ":" + c.ride.stopsLeft; if (!S.live.sent[key]) { S.live.sent[key] = 1; toast(`Línea ${c.ride.line}: faltan ${c.ride.stopsLeft} parada${c.ride.stopsLeft === 1 ? "" : "s"}, bajas en ${c.ride.alight}. Holgura ${sgn(c.slack)} min.`, c.band); if (c.ride.stopsLeft === 1) notify("alight:" + i, "Siguiente parada: bájate", `Bájate en ${c.ride.alight}. Holgura ${sgn(c.slack)} min.`, 2); } }
  const late4 = c.delay >= 4 && c.mode !== "arrived" && S.live.phase !== "pre";
  if (!late4) L.delaySince = null; else if (!L.delaySince) L.delaySince = { wall: Date.now(), t: c.t };
  if (late4 && (Date.now() - L.delaySince.wall >= 25000 || c.t - L.delaySince.t >= 0.5)) notify("delay:" + i + ":" + Math.floor(c.delay / 4), "Vas atrasado vs. el plan", `${Math.round(c.delay)} min más tarde de lo planeado. Holgura real ${sgn(c.slack)} min para ${name}.`, c.slack < 5 ? 2 : 1);
  if (S.live.phase === "wait" && L.waitStart != null) { const line = (c.route && c.route.steps.find(s => s.k === "wait")) || null; const hw = line ? HW[line.color] : 10; if (c.t - L.waitStart > hw + 4) notify("slowtrain:" + i, "El tren está tardando", `Llevas ${Math.round(c.t - L.waitStart)} min en el andén. Holgura ${sgn(c.slack)} min.${c.alts.length && c.slack < 3 ? " Alternativa: " + c.alts[0].c.name + "." : ""}`, 2); }
  c.runners.forEach(x => {
    if (x.group === "follow") return;
    const m = x.fast - c.t;
    if (!x.passed && m <= 5 && m > 0 && (S.live.phase === "arrived" || c.slack > -2)) notify("near:" + x.r.id + ":" + c.target.id, `${short(x.r.name)} llega en ~${Math.round(m)} min`, `Prepárate en ${name}. Ventana ${fmt(x.fast)}–${fmt(x.slow)}.`, 2);
    if (x.od) notify("od:" + x.r.id + ":" + x.od.cp.k, `¿${short(x.r.name)} ya pasó el ${x.od.cp.n}?`, `Debía pasar ~${fmt(x.od.exp)}. Revisa la app oficial y márcalo para recalcular.`, 1);
  });
  // auto-advance once the main group has surely passed
  if (S.live.phase === "arrived" && c.t > c.W.depart + 3) { notify("passed:" + c.target.id, "Ya pasaron por " + name, "Pasando al siguiente punto.", 1); markSeenSilently(); }
}
function markSeenSilently() { const leg = curLeg(); if (!leg) return; S.live.seen[leg.b.id] = true; S.live.idx++; S.live.phase = "pre"; S.live.boardT = null; L.frozen = null; L.route = null; save(); }
const sgn = v => (v >= 0 ? "+" : "") + Math.round(v);
const short = n => (n || "").replace(/\s*\(ejemplo\)/, "");
function firstInstr(route) {
  if (!route || !route.steps || !route.steps.length) return "";
  const s = route.steps[0];
  if (s.k === "walk") { const d = s.dirs.find(d => !d.x); const st = route.steps.find(q => q.k === "wait"); return d ? `Camina por ${d.nm} hacia el ${d.dir}${st ? ` a la estación ${ST[st.st][0]} (Línea ${LN[st.color]})` : ""}.` : ""; }
  return "";
}
// ---------- splits ----------
export function recordSplit(r, cpk, time) {
  const leg = curLeg(); const before = leg ? at(proj(r), leg.b.km, "plan") : null;
  r.splits[cpk] = time != null ? time : Math.round(now() * 10) / 10;
  invalidatePace(); invalidatePlan(); save();
  const o = proj(r); const cp = CPS.find(c => c.k === cpk);
  let msg = `${cp.n} a las ${fmt(r.splits[cpk])}.`;
  if (o.recent) msg += ` Último tramo ${fmtPace(o.recent)}/km, promedio ${fmtPace(o.avg)}/km${o.state ? " (" + o.state + ")" : ""}.`;
  if (leg && before != null) { const after = at(o, leg.b.km, "plan"); const d = Math.round(after - before); msg += ` Llega a ${leg.b.name} ~${fmt(after)}${d ? ` (${d > 0 ? "+" : ""}${d} min vs. antes)` : ""}.`; }
  notify("split:" + r.id + ":" + cpk + ":" + r.splits[cpk], `${short(r.name)} pasó ${cp.n}`, msg, 1);
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
  if (!("Notification" in window)) return "Este navegador no permite notificaciones. En iPhone: agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.";
  const p = await Notification.requestPermission(); S.notif = p === "granted"; save();
  if (S.notif) notify("test:" + Date.now(), "Notificaciones activas", "Así te avisaré durante la carrera.", 1);
  return S.notif ? null : "No diste permiso de notificaciones.";
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
export function resetLive() { S.live = { on: S.live.on, idx: 0, phase: "pre", boardT: null, seen: {}, sent: {}, feed: [] }; L.lastBand = {}; L.frozen = null; L.route = null; save(); compute(true); }
export function statusText() {
  const c = L.calc; if (!c || c.done) return "Plan de porra terminado.";
  const rs = c.runners.filter(x => x.group !== "follow").map(x => `${short(x.r.name)}: km ${Math.max(0, x.km).toFixed(1)}`).join(" · ");
  return `Voy a ${c.target.name}. Llego ~${fmt(c.arrive)}, holgura ${sgn(c.slack)} min. ${rs}`;
}
