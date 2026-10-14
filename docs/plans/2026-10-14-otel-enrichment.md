# Integración OpenTelemetry de EVE sin un segundo almacén

[Índice](../index.md) · [Sistema](../reference/system.md#panel-y-telemetría) · [Despliegue](../deployment.md)

## Objetivo y compatibilidad

Utilizar los spans nativos de EVE para enriquecer el diagnóstico existente en local y en la futura VM OCI. El paquete instalado `eve@0.65.0` exporta `otel`, `otelIntegration`, `SpanProcessor` y `disableInstrumentation`; soporta descubrimiento en `agent/instrumentation/`. No se actualiza EVE ni su parche de compactación.

**Decisión:** aprovechar OpenTelemetry, no adoptar Agent Runs como segundo backend. El beneficio es relacionar las operaciones del agente por sus identificadores nativos y comparar sus intervalos con los eventos que ya tenemos. No añade explicaciones del razonamiento del modelo ni una nueva contabilidad. Los seis pasos siguientes están implementados; instalación y activación quedan separadas.

## Plan de implementación

1. Declarar captura exclusivamente de metadatos, sin instrumentación HTTP/SQL automática ni propagación de baggage. Desactivar explícitamente los destinos `agent-runs` y `local` de EVE.
2. Proyectar solo los spans `eve.agent` de turno, paso, modelo y herramienta. Conservar IDs y tiempos; descartar contenido, errores libres, atributos arbitrarios, tokens y costes.
3. Enriquecer un único evento terminal existente por coordenadas verificables. Correlacionar modelos mediante sesión/turno/paso/propósito; el evento conserva el UUID del intento Core. No fabricar eventos cuando no existe una correspondencia inequívoca.
4. Reutilizar `/internal/telemetry`, JWT, ownership, pool y deadlines. Migración aditiva 0023 para una columna de metadatos por evento, limitada a 512 bytes; sin nueva tabla ni contador financiero.
5. Exponer los metadatos en los detalles técnicos del evento del panel existente. Mantener las duraciones y sumas actuales: la duración nativa describe otro intervalo y no se suma a ellas.
6. Verificar contratos, API real fijada de EVE, filtrado, límites, apagado/preview, permisos, idempotencia, retención y ausencia de cargos/eventos duplicados. Ejecutar calidad y build real del agente sin inferencias.

## Activación separada

`MOBAI_OTEL_ENABLED=false` por defecto en Web/Core. No modificar entornos privados, migrar la base habitual, arrancar/reiniciar servicios, desplegar, exportar a terceros ni llamar modelos. La comprobación SQL se realiza únicamente en una base desechable con datos sintéticos.

**Actualización posterior:** el usuario autorizó revisar y arrancar la instalación local para probar la integración. La [revisión e instalación del 14/10/2026](../acceptance/2026-10-14-otel-enrichment.md#revisión-e-instalación-local-posteriores) registra el respaldo, la migración y la activación local; no modifica el valor predeterminado ni activa OCI.

## Límites deliberados

- Es enriquecimiento best-effort de evidencia existente, no un segundo historial ni una reproducción completa de Agent Runs.
- El procesador admite span y confirmación del evento en cualquier orden, con memoria acotada. Un evento perdido o una correlación ambigua queda sin enriquecimiento; no se crea un evento sustituto ni se reintenta la inferencia.
- Los padres de spans de acción no exportados pueden no aparecer. No se inventan relaciones ni tiempos internos de Core/OTP/proveedores.
- Las trazas no determinan identidad ni autorizarán cuotas. Core continúa validando propietario y el ledger sigue siendo la única autoridad financiera.
- El flag no habilita modelos, movilidad, correo ni despliegues. Las previews rechazan el enriquecimiento incluso con el flag activado.

## Evidencia

La referencia exacta de compatibilidad son los exports públicos y el runtime del paquete instalado. [Documentación oficial OTel](https://eve.dev/docs/observability/otel), [migración](https://eve.dev/docs/observability/instrumentation-migration) y [Agent Runs](https://eve.dev/docs/observability/agent-runs), consultados el 14/10/2026. El [acta de implementación](../acceptance/2026-10-14-otel-enrichment.md) registra las pruebas ejecutadas, el build real y la corrección de coordinación entre entradas compiladas de EVE. No son validación con proveedores reales ni un despliegue OCI.
