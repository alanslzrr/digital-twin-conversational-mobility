# R1 — Contexto meteorológico del itinerario: instrucciones para el agente

[Índice de la wiki](../index.md) · [Archivo de plans](index.md) · [Estado vigente](../roadmap.md)

> **Plan histórico.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Fecha: **28/09/2026**. **Alcance acordado; implementación pendiente.**

## Índice interno

- [Encargo y lectura obligatoria](#encargo-y-lectura-obligatoria)
- [Resultado esperado](#resultado-esperado)
- [Implementación, en este orden](#implementación-en-este-orden)
- [Pruebas necesarias y suficientes](#pruebas-necesarias-y-suficientes)
- [Entrega completa](#entrega-completa)
- [Referencias de código para empezar](#referencias-de-código-para-empezar)


## Encargo y lectura obligatoria

Implementa y entrega localmente este bloque, sin ampliar su alcance. Usa como base la [investigación y propuesta del 28/09/2026](../research/2026-09-28-journey-weather.md), que contiene fuentes oficiales, comprobaciones públicas, arquitectura propuesta y límites de lo que todavía no se verificó. No repitas esa investigación completa ni presentes sus pruebas públicas como validación del JSON autenticado.

Lee también `AGENTS.md`, el [roadmap vigente](../roadmap.md) y la [operación local](../local-runtime.md). R0, E2, E8 y R2.1 permanecen cerrados. Este documento prevalece para el alcance de esta entrega; el documento de investigación fundamenta las decisiones, no añade requisitos nuevos.

**Situación de partida al redactar:** base `main` en `5b896d5`; documentos locales todavía sin commit en `alanslzrr/journey-weather-research`. Comprueba el estado real antes de trabajar y conserva estos documentos. Puedes continuar en esa rama; no descartes archivos no rastreados ni abras otro checkout que pierda el plan y la investigación.

## Resultado esperado

Cuando el usuario solicita un desplazamiento, `plan_journey` devuelve sus rutas y contexto meteorológico pertinente, calculado a partir del origen, destino, horarios y tramos conocidos. **Cada consulta evalúa datos compartidos; no obliga a descargar de AEMET.**

Si se cambia la hora, reutiliza el documento meteorológico guardado cuando cubra el nuevo periodo. Si se ofrecen varias alternativas, reúne y deduplica sus necesidades antes de consultar la caché. No asumas que el usuario ya eligió una de ellas.

### Dentro del bloque

- Predicción **horaria municipal** AEMET para municipios demandados dentro de la cobertura de la Comunidad de Madrid.
- Avisos oficiales **CAP de Madrid**, obtenidos a través del índice público provincial y su estado completo.
- Caché persistente compartida, control de concurrencia, actualización durante actividad y degradación explícita.
- `weatherContext` compacto en la respuesta de `plan_journey`, con evidencias compartidas y referencia desde las alternativas; `get_environment` reutiliza el mismo servicio para preguntas explícitas, conservando compatibilidad con las observaciones existentes.
- Instrucciones de EVE para usar ese contexto sin añadir una consulta meteorológica obligatoria por ruta.

### Fuera del bloque

No implementar observación multiestación, predicción diaria, radar, seguimiento persistente de viajes, notificaciones, mensajes automáticos, nuevas pantallas, nuevas tools por producto ni infraestructura adicional. Multiestación y diaria siguen pendientes en el roadmap para entregas posteriores. No cambiar modelo, E2, Better Auth, retención de conversaciones, algoritmos/preferencias de routing ni el grafo OTP. No deducir interrupciones de transporte desde un aviso meteorológico.

## Implementación, en este orden

### 1. Cerrar únicamente los datos técnicos aún no comprobados

- Consultar de forma acotada el endpoint OpenData horario de un municipio usando la credencial ya configurada en Core, sin imprimirla, incluirla en URLs/logs ni pedir que se pegue en el chat. Verificar contrato, metadatos, unidades, periodos y zona horaria del producto; no asumir que el XML público examinado tiene exactamente el mismo contrato JSON.
- Revisar disponibilidad y caducidad de la configuración sin exponer secretos. La investigación enlaza el cambio de caducidad de claves anunciado por AEMET. No rotar credenciales por iniciativa propia.
- Validar el extracto mínimo de municipios y zonas necesario para la cobertura acordada. Reutilizar identidad existente; cuando falte, importar límites oficiales en PostGIS y relacionarlos con geocódigos CAP. No añadir un servicio GIS ni una llamada a Nominatim por viaje.
- Ante un bloqueo real de fuente o credencial, conservar la degradación y comunicarlo concretamente; no sustituir por otra fuente, relajar TLS ni afirmar que se cerró la capacidad. No exigir otra aprobación genérica para decisiones ordinarias dentro de este plan.

### 2. Normalizar y persistir productos compartidos en Core

- Separar adaptadores de adquisición, decisiones de dominio y contratos: Core posee proveedores/DB; `packages/domain` contiene selección/relevancia; `packages/contracts` contiene DTOs; `packages/provenance` expresa frescura. Cambios aditivos, sin refactor general del dominio.
- Para predicción, usar OpenData horario por municipio. Para avisos, usar el [Atom provincial verificado](https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAP7228_ATOM.xml) y el conjunto completo CAP enlazado cuando cambie. No añadir otro consumidor de avisos ni un segundo mecanismo de publicación como requisito.
- Persistir por `(producto, municipio/área)`, no por usuario o conversación: payload normalizado, versión/hash, emisión, intervalos, descarga/comprobación, siguiente revisión y estado de lease/backoff. Reutilizar el patrón PostgreSQL de llegadas EMT; solo las tablas/migraciones aditivas necesarias, sin un nuevo framework de caché o scheduler.
- Mantener `issuedAt`, `validFrom/validTo`, `fetchedAt` y `checkedAt` separados. No falsear `observedAt` para encajar predicciones. Una nueva descarga o una 304 no amplían la vigencia ni rellenan intervalos ausentes.
- CAP: solo mensajes operativos; respetar zona, idioma, vigencia y estado completo. Tratar `Minor` como ausencia explícita de aviso en su cobertura y las retiradas mediante `Update`/referencias/expiración; no basta buscar `Cancel`. Reemplazar el estado actual solo tras validar el conjunto completo; no borrar datos válidos por una descarga truncada o fallida.
- Permitir únicamente hosts/rutas oficiales previstos; acotar cuerpo, archivos y tamaño descomprimido; deshabilitar entidades XML externas y no extraer archivos CAP a rutas arbitrarias. Guardar atribución y fechas, no sobres con secretos ni URLs operativas en contexto del modelo.

### 3. Actualizar sin descargas por ruta

- Valores iniciales de la aplicación: **30 min** para revisar predicción de cada municipio demandado; **5 min** para comprobar el índice de avisos compartido. No son garantías de publicación del proveedor.
- Ventana de actividad global existente y demanda por recurso acotada a **30 min desde su último uso**. El worker actual procesa recursos debidos con trabajo y concurrencia acotados. No mantener actualizados municipios no usados ni descargar toda España; no crear otro worker, Cron o servicio.
- Un solo actualizador concurrente por recurso, compatible entre lectura y worker; límite global conservador, backoff y `Retry-After`. Recordar que sobre y datos OpenData pueden suponer dos peticiones HTTP. No volver a descargar por un cambio de hora si el producto ya lo cubre, ni repetir continuamente un horizonte conocido como no disponible.
- Usar descarga condicional para el índice CAP. Una 304 con estado local válido solo actualiza la comprobación; si falta el conjunto persistido, recuperarlo de forma controlada, no interpretar 304 como ausencia de avisos.
- En caché utilizable, responder sin red. En ausencia de caché, permitir hasta **3 s adicionales en total** para el enriquecimiento, no por municipio o alternativa. Cancelar o ceder trabajo de forma controlada; el worker atiende lo pendiente usando el estado persistido. No dejar tareas sueltas tras devolver la respuesta ni agotar el presupuesto con reintentos.
- Documentar y probar la política por producto: una comprobación vencida no permite afirmar que se dispone del último estado. Durante fallos, conservar evidencia anterior claramente etiquetada, solo si aún cubre el periodo; fuera de cobertura devolver desconocido/no disponible. No heredar el umbral de observaciones de Retiro ni mantener datos antiguos indefinidamente como vigentes.

### 4. Enriquecer el viaje sin romper routing

- Invocar el servicio después de obtener itinerarios válidos y con origen/destino/hora resueltos. Si faltan datos esenciales, mantener la aclaración existente del chat; no inventar el desplazamiento.
- Cobertura inicial: origen, destino y transbordos con ubicación demostrable. Seleccionar el periodo del viaje y los tramos a pie conocidos; no atribuir exposición al exterior a cualquier espera. No usar la capital más cercana para adivinar el municipio. Si hay límites/fronteras ambiguos o cobertura parcial, indicarlo.
- No solicitar geometrías completas a OTP ni alterar su consulta para simular un análisis meteorológico continuo. La predicción municipal aporta contexto aproximado. Conservar los periodos originales de probabilidades/acumulados: no convertir seis horas en probabilidad exacta para unos minutos ni extrapolar a fechas no publicadas.
- Adjuntar resultados y estado meteorológico de forma independiente: un timeout, 401/429, fallo de parser o almacenamiento meteorológico no convierte una ruta ya calculada en `no_route` ni invalida sus datos de movilidad. No esconder un fallo del routing como si fuese solamente meteorológico.
- Devolver evidencia compacta y acotada, sin repetir el mismo producto en cada alternativa ni enviar boletines completos al modelo. Las lecturas meteorológicas explícitas utilizan el mismo servicio; no añadir otra integración en Web.

### 5. Comunicar lo pertinente, no cada actualización

- Comparar relevancia de forma determinista: aviso que aparece/deja de aplicar, cambio de nivel o solapamiento temporal/geográfico; precipitación prevista que coincide con tramos a pie. Un nuevo timestamp/ID equivalente o una variación mínima no justifican repetir una advertencia.
- Mantener valores y periodos originales. No inventar umbrales de seguridad o puntuaciones de peligro; no reordenar/cancelar rutas ni inferir desvíos desde el tiempo.
- EVE usa la evidencia de `plan_journey` y el contexto conversacional existente. No llamar a otro modelo para decidir relevancia ni crear memoria compartida de viajes entre usuarios. Evitar notas idénticas repetidas sin omitir avisos pertinentes cuando el usuario pide un resumen nuevo.
- No anunciar «sin avisos» a menos que el estado completo esté comprobado recientemente y cubra la zona y el periodo. Distinguir dato antiguo, no disponible, fuera de horizonte y sin avisos aplicables.
- Actualizar solo instrucciones necesarias del agente; conservar interfaz oficial, modelo directo y herramientas por defecto deshabilitadas. Sin notificaciones fuera de la consulta.

## Pruebas necesarias y suficientes

Extender la suite y los smokes existentes; no crear una campaña nueva ni probar con gasto del modelo.

1. **Contrato y tiempo:** predicciones con intervalos mixtos, unidades, cambios de día/hora y fuera de horizonte; emisión/comprobación/vigencia diferenciadas; CAP `Minor`, test/operativo, actualización/retirada, duplicados de idioma y conjunto incompleto.
2. **Caché y PostgreSQL:** consultas repetidas y cinco concurrentes al mismo recurso producen una actualización, no cinco. Cambio de hora o alternativa reutiliza datos. Probar 304, recurso local ausente, backoff, trabajo acotado por ciclo, caducidad de demanda y publicación atómica ante fallos.
3. **Integración:** un viaje dentro de Madrid, otro entre municipios/zonas y uno sin cobertura completa. AEMET no disponible deja la ruta válida con estado meteorológico explícito. Presupuesto de espera global y cancelación comprobados con proveedores simulados.
4. **Cambio relevante:** misma publicación o contenido equivalente no añade una novedad; aviso que cambia de nivel/periodo aplicable sí. Una probabilidad por bloque mantiene su periodo en la salida y una fecha lejana no hereda el tiempo actual.
5. **Comprobación real acotada:** confirmar normalización/almacenamiento de los productos y salida MCP; distinguir caché, antigüedad y disponibilidad. No se exige que el tiempo real produzca todos los fenómenos: los casos adversos se prueban con fixtures.
6. **Regresión:** Node 24/pnpm 10; `pnpm check` antes de push y compilación del agente al actualizar sus instrucciones. No nueva auditoría global, inferencias, benchmarks ni reconstrucción del grafo.

## Entrega completa

- Commits pequeños Conventional Commits, incluyendo investigación/plan/roadmap sin perder documentación local. PR en inglés conforme a convenciones del repositorio, con cambios, evidencia real y riesgos concretos; no atribuciones añadidas.
- Integrar con CI correcto, dejar `main` limpio y sincronizado y retirar únicamente la rama efectivamente integrada, preservando trabajo ajeno.
- Si hay migración, respaldo privado antes de aplicarla y verificación de resultado. Recompilar/actualizar el runtime local con el procedimiento existente, sin reiniciar OTP ni reimportar GTFS.
- Smoke local autenticado y comprobación breve de la nueva salida meteorológica. No despliegue cloud ni nuevas llamadas al modelo.
- Actualizar roadmap y una nota de aceptación breve: capacidades realmente entregadas, comandos/resultados, frescura/cobertura, límites y estado de integración/runtime. No declarar completada una capacidad bloqueada por acceso, ni cerrar R1/R2 completos por esta entrega.

## Referencias de código para empezar

- `apps/mobility-core/src/adapters/aemet.ts`, `ingestion.ts`, `emt-arrivals.ts`: adquisición, jobs y patrón de caché existente.
- `apps/mobility-core/src/routing.ts`, `mobility.ts`: punto de enriquecimiento y `get_environment`.
- `packages/contracts/src/index.ts`, `packages/domain/src/ingestion.ts`, `packages/provenance`: contratos, políticas y frescura.
- `apps/eve-web/agent/instructions.md`: contexto del viaje y explicación de límites, no acceso a proveedores.

Las URLs, observaciones públicas y sus límites están citados en la [investigación y propuesta](../research/2026-09-28-journey-weather.md). Si una fuente contradice la muestra investigada, conservar la evidencia de la diferencia y adaptar el contrato dentro de este alcance, sin introducir una arquitectura nueva.
