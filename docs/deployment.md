# Preparación cloud sin publicación

## Estado al 23 de septiembre de 2026

Scope Vercel `alansalazar`, plan Hobby para proyecto universitario. No se ha comprado ningún plan ni creado deployments. Dos proyectos privados de código, Node 24.x, región de Functions `cdg1`:

| Proyecto | Root |
| --- | --- |
| mobility-twin-web | apps/eve-web |
| mobility-twin-core | apps/mobility-core |

Los dos `vercel.json` mantienen `git.deploymentEnabled:false`; también está desactivado `gitProviderOptions.createDeployments` en Vercel. No ejecutar un despliegue manual sin aprobación. Las URLs configuradas reservan el destino, no acreditan un servicio publicado.

| Recurso | Plan/configuración | ID |
| --- | --- | --- |
| Neon mobility-twin-evaluation | free_v3, fra1, auth integrada desactivada | store_3XxjUJNron1x9oAY |
| Upstash mobility-twin-cache | free, fra1, autoUpgrade=false, prodPack=false | store_6tttSaGcdEtv3ebx |
| Blob mobility-twin-raw | privado, fra1, cuota Hobby | store_OiblEykn0UtVgA49 |

Todos conectados **solo a production de Core**, no a previews/development. PostGIS 3.6 y tres migraciones verificados; Redis REST y Blob privado probados con escritura/lectura/borrado de datos temporales. Esto no implementa todavía la caché del dominio ni almacenamiento raw de ingesta.

## Variables y separación

**Web:** `OPENAI_API_KEY`, `MOBILITY_MCP_URL`, `MOBILITY_MCP_TOKEN`, `EVALUATION_ORIGIN`. Modelo fijo `gpt-6-luna` por Responses directo; sin Gateway, BYOK de Gateway ni selección por `EVE_MODEL`.

**Core:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `MOBILITY_JWT_SECRET`, `MOBILITY_JWT_ISSUER`, `MOBILITY_JWT_AUDIENCE`, `EVALUATION_ORIGIN`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. La integración Upstash genera también `KV_REST_API_*`: los aliases están configurados. Credenciales de fuentes se añadirán después.

`INGESTION_ENABLED=false` y `OTP_SANDBOX_ENABLED=false`; no hay consumidores ni proveedor OTP que ejecutar. No hay Cron de tiempo real ni Sandbox iniciado.

Los archivos `.env.cloud.*.local` están ignorados y con permisos 0600. **Vercel devuelve `[SENSITIVE]` al descargar secretos marcados sensibles**: nunca sobrescribir las copias locales reales con esos marcadores. `configure:vercel --apply` exige la copia local de Core y la clave raíz, conserva secretos existentes y renueva el JWT de servicio de siete días. No despliega ni contrata recursos.

```bash
pnpm configure:vercel --apply
node --env-file=.env.cloud.core.local scripts/migrate.mjs --allow-remote
node --env-file=.env.cloud.core.local scripts/check-cloud.mjs --probe
ALLOW_REMOTE_ADMIN=true node --env-file=.env.cloud.core.local scripts/evaluator.mjs list
```

Las migraciones tienen checksum, transacción y advisory lock. Nunca se ejecutan durante un build. `check-cloud --probe` escribe y elimina un objeto pequeño por almacén; no es una ingesta de movilidad.

## Antes de publicar, con autorización nueva

1. Renovar JWT de servicio si han pasado siete días; comprobar expiración de evaluadores y límites de gasto de la cuenta del modelo. Las cuotas de la aplicación no son un límite monetario absoluto.
2. Acordar retención y borrado físico de Workflow, descritos en [evaluation.md](evaluation.md).
3. Probar HTTPS/cookies/login y streaming en un despliegue deliberado; el flujo real actual se verificó en builds productivos **locales**, no en cloud.
4. Revisar OTP con el usuario; licencias, permisos y cadencia de fuentes antes de implementar ingestión.
5. Si se habilita Git, revisar tanto los archivos de proyecto como el control remoto. Mantener previews aislados.

CLI reproducible `pnpm exec vercel` 59.25.4; enlaces `.vercel` ignorados por aplicación. Las instalaciones Marketplace pueden añadir skills/lockfiles auxiliares: no incluirlos como código del producto.
