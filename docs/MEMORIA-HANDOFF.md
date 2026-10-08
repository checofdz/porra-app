# MEMORIA · Cheer Crew (handoff para continuar)

Estado al jueves 8 oct 2026, 15:00 CDMX. La carrera es el **domingo 11 oct 2026** (Chicago, hora del centro de EE. UU.). Último commit: `e454c6a` en `checofdz/porra-app` (main). Todo está publicado.

## Qué es
**Cheer Crew** es una PWA para "porras" (espectadores) del Maratón de Chicago. Checo va a animar a sus corredores. La app:

- **Planea** dónde verlos varias veces y cómo moverse entre puntos a pie o en CTA ("L") **sin cruzar el recorrido**.
- **Corredores:** maneja varios con prioridad: *Principal* (verlos en cada punto), *Si se puede* (suman cuando coinciden) y *Solo seguir*.
- **Ritmo del corredor:** lo proyecta con sus splits. El último tramo pesa 65 % y el promedio 35 %; hay una ventana ±% y desgaste después del km 30.
- **Ritmo del espectador:** caminando 72, caminata rápida 95, trotando 135 o corriendo 170 m/min, global o por traslado. Dice la velocidad necesaria para llegar.
- **Modo en vivo:**
  - GPS del espectador.
  - Holgura real.
  - Paradas del metro que faltan.
  - Alertas y notificaciones.
  - Alarma con cuenta regresiva cuando llega el corredor.
  - Wake lock.
- **Ubicación real del corredor:** con su celular y OwnTracks, detecta sola la salida y los checkpoints (nuevo, ver abajo).
- **Extras:** español/inglés, bienvenida guiada, compartir plan por link (`#plan=` en base64url), puntos propios tocando la ruta en el mapa, simulación del día de carrera.

**Visión (etapa 2, NO ahora):** plataforma multi-carrera, porras con ubicación compartida, push del servidor y CTA Train Tracker en tiempo real.

## Infra
- **Repo:** `checofdz/porra-app`, rama main.
- **Vercel:** publica solo en cada push. Dominio `cheer.elevatesports.group` (CNAME `cheer` en GoDaddy hacia Vercel).
- **Local:** Checo trabaja en VS Code (repo clonado en Documentos) y prueba con `python -m http.server 8080`. Ojo: ese servidor **no** corre `/api`. Desde localhost la app usa la API de producción automáticamente (`apiBase()` en `js/track.js`).
- **Storage:** Upstash Redis vía la integración de Vercel (Storage → Upstash for Redis → Connect). La función detecta `KV_REST_API_URL` y `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_*`). **Pendiente confirmar** que Checo la conectó: `https://cheer.elevatesports.group/api/pos?ping=1` debe dar `"storage":true`.

## Archivos (≈2,800 líneas, sin build)
| Archivo | Qué hace |
|---|---|
| `index.html` | Shell. Pestañas En vivo / Plan / Traslados / Corredores / Ajustes, más mapa SVG |
| `js/main.js` | Boot: carga `data/*.json`, `initEngine`, mapa, render, importar plan, wizard, `startTracking()`, SW |
| `js/state.js` | Estado en localStorage (key `porra:chicago-2026:v2`), bus de eventos `on`/`emit`, reloj de Chicago `now()` con simulación `setSim`, `raceTime(ms)`, `fmt`, `esc`, `parseHM` |
| `js/race-chicago.js` | Configuración de la carrera; detalle en la lista de abajo |
| `js/engine.js` | Proyección `P`/`unP`, recorrido `C` ([lat,lng,km], calibrado a millas oficiales), red peatonal CSR con banquetas izq/der y cruces (+4 min, penalización 30), Dijkstra, red CTA, `options()`, `optSteps()`, `PACES`, `rtAt`, `neededMpm`, puntos propios |
| `js/pace.js` | `points`, `proj` (proyección por corredor), `at(o, km, fast/plan/slow)`, `kmAt`, `nextCP`, `overdue`. **Ancla GPS:** `setLivePoint`, `livePoint`, `rawAge` |
| `js/plan.js` | `groups()`, `windowAt()`, `mkLeg` (holgura **real**, sin restar margen; `need`/`needBuf`), `planLegs`, optimizador DP sobre (punto, banqueta) |
| `js/live.js` | GPS del espectador, fases pre/walk/wait/ride/arrived, `compute()`, reglas de alertas, `recordSplit`/`clearSplit`, `notify`, wake lock |
| `js/track.js` | **Seguimiento OwnTracks** (detalle abajo) |
| `js/ui.js` | Render de paneles, chips (Llegas X min antes / Llegas justo / No llegas · X tarde), bloque "📡 Ubicación en vivo", hoja de QR/WhatsApp, `refreshTrackChips` |
| `js/map.js` | Mapa SVG: calles, CTA, recorrido, puntos, corredores (punto por proyección más aro punteado en posición GPS real), pan/zoom |
| `js/onboarding.js`, `share.js`, `alarm.js`, `i18n.js`, `i18n-en.js` | Wizard, compartir plan, alarma, traducción (las claves son el texto en español) |
| `js/vendor/qrcode.js` | qrcode-generator 1.4.4 (MIT) como ES module |
| `api/pos.js` | Función Vercel (CommonJS, sin dependencias) |
| `runner.html` | Página para el celular del corredor (ES/EN) |
| `sw.js` | Service worker; versión actual **`cheer-chi26-v5`**. No intercepta `/api/` |
| `tools/` | Pipeline Python que generó `data/mapdata.json` y `data/walkgraph.json` (no tocar) |
| `docs/` | SEGUIMIENTO.md, DATOS-OFICIALES.md (con borrador de correo a office@chicagomarathon.com), ROADMAP.md |

`js/race-chicago.js` contiene:
- **RACE:** fecha 2026-10-11, tz America/Chicago, salida por default en Grant Park.
- **Olas:** `WAVE_T` = hp 7:32, ola 1 7:35, ola 2 8:00, ola 3 8:35.
- **Corrales:** `CORRALS` A–N (sin I), con su ola y un retraso estimado.
- **Checkpoints:** `CPS` cada 5K, el medio maratón y la meta.
- **Puntos:** `SPOTM`, los puntos para animar.
- **Red CTA:** `ST`, `LN`, `HW`, `RUNS`, `XFERS`.

## Seguimiento real del corredor (lo último)
**Flujo:**
1. El corredor instala **OwnTracks** (iOS/Android, gratis) en modo HTTP.
2. OwnTracks hace `POST /api/pos?w=<token de escritura>`.
3. La función guarda en Redis la lista `trk:<id>`, con `id = sha256(w)[:24]`, hasta 3000 puntos y TTL de 14 días. Cada punto: `[ms, lat, lon, acc, vel, batt, recibido_ms]`. Responde `[]`.
4. La app hace `GET /api/pos?id=a,b&since=<recibido_ms>` cada 15 s.
5. `GET ?ping=1` es el health check. Sin storage → 503 (OwnTracks reintenta).

**En la app:**
- Corredores → **Seguir con su celular** genera `r.trk = {w, id}` y abre la hoja con QR, WhatsApp y el link.
- El link apunta a `https://cheer.elevatesports.group/runner#w=…&n=…&tid=…&l=…`. Esa página tiene un botón `owntracks:///config?inline=<base64 JSON>`: `mode:3`, `url`, `monitoring:2` (Move), `locatorDisplacement 50`, `locatorInterval 30`, `moveModeLocatorInterval 15`. También trae pasos manuales y muestra el estado en vivo.
- **Privacidad del link de plan:** compartir el plan solo lleva el **id de lectura** (`r[6]`), nunca `w`.

**Qué hace `track.js` con los puntos:**
- **Recorrido:** proyecta al recorrido con ventana monótona (no retrocede, máx. 30 km/h). Ignora precisión peor de 120 m. Tolerancia 45 m + precisión.
- **Salida:** pasar del corral (detrás de la línea en Columbus) a más de 0.15 km, interpolado. Nunca antes del disparo de su ola menos 3 min.
- **Si empezó tarde:** se engancha donde la hora diga que puede estar y calcula la salida hacia atrás con su ritmo real. Queda marcado `auto=2` ("GPS ≈").
- **Checkpoints:** interpolados y guardados en `r.splits`, con `r.auto[k]=1`. **Un split manual siempre gana.** Al dejar de seguir se borran solo los automáticos.
- **Ritmo reciente:** el de los últimos ~3 km alimenta `proj` (`basis "gps"`). El ancla de posición se usa desde el km 1.
- **Avisos:**
  - checkpoint nuevo: solo si pasó hace menos de 15 min, para no repetir avisos al recargar;
  - sin señal más de 6 min.
- **Fechas:** solo los puntos del 11 oct (hora de Chicago) generan splits. En simulación cuenta cualquier día.

**Probado con Playwright** (servidor local con el handler real y Upstash falso):
- Salida 8:14:00 detectada exacta.
- 5K y 10K exactos.
- Arranque tardío: salida calculada exacta.
- Carrera completa: meta con error de 0.1 min.
- Link compartido sin `w`.
- Apagar seguimiento conserva el split manual.

## Decisiones tomadas (no reabrir)
- **Holgura:** `slack` es la holgura **real**. El margen (`S.buf`) solo sirve para marcar "justo" en amarillo y sugerir ir más rápido. "No llegas" solo cuando de verdad llegas tarde.
- **Sin datos oficiales:** no hay API pública y no se hace scraping (mika:timing / results están prohibidos por robots). Sin celular, el respaldo son los splits manuales que la porra toca en "Pasó 10K".
- **Rastreadores descartados:** AirTag, Garmin LiveTrack, Strava Beacon y ubicación de WhatsApp/Google no tienen API. Por eso se usa OwnTracks.
- **Sin dependencias:** nada de frameworks ni npm en el front.

## CHECKLIST antes del domingo (prioridad)
1. **Storage:** `…/api/pos?ping=1` → `"storage":true`. Si es `false`: Vercel → Storage → Upstash → Connect al proyecto → Redeploy.
2. **Prueba real con un celular (lo más importante; aún no probado en dispositivo):** activar el seguimiento de un corredor, abrir el link en su iPhone o Android, tocar "Conectar OwnTracks" y confirmar que importa la configuración. Luego caminar 10 min y ver "Último dato hace…" en la app y el aro en el mapa.
   - **Si el botón no importa:** usar la configuración manual de la página (Modo HTTP + URL) y avisar para corregir `runner.html`.
   - **Si llega 403:** el token no viaja en la URL.
   - **Si llega 502:** error de storage.
   - **Si llega 200 sin datos:** revisar que el body tenga `_type: "location"`. En Vercel, `req.body` puede venir ya parseado; `readBody` lo maneja.
3. **Cada corredor** hace la prueba y confirma "¡Te vemos!" en su página. El día de la carrera: batería al 100 %, modo **Move**, no cerrar OwnTracks.
4. **Celular de Checo:** abrir la app, recargar (para tomar el SW v5), agregarla a la pantalla de inicio (en iPhone es necesario para las notificaciones), activar notificaciones y mantener la pantalla encendida.
5. **Plan:** revisar el plan final y compartir el link con la porra. Probar que, al abrirlo en otro teléfono, los corredores con seguimiento muestran "Seguimiento compartido".
6. **Ensayo:** Ajustes → simulación a las 8:00 ×10 → modo en vivo, para revisar avisos, alarma y "Ya los vi".
7. **Plan B sin señal:** la app funciona offline después de abrirla una vez, pero el seguimiento GPS necesita datos. Sin ellos, usar los botones "Pasó 5K/10K" con la app oficial (TCS).

## Riesgos conocidos
- No probado todavía: la importación `owntracks:///config?inline=` en un teléfono real y el handler en el runtime real de Vercel. Localmente sí se probó.
- GPS entre los edificios del Loop: hay filtros, pero podría haber huecos. La app extrapola con el ritmo.
- Batería del corredor en modo Move durante 4–5 h.
- iOS puede pausar OwnTracks si el usuario la cierra deslizando, o con el modo de bajo consumo.
- El reloj de la app usa la hora de Chicago aunque el teléfono esté en hora de CDMX (es correcto).

## Cómo probar (para el siguiente desarrollador)
- **Servidor local con API:** un `node` que sirva estáticos más `/api/pos` usando `require("./api/pos.js")`, con un Upstash falso (POST `/pipeline` con LPUSH/LTRIM/EXPIRE/LRANGE) y las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` apuntando a él.
- **En el navegador:** `window.CHEER_API = ""` y `window.CHEER_SITE = location.origin` (con `addInitScript`) para no pegarle a producción.
- **Reloj:** `(await import('/js/state.js')).setSim(true, minutosDelDía, velocidad)`.
- **Puntos de prueba:** mandar POSTs con `tst` en epoch tales que la hora en Chicago coincida con el reloj simulado.
