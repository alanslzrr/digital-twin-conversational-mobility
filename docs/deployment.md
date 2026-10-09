# Preparación de despliegue OCI

[Índice](index.md) · [Arquitectura local](architecture.md) · [Recursos](resources/index.md#cloud-y-alternativas) · [Cuentas](resources/accounts.md#preparación-cloud-anterior)

**Destino decidido:** una VM OCI Academy Ampere A1 (4 núcleos / 24 GB), PostgreSQL 17/PostGIS 3.5 y Block Storage. La aplicación sigue en local. No hay provisión, DNS, correo ni despliegue activados.

## Preparación disponible, sin activar

- [Compose](../infra/oci/compose.yaml): PostgreSQL/PostGIS construido nativamente para ARM desde una revisión oficial fijada, Redis y OTP. Puertos internos en loopback, límites de memoria y directorios persistentes.
- [Servicio systemd](../infra/oci/mobai.service): supervisa Web/Core/EVE/worker como usuario sin privilegios. [Caddy](../infra/oci/Caddyfile) publica exclusivamente Web con HTTPS y streaming.
- [Backup manual](../infra/oci/backup.sh): detiene conjuntamente la aplicación, captura dump/configuración/Workflow/datos y la reinicia. Incluye secretos: mantener la copia privada y fuera de la VM.
- `pnpm check:oci` valida la configuración sin crear servicios, acceder a OCI ni enviar correo.

Al desplegar, instalar Node 24, pnpm 10, Docker Compose y Caddy; clonar en `/opt/mobai` y montar Block Storage en `/srv/mobai`. Usar el usuario `mobai`, con escritura en el checkout y en datos/Workflow, pero sin añadirlo al grupo Docker para el servicio. Enlazar `/opt/mobai/data` a `/srv/mobai/data`; crear `/srv/mobai/workflow`. En la configuración privada raíz, definir `MOBAI_STATE_DIR=/srv/mobai`. En Web, `MOBAI_WEB_PORT=3000` y `WORKFLOW_LOCAL_DATA_DIR=/srv/mobai/workflow`; en Core, `LOCAL_DATA_DIR=/srv/mobai/data` y `MOBAI_SECRET_KEY_FILE=/etc/mobai/master.key`. Conservar los secretos de autenticación y cifrado al trasladar la base; no regenerarlos si se migra el estado existente.

Solo tras decidir desplegar: restaurar PostgreSQL mediante dump/restore (no copiar el volumen amd64), Workflow y datos coherentes; configurar el mismo `EVALUATION_ORIGIN=https://<dominio>` en Web/Core; ejecutar instalación congelada, migraciones y builds; arrancar Compose con `--profile oci` e instalar el servicio y Caddy. `MOBAI_HOST` en el entorno de Caddy debe ser ese dominio. Abrir únicamente 80/443 y SSH restringido. Verificar login, TOTP, continuidad y restauración en esa VM antes de abrir acceso.

El JWT interno se renueva al arrancar el servicio y dura siete días: rotarlo y reiniciar el runtime antes de caducar. El correo permanece desactivado hasta configurar [Resend y DNS](accounts-and-llm.md#correo-transaccional); no hace falta configurarlo ahora. Los modelos y la ingestión conservan sus activaciones explícitas; no habilitarlos en previews.

Fuentes de las plantillas: [PostGIS oficial](https://github.com/postgis/docker-postgis/tree/2bcd236e3af9ec6e668db51eb37162a79f0eaeaa/17-3.5/alpine), [proxy Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Preparación histórica de Vercel (no es el destino actual)

Configuración registrada el **23/09/2026**:

| Elemento | Configuración registrada | Para qué se preparó |
| --- | --- | --- |
| Cuenta Vercel `alansalazar` | Hobby, proyecto universitario | Posible publicación posterior |
| `mobility-twin-web` | Raíz `apps/eve-web`, Node 24.x, región `cdg1` | Web/EVE |
| `mobility-twin-core` | Raíz `apps/mobility-core`, Node 24.x, región `cdg1` | Core/MCP |
| Neon `mobility-twin-evaluation` | `free_v3`, `fra1`, auth integrada desactivada | PostgreSQL/PostGIS |
| Upstash `mobility-twin-cache` | Free, `fra1`, `autoUpgrade=false`, `prodPack=false` | Redis REST |
| Blob `mobility-twin-raw` | Privado, `fra1`, cuota Hobby de entonces | Archivos |

Los almacenes se conectaron al entorno `production` de Core. En esa preparación se verificaron PostGIS 3.6, tres migraciones y operaciones temporales de escritura, lectura y borrado en Redis/Blob. La base local evolucionó después hasta la migración 0021, que añade observabilidad del panel; los archivos raw y las cachés de dominio pertenecen a la instalación local.

El alta de Upstash requirió aceptar sus condiciones en el navegador, dentro del flujo de integración de Vercel.

Los archivos versionados [Web](../apps/eve-web/vercel.json) y [Core](../apps/mobility-core/vercel.json) mantienen `git.deploymentEnabled:false`. En la preparación también se desactivó `gitProviderOptions.createDeployments`. Ambas opciones mantienen desactivadas las publicaciones automáticas desde Git.

## Servicios y adaptación

La configuración cloud conserva `INGESTION_ENABLED=false` y `OTP_SANDBOX_ENABLED=false`. La ingestión y OTP funcionan en la instalación local.

La aplicación guarda raw y releases en disco y actualiza datos mediante un worker Node. Publicarla en Vercel requiere adaptar la persistencia de esos archivos, la ejecución de trabajos y el alojamiento de OTP. El esquema de responsabilidades Web/Core se mantiene.

## Archivos y utilidades conservados

Los entornos privados `.env.cloud.*.local` están ignorados y con permisos restringidos. Se cargan por separado del entorno `.env.local` de la instalación local. [Variables por componente](reference/system.md#variables-y-secretos).

- [Configurador Vercel](../scripts/configure-vercel.mjs): **deshabilitado**, también con `--apply`. Falla antes de leer secretos, escribir archivos o contactar servicios cloud. La CLI se retiró por su dependencia sin parche `braces` (GHSA-vfj7-8cjw-p6xm). No se sustituye por una instalación global ni `pnpm dlx`.
- [Migrador](../scripts/migrate.mjs): la operación remota requiere `--allow-remote` y el entorno cloud elegido expresamente.
- [Probe cloud](../scripts/check-cloud.mjs): `--probe` escribe y elimina objetos de prueba.
- El administrador por slots anterior está retirado. El [bootstrap de cuentas](accounts-and-llm.md#migrar-una-instalación) actual es local-only; no permite aprovisionamiento cloud.

Vercel puede devolver el marcador `[SENSITIVE]` al descargar secretos sensibles. No sobrescribas una copia privada real con ese marcador.

## Si se retoma la alternativa Vercel

Primero debe reincorporarse una CLI con árbol auditado y validarse de nuevo el configurador bajo autorización explícita. CI comprueba que el configurador actual falla cerrado, además de auditar todas las dependencias instaladas. Los proyectos remotos y sus secretos no se modificaron al retirar la CLI.

La configuración del destino debe definir el plan contratado, el almacenamiento durable, la ejecución de ingestión, el alojamiento OTP y la retención de conversaciones. Las cuotas y precios se consultan al elegir el plan.

Referencias oficiales: [integraciones](https://vercel.com/docs/integrations), [EVE en Vercel](https://github.com/vercel/eve/blob/main/docs/guides/deployment/vercel.mdx), [precios](https://vercel.com/pricing), [términos](https://vercel.com/legal/terms). [Decisión de alcance vigente](roadmap.md).

La capa de cuentas y consumo LLM de [0022](../infra/postgres/migrations/0022_accounts_llm_control.sql) ya está aplicada en local. No activa ningún despliegue.
