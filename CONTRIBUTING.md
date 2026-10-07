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

1. Associate every PR with a real issue in this repository. Discuss substantial changes before implementation; use a sanitized tracking issue for private security work. Dependabot PRs also need an issue reference added by a maintainer.
2. Work on a topic branch and open a pull request against `main`.
3. Use small Conventional Commits and the repository PR template. State exactly what was validated and any tests that were skipped.
4. Add automated tests for major new functionality and regression tests for bug fixes. Document affected external contracts and behavior.
5. Complete every required PR section, link the issue with `Closes #N` or `Refs #N`, and check exactly one release decision with a rationale. A required release also needs a stable SemVer target version.
6. Run `pnpm check` and resolve failures before requesting review. Do not silence diagnostics merely to make CI pass. The required **PR policy** and **Quality gates** checks must pass; editing the PR body reruns the metadata check.
7. Follow the [release procedure](docs/releasing.md). A PR requiring a release must provide release-note and upgrade/security impact information before merge; merging does not automatically deploy or publish a package.

Use the repository Biome configuration and strict TypeScript settings. Keep Mobility Core responsible for providers, ingestion, storage and routing. EVE must not import provider adapters, database clients or storage secrets. Preserve the official EVE Web Chat interface and record minimal upstream adaptations in its vendor README.

Never present stale, simulated or unavailable readings as live. Preserve source, quality and observation/ingestion times. Do not register unimplemented MCP tools or fabricate routes. Background processing must remain bounded and idempotent; no recurring real-time cron loops.

Contributions to the project's own code are under the [MIT license](LICENSE). Preserve third-party licenses and notices.

## Releases

Every PR must explicitly decide whether a release is needed. Docs-only and internal tooling changes may select **No release required** with a reason. User-visible changes, behavioral fixes, contract or schema changes and security fixes normally require a release. A planned version may group several reviewed PRs; a release decision does not require publishing on each merge. Use the [formal notes template](docs/releases/template.md), link issues/PRs, and record executed checks and skipped validation. Only a maintainer creates immutable version tags and GitHub Releases from validated `main`; cloud deployment and npm publication are separate approvals.
