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

Para meteorología, añade `AEMET_API_KEY` únicamente a `apps/mobility-core/.env.local` **antes** de `pnpm mobility:enable`. Sin clave, esa fuente permanece deshabilitada. EMT usa `EMT_CLIENT_ID` y `EMT_PASSKEY` en ese mismo archivo; sus avisos y llegadas bajo demanda se habilitan al ejecutar `pnpm db:migrate && pnpm mobility:enable`. Consulta `get_incidents` con `source: "emt"`; Renfe sigue siendo el valor por defecto. No copiar estas variables al frontend.

La cuenta del evaluador, su contraseña y la clave del modelo se preparan con los comandos ya existentes de `README.md`. No repetir `evaluator create` si el slot ya existe. No desactivar Better Auth para probar.

Abrir **http://127.0.0.1:3000/evaluation**. La interfaz sigue siendo Web Chat oficial EVE. Todos los puertos de infraestructura y aplicaciones están limitados a loopback.

Para desarrollo: `pnpm dev` y `pnpm worker` en terminales distintas, con PostGIS y OTP ya arrancados. `start:local` usa los builds productivos.

## Ingestión y consulta

- Cada interacción autorizada que consume cuota y cada consulta MCP abre/renueva una ventana de 30 minutos, monótonamente.
- El worker no renueva la ventana. Fuera de ella devuelve `idle` sin consultar proveedores.
- Cada job tiene `next_due_at`, lease de 90 s con propietario, timeout HTTP de 12 s y backoff limitado a 15 min.
- E3 (tras migración `0010` y actualización conjunta de Core/worker): dos carriles independientes, un job vencido por petición y pausa de 5 s por carril, sin barrera entre ciclos. Los ticks duplicados y el read-through comparten los mismos leases; no son temporizadores exactos de tiempo real. No ejecutar el worker nuevo contra el Core anterior.
- Salud muestra ventana, heartbeat por carril, inicio/fin y duración del último intento, etapa del error y recuperación de leases. Un heartbeat ausente más de 120 s significa detenido **o** inaccesible, no un error confirmado del proveedor. La frescura se informa por separado.
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
| AEMET 25 estaciones iniciales Madrid | 10 min | 2 h por estación |

Los umbrales son políticas de evaluación, no garantías de los proveedores. Los datos siguen siendo provisionales. Una lectura de cero se conserva; una lectura ausente nunca se sustituye por cero.

## Datos y cobertura

- GTFS oficial Renfe recortado a las rutas Madrid `10T`, verificado con estaciones/servicios relacionados. Se normalizan espacios en cabeceras e IDs. El importador rechaza ausencia de tablas/referencias esenciales.
- El componente Renfe importado contiene 95 estaciones y 118 variantes de ruta. Calendario Renfe: 23/09/2026–22/10/2026; la release conserva vigencias separadas para EMT, Metro Ligero e interurbanos. **No sirve indefinidamente**: actualizar GTFS, reconstruir OTP e importar la misma versión antes de su vencimiento.
- OSM: extracto Geofabrik Madrid. Algunas líneas de Cercanías llegan fuera del extracto; no se garantiza acceso peatonal completo allí.
- `plan_journey`: base **prevista** de Renfe, EMT, Metro Ligero, interurbanos y caminatas según la release activa; Core aplica RT/alertas Renfe y avisos EMT con identidad, vigencia y frescura verificadas. No incluye trayectos actuales de Metro de Madrid ni bici/coche. Metro conserva catálogo; sus horarios/routing actuales y nuevas correspondencias CRTM↔EMT/Renfe están excluidos del cierre por acuerdo. Las asociaciones existentes siguen disponibles, son parciales y no garantizan tiempos de conexión ni accesibilidad. Rechaza modos no implementados y fechas fuera del calendario; filtra tiempo total a pie y transbordos. La opción de silla de ruedas no garantiza ascensores operativos.
- Contrato de modos tras F01: `TRANSIT` exige un tramo de transporte público y permite acceso/egreso/transbordos a pie dentro del límite; `WALK` permite rutas íntegramente peatonales; `TRANSIT+WALK` permite cualquiera de las dos. No se relajan minutos a pie ni transbordos para encontrar una alternativa. Errores de contrato, timeout, grafo y cobertura se distinguen de `no_route`.
- `get_departures`: horarios OTP y estimaciones Renfe cuando coinciden viaje/parada y están frescas. Una estimación de llegada NO es una de salida. Un viaje sin RT conserva base `scheduled`, nunca "puntual".
- `resolve_place`: estaciones Renfe y CRTM, paradas EMT y BiciMAD importadas, búsqueda sin acentos; candidatos ambiguos requieren aclaración. Para direcciones públicas, `resolve_address` consulta catálogos/caché y Nominatim autorizado con consentimiento y atribución.
- BiciMAD usa GBFS **oficial EMT**, no el feed comunitario con nombre similar. Se conservan `last_reported`, flags de servicio y TTL.
- Aire: lecturas válidas (`V`) con magnitud/unidad; hora civil Europe/Madrid, H24 es fin del día. Horas DST ambiguas/no existentes se omiten. No interpreta riesgo sanitario.
- AEMET: observaciones de un catálogo inicial versionado de 25 estaciones madrileñas (incluye Navacerrada, Venturada y Barajas RS), distintas de la predicción municipal horaria y avisos CAP Madrid ya disponibles en `get_environment` y como contexto de `plan_journey`. Cobertura regional parcial: `stationId` exacto o `placeId` con selección de la estación fresca más próxima hasta 20 km, antigua si no hay fresca, sin sustitución silenciosa por Retiro. Sin selector se conserva Retiro (`3195`) explícitamente. Una única adquisición conjunta filtra el extracto regional antes de persistir; reintentos no rejuvenecen lecturas ni retroceden estaciones. 20 km es un límite del producto, no representatividad garantizada. `fint` está en UTC según su metadata, incluso cuando no trae offset; no usar la conversión horaria municipal. Lluvia acumulada 60 min, viento medio 10 min; temperatura/humedad/presión instantáneas (`periodMinutes=0`).
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
pnpm smoke:routing           # aceptación MCP/OTP sin modelo; renueva ventana de actividad
pnpm otp:benchmark --restart # reinicia SOLO OTP; 20 consultas / cuatro parejas
```

Para que estas pruebas controlen los ticks sin carreras con otro worker, usar `pnpm start:local --no-worker`; al terminar reiniciar con `pnpm start:local`. Los checks de movilidad también prueban rechazo de lugares desconocidos, modos no implementados y fechas fuera del feed.

Una conversación puede requerir varias peticiones al proveedor: EVE descubre herramientas (`connection_search`), las ejecuta y después redacta. Un límite de tres peticiones no garantiza completar una consulta con varias herramientas. Los modos `--live*` requieren autorización de consumo y guardan solo un resumen de acciones/respuesta visible en `data/validation/`, nunca razonamiento interno ni credenciales.

Los tests unitarios y CI no necesitan API keys ni descargan datos de movilidad. `smoke:mobility` es opt-in y requiere red hacia proveedores; AEMET solo se prueba cuando tiene clave. `smoke:routing` usa servicios locales y el benchmark OTP requiere autorización operativa separada. Ninguno forma parte de `pnpm check`.

`smoke:routing` requiere Core/OTP/Postgres locales y token MCP vigente; no reinicia servicios ni llama directamente a proveedores externos. Admite `--port=3011` para un Core temporal y `--at=2026-09-25T08:08:58.823Z` para reproducir el instante de la auditoría mientras exista ese calendario. Guarda entradas, resultados, versiones y latencia bajo `data/validation/routing-*/result.json`; falla si una ruta positiva esperada no aparece. [Evidencia de E1 y matriz pendiente](acceptance/2026-09-25-routing.md).

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

No hay deployments ni nuevas altas cloud. El 25/09/2026 EMT autenticó y devolvió incidencias con HTTP 200/código 00, tras aprobarse la aplicación. El adaptador guarda solo la respuesta de incidencias (nunca login/token), reutiliza el token en memoria, respeta backoff y la ventana de actividad. Job `emt-alerts`: 120 s, frescura máxima 600 s basada en `lastBuildDate`, no en la hora de consulta. Los períodos se interpretan en Europe/Madrid; períodos desconocidos no se presentan como activos. El MCP excluye avisos caducados y permite filtrar por línea. Los avisos no equivalen a llegadas: estas se consultan por parada bajo demanda. El routing EMT usa GTFS, sin asignar estimaciones a viajes sin identidad demostrada. DGT DATEX 3.7 está integrado con acceso oficial público, ingestión e histórico; no equivale a los sensores municipales ni inventa desvíos. Ver [fuente y límites DGT](sources/dgt.md).

## Validación adicional 25/09/2026

- `pnpm check`: lint, límites arquitectónicos, tipos, pruebas y builds locales.
- `pnpm build:agent` requiere acceso al Docker local para que EVE detecte su sandbox; no se añade microsandbox ni se habilitan herramientas por defecto.
- Smoke movilidad completo: rutas Atocha↔Chamartín (13 min previstas), Renfe, EMT con filtro por línea, BiciMAD, aire, AEMET, tráfico, parking, histórico, actividad y deduplicación.
- OTP: 20 consultas / cuatro pares, p50 142 ms, p95 256 ms, memoria residente 1.338 GiB. No es certificación de red completa ni pico de construcción.
- `pnpm smoke:evaluation --live-emt`: conversación real EVE → gpt-6-luna directo → MCP. Descubrió y consultó `get_incidents`, explicó la antigüedad del feed y distinguió avisos futuros de activos. Un primer intento falló por catálogo/instrucciones EVE desactualizados; se corrigieron y se repitió satisfactoriamente.
- AEMET mostró fallos intermitentes de conexión. El cliente permite un único reintento de conexión; después conserva el backoff y la señalización de error. No reintenta denegaciones HTTP.
- No se ha publicado en Vercel. DGT, llegadas EMT, red completa y los demás pendientes del roadmap no quedan certificados por estas pruebas.


## Control conversacional E2

El modo predeterminado del servidor EVE es `MOBILITY_BUDGET_MODE=interactive`:
al alcanzar el umbral EVE pausa y muestra Approve/Stop en la interfaz oficial.
Approve renueva la ventana; Stop cancela el turno y conserva la historia. No hace
falta crear una campaña ni llamar a `input_tokens` para usar este flujo.
Se conserva Better Auth, registro y propiedad de sesión en Core, el modelo directo
fijo y telemetría numérica por intento/turno/sesión. Los 100.000/10.000 son umbrales
renovables, no un presupuesto global irrevocable ni un coste monetario.

`MOBILITY_BUDGET_MODE=campaign` es una opción explícita para experimentos
con reservas preventivas: requiere esquema 0008+0009 y campaña autorizada; aprobar
en EVE no renueva su presupuesto global. Un valor de modo desconocido falla cerrado.
`pnpm budget:report` informa solo sobre ese ledger experimental, no sobre sesiones
interactivas; para estas se usan las métricas numéricas del proveedor y ciclo EVE.

El cierre de E2 no despliega ni migra el runtime habitual. Para una transición
posterior: copia de seguridad, migraciones pendientes en orden, build de Core/Web
y agente compatibles, y sesiones nuevas para no reutilizar cápsulas anteriores a
la corrección. No hay llamada al modelo hasta enviar una conversación; estas
pruebas y builds no ejecutan inferencias.

## Actualización E4 aplicada mediante E8

Antes de activar el código E4, aplicar `0011_trip_destination.sql` junto con las migraciones pendientes y regenerar/reimportar el export normalizado Renfe para obtener terminales. Con las fuentes locales ya disponibles, `python3 scripts/prepare-otp.py` sin `--download` conserva también la secuencia necesaria; comprobar la versión frente al grafo y después `pnpm gtfs:import`. Una exportación antigua sin `stopTimes` sigue siendo importable, pero no permite deducir terminales. No es necesario reconstruir OTP si la versión GTFS no cambia. [Evidencia E4 y límites](acceptance/2026-09-25-line-destinations.md).

## Actualización E5 aplicada mediante E8

`0012_history_revisions.sql` conserva el histórico existente y habilita revisiones. Para integrarla, parar Core/worker, respaldar la base y actualizar código y esquema juntos; no mezclar escritores antiguos con esta migración. Una reversión al escritor anterior requiere la copia previa de la base, no borrar revisiones para reconstruir su PK.

`get_historical_state` acepta EMT y `mode=event` (predeterminado, puede incluir correcciones posteriores) o `mode=knowledge` (solo lo conocido entonces). Mantiene índice parcial/retención 24 h, muestra de cinco entidades y desfase explícito. La frescura por entidad no hereda la hora más reciente de la colección. [Semántica, pruebas y límites E5](acceptance/2026-09-25-history-quality.md).

### Reutilizar el smoke sin ingestión

`pnpm smoke:mobility --port=3011 --read-only` permite comprobar un Core local alternativo con `INGESTION_ENABLED=false`. No activa ventana ni ejecuta ticks de ingestión; falla si el servidor no confirma esa configuración. Consulta los datos existentes (que pueden ser antiguos), MCP y OTP; no llama al modelo. No sustituye las regresiones de recuperación/deduplicación. Véase [E6](acceptance/2026-09-25-functional-continuity.md).

## E8 — Integración desde el esquema habitual 0007

Aplicar **todas** las migraciones pendientes con `pnpm db:migrate`, no ejecutar solamente 0010–0012: esta transición incorpora 0008–0012 en orden, incluidas las tablas E2 aunque el modo normal siga siendo interactivo.

1. Integrar la PR y sincronizar `main` sin descartar cambios locales.
2. Parar el supervisor `start:local` (Ctrl-C en su terminal): termina Core, Web/agente y worker; mantener Postgres/OTP. Comprobar que sus procesos han terminado.
3. Guardar un `pg_dump -Fc` local con permisos restringidos y verificar su índice con `pg_restore --list`; respaldar también export/manifiestos. El dump contiene datos privados de autenticación: nunca subirlo a Git ni publicarlo.
4. Ejecutar `pnpm db:migrate`; comprobar la lista aplicada hasta 0012.
5. Regenerar el export desde el GTFS local en un directorio temporal, comprobar que su staticVersion coincide con el grafo activo y copiar únicamente `renfe-madrid.json`; ejecutar `pnpm gtfs:import`. No reescribir archivos de OTP vivo. Si cambia la versión, parar OTP y seguir el procedimiento completo de actualización del grafo.
6. `pnpm check && pnpm build:agent`, luego `pnpm start:local`. Usar sesiones nuevas para no reutilizar cápsulas anteriores a la corrección E2. El arranque no llama al modelo; la ingestión solo trabaja dentro de su ventana.
7. Comprobar health de Web/Core/agente y heartbeat del worker. No se exige campaña conversacional ni benchmark.

Rollback: parar nuevamente todos los escritores y restaurar copia de base + revisión de código/export compatibles. No arrancar el escritor antiguo contra 0012 ni borrar revisiones para reconstruir su PK. El arranque/parada normal sigue siendo `pnpm start:local` / Ctrl-C; para actualización bajo demanda usar el chat, y para una actualización manual acotada `pnpm ingest` (abre ventana y consulta proveedores).

### Estado tras entrega E8 (25/09/2026)

PR #16 integrada; base habitual migrada de 0007 a 0012, destinos reimportados con la misma versión de grafo y builds Core/Web/agente actualizados. [Registro de entrega](acceptance/2026-09-25-local-delivery.md).

La instancia entregada está en segundo plano, supervisada por `scripts/start-local.mjs`; PID en `data/runtime/local.pid` y log privado en `data/runtime/e8-local.log`. Para pararla, comprobar primero `ps -p "$(cat data/runtime/local.pid)" -o command=` y que sea el supervisor de este repositorio, después `kill -TERM "$(cat data/runtime/local.pid)"`. No matar todos los procesos Node. Para arrancar de nuevo en primer plano: `pnpm start:local`; Ctrl-C para detener. Postgres/Redis/OTP se gestionan por separado con los comandos de infraestructura anteriores.

## EMT: catálogo y llegadas bajo demanda (E7)

Después de respaldar la base y parar Core/worker para actualizar código: `pnpm db:migrate` aplica también `0013`. Con las credenciales EMT solo en Core:

```sh
pnpm emt:import       # Dos endpoints: catálogo completo de paradas + líneas del día Madrid
pnpm check
pnpm build:agent
pnpm start:local
pnpm smoke:mobility --emt-only  # Una parada, caché repetida y resolución; sin modelo ni tick global
```

`emt:import` es explícito, local y transaccional: fallo de descarga/validación no sustituye el catálogo. Repetir para actualizarlo (preferiblemente antes del uso diario); no hay actualización automática coordinada de catálogos/GTFS/OTP todavía. Guarda export normalizado versionado en `data/sources/emt/<sha256>.json`, fuera de Git. No incluye credenciales. No cambia el grafo.

En una **sesión nueva**, el evaluador puede pedir «Próximas llegadas EMT de la parada 72, con destino y antigüedad», y luego preguntar por una parada ambigua como Cibeles. `resolve_place` acepta `source=emt` y nombre o número exacto; entrega candidatos y sentidos. `get_emt_arrivals` requiere el UUID elegido, no el número. No se ha medido el comportamiento conversacional nuevo mediante inferencias automáticas.

- Frescura/caché: 30 s por parada, cooldown global de llegadas 5 s, un refresh simultáneo, lease 90 s y backoff 60–900 s. Son políticas locales, no cuotas ni garantías EMT. El worker no recorre paradas; se respeta la ventana y `INGESTION_ENABLED` existentes.
- Un fallo conserva el último resultado y su antigüedad. Una cuenta atrás antigua no es live; un vacío no demuestra ausencia de servicio. La hora es la operación del proveedor, no una lectura individual de GPS.
- El catálogo expone fecha de referencia/versión; si `currentDay=false`, actualizar antes de asumir vigencia de líneas/sentidos. Sentidos 1/2 se conservan sin deducir destino desde el nombre; el destino de llegada procede del proveedor.
- Solo última observación por parada. Pasadas 24 h no se ofrece como estimación utilizable, aunque la última fila persista hasta reemplazo o retirada de la parada. No se añade replay/histórico de llegadas. `rawReference` es checksum del resultado, no archivo raw archivado.
- Mantener atribución **Powered by EMT de Madrid**, fuente, fecha y [condiciones de uso](https://mobilitylabs.emtmadrid.es/sip/terms-of-use). Las credenciales dinámicas nunca se exportan.
- `0013` es aditiva. Para rollback de código a PR #18, parar procesos y reconstruir la revisión anterior; las tablas EMT pueden permanecer. Para restauración íntegra de base, usar el backup privado previo con todos los escritores detenidos. No borrar manualmente identificadores de paradas.

Pendientes no bloqueantes: Renfe volvió a actualizar durante el arranque E7, pero la causa del episodio TLS sigue sin identificar; la eficiencia de descubrimiento se observa en uso normal. No subir límites ni reabrir E2.


## E7 — Catálogos y horarios CRTM

La entrega CRTM añade `resolve_place(source=crtm, network=...)` y
`get_crtm_timetable`, sin modificar OTP ni añadir polling. Reutilizar los exports
existentes. Antes de actualizar el runtime:

1. Parar el supervisor `start:local` con SIGTERM/Ctrl-C y verificar que termina
   Core, Web/agente y worker; mantener Postgres/Redis/OTP.
2. Respaldar con `pg_dump -Fc` en `data/backups/` (permisos privados); verificar el
   índice con `pg_restore --list`. Esta verificación no sustituye probar un restore.
3. Aplicar **todas** las migraciones pendientes con `pnpm db:migrate` (incluye 0014).
4. Importar cada directorio versionado existente con
   `node --env-file=.env.local scripts/import-crtm.mjs data/sources/crtm/<red>/<sha>`.
   Importar Metro conserva catálogo/correspondencias, no vuelve vigentes sus horarios.
5. Ejecutar `pnpm check` y `pnpm build:agent`; iniciar `pnpm start:local`.
6. Comprobar health de Core/Web y `/eve/v1/health` a través de Web; después
   `pnpm smoke:mobility --crtm-only`. Usar una sesión EVE nueva para las instrucciones
   y herramientas actualizadas. No hace falta inferencia o campaña general.

El smoke CRTM comprueba catálogos, horarios Metro Ligero/interurbanos, rechazo de
Metro fuera de vigencia, correspondencias y salud. Guarda evidencia en
`data/evaluation/crtm-smoke.json`. No llama a proveedores, modelos ni OTP; la
consulta MCP renueva la ventana de actividad existente, por lo que el worker
habitual puede actualizar sus otras fuentes.

Consulta manual: primero resolver una parada, después pasar su UUID a
`get_crtm_timetable` con día de servicio y hora GTFS. Ver [semántica y límites](sources/crtm.md).
Para actualizar datos se prepara/importa una nueva versión explícitamente. El
importador preserva UUIDs y sustituye cada red en una transacción; no sincroniza el
grafo. Para rollback de código, parar los procesos y reconstruir la revisión previa;
0014 es aditiva y puede permanecer. Para restaurar todo el estado, usar el respaldo
previo con todos los escritores parados. No borrar manualmente identidades CRTM.


## Actualización de routing multioperador

La instalación usa releases inmutables con `data/otp` como symlink. Para actualizar GTFS/OSM/catálogos/grafo, activar, revertir o recuperar una transición interrumpida, seguir [routing-releases.md](routing-releases.md). No ejecutar el preparador/build legacy sobre el release activo. El [acta local](acceptance/2026-09-25-routing-releases.md) registra migraciones 0015–0016, backup y rollback comprobado. Nominatim público está autorizado y activo en esta instalación desde el 27/09/2026; otras instalaciones permanecen desactivadas por defecto.


## DGT y resúmenes almacenados (0017)

Aplicar todas las migraciones pendientes con respaldo y escritores detenidos, como en el procedimiento anterior. `0017` añade `dgt-incidents` al worker existente y conserva retiradas; no necesita credenciales ni otro proceso. Recompilar Core/Web/agente juntos para exponer los tres agregados en la conexión MCP existente. No cambia interfaz, modelo ni OTP.

`get_incidents` con `source=dgt` activa la ventana y solicita el job solo si está vencido; un error usa el backoff habitual. `get_source_health` muestra su estado. Los agregados `get_line_status`, `get_network_status`, `get_mobility_snapshot` leen almacenamiento sin refrescar ni extender la ventana; no usar un dashboard que los llame como sustituto de la activación de uso normal.

Para detener DGT sin tocar otros jobs: con acceso administrativo local, `UPDATE source_catalog SET enabled=false WHERE id='dgt'`. Para volver a habilitarlo: `enabled=true`; no borrar identidades ni forzar una ráfaga de próximos vencimientos. Parar/reanudar todos los servicios sigue el runbook existente. Para volver íntegramente a código anterior a 0017, detener escritores y restaurar el respaldo previo según el procedimiento de recuperación; no basta deshabilitar el job, porque el código antiguo de salud tampoco conoce ese ID. No eliminar el histórico manualmente.

[Contrato, consultas, retención y límites DGT](sources/dgt.md). No confundir sensores municipales, publicación DGT y tráfico real observado.

### Precios de aparcamiento

`get_parking` acepta `query` o `parkingId`, duración opcional `durationMinutes` (1–1440, turismo) y `date` (YYYY-MM-DD). Los 15 IDs contrastados y seis perfiles están en `apps/mobility-core/src/catalogs/parking-prices.ts`; no hay descargas tarifarias ni migraciones. Para actualizar precios, contrastar directorio y tarifa especial/general EMT, editar esa versión, ejecutar pruebas/check y recompilar Core/agente siguiendo el ciclo local habitual. No copiar precios SOAP ni extender la general a otro operador.

La ocupación mantiene sus tiempos propios. `price.cost.status=maximum_only` ofrece un máximo, no un coste calculado; `freeScenario` es condicionado y separado del precio ordinario. Fechas futuras usan proyección a precios conocidos sin caducidad artificial. Pitis tiene campaña pública independiente: conservar fuente/fecha y revisar explícitamente al cambiar la publicación. [Cobertura, pruebas y límites](acceptance/2026-10-01-parking-prices.md).
