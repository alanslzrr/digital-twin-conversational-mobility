# Cuentas, financiación y modelos

[Índice](index.md) · [Acceso y retención](evaluation.md) · [Arquitectura](architecture.md) · [Configuración](reference/system.md) · [Fuentes técnicas](resources/index.md#cuentas-y-llm-multiproveedor--08102026)

Core administra cuentas, secretos, destinos LLM y consumo. EVE conserva instrucciones, herramientas, compactación, historial y chat oficial. La migración 0022 prepara esta capa local; **no activa OCI, correo ni inferencias**.

## En esta página

- [Migrar una instalación](#migrar-una-instalación)
- [Roles y acceso](#roles-y-acceso)
- [Correo transaccional](#correo-transaccional)
- [Proveedores y modelos](#proveedores-y-modelos)
- [Credenciales y patrocinio](#credenciales-y-patrocinio)
- [Selección y continuidad](#selección-y-continuidad)
- [Contabilidad y errores](#contabilidad-y-errores)
- [Verificación y activaciones pendientes](#verificación-y-activaciones-pendientes)

## Migrar una instalación

Estos pasos requieren una ventana de mantenimiento y autorización del responsable. No forman parte de `pnpm check`.

1. Detén Web/Core/worker y respalda PostgreSQL según [operación local](local-runtime.md#respaldo-y-recuperación). Conserva por separado las claves de cifrado; un dump sin ellas no permite recuperar los secretos.
2. Instala el lockfile y aplica `pnpm db:migrate`. [0022](../infra/postgres/migrations/0022_accounts_llm_control.sql) conserva IDs, propietarios, slots históricos, sesiones y reportes; elimina la restricción de cinco slots y añade capacidad transaccional de 30 cuentas. No ejecuta migraciones durante el build.
3. Crea una clave maestra local fuera del repositorio mediante `pnpm accounts init-secret-store /ruta/privada/absoluta/mobai-master.key`. El comando no sobrescribe archivos y utiliza permisos 0600. Configura esa ruta en `MOBAI_SECRET_KEY_FILE`, únicamente en el entorno privado de Core. No sustituir una clave maestra existente: requiere recifrado coordinado, no una rotación de key LLM.
4. Mantén `MOBAI_LLM_ENABLED=false` y `MOBAI_EMAIL_ENABLED=false`. No copiar una antigua `OPENAI_API_KEY` a Web o a una financiación implícita. Los configuradores anteriores fallan sin leer claves. La importación de una credencial real será manual y explícita desde el formulario.
5. Ejecuta `pnpm accounts bootstrap tu-correo nombre` para el primer administrador. Si ese correo ya tiene cuenta, conserva su UUID e historial; no cambia su contraseña. Si es nuevo, queda pendiente sin contraseña. Nunca se promueve al primer registro automáticamente. Un administrador ya existente impide otro bootstrap.
6. Reconstruye Web/Core y agente. Un administrador existente puede iniciar sesión y completar TOTP en **Mi cuenta**. Las cuentas nuevas necesitan la activación por correo aprobada descrita abajo. No se imprimen enlaces ni contraseñas para saltarse ese paso.
7. Desde **Administración**, habilita perfiles, define capacidades y precios, invita cuentas y asigna financiación. Habilitar tráfico externo exige una decisión posterior e independiente.

La vuelta a código anterior **no revierte** el esquema. Restaura un conjunto coherente de aplicación, base y claves si fuera necesario. `pnpm accounts list` solo muestra metadatos; `recover-bootstrap <email>` únicamente encola recuperación de un administrador existente, no elimina MFA ni restablece su contraseña.

## Roles y acceso

| Función | Evaluador | Administrador |
| --- | --- | --- |
| Conversaciones y telemetría de contenido | Solo propias | Solo propias |
| Credenciales | Gestionar las propias, sin revelado posterior | Añadir/reemplazar/desactivar/eliminar también las asignadas a otra cuenta; sin revelado |
| Consumo | Propio | Agregado y por usuario/proveedor/modelo, sin transcripciones |
| Usuarios, catálogo, límites y patrocinios | No | Sí, con MFA y reautenticación reciente |

El acceso patrocinado es financiación, no otro rol. Las invitaciones vigentes y cuentas activas comparten capacidad; suspender o expirar deja de ocupar plaza. Altas y reactivaciones usan el mismo bloqueo transaccional. Los IDs de propietario enviados por el navegador no determinan la identidad.

TOTP y códigos de recuperación proceden de Better Auth. La aplicación prueba MFA **por sesión**, no solo por el indicador de inscripción del usuario. Las operaciones administrativas sensibles exigen además contraseña y TOTP, con autorización de cinco minutos. Cambiar rol o suspender revoca sesiones de login. No hay impersonación, edición de email ni endpoints administrativos genéricos. No se permite suspender o degradar al último administrador activo.

## Correo transaccional

Core usa Resend 6.32.1 exclusivamente para activación y recuperación. Los tokens de Better Auth duran una hora, son de un solo uso y los anteriores se invalidan al encolar otro enlace. Recuperar revoca sesiones de acceso. El enlace viaja al correo guardado, nunca al panel; la página elimina el fragmento con token de la URL al abrirlo y utiliza `no-referrer`.

Para activar correo **en un paso posterior aprobado**:

1. Verifica `alansalazar.dev` con los registros DNS indicados por Resend; no se necesita comprar dominio ni crear un buzón.
2. Desactiva seguimiento de clics y aperturas para el dominio/remitente en Resend. Solo después configura `MOBAI_EMAIL_TRACKING_DISABLED=true`: es una confirmación operativa, no una llamada automática para alterar Resend.
3. Configura `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MOBAI_EMAIL_FROM=mobai@alansalazar.dev` y el origen público de evaluación en Core. Configura el webhook hacia `/api/webhooks/resend` de Web. Core verifica la firma y deduplica los eventos.
4. Habilita `MOBAI_EMAIL_ENABLED=true` tras aprobación. `pnpm accounts mail-once` procesa como máximo cinco mensajes pendientes. También se drena un lote al invitar, recuperar o solicitar reintento desde el panel. No existe un Cron ni un bucle permanente de correo.

La cola cifra destinatario y enlace. Usa leases, idempotencia por mensaje, tres intentos, espera exponencial y `Retry-After`; cada petición al SDK tiene un timeout de diez segundos. El envío se limita a 100 correos/día y 3.000/mes, además de tres solicitudes/hora por cuenta. No se reenvían enlaces caducados. **Aceptado** no significa **entregado**: entrega, rebote y reclamación dependen de webhooks firmados. Los previews bloquean envíos incluso si alguien habilita el flag.

## Proveedores y modelos

El catálogo inicial contiene perfiles **desactivados y sin modelos supuestos** para OpenAI, OpenRouter, Vercel AI Gateway, DeepSeek y OpenCode Zen/Go. Chat Completions usa `@ai-sdk/openai-compatible` 3.0.66 con AI SDK 7; Responses conserva el SDK OpenAI apuntando solo al transporte interno de Core.

El administrador introduce identificadores libres o consulta `/models` con una credencial propia. Descubrir solo devuelve IDs **sin validar**; no genera texto ni habilita modelos. Antes de marcar un modelo listo, documenta su protocolo, herramientas, streaming, ventana de trabajo, máximo de salida, parámetros admitidos y requisitos de razonamiento. Solo se ofrecen modelos listos con herramientas y streaming. Anthropic Messages y otros protocolos quedan fuera.

**Ventana de trabajo:** configura una cota no superior al contexto verificado del modelo. Core reserva esa ventana completa por intento, y aplica una comprobación conservadora en bytes del contexto serializado más la salida. Esto puede rechazar contextos que el proveedor aceptaría; no promete tokenización exacta universal. Con la cuota inicial de entrada de 100.000 tokens/sesión, una ventana de 128.000 no permite ninguna llamada: configura una ventana operativa menor o ajusta explícitamente la cuota. Los límites nativos EVE permanecen como otra protección independiente.

Las tarifas son enteros en micro-USD por millón de tokens, con fecha de validez. Nuevos precios/capacidades crean una versión de modelo, no alteran turnos ya fijados. Para patrocinar se exigen precios vigentes y cotas verificables; BYOK puede funcionar sin precio, mostrando coste desconocido. No se invoca un tokenizer remoto.

Los destinos son HTTPS públicos: Core valida DNS, rechaza IPs privadas/loopback/metadata y fija las direcciones en el socket; no sigue redirecciones. Un destino cambiado requiere otro perfil y otra credencial: no redirige keys existentes. El navegador no aporta URL, cabeceras o parámetros arbitrarios.

## Credenciales y patrocinio

**Mi cuenta** ofrece un formulario de solo escritura y devuelve alias, proveedor, huella HMAC parcial, versión y estado. No guarda keys en localStorage, EVE, Workflow, exportaciones o telemetría. Core usa `SecretStore` con AES-256-GCM y autenticación ligada al identificador/uso; el archivo maestro queda fuera de PostgreSQL. Un futuro backend OCI podrá implementar esa interfaz sin cambiar los consumidores.

Rotar una key invalida su versión anterior para nuevas llamadas; eliminarla elimina su material cifrado local. **No revoca la key en el proveedor.** Administrar la aplicación no permite revelarla, pero quien controle completamente el servidor y la clave maestra sí podría descifrarla.

Para patrocinar: crea una credencial administrativa propia, una bolsa con importe/expiry y un acceso para cada beneficiario. Cada acceso exige modelos autorizados, presupuesto total, vencimiento y cuotas de tokens, llamadas y concurrencia. La bolsa y el acceso se comprueban a la vez; no hay recargas ni renovaciones automáticas. El evaluador recibe una referencia de financiación, nunca la key. El panel calcula disponibilidad limitada también por la bolsa compartida y muestra alerta al 80 %.

## Selección y continuidad

El chat oficial incorpora un único desplegable de modelos dentro del compositor. Incluye las conexiones propias y patrocinadas disponibles; un cambio de conexión se confirma explícitamente. **Mi cuenta** conserva la gestión de credenciales y la preferencia inicial. Core prepara una referencia limitada, verifica propietario y vincula atómicamente usuario, sesión y turno, incluso en la primera petición. La vinculación fija versión de credencial/modelo, pagador y política. La elección se fija en `turn.started` como referencia serializable. En `step.started`, EVE reconstruye el cliente SDK exclusivamente desde esa vinculación; no vuelve a elegir proveedor, credencial ni pagador. La autenticación también valida `inputResponses`, que en EVE 0.65.0 no pasan por `onMessage`.

Solo se cambia al terminar/cancelar un turno, sin aprobación pendiente. Cambiar de proveedor requiere confirmar el nuevo destinatario del contexto. Si un modelo menor no admite el historial, se rechaza sin truncarlo y se puede **compactar con la configuración anterior**, consumiendo su presupuesto, o abrir otra conversación. La compactación requiere que esa vinculación siga vigente (ventana de 30 minutos), además de credencial y fondos disponibles.

El historial original no se reescribe: el adaptador elimina referencias opacas/razonamiento de otros modelos y conserva pares herramienta/resultado. El razonamiento requerido por DeepSeek se conserva dentro de la misma frontera proveedor/protocolo/modelo. No hay sustitución silenciosa de modelo, key o pagador.

## Contabilidad y errores

El ledger Core es independiente de gráficos y trazas. Cada intento se reserva antes del despacho bajo el mismo bloqueo que los límites y las mutaciones administrativas. Inicialmente hay una generación por usuario y cinco globales; 30 cuentas no amplían esa concurrencia. Se conservan las cuotas iniciales de 6/minuto, 60/día, 100.000 entrada/sesión, 10.000 salida/sesión, 2.048 salida/llamada y un máximo técnico de 30 llamadas/sesión.

Se registra intento, usuario, sesión, turno, proveedor/modelo, financiación, precio/versiones, duración y referencia del proveedor. El coste puede ser comunicado, calculado o desconocido. Caché es subconjunto de entrada; razonamiento es subconjunto de salida. No se suman dos veces. Los totales visuales por usuario/proveedor/modelo abarcan todo el ledger; la lista detallada muestra los últimos 200 intentos.

Una desconexión, timeout o falta de uso final deja la reserva pendiente de conciliación. Un doble clic/replay no vuelve a despachar el mismo paso. No hay reintentos automáticos de inferencia: un estado incierto necesita revisión, no una promesa de ejecución exactamente una vez. El administrador concilia mediante un asiento nuevo con justificación; no borra el intento. Las campañas siguen opt-in y comparten el UUID del intento; su contador histórico no duplica el cargo financiero ni presenta la cota de entrada como medición exacta.

El límite monetario controla la **admisión de mobai**, no garantiza la factura externa. Usa también controles de gasto del proveedor. Un coste comunicado que exceda la reserva suspende la bolsa para revisión. Suspender cuenta, credencial o patrocinio impide nuevos despachos y activa cancelación best-effort de solicitudes en curso, sin prometer devolución. El watchdog vive solo durante la petición acotada; no es un Cron de fondo.

Los errores públicos son códigos seguros con referencia de incidencia. Ante `execution_uncertain`, consulta consumo antes de reintentar; ante `context_exceeded`, compacta o abre otro chat; ante `credential_invalid`, reemplaza la key; ante `prices_unverified`, revisa tarifas. Un fallo de telemetría no repite ni autoriza inferencias.

## Verificación y activaciones pendientes

- `pnpm check`: lint/fronteras, tipos, pruebas offline y builds, sin servicios externos de consumo.
- `pnpm build:agent`: compilación real del agente, sin inferencia.
- `pnpm test:control:db`: crea PostgreSQL desechable en loopback, aplica todas las migraciones y ejecuta cuentas, TOTP, recuperación, Resend simulado, aislamiento, presupuestos concurrentes y JSON/SSE de ambos protocolos. Requiere la imagen Docker ya instalada; no la descarga ni usa la DB habitual. Destruye únicamente su contenedor de prueba.
- `pnpm smoke:evaluation`: comprobación de acceso contra el runtime local, con dos cuentas temporales y capacidad disponible. No se ejecuta automáticamente. Los antiguos flags live con financiación implícita se rechazan antes de leer el entorno.

Implementación: [Core](../apps/mobility-core/src/control), [contratos](../packages/contracts/src/llm.ts), [admisión monetaria](../packages/domain/src/llm-policy.ts), [transporte EVE](../apps/eve-web/src/model.ts), [pruebas DB](../apps/mobility-core/src/control/control.integration.test.ts).

La instalación local ya tiene 0022, SecretStore, credencial de prueba y TOTP; se verificaron chat, compactación y continuación reales con OpenAI. Resend queda implementado pero desactivado y sin configurar hasta el despliegue. Los demás proveedores se prueban con transportes ficticios: no se afirma validación real de cada modelo. Las plantillas de [OCI](deployment.md) no provisionan ni activan servicios.
