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

El registro público está deshabilitado. Las cuentas se administran mediante estos comandos:

```bash
pnpm evaluator create 1 alan@mobility.test Alan
pnpm evaluator list
pnpm evaluator reset 1
pnpm evaluator revoke 1
```

Los slots permitidos son 1–5. El correo funciona como identificador de acceso. El alta es administrativa y la aplicación no envía mensajes de verificación. Cada contraseña aleatoria se guarda únicamente en `data/evaluators/local-slot-*.txt` con permisos 0600. Compártela por un canal privado. Reset invalida sesiones de login; revoke deshabilita el evaluador. Reset no reactiva una cuenta revocada ni extiende sus 30 días de acceso; esa ampliación requiere revisión administrativa explícita.

Para administrar Neon, cargar `.env.cloud.core.local` y exigir `ALLOW_REMOTE_ADMIN=true`; los archivos se llaman `cloud-slot-*.txt`. Las cuentas locales y cloud son distintas. No copiar la base de producción a previews.

## Interfaz oficial

La UI procede del Web Chat de EVE 0.65.0, con Better Auth como puerta de acceso. Las rutas `/`, `/evaluation` y `/s` muestran el chat oficial; `/s/{sessionId}` reanuda la conversación sin eludir los controles de propietario. **New chat** abre `/s` sin borrar ni resetear la sesión previa. Adjuntos deshabilitados; texto limitado a 1.800 caracteres. No se persisten transcripciones ni contraseñas en localStorage.

## Límites y retención

- Máximo cinco slots en SQL; cuentas habilitadas hasta 30 días desde su creación.
- Sesiones Better Auth: siete días, actualización diaria; revocación comprobada en base de datos.
- Propiedad de conversaciones EVE: siete días desde su registro, sin renovación automática. Reset revoca el acceso.
- Generación: seis operaciones/minuto y 60/día por evaluador; crear una sesión aparcada también consume una operación. Contadores atómicos y limpieza oportunista de ventanas de más de ocho días.
- Login: diez intentos/minuto compartidos por el proxy. No confiar en cabeceras IP arbitrarias del navegador.
- **Expirar o revocar el acceso conserva los mensajes en EVE/Workflow.** La revocación bloquea la lectura y continuación de la conversación; la aplicación no dispone de una tarea automática que borre las transcripciones. Evita introducir datos personales sensibles, domicilios o historiales de viajes.
- Las solicitudes al modelo usan `store:false`. La retención del proveedor y la del runtime EVE se gestionan por separado.

## Verificación

`pnpm smoke:evaluation` crea y elimina dos cuentas temporales en slots 4 y 5; rechaza ejecutarse si están ocupados. Verifica signup cerrado, login/logout, CSRF, acceso anónimo, aislamiento entre propietarios, cuotas concurrentes y revocación. No llama al modelo salvo `--live` explícito.

Los resultados de las comprobaciones de acceso e historial se recogen en el [índice de actas](acceptance/index.md).

El historial obtiene una página de metadatos de Core cada vez que se abre o se avanza en el listado. Al seleccionar una conversación, EVE recupera sus mensajes. [Flujo de permisos](architecture.md#dos-históricos-distintos), [implementación Core](../apps/mobility-core/src/conversations.ts), [guard de canal](../apps/eve-web/src/evaluation-guard.ts) y [acta R2.1](acceptance/2026-09-28-conversation-history.md).

## Telemetría del panel

Cada cuenta activa puede consultar datos y operación comunes, pero solo sus conversaciones, payloads y ejecuciones. Revocar o caducar el acceso impide todas esas lecturas; no existe bypass de desarrollo. Las trazas comienzan con la nueva instrumentación y pueden ser parciales por timeout, cuota o caída del sink. No se inventa uso histórico ni se convierte `null` en cero.

La retención de observabilidad es de hasta siete días, independiente de la transcripción EVE. La purga física se ejecuta en mantenimiento acotado del worker por actividad; el filtro de acceso no espera a esa purga. Véanse [límites](reference/system.md#panel-y-telemetría) y [uso](user-guide.md#panel-privado).
