# R2.1 — Historial de conversaciones

[Índice de la wiki](../index.md) · [Archivo de plans](index.md) · [Estado vigente](../roadmap.md)

> **Plan histórico · 28/09/2026.**

Fecha: **28/09/2026**. Estado: **implementado y comprobado localmente**. [Evidencia e integración](../acceptance/2026-09-28-conversation-history.md).

Este documento conserva las instrucciones aprobadas de R2.1 del [roadmap local](../roadmap.md). Pertenece a la experiencia de evaluación R2; no depende de terminar las ampliaciones de fuentes R1. Las instrucciones siguientes describen el alcance ejecutado; el estado y los resultados están en la evidencia de entrega.

## Índice interno

- [Objetivo y alcance cerrado](#objetivo-y-alcance-cerrado)
- [Instrucciones de implementación, en orden](#instrucciones-de-implementación-en-orden)
- [Fuera de este bloque](#fuera-de-este-bloque)
- [Pruebas necesarias y suficientes](#pruebas-necesarias-y-suficientes)
- [Entrega y criterio de cierre](#entrega-y-criterio-de-cierre)
- [Archivos de referencia](#archivos-de-referencia)


## Objetivo y alcance cerrado

Permitir que un evaluador encuentre sus conversaciones anteriores, las reabra en el chat oficial de EVE y cree una nueva. Nada más.

- Un acceso **«Mis conversaciones»** disponible tras autenticarse, tanto desde una pantalla vacía como desde un chat.
- Lista de conversaciones propias accesibles, ordenada por **fecha de creación**, más recientes primero. Mostrar fecha/hora local y una etiqueta determinista; no presentarla como fecha de última actividad.
- Veinte resultados por página y **«Cargar más»** cuando corresponda. Estados de carga, lista vacía y error con reintento explícitos; un error no se muestra como una lista vacía.
- Abrir un elemento navega a `/s/{sessionId}` y usa la recuperación existente de EVE. **«Nuevo chat»** conserva `/s` y no crea una sesión hasta que el usuario envía un mensaje.
- Continuar una conversación utiliza los controles nativos existentes. Abrir el historial no envía mensajes, reanuda turnos detenidos ni aprueba límites automáticamente.

## Instrucciones de implementación, en orden

### 1. Conservar la base existente

- Leer `AGENTS.md`, el roadmap y este documento. Mantener los cambios documentales pendientes en `alanslzrr/conversation-history-roadmap`; no descartarlos ni empezar desde un `main` que todavía no los contenga.
- Reutilizar EVE instalado y `useEveAgent({ initialSession, resume })`. No actualizar EVE/AI SDK ni sustituir componentes del chat.
- `evaluation_session` ya guarda `session_id`, propietario, `created_at`, `expires_at` y `revoked_at`. Usar esa tabla como índice; los mensajes siguen perteneciendo a EVE. No añadir una tabla de mensajes, migración ni copia del contenido para este alcance.

### 2. Añadir el listado autenticado

- Añadir `GET /api/evaluation/conversations` en Web, siguiendo los controles de origen, `readIdentity` y `coreAccess` existentes. No aceptar un propietario indicado por el navegador.
- Extender la API interna de evaluación de Core con una acción `list_sessions`; conservar su autenticación de servicio y scope. El propietario procede de la identidad Better Auth resuelta por Web, nunca de parámetros públicos.
- Core comprueba evaluador activo y filtra en SQL por propietario, `revoked_at IS NULL` y `expires_at > now()`. No obtener todas las sesiones para filtrarlas en el navegador.
- Responder únicamente con `sessionId`, `createdAt`, `expiresAt` y `nextCursor`. Orden estable por `created_at DESC, session_id DESC`; página fija de veinte elementos y cursor validado. Sin conteo global ni contenido de mensajes.
- Definir el contrato Web/Core en `packages/contracts`. Web no importa clientes de base de datos ni implementación de Core.
- Usar `Cache-Control: no-store` y peticiones sin caché. La lectura no consume cuotas de generación, renueva accesos ni activa ingestión; no llama al modelo, MCP de movilidad ni proveedores.

### 3. Integrar una navegación mínima en EVE

- Añadir el acceso y una lista/panel con las primitivas visuales ya instaladas. Mantener layout, tema, renderizado de mensajes, composer, streaming y controles de límites del chat oficial.
- No cargar mensajes de todas las conversaciones para dibujar la lista. Etiqueta local sencilla, por ejemplo **«Conversación · 28 sep, 18:40»**; no generar títulos con el modelo.
- Consultar al abrir el panel y al cargar otra página; sin polling. Al volver a abrirlo debe aparecer cualquier sesión registrada entretanto, sin duplicados.
- Abrir/cerrar el panel no desmonta ni interrumpe el chat activo. Cambiar de conversación usa las URLs existentes, sin reenviar mensajes ni mezclar estados de distintas sesiones.
- Limpiar el estado del listado al cerrar sesión o cambiar de usuario; una respuesta tardía de una petición anterior no debe repoblarlo.
- Documentar esta adaptación mínima en `apps/eve-web/vendor/eve/README.md`.

### 4. Respetar disponibilidad y acceso

- Mantener los siete días de autorización por defecto. No ampliar plazos ni restaurar sesiones revocadas. Indicar en la lista que solo aparecen conversaciones con acceso vigente.
- Al abrir una URL, seguir autorizando la sesión en el canal EVE. La lista no sustituye ese control; debe resistir URLs manipuladas y sesiones revocadas después de listar.
- Si la sesión no existe en EVE o ya no es accesible, mostrar **«Esta conversación no está disponible»**, con retorno al listado/nuevo chat. No revelar si pertenece a otra persona ni crear silenciosamente una sesión sustituta.
- No confundir la caducidad de acceso con los límites de ejecución de EVE. Conservar las opciones nativas de continuar/detener; no prometer retención ilimitada ni lectura después de borrar el almacenamiento del runtime.

## Fuera de este bloque

Sin búsqueda, carpetas, favoritos, renombrado, borrado, archivado, exportación, resúmenes ni memoria entre chats. Sin nuevos SDK, servicios o infraestructura. Sin cambios de modelo, E2, políticas de retención, herramientas MCP, fuentes, ingestión o routing; no sustituir Better Auth ni relajar sus controles. Sin rediseño del chat, despliegue cloud, benchmarks ni campañas conversacionales.

## Pruebas necesarias y suficientes

Usar el entorno de pruebas existente y datos aislados; no crear otra plataforma de validación ni consumir créditos para demostrar una lista.

1. **Listado y aislamiento:** dos evaluadores, uno sin sesiones; solo se devuelven las propias vigentes. Evaluador deshabilitado/vencido, sesiones revocadas/vencidas y peticiones sin autenticación/origen permitido quedan excluidos o rechazados. La URL de otro usuario sigue denegada.
2. **Paginación y lectura:** más de veinte sesiones, fechas iguales y cursor inválido; orden estable, sin duplicados, tamaño acotado y error explícito. Comprobar que listar no modifica cuotas/actividad/caducidad ni inicia generación.
3. **UI y recuperación:** lista vacía, carga, error/reintento, reapertura de conversación y recarga de su URL conservando mensajes; nuevo chat; sesión no disponible; logout y cambio de usuario sin datos residuales. Panel usable con teclado y en pantalla estrecha, sin romper streaming/composer. Usar sesiones existentes autorizadas o fixtures aisladas, sin inferencias nuevas.
4. **Regresión habitual:** ejecutar `pnpm check` antes de push y `pnpm build:agent` si se modifica código del agente/canal. Probar la consulta SQL con PostgreSQL aislado. No repetir smokes de OTP/fuentes ni reabrir entregas cerradas por este cambio.

## Entrega y criterio de cierre

- Commits pequeños Conventional Commits y PR con alcance y pruebas efectivamente ejecutadas; respetar las convenciones del repositorio. No marcar el bloque completado por tener únicamente una propuesta o mock visual.
- Para declarar **implementado**: listado real, recuperación de conversaciones y aislamiento verificados, pruebas anteriores aprobadas y adaptación EVE documentada.
- Para declarar **entregado localmente**: cambios integrados en `main`, CI correcto y runtime habitual actualizado mediante el procedimiento existente; comprobación breve de login → listado → abrir chat. No reiniciar OTP ni reimportar datos por este bloque. Integración e instalación corresponden a la entrega de la implementación, no a esta planificación.
- Actualizar R2.1 y dejar una nota breve con comandos/resultados, límites y estado de integración/runtime. No afirmar que R1/R2 completos están cerrados por entregar este listado.

## Archivos de referencia

- `apps/eve-web/app/_components/agent-chat.tsx` y `app/s/[sessionId]/page.tsx`: UI y recuperación nativas.
- `apps/eve-web/app/evaluation/evaluation.tsx`: acceso y logout.
- `apps/eve-web/src/evaluator-auth.ts`, `evaluation-guard.ts` y `app/api/evaluation/route.ts`: puente autenticado y ownership del canal.
- `apps/mobility-core/src/evaluation.ts` y `app/internal/evaluation/route.ts`: autorización y operaciones internas.
- `infra/postgres/migrations/0003_evaluation_access.sql`: índice de sesiones y caducidad existentes.
- `apps/eve-web/src/evaluation-guard.test.ts` y `evaluator-auth.test.ts`: patrones de pruebas existentes.
