# Madrid Mobility Twin

Prototipo universitario local para conversar sobre movilidad de Madrid. Hasta cinco evaluadores, chat oficial EVE, OpenAI directo con `gpt-6-luna` y Mobility Core como único acceso del agente a datos de movilidad.

## Documentación

**[Abrir la wiki completa](docs/index.md)**

- [Entender el proyecto](docs/overview.md): utilidad, capacidades y ejemplos.
- [Cómo funciona](docs/architecture.md): arquitectura y diagramas de los flujos reales.
- [Usar el chat](docs/user-guide.md): acceso, consultas e historial.
- [Instalar desde cero](docs/installation.md) o [arrancar la instalación existente](docs/local-runtime.md).
- [Configurar cuentas y claves](docs/resources/accounts.md): enlaces oficiales y pasos manuales.
- [Referencia de las 16 herramientas MCP](docs/reference/mcp.md), [configuración](docs/reference/system.md) y [fuentes](docs/sources/README.md).
- [Evolución y evidencia](docs/evolution.md), [recursos e investigaciones](docs/resources/index.md) y [alcance vigente](docs/roadmap.md).

## Estado

**R0 y R1 cerrados para el alcance acordado.** Renfe, EMT, CRTM estático, DGT, BiciMAD, aire, tráfico, parking y meteorología están integrados. Routing con Renfe, EMT, Metro Ligero, interurbanos y caminatas; Core añade evidencia dinámica compatible. Historial propio de conversaciones R2.1 disponible.

Las obligaciones restantes de cierre R2 fueron retiradas por decisión del usuario, no marcadas como pruebas realizadas. Metro actual, rutas nuevas de bici/coche y otras exclusiones se delimitan en el [roadmap](docs/roadmap.md). Es una evaluación funcional, no un servicio operativo con cobertura exhaustiva.

## Arranque cotidiano

Si la instalación y los builds ya existen:

```sh
pnpm infra:up
pnpm otp:up
pnpm start:local
```

[EVE local](http://127.0.0.1:3000/evaluation) · [Health Core](http://127.0.0.1:3001/api/health)

Para una máquina nueva, sigue [la instalación completa](docs/installation.md). Requiere Node 24.21.0, pnpm 10.30.3, Python ≥3.11 y Docker con Compose. Las claves se guardan privadamente; no hay credenciales en esta documentación.

## Desarrollo y entrega

```sh
pnpm check          # lint, fronteras, tipos, pruebas offline y builds
pnpm build:agent    # compila EVE; requiere Docker, no hace inferencias
```

Aplicaciones separadas en `apps/eve-web` y `apps/mobility-core`; contratos, reglas y procedencia en `packages/`. [Mapa técnico](docs/reference/system.md#mapa-del-código).

Usa ramas `alanslzrr/<tema>`, Conventional Commits y `pnpm check` antes del push. [Convenciones](AGENTS.md) · [Seguridad](SECURITY.md) · [Mantenimiento de la wiki](docs/AGENTS.md).

Los recursos cloud preparados **no están desplegados**. Los dos proyectos mantienen despliegues automáticos desactivados; [Vercel es una alternativa documentada](docs/deployment.md), no una tarea obligatoria. No se modifica la UI oficial EVE ni se habilitan sus herramientas generales.
