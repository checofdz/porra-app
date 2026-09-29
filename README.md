# Cheer Crew · Chicago Marathon 2026

Asistente web (PWA) para porras: dónde ver a tus corredores, cómo moverte entre puntos sin cruzar el recorrido y si vas a tiempo en vivo.

Live: https://cheer.elevatesports.group

## Qué hace (etapa 1 · Chicago)
- **Mapa de calles reales** (City of Chicago Street Center Lines) con la ruta 2026, estaciones y líneas del “L”.
- **Varios corredores con prioridad**: *Principal* (los ves en cada punto), *Si se puede* (suman cuando coinciden), *Solo seguir* (mapa y en vivo).
- **Proyección de ritmo**: con cada split (tapetes cada 5K + medio) calcula promedio y último tramo; el último tramo pesa 65 % para detectar si el corredor aprieta o baja. Ventana rápida/lenta ±% y desgaste después del km 30.
- **Plan optimizado**: máximo de puntos donde ves a todos los principales, desempate por vistas de “si se puede” y holgura.
- **Traslados**: caminatas sobre calles reales, el recorrido como barrera (cruces con penalización), metro con esperas de domingo y trasbordos. Varias opciones por tramo; eliges una.
- **En vivo**: GPS del teléfono → tiempo real al siguiente punto, holgura real vs. la hora en que pasa el primero, paradas que faltan en el metro, detección de atraso y alternativas si ya no llegas.
- **Avisos**: sal ya, vas justo / no llegas, faltan N paradas, bájate, tu corredor llega en ~5 min, ¿ya pasó el 15K?, split registrado con nuevo ritmo.
- **Bienvenida guiada** (hotel → corredores con corral → plan), **español / inglés**, **compartir plan por link** y **alarma** con cuenta regresiva cuando llega tu corredor.
- **Tu ritmo como variable**: caminando / caminata rápida / trotando / corriendo, global o por traslado. Cada traslado que no alcanza te dice la velocidad mínima necesaria.
- **Juega con los puntos**: cada punto muestra si cabe, si cabe trotando o si no cabe; toca la ruta en el mapa para crear tu propio punto.
- **En vivo**: tu velocidad por GPS vs. la necesaria, con aviso para acelerar; compartir estado incluye tu ubicación.
- **Simulación** de día de carrera (reloj acelerado + ubicación simulada) para probar antes del 11 de octubre.
- Funciona sin señal después de abrirla una vez (service worker).

## Estructura
```
index.html            shell de la app
css/app.css           estilos (tema claro/oscuro)
js/race-chicago.js    configuración de la carrera (olas, tapetes, puntos, líneas CTA)
js/state.js           estado persistente + reloj (hora de Chicago / simulación)
js/engine.js          red peatonal, barrera del recorrido, metro, opciones de ruta
js/pace.js            proyección de ritmo por corredor
js/plan.js            prioridades, ventanas por punto, optimizador
js/map.js             mapa SVG
js/live.js            GPS, ETA en vivo, progreso en metro, reglas de avisos
js/ui.js              paneles
js/onboarding.js      bienvenida en 3 pasos
js/share.js           compartir / importar plan por link (#plan=…)
js/alarm.js           alarma de llegada (sonido, vibración, cuenta regresiva)
js/i18n.js, i18n-en.js  idiomas (las llaves son el texto en español)
data/mapdata.json     calles, etiquetas, costa, río, ruta calibrada
data/walkgraph.json   grafo peatonal con lados del recorrido
sw.js, manifest.webmanifest, icons/
```

## Deploy en Vercel
Es un sitio estático: **Add New → Project → Import** este repo. Framework preset: *Other*. Sin build command. Output: raíz del repo. Después agrega tu dominio en *Settings → Domains*.

## Datos en vivo de los corredores
No hay API pública de la app oficial (TCS) ni de la web de resultados (mika:timing), y la web de resultados no permite lectura automática (robots.txt). En la etapa 1 los splits se registran con un toque cuando llega la notificación de la app oficial. Ver `docs/DATOS-OFICIALES.md` para la solicitud de acceso.

## Probar localmente
```
python3 -m http.server 8080
# abre http://localhost:8080 → Ajustes → Iniciar simulación
```
