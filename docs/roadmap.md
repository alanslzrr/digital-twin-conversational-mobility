# Roadmap local: estado auditado y criterios de cierre

Actualizado el **25/09/2026**, tras el reporte manual del usuario y reproducción contra MCP/OTP. Base auditada: `f9ef91e`.

**Estado actual: prototipo vertical local funcional, no roadmap cerrado.** El fallo `TRANSIT` de la auditoría está corregido en la rama de trabajo y validado por MCP/OTP local; E2 está cerrado en la rama con aceptación offline del flujo nativo de pausa/aprobación/rechazo. E3–E6 completan localmente la vertical R0; integración habitual E8 y ampliación E7 siguen pendientes. Las 74 pruebas de la auditoría no lo detectaban; la primera entrega añade 69 regresiones (143 pruebas en total).

Evidencia, evaluación individual de los 13 ejemplos y hallazgos: [auditoría completa](audits/2026-09-25-evaluation.md). Instrucciones operativas: [runtime local](local-runtime.md).

Ejecución iniciada del [plan E0–E8](plans/2026-09-25-remediation.md). [Primera entrega y matriz de aceptación](acceptance/2026-09-25-routing.md): E0 mínimo y E1 implementados localmente, sin integración en main ni reinicio del runtime habitual. Gasto, benchmarks y despliegues conservan autorización separada.

## Continuidad vigente

E2 no se reabre. E3–E6 están implementados y probados localmente; continuar con E7 o integrar mediante E8. [Evidencia E6](acceptance/2026-09-25-functional-continuity.md) reutiliza pruebas existentes y regresiones de comportamiento modificado. Campañas experimentales, consumo y benchmarks son opcionales y requieren autorización separada: las propuestas históricas de R2 no añaden barreras al funcionamiento local. E8 incluye PR/integración, migraciones y actualización del runtime habitual; puede integrar E1–E3 antes de terminar E7. Vercel queda para después.

## Pasos 1–5: qué hay y qué falta

| Paso | Implementado | Estado / falta para cierre |
| --- | --- | --- |
| 1. OTP local | Grafo real Renfe/OSM versionado; benchmark Atocha/Chamartín/Sol; rutas previstas; fix TRANSIT probado por MCP local | **Parcial.** F01 corregido en rama; faltan aceptación EVE, ampliar cobertura de pares/accesibilidad y medir RAM máxima de build. Metro/EMT y RT en itinerarios no implementados. |
| 2. Renfe real | GTFS importado; trip updates/avisos; timestamps, calidad y matching | **Parcial.** Alias/destinos corregidos localmente en E4; falta reimportar/integrar, replay y cambios diarios; RT en routing y reconstrucción histórica completa. Cancelaciones/NO_DATA/SKIPPED y modos históricos event/knowledge están probados localmente. |
| 3. Ingestión local adaptativa | Worker, ventana 30 min, leases, backoff, dos carriles, read-through, deduplicación y retención | **E3 implementado localmente.** Carriles independientes, heartbeat, fallos por etapa y recuperación sin replay probados con proveedores simulados/DB aislada. Integración pendiente; cadencia configurada no equivale a SLO medido. |
| 4. Dominio/MCP/EVE | Diez tools reales, Better Auth/ACL/cuotas, Web Chat oficial y gpt-6-luna directo | **Parcial.** E2 cerrado, E3–E6 implementados localmente; queda integración E8; geocoder general y herramientas de línea/red/snapshot faltantes. |
| 5. Ampliación | BiciMAD, aire, tráfico, parking, AEMET Retiro y avisos EMT | **Parcial.** Llegadas/catálogos EMT; CRTM/Metro/interurbanos, DGT y mapping; ampliar fuentes conforme al brief o documentar exclusiones aprobadas. |

## R0 — Estabilizar y aceptar la vertical existente

Prioridad: corregir antes de ampliar fuentes. IDs remiten a la auditoría.

- [x] **F01 / P0 — routing (rama local):** mapping TRANSIT→OTP corregido, regresiones de modos/preferencias/errores y tres baterías MCP de 11 casos aprobadas. Entrada del reporte: tres itinerarios previstos de 13 min. [Evidencia y límites](acceptance/2026-09-25-routing.md). Integración en main/runtime habitual y aceptación conversacional siguen separadas.
- [x] **F02 / P0 — control conversacional (E2 cerrado en rama):** telemetría, compactación con evidencia y límites nativos EVE: pausa y aviso, aprobar continúa, rechazar detiene. Verificado sin gasto; no exige consumir 100.000/10.000 tokens ni campaña real. Campañas con ledger quedan como modo experimental opt-in, no requisito del chat. [Cierre y evidencia](acceptance/2026-09-25-e2-closure.md). Integración en main/runtime habitual separada. E3 implementado localmente; siguiente paso funcional: E7.
- [x] **F03 / P1 — continuidad (E3 local):** carriles independientes sin barrera de lote, recuperación de leases y backoff sin replay; heartbeat/ventana/errores/frescura separados y nueve regresiones PostgreSQL aisladas. Migración `0010` e integración en runtime habitual pendientes en E8; no se afirma un SLO medido. [Cambios y evidencia](acceptance/2026-09-25-ingestion.md).
- [x] **F04 / P1 — identidad de línea (E4 local):** alias Renfe contra catálogo, ramales/ceros EMT preservados; identidad conocida/desconocida/catálogo ausente separada de avisos. Catálogo EMT pendiente E7. [Evidencia E4](acceptance/2026-09-25-line-destinations.md).
- [x] **F05 / P1 — salidas útiles (E4 local):** destino explícito o terminal derivado por viaje, con versión y origen; CIVIS no se presenta como destino, ausencia explícita y llegada/salida separadas. `0011`, reimportación e integración habitual pendientes E8. [Cobertura y límites](acceptance/2026-09-25-line-destinations.md).
- [x] **F06 / P1 — histórico (E5 local):** modos event/knowledge, revisiones/correcciones idempotentes, EMT, ingestas tardías sin regresión, desfase y límites de retención. Índice parcial, no reconstrucción completa. `0012` pendiente de integración. [Evidencia y transición](acceptance/2026-09-25-history-quality.md).
- [x] **F07 / P1 — calidad por entidad (E5 local):** parking/categorías, aire y BiciMAD con procedencia propia; catálogo oficial de aire versionado, identidad parcial si no hay correspondencia, salud con cobertura por entidad y capacidad estática separada. [Límites](acceptance/2026-09-25-history-quality.md).
- [x] **F08 / P1 — continuidad funcional (E6 local):** corregidos avisos futuros, explicación del RT y login canónico/errores sin debilitar CSRF. 242 pruebas offline y smokes MCP/OTP existentes aprobados, sin campaña conversacional nueva. [Evidencia y límites E6](acceptance/2026-09-25-functional-continuity.md). Integración habitual pendiente E8.

**R0 local completado en el alcance acordado:** funcionalidad existente y regresiones verificadas sin exigir otra campaña de aceptación, consumo o benchmark. E8 integra y actualiza el runtime habitual; E7 amplía cobertura. No equivale a servicio operativo ni marca los pasos 1–5 como completos.

## R1 — Completar el alcance original del dominio

Orden por dependencias, no por número de endpoints:

- [ ] Registro de fuentes: contrato, cobertura espacial/temporal, licencias/atribución, credenciales/caducidad, límites y GAPs con evidencia. Activar una fuente no equivale a revisar su licencia.
- [ ] Identidad/catálogos EMT y CRTM; lugares/paradas/líneas/viajes versionados y mapping entre operadores sin colisiones.
- [ ] Llegadas EMT con caché/read-through acotado y normalización; no polling global continuo de todas las paradas.
- [ ] Incorporar GTFS CRTM/Metro/interurbanos al routing según disponibilidad oficial y validar correspondencias/servicios. Distinguir siempre cobertura estática de RT.
- [ ] Integración RT/alertas en routing con una sola política de actividad/ingestión; degradación a previsto explícita y probada, sin segundo polling oculto en OTP.
- [ ] Accesibilidad estática trazable; ascensores/escaleras RT como GAP externo hasta disponer de fuente oficial. No garantizar accesibilidad operativa desde atributos estáticos.
- [ ] DGT: verificar acceso/versión DATEX, adaptar eventos/geometrías, deduplicar y probar cancelación/expiración; no sustituir por tráfico municipal.
- [ ] Resolver direcciones arbitrarias mediante geocoder fallback controlado; caché, ambigüedad, licencias y límites. No hace falta self-hostear Nominatim para demostrar la interfaz.
- [ ] Implementar `get_line_status`, `get_network_status` y `get_mobility_snapshot` con cobertura parcial/frescura explícitas; sin tools vacías ni inferencias de «red normal» por ausencia de alertas.
- [ ] Replay/histórico reproducible y versionado; no confundir el índice actual de muestras con reconstrucción del gemelo.
- [ ] Conciliar el brief completo: AEMET multiestación/predicciones/avisos, precios de parking y routing bici/coche/intermodalidad. Implementar o diferir **con aprobación explícita**; no eliminar del alcance silenciosamente.

**Puerta R1:** matriz requisito → fuente/contrato → implementación → prueba → evidencia; cada capacidad implementada o exclusión/GAP formalmente aceptado. Una limitación de acceso externo bloquea esa capacidad, no se reporta como completada.

## R2 — Cierre de evaluación local (≤5 personas)

- [ ] R0/R1 satisfechos para el alcance explícitamente acordado.
- [ ] Cinco cuentas concurrentes: sesiones aisladas, CSRF, scopes, cuotas atómicas, revocación, logout y ausencia de secretos en navegador/modelo/logs.
- [ ] Batería de conversaciones aisladas y continuas: las 13 consultas y negativos, ambigüedad, antigüedad, ausencia, cancelación y error de proveedor.
- [ ] Presupuestos de tokens/coste y objetivos p50/p95 de latencia/frescura aprobados y medidos, separando caché, red externa, routing y modelo.
- [ ] Soak propuesto de dos horas, 30 min sin usuarios y reactivación; recuperación de procesos y fallos de persistencia sin duplicados ni retrocesos. Fijar umbrales antes de probar, no después de ver resultados.
- [ ] Más pares OTP, horarios/días y accesibilidad; pico RAM de build, arranque y residencia documentados. No extrapolar cuatro pares a toda la red.
- [ ] Runbook reproducible: iniciar/parar, healthcheck, actualizar GTFS/OSM/graph atómicamente, revertir, rotar claves y borrar conversaciones/raw. El calendario actual termina el **22/10/2026**.
- [ ] Acta final: casos aprobados, errores abiertos, evidencia, cobertura y limitaciones aceptadas. Sin afirmar «TODO» a partir de un smoke exitoso.

## R3 — Publicación Vercel opcional, después del cierre local

- [ ] Autorización expresa antes de publicar o contratar; mantener recursos cloud separados y despliegues desactivados mientras tanto.
- [ ] Convertir worker/disco local en scheduling y almacenamiento durables adecuados al entorno; no ejecutar el bucle local en Functions.
- [ ] Decidir OTP dedicado/bajo demanda según mediciones, no cifras antiguas del brief; reevaluar cuotas/condiciones vigentes en ese momento.
- [ ] Verificar privacidad, retención/borrado, rotación, licencias y controles de acceso del despliegue.

**Vercel no es requisito de R0–R2 ni una solución a los fallos funcionales actuales.**
