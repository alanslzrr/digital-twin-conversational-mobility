# Accesibilidad estática: investigación para el siguiente bloque

[Índice de la wiki](../index.md) · [Archivo de research](index.md) · [Estado vigente](../roadmap.md)

> **Investigación histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Fecha: **29/09/2026**. Base inspeccionada: `b31abe9`. Investigación de solo lectura; no implementación. El alcance ejecutable está en el [plan para el agente](../plans/2026-09-29-static-accessibility.md).

## Índice interno

- [Conclusión](#conclusión)
- [Qué dicen las fuentes oficiales](#qué-dicen-las-fuentes-oficiales)
- [Evidencia local, no estadísticas de toda la red](#evidencia-local-no-estadísticas-de-toda-la-red)
- [Qué hay que reutilizar](#qué-hay-que-reutilizar)
- [Qué se comprobó y qué no](#qué-se-comprobó-y-qué-no)


## Conclusión

No necesitamos otro proveedor ni un motor de accesibilidad. Ya existen atributos GTFS, persistencia parcial y la preferencia `wheelchair` enviada a OTP. Falta conservar los atributos Renfe en PostgreSQL, interpretar los códigos y explicar su alcance en las herramientas actuales. **Este bloque informa sobre accesibilidad declarada para silla de ruedas; no certifica un recorrido completo ni el funcionamiento de ascensores.**

## Qué dicen las fuentes oficiales

- **GTFS:** `wheelchair_boarding` describe la parada/acceso y `wheelchair_accessible` el vehículo del viaje. El código 1 es una declaración positiva, 2 negativa y 0/vacío ausencia de información propia. Una parada hija o entrada con 0/vacío puede heredar de su estación padre; un valor explícito del hijo prevalece. Una parada sin padre con código 1 no implica que todos sus vehículos sean accesibles. [Referencia GTFS: stops](https://gtfs.org/documentation/schedule/reference/#stopstxt), [trips](https://gtfs.org/documentation/schedule/reference/#tripstxt).
- **Parada y vehículo son requisitos distintos.** No se puede convertir una parada positiva en una afirmación sobre cualquier salida. [Guía de accesibilidad GTFS](https://gtfs.org/getting-started/features/accessibility/).
- **Los recorridos interiores requieren otra evidencia:** GTFS Pathways representa conexiones, escaleras, ascensores y niveles. Los códigos anteriores no describen por sí solos un transbordo entre dos andenes. [Guía Pathways](https://gtfs.org/getting-started/features/pathways/).
- **OTP 2.10.0:** dispone de preferencias separadas para paradas, viajes y ascensores. Sus valores predeterminados exigen declaración positiva para paradas/viajes; calles y ascensores tienen otros criterios y penalizaciones. El ejemplo completo de configuración no equivale a los defaults: no copiar sus `onlyConsiderAccessible=false`. [Documentación versionada](https://docs.opentripplanner.org/en/v2.10.0/RouteRequest/), [implementación de defaults](https://github.com/opentripplanner/OpenTripPlanner/blob/v2.10.0/application/src/main/java/org/opentripplanner/routing/api/request/preference/WheelchairPreferences.java).
- **OTP también expone atributos en GraphQL**, pero no hace falta añadir otra consulta por parada ni depender del motor para resolver un catálogo. Mantener el enriquecimiento en Core/PostgreSQL simplifica versiones y procedencia. [Esquema 2.10.0](https://github.com/opentripplanner/OpenTripPlanner/blob/v2.10.0/application/src/main/resources/org/opentripplanner/apis/gtfs/schema.graphqls).

## Evidencia local, no estadísticas de toda la red

Se leyeron `stops.txt` y `trips.txt` de los cuatro ZIP de la release activa `6eff064a52dbcea1b76d028697203b85b16a2ced4755fe40cd67695fbd6d0b5e`; sus SHA-256 coinciden con el manifiesto. Los recuentos incluyen registros de estaciones y entradas, no solo puntos de embarque. Códigos originales, antes de herencia:

| Feed / versión abreviada | Paradas: 1 / 2 / 0 o ausente | Viajes: 1 / 2 / 0 o ausente |
| --- | --- | --- |
| Renfe `3e1c13bd` | 17 / 78 / 0 | 20.406 / 16.698 / 0 |
| Metro Ligero `7e49cfc0` | 0 / 71 / 25 | 3.001 / 0 / 0 |
| Interurbanos `4b7930fe` | 0 / 5.964 / 2.442 | 0 / 0 / 49.398 |
| EMT `91d967eb` | 0 / 0 / 4.894; columna ausente | 0 / 0 / 72.512; columna ausente |

Ninguno de esos ZIP contiene `pathways.txt` ni `levels.txt`. Metro, fuera del grafo por caducidad, conserva un catálogo con códigos; eso no valida horarios ni condiciones actuales. No se descargaron nuevos GTFS.

### Dos límites que el agente debe conservar

1. **Metro Ligero:** los 13 puntos de embarque de ML2 y los 16 de ML3 tienen código 2 en esta versión. MLO, en cambio, describe sus vehículos y paradas como aptos para personas con movilidad reducida. Es una discrepancia entre el dato estructurado y la información general del operador, no una prueba de qué instalación funciona hoy. No invertir códigos ni modificar el grafo; devolver la declaración con advertencia y enlace. No extender la declaración de MLO a ML1/ML4. [MLO: preguntas sobre movilidad reducida](https://www.metroligero-oeste.es/atencion-al-cliente).
2. **EMT:** la empresa declara que su flota cuenta con piso bajo y rampas, pero el ZIP instalado omite estos atributos. No rellenar cada viaje/parada con 1 ni asociar una llegada API a un viaje GTFS por compartir línea. [EMT: flota](https://www.emtmadrid.es/Empresa/Somos/NuestraFlota), [condiciones de accesibilidad](https://www.emtmadrid.es/Empresa/RSC/Accesibilidad).

Estas páginas fundamentan cautelas de interpretación; **no se añaden como feeds ni se consultan durante cada conversación**.

## Qué hay que reutilizar

| Pieza existente | Hallazgo y cambio mínimo |
| --- | --- |
| [`prepare-crtm.py`](../../scripts/prepare-crtm.py), [`0014`](../../infra/postgres/migrations/0014_crtm_static.sql) | Ya conservan `wheelchair`, padre y tipo de ubicación para CRTM/GTFS EMT. Ausente/vacío se normaliza a 0: no presentarlo como código original explícito. |
| [`crtm.ts`](../../apps/mobility-core/src/crtm.ts) | Resolución y horarios ya exponen códigos sin normalización semántica compartida. Añadir significado, herencia y procedencia sin eliminar campos actuales. |
| [`import-renfe.mjs`](../../scripts/import-renfe.mjs) | El export de la release contiene ambos atributos, pero el importador no los persiste. Añadir almacenamiento mínimo y backfill de la misma versión, sin nuevo ZIP/grafo. |
| [`routing.ts`](../../apps/mobility-core/src/routing.ts), [`routing-release.ts`](../../apps/mobility-core/src/routing-release.ts) | Ya hay IDs GTFS por tramo, versión de feed/release, controles de consistencia y `wheelchair` enviado a OTP. `accessibilityGuaranteed` ya es false. |
| [`mobility.ts`](../../apps/mobility-core/src/mobility.ts) | Resolución de lugares y salidas Renfe permiten adjuntar evidencia por entidad, sin nueva herramienta. |

## Qué se comprobó y qué no

- Lectura de código, export Renfe activo, manifiestos, distribución de códigos, pertenencia ML2/ML3 y hashes de los cuatro ZIP. Atocha `18000` y Chamartín `17000` declaran embarque 1; cada viaje sigue teniendo su propio atributo.
- Fuentes oficiales consultadas por navegador web: Firecrawl CLI no está instalado; no se instaló ni contrató nada.
- Una petición local de introspección con varios tipos fue rechazada por el límite de introspección de OTP; no se cambió ese control ni se afirma verificación del esquema desplegado. La referencia de API usada es el código oficial versionado.
- Sin nuevas consultas de rutas, benchmarks, llamadas al modelo, uso de claves, escrituras en la base ni reinicios. No se comprobó accesibilidad física, ocupación o estado operativo de equipos.
