# DGT DATEX2 3.7 y agregados almacenados

## Fuente y acceso verificados — 28/09/2026

- [Conjunto oficial NAP](https://nap.dgt.es/es/dataset/incidencias-dgt-datex2-v3-7).
- [XML público](https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml), sin cuenta ni clave en la descarga comprobada. El HTML del recurso contiene el enlace que no aparecía en la extracción de texto; el 403 de la API de metadatos no impedía acceder al XML.
- [Perfil XSD 3.7_1.0](https://nap.dgt.es/datex2/v3/dgt/SituationPublication/xsd/3.7_1.0/). Validación local estructural y de campos utilizados, no validación completa de todos los XSD.
- España excepto Cataluña y País Vasco; no equivale a cobertura exhaustiva de cada carretera. Fuente: Dirección General de Tráfico, NAP España. Metadatos de recurso indican CC BY; el conjunto remite al [aviso legal DGT](https://www.dgt.es/contenido/aviso-legal/). Conservar atribución y referencias; revisar condiciones antes de redistribuir o desplegar externamente.
- Actualización publicada: un minuto. Worker existente: mínimo 60 s, frescura de publicación 180 s, ventana de actividad, lease y backoff habituales. Sin cron adicional; deshabilitado cuando la ingestión local está deshabilitada. Límite 8 MB y timeout de red existente.

La muestra real de 28/09/2026 17:11:05 Madrid contenía 1.192 registros: 738 tramos descritos por extremos y 454 puntos. El fixture reducido conserva dos registros públicos, uno de cada forma, con atribución aquí. Los extremos **no son una geometría del trazado**: no se dibuja una línea inventada ni se aplica un desvío a OTP.

## Identidad, vigencia y correcciones

Identidad `situationId:recordId`, versión del registro, creación, revisión y publicación separadas. Conservamos carretera, sentido publicado, coordenadas, municipio/provincia y puntos kilométricos cuando existen; ausencias explícitas.

El XSD define `validityStatus=active` como activo según el publicador **independientemente** de su especificación temporal. Por eso `published_active_time_conflict` conserva el conflicto con inicio futuro/fin pasado: no confirma una incidencia vigente ni inventa una cancelación. `planned`, períodos complejos y datos de prueba permanecen diferenciados. La antigüedad de la revisión no sustituye a la fecha de publicación ni demuestra por sí sola que el evento terminó.

Una publicación completa sustituye el snapshot. Identidades ausentes se marcan `withdrawn_from_publication`: puede tratarse de finalización, cancelación o corrección, pero el motivo y fin real no están publicados. Reapariciones conservan identidad. Una publicación anterior no retira ni regresa el estado actual. Reintentos idénticos no duplican revisiones; correcciones sí se conservan en el histórico existente.

Migración `0017` añade el job y una tabla de estado/retiradas; no otro scheduler. Retiradas consultables hasta 24 h (lectura limitada a 10.000 retiradas); raw e histórico usan retención existente de 24 h. No hay archivo permanente, replay completo ni lista de cancelaciones confirmadas. Nunca se retira todo por un error HTTP/XML.

## Consultas MCP

- `get_incidents({source:"dgt", query:"Madrid", limit:5})`: carretera, provincia o municipio; `line` es inválido para DGT. `includeWithdrawn:true` añade retiradas retenidas. Frescura de publicación, procedencia y límites en la respuesta.
- `get_historical_state({source:"dgt",minutesAgo:10,mode:"knowledge"})`: índice retenido de publicaciones, no reconstrucción exacta del tráfico ni consulta de la tabla actual.
- `get_source_health({source:"dgt"})`: worker/error/frescura de publicación separados.
- `get_line_status`: Renfe/EMT reconocidos por catálogo, avisos retenidos; CRTM exige red y ofrece identidad/cobertura estática, no avisos inexistentes.
- `get_network_status`: cobertura/frescura y recuentos de evidencia por fuente/red; no certifica operación normal.
- `get_mobility_snapshot`: componentes almacenados con sus fechas, recuentos y muestras acotadas, frescura por entidad cuando corresponde. Las muestras no representan toda la ciudad.

Los tres agregados no contactan proveedores ni prolongan la ventana de actividad. El worker ya activo puede avanzar independientemente. No se presenta una captura multifuente como simultánea. Ausencia de avisos nunca significa «servicio normal». Llegadas EMT siguen siendo por parada bajo demanda, no barrido global.
