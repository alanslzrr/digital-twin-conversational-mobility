# Accesibilidad estática declarada — entrega local

29/09/2026. Ejecutado el [plan acotado](../plans/2026-09-29-static-accessibility.md); no cierra R1 completo.

## Implementación y comprobaciones

- Las cuatro herramientas existentes exponen declaraciones GTFS por parada y viaje, con identidad, versión, procedencia y fechas. Herencia solo del padre válido del mismo feed; itinerarios deduplican evidencia sin cambiar selección, orden ni restricciones de OTP.
- `pnpm check`: lint, fronteras, tipos, **344 pruebas offline** y builds correctos; 69 pruebas PostgreSQL opt-in omitidas en esa ejecución. Build del agente correcto.
- PostgreSQL aislado: **13 pruebas** (7 nuevas de accesibilidad y 6 CRTM), con backfill idempotente, importación y rollback, identidades conservadas, cambio de versión y fallo de lectura aislado mediante savepoint. Las 7 nuevas se repitieron tras añadir la fecha de incorporación del padre.
- MCP autenticado (`pnpm smoke:mobility --accessibility-only`): Renfe Atocha/Chamartín y salidas, CRTM Colonia Jardín y horarios, EMT 72 desconocido. Planificación con `wheelchair=false` y `true`: tres alternativas cada una, meteorología conservada y `accessibilityGuaranteed=false`. Herencia y negativos adicionales comprobados mediante fixtures, no atribuidos a una muestra real inexistente.
- Web, Core y EVE responden 200 en sus health checks; worker habitual activo. Sin inferencias ni nueva campaña.

## Instalación y recuperación

Se detuvo únicamente el supervisor de aplicaciones; respaldo privado `data/backups/static-accessibility/pre-0019.dump` con índice legible (sin ensayo de restauración). Aplicada migración **0019** y backfill de **95 paradas / 37.104 viajes** desde el export verificado de la release activa `6eff064a52dbcea1b76d028697203b85b16a2ced4755fe40cd67695fbd6d0b5e`; versión Renfe `3e1c13bd87510de02d228398d3618b4e0bc62d3faa3b7601aba0c409fba138cd`. Core/Web/agente recompilados y supervisor normal reiniciado con worker.

Para otra instalación local: seguir el [runbook](../local-runtime.md), detener aplicaciones, respaldar, ejecutar `pnpm db:migrate`, después `node --env-file=.env.local scripts/backfill-renfe-accessibility.mjs`, compilar Core/Web/agente y arrancar. El backfill rechaza otra release/export y es transaccional; no usar un export diferente para sortear el rechazo. Las futuras importaciones y rollback de releases incorporan los atributos mediante el importador Renfe existente.

No se reconstruyó ni reinició OTP. SHA-256 de `graph.obj`, `graph-manifest.json` y `manifest.json` idénticos antes/después; evidencia privada en `data/evaluation/accessibility-{before,after}-graph.sha256` y `static-accessibility-smoke.json`. Migración aditiva: para retirar aplicación, volver al build previo manteniendo columnas; cualquier restauración completa requiere detener aplicaciones y evaluar los datos posteriores al respaldo.

## Límites que permanecen

EMT omite atributos: desconocido, no negativo ni declaración de flota trasladada a vehículos. ML2/ML3 conserva el código 2 y la discrepancia con MLO de la versión investigada; no se corrige por suposición. Metro caducado solo aporta evidencia histórica. Tipo de ubicación y herencia no acreditan todos los andenes, transbordos, caminatas ni equipos operativos; no hay garantía de accesibilidad del recorrido.
