# Referencia de las 16 herramientas MCP

[Índice](../index.md) · [Arquitectura](../architecture.md) · [Guía de uso](../user-guide.md) · [Configuración](system.md)

MCP es el protocolo con el que EVE ejecuta las 16 herramientas de Mobility Core. Contrato canónico: [schemas de entrada](../../packages/contracts/src/index.ts); registro y autorización: [ruta MCP](../../apps/mobility-core/app/mcp/route.ts).

## Navegación

- [Acceso y convenciones](#acceso-y-convenciones)
- [Lugares](#lugares): `resolve_place`, `resolve_address`
- [Rutas y transporte](#rutas-y-transporte): `plan_journey`, `get_departures`, `get_emt_arrivals`, `get_crtm_timetable`
- [Avisos y contexto](#avisos-y-contexto): `get_incidents`, `get_bike_availability`, `get_environment`, `get_road_state`, `get_parking`
- [Estado e histórico](#estado-e-histórico): `get_source_health`, `get_historical_state`
- [Agregados almacenados](#agregados-almacenados): `get_line_status`, `get_network_status`, `get_mobility_snapshot`

## Acceso y convenciones

- Endpoint local: `http://127.0.0.1:3001/mcp`. GET/POST/DELETE pasan por autorización de servicio, JWT válido y scope **`mobility.read`**.
- La credencial MCP se utiliza entre servidores. Better Auth identifica a la persona y el canal EVE comprueba la propiedad de la conversación antes de ejecutar sus herramientas.
- Todas las herramientas consultan información. Aun así, una lectura puede renovar actividad, refrescar datos o poblar caché. Los tres agregados son la excepción: solo leen almacenamiento.
- Los ejemplos muestran entradas de las herramientas. Sustituye cada marcador `UUID_*` por un UUID devuelto por la resolución de lugares.
- Las horas ISO incluyen zona (`Z` o desplazamiento); las fechas de servicio CRTM y parking son fechas civiles Madrid. `departureTime: "now"` y `minutesAgo` usan el reloj de Core.
- Los resultados varían por capacidad: revisa estado, motivo, fuente, tiempos, frescura y cobertura, no solo la lista. [Serialización MCP](../../apps/mobility-core/src/mcp-result.ts) evita duplicar la misma evidencia en el contexto.

Fuentes de `sourceId`: `renfe`, `emt`, `bicimad`, `crtm`, `aemet`, `dgt`, `madrid-air`, `madrid-traffic`, `madrid-parking`, `osm`. Cada herramienta admite el subconjunto indicado.

## Lugares

### `resolve_place`

Busca entidades importadas por nombre o número de parada.

- Entrada: `query` (1–120 caracteres); `source` opcional (`renfe|emt|bicimad|crtm`); `network` opcional (`metro|light-rail|interurban|emt`, para CRTM); `limit` 1–10, por defecto 5.
- Resultado: candidatos con UUID, nombre/coordenadas y evidencia de catálogo; CRTM añade vigencia/correspondencias y la accesibilidad estática disponible.
- Ejemplo: `{"query":"72","source":"emt","limit":5}`.
- Si hay ambigüedad, pedir confirmación. Un número EMT no es el UUID que reciben otras herramientas.
- [Implementación](../../apps/mobility-core/src/mobility.ts) · [CRTM](../sources/crtm.md) · [Evidencia EMT](../acceptance/2026-09-25-emt.md).

### `resolve_address`

Resuelve un lugar público con catálogo primero y geocoder de respaldo.

- Entrada: `query` (3–160 caracteres, sin caracteres de control); `allowExternal` booleano, por defecto `false`.
- Resultado: candidatos y precisión, atribución, procedencia, caché o estado de consentimiento/indisponibilidad.
- Ejemplo local: `{"query":"Museo del Prado","allowExternal":false}`. Solo cambiar a `true` tras la petición/consentimiento informado para búsqueda pública externa.
- No autocompletado, lotes ni direcciones personales/confidenciales. Confirmar el candidato antes de planificar.
- [Implementación](../../apps/mobility-core/src/geocoding.ts) · [Política y caché](../sources/geocoding.md) · [Recursos](../resources/accounts.md#nominatim-público).

## Rutas y transporte

### `plan_journey`

Calcula opciones y conserva las preferencias del usuario.

- Obligatorios: `originId`, `destinationId` (UUID); `departureTime` (`now` o ISO con zona); `modes` (lista no vacía); objeto `preferences`.
- `preferences`: `maxWalkingMinutes` entero 0–120 (15 por defecto), `maxTransfers` 0–6 (2), `wheelchair` booleano (`false`). Puede enviarse `{}` para esos valores por defecto.
- Modos implementados: `TRANSIT` exige transporte, con accesos a pie; `WALK` permite solo caminar; ambos permiten cualquiera de las dos opciones. El schema reconoce `BIKE`/`CAR`, pero el dominio devuelve `unsupported_modes`.
- Resultado: itinerarios por tramos, tiempos previstos/estimados, correspondencias, evidencia dinámica, `weatherContext` y `accessibilityContext`; o un motivo de fallo.

```json
{
  "originId": "UUID_ORIGEN",
  "destinationId": "UUID_DESTINO",
  "departureTime": "now",
  "modes": ["TRANSIT"],
  "preferences": {"maxWalkingMinutes": 15, "maxTransfers": 2, "wheelchair": false}
}
```

La caminata máxima suma todos los tramos a pie. Si ningún itinerario cumple las preferencias, devuelve `no_route`. Los fallos de conexión, grafo, calendario o contrato tienen códigos propios. La cobertura incluye Renfe/EMT/Metro Ligero/interurbanos admitidos, no Metro actual. [Routing](../../apps/mobility-core/src/routing.ts) · [Releases y overlays](../routing-releases.md) · [Evidencia](../acceptance/2026-09-25-routing-releases.md).

### `get_departures`

- Entrada: `placeId` UUID Renfe, `limit` 1–20 (10).
- Resultado: salidas previstas y estimaciones Renfe coincidentes, destino y accesibilidad declarada; llegada estimada y salida estimada son campos distintos.
- Ejemplo: `{"placeId":"UUID_RENFE","limit":5}`.
- Las estimaciones RT se presentan junto al horario previsto. El destino se obtiene del GTFS o de la secuencia del viaje; si falta esa información, se devuelve como desconocido.
- [Implementación](../../apps/mobility-core/src/mobility.ts) · [Evidencia de destinos](../acceptance/2026-09-25-line-destinations.md).

### `get_emt_arrivals`

- Entrada: `placeId` UUID obtenido con `resolve_place(source=emt)`; `limit` 1–20 (5).
- Resultado: próximas llegadas, línea/destino del proveedor, estimación y frescura; estado del refresh/backoff si corresponde.
- Ejemplo: `{"placeId":"UUID_PARADA_EMT","limit":5}`.
- No acepta un número de parada en lugar del UUID ni vincula estimaciones a viajes GTFS por línea sola.
- [Implementación](../../apps/mobility-core/src/emt-arrivals.ts) · [Acta EMT](../acceptance/2026-09-25-emt.md).

### `get_crtm_timetable`

- Entrada: `placeId` UUID CRTM; `serviceDate` opcional `YYYY-MM-DD`; `afterTime` opcional `HH:mm:ss` de 00 a 71 horas; `limit` 1–20 (10).
- Sin fecha usa hoy Madrid; sin hora usa ahora para hoy, o `00:00:00` para otro día. Busca un único día de servicio, aplicando calendario/excepciones.
- Resultado: salidas estáticas y ventanas de frecuencia, destino y evidencia de parada/vehículo. No presenta una llegada terminal como salida.
- Ejemplo: `{"placeId":"UUID_CRTM","limit":5}`.
- Las horas mayores de 24 pertenecen al mismo día de servicio GTFS. Los servicios de frecuencia no exacta devuelven intervalos. Metro caducado no ofrece horarios actuales.
- [Implementación](../../apps/mobility-core/src/crtm.ts) · [Contrato y fuente CRTM](../sources/crtm.md).

## Avisos y contexto

### `get_incidents`

- Entrada: `source` (`renfe|emt|dgt`, por defecto `renfe`); `line` opcional (hasta 20 caracteres); `query` opcional para DGT (2–120); `includeWithdrawn` opcional DGT; `limit` 1–30 (10).
- Resultado: avisos con identidad, vigencia y frescura. DGT conserva carretera/zona, versiones, extremos y retiradas.
- Ejemplos: `{"source":"renfe","line":"C-5"}`; `{"source":"dgt","query":"A-6"}`.
- DGT distingue retiradas de la publicación y cancelaciones explícitas. La consulta de líneas diferencia línea desconocida de línea conocida sin avisos publicados.
- [Movilidad](../../apps/mobility-core/src/mobility.ts) · [DGT](../../apps/mobility-core/src/dgt.ts) · [Fuente DGT](../sources/dgt.md).

### `get_bike_availability`

- Entrada: `placeId` opcional UUID de referencia; `query` opcional (2–120); `limit` 1–20 (5).
- Resultado: estaciones BiciMAD, bicicletas/anclajes, flags de servicio y tiempos por estación. La distancia de cercanía es en línea recta.
- Ejemplo: `{"query":"Atocha","limit":5}`. No calcula una ruta ciclista.
- [Implementación](../../apps/mobility-core/src/mobility.ts) · [Fuente GBFS](../sources/README.md) · [Calidad por entidad](../acceptance/2026-09-25-history-quality.md).

### `get_environment`

- Comunes: `kind` (`air|weather`, por defecto `air`), `limit` 1–30 (10).
- Aire: `stationId` opcional (hasta 30 caracteres) y `pollutant` opcional (`SO2|CO|NO|NO2|PM2.5|PM10|NOx|O3`). Devuelve medidas, unidades y tiempos.
- Tiempo observado: `weatherProduct: "observation"`; `stationId` **o** `placeId`, no ambos. Sin selector usa Retiro (`3195`) de forma explícita. No admite pedir una observación futura.
- Predicción/avisos: `weatherProduct` (`hourly_forecast|daily_forecast|warnings`), `placeId` resuelto; `fromTime/toTime` opcionales ISO con zona. La diaria permite hasta siete fechas locales con fin exclusivo; conserva periodos y extremos diarios.
- Resultado: producto seleccionado y evidencia de cobertura/antigüedad. Por ubicación, observación de estación fresca más cercana hasta 20 km; si solo existe una lectura antigua, devuelve su estado y antigüedad.
- Ejemplos: `{"kind":"weather","weatherProduct":"observation","stationId":"3195"}`; `{"kind":"air","pollutant":"NO2"}`; `{"kind":"weather","weatherProduct":"daily_forecast","placeId":"UUID_LUGAR"}`.
- `plan_journey` incorpora este contexto desde la caché compartida. La consulta distingue un producto caducado de una fecha fuera del horizonte publicado.
- [Consulta](../../apps/mobility-core/src/weather-query.ts) · [Observaciones](../../apps/mobility-core/src/weather-observations.ts) · [Actas meteorológicas](../acceptance/index.md).

### `get_road_state`

- Entrada: `query` (2–120), `limit` 1–20 (10).
- Resultado: mediciones de intensidad y ocupación de los sensores municipales, con fecha. Para incidencias de carretera, usa `get_incidents(source=dgt)`.
- Ejemplo: `{"query":"Castellana","limit":5}`.
- [Implementación](../../apps/mobility-core/src/mobility.ts) · [Fuente municipal](../sources/README.md).

### `get_parking`

- Entrada: **uno** entre `query` (2–120) y `parkingId` (cadena numérica de 1–10 dígitos); `limit` 1–20 (10).
- Opcionales: `durationMinutes` entero 1–1440, `vehicleType: "car"`, `date: "YYYY-MM-DD"`.
- Resultado: ocupación por categoría y tiempos; tarifa documental independiente; cálculo orientativo, ejemplo publicado o máximo; escenarios de gratuidad condicionada separados.
- Ejemplo: `{"query":"Plaza Mayor","durationMinutes":120,"vehicleType":"car"}`.
- Proyecta a futuro precios conocidos con etiqueta explícita. «Hoy» usa reloj Madrid, no la fecha de revisión de la tarifa. La falta de tarifa se indica como precio no disponible.
- [Cálculo](../../packages/domain/src/parking-prices.ts) · [Catálogo y fuentes](../../apps/mobility-core/src/catalogs/parking-prices.ts) · [Acta](../acceptance/2026-10-01-parking-prices.md).

## Estado e histórico

### `get_source_health`

- Entrada: `source` opcional de `sourceId`; `{}` consulta todas.
- Resultado: salud persistida, datos disponibles/edad, actividad, heartbeat, fallos y cobertura; catálogos estáticos se distinguen de lecturas dinámicas.
- Ejemplo: `{"source":"aemet"}`.
- `not_initialized` indica que faltan los datos iniciales. El heartbeat describe la actividad del proceso; los tiempos de publicación describen la frescura de cada fuente.
- [Implementación](../../apps/mobility-core/src/mobility.ts) · [Ingestión](../acceptance/2026-09-25-ingestion.md).

### `get_historical_state`

- Entrada: `source` (`dgt|aemet|emt|renfe|bicimad|madrid-air|madrid-traffic|madrid-parking`); exactamente uno de `at` ISO con zona o `minutesAgo` 0–1440; `mode` (`event|knowledge`, por defecto `event`).
- Resultado: índice parcial y hasta cinco entidades de muestra, con revisiones, tiempos y cobertura retenida.
- Ejemplo: `{"source":"bicimad","minutesAgo":10,"mode":"knowledge"}`.
- `event` toma la revisión retenida más reciente del hecho, aunque se conociera después. `knowledge` excluye lo que aún no se había ingerido en ese instante. No consulta el historial de chats.
- [Implementación](../../apps/mobility-core/src/history.ts) · [Evidencia](../acceptance/2026-09-25-history-quality.md).

## Agregados almacenados

Los tres leen datos existentes, sin fanout a proveedores ni activación de la ventana. [Implementación común](../../apps/mobility-core/src/aggregates.ts) · [Evidencia y límites](../acceptance/2026-09-28-dgt-aggregates.md).

### `get_line_status`

- Entrada: `source` (`renfe|emt|crtm`), `line` (1–40); `network` para CRTM (`metro|light-rail|interurban|emt`); `limit` 1–20 (5).
- Resultado: identidad de línea, cobertura estática y avisos retenidos. Requiere red para desambiguar CRTM.
- Ejemplo: `{"source":"renfe","line":"C5"}`.

### `get_network_status`

- Entrada: `source` opcional (`renfe|emt|crtm|dgt`).
- Resultado: resumen de evidencias, conteos y carencias, con frescura por flujo.
- Ejemplo: `{"source":"emt"}`.

### `get_mobility_snapshot`

- Entrada: `source` opcional de `sourceId`.
- Resultado: resumen transversal de componentes retenidos y ausencias; cada componente conserva su propia fecha de referencia.
- Ejemplo: `{}`.

**Referencias:** [productos y atribución](../sources/README.md), [especificación MCP y librería usada](../resources/index.md#tecnología), [glosario](../glossary.md).
