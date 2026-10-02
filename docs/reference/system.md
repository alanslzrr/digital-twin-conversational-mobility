# Referencia del sistema

[Índice](../index.md) · [Arquitectura](../architecture.md) · [MCP](mcp.md) · [Instalación](../installation.md)

## En esta página

- [Servicios y versiones](#servicios-y-versiones)
- [Mapa del código](#mapa-del-código)
- [Variables y secretos](#variables-y-secretos)
- [Persistencia](#persistencia)
- [Cadencias y frescura](#cadencias-y-frescura)
- [Comandos y permisos](#comandos-y-permisos)

## Servicios y versiones

Valores del repositorio al 02/10/2026; no son una consulta al runtime.

| Componente | Dirección/configuración | Responsabilidad |
| --- | --- | --- |
| Web Next.js + EVE oficial 0.65.0 | `127.0.0.1:3000` | Chat y canal autorizado |
| Mobility Core Next.js | `127.0.0.1:3001` | MCP, Better Auth 1.7.5 y movilidad |
| Agente EVE | `127.0.0.1:4274` | Ejecución de conversaciones; supervisado por Web |
| OTP 2.10.0 | `127.0.0.1:8801/otp/gtfs/v1` | Rutas previstas; imagen fijada por digest |
| PostgreSQL/PostGIS | `127.0.0.1:55432`; imagen `postgis/postgis:17-3.5` | Estado y geometrías; amd64 en Compose |
| Redis 7.4 | `127.0.0.1:56379` | Disponible, no necesario para la vertical actual |
| OpenAI directo | Servidor externo | Modelo fijo `gpt-6-luna`, Responses, `store:false` |

[Compose](../../infra/local/compose.yaml), [dependencias Web](../../apps/eve-web/package.json), [dependencias Core](../../apps/mobility-core/package.json) y [modelo](../../apps/eve-web/src/model.ts) son la referencia exacta.

## Mapa del código

| Ubicación | Qué contiene |
| --- | --- |
| [Web](../../apps/eve-web) | Canal EVE, acceso, UI oficial, historial propio y modelo |
| [Agente](../../apps/eve-web/agent/agent.ts) | Instrucciones, conexión MCP, límites y hooks |
| [Guard EVE](../../apps/eve-web/src/evaluation-guard.ts) | Origen, identidad, propiedad y cuotas |
| [Core](../../apps/mobility-core/src) | Coordinación de fuentes, cachés, consultas y routing |
| [Adaptadores](../../apps/mobility-core/src/adapters) | Transporte y normalización específica de proveedores |
| [Catálogos](../../apps/mobility-core/src/catalogs) | Metadatos versionados de redes, estaciones y tarifas |
| [Contratos](../../packages/contracts/src) | Schemas de entrada y estructuras compartidas |
| [Dominio](../../packages/domain/src) | Reglas de tiempos, identidad, rutas, meteorología y tarifas |
| [Procedencia](../../packages/provenance/src) | Cálculo de frescura/calidad |
| [Scripts](../../scripts) | Bootstrap, importadores, operación y comprobaciones |
| [Migraciones](../../infra/postgres/migrations) | Evolución SQL, checksum y orden |
| [Fronteras](../../scripts/check-boundaries.mjs) | Impide importar proveedores/DB desde Web |

## Variables y secretos

Usa [los ejemplos raíz](../../.env.example), [Web](../../apps/eve-web/.env.example) y [Core](../../apps/mobility-core/.env.example), nunca copies un `.env.local` a la documentación. [Alta y renovación](../resources/accounts.md).

| Variables | Propietario | Preparación/uso |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_PASSWORD` | Raíz local/Compose; DB solo Core y scripts | Generadas/configuradas por `setup:local` |
| `OPENAI_API_KEY` | Raíz privada → servidor Web | `configure:openai`; no Core, navegador ni contexto del modelo |
| `MOBILITY_JWT_SECRET`, `MOBILITY_JWT_ISSUER`, `MOBILITY_JWT_AUDIENCE` | Core y bootstrap | Verificación de credenciales de servicio |
| `MOBILITY_MCP_URL`, `MOBILITY_MCP_TOKEN` | Servidor Web | MCP fijo, JWT con caducidad; no navegador |
| `BETTER_AUTH_SECRET` | Core | Firma de sesiones, generado en setup |
| `EVALUATION_ORIGIN` | Web y Core | Origen común, local `http://127.0.0.1:3000` |
| `MOBILITY_ALLOWED_ORIGIN` | Core, opcional | Restricción adicional si se envía un origen en MCP |
| `EMT_CLIENT_ID`, `EMT_PASSKEY`, `AEMET_API_KEY` | Solo Core | Alta manual; no variables públicas |
| `INGESTION_ENABLED`, `ACTIVE_WINDOW_SECONDS`, `LOCAL_DATA_DIR` | Core | Adquisición local, ventana (1800 s por defecto) y archivos |
| `OTP_URL` | Core | GraphQL local; no acceso directo desde el chat |
| `GEOCODER_ENABLED`, `GEOCODER_URL`, `GEOCODER_USER_AGENT`, `GEOCODER_PUBLIC_POLICY_ACCEPTED` | Core, opt-in | [Nominatim público autorizado](../sources/geocoding.md) |
| `MOBILITY_BUDGET_MODE` | Proceso EVE; normal `interactive` | `campaign` solo experimental opt-in; no requisito del chat |
| `DATABASE_URL_UNPOOLED`, `UPSTASH_REDIS_REST_*`, `BLOB_READ_WRITE_TOKEN`, `OTP_SANDBOX_ENABLED` | Preparación cloud/Core | No necesarios en local; no significan despliegue activo |

`setup:local --refresh-token` renueva el JWT local, no la clave EMT/AEMET/OpenAI. El origen no se corrige desactivando CSRF. [Problemas frecuentes](../troubleshooting.md).

## Persistencia

| Datos | Dónde | Semántica/retención |
| --- | --- | --- |
| Lugares y referencias externas | PostgreSQL/PostGIS | UUID estable, namespaces separados; no unión por nombre |
| GTFS y catálogos | Tablas estáticas y exports versionados | Calendarios por fuente; release sincroniza con grafo |
| Estado, salud, actividad y leases | PostgreSQL | Control compartido entre worker y consultas |
| Histórico de movilidad | Revisiones en PostgreSQL | Retención objetivo 24 h; `event`/`knowledge`; purga con actividad |
| Raw | `data/`, gzip y checksum cuando procede | Deduplicado por contenido; objetivo 24 h; sin tokens de login |
| Llegadas EMT | Caché PostgreSQL | Refresco bajo demanda; checksum, sin archivo raw de autenticación |
| Meteorología por producto/área | Caché PostgreSQL | Demanda y revisión compartidas; vigencia original independiente de descarga |
| Geocoder | Caché/entidades PostgreSQL | Positiva 7 días, negativa 1 hora; hash de consulta, no consulta en claro; hasta 5000 entradas |
| Tarifas parking | Catálogo en código | Documentación contrastada, no caché del SOAP ni descarga por chat |
| Auth y propiedad de chats | PostgreSQL Core | Identidad, cuota e índice de sesiones; no cuerpo de mensajes |
| Mensajes de conversaciones | Runtime EVE/Workflow | Recuperación nativa; no copia en Core; no purga física implementada |
| Grafo y releases | `data/routing-releases/`, enlace `data/otp` | Fuentes/configuración/hash; versión anterior conservada para rollback |

Las migraciones 0001–0007 establecieron la base local; 0008–0009 añadieron experimentos conversacionales; 0010–0012 continuidad/destinos/revisiones; 0013 EMT; 0014 CRTM; 0015 geocoder; 0016 releases; 0017 DGT; 0018 meteorología; 0019 accesibilidad; 0020 diaria. El [migrador](../../scripts/migrate.mjs) aplica todas las pendientes con bloqueo, transacción y checksum.

## Cadencias y frescura

Son políticas locales, **no promesas de frecuencia del proveedor**. La actividad, un error o una lease pueden retrasar un intento. Hora de observación, descarga y expiración se conservan separadas.

| Producto dinámico | Adquisición/revisión mínima | Frescura de referencia |
| --- | --- | --- |
| Renfe viajes | 20 s | 40 s |
| Renfe avisos | 30 s | 90 s |
| EMT avisos | 120 s | 600 s de publicación |
| EMT llegadas | Bajo demanda, caché 30 s y cooldown global 5 s | Evaluación de la estimación y su edad |
| BiciMAD | Máximo de 20 s y TTL del feed | 60 s por estación |
| DGT | 60 s | 180 s de publicación |
| Aire | 10 min | 2 h por medida |
| Tráfico | 5 min | 15 min |
| Ocupación parking | 1 min | 5 min por categoría |
| AEMET observaciones | 10 min, adquisición regional compartida | 2 h por estación |
| Predicciones horaria/diaria | 30 min, demanda por municipio | Publicación, intervalo y horizonte propios |
| Avisos CAP | 5 min con demanda | Vigencia y estado del aviso |

La meteorología observada filtra una descarga conjunta a las 25 estaciones del catálogo. Los 20 km acotan la selección por ubicación, no garantizan que la estación represente cada calle. La diaria conserva sus intervalos y extremos; no se interpola para inventar temperatura horaria.

[Políticas de ingestión](../../packages/domain/src/ingestion.ts), [caché meteorológica](../../apps/mobility-core/src/weather-cache.ts), [selección observada](../../packages/domain/src/weather-observations.ts) y [productos/fuentes](../sources/README.md).

## Comandos y permisos

[El `package.json`](../../package.json) es el catálogo ejecutable; no existe un comando genérico que despliegue todo local y cloud a la vez.

| Grupo | Scripts | Efecto |
| --- | --- | --- |
| Configuración | `setup:local`, `configure:openai`, `mobility:enable` | Escriben entorno privado; el último también habilita fuentes en DB |
| Infraestructura | `infra:up/down`, `otp:up/down` | Modifican procesos Docker; `down` sin `-v` conserva volúmenes |
| Datos | `db:migrate`, `gtfs:import`, `emt:import`, scripts de release/IGN | Modifican base/archivos; usar procedimiento y respaldo |
| Aplicaciones | `dev`, `build`, `build:agent`, `start:local` | Desarrollo, compilación o ejecución; build no hace inferencias |
| Calidad | `check`, `smoke`, `smoke:evaluation` | Distinguir offline y servicios locales; smoke evaluación usa cuentas temporales |
| Fuentes | `ingest`, `worker`, `smoke:mobility`, `smoke:routing` | Pueden activar adquisición; no forman parte del check offline |
| Experimentos existentes | `budget:report`, `test:budget:db`, `otp:benchmark`, modos `--live*` | Opt-in; no obligaciones de cierre. Modelo/benchmarks requieren decisión específica |
| Cloud | `configure:vercel`, `check-cloud.mjs` | Separados; no ejecutar durante operación local normal |

Scopes: lectura `mobility.read`, administración de evaluación `mobility.evaluation.manage` y gestión de ingestión `mobility.ingestion.manage`. [Autorización](../../apps/mobility-core/src/auth.ts) y [rutas Core](../../apps/mobility-core/app/api) mantienen esa separación.

**Evidencia y referencias:** [archivo de actas](../acceptance/index.md), [recursos](../resources/index.md), [operación local](../local-runtime.md).
