# Waterfall de conversaciones

[Índice](../index.md) · [Referencia vigente](../reference/system.md#metadatos-opentelemetry-de-eve) · [Enriquecimiento previo](2026-10-14-otel-enrichment.md)

## Objetivo

Ver visualmente cuánto duró cada operación de una conversación y abrir sus detalles, usando exclusivamente eventos y spans ya retenidos. Es una ampliación del panel propio, no una activación de Agent Runs ni un segundo sistema de observabilidad.

## Plan de implementación

1. Proyectar los eventos en operaciones: turno, paso, intento de modelo y llamada de herramienta. Agrupar inicio y terminal por su identidad existente; preservar reintentos, compactaciones y operaciones sin identidad suficiente por separado.
2. Dibujar intervalos solo cuando existe un span OTel. Los eventos sin span se muestran como marcadores, con su estado y duración original en el inspector; no deducir inicios ni inventar tiempos en curso.
3. Respetar padres nativos presentes. Si falta el padre auxiliar, permitir agrupación visual por turno/paso, identificada como lógica, sin modificar los IDs.
4. Añadir pestaña inicial «Traza»: escala temporal, búsqueda, plegado, enfoque del intervalo seleccionado e inspector. Mantener cronología, uso, modelo, herramientas y contenido actuales. Usar estilos del panel y controles accesibles, con inspector debajo en pantallas estrechas.
5. Reutilizar el GET autenticado de eventos. Una página de 100 eventos; ampliar explícitamente hasta 1.000 eventos en memoria. Al paginar se detiene el refresco, como en el lector existente. Mostrar captura parcial, huecos, límite y páginas pendientes; volver al inicio para actualizar. No cargar contenido hasta pulsar su botón.
6. Verificar proyección, ausencia de dobles conteos, parentescos, estados incompletos, paginación y controles. Ejecutar `pnpm check`, reconstruir el servidor local y revisar la conversación real ya capturada, sin nuevas inferencias.

## Invariantes

- Sin nuevos productores, exportadores, endpoints, migraciones, dependencias, escrituras o llamadas al modelo.
- Uso por intento tomado de su terminal, sin sumar eventos de preparación/despacho ni caché/razonamiento a los totales. No sumar duraciones de padres e hijos ni representar coste desconocido como cero.
- Mismos permisos Better Auth/ownership, pausa, visibilidad, desconexión y retención. Sin contenido privado en capturas de prueba versionadas.
- OCI recibe el mismo frontend cuando se despliegue; no se activa ni modifica su entorno.

## Criterio de entrega

Waterfall e inspector utilizables con los datos reales existentes, cobertura y paginación explícitas, suite y build verificados, servidor local disponible y evidencia visual fuera de Git. Implementado y validado en local; [resultados y límites](../acceptance/2026-10-14-trace-waterfall.md).
