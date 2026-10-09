# Registro de revisiones documentales

[Índice](index.md) · [Reglas de mantenimiento](AGENTS.md) · [Evolución del producto](evolution.md)

Registro aditivo de revisiones de esta wiki. La evolución anterior se sintetiza en su página propia; no se inventan entradas retrospectivas.

## [2026-10-08] implementación | Cuentas, roles y consumo LLM multiproveedor

- [Guía vigente](accounts-and-llm.md): migración 0022, bootstrap local explícito, administrador/evaluador, TOTP por sesión, correo cifrado Resend, catálogo administrado, credenciales de solo escritura, patrocinios y ledger transaccional. Actualizadas las guías canónicas, README, fronteras y adaptaciones upstream sin sustituir el chat oficial.
- Core custodia secretos y transporte externo; EVE fija modelo/protocolo/versión de credencial/pagador/política por turno. Cubiertos el orden variable de registro de la primera sesión, las continuaciones que omiten `onMessage`, el cambio a contexto menor y la recuperación en React Strict Mode. Uso final ausente conserva reservas; la telemetría no factura ni reintenta.
- `pnpm check` aprobado: **609 pruebas**, **124 opt-in omitidas**, tipos y builds correctos; lint conserva 47 advertencias, sin errores. `pnpm build:agent` aprobado. `pnpm test:control:db`: **24 pruebas** con todas las migraciones en un contenedor desechable, Better Auth real, Resend y proveedores JSON/SSE ficticios. Corregida la sonda de disponibilidad para esperar al servidor TCP final, no al servidor temporal de inicialización de Postgres.
- Smoke autenticado de dashboard: **37 comprobaciones HTTP** sobre un esquema sintético del contenedor desechable; sin adquisición ni modelo. La suite de cuentas se incorpora a CI; eso no equivale a afirmar que ya se ejecutó en GitHub.
- La comprobación de dependencias detectó advisories en Undici 7.28.0. Core fija 7.29.1 y un override acotado corrige también la resolución del sandbox existente. `pnpm audit --audit-level=moderate` termina sin vulnerabilidades conocidas; no es una garantía universal.
- Revisados enlaces locales y anclas de las páginas modificadas; renderizados siete diagramas Mermaid e inspeccionados los tres modificados. No se han probado visualmente los paneles nuevos con login en navegador ni se certifica compatibilidad real de todos los modelos.
- Conservados los borradores y ediciones locales anteriores. No se aplica 0022 a la instalación habitual, no se migran claves reales, no se envía correo, no se hacen inferencias reales ni se activa OCI/DNS/cloud. Esos pasos siguen separados y requieren autorización.

## [2026-10-07] revisión | Capturas y montaje de la interfaz unificada

- Renovadas las cuatro imágenes de la [galería](demo.md): conversación, herramientas desplegadas, resumen y mapa BiciMAD, con la interfaz de PR #58. Capturas nativas, sin ampliar las imágenes ni reconstruir componentes o datos.
- Actualizadas las fechas del README y la galería; el ejemplo conserva la conversación del 6 de octubre y las vistas del panel muestran sus horas de observación del 7 de octubre. Conservadas cobertura, calidad y atribución cartográfica.
- Publicado el vídeo actualizado de 56 segundos, con el mismo guion, indicaciones, música y cierre. Corregidos los bordes de los encuadres y la inicialización del primer fotograma; nueva pieza nativa de GitHub enlazada desde el README y la galería.
- `pnpm check` aprobado: 545 pruebas y 100 opt-in omitidas, tipos y builds con caché. Auditoría moderada sin vulnerabilidades; 166 enlaces locales y 28 anclas de las cuatro páginas revisadas correctos. HyperFrames 0.8.140: sin errores ni advertencias en el montaje y 44 contrastes correctos. Exportación 1920 × 1080 a 60 fps, decodificación completa y revisión visual del archivo final correctas.
- Sin cambios de aplicación, inferencias nuevas, bypass de sesión, migraciones o despliegues. Adquisición local normal y acotada para las tomas; worker detenido. Borradores previos conservados y excluidos.

## [2026-10-07] preparación | Interfaz unificada para v0.1.1

- Preparadas notas formales y CHANGELOG para el issue #57: tema raíz, fuentes locales, componentes, navegación móvil y adaptaciones cosméticas del chat oficial.
- Documentados actualización sin migraciones, autenticación/contratos sin cambios y rollback de código. Licencias de fuentes y notas upstream conservadas.
- `pnpm check` aprobado: 545 pruebas, 100 opt-in omitidas y build de producción; auditoría moderada y cloud deshabilitado comprobados. Zoom nativo real al 200 % y nuevos estados de inferencia/proveedor quedan sin verificar.
- La preparación no publica tag/release ni habilita despliegues. Borradores locales y artefactos privados excluidos de los commits.

## [2026-10-07] revisión | Política de auditoría alineada con CI

- SECURITY refleja el umbral moderado de dependencias y el escaneo fijado/redactado de historial de CI.
- Conservada la edición local previa de SECURITY fuera del commit. Revisión documental, sin cambio de runtime.

## [2026-10-07] cierre | OpenSSF Passing y v0.1.0

- Publicada la release v0.1.0, con notas formales, tag sobre SHA validado y alcance de evaluación local.
- Confirmado Passing al 100 % en la ficha 15273 de OpenSSF; añadido badge dinámico centrado al README.
- PR #54 y CI de main aprobados; Quality gates y PR policy obligatorios. Conservados borradores locales fuera de los commits.
- Sugerencias no satisfechas y límites del escaneo permanecen explícitos en el acta; sin nuevos servicios locales ni despliegue cloud.

## [2026-10-07] mantenimiento | Issues, PR y entregas versionadas

- Cada PR debe asociarse a un issue real y decidir si requiere release, con motivo, versión y notas cuando corresponda.
- Alineados CONTRIBUTING, plantillas y procedimiento de releases; añadida plantilla formal y preparación de v0.1.0 con alcance de evaluación local.
- CI incorpora escaneo de secretos del historial con Gitleaks fijado/checksum y auditoría de dependencias desde gravedad moderada. La única exclusión corresponde a un falso positivo documental revisado.
- OpenSSF: ficha 15273 con cuenta independiente y declaraciones del mantenedor; evidencia y pendientes conservados en el acta. No se habilita cloud ni se concede acceso a organizaciones.
- Se ejecutan pruebas unitarias del control de PR y `pnpm check`; la release espera los controles del SHA final en main. Sin nuevos servicios locales, inferencias ni benchmarks.


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


## [2026-10-03] revisión | Correcciones del contraste independiente del panel

- Conservados los cinco hallazgos y las tres reproducciones fallidas originales; añadida la [acta posterior de R1–R5](acceptance/2026-10-03-core-dashboard-independent-fixes.md) sin reescribir las pruebas anteriores.
- Actualizados spec-audit, índices y roadmap: correcciones verificadas, misma PR abierta y sin instalar sobre el servicio habitual.
- Registradas 481 pruebas generales, 47 SQL/unitarias, 36 comprobaciones HTTP y 20 inspecciones nuevas de agent-browser. Las 72 pantallas anteriores conservan su carácter histórico; se explicitan cinco resultados axe indeterminados y los límites no probados.
- Evidencia únicamente sintética; sin adquisiciones, inferencia, herramientas ni cambios en proveedores, autenticación o EVE oficial.

- La CI posterior falló en auditoría de dependencias por GHSA-vfj7-8cjw-p6xm (`braces` transitivo de Vercel, sin versión corregida). Reproducción local confirmada e investigación del árbol documentadas; aceptación global abierta. Sin excepciones de seguridad ni cambios del lockfile.


## [2026-10-03] revisión | Verificación de las correcciones R1–R5

- Contrastadas las cinco correcciones en `d39a74f` y repetidas 481 pruebas generales, 47 SQL/unitarias y 36 comprobaciones HTTP, todas correctas. Builds de check recuperados de caché; no se repitió agent-browser.
- Reproducido el bloqueo de auditoría por braces, sin excepción ni rebaja del control. [Resultado y alternativas de resolución](acceptance/2026-10-03-core-dashboard-independent-fixes.md#revisión-independiente-posterior). La decisión sobre retirada temporal de CLI cloud o actualización interna validada está pendiente.
- Sin cambios de aplicación, dependencias, servicios habituales, publicación ni merge.


## [2026-10-03] feat | Rediseño de las seis vistas del panel

- T00–T09 implementados en PR #45: jerarquía, tokens locales, shell, estados veraces, mapa/lista, inspector de herramientas y conversaciones; sin alterar EVE oficial, contratos ni adquisición.
- [Acta y evidencia sintética](acceptance/2026-10-03-core-dashboard-redesign.md): 491 tests generales, 26 SQL, 36 HTTP, 17 adaptadores/componentes, 35 comprobaciones de navegador y 72 capturas. T11 automatizado validado; lector de pantalla real y zoom nativo pendientes.
- Fallo original de Sources no reproducido; corregido el defecto demostrado de renderizar fallo como vacío. T10 y remediación de Vercel diferidos; sin merge, despliegue ni declaración de aceptación global.


## [2026-10-03] feat | Continuación del refinamiento V2 del panel

- Sistema visual aplicado a las seis vistas en `92d0d7d`: KPI con alcance y medidor solo si reconcilia, tablas de evidencia/fuentes/turnos, codificación de frescura única en barras, franja y mapa, control de retención único y modo de consulta visible. Sin cambios de contratos, lectores, dependencias ni chat oficial.
- `pnpm check` correcto (508 tests, 99 omitidos); formato de 98 JSON de evidencia V2 con contenido idéntico. Capturas 1440×1000 oscuro/claro de las seis vistas. [Acta y límites](acceptance/2026-10-03-core-dashboard-refinement-v2-continuation.md): zoom 200 %, lector de pantalla, matriz móvil, fallo Sources habitual y braces siguen abiertos; sin merge ni despliegue.


## [2026-10-03] feat | Selector de tema y cabecera mínima del panel

- Selector claro/oscuro/sistema (`@ncdai/theme-switcher`, `next-themes` 0.4.6) limitado al panel mediante `data-dashboard-theme`, con transición circle-blur solo en rutas del panel. El chat EVE oficial no cambia.
- Eliminados los acentos laterales de selección y alertas; cabecera sin borde con lectura, pausa, refresco, tiempos y tema plegables, y estados anómalos siempre visibles en la píldora.
- `pnpm check` correcto; capturas oscuro/claro forzado, detalle de conversación y móvil 390 px. [Acta y límites](acceptance/2026-10-03-core-dashboard-theme-header.md); sin merge ni despliegue.


## [2026-10-03] fix | Tercera auditoría del panel

- Filas de Mobility con hora observada/emitida o "No observation time"; marcadores del mapa recalculados al cambiar de tema y leyenda con muestras; atribución legible en oscuro; textos de inspección unificados y etiqueta duplicada de Activity retirada.
- Títulos de página con `text-effect` de motion-primitives, estado final fijo con movimiento reducido y sin dependencias nuevas. Guardia QA: solo la consulta de versión de `next dev` se responde localmente en modo `--dev`.
- `pnpm check` correcto (508 pruebas, 99 omitidas) y smoke aislado con 36 comprobaciones. [Acta y límites](acceptance/2026-10-03-core-dashboard-third-audit.md); sin merge ni despliegue.

## [2026-10-03] corrección | Preparación de merge de PR #45

- Conservados en commits los cambios locales de la revisión R1–R5 y las instrucciones de desarrollo generadas por Next, sin descartarlos.
- Reproducido el fallo de Sources con datos locales en modo read-only: el saneador omitía `routes[0].activatedAt` y el contrato lo exigía. Añadido el campo público a la lista permitida y regresiones con release preparada/activa; no se expone el manifiesto ni se modifica la base habitual.
- Retirada la CLI Vercel y su árbol vulnerable; configurador cloud cerrado antes de leer/escribir secretos. `pnpm audit --audit-level=high` conserva alcance completo y devuelve cero vulnerabilidades conocidas. Sin exclusiones de advisories, ejecución global alternativa, merge ni despliegue.
- Corregidos nombres repetidos de regiones de tablas detectados por axe; el arnés espera el cierre asíncrono antes de verificar foco. Revalidación: 510 pruebas generales, 48 SQL/unitarias, 37 HTTP y 35 aserciones de navegador; builds y auditoría de dependencias correctos. [Acta previa al merge](acceptance/2026-10-03-core-dashboard-merge-readiness.md), con límites manuales y CI remota separados.

## [2026-10-03] alcance | Retirada de prueba con lector de pantalla

- Por decisión explícita del usuario, se retira la prueba con lector de pantalla real del alcance y de los requisitos de merge de PR #45. No se registra como aprobada. Se mantienen la revisión móvil y el zoom nativo. Actualizados el roadmap y el acta vigente; las actas anteriores conservan sus resultados históricos.

## [2026-10-03] corrección | Cabecera y conversaciones en móvil

- Corregidos el recorte del selector de tema a 320 px, el desbordamiento de pestañas de conversación y el salto de nivel de encabezados de eventos. Añadido un recorrido reproducible que comprueba los botones visibles, no solo la anchura del documento.
- Repetidas 72 vistas y 52 estados móviles sobre el build corregido, con ocho capturas seleccionadas. `pnpm check`: 510 pruebas correctas/100 omitidas; HTTP aislado: 37 comprobaciones correctas. [Acta móvil](acceptance/2026-10-03-core-dashboard-mobile-closure.md). Zoom nativo pendiente de paso manual; sin merge.

## [2026-10-04] verificación | Zoom nativo del panel

- Recorridas las seis vistas al 200 % aplicado por el usuario, más mapa y cinco pestañas de conversación: doce mediciones sin desbordamiento horizontal. Comprobados cabecera, navegación, entrada de formulario y filtros; tres capturas seleccionadas y medidas versionadas en el [acta móvil](acceptance/2026-10-03-core-dashboard-mobile-closure.md).
- HTTP aislado: 37 comprobaciones correctas. No se modificó código de aplicación ni se ejecutaron modelos o herramientas desde el inspector. Cierre de zoom documentado; merge sujeto a CI final.

## [2026-10-04] mantenimiento | Estado posterior al merge

- PR #45 integrada en main, commit e805ca1; CI posterior al merge correcta. Índice y roadmap actualizados: una entrada vigente del panel sustituye los relatos redundantes de refinamiento; se conservan actas y capturas históricas.
- Eliminada la rama local del panel ya integrada; GitHub ya había eliminado la remota y se podaron sus referencias. Conservadas ramas con PR abiertas o sin integración demostrada. Detenido el preview QA antes de eliminar tmp; retirada la caché regenerable .turbo. Conservados builds, dependencias, configuración privada y datos.
- Arranque habitual documentado con pnpm infra:up, pnpm otp:up y pnpm start:local. La actualización del runtime habitual sigue siendo independiente del merge.

## [2026-10-04] operación | Reconstrucción habitual del panel

- Confirmados checksums de las 21 migraciones, incluida 0021, y token válido con permisos del panel; no se modificaron esquema ni credenciales. Detenido únicamente el supervisor identificado; PostgreSQL y OTP conservados.
- Respaldo privado en data/backups/dashboard-install-20261004-164039: dump legible, archivo de configuración/EVE y checksums verificados. Configuración sin cambios y 10.128 archivos persistentes de workflow idénticos tras el build; excluidos metadatos AppleDouble generados por tar.
- Instalación frozen-lockfile, pnpm check (510 correctas/100 omitidas), build del agente y auditoría sin vulnerabilidades conocidos correctos. Arranque sin worker en 3000/3001/4274 y smoke productivo correcto, sin modelo. Inspección autenticada pendiente de login; todavía no se declara cierre.

## [2026-10-05] identidad | mobai

- Adoptado **mobai** en README, portadas documentales, login, bienvenida/cabecera nativa EVE, sidebar y metadatos/favicon. La cabecera del panel conserva solo el control de navegación, sin duplicar la marca.
- SVG locales monocromáticos y transparentes en `apps/eve-web/public/brand/`, con paths/fills originales y viewport ajustado. `MobaiBrand`: 48px en login, 64px en bienvenida, 28px en navegación; tema del sistema en EVE y selección explícita en el panel. Geometría protegida por SHA-256, sin depender de archivos sueltos de la raíz.
- Restauradas transiciones de ancho/alto/padding de botones del panel; marca sin cambios bruscos de display/padding, sin overflow ni encogimiento del contenedor durante la transición. EVE, identidad y selector ES/EN de PR #46 preservados; adaptaciones en `apps/eve-web/vendor/eve/README.md`.
- Validación final: instalación frozen-lockfile y `pnpm check` correctos (528 pruebas aprobadas, 100 omitidas, builds correctos); diff sin errores ni conflictos. Login comprobado a 390×844 sin desbordamiento; chat/panel autenticados, oscuro y fluidez final de cierre pendientes de confirmación visual. Auditoría de navegador ES/EN no ejecutada por falta de `AGENT_BROWSER_BIN`. Sin llamadas al modelo, migraciones ni cambios de datos.

## 05/10/2026 · Especificación de arquitectura para 20–30 usuarios

- Añadido [spec de escalabilidad](plans/2026-10-05-scalable-architecture.md), contrastado con `105df99`: monolito modular conservado, Vercel Pro para Web/EVE, backend persistente en VM AWS, PostgreSQL/PostGIS gestionado y objetos privados. Destino propuesto, no implementado ni contratado.
- Definidos acceso para 30 cuentas, admisión interactiva compartida, presupuesto SQL/almacenamiento, proyecciones del panel, interfaces de infraestructura, continuidad de sesiones, mantenimiento de releases y migración reversible.
- Incorporados hallazgos de revisión cruzada: retención Workflow Hobby/Pro distinta del ownership; campañas no limitan el modo interactivo; fencing SQL no cerca automáticamente streams EVE; GC coordinado con publicaciones y backups; mantenimiento de todos los consumidores de catálogos.
- Enlazado desde índices, roadmap y preparación cloud; registradas fuentes primarias actuales. No se reabren R2 ni exclusiones funcionales. Instaladas las dos skills solicitadas en el directorio personal, sin dependencias nuevas del repositorio.
- Verificados enlaces locales/anclas de los documentos modificados y `git diff --check`. Sin diagramas nuevos. No se ejecutaron `pnpm check`, builds, migraciones, carga, llamadas al modelo/proveedores, benchmarks OTP ni operaciones cloud; las verificaciones de implementación quedan en el spec. Sin commit, push o PR.

## [2026-10-05] investigación | Presupuesto inicial de cero dólares

- Comparados planes gratuitos oficiales de doce servicios/productos, separando franquicias recurrentes, trial y restricciones de persistencia.
- Retirado el destino inicial pagado del spec; [candidato gratuito condicionado](research/2026-10-05-zero-cost-hosting.md): Oracle Always Free y Neon Free, con comprobaciones de ARM, World, memoria, almacenamiento y cuenta pendientes.
- Actualizados alcance, preparación cloud e índices. Sin cuentas, provisión, pagos, inferencias ni pruebas de carga.

## [2026-10-06] corrección | Preparación del código para publicación

- Añadida licencia MIT para el código propio y enlaces a licencias/avisos de EVE, Community Agent y shadcn. Las condiciones de datos y cartografía permanecen separadas.
- Actualizada seguridad: 16 herramientas MCP, servicios internos del panel, scopes de bootstrap, cookie de idioma, telemetría y CLI Vercel retirada. Separados los controles de publicación del repositorio y de apertura del servicio.
- Corregidas las referencias vigentes a migraciones, nombre mobai, selector de tema, controles ES/EN y errores de login. Conservadas las actas y sus resultados históricos, así como los borradores locales de arquitectura y alojamiento.
- Fijadas versiones corregidas de source-map-js (1.2.2) y KaTeX (0.18.2), sin excluir avisos. Añadidas tres regresiones offline de fórmulas Streamdown, rechazo de enlaces por defecto y opciones de confianza heredadas.
- `pnpm check` correcto: 531 pruebas pasadas y 100 omitidas, tipos y builds Web/Core; permanecen advertencias no bloqueantes de lint. Instalación con lockfile congelado, auditorías completa y de producción con umbral `low`, comprobación cloud y `git diff --check` correctos. Verificados 1.455 enlaces locales y sus anclas, sin destinos ausentes. No se modificaron diagramas.
- La revisión inicial se realizó en local, sin commits ni publicación de código. No se ejecutaron pruebas autenticadas, inferencias, adquisiciones de proveedores, migraciones ni despliegues.

## [2026-10-06] documentación | Demo y pantallas del producto

- Incorporado al README el vídeo aprobado de 56 segundos, 1080p y 60 fps mediante un adjunto nativo de GitHub. El MP4, las tomas y el proyecto de edición permanecen fuera del historial Git.
- Añadidas cuatro capturas de la aplicación: conversación Atocha–Chamartín, parámetros de la herramienta de rutas, resumen del panel y mapa/lista BiciMAD con bicicletas y anclajes. Las imágenes mantienen los datos, las horas y las atribuciones visibles; el correo de la cuenta no aparece.
- Añadida [galería comentada](demo.md), enlazada desde el README y los índices; registradas las [referencias oficiales para adjuntos](resources/index.md#vídeo-y-capturas--06102026). README con dos capturas destacadas y originales ampliables en la galería.
- Verificado el renderizado del README con la API Markdown de GitHub: enlace del adjunto convertido en elemento de vídeo con controles. Revisadas visualmente las cuatro capturas y siete fotogramas del vídeo; decodificación completa del MP4 con FFmpeg sin errores. Comprobación HyperFrames previa al render correcta.
- `pnpm check` con Node 24.21.0 correcto: lint, fronteras, tipos, 531 pruebas pasadas y 100 omitidas; builds Web/Core correctos con caché reutilizada. Comprobados 286 enlaces locales y anclas de las páginas editadas; `git diff --check` correcto. Sin diagramas nuevos.
- Cambios agrupados en [PR #49](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/49), sin merge. Borradores locales de arquitectura y alojamiento excluidos; sin cambios del código de la aplicación, nuevas inferencias, migraciones, despliegues ni cambios de visibilidad del repositorio en esta integración documental.

## [2026-10-06] corrección | Parche de sharp detectado en CI de la demo

- La auditoría de dependencias de [CI de PR #49](https://github.com/alanslzrr/digital-twin-conversational-mobility/actions/runs/37490835966) detectó `GHSA-wq5f-xc86-pv6w`, publicado en GitHub Advisory Database el 06/10/2026: vulnerabilidad de librsvg en `sharp <0.35.5`, transitiva de Next.js.
- Aplicado override acotado de `sharp@0.35.4` a `0.35.5` y regenerado el lockfile con los binarios correspondientes. No se omiten avisos ni se relaja la auditoría.
- Instalación con lockfile congelado, auditorías completa y de producción con umbral `low` sin vulnerabilidades conocidas, y `pnpm check` correctos: 531 pruebas pasadas, 100 omitidas y builds Web/Core reconstruidos sin caché. Comprobada la carga de sharp 0.35.5 con librsvg 2.63.2 y conversión en memoria del SVG de marca a PNG de 534 × 534. Sin cambios de la interfaz ni despliegue.

## [2026-10-08] configuración | Activación de cuentas y LLM en la instalación local

- Aplicada 0022 a PostgreSQL local tras dump privado con índice verificado. Promovida la cuenta existente de Alan a administrador, conservando UUID, contraseña e historial. TOTP queda pendiente de vinculación por el usuario a su autenticador.
- Inicializado SecretStore con archivo maestro privado fuera del repositorio. Importada y verificada por descifrado la key de prueba existente; retiradas sus copias en texto plano de los entornos raíz y Web, sin rotación externa. Preferencia personal OpenAI Responses / `gpt-6-luna`, ventana operativa 32.768 y salida máxima 2.048. Sin patrocinios ni tarifas supuestas: el coste se mostrará desconocido si el proveedor no lo comunica. Capacidades contrastadas con [la ficha oficial](https://developers.openai.com/api/docs/models/gpt-6-luna).
- Activado LLM únicamente en Core local y renovado el JWT interno. Resend permanece desactivado; OCI no se ha configurado. La consulta autenticada del modelo con la key importada devuelve HTTP 200; no genera contenido ni certifica el flujo conversacional completo.
- Puerto Web 3010 para no interrumpir otro proyecto activo en 3000. Supervisor y smokes utilizan el origen configurado. Arrancados PostgreSQL, Redis, OTP con su grafo existente, Core, Web, EVE y worker local. No se ejecutan benchmarks ni reconstrucción del grafo.
- `pnpm build`, `pnpm build:agent`, `pnpm smoke --production` y `pnpm smoke:evaluation` correctos. Login real con cuentas efímeras, aislamiento, CSRF, historial, cuotas, revocación y logout comprobados; las cuentas efímeras se eliminan. Biome de los cuatro scripts, sintaxis, fronteras, cloud deshabilitado y diff comprobados. La página de acceso se abre en navegador; la revisión autenticada de Alan y el mensaje LLM esperan su login.

## [2026-10-08] corrección | Primera inferencia autenticada con cuentas multiproveedor

- Alan completó TOTP en su autenticador. Verificados la cuenta autenticada, el acceso a Administración y el selector con financiación propia.
- Corregida la selección dinámica de EVE 0.65.0: referencia serializable por turno y cliente SDK efímero por paso, siempre desde la vinculación fijada. Admitido el identificador de seguridad pseudónimo que añade EVE a Responses, sin permitir metadatos arbitrarios.
- Corregido un bloqueo del proxy SSE: una lectura que solo contiene una parte del evento debe continuar leyendo hasta emitir datos o alcanzar EOF. La integración ahora fragmenta los eventos byte a byte para ambos protocolos.
- Prueba real desde el chat oficial: «Conexión correcta», 3.990 tokens de entrada y 8 de salida, intento liquidado en 2.480 ms. Sin herramientas en ese turno. El intento anterior interrumpido se conserva como incierto, sin atribuirle consumo cero ni inventar coste.
- Reiniciado el supervisor local como proceso independiente para no depender de la vida de la llamada de ejecución. Core, Web y EVE mantienen autenticación; no se alteran roles ni MFA para las pruebas. No se activa Resend ni OCI.
- 43 pruebas focalizadas y 24 de integración PostgreSQL desechable correctas, incluyendo SSE fragmentado; el smoke productivo también pasa. La prueba real cubre Responses y el primer turno, no certifica todos los proveedores ni la compactación manual.

- Extendida la adaptación fijada de EVE para rehidratar el cliente Core antes de compactación manual, sin resolución externa implícita por Gateway. El propósito de compactación reutiliza el turno de la vinculación, aunque EVE emita otro identificador de evento. Añadidas regresiones de ambos casos.

- Verificada finalmente la compactación manual real tras el ajuste: 325 tokens de entrada, 201 de salida (incluyen 132 de razonamiento), intento liquidado con la credencial y el turno originales. El selector vuelve a estar disponible al finalizar. `pnpm check` final: 612 pruebas pasadas, 124 opt-in omitidas, tipos y builds correctos; agente recompilado.
- Continuación tras compactar verificada en la misma conversación: «Continuidad correcta», 4.270 tokens de entrada y 19 de salida, otro intento liquidado. Lockfile congelado instalado offline sin cambios.
