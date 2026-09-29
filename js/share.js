// Share the whole porra setup (start point, runners, plan, chosen transfers) as a link — no server needed
import { S, save, emit, esc } from "./state.js";
import { t } from "./i18n.js";
import { setStart, place } from "./engine.js";

const b64u = {
  enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))
};
export function encodePlan() {
  const st = S.start ? [S.start.name, +S.start.lat.toFixed(5), +S.start.lng.toFixed(5), S.start.address || ""] : null;
  const data = { v: 1, s: st, r: S.runners.map(r => [r.name, r.bib || "", r.corral, r.goal, r.prio, r.color]), p: S.plan || [], c: S.choice || {} };
  return b64u.enc(JSON.stringify(data));
}
export function shareURL() { return location.origin + location.pathname + "#plan=" + encodePlan(); }
export async function sharePlan() {
  const url = shareURL();
  const names = S.runners.filter(r => r.prio !== 3).map(r => r.name).join(", ");
  const text = t("Mi plan de porra para el Maratón de Chicago ({r}). Ábrelo y ya tienes los corredores y los puntos:", { r: names });
  try {
    if (navigator.share) { await navigator.share({ title: "Cheer Crew · Chicago", text, url }); return; }
    await navigator.clipboard.writeText(text + " " + url); emit("toast", { msg: t("Link copiado. Pégalo en el chat de tu porra."), level: "ok" });
  } catch (e) {
    if (e && e.name === "AbortError") return;
    prompt("", url); // fallback for browsers without clipboard access
  }
}
function decode(h) { try { const d = JSON.parse(b64u.dec(h)); return d && d.v === 1 ? d : null; } catch (e) { return null; } }
// Called at boot; shows a confirmation sheet if the URL carries a shared plan
export function checkImport(onDone) {
  const m = /#plan=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return false;
  const d = decode(m[1]); history.replaceState(null, "", location.pathname);
  if (!d) { emit("toast", { msg: t("El link del plan no es válido."), level: "tight" }); return false; }
  const sheet = document.getElementById("sheet");
  const who = d.r.map(r => `<li><span class="dot" style="background:${esc(r[5])}"></span><b>${esc(r[0])}</b>${r[1] ? " #" + esc(r[1]) : ""} · ${esc(t("Corral {c}", { c: r[2] }))} · ${esc(r[3])}</li>`).join("");
  sheet.innerHTML = `<div class="sheetbox" role="dialog" aria-modal="true" aria-labelledby="imTitle"><h2 id="imTitle">${esc(t("Te compartieron un plan de porra"))}</h2>
    <ul class="facts">${who}</ul><p class="note">${esc(t("{n} puntos para animar · salida: {s}", { n: d.p.length, s: d.s ? d.s[0] : t("Grant Park (salida)") }))}</p>
    ${S.runners.length ? `<p class="note">${esc(t("Esto reemplaza los corredores y el plan que tienes ahora."))}</p>` : ""}
    <div class="btnrow"><button class="btn primary" id="imOk">${esc(t("Cargar plan"))}</button><button class="btn" id="imNo">${esc(t("Ignorar"))}</button></div></div>`;
  sheet.hidden = false;
  document.getElementById("imNo").onclick = () => { sheet.hidden = true; onDone(false); };
  document.getElementById("imOk").onclick = () => {
    S.runners = d.r.map((r, i) => ({ id: Math.random().toString(36).slice(2, 9), name: r[0], bib: r[1], corral: r[2], goal: r[3], prio: r[4], color: r[5], splits: {} }));
    S.start = d.s ? { name: d.s[0], lat: d.s[1], lng: d.s[2], address: d.s[3] } : null; setStart(S.start);
    S.plan = d.p; S.choice = d.c || {}; S.onboarded = true; save();
    sheet.hidden = true; emit("toast", { msg: t("Plan cargado."), level: "ok" }); onDone(true);
  };
  return true;
}
