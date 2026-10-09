# Arquitectura escalable para 20–30 usuarios

[Índice](../index.md) · [Planes](index.md) · [Alcance vigente](../roadmap.md) · [Arquitectura implementada](../architecture.md) · [Preparación cloud](../deployment.md) · [Fuentes técnicas](../resources/index.md#arquitectura-para-2030-usuarios)

**Fecha: 05/10/2026. Estado: especificación propuesta para implementación posterior, no infraestructura desplegada ni capacidad certificada.** Base contrastada: `105df99`, posterior a la auditoría de `eba66c5`. Se conservan las entregas cerradas y las exclusiones del roadmap. Este encargo define una evolución nueva; no reactiva las obligaciones R2 retiradas.

> **Revisión de presupuesto:** el despliegue inicial debe costar **0 USD**. La selección pagada de alojamiento de este documento queda retirada para esa fase y sustituida por la [investigación de planes gratuitos](../research/2026-10-05-zero-cost-hosting.md). Las secciones que dependen de Pro/AWS/S3 son alternativas futuras, no requisitos iniciales; se mantienen las decisiones de dominio y portabilidad.

## Decisión ejecutiva

Mantener el **monolito modular** y los límites actuales entre EVE, Mobility Core y los paquetes compartidos. Separar el estado durable del proceso, acotar el trabajo concurrente y hacer sustituibles tres dependencias de infraestructura: objetos, registro de releases y transporte OTP. No dividir el dominio en microservicios.

**Destino pagado anterior — retirado para el inicio:** Web/EVE en Vercel Pro con Workflow nativo; Core, un worker y OTP en contenedores sobre una VM de AWS en Europa; PostgreSQL 17/PostGIS gestionado, reutilizando Neon si su configuración y capacidad son adecuadas; objetos privados en S3. Un único emplazamiento europeo del backend, sin arquitectura activa-activa ni alta disponibilidad multirregión.

AWS frente a GCP es una elección operativa, no una conclusión de rendimiento: una VM Linux y objetos S3 ofrecen un camino directo desde los procesos actuales. GCP puede alojar los mismos contenedores; no construiremos ambos destinos a la vez. Vercel se conserva por la integración nativa de EVE/Workflow, y Neon porque ya existe una preparación del proyecto. Se acepta gestionar estas tres plataformas para evitar desarrollar ahora un backend propio de Workflow.

**Lo que no se puede prometer:** cero cambios al crecer o al cambiar de cloud. Sí podemos exigir que esos cambios se concentren en adaptadores, despliegue, políticas y capacidad, sin sustituir la UI oficial, los contratos MCP ni las reglas de movilidad. La portabilidad de sesiones Workflow y el routing sin mantenimiento necesitan trabajo específico; no quedan resueltos por Docker.

## Índice interno

- [Objetivos y carga](#objetivos-y-carga)
- [Decisiones de alojamiento](#decisiones-de-alojamiento)
- [Componentes y fronteras](#componentes-y-fronteras)
- [Persistencia de EVE y continuidad](#persistencia-de-eve-y-continuidad)
- [Acceso y admisión de trabajo](#acceso-y-admisión-de-trabajo)
- [PostgreSQL y presupuesto de conexiones](#postgresql-y-presupuesto-de-conexiones)
- [Objetos y releases de routing](#objetos-y-releases-de-routing)
- [Ingestión y cuotas externas](#ingestión-y-cuotas-externas)
- [Panel y respuesta de la interfaz](#panel-y-respuesta-de-la-interfaz)
- [Retención recuperación y seguridad](#retención-recuperación-y-seguridad)
- [Capacidad y costes](#capacidad-y-costes)
- [Secuencia de implementación](#secuencia-de-implementación)
- [Aceptación y evolución](#aceptación-y-evolución)
- [Referencias verificadas](#referencias-verificadas)

## Objetivos y carga

Los valores siguientes son **objetivos de diseño y parámetros iniciales de prueba**, no resultados de carga ni compromisos de servicio.

| Dimensión | Objetivo inicial |
| --- | --- |
| Cuentas habilitadas | 30, con alta administrativa; sin registro público |
| Sesiones o paneles autenticados abiertos | Hasta 30 |
| Turnos generando simultáneamente | Máximo 5 admitidos por la aplicación y 1 por propietario; tampoco dos turnos en la misma conversación |
| Consultas OTP simultáneas | Máximo 2 globales, contando chat e inspector manual |
| Carga sostenida sintética | 30 usuarios conectados, 5 nuevos turnos/minuto en total; escenario adicional de 10/minuto para observar saturación |
| Ráfaga | 30 solicitudes de generación: hasta 5 admitidas, las demás reciben saturación explícita; no 30 inferencias garantizadas |
| Cuotas individuales | Conservar 6 operaciones/minuto y 60/día; no son un presupuesto de tokens ni de gasto |
| Datos | Misma cobertura, mismas herramientas y misma semántica de frescura |

La concurrencia necesaria depende de la duración: `concurrencia media ≈ solicitudes/segundo × duración media`. Por ejemplo, 10 turnos/minuto con 30 segundos de duración ocuparían de media cinco plazas, **sin margen para ráfagas**. Es un cálculo ilustrativo; la duración real no se ha medido aquí.

Objetivos de respuesta en entorno de aceptación, con backend caliente y red europea controlada:

- Lecturas almacenadas del panel: p95 ≤ 500 ms; comprobación de acceso/login: p95 ≤ 800 ms.
- Rechazo por saturación: p95 ≤ 500 ms, con causa y posibilidad de reintentar.
- Feedback visual tras enviar: ≤ 250 ms en el navegador de prueba; no equivale al primer token del modelo.
- Mantener deadline OTP de 10 segundos y cancelación. La distribución real de latencia de rutas requiere ensayo OTP separado.
- Medir cold starts, primer token y respuesta completa por separado. No incluir latencia externa desconocida dentro de una garantía de la aplicación.

## Decisiones de alojamiento

### Comparación y elección

| Opción | Encaje en este proyecto | Decisión |
| --- | --- | --- |
| Vercel Hobby | Next.js/EVE nativo, pero límites de cómputo/uso y retención Workflow de un día tras finalizar el run | Solo smoke o piloto con alcance de historial expresamente reducido. No equivalente al producto actual de siete días |
| Vercel Pro | Mantiene integración EVE y retención Workflow de siete días tras finalizar el run | **Web/EVE inicial recomendado**, sujeto a gate de persistencia y presupuesto aprobado |
| Todo en Vercel Functions | No aloja el proceso Java OTP persistente ni convierte nuestro worker en un servicio durable | No elegido; no intentar solventarlo con Cron de tiempo real o archivos locales de funciones |
| Cloudflare Workers | La guía actual recomienda `vinext`, beta; compatibilidad Node parcial, no un proceso Node 24 completo | No migrar EVE ahora. Evaluar solo con prueba específica de compilación, World, streaming y guard |
| Cloudflare Containers | Puede alojar procesos Linux, pero añade otro plano de ejecución/orquestación | Alternativa futura, no necesaria para 30 cuentas ni equivalente a Workers gratis |
| GCP Compute Engine | VM apta para los mismos contenedores y procesos persistentes | Alternativa válida si hay preferencia operativa o créditos; no exige cambiar dominio |
| GCP Cloud Run | Adecuado para Core HTTP después de eliminar dependencias locales; worker requiere modelo de ejecución/CPU adecuado | No destino inicial de todo el stack. OTP caliente y tareas de fondo requieren dimensionamiento independiente |
| AWS EC2 | Proceso persistente Node/JVM, límites explícitos por contenedor y almacenamiento remoto | **Backend inicial elegido**; una VM, sin Kubernetes ni ECS obligatorio |
| AWS ECS/Fargate | Separación y réplica de contenedores administrada | Camino posterior al necesitar varias instancias; no requisito inicial |

La documentación actual de Vercel distingue duración de una función de duración de un Workflow. Un Workflow durable puede continuar entre invocaciones; eso **no** convierte una función en un daemon Java ni hace persistente su filesystem. En Workers, `node:vm` es un módulo sin implementación funcional; es relevante para la compatibilidad del runtime Workflow, además de las diferencias de build. Véanse [Functions](https://vercel.com/docs/functions/limitations), [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) y [compatibilidad Node](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

### Condición que descarta Hobby como equivalente

Core autoriza el historial durante siete días desde el registro. EVE tiene actualmente un timeout de sesión de 30 minutos. Vercel documenta persistencia gestionada durante **1 día en Hobby y 7 días en Pro después de finalizar el run**. Por tanto, Hobby puede eliminar estado cuando Core todavía permite acceder al historial. Pro encaja temporalmente, pero hay que verificar qué runs/streams utiliza EVE y su recuperación; no basta contratar el plan. [Retención oficial](https://vercel.com/docs/workflows/pricing).

No alargar artificialmente sesiones activas, introducir llamadas periódicas ni duplicar transcripciones para aprovechar una tarifa. Si no se aprueba Pro, conservar la operación local completa y preparar la portabilidad. Un self-host de EVE es una alternativa técnica con su propio gate, no un sustituto inmediato y gratuito.

### Topología inicial propuesta

1. **Vercel Web:** mismo Next.js, interfaz oficial EVE, BFF de autenticación/panel, guard de canal, modelo fijo y Workflow nativo.
2. **Una VM backend:** proxy HTTPS de ingreso y contenedores Core, worker y OTP. Los procesos tienen límites y reinicio supervisado, no comparten un ciclo de vida por accidente.
3. **PostgreSQL gestionado:** identidad, ownership, dominio, políticas, leases, cuotas y observabilidad. No alojarlo dentro de la VM de OTP en el perfil recomendado.
4. **S3 privado:** raw, artefactos inmutables de routing y respaldos separados por prefijos/roles. El disco de la VM es caché reconstruible, no la única copia.
5. **Build de grafos fuera del servidor que atiende usuarios:** publicación explícita de releases verificadas; ninguna compilación pesada por petición.

Preferir Frankfurt o la región europea más cercana a la base ya preparada, después de verificar su región real. Mantener Web cerca del backend; no activar edge/multirregión para Core. La configuración histórica Web `cdg1` no implica que sea la ubicación óptima final ni que pueda alterarse sin revisar el plan.

**Red:** navegador → Web del mismo origen; Web → endpoint HTTPS fijo de Core con autenticación de servicio; Core → DB/objetos/proveedores y OTP; worker → Core. Como Vercel no pertenece automáticamente a la red privada de EC2, el ingreso de Core será alcanzable por red pública pero autenticado, con allowlist de rutas, límites y TLS. No llamarlo «red privada» ni suponer IP de salida estática de Vercel. DB, OTP y administración no se exponen al navegador. OTP queda en red local/interna; nunca un puerto Java abierto a Internet.

## Componentes y fronteras

| Componente | Responsabilidad que se conserva | Evolución permitida |
| --- | --- | --- |
| `apps/eve-web` | UI EVE, BFF, guard, modelo fijo y runtime oficial | Adaptaciones mínimas de despliegue/admisión; sin SQL ni SDK de proveedores de movilidad |
| `apps/mobility-core` | Better Auth, dominio, MCP, consultas, ingestión, almacenamiento y routing | Adaptadores de infraestructura y estado compartido |
| `packages/contracts` | Entradas, DTO, errores y versiones compartidos | Ampliaciones compatibles, nunca tipos del SDK de un cloud |
| `packages/domain` | Decisiones de movilidad | No importar clientes cloud, Next.js ni configuración de despliegue |
| `packages/provenance` | Antigüedad, origen y calidad | Misma evaluación tanto con caché como sin ella |
| Worker | Orquestación acotada de adquisición | Perfil alojado explícito; no uno por usuario o instancia Web |
| OTP | Cálculo sobre grafo verificado | Transporte sustituible, mismo contrato y cobertura |

No añadir Kafka, Redis obligatorio, Kubernetes, service mesh, CQRS completo ni un ORM nuevo. Una tabla de proyecciones y leases SQL no exige una plataforma adicional. Upstash y Blob preparados históricamente **no se vuelven dependencias por estar creados**; tampoco se eliminan ni migran sus datos en este encargo.

Las 16 herramientas MCP, `defaultTools:false`, ES/EN, tema, identidad mobai y chat oficial permanecen. Registrar cualquier adaptación upstream en [vendor EVE](../../apps/eve-web/vendor/eve/README.md). No incorporar proveedores de movilidad, secretos, objetos ni URLs arbitrarias al navegador o al contexto del modelo.

## Persistencia de EVE y continuidad

### World y propiedad son sistemas diferentes

EVE/Workflow conserva mensajes, eventos, hooks, ejecución y streams. Core conserva propiedad, permisos y metadatos de las conversaciones. **No trasladar las transcripciones a Core como parche de escalabilidad.** La telemetría del panel tampoco sustituye el almacén de EVE.

La versión instalada EVE 0.65.0 usa Workflow 5 beta (`@workflow/core` beta.55 y `@workflow/world` beta.37). EVE valida la línea de compatibilidad del World. El World local usa `.eve/.workflow-data`; copiar ese directorio o montarlo en dos réplicas no demuestra ejecución distribuida segura.

Para Vercel se selecciona el World nativo del runtime, sin clientes DB en Web. Para abandonar Vercel habrá que verificar un World compatible y su seguridad. El [World PostgreSQL](https://workflow-sdk.dev/worlds/postgres) necesita un proceso persistente; su documentación actual lo presenta como implementación de referencia, no backend gestionado con seguridad resuelta. Si necesita SQL directo, la posible separación de un runtime EVE dedicado se diseña expresamente; **no se debilita `check-boundaries.mjs` para introducir DB en Web**.

### Gate previo a publicación

Probar con un modelo falso y datos sintéticos:

1. Crear, listar y recuperar mensajes con ownership intacto.
2. Reiniciar/desplegar durante un turno y recuperar el estado sin duplicaciones visibles.
3. Leer desde otra instancia y reconectar el stream; no depender de afinidad de sesión en memoria.
4. Aprobar y detener usando controles nativos; verificar acceso directo a rutas EVE, no solo middleware Next.
5. Completar una sesión y comprobar disponibilidad del historial en toda la ventana acordada, incluyendo retención de runs secundarios/streams.
6. Documentar procedimiento de respaldo/exportación soportado y sus límites; no prometer restaurar Workflow a partir del backup de Core.

Los builds de Next y del agente EVE son artefactos relacionados. El [supervisor local](../../scripts/start-web.mjs) no se copia como comando de Vercel; allí se valida el output nativo generado por `withEve`. Tampoco se presupone que `EVE_NEXT_PRODUCTION_ORIGIN` resuelva cualquier separación de frontend/runtime.

El arranque alojado debe comprobar World efectivo y detección del deployment; nunca caer silenciosamente al World local por faltar variables de plataforma como `VERCEL_DEPLOYMENT_ID`. Una configuración incoherente falla antes de admitir sesiones.

### Migración sin pisar conversaciones

No copiar cuentas o archivos de sesión de forma parcial. Primero ensayar exportación/importación soportada con la combinación exacta de EVE y World. Si no existe una migración fiel, mantener el origen antiguo autenticado y de solo lectura durante la ventana pendiente de siete días; los nuevos chats se crean en el destino nuevo, con identificador de origen en metadatos. No redirigir silenciosamente una URL antigua a una sesión vacía.

Para no mantener indefinidamente dos runtimes, cerrar nuevas altas/turnos en el origen, esperar el drenaje de ejecuciones, conservar acceso histórico hasta su caducidad y retirar el origen siguiendo el procedimiento de borrado. El origen actual es loopback y valida un único `EVALUATION_ORIGIN`: dejarlo encendido no lo hace accesible desde cloud. Antes del cutover debe existir una ruta autenticada soportada y probada hacia ese origen, con modo lectura aplicado en el canal, selección del origen controlada por servidor y sin reenviar cookies entre dominios arbitrarios. Si no se puede demostrar, mantener acceso local hasta drenar la ventana y posponer el cambio; no prometer continuidad remota. Cualquier limitación en reanudar sesiones entre Worlds debe quedar explícita antes de autorizar la migración, sin construir otra UI o transcripción.

## Acceso y admisión de trabajo

### Treinta cuentas sin acoplar identidad a capacidad

Evidencia actual: [migración de evaluación](../../infra/postgres/migrations/0003_evaluation_access.sql), [CLI](../../scripts/evaluator.mjs) y [servicio de acceso](../../apps/mobility-core/src/evaluation.ts).

- Añadir migración nueva, sin editar el checksum de `0003`: retirar solo el máximo cinco del `CHECK` y conservar slot positivo/único, UUID y claves foráneas.
- Introducir `access_policy` con capacidad inicial 30. Alta y reactivación bloquean esa fila y cuentan cuentas activas/no caducadas en la misma transacción. El límite no depende del número de slot.
- Conservar slots existentes y ofrecer asignación administrativa automática; CLI deja de codificar `1..5`. No usar slot como identidad de negocio.
- Conservar Better Auth, signup deshabilitado, revocación y vencimientos actuales. No reactivar usuarios ni renovar 30 días de acceso de forma implícita.
- Actualizar herramientas de prueba: el smoke actual reserva slots 4/5; la carga usa una base aislada y no ocupa cuentas reales.

### Login sin bucket único para todos

El [proxy Core](../../apps/mobility-core/app/api/auth/[...all]/route.ts) fuerza ahora la IP común `127.0.0.1`. Se sustituye por un contexto de cliente obtenido del ingreso confiable de cada despliegue y autenticado entre Web/Core.

1. El adaptador de ingreso identifica la IP solo mediante el mecanismo documentado del hosting. No aceptar el primer `X-Forwarded-For` enviado por cualquiera.
2. Web elimina cabeceras de identidad aportadas por el cliente y reenvía contexto firmado con propósito, timestamp, método/ruta y huella de solicitud; Core verifica servicio, integridad y ventana temporal.
3. Aplicar buckets SQL compartidos por cuenta normalizada, red confiable y servicio. Como perfil inicial: 10 fallos/minuto por cuenta, 60 intentos/minuto por IP y 120/minuto globales, con backoff acotado; recalibrar mediante la prueba de 30 logins legítimos detrás de una misma NAT.
4. No revelar existencia de una cuenta ni guardar IP/correo en métricas generales; usar identificadores derivados con clave para los buckets y caducidad corta.
5. Si el contexto confiable falla, rechazar autenticación o usar un límite conservador explícito; no convertir una cabecera sin verificar en permiso.

Los guards de canal EVE siguen siendo obligatorios: Vercel puede enrutar al runtime antes de Next. CORS y middleware no sustituyen propiedad por operación, sesión Better Auth ni autorización servidor a servidor.

### Admisión interactiva distribuida

La configuración habitual es `interactive`. El semáforo de cinco intentos en [conversation-budget](../../apps/mobility-core/src/conversation-budget.ts) pertenece a campañas opt-in; [budgeted-fetch](https://github.com/alanslzrr/digital-twin-conversational-mobility/blob/c9fe6ba/apps/eve-web/src/budgeted-fetch.ts) no lo aplica al modo habitual. Añadir protección propia sin transformar el uso ordinario en campañas ni modificar su evidencia histórica.

Tablas conceptuales nuevas: `runtime_capacity_policy`, `runtime_execution` y reservas de uso por ventana. Los nombres finales siguen las convenciones de migración. Core es la autoridad; Web solo utiliza contratos internos autenticados.

- Admitir antes de iniciar generación. Una conversación aparcada, lectura de historial o pausa esperando aprobación **no ocupa una plaza de inferencia**.
- Una operación idempotente se identifica por propietario, sesión e ID de operación, ligado a hash de entrada; reutilizar ese ID con otro contenido se rechaza. Reenvíos no consumen plazas/cuota dos veces; no descontar cuotas de generación por rechazos de capacidad.
- La creación aún no tiene `sessionId`: reservar provisionalmente por propietario+ID de operación y vincular después la sesión creada por EVE. Estados del flujo: aparcada → activa → pausada/finalizada; una aprobación vuelve a adquirir capacidad antes de continuar. La creación aparcada mantiene el consumo de cuota actual, pero no una plaza activa. La reserva de cuota y admisión de una generación se decide en una única transacción; el alta externa EVE se reconcilia mediante estado durable, sin fingir una transacción distribuida. Si el resultado de crear la sesión es incierto, recuperar por el mecanismo soportado o bloquear/reconciliar la operación, no crear otra a ciegas.
- Estado mínimo: `reserved → running → completed | failed | unknown`. Token de fencing y deadlines impiden publicaciones tardías **en operaciones controladas por Core**. El fencing SQL no protege automáticamente streams/escrituras del World EVE: la integración soportada debe verificarlo y probarlo en el gate A, sin extender esa garantía antes de tiempo.
- Admisión y revalidación viven también en el ciclo durable y transporte del modelo: continuación, replay, retry y llamadas de compactación no pueden saltarse reserva por no atravesar otra petición HTTP. La vinculación de sesión se realiza desde contexto EVE confiable, nunca con propietario declarado por el navegador. Cada aprobación nueva es una operación distinta conforme a la cuota actual, pero reintentar esa aprobación con el mismo ID no la consume otra vez.
- Transacciones breves para reservar/finalizar; nunca mantener un lock SQL durante modelo, OTP o red externa.
- Cada dispatch y retry del modelo reserva tokens/coste estimado conservador, además de la plaza del turno. Contar entradas, salidas y llamadas múltiples; reconciliar uso confirmado al terminar. La falta de usage mantiene reserva incierta, no coste cero.
- Mantener timeout actual por llamada, límites de contexto/salida/sesión y aprobaciones EVE. Si una llamada pudo enviarse y su resultado es desconocido, no repetirla automáticamente. No se promete exactly-once frente a un proveedor externo.
- Separar ocupación de ejecución de deuda de presupuesto: ni `AbortSignal` ni el timeout demuestran que el proveedor dejó de trabajar. Una ejecución local caducada pasa a cuarentena durable si hubo dispatch incierto; mantener su reserva económica y de exposición. Como perfil conservador, `activas + cuarentenas sin resolver ≤ 5`; liberar estas últimas exige evidencia de fin o reconciliación administrativa explícita, no solo esperar un TTL. Las leases no quedan vivas eternamente, pero la incertidumbre puede detener nuevas generaciones hasta resolverla. El máximo cinco es admisión controlada por la aplicación, no una certificación de concurrencia interna del proveedor.
- No cola global ilimitada. Devolver `busy`/429 con `Retry-After`; fallo de dependencia devuelve 503. Conservar texto del usuario y permitir reintento explícito, no un bucle automático de 30 navegadores.
- Aprobar límites diarios globales/per-user de gasto antes de habilitar llamadas reales. Configuración ausente implica generación alojada deshabilitada. Un presupuesto mensual del proveedor no reemplaza este control.

OTP utiliza un semáforo equivalente de dos plazas compartido por todas sus entradas. Saturación del cálculo de rutas no bloquea login, historial o consultas de datos guardados. El resultado de una solicitud con deadline agotado nunca se presenta como ruta válida inventada.

## PostgreSQL y presupuesto de conexiones

**PostgreSQL 17 y PostGIS**, con roles separados para aplicación y migraciones. La observabilidad actual usa `transaction_timeout` de PG17; no cambiar silenciosamente a PG16. Validar extensiones, collation/zonas horarias y restauración en el destino.

Hay cuatro pools de hasta dos conexiones por proceso Core: dominio, meteorología, Better Auth y observabilidad. El worker llama Core por HTTP y no suma otro pool. Las separaciones de weather/telemetría mantienen cancelación y aislamiento; no unificarlas solo para reducir código.

```text
conexiones cliente máximas =
  Σ(réplicas máximas × suma de pools de cada proceso)
  + procesos con SQL directo + migraciones/administración
```

Perfil inicial: una réplica Core, pools `2+2+2+2=8`; permitir temporalmente una segunda durante validación/deploy supone 16. Reservar al menos dos conexiones administrativas y margen adicional; ejemplo de presupuesto disponible: **24 clientes**, no 24 usuarios. Un pooler puede multiplexarlos, pero su límite de clientes y las conexiones backend del servidor se dimensionan por separado.

Configurar máximos de réplica antes de autoscaling. Aumentar pools solo después de medir espera de checkout y duración SQL. Preferir corregir consulta/índice/proyección antes de multiplicar conexiones. Mantener `prepare:false` donde ya se usa. Probar driver Better Auth, `BEGIN`, `SET LOCAL`, cancelaciones y locks con el pooler elegido; usar conexión directa para migraciones y operaciones que requieran sesión estable.

Medir conexiones, espera p95/p99, transacciones largas, locks, timeouts, CPU/IO y tamaño por tabla/índice. La telemetría debe seguir fallando sin bloquear deliberadamente el chat. No agregar un exporter pesado que consuma el margen reservado de SQL.

## Objetos y releases de routing

### Tres interfaces de infraestructura en Core

| Interfaz nueva | Contrato mínimo | Implementación inicial |
| --- | --- | --- |
| `RawObjectStore` | Guardar inmutable, leer/head/verificar hash, borrar idempotente; streaming y tamaño acotado | Filesystem para local, S3 para alojado |
| `RoutingReleaseRegistry` | Descriptor activo, estado de transición, hashes, journal y lease/fencing | PostgreSQL como autoridad; objetos inmutables para artefactos |
| `OtpClient` | Consulta con deadline/cancelación y release esperada; readiness verificable | Loopback/red de contenedores inicial; endpoint privado autenticado al separar máquina |

Ubicación propuesta: `apps/mobility-core/src/infrastructure/`, con contratos internos estrechos. No envolver cada consulta SQL en un repositorio genérico ni filtrar tipos AWS al dominio. Los adaptadores GCS/R2 se implementan únicamente al elegir esos destinos y pasan las mismas pruebas de contrato.

### Publicación raw coherente

Conservar claves content-addressed y checksums. Primero asegurar objeto durable; después publicar referencia SQL dentro de una transacción que comprueba la lease. Si falla SQL, queda un objeto huérfano que se recoge más tarde. Nunca publicar una fila que apunta a una carga incompleta.

La recolección de objetos consulta referencias y `expires_at`, con lotes, cursor y margen de seguridad. **No aplicar lifecycle de 24 horas desde creación a raw deduplicado:** el mismo hash puede reutilizarse y renovar su referencia SQL; un TTL físico ingenuo borraría datos todavía válidos. Eliminar solo cuando no quede referencia vigente y haya vencido el margen; reintentar fallos sin marcar borrado exitoso.

La comprobación de referencias y el borrado no son atómicos entre SQL/S3. Reclamar borrado en un registro SQL por hash con estado `deleting`, generación y fencing. El publicador del mismo hash no puede renovar referencias durante esa reclamación: espera o vuelve a materializar/verificar el objeto tras completar el borrado. La confirmación SQL comprueba la misma generación; recuperación de un borrado incierto usa `head`/hash antes de liberar el tombstone. Un margen de tiempo, por sí solo, no resuelve esta carrera.

### Releases con mantenimiento acotado

El [activador actual](../../scripts/activate-routing-release.mjs) reemplaza catálogos SQL antes de cambiar el grafo. Por ello no basta un cambio de URL OTP para afirmar blue/green sin interrupción.

Para esta etapa:

1. Publicar grafo/manifiestos inmutables con hash e ID de release desde un build separado.
2. Registrar `transitioning` y journal durable en SQL. **Conservar mantenimiento completo del runtime dependiente de Core durante la activación inicial:** bloquear nuevas operaciones de dominio, ingestión/read-through y generación, drenar trabajo en vuelo y detener Core/worker para la importación, como requiere la secuencia actual. Web muestra mantenimiento sin borrar conversación; no basta bloquear `plan_journey`, porque otros lectores y normalizadores comparten catálogos.
3. Actualizar catálogos mediante la secuencia reversible existente, preparar el grafo en disco cacheado y arrancar OTP.
4. Readiness debe comprobar el ID/hash **del grafo realmente cargado**. El wrapper de arranque conoce lo que montó y certifica ese descriptor; una lista de feed IDs no basta.
5. Reiniciar Core/worker aún sin admitir tráfico ni adquisición, verificar coherencia y activar en SQL solo si versión de catálogos y OTP coinciden. Toda réplica consulta el estado compartido. Fencing y revalidación de `staticVersion` descartan cualquier publicación tardía iniciada antes de la transición; reabrir el ingreso al terminar.
6. Ante fallo, mantener el modo de mantenimiento completo, recuperar desde journal o revertir catálogo y grafo juntos. Nunca mezclar versiones para «seguir dando servicio».

El disco no decide la release global. URLs OTP son configuración fija y validada, sin redirects ni entrada de usuario; la migración no consiste en eliminar la comprobación de loopback de [routing](../../apps/mobility-core/src/routing.ts).

**Evolución futura, no implementación inicial:** catálogos coexistentes por `releaseId`, request fijada a catálogo+instancia OTP de la misma versión y drenaje antes del cambio. Esa es la condición para reducir mantenimiento más adelante; hoy se admite una indisponibilidad anunciada del runtime durante activación, no solo de routing. Acotar y medir su duración, sin prometerla antes del ensayo.

## Ingestión y cuotas externas

Conservar ventana activa de 30 minutos, dos carriles iniciales, leases SQL, publicación idempotente, backoff y adquisición compartida. Un nuevo usuario no crea otro ciclo de descarga. Más instancias Core no amplían el cooldown EMT, geocoder o AEMET.

Introducir perfil validado `local | hosted | preview`. `hosted` exige habilitación explícita, orígenes fijos, credenciales apropiadas y almacenamiento durable; `preview` deshabilita ingestión/modelo real por defecto. No habilitar la red por detectar `DATABASE_URL` y no retirar indiscriminadamente guards locales de [dominio](../../packages/domain/src/ingestion.ts) y [worker](../../scripts/ingestion-worker.mjs).

El worker persistente puede dormir/revisar actividad, pero solo adquiere fuentes dentro de la ventana. Un tick no reproduce todos los intervalos perdidos. Al agotarse la ventana termina la tarea acotada o cancela según su deadline y deja de descargar. No trasladarlo a cada request Web ni a Cron periódico de tiempo real. Identificar heartbeat como `workerInstanceId + lane` antes de añadir un segundo worker; los IDs de carril solos no distinguen procesos.

Cache miss sin capacidad de refresco: devolver lectura almacenada con edad/calidad real o `unavailable`, junto con limitación cuando corresponda. Coalescer peticiones del mismo recurso con lease; no aumentar cuotas upstream para aparentar más concurrencia. Preservar consentimiento, atribución y restricciones de geocodificación.

## Panel y respuesta de la interfaz

### Compartir cálculo no permisos

Crear proyecciones SQL de datos comunes saneados: resumen, estado de fuentes y agregados frecuentes. Clave por versión de esquema y filtros normalizados/acotados; caducidad y límite de cardinalidad para evitar caché infinita. No cachear conjuntamente conversaciones, payloads ni ejecuciones privadas.

- Autenticar y comprobar revocación/ownership en cada petición aunque la proyección esté cacheada.
- Recalcular mediante single-flight distribuido: una lease SQL breve por clave. Cache miss sin productor debe permitir un cálculo `stored_only` acotado o responder estado explícito; no todos los usuarios repiten agregados JSONB.
- Conservar `computedAt`, `observedAt`, `ingestedAt`, `readAt`, origen y calidad. Tiempo de caché no es tiempo de observación.
- Revaluar frescura al servir, o vencer proyección antes de su siguiente transición semántica. No conservar un booleano `fresh` más allá del TTL del dato.
- La proyección nunca llama proveedores ni activa ingestión por una lectura. El heartbeat autorizado conserva su función separada.
- `Cache-Control: private, no-store` en respuestas autenticadas. Caché compartida interna no equivale a CDN pública de respuestas personales.

### Reducir polling y mantener responsividad

Perfil inicial: resumen/estado 15 s, datos de vista activa 30 s, heartbeat 60 s. Polling rápido de 3 s solo mientras una ejecución propia está pendiente, con duración acotada; al finalizar vuelve a la cadencia normal. Pausar al ocultar la pestaña, añadir jitter/backoff y respetar `Retry-After`.

Con 30 pestañas que ejecuten los tres flujos: `30/15 + 30/30 + 30/60 = 3,5 solicitudes/s`, antes de lecturas adicionales. No es benchmark. La proyección evita 30 agregaciones pesadas, aunque las 30 comprobaciones de acceso siguen siendo necesarias.

Preservar SWR, caché del cliente y componentes oficiales. Mantener mensajes/scroll al reconectar; no resetear conversación por tema o idioma. Separar skeleton inicial de actualización silenciosa; mostrar antigüedad y pérdida de conexión sin inventar datos. Cancelar consultas abandonadas y cargar mapa/gráficos diferidos. Pruebas a 360 px, escritorio y zoom 200 %, teclado, ausencia de overflow y estados busy/error en ES/EN. No rediseñar el chat bajo este encargo.

Las teselas siguen limitadas a `https://tile.openstreetmap.org`, anónimas y sin cookies/datos privados. El uso no comercial no convierte el servidor comunitario en CDN ilimitada. No hacer precarga masiva ni offline; cualquier cambio de proveedor/origen requiere autorización y actualización explícita de la frontera existente. [Condiciones técnicas OSM](https://operations.osmfoundation.org/policies/tiles/).

## Retención recuperación y seguridad

### Qué se retiene y qué se elimina

| Datos | Regla propuesta |
| --- | --- |
| Identidad y ownership | Conservar vencimientos/revocación actuales; acceso bloqueado inmediatamente al caducar |
| Transcripciones EVE | Lectura de hasta 7 días desde registro; persistencia y purga física dependen del World. Verificar API soportada antes de fijar plazo físico |
| Observabilidad propia | Hasta 7 días lógicos y cuotas existentes, con presupuesto global adicional y purga en lotes |
| Histórico/raw | Conservar objetivo temporal vigente; borrado acotado y consciente de referencias deduplicadas |
| Releases | Conservar activa y anterior recuperable; más versiones solo dentro del presupuesto de almacenamiento y vigencia |
| Backups | Cifrados, acceso separado, rotación diaria propuesta de 7 días; borrado de datos puede permanecer en backups hasta su rotación documentada |

Cada punto recuperable debe tener manifiesto coherente de backup SQL y versiones/hashes de objetos requeridos. Fijar esos objetos y releases mientras exista un backup que los necesite, aunque ya no sean la release activa/anterior; el GC respeta también esas referencias. Si la política excluye raw ya caducado de los respaldos, declarar esa exclusión y sanear referencias al restaurar: no recuperar filas que aparenten evidencia disponible sin sus objetos. Verificar checksum y completitud antes de declarar válido el punto de recuperación.

No afirmar «se borra a los siete días» cuando solo caduca el acceso. Pro retiene siete días **después de completar** el run, distinto del reloj de ownership. Para borrado solicitado: tombstone/bloqueo inmediato → trabajo de eliminación idempotente usando API soportada → confirmación verificable. No borrar directamente tablas internas de Workflow ni activar `retention:0` si elimina el historial al terminar.

Un mantenimiento dependiente de actividad no garantiza un plazo físico cuando nadie entra. Inicialmente se declara esa limitación y se ofrece mantenimiento administrativo explícito acotado. Si se requiere purga física en un plazo garantizado, introducir un job finito de mantenimiento independiente y aprobado: no reactivar ingestión ni crear un Cron de tiempo real como efecto secundario.

### Recuperación y disponibilidad

La VM única es un punto de fallo aceptado para 20–30 cuentas; escalabilidad no equivale a alta disponibilidad. Reinicio supervisado, readiness por servicio, alertas y despliegue reversible reducen incidencias, pero no justifican un SLA comercial.

Objetivo inicial para **DB/objetos del backend**: RPO ≤ 24 h y RTO ≤ 4 h, verificables con restauración a un entorno aislado. RPO es pérdida máxima objetivo y RTO tiempo objetivo de recuperación. Usar backup externo y exportación recuperable, no solo volumen de la misma VM. EVE gestionado tiene otro mecanismo de recuperación; no extender estos objetivos a transcripciones hasta probarlo.

Health superficial indica proceso vivo; readiness comprueba dependencias necesarias y versión routing. OTP caído degrada rutas, no toda la Web. Si falla DB, fallar cerrado en autenticación/cuotas; no dar acceso usando un fallback permisivo. Fallo del sink de telemetría produce captura parcial visible, no éxito ficticio ni caída intencionada del chat.

### Seguridad mínima sin programa formal de compliance

No se añaden certificaciones, comités ni procesos de empresa. Sí se mantienen controles prácticos: TLS, secretos solo servidor, scopes mínimos, cookies seguras, CSRF/origin, propiedad, cuotas, backups, actualización de dependencias y logs saneados. Open-source/no lucrativo no justifica eliminar estos mecanismos ni ignorar límites de proveedores.

- Separar desarrollo, preview y alojado; previews solo fixtures y sin copias de conversaciones reales.
- AWS usa roles/credenciales temporales, no claves de administrador en `.env` o CI. Rol runtime distinto del de despliegue/migración; permisos a bucket/prefijo necesario, sin `AdministratorAccess` ni `iam:PassRole` global.
- En EC2 un instance profile no equivale automáticamente a un rol por contenedor: restringir acceso a metadata, no montar socket Docker y conceder al host el mínimo agregado. La separación fuerte por tarea puede llegar con ECS; no presentarla como existente.
- No persistir prompts, cookies, tokens, domicilios o coordenadas privadas en logs generales. La telemetría autorizada conserva su saneamiento y ownership.
- Para generar políticas IAM desde futuro código AWS/IaC usar análisis reproducible de las llamadas reales y revisión de permisos. Este spec no genera ni aplica políticas IAM.
- `git.deploymentEnabled:false` y bloqueo actual del configurador Vercel permanecen. Solo rehabilitar tooling de despliegue tras auditoría de dependencias y autorización explícita, no mediante una CLI global para eludir el bloqueo.

## Capacidad y costes

### Dimensionamiento de partida

**Hipótesis para ensayar:** VM Linux amd64 de 4 vCPU y 16 GiB, Core limitado inicialmente a 2 GiB, OTP heap 4 GiB y límite 6 GiB, worker pequeño y margen para SO/proxy/caché. La suma de límites y consumo residente se verifica; no dar cuatro CPU exclusivas simultáneamente a cada contenedor sobre un host de cuatro CPU. CPU compartida con prioridades y medición de contención. Esta clase no es requisito mínimo probado ni recomendación de compra de un SKU concreto.

La [configuración local](../../infra/local/compose.yaml) ya asigna heap 4 GiB/límite 6 GiB a OTP: un free-tier diminuto no es equivalente. El build del grafo necesita capacidad propia y nunca compite con serving. Ajustar tamaño de disco a artefactos activos/anterior más margen; no dimensionar solo por el número de cuentas.

Reutilizar Neon únicamente después de validar versión/extension, volumen, CPU, conexiones, backups y plan. Las cuotas de payload actuales permiten teóricamente `30 × 256 MiB = 7,5 GiB` de observabilidad, **antes de índices, histórico y otros datos**; no es consumo medido. Añadir límite global de captura subordinado al espacio disponible, preservando estados `partial`/`limited`. Si el plan no cabe, aprobar upgrade o reducir explícitamente la política de captura; no eliminar evidencia ya prometida de forma silenciosa.

### Modelo económico

```text
coste mensual = plan Web + uso Web/Workflow/colas
              + VM/disco/IP + PostgreSQL/backup
              + objetos/operaciones/egress + modelo
```

Vercel Pro publica base de **20 USD/mes**, con un asiento de despliegue y crédito de uso; extras, impuestos y otras plataformas se facturan aparte. Los 30 usuarios finales de mobai no requieren 30 asientos de desarrollador. [Plan Pro](https://vercel.com/docs/plans/pro-plan).

No fijar presupuesto total con un número de usuarios: falta duración de actividad, consultas, tokens, retención y almacenamiento reales. Antes de contratar, preparar estimación para uso previsto y techo configurado, con tarifas regionales actuales, costes de tráfico entre Vercel/Neon/AWS y restauración. Las alertas de facturación no son siempre un tope duro; la admisión propia y el máximo de réplicas deben limitar gasto.

**No se promete despliegue completo gratuito.** Hobby puede servir para una prueba limitada; créditos GCP/AWS y niveles gratuitos son beneficios temporales/condicionados, no fundamentos de la arquitectura. El runtime público se habilita solo después de aprobar un techo mensual y el perfil de gasto del modelo.

## Secuencia de implementación

Cambios pequeños y reversibles, en ramas `alanslzrr/<tema>`, commits Conventional Commits por responsabilidad. No mezclar actualización general de EVE/Next con todas las migraciones. El siguiente número SQL se elige al implementar; `0021` es la última migración de la base inspeccionada.

| Fase | Trabajo y archivos orientativos | Salida verificable |
| --- | --- | --- |
| A Compatibilidad EVE | Versiones fijadas, contrato del World, build/stream/guard/retención; `apps/eve-web/next.config.ts`, agente/canal, supervisor y vendor README | Decisión de runtime sustentada por pruebas sintéticas; sin cloud autorizado no se marca validación alojada |
| B Acceso y límites | Nuevas migraciones, `scripts/evaluator.mjs`, `src/evaluation.ts`, Better Auth/proxy, contratos de admisión | 30 cuentas aisladas, cuotas globales y reintentos idempotentes; slots antiguos intactos |
| C Persistencia portable | `src/infrastructure/`, ingestión/raw, registro releases, cliente OTP y scripts de activación | Mismos tests con filesystem y objeto de prueba; recuperación de transición y hash de grafo |
| D Worker alojable | Configuración de perfiles en dominio/worker/endpoint; identidad de instancia | Local continúa igual; preview no adquiere; hosted falla cerrado sin habilitación/configuración |
| E Lecturas eficientes | Proyecciones Core/dashboard, polling, métricas SQL y retención acotada | Lecturas compartidas sin filtración ni falsificación de frescura; límites de almacenamiento |
| F Operación portable | Imágenes OCI fijadas, health/readiness, manifiestos Compose del perfil alojado, backups y rollback | Arranque reproducible aislado sin secretos cloud, fallo/reinicio controlado |
| G Aceptación alojada | Revisar planes, región, secretos y tooling; desplegar solo con autorización separada | Informe de carga y recuperación del destino; capacidad declarada solo para el perfil probado |

La selección de runtime de A precede al compromiso económico. B–F pueden prepararse localmente. Las pruebas de modelo real, benchmarks OTP y provisión de G son autorizaciones separadas, no efectos implícitos de aprobar este documento.

### Migración de datos y rollback

1. Inventariar esquema, conteos/tamaños y versiones sin copiar secretos al repositorio; backup verificable antes de escribir.
2. Aplicar migraciones aditivas con checksums existentes intactos. Compatibilidad temporal de lectores antiguos/nuevos y feature flags para activar adaptadores.
3. Copiar objetos inmutables y verificar checksums antes de cambiar referencias. No dual-write a dos fuentes de verdad de forma indefinida.
4. Ensayar restore/cutover con fixtures; para datos reales, ventana de mantenimiento y origen en modo lectura durante el traslado final. No dos bases aceptando escrituras divergentes.
5. Activar nuevo destino y verificar permisos/historial/routing. Conservar artefactos anteriores para rollback de código y releases.
6. Después de escrituras nuevas, rollback DB requiere reconciliación explícita; no restaurar un snapshot antiguo sobre usuarios/datos nuevos. La reducción a cinco slots tampoco permite borrar usuarios 6–30 para que arranque la CLI antigua.

## Aceptación y evolución

### Matriz de pruebas requerida para implementar

| Prueba | Criterio |
| --- | --- |
| Regresión | `pnpm check`, build agente cuando aplique y suites de límites; sin credenciales cloud |
| Treinta cuentas | Alta concurrente nunca supera política; login desde misma NAT no bloquea a todos; headers falsos no eluden límites |
| Aislamiento | Anónimo/revocado/otro dueño no accede por Web, EVE directo, Core, historial o payloads |
| Admisión | Ráfaga de 30 respeta 5 turnos y 2 OTP; 2 réplicas Core no duplican capacidad ni consumo idempotente; cinco pausados más cinco activos no superan el máximo al aprobar los antiguos; replay/retry/compactación pasan por reservas |
| Carga sintética | 30 paneles y mezcla de herramientas durante 30–60 min, sin crecimiento de backlog/memoria ni degradación SQL progresiva; registrar entorno y distribución p50/p95/p99 |
| Fallos | Reinicio en dispatch/publicación; gastos y exposición inciertos en cuarentena explícita, sin doble publicación ni leases vivas eternas |
| Proveedores | Dobles locales verifican cooldown/backoff y coalescencia; lecturas no descargan; caída devuelve stale/unavailable correcto |
| Caché y tiempo | Avanzar reloj a través de TTL mantiene frescura correcta; owner nunca comparte payload privado |
| Persistencia | Reinicio/cambio de instancia conserva historial nativo y pausas; retención real no acorta ventana de acceso |
| Objetos | Publicación deduplicada concurrente con GC nunca deja referencia vigente a objeto ausente; probar también borrado incierto y reinicio |
| Releases | Caída en cada fase conserva journal; grafo incorrecto no pasa readiness; activación concurrente con ingestión/consulta de salidas no mezcla catálogos; rollback coherente |
| Restauración | Recuperar DB/objetos en entorno vacío sin inferencias ni adquisición; GC no borra artefactos fijados por backups vigentes; verificar RPO/RTO separados de EVE |
| UI | Móvil/desktop/zoom200 %, estados offline/busy/degradado, ES/EN y continuidad del chat oficial |

La carga sintética prueba **nuestra infraestructura**, no los límites privados del modelo ni el rendimiento del OTP real. Una certificación end-to-end exige ensayo autorizado con esas dependencias; hasta entonces comunicar «30 cuentas y admisión acotada diseñadas», no «30 usuarios generando simultáneamente garantizados».

### Cuándo crecer sin rehacer el producto

| Señal observada | Acción antes de añadir complejidad |
| --- | --- |
| SQL domina p95 o pool espera regularmente | Optimizar consulta/índice/proyección; después ajustar pool y capacidad DB con presupuesto global |
| Core CPU/memoria supera 70 % sostenido en carga representativa y rompe objetivo | Ampliar VM o separar Core en dos réplicas, respetando semáforos/pools y versión routing |
| OTP causa contención o cola de rutas | Mover OTP a VM dedicada tras `OtpClient`; ampliar plazas solo con benchmark autorizado |
| Muchas respuestas busy con DB/CPU sanas | Revisar duración y cuotas/tokens/coste del modelo; no escalar servidores a ciegas |
| Worker acumula trabajo vencido dentro de ventana | Revisar fuente lenta/backoff; aumentar carriles con límites globales intactos antes de otro sistema de colas |
| Datos/proyecciones exceden presupuesto | Ajustar índices, retención/captura y plan; no sustituir PostgreSQL por una base distinta por defecto |
| Se exige continuidad ante pérdida de VM | Segundo host y balanceo, backups/restauración y DB con nivel de disponibilidad adecuado; nueva inversión explícita |
| Se desea salir de Vercel | World compatible y migración de sesiones ensayada; posible runtime dedicado sin reescribir UI/dominio |

No se planifica ahora capacidad para cientos o miles ni se promete escalado ilimitado. Se preparan las fronteras que permiten medir, sustituir hosting y añadir réplicas sin rehacer las funcionalidades existentes.

## Referencias verificadas

Fuentes primarias consultadas el 05/10/2026; precios/límites se revalidan antes de contratar. Las cifras de diseño de este documento son decisiones propias, no capacidades garantizadas por estas fuentes.

- [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Pro](https://vercel.com/docs/plans/pro-plan), [Functions](https://vercel.com/docs/functions/limitations) y [Workflow](https://vercel.com/docs/workflows/pricing): uso, facturación, ejecución y retención.
- [EVE y despliegue Vercel](https://github.com/vercel/eve/blob/main/docs/guides/deployment/vercel.mdx), [sesiones](https://github.com/vercel/eve/blob/main/docs/concepts/sessions-runs-and-streaming.md) y [World PostgreSQL](https://workflow-sdk.dev/worlds/postgres): continuidad, extensiones y límites de self-host. Contrastar documentación upstream con EVE 0.65.0 y lockfile local.
- [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Node](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) y [Containers](https://developers.cloudflare.com/containers/): no asumir equivalencia entre Workers, Node y contenedores.
- [Cloud Run y CPU/facturación](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [Compute Engine](https://docs.cloud.google.com/compute/docs/general-purpose-machines): distinguir servicio HTTP elástico de proceso persistente.
- [AWS IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html), [roles ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam-roles.html) y [S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html): permisos, límites de aislamiento y almacenamiento de objetos.
- [Neon](https://neon.com/pricing): comprobar plan, capacidad y recuperación; ninguna cuota gratuita se da por suficiente.
- [PostgreSQL 17](https://www.postgresql.org/docs/17/runtime-config-client.html) y [teselas OSM](https://operations.osmfoundation.org/policies/tiles/): timeouts y frontera cartográfica existente.
- Skills solicitadas: [nextjs-on-cloudflare](https://github.com/cloudflare/skills/tree/main/skills/nextjs-on-cloudflare) y [aws-iam](https://github.com/aws/agent-toolkit-for-aws/tree/main/skills/core-skills/aws-iam). Instaladas como herramientas locales, no dependencias de mobai ni autorización de despliegue.
