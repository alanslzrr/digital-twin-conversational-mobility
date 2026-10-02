# Tarifas verificadas y coste orientativo de aparcamiento

[Índice de la wiki](../index.md) · [Archivo de acceptance](index.md) · [Estado vigente](../roadmap.md)

> **Acta histórica.** Conserva los hechos y conclusiones de su fecha. Las instrucciones o pendientes originales no sustituyen el alcance vigente. Las obligaciones de cierre R2 se retiraron por [decisión del usuario](../roadmap.md#decisión-sobre-r2); no se declaran ejecutadas. Para operar, usa la [guía actual](../local-runtime.md).

Entrega local, 01/10/2026. Amplía `get_parking`, sin herramientas nuevas, migraciones ni cambios en OTP/interfaz EVE.

- 15 IDs municipales asociados explícitamente al [directorio EMT](https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES): 5, 7, 9, 12, 15, 22, 25, 53, 67, 71, 84, 99, 100, 102 y 103. No se hereda tarifa para privados ni para el alias ambiguo 11.
- Tarifa general, especiales Orense/Portugal/Recuerdo/Fuente de la Mora y campaña pública Pitis, comprobadas el 01/10/2026. Referencias, tramos, IVA, fechas publicadas y ejemplos en el catálogo versionado Core; no se redistribuyen carteles ni se presupone su licencia.
- Turismos, duración opcional 1–1440 minutos. Ejemplo oficial antes de cálculo determinista en unidades monetarias enteras; máximo separado cuando faltan tramos. Sin estancia inventada ni bloqueo al cambiar de año: proyección a última tarifa conocida, no vigencia futura confirmada.
- Gratuidad disuasoria 5–16 horas con transporte público, tique y título del mismo día, solo en aparcamientos adheridos; escenario independiente de la tarifa ordinaria. Pitis conserva su campaña pública específica, sin fecha de finalización publicada.
- Ocupación y precio degradan independientemente. Precio sin ocupación; plazas sin precio; ausencia de tarifa no equivale a cero. La descarga SOAP no actualiza ni sustituye los precios contrastados.

Validación: 43 pruebas focalizadas (incluyen regresiones de calidad por entidad); `pnpm check` con 412 aprobadas / 73 omitidas, lint/fronteras, typecheck y builds; agente compilado. MCP autenticado real: los 15 IDs, Plaza Mayor 2 h = aproximadamente 6,15 EUR, Orense máximo 18 EUR, proyección 2027, Fuente de la Mora gratuidad condicionada, Pitis y precio ausente. Repetición: cero nuevas adquisiciones de ocupación tras la primera consulta; precios no realizan adquisiciones. Salud Core/Web y rechazo MCP sin autenticación correctos.

Activación: Core/Web/agente compilados y comprobados en el runtime local; worker habitual conservado. No se ejecutaron nuevas inferencias, campañas, benchmarks ni despliegues. La respuesta redactada en conversación no se probó mediante llamadas al modelo.

Límites: cobertura parcial, orientación no facturación; no reserva/plaza/apertura garantizadas. Jacinto Benavente conserva la advertencia de obras publicada por EMT. Nuevas publicaciones requieren actualización explícita del catálogo y recompilación; una comprobación interna no acredita vigencia legal ni renueva ocupación. SER, abonos, pagos, otros vehículos y ranking universal quedan fuera de este bloque.
