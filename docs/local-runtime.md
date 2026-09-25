# Movilidad local primero

La evaluación se ejecuta en el ordenador. No requiere Neon, Upstash, Blob, Queues ni Sandbox. La única API de pago del chat sigue siendo el proveedor directo configurado; las pruebas de movilidad no llaman al modelo.

## Preparación reproducible

Requisitos: Node 24.21, pnpm 10.30, Python ≥3.11, Docker Compose. OTP tiene heap de 4 GiB, límite de contenedor de 6 GiB y 4 CPU. Reservar memoria suficiente en Docker además de PostGIS y cualquier otro contenedor.

```sh
pnpm install --frozen-lockfile
pnpm setup:local --refresh-token
pnpm infra:up
pnpm db:migrate
pnpm otp:prepare             # Descarga solo si no existe; --download refresca fuentes
pnpm otp:build               # Construye grafo y registra su versión
pnpm gtfs:import             # Importación transaccional local; IDs persistentes
pnpm mobility:enable         # Solo acepta Postgres loopback; no modifica cloud
pnpm otp:up
pnpm check
pnpm build:agent
pnpm start:local             # Core + EVE oficial + worker; Ctrl-C termina sus procesos
```

Antes de reconstruir un grafo existente, detener OTP con `pnpm otp:down`; después volver a arrancarlo. Tras modificar código o variables, reconstruir/reiniciar las aplicaciones. No ejecutar dos supervisores sobre los mismos puertos.

Para meteorología, añade `AEMET_API_KEY` únicamente a `apps/mobility-core/.env.local` **antes** de `pnpm mobility:enable`. Sin clave, esa fuente permanece deshabilitada. EMT usa `EMT_CLIENT_ID` y `EMT_PASSKEY` en ese mismo archivo; sus avisos se habilitan al ejecutar `pnpm db:migrate && pnpm mobility:enable`. Consulta `get_incidents` con `source: "emt"`; Renfe sigue siendo el valor por defecto. No copiar estas variables al frontend.

La cuenta del evaluador, su contraseña y la clave del modelo se preparan con los comandos ya existentes de `README.md`. No repetir `evaluator create` si el slot ya existe. No desactivar Better Auth para probar.

Abrir **http://127.0.0.1:3000/evaluation**. La interfaz sigue siendo Web Chat oficial EVE. Todos los puertos de infraestructura y aplicaciones están limitados a loopback.

Para desarrollo: `pnpm dev` y `pnpm worker` en terminales distintas, con PostGIS y OTP ya arrancados. `start:local` usa los builds productivos.

## Ingestión y consulta

- Cada interacción autorizada que consume cuota y cada consulta MCP abre/renueva una ventana de 30 minutos, monótonamente.
- El worker no renueva la ventana. Fuera de ella devuelve `idle` sin consultar proveedores.
- Cada job tiene `next_due_at`, lease de 90 s con propietario, timeout HTTP de 12 s y backoff limitado a 15 min.
- Hay dos carriles concurrentes. Los ticks duplicados y el read-through comparten los mismos leases; no son temporizadores exactos de tiempo real.
- Si cae el worker, el próximo tick retoma los jobs vencidos. Las consultas pueden refrescar su fuente si está vencida y no tiene lease. Un refresh fallido no convierte el último dato en fresco.
- `INGESTION_ENABLED=false` desactiva los fetches. `source_catalog.enabled=false` desactiva una fuente. En Vercel o con Postgres remoto, este worker falla cerrado aunque el flag sea `true`.
- `pnpm ingest` abre una ventana explícita y ejecuta un único tick; `pnpm worker` permanece disponible sin mantener la ventana abierta.

| Flujo | Cadencia mínima | Umbral de frescura |
| --- | --- | --- |
| Renfe trip updates | 20 s | 40 s |
| Renfe alertas | 30 s | 90 s |
| BiciMAD | máx(20 s, TTL) | 60 s por estación |
| Aire municipal | 10 min | 2 h por medición |
| Tráfico municipal | 5 min | 15 min |
| Aparcamientos participantes | 1 min | 5 min por categoría |
| AEMET Madrid-Retiro | 10 min | 2 h por observación |

Los umbrales son políticas de evaluación, no garantías de los proveedores. Los datos siguen siendo provisionales. Una lectura de cero se conserva; una lectura ausente nunca se sustituye por cero.

## Datos y cobertura

- GTFS oficial Renfe recortado a las rutas Madrid `10T`, verificado con estaciones/servicios relacionados. Se normalizan espacios en cabeceras e IDs. El importador rechaza ausencia de tablas/referencias esenciales.
- El grafo actual contiene 95 estaciones y 118 variantes de ruta del fichero descargado. Calendario: 23/09/2026–22/10/2026. **No sirve indefinidamente**: actualizar GTFS, reconstruir OTP e importar la misma versión antes de su vencimiento.
- OSM: extracto Geofabrik Madrid. Algunas líneas de Cercanías llegan fuera del extracto; no se garantiza acceso peatonal completo allí.
- `plan_journey`: rutas **previstas**, Renfe + caminar. No aplica RT al itinerario ni incluye Metro/EMT/bici/coche. Rechaza modos no implementados y fechas fuera del calendario; filtra tiempo total a pie y transbordos. La opción de silla de ruedas no garantiza ascensores operativos.
- `get_departures`: horarios OTP y estimaciones Renfe cuando coinciden viaje/parada y están frescas. Una estimación de llegada NO es una de salida. Un viaje sin RT conserva base `scheduled`, nunca "puntual".
- `resolve_place`: estaciones Renfe y BiciMAD importadas, búsqueda sin acentos; candidatos ambiguos requieren aclaración. No geocodifica direcciones arbitrarias.
- BiciMAD usa GBFS **oficial EMT**, no el feed comunitario con nombre similar. Se conservan `last_reported`, flags de servicio y TTL.
- Aire: lecturas válidas (`V`) con magnitud/unidad; hora civil Europe/Madrid, H24 es fin del día. Horas DST ambiguas/no existentes se omiten. No interpreta riesgo sanitario.
- AEMET: observaciones de Madrid-Retiro (`3195`), no previsiones/avisos ni cobertura regional. `fint` está en UTC según su metadata, incluso cuando no trae offset; no usar la conversión horaria municipal. Lluvia acumulada 60 min, viento medio 10 min; temperatura/humedad/presión instantáneas (`periodMinutes=0`).
- Tráfico: sensores municipales, no incidencias DGT ni predicción de viaje.
- Aparcamientos: SOAP municipal de participantes; algunos publican solo catálogo, otros lecturas antiguas. Frescura individual; disponibilidad vacía significa ausencia de datos.

## Persistencia

PostGIS guarda lugares, mapping de IDs, catálogo GTFS, snapshots actuales, actividad, leases e histórico. Redis sigue disponible pero **no es necesario** para esta vertical; no se añade una segunda fuente de verdad.

`data/` está ignorado por Git. Incluye GTFS/OSM/grafo, manifiestos con URLs/licencias/SHA256 y raw gzip deduplicado por contenido. Histórico/raw tienen retención objetivo de 24 h y se purgan en ticks activos; si el ordenador está apagado o no hay ventana activa, el borrado espera al siguiente tick. El último snapshot puede conservarse como dato antiguo, nunca como live. `get_historical_state` devuelve un índice y muestras acotadas, no una reconstrucción completa de red.

La versión de base y el manifiesto del grafo deben coincidir. No reemplazar manualmente ficheros bajo un OTP vivo. El grafo genera advertencias de calidad de OSM/GTFS: revisar `data/otp/report/` antes de ampliar cobertura.

## Verificación

```sh
pnpm smoke --production
pnpm smoke:evaluation        # cuentas temporales 4/5; sin inferencia
# Solo tras autorizar consumo de créditos:
pnpm smoke:evaluation --live-mobility  # EVE real: lugares, ruta, meteorología y salud
pnpm smoke:evaluation --live-weather   # Consulta meteorológica conversacional acotada
pnpm smoke:mobility          # fuentes reales (+ AEMET si hay clave) + PostGIS + OTP + MCP; abre ventana
pnpm otp:benchmark --restart # reinicia SOLO OTP; 20 consultas / cuatro parejas
```

Para que estas pruebas controlen los ticks sin carreras con otro worker, usar `pnpm start:local --no-worker`; al terminar reiniciar con `pnpm start:local`. Los checks de movilidad también prueban rechazo de lugares desconocidos, modos no implementados y fechas fuera del feed.

Una conversación puede requerir varias peticiones al proveedor: EVE descubre herramientas (`connection_search`), las ejecuta y después redacta. Un límite de tres peticiones no garantiza completar una consulta con varias herramientas. Los modos `--live*` requieren autorización de consumo y guardan solo un resumen de acciones/respuesta visible en `data/validation/`, nunca razonamiento interno ni credenciales.

Los tests unitarios y CI no necesitan API keys ni descargan datos de movilidad. Los dos últimos comandos son opt-in y requieren red hacia los proveedores de datos; AEMET solo se prueba cuando tiene clave. No son parte de `pnpm check`.

La conversación real del 23/09/2026 completó resolución Atocha/Chamartín, ruta prevista de 13 min, observación AEMET con hora/edad y ausencia de EMT. Fueron cinco peticiones en el intento completado; un intento anterior se detuvo al agotar el límite inicial de tres. Tras autorización ampliada: ocho peticiones totales. No se cambiaron modelo, autenticación ni interfaz.

Muestra medida el 23/09/2026: construcción del grafo 40,4 s; reinicio hasta API disponible 5,4 s; 20 consultas de cuatro parejas, p50 47 ms y p95 66 ms; memoria residente posterior 1,261 GiB (no pico de construcción). Smoke MCP Atocha↔Chamartín: tres alternativas por dirección, primer itinerario 13 min, 192/140 ms. Son mediciones locales de una muestra, no un SLA.

Informes locales: `data/otp/manifest.json`, `graph-manifest.json`, `local-validation.json`, `benchmark.json`. Una muestra pequeña no equivale a certificar toda la red ni su comportamiento en Vercel. Tampoco se ha medido todavía el pico de RAM durante construcción.

## Fuentes primarias y atribución

- [Renfe GTFS](https://data.renfe.com/dataset/horarios-cercanias), CC BY 4.0; GTFS-RT JSON oficial `gtfsrt.renfe.com`. Usar JSON evita añadir un decoder protobuf para la evaluación y no cambia el modelo de dominio.
- [OSM / Geofabrik Madrid](https://download.geofabrik.de/europe/spain/madrid.html), © OpenStreetMap contributors, ODbL.
- [BiciMAD GBFS oficial](https://datos.emtmadrid.es/dataset/gbfs-general-bikeshare-feed-specification-de-bicimad).
- [Aire municipal](https://datos.madrid.es/dataset/212531-0-calidad-aire-tiempo-real), [tráfico municipal](https://datos.madrid.es/dataset/202087-0-trafico-intensidad), [aparcamientos](https://datos.madrid.es/dataset/50027-0-aparcamientosocupacionyservicios).
- [AEMET OpenData](https://opendata.aemet.es/dist/), © AEMET: reutilización con atribución conforme a [su nota legal](https://www.aemet.es/es/nota_legal). Solo se persisten observaciones, nunca claves, respuestas de autenticación o URLs temporales.
- [OTP 2.10.0](https://github.com/opentripplanner/OpenTripPlanner/releases/tag/v2.10.0), imagen multiarch fijada por digest en Compose.

No hay deployments ni nuevas altas cloud. El 25/09/2026 EMT autenticó y devolvió incidencias con HTTP 200/código 00, tras aprobarse la aplicación. El adaptador guarda solo la respuesta de incidencias (nunca login/token), reutiliza el token en memoria, respeta backoff y la ventana de actividad. Job `emt-alerts`: 120 s, frescura máxima 600 s basada en `lastBuildDate`, no en la hora de consulta. Los períodos se interpretan en Europe/Madrid; períodos desconocidos no se presentan como activos. El MCP excluye avisos caducados y permite filtrar por línea. Avisos no equivalen a llegadas en tiempo real ni cobertura de rutas EMT. DGT ha cambiado su publicación DATEX; queda resolver acceso oficial y mapping. No se registran herramientas ficticias para esos servicios.

## Validación adicional 25/09/2026

- `pnpm check`: lint, límites arquitectónicos, tipos, pruebas y builds locales.
- `pnpm build:agent` requiere acceso al Docker local para que EVE detecte su sandbox; no se añade microsandbox ni se habilitan herramientas por defecto.
- Smoke movilidad completo: rutas Atocha↔Chamartín (13 min previstas), Renfe, EMT con filtro por línea, BiciMAD, aire, AEMET, tráfico, parking, histórico, actividad y deduplicación.
- OTP: 20 consultas / cuatro pares, p50 142 ms, p95 256 ms, memoria residente 1.338 GiB. No es certificación de red completa ni pico de construcción.
- `pnpm smoke:evaluation --live-emt`: conversación real EVE → gpt-6-luna directo → MCP. Descubrió y consultó `get_incidents`, explicó la antigüedad del feed y distinguió avisos futuros de activos. Un primer intento falló por catálogo/instrucciones EVE desactualizados; se corrigieron y se repitió satisfactoriamente.
- AEMET mostró fallos intermitentes de conexión. El cliente permite un único reintento de conexión; después conserva el backoff y la señalización de error. No reintenta denegaciones HTTP.
- No se ha publicado en Vercel. DGT, llegadas EMT, red completa y los demás pendientes del roadmap no quedan certificados por estas pruebas.
