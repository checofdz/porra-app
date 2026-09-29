# Roadmap

## Etapa 1 — Chicago (11 oct 2026) ✅ en este repo
PWA estática en Vercel, datos locales en el teléfono.

## Etapa 2 — Plataforma
- Selector de carreras (World Marathon Majors y otras): cada carrera = `race-<id>.js` + `data/<id>/`. El pipeline de calles/grafo (`tools/`) se repite por ciudad.
- Cuentas y grupos de porra: compartir plan, ubicación y avisos entre la porra (Vercel + Postgres/KV).
- Push del servidor (Web Push con VAPID) para avisar aunque la app esté cerrada.
- Splits oficiales automáticos si se obtiene acceso (endpoint `/api/splits`).
- Tiempos del metro en vivo con la API de CTA Train Tracker (requiere API key gratuita).
