# Roadmap local: estado auditado y criterios de cierre

Actualizado el **25/09/2026**, tras el reporte manual del usuario y reproducción contra MCP/OTP. Base auditada: `f9ef91e`.

**Estado actual: prototipo vertical local funcional, no roadmap cerrado.** La consulta central de rutas tiene un fallo reproducible con `TRANSIT` y la evaluación continua necesita control de presupuesto/fiabilidad. Las 74 pruebas aprobadas no cubrían esos casos.

Evidencia, evaluación individual de los 13 ejemplos y hallazgos: [auditoría completa](audits/2026-09-25-evaluation.md). Instrucciones operativas: [runtime local](local-runtime.md).

## Pasos 1–5: qué hay y qué falta

| Paso | Implementado | Estado / falta para cierre |
| --- | --- | --- |
| 1. OTP local | Grafo real Renfe/OSM versionado; benchmark Atocha/Chamartín/Sol; rutas previstas | **Parcial, aceptación fallida.** Corregir TRANSIT-only; probar límites, pares, horarios y accesibilidad; medir RAM máxima de build. Metro/EMT y RT en itinerarios no implementados. |
| 2. Renfe real | GTFS importado; trip updates/avisos; timestamps, calidad y matching | **Parcial.** Alias C-5/C5, destinos de viajes, replay y cambios diarios; cancelaciones/NO_DATA/SKIPPED; RT en routing y semántica histórica. |
| 3. Ingestión local adaptativa | Worker, ventana 30 min, leases, backoff, dos carriles, read-through, deduplicación y retención | **Implementada, fiabilidad pendiente.** Diagnosticar huecos, heartbeat/latencias y fallos por etapa; suspender/reanudar y aislar fuentes lentas. Cadencia configurada no equivale a cadencia medida. |
| 4. Dominio/MCP/EVE | Diez tools reales, Better Auth/ACL/cuotas, Web Chat oficial y gpt-6-luna directo | **Parcial.** Control de tokens/sesiones largas, normalización, histórico; geocoder general y herramientas de línea/red/snapshot faltantes. |
| 5. Ampliación | BiciMAD, aire, tráfico, parking, AEMET Retiro y avisos EMT | **Parcial.** Llegadas/catálogos EMT; CRTM/Metro/interurbanos, DGT y mapping; ampliar fuentes conforme al brief o documentar exclusiones aprobadas. |

## R0 — Estabilizar y aceptar la vertical existente

Prioridad: corregir antes de ampliar fuentes. IDs remiten a la auditoría.

- [ ] **F01 / P0 — routing:** corregir mapping TRANSIT→OTP. Test contractual del error GraphQL, variantes TRANSIT/WALK y errores diferenciados. La entrada real del reporte debe devolver rutas o ausencia legítima, no error interno.
- [ ] **F02 / P0 — presupuesto:** telemetría por turno/sesión, control efectivo de pasos/tokens y compactación. Ejecutar batería aislada y continua sin ampliaciones inesperadas. Mantener modelo fijo y UI oficial; no aumentar límites como sustituto del diagnóstico.
- [ ] **F03 / P1 — continuidad:** registrar intentos/heartbeat/ventana/lease/backoff, probar recuperación y proveedor lento; medir objetivos de frescura sin inventar timestamps.
- [ ] **F04 / P1 — identidad de línea:** C-5/C5 equivalentes; no confundir C4/C4a/C4b ni EMT002/2; línea inexistente ≠ línea sin avisos.
- [ ] **F05 / P1 — salidas útiles:** destino/sentido trazable cuando la fuente lo permita, ausencia explícita en caso contrario; no usar llegada como salida.
- [ ] **F06 / P1 — histórico:** definir tiempo observado vs conocido, ingesta tardía, desfase/retención, correcciones con mismo timestamp y EMT en histórico.
- [ ] **F07 / P1 — calidad por entidad:** estático vs dinámico en salud, catálogo de estaciones de aire, timestamps de parking por entidad y BiciMAD por estación.
- [ ] **F08 / P1 — aceptación:** automatizar 13 ejemplos + cinco negativos; comprobar exactitud, no solo tools llamadas/HTTP200. URL canónica `http://127.0.0.1:3000/evaluation`; errores de login sin debilitar CSRF.

**Puerta R0:** todos los casos de la vertical pasan o devuelven una limitación esperada y verificable; sin P0/P1 de esa vertical abiertos; regresiones de los defectos del reporte y evidencia de consumo/latencia. No marca los pasos 1–5 como completos.

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
