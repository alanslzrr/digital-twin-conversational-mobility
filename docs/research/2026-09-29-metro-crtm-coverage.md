# Metro/CRTM: comprobación acotada de fuentes

[Índice de la wiki](../index.md) · [Archivo de research](index.md) · [Estado vigente](../roadmap.md)

> **Investigación histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Comprobado el **29/09/2026**, sobre `main` en `b8892d8`. Investigación pública y comparación con archivos locales; sin importaciones, llamadas al modelo ni cambios del runtime/OTP.

## Índice interno

- [Conclusión](#conclusión)
- [1. Metro: archivo descargado, no solo metadatos](#1-metro-archivo-descargado-no-solo-metadatos)
- [2. Correspondencias: evidencia disponible y límites](#2-correspondencias-evidencia-disponible-y-límites)
- [3. Implicaciones técnicas mínimas](#3-implicaciones-técnicas-mínimas)
- [Evidencia local y alcance de la comprobación](#evidencia-local-y-alcance-de-la-comprobación)


## Conclusión

**No hay un horario Metro vigente en la descarga oficial comprobada.** Sí existe evidencia para ampliar las **asociaciones de intercambiador** entre catálogos CRTM, Renfe y EMT. Son dos entregas distintas: la segunda ayuda a resolver lugares y consultar el operador adecuado, pero no añade Metro al router ni calcula transbordos.

**Recomendación anterior retirada:** el usuario no acepta las correspondencias como sustituto de resolver Metro. Los hallazgos siguientes se conservan como evidencia, no como encargo. Véanse la [investigación de alternativas](2026-09-29-metro-alternatives.md) y el [plan retirado](../plans/2026-09-29-metro-crtm-coverage.md).

## 1. Metro: archivo descargado, no solo metadatos

El [portal oficial CRTM](https://datos.crtm.es/) enlaza el [item Metro](https://crtm.maps.arcgis.com/home/item.html?id=5c7f2951962540d69ffe8f640d94c246). Se consultaron sus [metadatos](https://www.arcgis.com/sharing/rest/content/items/5c7f2951962540d69ffe8f640d94c246?f=json) y se descargó el [ZIP oficial](https://www.arcgis.com/sharing/rest/content/items/5c7f2951962540d69ffe8f640d94c246/data) a las **07:42 UTC**:

- 1.503.773 bytes; SHA-256 `16e8e53ce16ab6d73efc2896be7aaeeb351a1f48f661ac7faa0a9e5b38204fb7`: **idéntico al catálogo instalado**.
- `feed_version=20250527`; modificación del item: 30/05/2025. `feed_start_date` y `feed_end_date` vacíos.
- Los calendarios referenciados por viajes terminan el **27/05/2026**; la última excepción positiva es del 25/12/2025. No hay servicio publicado para hoy en este archivo.
- 1.050 registros de parada —incluyen otras clases de lugar—, 13 rutas, 120 viajes plantilla y 790 ventanas de frecuencia. No contiene `transfers.txt` ni `pathways.txt`.

La búsqueda acotada en el propietario oficial de ArcGIS, NAP y sitios oficiales no encontró una alternativa vigente. La [ficha NAP 933](https://nap.transportes.gob.es/Files/Detail/933) indexada mostraba el mismo fin de vigencia; su apertura directa no fue utilizable, por lo que **no se verificó una segunda descarga desde NAP**. No se afirma que ninguna otra fuente pueda existir.

Las fechas del catálogo GIS, la modificación del portal y el horario general de apertura del Metro **no prolongan** los calendarios GTFS. La validez se determina por servicios y excepciones; una frecuencia no es una salida exacta. [Referencia GTFS](https://gtfs.org/documentation/schedule/reference/#calendartxt).

Si se quiere solicitar el feed actualizado, el portal publica `crtm_opendata@madrid.org`. Pregunta útil: «¿Cuál es la URL oficial del GTFS de Metro de Madrid vigente después del 27/05/2026? El item público sigue sirviendo la versión 20250527». **No se ha enviado ningún mensaje.**

## 2. Correspondencias: evidencia disponible y límites

Se leyeron las capas **Estaciones / 0** de los servicios oficiales [M4 Metro](https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services/M4_Red/FeatureServer/0), [M5 Cercanías](https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services/M5_Red/FeatureServer/0) y [M6 EMT](https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services/M6_Red/FeatureServer/0). Publican `IDESTACION`, `CODIGOEMPRESA`, `MODOINTERCAMBIADOR` y `CODIGOINTERCAMBIADOR`, además de fechas y geometría.

**Inferencia comprobada, no garantía universal del esquema:** para el subconjunto `MODOINTERCAMBIADOR=90`, los códigos de grupo coinciden con padres `est_90_<código>` del GTFS Metro. El emparejamiento por código de empresa con otros catálogos necesita comprobación individual; no basta con el nombre del campo.

| Comprobación contra archivos locales | Resultado |
| --- | --- |
| M4: 293 filas completas; 27 del subconjunto 90 | Las 27 coinciden con `par_<IDESTACION>`, su padre publicado y coordenadas a menos de 100 m; representan 13 grupos. |
| M5: 111 filas completas; 8 del subconjunto 90 | Siete códigos de empresa coinciden con `stop_id` Renfe. Solo cinco pasan también el control conservador de 100 m. |
| M6: subconjunto 90 completo, 128 filas | 126 códigos coinciden con el snapshot local de paradas API EMT y pasan 100 m; 125 coinciden con GTFS EMT. **No son versiones intercambiables.** |

El snapshot API EMT utilizado ya existía localmente: no se hizo una nueva consulta a MobilityLabs ni se afirma su actualidad. La implementación debe contrastar contra el catálogo activo en PostgreSQL. Los 100 m son una política conservadora del proyecto, **no una regla publicada por CRTM ni distancia caminable entre redes**.

Ejemplos trazables:

- **Atocha, grupo `90_54`:** M4 `4_16` → `par_4_16` → padre `est_90_54`; M5 `5_11` → código empresa `18000` → Renfe; M6 `6_798` → código empresa `2178` → EMT. El código GIS `798` no es el número de parada EMT.
- **Sol, `90_58`:** tres registros Metro y Renfe `18101`; no apareció miembro EMT en este subconjunto. No completar por proximidad.
- **Chamartín y Príncipe Pío:** IDs Renfe coincidentes, pero desplazamientos de coordenadas de unos 111 y 119 m respectivamente. Quedan sin asociación Renfe bajo el control de 100 m, no son prueba de ausencia de conexión física.
- **Méndez Álvaro:** M5 publica `35701`, ausente en el GTFS Renfe comparado. No sustituirlo por otro código de nombre parecido.
- EMT `1917` y `2045` están ausentes en el snapshot API comparado. `5597` aparece en API, pero no en el GTFS EMT comparado.

No extrapolar a grupos 91/92/93: Pinar de Chamartín muestra que grupo GIS y padre GTFS no siempre tienen la misma estructura. Tampoco trasladar la regla a la capa M6 **Postes / 1**, donde `CODIGOEMPRESA` tiene valores de otro nivel. Los nueve padres Metro/interurbanos ya documentados se conservan; no requieren otro catálogo.

## 3. Implicaciones técnicas mínimas

- Usar un snapshot manual, versionado y limitado a estas tres capas/subconjunto. No descargar por conversación ni añadir un worker.
- Solicitar geometría con `outSR=4326`; no interpretar las columnas proyectadas X/Y como longitud/latitud. IDs como texto, conservando ceros. `OBJECTID` sirve para paginar, no como identidad de dominio.
- Comprobar paginación, conteos y `exceededTransferLimit`. Una consulta exploratoria amplia de M6 devolvió 1.000 filas truncadas y fue descartada; la consulta filtrada devolvió las 128 completas. [API oficial Esri](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/).
- Reutilizar UUID/catálogos existentes. `routing_place_link` representa identidad de una parada API↔GTFS, **no pertenencia al mismo intercambiador**: no introducir allí estas asociaciones.
- Separar versión/fecha GIS de vigencia horaria. Compartir intercambiador no acredita recorrido interior, conexión operativa, tarifa, tiempo mínimo ni accesibilidad.
- Conservar **Powered by CRTM**, enlace y condiciones de la [licencia CRTM](https://www.crtm.es/licencia-de-uso). El tratamiento propio debe quedar identificado; no implica respaldo oficial.

## Evidencia local y alcance de la comprobación

Archivos públicos bajo `data/research/2026-09-29-metro-crtm/` —ignorados por Git—: `metro-probe.json`, metadatos/esquemas, `M4_Red-stations.json`, `M5_Red-stations.json`, `M6_Red-stations-mode90.json`, `catalog-join-probe.json` y `emt-api-join-probe.json`. Se cotejaron los ZIP locales Metro, Renfe y EMT y `data/tmp/emt-stops.json`; no se escribieron tablas ni se recalculó el grafo.

Para reproducir la consulta GIS: `FeatureServer/0/query`, `f=json`, `where=MODOINTERCAMBIADOR=90`, `outFields` limitado a los campos citados, `returnGeometry=true`, `outSR=4326`, orden estable por `OBJECTID` y paginación según capacidades del servicio. Las cifras anteriores son evidencia de esta fecha, no constantes de aceptación futuras.
