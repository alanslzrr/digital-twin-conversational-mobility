# Contexto meteorológico del itinerario — entrega local

28/09/2026. Alcance del [plan aprobado](../plans/2026-09-28-journey-weather.md), sin ampliar R1 ni reabrir E2/R2.1.

## Implementado y comprobado

- `plan_journey.weatherContext`: predicción municipal horaria y CAP pertinentes por alternativa, periodos/evidencias compartidos, precipitación en tramos a pie conocidos y clave determinista de relevancia. `get_environment` reutiliza los productos; las observaciones siguen siendo el comportamiento predeterminado.
- PostgreSQL existente: migración aditiva `0018`, 179 municipios IGN importados y caché por recurso; no por usuario/viaje. Dos territorios especiales sin código municipal AEMET quedan fuera. Los polígonos CAP oficiales delimitan zonas, conservando ambigüedad de frontera.
- Worker existente: demanda 30 min, revisión horaria 30 min/CAP 5 min, gate compartido de 10 s, leases de 45 s y backoff con `Retry-After`. Una actualización por ciclo; sin actividad/demanda no hay adquisición. Cache válida no provoca red, tampoco un horizonte ya conocido como ausente.
- Presupuesto de enriquecimiento: señal global de 2 s y hasta 500 ms para liberar leases. Consultas meteorológicas cancelables, sin pipeline ni transacciones abiertas, en un pool de dos conexiones a la misma base; no cambia el pool de otras funciones. AEMET fallido no invalida rutas.

## Evidencias

- `pnpm check`: lint/fronteras, typecheck, **334 pruebas offline** y builds Core/Web aprobados. `pnpm build:agent` aprobado, sin inferencias.
- `RUN_WEATHER_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/weather-cache.integration.test.ts`: **9 pruebas aprobadas** en esquema temporal eliminado después. Cinco lectores, reutilización, 304, atomicidad/backoff, caducidad/actividad, leases, geometría y cancelación incluso con pool ocupado.
- `pnpm smoke:mobility --weather-only`: MCP autenticado, tres rutas Atocha–Chamartín, consulta explícita de ambos productos y repetición desde caché. Resultado privado: `data/evaluation/journey-weather-smoke.json`. El smoke admite indisponibilidad meteorológica explícita; no confundirlo con disponibilidad del proveedor.
- OpenData autenticado y CAP reales normalizados/almacenados. Se observaron timeout y 429; el worker recuperó una predicción sin intervención sobre el backoff. Los CAP examinados eran `Minor` **para el 30/09**, no permiten afirmar «sin avisos» para el 28/09.
- Respaldo privado previo a `0018` en `data/backups/journey-weather/`; índice `pg_restore --list` verificado, no restauración. Importados 179 límites, hash IGN `77535172b4e27f61cafc124031eca941bc3dad8cd377ed9083c0d84d058f69f9`. Core/Web/agente/worker recompilados y arrancados; OTP y sus datos no se modificaron.

## Operación y límites

Arranque/parada: procedimiento existente en [operación local](../local-runtime.md). Para otra instalación, parar escritores, respaldar, `pnpm db:migrate`, importar el extracto oficial IGN ES30 con `node --env-file=.env.local scripts/import-weather-geography.mjs <GeoJSON>`, compilar y arrancar. El importador reemplaza límites transaccionalmente y exige los 179 municipios. AEMET usa la credencial existente únicamente en Core; CAP es público. No rotar claves ni desactivar TLS para resolver un fallo.

Una 304 conserva descarga/emisión/vigencia. Comprobación vencida o error produce evidencia antigua, nunca «último estado»; no se utiliza fuera de su periodo y se descarta como utilizable tras 24 h sin comprobación (predicciones también tras 24 h desde emisión). Ausencia de avisos exige cobertura completa de fenómenos/zona/periodo y comprobación reciente.

Semántica del **JSON autenticado**: acumulados de precipitación/nieve corresponden a la hora anterior según sus metadatos; bloques como `2002` ya expresan hora civil local y cruzan día. No aplicarles de nuevo el desplazamiento UTC descrito para otras presentaciones públicas. La ayuda del gráfico público usa otra convención para acumulados; no se mezclan ambas representaciones. Se omiten rachas cuya convención horaria no está suficientemente documentada y horas civiles ambiguas, no se inventan intervalos. `Ip` permanece traza menor de 0,1 mm.

Cobertura contextual municipal, no meteorología continua de la ruta: extremos/transbordos localizados, sin deducir exposición al exterior durante esperas. No se cambian rutas por meteorología. Multiestación y predicción diaria siguen pendientes; sin pantallas, notificaciones, seguimiento ni llamadas adicionales al modelo.
