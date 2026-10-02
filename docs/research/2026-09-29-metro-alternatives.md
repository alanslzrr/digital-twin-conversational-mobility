# Metro: alternativas reales y decisión de alcance

[Índice de la wiki](../index.md) · [Archivo de research](index.md) · [Estado vigente](../roadmap.md)

> **Investigación histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Investigado el **29/09/2026**. Sustituye la recomendación anterior de desarrollar correspondencias como siguiente bloque. **Esa propuesta se retira:** no resuelve rutas Metro y el usuario no quiere una entrega parcial que conserve el problema principal.

## Índice interno

- [Decisión posterior aprobada](#decisión-posterior-aprobada)
- [Resultado de la investigación](#resultado-de-la-investigación)
- [Alternativas examinadas](#alternativas-examinadas)
- [Consecuencia para un eventual agente](#consecuencia-para-un-eventual-agente)
- [Evidencia y cambios realizados](#evidencia-y-cambios-realizados)


## Decisión posterior aprobada

El usuario aceptó el 29/09/2026 cerrar esta evaluación sin la ampliación Metro ni las correspondencias adicionales propuestas. **Se elige la opción 1**, sin nuevo proveedor y conservando la funcionalidad ya entregada. [Instrucciones vigentes](../plans/2026-09-29-scope-closure.md). El análisis de proveedores siguiente es evidencia de opciones descartadas para este encargo, no trabajo pendiente.

## Resultado de la investigación

**No se ha encontrado y verificado un GTFS Metro vigente que pueda sustituirse directamente en OTP.** Cambiar a los agregadores examinados no cambia los datos. Hay proveedores de rutas alojadas, pero no equivalen a un feed descargable y su cobertura Metro actual no se ha probado con una cuenta propia.

Para cerrar la evaluación sin nueva dependencia ni integración de otro router, recomiendo **excluir del alcance de cierre la ampliación Metro y las correspondencias adicionales propuestas**. Conservar lo ya entregado: catálogo Metro con sus límites, horarios/routing de las redes vigentes y correspondencias existentes. No borrar funcionalidad ni presentar la exclusión como implementación completada. Esta recomendación fue aceptada por el usuario; no equivale a eliminar el catálogo Metro ni CRTM entero.

HERE Public Transit se examinó como candidato por acceso sin datos de pago; no se eligió ni se comprobó su cobertura Metro con credencial propia. No se ha creado ninguna cuenta ni activado facturación.

## Alternativas examinadas

### 1. Mobility Database, Transitland y NAP: no aportan un horario nuevo

- [Mobility Database mdb-794](https://mobilitydatabase.org/feeds/gtfs/mdb-794): se abrió la ficha en vivo y se descargó su ZIP más reciente enlazado. **1.503.773 bytes, SHA-256 `16e8e53ce16ab6d73efc2896be7aaeeb351a1f48f661ac7faa0a9e5b38204fb7`**, idéntico al oficial/instalado. Calendario hasta 27/05/2026; última excepción positiva 25/12/2025.
- [Transitland](https://www.transit.land/feeds/f-ezjm-informaci%C3%B3noficial~consorcioregionaldetransportesdemadrid/): consulta en vivo; última recuperación indicada 28/09/2026, **pero última versión de datos 30/05/2025 y fin de servicio 27/05/2026**. Apunta actualmente al fichero NAP 1134, con autenticación y flujo de descarga; no al feed de un proveedor independiente. Una descarga reciente no acredita datos vigentes.
- [NAP, ficha Metro](https://nap.transportes.gob.es/Files/Detail/933): la ficha indexada coincide con esa vigencia. No se obtuvo una descarga autenticada propia desde NAP. La evidencia de Transitland no se presenta como prueba directa nuestra de ese endpoint.

### 2. Transitous: no evita la misma dependencia

Su [configuración pública](https://github.com/public-transport/transitous/blob/main/feeds/es.json) usa `mdb-794`. En la [incidencia #2315](https://github.com/public-transport/transitous/issues/2315), el mantenedor identifica la caducidad como causa de estaciones sin salidas.

Se comprobó además el endpoint público de salidas de **Puerta del Sol**, el 29/09 a las **08:05 UTC**: HTTP 200, estación reconocida, `stopTimes=[]` y `modes=[]`. No es una prueba exhaustiva de toda la red, pero confirma el problema en una estación central. **No lo recomiendo como sustituto para resolver Metro.**

### 3. HERE Public Transit: candidato alojado, no GTFS

La [documentación oficial de límites](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases) incluye Public Transit en Limited Plan sin información de pago: **1.000 solicitudes diarias**, con máximo de **10 solicitudes/s** para ese servicio, sujeto a los usos admitidos. No se ha abierto cuenta ni aceptado términos.

HERE distingue cobertura [real-time, timetable y estimated](https://docs.here.com/transit/docs/coverage). La última puede estimar desplazamientos sin horarios detallados y ser parcial. El enlace de cobertura territorial desde su índice devolvió «Page Not Found»; **no se ha podido acreditar desde esa página qué nivel ofrece hoy para Metro Madrid**. No prometer RT ni horarios verificados solo por contratar la API.

Requeriría credencial propia, consulta de rutas desde Core y reglas de calidad/atribución/retención acordes a su contrato. No exige publicar nuestra aplicación, pero el cálculo deja de ser completamente local. La elegibilidad del proyecto y la cobertura efectiva necesitan comprobarse antes de considerar resuelto el bloque.

### 4. Google Routes: alternativa comercial con cambios de contrato

Soporta [transporte público y metro](https://developers.google.com/maps/documentation/routes/transit-route), pero requiere [cuenta con facturación y credencial](https://developers.google.com/maps/documentation/routes/get-api-key). La [tarifa oficial](https://developers.google.com/maps/billing-and-pricing/pricing#routes-pricing) ofrece 10.000 eventos/mes sin coste para Compute Routes Essentials; otros SKU tienen límites distintos. Eso **no elimina** la cuenta de facturación ni garantiza coste cero para cualquier petición.

No se ha realizado una petición autenticada ni demostrado la cobertura Metro actual. Su tabla general de cobertura excluye información de transporte público. Además, `allowedTravelModes` es preferencia: la documentación admite resultados de otros modos. No conserva automáticamente los límites estrictos de caminar/transbordos del contrato actual.

Sus [condiciones de almacenamiento y atribución](https://developers.google.com/maps/documentation/routes/policies), incluidas las específicas del EEE, impiden tratar la respuesta sin más como otro GTFS libre para persistir en nuestra base o historial. No recomendaría añadirlo solo para mantener una casilla del roadmap.

### 5. Moovit y endpoints de la aplicación Metro

- [Moovit](https://api-docs.moovit.com/) dispone de planificación multimodal, claves proporcionadas por el proveedor y restricciones de caché; no se encontró en esta revisión un acceso autoservicio gratuito verificable. Su [oferta oficial](https://moovit.com/es/maas-solutions-es/transit-apis/) dirige a contacto comercial. No es la opción simple para este prototipo.
- Un [cliente público de terceros](https://github.com/dieguezz/mcp-madrid-public-transport/blob/main/src/transport/metro/infrastructure/metro-api-client.ts) usa `serviciosapp.metromadrid.es/servicios/rest/teleindicadores/{stopCode}`. Es una pista de **llegadas**, no prueba de un feed vigente ni de planificación completa. No se verificó un contrato público de reutilización/servicio ni se ejecutó ese cliente. No convertir esa pista en otra entrega parcial para sustituir routing.

## Consecuencia para un eventual agente

No implementar el plan de correspondencias retirado. Se estudiaron dos opciones; el usuario ha elegido la primera:

1. **Cerrar sin ampliación Metro:** ajustar el roadmap y las declaraciones de cobertura, manteniendo las funciones existentes; no introducir otro proveedor ni dejar esta ampliación como tarea bloqueante.
2. **Mantener Metro mediante proveedor:** elegir primero uno y acreditar que devuelve rutas actuales utilizables. Después adaptar únicamente `RoutingProvider` en Core, sin unir artificialmente un tramo HERE/Google con otro OTP, sin reutilizar sus IDs como IDs GTFS y sin atribuirles nuestros overlays RT/accesibilidad. Respetar preferencias o declarar incompatibilidad; no relajarlas silenciosamente.

No se recomienda desarrollar un adaptador vacío mientras falta acceso o cobertura. Ninguna API externa se presenta aquí como ya validada. La opción 2 no pertenece al encargo aprobado y no queda como tarea posterior obligatoria.

## Evidencia y cambios realizados

Descarga comparada, consulta pública Transitous y capturas de documentación bajo `data/research/2026-09-29-metro-alternatives/`, ignoradas por Git. Solo investigación y documentación; sin migraciones, modificaciones de OTP/runtime, llamadas al modelo, alta de proveedores ni gasto contratado.
