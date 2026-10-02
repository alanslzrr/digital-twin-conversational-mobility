# Preparación cloud y alternativa Vercel

[Índice](index.md) · [Arquitectura local](architecture.md) · [Recursos](resources/index.md#cloud-y-alternativas) · [Cuentas](resources/accounts.md#preparación-cloud-anterior)

**No hay despliegue cloud descrito como activo.** La preparación inicial permitió comprobar recursos gratuitos; después se priorizó el funcionamiento completo local. Vercel es una alternativa, no el siguiente bloque obligatorio.

## Qué se preparó

Registro de preparación del **23/09/2026**, no inventario remoto actualizado durante esta revisión:

| Elemento | Configuración registrada | Para qué se preparó |
| --- | --- | --- |
| Cuenta Vercel `alansalazar` | Hobby, proyecto universitario; sin compra de plan | Posible publicación posterior |
| `mobility-twin-web` | Raíz `apps/eve-web`, Node 24.x, región `cdg1` | Web/EVE |
| `mobility-twin-core` | Raíz `apps/mobility-core`, Node 24.x, región `cdg1` | Core/MCP |
| Neon `mobility-twin-evaluation` | `free_v3`, `fra1`, auth integrada desactivada | PostgreSQL/PostGIS |
| Upstash `mobility-twin-cache` | Free, `fra1`, `autoUpgrade=false`, `prodPack=false` | Redis REST |
| Blob `mobility-twin-raw` | Privado, `fra1`, cuota Hobby de entonces | Archivos |

Los almacenes se conectaron solo al entorno `production` de Core, no a Web/previews/development. Se verificaron entonces PostGIS 3.6, tres migraciones y probes temporales de escritura/lectura/borrado en Redis/Blob. **Ese estado de tres migraciones no es el esquema local actual**, que evolucionó hasta 0020. Tampoco demuestra que raw/caché de dominio se hayan migrado a cloud.

El usuario aceptó manualmente las condiciones de Upstash desde el flujo de integración Vercel. Esa aceptación permitió continuar el alta. No necesita repetirse para iniciar Docker local ni sustituye revisar condiciones al contratar otro servicio.

Los archivos versionados [Web](../apps/eve-web/vercel.json) y [Core](../apps/mobility-core/vercel.json) mantienen `git.deploymentEnabled:false`. En la preparación también se desactivó `gitProviderOptions.createDeployments`. Una URL configurada o un proyecto creado no acredita publicación.

## Qué no está desplegado

No se activaron Cron RT, consumidores Queues, OTP Sandbox ni una cadena de ingestión cloud. Los valores `INGESTION_ENABLED=false` y `OTP_SANDBOX_ENABLED=false` de la preparación impiden tratarlos como servicios disponibles.

La implementación local guarda raw y releases en disco y ejecuta un worker Node. No basta con subir ese bucle a una Function. El chat usa OpenAI directo, no AI Gateway. Redis no es necesario para el dominio local.

## Archivos y utilidades conservados

Los entornos privados `.env.cloud.*.local` están ignorados y con permisos restringidos. No se publican sus valores ni se mezclan con `.env.local` de la instalación local. [Variables por componente](reference/system.md#variables-y-secretos).

- [Configurador Vercel](../scripts/configure-vercel.mjs): `pnpm configure:vercel --apply` modifica configuración/secretos de proyectos; no usar para el arranque local.
- [Migrador](../scripts/migrate.mjs): la operación remota requiere `--allow-remote` y el entorno cloud elegido expresamente.
- [Probe cloud](../scripts/check-cloud.mjs): `--probe` escribe y elimina objetos de prueba; no es un chequeo de solo lectura.
- [Administrador de cuentas](../scripts/evaluator.mjs): cloud exige `ALLOW_REMOTE_ADMIN=true`; sus cuentas no son las locales.

Vercel puede devolver el marcador `[SENSITIVE]` al descargar secretos sensibles. No sobrescribas una copia privada real con ese marcador. Ningún procedimiento documental autoriza ejecutar estas utilidades.

## Si se decide publicar en el futuro

Una petición nueva debe decidir entorno, coste, almacenamiento durable, ejecución de ingestión, alojamiento OTP y controles de acceso/retención del destino. Los límites/precios del brief inicial no son garantías actuales. No se programa esa adaptación ni una campaña de pruebas por el hecho de documentarla.

Referencias oficiales: [integraciones](https://vercel.com/docs/integrations), [EVE en Vercel](https://github.com/vercel/eve/blob/main/docs/guides/deployment/vercel.mdx), [precios](https://vercel.com/pricing), [términos](https://vercel.com/legal/terms). [Decisión de alcance vigente](roadmap.md).
