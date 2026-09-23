# Siguiente trabajo

La base de entorno no debe convertirse en una implementación ficticia de todas las fuentes.

## P0 · Habilitar evaluación segura

1. Confirmar uso/plan, provisionar recursos cloud, conectar credenciales y definir presupuesto. Verificar límites en la cuenta.
2. Autenticación/allowlist de evaluadores, propiedad de sesiones EVE, rate limiting y retención de conversaciones.
3. Primera vertical Renfe: GTFS versionado → IDs canónicos → protobuf RT → raw durable → normalización → estado/frescura → herramienta de dominio. Tests con fixtures sanitizados y fallo de proveedor.
4. Ingestión activa con Queues: ventana atómica, leases, idempotencia, outbox, reconciliación, retries y aislamiento de fuentes. Tests de entrega duplicada, carreras y terminación.

## P1 · Ampliar dominio

5. BiciMAD discovery/TTL y EMT read-through; evitar polling de todas las paradas.
6. CRTM/OSM y Place Resolver: desambiguación de intercambiadores, accesos y plataformas; no inventar coordenadas.
7. OTP: benchmark de JVM/grafo y lifecycle Sandbox; introducir `RoutingProvider` solo con resultados reales. Comparar alternativas tras medir.
8. AEMET, aire, DGT, tráfico, parking y accesibilidad; documentar calidad provisional y permisos.

## P2 · Cerrar gaps y medir

9. Acceso oficial al tiempo real de Metro/interurbanos/accesibilidad, registro de licencias y gaps.
10. Evaluación con cinco usuarios: exactitud, actualidad, latencia P95, costes, accesibilidad, comportamiento ante ausencia de datos y recuperación.

No se aceptan como "terminados": un SDK instalado sin proveedor, una tool con datos hardcodeados, un endpoint sin control de acceso ni un routing sin correspondencia GTFS/OSM validada.
