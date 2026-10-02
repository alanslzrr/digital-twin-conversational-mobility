# Plan de resolución de la auditoría local

[Índice de la wiki](../index.md) · [Archivo de plans](index.md) · [Estado vigente](../roadmap.md)

> **Plan histórico · 25/09/2026.**

Fecha: **25/09/2026**. Estado: **ejecución iniciada por autorización del usuario; E0 mínimo y E1 implementados y validados localmente**. E2 cerrado con criterio revisado por el usuario; E3–E8 pendientes; R0–R2 no cerrados. [Evidencia de la primera entrega](../acceptance/2026-09-25-routing.md).

Referencias: [auditoría F01–F09 y casos T01–T13](../audits/2026-09-25-evaluation.md), [roadmap R0–R3](../roadmap.md), [operación local](../local-runtime.md) y [evaluadores](../evaluation.md).

**Vigencia (28/09/2026):** este documento conserva la secuencia original de trabajo. El estado y alcance actuales se consultan en el [roadmap](../roadmap.md), que prevalece sobre los pendientes históricos de este plan; no reabrir entregas ya cerradas. El siguiente bloque es [R2.1 — Historial de conversaciones](2026-09-28-conversation-history.md), basado en las sesiones y el chat oficial de EVE.

## Índice interno

- [Objetivo y límites](#objetivo-y-límites)
- [Secuencia y dependencias](#secuencia-y-dependencias)
- [E0 — Preparar una base de aceptación reproducible](#e0--preparar-una-base-de-aceptación-reproducible)
- [E1 — Corregir routing antes de ampliar el grafo](#e1--corregir-routing-antes-de-ampliar-el-grafo)
- [E2 — Control conversacional: cerrado con aceptación offline](#e2--control-conversacional-cerrado-con-aceptación-offline)
- [E3 — Explicar huecos y demostrar recuperación](#e3--explicar-huecos-y-demostrar-recuperación)
- [E4 — Resolver identidad y destinos en dominio](#e4--resolver-identidad-y-destinos-en-dominio)
- [E5 — Hacer explícitos tiempo, revisiones y calidad](#e5--hacer-explícitos-tiempo-revisiones-y-calidad)
- [E6 — Cerrar R0 con exactitud, no con HTTP 200](#e6--cerrar-r0-con-exactitud-no-con-http-200)
- [E7 — Completar F09 por dependencias, no por cantidad de tools](#e7--completar-f09-por-dependencias-no-por-cantidad-de-tools)
- [E8 — Certificar R2 para cinco evaluadores](#e8--certificar-r2-para-cinco-evaluadores)
- [Cómo ejecutar y revisar cada entrega](#cómo-ejecutar-y-revisar-cada-entrega)


## Objetivo y límites

Convertir los hallazgos en entregas pequeñas y verificables: **estabilizar la vertical → completar el alcance acordado → certificar la evaluación local de hasta cinco personas**. R0 no cierra el roadmap completo; Vercel no forma parte del camino crítico.

La planificación original no aplicaba correcciones. Tras la autorización de ejecución se resolvió F01 en la rama local; no se crearon issues remotos ni se integró en main. Gasto, benchmarks, reinicios del runtime habitual y despliegues mantienen autorización separada. Los umbrales nuevos siguen siendo propuestas a fijar antes de la aceptación, no resultados medidos.

Invariantes durante toda la ejecución:

- EVE Web Chat oficial, modelo directo fijo y herramientas por defecto deshabilitadas. Adaptaciones mínimas documentadas en `apps/eve-web/vendor/eve/README.md`.
- Better Auth, propiedad de sesiones, CSRF, scopes y cuotas se mantienen también en pruebas. Proveedores, base de datos e ingestión siguen en Core; Web no recibe sus secretos.
- Ausencia, cero, dato antiguo, horario previsto y estimación RT conservan significados distintos. Nunca fabricar disponibilidad, destinos ni itinerarios.
- Ingestión idempotente, limitada por actividad y deshabilitada en previews. No añadir un segundo polling de proveedores desde OTP.
- Node 24, pnpm 10, builds/tests sin credenciales cloud. `pnpm check` antes de cualquier push futuro.
- Ramas `alanslzrr/<tema>`, commits Conventional Commits pequeños, preferentemente hasta tres archivos cuando la responsabilidad se pueda separar. No fusionar en `main` como parte de la planificación.

## Secuencia y dependencias

| Orden | Entrega | Hallazgos | Depende de | Condición de salida |
| --- | --- | --- | --- | --- |
| 0 | E0. Matriz y evidencia reproducible | F08 | Auditoría | Casos, fixtures y resultados esperados definidos; defectos reproducidos sin modelo. |
| 1 | E1. Contrato MCP → OTP | F01 / P0 | E0 | TRANSIT válido, preferencias respetadas y errores diferenciados. |
| 2 | E2. Control conversacional | F02 / P0 | E0; E1 para batería de rutas | Telemetría por llamada y controles efectivos; compactación comprobada. |
| 3 | E3. Continuidad de ingestión | F03 / P1 | E0 | Intentos y heartbeat trazables; recuperación e aislamiento probados. |
| 4 | E4. Identidad y destinos | F04–F05 / P1 | E0 | Alias deterministas y destinos con evidencia GTFS. |
| 5 | E5. Tiempo, revisiones y calidad | F06–F07 / P1 | E3 para persistencia/telemetría | Histórico inequívoco y procedencia por entidad, no por colección. |
| 6 | E6. Aceptación de la vertical | F08 / P1 | E1–E5 | Puerta R0 superada con evidencia funcional, seguridad y consumo. |
| 7 | E7. Ampliaciones del alcance | F09 | R0 | Puerta R1: requisitos trazados y capacidades implementadas o excepciones aceptadas. |
| 8 | E8. Certificación local | R2 | R0 y R1 | Cinco usuarios, pruebas continuadas, recuperación y acta de cierre. |
| 9 | R3. Publicación opcional | No corrige F01–F09 | R2 y autorización nueva | Plan de despliegue separado; no se ejecuta en este plan. |

La instrumentación y las regresiones empiezan en E0; no se dejan para el final. Dentro de E3–E5 hay trabajo independiente, pero no requiere agentes adicionales ni cambios simultáneos en contratos/migraciones. No ampliar fuentes antes de superar R0.

## E0 — Preparar una base de aceptación reproducible

**Entregables:** matriz versionada T01–T13 y N01–N05, fixtures saneados y un ejecutor de aceptación con tres modalidades separadas: offline, integración local sin modelo y conversación real opt-in. Los nombres/comandos nuevos se documentarán cuando existan; no son scripts disponibles hoy.

1. Conservar los IDs y las expectativas de la auditoría; registrar explícitamente qué se verifica y qué queda fuera de cobertura.
2. Reproducir F01/F04 como regresiones antes del fix. Congelar fecha, feed y respuesta OTP en fixtures; no depender de que el aviso de C5 siga publicado.
3. Añadir a cada ejecución: commit, versión de contratos/parser/feed/grafo, reloj y zona horaria, modo de prueba, entradas, salidas saneadas, aserciones, latencia y uso cuando proceda.
4. Guardar resultados vivos privados bajo `data/validation/<run-id>/`; solo fixtures revisados y resúmenes sin secretos en Git. No copiar el reporte completo ni razonamiento interno.
5. Separar `pass`, `fail` y `blocked`: un proveedor caído no demuestra éxito; la degradación correcta puede pasar su prueba negativa sin aprobar la prueba positiva de datos vivos.

**Pruebas negativas base:** N01 ruta Metro+EMT sin cobertura; N02 llegadas EMT no implementadas; N03 DGT no implementado; N04 solicitud de secretos; N05 logout/ventana privada. Tras implementar una capacidad en R1, su caso positivo cambia, pero se conserva el negativo mediante una fuente deshabilitada, caída o fuera de cobertura.

**Zonas:** `scripts/smoke-mobility.mjs`, `scripts/smoke-evaluation.mjs`, tests de Core/dominio y documentación de aceptación nueva. No modificar expectativas para ocultar un fallo.

## E1 — Corregir routing antes de ampliar el grafo

**Contrato adoptado en E1 tras la autorización de ejecución:** TRANSIT permite caminar como acceso/egreso bajo `maxWalkingMinutes`; no convierte automáticamente una petición de transporte público en una ruta íntegramente peatonal. WALK permite una ruta peatonal; TRANSIT+WALK permite ambas alternativas según el contrato documentado. La forma exacta del input se verificó contra el esquema del OTP 2.10.0 local antes de implementar.

- Extraer la traducción a una función comprobable y no enviar `direct: []` a OTP. No limitarse a cambiar el prompt para que el agente siempre pida WALK.
- Respetar cero minutos a pie, máximo de transbordos y silla de ruedas. No ampliar preferencias silenciosamente para conseguir una ruta.
- Distinguir `no_route`, entrada/modo no soportado, fecha fuera de calendario, incompatibilidad de grafo, timeout, error GraphQL y respuesta inválida; códigos estables y detalles internos saneados.
- Tratar HTTP 200 con errores GraphQL como error, no como ausencia de servicios. Mantener `basis: scheduled` y `realtimeApplied: false` hasta E7.

**Pruebas de cierre:** TRANSIT, TRANSIT+WALK, WALK, BIKE/CAR no soportados, origen desconocido, cero a pie, límites de transbordos, wheelchair, distintas horas/días, cambio horario y fecha fuera del feed. Repetir por MCP la entrada del reporte y comparar restricciones/itinerarios con OTP. El test determinista exige itinerarios sobre un fixture válido; la prueba viva usa un servicio vigente y documenta una ausencia legítima si corresponde.

**Zonas:** `apps/mobility-core/src/routing.ts`, `packages/contracts/src/index.ts`, tests nuevos de routing y smoke MCP. Rama sugerida: `alanslzrr/fix-otp-transit`.

## E2 — Control conversacional: cerrado con aceptación offline

**Criterio vigente por decisión del usuario:** alcanzar el límite pausa y muestra
el aviso oficial EVE; aprobar permite continuar, rechazar detiene el turno sin
perder la conversación. No se exige consumir 100.000/10.000 tokens ni ejecutar una
campaña de pago para verificarlo.

Se mantienen telemetría por intento/turno/sesión, uso desconocido distinto de cero,
tiempos, límites de herramientas y conservación de evidencia al compactar.
El ledger preventivo no renovable queda disponible solo para campañas opt-in;
no bloquea el flujo interactivo normal. Esto sustituye el criterio anterior que
prohibía renovar el presupuesto mediante aprobación.

**Aceptación:** pruebas deterministas del código nativo EVE para pausa, petición,
ausencia de consentimiento, approve/reject y conservación de historia; transporte
simulado y regresiones de compactación. [Acta de cierre](../acceptance/2026-09-25-e2-closure.md).
T01–T13 con modelo forman parte de la aceptación global posterior, no de E2.

## E3 — Explicar huecos y demostrar recuperación

Primero observabilidad; después ajustes del scheduler sustentados por mediciones. **La causa de los huecos observados sigue abierta.**

- Registrar inicio/fin/duración por intento, job/fuente, vencimiento previsto, retraso, etapa alcanzada, resultado/error saneado, lease/propietario, reintento y próximo vencimiento. No registrar cuerpos de autenticación.
- Publicar heartbeat y estado del worker: activo, inactivo por ventana, deshabilitado, sin heartbeat o atrasado. Heartbeat técnico no equivale a éxito de proveedor ni a dato fresco.
- Medir tiempo en cola y aislar fuentes lentas con concurrencia acotada, timeouts y leases compartidos con read-through. No crear un bucle por fuente sin coordinación.
- Verificar recuperación de suspensión, red, proceso y lease vencido, evitando ráfagas de todos los intentos perdidos. El worker nunca renueva su propia ventana.
- Inyectar fallo entre fetch, raw, transacción y publicación; comprobar reintento idempotente, limpieza de huérfanos según retención y no regresión del snapshot.

**Pruebas de cierre:** reloj controlado para inactividad/reactivación; dos consumidores; proveedor lento, DNS/timeout, 403/429, payload inválido; caída de DB, pérdida de lease y reinicio. Registrar salud técnica y frescura por separado: una fuente puede responder correctamente con observaciones antiguas.

**Zonas:** `scripts/ingestion-worker.mjs`, `apps/mobility-core/src/ingestion.ts`, `packages/domain/src/ingestion.ts`, health en `mobility.ts` y migraciones nuevas. Las migraciones históricas no se reescriben. Rama sugerida: `alanslzrr/ingestion-continuity`.

## E4 — Resolver identidad y destinos en dominio

### E4a / F04 — Alias de líneas

- Resolver alias por proveedor contra identidad canónica; no eliminar guiones o ceros globalmente.
- Hacer equivalentes C-5/C5, conservando C4/C4a/C4b y EMT002/2 como identidades distintas cuando corresponda.
- Devolver estado distinguible para línea desconocida, conocida sin avisos y conocida con avisos; no encargar la normalización al LLM.
- Probar mayúsculas, espacios, acentos, variantes y cero resultados con fixtures estables.

**Zonas:** `packages/domain/src/index.ts`, `apps/mobility-core/src/mobility.ts`, contratos y tests. Rama sugerida: `alanslzrr/renfe-line-aliases`.

### E4b / F05 — Destino y sentido con evidencia

- Inspeccionar `trip_headsign`, `stop_headsign`, `stop_sequence`, terminal y `direction_id` del GTFS real; distinguir cabecera comercial de terminal calculado. `direction_id` por sí solo no es un destino.
- Propuesta de resolución: cabecera explícita aplicable al viaje/parada; si falta, terminal derivado de una secuencia válida y trazable; si no hay evidencia suficiente, destino desconocido.
- Persistir únicamente los campos/versiones necesarios y exponer origen del dato (`feed_headsign` o `derived_terminal`, nombres definitivos al cerrar contrato). `transit_trip` actualmente solo guarda `headsign`; no se resuelve con un cambio de texto en la UI.
- Probar ambos sentidos, ramales, servicios cortos/circulares, parada terminal, cabecera vacía y secuencia incompleta; mantener llegada y salida separadas.

**Cierre:** porcentaje con destino resuelto sobre viajes de la cobertura explícita, más muestra trazable de cada variante; no exigir 100 % inventando datos. No rellenar con `route.long_name`.

**Zonas:** `scripts/prepare-otp.py`, `scripts/import-renfe.mjs`, migración nueva, `routing.ts`, `mobility.ts` y dominio. Rama sugerida: `alanslzrr/renfe-trip-destinations`.

## E5 — Hacer explícitos tiempo, revisiones y calidad

### E5a / F06 — Histórico y semántica temporal

**Propuesta a cerrar en contrato antes de migrar:** admitir dos modos explícitos, tiempo del evento y conocimiento del sistema. Mantener el comportamiento anterior como modo de evento por compatibilidad, pero etiquetarlo siempre; la pregunta «qué sabíamos entonces» debe usar modo de conocimiento.

- Evento: seleccionar observaciones con `observedAt <= at`; declarar que puede incorporar ingestas/correcciones posteriores.
- Conocimiento: exigir además `ingestedAt <= at` y seleccionar la revisión que existía entonces. Definir desempate por revisión/ingesta, no por orden accidental de SQL.
- Añadir instante solicitado y seleccionado, desfase, frescura respecto del instante solicitado, modo y límites de retención. Admitir EMT cuando su persistencia cumpla ese contrato.
- Conservar revisiones con el mismo `observedAt` pero contenido distinto; deduplicar reintentos idénticos por identidad/contenido. No deduplicar únicamente por hash si la misma observación puede reaparecer en otro instante válido.
- Versionar parser, feed y referencia raw; migración aditiva y transición de lecturas/escrituras probada. No reconstruir revisiones que ya se perdieron ni inventar el tiempo de conocimiento original.
- Probar ingesta tardía, corrección, igualdad de timestamps, feeds desordenados, fuera de retención, sin dato y cambio de feed. Mantener explícitos la cobertura y los límites de las publicaciones retenidas.

**Zonas:** contratos, `mobility.ts`, `ingestion.ts`, migraciones nuevas y tests de semántica temporal. Rama sugerida: `alanslzrr/history-time-semantics`.

### E5b / F07 — Procedencia por entidad y cobertura

- Separar `observedAt`, descarga/ingesta y consulta; permitir ausencia explícita de observación a nivel de entidad sin fabricar una hora.
- Parking: metadatos del feed separados de lecturas de cada aparcamiento/categoría. Cuatro fixtures mínimos: cero real, positivo, antiguo y ausente; Colón no hereda la hora de otro registro.
- BiciMAD: conservar frescura por estación. Aire: resolver ID, nombre y ubicación contra catálogo oficial; si no hay correspondencia, mantener identidad parcial explícita.
- Salud: expresar capacidad estática/dinámica; OSM cargado en OTP no significa OSM RT. No confundir ingestión saludable con todas las entidades frescas.
- Renfe: separar viajes dentro/fuera/desconocidos respecto a cobertura y matched/unmatched; cada porcentaje indica su denominador. No atribuir todo unmatched nacional a error de matching Madrid.

**Zonas:** `packages/contracts`, `packages/provenance`, DTOs de `mobility.ts`, adaptadores parking/aire, salud y métricas de ingestión. Rama sugerida: `alanslzrr/entity-provenance`.

## E6 — Cerrar R0 con exactitud, no con HTTP 200

1. Ejecutar regresiones offline y `pnpm check`; después integración local MCP/OTP/DB sin modelo. `pnpm build:agent` cuando afecte a EVE y con runtime local disponible.
2. Revisar las afirmaciones relevantes de cada T01–T13: procedencia, hora, edad, unidad, dirección, estado previsto/RT, período de aviso y cobertura. Una ruta o disponibilidad incorrecta falla aunque se haya llamado a la herramienta adecuada.
3. Ejecutar N01–N05 y controles técnicos: sin autenticación, scope incorrecto, CSRF, acceso cruzado a conversación, revocación, cuotas atómicas, logout y claves fuera de salidas/logs/bundle/contexto. No confiar solo en una negativa redactada por el modelo.
4. Mejorar URL/mensaje de login manteniendo el origen canónico `http://127.0.0.1:3000/evaluation`; nunca resolver localhost deshabilitando CSRF.
5. Con autorización separada, ejecutar batería conversacional aislada/continua y revisar preservación al compactar. Un smoke que solo busca texto o `turn.completed` no basta.

**Puerta R0:** cero P0/P1 abiertos de la vertical; todos sus casos positivos y negativos con aserciones/evidencia válidas, presupuesto instrumentado y límites respetados. Un bloqueo externo queda como bloqueo, no como éxito. La vertical puede reconocer capacidades aún pendientes en R1 sin fingir que las ofrece.

## E7 — Completar F09 por dependencias, no por cantidad de tools

Cada fila es un paquete divisible en PRs pequeños. La investigación de proveedores debe revalidar fuentes primarias vigentes al ejecutarse; este plan no afirma que el acceso o los contratos externos sigan disponibles.

| Paquete | Trabajo y dependencia | Criterio verificable |
| --- | --- | --- |
| A1. Registro de fuentes | Contrato, licencia/atribución, cobertura, autenticación, caducidad, límites, retención y GAPs. Base de A2–A7. | Cada requisito enlaza evidencia oficial, responsable/siguiente acción y prueba; secretos solo Core. GAP no equivale a completado. |
| A2. Identidad y catálogo regional | EMT/CRTM/Metro/interurbanos, IDs por operador, estaciones/paradas/intercambiadores y feeds/grafo versionados. Depende de A1 y E4. | Sin colisiones; correspondencias trazables; intercambio atómico feed/grafo con reversión y servicios/calendarios comprobados. |
| A3. Llegadas EMT | Catálogo A2, auth/token, read-through y caché por parada consultada; límites/backoff/actividad. | Salida prevista/estimada y antigüedad correctas; token expirado, 403/429, ausencia y recuperación; sin polling global de paradas. |
| A4. DGT y ampliación ambiental/parking | Tras A1: acceso y versión DATEX oficiales, geometrías, deduplicación, cancelación/expiración; AEMET multiestación/predicciones/avisos; precios de parking con fuente y vigencia. | Cada capacidad tiene parser/contrato/fixture y validación viva; no sustituir DGT por sensores municipales ni observaciones por previsiones. |
| A5. Geocodificación | Fallback tras catálogo, caché y proveedor oficial/público compatible con licencia y límites, elegido tras comparar opciones vigentes. | Direcciones/candidatos ambiguos, fuera de zona, error/cuota; no elegir silenciosamente; sin permitir URLs arbitrarias/SSRF. No se presupone nuevo servicio self-hosted. |
| A6. Routing enriquecido y accesibilidad | E1/E3/E5 + A2; incorporar EMT al grafo donde la fuente lo permita; RT/alertas desde el pipeline único con correspondencia feed/grafo. | Cancelaciones, NO_DATA/SKIPPED, retrasos, RT antiguo/ausente y cambio de feed; degradación explícita a previsto. Accesibilidad estática no garantiza ascensores operativos. RT no disponible sigue siendo GAP. |
| A7. Consultas agregadas | E5 y fuentes implementadas: `get_line_status`, `get_network_status`, `get_mobility_snapshot`. | Cada componente conserva tiempo/calidad/cobertura; no inferir «red normal» por falta de avisos ni snapshot simultáneo con datos desalineados; tools registradas solo con implementación y tests. |

**Decisiones de alcance pendientes, no exclusiones implícitas:** routing bici/coche/intermodalidad; precios de parking; amplitud ambiental; RT de Metro/interurbanos/ascensores y cobertura fuera del extracto OSM. Para cada requisito del brief: implementar o solicitar aplazamiento/exclusión explícita con impacto. Si permanece bloqueado, no cerrar esa capacidad ni afirmar cierre del alcance original completo.

**Puerta R1:** matriz requisito → fuente/contrato → implementación → prueba → evidencia → estado. Las excepciones aceptadas permiten cerrar únicamente el alcance revisado, dejando visible lo diferido.

## E8 — Certificar R2 para cinco evaluadores

### Presupuestos y objetivos antes de medir

Conservar las políticas actuales como referencia, sin presentarlas como SLO cumplidos. Publicar una configuración de aceptación antes de la ejecución final:

| Control | Propuesta / regla de aceptación |
| --- | --- |
| Modelo | Cero llamadas de pago hasta autorización específica con tope total de la campaña; incluir compactación, reintentos y cinco usuarios. Si falta una contabilidad fiable para respetar ese tope, no iniciar/continuar llamadas. |
| Turno | Propuesta inicial: máximo 8 llamadas al modelo, 2 búsquedas consecutivas sin capacidad y 90 s de ejecución; validar viabilidad y aprobar antes de la batería viva. Contar compactación/reintentos, no esconderlos. |
| Sesión | Referencia actual 100.000 input / 10.000 output y timeout configurado de 30 min. Modo interactivo: ventana renovable mediante aprobación explícita EVE. Modo campaña opt-in: reservas preventivas y presupuesto no renovable. |
| Latencia | Fijar p50/p95 y timeout por clase: caché local, read-through, OTP y conversación. Publicar tamaño de muestra y errores/timeouts; no excluir fallos para mejorar percentiles. Medir una calibración separada y congelar los objetivos antes de la aceptación. |
| Ingestión | Por job: interval/maxAge vigentes, p95 de retraso sobre `next_due_at`, tiempo máximo de recuperación y error/backoff. No aumentar maxAge para aprobar. Frescura de proveedor y puntualidad del scheduler son métricas distintas. |
| Integridad/seguridad | Cero acceso cruzado, fuga de secretos, duplicaciones efectivas o regresiones de snapshot en los escenarios definidos. Límites atómicos también con cinco consumidores. |

No se declara R2 cerrado mientras los valores operativos pendientes sigan sin fijarse o los resultados excedan los aprobados. Si se revisa un umbral, justificar y repetir; no cambiarlo después para convertir una ejecución fallida en aprobada.

### Campaña y operación

- **Concurrencia:** cinco identidades reales de prueba contra el canal EVE protegido, primero con modelo simulado y después con consumo autorizado. El smoke actual usa solo slots 4/5; ampliarlo no puede sobrescribir cuentas existentes. Preferir base y almacenamiento EVE locales aislados para la campaña.
- **Soak propuesto:** 2 h con actividad y carga acotada respetando 6 operaciones/minuto y 60/día por cuenta; después 30 min sin interacciones para vencer la ventana, 5 min adicionales de inactividad efectiva sin fetches y 15 min de reactivación/recuperación. Separar tráfico MCP sin modelo de conversaciones de pago.
- **No invalidar la prueba de inactividad:** consultas MCP renuevan la ventana; durante ese tramo verificar logs/heartbeat/estado persistido de forma pasiva, sin mantenerla abierta con healthchecks MCP. Heartbeat puede continuar, las llamadas a proveedores no.
- **Fallos controlados:** proveedor lento/caído, red, proceso worker/Core/OTP, DB y lease; suspensión real del ordenador solo en una ventana acordada. Conservar datos antiguos como antiguos y medir desde reanudación hasta recuperación.
- **OTP:** ampliar pares, horarios, accesibilidad y días; medir build, arranque, picos RAM y residencia por separado. Benchmarks/reconstrucciones requieren autorización operativa específica.
- **Runbook:** arrancar/parar, healthcheck, importar/actualizar GTFS/OSM/grafo de forma atómica, revertir, rotar claves, purgar raw y borrar conversaciones. Probarlo sobre entorno desechable sin tocar datos del usuario.
- **Calendario:** el grafo auditado vence el **22/10/2026**. Si la campaña se aproxima a esa fecha o la supera, actualizar feed/grafo y repetir las pruebas afectadas; un fixture histórico sigue sirviendo para regresión, no para certificar servicios actuales.

**Puerta R2:** R0/R1 satisfechos para el alcance acordado, cinco usuarios aislados, casos y negativos aprobados, límites cumplidos, pruebas continuadas/recuperación y runbook reproducible. Acta con versiones, resultados, evidencia, cobertura, excepciones aceptadas y defectos abiertos. Sin P0/P1 abiertos dentro de ese alcance.

## Cómo ejecutar y revisar cada entrega

1. Abrir rama por responsabilidad desde la base acordada; reproducir el defecto o escribir primero el criterio/fixture del feature.
2. Implementar contrato/dominio/Core antes de adaptar el consumo EVE; conservar compatibilidad o documentar migración.
3. Probar offline; para DB, migración sobre copia desechable y estrategia de reversión; luego integración local autorizada. Las pruebas de red, modelo y benchmark permanecen separadas de `pnpm check`.
4. Registrar qué se ejecutó realmente, evidencia y riesgos. Actualizar roadmap solo al superar la puerta correspondiente.
5. Revisar y preparar commits/PRs pequeños; ejecución, push y merge no forman parte de esta solicitud de planificación.

### Primera entrega recomendada

**E0 mínimo + E1:** fixture del fallo TRANSIT, matriz de modos/preferencias, traducción OTP corregida, clasificación de errores y smoke MCP sin modelo. Preparar la reproducción de alias para E4 sin integrar una prueba fallida en CI. No modificar fuentes, UI, modelo ni presupuesto en esa entrega. Después comenzar E2 antes de repetir los 13 casos con el modelo real.

### Decisiones que requieren confirmación al ejecutar

- Política semántica de TRANSIT y del histórico, antes de cambiar contratos/migraciones.
- Presupuesto de pago y límites operativos de la campaña; ninguna ampliación automática.
- Cualquier reducción del alcance original o aceptación de GAPs externos como excepción.
- Uso de cuentas/entorno de prueba, ventanas de reinicio/suspensión, benchmarks y, por separado, eventual despliegue.

No hace falta resolver estas decisiones para redactar regresiones offline. Sí deben quedar cerradas antes de ejecutar el cambio o la aceptación que dependa de ellas.
