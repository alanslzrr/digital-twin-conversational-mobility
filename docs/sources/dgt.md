# DGT DATEX2 3.7 y agregados almacenados

[Índice de la wiki](../index.md) · [Registro de fuentes](README.md) · [Recursos y altas](../resources/index.md) · [Referencia MCP](../reference/mcp.md)

## Fuente y acceso verificados — 28/09/2026

- [Conjunto oficial NAP](https://nap.dgt.es/es/dataset/incidencias-dgt-datex2-v3-7).
- [XML público](https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml), descarga pública sin cuenta ni clave.
- [Perfil XSD 3.7_1.0](https://nap.dgt.es/datex2/v3/dgt/SituationPublication/xsd/3.7_1.0/). Validación local estructural y de campos utilizados, no validación completa de todos los XSD.
- Incidencias publicadas para España excepto Cataluña y País Vasco. Fuente: Dirección General de Tráfico, NAP España. Metadatos de recurso indican CC BY; el conjunto remite al [aviso legal DGT](https://www.dgt.es/contenido/aviso-legal/). Conservar atribución y referencias; revisar condiciones antes de redistribuir o desplegar externamente.
- Actualización publicada: un minuto. Worker existente: mínimo 60 s, frescura de publicación 180 s, ventana de actividad, lease y backoff habituales. La adquisición se habilita junto con la ingestión local. Límite 8 MB y timeout de red existente.

La muestra real de 28/09/2026 17:11:05 Madrid contenía 1.192 registros: 738 tramos descritos por extremos y 454 puntos. El fixture reducido conserva dos registros públicos, uno de cada forma, con atribución aquí. Los tramos se describen mediante sus puntos extremos. El feed se utiliza para consultar incidencias; el trazado de rutas lo calcula OTP.

## Identidad, vigencia y correcciones

Identidad `situationId:recordId`, versión del registro, creación, revisión y publicación separadas. Conservamos carretera, sentido publicado, coordenadas, municipio/provincia y puntos kilométricos cuando existen; ausencias explícitas.

El XSD define `validityStatus=active` como activo según el publicador **independientemente** de su especificación temporal. Por eso `published_active_time_conflict` conserva el conflicto con inicio futuro/fin pasado: la respuesta muestra el estado publicado junto al conflicto temporal. `planned`, períodos complejos y datos de prueba permanecen diferenciados. La antigüedad de la revisión no sustituye a la fecha de publicación ni demuestra por sí sola que el evento terminó.

Una publicación completa sustituye el snapshot. Identidades ausentes se marcan `withdrawn_from_publication`: puede tratarse de finalización, cancelación o corrección, pero el motivo y fin real no están publicados. Reapariciones conservan identidad. Una publicación anterior no retira ni regresa el estado actual. Reintentos idénticos no duplican revisiones; correcciones sí se conservan en el histórico existente.

La migración `0017` añade el job al worker y una tabla de estado y retiradas. Retiradas consultables hasta 24 h (lectura limitada a 10.000 retiradas); raw e histórico usan retención existente de 24 h. Un error HTTP o XML conserva el snapshot anterior.

## Consultas MCP

- `get_incidents({source:"dgt", query:"Madrid", limit:5})`: carretera, provincia o municipio; `line` es inválido para DGT. `includeWithdrawn:true` añade retiradas retenidas. Frescura de publicación, procedencia y límites en la respuesta.
- `get_historical_state({source:"dgt",minutesAgo:10,mode:"knowledge"})`: índice de las publicaciones conservadas en el histórico de movilidad.
- `get_source_health({source:"dgt"})`: worker/error/frescura de publicación separados.
- `get_line_status`: Renfe/EMT reconocidos por catálogo, avisos retenidos; CRTM exige red y ofrece identidad y cobertura estática.
- `get_network_status`: cobertura, frescura y recuentos de publicaciones por fuente y red.
- `get_mobility_snapshot`: componentes almacenados con sus fechas, recuentos y muestras acotadas, frescura por entidad cuando corresponde.

Los tres agregados leen almacenamiento y conservan la ventana de actividad existente. Cada componente incluye su fecha de referencia. El worker puede actualizar las fuentes en paralelo; las llegadas EMT se adquieren bajo demanda por parada. Una consulta sin avisos indica ausencia de publicaciones para ese filtro, no el estado operativo del servicio.
