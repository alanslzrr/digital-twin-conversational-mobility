# Cuentas, claves y pasos manuales

[Índice](../index.md) · [Recursos](index.md) · [Instalación](../installation.md) · [Variables](../reference/system.md#variables-y-secretos)

OpenAI, EMT y AEMET requieren claves de servidor. Los pasos siguientes explican cómo obtenerlas y dónde configurarlas. Para crear cuentas de acceso al chat, consulta la [administración de cuentas](../evaluation.md).

## En esta página

- [OpenAI directo](#openai-directo)
- [EMT MobilityLabs](#emt-mobilitylabs)
- [AEMET](#aemet)
- [Nominatim público](#nominatim-público)
- [Fuentes sin clave](#fuentes-sin-clave)
- [Preparación cloud anterior](#preparación-cloud-anterior)

## OpenAI directo

**Aporta:** interpretación de preguntas, selección de herramientas y redacción de respuestas.

1. Accede a tu proyecto/cuenta en [el panel de claves de OpenAI](https://platform.openai.com/api-keys).
2. Crea una clave de servidor, siguiendo [el quickstart oficial](https://developers.openai.com/api/docs/quickstart).
3. Guarda el valor como `OPENAI_API_KEY` en `.env.local` de la raíz. No lo pegues en el chat, Git ni un comando que imprima el entorno.
4. Ejecuta `pnpm configure:openai` para copiarla solo al servidor Web.
5. Compila y arranca según [la instalación](../installation.md#compilar-y-arrancar).

La [configuración local](../../apps/eve-web/src/model.ts) fija `gpt-6-luna` mediante Responses y `store:false`. `pnpm check:openai` consulta acceso al modelo; `--live` añade una llamada de pago. Las pruebas offline usan respuestas simuladas y no consumen créditos.

Para rotar: crea otra clave, actualiza el archivo privado, configura/reinicia Web y revoca la anterior en el panel tras comprobar el cambio. [Script de configuración](../../scripts/configure-openai.mjs). Referencias de alta consultadas el **02/10/2026**. El panel requiere iniciar sesión.

## EMT MobilityLabs

**Aporta:** catálogo API, llegadas y avisos de autobús. El GTFS EMT usado por OTP se descarga por CRTM y no usa estas credenciales.

1. Registra una cuenta e inicia sesión en [MobilityLabs](https://mobilitylabs.emtmadrid.es/).
2. Sigue [Nueva aplicación](https://mobilitylabs.emtmadrid.es/es/doc/new-app): menú de desarrollador → Mis Aplicaciones → Nueva Aplicación.
3. Describe el proyecto universitario y crea la aplicación.
4. Comprueba su estado. Durante nuestra alta quedó **pendiente de moderación**; la API devolvió HTTP 403/código 84 hasta la posterior habilitación.
5. Copia privadamente `X-ClientId` a `EMT_CLIENT_ID` y `passKey` a `EMT_PASSKEY`, solo en `apps/mobility-core/.env.local`.
6. Tras la aprobación, usa `pnpm emt:import` y `pnpm mobility:enable` en la preparación local.

En la guía oficial, utiliza el alta de aplicación y sus credenciales `X-ClientId`/`passKey`. El apartado Firebase corresponde a las notificaciones y se omite en esta integración.

El [cliente EMT](../../apps/mobility-core/src/adapters/emt-client.ts) autentica la aplicación con esas credenciales y reutiliza el token de acceso hasta su caducidad. [API](https://apidocs.emtmadrid.es/), [documentación M360](https://datos.emtmadrid.es/m360-swagger/docs), [condiciones](https://mobilitylabs.emtmadrid.es/sip/terms-of-use) y [evidencia EMT](../acceptance/2026-09-25-emt.md).

Guía de alta consultada el **02/10/2026**. La página de condiciones requiere iniciar sesión; la revisión anterior se conserva en el [registro de fuentes](../sources/README.md). Ante una denegación, comprueba el estado de la aplicación y su pareja de credenciales.

## AEMET

**Aporta:** observaciones y predicciones horarias autenticadas. La predicción diaria XML y los avisos CAP usados aquí son públicos.

1. Abre [Solicitar API key](https://opendata.aemet.es/centrodedescargas/altaUsuario).
2. Completa el correo y captcha; sigue la confirmación indicada por AEMET.
3. Guarda la clave como `AEMET_API_KEY`, solo en el entorno privado de Core.
4. Ejecuta `pnpm mobility:enable` si la fuente aún estaba deshabilitada y reinicia Core para cargar el entorno.
5. Anota la caducidad de forma privada y solicita una nueva antes de que venza.

El [aviso oficial de caducidad](https://opendata.aemet.es/centrodedescargas/novedades), consultado el **02/10/2026**, indica: nuevas claves válidas tres meses; las antiguas sin expiración dejan de aceptarse el **15/10/2026**. Las que ya tienen vencimiento mantienen su ciclo. Consulta la fecha de vencimiento de tu clave al renovarla y comprueba las novedades del servicio.

[Documentación API](https://opendata.aemet.es/dist/), [nota legal](https://www.aemet.es/es/nota_legal), [adaptadores](../../apps/mobility-core/src/adapters) y [caché compartida](../../apps/mobility-core/src/weather-cache.ts). Abre el Swagger en un navegador con JavaScript para consultar los endpoints.

## Nominatim público

**Aporta:** localizar lugares públicos que no están en nuestros catálogos. No requiere cuenta ni API key. Para habilitarlo en una instalación nueva, configura las variables siguientes.

Configura en Core, tras leer la [política oficial](https://operations.osmfoundation.org/policies/nominatim/):

| Variable | Valor/configuración |
| --- | --- |
| `GEOCODER_ENABLED` | `true` |
| `GEOCODER_URL` | `https://nominatim.openstreetmap.org/search` |
| `GEOCODER_USER_AGENT` | Identificación real de la aplicación y contacto; no un agente genérico ni un secreto |
| `GEOCODER_PUBLIC_POLICY_ACCEPTED` | `true`, solo tras aceptar la política |

El máximo del proveedor es una petición por segundo para toda la aplicación. La implementación añade carril global, caché y una espera de dos segundos tras respuesta. Conserva atribución OSM y permite cambiar/desactivar proveedor. No autocompletado, barridos ni datos personales/confidenciales. La autorización de configuración no elimina el consentimiento para la búsqueda externa concreta.

[Contrato detallado](../sources/geocoding.md), [adaptador](../../apps/mobility-core/src/adapters/geocoder.ts) y [almacenamiento](../../apps/mobility-core/src/geocoding.ts). Política consultada el **02/10/2026**.

## Fuentes sin clave

Renfe GTFS/RT, CRTM, BiciMAD GBFS, DGT, aire/tráfico/ocupación municipal, OSM/Geofabrik, IGN, diaria XML y CAP de AEMET usan recursos públicos en esta integración. El [catálogo temático](index.md) y el [registro de productos y licencias](../sources/README.md) detallan el acceso y las condiciones de cada fuente.

## Preparación cloud anterior

Se crearon dos proyectos Vercel y recursos gratuitos Neon, Upstash y Blob para la evaluación universitaria. El alta de Upstash requirió aceptar sus condiciones en el navegador, desde la integración de Vercel.

[Integraciones Vercel](https://vercel.com/docs/integrations) explica el flujo. Los detalles y estado histórico están en [preparación cloud](../deployment.md).
