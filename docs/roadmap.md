# Roadmap local: estado auditado y criterios de cierre

Actualizado el **01/10/2026**, tras la exclusión de ampliaciones de routing aprobada por el usuario. La auditoría original de R0 partió de `f9ef91e`; no describe por sí sola las ampliaciones E7 ya entregadas.

**Estado actual: R0 integrado en `main` y runtime local actualizado.** E1 corregido, E2 cerrado y E3–E6 entregados mediante [PR #16](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/16). E8 aplicó 0008–0012 desde el esquema habitual 0007, reimportó destinos y recompiló/reinició Core, Web, agente y worker. No equivale a cobertura completa ni servicio operativo.

[Evidencia de entrega E8](acceptance/2026-09-25-local-delivery.md), [auditoría histórica](audits/2026-09-25-evaluation.md) e [instrucciones operativas](local-runtime.md). Las referencias a integración pendiente en actas anteriores describen su fecha de ejecución; quedan actualizadas por E8.

## Continuidad vigente

**E7/R1: EMT y CRTM estático entregados e instalados localmente.** EMT incluye catálogo y próximas llegadas bajo demanda; ver [evidencia y límites](acceptance/2026-09-25-emt.md). CRTM incluye catálogos, horarios estáticos de Metro Ligero/interurbanos y correspondencias publicadas, mediante [PR #22](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/22) y [PR #23](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/23): migración 0014 aplicada, exports importados y Core/Web/agente actualizados. [Semántica y límites CRTM](sources/crtm.md).

**Geocodificación implementada en PR #25**: catálogos primero, caché, consentimiento, ambigüedad, procedencia y límites globales. Migración 0015 instalada. **Nominatim público autorizado y activo desde el 27/09/2026**: consulta real del Museo del Prado por MCP, catálogo primero, consentimiento, atribución y caché positiva/negativa comprobados. No enviar direcciones personales/confidenciales.

**Routing ampliado instalado localmente (PR #26)**: Renfe, EMT, Metro Ligero e interurbanos; actualización explícita de GTFS/OSM/catálogos/grafo mediante releases verificados, activación en mantenimiento y rollback comprobado. RT Renfe se aplica solo con identidad/fecha/versión/frescura válidas; avisos EMT se adjuntan por línea y vigencia sin inventar desvíos. Metro conserva catálogo pero horarios caducados quedan fuera del grafo. [Operación y límites](routing-releases.md), [evidencia de instalación y regresiones](acceptance/2026-09-25-routing-releases.md).

**DGT y herramientas agregadas entregados** sobre Core, PostgreSQL y el worker existentes. Acceso XML oficial público verificado, sin cuenta; [semántica y límites](sources/dgt.md). Pendientes posteriores: cobertura/RT y ampliaciones del brief descritas abajo.

**R2.1 — Historial de conversaciones implementado y comprobado localmente.** Mis conversaciones lista solo sesiones propias vigentes, con fecha de creación, paginación de veinte y reapertura nativa de EVE. No duplica mensajes ni cambia retención/E2. [Evidencia, integración y límites](acceptance/2026-09-28-conversation-history.md). Es independiente de las ampliaciones de fuentes R1; no implica cierre de R1/R2. El alcance vigente es el de este roadmap; las actas anteriores son evidencia histórica, no requisitos adicionales.

**Contexto meteorológico del itinerario implementado y comprobado localmente:** predicción horaria municipal y CAP Madrid compartidos en Core, enriquecimiento de `plan_journey`, consultas explícitas y degradación independiente. Migración 0018 y 179 municipios IGN. [Entrega, operación y límites](acceptance/2026-09-28-journey-weather.md). La predicción diaria amplía este bloque según el acta siguiente; las observaciones multiestación se amplían en la entrega siguiente y no se cierra R1 completo.

**Predicción diaria municipal AEMET implementada y comprobada localmente.** [Investigación y contraste XML/JSON](research/2026-09-30-daily-weather.md) e [instrucciones específicas para el agente](plans/2026-09-30-daily-weather.md). Fuente diaria: XML oficial, conservando vacíos frente a ceros y caché separada del producto horario. Migración `0020`, consulta explícita y selección horaria/diaria en itinerarios, sin ampliar CAP ni convertir extremos diarios en temperatura instantánea. [Entrega y límites](acceptance/2026-09-30-daily-weather.md). Multiestación sigue como ampliación posterior, sin reabrir entregas cerradas.

**Accesibilidad estática declarada para silla de ruedas implementada e instalada localmente.** Resolución, salidas/horarios e itinerarios separan parada, vehículo y recorrido no verificado. [Evidencia y límites](acceptance/2026-09-29-static-accessibility.md), [investigación](research/2026-09-29-static-accessibility.md) y [plan ejecutado](plans/2026-09-29-static-accessibility.md). Sin nuevo proveedor ni cambios de configuración/grafo OTP; no cierra R1 completo.

R0, E2 y E8 siguen cerrados. Pruebas proporcionales a cada cambio; la auditoría CRTM no se repite ni se añade otra campaña como barrera. El modo normal sigue siendo interactivo, los experimentos opcionales y Vercel queda para después.

**Exclusión aprobada por el usuario el 29/09/2026:** horarios/routing actuales de Metro de Madrid y las correspondencias adicionales CRTM↔EMT/Renfe propuestas quedan fuera del alcance de cierre de esta evaluación. No son tareas pendientes ni capacidades implementadas. Se conservan catálogo Metro, correspondencias existentes y la cobertura entregada de Renfe, EMT, Metro Ligero e interurbanos. No se añade proveedor externo. [Fundamento](research/2026-09-29-metro-alternatives.md). **Alcance y declaraciones de cobertura consolidados:** [plan de entrega](plans/2026-09-29-scope-closure.md); el [plan de correspondencias](plans/2026-09-29-metro-crtm-coverage.md) sigue retirado.

### Corrección puntual posterior a E8

El reporte manual detectó que el agente omitió el histórico disponible y duplicó resultados/búsquedas. La [corrección acotada](acceptance/2026-09-25-post-e8-findings.md) explicita descubrimiento/reutilización, knowledge y reloj de servidor, y elimina la segunda copia MCP. 254 pruebas offline y comprobación puntual MCP; sin nueva inferencia ni cambios de límites. Renfe tuvo un problema TLS observado desde este equipo, no una caída global confirmada. Tras actualizar el runtime E7, trips/alerts volvieron a actualizar a las 16:32 Madrid; no se ha identificado la causa ni demostrado disponibilidad sostenida. Conservar degradación/backoff y no bloquear E7. No se afirma ahorro conversacional medido.

## Pasos 1–5: qué hay y qué falta

| Paso | Implementado | Estado / falta para cierre |
| --- | --- | --- |
| 1. OTP local | Grafo real Renfe/OSM versionado; benchmark Atocha/Chamartín/Sol; rutas previstas; fix TRANSIT probado por MCP local | **Parcial.** F01 integrado. Ampliar cobertura de pares/accesibilidad y medir RAM máxima de build son trabajos adicionales, no bloqueos de R0. Routing EMT/ML/interurbanos y overlay RT Renfe instalados. Metro de Madrid actual queda excluido del cierre por acuerdo; RT de las otras redes sigue limitado por fuentes e identidad. |
| 2. Renfe real | GTFS importado; trip updates/avisos; timestamps, calidad y matching | **Implementado en el alcance local.** Alias/destinos E4 integrados y reimportados. RT en routing y actualización explícita reversible implementados; no actualización diaria automática. Cancelaciones/NO_DATA/SKIPPED y modos históricos event/knowledge están probados localmente. |
| 3. Ingestión local adaptativa | Worker, ventana 30 min, leases, backoff, dos carriles, read-through, deduplicación y retención | **E3 integrado.** Carriles independientes, heartbeat, fallos por etapa y recuperación sin repetir ciclos perdidos probados con proveedores simulados/DB aislada. Runtime actualizado; cadencia configurada no equivale a SLO medido. |
| 4. Dominio/MCP/EVE | Dieciséis herramientas reales, Better Auth/ACL/cuotas, Web Chat oficial y gpt-6-luna directo | **Parcial.** E2 cerrado, E3–E6 integrados mediante E8; geocoder y agregados incorporados; cobertura y ausencia de datos explícitas. |
| 5. Ampliación | BiciMAD, aire, tráfico, parking, AEMET observaciones multiestación, avisos y catálogo/llegadas EMT; catálogos y consulta estática CRTM | **Parcial.** Routing multioperador y DGT incorporados. Metro actual y la ampliación de correspondencias quedan excluidos por acuerdo; las demás ampliaciones R1 mantienen su estado. |

## R0 — Estabilizar y aceptar la vertical existente

Prioridad: corregir antes de ampliar fuentes. IDs remiten a la auditoría.

- [x] **F01 / P0 — routing integrado:** mapping TRANSIT→OTP corregido, regresiones de modos/preferencias/errores y tres baterías MCP de 11 casos aprobadas. Entrada del reporte: tres itinerarios previstos de 13 min. [Evidencia y límites](acceptance/2026-09-25-routing.md). Integrado en main/runtime habitual; no se exige nueva campaña conversacional.
- [x] **F02 / P0 — control conversacional (E2 cerrado e integrado):** telemetría, compactación con evidencia y límites nativos EVE: pausa y aviso, aprobar continúa, rechazar detiene. Verificado sin gasto; no exige consumir 100.000/10.000 tokens ni campaña real. Campañas con ledger quedan como modo experimental opt-in, no requisito del chat. [Cierre y evidencia](acceptance/2026-09-25-e2-closure.md). Integrado en main/runtime habitual; siguiente paso funcional: E7.
- [x] **F03 / P1 — continuidad (E3 local):** carriles independientes sin barrera de lote, recuperación de leases y backoff sin repetir ciclos perdidos; heartbeat/ventana/errores/frescura separados y nueve regresiones PostgreSQL aisladas. Migración `0010` e integración habitual aplicadas en E8; no se afirma un SLO medido. [Cambios y evidencia](acceptance/2026-09-25-ingestion.md).
- [x] **F04 / P1 — identidad de línea (E4 local):** alias Renfe contra catálogo, ramales/ceros EMT preservados; identidad conocida/desconocida/catálogo ausente separada de avisos. Catálogo EMT incorporado en la primera entrega E7. [Evidencia E4](acceptance/2026-09-25-line-destinations.md).
- [x] **F05 / P1 — salidas útiles (E4 local):** destino explícito o terminal derivado por viaje, con versión y origen; CIVIS no se presenta como destino, ausencia explícita y llegada/salida separadas. `0011`, reimportación e integración habitual completadas E8. [Cobertura y límites](acceptance/2026-09-25-line-destinations.md).
- [x] **F06 / P1 — histórico (E5 local):** modos event/knowledge, revisiones/correcciones idempotentes, EMT, ingestas tardías sin regresión, desfase y límites de retención. Consultas sobre publicaciones retenidas con cobertura explícita. `0012` aplicada mediante E8. [Evidencia y transición](acceptance/2026-09-25-history-quality.md).
- [x] **F07 / P1 — calidad por entidad (E5 local):** parking/categorías, aire y BiciMAD con procedencia propia; catálogo oficial de aire versionado, identidad parcial si no hay correspondencia, salud con cobertura por entidad y capacidad estática separada. [Límites](acceptance/2026-09-25-history-quality.md).
- [x] **F08 / P1 — continuidad funcional (E6 local):** corregidos avisos futuros, explicación del RT y login canónico/errores sin debilitar CSRF. 242 pruebas offline y smokes MCP/OTP existentes aprobados, sin campaña conversacional nueva. [Evidencia y límites E6](acceptance/2026-09-25-functional-continuity.md). Integración habitual completada E8.

**R0 local completado en el alcance acordado:** funcionalidad existente y regresiones verificadas sin exigir otra campaña de aceptación, consumo o benchmark. E8 ya integró y actualizó el runtime habitual; E7 amplía cobertura. No equivale a servicio operativo ni marca los pasos 1–5 como completos.

## R1 — Completar el alcance acordado del dominio

Orden por dependencias, no por número de endpoints:

- [ ] Registro de fuentes: contrato, cobertura espacial/temporal, licencias/atribución, credenciales/caducidad, límites y GAPs con evidencia. Activar una fuente no equivale a revisar su licencia.
- [x] Catálogo EMT: paradas con UUID estable y namespace propio, líneas internas/etiquetas y sentidos versionados. GTFS EMT incorporado al grafo; correspondencia API↔GTFS parcial por ID publicado y coordenadas, sin fusionar UUIDs.
- [x] Integración estática CRTM entregada: catálogos con identidades por red, persistencia, resolución MCP, consulta de horarios con calendarios/excepciones/frecuencias y correspondencias publicadas sin fusionar UUIDs. Migración 0014 y exports instalados; runtime actualizado. [Fuentes, consultas y límites](sources/crtm.md).
- **Fuera del alcance de cierre, por acuerdo:** horarios/routing actuales de Metro de Madrid y nuevas correspondencias CRTM↔EMT/Renfe. Conservar catálogos y asociaciones ya entregados; no tratar esta exclusión como implementación completada, espera de proveedor ni obligación de buscar otro feed. [Decisión e instrucciones](plans/2026-09-29-scope-closure.md).
- [x] Llegadas EMT por parada bajo demanda: caché persistente, lease/backoff, destino del proveedor y antigüedad; no polling global. Comprobación conversacional con evaluadores durante uso normal, sin campaña nueva como requisito.
- [x] Geocoder externo: implementación local-first/caché/ambigüedad/procedencia/límites entregada en PR #25; Nominatim público autorizado/activado y consulta real de lugar público comprobada el 27/09/2026. No enviar domicilios personales a Nominatim público. [Contrato](sources/geocoding.md).
- [x] Routing GTFS Renfe/EMT/Metro Ligero/interurbanos instalado; Metro excluido por caducidad. Resolución MCP con IDs separados, correspondencias de itinerario y frecuencias explícitas. No implica RT de todas las redes.
- [x] Actualización explícita coordinada y reversible GTFS/catálogos/OSM/grafo mediante releases inmutables, journal y mantenimiento. Rollback/re-activación reales comprobados; no se añade scheduler.
- [x] Overlay Core de RT/alertas Renfe y avisos de línea EMT sobre itinerarios, con snapshots existentes y degradación explícita. OTP sin segundo polling. Queda ampliar RT de las redes CRTM incluidas en la evaluación y demostrar identidad de viaje entre llegadas EMT y GTFS; no se asignan por línea sola.
- [x] Accesibilidad estática trazable en las cuatro herramientas existentes ([acta](acceptance/2026-09-29-static-accessibility.md)). EMT sin atributos permanece desconocido; ML2/ML3 conserva códigos y discrepancia acotada a su versión.
- [ ] Accesibilidad operativa: ascensores/escaleras RT como GAP externo hasta disponer de fuente oficial; caminatas y conexiones interiores no verificadas. No garantizar recorridos completos desde atributos estáticos.
- [x] DGT DATEX 3.7: acceso público real, IDs/versiones, carretera/sentido y puntos/extremos, correcciones e histórico existente. Retiradas no se equiparan a cancelaciones confirmadas; fin temporal contradictorio queda explícito. Sin geometrías ni desvíos inventados. [Fuente y límites](sources/dgt.md).
- [x] `get_line_status`, `get_network_status` y `get_mobility_snapshot`: lecturas almacenadas, identidad/cobertura parcial, fechas/frescura por componente y muestras acotadas. No consultas masivas ni activación de ventana; ausencia de avisos no significa «red normal».
- [x] **Contexto meteorológico del itinerario:** predicción horaria municipal y avisos CAP de Madrid, caché compartida, actualización acotada y enriquecimiento de `plan_journey`; sin seguimiento de viajes ni cambios automáticos de rutas. [Entrega y límites](acceptance/2026-09-28-journey-weather.md).
- [x] Predicción diaria municipal: XML oficial, probabilidad/cielo/extremos por fecha, caché separada y selección contextual sin interpolación. [Evidencia](acceptance/2026-09-30-daily-weather.md).
- [x] Tarifas verificadas y coste orientativo de parking: 15 aparcamientos EMT, tarifas generales/especiales y campaña Pitis; duración opcional, máximo y gratuidad condicionada separados de ocupación. Catálogo versionado y cálculo backend, sin adquisiciones tarifarias por consulta. [Entrega y límites](acceptance/2026-10-01-parking-prices.md).
- **Fuera del alcance de esta evaluación, por decisión del usuario el 01/10/2026:** routing en bicicleta propia y directo en coche, itinerarios completos con BiciMAD, coche + aparcamiento + transporte público y otras combinaciones nuevas que incorporen bicicleta o coche. No son funcionalidades entregadas ni tareas aplazadas; no constituyen pendientes de cierre. Se conservan las rutas actuales de transporte público y caminatas, incluidos transbordos entre operadores, las consultas de disponibilidad BiciMAD y las consultas de ocupación y tarifas de aparcamiento. RT adicional y accesibilidad operativa mantienen sus pendientes actuales.

**Puerta R1:** matriz requisito → fuente/contrato → implementación → prueba → evidencia; cada capacidad implementada o exclusión/GAP formalmente aceptado. Las ampliaciones de routing excluidas por decisión del usuario no se exigen para cerrar R1/R2; esta decisión no completa los demás requisitos ni declara R1/R2 cerrados. Una limitación de acceso externo bloquea esa capacidad, no se reporta como completada.

## R2 — Cierre de evaluación local (≤5 personas)

- [x] **R2.1 — Historial de conversaciones (implementado y verificado localmente):** listado acotado de chats propios, fecha de creación, reapertura con EVE y nuevo chat; Better Auth y aislamiento existentes. Conservar la caducidad actual de acceso (siete días por defecto) y mostrar errores de sesión no disponible sin renovar permisos. Sin otra biblioteca, copia de mensajes ni cambios en E2. [Alcance, instrucciones y criterio de cierre](plans/2026-09-28-conversation-history.md).
- [ ] R0/R1 satisfechos para el alcance explícitamente acordado.
- [ ] Cinco cuentas concurrentes: sesiones aisladas, CSRF, scopes, cuotas atómicas, revocación, logout y ausencia de secretos en navegador/modelo/logs.
- [ ] Comprobar el uso con evaluadores reutilizando las consultas existentes y los casos afectados por cada entrega. No se exige otra campaña general para avanzar.
- [ ] Observar métricas de uso normal, separando caché, red externa, routing y modelo, para comprobar la reducción real de búsquedas tras PR #18. Ensayos específicos de consumo/latencia son opcionales y requieren aprobación; E2 sigue cerrado.
- [ ] Opcional, no condición de avance: soak propuesto de dos horas, 30 min sin usuarios y reactivación; recuperación de procesos y fallos de persistencia sin duplicados ni retrocesos. Fijar umbrales antes de probar, no después de ver resultados.
- [ ] Más pares OTP, horarios/días y accesibilidad; pico RAM de build, arranque y residencia documentados. No extrapolar cuatro pares a toda la red.
- [ ] Runbook reproducible: iniciar/parar, healthcheck, actualizar GTFS/OSM/graph atómicamente, revertir, rotar claves y borrar conversaciones/raw. Renfe termina el **22/10/2026**; EMT el **31/12/2026**, ML el **22/07/2027** e interurbanos el **26/08/2027**. La release conserva límites por feed; el procedimiento de actualización/rollback de routing ya está documentado.
- [ ] Acta final: casos aprobados, errores abiertos, evidencia, cobertura y limitaciones aceptadas. Sin afirmar «TODO» a partir de un smoke exitoso.

## R3 — Publicación Vercel opcional, después del cierre local

- [ ] Autorización expresa antes de publicar o contratar; mantener recursos cloud separados y despliegues desactivados mientras tanto.
- [ ] Convertir worker/disco local en scheduling y almacenamiento durables adecuados al entorno; no ejecutar el bucle local en Functions.
- [ ] Decidir OTP dedicado/bajo demanda según mediciones, no cifras antiguas del brief; reevaluar cuotas/condiciones vigentes en ese momento.
- [ ] Verificar privacidad, retención/borrado, rotación, licencias y controles de acceso del despliegue.

**Vercel no es requisito de R0–R2 ni una solución a los fallos funcionales actuales.**

**Observaciones AEMET multiestación por ubicación entregadas localmente:** catálogo inicial de 25 estaciones, selección hasta 20 km y frescura independiente. Cobertura parcial, sin alterar predicciones ni OTP. [Validación y límites](acceptance/2026-09-30-weather-observations.md).
