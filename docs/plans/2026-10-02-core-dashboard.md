# Especificación del panel de Mobility Core y telemetría conversacional

[Índice](../index.md) · [Planes](index.md) · [Alcance vigente](../roadmap.md) · [Arquitectura actual](../architecture.md) · [Contrato MCP](../reference/mcp.md)

**Fecha: 02/10/2026. Estado: implementación inicial validada en entorno aislado; véase el [acta](../acceptance/2026-10-02-core-dashboard.md). La revisión posterior exige las correcciones y el refinamiento definidos en el [spec-audit vigente](../audits/2026-10-02-core-dashboard-review.md#spec-de-refinamiento-para-el-agente). Instalación habitual pendiente de autorización. Entrega: una sola PR**, con commits pequeños por responsabilidad. Este documento conserva el encargo original y sus límites; el spec-audit concreta las seis vistas, métricas y aceptación del refinamiento en esa misma PR, sin sustituir arquitectura, seguridad o retención.

Añadir un panel privado al Web existente para comprender los datos que Mobility Core ofrece, su funcionamiento técnico y la telemetría de las conversaciones propias. Adaptar el aspecto de Community Agent sin importar su backend. No sustituir Mobility Core, sus herramientas, la ingestión, Better Auth ni el chat oficial de EVE.

Base inspeccionada: código funcional de `0e8bd07`; documentación posteriormente integrada en `a3825de`. Especificación preparada en `alanslzrr/core-dashboard`. Antes de implementar, comprobar el HEAD, las migraciones disponibles y los cambios locales; conservar trabajo ajeno. Las rutas propuestas son nuevas salvo que se indique lo contrario. Los estados y decisiones de R0/E2/R1/R2.1 no se reabren.

## Índice interno

- [Decisiones cerradas](#decisiones-cerradas)
- [Arquitectura y límites](#arquitectura-y-límites)
- [Referencia visual y reutilización](#referencia-visual-y-reutilización)
- [Vistas y navegación](#vistas-y-navegación)
- [Semántica de los datos](#semántica-de-los-datos)
- [Inventario de herramientas y efectos](#inventario-de-herramientas-y-efectos)
- [Señales técnicas existentes y faltantes](#señales-técnicas-existentes-y-faltantes)
- [Mapa](#mapa)
- [Actualización y actividad](#actualización-y-actividad)
- [Contratos y endpoints](#contratos-y-endpoints)
- [Autorización y privacidad](#autorización-y-privacidad)
- [Consultas manuales](#consultas-manuales)
- [Telemetría de conversaciones](#telemetría-de-conversaciones)
- [Persistencia y retención](#persistencia-y-retención)
- [Implementación y archivos](#implementación-y-archivos)
- [Pruebas y aceptación](#pruebas-y-aceptación)
- [Entrega de la única PR](#entrega-de-la-única-pr)
- [Referencias verificadas](#referencias-verificadas)

## Decisiones cerradas

Confirmadas expresamente por el usuario durante el diseño:

| Decisión | Resultado obligatorio |
| --- | --- |
| Vistas | Resumen, Datos de movilidad, Herramientas MCP, Fuentes e ingestión, Eventos, Mis conversaciones y detalle de telemetría |
| Mapa | Incluir entidades con coordenadas sobre calles OpenStreetMap; autorizado ese origen externo exclusivamente cartográfico |
| Acceso | Todos los evaluadores activos con el login existente; datos y operación saneados compartidos; conversaciones y ejecuciones manuales exclusivamente propias |
| Actividad | Mientras el panel esté visible, renovar la ventana existente de ingestión; al ocultarlo/cerrarlo dejar de renovarla, sin detener el trabajo de otros usuarios |
| Consultas | Inspección de datos almacenados y ejecución manual explícita de herramientas reales; ninguna ejecución automática de herramientas por refresco |
| Retención nueva | Métricas, eventos y contenido detallado hasta siete días, sujetos a propiedad, revocación, caducidad y límites de almacenamiento explícitos |
| UI | Conservar estilo y componentes actuales de EVE y del panel de referencia; no crear otra identidad visual ni rediseñar el chat |
| Infraestructura | Aplicaciones, PostgreSQL y worker existentes; sin servicios nuevos, Redis obligatorio, Cron, colector externo ni plataforma de observabilidad |

Los intervalos de refresco, límites de páginas, contratos y controles que siguen son las decisiones técnicas de esta especificación. No quedan elecciones funcionales abiertas para que el implementador cambie el alcance por su cuenta.

**Fuera de esta PR:** nuevas fuentes o modos de transporte, edición de datos/configuración/proveedores, botones para reiniciar workers o forzar ingestión, gestión de cuentas, notificaciones, seguimiento de viajes, exportaciones masivas, otra transcripción de chat, lectura de conversaciones ajenas, análisis de razonamiento interno, campañas de gasto, nuevo modelo, cambios OTP/grafo, despliegues cloud y stack de logs externo.

## Arquitectura y límites

1. Nuevo segmento `/dashboard` dentro de `apps/eve-web`. No nueva aplicación, host, puerto ni login.
2. `apps/eve-web/data/queries/dashboard/` será una capa **server-only**: valida identidad, solicita DTO acotados a Core y valida la respuesta. No SQL, clientes de base de datos, adaptadores ni secretos de proveedores en Web.
3. Rutas same-origin `/api/dashboard/*` sirven como BFF, es decir, intermediario Web autenticado. Core añade `/internal/dashboard/*` y `/internal/telemetry`; no exponerlos como herramientas al modelo.
4. Los selectores, filtros y presentadores de datos siguen en Core. Extraer funciones compartidas de las consultas actuales cuando sea necesario, sin copiar sus reglas de normalización/frescura al frontend ni crear otro almacén de movilidad.
5. Mantener las **16 herramientas MCP y su comportamiento actual**. Compartir su registro de nombres, esquemas, descripciones, permisos y ejecutores con el inspector. Las anotaciones MCP `readOnlyHint` no garantizan ausencia de red o escrituras.
6. Separar lectura `stored_only`, señal de actividad y ejecución manual. La primera no llama proveedores, OTP, `activate()`, `ingest()`, `refresh()` ni registra demanda meteorológica. Las otras dos tienen endpoints POST explícitos y comprobaciones propias.
7. La nueva persistencia guarda únicamente observabilidad, límites e idempotencia. Los datos de movilidad continúan en sus tablas/snapshots actuales y los mensajes en EVE.
8. Añadir a `AGENTS.md` la excepción estrecha necesaria: Web puede llamar a las APIs internas de panel/telemetría **del mismo Mobility Core**; el navegador puede cargar únicamente tiles OSM del origen autorizado. No ampliar el acceso a proveedores ni debilitar `check-boundaries.mjs`.

## Referencia visual y reutilización

Referencia: [Community Agent](https://community-agent.labs.vercel.dev/), repositorio [vercel-labs/community-agent-template](https://github.com/vercel-labs/community-agent-template), commit verificado **`9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b`**. Licencia MIT; conservar el texto y copyright de Vercel al reutilizar código sustancial.

| Elemento upstream | Adaptación local |
| --- | --- |
| `app/(dashboard)/layout.tsx`, `components/sidebar.tsx`, `components/header.tsx` | Shell, sidebar y cabecera; rutas y usuario existentes; enlace «Volver al chat» |
| `app/(dashboard)/page.tsx` | Composición de resumen con métricas reales y actividad pertinente |
| `activity/page.tsx`, filtros y búsqueda | Presentación cronológica y filtros; consultas/paginación en Core, no cargar 500 registros y filtrar en navegador |
| `activity/[id]/page.tsx` | Estructura de detalle; sustituir por evento operativo saneado |
| `settings/page.tsx` | Solo patrón de ficha técnica; no añadir una página de configuración editable ni campos de secretos |
| `data/queries/`, `hooks/use-streams.ts` | Organización y refresco SWR, reemplazando completamente el acceso a datos y los controles de errores |

El hook upstream usa `refreshInterval:3000`, `keepPreviousData:true` y revalidación en foco. La deduplicación SWR no coordina a varios usuarios ni workers. Su API real está en `app/api/streams/`; no es necesario conservar ese nombre en el producto local.

**No copiar:** Redis/libSQL, Slack, OAuth/Better Auth del template, agente/modelos, Chat SDK, Workflow/configuración Next o despliegue, vistas de conversaciones Slack, acciones de prueba, `data/mock` ni fallbacks demo. El commit de referencia permite sesión ficticia y datos mock cuando falta Redis: ambos están expresamente prohibidos aquí. Tampoco copiar el fetcher sin comprobar `response.ok` ni su autorización de streams globales para datos privados.

### Continuidad visual obligatoria

- Mantener **Geist / Geist Mono**, tokens semánticos de `app/globals.css`, modos claro/oscuro existentes, Radix/shadcn, Lucide y utilidades `cn` actuales. Conservar selección de tema por `prefers-color-scheme`; retirar el `ThemeToggle` del header upstream, sin `next-themes`, ThemeProvider ni clase global `.dark`. No sustituir componentes locales ni copiar otro CSS global.
- Sidebar compacta de aproximadamente 220 px en escritorio; cabecera y superficie de trabajo como la referencia, bordes suaves y densidad apropiada para tablas. Los estados usan texto e icono además de color.
- Mantener `/s`, `/s/[sessionId]`, composer, renderer, streaming, cancelación, aprobación EVE e historial actual. No envolver el chat en el shell del panel.
- Añadir «Panel» al grupo de navegación de evaluación y «Telemetría» cuando exista una sesión activa; enlaces al panel, no un chat nuevo. Incluir enlace por fila en «Mis conversaciones» sin cambiar el enlace nativo de reapertura.
- Registrar esos cambios mínimos en `vendor/eve/README.md`; procedencia del shell en un nuevo `vendor/community-agent/README.md` y `LICENSE`. Usar componentes shadcn existentes; los faltantes se añaden puntualmente, con su procedencia, sin reinstalar el preset.
- Tablas con encabezados, filas seleccionables y detalle lateral o página; JSON solo bajo un desplegable «Detalle técnico», escapado y con ajuste de líneas. Nada de HTML remoto renderizado, gráficos ficticios, animaciones decorativas ni tarjetas de métricas sin significado.
- En móvil, sidebar en diálogo y mapa/lista con selector; en escritorio pueden coexistir mapa y tabla. Navegación por teclado, foco visible/restaurado, textos de estado accesibles y `prefers-reduced-motion`. No cambiar la tipografía o paleta de EVE para acomodar el panel.

## Vistas y navegación

Etiquetas y textos de interfaz en español; rutas e identificadores según la tabla. El acceso al panel es independiente de tener una conversación activa.

| Ruta | Contenido y acciones |
| --- | --- |
| `/dashboard` | Resumen de productos con datos recientes/antiguos/no disponibles, ventana activa, estado de workers y errores recientes. Acceso directo al explorador, fuentes y conversaciones propias. Ningún semáforo global «todo funciona» basado en una sola fuente fresca |
| `/dashboard/mobility` | Tabla y mapa. Filtros por categoría, fuente, frescura, búsqueda de entidad y área visible. Valores/unidades, fuente, observación, ingestión/actualización, antigüedad y cobertura por fila. Paginación y contadores con alcance explícito |
| `/dashboard/mobility/[category]/[id]` | Ficha de entidad: identidad/correspondencias existentes, coordenadas disponibles, datos por producto, periodos y procedencia, última comprobación y motivos de ausencia. Acceso al histórico existente si esa categoría está soportada; no reconstrucción adicional |
| `/dashboard/tools` | Las 16 herramientas: nombre, descripción, parámetros, permiso, productos utilizados, efectos posibles, diferencia entre inspección y ejecución. «Consultar almacenado» y «Ejecutar herramienta» con formulario validado |
| `/dashboard/tools/[name]` | Entrada y salida de una consulta, vista legible y JSON saneado, tiempo de ejecución, frescura, límites, modo y aviso de posibles efectos. Las ejecuciones son del usuario y no son conversaciones ni inferencias |
| `/dashboard/sources` | Fuente → productos/jobs. Habilitación, adquisición, frescura, última observación/comprobación/éxito/error, próxima elegibilidad, lease/backoff y cobertura. Tabla de dos workers, ventana y retención. Enlace a detalle por fuente |
| `/dashboard/sources/[id]` | Productos de la fuente, recursos bajo demanda existentes, eventos y cobertura estática. Ficha técnica de release activa, solo metadatos permitidos. No controles operativos de escritura |
| `/dashboard/activity` y `/dashboard/activity/[id]` | Eventos estructurados: fecha, componente, producto/job, tipo, severidad, desenlace, duración y error normalizado. Filtros por rango, fuente, tipo y severidad. No tail de ficheros ni terminal web |
| `/dashboard/conversations` | Reutilizar índice propio, 20 por página. Creación, acceso hasta, estado de captura, última actividad **solo si registrada**, métricas parciales disponibles y enlaces «Abrir chat»/«Ver telemetría». No consultar contenidos de todas las sesiones para construir el listado |
| `/dashboard/conversations/[sessionId]` | Resumen y pestañas: Cronología, Herramientas, Modelo y Contenido. Turnos/pasos/intentos/reintentos/compactaciones separados; tokens/latencias/errores y entradas/salidas saneadas. Abrir payload solo por acción del usuario |

### Categorías del explorador

| Categoría | Datos a presentar, sin inventar campos |
| --- | --- |
| Lugares y transporte | Catálogos Renfe/EMT/CRTM, paradas/líneas/identidades y accesibilidad declarada. No mapa de trenes/autobuses si no hay posiciones |
| Salidas y llegadas | Evidencia Renfe RT almacenada y caché EMT por parada. Horarios CRTM consultables mediante filtros; distinguir servicio previsto, estimación y disponibilidad |
| Incidencias | Renfe, EMT y DGT, vigencia y retiradas; coordenadas/geometría solo si existen |
| BiciMAD | Estación, bicicletas/bases, capacidad/servicio y hora/TTL propios |
| Aire y meteorología | Estaciones, magnitudes/unidades, observaciones; productos horarios/diarios/avisos por municipio o zona, emisión, periodos y horizonte |
| Tráfico | Sensores y sus mediciones, no ETA ni predicción de congestión |
| Aparcamiento | Ocupación publicada separada de tarifas, vigencia y condiciones; cálculo orientativo solo con parámetros explícitos |

Para productos sin registros, mostrar el catálogo disponible y «Sin lectura almacenada», no ocultarlos ni generar muestras. Los resultados de consultas manuales `plan_journey` se muestran en su inspector como itinerarios reales calculados; no se incorpora un almacén compartido de rutas ni se dibujan trayectos a partir de nombres de paradas.

**Estados de pantalla:** carga inicial, actualización conservando datos, vacío confirmado, consulta sin resultados, datos antiguos, componente parcial, no instrumentado, error de actualización, acceso caducado y resultado limitado. Un error de red no se presenta como cero entidades. Mantener valores anteriores con «No se pudo actualizar» y hora de última lectura, salvo 401/403/logout: ahí retirar inmediatamente datos privados.

## Semántica de los datos

Contratos Zod aditivos en `packages/contracts/src/dashboard.ts` y `telemetry.ts`. Reutilizar `packages/provenance`; no asignar una caducidad genérica a todos los productos.

Cada DTO de movilidad debe distinguir, con valores nulos cuando no existe evidencia:

- `sourceId`, `productId`, identidad y versión del dato; atribución y enlace público documental permitido.
- `observedAt`: observación del dato o entidad. No la máxima fecha del feed para todas las filas.
- `ingestedAt`: incorporación de esa versión; no se rejuvenece al consultar.
- `checkedAt`: última comprobación cuando el producto la registra. Una 304 no cambia observación/emisión.
- `issuedAt`/`issuedAtRaw`, `validFrom`/`validTo`/horizonte cuando proceda; forecast no es observación. Mantener las incertidumbres temporales existentes de AEMET.
- `freshness`: estado actual calculado por Core, edad/base, umbral y motivo. Preservar valores de origen y añadir etiqueta visible reciente/antiguo/no disponible, sin borrar estados intermedios o no utilizables del dominio.
- `quality`/`coverage` y motivos: parcial, timestamp desconocido, fuera de horizonte, sin coincidencia estática, etc.
- `readAt`: cuándo respondió el panel; **no** «hora del dato». Si la actualización falla, no recalcular en cliente un estado fresco.

En catálogos estáticos mostrar versión/validez/importación, no «tiempo real». En resúmenes mantener tiempos y frescura **por componente**. Cero explícito, ausencia y vacío confirmado son distintos; lista vacía de alertas no demuestra normalidad si faltan cobertura o frescura. Accesibilidad estática no garantiza disponibilidad de ascensores ni itinerario accesible.

Los contadores deben indicar su denominador: productos registrados, productos con datos, entidades filtradas o filas de una página. No mostrar un «total Madrid» calculado sobre una muestra. Fecha visible en `Europe/Madrid`, con zona/offset y detalle ISO UTC; fecha relativa nunca sustituye al instante absoluto.

## Inventario de herramientas y efectos

La implementación actual activa la ventana desde el wrapper MCP salvo los tres agregados. Esta tabla decide qué se puede reutilizar sin efectos. **El inspector almacenado no llama al wrapper MCP.**

| Herramienta | Comportamiento actual relevante | Inspector `stored_only` |
| --- | --- | --- |
| `resolve_place` | Lee catálogos, pero wrapper activa ventana | Selector local sin wrapper |
| `resolve_address` | Catálogo/caché; con consentimiento puede adquirir/escribir | Catálogo y caché vigente, sin geocodificar, sin insertar; no resultado implica ausencia de caché, no dirección inexistente |
| `plan_journey` | OTP local, RT y contexto meteorológico con demanda/adquisición posible | `not_materialized`, no hay itinerario precomputado; ejecutar manualmente para obtenerlo |
| `get_departures` | OTP para horarios y snapshot RT que puede refrescar | Mostrar evidencia RT separada; respuesta completa `not_materialized` si necesita OTP. No hacerse pasar por salida MCP completa |
| `get_emt_arrivals` | Refresh/caché por parada | Lectura de caché sin `refresh()` |
| `get_crtm_timetable` | Consulta tablas GTFS y calendario | Misma consulta acotada, sin wrapper activador |
| `get_incidents` | Snapshots Renfe/EMT/DGT, refresh por defecto | Reutilizar `incidents(input,false)` y lectores equivalentes |
| `get_bike_availability` | Snapshot con posible adquisición | Presenter compartido sobre `snapshot(job,false)` |
| `get_environment` | Snapshots o demanda meteorológica | Snapshots sin refresh; `readWeatherProducts()` sin demandar ni adquirir |
| `get_road_state` | Snapshot con posible adquisición | Presenter compartido sin refresh |
| `get_parking` | Ocupación y catálogo de tarifas/cálculo | Snapshot sin refresh y cálculo puro con los mismos parámetros |
| `get_historical_state` | Historia existente de 24 h | Misma consulta `event`/`knowledge`, sin wrapper activador |
| `get_source_health` | Función interna lectora; wrapper activa ventana | `sourceHealth()` y proyección de campos permitidos |
| `get_line_status` | Agregado solo almacenamiento, sin activar | Reutilizar |
| `get_network_status` | Agregado solo almacenamiento, sin activar | Reutilizar |
| `get_mobility_snapshot` | Agregado solo almacenamiento, sin activar | Reutilizar; sus muestras no sustituyen al explorador paginado |

Wrapper del inspector almacenado: `tool`, `executionMode:"stored_only"`, `evaluatedAt`, `availability:available|unavailable|not_materialized`, `result`, `limitations`. Mantener intacta la semántica del resultado compartido. No materializar rutas, llamar OTP ni inventar una respuesta para completar visualmente el inspector.

## Señales técnicas existentes y faltantes

Contraste con `apps/mobility-core/src/mobility.ts`, `ingestion.ts`, `weather-cache.ts`, `emt-arrivals.ts`, `geocoding.ts`, `routing.ts` y migraciones actuales:

| Señal | Estado actual | Trabajo de esta PR |
| --- | --- | --- |
| Inventario de 16 herramientas | Registro MCP y allowlist EVE | Catálogo de pantalla derivado del mismo registro, sin divergencia |
| Salud de fuentes/jobs | `get_source_health`: intentos, fallos, última ejecución/duración, error/etapa, próxima ejecución, lease, recuperación, cobertura | Reutilizar y sanear DTO, no nueva adquisición |
| Ventana y workers | `ingestion_activity`, heartbeat de carriles 0/1 | Visualizar habilitado/activo/idle/interrumpido, últimos latidos; no confundir worker vivo con proveedor sano |
| Recursos AEMET | `weather_product`/`weather_gate`, no expuestos suficientemente | Exponer estado de recursos existentes: comprobación, demanda, próxima revisión, error/lease/horizonte |
| Caché/gate EMT | `emt_arrival_cache`/`emt_arrival_gate` | Estado por parada e intervalo; no refrescar al listar |
| Geocoder | Gate y caché existentes | Exponer salud/gate agregado; nunca listar consultas de geocodificación de otros usuarios |
| Catálogos y routing | Fuentes habilitadas, versiones y `routing_release` | Ficha de campos públicos: versión, estado, activación y cobertura; no paths/manifiesto completo ni sondeo OTP automático |
| Eventos de ingestión | Estado sobrescrito y contadores; stdout del worker | Nuevo registro estructurado, acotado y paginado, desde el despliegue |
| Logs operativos históricos | Sin API durable segura; raw/history no son logs | No importar/tail de stdout, `.eve`, ficheros o dumps. Solo eventos de los puntos instrumentados |
| Métricas de conversación | JSON numérico en stdout; ledger solo en campañas opt-in | Persistir observaciones nuevas de hooks/transporte, con propiedad y cobertura |
| Inputs/outputs efectivos | No existe archivo completo consultable por sesión interactiva | Proyección segura nueva en frontera de transporte/herramientas, sin reconstrucción retrospectiva |

### Frecuencias existentes que el panel no modifica

| Job | Intervalo base | Frescura del producto |
| --- | ---: | ---: |
| `renfe-trips` | 20 s | 40 s |
| `renfe-alerts` | 30 s | 90 s |
| `bicimad` | 20 s | 60 s |
| `emt-alerts` | 120 s | 600 s |
| `dgt-incidents` | 60 s | 180 s |
| `madrid-air` | 600 s | 7.200 s |
| `madrid-traffic` | 300 s | 900 s |
| `madrid-parking` | 60 s | 300 s |
| `aemet` | 600 s | 7.200 s |

Leer estas políticas del dominio, no mantener otra copia runtime de la tabla. EMT llegadas utiliza caché de 30 s/gate global de 5 s; forecast horario/diario revisa recursos demandados cada 30 min y CAP cada 5 min. Los catálogos se importan/versionan. Respuesta lenta, ventana, lease o backoff pueden aumentar intervalos: no son SLA.

### Eventos y errores operativos

Registrar finalización de adquisición/publicación (success, historical_only, error), lease recuperada/perdida, refresh meteorológico/EMT/geocoder y transiciones de activación/recuperación de release que se instrumenten. Incluir `operationId` estable de ese intento y fase. No correlacionarlo con una conversación por proximidad temporal.

Campos permitidos: instante de origen y registro, componente, fuente/job/recurso público, tipo, severidad, desenlace, duración, `errorCode`/`errorStage` normalizados, número de intento, próxima elegibilidad y contadores numéricos con esquema cerrado. Geocoder: sin texto de búsqueda, dirección o candidatos. Routing: sin endpoints de viaje de usuarios. Nunca argumentos MCP ni contenidos conversacionales en el feed compartido.

No evento por heartbeat, tick inactivo, lectura de panel o carácter de streaming. Mensajes legibles se componen desde códigos y plantillas, no desde `error.message` arbitrario. Filtros por código/tipo/fuente; no hace falta buscador de texto libre sobre logs.

La escritura de eventos no convierte un éxito del proveedor en fallo si observabilidad falla: efectuar escritura best-effort después del commit con ID estable y límite de tiempo. Si se integra en una transacción, usar aislamiento con savepoint probado; un `catch` de SQL no repara una transacción abortada. Mostrar cobertura instrumentada, primer evento retenido y falta de historia anterior; ausencia de eventos no demuestra ausencia de fallos.

## Mapa

Decisión técnica: **Leaflet 1.9.4**, tipos `@types/leaflet` 1.9.22 y carga dinámica exclusivamente cliente; sin `react-leaflet`, MapLibre, API key, servidor de tiles ni geolocalización del usuario. CSS desde el paquete local, no CDN. Preservar atribuciones BSD-2-Clause/OSM.

Solo activar/cargar el mapa cuando su vista esté visible. `preferCanvas:true` con `circleMarker`/Paths para entidades, no mil iconos DOM. Selección sincronizada con ficha/tabla. Etiqueta textual de categoría/frescura y leyenda; tabla accesible equivalente. Mantener cámara al refrescar, actualizar por ID y limpiar listeners con `map.remove()` al desmontar.

Consulta Core tras `moveend`/`zoomend`, debounce 300 ms y cancelación. Bbox WGS84 validado, una categoría a la vez y **máximo 1.000 entidades**; `limited:true` y «Acerca el mapa o filtra» cuando haya más. Sin paginar automáticamente toda la región. El límite es de producto y se verifica en UI, no una garantía de Leaflet. Identificar entidades sin coordenadas fuera del mapa; no geocodificarlas para rellenarlo.

Geometrías solo si están presentes y tienen procedencia. No unir puntos DGT como si fueran una carretera ni mostrar posiciones de vehículos deducidas. En esta PR no es obligatorio dibujar rutas OTP si su contrato no ofrece geometría; su lista de tramos sí se muestra.

Tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `crossOrigin:"anonymous"`, `referrerPolicy:"origin"`, `updateWhenIdle:true`, `updateWhenZooming:false`, `keepBuffer:0`, `noWrap:true`, zoom máximo 19. Atribución visible «© OpenStreetMap contributors» con enlace de copyright. Respetar caché HTTP, sin cache-busters, descargas offline, precarga regional ni proxy. Refrescar datos Core no recarga el raster. No enviar cookies/credenciales/IDs; el Referer contiene solo origen. Permitir únicamente ese host de imágenes, sin abrir indiscriminadamente `connect-src`. Avisar que es un fondo externo best-effort; si falla, conservar datos y tabla y mostrar «Fondo cartográfico no disponible». Probar CORS y mantener el fallback si falla, nunca cambiar a `use-credentials`. Ver [política OSM](https://operations.osmfoundation.org/policies/tiles/).

## Actualización y actividad

SWR como única dependencia nueva de fetching, fijada en versión estable compatible al implementar. Configuración explícita y fetcher que valida HTTP y Zod. No incorporar `cacheComponents`, Workflow del template ni cache global de respuestas de usuario.

| Canal | Frecuencia visible | Efecto |
| --- | --- | --- |
| `GET status` ligero, compartido por shell | 3 s, `dedupingInterval:2500` | Lee revisiones, ventana, workers y cobertura; no entidades/payloads ni proveedores |
| Vista activa: resumen, datos, fuentes, primera página de eventos | 15 s, dedup 15 s y elegibilidad por clave | Relee almacenamiento. Timer/foco/invalidation/retry de la misma consulta comparten un mínimo de 15 s; otra selección del usuario crea una clave nueva |
| Detalle de conversación en ejecución | 3 s, misma clave entre pestañas internas | Metadatos/eventos nuevos, no descargar todos los payloads |
| Conversación terminada, páginas antiguas, catálogo de tools | Al entrar/foco o botón; sin polling continuo | Lectura acotada |
| Resultado del inspector / ejecución manual | Solo submit o lectura por ID | Nunca autoejecutar al montar, recuperar foco, cambiar filtro o reintentar SWR |
| `POST activity` | Al entrar visible y cada 60 s; al volver visible si venció ese intervalo | Solo `activate()` existente, tras auth; no consume cuota de generación ni llama `tick()`/proveedores |

`refreshWhenHidden:false`, `refreshWhenOffline:false`; detener temporizadores/peticiones al ocultar, desmontar, perder acceso o quedar offline. Revalidar al volver al foco con dedup, no en bucle. Heartbeat solo con identidad confirmada y `document.visibilityState==='visible'`. No service worker, keepalive de fondo ni `sendBeacon` al salir. El servidor no puede certificar visibilidad: es una política de cliente, no una frontera de seguridad.

La señal de actividad usa la ventana global actual de 30 minutos y respeta `localIngestionEnabled`, incluidos previews deshabilitados. Al cerrar no se acorta `active_until`: la ventana expira desde la última actividad de cualquier usuario. No renovar demanda de todos los municipios/EMT al entrar; esos productos mantienen su lógica bajo demanda.

Se permite «Pausar actualización» como preferencia de esta pestaña: pausa tanto polling como heartbeat; «Reanudar» revalida una vez. «Actualizar panel» relee almacenamiento, no fuerza adquisición. Etiqueta separada «Actualización de pantalla» y «Ventana de ingestión».

`keepPreviousData` solo dentro de una identidad y consulta semánticamente compatibles; **no** arrastrar un payload entre sesiones, usuarios o entidades distintas. En cambios de filtros mantener valores únicamente identificados como anteriores mientras carga la nueva consulta. Cache SWR en memoria por identidad; sin localStorage, IndexedDB, persistencia de payloads o URLs con prompts.

La deduplicación SWR no sustituye el control de frecuencia: mantener una elegibilidad común por clave para timer, foco, invalidación y botón. Errores de lectura: backoff 3/6/12/30 s, con suelo del intervalo de esa consulta (15 s para vistas de datos), pausa offline y respeto de `Retry-After`; no reintento para 400/401/403/404. Ante `409 snapshot_changed`, retirar cursor/datos de la versión anterior y volver una vez a la primera página; nunca repetir indefinidamente el cursor obsoleto. Tras 401/403 borrar caché privada y detener heartbeat. Toasts no repetidos cada tres segundos. AbortController y respuestas tardías descartadas tras cambio de identidad/query.

## Contratos y endpoints

Separar transporte público same-origin y Core interno. Rutas finitas, sin proxy genérico de URLs, SQL, tablas o ficheros. Puede usarse un `[...path]/route.ts` con dispatch cerrado por método/ruta; los helpers de consulta son explícitos y testeables.

Prefijos: navegador `/api/dashboard`, Core `/internal/dashboard`. Core revalida identidad y devuelve el mismo DTO saneado; el BFF no traslada `Set-Cookie`, errores internos o encabezados arbitrarios.

| Método y sufijo | Contrato mínimo |
| --- | --- |
| `GET /status` | `readAt`, `ingestionEnabled`, `activeUntil`, estados de workers, revisiones públicas de productos, alcance/versión de captura. Respuesta objetivo ≤16 KiB; sin contadores caros por conversación |
| `GET /overview` | Conteos por producto y estado, cobertura, eventos recientes saneados; métricas conversacionales solo del usuario si se incluyen |
| `GET /tools` | Registro de las 16 tools, input schema, categoría, scopes y efectos |
| `GET /entities` | Categoría/fuente/frescura/búsqueda ≤100 caracteres, cursor, límite 50 por defecto/100 máximo |
| `GET /entities/:category/:id` | DTO de detalle discriminado por categoría; sin descargar raw ni datos de otra entidad |
| `GET /map` | Bbox, categoría/fuente/frescura; features y provenance mínima, revisión, `limited`, conteo devuelto; máximo 1.000 |
| `GET /sources` y `/sources/:id` | Estado del producto/job y páginas de recursos/cache públicos; gates, tiempos y campos de release permitidos |
| `GET /events` y `/events/:id` | Rango máximo 7 días, filtros cerrados, 50/100 por página, cursor temporal estable; ausencia/instrumentación explícitas |
| `POST /inspect` | `{tool,input}` con esquema real, máximo 8.192 bytes de argumentos; solo `stored_only` |
| `POST /executions` | `{requestId,tool,input,confirmEffects:true}`; ejecución manual real y una reserva idempotente por usuario |
| `GET /executions/:id` | Estado/resultado propio; sin volver a ejecutar; expiración de 7 días y resultados acotados |
| `POST /activity` | Cuerpo vacío validado, auth/CSRF; renovar ventana según política, devolver `enabled,activeUntil` |
| `GET /conversations` | Índice propio actual de 20 por página, enriquecido con metadatos de telemetría mediante join acotado; no cambiar cursor existente |
| `GET /conversations/:id/summary` | Estado, cobertura, totales con ausencias, turnos/pasos/intentos/tools/compactaciones y tiempos |
| `GET /conversations/:id/events` | Filtros por turno/tipo, cursor, 50/100; sin contenido pesado por defecto |
| `GET /conversations/:id/payloads/:payloadId` | Proyección saneada autorizada, tamaños, expiración, truncamiento y referencias de llamada |

Escritura del runtime: **`POST /internal/telemetry`**, sin equivalente de escritura público en Web. Contrato `schemaVersion`, identidad de runtime, sesión, lote de eventos tipados/payloads, IDs estables; máximo 1 MiB y 32 eventos por lote. Validar tamaño mientras se lee el stream, no después de `request.text()`. No reutilizar `/internal/evaluation`, cuyo límite actual es 2.048 caracteres.

Todos los DTO incluyen `schemaVersion:1` y `readAt` cuando corresponde. Campos numéricos opcionales desconocidos son `null`; campos inesperados se rechazan/descartan según contrato explícito, nunca se serializan por spread. Validar IDs, filtros, fechas y límites en Core; la validación cliente solo ayuda al formulario.

### Paginación, revisiones y límites

- Eventos/ejecuciones: keyset por `(occurredAt,id)`/`(createdAt,id)`, conservando microsegundos PostgreSQL. No OFFSET profundo ni ordenar por hora relativa del navegador.
- Cursores opacos validados y ligados a filtros/identidad; un cursor nunca concede permisos. Conservar en conversaciones el contrato existente `(created_at,session_id)` y conversión `text::timestamptz`.
- Entidades: orden estable por `(productId,entityId)` y cursor con vector de revisiones de todos los snapshots/catálogos incluidos en el filtro, también versiones de feeds estáticos. Si cambia un componente entre páginas, `409 snapshot_changed` y recargar primera página; no mezclar silenciosamente versiones. Core construye ese vector y lo comprueba en la lectura, no acepta versiones arbitrarias como autoridad.
- Catálogo `placeId` solo de identidades públicas de fuentes. No convertir `geocode_cache` en un directorio global de búsquedas. Nunca devolver `object_key`, rutas, `lease_token`, auth_user, correos, URLs firmadas o credenciales.
- Respuestas de lista máximo 256 KiB; mapas máximo 1 MiB. Si no cabe, reducir página/feature set y declarar truncamiento/cursor, no recortar JSON. El cursor avanza hasta el último elemento **entregado**, no hasta el último leído. Una entidad que exceda sola el límite se entrega como proyección válida truncada, con identidad/procedencia, y el cursor avanza; no perder filas ni generar páginas en bucle. Detalles y payloads con límites propios, no arrays ilimitados.
- Limitar lectura SQL por página/bbox y usar índices actuales; añadir índice solo si lo justifica la consulta. No consultar todas las sesiones/payloads para mostrar una tarjeta.

## Autorización y privacidad

1. Reutilizar Better Auth, `readIdentity`, `allowedBrowserRequest` y comprobación de evaluador activo. El layout mejora UX; **cada endpoint** y lectura server-side aplica seguridad. El cliente no decide permisos.
2. Core requiere JWT de servicio válido y sesión Better Auth/evaluador activo en las lecturas del panel. Cookie reenviada únicamente al Core de origen fijo; no al mapa, modelo ni tool provider. Nunca `principalId` confiado desde el navegador.
3. Añadir scopes internos `mobility.dashboard.read`, `mobility.dashboard.execute`, `mobility.dashboard.activity` y `mobility.telemetry.write`; no reusar el scope de ingestión para el panel. Actualizar emisión local de tokens y ejemplos sin valores. No girar claves ni habilitar cloud por este documento.
4. Runtime de telemetría usa `mobility.telemetry.write` y principal/sesión obtenidos del contexto servidor. Core comprueba evaluador y propiedad vigente; no acepta eventos de otras sesiones ni permite registrar una sesión nueva mediante el sink.
5. En resumen, eventos, blobs y ejecución manual, aplicar ownership en la misma consulta SQL y comprobar expiración/revocación; no autorizar solo la página padre. Respuesta no enumerable para IDs ajenos o inexistentes, sin revelar propietario.
6. `Cache-Control: no-store` en respuestas privadas. React `cache()` únicamente para dedup intrapetición donde sea seguro, nunca cache cross-user. SWR se desmonta/limpia por identidad y al logout, incluidos payloads abiertos y peticiones tardías.
7. En navegador→BFF, POST exige Origin exacto y protección existente `sec-fetch-site`; sin CORS abierto, GET con efectos ni aceptación de redirecciones externas. En servidor→Core/sink se usa JWT e identidad verificada; no exigir un Origin de navegador al emisor interno ni reenviar headers arbitrarios. Consultas sensibles en POST, no texto libre en URL o logs HTTP.
8. Navegador recibe solo DTO de pantalla; JWT/secretos quedan en servidor. Fuente/inputs/outputs son datos no confiables: escapar HTML, no ejecutar enlaces/protocolos/Markdown embebido, no cargar imágenes de payloads ni fetch a URLs contenidas en datos.
9. Rate limits persistidos independientes de cuota generativa: lectura/inspección 120/min por evaluador; actividad 2/min; ejecución manual 6/min y 60/día, una en curso por evaluador. Compartidos entre instancias/pestañas; devolver 429 con `Retry-After`. No descontar lecturas del presupuesto del chat ni modificar E2.
10. No exportación bulk ni «ver todos los usuarios». Shared ops excluye IDs de sesión/principal y argumentos. Propietario puede ver su contenido saneado; el operador de la base mantiene el acceso técnico ya existente, no se añade un panel administrador.

## Consultas manuales

Dos modos visibles, sin tercer motor paralelo:

- **Consultar almacenado:** selector/presenter Core sin red ni actividad. Explicar si un resultado completo requiere cálculo y no está materializado.
- **Ejecutar herramienta:** misma validación, scopes y ejecutor utilizados por MCP, desde endpoint autenticado. Advertencia contextual antes de confirmar si puede consultar proveedor, demandar meteorología, escribir caché o calcular con OTP. No llama al modelo.

No ofrecer «Ejecutar todas», auto-submit ni ejecución al cambiar un select. `resolve_address` conserva el consentimiento específico para Nominatim y restricción de direcciones privadas; la confirmación general no fuerza `allowExternal=true`. Se mantienen gates, leases, `Retry-After`, TTL, timeouts, máximo de recursos y presupuestos actuales de los proveedores. Un error no da permiso para saltarlos.

`requestId` UUID por submit y hash canónico de herramienta/argumentos, ligados al principal. Core reserva antes de ejecutar en `dashboard_tool_execution`; repetir mismo ID/hash devuelve el estado/resultado, otro hash da 409. Si el cliente pierde la respuesta, consulta por ID; **no vuelve a ejecutar**. Una ejecución puede haber alcanzado al proveedor aunque el navegador haya cancelado.

Deadline global de ejecución de 60 s, manteniendo los timeouts internos menores actuales y propagando cancelación; lease de reserva de 70 s y timeout BFF de 65 s. No mantener transacción ni lock durante llamadas externas/OTP. Al vencer sin terminal confirmado, GET deriva `outcome_unknown` **sin escribir**. La siguiente reserva POST marca expiradas y libera la exclusión en una transacción antes de admitir otra; jamás reejecuta la operación antigua. Un terminal tardío solo puede completar su propio ID, sin modificar la nueva reserva. La exclusión garantiza una reserva vigente por evaluador, no que un proveedor remoto obedeciera una cancelación perdida.

Registrar inicio/fin, tool, parámetros saneados, modo, estado, resultado saneado y límites, solo para su propietario. Máximo 8.192 bytes de input y 256.000 bytes de salida retenida. Si excede, conservar proyección válida con `truncated:true`; no descargar un body ilimitado ni repetir con límites relajados. Cap global de contenido por evaluador compartido con telemetría.

El inspector muestra **salida de Mobility Core**, no «datos usados en esta conversación». EVE aplica además límites de herramientas/turno y 32.000 bytes por resultado: indicar tamaño y si excedería ese límite; no truncar y afirmar que es exactamente lo recibido por EVE. Los resultados efectivamente enviados al modelo solo se certifican desde la traza del intento correspondiente.

## Telemetría de conversaciones

### Captura mínima sobre código existente

Ampliar `src/budgeted-fetch.ts`, `src/conversation-metrics.ts` y hooks existentes de métricas/tools; añadir un sink server-only. No instalar Langfuse, OpenTelemetry collector, Redis ni otro SDK de agente. No activar el ledger de campañas para obtener métricas de sesiones normales. No leer directamente archivos `.eve/.workflow-data` ni usar la cápsula de evidencia como historial completo.

La frontera `budgetedFetch` ya identifica cada intento real/reintento y ve el cuerpo de Responses. Capturar su proyección **después** de aplicar `store=false` y `max_output_tokens`, antes del envío; el inicio debe distinguir preparado de efectivamente despachado. Conservar cancelaciones, errores HTTP y cierre de stream sin uso declarado. En respuesta SSE, proyectar `response.completed`/`response.incomplete` y texto/tool calls finales; no almacenar cada delta ni acumular cuerpos sin límite.

Coordinar el primer flush con el registro idempotente existente de la sesión en `conversation-budget`/canal. Los eventos tempranos pueden precederlo: conservar hasta 32 eventos de metadata y 32 KiB, ligados al estado de esa sesión, y vaciarlos tras confirmar el registro trusted existente. `budgetedFetch` ya dispone del contexto posterior a ese registro. No confiar en orden alfabético de hooks, no registrar desde el navegador/sink y no hacer una segunda llamada de registro por cada evento. Si la conversación termina antes de registrarse o se supera el límite, omitir con cobertura desconocida/incompleta, sin fabricar una sesión. El registro/auth existente continúa fail-closed; el flush de observabilidad, fail-open.

EVE 0.65 ofrece instrumentation pública, pero sus eventos lógicos no incluyen el wire completo de tools. No añadirla además del transporte en esta PR: evita duplicar conteos y otro eje de correlación. Mantener los hooks para ciclo de turnos/pasos y acciones.

### Identidad y significado

| Unidad | Identidad / campos | Regla |
| --- | --- | --- |
| Conversación | `sessionId`, propietario verificado | No implica que todos los turnos históricos estén instrumentados |
| Turno/paso | `turnId`, `stepIndex`, `sequence`, `purpose:step\|compaction` | Un paso no equivale a una llamada al proveedor |
| Evento EVE | `meta.id`, `meta.at`, tipo, sesión | Dedup por `(sessionId,eventId,type)`; conservar hora origen y registro |
| Intento de proveedor | `attemptId` UUID creado en `budgetedFetch` | Cada retry es otro intento; no llamarlo generationId EVE |
| Respuesta del proveedor | `providerResponseId` validado cuando exista | No inventar ID cuando falla antes de recibir respuesta |
| Herramienta | `(sessionId,callId)`, nombre y evento/turno/paso | Requested, resultado disponible, error, rechazo/cancelación y envío al modelo son estados distintos |

**Prueba de envío de una tool al modelo:** referencia `function_call_output.call_id` presente en el input efectivo capturado del intento. Un `action.result` solo prueba resultado disponible. Correlacionar con `callId` EVE por igualdad demostrada, nunca por orden/tiempo; si no coincide o faltó captura, `unknown`. No afirmar que el modelo «usó» semánticamente un dato por haberlo recibido. No reconstruir una relación conversación → descarga de proveedor que el código no registra.

Registrar latencia de intento con reloj monotónico del proceso y timestamps UTC. Latencia herramienta requested→result incluye espera EVE: etiquetarla «Tiempo de la acción», no HTTP MCP exacto. Un `response.completed` no es un `turn.completed`. No convertir un inicio sin terminal en éxito/fallo; pasado el deadline conocido mostrar desenlace desconocido.

### Métricas y contenido

- Tokens por intento de transporte: entrada, salida y caché cuando el proveedor los informe. `null` si faltan; cache read es subconjunto de entrada, no sumarlo dos veces. Número de tokens de razonamiento solo si viene como contador explícito; jamás texto de razonamiento.
- Totales = suma de intentos distintos reportados, incluidos retries y compactaciones; acompañar número de intentos sin usage y cobertura incompleta. No sumar además los contadores de `step.completed`; mostrarlos como métricas lógicas separadas si se conservan.
- Capturar `isError:true` además del estado EVE. El log actual de tools solo mira status y puede subcontar errores; corregir la proyección nueva y su regresión sin alterar el presupuesto existente.
- Dinero: «No disponible» en esta PR. Límites de sesión y tokens no son una factura; no introducir precios estimados no verificados.
- Input permitido: mensajes de usuario/asistente y contexto visible, instrucciones propias del proyecto, definiciones efectivas de funciones, argumentos y resultados. Output permitido: texto final, solicitudes de funciones y resultado público normalizado. Diferenciar payload de Core, acción EVE e input al proveedor.
- Denegar headers, cookies, Authorization, variables de entorno, claves, tokens/signed URLs, respuestas de auth, `reasoning` textual, `encrypted_content`, metadata opaca y dumps de Request/Response/event/init/error. Permitir solo campos explícitos y tipos conocidos, con profundidad/longitud acotadas y saneamiento de patrones de credenciales antes de persistir. Claves desconocidas no pasan por defecto.
- Cada payload: `schemaVersion`, dirección/tipo, `originalBytes`, `retainedBytes`, `redacted`, `truncated`, `captureStatus` y motivo. Proyección segura no equivale a copia byte a byte de la petición HTTP; mostrarlo así.

### Límites y fallos de captura

Entrada de modelo hasta 512.000 bytes proyectados; salida final hasta 64.000; argumentos tool hasta 8.192 y resultado hasta 32.000, de acuerdo con límites existentes de herramienta. Máximo 16 MiB de contenido por conversación y 256 MiB por evaluador entre todas sus conversaciones/ejecuciones retenidas. No truncar JSON inválidamente: omitir subárbol/texto con marcador y mantener DTO válido. No ampliar los límites del chat para registrar más.

Deduplicar payloads por hash **dentro de la sesión**; referenciarlos desde intentos/eventos. Prohibida deduplicación global entre usuarios o endpoints que permitan consultar hashes ajenos. Al alcanzar cap, continuar métricas y conversación; marcar contenido omitido por límite. El contenido explícitamente repetido no se almacena de nuevo, pero cada envío mantiene su referencia.

Sink con **200 ms totales por lote**, incluidos reintentos, y memoria acotada. Sin cola persistente nueva ni reintentos de inferencia por problemas de logging. Fallo de observabilidad no bloquea el chat; auth del sink siempre fail-closed. Hasta un reintento del mismo lote/ID dentro de ese presupuesto, nunca fuera del plazo ni enviando más contenido al proveedor. La cancelación HTTP sola no basta: Core aplica deadline de transacción de máximo 150 ms, `lock_timeout` de 25 ms y `statement_timeout` de 100 ms dentro de ese presupuesto, incluyendo espera de conexión/control de cancelación. En PostgreSQL 17 usar `SET LOCAL transaction_timeout` o mecanismo probado equivalente; no cambiar parámetros globales. Comprobar rollback/liberación real y recuperación de la conexión del pool si el timeout termina su sesión. No tomar locks explícitos `FOR UPDATE` sobre `evaluator`/`evaluation_usage` utilizados por el chat: reservar contadores en filas propias de observabilidad. Las comprobaciones de FK mantienen sus garantías y los mismos timeouts.

Terminal incluye metadatos de inicio y reenvía los payloads aún no confirmados que quepan en 1 MiB. Si no caben/no están disponibles, guardar el terminal con referencia nula y `captureStatus:missing`, nunca con FK colgante ni rechazando toda la observación por falta del blob inicial. Referencias solo a payloads cuya existencia se confirmó para esa sesión. Upsert monotónico: un inicio tardío no sobrescribe un estado terminal. IDs repetidos con contenido conflictivo se rechazan sin alterar lo guardado. Si no se pudo guardar nada antes de una caída, no se puede afirmar completitud: exponer `best_effort`, versión de captura, primera/última observación y huecos conocidos; nunca un sello de «traza completa» por ausencia de errores locales.

No backfill de contenido previo desde stdout, cápsulas o respuestas inventadas. Para conversaciones antiguas: índice y enlace al chat siguen funcionando, detalle «Telemetría detallada no disponible para este periodo».

## Persistencia y retención

Una migración aditiva tras `0020` (usar siguiente número realmente libre), en PostgreSQL existente. No editar migraciones aplicadas, snapshots, tablas de mensajes EVE ni esquema Better Auth. Tablas propuestas, cada una con función distinta:

| Tabla | Campos/índices mínimos y función |
| --- | --- |
| `operational_event` | ID bigint, `event_key` único, `occurred_at/recorded_at/expires_at`, componente/tipo/severidad, fuente/job/recurso, operation ID, resultado/códigos/duración/contadores tipados; índices temporales y fuente+tiempo; sin contenido privado |
| `conversation_observability` | PK/FK session a `evaluation_session`, versión/capture_started_at, bytes retenidos, eventos omitidos/huecos conocidos. No título ni mensajes duplicados |
| `conversation_trace_event` | Sesión, clave estable única, kind, IDs turno/paso/attempt/call, tiempos, status, usage nullable y referencias de payload; índices sesión+tiempo+ID, sesión+turno, sesión+attempt/call; metadata JSON solo esquema cerrado |
| `conversation_trace_payload` | ID, sesión, hash local a sesión, tipo, proyección JSON/texto saneada, tamaños/flags, expiry; unique(session,hash,tipo), FK y acceso siempre por sesión |
| `dashboard_tool_execution` | UUID, evaluador, request ID/hash únicos por evaluador, herramienta, input/resultado saneados acotados, estado/tiempos/deadline/lease/expiry y error normalizado. Nunca vincular una ejecución del inspector a una conversación inventada |
| `dashboard_rate_window` | Evaluador, clase read/execute/activity, ventana minuto/día y contador; actualizaciones atómicas e índices por expiración. No reutilizar/modificar contadores generativos de `evaluation_usage` |
| `observability_quota` | Una fila por evaluador para bytes retenidos y reservas de contenido; locking exclusivo de observabilidad, no de la identidad/cuotas del chat. Incluye contenido de ejecuciones manuales |

Uso de JSONB solo para DTO tipado y validado; no un contenedor libre de logs. FK con borrado en cascada cuando proceda. Reserva/cuota y caps se actualizan atómicamente sobre sus filas propias por evaluador/sesión para que dos instancias no superen límites, siempre con orden de locks cuota→sesión→payload/evento. Máximo 10.000 eventos de telemetría por sesión; después, contador de omitidos y cobertura parcial, sin fallo del chat. No incluir identidad del evaluador en eventos compartidos.

**Retención:** todos los nuevos registros, métricas y payloads hasta 7 días desde captura; acceso a los de conversación termina antes si expira/se revoca la ACL o la cuenta. Referenciar un payload no prolonga su caducidad. Si una referencia válida necesita contenido ya vencido, mostrar «Contenido caducado», no resucitarlo desde un registro viejo. No cambiar los 24 h actuales del histórico/raw de movilidad ni la retención nativa EVE.

Filtrar expiración en todas las lecturas, independientemente del mantenimiento. Ampliar `prune()` existente con borrado por lotes e índices de expiración, en su ejecución ya acotada por actividad; máximo 1.000 filas por tabla/pasada, sin barrer en cada GET. Purgar primero referencias/eventos vencidos y payloads no accesibles con cascadas consistentes; preservar contadores correctos de bytes. Reutilizar el camino operativo de mantenimiento existente, no añadir Cron ni otro worker.

La indisponibilidad de lectura al vencer es inmediata. **El borrado físico ocurre en la siguiente ejecución de mantenimiento; un runtime apagado/inactivo no puede purgar por reloj.** Mostrar último mantenimiento y documentar esta distinción, sin prometer borrado físico exacto mientras los procesos están parados. Los backups privados existentes no se convierten en una fuente del panel ni en almacenamiento ampliado de trazas.

## Implementación y archivos

Estructura orientativa obligatoria por responsabilidad; se pueden dividir componentes pequeños sin cambiar contratos ni alcance:

```text
apps/eve-web/
  app/(dashboard)/dashboard/
    layout.tsx
    page.tsx
    mobility/page.tsx
    mobility/[category]/[id]/page.tsx
    tools/page.tsx
    tools/[name]/page.tsx
    sources/page.tsx
    sources/[id]/page.tsx
    activity/page.tsx
    activity/[id]/page.tsx
    conversations/page.tsx
    conversations/[sessionId]/page.tsx
    _components/
  app/api/dashboard/[...path]/route.ts
  data/queries/dashboard/
  src/dashboard-client.ts
  src/telemetry.ts
  src/telemetry-projection.ts
  vendor/community-agent/{README.md,LICENSE}
apps/mobility-core/
  app/internal/dashboard/[...path]/route.ts
  app/internal/telemetry/route.ts
  src/dashboard/{queries,entities,inspector,access,executions}.ts
  src/tool-registry.ts
  src/observability/{events,telemetry,retention}.ts
packages/contracts/src/{dashboard,telemetry}.ts
infra/postgres/migrations/0021_dashboard_observability.sql
```

Puntos existentes a modificar mínimamente:

- `apps/eve-web/app/evaluation/evaluation.tsx`, `conversations.tsx` y header/chat: enlaces, identidad compartida y sesión activa, sin otro auth ni nueva transcripción. Evitar dos controles de acceso superpuestos en el shell.
- `apps/eve-web/src/budgeted-fetch.ts`, `conversation-metrics.ts`, hooks de métricas/tool-budget: capture/projection y `callId/isError`; conservar streaming, abort, campañas opt-in, límites y aprobación EVE.
- `apps/mobility-core/app/mcp/route.ts`: extraer registro compartido con pruebas de equivalencia, conservando scopes/anotaciones y solo 16 herramientas. No registrar los endpoints de dashboard como tools.
- `mobility.ts`, `weather-cache.ts`, `emt-arrivals.ts`, `geocoding.ts`, `routing.ts`: reutilización de lectura/presentación y puntos de instrumentación. No reescribir adapters o algoritmos.
- `ingestion.ts` y scripts de activación de release: eventos y retención acotada; no cambiar cadencias, lease fencing, worker lanes, límites meteorológicos o semántica de activación.
- `scripts/setup-local.mjs`, ejemplos de configuración y emisión de JWT: nuevos scopes locales sin imprimir valores. No ejecutar `configure-vercel.mjs` ni cambiar recursos cloud.
- `packages/contracts/src/index.ts`: exportaciones aditivas. Dependencias Web: SWR, Leaflet y sus tipos; fijar versiones y lockfile sin copiar package.json upstream. No actualizar EVE/Next/React por el panel.
- `AGENTS.md`, `SECURITY.md`, referencia del sistema, guía de uso, arquitectura, operación y vendor: nuevas rutas/scopes/privacidad/origen OSM/retención y procedencia. Corregir la frase antigua de SECURITY que todavía habla de una sola tool.

## Pruebas y aceptación

Usar Vitest y arneses de PostgreSQL existentes; fixtures sintéticas identificadas solo en tests, nunca fallback del producto. Navegador para flujos reales y QA visual. Sin benchmarks genéricos ni nueva campaña pagada de modelos.

### Datos, seguridad y efectos

1. Coinciden registro MCP, allowlist EVE y catálogo del panel: exactamente 16 herramientas. Regresiones de contratos MCP actuales sin cambios de resultados ni defaults.
2. Todas las lecturas/inspector almacenado con spies que fallan ante proveedor, OTP, `activate`, `ingest`, demand/refresh; cero llamadas/cambios de actividad. El heartbeat es una prueba distinta: una renovación autorizada, sin `tick` ni adquisición directa.
3. Navegación/polling/foco/paginación no ejecutan herramientas; solo submit confirmado. Idempotencia de submit duplicado, requestId conflictivo, respuesta perdida, ejecución huérfana, cancelación y dos instancias/usuarios.
4. Usuario anónimo, deshabilitado/expirado, sesión ajena/expirada/revocada, IDs y cursores alterados, acceso directo a payloads/ejecuciones, scope incorrecto, CSRF y origen cruzado: denegados sin filtrar identidad ni contenido.
5. Logout/cambio de usuario durante petición: abortar y descartar respuesta; no reaparece caché anterior. Datos privados no en HTML de otra identidad, query strings, logs o almacenamiento persistente del navegador.
6. Frescura por entidad/producto, cero frente a ausencia, timestamp desconocido, 304 sin rejuvenecer, forecast reciente futuro, horizonte insuficiente, stale mezclado en agregado, estático/versionado y snapshot cambiado durante paginación.
7. Filtros, páginas y bbox limitados; SQL parametrizado; respuestas y árboles JSON acotados. Content canaries con secretos en claves inesperadas/headers/errores/texto: no llegan a DB, navegador o stdout.

### Actualización y mapa

8. Fake timers: status 3 s, vista 15 s, heartbeat 60 s; pausa hidden/offline/manual; backoff y 429; un solo timer/key por superficie; teardown sin fugas. Cinco usuarios renuevan la misma ventana y reutilizan jobs/gates existentes, no cinco pipelines.
9. Preview/ingestión deshabilitada: heartbeat no habilita ingestión. Cerrar panel no acorta la ventana global ni interrumpe conversaciones ajenas. Ningún heartbeat consume cuota generativa.
10. Mapa carga solo visible, limita 1.000 entidades y respeta filtros; tabla equivalente; puntos sin geometría no inventados. Refresco Core conserva cámara y no recarga tiles. Tile failure no oculta datos ni marca fuente caída.
11. Revisar requests de tiles: host HTTPS exacto, sin credenciales, Referer solo origen, caché normal y atribución visible. Tests automatizados interceptan tiles/usan fixtures; **no barrer OSM con navegación automatizada**.

### Eventos y telemetría

12. PostgreSQL aislado: índices/constraints, inserción deduplicada, orden inicio/terminal invertido, ownership en join, caps atómicos, expiración de 7 días, ACL anterior, purga acotada y ausencia de backfill.
13. Mock del transporte Responses, sin llamada real: input efectivo tras mutaciones, tools efectivas, SSE y no-stream, retries/compactación, terminal incomplete, errores HTTP, cancelación, stream sin terminal y usage ausente frente a 0.
14. Sumar intentos una vez, no pasos+transporte; caché como subconjunto; correlación exacta `call_id`, resultado disponible pero no enviado, IDs sin relación → desconocido. `isError`, rechazo y cancelación diferenciados.
15. Projection excluye reasoning/encrypted_content/headers/auth, conserva contenido público permitido y truncamiento válido. Payload dedup solo dentro de sesión, límites por sesión/evaluador, no aumento de presupuestos del chat.
16. Sink lento/caído/denegado, contención SQL real, lotes duplicados/conflictivos, primer turno antes del registro, pérdida total del lote inicial y terminal con blobs ausentes: conversación continúa, timeout total ≤200 ms de captura por lote y cobertura parcial explícita, sin FK rota/locks sobre auth; nunca otra inferencia para recuperar logging.
17. Feed operativo no incluye argumentos ni sesiones; log de errores es código saneado; write de eventos fallido no revierte publicación válida. No instrumentar idle/polling como ruido.

### UI y entrega verificable

18. Comparar capturas antes/después del chat EVE: estado vacío, conversación, streaming simulado, aprobación, recuperación y móvil; no regresión de markup/estilo salvo enlaces autorizados.
19. Capturas del panel en claro/oscuro y escritorio/móvil: misma familia visual que EVE y Community Agent; vistas principales, mapa, detalle, vacío, antiguo, error y sin telemetría. Verificar contraste/foco/tablas/teclado y consola sin errores. No basta declarar que «usa Tailwind».
20. Smoke autenticado de panel contra Core local: datos almacenados reales, fuente/tiempos/frescura coherentes, ejecución manual de una tool **solo almacenamiento** y ownership con dos cuentas del arnés. Para adquisición manual, proveedor mock/controlado; no exigir llamadas pagadas al modelo ni proveedores reales adicionales para cerrar esta PR.
21. Ejecutar `pnpm check`, `pnpm build:agent` y tests PostgreSQL afectados. Verificar migración y rollback del código con datos de prueba; no afirmar CI/runtime/UI probados sin evidencia de cada uno. Captura futura empieza al instalar, no hay telemetría histórica completa por declarar listo el panel.

**Criterio de cierre:** las seis vistas y sus detalles funcionan; mapa y apariencia acordados; contenido por propietario; lectura pasiva, heartbeat y submit separados; señales actuales visibles y ausencias honestas; nuevas trazas/eventos tipados con 7 días y límites; chat/MCP/ingestión existentes sin regresiones. Nada de placeholder, mock silencioso, endpoint registrado sin implementación ni control visible que no haga lo prometido.

## Entrega de la única PR

Implementar en `alanslzrr/core-dashboard` o rama equivalente con prefijo del repositorio, preservando cambios ajenos. **Una única PR de implementación completa**, no una por vista ni una segunda obligatoria para telemetría. Secuencia de commits sugerida, separable en unidades pequeñas cuando corresponda:

1. Contratos, migración y políticas de observabilidad/acceso.
2. Registro MCP compartido y consultas almacenadas de Core.
3. Eventos, sink y captura conversacional con pruebas.
4. BFF, SWR, heartbeat e inspector manual seguro.
5. Shell, vistas, mapa y enlaces mínimos EVE.
6. Pruebas integradas, QA visual, documentación y acta específica.

No hacer commit/push ni abrir PR solo por redactar este spec. Al implementar, aplicar las instrucciones Git del repositorio: Conventional Commits, título/descripcion de PR en inglés y sin atribuciones. La instalación local y cualquier reinicio deben seguir el procedimiento y autorización del encargo de implementación; no asumir que preparar este documento autoriza modificar DB/runtime ahora. No reconstruir OTP ni desplegar Vercel.

La PR debe incluir un acta breve en `docs/acceptance/` con qué se ejecutó, evidencia visual, límites y versiones fijadas. Actualizar roadmap como **ampliación independiente solicitada**, no reapertura de E2 ni requisito retroactivo de R2. No pedir otra campaña general para certificarla.

## Referencias verificadas

Fuentes externas revisadas el 02/10/2026; las decisiones locales de esta especificación no son afirmaciones de esos proyectos:

- [Community Agent y estructura del panel](https://github.com/vercel-labs/community-agent-template/blob/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b/docs/admin-panel.md), [hook SWR](https://github.com/vercel-labs/community-agent-template/blob/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b/hooks/use-streams.ts), [licencia MIT](https://github.com/vercel-labs/community-agent-template/blob/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b/LICENSE).
- [Auth demo que no se debe copiar](https://github.com/vercel-labs/community-agent-template/blob/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b/data/queries/auth.ts) y [fuente de actividad con mocks](https://github.com/vercel-labs/community-agent-template/blob/9c9efb50f79d3211ecf8ff15ba278eb5457a2a1b/data/queries/activity-source.ts).
- [SWR y estados de datos previos](https://swr.vercel.app/docs/advanced/understanding), [implementación oficial de polling/visibilidad](https://github.com/vercel/swr/blob/main/src/index/use-swr.ts).
- [PostgreSQL 17: timeouts de transacción, sentencia y locks](https://www.postgresql.org/docs/17/runtime-config-client.html#RUNTIME-CONFIG-CLIENT-STATEMENT) y [credenciales de imágenes cross-origin](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/crossOrigin).
- [Leaflet estable](https://leafletjs.com/download.html), [API 1.9.4](https://leafletjs.com/reference.html), [licencia](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE), [política tiles OSM](https://operations.osmfoundation.org/policies/tiles/).
- Código local: [MCP](../../apps/mobility-core/app/mcp/route.ts), [datos/salud](../../apps/mobility-core/src/mobility.ts), [ingestión](../../apps/mobility-core/src/ingestion.ts), [cache meteorológica](../../apps/mobility-core/src/weather-cache.ts), [auth/evaluación](../../apps/mobility-core/src/evaluation.ts), [transporte del modelo](https://github.com/alanslzrr/digital-twin-conversational-mobility/blob/c9fe6ba/apps/eve-web/src/budgeted-fetch.ts), [métricas](../../apps/eve-web/src/conversation-metrics.ts), [guard EVE](../../apps/eve-web/src/evaluation-guard.ts), [límites de tools](../../apps/eve-web/src/tool-budget.ts).

### Verificación de esta especificación

Se inspeccionaron documentación/código local y fuentes oficiales del template/mapa; se contrastaron los efectos de las 16 herramientas, la disponibilidad de señales y las APIs de telemetría. Las elecciones funcionales anteriores fueron respondidas por el usuario. Esta entrega es documental: no implementa rutas, tablas, captura, dependencias ni UI; no ejecuta migraciones, consultas de proveedores/modelo o cambios de runtime.
