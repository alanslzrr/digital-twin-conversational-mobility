# Problemas frecuentes

[Índice](index.md) · [Operación local](local-runtime.md) · [Cuentas](evaluation.md) · [Claves](resources/accounts.md)

Empieza por el síntoma. No aumentes límites, desactives autenticación ni reconstruyas el grafo sin identificar el problema. Estas instrucciones no ejecutan pruebas ni modifican servicios por sí mismas.

| Síntoma | Qué comprobar | Acción proporcionada |
| --- | --- | --- |
| No abre el chat | Docker, Postgres/OTP y supervisor; puertos de [referencia](reference/system.md#servicios-y-versiones) | Sigue [inicio cotidiano](local-runtime.md#inicio-y-parada); no repitas instalación |
| Puerto ocupado | Puede existir un supervisor habitual | Reutilízalo o detén su terminal; no mates procesos ajenos por número de puerto |
| «Credenciales incorrectas o límite…» | Origen `127.0.0.1:3000`, cuenta habilitada/vigente y límite de login | Espera el minuto indicado; el administrador usa `evaluator list` y, si procede, `reset`. No revelar contraseñas en logs |
| Login permitido, conversación ajena denegada | Propiedad de sesión EVE | Es el aislamiento esperado, no se corrige omitiendo el guard |
| Chat anterior no disponible | Caducidad de acceso, reset/revoke o mensajes ausentes en EVE | Abre un chat nuevo si corresponde; no presenta recuperación vacía como conversación recuperada |
| MCP rechaza credencial de servicio | JWT local de siete días y configuración Web/Core | `pnpm setup:local --refresh-token`; reiniciar aplicaciones para cargarlo, sin tocar claves de proveedores |
| Cambiaron herramientas pero el chat no las refleja | Build de agente compatible y sesión previa | Compilar aplicaciones/agente y usar sesión nueva siguiendo [actualización](local-runtime.md#actualizar-código-o-configuración) |
| Fuente `not_initialized` | Catálogo/primera adquisición ausentes | Revisar [preparación de datos](installation.md#datos-y-routing), no confundirlo con caída del proveedor |
| Datos antiguos con worker vivo | Ventana activa, `next_due_at`, backoff y hora real de la publicación | Consultar salud; no sustituir `observedAt` por hora de descarga |
| Worker sin heartbeat | Proceso detenido o Core inaccesible | Revisar supervisor/Core. No atribuir automáticamente un error al proveedor |
| EMT 403/código 84 | Aplicación, estado de moderación y pareja ClientId/PassKey | En el alta inicial la app estaba pendiente de aprobación; comprobar MobilityLabs. No todo 403 prueba una contraseña incorrecta ni toda denegación tiene la misma causa |
| AEMET 401 | Vigencia de la clave | Solicitar nueva clave según [aviso oficial](resources/accounts.md#aemet), actualizar Core; no repetir indefinidamente |
| AEMET intermitente / Renfe TLS timeout | Red local, publicación y backoff | Conservar degradación y verificar conectividad sin desactivar TLS. El episodio Renfe observado no demostró una caída global |
| `forecast_unavailable` | Producto cubre el periodo pero falta frescura/dato utilizable | Mostrar falta de predicción, mantener rutas disponibles |
| `outside_horizon` | El periodo consultado cae fuera de la predicción publicada | Pedir otra fecha/horizonte; no confundirlo con caducidad |
| Estación AEMET sin lectura | Catálogo no garantiza observación disponible | Selección por estación o ubicación; no sustituir silenciosamente por Retiro |
| No aparece Metro en rutas | Alcance aprobado y feed caducado | Usar redes admitidas; no crear una tarea para buscar otro proveedor |
| `outside_static_service_period` | Fecha solicitada y calendario de cada feed | Actualización explícita por [release](routing-releases.md), no modificar la fecha de vigencia a mano |
| `graph_static_version_mismatch` | Grafo y DB de versiones distintas | Recuperar/activar el conjunto compatible; no copiar un `graph.obj` aislado |
| `routing_update_in_progress` | Journal de mantenimiento pendiente | Mantener apps detenidas y seguir [recover](routing-releases.md#volver-atrás-o-recuperar-una-activación) |
| `no_route` | Lugares, modos, calendario y preferencias dentro de cobertura | Aclarar la petición; no relajar caminar/transbordos sin pedirlo |
| Geocoder deshabilitado o busy | Consentimiento, configuración y carril global | Usar catálogo o esperar; no montar una ráfaga de reintentos |
| Tarifa disponible, ocupación ausente | Son productos independientes | Mostrar el precio y la ausencia de lectura, no cero plazas |
| Check falla por puerto auxiliar de build | Revisar el error exacto de Turbopack/permisos | No atribuir a claves cloud. El diagnóstico histórico con Webpack no sustituye un `pnpm check` aprobado |

## Dónde mirar sin exponer datos

- [Health Core](http://127.0.0.1:3001/api/health) y [health EVE](http://127.0.0.1:3000/eve/v1/health): disponibilidad del proceso.
- `get_source_health`: adquisición, cobertura y frescura por producto.
- Manifiestos locales de la release: versiones/calendarios; no publicar dumps ni informes privados completos.
- [Scripts](reference/system.md#comandos-y-permisos): elegir el diagnóstico adecuado; los modos live consumen créditos.

**Evidencia del diagnóstico:** [E2 histórico](audits/2026-09-25-e2-instrumentation.md), [hallazgos posteriores a E8](acceptance/2026-09-25-post-e8-findings.md), [accesibilidad](acceptance/2026-09-29-static-accessibility.md), [diaria](acceptance/2026-09-30-daily-weather.md), [multiestación](acceptance/2026-09-30-weather-observations.md). Los errores históricos no se afirman presentes hoy.
