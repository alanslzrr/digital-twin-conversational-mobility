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

## Zoom nativo: verificado el 4 de octubre

El usuario aplicó el 200 % en el navegador integrado. La inspección posterior registró `devicePixelRatio=4`, ancho CSS 437 y alto 427, con `zoom` CSS igual a 1; no se aplicó una emulación CSS ni un viewport artificial. La referencia anterior de DPR 2 correspondía a otra ventana, por lo que no se comparan sus anchuras.

Se recorrieron las seis vistas mediante la navegación, el mapa, el formulario de consulta sin ejecutarlo, los filtros de actividad y las cinco pestañas de conversación. Ninguno de los doce estados medidos desbordó horizontalmente el documento. La cabecera expandida conservó sus controles; el formulario admitió escritura; los filtros mantuvieron acciones visibles y contenido desplazable. La prueba se limita a este navegador, tema oscuro y tamaño de ventana; no equivale a aceptación visual universal.

- [Mediciones de doce estados](../audits/assets/core-dashboard-zoom-2026-10-04/measurements.json).
- [Cabecera](../audits/assets/core-dashboard-zoom-2026-10-04/header-200.png).
- [Formulario](../audits/assets/core-dashboard-zoom-2026-10-04/query-form-200.png).
- [Uso de conversación](../audits/assets/core-dashboard-zoom-2026-10-04/conversation-usage-200.png).

El entorno aislado volvió a superar 37 comprobaciones HTTP autenticadas. Datos sintéticos, sin llamadas al modelo ni ejecución manual de herramientas. Cerrada la comprobación de zoom; el merge queda sujeto a la CI del commit final.

## Reproducción y código

- [Matriz de páginas](../../scripts/audit-dashboard-redesign.mjs).
- [Recorridos móviles](../../scripts/audit-dashboard-mobile-closure.mjs).
- [Estilos limitados al panel](../../apps/eve-web/app/(dashboard)/dashboard/_components/dashboard.css).
- [Conversaciones](../../apps/eve-web/app/(dashboard)/dashboard/_components/conversation-view.tsx).
