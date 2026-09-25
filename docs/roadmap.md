# Roadmap local: estado auditado y criterios de cierre

Actualizado el **25/09/2026**, tras geocodificación controlada y routing multioperador con releases reversibles. La auditoría original de R0 partió de `f9ef91e`; no describe por sí sola las ampliaciones E7 ya entregadas.

**Estado actual: R0 integrado en `main` y runtime local actualizado.** E1 corregido, E2 cerrado y E3–E6 entregados mediante [PR #16](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/16). E8 aplicó 0008–0012 desde el esquema habitual 0007, reimportó destinos y recompiló/reinició Core, Web, agente y worker. No equivale a cobertura completa ni servicio operativo.

[Evidencia de entrega E8](acceptance/2026-09-25-local-delivery.md), [auditoría histórica](audits/2026-09-25-evaluation.md) e [instrucciones operativas](local-runtime.md). Las referencias a integración pendiente en actas anteriores describen su fecha de ejecución; quedan actualizadas por E8.

## Continuidad vigente

**E7/R1: EMT y CRTM estático entregados e instalados localmente.** EMT incluye catálogo y próximas llegadas bajo demanda; ver [evidencia y límites](acceptance/2026-09-25-emt.md). CRTM incluye catálogos, horarios estáticos de Metro Ligero/interurbanos y correspondencias publicadas, mediante [PR #22](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/22) y [PR #23](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/23): migración 0014 aplicada, exports importados y Core/Web/agente actualizados. [Semántica y límites CRTM](sources/crtm.md).

**Geocodificación implementada en PR #25**: catálogos primero, caché, consentimiento, ambigüedad, procedencia y límites globales. Migración 0015 instalada. **El proveedor externo permanece desactivado hasta su elección informada**; no se presenta como servicio externo disponible.

**Routing ampliado instalado localmente (PR #26)**: Renfe, EMT, Metro Ligero e interurbanos; actualización explícita de GTFS/OSM/catálogos/grafo mediante releases verificados, activación en mantenimiento y rollback comprobado. RT Renfe se aplica solo con identidad/fecha/versión/frescura válidas; avisos EMT se adjuntan por línea y vigencia sin inventar desvíos. Metro conserva catálogo pero horarios caducados quedan fuera del grafo. [Operación y límites](routing-releases.md), [evidencia de instalación y regresiones](acceptance/2026-09-25-routing-releases.md).

**Siguiente bloque funcional: DGT y herramientas agregadas**, sin olvidar la elección del geocoder y los pendientes de cobertura/RT/replay descritos abajo.

R0, E2 y E8 siguen cerrados. Pruebas proporcionales a cada cambio; la auditoría CRTM no se repite ni se añade otra campaña como barrera. El modo normal sigue siendo interactivo, los experimentos opcionales y Vercel queda para después.

### Corrección puntual posterior a E8

El reporte manual detectó que el agente omitió el histórico disponible y duplicó resultados/búsquedas. La [corrección acotada](acceptance/2026-09-25-post-e8-findings.md) explicita descubrimiento/reutilización, knowledge y reloj de servidor, y elimina la segunda copia MCP. 254 pruebas offline y comprobación puntual MCP; sin nueva inferencia ni cambios de límites. Renfe tuvo un problema TLS observado desde este equipo, no una caída global confirmada. Tras actualizar el runtime E7, trips/alerts volvieron a actualizar a las 16:32 Madrid; no se ha identificado la causa ni demostrado disponibilidad sostenida. Conservar degradación/backoff y no bloquear E7. No se afirma ahorro conversacional medido.

## Pasos 1–5: qué hay y qué falta

| Paso | Implementado | Estado / falta para cierre |
| --- | --- | --- |
| 1. OTP local | Grafo real Renfe/OSM versionado; benchmark Atocha/Chamartín/Sol; rutas previstas; fix TRANSIT probado por MCP local | **Parcial.** F01 integrado. Ampliar cobertura de pares/accesibilidad y medir RAM máxima de build son trabajos adicionales, no bloqueos de R0. Routing EMT/ML/interurbanos y overlay RT Renfe instalados. Metro vigente y RT de nuevas redes siguen limitados por fuentes e identidad. |
| 2. Renfe real | GTFS importado; trip updates/avisos; timestamps, calidad y matching | **Parcial.** Alias/destinos E4 integrados y reimportados; faltan replay y reconstrucción histórica completa. RT en routing y actualización explícita reversible implementados; no actualización diaria automática. Cancelaciones/NO_DATA/SKIPPED y modos históricos event/knowledge están probados localmente. |
| 3. Ingestión local adaptativa | Worker, ventana 30 min, leases, backoff, dos carriles, read-through, deduplicación y retención | **E3 integrado.** Carriles independientes, heartbeat, fallos por etapa y recuperación sin replay probados con proveedores simulados/DB aislada. Runtime actualizado; cadencia configurada no equivale a SLO medido. |
| 4. Dominio/MCP/EVE | Doce herramientas reales, Better Auth/ACL/cuotas, Web Chat oficial y gpt-6-luna directo | **Parcial.** E2 cerrado, E3–E6 integrados mediante E8; geocoder general y herramientas de línea/red/snapshot faltantes. |
| 5. Ampliación | BiciMAD, aire, tráfico, parking, AEMET Retiro, avisos y catálogo/llegadas EMT; catálogos y consulta estática CRTM | **Parcial.** Horarios Metro vigentes, correspondencias adicionales, routing multioperador y DGT; ampliar fuentes conforme al brief o documentar exclusiones aprobadas. |

## R0 — Estabilizar y aceptar la vertical existente

Prioridad: corregir antes de ampliar fuentes. IDs remiten a la auditoría.

- [x] **F01 / P0 — routing integrado:** mapping TRANSIT→OTP corregido, regresiones de modos/preferencias/errores y tres baterías MCP de 11 casos aprobadas. Entrada del reporte: tres itinerarios previstos de 13 min. [Evidencia y límites](acceptance/2026-09-25-routing.md). Integrado en main/runtime habitual; no se exige nueva campaña conversacional.
- [x] **F02 / P0 — control conversacional (E2 cerrado e integrado):** telemetría, compactación con evidencia y límites nativos EVE: pausa y aviso, aprobar continúa, rechazar detiene. Verificado sin gasto; no exige consumir 100.000/10.000 tokens ni campaña real. Campañas con ledger quedan como modo experimental opt-in, no requisito del chat. [Cierre y evidencia](acceptance/2026-09-25-e2-closure.md). Integrado en main/runtime habitual; siguiente paso funcional: E7.
- [x] **F03 / P1 — continuidad (E3 local):** carriles independientes sin barrera de lote, recuperación de leases y backoff sin replay; heartbeat/ventana/errores/frescura separados y nueve regresiones PostgreSQL aisladas. Migración `0010` e integración habitual aplicadas en E8; no se afirma un SLO medido. [Cambios y evidencia](acceptance/2026-09-25-ingestion.md).
- [x] **F04 / P1 — identidad de línea (E4 local):** alias Renfe contra catálogo, ramales/ceros EMT preservados; identidad conocida/desconocida/catálogo ausente separada de avisos. Catálogo EMT incorporado en la primera entrega E7. [Evidencia E4](acceptance/2026-09-25-line-destinations.md).
- [x] **F05 / P1 — salidas útiles (E4 local):** destino explícito o terminal derivado por viaje, con versión y origen; CIVIS no se presenta como destino, ausencia explícita y llegada/salida separadas. `0011`, reimportación e integración habitual completadas E8. [Cobertura y límites](acceptance/2026-09-25-line-destinations.md).
- [x] **F06 / P1 — histórico (E5 local):** modos event/knowledge, revisiones/correcciones idempotentes, EMT, ingestas tardías sin regresión, desfase y límites de retención. Índice parcial, no reconstrucción completa. `0012` aplicada mediante E8. [Evidencia y transición](acceptance/2026-09-25-history-quality.md).
- [x] **F07 / P1 — calidad por entidad (E5 local):** parking/categorías, aire y BiciMAD con procedencia propia; catálogo oficial de aire versionado, identidad parcial si no hay correspondencia, salud con cobertura por entidad y capacidad estática separada. [Límites](acceptance/2026-09-25-history-quality.md).
- [x] **F08 / P1 — continuidad funcional (E6 local):** corregidos avisos futuros, explicación del RT y login canónico/errores sin debilitar CSRF. 242 pruebas offline y smokes MCP/OTP existentes aprobados, sin campaña conversacional nueva. [Evidencia y límites E6](acceptance/2026-09-25-functional-continuity.md). Integración habitual completada E8.

**R0 local completado en el alcance acordado:** funcionalidad existente y regresiones verificadas sin exigir otra campaña de aceptación, consumo o benchmark. E8 ya integró y actualizó el runtime habitual; E7 amplía cobertura. No equivale a servicio operativo ni marca los pasos 1–5 como completos.

## R1 — Completar el alcance original del dominio

Orden por dependencias, no por número de endpoints:

- [ ] Registro de fuentes: contrato, cobertura espacial/temporal, licencias/atribución, credenciales/caducidad, límites y GAPs con evidencia. Activar una fuente no equivale a revisar su licencia.
- [x] Catálogo EMT: paradas con UUID estable y namespace propio, líneas internas/etiquetas y sentidos versionados. GTFS EMT incorporado al grafo; correspondencia API↔GTFS parcial por ID publicado y coordenadas, sin fusionar UUIDs.
- [x] Integración estática CRTM entregada: catálogos con identidades por red, persistencia, resolución MCP, consulta de horarios con calendarios/excepciones/frecuencias y correspondencias publicadas sin fusionar UUIDs. Migración 0014 y exports instalados; runtime actualizado. [Fuentes, consultas y límites](sources/crtm.md).
- [ ] Completar cobertura CRTM: conseguir horarios Metro vigentes (feed disponible terminado el 27/05/2026) y correspondencias EMT/Renfe respaldadas por evidencia. El routing multioperador está instalado; no resuelve horarios Metro caducados ni equivale a correspondencias completas.
- [x] Llegadas EMT por parada bajo demanda: caché persistente, lease/backoff, destino del proveedor y antigüedad; no polling global. Comprobación conversacional con evaluadores durante uso normal, sin campaña nueva como requisito.
- [ ] Geocoder externo: implementación local-first/caché/ambigüedad/procedencia/límites entregada en PR #25; falta elección informada del proveedor, activación y consulta real de lugar público. No enviar domicilios personales a Nominatim público. [Contrato](sources/geocoding.md).
- [x] Routing GTFS Renfe/EMT/Metro Ligero/interurbanos instalado; Metro excluido por caducidad. Resolución MCP con IDs separados, correspondencias de itinerario y frecuencias explícitas. No implica RT de todas las redes.
- [x] Actualización explícita coordinada y reversible GTFS/catálogos/OSM/grafo mediante releases inmutables, journal y mantenimiento. Rollback/re-activación reales comprobados; no se añade scheduler.
- [x] Overlay Core de RT/alertas Renfe y avisos de línea EMT sobre itinerarios, con snapshots existentes y degradación explícita. OTP sin segundo polling. Queda ampliar RT CRTM y demostrar identidad de viaje entre llegadas EMT y GTFS; no se asignan por línea sola.
- [ ] Accesibilidad estática trazable; ascensores/escaleras RT como GAP externo hasta disponer de fuente oficial. No garantizar accesibilidad operativa desde atributos estáticos.
- [ ] DGT: verificar acceso/versión DATEX, adaptar eventos/geometrías, deduplicar y probar cancelación/expiración; no sustituir por tráfico municipal.
- [ ] Implementar `get_line_status`, `get_network_status` y `get_mobility_snapshot` con cobertura parcial/frescura explícitas; sin tools vacías ni inferencias de «red normal» por ausencia de alertas.
- [ ] Replay/histórico reproducible y versionado; no confundir el índice actual de muestras con reconstrucción del gemelo.
- [ ] Conciliar el brief completo: AEMET multiestación/predicciones/avisos, precios de parking y routing bici/coche/intermodalidad. Implementar o diferir **con aprobación explícita**; no eliminar del alcance silenciosamente.

**Puerta R1:** matriz requisito → fuente/contrato → implementación → prueba → evidencia; cada capacidad implementada o exclusión/GAP formalmente aceptado. Una limitación de acceso externo bloquea esa capacidad, no se reporta como completada.

## R2 — Cierre de evaluación local (≤5 personas)

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
