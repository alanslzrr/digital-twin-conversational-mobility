# Problemas frecuentes

[Índice](index.md) · [Operación local](local-runtime.md) · [Cuentas](evaluation.md) · [Claves](resources/accounts.md)

Localiza el síntoma y comprueba el componente indicado antes de aplicar la corrección.

| Síntoma | Qué comprobar | Acción |
| --- | --- | --- |
| No abre el chat | Docker, Postgres/OTP y supervisor; puertos de [referencia](reference/system.md#servicios-y-versiones) | Sigue [inicio cotidiano](local-runtime.md#inicio-y-parada); no repitas instalación |
| Puerto ocupado | Puede existir un supervisor habitual | Reutilízalo o detén su terminal; no mates procesos ajenos por número de puerto |
| No se puede iniciar sesión | El mensaje distingue credenciales, origen/acceso, límite de intentos y servicio no disponible | Usa `127.0.0.1:3000`; espera si indica límite o comprueba Core si indica indisponibilidad. Para credenciales, el administrador usa **Administración → Recuperar**, enviando el enlace solo al correo guardado. No revelar contraseñas en logs |
| Login permitido, conversación ajena denegada | Propiedad de sesión EVE | Accede con el propietario de la conversación o abre una propia |
| Chat anterior no disponible | Caducidad de acceso, reset/revoke o mensajes ausentes en EVE | Comprueba el estado de acceso y abre un chat nuevo si el anterior ha caducado o carece de mensajes |
| MCP rechaza credencial de servicio | JWT local de siete días y configuración Web/Core | `pnpm setup:local --refresh-token`; reiniciar aplicaciones para cargarlo, sin tocar claves de proveedores |
| Cambiaron herramientas pero el chat no las refleja | Build de agente compatible y sesión previa | Compilar aplicaciones/agente y usar sesión nueva siguiendo [actualización](local-runtime.md#actualizar-código-o-configuración) |
| Fuente `not_initialized` | Catálogo/primera adquisición ausentes | Completa la [preparación de datos](installation.md#datos-y-routing) o la primera adquisición |
| Datos antiguos con worker vivo | Ventana activa, `next_due_at`, backoff y hora real de la publicación | Consulta `get_source_health` y compara la hora de publicación con el último intento de adquisición |
| Worker sin heartbeat | Proceso detenido o Core inaccesible | Revisa el supervisor y la conexión del worker con Core |
| EMT 403/código 84 | Aplicación, estado de moderación y pareja ClientId/PassKey | Comprueba el estado de la aplicación en MobilityLabs y que ClientId/PassKey pertenecen a ella. En el alta inicial, el acceso se habilitó tras la moderación |
| AEMET 401 | Vigencia de la clave | Solicitar nueva clave según [aviso oficial](resources/accounts.md#aemet), actualizar Core; no repetir indefinidamente |
| AEMET intermitente / Renfe TLS timeout | Red local, publicación y backoff | Revisa conectividad y TLS desde el equipo; respeta el backoff mientras la fuente se recupera |
| `forecast_unavailable` | Producto cubre el periodo pero falta frescura/dato utilizable | Mostrar falta de predicción, mantener rutas disponibles |
| `outside_horizon` | El periodo consultado cae fuera de la predicción publicada | Consulta una fecha incluida en el horizonte publicado |
| Estación AEMET sin lectura | Hora y disponibilidad de la última observación | Consulta otra estación o selecciona por ubicación; la respuesta identifica la estación utilizada |
| No aparece Metro en rutas | Alcance aprobado y feed caducado | Planifica con las redes incluidas en el [alcance](roadmap.md) |
| `outside_static_service_period` | Fecha solicitada y calendario de cada feed | Actualización explícita por [release](routing-releases.md), no modificar la fecha de vigencia a mano |
| `graph_static_version_mismatch` | Grafo y DB de versiones distintas | Recuperar/activar el conjunto compatible; no copiar un `graph.obj` aislado |
| `routing_update_in_progress` | Journal de mantenimiento pendiente | Mantener apps detenidas y seguir [recover](routing-releases.md#volver-atrás-o-recuperar-una-activación) |
| `no_route` | Lugares, modos, calendario y preferencias dentro de cobertura | Aclarar la petición; no relajar caminar/transbordos sin pedirlo |
| Geocoder deshabilitado o busy | Consentimiento, configuración y carril global | Usar catálogo o esperar; no montar una ráfaga de reintentos |
| Tarifa disponible, ocupación ausente | Son productos independientes | Mostrar el precio y la ausencia de lectura, no cero plazas |
| Check falla por puerto auxiliar de build | Revisar el error exacto de Turbopack/permisos | Comprueba el permiso del proceso para abrir el puerto indicado y vuelve a ejecutar `pnpm check` |

## Consumo y modelos

| Código | Acción |
| --- | --- |
| `feature_disabled` | Consumo/correo externo siguen desactivados; no habilitarlos sin aprobación. |
| `mfa_required` / `reauth_required` | Completa TOTP en Mi cuenta y confirma contraseña/TOTP para la acción sensible. |
| `context_exceeded` | Compacta con el modelo anterior si sigue disponible y tiene presupuesto, o abre un chat nuevo. |
| `credential_invalid` / `model_denied` | Revisa key, perfil y permisos del proveedor; no cambies de pagador automáticamente. |
| `budget_exhausted` / `prices_unverified` | Comprueba reserva, bolsa compartida, cuotas y validez de tarifas. |
| `execution_uncertain` | Consulta el intento y su reserva; no repitas automáticamente. Conciliación administrativa con evidencia. |

[Procedimiento completo](accounts-and-llm.md). No uses los configuradores OpenAI ni la administración por slots antiguos.

## Dónde mirar sin exponer datos

- [Health Core](http://127.0.0.1:3001/api/health) y [health EVE](http://127.0.0.1:3000/eve/v1/health): disponibilidad del proceso.
- `get_source_health`: adquisición, cobertura y frescura por producto.
- Manifiestos locales de la release: versiones/calendarios; no publicar dumps ni informes privados completos.
- [Scripts](reference/system.md#comandos-y-permisos): elegir el diagnóstico adecuado; los modos live consumen créditos.

**Evidencia del diagnóstico:** [E2 histórico](audits/2026-09-25-e2-instrumentation.md), [hallazgos posteriores a E8](acceptance/2026-09-25-post-e8-findings.md), [accesibilidad](acceptance/2026-09-29-static-accessibility.md), [diaria](acceptance/2026-09-30-daily-weather.md), [multiestación](acceptance/2026-09-30-weather-observations.md).
