# Correcciones del contraste independiente · 03/10/2026

[Índice](../index.md) · [Actas](index.md) · [Hallazgos originales R1–R5](../audits/2026-10-02-core-dashboard-review.md#contraste-independiente-del-03102026) · [Segunda acta histórica](2026-10-03-core-dashboard-second-audit.md) · [Alcance](../roadmap.md)

> Evidencia histórica: la resolución posterior de Sources y del bloqueo de dependencias está en la [revisión previa al merge](2026-10-03-core-dashboard-merge-readiness.md).

## Resultado

**Aceptación global todavía abierta:** la nueva CI se detuvo en auditoría de dependencias, no en las regresiones del panel. El bloqueo se detalla en [seguridad de dependencias](#bloqueo-de-ci-por-seguridad-de-dependencias).

Los cinco hallazgos del contraste independiente están corregidos en la misma [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45), sin integrar ni instalar sobre el servicio habitual. Código de aplicación: `ac9e922`; regresiones independientes: `c43e5c2`. No se modifica EVE oficial, autenticación, propiedad de conversaciones ni configuración de proveedores.

| Antes | Después | Verificación |
| --- | --- | --- |
| R1: DGT aparecía en lista y desaparecía del mapa. | SQL y presentación comparten rutas y precedencia de coordenadas publicadas. El rectángulo y los totales se aplican antes de paginar. | Regresión SQL con `location.start`, dentro/fuera del rectángulo; navegador con lista, respuesta de mapa y dibujo real sobre Canvas. |
| R2: todas las fuentes deshabilitadas podían producir cero avisos. | M3 requiere un producto habilitado y utilizable; sin él devuelve `null` y muestra «Sin dato». | SQL y navegador conservan una lectura DGT reciente utilizable, pero deshabilitan las fuentes de avisos. |
| R3: plazas sin categoría visible ni seleccionable. | Selector de categorías publicadas, etiqueta visible en M2, consulta y caché por categoría. Lista, mapa y detalle reciben el filtro y la vuelta lo conserva. | Categoría A=3 y B=2, nunca suma 5; selección B y recorrido detalle/vuelta; HTTP prueba lista/mapa/detalle con el parámetro permitido. |
| R4: fechas de siete días junto a consulta de 24 h. | Los controles muestran el intervalo efectivo devuelto por Core. Editar un extremo conserva el otro extremo efectivo; durante la carga los controles relativos están deshabilitados. | Navegador: 24 h iniciales, cambio a 1 h y edición nativa de minutos mediante teclado. El otro extremo y el parámetro enviado conservan su valor. |
| R5: ausencia de consulta descrita como lectura antigua. | Se cuentan recursos con observación, no reservas pendientes. «Sin consulta previa guardada» es distinto de respuesta vacía reciente y de lectura antigua. | SQL cubre caché inexistente, reserva pendiente, respuesta vacía reciente y lectura antigua; navegador comprueba los estados sin adquirir datos. |

## Pruebas ejecutadas

- `pnpm check`: **481 pruebas aprobadas y 99 omitidas**; lint, límites entre paquetes, tipos y builds correctos. Las omisiones incluyen cinco regresiones SQL que se ejecutaron aparte. La compilación de aplicación inicial recompiló ambos proyectos; la comprobación posterior recompiló Core y reutilizó Web. La comprobación final de publicación reutilizó ambos builds.
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

## Bloqueo de CI por seguridad de dependencias

La [CI del HEAD `c92e773`](https://github.com/alanslzrr/digital-twin-conversational-mobility/actions/runs/37101874773) falló en `pnpm audit --audit-level=high`. El mismo comando reproduce localmente **una vulnerabilidad alta**: [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), agotamiento de pila por patrones de llaves anidados en `braces <=3.0.3`. El aviso, actualizado el 02/10/2026, declara que no hay versión corregida.

La cadena instalada es de desarrollo: `vercel@59.25.4 → @vercel/backends → ts-morph@12.0.0 → @ts-morph/common → fast-glob → micromatch → braces@3.0.3`. No se presenta como prueba de explotación en los servicios de movilidad ni se minimiza el fallo del control de calidad.

Se consultó el registro npm el 03/10/2026: `braces` continúa en 3.0.3; `micromatch@4.0.8` y `fast-glob@3.3.3` siguen dependiendo de esa cadena. Vercel 62.2.0 conserva `ts-morph@12.0.0` en sus builders. Actualizar únicamente la CLI no elimina el problema. `ts-morph@28.0.0` cambia de versión mayor y de árbol de dependencias; imponerlo a builders que fijan 12.0.0 requiere una validación específica, no una sustitución silenciosa dentro de estas correcciones.

No se modificó el lockfile, no se añadieron exclusiones de advisories ni se rebajó/desactivó `pnpm audit`. **Pendiente real antes de integrar:** resolver o mitigar la dependencia y validar las funciones de la CLI afectadas; después repetir CI. El `pnpm check` local aprobado no convierte esa auditoría fallida en verde.


## Revisión independiente posterior

Contraste sobre HEAD `d39a74fd5fdadccf7d050b4b7075448b8929da60`: las correcciones R1–R5 corresponden a los defectos originales. Se revisaron extracción compartida de coordenadas, condición de disponibilidad M3, propagación de categoría en listado/mapa/detalle, rango efectivo de Eventos y distinción de caché EMT sin observación. No se detectó un nuevo bloqueo funcional en este alcance.

Reejecutados en esta revisión:

- `pnpm check`: 481 aprobadas / 99 omitidas; ambos builds recuperados de caché Turbo.
- Suite dashboard SQL/unitaria: 47 aprobadas / 11 archivos, incluidas las regresiones independientes.
- Smoke HTTP aislado sin `--preview`: 36 comprobaciones aprobadas; puertos 3002/3003 libres al terminar.
- `pnpm audit --audit-level=high`: continúa fallando por GHSA-vfj7-8cjw-p6xm. La [CI de d39a74f](https://github.com/alanslzrr/digital-twin-conversational-mobility/actions/runs/37102217111/job/111143833374) también falla.

Las 20 entradas nuevas del archivo de evidencia corresponden a la ejecución anterior; no se volvió a ejecutar agent-browser. No se declara una aceptación visual exhaustiva ni una nueva compilación del agente.

**Resolución propuesta del bloqueo:** retirar la CLI de despliegue Vercel del árbol instalado mientras cloud siga deshabilitado y bloquear su configurador antes de leer o escribir secretos. Conservar `pnpm audit --audit-level=high` para todas las dependencias restantes; no mover la CLI vulnerable a `pnpm dlx`, instalación global o un trabajo sin auditoría. La alternativa es mantener la CLI y validar expresamente una actualización mayor de sus dependencias internas; un simple cambio de versión de la CLI no basta. La elección está pendiente de confirmación: esta revisión no modifica dependencias ni controles CI, ni afirma que la CI esté reparada.
