Pipeline de datos (se corre una vez por carrera):
1. Descargar Street Center Lines de la ciudad (`Chicago/osd-street-center-line`) y recortar al área → `streets_bbox.json`.
2. `build.py` — traza la ruta del maratón sobre la red de calles real (`course_real.json`).
3. `data.py` — genera `mapdata.json` (calles por clase, etiquetas, costa, río, ruta calibrada a millas oficiales, puntos).
4. `walk.py` — genera `walkgraph.json` (red peatonal con cada lado del recorrido separado y aristas de cruce).
