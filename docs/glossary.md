# Glosario

[Índice](index.md) · [Arquitectura explicada](architecture.md) · [Referencia MCP](reference/mcp.md)

| Término | Significado en este proyecto |
| --- | --- |
| Adaptador | Código que consulta e interpreta una fuente concreta. |
| API | Interfaz con la que un programa solicita una operación a otro. |
| Backoff | Espera creciente antes de repetir un trabajo que falla. |
| Better Auth | Biblioteca que verifica identidad, login y sesiones de evaluadores. |
| Caché | Copia reutilizable de un resultado durante un tiempo definido. |
| CAP | Formato común para avisos; aquí se usa para avisos meteorológicos AEMET. |
| Catálogo | Lista de entidades conocidas, como estaciones, paradas y líneas. |
| CI | Comprobaciones automáticas de una propuesta de cambio en GitHub. |
| Core | Servidor que aplica las reglas de movilidad y gestiona datos/proveedores. |
| CSRF | Ataque que intenta provocar acciones desde otro sitio usando una sesión; el sistema comprueba el origen. |
| EVE | Marco de conversación que aporta chat, ejecución del agente y recuperación de sesiones. |
| Feed | Publicación de un conjunto de datos, estático o dinámico. |
| Frescura | Relación entre la edad de un dato y el umbral definido para su uso. |
| GBFS | Formato de información de bicicletas compartidas; lo publica BiciMAD. |
| Geocodificación | Convertir la descripción de un lugar en candidatos con coordenadas. |
| Grafo | Representación de conexiones entre calles, paradas y servicios que permite calcular rutas. |
| GTFS | Formato de horarios, paradas, viajes, calendarios y frecuencias de transporte. |
| GTFS-RT / RT | Formato de actualizaciones de viajes, vehículos y avisos de transporte. |
| Histórico de movilidad | Publicaciones anteriores y sus revisiones retenidas por Core. |
| Historial de conversaciones | Chats anteriores de un evaluador, reabiertos mediante EVE. |
| Idempotencia | Repetir una operación sin duplicar sus efectos. |
| Ingestión | Adquirir, normalizar y guardar una publicación. |
| Itinerario | Una opción de viaje formada por tramos y posibles transbordos. |
| JWT | Token firmado usado como credencial en las llamadas entre servicios. |
| Lease | Reserva con vencimiento que permite a un proceso terminar un trabajo. |
| MCP | Model Context Protocol: protocolo para descubrir y ejecutar herramientas del servidor. |
| Migración | Cambio versionado de la estructura de la base de datos. |
| Namespace | Espacio de identificadores de una fuente; evita confundir paradas con el mismo número. |
| Normalización | Transformar formatos de proveedores en estructuras comunes sin borrar su procedencia. |
| Observación | Dato publicado sobre un hecho o medida, con su hora de referencia. |
| OTP | OpenTripPlanner, motor local de cálculo de rutas. |
| Overlay | Evidencia dinámica añadida por Core sobre una ruta prevista. |
| PostGIS | Extensión geográfica de PostgreSQL para lugares y geometrías. |
| Procedencia | Fuente, tiempos, versión y referencias que permiten explicar de dónde sale un dato. |
| Raw | Publicación original antes de normalizarla. |
| Read-through | Intento de refrescar un dato vencido al consultarlo, sujeto a los mismos controles de adquisición. |
| Release | Conjunto versionado y verificable de datos, configuración y grafo de rutas. |
| Rollback | Recuperar una versión previa conocida después de una actualización. |
| Runtime | Procesos que ejecutan la aplicación, distintos del código guardado en Git. |
| Scope | Permiso de una credencial, por ejemplo leer movilidad o administrar evaluadores. |
| Snapshot | Estado conservado de una fuente con sus datos y fechas de referencia. |
| Smoke | Comprobación breve de un recorrido funcional, como iniciar sesión y consultar una herramienta. |
| TTL | Tiempo de vida de una publicación/caché indicado por el proveedor o la política local. |
| UUID | Identificador estable que el sistema asigna a una entidad. |
| Worker | Proceso que pide trabajos de actualización en segundo plano. |

[Componentes y configuración](reference/system.md). [Especificaciones oficiales](resources/index.md#tecnología).
