# Predicción diaria municipal — entrega local

30/09/2026. Ejecutado el [plan acotado](../plans/2026-09-30-daily-weather.md), conservando su [investigación](../research/2026-09-30-daily-weather.md).

## Resultado

- XML público AEMET, sin nueva clave; vacíos distintos de cero, bloques UTC de 6/12/24 horas, cielo y mínima/máxima por fecha publicada. Elaboración original sin zona confirmada; base conservadora identificada para antigüedad, emisión exacta nula.
- `daily:28xxx` separado de horario/CAP; migración aditiva `0020`, mismo gate/leases/backoff/worker. Hasta 25 recursos de lectura/demanda, una adquisición en frío y presupuesto conjunto de dos segundos. Una ausencia de horizonte horario evita renovaciones hasta la revisión debida.
- `get_environment` explícito diario (máximo siete fechas locales, fin exclusivo) y selección de un producto por punto del itinerario según cobertura/frescura. Periodos completos sin interpolación; evidencia estable y referencias con producto/versión. CAP no hereda horizonte diario.

## Comprobado

- `pnpm check`: lint, fronteras, tipos, **357 pruebas aprobadas, 72 opt-in omitidas**, builds Core/Web. `pnpm build:agent` aprobado; sin inferencias.
- `RUN_WEATHER_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/weather-cache.integration.test.ts`: **12 aprobadas** en esquema aislado, eliminado al terminar. Concurrencia de cinco lectores, coexistencia, 25 recursos, 304, correcciones, backoff, ventana, horizonte conocido y cancelación.
- `pnpm smoke:mobility --weather-only`: XML real normalizado y persistido; consulta diaria MCP, repetición con **cero adquisiciones adicionales**, tres alternativas Atocha→Chamartín para el 03/10/2026 con diaria `covered`. Bloqueo transaccional temporal de la tabla meteorológica: las rutas siguen disponibles y el contexto declara `unavailable`; bloqueo liberado sin modificar datos.
- Publicación examinada: `elaborado=2026-09-30T17:05:08`, base conservadora `15:05:08Z`, horizonte publicado hasta `2026-10-07T00:00:00Z`. Evidencia privada: `data/evaluation/journey-weather-smoke.json`.
- Se corrigió orden no determinista de evidencias detectado por el primer smoke. Las pruebas de parser conservan una muestra oficial reducida, sin secretos.

## Instalación y límites

Respaldo privado `data/backups/daily-weather/pre-0020.dump`, índice verificado (no restauración ejecutada); migraciones aplicadas hasta `0020`. Core/Web/agente recompilados y supervisor habitual reiniciado con worker; smoke productivo de salud/autenticación/MCP aprobado. Los contenedores estaban apagados: se arrancaron PostgreSQL/Redis y el OTP existente, sin reconstruir/reconfigurar su grafo. Grafana se detuvo para liberar 3000 según autorización previa; otros servicios no se tocaron.

Operación por los comandos existentes de [arranque/parada](../local-runtime.md). La revisión diaria usa 30 minutos y demanda de 30 minutos, no descarga regional. Revertir a código anterior exige restaurar la copia previa si se requiere retirar datos diarios; no editar migraciones aplicadas ni borrar cachés para simular rollback.

No ofrece meteorología continua de la ruta, precisión horaria derivada de datos diarios ni garantías de ausencia de lluvia. Multiestación, viento diario y otras variables quedan fuera de esta entrega. No cambia calendarios de transporte, OTP, interfaz, autenticación ni E2/R2.1. R1/R2 siguen abiertos según roadmap; no hay despliegue cloud.
