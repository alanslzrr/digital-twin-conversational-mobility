# Evaluadores y operación local

## Acceso

Better Auth 1.7.5 reside en Mobility Core con tablas Postgres. Web conserva solo la clave del modelo y el JWT de servicio. El navegador usa `/api/auth/*` del mismo origen; el proxy reenvía la cookie al Core y no expone el JWT. El Core exige scope `mobility.evaluation.manage` y origen permitido. No hay registro público ni credenciales Google.

```bash
pnpm evaluator create 1 alan@mobility.test Alan
pnpm evaluator list
pnpm evaluator reset 1
pnpm evaluator revoke 1
```

Los slots permitidos son 1–5. Usa direcciones como identificadores acordados con cada persona; no se envían emails ni se afirma verificar su propiedad. Cada contraseña aleatoria se guarda únicamente en `data/evaluators/local-slot-*.txt` con permisos 0600. Compártela por un canal privado. Reset invalida sesiones de login; revoke deshabilita el evaluador. Reset no reactiva una cuenta revocada ni extiende sus 30 días de acceso; esa ampliación requiere revisión administrativa explícita.

Para administrar Neon, cargar `.env.cloud.core.local` y exigir `ALLOW_REMOTE_ADMIN=true`; los archivos se llaman `cloud-slot-*.txt`. Las cuentas locales y cloud son distintas. No copiar la base de producción a previews.

## Interfaz oficial

La UI procede del Web Chat de EVE 0.65.0, con Better Auth como puerta de acceso. Las rutas `/`, `/evaluation` y `/s` muestran el chat oficial; `/s/{sessionId}` reanuda la conversación sin eludir los controles de propietario. **New chat** abre `/s` sin borrar ni resetear la sesión previa. Adjuntos deshabilitados; texto limitado a 1.800 caracteres. No se persisten transcripciones ni contraseñas en localStorage.

## Límites y retención

- Máximo cinco slots en SQL; cuentas habilitadas hasta 30 días desde su creación.
- Sesiones Better Auth: siete días, actualización diaria; revocación comprobada en base de datos.
- Propiedad de conversaciones EVE: siete días desde su registro, sin renovación automática. Reset revoca el acceso.
- Generación: seis operaciones/minuto y 60/día por evaluador; crear una sesión aparcada también consume una operación. Contadores atómicos y limpieza oportunista de ventanas de más de ocho días.
- Login: diez intentos/minuto compartidos por el proxy. No confiar en cabeceras IP arbitrarias del navegador.
- **Expirar o revocar acceso NO borra físicamente las conversaciones de EVE/Workflow.** No hay tarea automática de purga de transcripciones. Antes de publicar se debe verificar la retención del backend Workflow y acordar el borrado operativo tras la evaluación. No introducir datos personales sensibles, domicilios ni historiales de viajes.
- El proveedor directo usa `store:false`; esto no sustituye las políticas de retención de la cuenta del proveedor ni las del runtime EVE.

## Verificación

`pnpm smoke:evaluation` crea y elimina dos cuentas temporales en slots 4 y 5; rechaza ejecutarse si están ocupados. Verifica signup cerrado, login/logout, CSRF, acceso anónimo, aislamiento entre propietarios, cuotas concurrentes y revocación. No llama al modelo salvo `--live` explícito.

El modo live completó un turno real con `get_source_health`: las fuentes responden `not_initialized`, no datos inventados. No se validó ninguna ingesta ni ruta OTP.
