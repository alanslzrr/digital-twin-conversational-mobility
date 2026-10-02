# Preparación cloud y alternativa Vercel

[Índice](index.md) · [Arquitectura local](architecture.md) · [Recursos](resources/index.md#cloud-y-alternativas) · [Cuentas](resources/accounts.md#preparación-cloud-anterior)

Vercel es la alternativa de alojamiento preparada para Web y Core. Los proyectos y almacenes están configurados; la aplicación se ejecuta actualmente en local.

## Qué se preparó

Configuración registrada el **23/09/2026**:

| Elemento | Configuración registrada | Para qué se preparó |
| --- | --- | --- |
| Cuenta Vercel `alansalazar` | Hobby, proyecto universitario | Posible publicación posterior |
| `mobility-twin-web` | Raíz `apps/eve-web`, Node 24.x, región `cdg1` | Web/EVE |
| `mobility-twin-core` | Raíz `apps/mobility-core`, Node 24.x, región `cdg1` | Core/MCP |
| Neon `mobility-twin-evaluation` | `free_v3`, `fra1`, auth integrada desactivada | PostgreSQL/PostGIS |
| Upstash `mobility-twin-cache` | Free, `fra1`, `autoUpgrade=false`, `prodPack=false` | Redis REST |
| Blob `mobility-twin-raw` | Privado, `fra1`, cuota Hobby de entonces | Archivos |

Los almacenes se conectaron al entorno `production` de Core. En esa preparación se verificaron PostGIS 3.6, tres migraciones y operaciones temporales de escritura, lectura y borrado en Redis/Blob. La base local evolucionó después hasta la migración 0020; los archivos raw y las cachés de dominio pertenecen a la instalación local.

El alta de Upstash requirió aceptar sus condiciones en el navegador, dentro del flujo de integración de Vercel.

Los archivos versionados [Web](../apps/eve-web/vercel.json) y [Core](../apps/mobility-core/vercel.json) mantienen `git.deploymentEnabled:false`. En la preparación también se desactivó `gitProviderOptions.createDeployments`. Ambas opciones mantienen desactivadas las publicaciones automáticas desde Git.

## Servicios y adaptación

La configuración cloud conserva `INGESTION_ENABLED=false` y `OTP_SANDBOX_ENABLED=false`. La ingestión y OTP funcionan en la instalación local.

La aplicación guarda raw y releases en disco y actualiza datos mediante un worker Node. Publicarla en Vercel requiere adaptar la persistencia de esos archivos, la ejecución de trabajos y el alojamiento de OTP. El esquema de responsabilidades Web/Core se mantiene.

## Archivos y utilidades conservados

Los entornos privados `.env.cloud.*.local` están ignorados y con permisos restringidos. Se cargan por separado del entorno `.env.local` de la instalación local. [Variables por componente](reference/system.md#variables-y-secretos).

- [Configurador Vercel](../scripts/configure-vercel.mjs): `pnpm configure:vercel --apply` modifica configuración/secretos de proyectos; no usar para el arranque local.
- [Migrador](../scripts/migrate.mjs): la operación remota requiere `--allow-remote` y el entorno cloud elegido expresamente.
- [Probe cloud](../scripts/check-cloud.mjs): `--probe` escribe y elimina objetos de prueba.
- [Administrador de cuentas](../scripts/evaluator.mjs): cloud exige `ALLOW_REMOTE_ADMIN=true`; sus cuentas no son las locales.

Vercel puede devolver el marcador `[SENSITIVE]` al descargar secretos sensibles. No sobrescribas una copia privada real con ese marcador.

## Si se decide publicar en el futuro

La configuración del destino debe definir el plan contratado, el almacenamiento durable, la ejecución de ingestión, el alojamiento OTP y la retención de conversaciones. Las cuotas y precios se consultan al elegir el plan.

Referencias oficiales: [integraciones](https://vercel.com/docs/integrations), [EVE en Vercel](https://github.com/vercel/eve/blob/main/docs/guides/deployment/vercel.mdx), [precios](https://vercel.com/pricing), [términos](https://vercel.com/legal/terms). [Decisión de alcance vigente](roadmap.md).
