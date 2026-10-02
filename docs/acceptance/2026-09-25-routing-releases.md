# Entrega local: geocodificación controlada y routing ampliado

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Fecha: 25/09/2026. Alcance: puntos 1–4 solicitados; no reabre R0/E2/E8 ni cierra DGT, replay, ampliaciones del brief o evaluación concurrente.

## Resultado y límite pendiente

- Checkout sincronizado tras PR #24; rama documental integrada retirada.
- PR #25: `resolve_address` instalado con búsqueda local primero, caché, consentimiento por consulta pública, ambigüedad/procedencia y límites globales. **Proveedor externo desactivado hasta elección informada del responsable**. No se hizo ninguna consulta geográfica externa ni se afirma que esa activación esté completada.
- PR #26: grafo Renfe/EMT/Metro Ligero/interurbanos, resolución MCP, correspondencias trazables, releases coordinados y reversibles, overlay RT Renfe y avisos EMT. Metro conserva catálogo pero no entra en el grafo por horarios caducados.

## Instalación y reversibilidad comprobadas

Supervisor anterior detenido tras verificar PID y directorio. Respaldo privado `data/backups/e7-routing-2026-09-25T20-40-06Z/database.dump`: 41.390.731 bytes; índice `database.toc` de 204 líneas legible. **No se ejecutó restauración completa de PostgreSQL.**

Migraciones 0015 y 0016 aplicadas después de 0001–0014. Preparación/build fuera del grafo activo; release `6eff064a52dbcea1b76d028697203b85b16a2ced4755fe40cd67695fbd6d0b5e`, 13.443 paradas y 2.183 patrones. Baseline reversible `784ca67fa9e308c5e92b14cf041b51485cec577c2f4fad4f2c4f6e288b90ea28`.

Se ejecutaron activación → rollback real al baseline → reactivación. En rollback se comprobó release activo y catálogo EMT deshabilitado conservando identidades; cada arranque OTP verificó el conjunto de feeds. Los cambios no restauraron ni sustituyeron cuentas o conversaciones. `data/otp` apunta al release ampliado y no queda journal pendiente. Builder repetido verifica/reutiliza el release, no lo sobreescribe.

Core/Web/agente/worker compatibles arrancados. Health Core, Web y EVE: HTTP 200; MCP sin autenticación: 401. El PID vigente se conserva en `data/runtime/local.pid`; log `data/runtime/e7-routing.log`.

## Comprobaciones proporcionales

- `pnpm check`: lint/fronteras, typecheck, **290 pruebas offline aprobadas**, 50 opt-in omitidas y builds Core/Web correctos.
- `pnpm build:agent`: correcto.
- **18 pruebas PostgreSQL** focales: seis CRTM, ocho EMT y cuatro geocodificación, en esquemas temporales eliminados.
- Importación real en esquema temporal: Metro 2.216 stop times, ML 38.983, interurbanos 1.241.147 y EMT 1.881.076; reintentos e identidades estables, reemplazo y rechazo de checksum incorrecto comprobados por el script existente.
- Smoke MCP de routing reutilizado: **15 casos aprobados**, 11 existentes y cuatro nuevos para EMT, ML, interurbanos y transbordo. Evidencia privada: `data/validation/routing-2026-09-25T20-58-06-733Z/result.json`.
- EMT Cuatro Caminos → Glorieta López de Hoyos presenta `frequency_planning_estimate` y headway 540 s, no salida exacta. Puerta de Boadilla → Sol combina ML/interurbano/Renfe con IDs de ambos lados de cada correspondencia y duración del tramo peatonal.
- Consulta MCP adicional con RT **real** desde snapshots existentes: `scheduled_with_partial_realtime`, `realtimeApplied=true`, dos alternativas con tramo estimado y otra sin matching; búsqueda suplementaria acotada a 1.800 s. Evidencia: `data/validation/routing-live-probe.json`. No se simularon lecturas ni se hicieron llamadas al modelo.
- `resolve_address` consultado por MCP: Atocha y Museo Nacional del Prado resueltos por catálogo. El fallback no configurado se declara como tal; la prueba no habilita un proveedor externo.

## Hallazgos incorporados y límites

Renfe omite `startDate` en el snapshot inspeccionado. Exigirla siempre dejaba todo en previsto: se reutiliza la política de día Madrid existente, limitada al mismo día civil de salida y ±2 h, declarando esa base. El delay global solo se propaga si todos los stop updates son compatibles; NO_DATA, duplicados o overrides contradictorios impiden esa propagación. Cancelaciones/paradas omitidas y conexiones perdidas descartan candidatos. No se garantizan conexiones ni exactitud operacional.

Hay 4.865 correspondencias API EMT↔GTFS por ID publicado y coordenadas ≤100 m, no cobertura total. La parada GTFS 273 no estaba en el catálogo API instalado; no se fusionó ni inventó. Una ruta con acceso peatonal por encima del límite solicitado se descartó sin relajar la preferencia. Una consulta desde una parada interurbana junto a Cercanías puede resultar óptimamente en Renfe directo; eso no prueba un transbordo entre redes.

Avisos EMT solo se adjuntan si su observación es fresca y su vigencia cruza el tramo; no se inventan desvíos. La fuente puede mantener un lastBuildDate antiguo aunque responda hoy. Llegadas EMT sin identidad GTFS demostrada permanecen separadas. RT CRTM, Metro vigente, accesibilidad operacional y cobertura completa de correspondencias siguen como límites explícitos.

Las búsquedas OTP son acotadas, no enumeran todas las conexiones posibles. No se añadieron campañas conversacionales, benchmarks, segundo ingestor ni despliegues cloud. [Operación/recuperación](../routing-releases.md); [roadmap restante](../roadmap.md).
