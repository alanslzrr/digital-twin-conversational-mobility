# Alcance y estado acordado

[Índice](index.md) · [Capacidades](overview.md) · [Evolución y evidencia](evolution.md) · [Fuentes](sources/README.md)

Alcance vigente al **04/10/2026**.

## Estado

| Bloque | Estado vigente | Referencia |
| --- | --- | --- |
| R0 — Vertical local | **Cerrado e integrado.** Routing corregido, controles conversacionales, ingestión, identidad, histórico y calidad | [Entrega E8](acceptance/2026-09-25-local-delivery.md) |
| E2 — Conversación | **Cerrado.** Pausa, aprobación y rechazo nativos de EVE; límites y telemetría conservados | [Acta E2](acceptance/2026-09-25-e2-closure.md) |
| R1 — Dominio acordado | **Cerrado.** Fuentes y funciones entregadas, con las exclusiones aprobadas que se enumeran abajo | [Registro de productos](sources/README.md) |
| R2.1 — Historial de conversaciones | **Entregado.** Listado propio, paginación y reapertura nativa | [Acta](acceptance/2026-09-28-conversation-history.md) |
| R2 — Obligaciones de cierre de evaluación | **Retiradas por decisión del usuario** | [Decisión sobre R2](#decisión-sobre-r2) |
| Panel de Core y telemetría propia | **Integrado en PR #45 el 04/10/2026. CI verde en PR y main; revisión móvil y zoom nativo al 200 % completados. Instalación habitual no ejecutada; sin despliegue cloud** | [Cierre móvil y zoom](acceptance/2026-10-03-core-dashboard-mobile-closure.md), [actualización local](local-runtime.md#actualizar-el-panel); T10 diferido y lector de pantalla fuera del alcance |
| Publicación Vercel | Alternativa futura; CLI retirada y configurador bloqueado por dependencia sin parche | [Preparación cloud](deployment.md) |

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

El alcance funcional anterior está entregado. Para utilizarlo y mantener sus datos, sigue la [operación local](local-runtime.md).

El panel de Mobility Core y la telemetría propia están integrados en [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45). Todos los evaluadores acceden a datos y operación saneada; cada usuario solo ve sus conversaciones. Las seis vistas incluyen mapa, consultas explícitas, fuentes y actividad. Las lecturas reutilizan lo almacenado; el panel visible mantiene la ventana existente de ingestión. La nueva telemetría se retiene hasta siete días.

La ampliación no reabre E2, R0/R1, R2.1 ni R2. El spec original y los refinamientos son [archivo histórico](acceptance/index.md). La [validación final](acceptance/2026-10-03-core-dashboard-mobile-closure.md) registra 72 vistas, 52 estados móviles y zoom nativo. La prueba con lector de pantalla fue retirada; T10 sigue diferido.

La instalación habitual aún necesita aplicar migraciones, renovar el token y reconstruir/reiniciar Web/Core siguiendo [actualizar el panel](local-runtime.md#actualizar-el-panel). El merge no realizó esos cambios ni habilitó cloud.
