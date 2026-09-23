# Siguiente trabajo

La base de entorno no debe convertirse en una implementación ficticia de todas las fuentes.

## Preparación cerrada (sin publicar)

- Proyecto universitario; Neon free, Upstash free sin auto-upgrade y Blob privado aprovisionados y verificados.
- OpenAI Responses directo con `gpt-6-luna`, clave existente, sin Gateway. Turno EVE con MCP real verificado.
- Better Auth email/password sin signup, cinco cuentas preaprovisionables, ACL de sesiones, cuotas y revocación.
- CI sin secretos cloud/inferencia; despliegues Git y manuales no activados.
- Retención de acceso documentada; borrado físico de conversaciones Workflow y sus garantías deben comprobarse antes de publicación.

## P0 · Implementación posterior, fuera del cierre actual

El siguiente punto de revisión con el usuario es OTP. No se ejecuta ingestión ni benchmark OTP durante esta preparación.

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
