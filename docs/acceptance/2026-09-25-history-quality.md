# E5 — Histórico y calidad temporal por entidad

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Implementación local del 25/09/2026; E2 sigue cerrado. No se han actualizado el runtime habitual ni su esquema/datos. No hay campañas conversacionales nuevas.

## Índice interno

- [Histórico explícito](#histórico-explícito)
- [Calidad por entidad](#calidad-por-entidad)
- [Catálogo oficial de aire](#catálogo-oficial-de-aire)
- [Verificación](#verificación)
- [Integración / reversión pendiente (E8)](#integración--reversión-pendiente-e8)


## Histórico explícito

`get_historical_state` admite EMT y `mode`:

- `event` (predeterminado, compatible con consultas anteriores): observación más reciente con `observedAt <= at`; puede incorporar una corrección conocida después del instante consultado.
- `knowledge`: misma condición de evento y además `ingestedAt <= at`; devuelve la revisión disponible entonces, no información llegada después.

Desempate por hora observada, hora de ingesta e ID de revisión. La respuesta expone ambas horas, modo, `knownAfterRequestedTime`, revisión, parser, feed estático cuando exista, referencia raw, hash normalizado, desfase y frescura **respecto del instante solicitado**. La frescura de colección no representa la frescura de cada entidad.

La migración `0012_history_revisions.sql` reemplaza la PK `(job_id, observed_at)` por un ID de revisión. Conserva filas y tiempos existentes; parser/hash antiguos quedan desconocidos, y la versión estática se copia solo cuando ya estaba en el payload. No reconstruye correcciones anteriormente descartadas.

La escritura serializada por lease compara contenido normalizado y versión de parser contra la última revisión del mismo instante observado. Los reintentos idénticos no duplican histórico; cambiar solo el formato raw tampoco. Contenido corregido, incluso con raw idéntico, sí crea revisión; `A → B → A` conserva las tres revisiones. La versión del feed forma parte del payload/hash cuando aplica. Las ingestas antiguas se conservan como `historical_only`, sin hacer retroceder el snapshot actual, sus identificadores ni su hora de observación.

### Límites

Índice parcial, no reconstrucción del gemelo. Máximo cinco entidades de muestra por categoría, sin interpolación. Ventana de consulta de 24 h y retención por primera ingesta de cada revisión; el filtro se aplica aunque la limpieza física aún no haya corrido. Repetir contenido idéntico no amplía la historia de conocimiento. Una fuente sin filas retenidas devuelve ausencia explícita, no «estado normal». Observaciones tardías pueden ser más antiguas que la ventana consultable y se etiquetan con su desfase real.

## Calidad por entidad

- Parking: procedencia/frescura por categoría; resumen por aparcamiento usa la categoría disponible más antigua y lo declara. Sin disponibilidad: procedencia `null`, estado `no_observation`, nunca cero ni hora prestada de otro parking. El catálogo por sí solo no es ocupación en vivo.
- BiciMAD: conserva `last_reported` de cada estación, separado del timestamp de cabecera GBFS. Si la estación declara una hora posterior a la cabecera se informa esa inconsistencia; no se modifica su hora. El tiempo agregado es el máximo de las horas declaradas, no la hora de descarga.
- Aire: lectura con procedencia propia y correspondencia ID/nombre/coordenadas contra catálogo oficial estático; códigos ausentes o contradictorios permanecen como identidad parcial. La identidad no garantiza funcionamiento del analizador.
- AEMET: añade procedencia por estación/lectura manteniendo su hora observada.
- Salud: frescura de colección separada del recuento de entidades frescas/antiguas/ausentes, con denominador explícito. Una cabecera fresca con todas las entidades antiguas no activa `liveDataReady`. Capacidad estática no se etiqueta como RT.
- Renfe: matching declara como denominador los trip updates recibidos del feed nacional; un viaje no emparejado queda con cobertura desconocida, no se atribuye automáticamente a fallo de Madrid.

## Catálogo oficial de aire

Se ha incorporado una copia reducida de **24 estaciones** del [catálogo del Ayuntamiento de Madrid](https://datos.madrid.es/dataset/212629-0-estaciones-control-aire/information), bajo CC BY 4.0, con atribución, URL, fecha de descarga y SHA256 en `apps/mobility-core/src/catalogs/madrid-air-stations.json`. [CSV utilizado](https://datos.madrid.es/dataset/212629-0-estaciones-control-aire/resource/212629-0-estaciones-control-aire-csv/download/212629-0-estaciones-control-aire-csv.csv).

SHA256 del CSV original: `2c84ca974088a6d5de13509489196ddefeee83fcae4999798b00603aa951cd1b`. Es identidad estática versionada, no cobertura operativa garantizada ni una nueva fuente de lecturas. Las pruebas/builds utilizan la copia local, sin descargarla.

## Verificación

- `pnpm check`: **224 pruebas offline**, lint/boundaries, tipos y builds aprobados; EVE sin cambios reutiliza caché.
- **15 regresiones PostgreSQL aisladas** (las 9 de E3 y 6 de E5), con proveedores simulados y esquema/raw temporales eliminados: correcciones/reversiones, deduplicación normalizada, datos tardíos sin regresión, modos evento/conocimiento con EMT y desempate, retención antes de prune. El setup comprueba también que `0012` conserva hora/versión de una fila legacy sin inventar parser.
- Regresiones offline de contrato, catálogo/IDs incompatibles, tiempo GBFS y procedencia/frescura por entidad. Parking cubre cero real, positivo, antiguo y ausente; salud cubre todas las estaciones antiguas bajo cabecera reciente.
- Único acceso nuevo a proveedor: lectura pública del catálogo estático de aire. Sin llamadas de modelo, benchmark, reinicios ni despliegues.

## Integración / reversión pendiente (E8)

Parar Core y worker, respaldar la base, aplicar migraciones pendientes hasta `0012` y actualizar ambos juntos. **No mezclar el escritor anterior con el esquema nuevo**: la deduplicación ya no descansa en la antigua PK. No se ejecutó esta transición en el runtime habitual.

Para volver al escritor anterior, restaurar conjuntamente código y copia previa de la base. No eliminar automáticamente revisiones para recrear la PK vieja: se perderían correcciones. Las migraciones `0010`/`0011` y la reimportación de destinos E4 también siguen pendientes de la entrega local integrada.

Siguiente funcionalidad: E6, resolver los fallos restantes de los ejemplos existentes; no crear otra campaña de aceptación ni reabrir E2.
