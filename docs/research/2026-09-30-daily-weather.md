# Predicción diaria AEMET para desplazamientos futuros

Investigación del **30/09/2026**, sobre `main` en `59613bf`. No implementa el producto ni modifica el runtime. Las [instrucciones de entrega](../plans/2026-09-30-daily-weather.md) fijan el alcance; este documento explica la evidencia y las decisiones.

## Recomendación

Añadir predicción diaria municipal a la caché meteorológica existente, usando **el XML oficial público como única fuente de adquisición de este producto**. Mantener OpenData JSON para el producto horario ya instalado. No añadir un proveedor, una consulta por viaje ni un mecanismo de respaldo entre formatos.

La elección del XML no se debe solamente a las intermitencias de OpenData: la comparación de una misma publicación mostró que algunos elementos vacíos del XML aparecen como ceros numéricos en el JSON diario. El XML permite preservar esa diferencia sin reglas heurísticas ni una segunda descarga de contraste en producción.

## Fuentes oficiales

1. [Interpretación y horizonte de la predicción municipal](https://www.aemet.es/es/eltiempo/prediccion/municipios): siete días nominales; predicción para la capital municipal; intervalos de seis horas o mayores expresados en UTC. El horizonte horario se cuenta desde el ciclo nominal, no desde cada consulta.
2. [Ayuda de variables](https://www.aemet.es/es/eltiempo/prediccion/municipios/ayuda): intervalos de 6, 12 y 24 horas; probabilidad de precipitación para todo el periodo; extremos de temperatura; semántica distinta del viento según el alcance. No confundir probabilidad con milímetros de lluvia.
3. [Página de Madrid](https://www.aemet.es/es/eltiempo/prediccion/municipios/madrid-id28079), que enlaza explícitamente la [descarga XML diaria](https://www.aemet.es/xml/municipios/localidad_28079.xml). Es un recurso de datos oficial, no extracción del HTML.
4. [Esquema XML oficial](https://www.aemet.es/xsd/localidades.xsd): `periodo` es opcional en varias variables, admite contenido textual y diferencia extremos diarios de datos a horas concretas. Sirve de referencia; no hace falta descargar ni compilar XSD en cada consulta.
5. [Referencia OpenData](https://opendata.aemet.es/dist/): existe `/api/prediccion/especifica/municipio/diaria/{municipio}` y un endpoint para todos los municipios. El segundo no es necesario. El sobre devuelve enlaces a datos y metadatos; no es el propio pronóstico.
6. [Condiciones de reutilización](https://www.aemet.es/es/nota_legal): conservar atribución, fecha de actualización y metadatos pertinentes; identificar la elaboración propia sin insinuar respaldo de AEMET.

## Comprobaciones realizadas

### Producto público

El XML de Madrid devolvió **HTTP 200**, 12.086 bytes, `elaborado=2026-09-30T17:05:08`, siete fechas del 30/09 al 06/10, `Last-Modified: Wed, 30 Sep 2026 17:06:35 GMT` y `Cache-Control: max-age=1200`. No apareció ETag. Una petición posterior con `If-Modified-Since` devolvió **304**. Esto prueba ese comportamiento en la muestra, no un SLA ni una obligación de consultar cada veinte minutos.

SHA-256 del XML examinado: `0781299c12fa29e55ecea31afca4470624b4c2cb0d3213767ce8ee44f5bd141f`.

Se observaron periodos solapados de distintas amplitudes, valores vacíos, ceros reales, temperaturas diarias con y sin datos horarios y, en fechas lejanas, variables sin atributo `periodo`. No se presupone un número fijo de periodos por día.

### Contraste con OpenData autenticado

Se utilizó la clave local únicamente en una cabecera hacia AEMET, sin imprimirla ni almacenarla en estos documentos. Hubo un HTTP 429 y un intento posterior fallido; una consulta posterior mediante el transporte del sistema obtuvo **200** para el sobre, los datos y los metadatos. No se relajó TLS. No se concluye caída global ni invalidez de la clave.

El JSON y el XML tenían **la misma elaboración**. Ejemplos del día 30/09:

| Campo y periodo | XML público | JSON diario |
| --- | --- | --- |
| Probabilidad `00-24` | Elemento vacío | `value: 0` |
| Probabilidad `00-12` | Elemento vacío | `value: 0` |
| Probabilidad `00-06` | Elemento vacío | `value: 0` |
| Viento `00-24` | Dirección y velocidad vacías | Dirección vacía y `velocidad: 0` |
| Viento `18-24` | `C`, velocidad `0` | `C`, velocidad `0` |

**Conclusión acotada:** no todos los ceros del JSON diario examinado representan un cero publicado de forma inequívoca. Tampoco procede descartar todos los ceros: la calma anterior sí es un valor explícito. Usar XML evita trasladar esta ambigüedad al dominio. No demuestra un defecto del JSON horario ni justifica reabrir su entrega.

Los metadatos diarios describen cuatro actualizaciones generales al día y posibles revisiones adicionales de máximas/mínimas. La referencia API indica actualización continua. No se deduce de ello un horario garantizado: la revisión cada treinta minutos será una política de nuestra aplicación.

### Precaución temporal

La documentación pública respalda UTC para los bloques de seis horas o más del producto público. **Eso no prueba la zona de `elaborado`, que en la muestra no incluye offset.** Tampoco `Last-Modified` demuestra que sea la misma hora que la elaboración. El plan distingue el texto original, la interpretación conservadora para antigüedad y la última modificación HTTP; no exige resolver esta incertidumbre mediante nuevas consultas continuas.

Los extremos diarios se conservarán asociados a la fecha original, no como temperatura exacta a la salida. Las predicciones municipales son referencias de la capital del municipio, no observaciones ni cobertura meteorológica continua de la ruta.

## Encaje real en el código

- `apps/mobility-core/src/adapters/journey-weather.ts` ya aporta adquisición acotada, errores HTTP y soporte condicional para CAP. `aemet-cap.ts` contiene configuración segura de `fast-xml-parser`, que ya está instalado.
- `weather-cache.ts` ya ofrece recursos persistentes, gate global, leases, revisión, backoff y demanda limitada. Actualmente recorta a trece recursos; añadir dos productos por municipio exige revisar ese límite, no truncar silenciosamente los diarios.
- La restricción de `weather_product` en `0018_journey_weather.sql` solo admite `forecast:28xxx` y `warnings:28`. Se necesita una **migración nueva**, no editar una aplicada ni crear otra tabla de caché.
- `MunicipalForecast`, `WeatherProduct`, la selección en `packages/domain/src/journey-weather.ts` y el enriquecimiento Core presuponen el producto horario. En particular, `selectForecast` calcula cobertura mediante precipitación en mm. La diaria ofrece probabilidad, no ese acumulado: reutilizar ese criterio sin adaptación daría falsos huecos.
- `get_environment` admite observación, horaria y avisos, y limita el periodo a 24 horas. La diaria necesita un selector explícito y un límite propio para consultas de varios días; el comportamiento anterior debe conservarse.
- El enriquecimiento tiene un presupuesto total de **dos segundos**, no dos segundos por producto. Se debe conservar. CAP tiene horizonte independiente; disponer de siete días de predicción no implica siete días de avisos.

## Decisiones propuestas

El producto diario será contextual y secundario frente a una predicción horaria reciente que cubra la consulta. Aumentará el horizonte y ofrecerá resúmenes diarios explícitos, sin fabricar precisión horaria ni prolongar calendarios de transporte.

La adquisición será por municipio demandado, con comprobación condicional, revisión inicial de treinta minutos y políticas existentes de actividad/backoff. Los umbrales, selección y límites concretos son decisiones de la aplicación recogidas en el plan, no garantías del proveedor.

Esta investigación no ejecutó tests del proyecto, llamadas al modelo, migraciones, escrituras en la base, reinicios ni cambios de OTP. Las respuestas examinadas son evidencia de contrato, no un informe meteorológico vigente para el usuario.
