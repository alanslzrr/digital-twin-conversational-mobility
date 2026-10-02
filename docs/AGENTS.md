# Mantener esta wiki

[Índice](index.md) · [Registro de cambios](log.md) · [Alcance](roadmap.md)

Estas reglas se añaden a [las convenciones del repositorio](../AGENTS.md). No autorizan cambios funcionales ni nuevas pruebas de pago.

1. Lee `docs/index.md` y el roadmap antes de escribir. Localiza la página canónica del tema.
2. Actualiza esa página y sus referencias. No crees otra explicación equivalente salvo que tenga un público o propósito distinto.
3. Escribe en español claro. Empieza por la utilidad. Define siglas, usa frases cortas y una acción por paso. No afirmes conformidad formal con ASD-STE100.
4. Enlaza **fuente → explicación → implementación → evidencia**. Contrasta conducta y comandos con código versionado, no solo con un mensaje de chat.
5. Separa documentación vigente, ejemplos, evidencia histórica y propuestas retiradas. No reescribas el resultado de una prueba antigua; añade contexto y un enlace al estado actual.
6. Una limitación o investigación no crea una tarea. R0/E2/R1 siguen cerrados; R2.1 sigue entregado; las obligaciones R2 retiradas no se reabren sin petición expresa.
7. Conserva las rutas existentes cuando sea posible. Cada página debe enlazar el índice, páginas relacionadas y fuentes. Las páginas largas necesitan índice interno.
8. Mantén Mermaid editable. Dibuja solo relaciones implementadas. No dibujes cloud como desplegado, Redis como necesario ni acceso directo del modelo a proveedores de movilidad.
9. Añade referencias externas a `resources/index.md`, con propósito, conclusión, versión/fecha pertinente y uso local. Resume y enlaza; no copies documentación externa completa.
10. No abras ni copies secretos, `.env.local`, credenciales, dumps ni informes privados para documentar. Usa nombres de variables y ejemplos sin valores reales.
11. Actualiza el índice y añade una entrada a `log.md` al completar una revisión. El log es cronológico y aditivo: no inventes revisiones retrospectivas.
12. Comprueba enlaces, anclas, referencias al código y navegación desde el índice. Revisa diagramas renderizados y ejemplos. Contrasta scripts sin ejecutar operaciones que alteren datos o servicios.
13. Antes de push, ejecuta `pnpm check`. Distingue ese resultado de pruebas MCP, navegador, modelo o benchmarks no ejecutados. Sigue las convenciones de rama, commits y PR del repositorio.

## Dónde colocar cada cosa

- Guías y explicación vigente: páginas de la raíz de `docs/`.
- Contratos, componentes y configuración: `reference/`.
- Productos de datos y condiciones: `sources/`.
- Referencias, cuentas y claves: `resources/`.
- Investigación original: `research/`; instrucciones históricas: `plans/`.
- Hallazgos de auditoría: `audits/`; resultados ejecutados: `acceptance/`.
- Decisiones vigentes: `roadmap.md`; relato por etapas: `evolution.md`.

No se requiere un framework de documentación, un buscador vectorial ni automatizaciones para mantener esta wiki. Markdown, enlaces, Mermaid y Git son suficientes para su tamaño actual.
