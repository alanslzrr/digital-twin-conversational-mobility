# Instalación inicial local

[Índice](index.md) · [Cuentas y claves](resources/accounts.md) · [Arranque cotidiano](local-runtime.md)

Esta guía prepara una **instalación nueva**. Si ya está instalada, sigue el [arranque cotidiano](local-runtime.md#inicio-y-parada), que reutiliza los datos y el grafo existentes.

Ejecuta los comandos desde la raíz del repositorio.

## En esta página

- [Requisitos](#requisitos)
- [Entorno y claves](#entorno-y-claves)
- [Base y cuenta de acceso](#base-y-cuenta-de-acceso)
- [Datos y routing](#datos-y-routing)
- [Meteorología y geocodificación](#meteorología-y-geocodificación)
- [Compilar y arrancar](#compilar-y-arrancar)

## Requisitos

| Requisito | Versión/configuración del repositorio | Para qué |
| --- | --- | --- |
| Node.js | 24.21.0; rama 24, según `.nvmrc` y `package.json` | Aplicaciones y scripts |
| pnpm | 10.30.3 | Dependencias y comandos |
| Python | 3.11 o posterior | Preparación GTFS/OSM |
| Docker con Compose | Motor local activo | PostGIS, Redis disponible y OTP |
| Internet | Acceso a fuentes y proveedores LLM | Descargas y conversación; los tests offline no lo requieren |
| Puertos loopback libres | 3000, 3001, 4274, 8801, 55432, 56379 | [Mapa de servicios](reference/system.md#servicios-y-versiones) |

OTP tiene configurados heap de 4 GiB, límite de contenedor de 6 GiB y 4 CPU. Reserva además recursos de Docker para PostGIS y los demás procesos.

## Entorno y claves

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
pnpm setup:local
```

`setup:local` genera secretos locales aleatorios, no los imprime y conserva los archivos existentes. No uses `pnpm setup`: ese es un comando integrado de pnpm, no este instalador.

1. Solicita las claves de fuentes siguiendo [las altas oficiales](resources/accounts.md).
2. Añade `EMT_CLIENT_ID`, `EMT_PASSKEY` y `AEMET_API_KEY` solo a `apps/mobility-core/.env.local`.
3. Prepara la clave maestra de Core según [cuentas y LLM](accounts-and-llm.md#migrar-una-instalación). Las keys LLM se incorporan por el formulario de solo escritura, nunca al entorno Web.
4. Conserva estos archivos fuera de Git. Nunca uses variables `NEXT_PUBLIC_*` para secretos. Deja consumo LLM y correo deshabilitados hasta aprobación explícita.

Consulta las [variables de cada componente](reference/system.md#variables-y-secretos) y la [configuración del modelo](reference/system.md#servicios-y-versiones).

## Base y cuenta de acceso

```sh
pnpm infra:up
pnpm db:migrate
pnpm db:check
```

Aplica las migraciones 0001–0022 en orden, fuera del build. La primera cuenta administrativa, TOTP y las invitaciones se preparan con el [procedimiento de bootstrap](accounts-and-llm.md#migrar-una-instalación). Las cuentas existentes mantienen sus IDs. No se generan contraseñas en archivos ni financiación implícita.

## Datos y routing

La instalación de routing tiene dos etapas: crear la base Renfe y activar después la release multioperador. El activador utiliza la primera como versión de recuperación.

### 1. Crear la base inicial Renfe

Solo si aún no existe una instalación de routing:

```sh
pnpm otp:prepare
pnpm otp:build
pnpm gtfs:import
pnpm otp:up
```

Se descargan fuentes oficiales cuando faltan, se prepara Renfe Madrid con calles OSM y se importa el mismo catálogo usado por el grafo. El siguiente paso amplía esta base con los demás operadores.

Los comandos legacy `otp:prepare`/`otp:build` no se deben repetir sobre una instalación que ya usa `data/otp` como enlace a una release. Usa el procedimiento siguiente para ampliarla o actualizarla.

### 2. Preparar y activar la cobertura multioperador

```sh
python3 scripts/prepare-routing-release.py --refresh
# Sustituye <release-id> por el identificador que imprime el preparador.
node scripts/build-routing-release.mjs <release-id>
```

El preparador obtiene Renfe/OSM y los feeds CRTM, incluido EMT GTFS. Prepara catálogos y comprueba qué calendarios permiten routing. No modifica el grafo ni la base activos.

1. Mantén las aplicaciones y el worker detenidos; Postgres debe seguir activo.
2. Crea y verifica un [respaldo privado](local-runtime.md#respaldo-y-recuperación).
3. Activa la release:

```sh
node --env-file=.env.local scripts/activate-routing-release.mjs activate <release-id> --maintenance
```

La activación importa catálogos y recrea OTP de forma coordinada. El catálogo Metro puede conservarse sin horarios vigentes ni routing actual. No importes un feed aislado de otra versión sobre el grafo activo. [Procedimiento, diagrama y rollback](routing-releases.md).

### 3. Importar EMT API y habilitar adquisición

Con la aplicación EMT aprobada y sus claves configuradas:

```sh
pnpm emt:import
pnpm mobility:enable
```

La API EMT aporta catálogo, llegadas y avisos; el GTFS publicado por CRTM aporta los horarios del grafo. `mobility:enable` habilita las fuentes configuradas. El worker se arranca con las aplicaciones en el último paso. Mientras EMT modera la aplicación, puedes preparar las fuentes públicas.

Las importaciones actuales incluyen accesibilidad estática. `backfill-renfe-accessibility.mjs` se reserva para actualizar exports antiguos compatibles, según [el acta](acceptance/2026-09-29-static-accessibility.md); no es necesario repetirlo tras una importación actual.

## Meteorología y geocodificación

### Geografía municipal para predicciones

Descarga el [extracto oficial IGN ES30](https://api-features.ign.es/collections/administrativeunit/items?f=json&limit=200&codnut2=ES30&nationallevelname=Municipio) a un archivo local bajo `data/sources/`. Después importa el archivo, sustituyendo la ruta de ejemplo:

```sh
node --env-file=.env.local scripts/import-weather-geography.mjs data/sources/ign-madrid.geojson
```

El importador exige los 179 municipios y geometrías válidas; excluye territorios especiales sin código municipal AEMET. Si rechaza el archivo, revisa los códigos municipales y las geometrías de la descarga oficial. [Fuentes y licencia IGN](resources/index.md#meteorología-y-geografía).

El catálogo de 25 estaciones AEMET se incluye en el código. La clave AEMET sirve para observaciones y predicción horaria. La diaria XML y los avisos CAP son productos públicos. La adquisición la gestiona el worker/caché existente.

### Respaldo externo para lugares públicos

Para activar Nominatim, acepta su política y configura las [cuatro variables](resources/accounts.md#nominatim-público). El repositorio lo deja desactivado por defecto. El servicio público funciona sin API key y el chat solicita consentimiento antes de una búsqueda externa.

## Compilar y arrancar

```sh
pnpm check
pnpm build:agent
pnpm start:local
```

`pnpm check` valida y compila Web/Core. `build:agent` prepara el runtime EVE con Docker local. `start:local` arranca Core, Web/agente y worker, pero no inicia la infraestructura.

Abre [el chat](http://127.0.0.1:3000/evaluation). Usa `pnpm smoke --production` para una comprobación de arranque sin modelo. Enviar un mensaje real requiere consumo habilitado y una credencial o patrocinio explícitos; puede generar gasto en el proveedor seleccionado.

Para el próximo uso basta con [el arranque cotidiano](local-runtime.md#inicio-y-parada). Fuentes e implementación de los pasos: [scripts](../scripts), [Compose](../infra/local/compose.yaml), [migraciones](../infra/postgres/migrations), [entrega local](acceptance/2026-09-25-local-delivery.md) y [release multioperador](acceptance/2026-09-25-routing-releases.md).
