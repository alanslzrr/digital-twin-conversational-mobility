# Operación local

[Índice](index.md) · [Instalación inicial](installation.md) · [Cuentas](evaluation.md) · [Diagnóstico](troubleshooting.md)

Procedimientos de arranque, actualización y recuperación de una instalación preparada. Para crearla desde cero, sigue la [instalación inicial](installation.md). El [registro operativo anterior](acceptance/local-runtime-history.md) recoge las pruebas y transiciones de las primeras entregas.

## En esta página

- [Inicio y parada](#inicio-y-parada)
- [Comprobaciones disponibles](#comprobaciones-disponibles)
- [Actualizar código o configuración](#actualizar-código-o-configuración)
- [Respaldo y recuperación](#respaldo-y-recuperación)
- [Actualizar datos](#actualizar-datos)
- [Credenciales y caducidades](#credenciales-y-caducidades)
- [Control conversacional E2](#control-conversacional-e2)
- [Actividad y retención](#actividad-y-retención)

## Inicio y parada

Desde la raíz, con Docker activo y builds existentes:

```sh
pnpm infra:up
pnpm otp:up
pnpm start:local
```

Abre [EVE local](http://127.0.0.1:3000/evaluation). `start:local` supervisa Core, Web, agente y worker. No arranques otro supervisor en los mismos puertos. Si ya están activos, utiliza esa instalación.

Para parar:

1. Pulsa **Ctrl-C en la terminal del supervisor**. Detiene sus procesos, no otros programas del ordenador.
2. Si también quieres detener routing, ejecuta `pnpm otp:down`.
3. Si quieres detener la infraestructura, ejecuta `pnpm infra:down`. Conserva volúmenes; no añadas `-v`.

Para desarrollar, `pnpm dev` y `pnpm worker` se ejecutan por separado, con PostGIS/OTP preparados. No mezcles este modo con el supervisor productivo.

## Comprobaciones disponibles

| Comando | Qué comprueba o cambia |
| --- | --- |
| `pnpm check` | Lint, fronteras, tipos, tests offline y builds; sin claves cloud ni inferencias |
| `pnpm build:agent` | Compila EVE con Docker; sin inferencias |
| `pnpm env:doctor` | Requisitos, existencia de archivos de entorno y logins opcionales; no imprime su contenido |
| `pnpm smoke --production` | HTTP, autenticación MCP, health EVE y rechazo anónimo con servicios arrancados |
| `pnpm smoke:evaluation` | Usa slots temporales 4/5 para login, CSRF, aislamiento, cuotas y revocación; no ejecutar si están ocupados |
| `pnpm smoke:mobility` | Consulta fuentes reales y MCP/OTP; abre actividad y puede adquirir datos |
| `pnpm smoke:routing` | Casos MCP/OTP locales; renueva actividad, sin modelo ni reinicio de servicios |

Elige el diagnóstico según el componente modificado o el fallo observado. Los modos `--live*` llaman al modelo y consumen créditos; se ejecutan expresamente, al igual que los benchmarks OTP.

Healths: [Core](http://127.0.0.1:3001/api/health), [Web](http://127.0.0.1:3000/api/health), [EVE a través de Web](http://127.0.0.1:3000/eve/v1/health). Los endpoints de salud comprueban disponibilidad de procesos. `get_source_health` informa de la antigüedad y los errores de las fuentes.

Para un smoke que controle sus propios ticks, `pnpm start:local --no-worker` evita otro worker concurrente. Al terminar, para ese supervisor y vuelve a `pnpm start:local`. El modo `smoke:mobility --port=3011 --read-only` exige Core alternativo con ingestión desactivada; no debe tratarse como acceso de solo lectura a un Core cualquiera.

## Actualizar código o configuración

Una modificación solo documental **no necesita recompilar ni reiniciar**.

Para una actualización funcional:

1. Revisa la PR, la compatibilidad y el estado de Git. No descartes trabajo local para sincronizar.
2. Para el supervisor de aplicaciones; mantén Postgres. Cambiar solo aplicaciones no obliga a reiniciar OTP.
3. Haz un respaldo si se modifican esquema/datos. Guarda también la revisión de código y la release activa.
4. Ejecuta `pnpm install --frozen-lockfile` si cambia el lockfile.
5. Ejecuta `pnpm db:migrate` para aplicar **todas** las migraciones pendientes, no solo la última.
6. Ejecuta `pnpm check` y `pnpm build:agent`.
7. Arranca `pnpm start:local` y comprueba `pnpm smoke --production`.
8. Usa una sesión EVE nueva si cambiaron instrucciones o contratos; un chat previo puede conservar su contexto anterior.

No mezcles un worker nuevo con un Core anterior. Revertir código tras una migración requiere comprobar compatibilidad; un checkout anterior no deshace el esquema. [Historial de migraciones](reference/system.md#persistencia).

## Respaldo y recuperación

Los dumps contienen datos privados de autenticación y propiedad de conversaciones. Guárdalos en `data/backups/`, con permisos restringidos, nunca en una PR.

Con escritores detenidos y Postgres activo:

```sh
umask 077
mkdir -p data/backups
backup="data/backups/local-$(date +%Y%m%d-%H%M%S).dump"
docker compose --env-file .env.local -f infra/local/compose.yaml exec -T postgres   sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
docker compose --env-file .env.local -f infra/local/compose.yaml exec -T postgres   pg_restore --list < "$backup" > /dev/null
```

`pg_restore --list` comprueba que el índice del dump es legible. Para verificar la recuperación completa, restaura la copia en una base aislada. Conserva también los manifiestos, releases y configuración privada: el dump incluye las tablas de Core; los mensajes EVE y archivos de `data/` tienen almacenamiento separado.

Para recuperar una actualización de routing utiliza primero [rollback/recover](routing-releases.md#volver-atrás-o-recuperar-una-activación), que conserva cuentas y conversaciones.

Una restauración íntegra sustituye los datos actuales por la copia elegida. Antes de ejecutarla, detén los escritores, respalda el estado actual y comprueba que el archivo corresponde a la revisión de código que vas a usar. El comando siguiente es **destructivo sobre la base local**; define `backup` con la ruta del archivo verificado antes de ejecutarlo:

```sh
docker compose --env-file .env.local -f infra/local/compose.yaml exec -T postgres   sh -c 'pg_restore --exit-on-error --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"'   < "$backup"
```

No restaures una base de Core de otra versión sobre un grafo distinto: recupera también su release compatible antes de arrancar.

## Actualizar datos

| Producto | Procedimiento vigente |
| --- | --- |
| GTFS/OSM/catálogos/grafo | [Release coordinada](routing-releases.md), preparada fuera del activo y activada en mantenimiento |
| EMT API catálogo | `pnpm emt:import` con credenciales Core y base local; conserva IDs estables; no actualiza el grafo |
| Municipios IGN | [Importación explícita](installation.md#meteorología-y-geocodificación); no descarga por viaje |
| Datos dinámicos | Worker/consultas dentro de ventana, caché y backoff; no reimportación manual por conversación |
| Precios parking | Contrastar fuentes oficiales, editar catálogo versionado y probar/recompilar Core; no copiar precios antiguos del SOAP |

<a id="emt-catálogo-y-llegadas-bajo-demanda-e7"></a>

### EMT: catálogo y llegadas bajo demanda (E7)

Las llegadas se consultan bajo demanda por parada. Una caché persistente de 30 s, un cooldown global de 5 s y los controles lease/backoff acotan la concurrencia. Cada resultado conserva destino, estimación y hora del proveedor. Su referencia raw contiene el checksum del resultado. [Evidencia EMT](acceptance/2026-09-25-emt.md).

### Precios de aparcamiento

[El catálogo tarifario](../apps/mobility-core/src/catalogs/parking-prices.ts) relaciona 15 IDs EMT con fuentes y perfiles de cálculo. Duraciones de 1–1.440 minutos para turismo; máximos y gratuidad condicionada se separan del coste ordinario. Las fechas futuras admiten proyecciones identificadas. La ocupación tiene reloj y fuente propios. [Acta](acceptance/2026-10-01-parking-prices.md).

## Credenciales y caducidades

- JWT de servicio local: siete días; renovar con `pnpm setup:local --refresh-token` y reiniciar aplicaciones para cargarlo. No cambia las claves del proveedor ni cuentas de evaluadores.
- OpenAI: editar la clave privada raíz y ejecutar `pnpm configure:openai`; reconstruir/reiniciar Web conforme al ciclo anterior.
- EMT/AEMET: editar solo el entorno privado de Core; reiniciar Core. Si una fuente estaba deshabilitada, volver a `pnpm mobility:enable` tras configurar la clave.
- AEMET: nuevas claves con tres meses de vigencia según el aviso comprobado el 02/10/2026. [Renovación y alta](resources/accounts.md#aemet).
- Cuenta evaluador: 30 días; propiedad del chat: siete días. Reset y revoke tienen efectos distintos. [Administración](evaluation.md).
- GTFS: consultar `serviceStart/serviceEnd` por feed en la release, no asumir cobertura indefinida. Las fechas registradas en una entrega no se renuevan al reiniciar OTP.

No imprimas tokens para diagnosticar ni desactives TLS. Un error de fuente se trata separado del login del usuario.

## Control conversacional E2

El modo normal es `interactive`: EVE pausa al llegar a sus umbrales y ofrece Approve/Stop. Aprobar permite continuar; detener conserva el historial. Los umbrales configurados son 100.000 tokens de entrada y 10.000 de salida por sesión, renovables; no son un coste monetario fijo. El modo experimental `campaign` se activa expresamente y mantiene su propio registro de consumo. [Acta E2](acceptance/2026-09-25-e2-closure.md) y [guía de uso](user-guide.md#historial-y-continuidad).

## Actividad y retención

Las interacciones autorizadas que consumen cuota y las consultas MCP ordinarias renuevan 30 minutos. Los agregados `get_line_status`, `get_network_status` y `get_mobility_snapshot` **no** lo hacen. El worker no se autoactiva.

Dos carriles procesan trabajos vencidos con lease de 90 s y backoff. El heartbeat informa del proceso; la frescura informa de los datos. Son señales distintas. [Cadencias y almacenamiento](reference/system.md).

Raw e histórico de movilidad tienen retención objetivo de 24 horas, purgada durante ticks activos. El apagado no ejecuta la purga. Puede conservarse el último snapshot antiguo, identificado como tal. Las conversaciones caducadas permanecen en el almacenamiento EVE hasta su borrado; la aplicación carece de purga automática de transcripciones.

**Implementación:** [supervisor](../scripts/start-local.mjs), [migrador](../scripts/migrate.mjs), [worker](../scripts/ingestion-worker.mjs), [operación de releases](routing-releases.md). **Evidencia histórica:** [entrega local](acceptance/2026-09-25-local-delivery.md) y [registro anterior](acceptance/local-runtime-history.md).
