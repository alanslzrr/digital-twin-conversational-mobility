# Observaciones AEMET por ubicación — entrega local

- Catálogo inicial versionado de 25 estaciones: evidencia combinada de inventario Madrid y observaciones oficiales, incluidas Venturada, Barajas RS y Navacerrada. No representa toda la red.
- Un único job AEMET conserva cadencia de diez minutos, actividad, leases y backoff. Adquiere envelope + conjunto nacional y guarda únicamente el extracto regional, con límites existentes. Sin migraciones ni sincronizador de catálogos.
- `get_environment`: estación exacta o ubicación resuelta; radio de 20 km, prioridad a la estación fresca más próxima (dos horas), alternativa antigua explícita. Sin selector: Retiro. Desconocida, conocida sin datos y falta de cobertura son estados distintos.
- Tiempo, procedencia y frescura individuales; ceros conservados, campos ausentes sin relleno. Correcciones reemplazan la lectura completa; retrocesos individuales se rechazan y reintentos idénticos conservan la incorporación original.
- Salud y agregados muestran cobertura parcial. Predicciones, avisos e itinerarios no cambian; no implica mejores rutas ni lluvia actual en una calle.

## Verificación

17 pruebas PostgreSQL en esquema aislado, incluidas revisiones/reversiones, reintentos y actualización independiente de estaciones. Pruebas focalizadas de adquisición, selección, ausencia, ceros, frescura y permisos de selectores; `pnpm check` y build del agente antes de push.

MCP real local: Alcalá–Encín, Aranjuez y Puerto de Navacerrada; selección por lugares Alcalá y Aranjuez (~7,8 km y ~7,1 km). Descarga oficial: 22 estaciones conservadas de 25; salud distingue 17 frescas, cinco antiguas y tres sin lectura al verificar. Extracto regional: 249 registros, ~61 kB. Repeticiones y agregados: cero adquisiciones adicionales mientras el job sigue vigente. Evidencia privada en `data/tmp/multistation-delivery/result.json`.

No llamadas al modelo, nuevas pantallas, cambios en OTP ni despliegue. La consulta conserva la última lectura por estación; no sustituye histórico/replay. Los 20 km limitan la búsqueda, no garantizan representatividad meteorológica.
