# Panel de Core y telemetría propia · 02/10/2026

[Índice](../index.md) · [Actas](index.md) · [Alcance](../roadmap.md) · [Spec](../plans/2026-10-02-core-dashboard.md) · [Uso](../user-guide.md#panel-privado) · [Referencia](../reference/system.md#panel-y-telemetría)

## Resultado

Seis vistas privadas y detalles, mapa OpenStreetMap opcional, catálogo de 16 herramientas compartido con MCP, inspector almacenado y ejecución manual idempotente. Login y ownership Better Auth existentes. Captura efectiva de intentos y hooks EVE, sink interno best-effort, eventos operativos posteriores a publicación y retención acotada hasta siete días. No se importan métricas históricas ni stdout anterior.

La entrega es código y validación local aislada. Los servicios habituales 3000/3001 y su base de datos no recibieron la migración 0021 ni el token ampliado. La [instalación del panel](../local-runtime.md#actualizar-el-panel) requiere autorización del responsable. No hubo despliegue cloud, llamadas al modelo, nueva adquisición de proveedores, reconstrucción OTP ni benchmark.

## Verificaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `pnpm check` | Correcto: lint/boundaries, TypeScript, 460 tests aprobados y 89 omitidos por flags de integración, builds Web/Core. |
| `pnpm build:agent` | Correcto: agente EVE compilado con hooks y captura efectiva. |
| PostgreSQL afectado con flags explícitos | 70 tests aprobados en 10 archivos; 21 migraciones aplicadas en esquemas aleatorios aislados. |
| Smoke HTTP autenticado Web → Core | 20 comprobaciones aprobadas con dos cuentas sintéticas, puertos 3002/3003 y adquisición/modelo deshabilitados. |
| `git diff --check` | Correcto. |
| Referencias documentales locales | 461 rutas/anclas verificadas, sin fallos. |
| Navegador | Login existente, chat vacío EVE, seis vistas, filtros BiciMAD/detalle, mapa, inspector y manual almacenado, fuente/gate, feed vacío, resumen/payload propio, pausa, móvil, logout/cambio de cuenta y error Core. |

Comando PostgreSQL ejecutado:

```sh
RUN_DASHBOARD_DB_TESTS=1 RUN_GEOCODE_DB_TESTS=1 RUN_INGESTION_DB_TESTS=1 RUN_EMT_DB_TESTS=1 RUN_WEATHER_DB_TESTS=1 \
node --env-file=.env.local node_modules/vitest/vitest.mjs run \
  apps/mobility-core/src/observability/dashboard.integration.test.ts \
  apps/mobility-core/src/dashboard \
  apps/mobility-core/src/{geocoding,ingestion,emt-arrivals,weather-cache}.integration.test.ts
```

Smoke repetible, tras build, con puertos 3002/3003 libres:

```sh
node --env-file=.env.local scripts/test-dashboard-local.mjs
```

El arnés crea únicamente un esquema `dashboard_qa_<uuid>`, aplica migraciones, copia snapshots públicos retenidos y crea dos cuentas sintéticas. No copia usuarios ni secretos. Emite resultados sin cookies/tokens; elimina su esquema y termina los procesos al salir. `--preview` conserva el entorno para QA hasta SIGTERM/SIGINT. No instala datos ni cuentas sintéticas en el producto. Los esquemas temporales de esta validación se eliminaron.

### Seguridad, consistencia y captura

- Tests de proyección: canaries en claves desconocidas, cabeceras, auth, reasoning cifrado, JSON opaco y textos; límites estructurales sin cortar JSON a mitad.
- Sink PostgreSQL: terminal sin inicial, deduplicación tardía/conflictiva, suma por intento, ownership, referencias ausentes sin FK rota, cap de contenido, retención y liberación de cuota.
- Contención SQL real: watchdog, timeout de sentencia, rollback y recuperación de conexión; no locks sobre tablas auth/presupuesto.
- Entidades: filtro previo a paginación, cursor firmado por propietario/filtros y conflicto 409 si cambia la revisión. Provenance por entidad, cero conservado y observación ausente no inventada.
- Manual: ejecutor compartido de `get_network_status`, requestId repetido conserva resultado e ID, entrada conflictiva rechazada y estado ajeno 404. Leer/inspeccionar no equivale a renovar actividad.
- Transporte mock: entrada efectiva, call IDs exactos, stream SSE dividido sin cambiar bytes, incomplete/failed, cancelación, uso cero frente a desconocido y sink rechazado sin repetir proveedor. Las pruebas descubrieron y corrigieron la clasificación de una respuesta `failed` con HTTP 200 y de una cancelación explícita de stream.
- Fake timers: mínimos 3/15/60 s, elegibilidad en foco, backoff/Retry-After, oculto/offline/pausa y teardown. Preview con ingestión deshabilitada no la habilita.
- HTTP: cuentas reales Better Auth del arnés, lecturas BFF, terminal/payload propio, denegación de resumen/eventos/payload/ejecución ajenos, anónimo 401 y origen cruzado 403.

## Evidencia visual

Capturas de evaluación local. `QA evaluator` y contenido conversacional **Synthetic isolated QA content** son fixtures explícitas; los puntos BiciMAD provienen de snapshots retenidos reales y se presentan antiguos, no live.

| Evidencia | Qué se verificó |
| --- | --- |
| [EVE vacío](assets/core-dashboard/eve-empty.jpg) | Chat oficial conservado; enlaces mínimos exteriores. |
| [Movilidad y mapa](assets/core-dashboard/mobility-dark.jpg) | Tema oscuro EVE, puntos retenidos, controles/filtros, tabla y atribución OSM. |
| [Manual almacenado](assets/core-dashboard/tool-execution.jpg) | Contrato, confirmación y resultado `succeeded` sin inferencia. |
| [Fuente AEMET](assets/core-dashboard/source-detail.jpg) | Campos técnicos y gate almacenado, ausencia explícita de recursos. |
| [Resumen/payload propio](assets/core-dashboard/conversation-payload.jpg) | Intento deduplicado, input 10/output 4/cache 2; payload saneado bajo demanda. |
| [Navegación móvil](assets/core-dashboard/mobile-navigation.jpg) | 390×844, diálogo con título/descripción, seis enlaces y cierre al navegar. |
| [Resumen móvil pausado](assets/core-dashboard/overview-mobile.jpg) | Misma familia visual, lectura pausada y estado de ingestión deshabilitada. |
| [Sin instrumentar](assets/core-dashboard/not-instrumented.jpg) | Segunda cuenta sin métricas inventadas ni contenido de la primera. |
| [Core no disponible](assets/core-dashboard/core-unavailable.jpg) | Error de transporte visible, sin datos rejuvenecidos ni fuente declarada caída. |

Consola sin errores/warnings durante los flujos sanos. El error de Core se provocó deteniendo únicamente el Core aislado. Se restableció/eliminó el entorno después. El mapa se visitó en una sola zona visible de Madrid, sin barrido automatizado, zoom repetido, precarga u offline; solicitudes estándar HTTPS sin identidad y atribución visible.

## Límites de la verificación

- No se ejecutó una conversación generativa real: transporte/cancelación/SSE se verificaron con mocks, no con gasto de modelo. No se afirma una comparación visual de todos los estados de streaming/aprobación del chat; su markup oficial permanece intacto.
- Evidencia archivada en oscuro y escritorio/móvil. No se archivó una captura equivalente en claro ni se alteró la preferencia de tema del usuario; el panel utiliza los tokens claro/oscuro y componentes existentes de EVE, sin selector propio.
- No se simuló fallo de teselas ni se realizó interceptación de teselas con un runner browser automatizado. El error de Core se verificó aparte. El fallback de tiles es independiente de la tabla por diseño.
- Los tests del sink demuestran deadlines bajo contención local, no garantía de captura exhaustiva ni SLA de red. Un arranque frío bajo tests DB simultáneos produjo una ejecución del smoke fallida; la repetición secuencial completa aprobó 20/20. El arnés limpió el esquema fallido.
- No se ejecutó rollback sobre el runtime habitual. Las migraciones aditivas se probaron aisladas; la reversión de código conserva las tablas 0021, según el procedimiento documentado.
- Fuentes muestran como máximo 100 recursos/cache por familia; el detalle legible muestra 20 y el DTO técnico conserva lo devuelto. Los topes no representan un inventario completo del proveedor.
- Lecturas caducadas se deniegan de inmediato; borrar físicamente exige mantenimiento activo. Las transcripciones EVE tienen una política distinta de estas trazas.
