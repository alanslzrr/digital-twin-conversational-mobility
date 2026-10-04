# Evidencia de la segunda auditoría

[Acta y alcance](../../../acceptance/2026-10-03-core-dashboard-second-audit.md) · [Spec-audit](../../2026-10-02-core-dashboard-review.md)

Capturas del HEAD de aplicación `1355f1633a08294dd1bd6be45a8ad7b0498c0ca2`, obtenidas con agent-browser 0.38.2 sobre producción local desechable en 3002/3003. Login Better Auth real, cuentas y trazas sintéticas identificadas, sin llamadas al modelo ni nuevas adquisiciones de movilidad. Las lecturas de la fixture envejecen durante la prueba.

- 48 imágenes `{vista}-{ancho}-{tema}.jpg`: seis vistas, cuatro tamaños, claro/oscuro y movimiento reducido.
- Ocho imágenes adicionales `*-light.jpg`: ficha/histórico, fallo del fondo cartográfico, referencia tras recarga, consulta guardada, turno elegido, herramientas, diálogo y tabla por teclado.
- Tres imágenes `*-full.jpg`: capturas completas de fuente, evento fallido y referencia legible, realizadas en la revisión complementaria.
- [browser-results.json](browser-results.json): 72 pantallas/formularios, ancho del documento, preferencias activadas y resultado axe. Las imágenes de viewport pueden conservar la posición de scroll de la interacción; no son capturas de página completa.
- [functional-results.json](functional-results.json): recorridos de navegación, cámara, teclado, pausa/offline y segunda identidad. La retención o ausencia de un contenido no equivale a garantía universal de seguridad.
- [a11y-incomplete.json](a11y-incomplete.json): revisiones indeterminadas, conservadas sin convertirlas en «aprobadas». El cuadro del acta describe las comprobaciones complementarias.
- [supplementary-results.json](supplementary-results.json): axe de fuente/evento y 12 tabulaciones dentro del diálogo. El destino de aria-controls existe al abrirlo y Escape restaura foco.

No contienen cookies, cabeceras de autenticación, secretos ni conversaciones reales. La prueba automatizada intercepta las peticiones a tiles para probar el estado de fallo sin hacer un barrido de OpenStreetMap.
