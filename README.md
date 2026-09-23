# Madrid Mobility Twin

Base de desarrollo para un gemelo digital de movilidad de Madrid y su interfaz conversacional. Evaluación prevista: hasta cinco usuarios.

**Estado: entorno preparado; producto todavía no operativo.** No se fabrican rutas, incidencias ni llegadas. Las diez fuentes del catálogo devuelven `not_initialized` hasta implementar y activar sus adaptadores.

## Arquitectura

```text
Fuentes → Adaptadores → Raw / Normalización → Identidad y estado canónico
                                                     ↓
                                  Routing / Place Resolver / Dominio
                                                     ↓
                                              Mobility MCP
                                                     ↓
                                              EVE + Next.js
```

Dos proyectos Vercel independientes: `mobility-twin-web` y `mobility-twin-core`. El agente solo conoce el MCP; no recibe credenciales de fuentes o almacenamiento. La arquitectura objetivo y lo realmente implementado se distinguen en [docs/architecture.md](docs/architecture.md).

## Inicio local

Requisitos: NVM o Node **24.21.0**, pnpm **10.30.3**, Docker con Compose. Los puertos usados son 3000, 3001, 55432 y 56379.

```bash
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
pnpm setup:local
pnpm infra:up
pnpm db:migrate
pnpm db:check
pnpm dev
```

- Web: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- Core: [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)
- MCP privado: `http://127.0.0.1:3001/mcp`

`setup:local` crea credenciales locales aleatorias sin imprimirlas ni sobrescribir archivos existentes. No usa servicios cloud. El JWT local caduca a los siete días; se renueva con `pnpm setup:local --refresh-token`.

No uses `pnpm setup`: es un comando integrado de pnpm, no el bootstrap de este proyecto.

### Verificación

```bash
pnpm env:doctor
pnpm check                  # formato, límites de dependencia, tipos, tests y builds Next
pnpm build:agent            # compila el runtime EVE, sin llamar a un modelo
pnpm smoke                  # con ambas aplicaciones arrancadas: HTTP + autenticación + MCP
pnpm smoke --production     # con pnpm start: también EVE health y rechazo de sesión anónima
pnpm infra:down             # detiene servicios sin eliminar volúmenes
```

No hay modelos ni claves cloud predeterminados. La página inicial es una pantalla de preparación, no un chat. Para ejecutar una sesión local de EVE después de configurar Gateway, define `EVE_MODEL` y credenciales locales en `apps/eve-web/.env.local`. El despliegue usa OIDC y BYOK configurado en Gateway; no copies claves de OpenAI al MCP.

## Qué incluye esta base

| Componente | Estado real |
| --- | --- |
| Monorepo pnpm / TypeScript / Turborepo | Configurado, dependencias fijadas y lockfile |
| Next.js + integración EVE | Configurada; selección de modelo explícita |
| Herramientas generales EVE | Desactivadas: sin bash, web fetch o búsqueda |
| Mobility MCP | Autenticado; solo `get_source_health` |
| Contratos y frescura | Schemas y tests; observado ≠ ingerido |
| PostgreSQL/PostGIS + Redis local | Compose con credenciales y puertos loopback |
| Migraciones | Checksum, transacción y bloqueo; idempotentes |
| CI | Tipos, lint, tests, build, EVE, PostGIS y smoke MCP sin secretos cloud |
| Fuentes reales y normalizadores | Pendientes |
| Queues / ingesta adaptativa | SDK instalado; consumidor aún no implementado |
| Neon, Upstash y Blob cloud | Pendientes de aprovisionamiento y credenciales |
| OTP Sandbox | SDK preparado; benchmark y lifecycle pendientes |
| Autenticación de evaluadores | Pendiente; acceso productivo cerrado |

Redis local permite preparar políticas/locks, pero **no emula la API REST de Upstash**; el cliente de caché y su adaptación local siguen pendientes. No hay una equivalencia fingida entre ambos servicios.

## Estructura

```text
apps/eve-web/          Next.js, configuración EVE y conexión MCP
apps/mobility-core/    MCP, autorización y futura ingesta/dominio
packages/contracts/   schemas compartidos y tipos
packages/domain/      catálogo canónico y diagnósticos iniciales
packages/provenance/  cálculo de frescura y calidad
infra/local/          PostgreSQL/PostGIS y Redis de desarrollo
infra/postgres/       migraciones SQL
infra/otp/            criterios de viabilidad para el routing
scripts/              bootstrap, doctor, migraciones, límites y smoke
docs/                 arquitectura, despliegue y plan de implementación
```

No se han creado adaptadores vacíos para aparentar cobertura. Se añadirán como paquetes cuando exista una primera implementación verificada.

## GitHub y despliegue

Repositorio privado; rama estable `main`, ramas de trabajo `alanslzrr/<tema>`, Conventional Commits. Las acciones están fijadas por SHA; Dependabot propone actualizaciones. Revisa [SECURITY.md](SECURITY.md) antes de publicar un servicio.

Los dos `vercel.json` desactivan despliegues automáticos por Git. No hay Cron de tiempo real ni colas activas. Sigue [docs/deployment.md](docs/deployment.md) para habilitar recursos y acceso deliberadamente; consulta [docs/roadmap.md](docs/roadmap.md) para el siguiente trabajo.

Para probar los builds en modo productivo local, ejecuta en dos terminales `pnpm --filter @mobility/core start` y `pnpm --filter @mobility/eve-web start`. Este último supervisa EVE en el puerto loopback 4274 además de Next en 3000. La compilación EVE prepara un template Docker local; no es el Sandbox cloud de OTP.
