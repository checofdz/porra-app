# Acceso a datos oficiales de tracking

## Situación (investigado el 29 sep 2026)
- **App oficial:** Bank of America Chicago Marathon App, de Tata Consultancy Services (iOS id718145625, Android `com.tcs.chicagomarathon2013`). Tracking ilimitado por nombre o número, mapa y predicción de llegada. Sin API pública.
- **Resultados web:** results.chicagomarathon.com (plataforma mika:timing; mirror en chicago-history.r.mikatiming.com). robots.txt **no permite** acceso automatizado. Sin API pública documentada.
- **Cronometraje:** MYLAPS (BibTag), operado por The Last Mile Racing. Tapetes: salida, cada 5K, medio, meta (y mat en milla 25.2).
- **Contacto:** office@chicagomarathon.com.

## Cómo está resuelto en la app
1. Splits manuales de un toque (“Pasó 15K”) con la hora actual, o escribiendo la hora.
2. Aviso cuando un tapete ya debió pasar y no hay dato (“¿Ya pasó el 15K?”).
3. Capa de proveedor preparada: cuando haya acceso oficial, se conecta un endpoint `/api/splits?bib=` que llena `runner.splits` sin cambiar el resto.

## Borrador de correo (enviar ya)
**To:** office@chicagomarathon.com
**Subject:** Spectator app – request for runner tracking data access

Hello,

I am building a free, non-commercial spectator app for the Bank of America Chicago Marathon that helps friends and family plan where to cheer and how to move between viewing points by CTA without crossing the course.

We would like to show a runner's official checkpoint splits (by bib number, with the runner's consent) so spectators get accurate arrival times. We will not scrape results.chicagomarathon.com. Could you tell us whether a data feed or partner API (mika:timing / MYLAPS) is available for third-party spectator tools, or whether you allow linking/deep-linking to the official app and results pages?

Thank you,
Sergio Fernández
