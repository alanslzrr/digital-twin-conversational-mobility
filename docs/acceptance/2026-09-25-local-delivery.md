# E8 — Entrega local integrada

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica · 25/09/2026.**

Fecha: 25/09/2026. R0 integrado mediante [PR #16](https://github.com/alanslzrr/digital-twin-conversational-mobility/pull/16), rebase hasta `1f4fdfe`. Los 44 commits conservan E1/E2 y separan las responsabilidades de E3–E6. E2 permanece cerrado.

## Ejecución

1. `pnpm check` antes de push: 242 pruebas offline aprobadas, 32 opt-in omitidas, lint/fronteras y tipos correctos; builds/tipos reutilizados de Turbo en ese check. `git diff --check` correcto. CI de PR #16 aprobado antes de integrar; sin omitir protección de rama.
2. `main` actualizado por fast-forward y sincronizado con remoto. Supervisor local anterior y sus hijos detenidos; Postgres, Redis y OTP conservados.
3. Backup privado `data/backups/e8-20260925T124254Z/database.dump`, custom format, índice verificado con `pg_restore --list`. Directorio 0700, archivos 0600. Incluye copia previa de export/manifiestos. No se realizó un restore de ensayo; el dump contiene datos privados y está excluido de Git.
4. Migrador transaccional aplicó **0008, 0009, 0010, 0011 y 0012**. Verificación posterior: las doce migraciones registradas. No se omitió el esquema E2 por estar desactivadas las campañas experimentales.
5. Export regenerado desde fuentes locales en directorio aislado: 570.002 stop_times; versión `3e1c13bd87510de02d228398d3618b4e0bc62d3faa3b7601aba0c409fba138cd`, idéntica al grafo. Copiado únicamente el export normalizado y reimportadas 95 estaciones, 118 rutas y 37.104 viajes con evidencia de destino. No se sobrescribieron archivos del OTP vivo ni se reconstruyó/reinició el grafo.
6. Builds Core/Web ejecutados **sin caché** (`pnpm exec turbo run build --force`) y `pnpm build:agent` correcto. Arrancado supervisor habitual actualizado con Core/Web/agente/worker; modo interactivo predeterminado, sin campañas.
7. Health Web/Core/agente HTTP 200. `pnpm smoke --production` aprobado: autenticación MCP, handshake, lista/llamada de herramientas y rechazo 401 de creación de sesión sin autenticar. Ambos carriles del worker registran heartbeat; ingestión normal reanudada dentro de la ventana de actividad.

## Límites y continuidad

No se ejecutaron nuevas conversaciones, inferencias, benchmarks ni despliegues cloud. La comprobación de arranque no vuelve a certificar E2. Los 15 tests PostgreSQL y smokes E6 previos siguen como evidencia; no se repitió una campaña completa. El arranque puede consultar proveedores dentro de su ventana normal; no se afirma que todas las fuentes estén frescas o disponibles.

El límite de secuencias circulares queda para E7: el guard RT no cubre todas las ambigüedades estáticas, y la revisión del GTFS actual no encontró viajes con paradas repetidas. Próximo trabajo: catálogo y llegadas EMT. Después, resto de operadores/fuentes/herramientas del roadmap.

Arranque, parada, actualización y rollback: [runtime local](../local-runtime.md). Para retroceder a un escritor previo a 0012 hay que parar escritores y restaurar base/código compatibles; no eliminar revisiones ni arrancar el código antiguo contra el esquema nuevo. Usar sesiones conversacionales nuevas tras esta entrega.
