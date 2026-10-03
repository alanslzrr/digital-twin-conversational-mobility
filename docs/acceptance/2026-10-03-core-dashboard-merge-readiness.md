# Mobility Core — revisión previa al merge de PR #45

[Índice](../index.md) · [Actas](index.md) · [Alcance](../roadmap.md) · [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45)

## Hallazgos y correcciones

1. **Sources con routing instalado.** El lector devolvía `activatedAt`, pero el saneador lo eliminaba y el contrato rechazaba `data.routes[0].activatedAt`. Se reprodujo usando una transacción local de solo lectura. La lista de campos públicos conserva ahora la fecha y su valor nulo para releases preparadas; sigue excluyendo manifiestos y secretos. Regresión unitaria, SQL con release preparada/activa y HTTP autenticado con release sintética.
2. **Auditoría de dependencias.** La única cadena hacia `braces` provenía de la CLI de Vercel. Se retiró esa dependencia de desarrollo y se sustituyó el configurador por una salida de error anterior a cualquier acceso a secretos o servicio remoto. `doctor` ya no invoca la CLI. No se introduce instalación global, descarga alternativa, exclusión de advisory ni auditoría limitada a producción. El control de CI verifica el bloqueo del configurador además de mantener `pnpm audit --audit-level=high`.
3. **Navegación por regiones de tablas.** axe detectó nombres accesibles repetidos en Sources y Usage de una conversación. Cada tabla del panel tiene ahora un nombre según su propósito y su región de desplazamiento hereda ese contexto. Se conserva el acceso por teclado.
4. **Arnés de teclado.** Las aserciones esperaban el foco inmediatamente después de Escape, antes del cierre asíncrono de Radix. Ahora esperan de forma acotada la devolución del foco y después la verifican; no se elimina la aserción ni se cambia el comportamiento del diálogo.

## Verificación local ejecutada

| Comprobación | Resultado |
| --- | --- |
| `pnpm check` | 510 pruebas aprobadas, 100 omitidas; lint, tipos y builds de producción correctos |
| Suite SQL/unitaria del panel con `RUN_DASHBOARD_DB_TESTS=1` | 48 aprobadas |
| HTTP autenticado en esquema desechable | 37 comprobaciones correctas |
| Interacciones con agent-browser 0.38.2 | 35 aserciones correctas; [resultado versionado](../audits/assets/core-dashboard-merge-readiness-2026-10-03/interactions.json) |
| `pnpm build:agent` | Correcto |
| `pnpm install --frozen-lockfile` | Correcto |
| `pnpm audit --audit-level=high` | Sin vulnerabilidades conocidas |
| `node scripts/check-cloud-disabled.mjs` | Correcto sin credenciales; salida cerrada con y sin `--apply` |

El recorrido sintético incluye diálogos y devolución de foco, mapa/lista/filtros, intervalos del gráfico, conservación de datos ante fallo de lectura, ejecución con resultado desconocido, uso conversacional, revocación de sesión y segunda identidad. axe no detectó violaciones en los estados inspeccionados; sus resultados incompletos no equivalen a una revisión con lector de pantalla.

Los fixtures incluyen una release de routing activa y no invocan proveedores ni modelos. La lectura de la base habitual se limitó a verificar el contrato de Sources, sin escribir datos. Los servicios habituales no se reiniciaron ni sustituyeron por el preview de QA.

## CI y límites de aceptación

La CI del commit publicado es el control remoto final: [comprobaciones de PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45/checks). Los resultados locales no sustituyen ese resultado ni autorizan integrar automáticamente.

- Por decisión explícita del usuario el 03/10/2026, la prueba con lector de pantalla real queda fuera del alcance y no condiciona el merge. No se declara aprobada ni se sustituye por axe.
- La [nueva matriz móvil](2026-10-03-core-dashboard-mobile-closure.md) está completada: 72 vistas y 52 estados, con recortes de cabecera y pestañas corregidos. Sigue pendiente el zoom nativo al 200 %, que requiere un paso manual del usuario. Se conservan los límites de la [tercera auditoría](2026-10-03-core-dashboard-third-audit.md) y del [selector de tema](2026-10-03-core-dashboard-theme-header.md).
- No se declara aceptación estética definitiva ni soporte productivo de movilidad. T10 continúa diferido.
- La publicación cloud sigue deshabilitada. Recuperar ese flujo requiere herramienta auditada y autorización específica; no se modificaron proyectos remotos.
- Los cambios locales anteriores de documentación y las instrucciones generadas de Next se conservaron en commits separados. Sin merge, despliegue ni modificación del chat oficial EVE.

## Implementación y reproducción

- [Saneador](../../packages/contracts/src/safe-data.ts) y [regresión SQL](../../apps/mobility-core/src/dashboard/independent-review.integration.test.ts).
- [Fixture](../../scripts/dashboard-qa-fixtures.mjs), [HTTP aislado](../../scripts/test-dashboard-local.mjs) y [recorrido de navegador](../../scripts/audit-dashboard-redesign-interactions.mjs).
- [Configurador cerrado](../../scripts/configure-vercel.mjs), [comprobación](../../scripts/check-cloud-disabled.mjs) y [workflow de CI](../../.github/workflows/ci.yml).
- [Preparación cloud](../deployment.md) y [advisory oficial](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
