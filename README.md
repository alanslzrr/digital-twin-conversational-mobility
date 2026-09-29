# Madrid Mobility Twin

Base de desarrollo para un gemelo digital de movilidad de Madrid y su interfaz conversacional. Evaluación prevista: hasta cinco usuarios.

**Estado: vertical local funcional con cobertura parcial.** Renfe, EMT, CRTM estático, DGT, BiciMAD, aire, tráfico, aparcamientos y AEMET integrados. El sistema planifica con Renfe, EMT, Metro Ligero, interurbanos y caminatas dentro de los datos disponibles; Core aplica RT/alertas Renfe y avisos EMT con límites explícitos. Metro de Madrid conserva catálogo, pero no ofrece horarios actuales ni trayectos en Metro en esta evaluación. Las correspondencias existentes son parciales y no garantizan accesibilidad ni tiempos de transbordo. Metro actual y nuevas correspondencias CRTM↔EMT/Renfe quedan fuera del cierre por acuerdo; los demás pendientes siguen en el [roadmap](docs/roadmap.md).

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

Dos aplicaciones locales independientes; el despliegue opcional conservaría dos proyectos Vercel: `mobility-twin-web` y `mobility-twin-core`. El agente solo conoce el MCP; no recibe credenciales de fuentes o almacenamiento. La arquitectura objetivo y lo realmente implementado se distinguen en [docs/architecture.md](docs/architecture.md).

## Inicio local

Requisitos: NVM o Node **24.21.0**, pnpm **10.30.3**, Docker con Compose. Los puertos usados son 3000, 3001, 4274, 8801, 55432 y 56379. Para datos/routing: Python ≥3.11 y memoria Docker suficiente.

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
# Añade OPENAI_API_KEY al .env.local raíz antes del siguiente paso
pnpm configure:openai
pnpm evaluator create 1 alan@mobility.test Alan
pnpm dev
```

- Web: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- Evaluación con login: [http://127.0.0.1:3000/evaluation](http://127.0.0.1:3000/evaluation)
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

El modelo está fijado a **`gpt-6-luna` mediante OpenAI Responses directamente**, sin Gateway ni fallback. `configure:openai` copia únicamente `OPENAI_API_KEY` al entorno servidor Web, nunca al Core o navegador. `pnpm check:openai` comprueba acceso al modelo; `pnpm check:openai --live` hace una llamada mínima de pago explícita.

El login usa **Better Auth con email y contraseña**, sin registro público ni OAuth. `evaluator create` guarda las credenciales en un archivo privado ignorado bajo `data/evaluators/`, sin imprimir contraseñas. Admite cinco cuentas, revocación y reset. Consulta [operación de evaluadores](docs/evaluation.md).

`pnpm smoke:evaluation` verifica login, aislamiento entre usuarios, CSRF, cuotas y revocación sin inferencia. `pnpm smoke:evaluation --live` añade un turno real con la herramienta MCP; requiere clave y consume créditos. Ambos necesitan los servidores productivos locales arrancados y dejan libres los slots temporales 4/5.

## Interfaz

Se utiliza el **Web Chat oficial incluido en EVE 0.65.0** (`eve add channel/web`), no un chat diseñado para este proyecto. Se mantienen tema, tipografía Geist, composer, Markdown, salida de herramientas y conversaciones por URL. `/`, `/evaluation` y `/s` requieren Better Auth; `/s/{sessionId}` reanuda únicamente sesiones del propietario. Nueva conversación no borra la anterior. Procedencia y adaptaciones: [vendor/eve](apps/eve-web/vendor/eve/README.md).

## Qué funciona localmente

Sigue [la preparación completa de datos, OTP y worker](docs/local-runtime.md). Tras prepararlos, `pnpm start:local` arranca Core, EVE y el worker. `pnpm smoke:mobility` verifica fuentes/rutas/MCP sin llamadas al modelo.

## Qué incluye esta base

| Componente | Estado real |
| --- | --- |
| Monorepo pnpm / TypeScript / Turborepo | Configurado, dependencias fijadas y lockfile |
| Next.js + integración EVE | GPT-6 Luna directo; turno real MCP verificado |
| Herramientas generales EVE | Desactivadas: sin bash, web fetch o búsqueda |
| Mobility MCP | Autenticado; dieciséis herramientas implementadas, cobertura explícita |
| Contratos y frescura | Schemas y tests; observado ≠ ingerido |
| PostgreSQL/PostGIS + Redis local | Compose con credenciales y puertos loopback |
| Migraciones | Checksum, transacción y bloqueo; idempotentes |
| CI | Tipos, lint, tests, build, EVE, PostGIS y smoke MCP sin secretos cloud |
| Fuentes reales y normalizadores | Renfe, EMT, CRTM estático, DGT, BiciMAD, AEMET, aire, tráfico y aparcamientos |
| Ingesta adaptativa local | Worker + Postgres, ventana/leases/backoff; no necesita Queues |
| Neon, Upstash y Blob cloud | Aprovisionados; conectividad verificada; sin deployments |
| OTP local | Releases multioperador; base prevista con RT/alertas Renfe y avisos EMT aplicados por Core; Metro actual excluido |
| Autenticación de evaluadores | Better Auth, cinco slots, ACL de sesión y cuotas |

Redis local queda disponible, pero esta vertical usa Postgres para estado/leases y no lo necesita. No se finge compatibilidad REST con Upstash.

## Estructura

```text
apps/eve-web/          Next.js, configuración EVE y conexión MCP
apps/mobility-core/    MCP, autorización, adaptadores, ingesta y routing local
packages/contracts/   schemas compartidos y tipos
packages/domain/      catálogo y políticas de cadencia/frescura
packages/provenance/  cálculo de frescura y calidad
infra/local/          PostgreSQL/PostGIS, Redis y perfil OTP
infra/postgres/       migraciones SQL
infra/otp/            configuración OTP fijada y límites de cobertura
scripts/              bootstrap, doctor, migraciones, límites y smoke
docs/                 arquitectura, despliegue y plan de implementación
```

Los adaptadores verificados están en `apps/mobility-core/src/adapters`. No se crean paquetes vacíos ni tools ficticias para aparentar cobertura.

## GitHub y despliegue

Repositorio privado; rama estable `main`, ramas de trabajo `alanslzrr/<tema>`, Conventional Commits. Las acciones están fijadas por SHA; Dependabot propone actualizaciones. Revisa [SECURITY.md](SECURITY.md) antes de publicar un servicio.

Los dos `vercel.json` desactivan despliegues automáticos por Git. No hay Cron de tiempo real ni colas activas. Sigue [docs/deployment.md](docs/deployment.md) para habilitar recursos y acceso deliberadamente; consulta [docs/roadmap.md](docs/roadmap.md) para el siguiente trabajo.

Para probar los builds en modo productivo local, ejecuta en dos terminales `pnpm --filter @mobility/core start` y `pnpm --filter @mobility/eve-web start`. Este último supervisa EVE en el puerto loopback 4274 además de Next en 3000. La compilación EVE prepara un template Docker local; no es el Sandbox cloud de OTP.
