# El proyecto en diez minutos

[Índice de la wiki](index.md) · [Guía de uso](user-guide.md) · [Arquitectura](architecture.md)

## Qué aporta

mobai permite preguntar por desplazamientos y por el contexto de movilidad de Madrid en un único chat. Reúne información que, de otro modo, habría que buscar por separado: trenes, autobuses, horarios, incidencias, bicicletas, aparcamiento y meteorología.

El nombre «gemelo digital» describe una representación de esa movilidad, actualizada con publicaciones oficiales. Conserva qué dato recibió, de dónde procede y cuándo se observó.

Por ejemplo, puedes pedir un viaje de Atocha Cercanías a Chamartín, limitar cuánto quieres caminar y preguntar después por avisos. El motor de rutas calcula los itinerarios a partir de horarios y calles; el modelo explica las opciones.

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

La [guía de uso](user-guide.md) explica cómo interpretar las respuestas y la [referencia MCP](reference/mcp.md) detalla cada consulta.

## Qué hay detrás del chat

1. **Better Auth** comprueba quién eres. Es la biblioteca de acceso con usuario y contraseña.
2. **EVE** proporciona el chat oficial y coordina la conversación y sus herramientas.
3. **El modelo de lenguaje** interpreta la pregunta, solicita las herramientas necesarias y redacta la explicación a partir de sus resultados.
4. **MCP**, un protocolo de herramientas, permite a EVE pedir operaciones concretas a **Mobility Core**, nuestro servidor de movilidad.
5. **Mobility Core** consulta datos almacenados, adquiere nuevas publicaciones cuando corresponde y usa **OpenTripPlanner (OTP)** para calcular rutas.

Las **16 herramientas MCP** permiten buscar lugares, planificar viajes y consultar transporte y entorno. Core se encarga de conectar con cada proveedor y de gestionar sus credenciales. [Diagrama completo](architecture.md#arquitectura-general).

## Qué ocurre mientras nadie lo usa

El ordenador mantiene los procesos locales arrancados, pero las descargas periódicas se limitan a una ventana de actividad de 30 minutos. Una nueva consulta normal reactiva esa ventana. Las consultas de distintos usuarios reutilizan los datos almacenados.

La meteorología de un viaje también usa caché compartida. Una predicción que ya existe puede servir para varios itinerarios. Cada resultado conserva la hora de publicación y la hora de descarga.

## Alcance acordado

Las rutas combinan Renfe, EMT, Metro Ligero, interurbanos y caminatas. Metro de Madrid está disponible como catálogo de estaciones, pero carece de horarios vigentes para planificar viajes. BiciMAD y aparcamiento ofrecen consultas de disponibilidad y contexto; el planificador no calcula rutas en bici o coche. La accesibilidad corresponde a declaraciones publicadas sobre paradas y vehículos, no al estado operativo de ascensores. [Detalle de cobertura](roadmap.md).

Las aplicaciones se ejecutan localmente. La conversación y la adquisición de nuevas publicaciones requieren conexión a Internet.

## Cómo llegamos hasta aquí

Primero se separó el chat del motor de movilidad. Después se corrigieron rutas y controles de conversación, se consolidó la actualización de datos y se añadieron fuentes. Las últimas entregas aportaron historial de conversaciones, meteorología del itinerario, accesibilidad estática y precios de aparcamiento.

La [historia por etapas](evolution.md) conecta cada avance con su PR y evidencia. El [registro de fuentes](sources/README.md) explica de dónde sale cada dato.
