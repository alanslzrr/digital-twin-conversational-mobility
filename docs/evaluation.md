# Evaluadores y operación local

[Índice](index.md) · [Guía de uso](user-guide.md) · [Operación](local-runtime.md) · [Referencia de acceso](resources/index.md#tecnología)

Procedimientos para crear cuentas, renovar contraseñas, revocar acceso y consultar los límites de sesiones.

## En esta página

- [Acceso](#acceso)
- [Interfaz oficial](#interfaz-oficial)
- [Límites y retención](#límites-y-retención)
- [Verificación](#verificación)

## Acceso

Better Auth reside en Mobility Core y guarda usuarios y sesiones en PostgreSQL. El navegador inicia sesión con correo y contraseña mediante `/api/auth/*` de la Web. El proxy reenvía la solicitud a Core y devuelve la cookie de sesión al navegador.

La Web se autentica ante los servicios de acceso de Core con un JWT que incluye `mobility.evaluation.manage`. Core comprueba además el origen de la petición. El canal EVE utiliza estos servicios para comprobar la propiedad de cada conversación y las cuotas antes de ejecutarla. [Flujo completo](architecture.md#recorrido-de-una-pregunta).

El registro público está deshabilitado. El primer administrador se nombra mediante una operación local explícita; después, **Administración** gestiona invitaciones, roles, caducidades, suspensión y recuperación. **Mi cuenta** permite administrar credenciales propias, financiación, consumo y TOTP. [Procedimiento de migración y bootstrap](accounts-and-llm.md#migrar-una-instalación).

Hay dos roles: administrador y evaluador. Ambos solo leen sus conversaciones. El administrador puede gestionar credenciales ajenas sin revelarlas, pero no usar una key personal ajena como propia ni impersonar al propietario. Sus operaciones sensibles requieren TOTP y reautenticación. La capacidad inicial es de 30 cuentas activas/invitaciones vigentes; los slots anteriores conservan sus identificadores, sin el antiguo máximo de cinco.

Las nuevas cuentas establecen contraseña mediante un enlace enviado directamente al correo registrado, sin entregarla al administrador. Recuperación es de un solo uso, caduca en una hora y revoca sesiones de login. Resend permanece desactivado hasta su [activación explícita](accounts-and-llm.md#correo-transaccional). Modificar el email queda fuera de esta entrega.

## Interfaz oficial

La UI procede del Web Chat de EVE 0.65.0, con Better Auth como puerta de acceso. Las rutas `/evaluation` y `/s` muestran el chat oficial; `/` es la presentación pública; `/s/{sessionId}` reanuda la conversación sin eludir los controles de propietario. **Nuevo chat / New chat** abre `/s` sin borrar ni resetear la sesión previa. Adjuntos deshabilitados; texto limitado a 1.800 caracteres. No se persisten transcripciones ni contraseñas en localStorage. El selector [ES/EN](ui-i18n.md) cambia los controles, no los mensajes ni los permisos.

## Límites y retención

- Capacidad configurable, inicialmente 30; cuentas habilitadas hasta 30 días desde su creación, con vencimiento administrable.
- Sesiones Better Auth: siete días, actualización diaria; revocación comprobada en base de datos.
- Propiedad de conversaciones EVE: siete días desde su registro, sin renovación automática. Reset de conversación revoca su acceso; recuperar contraseña revoca sesiones de login.
- Generación: seis operaciones/minuto y 60/día por evaluador; crear una sesión aparcada también consume una operación. Contadores atómicos y limpieza oportunista de ventanas de más de ocho días.
- Login: diez intentos/minuto por cuenta y protección global del proxy. No confiar en cabeceras IP arbitrarias del navegador.
- **Expirar o revocar el acceso conserva los mensajes en EVE/Workflow.** La revocación bloquea la lectura y continuación de la conversación; la aplicación no dispone de una tarea automática que borre las transcripciones. Evita introducir datos personales sensibles, domicilios o historiales de viajes.
- Responses utiliza `store:false`; Chat Completions solo el endpoint autorizado. La retención del proveedor y la del runtime EVE se gestionan por separado.

El vencimiento de un patrocinio no borra conversaciones ni bloquea su lectura si la cuenta y la retención siguen vigentes. [Límites de consumo y reservas](accounts-and-llm.md#contabilidad-y-errores).

## Verificación

`pnpm smoke:evaluation` crea y elimina dos cuentas temporales, respetando la capacidad transaccional. Verifica signup cerrado, login/logout, CSRF, acceso anónimo, aislamiento entre propietarios, cuotas concurrentes y revocación. No llama al modelo; los flags live antiguos se rechazan por depender de financiación implícita. Las pruebas multiproveedor ficticias se ejecutan con `pnpm test:control:db`.

Los resultados de las comprobaciones de acceso e historial se recogen en el [índice de actas](acceptance/index.md).

El historial obtiene una página de metadatos de Core cada vez que se abre o se avanza en el listado. Al seleccionar una conversación, EVE recupera sus mensajes. [Flujo de permisos](architecture.md#dos-históricos-distintos), [implementación Core](../apps/mobility-core/src/conversations.ts), [guard de canal](../apps/eve-web/src/evaluation-guard.ts) y [acta R2.1](acceptance/2026-09-28-conversation-history.md).

## Telemetría del panel

Cada cuenta activa puede consultar datos y operación comunes, pero solo sus conversaciones, payloads y ejecuciones. Revocar o caducar el acceso impide todas esas lecturas; no existe bypass de desarrollo. Las trazas comienzan con la nueva instrumentación y pueden ser parciales por timeout, cuota o caída del sink. No se inventa uso histórico ni se convierte `null` en cero.

La retención de observabilidad es de hasta siete días, independiente de la transcripción EVE. La purga física se ejecuta en mantenimiento acotado del worker por actividad; el filtro de acceso no espera a esa purga. Véanse [límites](reference/system.md#panel-y-telemetría) y [uso](user-guide.md#panel-privado).
