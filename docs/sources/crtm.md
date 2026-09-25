# CRTM: catálogos y consulta de horarios estáticos

Estado de código: persistencia y consulta MCP implementadas. La puesta en marcha
requiere aplicar 0014, importar exports y reconstruir Core/Web/agente; véase
[operación local](../local-runtime.md). No se incorpora routing ni RT CRTM.
EMT y R0 permanecen entregados; E2 permanece cerrado.

## Fuentes oficiales comprobadas el 25/09/2026

| Conjunto | Item público de ConsorcioRegional | Paradas / líneas / viajes | Límite superior de servicio |
| --- | --- | --- | --- |
| Metro | `5c7f2951962540d69ffe8f640d94c246` | 1050 / 13 / 120 | 27/05/2026, **caducado** |
| Metro Ligero / Tranvía | `aaed26cc0ff64b0c947ac0bc3e033196` | 96 / 4 / 3001 | 22/07/2027 |
| Interurbanos | `885399f83408473c8d815e40c5e702b7` | 8406 / 354 / 49398 | 26/08/2027 |

Las paradas incluyen estaciones y accesos cuando los contiene el GTFS; no son
recuentos de andenes. El intervalo del manifiesto es la envolvente de calendarios
y excepciones positivas, **no garantiza servicio todos los días**. La consulta aplica día de semana y excepciones por servicio.

Descarga oficial: `https://www.arcgis.com/sharing/rest/content/items/{item}/data`.
Metadatos: el mismo item sin `/data`, con `?f=json`. El registro de código contiene
los tres identificadores permitidos. Portal: <https://datos.crtm.es/>.

**Powered by CRTM** — [Consorcio Regional de Transportes de Madrid](https://www.crtm.es/).
Rige la [licencia específica CRTM](https://www.crtm.es/licencia-de-uso), no se
presupone una licencia Creative Commons. Conservar atribución, versión, fechas y
límites; no presentar el tratamiento como respaldo oficial del producto.
`agency_id=CRTM` identifica aquí al publicador, no a la empresa operadora de cada bus.

## Operación manual

Requiere Python 3.11 o posterior, biblioteca estándar, sin credenciales:

```sh
python3 scripts/prepare-crtm.py --download
# Un solo conjunto:
python3 scripts/prepare-crtm.py --dataset interurban --download
# Reprocesar pares ZIP/metadata existentes, sin red:
python3 scripts/prepare-crtm.py --source-dir data/tmp/crtm
# Regresiones sintéticas, sin red ni base:
python3 scripts/test_prepare_crtm.py
```

Se limita tamaño de descarga, archivos, descompresión y filas. No se extraen
rutas del ZIP. El export en `data/sources/crtm/<conjunto>/<sha256>/` contiene CSV
normalizados y `manifest.json`: hash del ZIP y tablas, versión del parser,
publicación/recuperación, conteos, calendario, atribución y límites. Una repetición
idéntica conserva la evidencia original de recuperación; no afirma que los datos
hayan cambiado. Un export incompatible existente se rechaza, no se sobrescribe.
Los archivos generados no se versionan en Git.

## Semántica conservada

- Identidad compuesta por conjunto y ID oficial; no fusionar por nombre o cercanía.
  Hay tabuladores internos en algunos `trip_id` interurbanos: CSV los conserva.
- Conservar `stop_sequence`: 16 viajes Metro, 738 Metro Ligero y 559 interurbanos
  repiten paradas. No derivar destino mediante una asociación por parada sola.
- Metro incluye 790 ventanas de frecuencia; `exact_times` vacío significa `0`,
  no salidas exactas. Mantener horario de servicio superior a 24 horas.
- Nueve estaciones padre comparten ID oficial entre Metro e interurbanos. Son
  evidencia potencial de correspondencia, no permiso para mezclar UUIDs ni
  promesa de tiempo de transbordo/accesibilidad.
- El horario Metro caducado no debe responder consultas actuales. Catálogo,
  calendario y tiempo real son capacidades distintas.

## Consultas MCP y límites

`resolve_place(source=crtm, network=metro|light-rail|interurban, query=...)` busca
nombres o IDs/códigos exactos sin perder ceros iniciales. No selecciona accesos como
paradas de embarque. Sin source conserva candidatos de ambos catálogos (hasta el
límite por catálogo) y declara ambigüedad, sin elegir red por coincidencia de nombre.
Los UUID CRTM se usan en `get_crtm_timetable`; todavía no están en el grafo OTP.

La consulta de horarios recibe UUID, `serviceDate`, `afterTime` y `limit`. Sin fecha
usa hoy en Madrid; sin hora usa ahora si es hoy, o 00:00:00 para otro día. Consulta
solo ese día de servicio, no días adyacentes; las horas >24 siguen perteneciendo al
día solicitado. La conversión GTFS usa mediodía local menos doce horas transcurridas
para respetar cambios de horario. No es replay de lo conocido en una fecha.

Las excepciones prevalecen sobre el calendario, incluidos servicios definidos solo
por excepciones. Una estación consulta sus andenes de la misma red. Las visitas
repetidas mantienen secuencia; la última visita sin parada posterior no es una
salida, aunque el feed publique departure_time y pickup_type=0. Destino: stop_headsign, después trip_headsign, o
**desconocido**. Se omiten puntos sin hora, sin interpolar; timepoint=0 es aproximado.
Las ventanas de frecuencia desplazan la plantilla según la secuencia de parada y
mantienen exact_times, intervalo y extremo final exclusivo; no se fabrican llegadas.
Los códigos pickup_type 2/3 exigen acuerdos con el operador; 1 no permite embarcar.

Las correspondencias conservan UUID por red: estación padre publicada con el mismo
ID y coordenadas a un máximo de 100 m. Devuelven versión y vigencia de la otra red,
no fusionan lugares ni prometen tiempo de transbordo/accesibilidad. La cobertura es
parcial: estas fuentes identifican al publicador CRTM, no a cada empresa; no hay
correspondencias EMT/Renfe inventadas. Metro caducado conserva catálogo y enlaces,
pero rechaza horarios actuales. `get_source_health(source=crtm)` diferencia redes
importadas y envolventes vigentes/caducadas; nunca declara RT por tener catálogo.

Pendiente: horarios Metro vigentes, relaciones con EMT/Renfe respaldadas por fuentes,
geocodificación y operadores en OTP, RT, actualización coordinada y replay.

## Persistencia y operación local

La migración `0014_crtm_static.sql` y `scripts/import-crtm.mjs` permiten cargar los
exports existentes en una transacción por red. No descargan fuentes ni actualizan
OTP. La sustitución conserva UUID por `(dataset_id, external_id)`, incluso cuando
una parada desaparece y reaparece; no fusiona redes por nombre. Las secuencias
repetidas, calendarios, excepciones y ventanas de frecuencia se almacenan sin
convertirlas en llegadas en tiempo real.

Tras aplicar las migraciones mediante el procedimiento local con respaldo:

```sh
node --env-file=.env.local scripts/import-crtm.mjs data/sources/crtm/light-rail/<version>
node --env-file=.env.local scripts/import-crtm.mjs data/sources/crtm/interurban/<version>
```

El importador verifica hashes de los mismos bytes que consume PostgreSQL, conteos,
red y referencias. Reintentar la misma versión no altera la fecha de incorporación.
Un error revierte toda la sustitución. La importación conserva la vigencia del
manifest: almacenar Metro no convierte sus horarios caducados en actuales.

Regresión opt-in con exports preparados y PostgreSQL local:

```sh
node --env-file=.env.local scripts/test-crtm-import.mjs
```

Esta prueba crea y elimina un esquema temporal, sin modificar tablas habituales.
Regresiones de consulta: `RUN_CRTM_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/crtm.integration.test.ts`.
Comprobación MCP del runtime: `pnpm smoke:mobility --crtm-only`. No llama al modelo
ni a proveedores ni OTP; como las otras herramientas, puede renovar la ventana de
actividad local. Los datos y la compilación se actualizan explícitamente, no mediante
un nuevo scheduler.

El catálogo puede incluir paradas sin stop_times (por ejemplo, `par_8_09568` en el
export interurbano comprobado). Resolver una parada no garantiza disponer de su
horario; una respuesta vacía no demuestra ausencia de servicio real.
