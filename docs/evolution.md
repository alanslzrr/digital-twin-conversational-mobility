# Cómo se construyó el proyecto

[Índice](index.md) · [Estado vigente](roadmap.md) · [Actas](acceptance/index.md) · [Investigaciones](research/index.md)

El proyecto creció en tres etapas: separar la conversación de los datos, consolidar las consultas y ampliar la información disponible para cada viaje. Las PR y actas enlazadas recogen los cambios y las pruebas de cada entrega.

## En esta página

- [Separar conversación, acceso y movilidad](#separar-conversación-acceso-y-movilidad)
- [Corregir antes de ampliar](#corregir-antes-de-ampliar)
- [Ampliar transporte y fuentes](#ampliar-transporte-y-fuentes)
- [Hacer más útil cada conversación](#hacer-más-útil-cada-conversación)
- [Alcance de la versión](#alcance-de-la-versión)

## Separar conversación, acceso y movilidad

La primera versión distribuyó el sistema entre dos aplicaciones. EVE proporciona el chat y coordina las llamadas al modelo y a las herramientas. Mobility Core gestiona fuentes, datos y consultas; utiliza OTP para calcular itinerarios. MCP conecta ambas aplicaciones con operaciones de movilidad definidas.

Las [PR #12](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/12), [#13](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/13), [#14](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/14) y [#15](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/15) registran acceso, interfaz oficial, ingestión/routing local y avisos EMT.

El acceso se implementó en Core con Better Auth y PostgreSQL. El navegador inicia sesión a través de la Web, que reenvía las solicitudes de autenticación a Core. Antes de abrir o continuar una conversación, el canal EVE comprueba la identidad, la propiedad de la sesión y las cuotas. Los mensajes permanecen en EVE; Core mantiene el registro que vincula cada conversación con su propietario.

[Flujo de autenticación](architecture.md#recorrido-de-una-pregunta), [procedencia de la interfaz](../apps/eve-web/vendor/eve/README.md) y [registro operativo original](acceptance/local-runtime-history.md).

## Corregir antes de ampliar

Una auditoría de uso detectó que una consulta `TRANSIT` podía convertirse en una ruta peatonal y que había problemas de interpretación, continuidad e histórico. Se dividió el trabajo en entregas acotadas.

| Entrega | Cambio que aportó | Evidencia |
| --- | --- | --- |
| E1 | `TRANSIT` exige transporte sin quitar los accesos a pie; conserva límites de caminar/transbordos | [Routing](acceptance/2026-09-25-routing.md) |
| E2 | Pausa y aviso al llegar a límites, Approve para continuar y Stop para detener; telemetría de consumo y pasos | [Cierre conversacional](acceptance/2026-09-25-e2-closure.md) |
| E3 | Worker de dos carriles, recuperación, leases y backoff, sin repetir todos los ciclos perdidos | [Ingestión](acceptance/2026-09-25-ingestion.md) |
| E4 | Identidad de líneas sin mezclar ramales y destinos basados en viajes/secuencia | [Líneas y destinos](acceptance/2026-09-25-line-destinations.md) |
| E5 | Hechos y conocimiento histórico separados; correcciones sin duplicar reintentos y calidad por entidad | [Histórico y calidad](acceptance/2026-09-25-history-quality.md) |
| E6 | Continuidad de la vertical: avisos futuros, RT parcial, llegada/salida y protección de login | [Continuidad](acceptance/2026-09-25-functional-continuity.md) |
| E8 | Integración, migraciones 0008–0012 y activación del runtime habitual | [Entrega local](acceptance/2026-09-25-local-delivery.md) |

Integración mediante [PR #16](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/16) y [registro #17](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/17). Una corrección posterior, [PR #18](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/18), enseñó al agente a descubrir/reutilizar el histórico, usar el reloj de Core y no duplicar resultados MCP. [Acta](acceptance/2026-09-25-post-e8-findings.md).

## Ampliar transporte y fuentes

| PR | Capacidad añadida | Evidencia/explicación |
| --- | --- | --- |
| [#19](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/19) | Catálogo EMT y próximas llegadas bajo demanda | [EMT](acceptance/2026-09-25-emt.md): importación de 4.923 paradas y 237 líneas en esa entrega |
| [#22](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/22), [#23](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/23) | Catálogos/horarios CRTM y correspondencias documentadas | [CRTM](sources/crtm.md): calendarios, excepciones, frecuencias y paradas repetidas |
| [#25](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/25), [#26](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/26) | Geocodificación; routing multioperador y releases reversibles; overlays RT | [Contrato geocoder](sources/geocoding.md), [release y rollback](acceptance/2026-09-25-routing-releases.md). Nominatim se autorizó después de implementar el mecanismo |
| [#27](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/27) | DGT y resúmenes de línea/red/movilidad desde almacenamiento | [Acta](acceptance/2026-09-28-dgt-aggregates.md) |

El sistema ya consultaba Renfe, BiciMAD, aire, tráfico, ocupación y AEMET Retiro. Las nuevas integraciones ampliaron las consultas disponibles mediante MCP.

## Hacer más útil cada conversación

| PR | Aporte directo | Evidencia |
| --- | --- | --- |
| [#28](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/28) | Reabrir chats propios desde Mis conversaciones mediante la recuperación de EVE | [Historial R2.1](acceptance/2026-09-28-conversation-history.md) |
| [#29](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/29) | Añadir meteorología pertinente al viaje ya definido, con caché compartida | [Predicción horaria/CAP](acceptance/2026-09-28-journey-weather.md) |
| [#30](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/30) | Mostrar declaraciones de accesibilidad por parada y vehículo | [Accesibilidad estática](acceptance/2026-09-29-static-accessibility.md) |
| [#31](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/31), [#32](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/32) | Alinear alcance Metro, corregir comprobaciones CRTM y dependencia vulnerable | [Consolidación de alcance](plans/2026-09-29-scope-closure.md) y cambios enlazados en PR |
| [#33](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/33), [#34](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/34) | Predicción diaria para viajes futuros y diagnóstico correcto de caducidad frente a horizonte | [Acta diaria](acceptance/2026-09-30-daily-weather.md) |
| [#35](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/35) | Observaciones por ubicación/estación desde catálogo de 25 estaciones | [Multiestación](acceptance/2026-09-30-weather-observations.md) |
| [#39](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/39), [#40](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/40) | Tarifas y coste orientativo de 15 parkings; «hoy» calculado con reloj Madrid | [Acta de precios](acceptance/2026-10-01-parking-prices.md) y corrección #40 |

## Alcance de la versión

Se acordó excluir Metro actual, nuevas correspondencias, rutas en bici/coche y ciertas ampliaciones RT/accesibilidad. Las capacidades existentes permanecen. [PR #42](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/42) cerró R1 con el registro de fuentes.

El 02/10/2026 se retiraron los requisitos adicionales de evaluación R2. El historial de conversaciones R2.1 forma parte del sistema. [Alcance y decisión de cierre](roadmap.md#decisión-sobre-r2).
