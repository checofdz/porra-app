# Seguimiento en vivo del corredor (OwnTracks)

## Cómo funciona

```
Celular del corredor (OwnTracks, modo HTTP)
   │  POST /api/pos?w=<token de escritura>     cada ~15–30 s, en segundo plano
   ▼
Vercel · api/pos.js  ──►  Upstash Redis (lista trk:<id>, últimos 3000 puntos, expira en 14 días)
   ▲
   │  GET /api/pos?id=<id de lectura>&since=…  cada 15 s
Cheer Crew (porra)
```

- **Tokens:** el corredor solo tiene el token de escritura `w`. La porra solo tiene el id de lectura `sha256(w)` (24 caracteres hex), que viaja en el link de plan compartido. Con el link de plan nadie puede mandar ubicaciones falsas.
- **Qué hace la app con los puntos** (`js/track.js`):
  - **Sobre el recorrido:** cada punto se proyecta al recorrido con ventana monótona. No se permite retroceder ni ir a más de 30 km/h, así no se confunden los tramos donde el recorrido pasa cerca de sí mismo.
  - **Salida:** se detecta cuando el corredor pasa del corral (detrás de la línea, en Columbus) a más de 150 m adelante. La hora se interpola. Nunca se acepta antes del disparo de su ola.
  - **Si OwnTracks se prendió tarde:** se engancha donde esté y calcula la hora de salida hacia atrás con su ritmo real (marcado "GPS ≈").
  - **Checkpoints (5K…Meta):** se registran solos, interpolados entre puntos GPS. Un split escrito a mano siempre gana.
  - **Ritmo:** el ritmo de los últimos ~3 km del GPS alimenta la proyección (65% reciente / 35% promedio). La posición GPS es el ancla.
  - **Sin señal:** si deja de llegar señal más de 6 min, avisa y sigue estimando.
- **Fechas:** solo cuentan los puntos del día de la carrera (11 oct, hora de Chicago). Los de días de prueba se ven como "Último dato hace…", pero no generan splits. En modo simulación cuenta cualquier día.

## Configuración (una vez)

1. **Vercel → proyecto porra-app → Storage → Create Database → Upstash for Redis (Free) → Connect.** Esto crea `KV_REST_API_URL` y `KV_REST_API_TOKEN`; la función los detecta sola.
2. **Redeploy** (o el siguiente push lo hace).
3. **Revisar:** `https://cheer.elevatesports.group/api/pos?ping=1` debe responder `"storage":true`.

## Corredor

1. **En la app:** Corredores → **Seguir con su celular** → **Enviar por WhatsApp** (o mostrarle el QR).
2. **En su celular:** abre el link → instala OwnTracks → **Conectar OwnTracks**, que importa la configuración (modo HTTP, URL, modo Move). Luego permite la ubicación **Siempre**.
3. **Prueba:** toca ↑ en OwnTracks. Su página y tu app muestran "Último dato hace…".
4. **Día de la carrera:**
   - batería al 100%;
   - modo **Move** antes de ir al corral;
   - no cerrar OwnTracks.

## Límites

- **Batería:** el modo Move gasta batería. Unas 4–5 h suelen caber en un celular con buena batería; si no, lleva batería externa.
- **Edificios:** entre los edificios del Loop el GPS rebota. Los puntos con precisión peor de 120 m se ignoran y la ventana monótona filtra el resto.
- **Sin celular:** si el corredor no lleva celular, la app sigue con corral, objetivo y splits manuales de la app oficial.
- **Probar en local:** desde `localhost`, la app usa la API de producción (`cheer.elevatesports.group`). El link del corredor siempre apunta a producción.
