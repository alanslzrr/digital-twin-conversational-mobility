# Recursos e investigación

[Índice de la wiki](../index.md) · [Registro por producto](../sources/README.md) · [Cuentas y claves](accounts.md) · [Archivo de investigación](../research/index.md)

Este catálogo conecta documentación oficial con decisiones y código. No almacena copias de documentos externos completos. El registro de fuentes detalla licencias y cobertura; aquí se explica **para qué se consultó cada recurso y dónde se aplica**.

Revisión documental: **02/10/2026**. Las páginas oficiales pueden cambiar; las versiones locales se contrastan con el lockfile/código. Los enlaces de investigaciones originales conservan la fecha de esas investigaciones. [Accesos limitados](#accesos-y-verificación).

## En esta página

- [Tecnología](#tecnología)
- [Transporte y routing](#transporte-y-routing)
- [Meteorología y geografía](#meteorología-y-geografía)
- [Carreteras y entorno municipal](#carreteras-y-entorno-municipal)
- [Geocodificación](#geocodificación)
- [Cloud y alternativas](#cloud-y-alternativas)
- [Investigaciones aplicadas](#investigaciones-aplicadas)
- [Criterio documental](#criterio-documental)
- [Accesos y verificación](#accesos-y-verificación)

## Tecnología

| Recurso oficial | Qué explica y conclusión aplicable | Versión/uso local |
| --- | --- | --- |
| [EVE](https://github.com/vercel/eve) | Marco de agente, canales y runtime. Conservar el chat oficial, no diseñar otro | EVE 0.65.0 fijado; [procedencia UI](../../apps/eve-web/vendor/eve/README.md), [arquitectura](../architecture.md) |
| [EVE Next.js](https://github.com/vercel/eve/blob/main/docs/guides/frontend/nextjs.mdx) y [protección de rutas](https://github.com/vercel/eve/blob/main/docs/guides/auth-and-route-protection.md) | Integración del canal y controles de identidad. El guard debe cubrir rutas EVE, no solo middleware | Referencias upstream; conducta local en [guard](../../apps/eve-web/src/evaluation-guard.ts) y [acta historial](../acceptance/2026-09-28-conversation-history.md) |
| [OpenAI quickstart](https://developers.openai.com/api/docs/quickstart) | Crear clave y hacer solicitudes del lado servidor. No exige Gateway | [Pasos de alta](accounts.md#openai-directo); [modelo directo](../../apps/eve-web/src/model.ts), sin cambiar `gpt-6-luna` |
| [MCP](https://modelcontextprotocol.io/specification/2025-11-25) y [mcp-handler](https://github.com/vercel-labs/mcp-handler) | Protocolo y adaptador de servidor; los permisos son responsabilidad de la aplicación | Spec de referencia 2025-11-25, sin afirmar que todos sus elementos se implementan; [16 herramientas](../reference/mcp.md) |
| [Better Auth / Next.js](https://better-auth.com/docs/integrations/next) | Integración de sesiones HTTP | Better Auth 1.7.5; [Core](../../apps/mobility-core/src/better-auth.ts), [operación de cuentas](../evaluation.md) |
| [OTP](https://docs.opentripplanner.org/en/v2.10.0/) y [release 2.10.0](https://github.com/opentripplanner/OpenTripPlanner/releases/tag/v2.10.0) | Construcción con GTFS/OSM y consulta de rutas | Imagen fijada; [releases](../routing-releases.md), [infraestructura](../../infra/local/compose.yaml) |
| [GTFS Schedule](https://gtfs.org/documentation/schedule/reference/) | Calendarios, excepciones, horarios y frecuencias. Frecuencia no exacta no es salida exacta | [Preparador CRTM](../../scripts/prepare-crtm.py), [consulta](../../apps/mobility-core/src/crtm.ts) |
| [GTFS Realtime](https://gtfs.org/documentation/realtime/reference/) | Viajes, paradas, estimaciones y avisos. Aplicar solo con identidad y evidencia | [Reglas RT](../../packages/domain/src/routing-realtime.ts), [routing](../routing-releases.md#tiempo-real-sobre-rutas-previstas) |
| [GTFS accesibilidad](https://gtfs.org/getting-started/features/accessibility/) y [pathways](https://gtfs.org/getting-started/features/pathways/) | Declaraciones de vehículo/parada distintas de una ruta accesible completa | [Investigación](../research/2026-09-29-static-accessibility.md), [dominio](../../packages/domain/src/accessibility.ts), [acta](../acceptance/2026-09-29-static-accessibility.md) |

## Transporte y routing

| Recurso | Conclusión aplicada | Dónde se usa / fecha pertinente |
| --- | --- | --- |
| [Renfe GTFS](https://data.renfe.com/dataset/horarios-cercanias) | Fuente pública de horarios; extraer Madrid preservando calendarios | [Preparador](../../scripts/prepare-otp.py), [routing](../routing-releases.md); vigencia por manifiesto |
| [Renfe viajes RT](https://data.renfe.com/dataset/horarios-viaje-cercanias) y [avisos](https://data.renfe.com/dataset/incidencias-avisos) | Productos separados, ambos con ficha oficial; no inferir ausencia de problemas de un feed vacío | JSON oficiales `gtfsrt.renfe.com/trip_updates.json` y `alerts.json`; [adaptadores](../../apps/mobility-core/src/adapters), [registro de condiciones](../sources/README.md) |
| [Condiciones Renfe](https://data.renfe.com/legal) | Preservar origen y distinguir elaboración propia | Fuente/atribución en resultados y manifiestos; fichas CC BY 4.0 consultadas el 02/10/2026 |
| [CRTM datos](https://datos.crtm.es/) y [licencia CRTM](https://www.crtm.es/licencia-de-uso) | Catálogo no acredita horario vigente. Publicador CRTM exige sus condiciones, no una licencia presumida | [Items ArcGIS y vigencias](../sources/crtm.md), [catálogo de fuentes](../../apps/mobility-core/src/catalogs/crtm-sources.json) |
| [EMT nueva aplicación](https://mobilitylabs.emtmadrid.es/es/doc/new-app) y [API](https://apidocs.emtmadrid.es/) | Aplicación/credenciales aprobadas; Firebase no necesario para este cliente | [Alta y moderación](accounts.md#emt-mobilitylabs), [cliente](../../apps/mobility-core/src/adapters/emt-client.ts), [entrega](../acceptance/2026-09-25-emt.md) |
| [BiciMAD GBFS](https://datos.emtmadrid.es/dataset/gbfs-general-bikeshare-feed-specification-de-bicimad), [feed oficial](https://madrid.publicbikesystem.net/customer/gbfs/v2/gbfs.json) y [metadatos](https://datos.emtmadrid.es/dataset/70341916-cf8e-42f2-9c23-797539694bb4/resource/68dee117-c5ee-42d1-814a-60e1ebd8387a/download/metadatos_gbfs_bicimad.pdf) | Usar feed EMT, TTL y edad por estación; metadatos no comerciales, sin inventar versión de licencia | [Consulta](../reference/mcp.md#get_bike_availability), [calidad](../acceptance/2026-09-25-history-quality.md) |
| [Geofabrik Madrid](https://download.geofabrik.de/europe/spain/madrid.html) y [OSM copyright](https://www.openstreetmap.org/copyright) | Calles para conexiones a pie, extracto acotado y atribución ODbL | [Preparación de grafo](../../scripts/prepare-otp.py), [releases](../routing-releases.md) |

## Meteorología y geografía

| Recurso | Conclusión aplicada | Uso / versión o investigación |
| --- | --- | --- |
| [AEMET alta](https://opendata.aemet.es/centrodedescargas/altaUsuario), [API](https://opendata.aemet.es/dist/) y [novedades](https://opendata.aemet.es/centrodedescargas/novedades) | Clave solo Core; renovación documentada; observaciones y horarios comparten cliente | [Pasos manuales](accounts.md#aemet), [adaptadores](../../apps/mobility-core/src/adapters); aviso de caducidad revisado 02/10/2026 |
| [Predicciones por municipio](https://www.aemet.es/es/eltiempo/prediccion/municipios) | Pronóstico municipal con periodos, no lluvia observada en cada calle | [Investigación del viaje](../research/2026-09-28-journey-weather.md), [contexto](../../apps/mobility-core/src/journey-weather.ts) |
| [XML diario Madrid](https://www.aemet.es/xml/municipios/localidad_28079.xml) | Producto público separado del JSON horario; conservar intervalos, ceros y ausencias | [Contraste XML/JSON](../research/2026-09-30-daily-weather.md), [acta diaria](../acceptance/2026-09-30-daily-weather.md) |
| [RSS de avisos Madrid](https://www.aemet.es/es/rss_info/avisos/mad) y [Atom CAP](https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAP7228_ATOM.xml) | Avisos por zona/vigencia, descarga condicional y caché compartida | [Investigación CAP](../research/2026-09-28-journey-weather.md), [caché](../../apps/mobility-core/src/weather-cache.ts) |
| [Nota legal AEMET](https://www.aemet.es/es/nota_legal) | Atribuir fuente y fechas, distinguir derivados | [Registro de productos](../sources/README.md); no mezclar observación, predicción y aviso |
| [IGN unidades administrativas](https://api-features.ign.es/collections/administrativeunit?f=json), [extracto ES30](https://api-features.ign.es/collections/administrativeunit/items?f=json&limit=200&codnut2=ES30&nationallevelname=Municipio) y [licencia](https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf) | 179 municipios con código AEMET; excluir unidades especiales sin equivalencia | [Importador](../../scripts/import-weather-geography.mjs), [preparación](../installation.md#meteorología-y-geocodificación), [evidencia](../acceptance/2026-09-28-journey-weather.md) |
| [Multiestación: acta y referencias originales](../acceptance/2026-09-30-weather-observations.md) | Adquisición única, selección hasta 20 km y frescura individual, no representatividad garantizada | [Selección de estación](../../packages/domain/src/weather-observations.ts), catálogo inicial 25 estaciones |

## Carreteras y entorno municipal

| Recurso | Conclusión aplicada | Uso / evidencia |
| --- | --- | --- |
| [DGT DATEX 3.7](https://nap.dgt.es/es/dataset/incidencias-dgt-datex2-v3-7), [XML](https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml) y [aviso legal](https://www.dgt.es/contenido/aviso-legal/) | Acceso público sin cuenta; retirada de un registro no confirma cancelación | [Fuente DGT](../sources/dgt.md), [implementación](../../apps/mobility-core/src/dgt.ts), [acta](../acceptance/2026-09-28-dgt-aggregates.md) |
| [Aire Madrid](https://datos.madrid.es/dataset/212531-0-calidad-aire-tiempo-real) y [estaciones](https://datos.madrid.es/dataset/212629-0-estaciones-control-aire/information) | Identidad, magnitud, unidad y hora por medición; no diagnóstico sanitario | [Calidad por entidad](../acceptance/2026-09-25-history-quality.md), [consulta](../reference/mcp.md#get_environment) |
| [Tráfico Madrid](https://datos.madrid.es/dataset/202087-0-trafico-intensidad) | Sensores de intensidad, no incidencias DGT ni tiempos de viaje | [Consulta](../reference/mcp.md#get_road_state), [adaptadores](../../apps/mobility-core/src/adapters) |
| [Ocupación de parking](https://datos.madrid.es/dataset/50027-0-aparcamientosocupacionyservicios) | Categorías con observación independiente; catálogo no implica lectura | [Calidad](../acceptance/2026-09-25-history-quality.md), [MCP](../reference/mcp.md#get_parking) |
| [Condiciones Madrid](https://datos.madrid.es/pages/condiciones-de-uso) | Aplicar condiciones por producto y sus excepciones | [Registro por fuente](../sources/README.md), no licencia genérica inferida para todo el portal |
| [Aparcamientos EMT y tarifas](https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES) | Relacionar identidad con publicación específica; coste orientativo, máximos y condiciones | [Catálogo con enlaces de cada tarifa](../../apps/mobility-core/src/catalogs/parking-prices.ts), [cálculo](../../packages/domain/src/parking-prices.ts), [acta 01/10](../acceptance/2026-10-01-parking-prices.md) |

## Geocodificación

| Recurso | Conclusión aplicada | Uso |
| --- | --- | --- |
| [Política Nominatim](https://operations.osmfoundation.org/policies/nominatim/) y [Search API](https://nominatim.org/release-docs/latest/api/Search/) | Catálogo primero, consentimiento, identificación, atribución, caché y límite global; nada de autocompletado o datos privados | [Configuración](accounts.md#nominatim-público), [contrato](../sources/geocoding.md), [adaptador](../../apps/mobility-core/src/adapters/geocoder.ts); autorizado localmente 27/09 |

## Cloud y alternativas

| Recurso/alternativa | Conclusión del proyecto | Estado y uso |
| --- | --- | --- |
| [EVE en Vercel](https://github.com/vercel/eve/blob/main/docs/guides/deployment/vercel.mdx) y [integraciones](https://vercel.com/docs/integrations) | Posible separación Web/Core en dos proyectos y almacenes gestionados | [Preparación cloud](../deployment.md); recursos creados, no despliegue |
| [Queues](https://vercel.com/docs/queues), [Workflow](https://vercel.com/docs/workflow), [Sandbox](https://vercel.com/docs/vercel-sandbox) | Referencias de la propuesta cloud original; no describen el worker/OTP locales como desplegados allí | No activados; no trabajo obligatorio |
| [AI Gateway](https://vercel.com/docs/ai-gateway) | Alternativa descartada para este proyecto: se eligió API directa | [Modelo existente](../../apps/eve-web/src/model.ts); no BYOK de Gateway |
| [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [precios](https://vercel.com/pricing) y [términos](https://vercel.com/legal/terms) | No reutilizar cuotas del brief como garantía futura; no usar Cron como bucle RT local | Referencias para una decisión cloud nueva, no pendientes R2 |
| Proveedor externo para Metro/alternativas | Se investigó cobertura, pero se acordó excluir Metro actual, no comprar otro servicio | [Investigación y decisión](../research/2026-09-29-metro-alternatives.md), [alcance vigente](../roadmap.md) |

## Investigaciones aplicadas

| Investigación original | Síntesis que se conserva | Implementación/evidencia |
| --- | --- | --- |
| [Contexto meteorológico, 28/09](../research/2026-09-28-journey-weather.md) | Derivar municipio/periodo del viaje y reutilizar productos, no consultar una vez por alternativa | [Plan ejecutado](../plans/2026-09-28-journey-weather.md) → [acta](../acceptance/2026-09-28-journey-weather.md) |
| [Accesibilidad, 29/09](../research/2026-09-29-static-accessibility.md) | Declaraciones separadas; discrepancias por versión visibles | [Plan](../plans/2026-09-29-static-accessibility.md) → [acta](../acceptance/2026-09-29-static-accessibility.md) |
| [Metro/CRTM, 29/09](../research/2026-09-29-metro-crtm-coverage.md) y [alternativas](../research/2026-09-29-metro-alternatives.md) | Catálogo no prueba servicio vigente; no sustituto externo incorporado | [Plan retirado](../plans/2026-09-29-metro-crtm-coverage.md) y [consolidación ejecutada](../plans/2026-09-29-scope-closure.md) |
| [Diaria, 30/09](../research/2026-09-30-daily-weather.md) | XML diario público; no transformar intervalos en precisión horaria | [Plan](../plans/2026-09-30-daily-weather.md) → [acta](../acceptance/2026-09-30-daily-weather.md) |
| Histórico, ingestión, identidad y routing | Investigaciones y decisiones conservadas en auditoría/actas originales, no crear estudios retrospectivos | [Auditoría inicial](../audits/2026-09-25-evaluation.md), [actas](../acceptance/index.md) y [evolución](../evolution.md) |

## Criterio documental

El usuario aportó dos recursos textuales: claridad mediante lenguaje controlado y diagramas; y el patrón **LLM Wiki** de fuentes, páginas interconectadas, índice y log. Se aplican como reglas prácticas en [AGENTS](../AGENTS.md): no se afirma certificación ASD-STE100 ni se instala un buscador, un framework o un sistema RAG. No se recibió un enlace de origen verificable para esos textos; no se inventa uno.

## Accesos y verificación

Las altas OpenAI/EMT/AEMET, novedades AEMET, política Nominatim, EVE, Better Auth, MCP, OTP y GTFS se consultaron en páginas oficiales durante esta reorganización. Las referencias de producto se contrastan además con [las investigaciones originales](../research/index.md) y el [registro de fuentes](../sources/README.md).

- Panel de claves OpenAI y altas reales: requieren identidad/captcha. Se documenta el procedimiento público, no se accedió a credenciales.
- EMT condiciones: la reconsulta devolvió pantalla de login. Se conserva la referencia/revisión previa, sin afirmar leer contenido restringido nuevo.
- AEMET Swagger: página dinámica sin texto útil en la extracción; la URL existe, pero esa extracción no verifica cada endpoint.
- Un enlace accesible no garantiza disponibilidad de su API ni concede licencia comercial. Las condiciones concretas están en el registro por producto.

La [revisión documental](../log.md) distingue estas comprobaciones de los tests de aplicación y de la evidencia histórica. No se adquirieron datos autenticados ni se hicieron llamadas al modelo para revisar esta wiki.
