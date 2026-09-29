// Tiny i18n: Spanish source strings are the keys; English lives in EN. Switching language reloads the app.
import { S, save } from "./state.js";
import { EN } from "./i18n-en.js";

export function lang() {
  if (S.lang === "es" || S.lang === "en") return S.lang;
  return (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
}
export function setLang(l) { S.lang = l; save(); location.reload(); }
export function t(s, v) {
  let x = lang() === "en" ? (EN[s] ?? s) : s;
  if (v) x = x.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
  return x;
}
// plural helper: t2(n, "{n} parada", "{n} paradas")
export const t2 = (n, one, many, v) => t(n === 1 ? one : many, Object.assign({ n }, v || {}));
// apply to static markup: data-i18n (textContent), data-i18n-aria (aria-label), data-i18n-ph (placeholder)
export function applyStatic(root) {
  (root || document).querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  (root || document).querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  (root || document).querySelectorAll("[data-i18n-ph]").forEach(el => { el.setAttribute("placeholder", t(el.dataset.i18nPh)); });
  document.documentElement.lang = lang();
}
