# Contributing to mobai

mobai is an evaluation foundation for conversational mobility. Source publication does not enable a public mobility service or authorize cloud deployments.

## Reports and proposals

Use [GitHub Issues](https://github.com/alanslzrr/digital-twin-conversational-mobility/issues) for reproducible bugs and scoped feature proposals. Reports and contributions are welcome in English or Spanish. Include the relevant commit, environment, expected behavior and a minimal reproduction. Never include credentials, personal travel histories or conversation transcripts.

For vulnerabilities, use the private reporting channel described in [SECURITY.md](SECURITY.md), not a public issue.

## Local setup and checks

Follow the [installation guide](docs/installation.md). Use Node 24 as pinned in `.nvmrc` and pnpm 10 as pinned in `package.json`. The offline quality checks do not require cloud credentials:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm audit --audit-level=moderate
```

`pnpm check` runs Biome and the dependency-boundary guard, strict TypeScript checks, Vitest tests and application builds. To run the test suite alone, use `pnpm test`. Infrastructure-backed tests are opt-in; see [evaluation](docs/evaluation.md) for setup and limitations. Do not purchase plans, enable cloud deployments, make provider/model calls or run routing benchmarks as part of routine checks.

## Pull requests

1. Discuss substantial changes in an issue before implementation.
2. Work on a topic branch and open a pull request against `main`.
3. Use small Conventional Commits and the repository PR template. State exactly what was validated and any tests that were skipped.
4. Add automated tests for major new functionality and regression tests for bug fixes. Document affected external contracts and behavior.
5. Run `pnpm check` and resolve failures before requesting review. Do not silence diagnostics merely to make CI pass.

Use the repository Biome configuration and strict TypeScript settings. Keep Mobility Core responsible for providers, ingestion, storage and routing. EVE must not import provider adapters, database clients or storage secrets. Preserve the official EVE Web Chat interface and record minimal upstream adaptations in its vendor README.

Never present stale, simulated or unavailable readings as live. Preserve source, quality and observation/ingestion times. Do not register unimplemented MCP tools or fabricate routes. Background processing must remain bounded and idempotent; no recurring real-time cron loops.

Contributions to the project's own code are under the [MIT license](LICENSE). Preserve third-party licenses and notices.
