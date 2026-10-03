# Mobility Core — refinamiento visual V2

[Índice](../index.md) · [V1](2026-10-03-core-dashboard-redesign.md) · [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45)

## Alcance

V2 sustituye las decisiones visuales de V1, no sus contratos. Base revisada `fdb650e`; aplicación refinada `ee56a5a`. Misma rama, sin integración, despliegue, cambios del chat oficial ni nuevos lectores, endpoints, DTOs, migraciones o adquisición. Los cambios documentales ajenos se conservan sin incorporarlos a estos commits.

## Implementación

- Tokens neutrales limitados al dashboard y sus portales: canvas #0A0A0A/#F5F5F5, panel #171717/blanco, elevado #1F1F1F. Geist y tema de sistema existentes. Acciones primarias invertidas, límites esenciales separados de bordes decorativos.
- Sidebar 200 px/rail 56 px; header 48 px/52 móvil; tarjetas 12 px/16 px. Seis destinos sin etiquetas de grupo repetidas. Cuenta y timing en Sheets; estado conserva el último éxito de la vista primaria.
- Primitivas generadas revisadas: Sidebar, Card, Sheet, Tabs, Radio Group, Table, Skeleton, Empty, Alert, Chart. shadcn 4.21.1, Radix/new-york/neutral conservados. No sobrescrituras de primitivas existentes; se rechazaron la migración global de tema y la dependencia `cn`. Única dependencia directa añadida: Recharts 3.8.0 (diff de lockfile adjunto).
- Technical/JSON secundario usa Collapsible Show/Hide con plus/minus; no disclosure nativo. Rutina de workers visible. Sheets con foco restaurado, scroll y tokens locales.
- Overview: título navegable y un control de definición por KPI; valor, unidad, cobertura y contexto. M4 numerator/denominator, unidades exactas por producto, frescura guardada sin sumar productos heterogéneos; atención limitada a tres.
- Mobility: mapa/lista coordinados, columnas Bikes/Docks y detalle seleccionado con histórico visible. Observaciones, huecos, reducción y registros exactos; no interpolación ni adquisición. Cerrar inspector no borra identidad seleccionada.
- Queries: selección inicial de metadata estática del registro, lista compacta y buscable, inspección almacenada separada de ejecución. Schema, efectos, IDs, cancelación y desenlace desconocido intactos.
- Sources: una frontera principal de fallo, datos cacheados y timestamp de éxito retenidos; lectura de worker independiente. Mediana, p95 elegible y muestra por operación, sin distribución inventada.
- Activity: lanes alineadas con escalas independientes, teclado y datos exactos; huecos no cero, intervalo reconciliado por instante absoluto tras refresco. Tabla compacta e inspector de evento; Madrid/DST y Apply/Cancel conservados.
- Conversations: Timeline, Tools, Usage, Model y Content preservados. Uso reportado por turno, entrada/salida sin sumar caché ni razonamiento otra vez. Vacío orientado a Open chat; retención secundaria y ownership intactos.

## Comparación KPI y gráficos

Los cuatro KPI tienen **solo comparación opcional entre lecturas exitosas de pantalla**, en memoria, misma identidad/selección/unidad/definición/cohorte y dentro de 60 segundos. Primera lectura, ausencia, pausa, error, incompatibilidad o baseline viejo muestran comparación no disponible. Cambios de contribuyentes muestran Coverage changed. Cero es valor válido. No hay históricos globales, porcentaje favorable ni sparkline inventado.

| Gráfico | Origen y alcance |
| --- | --- |
| Readiness units | overview.products: un producto habilitado por celda, reconcile con M4; no cobertura ciudad |
| Product freshness | resumen de producto homogéneo; partición validada, fallback exacto si no exhaustiva |
| Entity history | lector existente de series de entidad/magnitud, <=240 puntos retenidos, observationAt |
| Recorded duration | métricas existentes por componente/operación; mediana disponible, p95 solo N >=20 |
| Publication/error lanes | bins existentes de actividad, mismo rango UTC; capture gaps explícitos |
| Turn usage | turnos retenidos devueltos de conversación propia, padres reportados y subsets anotados |

## Validación

- `pnpm check`: 508 tests pasan, 99 omitidos; lint/boundaries/typecheck/build correctos. Ocho warnings CSS y dos infos no bloqueantes; no se desactivaron gates.
- Tests aislados SQL: 26 pruebas, tres suites correctas.
- Smoke HTTP autenticado aislado: 36 checks correctos, adquisición/modelos deshabilitados; éxito de Sources únicamente en esta instalación sintética.
- Pruebas de componentes/adapters: cuatro archivos, 28 tests. Incluyen 100 particiones deterministas, incompatibilidades de comparación, null/cero, gaps, token subsets y umbral p95.
- Paleta propuesta: 94 contraste y 32 neutralidad; no equivale a certificación de accesibilidad de aplicación.
- Matriz browser: 72 capturas, sin overflow documental ni violaciones axe detectadas. Interacciones: 35 assertions correctas (focus, portals, pausa, DST, fallos inicial/cache/worker, unknown execution, subsets y revocación). Resultados definitivos: véase [evidencia](../audits/assets/core-dashboard-refinement-v2-2026-10-03/README.md).

## Evidencia y límites

[Evidencia sintética, capturas coincidentes antes/después, gate de shell y reportes](../audits/assets/core-dashboard-refinement-v2-2026-10-03/README.md). El gate oscuro/claro shell/Overview se revisó antes de propagar el diseño. La matriz incluye seis vistas × dos temas × seis viewports: 1440×1000, 1280×800, 1024×768, 768×1024, 390×844 y 320×720.

**Aceptación end-to-end no cerrada:** zoom nativo 200% y VoiceOver/browser no verificados: el Mac estaba bloqueado al intentar interacción nativa. CSS zoom 2 solo aporta cobertura de layout, no sustituye zoom de navegador ni lector de pantalla. Axe conserva comprobaciones incompletas (p. ej., IDs de portales cerrados y texto parcialmente oculto por scroll), registradas sin convertirlas en passes.

El fallo Sources de la instalación habitual no se reprodujo ni investigó en ese entorno: no se atribuye causa upstream ni se declara corregido por el éxito sintético. La política de deadlines/validación permanece. La superficie compacta puede seguir necesitando revisión editorial de contenido real, especialmente labels extensos proporcionados por fuentes. No estudio con usuarios independientes ni adquisición/modelos reales.

`pnpm audit`: una vulnerabilidad high preexistente de Vercel/braces; remediación separada. No se afirma CI verde ni merge readiness.

## Key Learnings:

1. Una comparación de lecturas exitosas no es una tendencia histórica ni una mejora del servicio.
2. Un fallo de lectura de vista, estado del worker y frescura del proveedor son señales independientes.
