// Panels: live, plan, transfers, runners, settings
import { S, save, now, emit, on, fmt, fmtPace, esc, parseHM, uid, setSim, resetAll } from "./state.js";
import { RACE, WAVES, CPS, LC, LN, HW, ST, RUNNER_COLORS, FACTS } from "./race-chicago.js";
import { SPOTS, byId, place, setStart, streetAtKm, sideName, CROSS_MIN, WMPM, MI, P, clearRouteCaches, optCache } from "./engine.js";
import { proj, at, invalidatePace } from "./pace.js";
import { planLegs, invalidatePlan, optimize, groups, windowAt, bestLeg } from "./plan.js";
import { mapState, draw, showPts, startPick, focusLL } from "./map.js";
import { L, startLive, stopLive, resetLive, setPhase, markSeen, goToIdx, recordSplit, clearSplit, enableNotifications, setWake, compute, simFix, statusText, PHASES, startGPS } from "./live.js";

const $ = id => document.getElementById(id);
const short = n => (n || "").replace(/\s*\(ejemplo\)/, "");
const sgn = v => (v >= 0 ? "+" : "") + Math.round(v);
const lchip = c => `<span class="lchip" style="background:${LC[c]}">${LN[c]}</span>`;
const crossChip = n => n ? `<span class="chip warn">${n} cruce${n > 1 ? "s" : ""} del recorrido</span>` : `<span class="chip ok">Sin cruzar</span>`;
const PR = { 1: "Principal", 2: "Si se puede", 3: "Solo seguir" };
function chip(sl) { if (sl == null) return ""; const v = Math.round(sl); if (v >= 5) return `<span class="chip ok">Holgura +${v} min</span>`; if (v >= 0) return `<span class="chip warn">Justo · +${v} min</span>`; return `<span class="chip bad">No llegas · ${v} min</span>`; }
function optSummary(o) { if (o.stay) return "Te quedas en el mismo lugar"; if (o.walk) return `Todo a pie · ${Math.round(o.rt)} min`; return `${o.label} · ${Math.round(o.walkMin)} min a pie`; }

// ---------- tabs ----------
const TABS = ["live", "plan", "tr", "run", "set"];
export function openTab(t) { TABS.forEach(o => { $("tab-" + o).setAttribute("aria-selected", o === t); $("pane-" + o).hidden = o !== t; }); S.tab = t; save(); $("app").classList.toggle("livemode", t === "live"); $("scrubbox").hidden = t === "live" && S.live.on; if (t === "live") renderLive(); }
TABS.forEach(t => $("tab-" + t).onclick = () => openTab(t));

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
export function renderHeader() { const st = place("start"); $("startLabel").textContent = "Sales de: " + st.name; }
export function tickClock() { $("clock").innerHTML = `${S.sim.on ? `<span class="sim">Simulación ×${S.sim.speed}</span>` : ""}${fmt(Math.floor(now()))}`; }

// ---------- runner windows helper ----------
function runnerTimes(spot, list) {
  return list.map(r => { const o = proj(r); const f = at(o, spot.km, "fast"), s = at(o, spot.km, "slow");
    return `<span title="${esc(r.name)}"><span class="dot" style="background:${r.color}"></span>${esc(short(r.name))} ${fmt(f)}${fmt(s) !== fmt(f) ? "–" + fmt(s) : ""}</span>`; }).join("");
}
// ---------- PLAN ----------
function alternatives(i) {
  const legs = planLegs(); const l = legs[i]; if (!l) return []; const prev = l.a; const nxt = legs[i + 1] ? legs[i + 1].b : null; const out = [];
  for (const c of SPOTS) { if (c.id === l.b.id || S.plan.includes(c.id)) continue; if (prev.km != null && c.km <= prev.km + 0.05) continue; if (nxt && c.km >= nxt.km - 0.05) continue;
    const s1 = prev.km == null ? 60 : bestLeg(prev, c).slack; if (s1 < 0) continue; const s2 = nxt ? bestLeg(c, nxt).slack : 60; if (s2 < 0) continue; out.push({ c, v: Math.min(s1, s2) }); }
  return out.sort((a, b) => b.v - a.v).slice(0, 3);
}
function altHTML(i) {
  const l = planLegs()[i]; if (!(l.slack != null && l.slack < 0)) return "";
  const betterOpt = l.opts.find(o => (l.earliest - (l.depart + o.rt + (+S.buf))) >= 0 && o.key !== l.o.key);
  const alts = alternatives(i); let h = `<div class="warnbox" style="margin:0"><b>Cómo arreglarlo:</b> `;
  if (betterOpt) h += `elige “${esc(betterOpt.walk ? "Todo a pie" : betterOpt.label)}” en Traslados (sí llegas). `;
  if (alts.length) h += `o cambia ${esc(l.b.name)} por un punto donde sí llegas:<div class="btnrow" style="margin-top:6px">${alts.map(a => `<button class="btn sm" data-swap="${i}:${a.c.id}">${esc(a.c.name)} · +${Math.round(a.v)} min</button>`).join("")}</div>`;
  else if (!betterOpt) h += `quita ${esc(l.b.name)} del plan o baja el margen. Ningún otro punto entre el anterior y el siguiente te da tiempo con estos ritmos.`;
  return h + `</div>`;
}
function bindSwap(root) { root.querySelectorAll("[data-swap]").forEach(b => b.onclick = () => { const [i, c] = b.dataset.swap.split(":"); S.plan[+i] = c; S.plan.sort((x, y) => byId[x].km - byId[y].km); save(); renderAll(); }); }
export function renderPlan() {
  const from = place("start"); const legs = planLegs(); const G = groups();
  let minSl = Infinity, bad = 0, cross = 0; legs.forEach(l => { cross += l.o.cx || 0; if (l.slack != null) { minSl = Math.min(minSl, l.slack); if (l.slack < 0) bad++; } });
  const bonusSeen = legs.reduce((a, l) => a + l.bonus.filter(b => b.st === "si").length, 0);
  let h = `<div class="summary"><span class="big">${legs.length}</span><div><b>${legs.length === 1 ? "punto" : "puntos"} para ver a ${G.main.map(r => esc(short(r.name))).join(" y ") || "tus corredores"}</b><div class="small">${legs.length ? (bad ? `${bad} traslado${bad > 1 ? "s" : ""} no alcanza${bad > 1 ? "n" : ""}.` : `Holgura mínima ${isFinite(minSl) ? Math.round(minSl) + " min" : "—"} · ${cross ? cross + " cruce" + (cross > 1 ? "s" : "") : "sin cruzar el recorrido"}`) + (G.bonus.length ? ` · ${bonusSeen} vistas extra de “si se puede”` : "") : "Agrega puntos desde el mapa o usa Sugerir ruta."}</div></div></div>
  <div class="btnrow"><button class="btn primary" id="opt">Sugerir ruta</button><button class="btn" id="goTr">Ver traslados</button><button class="btn" id="clr">Vaciar plan</button></div>
  <p class="note">La ruta se arma para ver a los corredores <b>principales</b> en cada punto (hasta ${S.maxs} puntos). Los de <b>“si se puede”</b> suman cuando pasan mientras estás ahí; los de <b>“solo seguir”</b> solo aparecen en el mapa y en vivo.</p><div>`;
  h += `<div class="stop"><div class="num home">★</div><div class="body"><div class="ttl"><b>${esc(from.name)}</b></div><div class="small">${esc(from.address || "Punto de salida")}</div></div></div>`;
  legs.forEach((l, i) => { const s = l.b;
    h += `<div class="stop"><div class="rail"></div><div class="leg"><div class="row"><b>→ ${Math.round(l.rt)} min · ${esc(optSummary(l.o))}</b>${l.first ? `<span class="chip ok">Sal a las ${fmt(l.depart)}</span>` : chip(l.slack)}</div>${l.first ? "" : `<div class="small">Te vas ${fmt(l.depart)} · llegas ${fmt(l.arrive)} · primero pasa ${fmt(l.earliest)}</div>`}<div class="row">${l.o.stay ? "" : crossChip(l.o.cx)}<button class="linkbtn" data-leg="${i}">${l.opts.length > 1 ? `Ver ${l.opts.length} opciones →` : "Ver traslado →"}</button></div>${altHTML(i)}</div></div>`;
    const bon = l.bonus.map(b => `<span class="chip ${b.st === "si" ? "ok" : b.st === "quizas" ? "warn" : ""}" style="${b.st === "no" ? "background:var(--chip);color:var(--muted)" : ""}"><span class="dot" style="background:${b.r.color}"></span>${esc(short(b.r.name))}: ${b.st === "si" ? "lo ves" : b.st === "quizas" ? `quizás (+${b.wait} min)` : "no coincide"}</span>`).join(" ");
    h += `<div class="stop"><div class="num">${i + 1}</div><div class="body"><div class="ttl"><div><b>${esc(s.name)}</b><div class="mile">Milla ${s.mile.toFixed(1)} · km ${s.km.toFixed(1)} · ${esc(streetAtKm(s.km))}</div></div><button class="x" data-rm="${s.id}" aria-label="Quitar ${esc(s.name)}">×</button></div><div class="times">${runnerTimes(s, G.main)}</div>${bon ? `<div class="btnrow" style="gap:4px">${bon}</div>` : ""}<div class="small">Párate en la banqueta <b>${sideName(s, l.arrSide)}</b> de ${esc(streetAtKm(s.km))}.</div><div class="tip">${esc(s.tip)}</div></div></div>`; });
  h += `<div class="stop"><div class="rail"></div><div class="leg"><div><b>Reencuentro:</b> camina por Roosevelt/Michigan a Grant Park (abre 9:30). Pónganse de acuerdo en un punto antes de la carrera.</div></div></div></div>`;
  h += `<details class="box"><summary>Todos los puntos (${SPOTS.length})</summary><div class="spotlist" style="margin-top:10px">${SPOTS.map(s => { const sel = S.plan.includes(s.id); return `<div class="spot${sel ? " sel" : ""}"><div class="top"><div><b>${esc(s.name)}</b><div class="mile">Milla ${s.mile.toFixed(1)} · ${esc(streetAtKm(s.km))}</div></div><button class="btn sm" data-tg="${s.id}">${sel ? "Quitar" : "Agregar"}</button></div><div class="times">${runnerTimes(s, G.main)}</div><div class="tip">${esc(s.tip)}</div></div>`; }).join("")}</div></details>`;
  $("pane-plan").innerHTML = h;
  $("opt").onclick = () => { S.plan = optimize(); S.choice = {}; save(); renderAll(); };
  $("clr").onclick = () => { S.plan = []; save(); renderAll(); };
  $("goTr").onclick = () => openTab("tr");
  bindSwap($("pane-plan"));
  $("pane-plan").querySelectorAll("[data-rm],[data-tg]").forEach(b => b.onclick = () => toggleSpot(b.dataset.rm || b.dataset.tg));
  $("pane-plan").querySelectorAll("[data-leg]").forEach(b => b.onclick = () => { openTab("tr"); showLeg(+b.dataset.leg); });
}
// ---------- TRANSFERS ----------
function dirHTML(d) { if (d.x) return `<li class="x">Cruza <b>${esc(d.st)}</b> (recorrido, milla ${(d.km / MI).toFixed(1)}) por el cruce con policía</li>`; return `<li>Por <b>${esc(d.nm)}</b> hacia el ${d.dir} · ${Math.round(d.m / 10) * 10} m</li>`; }
export function stepsHTML(steps, t0, fromTxt, toTxt, endT) {
  let t = t0; const rows = []; const clk = v => (v == null ? "" : fmt(v));
  if (fromTxt) rows.push(`<li><div class="clk">${clk(t)}</div><div class="ic"><i></i></div><div class="tx">${fromTxt}</div></li>`);
  steps.forEach(s => {
    if (s.k === "stay") { rows.push(`<li><div class="clk">${clk(t)}</div><div class="ic"><i></i></div><div class="tx"><b>Te quedas en el mismo lugar</b><span class="s">Regresan por el otro carril de Michigan.</span></div></li>`); return; }
    if (s.k === "walk") { rows.push(`<li class="walk"><div class="clk">${clk(t)}</div><div class="ic"><i style="border-color:var(--muted)"></i></div><div class="tx"><b>Camina ${Math.round(s.min)} min a ${esc(s.to)}</b><span class="s">${(s.m / 1000).toFixed(2)} km${s.x.length ? ` · incluye ${s.x.length * CROSS_MIN} min de cruce` : ""}</span><ul class="dirs">${s.dirs.map(dirHTML).join("")}</ul></div></li>`); if (t != null) t += s.min; return; }
    if (s.k === "xfer") { rows.push(`<li class="walk"><div class="clk">${clk(t)}</div><div class="ic"><i style="border-color:var(--muted)"></i></div><div class="tx"><b>Trasbordo a pie: ${esc(s.from)} → ${esc(s.to)}</b><span class="s">${Math.round(s.min)} min por pasillo o calle</span></div></li>`); if (t != null) t += s.min; return; }
    if (s.k === "wait") { rows.push(`<li style="--seg:${LC[s.color]}"><div class="clk">${clk(t)}</div><div class="ic"><i style="border-color:${LC[s.color]}"></i></div><div class="tx"><b>${lchip(s.color)}En ${esc(ST[s.st][0])}, andén ${esc(s.dir)}</b><span class="s">Espera promedio ~${Math.round(s.min)} min (pasa cada ~${HW[s.color]} min en domingo).</span></div></li>`); if (t != null) t += s.min; return; }
    if (s.k === "ride") { rows.push(`<li style="--seg:${LC[s.color]}"><div class="clk">${clk(t)}</div><div class="ic"><i style="border-color:${LC[s.color]};background:${LC[s.color]}"></i></div><div class="tx"><b>Viaja ${s.stops} parada${s.stops > 1 ? "s" : ""} en Línea ${LN[s.color]}</b><span class="s">${esc(ST[s.from][0])} → baja en <b>${esc(ST[s.to][0])}</b> · ~${Math.round(s.min)} min</span></div></li>`); if (t != null) t += s.min; return; }
  });
  if (toTxt) rows.push(`<li><div class="clk">${clk(endT != null ? endT : t)}</div><div class="ic"><i style="border-color:var(--accent);background:var(--accent)"></i></div><div class="tx">${toTxt}</div></li>`);
  return `<ol class="steps">${rows.join("")}</ol>`;
}
export function renderTransfers() {
  const legs = planLegs();
  let h = `<h2>Traslados del plan</h2>
  <label class="chk" for="avoid"><input type="checkbox" id="avoid"${S.avoid ? " checked" : ""}> Evitar cruzar el recorrido a pie (recomendado)</label>
  <p class="note">Las caminatas siguen las calles reales y el recorrido cuenta como barrera: cada cruce suma ${CROSS_MIN} min. El metro pasa por arriba o por abajo. Elige la opción que prefieras en cada traslado y el plan se recalcula.</p>`;
  if (!legs.length) { $("pane-tr").innerHTML = h + `<p class="note">Aún no tienes puntos en tu plan.</p>`; $("avoid").onchange = onAvoid; return; }
  h += `<div class="btnrow"><button class="btn primary" id="allmap">Ver todos en el mapa</button></div>`;
  legs.forEach((l, i) => { const key = l.a.id + ">" + l.b.id; const fastest = Math.min(...l.opts.map(o => o.rt));
    h += `<div class="tcard" id="leg${i}"><div class="thead"><div class="pair">${l.first ? `<span class="num home">★</span>` : `<span class="num">${i}</span>`}→<span class="num">${i + 1}</span></div><div class="grow"><b>${esc(l.a.name)} → ${esc(l.b.name)}</b><div class="small">${esc(optSummary(l.o))}</div></div>${l.first ? `<span class="chip ok">Sal a las ${fmt(l.depart)}</span>` : chip(l.slack)}</div>`;
    if (l.opts.length > 1) h += `<fieldset class="opts"><legend class="small">Opciones (${l.opts.length})</legend>` + l.opts.map((o, j) => { const sel = o.key === l.o.key; const tags = []; if (Math.abs(o.rt - fastest) < 0.5) tags.push(`<span class="chip ok">Más rápida</span>`); if (j === 0 && !tags.length) tags.push(`<span class="chip ok">Recomendada</span>`);
        const slack = l.first ? null : l.earliest - (l.depart + o.rt + (+S.buf));
        return `<label class="opt${sel ? " sel" : ""}" for="o${i}_${j}"><input type="radio" id="o${i}_${j}" name="leg${i}" value="${esc(o.key)}" data-key="${esc(key)}"${sel ? " checked" : ""}><div class="ob"><div class="orow"><b>${esc(o.walk ? "Todo a pie" : o.label)}</b><span class="omin">${Math.round(o.rt)} min</span></div><div class="orow small"><span>${o.walk ? `${(o.rt * WMPM / 1000).toFixed(1)} km` : esc(o.sub) + ` · ${Math.round(o.walkMin)} min a pie`}</span><span class="ochips">${crossChip(o.cx)}${tags.join("")}${slack != null && slack < 0 ? `<span class="chip bad">No llegas</span>` : ""}</span></div></div></label>`; }).join("") + `</fieldset>`;
    h += `<div class="tsum"><div><span>Sales</span><b>${fmt(l.depart)}</b></div><div><span>Llegas</span><b>${fmt(l.arrive)}</b></div><div><span>Pasa el 1º</span><b>${fmt(l.earliest)}</b></div></div>`;
    h += stepsHTML(l.steps, l.depart, `<b>Sales de ${esc(l.a.name)}</b><span class="s">${l.first ? `Hora sugerida para llegar con ${S.buf} min de margen.` : `Desde la banqueta ${sideName(l.a, l.aSide)}, después de verlos pasar (+${S.linger} min).`}</span>`, `<b>Llegas a ${esc(l.b.name)}</b><span class="s">Banqueta ${sideName(l.b, l.o.side)} de ${esc(streetAtKm(l.b.km))}. El primero pasa a las ${fmt(l.earliest)}.</span>`, l.arrive);
    h += altHTML(i).replace('style="margin:0"', "") + `<div class="tfoot"><button class="btn sm" data-show="${i}">Ver en el mapa</button></div></div>`; });
  $("pane-tr").innerHTML = h;
  $("avoid").onchange = onAvoid; bindSwap($("pane-tr"));
  $("allmap").onclick = () => showSteps(() => planLegs().flatMap(l => l.steps), "Todos los traslados del plan");
  $("pane-tr").querySelectorAll("[data-show]").forEach(b => b.onclick = () => showLeg(+b.dataset.show));
  $("pane-tr").querySelectorAll("input[type=radio]").forEach(r => r.onchange = () => { S.choice[r.dataset.key] = r.value; save(); const i = +r.name.slice(3); renderAll(true); showLeg(i, true); });
}
function onAvoid() { S.avoid = $("avoid").checked; clearRouteCaches(); save(); renderAll(); }
function showLeg(i, keep) { const l = planLegs()[i]; if (!l) return; showSteps(() => (planLegs()[i] || { steps: [] }).steps, `${l.first ? "★" : i} → ${i + 1}: ${l.a.name} → ${l.b.name} · ${Math.round(l.rt)} min`, [P(l.a.lat, l.a.lng), P(l.b.lat, l.b.lng)], keep); }

// ---------- RUNNERS ----------
export function renderRunners() {
  const G = groups();
  let h = `<h2>Corredores</h2><p class="note">Agrega a todos los que quieras. La <b>prioridad</b> decide el plan: a los <b>principales</b> los ves en cada punto; los de <b>si se puede</b> se suman cuando coinciden; los de <b>solo seguir</b> aparecen en el mapa y en vivo. Los tiempos por punto se recalculan con cada split.</p>`;
  S.runners.forEach((r, i) => { const o = proj(r); const fin = at(o, 42.195, "plan");
    h += `<div class="runner" data-r="${r.id}"><div class="hd"><div class="who"><input type="color" class="color" value="${esc(r.color)}" data-f="color" aria-label="Color"><b>${esc(short(r.name)) || "Corredor"}</b>${r.bib ? `<span class="small">#${esc(r.bib)}</span>` : ""}</div>
      <div class="seg" role="group" aria-label="Prioridad">${[1, 2, 3].map(p => `<button data-prio="${p}" aria-pressed="${r.prio === p}">${PR[p]}</button>`).join("")}</div></div>
      <div class="grid2"><label>Nombre<input type="text" data-f="name" value="${esc(r.name)}"></label><label>Número de corredor (bib)<input type="text" inputmode="numeric" data-f="bib" value="${esc(r.bib)}"></label>
      <label>Ola<select data-f="wave">${Object.entries(WAVES).map(([k, w]) => `<option value="${k}"${k === r.wave ? " selected" : ""}>${w.n}</option>`).join("")}</select></label>
      <label>Min. para cruzar la salida<input type="number" min="0" max="45" data-f="delay" value="${esc(r.delay)}"></label>
      <label>Tiempo objetivo (h:mm)<input type="text" inputmode="numeric" data-f="goal" value="${esc(r.goal)}"></label>
      <div style="display:grid;gap:4px;align-content:end"><span class="small">Meta estimada</span><div class="derived">${fmt(fin)}</div></div></div>
      <div class="stat"><div><span>Promedio</span><b>${fmtPace(o.avg ?? o.goalP)}/km</b></div><div><span>Último tramo</span><b>${o.recent ? fmtPace(o.recent) + "/km" : "—"}</b></div><div><span>Proyección usa</span><b>${fmtPace(o.planP)}/km</b></div></div>
      <div class="small">${o.basis === "splits" ? `Con ${o.pts.length - 1} split${o.pts.length > 2 ? "s" : ""}${o.state ? " · <b>" + o.state + "</b>" : ""}. El último tramo pesa 65% y el promedio 35%; la ventana va de ${fmtPace(o.fastP)} a ${fmtPace(o.slowP)}/km.` : `Sin splits todavía: se usa el tiempo objetivo (±${S.paceMargin}%).`}</div>
      <details class="box"${Object.keys(r.splits).length ? " open" : ""}><summary>Splits (tapetes oficiales)</summary><div class="cps" style="margin-top:8px">${CPS.map(cp => { const v = r.splits[cp.k]; const exp = cp.km === 0 ? o.start : at(o, cp.km, "plan");
        return `<div class="cp${v != null ? " done" : ""}"><b>${cp.n}</b><span class="exp">${v != null ? "" : "~" + fmt(exp)}</span><div class="v"><input type="time" step="60" data-cp="${cp.k}" value="${v != null ? hhmm(v) : ""}" aria-label="${cp.n} de ${esc(r.name)}">${v != null ? `<button class="btn xs" data-clr="${cp.k}" aria-label="Borrar">×</button>` : `<button class="btn xs" data-now="${cp.k}">Ahora</button>`}</div></div>`; }).join("")}</div></details>
      <div class="btnrow"><a class="btn sm" href="${RACE.officialApp.web}" target="_blank" rel="noopener">Resultados oficiales</a><button class="btn sm danger" data-del="1">Quitar corredor</button></div></div>`; });
  h += `<div class="btnrow"><button class="btn primary" id="addRunner">+ Agregar corredor</button></div>`;
  $("pane-run").innerHTML = h;
  $("addRunner").onclick = () => { const n = S.runners.length; S.runners.push({ id: uid(), name: "Corredor " + (n + 1), bib: "", prio: 2, wave: "w2", delay: 10, goal: "4:30", color: RUNNER_COLORS[n % RUNNER_COLORS.length], splits: {} }); save(); renderAll(); };
  $("pane-run").querySelectorAll(".runner").forEach(card => { const r = S.runners.find(x => x.id === card.dataset.r);
    card.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("change", () => { r[inp.dataset.f] = inp.value; save(); renderAll(); }));
    card.querySelectorAll("[data-prio]").forEach(b => b.onclick = () => { r.prio = +b.dataset.prio; save(); renderAll(); });
    card.querySelectorAll("[data-cp]").forEach(inp => inp.addEventListener("change", () => { const v = parseHM(inp.value); if (v != null) recordSplit(r, inp.dataset.cp, v); else clearSplit(r, inp.dataset.cp); renderAll(true); }));
    card.querySelectorAll("[data-now]").forEach(b => b.onclick = () => { recordSplit(r, b.dataset.now); renderAll(true); });
    card.querySelectorAll("[data-clr]").forEach(b => b.onclick = () => { clearSplit(r, b.dataset.clr); renderAll(true); });
    card.querySelector("[data-del]").onclick = () => { if (S.runners.length <= 1) return; S.runners = S.runners.filter(x => x !== r); save(); renderAll(); }; });
}
const hhmm = v => { const t = Math.round(v); return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };

// ---------- LIVE ----------
export function renderLive() {
  const pane = $("pane-live");
  if (!S.live.on) {
    pane.innerHTML = `<h2>Modo en vivo</h2><p class="note">El día de la carrera: usa tu GPS para calcular cuánto te falta al siguiente punto, compara contra la hora en que pasan tus corredores y te avisa si vas bien, justo o tarde. Si vas en el metro te dice cuántas paradas faltan.</p>
    <ul class="facts"><li>Mantén la app abierta con la pantalla encendida (actívalo abajo). En iPhone, agrégala a la pantalla de inicio para recibir notificaciones.</li><li>Cuando la app oficial te avise que tu corredor pasó un tapete (5K, 10K…), toca <b>Pasó</b> aquí: el ritmo y las horas se recalculan.</li><li>Para probar antes del 11 de octubre, activa la <b>simulación</b> en Ajustes.</li></ul>
    <div class="btnrow"><button class="btn primary" id="liveStart">Iniciar modo en vivo</button><button class="btn" id="liveNotif">${S.notif ? "Notificaciones activas" : "Activar notificaciones"}</button><button class="btn" id="liveWake">${S.wake ? "Pantalla: siempre encendida" : "Mantener pantalla encendida"}</button></div>`;
    $("liveStart").onclick = () => { startLive(); openTab("live"); };
    $("liveNotif").onclick = async () => { const e = await enableNotifications(); if (e) emit("toast", { msg: e, level: "tight" }); renderLive(); };
    $("liveWake").onclick = () => { setWake(!S.wake); renderLive(); };
    return;
  }
  const c = L.calc; if (!c) { pane.innerHTML = `<p class="note">Calculando…</p>`; return; }
  if (c.done) { pane.innerHTML = `<h2>¡Plan terminado!</h2><p class="note">Ve al reencuentro en Grant Park. La fiesta post-carrera abre a las 9:30.</p><div class="btnrow"><button class="btn" id="liveReset">Reiniciar recorrido</button><button class="btn" id="liveStop">Salir del modo en vivo</button></div>`; $("liveReset").onclick = () => resetLive(); $("liveStop").onclick = () => stopLive(); return; }
  const legs = planLegs(); const i = S.live.idx; const T = c.target;
  const gps = L.gps ? `<span class="dotlive"></span>GPS ±${Math.round(L.gps.acc || 0)} m${L.gps.speed != null ? ` · ${Math.round((L.gps.speed || 0) * 3.6)} km/h` : ""}${L.gps.sim ? " (simulado)" : ""}` : (L.err ? `<span style="color:var(--bad)">${esc(L.err)}</span>` : "Buscando GPS…");
  let instr = "";
  if (c.mode === "arrived") instr = `Estás en el punto. Párate en la banqueta <b>${sideName(T, legs[i].arrSide)}</b>. ${c.runners.filter(x => x.group !== "follow" && !x.passed).map(x => `${esc(short(x.r.name))} ~${fmt(x.fast)}`).join(" · ")}`;
  else if (c.ride) instr = `${lchip(c.ride.color)} <b>Faltan ${c.ride.stopsLeft} parada${c.ride.stopsLeft === 1 ? "" : "s"}</b> · bajas en <b>${esc(c.ride.alight)}</b>${c.ride.byGps ? "" : " (estimado por tiempo)"}`;
  else if (c.route && c.route.steps.length) { const s = c.route.steps[0]; const w = c.route.steps.find(q => q.k === "wait");
    if (s.k === "walk") { const d = s.dirs.filter(x => !x.x).slice(0, 2).map(d => `por <b>${esc(d.nm)}</b> al ${d.dir} (${Math.round(d.m / 10) * 10} m)`).join(", luego "); instr = `Camina ${d}${w ? ` hasta <b>${esc(ST[w.st][0])}</b> → ${lchip(w.color)} ${esc(w.dir)}` : ` hasta ${esc(T.name)}`}.${s.x.length ? ` <b style="color:var(--warn)">Cruzas ${esc(s.x[0].st)}.</b>` : ""}`; }
    else if (s.k === "stay") instr = "Quédate en el mismo lugar."; }
  const cls = c.mode === "arrived" ? "ok" : c.band;
  let h = `<div class="livecard ${cls}"><div class="top"><span class="num">${i + 1}</span><div class="grow"><b>${esc(T.name)}</b><div class="mile">Milla ${T.mile.toFixed(1)} · ${esc(streetAtKm(T.km))}</div></div>
    <div class="bigslack ${cls}">${c.mode === "arrived" ? "✓" : sgn(c.slack)}<small>${c.mode === "arrived" ? "en el punto" : "min de holgura"}</small></div></div>
    <div class="stat"><div><span>${S.live.phase === "pre" ? "Sal a más tardar" : "Llegas"}</span><b>${S.live.phase === "pre" ? fmt(c.leaveBy) : fmt(c.arrive)}</b></div><div><span>Pasa el 1º</span><b>${fmt(c.W.earliest)}</b></div><div><span>vs. plan</span><b>${c.mode === "plan" ? "—" : (c.delay > 0 ? "+" : "") + Math.round(c.delay) + " min"}</b></div></div>
    ${instr ? `<div class="instr">${instr}</div>` : ""}
    <div class="gpsline">${gps}<span>· ${PHASES[S.live.phase]}</span>${c.ride ? `<span>· En Línea ${esc(c.ride.line)}</span>` : c.route && c.route.o ? `<span>· ${esc(optSummary(c.route.o))}</span>` : ""}</div>
    <div class="phase">${Object.entries(PHASES).map(([k, v]) => `<button data-ph="${k}" aria-pressed="${S.live.phase === k}">${v}</button>`).join("")}</div>
    <div class="btnrow"><button class="btn primary" id="seen">Ya los vi → siguiente</button><button class="btn" id="showRoute">Ver ruta en mapa</button><button class="btn" id="share">Compartir estado</button></div></div>`;
  if (c.alts.length) h += `<div class="warnbox" style="margin:0"><b>${c.band === "late" ? "No llegas a tiempo." : "Vas justo."}</b> Puntos donde sí llegas desde aquí:<div class="btnrow" style="margin-top:6px">${c.alts.map(a => `<button class="btn sm" data-alt="${a.c.id}">${esc(a.c.name)} · ${Math.round(a.o.rt)} min · +${Math.round(a.slack)}</button>`).join("")}</div></div>`;
  h += `<h3>Corredores ahora</h3><div>` + c.runners.map(x => { const r = x.r; const km = x.km; const pos = km < 0 ? `Sale ~${fmt(proj(r).start)}` : km > 42.2 ? "Terminó" : `km ${km.toFixed(1)} · ${esc(streetAtKm(km))}`;
    const nx = x.nextCP; const btn = nx ? `<button class="btn sm${x.od ? " primary" : ""}" data-split="${r.id}:${nx.k}">${nx.km === 0 ? "Cruzó salida" : "Pasó " + nx.n}</button>` : "";
    return `<div class="lr"><span class="sw" style="background:${r.color}"></span><div><div class="nm">${esc(short(r.name))} <span class="pchip prio${r.prio}">${PR[r.prio]}</span></div><div class="meta">${pos}${nx ? ` · ${nx.n} ~${fmt(x.nextAt)}` : ""}${x.od ? ` · <b style="color:var(--warn)">¿ya pasó ${x.od.cp.n}?</b>` : ""}</div><div class="meta">${x.passed ? "Ya pasó por " + esc(T.name) : `En ${esc(T.name)}: ${fmt(x.fast)}${fmt(x.slow) !== fmt(x.fast) ? "–" + fmt(x.slow) : ""}`}${proj(r).state ? " · " + proj(r).state : ""}</div></div>${btn}</div>`; }).join("") + `</div>`;
  h += `<h3>Avisos</h3><div class="feed">${S.live.feed.slice(0, 12).map(f => `<div class="it l${f.level}"><time>${fmt(f.t)}</time><b>${esc(f.title)}</b> ${esc(f.body)}</div>`).join("") || `<p class="note">Aún no hay avisos.</p>`}</div>`;
  h += `<div class="btnrow"><button class="btn sm" id="liveNotif">${S.notif ? "Notificaciones activas" : "Activar notificaciones"}</button><button class="btn sm" id="liveWake">${S.wake ? "Pantalla encendida ✓" : "Mantener pantalla encendida"}</button>${legs.length ? `<select id="jump" class="btn sm" aria-label="Cambiar punto actual">${legs.map((l, j) => `<option value="${j}"${j === i ? " selected" : ""}>Ir al punto ${j + 1}: ${esc(l.b.name)}</option>`).join("")}</select>` : ""}<button class="btn sm" id="liveReset">Reiniciar</button><button class="btn sm danger" id="liveStop">Salir del modo en vivo</button></div>`;
  pane.innerHTML = h;
  pane.querySelectorAll("[data-ph]").forEach(b => b.onclick = () => setPhase(b.dataset.ph));
  $("seen").onclick = () => markSeen();
  $("showRoute").onclick = () => { const st = () => (L.calc && L.calc.route ? L.calc.route.steps : []); showSteps(st, "Ruta en vivo a " + T.name, [P(T.lat, T.lng)].concat(L.gps ? [P(L.gps.lat, L.gps.lng)] : [])); };
  $("share").onclick = async () => { const text = "Porra · " + statusText(); try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); emit("toast", { msg: "Estado copiado. Pégalo en el chat de la porra.", level: "ok" }); } } catch (e) {} };
  pane.querySelectorAll("[data-split]").forEach(b => b.onclick = () => { const [rid, k] = b.dataset.split.split(":"); const r = S.runners.find(x => x.id === rid); recordSplit(r, k); renderRunners(); renderPlan(); });
  pane.querySelectorAll("[data-alt]").forEach(b => b.onclick = () => { const id = b.dataset.alt; if (!S.plan.includes(id)) { S.plan.push(id); S.plan.sort((x, y) => byId[x].km - byId[y].km); } invalidateAll(); goToIdx(S.plan.indexOf(id)); renderAll(true); });
  $("liveNotif").onclick = async () => { const e = await enableNotifications(); if (e) emit("toast", { msg: e, level: "tight" }); renderLive(); };
  $("liveWake").onclick = () => { setWake(!S.wake); renderLive(); };
  if ($("jump")) $("jump").onchange = e => goToIdx(+e.target.value);
  $("liveReset").onclick = () => resetLive(); $("liveStop").onclick = () => { stopLive(); openTab("live"); };
}

// ---------- SETTINGS ----------
export function renderSettings() {
  const st = place("start");
  let h = `<h2>Punto de salida</h2><div class="kv"><span class="small">Actual</span><b>${esc(st.name)}${st.address ? ` · <span class="small">${esc(st.address)}</span>` : ""}</b></div>
  <div class="btnrow"><input type="text" id="q" placeholder="Busca tu hotel o dirección" style="flex:1;min-width:180px" aria-label="Buscar hotel"><button class="btn" id="qgo">Buscar</button></div>
  <div class="searchres" id="qres"></div>
  <div class="btnrow"><button class="btn sm" id="pickStart">Elegir en el mapa</button><button class="btn sm" id="gpsStart">Usar mi ubicación</button><button class="btn sm" id="felix">Hotel Felix</button></div>
  <h2>Plan</h2><div class="sets">
    <label>Margen de seguridad por traslado (min)<input type="number" id="s_buf" min="0" max="30" value="${S.buf}"></label>
    <label>Te quedas tras ver al último principal (min)<input type="number" id="s_linger" min="0" max="15" value="${S.linger}"></label>
    <label>Máximo de puntos<select id="s_maxs">${[3, 4, 5, 6, 7].map(n => `<option${+S.maxs === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>
    <label>Incertidumbre del ritmo (±%)<input type="number" id="s_paceMargin" min="0" max="10" step="0.5" value="${S.paceMargin}"></label>
    <label>Desgaste después del km 30 (% más lento)<input type="number" id="s_fatigue" min="0" max="15" step="0.5" value="${S.fatigue}"></label>
  </div>
  <label class="chk" for="s_avoid"><input type="checkbox" id="s_avoid"${S.avoid ? " checked" : ""}> Evitar cruzar el recorrido a pie</label>
  <h2>Simulación (para probar antes de la carrera)</h2>
  <p class="note">Corre el reloj como si fuera el 11 de octubre. Puedes acelerar el tiempo y simular tu ubicación tocando el mapa.</p>
  <div class="sets"><label>Hora de inicio<input type="time" id="simStart" value="${hhmm(S.sim.start)}"></label><label>Velocidad<select id="simSpeed">${[1, 5, 10, 20].map(n => `<option value="${n}"${S.sim.speed === n ? " selected" : ""}>×${n}</option>`).join("")}</select></label></div>
  <div class="btnrow"><button class="btn ${S.sim.on ? "" : "primary"}" id="simToggle">${S.sim.on ? "Detener simulación" : "Iniciar simulación"}</button><button class="btn" id="simGps">Simular mi ubicación en el mapa</button></div>
  <h2>Datos en vivo de los corredores</h2>
  <p class="note">La app oficial (Tata Consultancy Services) y la web de resultados (mika:timing) no tienen una API pública, y la web de resultados no permite lectura automática. Por eso, cuando la app oficial te avise de un tapete, toca <b>Pasó</b> en “En vivo” o escribe la hora en “Corredores”. Ya pedimos acceso oficial; si lo dan, se conecta aquí sin cambiar nada más.</p>
  <div class="btnrow"><a class="btn sm" href="${RACE.officialApp.ios}" target="_blank" rel="noopener">App oficial iPhone</a><a class="btn sm" href="${RACE.officialApp.android}" target="_blank" rel="noopener">App oficial Android</a><a class="btn sm" href="${RACE.officialApp.web}" target="_blank" rel="noopener">Resultados web</a></div>
  <h2>Instalar en tu teléfono</h2>
  <ul class="facts"><li><b>iPhone:</b> abre en Safari → Compartir → “Agregar a pantalla de inicio”. Ábrela desde ese ícono para recibir notificaciones.</li><li><b>Android:</b> menú de Chrome → “Instalar app”.</li><li>Funciona sin señal después de abrirla una vez: el mapa y las rutas quedan guardados en el teléfono.</li></ul>
  <details class="box"><summary>Datos clave de la carrera</summary><ul class="facts" style="margin-top:8px">${FACTS.map(f => `<li>${esc(f)}</li>`).join("")}</ul></details>
  <div class="btnrow"><button class="btn sm danger" id="resetAll">Borrar todo y empezar de cero</button></div>
  <p class="small">Calles: City of Chicago Street Center Lines. Horarios y cierres: chicagomarathon.com. Estaciones: CTA.</p>`;
  $("pane-set").innerHTML = h;
  const setStartTo = (name, lat, lng, address) => { S.start = { name, lat, lng, address: address || "" }; setStart(S.start); S.plan = S.plan || []; save(); renderAll(); emit("toast", { msg: "Punto de salida: " + name, level: "ok" }); };
  $("qgo").onclick = async () => { const q = $("q").value.trim(); if (!q) return; $("qres").innerHTML = `<span class="small">Buscando…</span>`;
    try { const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=us&viewbox=${-87.75},${42.0},${-87.55},${41.80}&bounded=1&q=${encodeURIComponent(q + " Chicago")}`;
      const res = await (await fetch(url, { headers: { "Accept-Language": "es" } })).json();
      $("qres").innerHTML = res.length ? res.map((x, j) => `<button data-j="${j}"><b>${esc(x.display_name.split(",")[0])}</b><br><span class="small">${esc(x.display_name.split(",").slice(1, 4).join(","))}</span></button>`).join("") : `<span class="small">Sin resultados. Prueba “Elegir en el mapa”.</span>`;
      $("qres").querySelectorAll("[data-j]").forEach(b => b.onclick = () => { const x = res[+b.dataset.j]; setStartTo(x.display_name.split(",")[0], +x.lat, +x.lon, x.display_name.split(",").slice(1, 3).join(",").trim()); });
    } catch (e) { $("qres").innerHTML = `<span class="small">No se pudo buscar (¿sin internet?). Usa “Elegir en el mapa”.</span>`; } };
  $("q").onkeydown = e => { if (e.key === "Enter") $("qgo").click(); };
  $("pickStart").onclick = () => pick("Toca el mapa donde está tu hotel", (lat, lng) => setStartTo("Mi punto de salida", lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`));
  $("gpsStart").onclick = () => navigator.geolocation?.getCurrentPosition(p => setStartTo("Mi ubicación", p.coords.latitude, p.coords.longitude, "GPS"), e => emit("toast", { msg: "No se pudo leer tu ubicación.", level: "tight" }), { enableHighAccuracy: true, timeout: 15000 });
  $("felix").onclick = () => { S.start = null; setStart(null); save(); renderAll(); };
  ["buf", "linger", "maxs", "paceMargin", "fatigue"].forEach(k => $("s_" + k).onchange = e => { S[k] = +e.target.value; save(); renderAll(); });
  $("s_avoid").onchange = e => { S.avoid = e.target.checked; clearRouteCaches(); save(); renderAll(); };
  $("simToggle").onclick = () => { if (S.sim.on) setSim(false); else { setSim(true, parseHM($("simStart").value) ?? 480, +$("simSpeed").value); } resetLive(); renderAll(); if (S.live.on) startLive(); };
  $("simSpeed").onchange = e => { if (S.sim.on) { const t = S.sim.start + (Date.now() - S.sim.wall) / 60000 * S.sim.speed; setSim(true, t, +e.target.value); if (S.live.on) startLive(); } else { S.sim.speed = +e.target.value; save(); } };
  $("simGps").onclick = () => pick("Toca el mapa para simular dónde estás", (lat, lng) => { simFix(lat, lng); draw(); });
  $("resetAll").onclick = () => { if ($("resetAll").dataset.c) resetAll(); else { $("resetAll").dataset.c = 1; $("resetAll").textContent = "Toca otra vez para confirmar"; } };
}
function pick(text, cb) { $("pickbar").hidden = false; $("picktext").textContent = text; if (window.innerWidth <= 900) $("mapwrap").scrollIntoView({ behavior: "smooth" }); startPick((lat, lng) => { $("pickbar").hidden = true; cb(lat, lng); }); }
$("pickcancel").onclick = () => { $("pickbar").hidden = true; mapState.pick = null; };

// ---------- scrub ----------
export function renderScrub() { const t = +$("scrub").value; $("scrubT").textContent = fmt(t);
  $("scrubW").innerHTML = S.runners.map(r => { const o = proj(r); const k = (t - o.start) < 0 ? -1 : null; const km = k == null ? kmAtSafe(o, t) : -1; const tx = km < 0 ? "aún no sale" : km > 42.2 ? "terminó" : `km ${km.toFixed(1)}`; return `<span><span class="dot" style="background:${r.color}"></span>${esc(short(r.name))}: ${tx}</span>`; }).join(""); }
import { kmAt as kmAtP } from "./pace.js";
const kmAtSafe = (o, t) => kmAtP(o, t);
$("scrub").addEventListener("input", () => { S.scrub = +$("scrub").value; mapState.time = S.scrub; save(); renderScrub(); draw(); });

// ---------- toasts ----------
on("toast", ({ msg, level }) => { const d = document.createElement("div"); d.className = "toast " + (level || ""); d.textContent = msg; $("toasts").prepend(d); setTimeout(() => d.remove(), level === "late" ? 12000 : 7000); while ($("toasts").children.length > 1) $("toasts").lastChild.remove(); });
