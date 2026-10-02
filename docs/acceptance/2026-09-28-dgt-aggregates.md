# Entrega local DGT y herramientas agregadas — 28/09/2026

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica · 28/09/2026.**

## Alcance

DGT DATEX2 3.7 público integrado en Core y worker existente; consultas de incidencias, histórico retenido y salud. Tres agregados MCP almacenados: `get_line_status`, `get_network_status`, `get_mobility_snapshot`. Conexión del agente amplía únicamente descubrimiento/allowlist; interfaz EVE, modelo, autenticación y límites no cambian.

Nominatim público ya estaba autorizado y operativo desde el 27/09; roadmap corregido. No se vuelve a certificar R0/E2/E8 ni se modifica el grafo OTP.

## Evidencia ejecutada

- Descarga HTTPS oficial sin credenciales: publicación `2026-09-28T17:11:05.393+02:00`, 1.192 registros. Parser completo ejecutado sobre esa descarga; fixture público reducido para regresiones offline.
- `pnpm check`: lint, fronteras, typecheck, 305 pruebas offline y builds Core/Web aprobados. Las suites PostgreSQL opt-in no se cuentan como ejecutadas por ese comando.
- `RUN_INGESTION_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/ingestion.integration.test.ts`: 16 pruebas aprobadas en esquema temporal eliminado al terminar. DGT prueba corrección, reintento idéntico, retirada, reaparición, publicación antigua y error XML sin borrar estado válido; consulta histórica incluida.
- `pnpm build:agent` completado.
- `pnpm smoke -- --production`: Core/Web/EVE, autenticación, handshake y 16 herramientas MCP correctos; sesión sin autenticación rechazada antes de cualquier llamada al modelo.
- `node --env-file=.env.local scripts/smoke-dgt.mjs`, runtime iniciado con `--no-worker`: siete comprobaciones. Consulta Madrid: 97 incidencias coincidentes, tres devueltas, publicación `2026-09-28T15:26:05.400Z`, frescura 72 s en esa lectura. C-5 conocida, C999 desconocida; Metro 1 conocida con horarios caducados. Histórico `knowledge` disponible.
- Comparación PostgreSQL antes/después de los agregados: mismos intentos de ingestión y misma ventana de actividad. Vista conjunta con diez componentes/fuentes. La independencia del worker se comprueba sin ejecutarlo durante esta prueba puntual.
- `git diff --check` sin errores.

## Instalación

Al comenzar, aplicación y Docker estaban detenidos. Se arrancaron Docker Desktop y los servicios Compose existentes, conservando los volúmenes. Base habitual comprobada en `0016`, con catálogos presentes.

Respaldo previo privado: `data/backups/e7-dgt-2026-09-28T15-24-29Z/database.dump`, 32.784.524 bytes; índice `pg_restore --list` de 219 líneas. No se ha ejecutado una restauración. Migración `0017_dgt_incidents.sql` aplicada tras comprobar que no había escritores de aplicación. OTP se arrancó con su configuración/grafo existentes, sin build de grafo ni benchmark.

Consultar [operación local](../local-runtime.md) para arranque/parada/rollback y [contrato DGT](../sources/dgt.md) para consultas y límites. El modo `--no-worker` anterior es solo de comprobación; el modo habitual usa `node scripts/start-local.mjs` con worker.

## Límites

- Retirada no confirma cancelación ni fin real. Un fin temporal contradictorio con `active` se conserva como conflicto. No se inventan desvíos ni geometrías entre extremos.
- Cobertura DGT no incluye Cataluña/País Vasco ni garantiza todas las incidencias; sensores municipales siguen separados.
- Agregados no certifican servicio normal ni captura simultánea; muestras acotadas y antigüedad por componente/entidad. CRTM no gana RT ni horarios Metro vigentes con esta entrega.
- Histórico sigue siendo índice de publicaciones retenidas 24 h, no replay reproducible. Retiradas consultables hasta 24 h.
- Sin llamadas al modelo, campaña conversacional, cambios de OTP o despliegues cloud. No se afirma disponibilidad sostenida a partir de esta comprobación.
