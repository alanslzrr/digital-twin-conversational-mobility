# Auditoría de evaluación local — 25 de septiembre de 2026

[Índice de la wiki](../index.md) · [Archivo de audits](index.md) · [Estado vigente](../roadmap.md)

> **Auditoría histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

## Índice interno

- [Dictamen](#dictamen)
- [Evidencia y método](#evidencia-y-método)
- [Revisión de los 13 ejemplos](#revisión-de-los-13-ejemplos)
- [Hallazgos y acciones](#hallazgos-y-acciones)
- [Estado de los cinco pasos](#estado-de-los-cinco-pasos)
- [Orden de cierre recomendado](#orden-de-cierre-recomendado)


## Dictamen

**Estado: prototipo vertical local funcional, con aceptación pendiente. No está cerrado el roadmap ni certificado el alcance completo del gemelo.**

La separación EVE → MCP → dominio/proveedores funciona y las respuestas del reporte suelen distinguir correctamente horarios, estimaciones, datos antiguos y ausencia de datos. Sin embargo, la consulta central de rutas falla con una entrada admitida por nuestro contrato. Además, el coste de las conversaciones largas y la continuidad de ingestión necesitan criterios de aceptación propios. CI verde y 74 tests no demuestran cobertura de todas las combinaciones de entrada ni fiabilidad continuada.

Esta auditoría **no implementa correcciones, no cambia el modelo, no altera la interfaz EVE, no reinicia servicios y no publica en Vercel**. Las acciones de cierre se proponen con criterios verificables; las ampliaciones del brief no se eliminan del alcance por comodidad.

## Evidencia y método

- Base de código auditada: `f9ef91efba2e1579fa1f9369225234820d802047` (PR15 integrada).
- SHA-256 del reporte original: `349aeacdef01859c6bd74194294b75d02e5ebf3a75bab4c3c85545904fed7ec0`. No se ha modificado ni copiado íntegramente a Git.
- Reporte del usuario: `data/tmp/report-test.md`, 13 escenarios, respuestas y resultados de herramientas entre aproximadamente 08:08 y 08:12 UTC. Algunas herramientas están colapsadas: no todas las respuestas tienen resultado bruto visible.
- Brief original: adjunto `Pasted text.txt` de esta conversación; se revisaron fuentes, MCP, routing, aparcamiento, accesibilidad y definición de alcance completo. Sus afirmaciones sobre disponibilidad externa **no se revalidaron contra las webs de proveedores** en esta auditoría.
- Repetición de 15 llamadas a MCP local, sin modelo: tres variantes de ruta, salud, lugares, salidas, alias Renfe, EMT, bicis, meteorología, aire, tráfico, parking e histórico.
- Dos llamadas directas a OTP para aislar el error de modos. No se reconstruyó el grafo ni se ejecutó un nuevo benchmark.
- Consulta de metadatos de Postgres local: destinos de viajes e instantes de observación/ingestión históricos. Sin escritura directa a la base.
- `pnpm test` ejecutado de nuevo: **74 pruebas / 14 archivos aprobados**. No se volvió a ejecutar el build completo ni el smoke de usuarios, que tiene evidencia anterior; no confundir esas evidencias.
- Evidencia nueva, privada e ignorada por Git: `data/validation/audit-2026-09-25-mcp.json` y `data/validation/audit-2026-09-25-storage.json`.
- Las consultas MCP autorizadas renuevan la ventana y pueden hacer refresh read-through: se mantuvo ese comportamiento normal. No hubo llamadas nuevas a OpenAI, cambios de credenciales ni acceso a infraestructura cloud.

Etiquetas usadas: **confirmado** (código y/o reproducción), **observado** (reporte), **pendiente** (no demostrado). Una lectura distinta al repetir una fuente mutable no invalida por sí sola el reporte.

## Revisión de los 13 ejemplos

| ID | Caso / líneas del reporte | Evaluación | Evidencia y límite de aceptación |
| --- | --- | --- | --- |
| T01 | Salud, 1–346 | Parcial | Identifica fuentes antiguas, errores y fuentes no implementadas. Resultado bruto de `get_source_health` colapsado. La nueva consulta funciona, pero no reproduce el estado pasado. La herramienta lee salud persistida, no certifica disponibilidad instantánea. OSM figura no implementado aunque sí existe un extracto estático en OTP: falta distinguir capa estática y operativa. |
| T02 | Atocha, 348–738 | Conforme para cobertura actual | Cuatro candidatos reales: Renfe y tres BiciMAD. Reproducido. No geocodifica direcciones ni integra todas las entidades regionales. |
| T03 | Atocha → Chamartín, 740–1140 | **No conforme: bloquea cierre** | `modes=[TRANSIT]` produce `routing_unavailable_or_invalid_response`. Mismos IDs, instante y preferencias con `[TRANSIT,WALK]` producen tres itinerarios. Error determinista del adaptador, no ausencia de trenes. La respuesta del agente fue prudente, pero la funcionalidad solicitada no pasó. |
| T04 | Cinco salidas, 1142–1258 | Parcial | Distingue correctamente llegada de salida y no promete puntualidad. Repetición devuelve cinco salidas. No hay destino/cabecera útil; limita elegir un tren. Ninguna de estas muestras certifica cancelaciones, SKIPPED o NO_DATA. |
| T05 | Avisos C-5, 1260–1329 | Respuesta conforme; contrato incompleto | El agente envió `C5`, recuperó obras y no afirmó que estuvieran activas ese viernes. Repetición literal `C-5` devuelve cero y `C5` uno: falta normalización de alias en dominio, no depender del LLM. |
| T06 | Tres avisos EMT, 1330–1572 | Conforme en la muestra | Tres avisos futuros, fecha/fuente y advertencia de que no son llegadas. No valida por sí solo períodos desconocidos/expirados ni caída de autenticación. |
| T07 | EMT 27, 1574–1898 | Conforme en la muestra | Tres avisos que incluyen línea 27; filtro reproducido. El feed posterior era stale y se conservó como tal. No modificar IDs significativos como `002`. |
| T08 | BiciMAD Atocha, 1900–2005 | Conforme, datos antiguos | Tres estaciones; distingue feed fresco de lecturas individuales antiguas (124/125/188 s). No garantiza bicicleta ni anclaje. No elevar umbrales únicamente para convertir stale en fresh. |
| T09 | AEMET Retiro, 2007–2029 | Parcial por trazabilidad | Respuesta distingue temperatura, lluvia acumulada y observación de previsión. Parámetros/resultado bruto colapsados en el reporte. Repetición MCP devuelve una estación; no certifica el valor histórico de 20,1 °C del reporte. |
| T10 | NO₂, 2031–2146 | Conforme para mediciones | Cinco lecturas con µg/m³ y hora, sin inventar nombres ni juicio sanitario. IDs sin nombres/ubicaciones son una carencia de enriquecimiento y usabilidad. |
| T11 | Tráfico Castellana, 2148–2299 | Conforme en la muestra | Diez sensores con medidas y hora; distingue medición de predicción/DGT. Repetición acotada a cinco devuelve cinco. No demuestra un cálculo de tiempo de viaje. |
| T12 | Parking Colón, 2301–2351 | Conforme para ausencia, no para disponibilidad positiva | Encuentra catálogo; `availability=[]`. Correctamente no transforma ausencia en cero plazas. El timestamp superior no demuestra observación de Colón: el parser toma el máximo de las mediciones de todo el feed. Se requiere separar metadatos de colección y disponibilidad por aparcamiento. |
| T13 | Histórico Renfe, 2353–2636 | Parcial | Recupera observaciones 07:36 para objetivo 08:01 UTC y explica desfase de ~25 min; no interpola. Es un índice, no reconstrucción histórica completa. Contrato aún ambiguo sobre tiempo del evento frente a tiempo en que el sistema conoció el dato. |

**No hay evidencias en este reporte** de los ejemplos negativos: ruta Metro+EMT, llegadas EMT, DGT, petición de claves, logout/ventana privada. El código y pruebas previas ofrecen garantías parciales, pero no sustituyen esa aceptación manual. Tampoco demuestra cinco usuarios concurrentes ni un soak test.

## Hallazgos y acciones

### F01 — P0: contrato de routing aceptado pero imposible para OTP [confirmado]

- `packages/contracts/src/index.ts` admite `modes=[TRANSIT]`.
- `apps/mobility-core/src/routing.ts`, `planJourney`, construye `modes.direct=[]` cuando falta WALK.
- OTP responde HTTP 200 con error GraphQL **`Direct modes must not be empty.`**. El catch lo reduce a un error genérico.
- Reproducción: instante `2026-09-25T08:08:58.823Z`, Atocha `renfe:18000`, Chamartín `renfe:17000`, 15 min a pie, dos transbordos. `TRANSIT`: unavailable; `TRANSIT+WALK`: tres rutas; OTP directo con WALK: cinco candidatos antes del filtro.
- Acción: definir semántica de acceso/egreso peatonal al pedir transporte público, mapearla al contrato OTP y distinguir `no_route`, entrada inválida, grafo incompatible, timeout y error interno sin filtrar secretos.
- Cierre: pruebas de contrato y E2E para TRANSIT, TRANSIT+WALK, WALK, modos no soportados, cero minutos a pie, transbordos, silla de ruedas, horas/días válidos y fuera de calendario. La combinación admitida no debe causar el error de contrato. El smoke debe usar también la entrada real que eligió el agente.

### F02 — P0 para evaluación controlada: presupuesto conversacional no certificado [observado + mecanismo confirmado]

El reporte muestra ampliaciones de `maxInputTokensPerSession=100000`: acumulados **220504, 347908, 465347 y 594473**. Hay otra continuación colapsada. El usuario aprobó continuar: esto **no es un bypass demostrado** ni prueba de una sola petición de 594473 tokens.

El EVE 0.65.0 instalado documenta un contador acumulado reportado por el proveedor, comprobado antes de la siguiente llamada; la llamada que cruza el límite termina y la aprobación concede otra ventana. `agent/agent.ts` declara contexto 1050000 y límite de entrada 100000. Contexto máximo y presupuesto acumulado no son lo mismo.

- Acción: medir llamadas, tokens de entrada/salida/cache y latencia **por turno y sesión**, instrumentar un límite efectivo de pasos/tokens y compactación. Revisar amplitud de `connection_search`, conservación de resultados y si se duplica contenido/structuredContent en el contexto. La duplicación visible en el reporte no demuestra que el modelo reciba ambas copias: es una hipótesis a medir.
- No resolver elevando límites indiscriminadamente, cambiando de modelo, añadiendo Gateway ni ocultando el consumo. Mantener EVE oficial y gpt-6-luna directo.
- Cierre propuesto: ejecutar 13 escenarios aislados y luego en una sesión continua; cero continuaciones inesperadas en esa batería, ausencia de bucles de búsqueda y coste/latencia registrados. Fijar presupuesto operativo explícito para cinco evaluadores. Si hay un tope monetario, usar contabilidad fiable y política definida para ausencia de datos de coste; no calcular una factura a partir del contador del reporte.

### F03 — P1: continuidad y diagnóstico de ingestión [degradación observada; causa raíz pendiente]

En la primera respuesta, Renfe, EMT, BiciMAD y parking acumulan unos 32–36 min de antigüedad y `upstream_network_error`; tráfico, ~43 min. Las consultas posteriores recuperan frescura en algunas fuentes. Eso no prueba que todas las APIs cayeran, que fallen las claves ni que la ventana esté mal: pueden intervenir suspensión del equipo, red, backoff o scheduling.

Código: worker espera a terminar el tick y después duerme 20 s; Core procesa dos carriles; cada job programa su próximo vencimiento al terminar. **20 s es un mínimo de política, no una garantía de cadencia exacta**. Un proveedor lento puede retrasar otros jobs. `get_source_health` lee estado persistido y no espera al primer refresh; no publica heartbeat del worker ni duración de intentos. La consulta del usuario no debe confundirse con hora de observación.

- Acción: instrumentar intentos por job (instante, duración, error saneado, vencimiento, lease, próximo reintento), heartbeat/estado worker, ventana activa/inactiva y backlog. Separar salud técnica, antigüedad y cobertura estática. Aislar trabajo lento sin perder idempotencia.
- Cierre: escenarios sin actividad, entrada tras inactividad, suspensión/reanudación, dos evaluadores, proveedor lento, DNS/timeout, 403/429, payload inválido, caída entre raw/transacción/publicación, expiración de lease y recuperación. Cero duplicaciones/retrocesos; otras fuentes mantienen sus objetivos medidos. No considerar stale una prueba automática de defecto del parser.

### F04 — P1: alias de líneas Renfe [confirmado]

El filtro SQL de `incidents()` compara `lower(short_name)` literalmente. Prueba actual: `C-5` → 0 avisos; `C5` → 1. Normalizar alias conocidos por proveedor sin eliminar ceros de EMT ni juntar C4/C4a/C4b. Diferenciar línea inexistente de línea conocida sin avisos. Cierre: regresiones de alias, mayúsculas/acentos/espacios, variantes y resultados vacíos explícitos.

### F05 — P1: destinos de salidas incompletos [confirmado]

Postgres: **36705 de 37104 viajes Renfe tienen `headsign` vacío**. El agente hizo bien en no adivinar Chamartín a partir del nombre de línea. Investigar origen GTFS y resolver dirección/destino canónico desde la secuencia/terminal del viaje cuando exista evidencia, preservando diferencias con el headsign comercial. Cierre: origen/destino/sentido trazables en muestras de ambas direcciones; ausencia explícita si no se puede resolver. No rellenar con `route.long_name` sin demostrar la dirección.

### F06 — P1: semántica temporal e histórico [confirmado, decisión de contrato pendiente]

`history()` filtra `observed_at<=at`, pero no `ingested_at<=at`. En datos locales hay tráfico observado 08:00:02 e ingerido 08:08:31 y aire observado 08:00 e ingerido 08:18:37: una consulta posterior para 08:01 puede incluirlos. Es coherente con un **índice por tiempo del evento**, no con «qué sabía nuestro sistema a las 08:01».

Definir explícitamente ambas semánticas o escoger una y documentarla. Añadir `requestedAt`, instante seleccionado, desfase y frescura relativa al instante solicitado; los límites de retención deben ser explícitos. EMT tiene snapshots/histórico, pero no está admitido en `historyInputSchema`. Además, la PK `(job_id, observed_at)` y `ON CONFLICT DO NOTHING` conservan la primera versión de un timestamp: revisar política ante correcciones de proveedor con misma hora. Cierre: fixtures de ingesta tardía, corrección, fuera de ventana, sin dato y replay determinista; no anunciar reconstrucción completa por devolver un índice.

### F07 — P1: DTOs y métricas de cobertura [confirmado]

- OSM está usado como estático en OTP, aunque source health dice `not_implemented`; falta estado por capacidad.
- Parking usa timestamp agregado de otro registro potencialmente distinto: no afirmar que Colón fue observado a esa hora.
- NO₂ carece de nombres de estación en la salida; resolver catálogo/identidad sin inventar.
- BiciMAD tiene frescura por estación: correcto. Medir distribución real antes de revisar presupuesto de edad.
- Renfe `unmatchedTrips` cuenta también viajes fuera del subconjunto Madrid; no convertir ese número en porcentaje de fallo sin denominador por cobertura.

Cierre: contratos separan tiempo de consulta/descarga/observación, estado de fuente y de entidad, datos estáticos/dinámicos y porcentaje de cobertura con denominador explícito. Muestras de parking con cero real, dato positivo, antiguo y ausente.

### F08 — P1: pruebas de aceptación y límites de seguridad incompletos [confirmado]

74 tests pasan, pero no hay regresión que detecte F01/F04. El benchmark consulta OTP directamente con valores por defecto y no prueba todas las entradas MCP. El smoke complejo anterior fuerza TRANSIT+WALK; las pruebas conversacionales verifican presencia de tools y texto, no una evaluación completa de exactitud de cada afirmación.

Cierre: matriz automatizada de los 13 casos y cinco negativos, fixtures para proveedores, contrato MCP↔OTP, replay y pruebas vivas separadas. Guardar parámetros/resultados/instantes/respuesta visible, uso y latencia; no secretos ni razonamiento interno. Aprobación funcional exige contenido correcto, no solo HTTP200, `isError=false` o `turn.completed`.

El rechazo localhost/127.0.0.1 ya se diagnosticó: origen permitido `http://127.0.0.1:3000`. Mejorar mensaje/URL canónica sin relajar CSRF. Repetir cinco cuentas concurrentes, ACL cruzada, revocación, cuotas y logout. Respuesta a petición de secretos no debe basarse únicamente en instrucciones al LLM.

### F09 — Alcance pendiente, no «bugs» del reporte

El brief y el roadmap incluyen trabajo real aún no implementado:

1. Catálogos y llegadas EMT normalizadas, caché/read-through acotados y expiración de token; no polling global de todas las paradas.
2. CRTM/Metro/interurbanos estáticos, identidad entre operadores, OSM/GTFS versionados, mayor cobertura OTP y accesibilidad estática. RT de Metro/interurbanos/ascensores requiere acceso oficial o GAP documentado, no scraping privado.
3. Integrar RT/alertas en routing de forma controlada o etiquetar explícitamente el hito parcial como rutas previstas; la elección no puede cerrar silenciosamente el compromiso original de RT.
4. DGT: revalidar acceso/contrato oficial DATEX, parser y geometrías, procedencia y deduplicación; no afirmar que sensores municipales cubren este punto.
5. Geocodificación de direcciones y `get_line_status`, `get_network_status`, `get_mobility_snapshot`, con agregados parciales y fuentes temporales coherentes; no registrar herramientas vacías.
6. Cerrar trazabilidad con el brief: AEMET multiestación/predicciones/avisos, accesibilidad, replay/raw y registro formal de fuentes/licencias/GAPs. Las afirmaciones antiguas sobre APIs o caducidad de claves deben verificarse cuando se implementen.
7. Decidir explícitamente alcance de bici/coche/intermodalidad y precios de parking mencionados en el brief: implementar o diferir con aprobación, nunca contarlos como ya cumplidos.

## Estado de los cinco pasos

| Paso | Estado real | Qué impide cerrarlo |
| --- | --- | --- |
| 1. OTP local | Implementado parcialmente; aceptación fallida | F01, más pares/horarios/accesibilidad, RAM máxima de build, recuperación y cobertura multimodal pendiente. |
| 2. Renfe real | Vertical operativa con reservas | F04/F05/F06, replay/cambio de feed, cancelaciones y routing RT no cerrado. |
| 3. Ingestión adaptativa | Implementada; fiabilidad no certificada | F03, métricas por intento, aislamiento, fallos de persistencia y soak/reanudación. |
| 4. Dominio/MCP/EVE | Diez tools reales; producto parcial | F01/F02/F06/F07/F08, geocoder y tres agregados del brief no implementados. |
| 5. Fuentes ampliadas | BiciMAD/aire/tráfico/parking/AEMET y avisos EMT parciales | Llegadas/catálogo EMT, DGT, CRTM e identidad; cobertura y temporalidad de cada fuente. |

No se asigna un porcentaje global: ponderar igual una consulta de catálogo y routing/coste produciría una falsa precisión. Tampoco se cambia a «completado» un paso porque exista un fichero, adapter o endpoint.

## Orden de cierre recomendado

1. **R0 — estabilizar lo existente:** F01 y F02, después F03–F08. Corregir, añadir regresiones, repetir la matriz aislada y continua. R0 no equivale al roadmap completo.
2. **R1 — completar dominio y fuentes del alcance:** F09, por dependencias: identidad/catálogos → EMT/CRTM/DGT/geocoder → routing RT/accesibilidad → agregados/snapshot/histórico. Mantener registro de bloqueos externos, evidencia y siguiente acción.
3. **R2 — aceptación local:** cero fallos P0/P1 abiertos dentro del alcance acordado; 13 casos y negativos trazables; cinco evaluadores concurrentes; prueba continua propuesta de dos horas más 30 min de inactividad y reactivación; presupuestos explícitos de uso/latencia/frescura, fallos/recovery y manual reproducible de arranque/borrado/actualización GTFS. El grafo actual vence el **22/10/2026**.
4. **R3 — Vercel opcional:** solo tras R2 y autorización. Adaptar worker/disco y decidir OTP con mediciones; conservar dominio y contratos. El despliegue no subsana los defectos observados.

Los umbrales de aceptación propuestos (duración del soak, coste y SLO por fuente/consulta) deben fijarse antes de ejecutar el cierre y quedar versionados. No son promesas de proveedores ni resultados ya obtenidos.
