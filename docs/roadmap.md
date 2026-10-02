# Alcance y estado acordado

[Índice](index.md) · [Capacidades](overview.md) · [Evolución y evidencia](evolution.md) · [Fuentes](sources/README.md)

Alcance vigente al **02/10/2026**.

## Estado

| Bloque | Estado vigente | Referencia |
| --- | --- | --- |
| R0 — Vertical local | **Cerrado e integrado.** Routing corregido, controles conversacionales, ingestión, identidad, histórico y calidad | [Entrega E8](acceptance/2026-09-25-local-delivery.md) |
| E2 — Conversación | **Cerrado.** Pausa, aprobación y rechazo nativos de EVE; límites y telemetría conservados | [Acta E2](acceptance/2026-09-25-e2-closure.md) |
| R1 — Dominio acordado | **Cerrado.** Fuentes y funciones entregadas, con las exclusiones aprobadas que se enumeran abajo | [Registro de productos](sources/README.md) |
| R2.1 — Historial de conversaciones | **Entregado.** Listado propio, paginación y reapertura nativa | [Acta](acceptance/2026-09-28-conversation-history.md) |
| R2 — Obligaciones de cierre de evaluación | **Retiradas por decisión del usuario** | [Decisión sobre R2](#decisión-sobre-r2) |
| Publicación Vercel | Alternativa de alojamiento | [Preparación cloud](deployment.md) |

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

Las exclusiones delimitan esta versión y quedan fuera del trabajo planificado.

## Decisión sobre R2

El **02/10/2026**, el usuario retiró **todos los pendientes de cierre R2**. Esto incluye nuevas campañas, métricas como condición de cierre, comprobaciones adicionales de concurrencia/uso, ensayos prolongados, más pares de rutas, mediciones de memoria OTP y un acta final obligatoria.

La retirada cancela esos requisitos de cierre. Las pruebas ejecutadas se recogen en el [archivo de evidencia](acceptance/index.md). Se conservan el historial de conversaciones R2.1, los controles de seguridad, los scripts de diagnóstico y `pnpm check` como comprobación de desarrollo.

## Cómo continuar

El alcance funcional acordado está entregado. Para utilizarlo y mantener sus datos, sigue la [operación local](local-runtime.md). Las ampliaciones se decidirán como nuevos encargos.
