# Waterfall de conversaciones — verificación local

[Índice](../index.md) · [Plan](../plans/2026-10-14-trace-waterfall.md) · [Guía de uso](../user-guide.md#leer-una-traza-visual) · [Referencia](../reference/system.md#metadatos-opentelemetry-de-eve)

## Entrega

La pestaña inicial **Traza** permite ver operaciones e intervalos en un waterfall, seleccionar un inspector, buscar, plegar y enfocar el tiempo. Se conserva la cronología y las vistas Uso/Modelo/Herramientas/Contenido. En pantallas estrechas el gráfico tiene desplazamiento propio y el inspector queda debajo.

Se reutilizan el GET de eventos, los campos `otel` y los payloads saneados existentes. No se ha añadido un productor, exportador, endpoint, dependencia, migración, escritura o llamada al modelo. La lectura de eventos de la cronología no se ejecuta simultáneamente con la de Traza; Uso tampoco solicita eventos innecesarios.

## Comprobaciones ejecutadas

- **`pnpm check`**: 663 pruebas pasadas y 135 opt-in omitidas; 102 archivos pasados y 13 omitidos. Tipos y builds Web/Core correctos; 47 advertencias previas de lint, sin advertencias nuevas del waterfall.
- **20 pruebas nuevas**: doce de proyección y ocho de componente. Incluyen identidad de operaciones, deduplicación de páginas, reintentos/compactaciones, parentesco nativo/lógico, trazas distintas, padres ambiguos/cíclicos, eventos sin span, uso desconocido, recorte de intervalos, búsqueda con ancestros, plegado, selección, contenido bajo demanda, respuestas tardías, paginación, pausa, límite de 1.000 eventos y número del turno filtrado.
- **Navegador autenticado, cuenta real existente**: se inspeccionó la conversación ya capturada en la entrega OTel. Permanecen 36 eventos, 18 spans y dos turnos. Filtrar el segundo turno muestra seis operaciones/spans sobre doce eventos. No se generó una conversación nueva.
- **Inspector**: `resolve_place` conserva su padre auxiliar ausente y señala agrupación lógica; una llamada al modelo señala padre nativo. El intento final del segundo turno muestra 5.677 tokens de entrada y 23 de salida, con 5.068 de caché incluidos, sin recalcular el total. El botón de contenido abrió la respuesta saneada retenida, sin reenviarla al modelo.
- **Interacción**: búsqueda `resolve_place` conserva sus ancestros; plegado por Enter deja dos raíces; filtro de turno y enfoque/restablecimiento modifican la escala. Revisados ES/EN, temas claro/oscuro y viewport estrecho solicitado de 390 × 844. La medición DOM confirmó que el documento no desborda horizontalmente, el gráfico sí tiene scroll interno y el inspector queda debajo. Preferencias y tamaño restaurados al finalizar.
- **Servidor local**: reconstruido y reiniciado exclusivamente el supervisor del proyecto en 3010, con Core/EVE en sus puertos existentes. El primer smoke se adelantó al arranque y recibió conexión rechazada; repetido con el servicio listo, **`pnpm smoke --production`** verifica salud EVE/Web/Core, autenticación, handshake y herramientas MCP sin inferencias. Servicio ajeno en 3000 e infraestructura existentes conservados.

## Límites explícitos

- Captura best-effort, no una reconstrucción completa del árbol Agent Runs. Los spans excluidos no se inventan y los eventos sin span no se dibujan como intervalos.
- El límite visual es de 1.000 eventos acumulados explícitamente; la API conserva páginas de 100. Las páginas pendientes y los errores mantienen aviso de vista parcial. La paginación congela el refresco y volver al inicio respeta la cadencia mínima existente.
- Los tokens se muestran desde el terminal original. No se suman padre/hijo, caché/entrada ni razonamiento/salida. El coste monetario permanece no disponible.
- Las pruebas de paginación extensa y ausencia de spans son sintéticas; no se insertaron fixtures en la base habitual. No se ha realizado una auditoría nueva con lector de pantalla ni otra campaña de modelos.
- OCI no se ha activado ni desplegado. El cambio visual usa el mismo frontend y lector existentes; no exige un collector ni configuración adicional allí. Sin commit ni push.

## Implementación y evidencia

- [Proyección pura](../../apps/eve-web/src/trace-waterfall.ts) y [pruebas](../../apps/eve-web/src/trace-waterfall.test.ts).
- [Vista e inspector](../../apps/eve-web/app/%28dashboard%29/dashboard/_components/trace-waterfall.tsx), [estilos](../../apps/eve-web/app/%28dashboard%29/dashboard/_components/trace-waterfall.css) y [pruebas de componente](../../apps/eve-web/app/%28dashboard%29/dashboard/_components/trace-waterfall.test.ts).
- Comprobados 556 enlaces/anclas locales de los documentos modificados: sin errores. `git diff --check` correcto. No se añadieron diagramas.
- Captura final: `waterfall-real-model.jpg`, con primer turno seleccionado, waterfall completo e inspector de modelo.
- Los logs de check/smoke están en `/tmp/mobai-waterfall-check.log` y `/tmp/mobai-waterfall-smoke.log`. Las capturas autenticadas se conservan fuera de Git en el directorio de visualizaciones local del encargo, no como fixtures públicos.

## Revisión final para la PR

Una consulta de búsqueda formada solo por espacios se interpretaba como vacía al filtrar, pero deshabilitaba los botones de plegado y declaraba el árbol expandido. El control ahora usa la misma normalización que el filtro. La regresión de componente falla antes del arreglo y pasa después; cubre el estado accesible y la apertura de la rama sin lecturas nuevas.

Las 38 pruebas focalizadas de OTel, proyección y componente pasan. El chequeo completo y las 37 pruebas PostgreSQL desechables se detallan en la [revisión final de captura](2026-10-14-otel-enrichment.md#revisión-final-para-la-pr). Se conserva la evidencia visual histórica de esta acta; no se generaron nuevos turnos para verificar el arreglo.

Verificado también en el navegador autenticado tras reconstruir: permanecen 36 eventos/18 spans; buscar solo espacios mantiene el botón habilitado y su estado de expansión coincide con el árbol. El primer turno conserva doce operaciones y el inspector de modelo muestra el uso original. La captura `waterfall-final-review.jpg` se guarda fuera de Git, junto a la evidencia privada anterior.
