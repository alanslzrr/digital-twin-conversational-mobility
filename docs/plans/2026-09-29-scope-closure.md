# Ajuste de alcance aprobado: cerrar sin ampliación Metro

Fecha: **29/09/2026**. Encargo para integrar y entregar; **no implementar otro proveedor**.

## Decisión y lecturas

El usuario ha aprobado excluir del cierre de esta evaluación **horarios/routing actuales de Metro de Madrid y las correspondencias adicionales CRTM↔EMT/Renfe propuestas**. No son tareas bloqueadas ni funcionalidades completadas: quedan **fuera del alcance acordado**. No investigar otra vez, esperar un feed, solicitar claves ni proponerlas como siguiente bloque.

Leer `AGENTS.md`, el [roadmap vigente](../roadmap.md), la [investigación de alternativas](../research/2026-09-29-metro-alternatives.md) y la [operación de releases](../routing-releases.md). Evidencia: [Mobility Database](https://mobilitydatabase.org/feeds/gtfs/mdb-794) distribuye el mismo ZIP caducado y [Transitous #2315](https://github.com/public-transport/transitous/issues/2315) documenta esa misma dependencia. HERE/Google no se han elegido ni autorizado.

Base investigada: `main` en `b8892d8`. En `alanslzrr/metro-crtm-plan` hay documentación local **sin commit** de esta investigación y planificación. Revisar el estado real y conservarla; no resetear ni borrar trabajo. Reutilizar esta rama si sigue disponible, sin crear otro worktree innecesario.

## 1. Conservar exactamente las capacidades entregadas

- Renfe, EMT, Metro Ligero, interurbanos y caminatas dentro de la cobertura/versiones de OTP; RT/alertas Renfe y avisos EMT con sus límites existentes.
- Catálogo Metro, UUIDs, procedencia, accesibilidad estática y correspondencias **ya implementadas**. Metro de Madrid y Metro Ligero no son la misma cobertura.
- Consulta estática CRTM existente: mantener validación de calendarios y respuesta de no disponibilidad para Metro fuera de vigencia. No eliminar soporte para fechas históricas admitidas por el contrato actual.
- Better Auth, EVE oficial, `gpt-6-luna` directo, historial conversacional, meteorología, ingestión y demás fuentes.

**No cambiar algoritmos, contratos funcionales, selección de rutas ni datos para realizar una exclusión documental.** Un lugar del catálogo Metro puede seguir siendo origen/destino de una ruta válida de otra red; no bloquear su UUID de forma global ni presentar esa ruta como trayecto en Metro.

## 2. Cambios concretos

1. Consolidar en `docs/roadmap.md` la exclusión aprobada, sin casillas pendientes de obtener Metro o ampliar las correspondencias retiradas. Los demás pendientes de R1/R2 siguen como están: no cerrar todo el roadmap ni excluir otras capacidades por analogía. El [plan anterior](2026-09-29-metro-crtm-coverage.md) debe permanecer retirado y apuntar a este encargo.
2. Alinear **solo los resúmenes vigentes de cobertura** en `README.md`, `docs/architecture.md`, `docs/local-runtime.md` y `docs/sources/crtm.md`. Hay texto antiguo que presenta EMT/DGT como pendientes, routing solo Renfe o RT Renfe separado del itinerario. Corregir esas contradicciones con las entregas registradas, sin reescribir actas históricas ni procedimientos operativos ajenos.
3. Alinear las instrucciones/descripciones consumidas por el agente: `apps/eve-web/agent/instructions.md`, `apps/eve-web/agent/connections/mobility.ts` y el texto de cobertura de `apps/mobility-core/src/crtm.ts`. Revisar las descripciones MCP pertinentes y cambiar únicamente las que contradigan el alcance. Diferenciar «esta herramienta consulta horarios estáticos» de «el sistema no ofrece routing multioperador»; la segunda afirmación ya es falsa para las redes admitidas.
4. Conservar estos documentos y sus fuentes. La investigación describe alternativas estudiadas, no tareas nuevas. No copiar archivos raw, ZIP, credenciales ni contenido de `data/` a Git.

Mensaje de cobertura que debe quedar inequívoco:

> El sistema planifica con Renfe, EMT, Metro Ligero, interurbanos y caminatas dentro de los datos disponibles. Metro de Madrid conserva catálogo, pero no ofrece horarios actuales ni trayectos en Metro en esta evaluación. Las correspondencias existentes son parciales y no garantizan accesibilidad ni tiempos de transbordo.

Ante una petición exclusivamente en Metro, explicar esa limitación; se puede ofrecer otra red, **sin sustituir silenciosamente el modo pedido**. No afirmar que Metro real está cerrado, que no circulan trenes o que se incorporará próximamente. No es necesario crear un mensaje fijo ni lógica nueva si las instrucciones existentes bastan.

## 3. Límites y comprobaciones

- Sin migraciones, imports/backfills, descargas, tablas, nuevas herramientas, dependencias, cuentas, proveedores, cambios de grafo/configuración OTP ni nuevas reglas de matching. Sin llamadas al modelo, benchmarks, campañas o despliegues cloud.
- Comprobar diff y enlaces locales. Ejecutar **`pnpm check` antes del push** y `pnpm build:agent` si cambian instrucciones/conexión. No exigir nuevos tests de base de datos para cambios solo descriptivos; corregir únicamente las expectativas existentes afectadas.
- Si se actualizan textos servidos por Core/EVE, recompilar y actualizar solo el runtime de aplicaciones según el runbook; **no detener/reiniciar OTP ni aplicar migraciones**. Si solo cambia documentación, no reiniciar nada.
- Tras actualizar aplicaciones: health/autenticación y una muestra MCP acotada de resolución Metro y rechazo de horario actual caducado, reutilizando las pruebas existentes. No nueva batería de rutas ni inferencia; no presentar un smoke MCP como comprobación conversacional del modelo.

## 4. Entrega y criterio de terminado

Commits pequeños y técnicos, PR en inglés con pruebas realmente ejecutadas, CI, integración, `main` limpio/sincronizado y retirada solo de la rama integrada. Registrar en la PR qué cambió, qué se excluyó y si hubo actualización del runtime; no crear otra auditoría como requisito.

**Terminado cuando** el alcance aprobado y la cobertura que describe el sistema son coherentes, las funciones existentes permanecen intactas y la entrega está integrada. Metro y las nuevas correspondencias no quedan como deuda bloqueante. Informar de los otros pendientes reales del roadmap sin iniciar otro bloque ni declarar R1/R2 completos.
