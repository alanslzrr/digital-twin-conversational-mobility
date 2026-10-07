# OpenSSF Best Practices — preparación del nivel Passing

[Índice de auditorías](index.md) · [Contribución](../../CONTRIBUTING.md) · [Seguridad](../../SECURITY.md)

Fecha: 7 de octubre de 2026. Base revisada: `895828e`. Esta revisión prepara evidencias para la autoevaluación; no concede el badge ni sustituye las declaraciones del mantenedor. No se añade un badge hasta disponer de una ficha oficial con estado verificable.

## Evidencia disponible

| Área | Evidencia del proyecto | Evaluación |
| --- | --- | --- |
| Descripción y uso | README, guía de uso e instalación | Documentado |
| Licencia y fuente pública | MIT en la raíz; GitHub confirmó visibilidad pública | Disponible |
| Historial y revisión | Git, commits y pull requests públicos; `main` exige Quality gates | Disponible |
| Contratos externos | `docs/reference/mcp.md`, contratos compartidos y documentación del sistema | Documentado |
| Contribuciones | Nueva guía CONTRIBUTING en inglés, proceso por PR, convenciones y política de pruebas | Hueco documental corregido |
| Reportes ordinarios | GitHub Issues y nueva plantilla de reproducción sin datos privados | Disponible |
| Reportes de seguridad | GitHub private vulnerability reporting habilitado y canal enlazado desde SECURITY | Hueco de canal corregido |
| Construcción y pruebas | `pnpm check`: Biome, guard de dependencias, TypeScript estricto, Vitest y builds | Automatizado; CI existente |
| Pruebas de cambios recientes | Dashboard `e805ca1`, idiomas `eba66c5` y regresiones de render `194dfd9` incluyen pruebas | Evidencia en historial; no equivale a cobertura medida |
| Análisis estático | Biome recomendado, guard de dependencias y TypeScript estricto | En cada PR y push a main |
| Dependencias | `pnpm audit --audit-level=moderate`, ejecutado en esta revisión | Sin vulnerabilidades conocidas en el lockfile resuelto |
| Criptografía | `jose` para HS256, clave mínima de 32 bytes; Better Auth 1.7.5 delega contraseñas en scrypt; setup usa `node:crypto.randomBytes` | Evidencia de implementación; TLS y PFS requieren evaluar el entorno de servicio |

La auditoría de dependencias no prueba ausencia de fallos propios ni ausencia de secretos históricos. El reporte privado tampoco demuestra tiempos de respuesta pasados.

## Pendientes antes de declarar Passing

- **Cuenta y ficha:** iniciar sesión en bestpractices.dev con la cuenta del propietario, comprobar que no existe una ficha duplicada y registrar el proyecto.
- **Conocimiento de seguridad:** el mantenedor debe confirmar personalmente su conocimiento de diseño seguro y vulnerabilidades comunes; no se deduce de las herramientas instaladas.
- **Historial de respuesta:** comprobar reportes recibidos, fechas y primeras respuestas. Los issues actuales son recientes y no justifican declarar cumplimiento de una ventana histórica más larga. No inventar informes ni tiempos.
- **Versiones y entregas:** no hay tags ni GitHub Releases. `package.json` contiene `0.1.0`, pero por sí solo no demuestra una política de entregas. Definir el alcance de una primera entrega reutilizable y sus notas antes de marcar criterios de publicación; no crear una release solo para obtener el badge.
- **Cobertura y análisis dinámico:** hay pruebas y comprobaciones de UI documentadas, pero no se verificó un porcentaje de cobertura ni una campaña de fuzzing. Declarar solo lo demostrado; no confundir pruebas ordinarias con un escáner de seguridad.
- **Secretos e informes internos:** inspeccionar el historial público y confirmar que no existen credenciales válidas ni hallazgos medios/altos pendientes de remediación. El estado de pnpm audit no cubre esos ámbitos.
- **Transporte:** la distribución del código usa HTTPS; el servicio de evaluación se mantiene local. No presentar el despliegue TLS/PFS como validado ni habilitar cloud para completar el cuestionario.

Las sugerencias no satisfechas deben explicarse, no rellenarse con afirmaciones ficticias. Los criterios obligatorios requieren evidencia o una excepción N/A realmente aplicable.

## Registro de comprobaciones

- GitHub API: repositorio público, Issues habilitado, canal privado de vulnerabilidades confirmado activo.
- Git: sin tags; GitHub CLI: sin Releases.
- `pnpm audit --audit-level=moderate`: sin vulnerabilidades conocidas.
- La documentación y los cambios locales previos fuera de esta preparación se conservan, sin incorporarlos a sus commits.

## Referencias oficiales

- [Programa y autoevaluación gratuita](https://www.bestpractices.dev/en)
- [Criterios Passing](https://www.bestpractices.dev/en/criteria/0)

## Continuación de la evaluación · 07/10/2026

La [ficha oficial 15273](https://www.bestpractices.dev/en/projects/15273/passing) se registró con cuenta independiente, sin autorizar OAuth de GitHub ni acceso a organizaciones. El propietario autorizó publicar los datos de la ficha bajo CDLA-Permissive-2.0; el código conserva MIT. Los pendientes anteriores describen el estado de la primera revisión, no el resultado de esta continuación.

- El mantenedor declaró conocimiento de mínimo privilegio, validación, defensa en profundidad y mitigaciones de inyección, XSS, CSRF y autenticación/autorización. Sus reportes privados recibidos corresponden a otros proyectos; no se usan para inventar tiempos de respuesta de mobai.
- La ficha pasó de 72 % a 96 % al registrar esas declaraciones y las comprobaciones disponibles. Continúan pendientes versión y release hasta publicar su evidencia.
- Gitleaks 8.30.1 se descargó del repositorio oficial y su SHA-256 se contrastó con el checksum de la release. Escaneó 345 commits alcanzables de todas las referencias. Un único hallazgo en texto del spec del dashboard era la ruta de queries, no una credencial; se excluyó por fingerprint exacto. La segunda pasada no encontró secretos.
- El escaneo no verifica credenciales contra proveedores ni hace OCR de binarios/capturas. Solo se documentan resultados sin valores de candidatos.
- `pnpm audit --audit-level=moderate` no encontró vulnerabilidades conocidas; la API de advisories del repositorio devolvió una lista vacía. No equivale a una auditoría exhaustiva de seguridad.
- Core rechaza secretos JWT y Better Auth de menos de 32 bytes; el bootstrap genera 32 bytes aleatorios. Scrypt de Better Auth utiliza sal de 16 bytes, N=16384, r=16, p=1 y salida de 64 bytes. No se cambia la criptografía para obtener el badge.
- La [gobernanza de releases](../releasing.md) exige issue, decisión de versionado, notas formales y CI del commit final. La primera entrega se prepara con alcance de evaluación local, no como habilitación de cloud.

