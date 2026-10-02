# Panel Core — acta de refinamiento, 3 de octubre de 2026

[Índice](../index.md) · [Auditorías](../audits/index.md) · [Spec original](../plans/2026-10-02-core-dashboard.md) · [Spec-audit](../audits/2026-10-02-core-dashboard-review.md)

Implementación de las seis vistas, M1–M13 y G1–G4 en la misma [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45). HEAD de aplicación verificado: `acb14b373b7351cdada58837eccf1496149f14e9`. Los commits documentales posteriores no cambian la aplicación. Esta acta no sustituye las reproducciones históricas de `56b1f25`.

## En esta página

- [Comportamiento entregado](#comportamiento-entregado)
- [Correcciones y aceptación](#correcciones-y-aceptación)
- [Validación ejecutada](#validación-ejecutada)
- [Referencias y revisión visual](#referencias-y-revisión-visual)
- [Recorrido de claridad](#recorrido-de-claridad)
- [Límites y no verificado](#límites-y-no-verificado)

## Comportamiento entregado

| Vista | Pregunta y respuesta implementada |
| --- | --- |
| Resumen | Cuatro indicadores con definición, excluidos, cobertura, denominador, periodo y enlace. Inventario de 13 productos habilitables, problemas prioritarios, actividad reciente y G2. Sin cifras de usuarios, conversaciones o tokens compartidos. |
| Movilidad | Datos dinámicos y seis catálogos separados. Selección SQL por producto/fuente/frescura/búsqueda; totales completos antes de paginar. Mapa anónimo, ficha temporal y G3 bajo demanda. |
| Consultas | Las 16 herramientas existentes, formularios tipados, ejemplos sin ejecución, lectura almacenada y ejecución confirmada separadas. Resultados específicos y detalles técnicos secundarios. |
| Fuentes y actualización | Actualización periódica, demanda y referencia separadas; procesos no equivalen a salud. Recursos paginados, M6–M9 y mediana/p95 con muestra visible. |
| Actividad del sistema | Filtros previos a paginación, periodos relativos o UTC absolutos, G2 sobre el mismo rango y detalle operativo sin contenido privado. |
| Mis conversaciones | Solo conversaciones propias vigentes; M10–M13, turnos paginados, G4, Tabs accesibles y contenidos saneados bajo demanda. |

### Métricas y gráficos

| ID | Cálculo y límite aplicado | Implementación |
| --- | --- | --- |
| M1 | Suma de bicicletas con observación propia reciente, estación instalada y alquiler habilitado; cobertura frente al catálogo guardado. Ausencia utilizable devuelve null, no cero. | [overview.ts](../../apps/mobility-core/src/dashboard/overview.ts) |
| M2 | Plazas publicadas de una categoría por aparcamiento; no suma categorías ni tarifas. | [overview.ts](../../apps/mobility-core/src/dashboard/overview.ts) |
| M3 | Avisos únicos con vigencia explícita y evidencia utilizable. CAP normalizado ya excluye cancelaciones y referencias sustituidas; no implica funcionamiento normal. | [overview.ts](../../apps/mobility-core/src/dashboard/overview.ts), [aemet-cap.ts](../../apps/mobility-core/src/adapters/aemet-cap.ts) |
| M4 | Productos dinámicos habilitados con evidencia utilizable / inventario de 13; excluye catálogos. | [products.ts](../../apps/mobility-core/src/dashboard/products.ts) |
| M5 / G1 | Distribución reciente/antigua/no disponible/referencia sobre toda la selección homogénea, no solo las filas visibles. No mezcla unidades entre productos. | [entities.ts](../../apps/mobility-core/src/dashboard/entities.ts), [insights.tsx](../../apps/eve-web/app/%28dashboard%29/dashboard/_components/insights.tsx) |
| M6 | Productos con error registrado o falta de señal durante ventana activa; inactividad normal no es fallo. | [source-metrics.ts](../../apps/mobility-core/src/dashboard/source-metrics.ts) |
| M7 | Eventos de error únicos en el periodo; captura best-effort, no disponibilidad porcentual. | [source-metrics.ts](../../apps/mobility-core/src/dashboard/source-metrics.ts) |
| M8–M9 | Mediana y p95 por componente y operación comparables; p95 solo con N ≥ 20. No latencia HTTP inferida. | [source-metrics.ts](../../apps/mobility-core/src/dashboard/source-metrics.ts) |
| M10 / G4 | Tokens reportados por intento y turno, campos conocidos independientes. Total solo con entrada y salida conocidas; caché/razonamiento no se suman otra vez. | [usage.ts](../../apps/mobility-core/src/dashboard/usage.ts), [readers.ts](../../apps/mobility-core/src/dashboard/readers.ts) |
| M11 | callId único de herramientas Mobility; descubrimiento y ejecución manual excluidos. Rechazo/cancelación/fallo conservados. | [readers.ts](../../apps/mobility-core/src/dashboard/readers.ts) |
| M12 | Intentos enviados únicos; incluye reintento/compactación, no solo preparación. Agregado sobre todos los eventos retenidos. | [readers.ts](../../apps/mobility-core/src/dashboard/readers.ts) |
| M13 | Duración monotónica inicio→terminal del turno instrumentado; inicio ausente conserva null, no suma intentos. | [telemetry.ts](../../apps/eve-web/src/telemetry.ts) |
| G2 | Intervalos UTC exactos de publicaciones/errores; máximo 28. Sin captura previa conserva nulos. | [activity-chart.ts](../../apps/mobility-core/src/dashboard/activity-chart.ts) |
| G3 | Hasta 240 observaciones por identidad/magnitud/unidad y 24 h, última revisión por observación e intervalo. BiciMAD, ocupación, aire, tráfico y AEMET; puntos sin interpolación. | [series.ts](../../apps/mobility-core/src/dashboard/series.ts) |

Los DTOs de entidades son discriminados por kind y los DTOs de overview, fuentes, series, conversación y payloads se validan en el límite HTTP. Core usa transacciones de lectura acotadas; no se añade un pipeline ni una migración para este refinamiento.

## Correcciones y aceptación

| ID | Estado y evidencia |
| --- | --- |
| F1 | Corregido. Runtime cualificado cerrado, identidad canónica y discovery separado. Regresiones de hooks/proyección y captura SQL/HTTP. |
| F2 | Corregido. Observación, incorporación, publicación, comprobación y horizonte separados; diario sin publicación verificada no inventa issuedAt. |
| F3 | Corregido. Coordenadas anidadas, magnitudes/unidades/periodos de producto y categorías de aparcamiento preservados. |
| F4 | Corregido. Agregados completos, uso nullable independiente, deduplicación de intentos/llamadas y turnos cronológicos paginados. |
| F5 | Corregido. Truncamiento grande conserva resumen parcial y aviso; cobertura parcial no se atribuye falsamente a un límite de bytes. Payload ausente/caducado no promete recuperación. |
| F6 | Corregido en lector y polling. Cache por identidad, deduplicación, intervalo tras completar, Retry-After para foco/manual, pausa/hidden/offline y abort. Pruebas con reloj falso; fallo real de red del navegador no verificado. |
| U1–U2 | Cerrados en composición: cuatro KPI principales, gráfica por pregunta, desglose/timeline y detalle técnico secundario. |
| U3–U4 | Cerrados en presentación: estado textual y contorno de mapa, producto/valores/fechas en tooltip, etiquetas humanas, unidades y cifras tabulares. |
| U5–U6 | Cerrados funcionalmente: Radix Tabs, filtros Core antes de LIMIT, estado vacío por selección y enlace callId realmente enviado. Teclado parcial verificado. |
| U7–U8 | Cerrados: hit areas locales, estado/cámara de retorno, reconciliación de marcadores por identidad; EVE y primitivas globales sin rediseño. |
| A1–A3 | Regresiones SQL/presenters y fixtures temporales correctas: M1=4, M2=3 (no 5), tarifas documentales, vigencia y forecast/periodos. |
| A4–A7 | Hooks/proyección, SQL de >50 intentos/turnos, filtro de tools antes de paginar y payload faltante correctos. Navegador enlaza resultado enviado→llamada y M13=1200 ms al seleccionar turno sintético. |
| A8–A9 | Reloj falso, límites, separación de identidad y denegaciones HTTP correctos. Pausa/foco móvil verificados; carrera completa de dos logins y red offline reales no verificadas en navegador. |
| A10 | 31 comprobaciones autenticadas y guard de fetch externo sin adquisiciones. Ejecución stored-only idempotente, auth/ownership y origen rechazado. Sin modelo/OTP/proveedor real. |
| A11 | SQL de 300 muestras + corrección tardía, reducción ≤240 y serie AEMET por magnitud correctos; gráfico guardado en navegador. |
| A12 | Buckets UTC durante transición Madrid, nulos previos a captura y tabla accesible contrastados con tests. Transición horaria en navegador no verificada. |
| A13 | Mapa real, tabla equivalente, coordenadas ausentes y retorno con cámara verificados. Error/intercepción de tiles y >1000 puntos en navegador **No verificado**. |
| A14 | Seis vistas conectadas verificadas a cuatro tamaños; inspector sin JSON principal, payload ausente y cobertura parcial con regresiones. Matriz exhaustiva de todos los detalles/errores de las 16 herramientas **No verificado**. |

## Validación ejecutada

| Comando o evidencia | Resultado |
| --- | --- |
| `pnpm check` sobre HEAD de aplicación | 476 tests pasan, 94 omitidos (flags DB separados). Lint/boundaries/typecheck y dos builds correctos; un build reutilizó caché. Dos avisos informativos useTemplate preexistentes, sin error. |
| `pnpm build:agent` | EVE/Nitro compilado: 10,7 MB, 2,42 MB gzip. Sin llamada al modelo. |
| `RUN_DASHBOARD_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/dashboard apps/mobility-core/src/observability/dashboard.integration.test.ts` | 9 archivos / 40 tests pasan. Es una selección mixta SQL y unitarias, no 40 casos exclusivamente SQL. |
| `node --env-file=.env.local scripts/test-dashboard-local.mjs --preview` | 31 comprobaciones HTTP pasan; dos identidades sintéticas con login Better Auth real, Core/BFF y captura. [Resultados](../audits/assets/core-dashboard-refinement-2026-10-03/http-results.json). |
| `EXPLAIN (ANALYZE, FORMAT JSON)` de lectores reales en esquema aislado | 22 consultas; máximo de ejecución 177.908 ms en esta fixture. [Planes resumidos](../audits/assets/core-dashboard-refinement-2026-10-03/sql-plans.json). No SLO ni benchmark de producción. |
| Navegador autenticado, 1440×900 / 1280×720 / 768×1024 / 390×844 | 24 combinaciones con h1 esperado, sin alertas de error ni desbordamiento horizontal del documento. Las tablas pueden desplazarse en su contenedor. [Medidas](../audits/assets/core-dashboard-refinement-2026-10-03/responsive-results.json). |

La captura de QA es sintética y está aislada del runtime habitual. Las observaciones envejecen durante la revisión y pasan a antiguas sin alterar sus fechas. El guard del servidor de QA permite solo HTTP local a 3002/3003; no es una intercepción de red del navegador ni una garantía contra cualquier mecanismo de salida imaginable.

## Referencias y revisión visual

| Severidad original | Ubicación actual | Antes | Después | Motivo |
| --- | --- | --- | --- | --- |
| HIGH, corregido | `apps/eve-web/app/(dashboard)/dashboard/_components/overview-view.tsx:10`, `insights.tsx:12` | Árbol de atributos sin jerarquía | Franja KPI, pregunta, gráfico, cobertura y acción | Referencia métricas: lectura principal antes del detalle. |
| MEDIUM, corregido | `source-view.tsx:413`, `activity-view.tsx:30` en el mismo directorio | Metadatos separados de la causa | Fuente/operación/periodo, problema y evidencia enlazados | Referencia webhooks: conectar estado y causa, sin Retry externo. |
| MEDIUM, corregido | `tool-form.tsx:163`, `mobility-view.tsx:53` en el mismo directorio | JSON e IDs como entrada principal | Selectores/checkboxes con etiquetas y consentimiento explícito | Referencia selección: comprender elección y efectos antes de actuar. |
| MEDIUM, corregido | `shell.tsx:87` en el mismo directorio | Seis enlaces sin agrupación | Información/Sistema/Personal, selección padre-hijo, cuenta y chat | Referencia sidebar: orientación sin configuración operativa nueva. |
| MEDIUM, corregido | `conversation-view.tsx:47` en el mismo directorio | Tabs manuales y filtro local parcial | Tabs Radix, turnos y filtros del servidor | Interacción accesible y evidencia completa dentro de retención. |
| LOW, corregido | `dashboard.css:1`, `map.tsx` en el mismo directorio | Feedback genérico y marcadores recreados | Feedback local 120 ms, puntero fino, opt-out teclado/tablas/reduced-motion; reconciliación por ID | better-ui/emil-design-eng: movimiento contenido, foco visible y estabilidad. |

Las cuatro [referencias originales](../audits/assets/core-dashboard/README.md) se conservan intactas. Geist, tokens EVE, superficies, botones, campos y espaciado existentes se reutilizan. No se modificaron el markup ni los controles del chat oficial.

Capturas de las seis vistas de escritorio:

- [Resumen](../audits/assets/core-dashboard-refinement-2026-10-03/dashboard-1440-dark.jpg)
- [Movilidad](../audits/assets/core-dashboard-refinement-2026-10-03/mobility-1440-dark.jpg)
- [Consultas](../audits/assets/core-dashboard-refinement-2026-10-03/tools-1440-dark.jpg)
- [Fuentes](../audits/assets/core-dashboard-refinement-2026-10-03/sources-1440-dark.jpg)
- [Actividad](../audits/assets/core-dashboard-refinement-2026-10-03/activity-1440-dark.jpg)
- [Conversaciones](../audits/assets/core-dashboard-refinement-2026-10-03/conversations-1440-dark.jpg)

[Detalle de conversación](../audits/assets/core-dashboard-refinement-2026-10-03/trace-dark.jpg) · [Histórico](../audits/assets/core-dashboard-refinement-2026-10-03/entity-history-dark.jpg) · [Mapa](../audits/assets/core-dashboard-refinement-2026-10-03/map-dark.jpg) · [Navegación móvil](../audits/assets/core-dashboard-refinement-2026-10-03/navigation-mobile-dark.jpg).

**Approve únicamente la composición y los estados inspeccionados; no hay un HIGH funcional conocido abierto.** Esto no aprueba las verificaciones expresamente pendientes de la sección siguiente.

## Recorrido de claridad

Comprobación editorial y recorrido por el implementador, **no estudio con usuarios independientes**:

1. Resumen → «Qué mide y qué excluye» explica por qué 4 bicicletas de una estación no son todo Madrid.
2. Movilidad → elegir BiciMAD, distinguir antiguas/no disponibles y abrir ficha con observación e incorporación distintas.
3. Ficha → consultar histórico guardado; leer correcciones conocidas después y ausencia de interpolación.
4. Catálogos → consultar horario/tarifa/declaración sin interpretarlos como disponibilidad o equipamiento actual.
5. Consultas → cargar ejemplo sin ejecutar y consultar almacenado; botón manual permanece bloqueado sin confirmación.
6. Fuentes/Actividad → distinguir ingestión deshabilitada, fallo registrado y antigüedad; gráfico operativo no representa tráfico.
7. Mis conversaciones → seleccionar turno, interpretar uso ausente como desconocido y enlazar callId enviado sin inferir influencia semántica.

## Límites y no verificado

- Tema claro, contraste medido exhaustivamente, reduced-motion real, zoom 200 %, replay de animaciones al 10 % y teclado completo en cada detalle: **No verificado**. La aplicación sigue el sistema EVE; no se añadió selector ni se cambió macOS sin autorización.
- Error/intercepción de tiles y límite >1000 en navegador: **No verificado**. Se comprobó la carga normal de un mapa, sin barrido de OSM, con origen fijo y crossOrigin anónimo en código.
- No se ejecutaron conversaciones generativas, adquisición real a proveedores, OTP benchmarks, despliegue cloud ni instalación sobre 3000/3001/4274. Los datos originales pueden seguir antiguos: releer no los rejuvenece.
- Las trazas previas a instrumentación no se reconstruyen. Retención/bytes/omitidos se muestran; datos nunca capturados no se recuperan.
- CI remoto se registra en PR #45 tras publicar los commits; no se afirma verde antes de su resultado. No merge automático.

## Key Learnings:

1. Un recuento de colección no sustituye la frescura de cada entidad ni su denominador.
2. La falta de tokens o de captura permanece desconocida; los agregados se calculan antes de paginar.
