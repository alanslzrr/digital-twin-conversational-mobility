# E3 — Continuidad de la ingestión existente

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Entrega local del 25/09/2026. E2 permanece cerrado. No se reemplaza el scheduler ni se modifican EVE, modelo, autenticación o proveedores.

## Cambios funcionales

- Los dos carriles del worker avanzan independientemente: cada petición procesa un job vencido, con pausa de 5 s entre peticiones del mismo carril. La selección usa `next_due_at`, no un orden fijo de fuentes. Una fuente lenta no impide que el otro carril siga trabajando.
- El tick manual (`pnpm ingest`) conserva dos carriles y procesa la cola vencida una vez. No se reproducen todos los intervalos perdidos durante suspensión o desconexión.
- La recuperación reutiliza los leases de 90 s, la ventana de actividad, el backoff y la deduplicación existentes. El read-through usa la misma adquisición atómica. Un propietario cuyo lease venció no puede publicar datos **ni** cambiar salud/backoff con un error tardío.
- La activación explícita del worker se envía una sola vez, incluso si se pierde la respuesta. No se renueva automáticamente la ventana durante reintentos.
- Migración aditiva `0010_ingestion_continuity.sql`: último inicio/fin, contadores de intentos y leases recuperados, etapa del error y heartbeat por carril. Salud expone duración del último intento terminado, lease, próximo vencimiento y fallos.
- `get_source_health` diferencia estado de ejecución, ventana, heartbeat y frescura. `stopped_or_unreachable` significa ausencia de heartbeat durante más de 120 s; no permite afirmar si murió el proceso o falló la comunicación. Los errores de almacenamiento no se atribuyen al proveedor. Datos antiguos siguen siendo antiguos aunque el fetch termine correctamente.
- Retención existente: carril 0 intenta limpieza como máximo una vez por minuto durante actividad; tick manual también limpia. No hay otro scheduler ni polling de proveedores fuera de ventana.

## Verificación ejecutada

- `pnpm check`: lint/boundaries, tipos, 190 pruebas offline y builds. El build de EVE sin cambios reutilizó caché de Turbo.
- Nueve regresiones con PostgreSQL local, esquema y raw temporales eliminados al terminar; proveedores simulados, sin solicitudes externas:
  1. Fuente bloqueada mientras el otro carril publica.
  2. Dos consumidores, lease vencido tras interrupción, una sola adquisición y ningún replay de intervalos atrasados.
  3. Ventana inactiva: heartbeat sin fetch ni renovación.
  4. Error de conexión, backoff y recuperación; sin duplicar raw/histórico idénticos.
  5–6. Resultado correcto/error con lease vencido: rechazo y recuperación por siguiente propietario.
  7. Datos antiguos: estado degradado, no live.
  8. Fallo de disco raw: sin publicación, etapa identificada y recuperación.
  9. Fallo dentro de publicación: rollback, error saneado y reintento idempotente.

Reproducción (requiere PostgreSQL local existente, no credenciales de proveedores):

```sh
RUN_INGESTION_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/ingestion.integration.test.ts
```

Las pruebas reproducen los estados persistidos de interrupción y recuperación; no se suspendió físicamente el ordenador ni se reiniciaron servicios habituales. No son una campaña de disponibilidad ni una medición de SLO.

## Integración pendiente (E8)

La migración solo se aplicó en el esquema desechable de las pruebas. Antes de usar este Core/worker en el runtime habitual: parar ambos, aplicar migraciones pendientes con `pnpm db:migrate`, construir y arrancar mediante el runbook. No iniciar el worker nuevo contra un Core antiguo: este no entiende la selección por carril. Para volver al código anterior, parar ambos y restaurar los builds anteriores; las columnas/tablas aditivas pueden permanecer.

Sin push, PR, merge, actualización del runtime habitual, consumo de modelo o despliegue. La siguiente funcionalidad es E4 (identidad de líneas y destinos), no otra campaña E2.
