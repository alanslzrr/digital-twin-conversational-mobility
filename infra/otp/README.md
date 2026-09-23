# OTP local

Implementación de evaluación: OTP 2.10.0 en contenedor arm64/amd64 oficial fijado por digest, Java incluido, heap 4 GiB, contenedor 6 GiB / 4 CPU, puerto `127.0.0.1:8801`.

1. `pnpm otp:prepare` normaliza/subconjunta GTFS Renfe y registra fuentes/licencias/SHA256 junto al OSM Madrid.
2. `pnpm otp:build` genera `graph.obj` y `graph-manifest.json`.
3. `pnpm gtfs:import` importa la misma versión en PostGIS.
4. `pnpm otp:up` sirve el grafo; `pnpm otp:down` lo detiene sin borrar datos.
5. `pnpm otp:benchmark --restart` mide arranque y 20 consultas de una muestra de cuatro parejas.

Antes de reconstruir, detener OTP. Los datos/grafo/reportes se guardan en `data/otp/`, ignorado por Git. La API real es GTFS GraphQL `planConnection`, no la API REST de OTP1. El dominio declara rutas previstas: no se instala un polling paralelo de Renfe dentro de OTP que eluda la ventana de actividad.

Detalle y límites en [runtime local](../../docs/local-runtime.md). No se ha validado toda la red ni el pico de RAM de construcción; conservar y revisar los informes de importación.

## Vercel, después

Sandbox no forma parte del runtime actual. Solo después de validar localmente y de autorización explícita se estudiarán cold start, red privada, almacenamiento de grafo, cuotas y lifecycle. Un snapshot de disco **no conserva** por sí mismo heap JVM/proceso vivo. No asumir equivalencia local/cloud ni activar despliegues automáticamente.
