# Guía de uso

[Índice](index.md) · [Qué ofrece](overview.md) · [Problemas frecuentes](troubleshooting.md)

## En esta página

- [Entrar y conversar](#entrar-y-conversar)
- [Consultas útiles](#consultas-útiles)
- [Interpretar resultados](#interpretar-resultados)
- [Historial y continuidad](#historial-y-continuidad)

## Entrar y conversar

1. Pide al responsable una cuenta de evaluador. No hay registro público.
2. Abre [EVE local](http://127.0.0.1:3000/evaluation) en el ordenador que ejecuta el proyecto.
3. Inicia sesión con las credenciales recibidas por un canal privado.
4. Describe el desplazamiento o la consulta. Incluye origen, destino y hora si quieres una ruta.
5. Si aparecen varios lugares, confirma el correcto antes de continuar.

Usa `127.0.0.1`, no alternes con `localhost`: el origen configurado forma parte de la protección de acceso. El chat es el oficial de EVE. Los mensajes admiten hasta 1.800 caracteres y los adjuntos están deshabilitados.

## Consultas útiles

Estas preguntas son **ejemplos**, no una campaña pendiente ni resultados garantizados. No hace falta ejecutarlas todas. Cada mensaje al modelo consume créditos del proveedor configurado.

| Quiero comprobar o utilizar… | Pregunta de ejemplo | Qué debería quedar claro en la respuesta |
| --- | --- | --- |
| Ruta | «Quiero ir ahora de Atocha Cercanías a Chamartín en tren. Máximo 15 minutos a pie y dos transbordos» | Alternativas, tramos, base prevista y estimaciones disponibles |
| Aclaración | «Busca Moncloa» | Candidatos cuando haya distintos lugares o redes |
| EMT | «Próximas llegadas EMT de la parada 72, con destino y antigüedad» | Estimación del proveedor, no un horario inventado |
| CRTM | «Busca Colonia Jardín en Metro Ligero y sus próximos horarios» | Día de servicio, horarios o intervalos de frecuencia |
| Avisos | «¿Qué avisos hay en la C-5?» | Línea reconocida y avisos retenidos; sin equiparar vacío con servicio normal |
| Carreteras | «¿Hay incidencias publicadas por DGT en la A-6?» | Publicación, ubicación y vigencia, no duración calculada del viaje |
| BiciMAD | «BiciMAD cerca de Atocha: bicicletas y anclajes» | Antigüedad por estación; cercanía en línea recta |
| Meteorología observada | «Observación meteorológica cerca de Aranjuez» | Estación, distancia, hora y periodo de cada medida |
| Predicción | «Predicción diaria para Madrid mañana» | Fecha, intervalos, probabilidad y extremos; no temperatura exacta a una hora |
| Aire/tráfico | «NO2 disponible y hora de observación» / «Tráfico medido en la Castellana» | Medición y fuente; no consejo sanitario ni tiempo de recorrido |
| Parking | «Precio orientativo de 120 minutos en Plaza Mayor y ocupación disponible» | Precio y ocupación separados; condiciones del importe |
| Histórico de movilidad | «¿Qué sabía el sistema de BiciMAD hace diez minutos?» | Modo `knowledge`, hora calculada por Core y datos retenidos |
| Resumen | «Resumen de movilidad y fuentes con datos antiguos» | Componentes con tiempos propios y cobertura parcial |

Para un lugar público fuera del catálogo, el chat puede pedir permiso para buscarlo en Nominatim. No envíes domicilios personales ni información confidencial. [Cómo funciona esa búsqueda](sources/geocoding.md).

## Interpretar resultados

**Previsto** es el horario del operador. **Estimado** incorpora información publicada adicional. **Observado** es una medida del proveedor. Ninguno de estos términos significa por sí solo «puntual» o «garantizado».

Mira estos cuatro datos:

1. **Fuente:** quién publicó la información.
2. **Hora de observación/publicación:** a qué momento corresponde.
3. **Antigüedad:** cuánto tiempo ha pasado; descargarla de nuevo no la rejuvenece.
4. **Cobertura:** qué parte de tu pregunta se pudo resolver.

Un destino desconocido no es una parada elegida al azar. Una ausencia de avisos no demuestra normalidad. Una plaza sin lectura no significa cero plazas. Cuando falta información secundaria, como el tiempo, las rutas pueden seguir disponibles.

En aparcamiento puedes obtener un coste orientativo, un máximo o una condición de gratuidad. Una proyección futura usa precios conocidos, no confirma la tarifa que cobrará la caja ese día. [Detalle de tarifas](acceptance/2026-10-01-parking-prices.md).

La preferencia de silla de ruedas conserva lo que pediste y muestra declaraciones de parada/vehículo. No comprueba en vivo ascensores ni todo el recorrido. [Accesibilidad entregada](acceptance/2026-09-29-static-accessibility.md).

## Historial y continuidad

- **Mis conversaciones** lista tus chats vigentes, con fecha de creación y páginas de veinte.
- Selecciona una conversación para reabrirla con EVE. No accedes a chats de otros usuarios.
- **New chat** abre una conversación nueva, sin borrar la anterior.
- Si el contenido ya no está disponible, se informa del error; no se crea otra conversación de forma silenciosa.
- Al alcanzar los límites de continuidad, EVE muestra **Approve / Stop**. Aprobar permite continuar; detener cancela el turno y conserva la historia.
- Cierra sesión con **Logout** cuando termines.

El acceso a una conversación caduca por defecto a los siete días de registrarla. Caducar el acceso no borra físicamente los mensajes. [Cuentas y retención](evaluation.md).

El **historial de conversaciones** guarda la conversación. El **histórico de movilidad** permite consultar publicaciones retenidas. Son funciones distintas; [diagrama y permisos](architecture.md#dos-históricos-distintos).

**Fuentes:** [interfaz oficial y adaptaciones](../apps/eve-web/vendor/eve/README.md), [contratos MCP](reference/mcp.md), [acta del historial](acceptance/2026-09-28-conversation-history.md), [cierre E2](acceptance/2026-09-25-e2-closure.md).
