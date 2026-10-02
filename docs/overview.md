# El proyecto en diez minutos

[Índice de la wiki](index.md) · [Guía de uso](user-guide.md) · [Arquitectura](architecture.md)

## Qué aporta

Madrid Mobility Twin permite preguntar por desplazamientos y por el contexto de movilidad de Madrid en un único chat. Reúne información que, de otro modo, habría que buscar por separado: trenes, autobuses, horarios, incidencias, bicicletas, aparcamiento y meteorología.

El nombre «gemelo digital» describe una representación parcial de esa movilidad, actualizada con publicaciones oficiales. **No es un simulador de toda la ciudad.** Conserva qué dato recibió, de dónde procede y cuándo se observó.

Por ejemplo, puedes pedir un viaje de Atocha Cercanías a Chamartín, limitar cuánto quieres caminar y preguntar después por avisos. El sistema calcula itinerarios; el modelo explica las opciones. No inventa una ruta a partir de su memoria.

## Qué puedes hacer

| Necesidad | Qué ofrece hoy | Ejemplo de pregunta |
| --- | --- | --- |
| Moverte en transporte público | Itinerarios con Renfe, EMT, Metro Ligero, interurbanos y tramos a pie | «Ve de Atocha Cercanías a Chamartín; como máximo 15 minutos andando y dos transbordos» |
| Saber cuándo llega un autobús | Llegadas EMT de la parada elegida, destino y edad de la estimación | «Próximas llegadas EMT de la parada 72» |
| Consultar trenes y horarios | Salidas Renfe; horarios estáticos CRTM con calendarios y frecuencias | «Próximas salidas desde Atocha Cercanías» |
| Ver avisos | Incidencias Renfe/EMT por línea y DGT por carretera o zona | «¿Qué avisos hay en la C-5?» |
| Encontrar lugares | Estaciones, paradas y lugares públicos; pide aclaración si hay varias coincidencias | «Busca el Museo del Prado para planificar desde allí» |
| Usar BiciMAD | Bicicletas y anclajes publicados por estación | «¿Hay BiciMAD cerca de Atocha?» |
| Conocer el tiempo | Observaciones por estación, predicción horaria/diaria y avisos pertinentes al viaje | «¿Qué tiempo se espera para este desplazamiento?» |
| Consultar el entorno | Mediciones de aire y sensores de tráfico municipal | «Muéstrame NO2 y la hora de la medición» |
| Aparcar | Ocupación publicada; tarifas contrastadas en 15 aparcamientos EMT y coste orientativo | «¿Cuánto costarían 120 minutos en Plaza Mayor?» |
| Revisar información anterior | Publicaciones de movilidad retenidas y sus correcciones | «¿Qué sabía el sistema de BiciMAD hace diez minutos?» |
| Continuar una conversación | Listado propio y reapertura del chat original | Abre **Mis conversaciones** |

Son ejemplos de uso, no resultados medidos hoy. La [guía](user-guide.md) explica cómo interpretar las respuestas y la [referencia](reference/mcp.md) detalla cada consulta.

## Qué hay detrás del chat

1. **Better Auth** comprueba quién eres. Es la biblioteca de acceso con usuario y contraseña.
2. **EVE** proporciona el chat oficial y coordina la conversación y sus herramientas.
3. **GPT-6 Luna** interpreta la pregunta y redacta la explicación. Se conecta directamente a OpenAI, sin Gateway.
4. **MCP**, un protocolo de herramientas, permite a EVE pedir operaciones concretas a **Mobility Core**, nuestro servidor de movilidad.
5. **Mobility Core** consulta datos almacenados, adquiere nuevas publicaciones cuando corresponde y usa **OpenTripPlanner (OTP)** para calcular rutas.

Hay **un servidor MCP con 16 herramientas**, no un servidor por proveedor. El modelo no recibe claves EMT/AEMET ni descarga directamente datos de esos proveedores. [Diagrama completo](architecture.md#arquitectura-general).

## Qué ocurre mientras nadie lo usa

El ordenador mantiene los procesos locales arrancados, pero las descargas periódicas se limitan a una ventana de actividad de 30 minutos. Una nueva consulta normal reactiva esa ventana. Los datos almacenados se reutilizan entre usuarios: no se descarga todo Madrid cada vez que alguien pregunta.

La meteorología de un viaje también usa caché compartida. Una predicción que ya existe puede servir para varios itinerarios. La hora de descarga no sustituye la hora de la observación.

## Alcance acordado

La evaluación ya reúne las capacidades de **R0 y R1**, además del historial de conversaciones **R2.1**. No tiene un cierre R2 adicional pendiente. Se retiraron esas obligaciones; no se ejecutaron por el hecho de retirarlas.

Metro de Madrid conserva catálogo, pero no horarios actuales ni rutas en Metro. No se añadieron rutas en bici/coche, nuevas asociaciones de tiempo real para otras redes ni estado operativo de ascensores. Son exclusiones acordadas, no una lista de tareas a completar. [Alcance exacto](roadmap.md).

El sistema funciona localmente, pero necesita Internet para OpenAI y para adquirir fuentes. Los recursos cloud preparados no significan que haya un despliegue. [Local frente a cloud](deployment.md).

## Cómo llegamos hasta aquí

Primero se separó el chat del motor de movilidad. Después se corrigieron rutas y controles de conversación, se consolidó la actualización de datos y se añadieron fuentes. Las últimas entregas aportaron historial de conversaciones, meteorología del itinerario, accesibilidad estática y precios de aparcamiento.

La [historia por etapas](evolution.md) conecta cada avance con su PR y evidencia. El [registro de fuentes](sources/README.md) explica de dónde sale cada dato.
