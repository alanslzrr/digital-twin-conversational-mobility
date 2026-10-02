# Revisión de la wiki — 02/10/2026

[Índice de la wiki](../index.md) · [Actas](index.md) · [Log documental](../log.md) · [Alcance](../roadmap.md)

## Resultado documental

Reorganización de los 42 documentos iniciales como wiki navegable, con guías vigentes y archivo histórico diferenciado. Entrada canónica, tres recorridos de lectura, referencia de las 16 herramientas, altas/recursos oficiales, evolución y seis diagramas Mermaid.

Retiradas por decisión del usuario todas las obligaciones de cierre R2. No se marcan como realizadas. R0/E2/R1 y la funcionalidad R2.1 conservan su estado. No se añade un nuevo bloque funcional obligatorio.

El trabajo parte de `fbb129d`, en la rama `alanslzrr/documentation-wiki`. Solo modifica `README.md` y Markdown bajo `docs/`. La integración se consulta en la PR de esta rama; este documento no afirma un merge ni una activación de runtime.

## Comprobaciones ejecutadas

- Inventario y recorrido del grafo de enlaces desde `docs/index.md`: todas las páginas de `docs/` alcanzables, sin archivos aislados. Validación de rutas locales y anclas con reglas de slug de GitHub; incluye referencias al código y navegación del README.
- Contraste de las 16 entradas MCP con schemas y registro real; revisión de variables contra ejemplos públicos y scripts, sin leer secretos para documentarlos.
- Comandos `pnpm` y rutas de scripts contrastados con archivos existentes; sintaxis de bloques shell comprobada sustituyendo marcadores de release/versiones. **No se ejecutaron** importaciones, activaciones, migraciones, restores ni comandos de cuentas.
- Seis diagramas renderizados con Mermaid CLI y Chrome headless en un directorio temporal; revisión visual de etiquetas, relaciones y separación local/externo. Se corrigió el trazado de la arquitectura general para no cruzar cajas externas. Mermaid queda editable en Markdown; no se añade una dependencia al proyecto.
- Enlaces oficiales del catálogo/altas/cloud: 61 URLs distintas examinadas por HTTP HEAD; 60 respondieron correctamente y AEMET alta agotó TLS en ese intento. La página de alta AEMET se pudo consultar por la herramienta web. Esto verifica acceso documental, no disponibilidad operativa de APIs.
- Consultados contenidos oficiales de alta y documentación técnica. EMT condiciones redirige a login; AEMET Swagger requiere JavaScript. Se registra la limitación sin inventar contenido restringido. Las investigaciones originales conservan sus propias fechas y referencias.
- Búsqueda de patrones de claves, JWT y claves privadas en la documentación: sin coincidencias. Ejemplos identificados como tales; no se incorporan `.env.local`, dumps, credenciales ni reportes privados.
- `git diff --check`: correcto.
- **`pnpm check`: aprobado.** Lint y fronteras, TypeScript, **414 pruebas aprobadas y 73 opt-in omitidas**, builds Web/Core correctos mediante caché Turbo. No se presenta la caché como una compilación nueva sin caché.

## Qué no se hizo

Sin cambios funcionales, nuevos contratos, datos, infraestructura, credenciales, despliegues, runtime ni reinicios. Sin llamadas al modelo, campañas, nuevos casos MCP/OTP, benchmarks o pruebas PostgreSQL opt-in. Las pruebas anteriores se conservan como evidencia histórica y no se atribuyen a esta revisión.

La instalación desde cero y los procedimientos de recuperación se contrastaron por lectura del código, **no se ensayaron sobre el entorno habitual**. Los originales largos reciben navegación y avisos de contexto; sus hechos y resultados no se reescriben.

## Referencias de control

[Reglas de mantenimiento](../AGENTS.md) · [Scripts existentes](../../scripts) · [Contratos](../../packages/contracts/src/index.ts) · [Registro MCP](../../apps/mobility-core/app/mcp/route.ts) · [CI](../../.github/workflows/ci.yml) · [Recursos revisados](../resources/index.md#accesos-y-verificación).
