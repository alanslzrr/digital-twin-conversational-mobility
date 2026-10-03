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

## [2026-10-02] especificación | Panel de Core y telemetría propia

- Preparado el [spec de implementación en una sola PR](plans/2026-10-02-core-dashboard.md), con decisiones de vistas, mapa OSM, acceso existente, actividad visible, consultas manuales, retención de siete días y continuidad visual EVE/Community Agent confirmadas.
- Contrastados los efectos de las 16 herramientas, la salud disponible y las carencias de eventos/trazas persistidos; separadas lectura almacenada, renovación de ventana y ejecución explícita.
- Definidos contratos, autorización/propiedad, instrumentación saneada, límites, migración aditiva, actualización, pruebas y entrega. Revisión cruzada de Core, telemetría y UI incorporada.
- Enlazado como ampliación nueva en roadmap e índices, sin reabrir entregas cerradas ni obligaciones R2 retiradas. Añadidas referencias primarias de template, SWR y mapa.
- Verificados 1.043 enlaces locales y 273 anclas en los 71 Markdown versionados o nuevos, sin errores; `git diff --check` correcto. Revisados contratos y criterios con el código, sin nuevos diagramas.
- Solo documentación: sin implementación, instalación de dependencias, migraciones, inferencias, consultas a proveedores de movilidad o cambios de runtime. No se ejecutaron `pnpm check`, builds ni pruebas funcionales en esta entrega; quedan especificados para la PR de implementación. Sin commit, push o PR documental separada.

## 02/10/2026 · Panel de Core y telemetría implementados

Actualizadas guía, arquitectura, referencia de límites/scopes/tablas, instalación 0021, procedimiento autorizado de actualización y estado independiente del roadmap. Añadida [acta de pruebas y capturas](acceptance/2026-10-02-core-dashboard.md). Validación: check con 460 tests, build agente, 70 tests PostgreSQL afectados, smoke aislado 20 comprobaciones, navegador y diff check. No se actualizó el runtime habitual ni se llamó al modelo. Los límites de QA visual y de captura best-effort quedan explícitos en el acta.

## 02/10/2026 · Auditoría de PR #45 y refinamiento del panel

Añadida [auditoría del commit 56b1f25](audits/2026-10-02-core-dashboard-review.md), con hallazgos de nombres cualificados EVE, frescura/periodos meteorológicos, uso desconocido, truncamiento y refresco del feed. Incluye revisión de jerarquía visual y propuestas de métricas derivadas de almacenamiento existente. Check correcto (460 tests, 89 omitidos; typecheck/builds con caché), suite afectada SQL/unitaria 70/70 y smoke aislado 20/20. Ocho reproducciones adicionales: seis fallos confirmados y dos controles correctos, archivados fuera de CI. Captura nueva del Resumen en claro; sin modificación del producto, instalación habitual, inferencia ni adquisición de proveedores. El acta anterior se conserva sin reescribir.

Build local del agente correcto; entorno temporal cerrado y esquema desechable eliminado. Verificados `git diff --check` y 193 enlaces/anclas de las cinco páginas revisadas, sin fallos. Sin commit, push ni publicación de review remota.

## 02/10/2026 · Spec-audit de refinamiento completo del dashboard

Ampliada la [auditoría de PR #45](audits/2026-10-02-core-dashboard-review.md#spec-de-refinamiento-para-el-agente) con el encargo vigente para completar las seis vistas: datos que cambian como recorrido inicial, Catálogos de referencia separados y lenguaje orientado a una persona no técnica. Definidas trece métricas, cuatro tipos de gráfico, lectores/contratos pendientes, estados temporales, límites, actualización y catorce escenarios de aceptación, además del recorrido de claridad y la QA visual. Incluye instrucciones breves para el agente, sin sustituir los límites de seguridad/arquitectura del spec original ni reescribir los resultados de las pruebas anteriores.

Archivadas sin modificar las cuatro imágenes aportadas, claramente separadas de la evidencia real del producto. Leídas las skills better-ui y emil-design-eng ya instaladas; consultados sus repositorios primarios, sin reinstalación ni dependencia nueva en la aplicación. Actualizados roadmap, índices, recursos y cabecera del spec original para señalar el refinamiento pendiente dentro de la misma PR.

Revisión solo documental: no se modificó código de aplicación, CI, base de datos o servicios; no se ejecutaron nuevas pruebas funcionales, builds, inferencias ni adquisiciones de proveedores. Sin commit, push, comunicación a otro chat, merge o instalación habitual.

Validación documental: 75 Markdown, 1.155 enlaces locales y 313 anclas comprobados sin errores; `git diff --check` correcto. Verificada la secuencia completa V1–V6, M1–M13, G1–G4 y A1–A14, tablas/bloques Markdown y conservación byte a byte de las cuatro imágenes originales. Esta comprobación no es QA de una interfaz implementada.

## [2026-10-03] implementación | Refinamiento del panel Core

- Aplicado el spec-audit de PR #45: seis vistas, M1–M13/G1–G4, captura cualificada, frescura por producto, selección SQL y resultados legibles, sin rediseñar EVE.
- [Acta con HEAD, pruebas y capturas](acceptance/2026-10-03-core-dashboard-refinement.md): 476 tests generales, 40 pruebas de suite aislada, 31 comprobaciones HTTP y 24 combinaciones de vista/tamaño. Los estados no verificados se enumeran, sin atribuirlos como aprobados.
- Servicios habituales y despliegues sin modificar.

## [2026-10-03] revisión | Segunda auditoría del dashboard con agent-browser

- Registrados nueve hallazgos nuevos y sus correcciones: contraste claro, landmarks, tabla por teclado, metadatos de navegación, enlaces multilínea, controles de mapa, lenguaje, cámara de retorno y códigos/horarios de medidas.
- Versionado un arnés opt-in agent-browser 0.38.2, con sesión propia y Better Auth real en el runtime desechable. No incorpora una dependencia al proyecto ni se conecta al navegador del usuario.
- Verificadas 72 pantallas/formularios: seis vistas × cuatro tamaños × dos temas, 16 formularios y ocho detalles/interacciones; cero incidencias axe detectadas, con 18 resultados indeterminados conservados. Añadidas fichas de fuente/evento y comprobación de 12 tabulaciones retenidas por el diálogo.
- Comprobados retorno con cámara, consulta guardada sin confirmación de ejecución, duración de turno, teclado, pausa/offline y aislamiento secuencial de dos evaluadores. No se declara carrera concurrente completa ni aceptación visual exhaustiva.
- `pnpm check`: 479 pruebas aprobadas / 94 opt-in omitidas; suite dashboard separada: 40 pruebas / 9 archivos; build del agente y 31 comprobaciones HTTP locales correctos. La [segunda acta](acceptance/2026-10-03-core-dashboard-second-audit.md) identifica HEAD, evidencia y límites.
- 69 páginas Markdown, 1.197 enlaces locales y 315 anclas comprobados sin errores; diff correcto. QA cerrada, esquema propio ausente y 3002/3003 libres. Sin merge, cloud, inferencia, adquisiciones nuevas ni modificación de servicios habituales.


## [2026-10-03] revisión | Contraste independiente de PR #45

- Añadidos al [spec-audit canónico](audits/2026-10-02-core-dashboard-review.md#contraste-independiente-del-03102026) cinco pendientes P2, con criterios de corrección y evidencia: mapa DGT, cero de avisos con fuentes deshabilitadas, categoría de plazas, rango temporal de Eventos y ausencia de consultas EMT.
- Repetidos `pnpm check` (479 aprobadas / 94 omitidas), suite SQL/unitaria dashboard (40 aprobadas) y smoke HTTP (31 comprobaciones). CI verde en `dafd69a`; builds locales de check recuperados de caché.
- Tres reproducciones PostgreSQL nuevas fallan y quedan archivadas fuera de la suite. Esquemas desechables eliminados y puertos QA libres. R3/R4 contrastados con código y capturas anteriores; matriz de 72 pantallas no repetida.
- Solo documentación y evidencia, sin corregir código, integrar, instalar ni modificar servicios habituales.
