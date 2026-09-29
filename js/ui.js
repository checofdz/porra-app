// Panels: live, plan, transfers, runners, settings
import { S, save, now, emit, on, fmt, fmtPace, esc, parseHM, setSim, resetAll, newRunner, uid } from "./state.js";
import { RACE, CPS, LC, LN, HW, ST, FACTS, FACTS_EN, CORRALS, corralStart, corralForGoal } from "./race-chicago.js";
import { SPOTS, byId, place, setStart, streetAtKm, sideName, CROSS_MIN, WMPM, MI, P, clearRouteCaches, PACES, paceFor, kmh, removeCustomSpot, addCustomSpot, projectKm } from "./engine.js";
import { proj, at, kmAt, invalidatePace } from "./pace.js";
import { planLegs, invalidatePlan, optimize, groups, bestLeg, legKey, globalMpm } from "./plan.js";
import { mapState, draw, showPts, startPick } from "./map.js";
import { L, startLive, stopLive, resetLive, setPhase, markSeen, goToIdx, recordSplit, clearSplit, enableNotifications, setWake, compute, simFix, statusText, PHASES } from "./live.js";
import { t, t2, lang, setLang } from "./i18n.js";
import { rtAt } from "./engine.js";
import { sharePlan } from "./share.js";
import { openWizard } from "./onboarding.js";

const $ = id => document.getElementById(id);
const sgn = v => (v >= 0 ? "+" : "") + Math.round(v);
const lchip = c => `<span class="lchip" style="background:${LC[c]}">${esc(t(LN[c]))}</span>`;
const crossChip = n => n ? `<span class="chip warn">${esc(t2(n, "{n} cruce del recorrido", "{n} cruces del recorrido"))}</span>` : `<span class="chip ok">${esc(t("Sin cruzar"))}</span>`;
export const PR = { 1: "Principal", 2: "Si se puede", 3: "Solo seguir" };
// slack = real minutes you arrive before the first main runner. >= margin: fine; 0..margin: you make it but tight; < 0: you miss them
function chip(sl) { if (sl == null) return ""; const v = Math.floor(sl); if (v >= +S.buf) return `<span class="chip ok">${esc(t("Llegas {v} min antes", { v }))}</span>`; if (v >= 0) return `<span class="chip warn">${esc(t("Llegas justo · {v} min antes", { v }))}</span>`; return `<span class="chip bad">${esc(t("No llegas · {v} min tarde", { v: -v }))}</span>`; }
function optSummary(o, mpm) { if (o.stay) return t("Te quedas en el mismo lugar"); const wm = Math.round((o.walkM || 0) / (mpm || WMPM)); if (o.walk) return t("Todo a pie · {m} min", { m: wm }); return t("{l} · {m} min a pie", { l: o.label, m: wm }); }
const paceSeg = (cur, attr) => `<div class="seg pseg" role="group">${Object.entries(PACES).map(([k, p]) => `<button ${attr}="${k}" aria-pressed="${cur === k}">${esc(t(p.n))}<small>${kmh(p.mpm)} km/h</small></button>`).join("")}</div>`;
function needHTML(l, i) {
  if (!l.need || l.slack == null || l.slack >= +S.buf) return "";
  const late = l.slack < 0; const n = late ? l.need : l.needBuf; if (!n) return "";
  const mode = paceFor(n.mpm);
  if (!isFinite(n.mpm) || !mode) return late ? `<div class="need bad">${esc(t("Ni corriendo llegas a tiempo a este punto."))}</div>` : "";
  if (!late && mode === paceFor(l.mpm)) return "";
  const msg = late ? t("Para llegar necesitas moverte a <b>{v} km/h</b> ({m}) en los tramos a pie.", { v: kmh(n.mpm), m: esc(t(PACES[mode].n).toLowerCase()) })
                   : t("Sí llegas. Si quieres {b} min de margen, muévete a <b>{v} km/h</b> ({m}).", { b: S.buf, v: kmh(n.mpm), m: esc(t(PACES[mode].n).toLowerCase()) });
  return `<div class="need${late ? "" : " soft"}"><span>${msg}</span><button class="btn sm" data-needpace="${i}:${mode}:${esc(n.o.key)}">${esc(t("Ir {m} en este tramo", { m: t(PACES[mode].n).toLowerCase() }))}</button></div>`;
}
function bindNeed(root) { root.querySelectorAll("[data-needpace]").forEach(b => b.onclick = () => { const [i, mode, ok] = b.dataset.needpace.split(":"); const l = planLegs()[+i]; const k = legKey(l.a, l.b); S.legPace[k] = mode; S.choice[k] = ok; save(); renderAll(); }); }
// preview of adding a spot into the current plan
function insertPreview(c) {
  const legs = planLegs(); const ids = S.plan || [];
  if (ids.includes(c.id)) return { inPlan: true };
  let prev = place("start"), next = null;
  for (const id of ids) { const x = byId[id]; if (!x) continue; if (x.km < c.km - 0.01) prev = x; else if (x.km > c.km + 0.01) { next = x; break; } }
  const lin = bestLeg(prev, c); const lout = next ? bestLeg(c, next) : null;
  const sl = Math.min(lin.slack == null ? 60 : lin.slack, lout ? lout.slack : 60);
  if (sl >= 0) return { ok: true, slack: sl };
  const needs = [lin.slack != null && lin.slack < 0 ? lin.need : null, lout && lout.slack < 0 ? lout.need : null].filter(Boolean);
  const mp = Math.max(...needs.map(n => n.mpm)); const mode = isFinite(mp) ? paceFor(mp) : null;
  return mode ? { need: mode, mpm: mp } : { no: true };
}
export function corralOptions(sel) { return Object.entries(CORRALS).map(([k, c]) => `<option value="${k}"${k === sel ? " selected" : ""}>${k === "HP" ? "High Performance" : t("Corral {c}", { c: k })} · ${c.wave === "hp" ? "7:32" : t("Ola {w}", { w: c.wave })} · ${esc(c.range)}</option>`).join(""); }

// ---------- tabs ----------
const TABS = ["live", "plan", "tr", "run", "set"];
export function openTab(x) { TABS.forEach(o => { $("tab-" + o).setAttribute("aria-selected", o === x); $("pane-" + o).hidden = o !== x; }); S.tab = x; save(); $("app").classList.toggle("livemode", x === "live"); $("scrubbox").hidden = x === "live" && S.live.on; if (x === "live") renderLive(); }
TABS.forEach(x => $("tab-" + x).onclick = () => openTab(x));

export function invalidateAll() { invalidatePace(); invalidatePlan(); }
export function renderAll(keepHL) {
  invalidateAll(); if (!keepHL) clearHL();
  renderHeader(); renderPlan(); renderTransfers(); renderRunners(); renderSettings(); renderScrub();
  if (S.live.on) compute(true); else renderLive();
  draw();
}
function clearHL() { mapState.HL = null; $("hlbar").hidden = true; }
function showSteps(getSteps, label, extraPts, keepScroll) {
  mapState.HL = getSteps; $("hlbar").hidden = false; $("hltext").textContent = label;
  const pts = (extraPts || []).slice(); getSteps().forEach(s => (s.pts || []).forEach(p => pts.push(p))); showPts(pts);
  if (window.innerWidth <= 900 && !keepScroll) $("mapwrap").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("hlclear").onclick = () => { clearHL(); draw(); renderTransfers(); };
export function toggleSpot(id) { const i = S.plan.indexOf(id); if (i >= 0) S.plan.splice(i, 1); else S.plan.push(id); S.plan.sort((a, b) => byId[a].km - byId[b].km); save(); renderAll(); }

// ---------- header / clock ----------
export function renderHeader() { const st = place("start"); $("startLabel").textContent = t("Sales de: {s}", { s: st.name }); $("langBtn").textContent = lang() === "en" ? "ES" : "EN"; }
$("langBtn").onclick = () => setLang(lang() === "en" ? "es" : "en");
export function tickClock() { $("clock").innerHTML = `${S.sim.on ? `<span class="sim">${esc(t("Simulación"))} ×${S.sim.speed}</span>` : ""}${fmt(Math.floor(now()))}`; }

function runnerTimes(spot, list) {
  return list.map(r => { const o = proj(r); const f = at(o, spot.km, "fast"), s = at(o, spot.km, "slow");
    return `<span title="${esc(r.name)}"><span class="dot" style="background:${r.color}"></span>${esc(r.name)} ${fmt(f)}${fmt(s) !== fmt(f) ? "–" + fmt(s) : ""}</span>`; }).join("");
}
function emptyState(where) {
  return `<div class="summary"><div><b>${esc(t("Aún no tienes corredores"))}</b><div class="small">${esc(t("Agrega a quién vas a animar y armamos tu plan en un minuto."))}</div></div></div><div class="btnrow"><button class="btn primary" data-wiz="${where}">${esc(t("Configurar mi porra"))}</button></div>`;
}
function bindWiz(root) { root.querySelectorAll("[data-wiz]").forEach(b => b.onclick = () => openWizard()); }

// ---------- PLAN ----------
function alternatives(i) {
  const legs = planLegs(); const l = legs[i]; if (!l) return []; const prev = l.a; const nxt = legs[i + 1] ? legs[i + 1].b : null; const out = [];
  for (const c of SPOTS) { if (c.id === l.b.id || S.plan.includes(c.id)) continue; if (prev.km != null && c.km <= prev.km + 0.05) continue; if (nxt && c.km >= nxt.km - 0.05) continue;
    const s1 = prev.km == null ? 60 : bestLeg(prev, c).slack; if (s1 < 0) continue; const s2 = nxt ? bestLeg(c, nxt).slack : 60; if (s2 < 0) continue; out.push({ c, v: Math.min(s1, s2) }); }
  return out.sort((a, b) => b.v - a.v).slice(0, 3);
}
function altHTML(i) {
  const l = planLegs()[i]; if (!(l.slack != null && l.slack < 0)) return "";
  const betterOpt = l.opts.find(o => (l.earliest - (l.depart + rtAt(o, l.mpm))) >= 0 && o.key !== l.o.key);
  const alts = alternatives(i); let h = `<div class="warnbox" style="margin:0"><b>${esc(t("Cómo arreglarlo:"))}</b> `;
  if (betterOpt) h += esc(t("elige “{o}” en Traslados (sí llegas).", { o: betterOpt.walk ? t("Todo a pie") : betterOpt.label })) + " ";
  if (alts.length) h += esc(t("o cambia {s} por un punto donde sí llegas:", { s: l.b.name })) + `<div class="btnrow" style="margin-top:6px">${alts.map(a => `<button class="btn sm" data-swap="${i}:${a.c.id}">${esc(a.c.name)} · +${Math.round(a.v)} min</button>`).join("")}</div>`;
  else if (!betterOpt) h += esc(t("quita {s} del plan o baja el margen. Ningún otro punto entre el anterior y el siguiente te da tiempo con estos ritmos.", { s: l.b.name }));
  return h + `</div>`;
}
function bindSwap(root) { root.querySelectorAll("[data-swap]").forEach(b => b.onclick = () => { const [i, c] = b.dataset.swap.split(":"); S.plan[+i] = c; S.plan.sort((x, y) => byId[x].km - byId[y].km); save(); renderAll(); }); }
export function renderPlan() {
  if (!S.runners.length) { $("pane-plan").innerHTML = emptyState("plan"); bindWiz($("pane-plan")); return; }
  const from = place("start"); const legs = planLegs(); const G = groups();
  let minSl = Infinity, bad = 0, cross = 0; legs.forEach(l => { cross += l.o.cx || 0; if (l.slack != null) { minSl = Math.min(minSl, l.slack); if (l.slack < 0) bad++; } });
  const bonusSeen = legs.reduce((a, l) => a + l.bonus.filter(b => b.st === "si").length, 0);
  const sub = legs.length ? (bad ? t2(bad, "{n} traslado no alcanza.", "{n} traslados no alcanzan.") : t("En el traslado más justo llegas {v} antes", { v: isFinite(minSl) ? Math.floor(minSl) + " min" : "—" }) + " · " + (cross ? t2(cross, "{n} cruce", "{n} cruces") : t("sin cruzar el recorrido"))) + (G.bonus.length ? " · " + t2(bonusSeen, "{n} vista extra de “si se puede”", "{n} vistas extra de “si se puede”") : "") : t("Agrega puntos desde el mapa o usa Sugerir ruta.");
  let h = `<div class="summary"><span class="big">${legs.length}</span><div><b>${esc(t2(legs.length, "punto para ver a {w}", "puntos para ver a {w}", { w: G.main.map(r => r.name).join(" · ") }))}</b><div class="small">${esc(sub)}</div></div></div>
  <div class="btnrow"><button class="btn primary" id="opt">${esc(t("Sugerir ruta"))}</button><button class="btn" id="share1">${esc(t("Compartir con mi porra"))}</button><button class="btn" id="goTr">${esc(t("Ver traslados"))}</button><button class="btn" id="clr">${esc(t("Vaciar plan"))}</button></div>
  <div class="pacebox"><span class="small">${esc(t("Me muevo a pie:"))}</span>${paceSeg(S.pace || "walk", "data-gpace")}</div>
  <p class="note">${t("La ruta se arma para ver a los corredores <b>principales</b> en cada punto (hasta {n} puntos). Los de <b>“si se puede”</b> suman cuando pasan mientras estás ahí; los de <b>“solo seguir”</b> solo aparecen en el mapa y en vivo.", { n: S.maxs })}</p><div>`;
  h += `<div class="stop"><div class="num home">★</div><div class="body"><div class="ttl"><b>${esc(from.name)}</b><button class="linkbtn" id="chStart">${esc(t("Cambiar"))}</button></div><div class="small">${esc(from.address || t("Punto de salida"))}</div></div></div>`;
  legs.forEach((l, i) => { const s = l.b;
    h += `<div class="stop"><div class="rail"></div><div class="leg"><div class="row"><b>→ ${Math.round(l.rt)} min · ${esc(optSummary(l.o, l.mpm))}</b>${l.first ? `<span class="chip ok">${esc(t("Sal a las {h}", { h: fmt(l.depart) }))}</span>` : chip(l.slack)}</div>${l.first ? "" : `<div class="small">${esc(t("Te vas {a} · llegas {b} · primero pasa {c}", { a: fmt(l.depart), b: fmt(l.arrive), c: fmt(l.earliest) }))}</div>`}<div class="row">${l.o.stay ? "" : crossChip(l.o.cx)}<button class="linkbtn" data-leg="${i}">${esc(l.opts.length > 1 ? t("Ver {n} opciones →", { n: l.opts.length }) : t("Ver traslado →"))}</button></div>${l.mpm !== globalMpm() ? `<div class="small">${esc(t("En este tramo: {m}", { m: t(PACES[paceFor(l.mpm)].n).toLowerCase() }))} · <button class="linkbtn" data-resetpace="${i}">${esc(t("volver a mi ritmo"))}</button></div>` : ""}${needHTML(l, i)}${altHTML(i)}</div></div>`;
    const bon = l.bonus.map(b => `<span class="chip ${b.st === "si" ? "ok" : b.st === "quizas" ? "warn" : ""}" style="${b.st === "no" ? "background:var(--chip);color:var(--muted)" : ""}"><span class="dot" style="background:${b.r.color}"></span>${esc(b.r.name)}: ${esc(b.st === "si" ? t("lo ves") : b.st === "quizas" ? t("quizás (+{m} min)", { m: b.wait }) : t("no coincide"))}</span>`).join(" ");
    h += `<div class="stop"><div class="num">${i + 1}</div><div class="body"><div class="ttl"><div><b>${esc(s.name)}</b><div class="mile">${esc(t("Milla"))} ${s.mile.toFixed(1)} · km ${s.km.toFixed(1)} · ${esc(streetAtKm(s.km))}</div></div><button class="x" data-rm="${s.id}" aria-label="${esc(t("Quitar"))} ${esc(s.name)}">×</button></div><div class="times">${runnerTimes(s, G.main)}</div>${bon ? `<div class="btnrow" style="gap:4px">${bon}</div>` : ""}<div class="small">${t("Párate en la banqueta <b>{d}</b> de {s}.", { d: t(sideName(s, l.arrSide)), s: esc(streetAtKm(s.km)) })}</div><div class="tip">${esc(s.tip)}</div></div></div>`; });
  h += `<div class="stop"><div class="rail"></div><div class="leg"><div><b>${esc(t("Reencuentro:"))}</b> ${esc(t("camina por Roosevelt/Michigan a Grant Park (abre 9:30). Pónganse de acuerdo en un punto antes de la carrera."))}</div></div></div></div>`;
  h += `<details class="box" id="allspots"${S.openSpots ? " open" : ""}><summary>${esc(t("Agregar o quitar puntos ({n})", { n: SPOTS.length }))}</summary><p class="note" style="margin:8px 0 0">${esc(t("Cada punto dice si cabe en tu plan con tu ritmo actual. También puedes tocar la ruta en el mapa para crear tu propio punto."))}</p><div class="spotlist" style="margin-top:10px">${SPOTS.map(s => { const sel = S.plan.includes(s.id); const pv = insertPreview(s);
      const badge = pv.inPlan ? `<span class="chip ok">${esc(t("En tu plan"))}</span>` : pv.ok ? `<span class="chip ok">${esc(t("Cabe · +{v} min", { v: Math.round(pv.slack) }))}</span>` : pv.need ? `<span class="chip warn">${esc(t("Cabe si vas {m} ({v} km/h)", { m: t(PACES[pv.need].n).toLowerCase(), v: kmh(pv.mpm) }))}</span>` : `<span class="chip bad">${esc(t("No cabe"))}</span>`;
      return `<div class="spot${sel ? " sel" : ""}"><div class="top"><div><b>${esc(s.name)}</b><div class="mile">${esc(t("Milla"))} ${s.mile.toFixed(1)} · ${esc(streetAtKm(s.km))}</div></div><button class="btn sm" data-tg="${s.id}">${esc(sel ? t("Quitar") : t("Agregar"))}</button></div><div class="btnrow" style="gap:6px;align-items:center">${badge}${s.custom ? `<button class="linkbtn" data-delc="${s.id}">${esc(t("Borrar punto propio"))}</button>` : ""}</div><div class="times">${runnerTimes(s, G.main)}</div><div class="tip">${esc(s.tip)}</div></div>`; }).join("")}</div></details>`;
  $("pane-plan").innerHTML = h;
  $("opt").onclick = () => { S.plan = optimize(); S.choice = {}; save(); renderAll(); };
  $("clr").onclick = () => { S.plan = []; save(); renderAll(); };
  $("goTr").onclick = () => openTab("tr");
  $("share1").onclick = () => sharePlan();
  $("chStart").onclick = () => openTab("set");
  $("allspots").ontoggle = e => { S.openSpots = e.target.open; save(); };
  $("pane-plan").querySelectorAll("[data-gpace]").forEach(b => b.onclick = () => { S.pace = b.dataset.gpace; save(); renderAll(); });
  $("pane-plan").querySelectorAll("[data-resetpace]").forEach(b => b.onclick = () => { const l = planLegs()[+b.dataset.resetpace]; delete S.legPace[legKey(l.a, l.b)]; save(); renderAll(); });
  $("pane-plan").querySelectorAll("[data-delc]").forEach(b => b.onclick = () => { const id = b.dataset.delc; S.custom = S.custom.filter(c => c.id !== id); S.plan = S.plan.filter(x => x !== id); removeCustomSpot(id); save(); renderAll(); });
  bindNeed($("pane-plan"));
  bindSwap($("pane-plan"));
  $("pane-plan").querySelectorAll("[data-rm],[data-tg]").forEach(b => b.onclick = () => toggleSpot(b.dataset.rm || b.dataset.tg));
  $("pane-plan").querySelectorAll("[data-leg]").forEach(b => b.onclick = () => { openTab("tr"); showLeg(+b.dataset.leg); });
}
// ---------- TRANSFERS ----------
function dirHTML(d) { if (d.x) return `<li class="x">${t("Cruza <b>{s}</b> (recorrido, milla {m}) por el cruce con policía", { s: esc(d.st), m: (d.km / MI).toFixed(1) })}</li>`; return `<li>${t("Por <b>{n}</b> hacia el {d}", { n: esc(d.nm), d: esc(t(d.dir)) })} · ${Math.round(d.m / 10) * 10} m</li>`; }
export function stepsHTML(steps, t0, fromTxt, toTxt, endT) {
  let tt = t0; const rows = []; const clk = v => (v == null ? "" : fmt(v));
  if (fromTxt) rows.push(`<li><div class="clk">${clk(tt)}</div><div class="ic"><i></i></div><div class="tx">${fromTxt}</div></li>`);
  steps.forEach(s => {
    if (s.k === "stay") { rows.push(`<li><div class="clk">${clk(tt)}</div><div class="ic"><i></i></div><div class="tx"><b>${esc(t("Te quedas en el mismo lugar"))}</b><span class="s">${esc(t("Regresan por el otro carril de Michigan."))}</span></div></li>`); return; }
    if (s.k === "walk") { rows.push(`<li class="walk"><div class="clk">${clk(tt)}</div><div class="ic"><i style="border-color:var(--muted)"></i></div><div class="tx"><b>${esc(t("Camina {m} min a {s}", { m: Math.round(s.min), s: s.to }))}</b><span class="s">${(s.m / 1000).toFixed(2)} km${s.x.length ? " · " + esc(t("incluye {m} min de cruce", { m: s.x.length * CROSS_MIN })) : ""}</span><ul class="dirs">${s.dirs.map(dirHTML).join("")}</ul></div></li>`); if (tt != null) tt += s.min; return; }
    if (s.k === "xfer") { rows.push(`<li class="walk"><div class="clk">${clk(tt)}</div><div class="ic"><i style="border-color:var(--muted)"></i></div><div class="tx"><b>${esc(t("Trasbordo a pie: {a} → {b}", { a: s.from, b: s.to }))}</b><span class="s">${esc(t("{m} min por pasillo o calle", { m: Math.round(s.min) }))}</span></div></li>`); if (tt != null) tt += s.min; return; }
    if (s.k === "wait") { rows.push(`<li style="--seg:${LC[s.color]}"><div class="clk">${clk(tt)}</div><div class="ic"><i style="border-color:${LC[s.color]}"></i></div><div class="tx"><b>${lchip(s.color)}${esc(t("En {s}, andén {d}", { s: ST[s.st][0], d: t(s.dir) }))}</b><span class="s">${esc(t("Espera promedio ~{m} min (pasa cada ~{h} min en domingo).", { m: Math.round(s.min), h: HW[s.color] }))}</span></div></li>`); if (tt != null) tt += s.min; return; }
    if (s.k === "ride") { rows.push(`<li style="--seg:${LC[s.color]}"><div class="clk">${clk(tt)}</div><div class="ic"><i style="border-color:${LC[s.color]};background:${LC[s.color]}"></i></div><div class="tx"><b>${esc(t2(s.stops, "Viaja {n} parada en Línea {l}", "Viaja {n} paradas en Línea {l}", { l: t(LN[s.color]) }))}</b><span class="s">${t("{a} → baja en <b>{b}</b> · ~{m} min", { a: esc(ST[s.from][0]), b: esc(ST[s.to][0]), m: Math.round(s.min) })}</span></div></li>`); if (tt != null) tt += s.min; return; }
  });
  if (toTxt) rows.push(`<li><div class="clk">${clk(endT != null ? endT : tt)}</div><div class="ic"><i style="border-color:var(--accent);background:var(--accent)"></i></div><div class="tx">${toTxt}</div></li>`);
  return `<ol class="steps">${rows.join("")}</ol>`;
}
export function renderTransfers() {
  if (!S.runners.length) { $("pane-tr").innerHTML = emptyState("tr"); bindWiz($("pane-tr")); return; }
  const legs = planLegs();
  let h = `<h2>${esc(t("Traslados del plan"))}</h2>
  <label class="chk" for="avoid"><input type="checkbox" id="avoid"${S.avoid ? " checked" : ""}> ${esc(t("Evitar cruzar el recorrido a pie (recomendado)"))}</label>
  <p class="note">${esc(t("Las caminatas siguen las calles reales y el recorrido cuenta como barrera: cada cruce suma {m} min. El metro pasa por arriba o por abajo. Elige la opción que prefieras en cada traslado y el plan se recalcula.", { m: CROSS_MIN }))}</p>`;
  if (!legs.length) { $("pane-tr").innerHTML = h + `<p class="note">${esc(t("Aún no tienes puntos en tu plan."))}</p>`; $("avoid").onchange = onAvoid; return; }
  h += `<div class="btnrow"><button class="btn primary" id="allmap">${esc(t("Ver todos en el mapa"))}</button></div>`;
  legs.forEach((l, i) => { const key = l.a.id + ">" + l.b.id; const fastest = Math.min(...l.opts.map(o => rtAt(o, l.mpm)));
    h += `<div class="tcard" id="leg${i}"><div class="thead"><div class="pair">${l.first ? `<span class="num home">★</span>` : `<span class="num">${i}</span>`}→<span class="num">${i + 1}</span></div><div class="grow"><b>${esc(l.a.name)} → ${esc(l.b.name)}</b><div class="small">${esc(optSummary(l.o, l.mpm))}</div></div>${l.first ? `<span class="chip ok">${esc(t("Sal a las {h}", { h: fmt(l.depart) }))}</span>` : chip(l.slack)}</div>`;
    if (l.opts.length > 1) h += `<fieldset class="opts"><legend class="small">${esc(t("Opciones ({n})", { n: l.opts.length }))}</legend>` + l.opts.map((o, j) => { const sel = o.key === l.o.key; const tags = []; if (Math.abs(rtAt(o, l.mpm) - fastest) < 0.5) tags.push(`<span class="chip ok">${esc(t("Más rápida"))}</span>`); if (j === 0 && !tags.length) tags.push(`<span class="chip ok">${esc(t("Recomendada"))}</span>`);
        const slack = l.first ? null : l.earliest - (l.depart + rtAt(o, l.mpm));
        return `<label class="opt${sel ? " sel" : ""}" for="o${i}_${j}"><input type="radio" id="o${i}_${j}" name="leg${i}" value="${esc(o.key)}" data-key="${esc(key)}"${sel ? " checked" : ""}><div class="ob"><div class="orow"><b>${esc(o.walk ? t("Todo a pie") : o.label)}</b><span class="omin">${Math.round(rtAt(o, l.mpm))} min</span></div><div class="orow small"><span>${o.walk ? `${((o.walkM || 0) / 1000).toFixed(1)} km` : esc(o.sub) + " · " + esc(t("{m} min a pie", { m: Math.round((o.walkM || 0) / l.mpm) }))}</span><span class="ochips">${crossChip(o.cx)}${tags.join("")}${slack != null && slack < 0 ? `<span class="chip bad">${esc(t("No llegas"))}</span>` : ""}</span></div></div></label>`; }).join("") + `</fieldset>`;
    h += `<div class="legpace"><span class="small">${esc(t("En este tramo me muevo:"))}</span>${paceSeg(paceFor(l.mpm) || "walk", `data-lp="${i}" data-lpk`)}</div>${needHTML(l, i)}`;
    h += `<div class="tsum"><div><span>${esc(t("Sales"))}</span><b>${fmt(l.depart)}</b></div><div><span>${esc(t("Llegas"))}</span><b>${fmt(l.arrive)}</b></div><div><span>${esc(t("Pasa el 1º"))}</span><b>${fmt(l.earliest)}</b></div></div>`;
    h += stepsHTML(l.steps, l.depart, `<b>${esc(t("Sales de {s}", { s: l.a.name }))}</b><span class="s">${esc(l.first ? t("Hora sugerida para llegar con {m} min de margen.", { m: S.buf }) : t("Desde la banqueta {d}, después de verlos pasar (+{m} min).", { d: t(sideName(l.a, l.aSide)), m: S.linger }))}</span>`, `<b>${esc(t("Llegas a {s}", { s: l.b.name }))}</b><span class="s">${esc(t("Banqueta {d} de {s}. El primero pasa a las {h}.", { d: t(sideName(l.b, l.o.side)), s: streetAtKm(l.b.km), h: fmt(l.earliest) }))}</span>`, l.arrive);
    h += altHTML(i).replace('style="margin:0"', "") + `<div class="tfoot"><button class="btn sm" data-show="${i}">${esc(t("Ver en el mapa"))}</button></div></div>`; });
  $("pane-tr").innerHTML = h;
  $("avoid").onchange = onAvoid; bindSwap($("pane-tr")); bindNeed($("pane-tr"));
  $("pane-tr").querySelectorAll("[data-lpk]").forEach(b => b.onclick = () => { const i = +b.dataset.lp; const l = planLegs()[i]; S.legPace[legKey(l.a, l.b)] = b.dataset.lpk; save(); renderAll(true); showLeg(i, true); });
  $("allmap").onclick = () => showSteps(() => planLegs().flatMap(l => l.steps), t("Todos los traslados del plan"));
  $("pane-tr").querySelectorAll("[data-show]").forEach(b => b.onclick = () => showLeg(+b.dataset.show));
  $("pane-tr").querySelectorAll("input[type=radio]").forEach(r => r.onchange = () => { S.choice[r.dataset.key] = r.value; save(); const i = +r.name.slice(3); renderAll(true); showLeg(i, true); });
}
function onAvoid() { S.avoid = $("avoid").checked; clearRouteCaches(); save(); renderAll(); }
function showLeg(i, keep) { const l = planLegs()[i]; if (!l) return; showSteps(() => (planLegs()[i] || { steps: [] }).steps, `${l.first ? "★" : i} → ${i + 1}: ${l.a.name} → ${l.b.name} · ${Math.round(l.rt)} min`, [P(l.a.lat, l.a.lng), P(l.b.lat, l.b.lng)], keep); }

// ---------- RUNNERS ----------
const hhmm = v => { const x = Math.round(v); return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
export function renderRunners() {
  let h = `<h2>${esc(t("Corredores"))}</h2><p class="note">${t("Agrega a todos los que quieras. La <b>prioridad</b> decide el plan: a los <b>principales</b> los ves en cada punto; los de <b>si se puede</b> se suman cuando coinciden; los de <b>solo seguir</b> aparecen en el mapa y en vivo.")}</p>`;
  S.runners.forEach(r => { const o = proj(r); const fin = at(o, 42.195, "plan");
    h += `<div class="runner" data-r="${r.id}"><div class="hd"><div class="who"><input type="color" class="color" value="${esc(r.color)}" data-f="color" aria-label="${esc(t("Color"))}"><b>${esc(r.name) || esc(t("Corredor"))}</b>${r.bib ? `<span class="small">#${esc(r.bib)}</span>` : ""}</div>
      <div class="seg" role="group" aria-label="${esc(t("Prioridad"))}">${[1, 2, 3].map(p => `<button data-prio="${p}" aria-pressed="${r.prio === p}">${esc(t(PR[p]))}</button>`).join("")}</div></div>
      <div class="grid2"><label>${esc(t("Nombre"))}<input type="text" data-f="name" value="${esc(r.name)}"></label><label>${esc(t("Número de corredor (bib)"))}<input type="text" inputmode="numeric" data-f="bib" value="${esc(r.bib)}"></label>
      <label>${esc(t("Corral (viene en su número)"))}<select data-f="corral">${corralOptions(r.corral)}</select></label>
      <label>${esc(t("Tiempo objetivo (h:mm)"))}<input type="text" inputmode="numeric" data-f="goal" value="${esc(r.goal)}"></label></div>
      <div class="small">${esc(t("Cruza la salida ~{a} (estimado por corral) · meta ~{b}", { a: fmt(o.start), b: fmt(fin) }))}${r.splits["0"] != null ? " · " + esc(t("salida real registrada")) : ""}</div>
      <div class="stat"><div><span>${esc(t("Promedio"))}</span><b>${fmtPace(o.avg ?? o.goalP)}/km</b></div><div><span>${esc(t("Último tramo"))}</span><b>${o.recent ? fmtPace(o.recent) + "/km" : "—"}</b></div><div><span>${esc(t("Proyección usa"))}</span><b>${fmtPace(o.planP)}/km</b></div></div>
      <div class="small">${o.basis === "splits" ? t2(o.pts.length - 1, "Con {n} split", "Con {n} splits") + (o.state ? " · <b>" + esc(t(o.state)) + "</b>" : "") + ". " + esc(t("El último tramo pesa 65% y el promedio 35%; la ventana va de {a} a {b}/km.", { a: fmtPace(o.fastP), b: fmtPace(o.slowP) })) : esc(t("Sin splits todavía: se usa el tiempo objetivo (±{p}%).", { p: S.paceMargin }))}</div>
      <details class="box"${Object.keys(r.splits).length ? " open" : ""}><summary>${esc(t("Splits (tapetes oficiales)"))}</summary><div class="cps" style="margin-top:8px">${CPS.map(cp => { const v = r.splits[cp.k]; const exp = cp.km === 0 ? o.start : at(o, cp.km, "plan");
        return `<div class="cp${v != null ? " done" : ""}"><b>${esc(t(cp.n))}</b><span class="exp">${v != null ? "" : "~" + fmt(exp)}</span><div class="v"><input type="time" step="60" data-cp="${cp.k}" value="${v != null ? hhmm(v) : ""}" aria-label="${esc(t(cp.n))} · ${esc(r.name)}">${v != null ? `<button class="btn xs" data-clr="${cp.k}" aria-label="${esc(t("Borrar"))}">×</button>` : `<button class="btn xs" data-now="${cp.k}">${esc(t("Ahora"))}</button>`}</div></div>`; }).join("")}</div></details>
      <div class="btnrow"><a class="btn sm" href="${RACE.officialApp.web}" target="_blank" rel="noopener">${esc(t("Resultados oficiales"))}</a><button class="btn sm danger" data-del="1">${esc(t("Quitar corredor"))}</button></div></div>`; });
  h += `<div class="btnrow"><button class="btn primary" id="addRunner">${esc(t("+ Agregar corredor"))}</button><button class="btn" id="wizAgain">${esc(t("Configuración guiada"))}</button></div>`;
  $("pane-run").innerHTML = h;
  $("addRunner").onclick = () => { S.runners.push(newRunner(S.runners.length, { name: t("Corredor {n}", { n: S.runners.length + 1 }) })); save(); renderAll(); };
  $("wizAgain").onclick = () => openWizard();
  $("pane-run").querySelectorAll(".runner").forEach(card => { const r = S.runners.find(x => x.id === card.dataset.r);
    card.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("change", () => { r[inp.dataset.f] = inp.value; save(); renderAll(); }));
    card.querySelectorAll("[data-prio]").forEach(b => b.onclick = () => { r.prio = +b.dataset.prio; save(); renderAll(); });
    card.querySelectorAll("[data-cp]").forEach(inp => inp.addEventListener("change", () => { const v = parseHM(inp.value); if (v != null) recordSplit(r, inp.dataset.cp, v); else clearSplit(r, inp.dataset.cp); renderAll(true); }));
    card.querySelectorAll("[data-now]").forEach(b => b.onclick = () => { recordSplit(r, b.dataset.now); renderAll(true); });
    card.querySelectorAll("[data-clr]").forEach(b => b.onclick = () => { clearSplit(r, b.dataset.clr); renderAll(true); });
    card.querySelector("[data-del]").onclick = () => { S.runners = S.runners.filter(x => x !== r); if (!S.runners.length) S.plan = []; save(); renderAll(); }; });
}

// ---------- LIVE ----------
export function renderLive() {
  const pane = $("pane-live");
  if (!S.runners.length) { pane.innerHTML = emptyState("live"); bindWiz(pane); return; }
  if (!S.live.on) {
    pane.innerHTML = `<h2>${esc(t("Modo en vivo"))}</h2><p class="note">${esc(t("El día de la carrera: usa tu GPS para calcular cuánto te falta al siguiente punto, compara contra la hora en que pasan tus corredores y te avisa si vas bien, justo o tarde. Si vas en el metro te dice cuántas paradas faltan."))}</p>
    <ul class="facts"><li>${esc(t("Mantén la app abierta con la pantalla encendida (actívalo abajo). En iPhone, agrégala a la pantalla de inicio para recibir notificaciones."))}</li><li>${t("Cuando la app oficial te avise que tu corredor pasó un tapete (5K, 10K…), toca <b>Pasó</b> aquí: el ritmo y las horas se recalculan.")}</li><li>${t("Cuando tu corredor esté a 3 minutos suena una <b>alarma</b> con cuenta regresiva.")}</li><li>${t("Para probar antes del 11 de octubre, activa la <b>simulación</b> en Ajustes.")}</li></ul>
    <div class="btnrow"><button class="btn primary" id="liveStart">${esc(t("Iniciar modo en vivo"))}</button><button class="btn" id="liveNotif">${esc(S.notif ? t("Notificaciones activas") : t("Activar notificaciones"))}</button><button class="btn" id="liveWake">${esc(S.wake ? t("Pantalla: siempre encendida") : t("Mantener pantalla encendida"))}</button></div>`;
    $("liveStart").onclick = () => { startLive(); openTab("live"); };
    $("liveNotif").onclick = async () => { const e = await enableNotifications(); if (e) emit("toast", { msg: e, level: "tight" }); renderLive(); };
    $("liveWake").onclick = () => { setWake(!S.wake); renderLive(); };
    return;
  }
  const c = L.calc; if (!c) { pane.innerHTML = `<p class="note">${esc(t("Calculando…"))}</p>`; return; }
  if (c.done) { pane.innerHTML = `<h2>${esc(t("¡Plan terminado!"))}</h2><p class="note">${esc(t("Ve al reencuentro en Grant Park. La fiesta post-carrera abre a las 9:30."))}</p><div class="btnrow"><button class="btn" id="liveReset">${esc(t("Reiniciar recorrido"))}</button><button class="btn" id="liveStop">${esc(t("Salir del modo en vivo"))}</button></div>`; $("liveReset").onclick = () => resetLive(); $("liveStop").onclick = () => stopLive(); return; }
  const legs = planLegs(); const i = S.live.idx; const T = c.target;
  const gps = L.gps ? `<span class="dotlive"></span>GPS ±${Math.round(L.gps.acc || 0)} m${L.gps.speed != null ? ` · ${Math.round((L.gps.speed || 0) * 3.6)} km/h` : ""}${L.gps.sim ? " (" + esc(t("simulado")) + ")" : ""}` : (L.err ? `<span style="color:var(--bad)">${esc(L.err)}</span>` : esc(t("Buscando GPS…")));
  let instr = "";
  if (c.mode === "arrived") instr = t("Estás en el punto. Párate en la banqueta <b>{d}</b>.", { d: t(sideName(T, legs[i].arrSide)) }) + " " + c.runners.filter(x => x.group !== "follow" && !x.passed).map(x => `${esc(x.r.name)} ~${fmt(x.fast)}`).join(" · ");
  else if (c.ride) instr = `${lchip(c.ride.color)} <b>${esc(t2(c.ride.stopsLeft, "Falta {n} parada", "Faltan {n} paradas"))}</b> · ${t("bajas en <b>{s}</b>", { s: esc(c.ride.alight) })}${c.ride.byGps ? "" : " (" + esc(t("estimado por tiempo")) + ")"}`;
  else if (c.route && c.route.steps.length) { const s = c.route.steps[0]; const w = c.route.steps.find(q => q.k === "wait");
    if (s.k === "walk") { const d = s.dirs.filter(x => !x.x).slice(0, 2).map(d => t("por <b>{n}</b> al {d} ({m} m)", { n: esc(d.nm), d: esc(t(d.dir)), m: Math.round(d.m / 10) * 10 })).join(t(", luego ")); instr = t("Camina") + " " + d + (w ? " " + t("hasta <b>{s}</b>", { s: esc(ST[w.st][0]) }) + " → " + lchip(w.color) + " " + esc(t(w.dir)) : " " + t("hasta {s}", { s: esc(T.name) })) + "." + (s.x.length ? ` <b style="color:var(--warn)">${esc(t("Cruzas {s}.", { s: s.x[0].st }))}</b>` : ""); }
    else if (s.k === "stay") instr = esc(t("Quédate en el mismo lugar.")); }
  const cls = c.mode === "arrived" ? "ok" : c.band;
  let h = `<div class="livecard ${cls}"><div class="top"><span class="num">${i + 1}</span><div class="grow"><b>${esc(T.name)}</b><div class="mile">${esc(t("Milla"))} ${T.mile.toFixed(1)} · ${esc(streetAtKm(T.km))}</div></div>
    <div class="bigslack ${cls}">${c.mode === "arrived" ? "✓" : sgn(c.slack)}<small>${esc(c.mode === "arrived" ? t("en el punto") : t("min de holgura"))}</small></div></div>
    <div class="stat"><div><span>${esc(S.live.phase === "pre" ? t("Sal a más tardar") : t("Llegas"))}</span><b>${S.live.phase === "pre" ? fmt(c.leaveBy) : fmt(c.arrive)}</b></div><div><span>${esc(t("Pasa el 1º"))}</span><b>${fmt(c.W.earliest)}</b></div><div><span>${esc(t("vs. plan"))}</span><b>${c.mode === "plan" ? "—" : (c.delay > 0 ? "+" : "") + Math.round(c.delay) + " min"}</b></div></div>
    ${instr ? `<div class="instr">${instr}</div>` : ""}
    ${c.speed ? `<div class="speedline ${c.speed.need > c.speed.cur * 1.1 ? "warn" : "ok"}">${t("Tu ritmo <b>{a} km/h</b> · necesitas <b>{b}</b>", { a: kmh(c.speed.cur), b: isFinite(c.speed.need) ? kmh(c.speed.need) + " km/h" : t("imposible a pie") })}${isFinite(c.speed.need) && paceFor(c.speed.need) ? " (" + esc(t(PACES[paceFor(c.speed.need)].n).toLowerCase()) + ")" : ""}</div>` : ""}
    <div class="gpsline">${gps}<span>· ${esc(t(PHASES[S.live.phase]))}</span>${c.ride ? `<span>· ${esc(t("En Línea {l}", { l: c.ride.line }))}</span>` : c.route && c.route.o ? `<span>· ${esc(optSummary(c.route.o))}</span>` : ""}</div>
    <div class="phase">${Object.entries(PHASES).map(([k, v]) => `<button data-ph="${k}" aria-pressed="${S.live.phase === k}">${esc(t(v))}</button>`).join("")}</div>
    <div class="btnrow"><button class="btn primary" id="seen">${esc(t("Ya los vi → siguiente"))}</button><button class="btn" id="showRoute">${esc(t("Ver ruta en mapa"))}</button><button class="btn" id="share">${esc(t("Compartir estado"))}</button></div></div>`;
  if (c.alts.length) h += `<div class="warnbox" style="margin:0"><b>${esc(c.band === "late" ? t("No llegas a tiempo.") : t("Vas justo."))}</b> ${esc(t("Puntos donde sí llegas desde aquí:"))}<div class="btnrow" style="margin-top:6px">${c.alts.map(a => `<button class="btn sm" data-alt="${a.c.id}">${esc(a.c.name)} · ${Math.round(a.o.rt)} min · +${Math.round(a.slack)}</button>`).join("")}</div></div>`;
  h += `<h3>${esc(t("Corredores ahora"))}</h3><div>` + c.runners.map(x => { const r = x.r; const km = x.km; const pos = km < 0 ? t("Sale ~{h}", { h: fmt(proj(r).start) }) : km > 42.2 ? t("Terminó") : `km ${km.toFixed(1)} · ${streetAtKm(km)}`;
    const nx = x.nextCP; const btn = nx ? `<button class="btn sm${x.od ? " primary" : ""}" data-split="${r.id}:${nx.k}">${esc(nx.km === 0 ? t("Cruzó salida") : t("Pasó {cp}", { cp: t(nx.n) }))}</button>` : "";
    return `<div class="lr"><span class="sw" style="background:${r.color}"></span><div><div class="nm">${esc(r.name)} <span class="pchip prio${r.prio}">${esc(t(PR[r.prio]))}</span></div><div class="meta">${esc(pos)}${nx ? ` · ${esc(t(nx.n))} ~${fmt(x.nextAt)}` : ""}${x.od ? ` · <b style="color:var(--warn)">${esc(t("¿ya pasó {cp}?", { cp: t(x.od.cp.n) }))}</b>` : ""}</div><div class="meta">${esc(x.passed ? t("Ya pasó por {s}", { s: T.name }) : t("En {s}: {a}", { s: T.name, a: fmt(x.fast) + (fmt(x.slow) !== fmt(x.fast) ? "–" + fmt(x.slow) : "") }))}${proj(r).state ? " · " + esc(t(proj(r).state)) : ""}</div></div>${btn}</div>`; }).join("") + `</div>`;
  h += `<h3>${esc(t("Avisos"))}</h3><div class="feed">${S.live.feed.slice(0, 12).map(f => `<div class="it l${f.level}"><time>${fmt(f.t)}</time><b>${esc(f.title)}</b> ${esc(f.body)}</div>`).join("") || `<p class="note">${esc(t("Aún no hay avisos."))}</p>`}</div>`;
  h += `<div class="btnrow"><button class="btn sm" id="liveNotif">${esc(S.notif ? t("Notificaciones activas") : t("Activar notificaciones"))}</button><button class="btn sm" id="liveWake">${esc(S.wake ? t("Pantalla encendida ✓") : t("Mantener pantalla encendida"))}</button>${legs.length ? `<select id="jump" class="btn sm" aria-label="${esc(t("Cambiar punto actual"))}">${legs.map((l, j) => `<option value="${j}"${j === i ? " selected" : ""}>${esc(t("Ir al punto {n}: {s}", { n: j + 1, s: l.b.name }))}</option>`).join("")}</select>` : ""}<button class="btn sm" id="liveReset">${esc(t("Reiniciar"))}</button><button class="btn sm danger" id="liveStop">${esc(t("Salir del modo en vivo"))}</button></div>`;
  pane.innerHTML = h;
  pane.querySelectorAll("[data-ph]").forEach(b => b.onclick = () => setPhase(b.dataset.ph));
  $("seen").onclick = () => markSeen();
  $("showRoute").onclick = () => { const st = () => (L.calc && L.calc.route ? L.calc.route.steps : []); showSteps(st, t("Ruta en vivo a {s}", { s: T.name }), [P(T.lat, T.lng)].concat(L.gps ? [P(L.gps.lat, L.gps.lng)] : [])); };
  $("share").onclick = async () => { const text = "Cheer Crew · " + statusText(); try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); emit("toast", { msg: t("Estado copiado. Pégalo en el chat de la porra."), level: "ok" }); } } catch (e) {} };
  pane.querySelectorAll("[data-split]").forEach(b => b.onclick = () => { const [rid, k] = b.dataset.split.split(":"); const r = S.runners.find(x => x.id === rid); recordSplit(r, k); renderRunners(); renderPlan(); });
  pane.querySelectorAll("[data-alt]").forEach(b => b.onclick = () => { const id = b.dataset.alt; if (!S.plan.includes(id)) { S.plan.push(id); S.plan.sort((x, y) => byId[x].km - byId[y].km); } invalidateAll(); goToIdx(S.plan.indexOf(id)); renderAll(true); });
  $("liveNotif").onclick = async () => { const e = await enableNotifications(); if (e) emit("toast", { msg: e, level: "tight" }); renderLive(); };
  $("liveWake").onclick = () => { setWake(!S.wake); renderLive(); };
  if ($("jump")) $("jump").onchange = e => goToIdx(+e.target.value);
  $("liveReset").onclick = () => resetLive(); $("liveStop").onclick = () => { stopLive(); openTab("live"); };
}

// ---------- SETTINGS ----------
export async function searchPlaces(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=us&viewbox=-87.75,42.0,-87.55,41.80&bounded=1&q=${encodeURIComponent(q + " Chicago")}`;
  const res = await (await fetch(url, { headers: { "Accept-Language": lang() } })).json();
  return res.map(x => ({ name: x.display_name.split(",")[0], address: x.display_name.split(",").slice(1, 3).join(",").trim(), lat: +x.lat, lng: +x.lon, full: x.display_name.split(",").slice(1, 4).join(",") }));
}
export function setStartTo(name, lat, lng, address) { S.start = { name, lat, lng, address: address || "" }; setStart(S.start); save(); }
export function renderSettings() {
  const st = place("start");
  let h = `<h2>${esc(t("Idioma"))}</h2><div class="seg"><button id="lEs" aria-pressed="${lang() === "es"}">Español</button><button id="lEn" aria-pressed="${lang() === "en"}">English</button></div>
  <h2>${esc(t("Punto de salida"))}</h2><div class="kv"><span class="small">${esc(t("Actual"))}</span><b>${esc(st.name)}${st.address ? ` · <span class="small">${esc(st.address)}</span>` : ""}</b></div>
  <div class="btnrow"><input type="text" id="q" placeholder="${esc(t("Busca tu hotel o dirección"))}" style="flex:1;min-width:180px" aria-label="${esc(t("Buscar hotel"))}"><button class="btn" id="qgo">${esc(t("Buscar"))}</button></div>
  <div class="searchres" id="qres"></div>
  <div class="btnrow"><button class="btn sm" id="pickStart">${esc(t("Elegir en el mapa"))}</button><button class="btn sm" id="gpsStart">${esc(t("Usar mi ubicación"))}</button></div>
  <h2>${esc(t("Plan"))}</h2><div class="sets">
    <label>${esc(t("Margen cómodo: avisar “justo” si llego con menos de (min)"))}<input type="number" id="s_buf" min="0" max="30" value="${S.buf}"></label>
    <label>${esc(t("Te quedas tras ver al último principal (min)"))}<input type="number" id="s_linger" min="0" max="15" value="${S.linger}"></label>
    <label>${esc(t("Máximo de puntos"))}<select id="s_maxs">${[3, 4, 5, 6, 7].map(n => `<option${+S.maxs === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>
    <label>${esc(t("Incertidumbre del ritmo (±%)"))}<input type="number" id="s_paceMargin" min="0" max="10" step="0.5" value="${S.paceMargin}"></label>
    <label>${esc(t("Desgaste después del km 30 (% más lento)"))}<input type="number" id="s_fatigue" min="0" max="15" step="0.5" value="${S.fatigue}"></label>
  </div>
  <label class="chk" for="s_avoid"><input type="checkbox" id="s_avoid"${S.avoid ? " checked" : ""}> ${esc(t("Evitar cruzar el recorrido a pie"))}</label>
  <label class="chk" for="s_sound"><input type="checkbox" id="s_sound"${S.sound ? " checked" : ""}> ${esc(t("Alarma con sonido cuando llega tu corredor"))}</label>
  <h2>${esc(t("Simulación (para probar antes de la carrera)"))}</h2>
  <p class="note">${esc(t("Corre el reloj como si fuera el 11 de octubre. Puedes acelerar el tiempo y simular tu ubicación tocando el mapa."))}</p>
  <div class="sets"><label>${esc(t("Hora de inicio"))}<input type="time" id="simStart" value="${hhmm(S.sim.start)}"></label><label>${esc(t("Velocidad"))}<select id="simSpeed">${[1, 5, 10, 20].map(n => `<option value="${n}"${S.sim.speed === n ? " selected" : ""}>×${n}</option>`).join("")}</select></label></div>
  <div class="btnrow"><button class="btn ${S.sim.on ? "" : "primary"}" id="simToggle">${esc(S.sim.on ? t("Detener simulación") : t("Iniciar simulación"))}</button><button class="btn" id="simGps">${esc(t("Simular mi ubicación en el mapa"))}</button></div>
  <h2>${esc(t("Datos en vivo de los corredores"))}</h2>
  <p class="note">${t("La app oficial (Tata Consultancy Services) y la web de resultados (mika:timing) no tienen una API pública, y la web de resultados no permite lectura automática. Por eso, cuando la app oficial te avise de un tapete, toca <b>Pasó</b> en “En vivo” o escribe la hora en “Corredores”.")}</p>
  <div class="btnrow"><a class="btn sm" href="${RACE.officialApp.ios}" target="_blank" rel="noopener">${esc(t("App oficial iPhone"))}</a><a class="btn sm" href="${RACE.officialApp.android}" target="_blank" rel="noopener">${esc(t("App oficial Android"))}</a><a class="btn sm" href="${RACE.officialApp.web}" target="_blank" rel="noopener">${esc(t("Resultados web"))}</a></div>
  <h2>${esc(t("Instalar en tu teléfono"))}</h2>
  <ul class="facts"><li>${t("<b>iPhone:</b> abre en Safari → Compartir → “Agregar a pantalla de inicio”. Ábrela desde ese ícono para recibir notificaciones.")}</li><li>${t("<b>Android:</b> menú de Chrome → “Instalar app”.")}</li><li>${esc(t("Funciona sin señal después de abrirla una vez: el mapa y las rutas quedan guardados en el teléfono."))}</li></ul>
  <details class="box"><summary>${esc(t("Datos clave de la carrera"))}</summary><ul class="facts" style="margin-top:8px">${(lang() === "en" ? FACTS_EN : FACTS).map(f => `<li>${esc(f)}</li>`).join("")}</ul></details>
  <div class="btnrow"><button class="btn sm" id="wiz2">${esc(t("Configuración guiada"))}</button><button class="btn sm danger" id="resetAll">${esc(t("Borrar todo y empezar de cero"))}</button></div>
  <p class="small">${esc(t("Calles: City of Chicago Street Center Lines. Horarios y cierres: chicagomarathon.com. Estaciones: CTA."))} Cheer Crew · Elevate Sports.</p>`;
  $("pane-set").innerHTML = h;
  $("lEs").onclick = () => setLang("es"); $("lEn").onclick = () => setLang("en");
  const done = name => { renderAll(); emit("toast", { msg: t("Punto de salida: {s}", { s: name }), level: "ok" }); };
  $("qgo").onclick = async () => { const q = $("q").value.trim(); if (!q) return; $("qres").innerHTML = `<span class="small">${esc(t("Buscando…"))}</span>`;
    try { const res = await searchPlaces(q);
      $("qres").innerHTML = res.length ? res.map((x, j) => `<button data-j="${j}"><b>${esc(x.name)}</b><br><span class="small">${esc(x.full)}</span></button>`).join("") : `<span class="small">${esc(t("Sin resultados. Prueba “Elegir en el mapa”."))}</span>`;
      $("qres").querySelectorAll("[data-j]").forEach(b => b.onclick = () => { const x = res[+b.dataset.j]; setStartTo(x.name, x.lat, x.lng, x.address); done(x.name); });
    } catch (e) { $("qres").innerHTML = `<span class="small">${esc(t("No se pudo buscar (¿sin internet?). Usa “Elegir en el mapa”."))}</span>`; } };
  $("q").onkeydown = e => { if (e.key === "Enter") $("qgo").click(); };
  $("pickStart").onclick = () => pick(t("Toca el mapa donde está tu hotel"), (lat, lng) => { setStartTo(t("Mi punto de salida"), lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`); done(t("Mi punto de salida")); });
  $("gpsStart").onclick = () => navigator.geolocation?.getCurrentPosition(p => { setStartTo(t("Mi ubicación"), p.coords.latitude, p.coords.longitude, "GPS"); done(t("Mi ubicación")); }, () => emit("toast", { msg: t("No se pudo leer tu ubicación."), level: "tight" }), { enableHighAccuracy: true, timeout: 15000 });
  ["buf", "linger", "maxs", "paceMargin", "fatigue"].forEach(k => $("s_" + k).onchange = e => { S[k] = +e.target.value; save(); renderAll(); });
  $("s_avoid").onchange = e => { S.avoid = e.target.checked; clearRouteCaches(); save(); renderAll(); };
  $("s_sound").onchange = e => { S.sound = e.target.checked; save(); };
  $("simToggle").onclick = () => { if (S.sim.on) setSim(false); else setSim(true, parseHM($("simStart").value) ?? 480, +$("simSpeed").value); resetLive(); renderAll(); if (S.live.on) startLive(); };
  $("simSpeed").onchange = e => { if (S.sim.on) { const x = S.sim.start + (Date.now() - S.sim.wall) / 60000 * S.sim.speed; setSim(true, x, +e.target.value); if (S.live.on) startLive(); } else { S.sim.speed = +e.target.value; save(); } };
  $("simGps").onclick = () => pick(t("Toca el mapa para simular dónde estás"), (lat, lng) => { simFix(lat, lng); draw(); });
  $("wiz2").onclick = () => openWizard();
  $("resetAll").onclick = () => { if ($("resetAll").dataset.c) resetAll(); else { $("resetAll").dataset.c = 1; $("resetAll").textContent = t("Toca otra vez para confirmar"); } };
}
export function pick(text, cb) { $("pickbar").hidden = false; $("picktext").textContent = text; if (window.innerWidth <= 900) $("mapwrap").scrollIntoView({ behavior: "smooth" }); startPick((lat, lng) => { $("pickbar").hidden = true; cb(lat, lng); }); }
$("pickcancel").onclick = () => { $("pickbar").hidden = true; mapState.pick = null; if (mapState.onPickCancel) { const f = mapState.onPickCancel; mapState.onPickCancel = null; f(); } };

// ---------- scrub ----------
export function renderScrub() { const x = +$("scrub").value; $("scrubT").textContent = fmt(x);
  $("scrubW").innerHTML = S.runners.map(r => { const o = proj(r); const km = x < o.start ? -1 : kmAt(o, x); const tx = km < 0 ? t("aún no sale") : km > 42.2 ? t("terminó") : `km ${km.toFixed(1)}`; return `<span><span class="dot" style="background:${r.color}"></span>${esc(r.name)}: ${esc(tx)}</span>`; }).join(""); }
$("scrub").addEventListener("input", () => { S.scrub = +$("scrub").value; mapState.time = S.scrub; save(); renderScrub(); draw(); });

// ---------- toasts ----------
on("toast", ({ msg, level }) => { const d = document.createElement("div"); d.className = "toast " + (level || ""); d.textContent = msg; $("toasts").prepend(d); setTimeout(() => d.remove(), level === "late" ? 12000 : 7000); while ($("toasts").children.length > 1) $("toasts").lastChild.remove(); });

// ---------- custom spot from a tap on the course ----------
on("coursetap", ({ lat, lng }) => {
  const pr = projectKm(lat, lng); if (!pr || pr.d > 120) return;
  const street = streetAtKm(pr.km); const sheet = $("sheet");
  sheet.innerHTML = `<div class="sheetbox" role="dialog" aria-modal="true" aria-labelledby="csT"><h2 id="csT">${esc(t("Crear punto propio"))}</h2>
    <p class="note">${esc(t("{s} · milla {m} (km {k})", { s: street, m: (pr.km / MI).toFixed(1), k: pr.km.toFixed(1) }))}</p>
    <label>${esc(t("Nombre (opcional)"))}<input type="text" id="csName" placeholder="${esc(street)}"></label>
    <div class="times">${S.runners.filter(r => r.prio !== 3).map(r => { const o = proj(r); return `<span><span class="dot" style="background:${r.color}"></span>${esc(r.name)} ${fmt(at(o, pr.km, "fast"))}</span>`; }).join("")}</div>
    <div class="btnrow"><button class="btn primary" id="csAdd">${esc(t("Agregar a mi plan"))}</button><button class="btn" id="csNo">${esc(t("Cancelar"))}</button></div></div>`;
  sheet.hidden = false;
  $("csNo").onclick = () => { sheet.hidden = true; };
  $("csAdd").onclick = () => {
    const c = { id: "c" + uid(), lat: pr.lat, lng: pr.lng, km: pr.km, name: $("csName").value.trim() };
    const sp = addCustomSpot(c); sheet.hidden = true; if (!sp) { emit("toast", { msg: t("No se pudo crear el punto aquí."), level: "tight" }); return; }
    S.custom = (S.custom || []).concat([c]); S.plan = (S.plan || []).concat([sp.id]).sort((x, y) => byId[x].km - byId[y].km); save(); renderAll(); openTab("plan");
    emit("toast", { msg: t("Punto agregado: {s}", { s: sp.name }), level: "ok" });
  };
});
