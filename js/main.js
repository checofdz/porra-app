import { S, save, on, now } from "./state.js";
import { initEngine } from "./engine.js";
import { optimize } from "./plan.js";
import { initMap, draw, goView, focusLL, mapState } from "./map.js";
import { renderAll, renderLive, openTab, toggleSpot, tickClock, renderScrub } from "./ui.js";
import { startLive, L } from "./live.js";

const $ = id => document.getElementById(id);

async function boot() {
  const [md, wg] = await Promise.all([fetch("data/mapdata.json").then(r => r.json()), fetch("data/walkgraph.json").then(r => r.json())]);
  initEngine(md, wg);
  if (!S.plan) { S.plan = optimize(); save(); }
  initMap($("map"));
  if (S.scrub == null) S.scrub = 540;
  $("scrub").value = S.scrub; mapState.time = S.live.on ? null : S.scrub;
  if (window.innerWidth > 900) $("legend").open = true;
  // map controls
  $("zin").onclick = () => window.zoomMap(1 / 1.5); $("zout").onclick = () => window.zoomMap(1.5);
  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => goView(b.dataset.view));
  $("vMe").onclick = () => { if (L.gps) { mapState.follow = true; focusLL(L.gps.lat, L.gps.lng, 150); } else goView("all"); };
  const sync = () => { $("tgStreets").setAttribute("aria-pressed", S.streets); $("tgCTA").setAttribute("aria-pressed", S.cta); };
  $("tgStreets").onclick = () => { S.streets = !S.streets; save(); sync(); draw(); };
  $("tgCTA").onclick = () => { S.cta = !S.cta; save(); sync(); draw(); }; sync();
  let rs; window.addEventListener("resize", () => { clearTimeout(rs); rs = setTimeout(draw, 120); });
  on("togglespot", id => toggleSpot(id));
  on("live", () => { if (S.live.on) mapState.time = null; if (!$("pane-live").hidden) renderLive(); if (mapState.follow && L.gps) focusLL(L.gps.lat, L.gps.lng, 150); else draw(); });
  requestAnimationFrame(() => {
    goView("all"); renderAll();
    openTab(S.tab || (S.live.on ? "live" : "plan"));
    if (S.live.on) startLive();
  });
  tickClock(); setInterval(tickClock, 1000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot().catch(e => { document.getElementById("pane-plan").innerHTML = `<p class="note">No se pudo cargar la app: ${e.message}. Revisa tu conexión y recarga.</p>`; console.error(e); });
