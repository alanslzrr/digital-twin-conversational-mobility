# OpenTelemetry de EVE: implementación y evidencia

[Índice](../index.md) · [Actas](index.md) · [Plan ejecutado](../plans/2026-10-14-otel-enrichment.md) · [Referencia vigente](../reference/system.md#metadatos-opentelemetry-de-eve) · [Fuentes](../resources/index.md#tecnología)

## Primera entrega, antes de la activación

Integración completa de metadatos nativos con EVE 0.65.0, sin actualizar dependencias. El procesador alimenta el sink privado existente; Core añade un campo al evento terminal original y el panel lo expone en sus detalles técnicos. No se añade un almacén de trazas, un ledger, un collector ni una interfaz de chat distinta.

La primera entrega quedó apagada. La migración 0023 solo se aplicó entonces en PostgreSQL desechable. La revisión y activación local posteriores se registran al final de esta acta; OCI permanece sin activar.

## Verificaciones ejecutadas

Entorno: Node 24.21.0 y pnpm 10.30.3.

| Comando | Resultado y alcance |
| --- | --- |
| `pnpm check` | Correcto: lint y fronteras, tipos, 636 pruebas pasadas y 132 opt-in omitidas; builds Next.js de Web y Core. Persisten 47 advertencias de lint no bloqueantes. |
| `pnpm build:agent` | Correcto: descubrimiento y compilación real de las cuatro entradas de instrumentación con EVE 0.65.0. Inspeccionado el artefacto generado, sin arrancarlo. |
| `pnpm test:control:db` | 32 pruebas pasadas: 24 de control existentes y 8 de enriquecimiento. PostgreSQL/PostGIS desechable, datos sintéticos, migraciones completas y contenedor eliminado al terminar. |
| `pnpm check:oci` | Plantillas válidas; solo análisis de configuración, sin provisión, arranque ni despliegue. |
| `node scripts/check-cloud-disabled.mjs` | Configurador cloud cerrado, sin credenciales ni escrituras. |

## Compatibilidad y cobertura

- La [prueba del runtime instalado](../../apps/eve-web/src/otel-compatibility.test.ts) fija la versión, carga el pipeline y productor nativo EVE, y comprueba turno/paso/modelo/herramienta con una misma traza. No invoca modelos; cualquier `fetch` en ese ensayo falla. Con el flag apagado no recibe spans.
- La [configuración](../../apps/eve-web/src/otel-configuration.test.ts) comprueba captura sin contenido en canales públicos/privados, entornos de desarrollo/producción y previews. Ambos destinos administrados quedan desactivados; el contexto exige identidad y coordenadas vigentes.
- Las [pruebas de proyección y transporte](../../apps/eve-web/src/otel-enrichment.test.ts) verifican allowlist de metadatos, rechazo de contenido arbitrario, límites de cola/lotes/concurrencia, caducidad, ausencia de reintentos y confirmación HTTP de los terminales en ambos órdenes de llegada.
- La [integración SQL](../../apps/mobility-core/src/observability/otel.integration.test.ts) verifica enriquecimiento idempotente, replay concurrente, rechazo de correspondencias ambiguas, separación de compactación, JWT/scope/origin, ownership, suspensión, revocación y purga. Los eventos, hashes, uso y caducidad permanecen intactos; no se escriben intentos en el ledger.

## Hallazgo de compilación corregido

El build real mostró que EVE compila hooks e instrumentación en entradas separadas: un `Map` local al módulo queda duplicado y no comunica la confirmación ni el propietario al procesador. La [coordinación compartida](../../apps/eve-web/src/otel-coordination.ts) utiliza un único `Symbol.for` del proceso, con límites de tamaño y caducidad, sin cuerpos ni secretos. La [regresión](../../apps/eve-web/src/otel-coordination.test.ts) importa dos copias independientes y comprueba intercambio y expiración. El artefacto recompilado usa la misma clave en ambas entradas.

## Límites de la evidencia

No se realizaron inferencias reales, benchmarks OTP, ingestión, cambios de entorno privado, reinicios de la aplicación habitual ni despliegues. La configuración es común a local/OCI, pero no se certifica una ejecución en una VM OCI o una sesión productiva con OTel activado. No se añadieron pantallas; la lectura de metadatos se verificó mediante el DTO existente, no con una inspección autenticada de navegador.

El enriquecimiento es best-effort: una captura perdida, un límite o una correlación ambigua deja el campo vacío. La duración EVE no sustituye ni se suma a la duración del transporte. La activación posterior y la instalación del esquema se describen en [operación local](../local-runtime.md#preparar-metadatos-opentelemetry).

## Revisión e instalación local posteriores

El usuario solicitó una revisión a fondo, corregir los hallazgos y arrancar la instalación para probarla desde el chat. Se revisaron contratos, captura nativa, correlación, transporte, permisos, SQL, lectura y comportamiento del panel.

### Hallazgos corregidos

| Hallazgo | Efecto y corrección | Regresión |
| --- | --- | --- |
| El panel congelaba las lecturas al recibir el terminal, antes de que llegara OTel | Resumen y primera página de eventos mantienen una ventana acotada de 35 s desde la última observación. No esperan indefinidamente spans opcionales ni añaden un Cron | [Política de refresco](../../apps/eve-web/src/dashboard-polling.test.ts), compartida por resumen y eventos |
| Dos spans para el mismo destino hacían rechazar el lote entero | Se descartan solo los destinos ambiguos; los spans independientes siguen enriqueciéndose | [Integración SQL](../../apps/mobility-core/src/observability/otel.integration.test.ts) con conflicto y un hermano válido |
| Un ID de span reutilizado podía disparar el índice único y revertir otros enriquecimientos válidos | Se detecta tanto dentro del lote como contra registros existentes, sin sobrescribir asociaciones ni perder el resto del lote | Integración SQL con colisión persistida y colisión dentro del lote |

La compatibilidad con el productor EVE instalado se amplió a finalización, fallo y cancelación en entorno de producción, con contexto de compactación y errores privados sintéticos. No se invocó ningún modelo.

### Verificación final

- `pnpm check`: 639 pruebas pasadas y 133 opt-in omitidas; tipos, fronteras y builds Web/Core correctos. Persisten 47 advertencias no bloqueantes.
- `pnpm test:control:db`: 33 pruebas pasadas en PostgreSQL desechable, incluidas nueve de OTel.
- `pnpm build:agent`: compilación real correcta.
- `pnpm check:oci` y `node scripts/check-cloud-disabled.mjs`: correctos; sin provisión ni despliegue.
- `pnpm smoke --production`: Web/Core/EVE, autenticación MCP y acceso productivo correctos, sin modelo.
- `pnpm smoke:evaluation`: login real con cuentas efímeras, CSRF, aislamiento, historial, cuotas, revocación y logout correctos. Las cuentas se eliminan al finalizar; no se modifica la identidad ni el MFA del usuario.

### Estado operativo

Detenido únicamente el supervisor verificado de este repositorio. Reactivados sus contenedores existentes de PostgreSQL, Redis y OTP, sin reconstruir el grafo. Creado respaldo privado de base/configuración e índice del dump verificado antes de aplicar 0023. Renovado el JWT interno y cambiado únicamente el flag OTel a `true` en los entornos privados Web/Core; los ejemplos versionados conservan `false`.

Supervisor local independiente de la terminal, con Web en `http://127.0.0.1:3010`, Core en loopback 3001, EVE en loopback 4274 y el worker habitual. Los tres health checks responden 200. No se ha tocado el otro proyecto del puerto 3000 ni se han activado OCI o correo.

En ese momento quedaban pendientes la primera inferencia real y su inspección en el panel. Los checks anteriores no se presentan como evidencia de una inferencia real trazada; las pruebas autorizadas posteriormente se registran a continuación.

## Pruebas posteriores con cuenta real

Autorizadas expresamente y ejecutadas desde la sesión Better Auth existente en el navegador, con GPT-6 Luna seleccionado. Sin extraer cookies, cambiar credenciales/MFA, ampliar cuotas o activar OCI. Mensajes sintéticos de prueba, sin información personal ni geocodificación externa.

### Hallazgos detectados en ejecución

- **Terminal de modelo ausente tras rechazo HTTP.** El ledger sí conservaba el intento, pero Web lanzaba la excepción antes de proyectar la respuesta. Core devuelve ahora `x-mobai-attempt` en errores posteriores al despacho y Web captura el terminal con ese mismo UUID. El cuerpo del proveedor continúa oculto, el uso desconocido no se convierte en cero y no se reintenta. [Transporte Web](../../apps/eve-web/src/model.ts), [error Core](../../apps/mobility-core/src/control/errors.ts), [proxy](../../apps/mobility-core/src/control/proxy.ts); regresiones de rechazo con/sin despacho y de unicidad del ledger.
- **Esquema de herramienta incompatible con el proveedor.** La búsqueda de lugares descubría también `resolve_address`. Su patrón `\P{Cc}` dependía del flag Unicode de JavaScript, que JSON Schema no transporta; el proveedor rechazaba el esquema antes de ejecutar ninguna de esas herramientas. Se sustituyó por rangos explícitos C0/C1 equivalentes, manteniendo longitudes, exclusión de controles y consentimiento externo apagado. [Contrato y regresión](../../packages/contracts/src/geocoding.test.ts): comparación de los 65.536 caracteres del BMP, texto internacional y validación Core. El diagnóstico transitorio solo emitió clasificaciones cerradas, no cuerpos del proveedor, y se retiró del código final.
- **Etiqueta equívoca del evento preparado.** El panel decía «no enviada», aunque el evento no acredita ese estado y puede acompañar un terminal del proveedor. Corregida a «Petición preparada» en ambos idiomas, sin cambiar tipos de evento ni contadores.

Los intentos iniciales fallidos se conservan como evidencia histórica, sin reconstruir eventos retrospectivos. Una búsqueda repetida de herramientas alcanzó además el límite existente y fue rechazada; no se amplió ese límite para hacer pasar la prueba.

### Verificaciones de las correcciones

- `pnpm check`: 643 pruebas pasadas y 135 opt-in omitidas; tipos y builds correctos, con las mismas 47 advertencias de lint.
- `pnpm test:control:db`: 35 pruebas pasadas en PostgreSQL desechable, incluido fallo previo al despacho: conserva `not_sent` y no declara una llamada enviada.
- `pnpm build:agent`: correcto. Runtime reiniciado con los artefactos corregidos y diagnóstico temporal retirado.
- `pnpm smoke --production`: correcto; esquema MCP publicado con el patrón nuevo.

### Resultado real final

Conversación nueva, dos turnos completados: búsqueda de «Atocha, Madrid» sin coincidencia, comunicada como ausencia, seguida de «Atocha» en Renfe con resultado Madrid-Atocha Cercanías. No se calcularon rutas ni horarios. Confirmados en el navegador los resultados y las pestañas Uso y Modelo del panel autenticado, incluido el bloque `otel` del terminal final.

| Comprobación | Resultado |
| --- | --- |
| Ledger Core | 6 intentos liquidados, uno por llamada |
| Telemetría existente | 36 eventos; 6 terminales de modelo, ninguno duplicado |
| Enriquecimiento | 18 spans distintos: 6 modelo, 6 paso, 4 herramienta y 2 turno; dos trazas |
| Herramientas | Dos descubrimientos y dos consultas de catálogo; el panel excluye descubrimiento de su contador de herramientas de dominio |
| Uso | 29.033 tokens de entrada y 231 de salida; coincidencia exacta por intento entre ledger y telemetría, confirmada también en el panel |
| Cobertura | Cero eventos omitidos y cero gaps conocidos; continúa siendo best-effort, no una garantía universal |
| Privacidad OTel | Los 18 spans contienen exclusivamente las ocho claves permitidas; ningún cuerpo, uso o secreto adicional |

En toda la sesión de pruebas, incluidos los diagnósticos previos, se registraron **17 intentos**: 14 liquidados con uso declarado y tres rechazos con uso desconocido. El uso conocido agregado es 63.185 tokens de entrada y 513 de salida; no incluye ni estima el uso de los rechazos. No hay importe monetario calculado en esos registros y no se presenta como coste cero. Las reservas y los intentos históricos no se modificaron manualmente.

Los seis spans de modelo enlazan a sus seis pasos y estos a sus turnos. Los cuatro spans de herramienta conservan padres auxiliares nativos que esta proyección excluye: no se fabrica otro padre ni se afirma reconstruir el árbol completo de Agent Runs. El panel existente muestra los metadatos técnicos; no se ha añadido el waterfall de la consola EVE.

El runtime queda encendido en 3010 con el build definitivo. No se ha probado OCI ni se han ejecutado cancelación o compactación reales en esta sesión; su cobertura automatizada no se presenta como evidencia de llamadas reales.

## Evolución posterior del panel

La ausencia de waterfall descrita en las verificaciones anteriores corresponde a esa entrega. La [ampliación visual posterior](2026-10-14-trace-waterfall.md) añade árbol temporal e inspector sobre los mismos registros, sin nuevas inferencias ni otra contabilidad.

## Revisión final para la PR

- Detectada una asociación incorrecta posible cuando solo existe el terminal de otro intento con la misma sesión, turno, paso y propósito. Core ahora rechaza terminales de modelo fuera del intervalo nativo; primero cuenta todos los candidatos, por lo que los tiempos nunca resuelven una ambigüedad entre reintentos. No se reconstruyen ni modifican registros históricos.
- Dos regresiones PostgreSQL reprodujeron la asociación incorrecta antes del arreglo, tanto con un terminal anterior como posterior. Con el arreglo pasan y comprueban además que dos candidatos siguen siendo ambiguos. Las fixtures temporales se fijan por prueba, sin depender de la velocidad de la base.
- `pnpm check`: **664 pruebas pasadas y 137 opt-in omitidas**, 102 archivos pasados y 13 omitidos; lint, tipos y builds correctos, con las 47 advertencias previas. `pnpm test:control:db`: **37 pruebas pasadas** en base desechable. `pnpm build:agent`, auditoría de dependencias a nivel moderado, veto cloud y comprobación estática OCI correctos.
- Reconstruido y reiniciado exclusivamente el supervisor local del proyecto; `pnpm smoke --production` correcto, sin inferencias. Ninguna nueva llamada al modelo, activación OCI o migración sobre la base habitual durante esta revisión. El alcance se sigue en [issue #69](https://github.com/alanslzrr/digital-twin-conversational-mobility/issues/69), con notas para [v0.2.0](../releases/v0.2.0.md).
