# Pendientes: local primero

Vercel sigue siendo opcional. No se publica ni se aprovisiona nada para cerrar la evaluación local.

## Pasos 1–5 y estado comprobable

1. **OTP local:** imagen fijada, GTFS Madrid/OSM, grafo real y rutas Atocha/Chamartín/Sol. Benchmark reproducible. Pendiente certificar más pares, accesibilidad y pico de RAM de construcción; no afirmar cobertura Metro/EMT.
2. **Renfe real:** GTFS normalizado/importado, viajes/alertas oficiales JSON, snapshots, procedencia y matching. Pendiente replay masivo, regresiones con cambios diarios de feed y aplicar RT dentro del routing (ahora las rutas son previstas).
3. **Ingestión local adaptativa:** worker, ventana monótona de 30 min, leases, cadencias, backoff, dos carriles, deduplicación/read-through y retención. Pendiente pruebas de caída forzada en todos los puntos de persistencia; Queues no es un requisito local.
4. **Dominio/MCP:** resolución canónica, rutas, salidas, avisos, BiciMAD, aire/meteorología, tráfico, parking e índice histórico. Pendientes direcciones arbitrarias, identidades CRTM/Metro/interurbanos, estado de línea/red agregado y snapshot multidominio completo. No se registran esas capacidades sin implementación.
5. **Ampliación:** BiciMAD oficial, aire, tráfico, aparcamientos y observaciones AEMET de Madrid-Retiro integrados. **No cerrado:** las credenciales EMT están presentes pero el login devuelve HTTP 403/código 84; falta resolver autenticación e implementar/validar sus servicios. DGT requiere resolver acceso oficial DATEX y mapping. No confundir estos huecos con problemas de despliegue.

## Cierre de evaluación local

- Probar conversaciones de extremo a extremo con el modelo elegido cuando se autoricen llamadas de inferencia de validación; no basta con listar tools.
- Validar con hasta cinco usuarios: exactitud, fuente/edad, ausencia de datos, cancelaciones, ambigüedad y latencia.
- Mantener Web Chat oficial EVE, Better Auth, ACL y cuotas. No usar bypass de desarrollo.
- Resolver los puntos anteriores antes de considerar que funciona "TODO". Guía: [runtime local](local-runtime.md).

## Solo después: publicación opcional

- Decidir almacenamiento/worker/routing en Vercel a partir de mediciones, no de cuotas del brief.
- Adaptar disco local a almacenamiento durable cloud y worker a un mecanismo durable; no ejecutar el worker local dentro de Functions.
- Verificar licencias, límites, rotación de credenciales y retención/borrado físico de conversaciones.
- Obtener autorización explícita antes de desplegar. Recursos gratuitos previos siguen separados e intactos.
