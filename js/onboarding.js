// First-run guided setup: language → start point → runners → plan
import { S, save, esc, parseHM, fmt, newRunner, emit } from "./state.js";
import { t, lang, setLang } from "./i18n.js";
import { CORRALS, corralForGoal } from "./race-chicago.js";
import { place, setStart } from "./engine.js";
import { optimize, planLegs, invalidatePlan } from "./plan.js";
import { invalidatePace } from "./pace.js";
import { renderAll, openTab, corralOptions, searchPlaces, setStartTo, pick, PR } from "./ui.js";
import { sharePlan } from "./share.js";

const $ = id => document.getElementById(id);
let step = 0, draft = [];
const sheet = () => $("sheet");
export function openWizard(at) {
  draft = S.runners.length ? S.runners.map(r => Object.assign({}, r, { splits: r.splits })) : [newRunner(0)];
  step = at != null ? at : (S.lang ? 1 : 0); show();
}
function close() { sheet().hidden = true; }
function frame(title, body, foot) {
  const dots = [1, 2, 3].map(n => `<span class="wdot${n === step ? " on" : n < step ? " done" : ""}"></span>`).join("");
  sheet().innerHTML = `<div class="sheetbox wiz" role="dialog" aria-modal="true" aria-labelledby="wzT">
    <div class="wtop"><span class="brand">Cheer Crew</span>${step ? `<span class="wdots" aria-label="${esc(t("Paso {n} de 3", { n: step }))}">${dots}</span>` : ""}<button class="x" id="wzX" aria-label="${esc(t("Cerrar"))}">×</button></div>
    <h2 id="wzT">${title}</h2>${body}<div class="btnrow wfoot">${foot}</div></div>`;
  sheet().hidden = false; $("wzX").onclick = close;
}
function show() {
  if (step === 0) {
    frame(esc(t("Tu asistente de porra para el Maratón de Chicago")),
      `<p class="note">${esc(t("Te decimos dónde pararte para ver a tus corredores varias veces, cómo moverte en el metro sin cruzar la ruta y, el día de la carrera, si vas a tiempo."))}</p>
       <div class="seg" style="margin-top:4px"><button id="wEs" aria-pressed="${lang() === "es"}">Español</button><button id="wEn" aria-pressed="${lang() === "en"}">English</button></div>`,
      `<button class="btn primary" id="wNext">${esc(t("Empezar"))}</button>`);
    $("wEs").onclick = () => { S.lang = "es"; save(); if (lang() !== "es") setLang("es"); else { step = 1; show(); } };
    $("wEn").onclick = () => { if (lang() !== "en") { S.onboarding = true; setLang("en"); } else { S.lang = "en"; save(); step = 1; show(); } };
    $("wNext").onclick = () => { S.lang = lang(); save(); step = 1; show(); };
    return;
  }
  if (step === 1) {
    const st = place("start");
    frame(esc(t("¿Dónde te vas a quedar?")),
      `<p class="note">${esc(t("Desde ahí calculamos a qué hora salir hacia el primer punto."))}</p>
       <div class="kv"><span class="small">${esc(t("Salida"))}</span><b id="wStart">${esc(st.name)}${st.isDefault ? ` <span class="small">(${esc(t("por defecto"))})</span>` : ""}</b></div>
       <div class="btnrow"><input type="text" id="wq" placeholder="${esc(t("Nombre del hotel o dirección"))}" style="flex:1;min-width:170px" aria-label="${esc(t("Buscar hotel"))}"><button class="btn" id="wqgo">${esc(t("Buscar"))}</button></div>
       <div class="searchres" id="wqres"></div>
       <div class="btnrow"><button class="btn sm" id="wPick">${esc(t("Elegir en el mapa"))}</button><button class="btn sm" id="wGps">${esc(t("Usar mi ubicación"))}</button></div>`,
      `<button class="btn" id="wBack">${esc(t("Atrás"))}</button><button class="btn primary" id="wNext">${esc(t("Siguiente"))}</button>`);
    const setName = n => { $("wStart").textContent = n; };
    $("wqgo").onclick = async () => { const q = $("wq").value.trim(); if (!q) return; $("wqres").innerHTML = `<span class="small">${esc(t("Buscando…"))}</span>`;
      try { const res = await searchPlaces(q);
        $("wqres").innerHTML = res.length ? res.map((x, j) => `<button data-j="${j}"><b>${esc(x.name)}</b><br><span class="small">${esc(x.full)}</span></button>`).join("") : `<span class="small">${esc(t("Sin resultados. Prueba “Elegir en el mapa”."))}</span>`;
        $("wqres").querySelectorAll("[data-j]").forEach(b => b.onclick = () => { const x = res[+b.dataset.j]; setStartTo(x.name, x.lat, x.lng, x.address); setName(x.name); $("wqres").innerHTML = ""; });
      } catch (e) { $("wqres").innerHTML = `<span class="small">${esc(t("No se pudo buscar (¿sin internet?). Usa “Elegir en el mapa”."))}</span>`; } };
    $("wq").onkeydown = e => { if (e.key === "Enter") $("wqgo").click(); };
    $("wPick").onclick = () => { close(); pick(t("Toca el mapa donde está tu hotel"), (lat, lng) => { setStartTo(t("Mi punto de salida"), lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`); renderAll(); show(); }); };
    $("wGps").onclick = () => navigator.geolocation?.getCurrentPosition(p => { setStartTo(t("Mi ubicación"), p.coords.latitude, p.coords.longitude, "GPS"); setName(t("Mi ubicación")); }, () => emit("toast", { msg: t("No se pudo leer tu ubicación."), level: "tight" }), { enableHighAccuracy: true, timeout: 15000 });
    $("wBack").onclick = () => { step = 0; show(); };
    $("wNext").onclick = () => { step = 2; show(); };
    return;
  }
  if (step === 2) {
    const rows = draft.map((r, i) => `<div class="wr" data-i="${i}"><div class="wrh"><span class="sw" style="background:${r.color}"></span><input type="text" data-f="name" value="${esc(r.name)}" placeholder="${esc(t("Nombre"))}" aria-label="${esc(t("Nombre"))}">${draft.length > 1 ? `<button class="x" data-del="${i}" aria-label="${esc(t("Quitar"))}">×</button>` : ""}</div>
      <div class="grid2"><label>${esc(t("Número (bib)"))}<input type="text" inputmode="numeric" data-f="bib" value="${esc(r.bib)}"></label>
      <label>${esc(t("Tiempo objetivo (h:mm)"))}<input type="text" inputmode="numeric" data-f="goal" value="${esc(r.goal)}"></label>
      <label style="grid-column:1/-1">${esc(t("Corral (viene en su número)"))}<select data-f="corral">${corralOptions(r.corral)}</select></label></div>
      <div class="seg" role="group" aria-label="${esc(t("Prioridad"))}">${[1, 2, 3].map(p => `<button data-prio="${p}" aria-pressed="${r.prio === p}">${esc(t(PR[p]))}</button>`).join("")}</div></div>`).join("");
    frame(esc(t("¿A quién vas a animar?")),
      `<p class="note">${t("<b>Principal</b>: lo ves en cada punto. <b>Si se puede</b>: se suma cuando coincide. <b>Solo seguir</b>: lo ves en el mapa.")}</p><div class="wrs">${rows}</div>
       <button class="btn" id="wAdd">${esc(t("+ Agregar otro corredor"))}</button>`,
      `<button class="btn" id="wBack">${esc(t("Atrás"))}</button><button class="btn primary" id="wNext">${esc(t("Armar mi plan"))}</button>`);
    sheet().querySelectorAll(".wr").forEach(row => { const r = draft[+row.dataset.i];
      row.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("change", () => { r[inp.dataset.f] = inp.value.trim(); if (inp.dataset.f === "corral") r._corralSet = true;
        if (inp.dataset.f === "goal" && !r._corralSet) { const g = parseHM(inp.value); if (g) { r.corral = corralForGoal(g); row.querySelector("[data-f=corral]").value = r.corral; } } }));
      row.querySelectorAll("[data-prio]").forEach(b => b.onclick = () => { r.prio = +b.dataset.prio; row.querySelectorAll("[data-prio]").forEach(x => x.setAttribute("aria-pressed", x === b)); }); });
    sheet().querySelectorAll("[data-del]").forEach(b => b.onclick = () => { draft.splice(+b.dataset.del, 1); show(); });
    $("wAdd").onclick = () => { collect(); draft.push(newRunner(draft.length)); show(); setTimeout(() => { const l = sheet().querySelectorAll(".wr input[data-f=name]"); l[l.length - 1]?.focus(); }, 30); };
    $("wBack").onclick = () => { collect(); step = 1; show(); };
    $("wNext").onclick = () => { collect(); const ok = draft.filter(r => r.name.trim());
      if (!ok.length) { emit("toast", { msg: t("Escribe el nombre de al menos un corredor."), level: "tight" }); return; }
      ok.forEach(r => { if (!parseHM(r.goal)) r.goal = "4:30"; delete r._corralSet; });
      if (!ok.some(r => r.prio === 1)) ok[0].prio = 1;
      S.runners = ok; invalidatePace(); invalidatePlan(); S.plan = optimize(); S.choice = {}; save(); step = 3; show(); };
    return;
  }
  if (step === 3) {
    renderAll(); const legs = planLegs();
    const list = legs.map((l, i) => `<li><b>${i + 1}. ${esc(l.b.name)}</b> · ${esc(t("Milla"))} ${l.b.mile.toFixed(1)}${l.first ? " · " + esc(t("sal a las {h}", { h: fmt(l.depart) })) : ""}</li>`).join("");
    frame(esc(t("Tu plan está listo")),
      `<p class="note">${esc(t("Vas a ver a tus corredores en {n} puntos. Puedes cambiar puntos y traslados cuando quieras.", { n: legs.length }))}</p><ul class="facts">${list}</ul>
       <p class="note">${esc(t("Mándale el link a tu porra: lo abren y ya tienen los mismos corredores y puntos."))}</p>`,
      `<button class="btn" id="wShare">${esc(t("Compartir con mi porra"))}</button><button class="btn primary" id="wDone">${esc(t("Ver mi plan"))}</button>`);
    $("wShare").onclick = () => sharePlan();
    $("wDone").onclick = () => { S.onboarded = true; save(); close(); openTab("plan"); };
  }
}
function collect() {
  sheet().querySelectorAll(".wr").forEach(row => { const r = draft[+row.dataset.i]; row.querySelectorAll("[data-f]").forEach(inp => { r[inp.dataset.f] = inp.value.trim(); }); });
}
