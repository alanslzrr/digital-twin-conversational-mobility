# Mobility Core — continuación del refinamiento V2

[Índice](../index.md) · [V2](2026-10-03-core-dashboard-refinement-v2.md) · [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45) · [Evidencia](../audits/assets/core-dashboard-refinement-v3-2026-10-03/README.md)

## Alcance

Continuación de la auditoría V2 sobre la misma rama `alanslzrr/core-dashboard`, base `7616777`. Solo presentación de `apps/eve-web` y el arnés QA local: sin cambios de contratos, lectores, endpoints, adquisición, dependencias ni chat oficial. Sin despliegue ni merge. Las notas documentales ajenas sin commit (R1–R5) se conservan fuera de estos commits.

Commits: `957cb71` (formato de JSON de evidencia V2, contenido verificado idéntico), `060673e` (modo `--dev` del preview aislado), `92d0d7d` (sistema visual en las seis vistas).

## Implementación

- **Hoja de estilos del dashboard** reescrita por secciones con tokens acromáticos ampliados (`--dash-selected`, `--dash-warning-mark`, `--dash-track`, `--dash-hatch`). Botones seleccionados por `:is(button, a)[data-variant][data-size]`, porque Radix `asChild` sustituye `data-slot` (p. ej., el trigger Filters).
- **Codificación de frescura única** en barras de producto, franja de cobertura de Mobility y marcadores del mapa: reciente = serie neutra, antigua = ámbar, sin evidencia utilizable = trama, referencia = gris. Antes la franja usaba rojo para ausencia y gris para antigua.
- **Overview:** KPI con alcance explícito ("1 of 4 stored stations included"), medidor solo cuando el ratio reconcilia, denominador M4 y pie de comparación. Tabla de evidencia por producto agrupada Periodic/On-demand con barra de frescura, estado con punto y recuentos exactos (`—` desconocido con texto accesible "Unknown"). Atención con contador y filas navegables; actividad reciente con mini-barras, huecos punteados y marcas de error.
- **Activity:** resumen publicaciones/errores/intervalos no capturados; ninguna barra de altura positiva para cero conocido; leyenda explícita del baseline punteado; tabla con `scope`, estado con punto y nombres de fuente.
- **Sources:** franja de dos métricas, tabla de productos por fuente (Enabled/Disabled con punto, recuentos Periodic/Reference) que reemplaza filas sin estilo, tabla periódica del detalle con estado de último intento, duraciones con columnas numéricas alineadas y filas compactas de workers, todavía independientes de la lectura de fuentes.
- **Mobility:** estado de frescura con punto y nombre de fuente legible; cabeceras numéricas alineadas; valores de filas antiguas/no disponibles atenuados (siguen visibles con su estado). Mapa con filtro de teselas más suave en ambos temas y tooltip con nombre de fuente.
- **Queries:** cabecera del inspector (título, pregunta, nombre canónico) sin pregunta duplicada; títulos de grupo del catálogo corregidos; selección del modo visible (Radix inserta un input oculto dentro de `form`, por lo que el selector hermano pasó de `+` a `~`).
- **Conversations:** un único control "Capture and retention" en cabecera (antes se repetía en el vacío), filas de sesión con botones Open chat/Inspect conversation, pestañas con estilo de segmento, franja de cuatro métricas, subconjuntos de uso en cuadrícula, tabla por turno y tarjetas de evento compactas. Corregido "de" residual en inglés y plural "1 attempt".

## Comparación KPI y gráficos

Ningún KPI muestra tendencia histórica. Los cuatro admiten **solo comparación entre lecturas exitosas sucesivas de esta pantalla** (`compareSnapshotReadings`): misma métrica, selección y unidad, valores finitos, lecturas ordenadas y separadas como máximo 60 s. Si cambian los contribuyentes se muestra "Coverage changed"; en otro caso "Reading unchanged", "Reading +N … since HH:MM:SS" o "Comparison unavailable".

| KPI | Elegibilidad | Medidor |
| --- | --- | --- |
| M1 Available bikes | Comparable entre lecturas; en la instalación sintética 0 de 4 estaciones incluidas → valor `—` y comparación no disponible | Ratio estaciones incluidas/almacenadas |
| M2 Published parking spaces | Igual que M1; 0 de 1 aparcamiento incluido | Ratio aparcamientos incluidos/almacenados |
| M3 Active published notices | Comparable entre lecturas; cobertura no exhaustiva declarada | Sin medidor (no hay denominador válido) |
| M4 Product readiness | Comparable entre lecturas; 2/13 en sintético | Productos con evidencia utilizable/habilitados |

| Gráfico | Origen |
| --- | --- |
| Unidades de readiness | `overview.products`, una celda por producto habilitado; reconcilia con M4 |
| Barra de frescura por producto | recuentos Recent/Stale/Unavailable del producto; solo si forman partición, si no pista vacía y recuento exacto |
| Vista previa y lanes de actividad | bins existentes de actividad; `null` = no capturado (punteado), cero sin barra |
| Franja de cobertura de Mobility | recuentos de la selección completa, misma codificación que la barra de frescura |
| Mapa | coordenadas publicadas de la página; color por frescura, contorno discontinuo para antigua/no disponible |
| Duraciones registradas | métricas por componente/operación; mediana siempre, p95 solo con n ≥ 20 |
| Uso por turno | turnos devueltos de la conversación propia; caché y razonamiento son subconjuntos, no segmentos añadidos |

## Validación

- `pnpm check` correcto: lint/boundaries, typecheck, 508 tests pasan y 99 omitidos, build de core y eve-web. En `7616777` el lint ya fallaba por formato de 98 JSON de evidencia; se formatearon y se comprobó por parseo que el contenido es idéntico.
- Revisión visual con CDP a 1440×1000 de las seis vistas en oscuro y claro, más mapa claro, detalle de conversación y comprobaciones puntuales a 390 px de Sources y Conversations. Sin errores nuevos en el log tras recarga limpia; los errores registrados durante la sesión correspondían a recargas en caliente intermedias.
- No ejecutado: `scripts/audit-dashboard-redesign-interactions.mjs` (requiere `AGENT_BROWSER_BIN`, no disponible). Las cadenas que comprueba siguen presentes en el código. Tampoco se regeneró la matriz de seis viewports ni axe.

## Límites

- El preview `--dev` muestra "Unable to load stored data" en la primera carga completa: el doble efecto de StrictMode aborta la primera petición. La siguiente lectura (refresco o sondeo) funciona; `next start` no se ve afectado. No se modificó el proveedor.
- Pendientes manuales: zoom nativo 200 %, VoiceOver/lector de pantalla, la matriz móvil completa (390/320) y la revisión editorial con contenido real de fuentes.
- El fallo de Sources de la instalación habitual sigue sin reproducir ni diagnosticar; el éxito sintético no lo cierra.
- `pnpm audit`: la vulnerabilidad high de braces vía Vercel sigue abierta y separada de esta aceptación visual.
- Los valores almacenados de filas sin observación se muestran atenuados junto a su estado; si se prefiere ocultarlos, requiere decisión explícita.

## Key Learnings:

1. Los selectores CSS sobre primitivas Radix deben tolerar `asChild` y los inputs ocultos que Radix inserta dentro de formularios.
2. Una misma magnitud (frescura) debe usar una única codificación visual en tablas, franjas y mapa.
