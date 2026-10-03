# Evidencia nueva de R1–R5 · 03/10/2026

[Acta y límites](../../../acceptance/2026-10-03-core-dashboard-independent-fixes.md) · [Hallazgos y fallos originales](../../2026-10-02-core-dashboard-review.md#contraste-independiente-del-03102026)

Veinte inspecciones ejecutadas con **agent-browser 0.38.2** contra Web/Core compilados en 3002/3003, Better Auth real e identidades sintéticas. `results.json` conserva tamaño, tema, resultados axe e indeterminados; `functional.json` registra los cinco recorridos. Los archivos `*-axe.json` conservan la salida de accesibilidad y `*.txt` las instantáneas interactivas.

- `section-*`: las seis vistas a 1440×900 en claro, recién abiertas.
- `R1-*`: mapa/lista DGT y coordenadas anidadas; captura completa para incluir el punto y la tabla. La capa de puntos usa Canvas, por lo que se comprueba dibujo no transparente y respuesta de mapa, no un selector SVG inexistente.
- `R3-*`: categoría B elegida y conservada tras abrir el detalle y volver.
- `R4-*`: 24 h, 1 h y cambio de un solo extremo con el teclado del control de fecha nativo. Los campos son UTC; gráfico y tabla muestran Madrid.
- `R5-*`: sin consulta, consulta vacía reciente y consulta antigua. La reserva pendiente también se verifica funcionalmente, sin una captura adicional.
- `R2-*`: fuentes de avisos deshabilitadas con observación DGT reciente explícitamente sintética; M3 muestra «Sin dato».
- `responsive-*`: Resumen y Actividad a 390×844, claro y oscuro, con movimiento reducido.

Las capturas son de viewport salvo R1. Algunas conservan el desplazamiento resultante de la interacción. No son una nueva matriz de 72 pantallas ni evidencia de datos reales en directo. Los cinco indeterminados de axe requieren revisión humana; cero incidencias detectadas no certifica accesibilidad completa.

## Repetir en aislamiento

Primero compilar con `pnpm check`. No recompilar mientras el preview esté activo. Con PostgreSQL local ya configurado:

```sh
node --env-file=.env.local scripts/test-dashboard-local.mjs --preview
# En otra terminal, usando la CLI externa ya instalada:
AGENT_BROWSER_BIN=/ruta/al/bin/agent-browser.js \
  node --env-file=.env.local scripts/audit-dashboard-independent.mjs
```

El script exige esquema `dashboard_qa_*` local, usa un navegador propio y limita sus dominios a localhost y teselas OSM. R5 y R2 modifican solo fixtures de ese esquema; no hacerlo sobre una instalación habitual. No ejecuta herramientas ni adquiere datos. Terminar el preview con SIGTERM para cerrar sus hijos y eliminar su esquema; comprobar después que 3002/3003 quedan libres y el esquema ya no existe.
