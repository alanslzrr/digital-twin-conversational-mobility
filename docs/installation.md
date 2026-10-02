# Instalación inicial local

[Índice](index.md) · [Cuentas y claves](resources/accounts.md) · [Arranque cotidiano](local-runtime.md)

Esta guía prepara una **instalación nueva**. Si el proyecto ya funciona, usa el arranque cotidiano: no reimportes datos ni reconstruyas OTP para volver a abrir el chat.

Los comandos se ejecutan desde la raíz del repositorio. Esta guía documenta los scripts; no afirma que se haya reinstalado la máquina durante la revisión documental.

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
| Internet | Acceso a fuentes y OpenAI | Descargas y conversación; los tests offline no lo requieren |
| Puertos loopback libres | 3000, 3001, 4274, 8801, 55432, 56379 | [Mapa de servicios](reference/system.md#servicios-y-versiones) |

OTP tiene configurados heap de 4 GiB, límite de contenedor de 6 GiB y 4 CPU. Son **valores configurados**, no un mínimo de memoria medido. Docker también necesita recursos para PostGIS y los demás procesos.

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

1. Solicita las claves siguiendo [las altas oficiales](resources/accounts.md).
2. Añade `OPENAI_API_KEY` a `.env.local` de la raíz, con un editor privado.
3. Ejecuta `pnpm configure:openai`. Copia solo esa clave al servidor Web.
4. Añade `EMT_CLIENT_ID`, `EMT_PASSKEY` y `AEMET_API_KEY` a `apps/mobility-core/.env.local`.
5. Conserva estos archivos fuera de Git. Nunca uses variables `NEXT_PUBLIC_*` para secretos.

El modelo ya está fijado a `gpt-6-luna`; no necesitas Gateway, Firebase, Google OAuth ni otra clave de modelo. Las variables generadas y opcionales se explican en [configuración](reference/system.md#variables-y-secretos).

## Base y cuenta de acceso

```sh
pnpm infra:up
pnpm db:migrate
pnpm db:check
pnpm evaluator create 1 evaluador@example.test Evaluador
```

El correo es **un ejemplo de identificador**, no una cuenta real ni un envío de email. Sustitúyelo por el acordado. El comando guarda la contraseña en un archivo privado de `data/evaluators/`. No repitas `create` si el slot ya existe. [Gestión de cuentas](evaluation.md).

Las migraciones se aplican todas, en orden (0001–0020 en esta revisión), incluidas las tablas de experimentos aunque no se utilicen. No migres durante un build.

## Datos y routing

Hay dos etapas en una instalación vacía. El activador de releases necesita una base anterior coherente para poder volver atrás. **No basta con activar una release sobre una carpeta vacía.**

### 1. Crear la base inicial Renfe

Solo si aún no existe una instalación de routing:

```sh
pnpm otp:prepare
pnpm otp:build
pnpm gtfs:import
pnpm otp:up
```

Se descargan fuentes oficiales cuando faltan, se prepara Renfe Madrid con calles OSM y se importa el mismo catálogo usado por el grafo. Esto es la base de arranque, **no toda la cobertura actual**.

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

La API EMT aporta catálogo/llegadas/avisos; **no es el mismo producto que EMT GTFS**. `mobility:enable` activa las fuentes locales según configuración; no inicia el worker ni hace vigente una clave. Si aún no hay aprobación EMT, las capacidades de esa API no estarán disponibles; no bloquea las fuentes públicas.

Las importaciones actuales incluyen accesibilidad estática. `backfill-renfe-accessibility.mjs` se reserva para actualizar exports antiguos compatibles, según [el acta](acceptance/2026-09-29-static-accessibility.md); no es necesario repetirlo tras una importación actual.

## Meteorología y geocodificación

### Geografía municipal para predicciones

Descarga el [extracto oficial IGN ES30](https://api-features.ign.es/collections/administrativeunit/items?f=json&limit=200&codnut2=ES30&nationallevelname=Municipio) a un archivo local bajo `data/sources/`. Después importa el archivo, sustituyendo la ruta de ejemplo:

```sh
node --env-file=.env.local scripts/import-weather-geography.mjs data/sources/ign-madrid.geojson
```

El importador exige los 179 municipios y geometrías válidas; excluye territorios especiales sin código municipal AEMET. No dibujes polígonos de sustitución si rechaza la descarga. [Fuentes y licencia IGN](resources/index.md#meteorología-y-geografía).

El catálogo de 25 estaciones AEMET está versionado en código; no necesita importar una base aparte. La clave AEMET sirve para observaciones y predicción horaria. La diaria XML y los avisos CAP son productos públicos. La adquisición la gestiona el worker/caché existente.

### Respaldo externo para lugares públicos

Nominatim fue autorizado para esta instalación, pero el repositorio lo deja desactivado por defecto. Para otra instalación, el responsable debe aceptar su política y configurar las [cuatro variables y restricciones](resources/accounts.md#nominatim-público). No hay que solicitar una API key. El consentimiento de una búsqueda concreta sigue siendo necesario.

## Compilar y arrancar

```sh
pnpm check
pnpm build:agent
pnpm start:local
```

`pnpm check` valida y compila Web/Core. `build:agent` prepara el runtime EVE con Docker local; **no es el Sandbox cloud de OTP** ni hace inferencias. `start:local` arranca Core, Web/agente y worker, pero no inicia la infraestructura.

Abre [el chat](http://127.0.0.1:3000/evaluation). Usa `pnpm smoke --production` para una comprobación de arranque sin modelo. Enviar un mensaje real sí usa la clave y créditos de OpenAI.

Para el próximo uso basta con [el arranque cotidiano](local-runtime.md#inicio-y-parada). Fuentes e implementación de los pasos: [scripts](../scripts), [Compose](../infra/local/compose.yaml), [migraciones](../infra/postgres/migrations), [entrega local](acceptance/2026-09-25-local-delivery.md) y [release multioperador](acceptance/2026-09-25-routing-releases.md).
