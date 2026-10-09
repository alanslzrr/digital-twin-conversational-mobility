# Recursos e investigación

[Índice de la wiki](../index.md) · [Registro por producto](../sources/README.md) · [Cuentas y claves](accounts.md) · [Archivo de investigación](../research/index.md)

Referencias oficiales e investigaciones utilizadas en la implementación. Cada recurso enlaza con el componente que lo utiliza. Las licencias y la cobertura se detallan en el [registro de fuentes](../sources/README.md).

Revisión documental general: **02/10/2026**; referencias de arquitectura cloud ampliadas el **05/10/2026**. Las páginas oficiales pueden cambiar; las versiones locales se contrastan con el lockfile/código. Los enlaces de investigaciones originales conservan la fecha de esas investigaciones. [Accesos limitados](#accesos-y-verificación).

## En esta página

- [Seguridad de dependencias](#seguridad-de-dependencias--03102026)
- [Parches y licencia del 06/10/2026](#security-updates-2026-10-06)
- [Tecnología](#tecnología)
- [Transporte y routing](#transporte-y-routing)
- [Meteorología y geografía](#meteorología-y-geografía)
- [Carreteras y entorno municipal](#carreteras-y-entorno-municipal)
- [Geocodificación](#geocodificación)
- [Cloud y alternativas](#cloud-y-alternativas)
- [Arquitectura para 20–30 usuarios](#arquitectura-para-2030-usuarios)
- [Investigaciones aplicadas](#investigaciones-aplicadas)
- [Criterio documental](#criterio-documental)
- [Accesos y verificación](#accesos-y-verificación)

## Tecnología

| Recurso oficial | Qué explica y conclusión aplicable | Versión/uso local |
| --- | --- | --- |
| [EVE](https://github.com/vercel/eve) | Marco de agente, interfaz de chat, canales y runtime | EVE 0.65.0 fijado; [procedencia UI](../../apps/eve-web/vendor/eve/README.md), [arquitectura](../architecture.md) |
| [EVE Next.js](https://github.com/vercel/eve/blob/main/docs/guides/frontend/nextjs.mdx) y [protección de rutas](https://github.com/vercel/eve/blob/main/docs/guides/auth-and-route-protection.md) | Integración del canal y controles de identidad. El guard debe cubrir rutas EVE, no solo middleware | Referencias upstream; conducta local en [guard](../../apps/eve-web/src/evaluation-guard.ts) y [acta historial](../acceptance/2026-09-28-conversation-history.md) |
| [OpenAI quickstart](https://developers.openai.com/api/docs/quickstart) | Crear una clave y hacer solicitudes desde el servidor | [Pasos de alta](accounts.md#openai-directo); [configuración del modelo](../../apps/eve-web/src/model.ts) |
| [MCP](https://modelcontextprotocol.io/specification/2025-11-25) y [mcp-handler](https://github.com/vercel-labs/mcp-handler) | Protocolo y adaptador de servidor; los permisos son responsabilidad de la aplicación | Especificación de referencia 2025-11-25; [16 herramientas](../reference/mcp.md) |
| [Better Auth / Next.js](https://better-auth.com/docs/integrations/next) | Integración de sesiones HTTP | Better Auth 1.7.5; [Core](../../apps/mobility-core/src/better-auth.ts), [operación de cuentas](../evaluation.md) |
| [OTP](https://docs.opentripplanner.org/en/v2.10.0/) y [release 2.10.0](https://github.com/opentripplanner/OpenTripPlanner/releases/tag/v2.10.0) | Construcción con GTFS/OSM y consulta de rutas | Imagen fijada; [releases](../routing-releases.md), [infraestructura](../../infra/local/compose.yaml) |
| [GTFS Schedule](https://gtfs.org/documentation/schedule/reference/) | Calendarios, excepciones, horarios y frecuencias. Frecuencia no exacta no es salida exacta | [Preparador CRTM](../../scripts/prepare-crtm.py), [consulta](../../apps/mobility-core/src/crtm.ts) |
| [GTFS Realtime](https://gtfs.org/documentation/realtime/reference/) | Viajes, paradas, estimaciones y avisos. Aplicar solo con identidad y evidencia | [Reglas RT](../../packages/domain/src/routing-realtime.ts), [routing](../routing-releases.md#tiempo-real-sobre-rutas-previstas) |
| [GTFS accesibilidad](https://gtfs.org/getting-started/features/accessibility/) y [pathways](https://gtfs.org/getting-started/features/pathways/) | Declaraciones de vehículo/parada distintas de una ruta accesible completa | [Investigación](../research/2026-09-29-static-accessibility.md), [dominio](../../packages/domain/src/accessibility.ts), [acta](../acceptance/2026-09-29-static-accessibility.md) |

### Panel especificado el 02/10/2026

La [auditoría de PR #45](../audits/2026-10-02-core-dashboard-review.md) contrasta la implementación posterior con estas decisiones. La tabla siguiente conserva el estado de la especificación inicial.

| Referencia | Uso acordado | Estado local |
| --- | --- | --- |
| [Community Agent](https://github.com/vercel-labs/community-agent-template/tree/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b) y [MIT](https://github.com/vercel-labs/community-agent-template/blob/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b/LICENSE) | Adaptar shell/sidebar/actividad al estilo EVE; no backend, OAuth, Redis ni fallbacks demo | [Spec de una PR](../plans/2026-10-02-core-dashboard.md); sin implementar |
| [SWR](https://swr.vercel.app/docs/advanced/understanding) | Refrescar consultas almacenadas de la vista activa, separado de heartbeat y ejecución manual | Dependencia por incorporar; política detallada en el spec |
| [Leaflet 1.9.4](https://leafletjs.com/reference.html) y [política tiles OSM](https://operations.osmfoundation.org/policies/tiles/) | Mapa de entidades con raster externo autorizado, atribución y caché HTTP, sin proveedor nuevo de movilidad | Leaflet/tipos por incorporar; sin claves ni servidor cartográfico nuevo |

### Revisión visual de PR #45

| Referencia | Propósito y conclusión | Fecha y uso local |
| --- | --- | --- |
| [Demo Community Agent](https://community-agent.labs.vercel.dev/) | Composición de indicadores, tendencia y actividad; no reutilizar métricas de Slack ni cifras demo como datos de movilidad | Consultada 02/10/2026; [spec de refinamiento](../audits/2026-10-02-core-dashboard-review.md#spec-de-refinamiento-para-el-agente) |
| [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) | Contrastar teclado, semántica, números, filtros y estados de carga; adaptar sin cambiar el chat oficial | Consultadas 02/10/2026; [auditoría visual](../audits/2026-10-02-core-dashboard-review.md#auditoría-visual) |
| [better-ui](https://github.com/jakubkrehel/skills/tree/main/skills/better-ui) | Superficies, radios, alineación, iconos y feedback consistente; preservar componentes/tokens del proyecto | Repositorio consultado y skill local existente leída el 02/10/2026; [aplicación al panel](../audits/2026-10-02-core-dashboard-review.md#sistema-visual-e-interacción). No reinstalada ni añadida como dependencia de la app. |
| [emil-design-eng](https://github.com/emilkowalski/skills) | Jerarquía, estados e interacción intencional; no animación ornamental o repetitiva durante polling | Repositorio consultado y skill local existente leída el 02/10/2026; [criterios de revisión](../audits/2026-10-02-core-dashboard-review.md#referencias-y-skills). No sustituye el estilo EVE. |
| [Cuatro imágenes de inspiración del usuario](../audits/assets/core-dashboard/README.md) | KPI/gráfico coherente, lista/detalle operativo, selección clara y sidebar agrupada | Aportadas y archivadas sin editar el 02/10/2026. Datos de demo, no QA de Mobility Core; [interpretación y límites](../audits/2026-10-02-core-dashboard-review.md#referencias-y-skills). |

## Transporte y routing

| Recurso | Conclusión aplicada | Dónde se usa / fecha pertinente |
| --- | --- | --- |
| [Renfe GTFS](https://data.renfe.com/dataset/horarios-cercanias) | Fuente pública de horarios; extraer Madrid preservando calendarios | [Preparador](../../scripts/prepare-otp.py), [routing](../routing-releases.md); vigencia por manifiesto |
| [Renfe viajes RT](https://data.renfe.com/dataset/horarios-viaje-cercanias) y [avisos](https://data.renfe.com/dataset/incidencias-avisos) | Productos separados para estimaciones de viajes y avisos publicados | JSON oficiales `gtfsrt.renfe.com/trip_updates.json` y `alerts.json`; [adaptadores](../../apps/mobility-core/src/adapters), [registro de condiciones](../sources/README.md) |
| [Condiciones Renfe](https://data.renfe.com/legal) | Preservar origen y distinguir elaboración propia | Fuente/atribución en resultados y manifiestos; fichas CC BY 4.0 consultadas el 02/10/2026 |
| [CRTM datos](https://datos.crtm.es/) y [licencia CRTM](https://www.crtm.es/licencia-de-uso) | Catálogos y horarios con calendario por feed; licencia específica del publicador CRTM | [Items ArcGIS y vigencias](../sources/crtm.md), [catálogo de fuentes](../../apps/mobility-core/src/catalogs/crtm-sources.json) |
| [EMT nueva aplicación](https://mobilitylabs.emtmadrid.es/es/doc/new-app) y [API](https://apidocs.emtmadrid.es/) | Alta de aplicación, credenciales y autenticación de la API | [Alta y moderación](accounts.md#emt-mobilitylabs), [cliente](../../apps/mobility-core/src/adapters/emt-client.ts), [entrega](../acceptance/2026-09-25-emt.md) |
| [BiciMAD GBFS](https://datos.emtmadrid.es/dataset/gbfs-general-bikeshare-feed-specification-de-bicimad), [feed oficial](https://madrid.publicbikesystem.net/customer/gbfs/v2/gbfs.json) y [metadatos](https://datos.emtmadrid.es/dataset/70341916-cf8e-42f2-9c23-797539694bb4/resource/68dee117-c5ee-42d1-814a-60e1ebd8387a/download/metadatos_gbfs_bicimad.pdf) | Feed EMT con TTL y hora por estación; condiciones no comerciales en sus metadatos | [Consulta](../reference/mcp.md#get_bike_availability), [calidad](../acceptance/2026-09-25-history-quality.md) |
| [Geofabrik Madrid](https://download.geofabrik.de/europe/spain/madrid.html) y [OSM copyright](https://www.openstreetmap.org/copyright) | Calles para conexiones a pie, extracto acotado y atribución ODbL | [Preparación de grafo](../../scripts/prepare-otp.py), [releases](../routing-releases.md) |

## Meteorología y geografía

| Recurso | Conclusión aplicada | Uso / versión o investigación |
| --- | --- | --- |
| [AEMET alta](https://opendata.aemet.es/centrodedescargas/altaUsuario), [API](https://opendata.aemet.es/dist/) y [novedades](https://opendata.aemet.es/centrodedescargas/novedades) | Clave solo Core; renovación documentada; observaciones y horarios comparten cliente | [Pasos manuales](accounts.md#aemet), [adaptadores](../../apps/mobility-core/src/adapters); aviso de caducidad revisado 02/10/2026 |
| [Predicciones por municipio](https://www.aemet.es/es/eltiempo/prediccion/municipios) | Predicción municipal organizada por periodos | [Investigación del viaje](../research/2026-09-28-journey-weather.md), [contexto](../../apps/mobility-core/src/journey-weather.ts) |
| [XML diario Madrid](https://www.aemet.es/xml/municipios/localidad_28079.xml) | Producto público separado del JSON horario; conservar intervalos, ceros y ausencias | [Contraste XML/JSON](../research/2026-09-30-daily-weather.md), [acta diaria](../acceptance/2026-09-30-daily-weather.md) |
| [RSS de avisos Madrid](https://www.aemet.es/es/rss_info/avisos/mad) y [Atom CAP](https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAP7228_ATOM.xml) | Avisos por zona/vigencia, descarga condicional y caché compartida | [Investigación CAP](../research/2026-09-28-journey-weather.md), [caché](../../apps/mobility-core/src/weather-cache.ts) |
| [Nota legal AEMET](https://www.aemet.es/es/nota_legal) | Atribuir fuente y fechas, distinguir derivados | [Registro de productos](../sources/README.md): observaciones, predicciones y avisos |
| [IGN unidades administrativas](https://api-features.ign.es/collections/administrativeunit?f=json), [extracto ES30](https://api-features.ign.es/collections/administrativeunit/items?f=json&limit=200&codnut2=ES30&nationallevelname=Municipio) y [licencia](https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf) | 179 municipios con código AEMET; excluir unidades especiales sin equivalencia | [Importador](../../scripts/import-weather-geography.mjs), [preparación](../installation.md#meteorología-y-geocodificación), [evidencia](../acceptance/2026-09-28-journey-weather.md) |
| [Multiestación: acta y referencias originales](../acceptance/2026-09-30-weather-observations.md) | Adquisición compartida; estación seleccionada hasta 20 km, con distancia y antigüedad | [Selección de estación](../../packages/domain/src/weather-observations.ts), catálogo inicial 25 estaciones |

## Carreteras y entorno municipal

| Recurso | Conclusión aplicada | Uso / evidencia |
| --- | --- | --- |
| [DGT DATEX 3.7](https://nap.dgt.es/es/dataset/incidencias-dgt-datex2-v3-7), [XML](https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml) y [aviso legal](https://www.dgt.es/contenido/aviso-legal/) | Acceso público sin cuenta; retirada de un registro no confirma cancelación | [Fuente DGT](../sources/dgt.md), [implementación](../../apps/mobility-core/src/dgt.ts), [acta](../acceptance/2026-09-28-dgt-aggregates.md) |
| [Aire Madrid](https://datos.madrid.es/dataset/212531-0-calidad-aire-tiempo-real) y [estaciones](https://datos.madrid.es/dataset/212629-0-estaciones-control-aire/information) | Identidad, magnitud, unidad y hora de cada medición | [Calidad por entidad](../acceptance/2026-09-25-history-quality.md), [consulta](../reference/mcp.md#get_environment) |
| [Tráfico Madrid](https://datos.madrid.es/dataset/202087-0-trafico-intensidad) | Intensidad y ocupación registradas por sensores municipales | [Consulta](../reference/mcp.md#get_road_state), [adaptadores](../../apps/mobility-core/src/adapters) |
| [Ocupación de parking](https://datos.madrid.es/dataset/50027-0-aparcamientosocupacionyservicios) | Ocupación por categoría con fecha de observación propia | [Calidad](../acceptance/2026-09-25-history-quality.md), [MCP](../reference/mcp.md#get_parking) |
| [Condiciones Madrid](https://datos.madrid.es/pages/condiciones-de-uso) | Aplicar condiciones por producto y sus excepciones | [Condiciones de cada producto](../sources/README.md) |
| [Aparcamientos EMT y tarifas](https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES) | Relacionar identidad con publicación específica; coste orientativo, máximos y condiciones | [Catálogo con enlaces de cada tarifa](../../apps/mobility-core/src/catalogs/parking-prices.ts), [cálculo](../../packages/domain/src/parking-prices.ts), [acta 01/10](../acceptance/2026-10-01-parking-prices.md) |

## Geocodificación

| Recurso | Conclusión aplicada | Uso |
| --- | --- | --- |
| [Política Nominatim](https://operations.osmfoundation.org/policies/nominatim/) y [Search API](https://nominatim.org/release-docs/latest/api/Search/) | Catálogo primero, consentimiento, identificación, atribución, caché y límite global; nada de autocompletado o datos privados | [Configuración](accounts.md#nominatim-público), [contrato](../sources/geocoding.md), [adaptador](../../apps/mobility-core/src/adapters/geocoder.ts); autorizado localmente 27/09 |

## Cloud y alternativas

| Recurso/alternativa | Conclusión del proyecto | Estado y uso |
| --- | --- | --- |
| [EVE en Vercel](https://github.com/vercel/eve/blob/main/docs/guides/deployment/vercel.mdx) y [integraciones](https://vercel.com/docs/integrations) | Posible separación Web/Core en dos proyectos y almacenes gestionados | [Preparación cloud](../deployment.md); recursos creados, no despliegue |
| [Queues](https://vercel.com/docs/queues), [Workflow](https://vercel.com/docs/workflow), [Sandbox](https://vercel.com/docs/vercel-sandbox) | Servicios estudiados para ejecutar trabajos y procesos en Vercel | Alternativas de alojamiento a los procesos locales |
| [AI Gateway](https://vercel.com/docs/ai-gateway) | Alternativa descartada para este proyecto: se eligió API directa | [Conexión implementada](../../apps/eve-web/src/model.ts) |
| [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [precios](https://vercel.com/pricing) y [términos](https://vercel.com/legal/terms) | Frecuencias, cuotas y condiciones de los planes Vercel | Referencias para elegir la configuración de alojamiento |
| Proveedor externo para Metro/alternativas | Alternativas de cobertura estudiadas; Metro actual quedó excluido de esta versión | [Investigación y decisión](../research/2026-09-29-metro-alternatives.md), [alcance vigente](../roadmap.md) |

## Arquitectura para 20–30 usuarios

Referencias revisadas el **05/10/2026** para el [spec de evolución](../plans/2026-10-05-scalable-architecture.md), no para describir un despliegue existente. Precios y cuotas se vuelven a comprobar antes de contratar.

| Fuente primaria | Conclusión y uso en el spec |
| --- | --- |
| [Workflow Vercel](https://vercel.com/docs/workflows/pricing), [Hobby](https://vercel.com/docs/plans/hobby), [Pro](https://vercel.com/docs/plans/pro-plan) y [Functions](https://vercel.com/docs/functions/limitations) | Distinguir ejecución durable, límite de invocación y retención. Hobby retiene un día después de completar el run, Pro siete: condiciona conservar el historial actual. |
| [World PostgreSQL](https://workflow-sdk.dev/worlds/postgres) y [despliegue Workflow](https://workflow-sdk.dev/docs/deploying) | Self-host exige compatibilidad de versión, proceso persistente, protección de rutas y pruebas; no introducir SQL en Web como sustitución automática. |
| [Next.js en Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Node](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) y [Containers](https://developers.cloudflare.com/containers/) | La guía actual recomienda vinext beta. Workers no equivale a Node completo; Containers es otro producto. No migrar EVE sin gate del runtime. |
| [Cloud Run](https://docs.cloud.google.com/run/docs/configuring/billing-settings) y [Compute Engine](https://docs.cloud.google.com/compute/docs/general-purpose-machines) | Distinguir CPU por petición de proceso persistente. GCP es alternativa de hosting, no segunda implementación obligatoria. |
| [S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html), [IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) y [roles ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam-roles.html) | Objetos privados y credenciales de workload con mínimo privilegio; la VM inicial no proporciona aislamiento IAM por contenedor automáticamente. |
| [Neon](https://neon.com/pricing) | Dimensionar almacenamiento, cómputo, conexiones y recuperación antes de reutilizar el proyecto preparado; free tier no se presume suficiente. |
| Skills [nextjs-on-cloudflare](https://github.com/cloudflare/skills/tree/main/skills/nextjs-on-cloudflare) y [aws-iam](https://github.com/aws/agent-toolkit-for-aws/tree/main/skills/core-skills/aws-iam) | Instaladas el 05/10 en el directorio personal de skills; leídas como apoyo de arquitectura. No añadidas al lockfile ni ejecutadas para provisionar. |

## Investigaciones aplicadas

| Investigación original | Síntesis que se conserva | Implementación/evidencia |
| --- | --- | --- |
| [Contexto meteorológico, 28/09](../research/2026-09-28-journey-weather.md) | Derivar municipio y periodo del viaje para reutilizar las predicciones compartidas | [Plan ejecutado](../plans/2026-09-28-journey-weather.md) → [acta](../acceptance/2026-09-28-journey-weather.md) |
| [Accesibilidad, 29/09](../research/2026-09-29-static-accessibility.md) | Declaraciones separadas; discrepancias por versión visibles | [Plan](../plans/2026-09-29-static-accessibility.md) → [acta](../acceptance/2026-09-29-static-accessibility.md) |
| [Metro/CRTM, 29/09](../research/2026-09-29-metro-crtm-coverage.md) y [alternativas](../research/2026-09-29-metro-alternatives.md) | Catálogo disponible, calendarios caducados y alternativas de cobertura estudiadas | [Plan retirado](../plans/2026-09-29-metro-crtm-coverage.md) y [consolidación ejecutada](../plans/2026-09-29-scope-closure.md) |
| [Diaria, 30/09](../research/2026-09-30-daily-weather.md) | XML diario público con intervalos y extremos por fecha | [Plan](../plans/2026-09-30-daily-weather.md) → [acta](../acceptance/2026-09-30-daily-weather.md) |
| Histórico, ingestión, identidad y routing | Correcciones y decisiones documentadas durante las entregas | [Auditoría inicial](../audits/2026-09-25-evaluation.md), [actas](../acceptance/index.md) y [evolución](../evolution.md) |

## Criterio documental

Las [reglas de edición](../AGENTS.md) aplican dos referencias aportadas para este proyecto: lenguaje claro apoyado por diagramas y el patrón **LLM Wiki**, basado en páginas interconectadas, índice y registro de revisiones. Ambos recursos se recibieron como texto, sin URL de origen.

## Accesos y verificación

Las altas OpenAI/EMT/AEMET, novedades AEMET, política Nominatim, EVE, Better Auth, MCP, OTP y GTFS se consultaron en páginas oficiales durante esta reorganización. Las referencias de producto se contrastan además con [las investigaciones originales](../research/index.md) y el [registro de fuentes](../sources/README.md).

- Panel de claves OpenAI y formularios de alta: requieren iniciar sesión o completar un captcha.
- Condiciones EMT: la consulta del 02/10/2026 redirigió a login. El registro conserva la revisión anterior.
- AEMET Swagger: la referencia de endpoints se consulta en un navegador con JavaScript.
- Las condiciones de reutilización se consultan por producto en el registro de fuentes.

Las comprobaciones de enlaces y acceso se recogen en el [registro de revisiones](../log.md).

## Panel privado y captura · 02/10/2026

| Referencia | Propósito y uso local |
| --- | --- |
| [Community Agent, revisión fijada](https://github.com/vercel-labs/community-agent-template/tree/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b) | Composición sidebar/header, no backend ni métricas; adaptación MIT en vendor/community-agent. |
| [Leaflet 1.9.4 API](https://leafletjs.com/reference.html) | Mapa diferido, círculos canvas, viewport acotado y atribución. |
| [Política de teselas OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) | HTTPS normal, atribución visible, sin barridos/offline/cache-busting ni identidad en URL. |
| [PostgreSQL 17: timeouts](https://www.postgresql.org/docs/17/runtime-config-client.html) | Límites locales de sentencia, lock y transacción complementados por watchdog/checkout del pool dedicado. |
| [SWR: gestión de errores](https://swr.vercel.app/docs/error-handling) | Reintentos limitados, Retry-After y cadencia mínima adicional; deduplicación sola no impone frecuencia. |

[Arquitectura](../architecture.md#panel-y-captura-de-observabilidad) → [referencia](../reference/system.md#panel-y-telemetría) → [acta](../acceptance/2026-10-02-core-dashboard.md).


## Seguridad de dependencias · 03/10/2026

| Referencia | Propósito, conclusión y uso local |
| --- | --- |
| [GitHub Advisory Database: GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Aviso revisado y actualizado el 02/10/2026: `braces <=3.0.3`, agotamiento de pila, gravedad alta, sin versión corregida. Sustenta el bloqueo histórico de CI y la posterior [retirada de la CLI vulnerable](../acceptance/2026-10-03-core-dashboard-merge-readiness.md). |
| [Registro npm: braces](https://registry.npmjs.org/braces/latest) y [Vercel](https://registry.npmjs.org/vercel/latest) | Consultados con `pnpm view` el 03/10/2026: braces 3.0.3 y CLI 62.2.0. Los builders de la CLI mantienen ts-morph 12.0.0; una actualización de CLI sola no elimina la cadena. No se cambiaron dependencias ni se relajó la auditoría. |

## Free tiers para el despliegue inicial

La [investigación del 05/10/2026](../research/2026-10-05-zero-cost-hosting.md) enlaza las fuentes primarias de Neon, Supabase, Vercel, Railway, Cloudflare, Oracle, Render, Koyeb, Northflank, AWS y GCP junto a sus límites y uso propuesto. Conclusión: priorizar validación de VM persistente Always Free y DB gratuita; no confundir créditos temporales o franquicias con bloqueo de gasto. Neon anunció 1 GB por proyecto el 02/10; Oracle documenta actualmente A1 de 2 OCPU/12 GB totales. Ninguna de esas cuotas certifica capacidad del proyecto.

<a id="security-updates-2026-10-06"></a>

## Parches y licencia · 06/10/2026

| Referencia | Conclusión aplicada | Uso local |
| --- | --- | --- |
| [source-map-js 1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) y [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | Corregir la validación de offsets en source maps indexados | Override acotado de 1.2.1 a 1.2.2 en [pnpm-workspace.yaml](../../pnpm-workspace.yaml) |
| [KaTeX GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7) | Evitar que propiedades heredadas alteren la confianza y las opciones del renderizador | KaTeX 0.18.2 para el plugin matemático de Streamdown; se comprueba render y rechazo de enlaces no confiables |
| [Licencia MIT, OSI](https://opensource.org/license/mit) | Licencia permisiva elegida para facilitar la reutilización del código propio | [LICENSE](../../LICENSE); los componentes externos conservan sus licencias y avisos |

## Vídeo y capturas · 06/10/2026

| Referencia | Propósito y conclusión | Uso local |
| --- | --- | --- |
| [Adjuntar archivos con GitHub CLI](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli) y [gh pr edit](https://cli.github.com/manual/gh_pr_edit) | GitHub CLI 2.102.0 permite adjuntar el MP4 a una PR con `--attach` y obtener una URL nativa; el vídeo se presenta como reproductor | Vídeo final en el [README](../../README.md), sin incorporar el archivo pesado al historial Git |
| [Formatos y límites de adjuntos de GitHub](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files) | MP4 con H.264 para compatibilidad; los límites y el acceso dependen del plan y la visibilidad del repositorio | Exportación de 56 segundos a 1080p/60; capturas versionadas en la [galería](../demo.md) |

## Procesado de imágenes · 06/10/2026

| Referencia | Propósito y conclusión | Uso local |
| --- | --- | --- |
| [sharp GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | Aviso incorporado a GitHub Advisory Database el 06/10/2026; sharp 0.35.5 incorpora librsvg 2.63.2 corregida en sus binarios | Override de sharp 0.35.4 a 0.35.5 en [pnpm-workspace.yaml](../../pnpm-workspace.yaml), tras el fallo de auditoría de CI de la demo; [validación](../log.md#2026-10-06-corrección--parche-de-sharp-detectado-en-ci-de-la-demo) |

## OpenSSF y gobernanza · 07/10/2026

| Referencia | Propósito y conclusión | Uso local |
| --- | --- | --- |
| [OpenSSF Passing](https://www.bestpractices.dev/en/criteria/0) | Autoevaluación con evidencias; las declaraciones del mantenedor no se sustituyen por herramientas | [Acta de preparación](../audits/2026-10-07-openssf-best-practices.md) y [ficha 15273](https://www.bestpractices.dev/en/projects/15273/passing) |
| [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) | Escaneo del historial con redacción; checksum fijado y excepción por fingerprint, no exclusión global de documentación | CI y escaneo local de 345 commits |
| [SemVer](https://semver.org/) | Versiones únicas y límites explícitos antes de 1.0 | [Procedimiento de releases](../releasing.md) |
| [Eventos de PR](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) | El cuerpo de la PR es entrada no confiable; validar metadatos con permisos de lectura y código de base | `pr-policy.yml`, sin ejecución de código del fork ni tokens privilegiados |

## Cuentas y LLM multiproveedor · 08/10/2026

| Fuente oficial | Conclusión aplicada | Implementación local |
| --- | --- | --- |
| [AI SDK: OpenAI-compatible](https://ai-sdk.dev/providers/openai-compatible-providers) | Compatibilidad de protocolo no implica igualdad de parámetros, herramientas, contexto o uso | AI SDK 7.0.112, compatible 3.0.66, adaptador concreto y catálogo por modelo; [transporte](../../apps/eve-web/src/model.ts) |
| [EVE: capacidades dinámicas](https://eve.dev/docs/guides/dynamic-capabilities) | Resolver al inicio del turno y suministrar contexto explícito; cambiar modelo no conserva necesariamente caché | EVE 0.65.0; [agente](../../apps/eve-web/agent/agent.ts), pruebas de continuidad/compactación |
| [Better Auth: contraseña](https://www.better-auth.com/docs/authentication/email-password) y [TOTP](https://www.better-auth.com/docs/plugins/2fa) | Tokens de recuperación acotados, revocación de sesiones y verificación MFA; sin impersonación | Better Auth 1.7.5, prueba MFA por sesión y [configuración Core](../../apps/mobility-core/src/better-auth.ts) |
| [Resend: idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys) y [webhooks](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests) | Separar aceptación/entrega, verificar firmas y deduplicar; no seguir enlaces de recuperación | SDK 6.32.1, [cola cifrada](../../apps/mobility-core/src/control/mail.ts), sin activación real |
| [OpenCode Zen](https://opencode.ai/docs/zen/) y [Go](https://opencode.ai/docs/go/) | Usar solo endpoints/modelos compatibles con Chat Completions o Responses; no anunciar Anthropic Messages | Perfiles iniciales desactivados en [0022](../../infra/postgres/migrations/0022_accounts_llm_control.sql) |
| [Undici: validación TLS, GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) | Mantener el transporte y su dependencia de sandbox en la versión 7.x corregida, sin rebajar el gate de seguridad | Core 7.29.1 y override acotado; auditoría del lockfile sin vulnerabilidades conocidas |
| [DeepSeek: thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/) | El razonamiento y las herramientas tienen requisitos propios; conservarlo dentro de la misma frontera de modelo | [Adaptación no destructiva del historial](../../apps/eve-web/src/model-history.ts) |

[Procedimiento vigente](../accounts-and-llm.md) → [contratos](../../packages/contracts/src/llm.ts) → [pruebas aisladas](../../apps/mobility-core/src/control/control.integration.test.ts). La verificación local usa proveedores ficticios, no certifica todos los modelos de esos servicios.
