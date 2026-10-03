# Mobility Core — selector de tema y cabecera mínima

[Índice](../index.md) · [Continuación V2](2026-10-03-core-dashboard-refinement-v2-continuation.md) · [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45) · [Evidencia](../audits/assets/core-dashboard-theme-header-2026-10-03/README.md)

## Alcance

Segunda revisión sobre `alanslzrr/core-dashboard` a petición del usuario: selector de tema `@ncdai/theme-switcher` con transición `@ncdai/theme-toggle-effect-circle-blur`, eliminación de acentos laterales (requisito crítico) y cabecera mínima con controles plegables. Solo presentación de `apps/eve-web`; sin cambios de contratos, lectores, endpoints, adquisición ni chat oficial. Sin despliegue ni merge.

Dependencia nueva: `next-themes` 0.4.6, instalada por el CLI de shadcn al añadir el registro `@ncdai` en `components.json`.

## Implementación

- **Tema limitado al panel.** `ThemeProvider` envuelve solo el layout del dashboard y escribe el tema resuelto en `<html data-dashboard-theme>` antes del pintado (clave `dashboard-theme`, `enableColorScheme` desactivado, transiciones suspendidas durante el cambio). Los tokens oscuros del panel pasan de `prefers-color-scheme` a ese atributo; la paleta del chat EVE en `globals.css` no cambia.
- **Transición circle-blur** portada a `dashboard.css` en lugar de `globals.css`, para que solo se cargue en rutas del panel. Usa `document.startViewTransition` con `flushSync`; se omite con movimiento reducido o sin soporte.
- **Accesibilidad del selector:** botones con `aria-pressed` dentro de `role="group"` "Theme" (el original usaba `role="radio"` sin grupo de radio), `type="button"` y etiquetas "Switch to … theme".
- **Sin acentos laterales:** la fila seleccionada del catálogo de Queries y del índice de sesiones usa solo fondo y peso de texto; la alerta de error tiene borde completo tenue en rojo. La navegación lateral ya usaba solo fondo.
- **Cabecera mínima:** sin borde inferior, fondo translúcido. Lectura, pausa, refresco, "Data timing" y selector de tema quedan en un grupo plegable (`inert` al plegarse, preferencia en `localStorage`). La píldora visible muestra siempre los estados anómalos (Paused, Reading, Read failed, Cached · refresh failed); el estado normal se reduce a un punto.
- **Móvil (≤ 767 px):** se oculta la hora de lectura; píldora y botones de 44 px de alto; botones de tema de 40×44 px para que la cabecera desplegada quepa en 390 px sin desbordamiento.
- Script de interacciones de auditoría: despliega los controles antes de pulsar "Data timing" y "Refresh stored data".

## Verificación

- `pnpm check` correcto (lint, tipos, pruebas y build de producción).
- Capturas 1440×1000 en oscuro y en claro forzado con sistema oscuro; detalle de conversación; móvil 390 px. Selección sin borde izquierdo ni sombra (`border-left-width: 0`, `box-shadow: none`), comprobado por estilos calculados.
- Las utilidades `dark:` de las primitivas shadcn siguen basadas en media query, pero no tienen efecto visible: las reglas sin capa de `dashboard.css` fijan fondo y hover de inputs y botones en ambos temas.
- La transición circle-blur se invoca al cambiar de tema (comprobado instrumentando `startViewTransition`); su animación no se captura en las imágenes estáticas.

## Límites

Siguen abiertos: zoom 200 %, lector de pantalla real, matriz móvil completa, fallo habitual de Sources y aviso de auditoría `braces`. En modo `next dev`, la primera petición de una carga completa se aborta (atribuido a StrictMode de desarrollo) y muestra "Unable to load stored data" hasta pulsar Refresh; no se volvió a verificar en build de producción en esta revisión.
