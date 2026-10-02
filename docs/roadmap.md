# Alcance y estado acordado

[Índice](index.md) · [Capacidades](overview.md) · [Evolución y evidencia](evolution.md) · [Fuentes](sources/README.md)

Actualizado el **02/10/2026**. Este documento define el alcance vigente. Las listas de tareas de actas o planes anteriores describen su fecha, no nuevas obligaciones.

## Estado

| Bloque | Estado vigente | Referencia |
| --- | --- | --- |
| R0 — Vertical local | **Cerrado e integrado.** Routing corregido, controles conversacionales, ingestión, identidad, histórico y calidad | [Entrega E8](acceptance/2026-09-25-local-delivery.md) |
| E2 — Conversación | **Cerrado.** Pausa, aprobación y rechazo nativos de EVE; límites y telemetría conservados | [Acta E2](acceptance/2026-09-25-e2-closure.md) |
| R1 — Dominio acordado | **Cerrado.** Fuentes y funciones entregadas, con las exclusiones aprobadas que se enumeran abajo | [Registro de productos](sources/README.md) |
| R2.1 — Historial de conversaciones | **Entregado.** Listado propio, paginación y reapertura nativa | [Acta](acceptance/2026-09-28-conversation-history.md) |
| R2 — Obligaciones de cierre de evaluación | **Retiradas por decisión del usuario**, no certificadas ni ejecutadas por esta decisión | [Decisión sobre R2](#decisión-sobre-r2) |
| Publicación Vercel | Alternativa documentada, no tarea programada ni condición de cierre | [Preparación cloud](deployment.md) |

## Capacidades conservadas

- EVE oficial, OpenAI directo con `gpt-6-luna`, Better Auth y aislamiento de conversaciones.
- Dieciséis herramientas MCP con contratos, procedencia, antigüedad y errores explícitos.
- Ingestión local con ventana de actividad, dos carriles, leases, recuperación y backoff.
- Renfe, catálogo y llegadas EMT; catálogos/horarios estáticos CRTM y correspondencias existentes.
- Routing Renfe/EMT/Metro Ligero/interurbanos/caminatas; actualización versionada y reversible.
- Estimaciones y avisos Renfe aplicados cuando coinciden identidad, fecha, versión y frescura; avisos EMT contextualizados.
- Geocodificación Nominatim autorizada, con catálogos primero, consentimiento y caché.
- DGT, BiciMAD, aire, tráfico, aparcamiento y resúmenes almacenados de línea/red/movilidad.
- Meteorología horaria y diaria, CAP y observaciones de 25 estaciones; contexto automático del itinerario.
- Declaraciones de accesibilidad estática, separadas por parada y vehículo.
- Tarifas contrastadas de 15 aparcamientos EMT y cálculo orientativo, independiente de ocupación.
- Histórico de movilidad retenido, distinto del historial de conversaciones R2.1.

Consulta [qué permite cada capacidad](overview.md), [cómo funciona](architecture.md) y [su evidencia](acceptance/index.md).

## Exclusiones aprobadas

| Exclusión | Decisión | Qué se conserva |
| --- | --- | --- |
| Horarios/routing actuales de Metro de Madrid y nuevas correspondencias CRTM↔EMT/Renfe | 29/09/2026; [fundamento](research/2026-09-29-metro-alternatives.md) y [plan ejecutado](plans/2026-09-29-scope-closure.md) | Catálogo Metro, correspondencias existentes y otras redes |
| Routing de bicicleta/coche, viajes completos BiciMAD y nuevas combinaciones coche/aparcamiento/transporte | 01/10/2026 | Transporte público y caminatas; consultas BiciMAD y parking |
| RT adicional CRTM y nueva asociación de llegadas EMT a viajes GTFS para alterar itinerarios | 02/10/2026 | Llegadas por parada, overlays y avisos existentes |
| Estado operativo de ascensores/escaleras y verificación de recorrido accesible completo | 02/10/2026 | Accesibilidad estática y avisos de accesibilidad recibidos |

Estas capacidades no se declaran implementadas ni técnicamente imposibles. No son trabajo aplazado ni se convierten en tareas al volver a leer una investigación.

## Decisión sobre R2

El **02/10/2026**, el usuario retiró **todos los pendientes de cierre R2**. Esto incluye nuevas campañas, métricas como condición de cierre, comprobaciones adicionales de concurrencia/uso, ensayos prolongados, más pares de rutas, mediciones de memoria OTP y un acta final obligatoria.

**Retirado no significa aprobado por una prueba.** Las pruebas realmente ejecutadas conservan sus resultados en el [archivo de evidencia](acceptance/index.md). Los scripts de diagnóstico y experimentos existentes no se eliminan, pero su existencia no impone ejecutarlos. Los controles de seguridad de la aplicación y la regla de desarrollo `pnpm check` tampoco se eliminan.

R2.1 continúa disponible. Las instrucciones de instalación, mantenimiento y recuperación se documentan como ayuda operativa, no como una nueva barrera de aceptación.

## Cómo continuar

No hay otro bloque funcional obligatorio en este roadmap. Se puede usar el sistema dentro del alcance acordado y mantener sus datos mediante la [operación local](local-runtime.md). Una nueva funcionalidad, campaña o publicación requiere una petición nueva; una limitación por sí sola no la autoriza.

La reorganización documental queda registrada en el [log de la wiki](log.md). No cambia código, fuentes, cuentas ni runtime.
