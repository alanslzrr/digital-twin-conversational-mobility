# Idioma global de interfaz

## Alcance

ES/EN en login, historial, controles oficiales EVE y las seis vistas del panel.
Español inicial. Solo presentación: el idioma del agente, conversaciones anteriores,
Markdown, código, nombres oficiales, instrucciones de proveedores y JSON técnico no
se traducen. No cambia contratos, permisos, cuotas, adquisición ni alcance operativo.

## Arquitectura

- `next-intl` **4.14.9**, fijado; plugin compuesto con `withEve`. Sin middleware de
  idioma, segmentos localizados ni endpoints adicionales.
- El layout raíz resuelve `mobility-locale` desde servidor: únicamente `es`/`en`;
  cookie ausente, inválida o desconocida → `es`.
- Cookie no sensible: `Path=/`, `SameSite=Lax`, `Max-Age=31536000`, `Secure` en HTTPS;
  legible por cliente, sin DB ni asociación a una cuenta. Logout no la elimina.
- `UiProvider` global estable incluye ambos catálogos locales. El cambio actualiza
  estado, cookie y `html.lang`; no navega, recarga ni ejecuta `router.refresh()`.
  Si cookies están bloqueadas, sigue funcionando en memoria durante esa sesión.
- Ningún provider de identidad/datos/EVE ni clave React depende del idioma.
  Fetches, streaming y borradores son independientes de la presentación.
- Catálogos tipados por namespaces; tests comprueban paridad, interpolaciones y
  formato ICU de **todos** los mensajes. Las tablas de copia propia heredadas usan
  un mapping explícito, nunca traducción externa ni manipulación del DOM.
- Errores conservan sus valores originales y se traducen al renderizar, no al
  recibirlos. Los textos técnicos conocidos tienen mappings locales; valores
  desconocidos e identificadores conservan un fallback original seguro.
- Números/fechas: `es-ES`/`en-GB`, zona `Europe/Madrid`. Los ISO y helpers de tiempos
  civiles, GTFS y cambios horarios permanecen intactos.
- Leaflet actualiza títulos y tooltips existentes sin reconstruir mapa/viewport.
  Se preserva la atribución oficial y la política de tiles raster anónimos.

## Controles

Selector ES/EN en login, controles externos del chat y cabecera del panel junto
al tema. También dentro de los detalles/filtros modales del panel: la captura de
foco de Radix no debe impedir cambiar idioma con el detalle abierto.

Botones con `aria-pressed`, etiquetas Español/English, foco visible, Tab/Enter,
flechas izquierda/derecha y Home/End. Transiciones respetan movimiento reducido.
El selector del panel permanece visible también con controles de lectura plegados.

Para nuevos textos propios, añadir una clave semántica en ambos catálogos y usar
`useUi().t`. No pasar contenido de conversaciones/proveedores/telemetría a `copy`.
No traducir valores serializados, claves React, IDs de opciones ni filtros.

## Validación local (2026-10-04)

- `pnpm check`: lint, boundaries, typecheck, **524 tests pasados / 100 omitidos**
  (83 archivos pasados / 11 omitidos) y builds de ambas apps.
- `pnpm build:agent`: runtime EVE compilado sin inferencias.
- `pnpm audit` y `pnpm audit --prod`: cero vulnerabilidades notificadas.
- **14 tests de idioma**: cookie ausente/inválida/bloqueada, atributos y persistencia;
  paridad, ICU completo, interpolación/plurales, formatos y transición civil de
  Madrid; provider estable, borrador/mensajes/foco, teclado y EVE simulado durante
  streaming/reanudación; controles nativos de límite y respuesta `continue` original.
- Arnés existente `scripts/test-dashboard-local.mjs --preview --synthetic-only`:
  **37 comprobaciones HTTP**, esquema/cuentas sintéticos desechables, sin worker
  ni copia de evidencia habitual, guardia de red aislada.
- `scripts/audit-ui-i18n.mjs`: **55 comprobaciones de navegador** y 48 capturas de
  las seis vistas × ES/EN × claro/oscuro × 320/390 px, con movimiento reducido. Primer render ES, recarga EN,
  navegación/logout, mismo textarea/borrador, mismo mapa/filtros y mismo detalle
  con error de hora civil actualizado; sin errores de hidratación/clave ausente.
  Evidencias locales regenerables en `tmp/ui-i18n/` (no versionadas).
- `git diff --check` y revisión del diff: cambios limitados a interfaz, pruebas,
  configuración de internacionalización, dependencias y documentación.

Reproducción: ejecutar el arnés aislado después del build, establecer
`AGENT_BROWSER_BIN` al CLI instalado y ejecutar `node scripts/audit-ui-i18n.mjs`.
Cerrar el arnés con SIGINT para eliminar su esquema y detener solo sus procesos.

### Límites reales de la validación

Streaming, reanudación y aprobación se verifican con hook EVE simulado y componentes
reales, no con inferencias ni una sesión real del proveedor. Los tests de integración
que requieren servicios/credenciales siguen omitidos por sus guards habituales.
No se reinicia el runtime habitual, habilita cloud, despliega, hace push o merge.
