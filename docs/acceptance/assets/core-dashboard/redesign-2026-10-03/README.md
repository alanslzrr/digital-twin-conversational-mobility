# Evidencia sintética del rediseño

[Acta y límites](../../../2026-10-03-core-dashboard-redesign.md) · [PR #45](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/45)

Captura de aplicación en `22b1696`, agent-browser 0.38.2, Node 24.21.0 y pnpm 10.30.3. Servidores aislados de QA, PostgreSQL con esquema desechable, identidad Better Auth de fixtures; proveedores y modelos deshabilitados. No son datos de usuarios reales ni pruebas de disponibilidad de proveedores. No se incluyen cookies, tokens, variables de entorno ni HAR.

## Contenido

- `baseline/`: seis capturas anteriores a la implementación a 1440×1000, tema oscuro. El modo anterior copia evidencia pública retenida y añade fixtures; no es una baseline completamente sintética.
- `application/`: 72 PNG y snapshots de accesibilidad, informes axe y resultados de layout. Seis vistas, ambos temas, 1440×1000, 1280×800, 1024×768, 768×1024, 390×844 y 320×720. Capturas finales con `--synthetic-only`.
- `interactions/`: 35 comprobaciones correctas y capturas de escenarios. Fallos Sources/worker, refresh, ejecución desconocida y conversaciones vacías usan respuestas QA explícitamente simuladas con contratos válidos; no se ejecuta un proveedor.
- Logs: 17 tests de adaptadores/componentes; `pnpm check` con 491 correctos/99 omitidos opt-in; 26 SQL opt-in; 36 HTTP autenticados. `http-results.json` contiene nombres/resultados sin credenciales.
- `dependency-audit.json`: resultado real de auditoría, un high transitivo de Vercel. No cambia la dependencia ni el gate. Diff de manifests y lockfile vacío en este bloque.
- `sha256.json`: hashes de las capturas, snapshots e informes retenidos.

## Aceptación pendiente

No se ejecutó un lector de pantalla real con navegador ni el control nativo de zoom. CSS zoom 200% pasó como comprobación adicional, no sustitutiva. Axe detectó cero violaciones y dejó verificaciones incompletas que requieren revisión humana. El fallo original de Sources no se reprodujo: solo se corrige el defecto demostrado de presentación de error como vacío. T10 permanece diferido. Sin merge, despliegue, instalación habitual, llamadas de modelo ni adquisición.
