# Corrección acotada tras el reporte conversacional E8

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica · 25/09/2026.**

E2 permanece cerrado; no se cambian límites, modelo, scheduler, OTP ni interfaz. Este trabajo reutiliza el reporte de cinco preguntas, no introduce otra campaña.

## Histórico y descubrimiento

La herramienta existía en Core, pero las instrucciones no la nombraban ni explicaban cómo consultar lo conocido entonces. La descripción de la conexión tampoco mencionaba el histórico. EVE 0.65 busca por palabras en nombres/descripciones y conserva las herramientas descubiertas como llamadas directas dentro de la sesión.

- Instrucciones explícitas para descubrir `get_historical_state`, usar `knowledge` al preguntar por lo conocido entonces y consultar antes de negar capacidad; nunca sustituir el histórico por la última captura del chat.
- `at` ISO sigue compatible; nuevo `minutesAgo` (0–1440), exactamente uno de ambos. Core calcula la fecha relativa desde su reloj y devuelve `timeReference` y `at`. No utiliza timestamps antiguos de observaciones. `event` sigue siendo el modo predeterminado del contrato por compatibilidad.
- Reloj de servidor renovado al inicio de cada turno mediante instrucciones dinámicas públicas de EVE; no se habilitan herramientas generales para obtener la hora.
- Guía de búsquedas por nombre exacto, agrupadas cuando proceda, y reutilización de funciones/IDs ya disponibles. No se añade otro registro/cache ni se eleva ningún límite.

## Resultado único y compatibilidad MCP

Core devuelve una única representación JSON en `content[].text`, sin duplicarla en `structuredContent`. Las herramientas no declaran `outputSchema`; texto es una respuesta MCP válida, conserva los clientes existentes y todos los campos de procedencia, ceros, nulos y errores. No se modifica el protocolo, autenticación ni los resultados históricos ya guardados en conversaciones.

En la consulta MCP puntual comprobada, el resultado ocupa **3.207 bytes**, frente a **6.096 bytes** de la misma respuesta con la copia estructurada anterior. Es una comparación de serialización, no de tokens ni una medición de ahorro global de la conversación. Sesiones anteriores pueden seguir conteniendo resultados duplicados y esquemas antiguos: iniciar una sesión nueva tras actualizar el agente.

## Renfe: problema delimitado, no declarado resuelto

Diagnóstico desde este equipo el 25/09/2026:
- `gtfsrt.renfe.com` resuelve A `213.144.50.27`; consulta AAAA sin datos.
- curl alcanza TCP en unos 25–33 ms, pero TLS no termina antes del timeout de conexión de 4–5 segundos. Se reproduce también forzando TLS 1.2; no es prueba de que IPv6 sea la causa (curl -6 mostró dirección IPv4 mapeada).
- Node aborta a los 8 segundos sin respuesta HTTP. Esto concuerda con el fallo local reportado, no demuestra caída global del proveedor ni permite distinguir servidor, ruta o filtrado intermedio.
- No se cambia de fuente, no se usa HTTP inseguro, no se desactiva validación TLS ni se añaden reintentos. Se mantienen el reintento acotado y el backoff existentes; las demás fuentes continúan.
- Se distinguen causas sanitizadas `upstream_connection_timeout`, `upstream_dns_error` y `upstream_tls_error` cuando Node aporta códigos reconocidos; sin causa conocida continúa `upstream_network_error`, y un aborto del plazo sigue siendo `upstream_timeout`. No se registran mensajes/URLs sensibles de errores.

Si persiste, siguiente acción externa: contrastar desde otra red autorizada o comunicar el fallo TLS al proveedor. No bloquear E7 ni afirmar recuperación de Renfe sin una lectura válida nueva.

## Verificación ejecutada

- `pnpm check`: **254 pruebas offline aprobadas**, 32 opt-in omitidas, lint/fronteras y tipos correctos; builds Core/Web correctos sin caché en la primera ejecución de esta corrección.
- `pnpm build:agent` correcto; incluye las instrucciones dinámicas.
- Regresiones: caso BiciMAD del reporte (678 estaciones/cinco muestras, observación antigua y knowledge); fechas relativas cruzando DST, medianoche y borde de retención; compatibilidad de fechas absolutas/event; rechazo de argumentos temporales ambiguos; respuesta MCP única; reloj entre turnos y errores de red sin secretos.
- MCP real en Core temporal 3011 con ingestión desactivada: catálogo expone `minutesAgo`, consulta relativa knowledge disponible, misma fecha absoluta devuelve idénticas observaciones, ambos argumentos rechazados y respuesta sin duplicación. Esquema habitual solo leído; proceso temporal eliminado. Evidencia local ignorada: `data/validation/post-e8-findings.json`.
- No se ejecutaron nuevas inferencias. La reducción de búsquedas y elección efectiva de herramienta por el modelo quedan sin medición posterior; las regresiones comprueban las instrucciones/configuración y el flujo determinista Core/MCP, no simulan una conversación exitosa.
