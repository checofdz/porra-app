// Arrival alarm: countdown overlay + sound + vibration when a runner is ~3 min from your spot
import { S, on, now, fmt, esc } from "./state.js";
import { t } from "./i18n.js";
import { markRunnerSeen } from "./live.js";

let ctx = null, timer = null, cur = null; const muted = new Set();
// audio must be unlocked by a user gesture (iOS)
const unlock = () => { try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch (e) {} };
document.addEventListener("pointerdown", unlock, { passive: true });
function beep(times, freq, dur) {
  if (!S.sound || !ctx) return;
  for (let i = 0; i < times; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "square"; o.frequency.value = freq || 880;
    const t0 = ctx.currentTime + i * ((dur || 0.18) + 0.12); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.18));
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + (dur || 0.18) + 0.02);
  }
}
const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

on("alarm", a => {
  const key = a.spot.id + ":" + a.r.id; if (muted.has(key)) return;
  if (cur && cur.key === key) { cur.fast = a.fast; cur.slow = a.slow; return; }
  if (cur && cur.fast <= a.fast) return; // keep the most urgent one on screen
  cur = { key, r: a.r, spot: a.spot, fast: a.fast, slow: a.slow, marks: {} };
  render(); clearInterval(timer); timer = setInterval(render, 1000);
});
function render() {
  const el = document.getElementById("alarm"); if (!cur) { el.hidden = true; return; }
  const n = now(); const secs = Math.round((cur.fast - n) * 60);
  if (n > cur.slow + 3) { stop(); return; }
  // sound marks at 3:00, 1:00 and arrival
  const mark = (k, cond, fn) => { if (cond && !cur.marks[k]) { cur.marks[k] = 1; fn(); } };
  mark("m3", secs <= 180, () => { beep(2, 880); vib([200, 100, 200]); });
  mark("m1", secs <= 60, () => { beep(3, 988); vib([300, 120, 300, 120, 300]); });
  mark("m0", secs <= 0, () => { beep(5, 1175, 0.25); vib([600, 150, 600, 150, 600]); });
  const cd = secs > 0 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : t("¡Ya!");
  el.style.setProperty("--rc", cur.r.color);
  el.innerHTML = `<div class="alarmbox" role="alertdialog" aria-live="assertive" aria-labelledby="alT">
    <div class="alsub">${esc(cur.spot.name)}</div>
    <div class="alname" id="alT"><span class="sw"></span>${esc(secs > 0 ? t("¡Ahí viene {r}!", { r: cur.r.name }) : t("¡{r} está pasando!", { r: cur.r.name }))}</div>
    <div class="alcd">${cd}</div>
    <div class="alsub">${esc(t("Ventana {a}–{b}", { a: fmt(cur.fast), b: fmt(cur.slow) }))}${cur.r.bib ? " · #" + esc(cur.r.bib) : ""}</div>
    <div class="btnrow"><button class="btn primary" id="alSeen">${esc(t("¡Ya lo vi!"))}</button><button class="btn" id="alMute">${esc(t("Ocultar"))}</button></div></div>`;
  el.hidden = false;
  document.getElementById("alSeen").onclick = () => { const c = cur; stop(); markRunnerSeen(c.spot.id, c.r.id); };
  document.getElementById("alMute").onclick = () => { muted.add(cur.key); stop(); };
}
function stop() { clearInterval(timer); timer = null; cur = null; const el = document.getElementById("alarm"); el.hidden = true; el.innerHTML = ""; }
