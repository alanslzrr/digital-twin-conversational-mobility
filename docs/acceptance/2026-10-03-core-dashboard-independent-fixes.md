# Correcciones del contraste independiente · 03/10/2026

[Índice](../index.md) · [Actas](index.md) · [Hallazgos originales R1–R5](../audits/2026-10-02-core-dashboard-review.md#contraste-independiente-del-03102026) · [Segunda acta histórica](2026-10-03-core-dashboard-second-audit.md) · [Alcance](../roadmap.md)

## Resultado

Los cinco hallazgos del contraste independiente están corregidos en la misma [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45), sin integrar ni instalar sobre el servicio habitual. Código de aplicación: `ac9e922`; regresiones independientes: `c43e5c2`. No se modifica EVE oficial, autenticación, propiedad de conversaciones ni configuración de proveedores.

| Antes | Después | Verificación |
| --- | --- | --- |
| R1: DGT aparecía en lista y desaparecía del mapa. | SQL y presentación comparten rutas y precedencia de coordenadas publicadas. El rectángulo y los totales se aplican antes de paginar. | Regresión SQL con `location.start`, dentro/fuera del rectángulo; navegador con lista, respuesta de mapa y dibujo real sobre Canvas. |
| R2: todas las fuentes deshabilitadas podían producir cero avisos. | M3 requiere un producto habilitado y utilizable; sin él devuelve `null` y muestra «Sin dato». | SQL y navegador conservan una lectura DGT reciente utilizable, pero deshabilitan las fuentes de avisos. |
| R3: plazas sin categoría visible ni seleccionable. | Selector de categorías publicadas, etiqueta visible en M2, consulta y caché por categoría. Lista, mapa y detalle reciben el filtro y la vuelta lo conserva. | Categoría A=3 y B=2, nunca suma 5; selección B y recorrido detalle/vuelta; HTTP prueba lista/mapa/detalle con el parámetro permitido. |
| R4: fechas de siete días junto a consulta de 24 h. | Los controles muestran el intervalo efectivo devuelto por Core. Editar un extremo conserva el otro extremo efectivo; durante la carga los controles relativos están deshabilitados. | Navegador: 24 h iniciales, cambio a 1 h y edición nativa de minutos mediante teclado. El otro extremo y el parámetro enviado conservan su valor. |
| R5: ausencia de consulta descrita como lectura antigua. | Se cuentan recursos con observación, no reservas pendientes. «Sin consulta previa guardada» es distinto de respuesta vacía reciente y de lectura antigua. | SQL cubre caché inexistente, reserva pendiente, respuesta vacía reciente y lectura antigua; navegador comprueba los estados sin adquirir datos. |

## Pruebas ejecutadas

- `pnpm check`: **481 pruebas aprobadas y 99 omitidas**; lint, límites entre paquetes, tipos y builds correctos. Las omisiones incluyen cinco regresiones SQL que se ejecutaron aparte. La compilación de aplicación inicial recompiló ambos proyectos; la comprobación posterior recompiló Core y reutilizó Web.
- `RUN_DASHBOARD_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/dashboard apps/mobility-core/src/observability/dashboard.integration.test.ts`: **47 pruebas aprobadas / 11 archivos**, mezcla de SQL y pruebas unitarias. Las tres reproducciones originales se conservan como evidencia de fallos anteriores y tienen regresiones permanentes aprobadas.
- `pnpm build:agent`: correcto, **10,7 MB / 2,42 MB comprimidos**, sin inferencia.
- `node --env-file=.env.local scripts/test-dashboard-local.mjs --preview`: **36 comprobaciones HTTP aprobadas**, cinco adicionales para categorías y coordenadas anidadas. Better Auth real, identidades sintéticas y esquema desechable; adquisiciones e inferencia deshabilitadas.
- `scripts/audit-dashboard-independent.mjs`, con CLI externa **agent-browser 0.38.2**: **20 inspecciones nuevas**, las seis vistas a 1440×900 en claro, recorridos R1–R5 y Resumen/Actividad a 390×844 en ambos temas. **Cero incidencias axe y cinco resultados indeterminados**; no se cuentan como aprobaciones de accesibilidad completas. Sin desbordamiento horizontal del documento.
- Enlaces y anclas locales y `git diff --check`: correctos.

[Evidencia nueva y comandos reproducibles](../audits/assets/core-dashboard-independent-fixes-2026-10-03/README.md). Las **72 pantallas anteriores no se reutilizan como pruebas nuevas**.

## Límites y aislamiento

La evidencia usa fixtures explícitamente sintéticos y lecturas almacenadas, no datos operativos en directo. R2 instala una observación sintética propia para comprobar disponibilidad con fuentes deshabilitadas; no cambia fechas de datos públicos para aparentar frescura. Ningún recorrido ejecuta herramientas, proveedores, modelos o adquisiciones automáticas.

No se repitió la matriz completa de 72 pantallas, lector de pantalla real, zoom nativo, dispositivos táctiles físicos, estrés de más de mil puntos ni la carrera concurrente completa entre identidades. La sugerencia adicional de ejes/leyenda del gráfico no forma parte de los cinco defectos funcionales corregidos; se conserva como observación visual, no como verificación ejecutada.

El navegador de auditoría y los servidores aislados de 3002/3003 se cerraron; se comprobó la eliminación del esquema desechable. La instalación habitual, integración de PR y cloud siguen pendientes de autorización independiente.
