# Mobility Core — tercera auditoría del panel

[Índice](../index.md) · [Tema y cabecera](2026-10-03-core-dashboard-theme-header.md) · [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45) · [Evidencia](../audits/assets/core-dashboard-third-audit-2026-10-03/README.md)

> Evidencia histórica: la resolución posterior de Sources y del bloqueo de dependencias está en la [revisión previa al merge](2026-10-03-core-dashboard-merge-readiness.md).

## Alcance

Tercera revisión sobre `alanslzrr/core-dashboard`: revisión de código de las vistas del panel y recorrido visual en oscuro, claro y móvil. Se incorpora `text-effect` de motion-primitives (sin dependencias nuevas: `motion`, `lucide-react`, `clsx`, `tailwind-merge` y `cn` ya existían). Solo presentación de `apps/eve-web` y el arnés QA local; sin cambios de contratos, lectores, adquisición ni chat oficial. Sin despliegue ni merge.

## Hallazgos corregidos

| Hallazgo | Corrección |
| --- | --- |
| Las filas de Mobility no mostraban la hora de observación (el tooltip del mapa sí) | Cada fila muestra "Observed …", "Issued …" o "No observation time". Con BiciMAD (umbral 60 s) explica por qué una lectura de hace minutos es "Stale" |
| Los marcadores del mapa conservaban los colores del tema anterior hasta el siguiente refresco | El efecto del mapa recalcula colores al cambiar el tema resuelto |
| La leyenda del mapa nombraba estados sin colores | Leyenda con muestras que reproducen relleno y contorno discontinuo de los marcadores |
| Atribución de Leaflet blanca en oscuro | Especificidad corregida frente a `leaflet.css` |
| Textos de estado de inspección mezclaban español e inglés | Unificados en inglés, como el resto del panel |
| Etiqueta "Europe/Madrid · best-effort capture" duplicada en Activity | Se conserva la de la barra de herramientas, que también cubre la tabla |
| Animaciones del selector de tema y transición circle-blur sin preferencia de movimiento reducido en todos los caminos | `MotionConfig reducedMotion="user"` y regla CSS para `::view-transition-new(root)` |
| Píldora de estado y selector de tema por debajo de 44 px con puntero táctil en escritorio | Reglas de 44 px también para `pointer: coarse` |
| Reglas CSS sin uso (`.dc-table-footer`, `.rf-comparison`) | Eliminadas |
| El smoke QA en modo `--dev` fallaba de forma intermitente: `next dev` consulta `registry.npmjs.org` cuando un navegador abre el overlay | El guardia responde localmente 503 solo a esa URL exacta y solo con `DASHBOARD_QA_DEV=1`; cualquier otra salida sigue bloqueada y registrada |

## Título animado

Los títulos de página usan `TextEffect` (por palabra, opacidad, desplazamiento de 4 px y desenfoque de 4 px). Se descartó animar valores o estados para no sugerir cambios en los datos. El texto accesible se conserva (`sr-only` más segmentos `aria-hidden`). Con movimiento reducido, una regla CSS fija el estado final; no se usa una rama JavaScript porque el servidor no conoce la preferencia y provocaría un desajuste de hidratación. Adaptaciones al componente generado: tipos compatibles con `exactOptionalPropertyTypes` y estrechamiento seguro de `variants.container.visible`.

## Verificación

- `pnpm check` correcto: 508 pruebas, 99 omitidas; lint, tipos y build de producción.
- Smoke QA aislado: 36 comprobaciones HTTP y registro del guardia vacío con un navegador conectado al servidor de desarrollo.
- Movimiento reducido emulado: a mitad de animación la opacidad calculada del título es 1 y sin filtro.
- Revisados sin hallazgos: franjas laterales, `prefers-color-scheme` residual y utilidades `dark:` en componentes del panel.
- Los ceros de la fila "sin observación" son valores almacenados (`bikes: 0`, `docks: 0`), no desconocidos; la fila aparece atenuada y marcada como sin evidencia utilizable.

## Límites

Siguen abiertos: marcadores del mapa sin acceso por teclado (la lista sigue siendo la vía accesible), zoom 200 %, lector de pantalla real, fallo habitual de Sources y aviso de auditoría `braces`. El aviso de hidratación observado durante la prueba procedía del atributo `data-cursor-ref` inyectado por la automatización del navegador, no de la aplicación.
