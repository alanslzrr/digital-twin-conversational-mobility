# E6 — Continuidad funcional de la vertical existente

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica · 25/09/2026.**

Fecha: 25/09/2026. Implementado en `alanslzrr/conversation-budget`, pendiente de integración E8. E2 permanece cerrado. Se reutilizan las pruebas y ejemplos existentes; no se añade una campaña de aceptación, consumo o benchmark.

## Correcciones

- Avisos Renfe: los futuros se conservan como `upcoming`, los caducados se excluyen y los intervalos ausentes/inválidos se muestran como `unknown`, no como normalidad de servicio.
- Salidas: razón explícita de RT no aplicado (ausente, antiguo, feed distinto o viaje sin correspondencia), procedencia por actualización y bases independientes de llegada/salida. Una llegada estimada no convierte la salida prevista en estimada. Cancelaciones, NO_DATA y SKIPPED conservan su semántica. Una parada repetida sin secuencia inequívoca no recibe una estimación arbitraria.
- Login: enlace seguro de `localhost:3000` al origen canónico `127.0.0.1:3000/evaluation`, sin propagar URL de sesión ni parámetros. Errores de origen/acceso, límite de peticiones y servicio diferenciados de credenciales. No se relaja CSRF, Better Auth ni propiedad de sesiones; Web Chat oficial intacto.
- Smoke existente: `--port` y `--read-only` permiten reutilizarlo sin activar ingestión. El modo de lectura exige `INGESTION_ENABLED=false`, comprobado en health dinámico. No comprueba ticks/deduplicación en ese modo (cubiertos por las regresiones E3/E5).

## Evidencia ejecutada

- `pnpm check`: lint/fronteras, TypeScript, **242 pruebas offline aprobadas**, 32 pruebas opt-in omitidas y builds de Web/Core correctos.
- `node scripts/smoke-routing.mjs --port=3011`: **11 casos aprobados**, incluidos TRANSIT, WALK, preferencias y errores esperados. Evidencia local: `data/validation/routing-2026-09-25T11-29-35-485Z/result.json`.
- `node scripts/smoke-mobility.mjs --port=3011 --read-only`: aprobado. MCP autenticado, lugares, rutas en ambos sentidos (tres itinerarios de 780 segundos), diez salidas, avisos/alias/línea desconocida, BiciMAD, aire, tiempo, tráfico, parking, histórico y salud. Evidencia local: `data/validation/e6-mobility-read-only.json`.
- Core temporal en 3011 con una copia aislada de las tablas locales y migraciones 0010–0012, ingestión desactivada y OTP existente. Proceso y esquema temporales eliminados al terminar. Sin nuevas peticiones a proveedores, llamadas al modelo, reinicio del runtime habitual ni cambios en sus datos.

## Relación con ejemplos y límites

Los ejemplos existentes de lugares/rutas usan resolve_place y plan_journey; salidas/avisos tienen las regresiones de identidad, destino y RT; bicicletas, aire, tráfico, parking y tiempo conservan evidencia por entidad E5; histórico distingue event/knowledge y salud distingue actividad/worker/proveedor/frescura E3/E5. Los negativos de modos/lugares/fechas, autorización y login se verifican en sus pruebas existentes y regresiones específicas; no se afirma una nueva ejecución conversacional completa de los 13 ejemplos.

R0 queda implementado y comprobado localmente en el alcance acordado, no desplegado ni integrado. E8 todavía debe aplicar migraciones, reimportar destinos, integrar mediante PR y actualizar el runtime habitual. No se afirma frescura en vivo de las muestras copiadas, prueba visual del login ni ejecución nueva del modelo/EVE. Tampoco se reconstruyó OTP.

EMT llegadas/catálogos, Metro/CRTM/interurbanos, DGT, geocodificación externa, routing ampliado y herramientas agregadas siguen pendientes E7. La ampliación de meteorología, tarifas y accesibilidad no se presenta como implementada.

## Precisiones de revisión antes de E8

La base habitual parte de 0007: la entrega aplica todas las pendientes **0008–0012**, no solo las tres migraciones de E3–E5. La revisión adicional aprobó 15 pruebas PostgreSQL aisladas. El guard de paradas repetidas detecta duplicados en actualizaciones RT, no toda ambigüedad circular estática; el GTFS actual tiene cero viajes con paradas repetidas según esa revisión. Ampliar esta protección al incorporar operadores en E7, sin reabrir R0.
