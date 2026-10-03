# Rediseño de las seis vistas de Mobility Core

[Índice](../index.md) · [Actas](index.md) · [Alcance](../roadmap.md) · [Spec original](../plans/2026-10-02-core-dashboard.md) · [Auditoría anterior](../audits/2026-10-02-core-dashboard-review.md)

## Alcance y estado

Implementación en la rama `alanslzrr/core-dashboard`, dentro de [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45). T00–T09 implementados; T11 dispone de validación automatizada de aplicación y navegador, con aceptación manual pendiente. T10, lectores analíticos opcionales y remediación de la dependencia de Vercel quedan fuera. **No integrado, desplegado ni instalado en el entorno habitual.**

La fuente normativa es el paquete local `data/tmp/AUDIT-03-10-2026-DESIGN/premium-design-handoff`, junto a `Mobility_Core_Design_Audit.md` en esa misma carpeta de auditoría. Los contratos existentes prevalecen para datos y conducta. No se presenta la adaptación como una medición exacta de la referencia Arc.

## Inventario de enlaces a datos

| Vista | Datos ya expuestos y utilizados | Fuera del alcance: necesitaría lector o no está soportado |
| --- | --- | --- |
| Overview | Cuatro métricas M1–M4, categoría de plazas, productos observados, hasta tres atenciones y cinco eventos recientes | Cobertura territorial completa, tendencias de los indicadores, comparación entre ciudades |
| Mobility | Página de entidades, mapa por ventana geográfica, detalle y series retenidas de las familias soportadas | Ordenación global, agrupaciones nuevas, total global inferido del mapa, puntos sin coordenadas |
| Queries | Registro de 16 herramientas, schemas existentes, inspección almacenada, ejecución explícita y recuperación por ID | Uso de herramientas deducido del registro, ejecución automática al navegar o inspeccionar |
| Sources | Respuesta autenticada de fuentes, recursos con cursor/revisión, métricas operativas y estado independiente de workers | Disponibilidad global, causalidad del fallo original, nueva adquisición o reinicios desde la vista |
| Activity | Eventos y barras de publicaciones/errores capturados, filtros existentes y fechas absolutas UTC | Series de tráfico derivadas de eventos operativos, intervalos desconocidos convertidos en cero |
| My conversations | Índice propio, resumen, turnos, eventos y payloads saneados con cobertura y límites existentes | Búsqueda global, reconstrucción de contenido perdido, costes estimados o agregados entre propietarios |

No se añadieron endpoints, DTO, migraciones ni políticas de adquisición. Los adaptadores locales son de presentación: selección de medidas, estados de lectura, tiempos civiles de Madrid y resultado de ejecución sin resolver.

## Implementación

- Sistema visual limitado a `.dashboard-shell` y `.dashboard-dialog`: ambas paletas, Geist y tema del sistema. Shell de 232 px, header de 64/56 px, controles locales Radix, iconos Lucide y foco visible. La interfaz oficial de EVE y su CSS global no cambian.
- Una sola superficie **Data timing** separa lectura de vista, observación, incorporación, estado de workers y caducidad de la ventana. El header toma `readAt` de una respuesta válida de la vista principal, nunca el instante del intento o el endpoint de status. Los lectores secundarios conservan sus propios estados y tiempos.
- Los ritmos existentes se conservan: status a 3 s, evidencia dinámica a 15 s, conversaciones activas a 3 s, heartbeat visible a 60 s y páginas/referencias sin polling periódico. Pausar aborta solicitudes y detiene renovación; no promete cancelar el proveedor ni detener inmediatamente ingestión.
- Overview coloca primero los cuatro valores y cobertura; M4 muestra incluidos/observados. Las definiciones pasan a sheets accesibles. La disponibilidad por producto no se convierte en cobertura de ciudad. El gráfico completo de actividad aparece solo en Activity.
- Mobility comparte identidad entre filas, marcadores y evidencia/histórico. La lista incluye entidades sin coordenadas; el mapa es una lectura independiente por viewport, con conteo propio. Sus tiles siguen siendo raster anónimo de OSM, con atribución y origen fijo. Filtros no espaciales y selección no ejecutan herramientas.
- Queries agrupa las 16 herramientas por propósito y mantiene inspector de escritorio y enlaces nativos. **Stored evidence** y **Run query** son modos separados. Schema, efectos declarados, confirmación, límites, cancelación y request IDs permanecen. Una ejecución pendiente/desconocida bloquea repetición y conserva su ID por herramienta dentro de la identidad del dashboard; inspeccionar no borra esa recuperación.
- Sources no muestra grupos vacíos ni métricas aparentemente válidas tras fallar la primera lectura. Un fallo de refresh conserva datos y el `readAt` de su éxito. Fallos de lectura de workers tienen su propia frontera, sin invalidar evidencia de proveedores. La mediana usa las muestras disponibles; solo p95 exige al menos 20.
- Activity conserva instantes UTC en transporte y muestra Europe/Madrid. El formulario rechaza horas locales inexistentes, pide offset en horas ambiguas y aplica filtros mediante Apply/Cancel. Las barras tienen escala, controles de intervalo con teclado y tabla exacta; los huecos no son cero.
- My conversations ofrece Open chat cuando una lectura válida está vacía, sesiones/detalle en escritorio y rutas móviles. Timeline, Tools y Usage conservan lifecycle, cobertura, redacción, truncado y ownership. Caché y razonamiento son subconjuntos, no sumandos adicionales.
- Al revocar o cambiar identidad se abortan lectores, se limpian cachés/recuperaciones y se desmontan detalles privados antes de redirigir. Cancelar una consulta ya no utiliza ese borrado de identidad.

## Investigación de Sources

La lectura autenticada existente pasa en PostgreSQL/HTTP aislados. **El fallo de la instalación mostrado en la auditoría no se ha reproducido ni se le atribuye una causa upstream.** No se modificaron SQL, deadlines, validación ni autenticación para hacerlo desaparecer.

Se demostró y corrigió otro defecto concreto: el render antiguo interpretaba ausencia de respuesta como grupos vacíos. La reproducción retenida induce fallo en el mismo GET autenticado y mantiene status independiente. Hay escenarios de primera lectura fallida, refresh fallido con caché, fuentes fallidas con señal de worker correcta y fallo de lectura de worker con evidencia de fuente conservada.

## Validación ejecutada

| Verificación | Resultado |
| --- | --- |
| Utilidades del handoff, compiladas estrictamente | 30 checks; incluyen 100 casos deterministas de geometría de treemap. No se importó ese gráfico opcional a la aplicación |
| Adaptadores/componentes | 17 tests, incluyendo cero/desconocido, estados de lectura, frontera de worker, DST y bloqueo de ejecuciones sin resolver |
| `pnpm check` | Lint, límites de arquitectura, typecheck, tests y build correctos: 491 tests pasan, 99 omisiones opt-in informadas; tres advertencias de `!important` usadas para reduced motion |
| PostgreSQL opt-in aislado | 26 tests en tres suites; esquemas propios eliminados tras la prueba |
| HTTP autenticado con `--synthetic-only` | 36 checks; adquisición/modelo deshabilitados y guard de red externo sin intentos bloqueados |
| Navegador, escenarios adicionales | 35 comprobaciones correctas. Resultado y capturas en [evidencia](assets/core-dashboard/redesign-2026-10-03/README.md); fallos inducidos y ejecución desconocida son mocks explícitos de QA, no evidencia de proveedores |
| Matriz visual | Seis vistas × dos temas × seis tamaños: 72 capturas, sin overflow de documento ni violaciones axe detectadas |
| Dependencias | Diff de manifests/lockfile vacío. `pnpm audit --audit-level=high` sigue encontrando un high en `braces` a través de Vercel; no se cambió ni relajó el gate |

Los tamaños son 1440×1000, 1280×800, 1024×768, 768×1024, 390×844 y 320×720. En 1440×1000 los KPIs comienzan en y=176 y el workspace de Mobility en y=360. Las herramientas de axe dejan verificaciones incompletas, conservadas en el informe; cero violaciones detectadas no implica aceptación de accesibilidad completa.

Se ejercitaron foco/escape/restauración, navegación móvil, portal en ambos temas, reduced motion, Apply/Cancel, zoom del mapa, gráfico con teclado, horas DST, caché fallida, recuperación de ejecución desconocida, tokens por subconjunto y retirada de acceso. Las comprobaciones HTTP/SQL anteriores conservan ownership, cursor/revisión, ventanas históricas, captura parcial y contratos de ejecución. El guard y la inspección de requests verifican que navegación, filtros, mapa y gráfico no despachan ejecución de herramientas.

### Comprobaciones no realizadas o limitaciones

- **No se ejecutó una combinación real de lector de pantalla y navegador.** Sigue pendiente aceptación manual.
- Se comprobó CSS zoom 200% adicional con reflow, foco y axe; **no es una prueba del control nativo de zoom del navegador**. Esa comprobación manual sigue pendiente.
- El fallo original de Sources en la instalación habitual permanece sin reproducción ni causa demostrada; no se afirma que su causa esté corregida.
- No hubo proveedor/modelo real, benchmark OTP, despliegue, instalación habitual ni integración de PR. T10 no está implementado.
- La CI mantiene el bloqueo de seguridad de dependencias separado. Esta acta **no declara merge readiness**.

## Reproducir

```sh
pnpm check
RUN_DASHBOARD_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run \
  apps/mobility-core/src/dashboard/foundation.integration.test.ts \
  apps/mobility-core/src/dashboard/independent-review.integration.test.ts \
  apps/mobility-core/src/observability/dashboard.integration.test.ts
node --env-file=.env.local scripts/test-dashboard-local.mjs --preview --synthetic-only
```

Con el proceso aislado activo, ejecutar en otra terminal, de forma secuencial y con el binario instalado de agent-browser 0.38.2:

```sh
AGENT_BROWSER_BIN=/ruta/a/agent-browser node scripts/audit-dashboard-redesign-interactions.mjs
AGENT_BROWSER_BIN=/ruta/a/agent-browser node scripts/audit-dashboard-redesign.mjs
```

Al terminar, enviar SIGINT/SIGTERM al proceso de QA: detiene sus servidores y elimina únicamente su esquema. La baseline anterior usó el modo existente que copia evidencia pública retenida y añade fixtures sintéticos; la validación final utiliza `--synthetic-only` para no depender de esa evidencia pública variable.
