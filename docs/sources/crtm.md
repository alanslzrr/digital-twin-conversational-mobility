# CRTM: preparación de catálogos y horarios estáticos

Estado: **preparación local**, no capacidad disponible en chat ni routing. No se
han aplicado migraciones, alterado el worker o cambiado el runtime habitual.
EMT y R0 permanecen entregados; E2 permanece cerrado.

## Fuentes oficiales comprobadas el 25/09/2026

| Conjunto | Item público de ConsorcioRegional | Paradas / líneas / viajes | Límite superior de servicio |
| --- | --- | --- | --- |
| Metro | `5c7f2951962540d69ffe8f640d94c246` | 1050 / 13 / 120 | 27/05/2026, **caducado** |
| Metro Ligero / Tranvía | `aaed26cc0ff64b0c947ac0bc3e033196` | 96 / 4 / 3001 | 22/07/2027 |
| Interurbanos | `885399f83408473c8d815e40c5e702b7` | 8406 / 354 / 49398 | 26/08/2027 |

Las paradas incluyen estaciones y accesos cuando los contiene el GTFS; no son
recuentos de andenes. El intervalo del manifiesto es la envolvente de calendarios
y excepciones positivas, **no garantiza servicio todos los días**. Una futura
consulta debe aplicar día de semana y excepciones por servicio.

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

## Semántica que debe preservar la siguiente entrega

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

## Pendiente inmediato

Persistencia transaccional e idempotente, UUIDs estables por namespace, resolución
en chat, consulta de horarios con calendario/excepciones/frecuencias y salud por
versión. Después, incorporar operadores a OTP y finalmente información RT.
Este preparador no implementa esas capacidades ni una actualización coordinada
del grafo. No añade polling ni una nueva campaña de aceptación.
