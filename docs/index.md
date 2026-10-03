# Madrid Mobility Twin · Documentación

[Portada de documentación](README.md) · [Presentación del repositorio](../README.md)

Guías de uso, arquitectura, instalación y mantenimiento de Madrid Mobility Twin. Actualizado el **2 de octubre de 2026**.

**Empieza por [el proyecto en diez minutos](overview.md)** para conocer sus capacidades y ver ejemplos de uso.

## Elige un recorrido

| Quiero… | Recorrido recomendado |
| --- | --- |
| Entender el proyecto | [Visión general](overview.md) → [cómo funciona](architecture.md) → [cómo lo construimos](evolution.md) |
| Usarlo y operarlo | [Guía de uso](user-guide.md) → [instalación inicial](installation.md) o [arranque cotidiano](local-runtime.md) → [problemas frecuentes](troubleshooting.md) |
| Continuar el desarrollo | [Alcance acordado](roadmap.md) → [arquitectura](architecture.md) → [referencia MCP](reference/mcp.md) → [configuración y datos](reference/system.md) → [reglas documentales](AGENTS.md) |

## Mapa completo

| Sección | Página y finalidad |
| --- | --- |
| Empieza aquí | [Visión general](overview.md): utilidad, capacidades y ejemplos sin tecnicismos |
| Cómo funciona | [Arquitectura](architecture.md): componentes, autenticación, consultas, ingestión e historial |
| Guía de uso | [Conversar con el sistema](user-guide.md): acceso, consultas, historial y continuidad |
| Instalación | [Preparación inicial](installation.md): requisitos, cuentas, claves, datos y primer arranque |
| Operación | [Runtime local](local-runtime.md): iniciar, parar, actualizar, respaldar y recuperar |
| Operación | [Evaluadores](evaluation.md): crear cuentas, resetear, revocar y entender caducidades |
| Operación | [Releases de routing](routing-releases.md): cambiar datos y grafo juntos, activar y revertir |
| Diagnóstico | [Problemas frecuentes](troubleshooting.md): qué revisar ante cada síntoma |
| Referencia | [16 herramientas MCP](reference/mcp.md): entradas, permisos, resultados y ejemplos |
| Referencia | [Sistema y configuración](reference/system.md): código, variables, persistencia y comandos |
| Desarrollo | [Spec original del panel y telemetría](plans/2026-10-02-core-dashboard.md): arquitectura y límites de la implementación inicial; [validación aislada](acceptance/2026-10-02-core-dashboard.md) conservada como evidencia |
| Refinamiento V2 | [Neutralidad, densidad y gráficos con datos existentes](acceptance/2026-10-03-core-dashboard-refinement-v2.md): PR #45, sin despliegue; aceptación manual y fallo de instalación habitual pendientes. [Continuación](acceptance/2026-10-03-core-dashboard-refinement-v2-continuation.md): sistema visual en las seis vistas y codificación de frescura única |
| Rediseño | [Rediseño de seis vistas](acceptance/2026-10-03-core-dashboard-redesign.md): contratos conservados, validación sintética y aceptación manual pendiente; PR #45 sin integrar |
| Refinamiento | [Segunda auditoría con agent-browser](acceptance/2026-10-03-core-dashboard-second-audit.md), con nueve hallazgos corregidos y alcance explícito; [Implementación y validación local](acceptance/2026-10-03-core-dashboard-refinement.md), con verificaciones pendientes; [spec-audit de PR #45](audits/2026-10-02-core-dashboard-review.md): corregir captura/datos y completar las seis vistas con lenguaje claro, gráficos, separación de catálogos y criterios de aceptación; sin instalación habitual |
| Fuentes | [Registro por producto](sources/README.md): acceso, atribución, cobertura y evidencia |
| Fuentes | [CRTM](sources/crtm.md), [DGT](sources/dgt.md), [geocodificación](sources/geocoding.md): semántica específica |
| Recursos | [Catálogo de referencias](resources/index.md): investigación, documentación oficial y aplicación en el código |
| Recursos | [Cuentas y claves](resources/accounts.md): pasos manuales OpenAI, EMT, AEMET y Nominatim |
| Alternativa cloud | [Preparación Vercel](deployment.md): recursos y configuración de alojamiento |
| Evolución | [Historia del proyecto](evolution.md): etapas, decisiones, PR y pruebas realizadas |
| Evolución | [Roadmap vigente](roadmap.md): alcance y estado de las entregas |
| Evidencia | [Actas](acceptance/index.md), [auditorías](audits/index.md), [planes](plans/index.md), [investigaciones](research/index.md): archivo completo |
| Consulta | [Glosario](glossary.md): términos técnicos explicados en una frase |
| Mantenimiento | [Reglas de la wiki](AGENTS.md) y [registro de revisiones](log.md) |

## Guías y archivo

Las guías describen el funcionamiento actual. Las actas, auditorías, planes e investigaciones conservan los resultados y decisiones de cada fecha. Consulta el [roadmap](roadmap.md) para conocer el alcance vigente.
