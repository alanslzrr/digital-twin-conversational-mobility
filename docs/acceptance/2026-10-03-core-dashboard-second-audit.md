# Panel Core — segunda auditoría, 3 de octubre de 2026

[Índice](../index.md) · [Auditorías](../audits/index.md) · [Acta anterior](2026-10-03-core-dashboard-refinement.md) · [Spec-audit](../audits/2026-10-02-core-dashboard-review.md)

Segunda revisión de la misma [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45), iniciada sobre `5461fea58561cb01022e4e86dd4943b297718a0b`. HEAD de aplicación corregido: **`1355f1633a08294dd1bd6be45a8ad7b0498c0ca2`**. Los resultados anteriores se conservan como históricos; esta revisión añade pruebas con **agent-browser 0.38.2**, no reutiliza CUA como sustituto.

## Contenido

- [Hallazgos y correcciones](#hallazgos-y-correcciones)
- [Las seis vistas](#las-seis-vistas)
- [Pruebas y reproducción](#pruebas-y-reproducción)
- [Referencias y alcance visual](#referencias-y-alcance-visual)
- [Límites](#límites)

## Hallazgos y correcciones

Todos los hallazgos de esta segunda revisión se han corregido. Prioridad P2 / MEDIUM: corrección obligatoria, no gusto personal. Las líneas siguientes corresponden al HEAD corregido y al directorio `apps/eve-web/app/(dashboard)/dashboard/_components/`.

| ID | Ubicación | Antes | Después | Motivo y regresión |
| --- | --- | --- | --- | --- |
| Q1 | `dashboard.css:2` | Texto secundario claro `#808080` sobre blanco: contraste 3,94:1, inferior a 4,5:1 | Neutral oscuro local `oklch(0.5 0 0)` y anillo de foco local; chat intacto | axe revisa las seis vistas en ambos temas; el ajuste también cubre el diálogo móvil |
| Q2 | `shell.tsx:107,223,245` | Dos landmarks complementarios indistinguibles en Resumen; estado y explicación fuera de landmarks | Navegación/cuenta identificadas; dos regiones con nombres distintos | Eliminadas las incidencias `landmark-unique` y `region` |
| Q3 | `source-view.tsx:359`, `dashboard.css:22` | Tabla de duraciones desplazable en móvil sin acceso por teclado | Región identificada, tabulación y foco visible | Foco y ArrowRight desplazan la tabla a 390 px; excepción de lint acotada y justificada |
| Q4 | `mobility-view.tsx:134`, `activity-view.tsx:80`, `map.tsx:106` | `replaceState(null)` podía borrar los metadatos de navegación al abrir una ruta directamente | Cada escritura conserva el estado existente; callback de cámara no escribe fuera del listado | Regresión comprueba estado del router y navegación; no se atribuye a esta causa todo fallo de clic |
| Q5 | `mobility-view.tsx:450`, `activity-view.tsx:264` | Enlaces de tabla inline: el centro del rectángulo de un nombre partido podía caer fuera del texto pulsable; Enter sí funcionaba | Caja inline-flex de al menos 44 px | Clic de ratón abre una estación cuyo nombre ocupa varias líneas |
| Q6 | `map.tsx:75`, `dashboard.css:59` | Zoom nativo de Leaflet de 30 px y nombres ingleses | Acercar/Alejar mapa; área comprobada de 44 px también con estilos táctiles | Se comprueba la altura real, no solo el CSS escrito |
| Q7 | `tool-view.tsx:106`, `activity-view.tsx:96`, `map.tsx` | MCP, stdout y best-effort en explicaciones principales | Texto sobre datos guardados, ejecución deliberada, inicio de captura y disponibilidad del fondo externo | Se conserva la información técnica secundaria y la separación de efectos |
| Q8 | `map.tsx:111`, `mobility-view.tsx:416` | Cámara en URL actualizada a zoom 13, pero el enlace de una fila podía conservar zoom 12 | La cámara notifica al padre y actualiza sus enlaces | Ida por clic a la ficha y regreso conservan filtro, mapa y zoom 13 |
| Q9 | `product-copy.ts:98`, `entity-detail.tsx:40`, `mobility-view.tsx:515`, `shared.tsx` | El formateo numérico saltaba la interpretación de wheelchair y segundos de horario, tanto en listado como ficha | Un único formateador distingue códigos, horas del día siguiente, unidades, cero y ausencia | Tres pruebas permanentes; accesibilidad legible también después de recargar el catálogo |

La [regresión de navegador](../../scripts/audit-dashboard-browser.mjs) recorre rutas reales, usa login Better Auth y acciones de ratón/teclado. No desactiva los límites de lectura para acelerar la prueba: espacia las pantallas para respetar 120 lecturas/minuto.

## Las seis vistas

Matriz: claro y oscuro, con preferencia de movimiento reducido, a **1440×900, 1280×720, 768×1024 y 390×844**. Son 48 combinaciones. El documento no desborda horizontalmente; las tablas conservan desplazamiento propio. El análisis automático usa axe-core 4.12.1.

| Vista | Qué se revisó | Evidencia de escritorio claro / móvil oscuro |
| --- | --- | --- |
| Resumen | Jerarquía KPI, explicaciones/exclusiones, catálogo separado, avisos y actividad | [Escritorio](../audits/assets/core-dashboard-second-audit-2026-10-03/overview-1440-light.jpg) · [Móvil](../audits/assets/core-dashboard-second-audit-2026-10-03/overview-390-dark.jpg) |
| Movilidad | Antigüedad, filtros, listado y ficha, histórico, cámara, retorno, referencia y recarga | [Escritorio](../audits/assets/core-dashboard-second-audit-2026-10-03/mobility-1440-light.jpg) · [Móvil](../audits/assets/core-dashboard-second-audit-2026-10-03/mobility-390-dark.jpg) |
| Consultas | Catálogo real de 16 herramientas, ejemplos sin ejecución, formularios y consulta almacenada | [Escritorio](../audits/assets/core-dashboard-second-audit-2026-10-03/tools-1440-light.jpg) · [Móvil](../audits/assets/core-dashboard-second-audit-2026-10-03/tools-390-dark.jpg) |
| Fuentes y actualización | Procesos separados de frescura, periodos/operaciones y tabla desplazable con teclado | [Escritorio](../audits/assets/core-dashboard-second-audit-2026-10-03/sources-1440-light.jpg) · [Móvil](../audits/assets/core-dashboard-second-audit-2026-10-03/sources-390-dark.jpg) |
| Actividad del sistema | Filtros, registro acotado, leyenda y explicación del inicio de captura | [Escritorio](../audits/assets/core-dashboard-second-audit-2026-10-03/activity-1440-light.jpg) · [Móvil](../audits/assets/core-dashboard-second-audit-2026-10-03/activity-390-dark.jpg) |
| Mis conversaciones | Índice propio, turno seleccionado, duración 1200 ms sintética y pestañas por teclado | [Escritorio](../audits/assets/core-dashboard-second-audit-2026-10-03/conversations-1440-light.jpg) · [Móvil](../audits/assets/core-dashboard-second-audit-2026-10-03/conversations-390-dark.jpg) |

## Pruebas y reproducción

Comprobados por navegador: clic en entidad multilínea, histórico, retorno con filtro, zoom 13 y cámara persistente; teclado de catálogo y recarga; consulta guardada con ejecución manual todavía deshabilitada; turno sintético de 1200 ms; pestaña Herramientas; tabla horizontal por teclado; pausa, refresco pausado, desconexión y recuperación; cierre/entrada como segundo evaluador con 404 para el resumen anterior y sin turnos heredados. No se fuerza la entrega tardía de una petición anterior en esta prueba de dos identidades.

Comprobaciones complementarias: [fuente AEMET](../audits/assets/core-dashboard-second-audit-2026-10-03/source-detail-full.jpg), [evento no completado](../audits/assets/core-dashboard-second-audit-2026-10-03/event-detail-full.jpg) y [accesibilidad sin códigos](../audits/assets/core-dashboard-second-audit-2026-10-03/reference-full.jpg). Axe no detecta incidencias en las dos fichas; conserva un caso indeterminado de encabezados sin filas en la tabla vacía de duraciones. El diálogo retiene foco durante 12 pulsaciones Tab; Escape vuelve al activador. Esto comprueba las guardas de foco que axe no puede decidir automáticamente. La referencia aria-controls del activador cerrado corresponde al diálogo cuando este se monta.


| Prueba | Resultado |
| --- | --- |
| `pnpm check` | 479 aprobadas, 94 opt-in omitidas; lint, límites de paquetes, typecheck y builds correctos. Core con caché y Web recompilado al verificar la aplicación; la última comprobación de publicación reutilizó ambos builds. |
| Suite dashboard con `RUN_DASHBOARD_DB_TESTS=1` | 40 aprobadas / 9 archivos, mezcla de PostgreSQL y unitarias. No cambios de lectores SQL en esta revisión. |
| `pnpm build:agent` | Build EVE/Nitro correcto, sin inferencia. |
| Smoke local autenticado | 31 comprobaciones correctas; dos cuentas sintéticas, 3002/3003, esquema propio, adquisición/modelo desactivados. |
| agent-browser | 72 pantallas/formularios pasan: matriz 48, 16 formularios y ocho detalles/interacciones; cero incidencias axe detectadas, 18 resultados indeterminados conservados. [Resultados](../audits/assets/core-dashboard-second-audit-2026-10-03/browser-results.json) y [recorridos](../audits/assets/core-dashboard-second-audit-2026-10-03/functional-results.json). |
| Documentación | 69 archivos Markdown, 1.197 enlaces locales y 315 anclas comprobados sin errores; `git diff --check` correcto. |

Para repetir sin tocar la instalación habitual:

```sh
pnpm check
# Terminal 1; esperar «Authenticated isolated HTTP smoke passed: 31 checks».
node --env-file=.env.local scripts/test-dashboard-local.mjs --preview
# Terminal 2; executable de agent-browser 0.38.2, instalado fuera del proyecto.
AGENT_BROWSER_BIN="/ruta/al/ejecutable/agent-browser" node scripts/audit-dashboard-browser.mjs
# El arnés cierra su sesión de navegador. Ctrl-C en Terminal 1 limpia su esquema.
```

El CLI se obtuvo con `npx --yes --package agent-browser@0.38.2`; no se añadió dependencia al proyecto ni se usó la sesión del navegador del usuario. Los informes locales quedan en `tmp/dashboard-second-audit`, sin cookies ni cabeceras de autenticación.

## Referencias y alcance visual

Releídas las [cuatro imágenes de referencia](../audits/assets/core-dashboard/README.md), junto con better-ui y emil-design-eng. Contraste explícito:

- **Métricas:** franja de indicadores antes del desglose, gráfico por pregunta y tabla equivalente; no se copian cifras de visitantes ni tendencias inexistentes.
- **Webhooks:** estado, consecuencia y evidencia enlazada; no se traslada un Retry externo automático al panel.
- **Selección:** elección visible, controles nativos y confirmación de efectos separada; no ejecutar al cargar un ejemplo.
- **Sidebar:** agrupación Información/Sistema/Personal y selección padre-hijo; diálogo móvil y retorno de foco.

Se mantienen Geist, superficies, radios, colores neutros y componentes EVE. Las correcciones de contraste se limitan al panel/diálogo; no se cambian los tokens globales, el chat oficial, los renderers, el transporte o los controles `/s`.

## Límites

Esta revisión no es una certificación completa de accesibilidad ni un estudio con usuarios externos. No se presentan como verificadas las interacciones de lector de pantalla real, zoom nativo del navegador al 200 %, revisión de animación al 10 % o hardware táctil físico. La preferencia de movimiento reducido sí se activa en el navegador de QA; no se modifica la preferencia de macOS.

Se conservan 18 resultados indeterminados de axe: referencias del diálogo cerrado, guardas de foco y contraste con mapa/celdas desplazadas. Se verificó apertura y foco del diálogo y se inspeccionaron las capturas; no se certifica contraste universal en el raster. Los casos de colores del mapa que axe marque como indeterminados necesitan revisión manual; cero incidencias automáticas no prueba contraste universal sobre raster externo. No se repite como nueva medición el EXPLAIN de 22 consultas del acta anterior. Más de 1.000 puntos, cada error/resultado de las 16 herramientas, carrera concurrente completa de dos logins y todas las transiciones horarias no se certifican por inferencia de esta matriz.

Las lecturas de QA envejecen durante las pruebas. Se identifican como sintéticas y nunca se convierten en datos en directo al refrescar. No hubo modelo, nueva adquisición de proveedores, OTP, cloud, merge ni instalación sobre los servicios habituales.

Sesiones de navegador propias y servidores desechables cerrados. El esquema de la última ejecución se comprobó ausente y 3002/3003 libres. Los servicios habituales permanecen sin instalar ni reiniciar.
