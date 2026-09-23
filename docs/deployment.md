# Despliegue controlado

## Proyectos

| Vercel project | Root directory | Node | Build |
| --- | --- | --- | --- |
| `mobility-twin-web` | `apps/eve-web` | 24.x | `pnpm build` |
| `mobility-twin-core` | `apps/mobility-core` | 24.x | `pnpm build` |

Ambos comparten el monorepo, no los secretos. Mantener habilitado el acceso a archivos fuera del root para los paquetes workspace. Región objetivo `cdg1`; elegir recursos de datos compatibles/cercanos tras comprobar disponibilidad.

`git.deploymentEnabled: false` evita desplegar cada push durante la preparación. No quitarlo hasta completar esta lista. Un despliegue manual sigue siendo posible, por lo que esta opción no sustituye controles de acceso.

Los dos proyectos ya están creados y conectados al repositorio privado en el scope `alansalazar`, con Node 24.x, región `cdg1` y acceso a paquetes fuera del root. También se ha desactivado `gitProviderOptions.createDeployments` en los ajustes del proyecto. **No existe todavía ningún deployment cloud.** Para activar Git después, hay que revisar ambos controles.

La CLI reproducible está fijada como dependencia: `pnpm exec vercel` (59.25.4). Los enlaces locales están en el directorio `.vercel` ignorado de cada app. Al enlazar, Vercel puede renovar el token OIDC local; no versionarlo. La CLI también añade `.env*` al `.gitignore` de la app: conservar la excepción `!.env.example`.

## Antes de habilitar despliegues

1. Confirmar finalidad personal/académica no comercial o plan apropiado. La cuenta inspeccionada era Hobby; no se ha comprado ni cambiado de plan.
2. Aprovisionar Neon y comprobar `CREATE EXTENSION postgis`, conexión pooled para consultas y unpooled para migraciones. No compartir base de producción con previews.
3. Aprovisionar Upstash y Blob con revisión de costes, cuotas y retención. Redis TCP local no es el endpoint REST de Upstash.
4. Configurar credenciales en Vercel, nunca en GitHub Actions ni archivos versionados si no hacen falta allí.
5. Implementar login/allowlist de hasta cinco evaluadores y autorización de propietario de sesión. El canal EVE actual deniega producción deliberadamente.
6. Configurar OpenAI BYOK en Gateway, elegir `EVE_MODEL`, establecer límites de gasto/uso y comprobar atribución de peticiones. Desactivar fallback no autorizado a otros proveedores.
7. Provisionar/rotar credencial de servicio MCP con scope mínimo. El JWT de desarrollo no debe reutilizarse en cloud.
8. Activar primera fuente solo después de validar permisos/licencia, datos y cadencia. Registrar métricas de lag, errores, duplicados y coste real.
9. Revisar la viabilidad OTP indicada en `infra/otp/README.md`.

## Variables por proyecto

**Web/EVE:** `MOBILITY_MCP_URL` (HTTPS en cloud), `MOBILITY_MCP_TOKEN`, `EVE_MODEL`; OIDC de Vercel para Gateway. La clave OpenAI BYOK se gestiona en Gateway, no en el contexto del modelo.

**Core:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `MOBILITY_JWT_SECRET`, `MOBILITY_JWT_ISSUER`, `MOBILITY_JWT_AUDIENCE`. Después, credenciales de adaptadores y opciones de activación.

Las banderas `INGESTION_ENABLED` y `OTP_SANDBOX_ENABLED` documentan los interruptores requeridos; **aún no hay un consumidor ni un proveedor OTP que las ejecute**. No confundir variables declaradas con integraciones implementadas.

## Migraciones remotas

El script rechaza hosts no locales sin `--allow-remote`. Usar una conexión unpooled suministrada por el entorno, revisar destino, respaldo y SQL antes de ejecutarlo:

```bash
node scripts/migrate.mjs --allow-remote
```

El script verifica checksums y aplica migraciones en una transacción bajo advisory lock. Nunca se ejecuta automáticamente durante un build de Vercel.

## Operación

- Workflow queda reservado a conversaciones; Queues, a ingestión con ventana activa.
- No hay Cron de tiempo real, colas autorecurrentes ni Sandbox OTP activado por esta preparación.
- No tratar las 129.600 ejecuciones teóricas mensuales como estimación de coste: contar envíos, entregas, reintentos, CPU, red y almacenamiento.
- El JWT de desarrollo expira en siete días. Las claves externas tienen ciclos de vida independientes: comprobar condiciones actuales de cada proveedor, no copiar fechas del brief sin validarlas.
- No se ha comprobado end-to-end una sesión de modelo ni un despliegue cloud. El smoke local prueba servicios HTTP y MCP.

Referencias: [monorepos Vercel](https://vercel.com/docs/monorepos), [control de despliegues Git](https://vercel.com/docs/project-configuration/git-configuration), [AI Gateway](https://vercel.com/docs/ai-gateway), [condiciones Hobby](https://vercel.com/docs/plans/hobby).
