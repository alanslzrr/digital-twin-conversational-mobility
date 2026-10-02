# Madrid Mobility Twin · Documentación

Esta wiki explica qué hace el proyecto, cómo usarlo y cómo mantenerlo. Es una **evaluación universitaria local para hasta cinco personas**, no un servicio público de movilidad. Estado documental: **2 de octubre de 2026**.

**Empieza por [el proyecto en diez minutos](overview.md).** No necesitas conocer programación para leerlo.

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
| Cómo funciona | [Arquitectura](architecture.md): componentes, límites y cinco flujos explicados |
| Guía de uso | [Conversar con el sistema](user-guide.md): acceso, consultas, historial y continuidad |
| Instalación | [Preparación inicial](installation.md): requisitos, cuentas, claves, datos y primer arranque |
| Operación | [Runtime local](local-runtime.md): iniciar, parar, actualizar, respaldar y recuperar |
| Operación | [Evaluadores](evaluation.md): crear cuentas, resetear, revocar y entender caducidades |
| Operación | [Releases de routing](routing-releases.md): cambiar datos y grafo juntos, activar y revertir |
| Diagnóstico | [Problemas frecuentes](troubleshooting.md): qué revisar ante cada síntoma |
| Referencia | [16 herramientas MCP](reference/mcp.md): entradas, permisos, resultados y ejemplos |
| Referencia | [Sistema y configuración](reference/system.md): código, variables, persistencia y comandos |
| Fuentes | [Registro por producto](sources/README.md): acceso, atribución, cobertura y evidencia |
| Fuentes | [CRTM](sources/crtm.md), [DGT](sources/dgt.md), [geocodificación](sources/geocoding.md): semántica específica |
| Recursos | [Catálogo de referencias](resources/index.md): investigación, documentación oficial y aplicación en el código |
| Recursos | [Cuentas y claves](resources/accounts.md): pasos manuales OpenAI, EMT, AEMET y Nominatim |
| Alternativa cloud | [Preparación Vercel](deployment.md): lo aprovisionado, lo no publicado y diferencias con local |
| Evolución | [Historia del proyecto](evolution.md): etapas, decisiones, PR y pruebas realizadas |
| Evolución | [Roadmap vigente](roadmap.md): entregas cerradas y exclusiones aprobadas, sin obligaciones R2 retiradas |
| Evidencia | [Actas](acceptance/index.md), [auditorías](audits/index.md), [planes](plans/index.md), [investigaciones](research/index.md): archivo completo |
| Consulta | [Glosario](glossary.md): términos técnicos explicados en una frase |
| Mantenimiento | [Reglas de la wiki](AGENTS.md) y [registro de revisiones](log.md) |

## Cómo leer esta wiki

- **Documentación vigente:** explica el código versionado y la operación actual. No prueba que un proveedor responda en este instante.
- **Evidencia histórica:** registra lo comprobado en una fecha. Conserva sus resultados aunque la cobertura haya crecido después.
- **Ejemplo:** muestra qué pedir o cómo formar una entrada; no es una respuesta real ni promete cifras.
- **Alcance:** R0 y R1 están cerrados. R2.1 sigue implementado. Las obligaciones de cierre R2 se retiraron por decisión del usuario; no se presentan como pruebas realizadas. [Decisión completa](roadmap.md#decisión-sobre-r2).

Cada tema enlaza su explicación con código, fuentes y evidencia. Los documentos originales permanecen en sus rutas. No se publican archivos privados, claves ni credenciales de evaluadores.
