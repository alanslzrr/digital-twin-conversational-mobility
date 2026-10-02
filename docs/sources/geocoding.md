# Geocodificación controlada

[Índice de la wiki](../index.md) · [Registro de fuentes](README.md) · [Recursos y altas](../resources/index.md) · [Referencia MCP](../reference/mcp.md)

`resolve_address` consulta primero los catálogos locales (Renfe, EMT, CRTM y BiciMAD).
Si no encuentra candidatos, reutiliza una caché válida del proveedor configurado o
solicita autorización para consultar externamente ese **lugar público**. Devuelve
candidatos con su precisión estimada y pide confirmación antes de planificar.
La coordenada identifica el lugar; la accesibilidad de sus accesos se trata por separado.

## Proveedor y límites

Adaptador compatible con Search JSONv2 de Nominatim, sin servicio activo por defecto.
Configurar en Core `GEOCODER_ENABLED=true`, `GEOCODER_URL` (endpoint `/search`) y
`GEOCODER_USER_AGENT` identificativo. HTTPS remoto, o HTTP de loopback para una
instancia propia. Se puede cambiar el endpoint o desactivar sin modificar código.
Las credenciales y la configuración del proveedor se mantienen en Core.

Para **Nominatim público**, el responsable debe elegirlo informadamente y aceptar
su [política de uso](https://operations.osmfoundation.org/policies/nominatim/);
solo entonces establecer `GEOCODER_PUBLIC_POLICY_ACCEPTED=true`.
Máximo del proveedor: **1 petición/s global para toda la aplicación**, identificación
válida y atribución. No autocompletado, consultas sistemáticas, scraping de detalles
ni envío de datos personales/confidenciales.

La aplicación aplica un único carril PostgreSQL con lease de 30 s, timeout de red
10 s y espera mínima de 2 s después de cada respuesta; llamadas concurrentes obtienen
`busy` mientras el carril está ocupado. Los fallos devuelven error y aplican
un backoff de 60 s. La adquisición se inicia por consulta, con un único intento.

Search usa `countrycodes=es`, idioma español y bounding box aproximada
[-4.6,39.8,-3.0,41.2]; es un límite espacial, no una frontera administrativa.
Como máximo cinco candidatos por consulta, respuesta limitada a 1 MB. Referencias
estables por tipo/ID OSM, nunca por el `place_id` interno de Nominatim.

## Procedencia, caché y privacidad

Resultados © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright),
con enlace al objeto, proveedor, fecha de recuperación y precisión declarada.
La caché se identifica mediante un hash del texto normalizado, proveedor y versión
de búsqueda. Conserva los candidatos, con las coordenadas y la precisión estimadas,
en lugar del texto de consulta o la respuesta raw.
Caché positiva 7 días, negativa 1 hora, máximo 5000 entradas; purga de caducadas
bajo demanda. Los errores de proveedor no se cachean como ausencia de resultados.
Las identidades/coordenadas de lugares públicos persisten para conservar UUIDs usados
en rutas. El borrado de esos lugares requiere una operación explícita y no elimina
catálogos de movilidad: namespace `geocoder.osm`, source `osm`, kind `address`.

Un domicilio personal no se debe enviar aunque parezca una calle pública: el agente
ha de solicitar un lugar público alternativo o mantener la consulta local. Cambiar
a un proveedor con contrato de privacidad necesita revisar sus condiciones.

## Instalación y pruebas

Aplicar 0015 mediante el procedimiento local con respaldo. El MCP y las instrucciones
EVE requieren builds compatibles y sesión nueva. Regresiones sin red:
`RUN_GEOCODE_DB_TESTS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run apps/mobility-core/src/geocoding*.test.ts`.
La prueba real del proveedor solo se ejecuta tras su elección/autorización y usando
un lugar público; no enviar conversaciones o direcciones personales como fixtures.

## Estado local — 27/09/2026

Nominatim público fue elegido y autorizado explícitamente, activado en configuración privada y comprobado por MCP con el Museo del Prado. Catálogo primero, consentimiento, atribución y caché positiva/negativa verificados; seis pruebas específicas. No se hicieron llamadas al modelo. Los valores por defecto del repositorio siguen desactivados para otras instalaciones.
