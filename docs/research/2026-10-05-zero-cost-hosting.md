# Alojamiento inicial con presupuesto cero

[Índice](../index.md) · [Investigaciones](index.md) · [Alcance](../roadmap.md) · [Spec evolutivo](../plans/2026-10-05-scalable-architecture.md)

**Revisión: 05/10/2026. Investigación y propuesta; ningún servicio provisionado.** Presupuesto obligatorio de infraestructura: **0 USD**, sin depender de promociones que obliguen a pagar después. Sustituye la elección inicial de Vercel Pro + VM AWS + S3 del spec; conserva sus fronteras de dominio, identidad, procedencia y portabilidad.

## Comparación verificada

Los cupos no son capacidad concurrente certificada. «Gratis» significa dentro del plan y sus límites vigentes, no garantía contractual perpetua.

| Servicio | Oferta gratuita relevante | Encaje y limitación |
| --- | --- | --- |
| [Neon](https://neon.com/blog/neon-free-plan-1-gb-per-project) | 1 GB PostgreSQL/proyecto, 100 CU-h/mes, 5 GB de transferencia y 5 GB de objetos; suspensión automática por inactividad | Primera opción de DB gestionada si caben catálogo, índices, observabilidad e historial. La ampliación a 1 GB se anunció el 02/10/2026: la cifra anterior de 0,5 GB quedó desactualizada. No sumar cupos de proyectos para simular una única DB. |
| [Supabase](https://supabase.com/pricing) | 500 MB DB, 1 GB archivos, 5 GB transferencia, dos proyectos activos | Alternativa de DB; menos espacio. Pausa tras una semana de inactividad; no incluye backups automáticos. Mantener Better Auth, no migrar identidad por la oferta comercial. |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Plan gratuito no comercial | Adecuado para Next.js, pero no aloja OTP persistente. [Workflow](https://vercel.com/docs/workflows/pricing) conserva datos un día después de completar el run: no sustituye sin más los siete días actuales de acceso a conversaciones. |
| [Railway Free](https://docs.railway.com/pricing/plans) | Crédito recurrente de 1 USD/mes; 0,5 GB RAM, 1 vCPU y 0,5 GB volumen por servicio | Existe plan permanente, separado del trial de 5 USD. El crédito no es una factura de 1 USD ni asegura servicio continuo. No encaja OTP con su configuración actual. |
| [Cloudflare Workers Free](https://developers.cloudflare.com/workers/platform/limits/) | 100.000 solicitudes/día; 10 ms CPU/solicitud; 128 MB memoria | Útil para funciones ligeras. Compatibilidad Next.js no prueba compatibilidad del runtime EVE/Workflow; no es una VM Java para OTP. |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | 10 GB-mes Standard, 1 millón operaciones A y 10 millones B; salida sin coste | Buen adaptador de objetos futuro, pero el exceso se factura. No confundir franquicia gratuita con bloqueo de gasto; no elegirlo por defecto bajo presupuesto estricto sin verificar protección efectiva. |
| [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) | A1 ARM: 2 OCPU y 12 GB RAM totales; 200 GB de bloques incluyendo arranque; cinco backups de volumen | Principal candidato para procesos persistentes. Sujeto a capacidad regional, posible recuperación de instancias ociosas y validación ARM. Se usa la documentación técnica actual, no antiguas ofertas de 4 OCPU/24 GB. |
| [Render Free](https://render.com/docs/free) | 750 horas de instancia/mes por espacio; suspensión tras 15 minutos inactivo | Disco efímero; PostgreSQL gratuito caduca a los 30 días. No aloja de forma durable el World local de EVE. |
| [Koyeb Free](https://www.koyeb.com/docs/reference/instances) | Una instancia: 512 MB RAM, 0,1 vCPU, 2 GB SSD; sin volúmenes | API pequeña, no OTP. Suspensión tras una hora inactiva; no worker persistente. |
| [Northflank Sandbox](https://northflank.com/pricing) | Dos servicios gratuitos, una DB y dos cron jobs; anuncia servicios sin suspensión | Candidato para API pequeña; no se certifica RAM suficiente para OTP ni persistencia/retención del World con esta oferta. No incorporar cron de tiempo real. |
| [AWS Free](https://aws.amazon.com/free/) | Plan inicial de hasta seis meses, sujeto al crédito disponible | Los créditos no son alojamiento indefinido gratuito para nuestra VM. Se retira como destino inicial de esta propuesta. |
| [GCP Free](https://docs.cloud.google.com/free/docs/free-cloud-features) | e2-micro en determinadas regiones estadounidenses y franquicias por producto | La microinstancia no sustituye la configuración de OTP; Cloud Run requiere estudiar consumo y facturación, no garantiza gasto cero por tener franquicia. |

## Decisión de arquitectura bajo esta restricción

**Candidato principal: una VM Oracle Always Free para Web/EVE, Core, worker y OTP; Neon Free para PostgreSQL/PostGIS si cabe la carga.** Una sola réplica de cada proceso, conservando los límites lógicos y sin acceso SQL desde Web. No es un despliegue aprobado ni un resultado de carga.

Motivos:

1. El recurso difícil de conseguir gratis no es el frontend: es memoria persistente para OTP y ejecución compatible con EVE.
2. Una VM permite conservar Node y Java, evitando rehacer EVE para un runtime edge.
3. Separar lógicamente procesos, SQL y objetos permite migrarlos después sin cambiar las reglas de movilidad.
4. Concentrar los procesos inicialmente evita un reparto entre numerosas plataformas solo para acumular franquicias.

EVE seguiría usando una única instalación con almacenamiento persistente. **El World local se trata como solución de evaluación condicionada a pruebas de reinicio, recuperación y purga**, no como backend distribuido listo para producción. No crear réplicas que escriban a carpetas independientes. Si no supera estas pruebas, la propuesta completa queda bloqueada hasta disponer de un World compatible: no reducir silenciosamente la retención ni duplicar transcripciones en Core.

Raw y releases pueden comenzar en volumen persistente, detrás del puerto de almacenamiento definido en el spec; registrar identificadores y checksums, no rutas absolutas en contratos de dominio. Backups separados del volumen activo. OCI ofrece objetos gratuitos con cupos diferenciados según estado de la cuenta; verificar esa modalidad antes de elegir destino. No sumar dos cuotas para el mismo objeto ni asumir que todo almacenamiento es intercambiable.

Neon tiene que dimensionarse con datos reales. A 0,25 CU, 100 CU-h permiten 400 horas activas, no un mes entero encendido. El polling o mantenimiento SQL fuera de la ventana de actividad puede impedir la suspensión: revisar el worker antes de depender de este ahorro. Si el dataset no cabe o el consumo supera el cupo, evaluar PostgreSQL/PostGIS en la propia VM con memoria reservada y backups, sin presentarlo como equivalente a una DB gestionada.

## Condiciones antes de decidir un despliegue

- Verificar disponibilidad real de A1 Always Free en una región europea y elegibilidad de la cuenta. No hacer upgrade de pago para conseguir capacidad.
- Oracle normalmente exige tarjeta y puede realizar autorizaciones temporales, según su [FAQ](https://www.oracle.com/cloud/free/faq/). No equivalen a cargos definitivos, pero si tampoco se acepta esa retención temporal, esta opción queda descartada.
- Validar imágenes ARM nativas. La configuración local PostGIS fija `linux/amd64`; no trasladarla suponiendo compatibilidad ni resolverla por emulación sin medir.
- Medir memoria del grafo y consultas OTP. Los 6 GiB de contenedor y 4 GiB de heap actuales son configuración, no mínimo medido. Los 12 GB de la VM son compartidos por todo el stack, no exclusivos de OTP.
- Comprobar tamaño SQL, índices, tasa de crecimiento, transferencia y retención; no se consultaron datos privados para esta investigación.
- Empezar la validación con admisión conservadora, por ejemplo dos generaciones y una ruta concurrentes. Son parámetros de prueba propuestos, no capacidad certificada ni modificación del código.
- Mantener acceso por invitación, ownership, límites compartidos, ventanas de actividad y estados de datos caducados/no disponibles. No usar pings artificiales para eludir suspensión o recuperar cuotas mediante cuentas adicionales.
- Probar exportación/restauración fuera del volumen activo. Aceptar que una VM gratuita no ofrece alta disponibilidad; ningún diseño de dominio elimina esa limitación operativa.
- Preferir bloqueo de consumo a facturación automática. Una alerta presupuestaria no es un tope de gasto. Incluir discos, tráfico, IP, logs, backups y servicios auxiliares en la comprobación, no solo CPU.

Si Oracle no ofrece capacidad o no se acepta la verificación de tarjeta, **no se ha encontrado aquí un sustituto gratuito permanente demostrado para el stack completo conservando OTP y EVE**. Render, Railway y Koyeb sirven para partes pequeñas, no solucionan ese requisito por combinación. Las alternativas serían mantener la evaluación local o acordar explícitamente una demo con capacidades reducidas, nunca fingir rutas ni cambiar de proveedor/modelo sin aprobación.

## Alcance del coste cero

El presupuesto se aplica al alojamiento. Las llamadas al modelo configurado son un coste separado; este análisis no acredita inferencia gratuita. Si el objetivo es cero gasto operativo total, las llamadas reales deberán permanecer deshabilitadas hasta acordar financiación o una alternativa autorizada. No comprar dominio: usar un hostname disponible sin coste y verificar TLS antes de exponer sesiones.

## Validación de esta investigación

Consultadas fuentes oficiales el 05/10/2026. No se crearon cuentas, recursos ni despliegues; no se hicieron inferencias, benchmarks OTP ni pruebas de carga. La propuesta pagada anterior queda retirada para la fase inicial, no reemplazada por una promesa de capacidad gratuita para treinta usuarios simultáneos.
