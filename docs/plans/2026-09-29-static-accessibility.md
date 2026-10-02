# R1 — Accesibilidad estática trazable: instrucciones para el agente

[Índice de la wiki](../index.md) · [Archivo de plans](index.md) · [Estado vigente](../roadmap.md)

> **Plan histórico.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Fecha: **29/09/2026**. **Plan preparado; implementación pendiente.**

## Índice interno

- [Encargo](#encargo)
- [1. Persistencia mínima, sin nueva infraestructura](#1-persistencia-mínima-sin-nueva-infraestructura)
- [2. Contrato y reglas exactas](#2-contrato-y-reglas-exactas)
- [3. Integración, sin cambiar el router](#3-integración-sin-cambiar-el-router)
- [4. Calidad conocida y respuesta de EVE](#4-calidad-conocida-y-respuesta-de-eve)
- [5. Pruebas proporcionales y cierre](#5-pruebas-proporcionales-y-cierre)


## Encargo

Implementa y entrega localmente información de **accesibilidad declarada para silla de ruedas** en las herramientas existentes. Lee primero `AGENTS.md`, la [investigación y sus fuentes oficiales](../research/2026-09-29-static-accessibility.md), el [roadmap](../roadmap.md) y la [operación local](../local-runtime.md). Este plan fija el alcance; la investigación lo fundamenta, no añade entregas.

Base investigada: `main` en `b31abe9`. Plan e investigación se prepararon en `alanslzrr/accessibility-plan`: comprueba el estado real y conserva los documentos locales antes de cambiar de rama. No reabras R0, E2, R2.1 ni meteorología.

**Resultado para el usuario:** ante «Voy en silla de ruedas de Atocha a Chamartín; ¿qué está acreditado y qué falta comprobar?», el chat usa la preferencia existente y distingue embarque, vehículo, desembarque y partes no verificadas. Una consulta sobre una estación no necesita planificar una ruta.

## 1. Persistencia mínima, sin nueva infraestructura

- Reutiliza `crtm_stops`, `crtm_trips`, sus versiones y padres. No crees otro catálogo ni reimportes CRTM para duplicar columnas existentes.
- Para Renfe, añade mediante migración aditiva los atributos mínimos de parada/viaje al almacenamiento existente, ligados al identificador externo y versión de fuente, no a un booleano global de `canonical_place`. Conserva tipo y padre cuando estén publicados. Actualiza `scripts/import-renfe.mjs` para importaciones futuras y rollback de releases.
- Rellena únicamente esos atributos desde el export Renfe verificado de la **misma release activa**; operación local, transaccional, idempotente, sin alterar UUIDs, horarios, fechas originales de publicación/preparación ni versión del grafo. Un export/version distinto debe rechazarse.
- No leas ZIP/exports en cada consulta. Core leerá PostgreSQL en lotes de IDs, reutilizando los límites actuales. No crear caché, worker ni sondeo nuevo.

## 2. Contrato y reglas exactas

Contratos en `packages/contracts`, interpretación pura en `packages/domain`, tratamiento temporal en `packages/provenance` y lecturas en Core.

- Por componente usa `status: declared_accessible | declared_not_accessible | unknown`. Son declaraciones estáticas, **no** garantías ni un juicio sobre accesibilidad universal.
- Adjunta código normalizado, entidad/ámbito al que se aplica, fuente/feed, ID externo, versión, fecha de incorporación y URL de origen. Conserva fechas originales disponibles; si falta alguna, null, no la inventes. No denomines `rawCode` al 0 normalizado de una columna ausente.
- Código 1 → `declared_accessible`; 2 → `declared_not_accessible`; 0/ausente → `unknown`, salvo herencia válida. Para parada hija/entrada con 0, hereda solo de la estación padre publicada en el **mismo feed y versión**, indicando `inheritedFrom`. Un hijo explícito prevalece. Sin padre válido o con ciclo/tipo no soportado, desconocido; no inferir por nombre/proximidad ni desde otra red. [Semántica GTFS](https://gtfs.org/documentation/schedule/reference/#stopstxt).
- Mantén por separado `boarding`, `vehicle` y `alighting`. Un vehículo positivo no acredita la parada, un padre positivo no acredita todos sus hijos y dos andenes positivos no acreditan el transbordo. [Guía GTFS](https://gtfs.org/getting-started/features/accessibility/).
- La respuesta de ruta conservará `accessibilityGuaranteed: false`. Caminatas, conexiones interiores y funcionamiento actual de equipos quedan **no verificados** en este bloque; no construir un resultado global «ruta accesible» ni una puntuación propia.
- Solo aplicar evidencia a una ruta si coinciden feed/versión/IDs con su release. Dato ausente, versión distinta o lectura fallida → `unknown` con motivo; nunca positivo por defecto. La falta de enriquecimiento no invalida una ruta calculada: conserva sus datos y la advertencia.
- En catálogos caducados puede mostrarse la declaración histórica con su versión y advertencia, no como estado actual. La envolvente de servicio no es una fecha de inspección de accesibilidad; consultar hoy no rejuvenece el dato.

## 3. Integración, sin cambiar el router

| Herramienta existente | Cambio obligatorio |
| --- | --- |
| `resolve_place` | Adjuntar accesibilidad de parada a Renfe/CRTM y EMT cuando exista correspondencia GTFS verificada. Sin correspondencia o atributo → desconocida. No consultar OTP para resolver el catálogo ni inferir accesibilidad de una dirección. |
| `get_departures` | En Renfe, separar evidencia de embarque y del viaje concreto por ID/versión. No asignar código de una línea a todas sus salidas. |
| `get_crtm_timetable` | Añadir interpretación del punto de embarque real y del viaje; conservar los códigos actuales por compatibilidad. |
| `plan_journey` | Añadir por tramo de transporte embarque/vehículo/desembarque, y un resumen compacto de barreras declaradas y partes desconocidas. Deduplicar procedencia entre alternativas; mantener meteorología, RT, horarios y demás campos. |

**No cambies selección, orden, costes ni filtros de OTP para compensar datos deficientes.** `preferences.wheelchair=true` ya se transmite al motor: consérvalo, igual que caminar/transbordos/modos. No reintentar con false si no aparecen rutas. Un resultado vacío significa que esa búsqueda no encontró alternativa bajo sus condiciones, no que viajar sea físicamente imposible. [OTP 2.10.0](https://docs.opentripplanner.org/en/v2.10.0/RouteRequest/).

No se amplía `get_emt_arrivals`: las llegadas no tienen identidad de viaje GTFS demostrada. Sus tiempos siguen disponibles, pero no se les atribuye un vehículo accesible a partir de la línea o de una declaración general de flota.

## 4. Calidad conocida y respuesta de EVE

- **Metro Ligero:** conserva los códigos originales y añade una nota de calidad para la versión `7e49cfc0980c8e61d96a258d1076ec410a26f66767586d1b1dea49b9caa39467`: las declaraciones negativas de paradas ML2/ML3 discrepan con la información general de [MLO](https://www.metroligero-oeste.es/atencion-al-cliente). La nota debe delimitar ML2/ML3, incluir fuente/fecha de investigación y no aplicarse automáticamente a versiones futuras. Basta una nota acotada, no un motor de conflictos ni scraping. No convertir 2 en 1/0 ni presentar la discrepancia como resuelta.
- **EMT:** ausencia de atributos → desconocido. La [declaración de flota](https://www.emtmadrid.es/Empresa/Somos/NuestraFlota) no rellena paradas ni viajes individuales.
- Actualiza solo instrucciones del agente y descripciones MCP pertinentes. EVE debe decir «el GTFS de esta versión declara…», explicar desconocidos y discrepancias cuando importen y no recomendar como apta una alternativa con barreras declaradas. No afirmar «no puedes viajar» por una declaración estática ni «ascensor operativo» por un código positivo.
- En solicitudes de silla de ruedas utiliza `wheelchair=true`; no deduzcas esa necesidad por edad u otras características. No guardar perfiles personales ni añadir preguntas de salud.
- Sin nuevas herramientas, pantallas, proveedor, scraping, estado RT de ascensores, geometría de accesibilidad, filtros nuevos, cambios del grafo/configuración OTP, mejoras ajenas, llamadas al modelo ni cloud.

## 5. Pruebas proporcionales y cierre

1. **Offline:** 0/1/2/ausente, herencia y prioridad del hijo, padre incorrecto/ciclo, parada vs viaje, nombres iguales entre redes, versiones distintas y fecha caducada. Fallo de enriquecimiento conserva ruta y devuelve desconocido; positivos nunca garantizan caminatas/transbordos.
2. **PostgreSQL aislado:** backfill/import Renfe, reintento idempotente, conservación de IDs/fechas/versiones y rollback de transacción ante datos inválidos. Probar sustitución de versión sin reutilizar atributos anteriores y lecturas con CRTM existente.
3. **Integración de contrato:** las cuatro herramientas devuelven componentes/procedencia; EMT ausente queda desconocido; ML2/ML3 mantienen código y nota. `wheelchair` true/false se transmite sin relajarlo, y la ruta mantiene selección/orden/tiempos/RT/meteorología. No exigir que exista una ruta accesible real para que la prueba pase.
4. Ejecutar `pnpm check` y build del agente. Hacer un smoke MCP autenticado acotado con estación Renfe, caso CRTM/herencia, EMT sin atributos y planificación con/sin preferencia. Los casos negativos pueden ser fixtures; no nueva campaña ni benchmark.
5. Commits pequeños, PR con validación real, CI, integración, `main` limpio/sincronizado y retirada de la rama integrada. Conservar estos documentos en la entrega.
6. Antes de instalar: respaldo privado; aplicar migración/backfill de la misma release, recompilar y actualizar el runtime habitual según el runbook. **No reconstruir, modificar ni reiniciar OTP.** Verificar autenticación y muestra MCP; registrar hashes de release/grafo sin cambios.
7. Añadir acta breve y actualizar el roadmap: cerrar solo accesibilidad estática declarada dentro de esta cobertura. La discrepancia externa y el estado operativo no comprobado siguen visibles; no afirmar cierre de R1 completo.

**Terminado cuando:** se interpreta la evidencia existente de manera consistente en las cuatro herramientas, se preservan las restricciones y las rutas actuales, las ausencias/discrepancias son explícitas y el cambio está integrado e instalado localmente. No añadir otra auditoría como requisito.
