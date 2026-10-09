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

Configuración contrastada con el código al 08/10/2026.

| Componente | Dirección/configuración | Responsabilidad |
| --- | --- | --- |
| Web Next.js + EVE oficial 0.65.0 | `127.0.0.1:3000` | Chat y canal autorizado |
| Mobility Core Next.js | `127.0.0.1:3001` | MCP, Better Auth 1.7.5 y movilidad |
| Agente EVE | `127.0.0.1:4274` | Ejecución de conversaciones; supervisado por Web |
| OTP 2.10.0 | `127.0.0.1:8801/otp/gtfs/v1` | Rutas previstas; imagen fijada por digest |
| PostgreSQL/PostGIS | `127.0.0.1:55432`; imagen `postgis/postgis:17-3.5` | Estado y geometrías; amd64 en Compose |
| Redis 7.4 | `127.0.0.1:56379` | Disponible, no necesario para la vertical actual |
| LLM multiproveedor | Solo Core puede acceder al destino externo | Catálogo administrado, Chat Completions/Responses, financiación explícita |

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
| `MOBAI_SECRET_KEY_FILE` | Solo Core | Archivo maestro AES-256 fuera del repositorio/DB, permisos 0600 |
| `MOBAI_LLM_ENABLED`, `MOBAI_EMAIL_ENABLED` | Solo Core, predeterminado `false` | Opt-in externo; siempre bloqueado en previews |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MOBAI_EMAIL_FROM`, `MOBAI_EMAIL_TRACKING_DISABLED` | Solo Core | Activación/recuperación; habilitación y DNS posteriores |
| `MOBILITY_JWT_SECRET`, `MOBILITY_JWT_ISSUER`, `MOBILITY_JWT_AUDIENCE` | Core y bootstrap | Verificación de credenciales de servicio |
| `MOBILITY_MCP_URL`, `MOBILITY_MCP_TOKEN` | Servidor Web | MCP fijo, JWT con caducidad; no navegador |
| `BETTER_AUTH_SECRET` | Core | Firma de sesiones, generado en setup |
| `EVALUATION_ORIGIN` | Web y Core | Origen común, local `http://127.0.0.1:3000` |
| `MOBILITY_ALLOWED_ORIGIN` | Core, opcional | Restricción adicional si se envía un origen en MCP |
| `EMT_CLIENT_ID`, `EMT_PASSKEY`, `AEMET_API_KEY` | Solo Core | Alta manual; no variables públicas |
| `INGESTION_ENABLED`, `ACTIVE_WINDOW_SECONDS`, `LOCAL_DATA_DIR` | Core | Adquisición local, ventana (1800 s por defecto) y archivos |
| `OTP_URL` | Core | GraphQL local; no acceso directo desde el chat |
| `GEOCODER_ENABLED`, `GEOCODER_URL`, `GEOCODER_USER_AGENT`, `GEOCODER_PUBLIC_POLICY_ACCEPTED` | Core, opt-in | [Nominatim público autorizado](../sources/geocoding.md) |
| `MOBILITY_BUDGET_MODE` | EVE y Core; normal `interactive` | Si cualquiera exige `campaign`, se aplica ese control adicional; nunca duplica el cargo |
| `DATABASE_URL_UNPOOLED`, `UPSTASH_REDIS_REST_*`, `BLOB_READ_WRITE_TOKEN`, `OTP_SANDBOX_ENABLED` | Preparación cloud/Core | [Configuración cloud](../deployment.md) |

`setup:local --refresh-token` renueva el JWT de servicio local. Las claves de proveedores se renuevan en sus respectivos paneles. Para errores de origen, comprueba que Web y Core comparten `EVALUATION_ORIGIN`. [Problemas frecuentes](../troubleshooting.md).

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
| Cuentas y consumo LLM | PostgreSQL Core, migración 0022 | Roles, MFA por sesión, catálogo versionado, secretos cifrados, grants, ledger y cola de correo; sin cuerpos conversacionales |
| Mensajes de conversaciones | Runtime EVE/Workflow | Recuperación nativa; no copia en Core; no purga física implementada |
| Grafo y releases | `data/routing-releases/`, enlace `data/otp` | Fuentes/configuración/hash; versión anterior conservada para rollback |

Las migraciones 0001–0007 establecieron la base local; 0008–0009 añadieron experimentos conversacionales; 0010–0012 continuidad/destinos/revisiones; 0013 EMT; 0014 CRTM; 0015 geocoder; 0016 releases; 0017 DGT; 0018 meteorología; 0019 accesibilidad; 0020 diaria; 0021 observabilidad del panel; 0022 cuentas y consumo multiproveedor. El [migrador](../../scripts/migrate.mjs) aplica todas las pendientes con bloqueo, transacción y checksum.

## Cadencias y frescura

La tabla indica intervalos mínimos de adquisición y umbrales de frescura definidos por la aplicación. El worker aplica la ventana de actividad, las leases y el backoff antes de adquirir datos. Las horas de observación, descarga y expiración se guardan por separado.

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

La meteorología observada filtra una descarga conjunta a las 25 estaciones del catálogo. La selección busca estaciones en un radio de 20 km e incluye la distancia en el resultado. La predicción diaria conserva los intervalos y extremos que publica AEMET.

[Políticas de ingestión](../../packages/domain/src/ingestion.ts), [caché meteorológica](../../apps/mobility-core/src/weather-cache.ts), [selección observada](../../packages/domain/src/weather-observations.ts) y [productos/fuentes](../sources/README.md).

## Comandos y permisos

[El `package.json`](../../package.json) define los comandos disponibles.

| Grupo | Scripts | Efecto |
| --- | --- | --- |
| Configuración | `setup:local`, `mobility:enable` | Escriben entorno privado; `mobility:enable` también habilita fuentes en DB |
| Infraestructura | `infra:up/down`, `otp:up/down` | Modifican procesos Docker; `down` sin `-v` conserva volúmenes |
| Datos | `db:migrate`, `gtfs:import`, `emt:import`, scripts de release/IGN | Modifican base/archivos; usar procedimiento y respaldo |
| Aplicaciones | `dev`, `build`, `build:agent`, `start:local` | Desarrollo, compilación o ejecución; build no hace inferencias |
| Cuentas | `accounts bootstrap/list/recover-bootstrap/mail-once/init-secret-store` | Bootstrap local explícito y correo acotado; no entrega contraseñas o enlaces |
| Calidad | `check`, `build:agent`, `test:control:db`, `smoke`, `smoke:evaluation` | DB desechable con proveedores ficticios; smoke de acceso requiere runtime local y dos plazas libres |
| Fuentes | `ingest`, `worker`, `smoke:mobility`, `smoke:routing` | Pueden activar adquisición; no forman parte del check offline |
| Experimentos existentes | `budget:report`, `test:budget:db`, `otp:benchmark`, modos `--live*` | Ejecución explícita para medir consumo o rendimiento; inferencias reales requieren además selección y financiación explícitas |
| Cloud | `configure:vercel`, `check-cloud.mjs` | Separados; no ejecutar durante operación local normal |

Scopes: lectura `mobility.read`, administración de evaluación `mobility.evaluation.manage` y gestión de ingestión `mobility.ingestion.manage`. [Autorización](../../apps/mobility-core/src/auth.ts) y [rutas Core](../../apps/mobility-core/app/api) mantienen esa separación.

**Evidencia y referencias:** [archivo de actas](../acceptance/index.md), [recursos](../resources/index.md), [operación local](../local-runtime.md).

## Panel y telemetría

Implementación: [contratos](../../packages/contracts/src/dashboard.ts), [proyección segura](../../packages/contracts/src/safe-data.ts), [BFF Web](../../apps/eve-web/data/queries/dashboard/index.ts), [dispatch Core](../../apps/mobility-core/app/internal/dashboard/[...path]/route.ts), [captura efectiva](../../apps/eve-web/src/model-telemetry.ts), [sink](../../apps/mobility-core/src/observability/telemetry.ts). [Acta](../acceptance/2026-10-02-core-dashboard.md).

Las rutas Web `/dashboard`, `/dashboard/mobility`, `/dashboard/tools`, `/dashboard/sources`, `/dashboard/activity` y `/dashboard/conversations` usan Better Auth. Web no importa SQL ni adaptadores. El BFF tiene dispatch cerrado, origen Core fijo, no redirecciones y respuestas no-store. Core revalida evaluador activo y ownership en índices, resúmenes, eventos, payloads y ejecuciones. Datos y operación son comunes a los evaluadores; contenido conversacional y ejecución manual son propios.

JWT de servicio: scopes `mobility.dashboard.read`, `mobility.dashboard.execute`, `mobility.dashboard.activity` y `mobility.telemetry.write`. El sink interno no admite escritura del navegador. La propiedad se registra en el control de presupuesto existente antes de enviar el buffer temprano; la telemetría nunca crea ownership.

| Control | Límite |
| --- | --- |
| Refresco resumen / resto | 3 s / 15 s mínimos por clave; no oculto, offline o pausado |
| Eventos y conversaciones propias activas | Eventos operativos 15 s; resumen/timeline activo 3 s, conversación terminada congelada |
| Actividad visible | 60 s; cupo independiente 2/min |
| Lecturas / ejecución | 120/min por evaluador; ejecución 6/min y 60/día |
| Manual | Entrada 8 KiB; resultado saneado 256 KiB; deadline 60 s; lease 70 s; una activa por propietario |
| Tabla / mapa | 50 predeterminado, 100 máximo / 1.000 puntos máximo por bbox |
| Timeline / índice | 50 eventos predeterminado, 100 máximo / 20 conversaciones |
| Payload model input/output | 512 KiB / 64 KiB |
| Payload herramienta input/output | 8 KiB / 32 KiB en captura EVE; no confundir con inspector manual |
| Batch | 32 eventos y 1 MiB máximo |
| Captura | 16 MiB y 10.000 eventos por sesión; 256 MiB por propietario |
| Retención | Hasta siete días; accesos expirados/revocados quedan inaccesibles inmediatamente |
| Sink best-effort | 200 ms HTTP; pool dedicado 2 conexiones; checkout 100 ms; watchdog transacción 150 ms, sentencia 100 ms, lock 25 ms |

Migración aditiva [0021](../../infra/postgres/migrations/0021_dashboard_observability.sql): `conversation_observability`, `conversation_trace_event`, `conversation_trace_payload`, `observability_quota`, `operational_event`, `dashboard_tool_execution` y `dashboard_rate_window`. Cuotas y reservas se actualizan bajo locks propios de observabilidad, no bajo locks de presupuesto. Los payloads se sanean y se deduplican dentro de la misma sesión/tipo; los terminales aceptan ausencia del evento inicial, sin inflar uso por duplicados. Los fallos de captura no repiten inferencias ni deshacen publicaciones.

La purga física acotada se integra en mantenimiento por actividad del worker existente, sin Cron permanente. El filtro temporal de lectura aplica aunque el worker esté parado. Las referencias y contadores se liberan por lotes de hasta 1.000. Esta retención no cambia la de transcripciones EVE ni el historial de movilidad.

Dependencias Web añadidas: SWR 2.4.1, Leaflet 1.9.4 y tipos; render del mapa diferido. [Adaptación Community Agent fijada](../../apps/eve-web/vendor/community-agent/README.md), MIT conservado. EVE sigue siendo la fuente de tokens visuales y componentes. La [guía](../user-guide.md#panel-privado) explica los tres mecanismos de actualización.

## Control de cuentas y LLM

[Procedimientos, valores iniciales y límites](../accounts-and-llm.md). API Web autenticada `/api/control` → Core `/internal/control`; `/internal/llm/runtime` y `/internal/llm/v1/{responses,chat/completions}` son exclusivamente de servicio. Validan el JWT `mobility.evaluation.manage` y la vinculación de usuario/sesión/turno. El navegador no proporciona URLs externas ni credenciales al modelo.

[Contratos](../../packages/contracts/src/llm.ts), [Core](../../apps/mobility-core/src/control), [SecretStore](../../apps/mobility-core/src/control/secrets.ts), [ledger](../../apps/mobility-core/src/control/ledger.ts), [migración](../../infra/postgres/migrations/0022_accounts_llm_control.sql). Los paneles `/account` y `/admin` usan metadatos sin secretos ni transcripciones ajenas.
