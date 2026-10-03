# Mobility Core — cierre de revisión móvil

[Índice](../index.md) · [Actas](index.md) · [Preparación de merge](2026-10-03-core-dashboard-merge-readiness.md) · [Alcance](../roadmap.md)

## Plan ejecutado

1. Repetir las seis vistas en claro/oscuro a 1440×1000, 1280×800, 1024×768, 768×1024, 390×844 y 320×720.
2. Abrir menú, controles de cabecera, mapa, filtros, evidencia, formulario de consulta y las cinco pestañas de conversación a 320/390 px en ambos temas.
3. Corregir recortes y desbordamientos; repetir los recorridos sobre el build corregido.
4. Mantener el zoom nativo como comprobación separada: no sustituirlo por CSS ni por reducir el viewport. La prueba con lector de pantalla está fuera del alcance por decisión del usuario.

## Hallazgos corregidos

| Hallazgo reproducido | Corrección |
| --- | --- |
| Cabecera expandida a 320 px recorta opciones de tema sin desbordar el documento | Los controles abiertos ocupan una segunda fila en móvil, sin reducir los botones. La cabecera cerrada conserva 52 px |
| Cinco pestañas de conversación ensanchan la página a 352 px en un viewport de 320 px | Contenedor con anchura mínima cero y pestañas que ajustan filas dentro de la anchura disponible |
| Los eventos de Timeline comienzan en h3 después del título h1 | Encabezados h2 para los artículos de evento, sin alterar su tamaño visual |

La comprobación nueva de cabecera verifica geometría y punto de interacción de los seis botones, además de abrir cada opción de tema y alternar pausa/reanudación. Comprobar únicamente el ancho del documento no detectaba el primer fallo.

## Evidencia ejecutada

- **72 vistas** correctas: seis páginas × seis tamaños × dos temas. Sin desbordamiento del documento ni violaciones detectadas por axe en los estados inspeccionados. [Resultado](../audits/assets/core-dashboard-mobile-closure-2026-10-03/matrix.json).
- **52 estados móviles** correctos: trece estados × dos anchuras × dos temas. Incluyen las cinco pestañas de conversación y el contenido saneado abierto, navegación con foco dentro del menú, retorno a una ruta, mapa/lista, filtros, detalle de entidad, controles de cabecera y formulario de consulta. [Resultado](../audits/assets/core-dashboard-mobile-closure-2026-10-03/mobile.json).
- **510 pruebas generales**, 100 omitidas; lint, tipos y builds correctos con `pnpm check`.
- **37 comprobaciones HTTP autenticadas** correctas en el esquema desechable.
- Navegador automatizado: agent-browser 0.38.2. Datos sintéticos; sin ejecutar herramientas, modelos ni adquisiciones nuevas.
- Los informes retienen los recuentos de comprobaciones indeterminadas de axe. No se presentan como certificación universal.
- La matriz usa viewports de navegador, no dispositivos físicos. Se seleccionaron ocho capturas; no se versionan las 124 capturas locales.

### Capturas seleccionadas

| Caso | Captura |
| --- | --- |
| Cabecera completa, oscuro, 320 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/header-dark-320.png) |
| Pestañas de conversación, oscuro, 320 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/conversation-usage-dark-320.png) |
| Formulario de consulta, claro, 390 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/query-form-light-390.png) |
| Filtros de actividad, claro, 320 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/activity-filters-light-320.png) |
| Menú móvil, claro, 320 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/navigation-light-320.png) |
| Mapa, oscuro, 390 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/map-dark-390.png) |
| Resumen, claro, 320 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/overview-light-320x720.png) |
| Fuentes, oscuro, 390 px | [Abrir](../audits/assets/core-dashboard-mobile-closure-2026-10-03/sources-dark-390x844.png) |

## Zoom nativo: pendiente de paso manual

La automatización no pudo controlar de forma fiable la ventana nativa; el acceso al ajuste interno de Chrome fue bloqueado por la política de la herramienta. No se utilizaron mecanismos alternativos para eludir ese bloqueo.

Se dejó una pestaña de QA autenticada para que el usuario aplique el 200 % desde el menú del navegador. La referencia medida antes del ajuste es `devicePixelRatio=2`, ancho CSS 1718 y `zoom` CSS igual a 1. Falta verificar el cambio nativo y recorrer las vistas ampliadas. No se registra como aprobado ni se autoriza el merge por este resultado móvil solamente.

## Reproducción y código

- [Matriz de páginas](../../scripts/audit-dashboard-redesign.mjs).
- [Recorridos móviles](../../scripts/audit-dashboard-mobile-closure.mjs).
- [Estilos limitados al panel](../../apps/eve-web/app/(dashboard)/dashboard/_components/dashboard.css).
- [Conversaciones](../../apps/eve-web/app/(dashboard)/dashboard/_components/conversation-view.tsx).
