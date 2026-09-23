# Repository conventions

- This is an evaluation foundation, not an operational mobility service yet.
- Node 24 (see `.nvmrc`), pnpm 10, TypeScript strict. Run `pnpm check` before pushing.
- `apps/eve-web` may call Mobility MCP only. Never import adapters, database clients, or provider secrets into it. Keep EVE default tools disabled.
- `apps/mobility-core` owns providers, ingestion, normalization, storage and routing.
- Shared contracts live in `packages/contracts`; domain decisions in `packages/domain`; freshness in `packages/provenance`.
- Never report simulated, unavailable or stale readings as live. Preserve observation time, ingestion time, source and quality.
- Do not register unimplemented MCP tools or return fabricated routes.
- Background processing must be idempotent, bounded by an activity window, and disabled in previews unless explicitly enabled. No recurring real-time Cron loops.
- No provider secrets in Git, browser bundles, logs, fixtures or model context. Builds/tests must work without cloud credentials.
- Production agent access remains closed until evaluator identity and session ownership checks exist.
- Prefer changes on `alanslzrr/<topic>` branches and small Conventional Commits. Do not add attribution trailers.
- Cloud provisioning, enabling deployments, model calls and OTP benchmarks are separate from local setup. Never purchase a plan without explicit approval.
