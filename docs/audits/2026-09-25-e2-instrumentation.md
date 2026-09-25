# E2 — presupuesto conversacional: implementación y aceptación offline

**Revisión posterior:** [check estándar limpio y tres hallazgos reproducidos](2026-09-25-e2-review.md). Este documento conserva la evidencia inicial; no implica que E2 esté listo para integrar.

**Estado:** implementación local y pruebas sin gasto completadas. La aceptación
conversacional real T01–T13 queda pendiente: el usuario confirmó **«Solo pruebas
sin gasto por ahora»**. No se ha activado una campaña ni llamado al proveedor.

## Separación de E1

E1 se guardó antes de E2 en `ad2f711`, `88fbf80`, `584212d`, `f763407`,
`a49c9bd` y `ddaaa1e`. E2 parte de `ddaaa1e` en
`alanslzrr/conversation-budget`. No hay merge a main, push, despliegue ni reinicio
del runtime habitual. La migración 0008 solo se probó en esquemas temporales.

## Flujo y límites efectivos

1. Better Auth sigue autenticando el canal oficial EVE. Un hook usa la identidad
   verificada para registrar/comprobar propiedad de la sesión en Core; resuelve
   la carrera con el registro posterior a la respuesta de creación.
2. Cada intento HTTP del SDK solicita una reserva nueva por el canal interno de
   evaluación, protegido con `mobility.evaluation.manage`. Web no importa DB.
3. Core bloquea la fila de campaña y comprueba evaluador, propietario, revocación,
   vencimiento, concurrencia y presupuesto acumulado antes de concederla.
4. Se cuenta el contexto real en Responses `input_tokens`, incluidos instrucciones,
   herramientas y formato. Si no cabe, no se envía inferencia. No se estima el
   presupuesto con caracteres ni se usa una pasarela.
5. Core autoriza un único dispatch. El transporte fuerza `gpt-6-luna`, `store:false`
   y `max_output_tokens` dentro de la reserva. No permite endpoints alternativos,
   redirects, herramientas alojadas, estado remoto previo ni background.
6. JSON y SSE reconcilian input/output/cache con uso reportado. Cancelaciones,
   errores ambiguos y ausencia de uso retienen reserva y slot; no caducan para
   devolver crédito. Un uso superior a la reserva bloquea la campaña.

| Ámbito | Techo de seguridad implementado |
| --- | --- |
| Campaña | Deshabilitada/sin fila por defecto; aprobación, caducidad y límites explícitos. Máximo 100.000 input / 10.000 output / 30 reservas |
| Evaluador | Comparte el presupuesto global; una reserva no resuelta simultánea, incluso entre sesiones |
| Sesión | 100.000 input / 10.000 output, 30 reservas y 30 min desde primera reserva; persiste entre campañas |
| Turno | 50.000 input / 4.096 output, 8 reservas, índices de paso 0–7; ventana de admisión de 90 s |
| Intento | Hasta 20.000 input / 2.048 output; timeout ≤60 s, reducido por la ventana del turno y caducidad de campaña |
| Reintentos | Máximo dos reservas por paso y propósito; consumo ambiguo bloquea cualquier nuevo intento de ese evaluador |
| Concurrencia | Máximo cinco reservas no resueltas globales y una por evaluador/sesión; se reduce si falta presupuesto |
| Herramientas | Cuatro por lote, dieciséis por turno; input 8 KiB aproximados (8.192 bytes), resultado 32.000 bytes |
| Búsqueda | Tras dos búsquedas sin herramientas descubiertas se rechaza una tercera, también en lote |
| Repetición | Dos resultados idénticos para la misma entrada bloquean otra repetición inmediata; se permite refrescar tras 30 s o en otro turno |

Estos techos **no autorizan gasto**. No existe acción HTTP/model-facing para
habilitar campañas, subir límites ni renovar el global. La aprobación de
continuidad de EVE no modifica el ledger. Los límites nativos EVE se conservan
como defensa adicional, no como control global.

Los 90 s son una ventana para admitir inferencia y su deadline, no una promesa
sobre la finalización de cualquier herramienta externa ya iniciada. Los límites
de herramientas se aplican mediante hooks de acciones; no se reemplaza la UI.

## Medición antes de optimizar

- `mobility.conversation.metric`: turno, sesión, paso, uso reportado, caché,
  estado final y tiempos. Se prefiere el timestamp durable de EVE al de recepción
  para no medir latencia de replay como latencia del turno.
- `mobility.context.metric`: bytes del payload realmente construido por el SDK,
  instrucciones, catálogo, entradas y resultados; detección positiva de JSON
  duplicado entre `content` y `structuredContent`, sin asumir que siempre ocurre.
- `mobility.tool.metric`: nombre, bytes de resultado y de sus dos representaciones,
  estado y correlación con turno/sesión. Nunca se registran sus contenidos.
- `conversation_budget_report`: agregados persistentes por campaña/evaluador/
  sesión/turno, reservas, conteos autorizados, respuestas confirmadas, pendientes,
  compactaciones, pasos, tokens reportados/cargados y latencia de intentos.
- `pnpm budget:report`: lectura local, sin modelo, de esos agregados.

**Diferencias importantes:** los intentos autorizados son un límite superior si
un proceso cae entre autorización y envío. Los desconocidos no son cero. Los
tokens reservados/cargados no se presentan como lecturas reales. Caché de lectura
es subconjunto de input; no se suma de nuevo. Responses no informa aquí escrituras
de caché, por lo que no se inventan. La suma de duraciones de intentos/turnos no
es duración de pared de toda la sesión. No se calcula factura monetaria.

Fuente del preflight: [API oficial de conteo de tokens](https://developers.openai.com/api/docs/guides/token-counting).
No se ejecutó ese endpoint en vivo. La compatibilidad real con el modelo y los
contextos T01–T13 se verificará únicamente con autorización posterior.

## Compactación con evidencia conservada

La memoria oficial EVE conserva una cápsula literal, privada a principal+sesión,
fuera del texto que resume el modelo. Retiene entradas de usuario, textos visibles,
llamadas y resultados de herramientas; no conserva razonamiento privado. No
intenta adivinar destinos, resolver fechas relativas ni reescribir incertidumbre.

Antes del checkpoint se captura evidencia en estado durable EVE; después se
recupera con identidad estable. Repetir la misma operación es idempotente.
Se permiten como máximo treinta operaciones de compactación por sesión.
Se mantienen correcciones contradictorias en orden, incluidas preferencias que
vuelven a un valor anterior. No se deduplican mediante un conjunto global.
La cápsula tiene límite de 64.000 bytes; si no cabe, se aborta **antes** de cambiar
el historial. Por tanto no se promete que cualquier conversación pueda compactar.

Las pruebas comprueban lugares/IDs, accesibilidad, distancias, fecha/hora/zona,
fuente, observación frente a ingesta, `stale`, plazas desconocidas y ausencia de
evidencia. Un resumen simulado que inventa cero plazas no reemplaza esos datos.
Esto acredita conservación estructural offline, **no** exactitud semántica del
modelo real: esa comprobación pertenece a la campaña pendiente.

## Validación realizada

- Suite offline: **181 pruebas aprobadas**; doce pruebas DB se omiten en la suite
  por defecto para que funcione sin credenciales.
- `pnpm test:budget:db`: **12 pruebas aprobadas** con PostgreSQL local y esquemas
  temporales eliminados. Incluye 20 admisiones concurrentes→una reserva de sesión,
  cinco evaluadores, límites global/turno/sesión, replay, pérdida de uso, revocación,
  reconexión de cliente y lectura del informe. No equivale a cinco usuarios EVE.
- Lint, límites arquitectónicos y TypeScript aprobados.
- `pnpm build:agent` aprobado con Docker local; build de Core aprobado.
- Build Web con `next build --webpack` aprobado como diagnóstico, **sin cambiar
  el bundler configurado**.
- `pnpm check` no termina verde: Turbopack falla al abrir el puerto de su worker
  CSS (`Operation not permitted`), también al reintentar con permisos elevados.
  No se oculta este resultado tras el build alternativo.
- Cero inferencias, cero pruebas conversacionales pagadas, ninguna campaña real.

## Operación posterior, separada de esta entrega

1. Integrar/revisar la rama y resolver la ejecución de Turbopack en el entorno.
2. Aplicar migración 0008 en local y reconstruir/reiniciar explícitamente el runtime.
   No hay campaña activa por defecto: el agente nuevo rechazará inferencia sin ella.
3. Obtener autorización de una campaña con límites y caducidad; un operador la
   registra en Core. No restaurar reservas desconocidas sin reconciliación.
4. Ejecutar T01–T13 aislados y continuos, comparar precisión antes/después de
   compactación y revisar el informe. No elevar límites para conseguir que pase.

## Estado tras correcciones de revisión

Los tres bloqueos de revisión están corregidos; ver [resoluciones, pruebas y transición](2026-09-25-e2-review.md#4-correcciones-aplicadas-y-preparación-de-e3). Estado vigente: 182 pruebas offline, 17 DB aisladas y check estándar aprobados. E3 puede iniciarse sin gasto; aceptación conversacional E2 pendiente. La migración aditiva 0009 conserva violaciones de presupuesto; no se ha aplicado al runtime habitual.
