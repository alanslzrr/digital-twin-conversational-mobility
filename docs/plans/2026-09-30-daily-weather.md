# Instrucciones para entregar predicción diaria AEMET

[Índice de la wiki](../index.md) · [Archivo de plans](index.md) · [Estado vigente](../roadmap.md)

> **Plan histórico.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Fecha: **30/09/2026**. **Plan preparado; implementación pendiente.**

Implementa y entrega localmente **predicción diaria municipal como ampliación del contexto meteorológico existente**. Lee la [investigación y contraste de fuentes](../research/2026-09-30-daily-weather.md), `AGENTS.md`, el [roadmap](../roadmap.md) y la [operación local](../local-runtime.md). No repitas la investigación completa ni conviertas este bloque en otra auditoría general.

Base al redactar: `main` en `59613bf`. Los documentos están en `alanslzrr/daily-weather-plan`, inicialmente sin commit. Comprueba el estado real y consérvalos. Este plan fija las decisiones funcionales; los nombres internos pueden ajustarse a las convenciones existentes sin alterar la semántica.

## Índice interno

- [Resultado y alcance](#resultado-y-alcance)
- [Fuente y adquisición](#fuente-y-adquisición)
- [Contrato y semántica](#contrato-y-semántica)
- [Caché y selección sin multiplicar peticiones](#caché-y-selección-sin-multiplicar-peticiones)
- [Herramientas y conversación](#herramientas-y-conversación)
- [Archivos de partida](#archivos-de-partida)
- [Pruebas proporcionales y entrega](#pruebas-proporcionales-y-entrega)


## Resultado y alcance

Una consulta como «voy a Alcalá el sábado, ¿qué tiempo se prevé?» debe poder usar la predicción publicada para esa fecha, incluso si no existe cobertura horaria. `plan_journey` sigue calculando rutas y añade contexto a sus puntos/horarios conocidos; `get_environment` sirve consultas meteorológicas explícitas sin requerir que exista una ruta.

Incluye **probabilidad de precipitación, estado del cielo y temperatura mínima/máxima por fecha**. Es el conjunto mínimo útil de esta entrega. El viento diario tiene semántica distinta según alcance; no incorporarlo como si fuera el viento horario ya implementado. Rachas, viento diario, UV, humedad, sensación térmica y cota provincial quedan fuera de este incremento, sin retirar datos horarios existentes ni crear automáticamente nuevos requisitos del roadmap.

No incluir multiestación, notificaciones, seguimiento de viajes, pantallas, nuevo proveedor, descarga masiva, otros modos de routing, cambios del grafo/OTP ni despliegues. EVE oficial, Better Auth, OpenAI directo, E2 y demás entregas cerradas se mantienen.

## Fuente y adquisición

1. **Fuente única diaria:** `https://www.aemet.es/xml/municipios/localidad_{codigo}.xml`, el recurso enlazado en la [página municipal oficial](https://www.aemet.es/es/eltiempo/prediccion/municipios/madrid-id28079). Usar solo municipios `28xxx` presentes en la geografía ya instalada. No usar el JSON diario ni añadir fallback entre formatos: el contraste real detectó vacíos convertidos en cero. No modificar el adaptador horario OpenData.
2. Reutilizar `weatherResponse` y `fast-xml-parser`. URL construida en Core desde el código validado; HTTPS, host/ruta fijos, sin redirecciones, timeout/cancelación compartidos y cuerpo máximo de 2 MB. Rechazar DTD/entidades, XML inválido, municipio incorrecto y fechas inválidas. Preservar texto vacío antes de convertir números; no descargar XSD durante uso normal.
3. Con payload válido y `Last-Modified`, enviar `If-Modified-Since`. Una 304 conserva payload, versión, elaboración, periodos y fecha de descarga; actualiza la comprobación. Una 304 sin payload es error, nunca un pronóstico vacío válido. Si falta el validador, GET normal con el mismo límite de revisión.
4. Reutilizar atribución `Fuente: AEMET`, conservar fecha original e identificar la selección contextual propia. No enviar XML completo, URLs operativas ni credenciales al modelo. Este recurso diario es público; no requiere nueva clave ni cambios de configuración del proveedor existente.

## Contrato y semántica

### Producto separado

- Añadir `daily_forecast` de forma aditiva. Mantener `forecast:28079` para el horario y usar **`daily:28079`** para el diario; `warnings:28` sigue separado. No sobrescribir cachés ni reinterpretar payloads horarios persistidos como diarios.
- Conservar código/nombre, producto, versión, elaboración original, fechas originales, periodos, descarga/comprobación, calidad y atribución. Las referencias compartidas deben identificar también producto y versión; valores iguales de productos distintos no son la misma evidencia.
- DTO diario con periodos de probabilidad/cielo y extremos asociados a su **fecha publicada**. No forzar mínima/máxima dentro de `temperature` instantánea ni interpolarlas. No hace falta generalizar el contrato meteorológico completo.

### Periodos y valores

- Para el **XML diario público**, interpretar bloques `00-06`, `06-12`, `12-18`, `18-24`, `00-12`, `12-24` y `00-24` en UTC según la [explicación oficial](https://www.aemet.es/es/eltiempo/prediccion/municipios). `24` es medianoche del día siguiente. Conservar el periodo original y convertir a `Europe/Madrid` solo al presentar o comparar consultas locales; no sumar dos veces el offset. No modificar con esta regla el JSON horario existente.
- Cuando falta `periodo` en probabilidad/cielo, usar el día publicado completo como intervalo diario equivalente a `00-24`, conservando que el atributo estaba ausente. No interpretar cualquier cadena malformada como día completo.
- Usar intervalos semiabiertos `[inicio, fin)`. Un viaje que cruza medianoche puede necesitar dos fechas. Día local y fecha UTC del boletín no siempre coinciden: seleccionar por solapamiento, no solo por igualdad de fecha local.
- Vacío/ausente es desconocido; `0` explícito se conserva. Probabilidad válida entre 0 y 100; temperatura finita y mínima no superior a máxima. Un campo opcional inválido se omite con calidad explícita, sin descartar los otros campos válidos; un documento de identidad/fechas incoherentes no sustituye la caché válida.
- Para cada variable y fecha, elegir **la resolución más fina cuyos periodos válidos cubran la parte consultada**: 6 h, después 12 h, después 24 h. Devolver solo esa resolución para esa variable/fecha. Si ninguna cubre todo, conservar los periodos válidos de la resolución con mayor cobertura y marcar parcial; empate: preferir la más fina. No sumar ni promediar probabilidades ni mezclar padres e hijos solapados.
- No exigir acumulados en mm para declarar cobertura diaria. Para el estado global `covered`, exigir continuidad de periodos válidos de probabilidad de precipitación sobre el intervalo consultado; informar por separado disponibilidad de cielo y extremos. Si solo existen estas otras variables, devolverlas con cobertura parcial, no como ausencia total de información. `covered` nunca significa precisión horaria, ausencia de lluvia ni condiciones seguras.
- Una probabilidad de seis horas o de un día no es la probabilidad exacta de mojarse durante cinco minutos caminando. Conservar intervalos íntegros en el DTO aunque se solapen solo parcialmente con el trayecto; no recortarlos para aparentar precisión.

### Elaboración y antigüedad

`elaborado` llegó sin offset y la documentación revisada no confirma su zona. **No presentar como oficial una zona inferida ni sustituir elaboración por descarga o `Last-Modified`.**

Conservar `issuedAtRaw` y una indicación de zona no especificada. Para cálculos internos de antigüedad, usar de forma explícitamente conservadora el instante más antiguo entre las interpretaciones válidas UTC y `Europe/Madrid`; guardar/identificar esa base como interpretación, no como hora de emisión confirmada. Incluir ambos candidatos civiles cuando se repite una hora; si el helper no puede resolverlo, declarar esa publicación diaria no utilizable en vez de escoger una hora arbitraria. El campo público de emisión exacta debe ser nulo cuando no esté confirmada, acompañado del texto original. Esta regla está decidida; no exige otra investigación ni una nueva infraestructura temporal. Un valor inválido no se normaliza silenciosamente.

Mantener la política existente: comprobación de predicción reciente hasta 30 min sin error; antiguo después; no utilizable tras 24 h desde comprobación o desde la elaboración conservadora. Esto permite una predicción para dentro de cinco días si fue publicada recientemente: **edad de publicación y horizonte son conceptos distintos**. Una 304 o un 200 idéntico no rejuvenecen la elaboración. Conservar protección frente a publicaciones anteriores y correcciones de igual elaboración.

## Caché y selección sin multiplicar peticiones

1. Reutilizar `weather_product`, `weather_gate` y el worker. Crear una migración aditiva que permita `daily:28xxx`; no editar `0018`, borrar cachés ni añadir tablas/servicios. Mantener los límites de municipios y puntos actuales.
2. Revisión diaria inicial cada **30 min**, demanda por recurso durante **30 min**, actividad global existente, leases y gate compartidos; respetar `Retry-After`/backoff. Son políticas locales, no cadencias garantizadas de AEMET. No precargar la región.
3. Reunir necesidades de todas las alternativas y consultar primero cachés. Renovar demanda de los productos útiles para esos periodos, no siempre ambos por municipio. Si el horizonte horario guardado no alcanza una fecha, demandar diaria sin volver a descargar horario por cada petición. Una ausencia de horizonte conocida se conserva hasta la siguiente revisión debida.
4. Mantener **un solo presupuesto total de 2 s** para enriquecimiento y, como máximo, **una actualización en frío por consulta**, no una por producto, punto o alternativa. El worker completa lo pendiente. No encadenar dos llamadas a `weatherProducts` que creen dos presupuestos/actualizaciones; separar lectura y elección con el mínimo cambio necesario.
5. Hasta doce municipios pueden requerir ambos productos por alternativas/horarios distintos: admitir hasta **25 recursos de lectura/demanda** incluyendo CAP, en lugar de perder elementos por el antiguo `.slice(0,13)`. Esto no autoriza 25 descargas. Conservar límites de salida y truncamiento explícito.
6. Para `plan_journey`, elegir **un producto por punto/intervalo**, no coser datos horarios y diarios. Prioridad: cobertura completa y reciente (horaria antes que diaria), después cobertura completa antigua aún utilizable (horaria antes que diaria), después parcial reciente y parcial antigua (misma preferencia). Si ninguno sirve, indisponible. No elegir un producto solo porque sus límites globales engloben el intervalo: comprobar huecos.
7. Devolver producto/resolución, frescura y motivo de uso diario, distinguiendo horizonte horario insuficiente, cobertura parcial, antigüedad y falta de datos. Si la elección es antigua o parcial, la respuesta debe decirlo. En empates de cobertura parcial puede mantenerse la preferencia horaria; no generar otra consulta al proveedor para desempatar.
8. CAP permanece independiente. No extender sus avisos a siete días ni afirmar «sin avisos» fuera de su cobertura. Tampoco convertir disponibilidad meteorológica en disponibilidad del calendario de transporte.

## Herramientas y conversación

- Añadir `weatherProduct=daily_forecast` a `get_environment`, con `kind=weather`, `placeId` resuelto y `fromTime/toTime`. Una petición explícita diaria devuelve diaria; una explícita horaria no cambia silenciosamente de producto. La selección automática anterior solo corresponde al contexto del itinerario.
- Conservar defaults y límites de observación/horaria/avisos. Para diaria, permitir intervalos que abarquen **como máximo siete fechas civiles en Europe/Madrid**, considerando el fin exclusivo. No usar un límite rígido de 168 h: hay días de 23/25 h. Sin `fromTime`, empezar ahora; sin `toTime`, terminar en la siguiente medianoche local respecto del inicio. No ajustar una fecha fuera del horizonte hacia otra disponible.
- Una pregunta sin hora sobre un día no necesita aclaración artificial: EVE pasa los límites de ese día local. La respuesta conserva las fechas/periodos UTC originales y explica cobertura parcial si corresponde. Para un viaje sí se usan sus horarios reales; no crear otra entidad de desplazamiento.
- Actualizar las instrucciones de EVE y las descripciones MCP existentes: diaria no es observación ni pronóstico exacto a la hora de salida; mínimas/máximas son del día publicado. No llamar a `get_environment` obligatoriamente después de `plan_journey` ni abrir otra tool.
- Adaptar `relevanceKey` mínimamente para no ocultar una pérdida de frescura/cobertura o un cambio de producto/resolución. No añadir alertas automáticas, umbrales de riesgo, recomendaciones sanitarias ni reordenación de rutas.

## Archivos de partida

- `apps/mobility-core/src/adapters/journey-weather.ts`, `aemet-forecast.ts`, `aemet-cap.ts`: adquisición y parsers; añadir parser diario propio sin reescribir los otros.
- `apps/mobility-core/src/weather-cache.ts`, `journey-weather.ts`, `mobility.ts`: persistencia, selección contextual y consulta explícita.
- `packages/contracts/src/journey-weather.ts`, `packages/contracts/src/index.ts`, `packages/domain/src/journey-weather.ts`, `packages/provenance/src/weather.ts`: contratos, selección y frescura.
- `apps/mobility-core/app/mcp/route.ts`, `apps/eve-web/agent/instructions.md`: descubrimiento y explicación.
- Tests meteorológicos existentes, `scripts/smoke-mobility.mjs` y próxima migración libre tras `0019`. Usar el número real disponible al implementar.

## Pruebas proporcionales y entrega

Ampliar las pruebas existentes, sin nueva campaña general:

1. Parser: muestra XML real reducida, vacío frente a cero, periodo ausente, solapamientos, extremos diarios, campo opcional inválido, municipio incorrecto y XML inseguro. Fixtures sin claves y con procedencia.
2. Tiempo/selección: bloques UTC de invierno/verano, `24`, medianoche y cambio de hora; día local de 25 h; seis/doce/veinticuatro horas; huecos; fecha fuera de horizonte; emisión sin zona explícita y caducidad conservadora. No interpolar temperaturas ni probabilidades.
3. Prioridades: horaria reciente completa evita diaria; diaria reciente vence a horaria antigua; parcial se etiqueta; petición explícita no cambia de producto; CAP no hereda horizonte diario.
4. Caché PostgreSQL aislada: coexistencia de productos, cinco lectores concurrentes/una adquisición, 304 sin rejuvenecer, errores conservan payload, backoff, ventana inactiva, ausencia de horizonte sin bucle, dos productos por municipio sin truncamiento silencioso y límite global de enriquecimiento. Reutilizar el arnés que elimina su esquema temporal.
5. Una descarga real XML normalizada y guardada, consulta MCP diaria dentro de su horizonte, repetición con contador de adquisición sin incremento y una ruta futura dentro del calendario activo que use la diaria. **El smoke debe exigir dato diario real en ese caso positivo**; aceptar solo `unavailable` prueba degradación, no entrega funcional. Probar aparte el fallo meteorológico sin perder la ruta. Sin llamadas al modelo.

Ejecutar `pnpm check`, `pnpm build:agent`, las pruebas PostgreSQL afectadas y el smoke meteorológico ampliado. No hace falta repetir todos los smokes ni benchmarks OTP. Un 429 transitorio se atiende con el mecanismo existente; no desactivar seguridad ni afirmar éxito a partir de fixtures.

Entregar con commits pequeños, PR y CI; respaldar antes de la migración, aplicarla y recompilar/reiniciar conjuntamente Core, Web, agente y worker conforme al procedimiento existente. **No reiniciar ni reconstruir OTP.** Integrar/sincronizar `main` y retirar solo ramas comprobadas como integradas, siguiendo el flujo del repositorio. Registrar una acta breve con evidencia y límites y actualizar el roadmap sin cerrar R1/R2 completos. No publicar en Vercel ni generar gasto de modelo.

El resultado no requiere otra validación genérica del usuario: deja el bloque instalado y explica qué se comprobó. Si una incidencia externa impide el caso real positivo, comunica exactamente esa limitación; no la maquilles como cierre ni amplíes el alcance para sortearla.
