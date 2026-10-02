# Meteorología como contexto del desplazamiento

[Índice de la wiki](../index.md) · [Archivo de research](index.md) · [Estado vigente](../roadmap.md)

> **Investigación histórica · 28/09/2026.**

Fecha: **28/09/2026**. **Investigación y propuesta; no implementación ni modificación del alcance aprobado.**

**Continuidad:** tras esta investigación, el usuario acordó el enfoque y solicitó las [instrucciones del siguiente bloque](../plans/2026-09-28-journey-weather.md). Ese plan concreta la entrega; las comprobaciones y los límites de esta investigación siguen siendo los descritos aquí.

## Índice interno

- [Recomendación](#recomendación)
- [Evidencia investigada](#evidencia-investigada)
- [Flujo funcional propuesto](#flujo-funcional-propuesto)
- [Persistencia y actualización mínimas](#persistencia-y-actualización-mínimas)
- [Qué significa un cambio sustancial](#qué-significa-un-cambio-sustancial)
- [Cobertura espacial y temporal sin falsa precisión](#cobertura-espacial-y-temporal-sin-falsa-precisión)
- [Orden de una implementación posterior](#orden-de-una-implementación-posterior)
- [Nota operativa y límites de esta investigación](#nota-operativa-y-límites-de-esta-investigación)


## Recomendación

No construir un asistente meteorológico independiente. Enriquecer las rutas que el usuario ya está consultando con información relevante para sus lugares y horarios. Evaluar cada itinerario contra datos compartidos en Core; **evaluar no significa descargar**. Actualizar productos meteorológicos cuando corresponda, no por cada mensaje, usuario o alternativa de ruta.

La primera entrega propuesta cubre **predicción municipal horaria y avisos oficiales de Madrid**. Mantener las observaciones existentes sin usarlas como predicción. Multiestación y predicción diaria siguen en el roadmap: propongo separarlas de esta entrega, no excluirlas silenciosamente.

## Evidencia investigada

### Productos y semántica oficiales

- AEMET publica predicción municipal horaria con horizonte de hasta 48 horas desde los ciclos nominales 00/06/12/18 UTC. No equivale a 48 horas completas desde cualquier consulta ni garantiza publicación puntual en esas cuatro horas. Representa la capital municipal, no cada calle o punto del término. Los valores tienen distintos intervalos temporales. [Interpretación oficial](https://www.aemet.es/es/eltiempo/prediccion/municipios).
- La API ofrece `prediccion/especifica/municipio/horaria/{municipio}`. Hay un recurso nuevo para todos los municipios, pero descargar toda España no se justifica para cinco evaluadores locales. [Referencia OpenData](https://opendata.aemet.es/dist/).
- Los canales de avisos son índices de CAP 1.2: permiten consultar el estado completo de una demarcación y sus mensajes individuales. Se actualizan cuando cambia el estado publicado; son feeds consultables, no webhooks enviados a nuestra aplicación. [RSS/Atom de avisos](https://www.aemet.es/es/rss_info/avisos/esp), [Madrid y sus zonas](https://www.aemet.es/es/rss_info/avisos/mad).
- También hay un canal OpenData de cambios de predicción municipal. La documentación lo describe para el conjunto de municipios; no demuestra un evento preciso por cada municipio que nos interese. Por eso no lo convertiría en dependencia obligatoria del primer bloque. [Catálogo RSS/Atom](https://opendata.aemet.es/centrodedescargas/rssatom).
- Los avisos pueden cambiar fuera de los horarios preferentes de emisión. No basta descargarlos una vez al día. [Interpretación Meteoalerta](https://www.aemet.es/es/eltiempo/prediccion/avisos/ayuda).
- CAP distingue mensajes de prueba y operativos, varios idiomas, vigencia y revisiones. Una retirada puede llegar como `Update` con referencias y expiración inmediata; `Minor` significa sin aviso. No basta buscar `Cancel` ni interpretar cualquier mensaje como peligro. [Anexo CAP oficial](https://www.aemet.es/documentos/es/eltiempo/prediccion/avisos/plan_meteoalerta/METEOALERTA_ANX3_CAP.pdf).

### Comprobaciones públicas, sin credenciales

1. [Atom provincial de Madrid](https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAP7228_ATOM.xml): HTTP 200, 1.209 bytes, `Last-Modified`, sin ETag en esta respuesta y `Cache-Control: max-age=60`. Una petición `If-Modified-Since` devolvió **304**. Ese valor de caché no obliga a nuestra aplicación a sondear cada minuto.
2. La entrada apuntaba al estado completo: archivo comprimido de 2.687 bytes y ocho miembros. Lectura en memoria, sin extracción a disco; las muestras CAP examinadas eran operativas con `severity=Minor` y periodos explícitos. No se presenta esta muestra como informe meteorológico actual para un usuario.
3. [XML horario público de Madrid](https://www.aemet.es/xml/municipios_h/localidad_h_28079.xml), enlazado desde la [página oficial](https://www.aemet.es/es/eltiempo/prediccion/municipios/horas/madrid-id28079): HTTP 200, 25.121 bytes. Contiene hora de elaboración, precipitación horaria y probabilidades en bloques como `0814`/`1420`. Una probabilidad para un bloque no es la probabilidad exacta de mojarse durante ocho minutos caminando. Esta muestra ayuda a estudiar el producto; no demuestra el contrato JSON autenticado.
4. Una descarga de documentación OpenData desde este equipo agotó TLS; el navegador de investigación sí obtuvo documentación. No se concluye caída global. **No se probaron endpoints autenticados, credenciales, RSS municipal operativo ni todos los casos CAP.**

### Encaje en el repositorio

- `plan_journey` ya recibe origen, destino y `departureTime`; devuelve horarios y tramos. No hace falta pedir al usuario que defina otra vez su viaje para añadir contexto meteorológico.
- Core ya tiene PostgreSQL/PostGIS, ventana de actividad, leases, backoff y persistencia. EMT demuestra el patrón de caché por recurso y exclusión concurrente. Reutilizarlo, no introducir otro servicio de caché o scheduler.
- El job AEMET actual consulta Retiro cada diez minutos durante actividad y conserva observaciones. Su umbral de dos horas para lecturas observadas **no debe copiarse sin más** a previsiones o avisos.
- El contrato de procedencia actual se centra en `observedAt`; una predicción necesita distinguir emisión y periodo previsto. Añadir esa semántica de forma aditiva, sin falsear observaciones ni reescribir todos los contratos del dominio.
- El DTO actual de routing no trae la geometría completa de cada tramo. No permite afirmar que se ha evaluado meteorología a lo largo de toda la ruta.

## Flujo funcional propuesto

```text
Solicitud del usuario
  → resolver origen, destino y hora como ya hace el chat
  → plan_journey calcula alternativas
  → Core reúne municipios/zonas y periodos de esas alternativas
  → lee productos meteorológicos compartidos
  → añade contexto acotado a la respuesta de plan_journey
  → EVE explica solo lo pertinente

Worker existente
  → revisa únicamente recursos demandados y vencidos durante actividad
  → descarga/revalida, normaliza y persiste
```

- Activar el enriquecimiento después de resolver una solicitud válida, no ante cualquier mención de lugares. Si falta un dato esencial, seguir la aclaración habitual; no inventar una salida ni una ruta elegida.
- Reunir necesidades de **todas** las alternativas y deduplicar municipio/producto. No hacer una descarga por alternativa ni asumir que el usuario escogió la primera.
- En seguimientos como «mejor a las 19», volver a evaluar el periodo correspondiente utilizando el producto ya guardado si lo cubre. Cambiar la hora no implica descargarlo otra vez.
- Añadir un bloque estructurado `weatherContext` con cobertura, periodos, estado y referencias a evidencias; compartir evidencia entre alternativas. No enviar boletines completos al modelo ni exigir una segunda tool por cada ruta.
- Conservar `get_environment` para preguntas meteorológicas explícitas, leyendo el mismo servicio y caché. El agente no recibe claves ni URLs operativas de proveedores.

## Persistencia y actualización mínimas

**Unidad compartida:** producto + municipio para predicción; producto + demarcación para avisos. Nunca usuario, sesión o texto de la pregunta. Persistir payload normalizado, versión/hash, emisión, intervalos, última descarga, última comprobación, próxima comprobación, estado y control de concurrencia. No crear un registro persistente de viajes personales para obtener esta reutilización.

Usar PostgreSQL existente: una caché pequeña por recurso siguiendo el patrón EMT es suficiente. No forzar predicciones municipales variables dentro del único snapshot de Retiro, ni generalizar todo el scheduler. El worker existente atiende un lote acotado de recursos demandados; detenerlo por la ventana de actividad global y dejar caducar el interés en cada recurso no utilizado.

| Producto | Política inicial propuesta | Qué evita |
| --- | --- | --- |
| Predicción horaria municipal | Reutilizar el producto completo; revisar como máximo cada **30 min** mientras el municipio tenga demanda reciente. Refrescar también si falta el periodo pedido, con backoff para no repetir una ausencia conocida. | Una petición por ruta/hora/usuario. |
| Avisos Madrid | Comprobar el índice compartido cada **5 min** durante actividad, con descarga condicional; obtener el conjunto CAP completo solo al cambiar la versión o si falta una copia válida. | Descargar boletines por usuario y aplicar complejas cadenas incrementales de mensajes. |
| Municipios no consultados | No precargar ni mantener actualizada toda la región o España. | Trabajo sin utilidad para la evaluación. |

Estos intervalos son **decisiones de la aplicación**, no cadencias garantizadas por AEMET. Las comprobaciones de avisos podrían detectar un cambio hasta cinco minutos después, más latencia/fallos: no es un sistema de alertas instantáneas.

- Un único lease por recurso: cinco peticiones simultáneas producen como máximo una actualización concurrente, no cinco. Añadir límite global conservador y respetar `Retry-After`/backoff. Una actualización OpenData puede requerir dos peticiones HTTP: sobre de respuesta y descarga de datos.
- Caché utilizable: responder sin red. Primera consulta sin caché: permitir una actualización con presupuesto corto total, por ejemplo **3 s**, y degradar si no termina; el worker puede completar después con su lease. No dejar promesas sueltas tras la respuesta ni acumular esperas/reintentos por cada municipio. Un fallo meteorológico nunca convierte una ruta válida en `no_route`.
- Tras error, conservar el último dato válido pero marcarlo como antiguo cuando corresponda. No fingir normalidad ni datos recién publicados. La política de uso de antiguos debe ser distinta por producto; no llamarlos «vigentes comprobados» fuera del plazo acordado.
- Separar `issuedAt`, intervalos de validez, `fetchedAt` y `checkedAt`. Una 304 reciente confirma que no cambió el índice; **no prolonga** la validez CAP ni una predicción. Un aviso publicado ayer puede seguir aplicando mañana; un dato descargado ahora puede no cubrir el viaje.
- Antes de afirmar «sin avisos», exigir estado completo correctamente procesado, comprobación reciente y cobertura del periodo/zona. Un error HTTP, un archivo vacío inesperado o un horizonte insuficiente significan desconocido, no cero.
- Solo URLs oficiales permitidas, límites de descarga/descompresión y análisis XML sin entidades externas. No extraer rutas arbitrarias de archivos CAP. Conservar atribución y fecha de actualización de AEMET.

## Qué significa un cambio sustancial

Separar **cambio del producto** de **cambio pertinente para este itinerario**:

- Publicación: nuevo identificador, emisión, contenido o revisión CAP. Actualiza la caché aunque cambie poco.
- Relevancia: aparece/desaparece un aviso aplicable, cambia su nivel o su periodo empieza/deja de solaparse con el viaje; la precipitación prevista pasa a afectar un tramo a pie; el usuario cambia de hora/zona y encuentra condiciones distintas.
- No destacar únicamente un nuevo timestamp, otro ID CAP equivalente o una variación mínima de temperatura. No introducir umbrales de seguridad propios ni anunciar cancelaciones de transporte deducidas del tiempo.
- Para predicción, conservar valores y periodos originales; decidir una nota breve con reglas transparentes. No convertir una probabilidad de seis horas en certeza de lluvia a una hora exacta ni aplicar una alerta a toda la región.

Primera entrega: evaluar y explicar al consultar/reconsultar el viaje. EVE puede reutilizar las evidencias de la conversación y evitar repetir una nota idéntica en el mismo contexto. Si el usuario pide un resumen nuevo, conservar los avisos todavía pertinentes. **No implica vigilancia de un viaje después de cerrar el chat, notificaciones push ni mensajes automáticos.** Eso sería otro producto y no hace falta aquí.

## Cobertura espacial y temporal sin falsa precisión

- Resolver el municipio a partir de la identidad o coordenadas ya conocidas. No consultar geocodificación externa por cada ruta ni escoger el municipio cuya capital sea simplemente la más cercana.
- Cuando el catálogo no lo incluya, incorporar un extracto local de límites municipales oficiales y cruzarlo con PostGIS; la fuente IGN ofrece [unidades administrativas](https://api-features.ign.es/collections/administrativeunit?f=html). Verificar el extracto y sus identificadores al implementar, no desplegar otro servicio GIS.
- Relacionar zonas de aviso mediante geocódigos/geometrías oficiales, preservando correspondencias ambiguas. AEMET publica [detalle municipal por zonas](https://www.aemet.es/documentos/es/eltiempo/prediccion/avisos/plan_meteoalerta/detalle_municipios_zonas_meteorologicas.pdf); comprobar su vigencia frente al producto CAP antes de importarlo.
- Primer alcance: origen, destino y transbordos con ubicación conocida, con especial atención a periodos caminando. Si solo se cubren extremos, declararlo; no presentar análisis continuo de todo el trayecto. No inferir exposición exterior de una espera sin información del lugar.
- La predicción municipal es contexto aproximado, no radar por calle. Rechazar horas fuera de los intervalos realmente publicados; no hacer fallback silencioso a observaciones actuales o un resumen diario. Normalizar zonas horarias y cambios de hora según metadatos de cada producto, nunca según el reloj del servidor.

## Orden de una implementación posterior

1. Confirmar contrato/metadata del JSON OpenData autenticado y conexión local, y escoger el extracto geográfico mínimo. No repetir auditorías del resto del sistema.
2. Implementar cache/normalización de los dos productos con el worker y DB existentes; pruebas de concurrencia, errores, 304, CAP sin aviso/retirada y periodos mixtos.
3. Enriquecer `plan_journey` con evidencia compacta y cobertura explícita; actualizar instrucciones EVE, sin rediseño de UI ni modificar preferencias/algoritmo OTP.
4. Comprobar viajes repetidos y concurrentes sin descargas duplicadas, cambio de hora con caché, cobertura parcial y ruta disponible con AEMET caído. Pruebas acotadas, entrega PR/CI/runtime habitual; no nueva campaña general.

**No incluir ahora:** observación multiestación como requisito para enriquecer rutas, radar/nowcasting, nuevas herramientas por producto, infraestructura adicional, seguimiento continuo por usuario, avisos push, rerouting automático ni supuestas interrupciones de servicio causadas por meteorología.

## Nota operativa y límites de esta investigación

La [comunicación oficial vigente](https://opendata.aemet.es/centrodedescargas/novedades) anuncia nuevas claves con tres meses de validez y la invalidez de claves sin expiración desde el **15/10/2026**. Revisar únicamente el estado/caducidad de la configuración al implementar, sin mostrar ni registrar secretos. No se inspeccionó la clave existente en esta investigación.

La [nota de reutilización](https://www.aemet.es/es/nota_legal) exige atribución y conservar el sentido y las fechas de la información. Mostrar «Fuente: AEMET» y distinguir claramente nuestra selección contextual de la información oficial.

No se hicieron llamadas al modelo, pruebas de routing ni cambios de runtime/credenciales. No se instaló software. Firecrawl CLI no estaba disponible; la investigación utilizó navegación web y lecturas HTTP públicas acotadas. El roadmap no se modifica hasta acordar este ajuste del bloque.
