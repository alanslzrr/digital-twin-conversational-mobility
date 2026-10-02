# Registro de revisiones documentales

[Índice](index.md) · [Reglas de mantenimiento](AGENTS.md) · [Evolución del producto](evolution.md)

Registro aditivo de revisiones de esta wiki. La evolución anterior se sintetiza en su página propia; no se inventan entradas retrospectivas.

## [2026-10-02] revisión | Wiki navegable y alcance acordado

- Creada la entrada canónica y tres recorridos: comprender, usar/operar y desarrollar.
- Reorganizadas las explicaciones, instalación, operación, referencia de 16 herramientas, configuración, glosario y recursos oficiales.
- Retiradas todas las obligaciones de cierre R2 por decisión del usuario, sin presentarlas como pruebas ejecutadas. R0/E2/R1 y el historial R2.1 conservan su estado.
- Indexadas las actas, auditorías, investigaciones y planes originales; añadidos avisos de contexto histórico. La guía local anterior se conserva como registro de pruebas/transiciones.
- Añadidos seis diagramas Mermaid de relaciones implementadas. No se introduce otro sistema de documentación.
- Documentadas las altas OpenAI/EMT/AEMET, moderación EMT, política Nominatim y preparación cloud sin publicación. Ningún secreto o documento privado se incorpora.
- Se retiene la investigación original mediante enlaces y se contrasta la síntesis con código/scripts versionados.

[Verificación de esta revisión](acceptance/2026-10-02-documentation-wiki.md): enlaces/anclas sin errores y sin documentos aislados, seis diagramas renderizados y revisados, fuentes oficiales con restricciones registradas y `pnpm check` aprobado (414 pruebas, 73 omitidas; builds con caché). Sin inferencias, campañas, benchmarks, cambios de datos ni reinicio de runtime.

## [2026-10-02] revisión | Presentación completa del README

- Ampliada la portada del repositorio: propósito, capacidades, ejemplos, componentes y recorrido de una pregunta.
- Añadido un diagrama Mermaid de presentación y separadas primera instalación y puesta en marcha cotidiana.
- Explicados requisitos, privacidad, cobertura acordada, estructura del código y comprobaciones disponibles, con enlaces a sus guías canónicas.
- Conservado el índice de la wiki como entrada al detalle; añadido enlace de vuelta al README.
- Revisión exclusivamente documental; no modifica funcionalidades, datos, credenciales ni runtime.
- Verificados enlaces y anclas sin errores, vista HTML del README sin desbordamiento horizontal y diagrama Mermaid renderizado/revisado. `pnpm check` aprobado: 414 pruebas, 73 opt-in omitidas y builds con caché. No se ejecutó ninguna consulta al modelo.

## [2026-10-02] revisión | Explicaciones de componentes y acceso

- Reescritas la presentación y la evolución para explicar responsabilidades y flujos.
- Detalladas las sesiones Better Auth, el proxy Web, la propiedad de conversaciones y los permisos de servicio.
- Retiradas de las páginas introductorias las comparaciones con tecnologías descartadas, los cupos de cuentas y los comentarios sobre la redacción. Los límites operativos permanecen en la administración de cuentas.
- Actualizadas las reglas de edición para mantener esta separación.
- Verificados 1.034 enlaces locales y 286 anclas; ningún documento aislado. Comandos, bloques de código y diagramas conservados. `git diff --check` correcto.

## [2026-10-02] revisión | Redacción directa en guías y referencias

- Revisados README, guías de uso y operación, arquitectura, configuración, fuentes y recursos.
- Sustituidas advertencias genéricas por el comportamiento, la condición o la acción correspondiente.
- Concentradas las decisiones de alcance en el roadmap y abreviadas las etiquetas de archivo; conservados los cuerpos de las actas, investigaciones y planes originales.
- Añadida una revisión editorial a las reglas de mantenimiento.
- Comprobados 978 enlaces locales y 254 anclas, sin errores ni documentos aislados. Conservados los enlaces externos, los bloques de comandos y diagramas, y los cuerpos de 33 documentos históricos. `git diff --check` correcto.

## [2026-10-02] revisión | Portada de navegación de docs

- Añadido `docs/README.md` con accesos a explicación, uso, operación y referencia técnica.
- Enlazada la portada desde el README del proyecto y el índice completo.
- Verificación conjunta: 1.004 enlaces y 255 anclas correctos; `pnpm check` aprobado con 414 pruebas y 73 omitidas. Typecheck y builds reutilizaron la caché de Turbo.
