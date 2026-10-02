# E4 — Identidad de líneas y destinos con evidencia

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Implementado localmente el 25/09/2026, sobre E3 sin modificar EVE ni reabrir E2. Integración y actualización de datos habituales pendientes en E8.

## Identidad

- Renfe: `C-5`, `c5` y espacios alrededor del prefijo/número resuelven contra las mismas rutas importadas. No se fusionan `C4`, `C4a`, `C4b` ni se eliminan ceros.
- EMT: únicamente normalización de mayúsculas y espacios exteriores; `002`, `2` y `EMT002` permanecen distintos.
- `get_incidents` devuelve `lineIdentity`: `known`, `unknown` o `catalog_unavailable`. Una línea conocida con `incidents: []` no equivale a una línea ausente del catálogo (`status: unknown_line`), ni garantiza servicio normal. Se conservan frescura y procedencia de los avisos.
- Sin catálogo EMT importado (pendiente E7), un filtro sin coincidencias no permite afirmar que la línea sea inexistente. Se devuelve `catalog_unavailable`, conservando el filtro literal de avisos.

## Destinos

El exportador conserva los campos necesarios de `stop_times` de cada viaje. El importador deriva evidencia dentro de la importación transaccional del mismo feed; migración aditiva `0011_trip_destination.sql`.

Orden de resolución: cabecera explícita de parada no ambigua → cabecera del viaje → terminal de secuencia válida → desconocido. No se usa `route.long_name`, `direction_id` ni una etiqueta OTP de origen indeterminado. `CIVIS` se reconoce como etiqueta de servicio Renfe, no destino.

- Secuencias numéricas, únicas y referencias de parada válidas; se admite numeración no consecutiva.
- Paradas repetidas no permiten escoger una cabecera por ID de parada; un terminal repetido/circular no se deduce.
- No se presenta el terminal actual como destino posterior si solo existe evidencia derivada.
- Exportaciones antiguas sin `stopTimes`, viajes sin secuencia o referencias inválidas no generan un terminal ficticio.
- `get_departures` conserva `headsign` como nombre resuelto o `null`; añade `destination.name`, `basis`, `source` y `staticVersion`. Solo usa evidencia importada de la misma versión verificada para las salidas OTP. Estimaciones de llegada y salida permanecen separadas.

## Evidencia ejecutada

- **23 regresiones offline nuevas**: alias, ramales, ceros EMT, catálogo ausente, avisos por identidad, desconocido frente a conocido sin avisos; cabeceras, CIVIS, secuencia desordenada, sentidos, servicio corto, circular, terminal actual, secuencia inválida/ausente y salida Core con versión/procedencia.
- **`pnpm check` aprobado: 213 pruebas offline**, lint/boundaries, tipos y builds (EVE sin cambios reutilizó caché). Pruebas DB opt-in no forman parte de ese total.
- Migración `0011` y escritura/lectura JSON mediante el mismo patrón de inserción masiva del importador verificadas en un esquema PostgreSQL desechable, eliminado al terminar.
- Lectura del GTFS local existente, sin descargar ni reconstruir OTP: **37.104 viajes** de rutas Madrid `10T`, **570.002 stop_times**. A la primera parada de cada viaje, **36.928 destinos derivados (99,526 %)** y **176 desconocidos**. Es cobertura estática de ese fichero, no porcentaje de salidas activas ni disponibilidad en vivo.
- Cabeceras originales: 36.705 vacías y 399 `CIVIS`. Ejemplo trazable de terminal: viaje `1064X19799C1`, primera parada `18000`, destino `Madrid-Aeropuerto T4`. Ejemplo sin evidencia: `1064X17707C5` permanece desconocido.

## Actualización local pendiente

Aplicar `0011` junto con las demás migraciones pendientes antes de usar este Core/importador. Regenerar el JSON normalizado desde el mismo GTFS local (`python3 scripts/prepare-otp.py`, sin `--download`, con fuentes locales disponibles) y reimportar con `pnpm gtfs:import`; verificar que su versión coincide con la del grafo. Esto no implica ejecutar un benchmark ni reconstruir el grafo si los datos GTFS no cambiaron. Si cambia su versión, seguir el procedimiento de actualización coordinada existente.

No se aplicaron migraciones al esquema habitual, no se reimportaron sus datos ni se reinició su runtime. Sin commit, push, PR, modelo o despliegue. Siguiente funcionalidad: E5, histórico y calidad temporal.
