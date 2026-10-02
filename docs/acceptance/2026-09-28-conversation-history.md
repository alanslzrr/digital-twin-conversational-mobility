# R2.1 — Historial de conversaciones

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Fecha: **28/09/2026**. **Implementación y funcionamiento local comprobados**; integración/CI trazables en la [PR #28](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/28). No cierra el resto de R1/R2.

## Alcance entregado

- Mis conversaciones desde chat vacío o existente: fecha/hora local de **creación**, orden descendente estable, veinte resultados y Cargar más.
- Core consulta `evaluation_session` con propietario/evaluador vigente y sesiones no revocadas/no caducadas. Contrato solo `sessionId`, `createdAt`, `expiresAt`, `nextCursor`; sin mensajes ni conteos globales.
- Web resuelve Better Auth, rechaza parámetros de propietario/origen indebido y usa autenticación interna existente. Lecturas sin caché, cuotas, renovación, ingestión ni proveedores.
- Diálogo con componentes instalados; no desmonta el chat al abrir/cerrar. Reabrir refresca el índice; cierre/logout abortan consultas; cambio de identidad remonta el estado propio. Sin polling.
- `/s/{sessionId}` recupera mensajes mediante EVE. `/s` no crea sesión al abrir. Acceso al canal sigue verificando ownership; una lista anterior no concede permisos.
- Recuperación vacía o fallida sin mensajes: «Esta conversación no está disponible», sin composer/sesión sustituta. EVE puede devolver un stream vacío satisfactorio cuando no conserva esa sesión; no basta comprobar HTTP/error.

## Verificación ejecutada

- `pnpm check`: **312 pruebas offline aprobadas**, 53 opt-in omitidas; lint, fronteras, typecheck y builds Core/Web correctos.
- `RUN_CONVERSATION_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/conversations.integration.test.ts`: **2 pruebas PostgreSQL aprobadas**, esquema temporal eliminado. 45 sesiones con fecha idéntica, separación de propietarios, revocadas/caducadas, evaluador deshabilitado/vencido, paginación y ausencia de mutaciones.
- `pnpm build:agent`: correcto; sin cambiar agente/canal/modelo.
- `pnpm smoke:evaluation` **sin flags live**: login real de dos evaluadores temporales, listado20+6, aislamiento, cursor inválido, propiedad no inyectable, cuotas/ventana/caducidad idénticas antes/después de listar; controles existentes de revocación/logout. Fixtures eliminadas.
- Navegador sobre runtime compilado: listado real de cuatro conversaciones propias; recuperación de conversación EMT existente, recarga de URL y apertura/cierre del panel conservando mensajes. No se enviaron mensajes ni aprobaciones.
- Evaluador UI desechable: páginas20+5, nueva identidad sin sesiones del usuario anterior; sesión indexada pero ausente en EVE muestra no disponible; vaciado de fixtures y reapertura muestra lista vacía; Nuevo chat conserva `/s`, sin registros nuevos de sesión/cuota; logout elimina controles privados. Cuenta/filas temporales eliminadas.
- Error de servicio/reintento comprobados durante la parada/reinicio local: error explícito, no lista vacía; reintento recupera datos.
- Pantalla375px y teclado Escape: panel legible, controles accesibles, foco devuelto al disparador y conversación conservada.
- `git diff --check`: correcto. **Sin nuevas inferencias**, sin benchmarks/OTP/fuentes ni campaña general. No se ensayó un turno nuevo en streaming: su implementación y controles nativos no cambian.

## Precisión, límites y operación

- Cursor conserva microsegundos UTC. `postgres.js` serializa parámetros timestamptz mediante Date y perdería precisión; `text::timestamptz` evita saltos de página. Regresión comprobada en PostgreSQL real.
- Autorización habitual: siete días, sin ampliación ni restauración. El índice no garantiza conservación de mensajes en EVE. Sesiones vacías de pruebas también se muestran no disponibles; el flujo UI normal crea sesión al enviar el primer mensaje.
- Sin migraciones ni nuevos SDK/dependencias externas. Solo enlace workspace al contrato compartido.
- Runtime Core/Web/EVE/worker recompilado/reiniciado mediante procedimiento existente. PostgreSQL y OTP permanecen; no reimportar catálogos/grafo para esta entrega. Tras actualizar producción local, cerrar pestañas con chunks antiguos y volver a abrir `/s` si la recarga conserva un error de recursos.
- Sigue pendiente el resto del roadmap aprobado; no se añaden búsqueda, títulos, carpetas, exportación ni cambios de retención.
