# OTP en Sandbox: prueba pendiente

No se incluye una imagen OTP ficticia ni se crea un Sandbox durante el bootstrap.

Antes de adoptar este proveedor:

1. Fijar versión de OTP y Java compatible, con checksum de artefactos.
2. Descargar/verificar GTFS y extracto OSM acotado a Madrid; registrar versión/licencia.
3. Medir construcción de grafo y consulta: RAM máxima, CPU, disco, cold start y latencia P95.
4. Validar red, endpoint protegido y arranque/readiness de la JVM dentro de Vercel Sandbox.
5. Probar el mecanismo real de stop/snapshot/start. **No asumir que un snapshot de disco conserva el heap JVM o el proceso vivo.**
6. Implementar exclusión mutua para arranque, TTL por inactividad, recuperación tras expiración, límite de duración y parada confirmada.
7. Medir coste con la cuota/plan de la cuenta; decidir si el cold start es aceptable para cinco usuarios.

Si falla el benchmark, documentar el resultado y elegir otro `RoutingProvider` sin cambiar el contrato del MCP. No degradar silenciosamente una petición multimodal/accesible a un router que no la soporte.

Referencias: [Vercel Sandbox](https://vercel.com/docs/sandbox), [snapshots](https://vercel.com/docs/sandbox/concepts/snapshots), [OTP data sources](https://docs.opentripplanner.org/en/latest/Data-Sources/).
