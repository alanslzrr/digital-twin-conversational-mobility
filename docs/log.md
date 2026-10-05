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

- Adoptado el nombre **mobai** en la presentación del repositorio, portadas documentales, acceso, bienvenida y cabecera del chat, sidebar/cabecera del panel y metadatos/favicon.
- Integrados los dos SVG del usuario, monocromáticos y transparentes. Los originales se conservan en la raíz; los assets locales de `apps/eve-web/public/brand/` solo ajustan el viewport para eliminar el margen excesivo.
- El componente `MobaiBrand` usa 48px en acceso, 64px en bienvenida y 28px en navegación. Sigue el tema del sistema en EVE y el selector explícito en el panel; no añade fondos ni cambia trazados o colores.
- Conservados EVE oficial, controles, autenticación y alcance de evaluación. Adaptación registrada en `apps/eve-web/vendor/eve/README.md`.
- Validación: `pnpm check` aprobado (514 pruebas, 100 omitidas, build correcto); `git diff --check` sin errores. Login del build comprobado en navegador, símbolo de 48px cargado y viewport efectivo de 390×844 sin desbordamiento. Sin revisión visual autenticada del chat/panel ni comprobación visual del modo oscuro; estos estados se revisaron en código. La instancia temporal se detuvo; no hubo llamadas al modelo, altas ni cambios de datos.

- Ajuste visual posterior: la identidad del panel queda exclusivamente en la sidebar; retirada la repetición de logo/nombre en la cabecera, conservando su control de navegación.
- Fluidez de la sidebar: restauradas las transiciones de ancho/alto/padding de botones que el CSS del panel sobrescribía; marca recortada sin cambio brusco de display/padding y contenedor sin encogimiento ni overflow durante la transición. Build Web aprobado; comprobación visual autenticada de cierre/apertura pendiente.

## [2026-10-05] sincronización | PR #46 y marca local

- Confirmado squash merge de PR #46 en `eba66c5`; `main` actualizado por fast-forward y rama de trabajo `alanslzrr/mobai-branding` basada en ese mismo commit.
- Reaplicados los cambios locales de marca con resolución de cinco conflictos; conservados selector ES/EN, proveedor global, traducciones y controles de acceso. Respaldo previo conservado en stash.
- Eliminadas `alanslzrr/ui-i18n` (árbol idéntico al squash) y `alanslzrr/post-merge-housekeeping` (documentación incorporada en main, con adiciones de i18n). Remota ui-i18n ya eliminada en GitHub; referencias podadas.
- Tests de marca independientes de los SVG sueltos de la raíz, que ya no estaban presentes: geometría fijada con SHA-256 y assets locales versionables.
- Instalación frozen-lockfile y `pnpm check` correctos: 528 pruebas aprobadas, 100 omitidas y builds correctos. Sin archivos sin resolver ni marcadores de conflicto; `git diff --check` limpio. Auditoría de navegador ES/EN no ejecutada: falta `AGENT_BROWSER_BIN`. Sin llamadas al modelo, migraciones ni cambios de datos.
