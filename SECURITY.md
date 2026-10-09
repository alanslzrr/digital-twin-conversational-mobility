# Security

Do not include credentials, tokens, raw conversation contents or personal travel histories in issues or pull requests. Report security problems through [GitHub private vulnerability reporting](https://github.com/alanslzrr/digital-twin-conversational-mobility/security/advisories/new). Sign in to GitHub and submit a sanitized description, affected commit and reproduction steps. The report is shared privately with repository maintainers; do not open a public issue.

## Current boundaries

- The project's own code is licensed under [MIT](LICENSE). Bundled third-party code retains its licenses and notices. Publishing the source does not enable a public service; cloud deployments remain disabled.
- Local secrets are generated randomly with mode `0600`; all `.env*` files except examples are ignored.
- EVE has only the Core service token, no external model/mobility-provider/storage credentials and no default shell/web tools. Its one MCP connection allows the [16 implemented mobility tools](docs/reference/mcp.md). Dashboard, authentication, model execution, control and telemetry requests use fixed-origin Core services.
- Better Auth email/password is proxied through Web to Core. No public signup, OAuth, impersonation or generic admin endpoints are exposed. Capacity starts at 30 active accounts/unexpired invitations. Activation and single-use recovery go directly to the registered email through an encrypted Resend outbox, disabled until explicitly configured.
- EVE channel guards enforce fresh database identity, exact origin/CSRF, session ownership, payload restrictions and atomic generation quotas (6/minute, 60/day per evaluator). No development bypass.
- Login rate limiting is database-backed: 10 attempts/minute per account plus a global proxy bucket; untrusted browser IP headers do not bypass it.
- Authentication cookies are HttpOnly, SameSite=Strict and Secure on HTTPS. Cookie cache is disabled so revocation is checked in the database. The separate, non-sensitive interface-language cookie is client-readable and SameSite=Lax; see [UI language](docs/ui-i18n.md).
- MCP requires HS256 service JWTs with issuer, audience, subject, expiry and scope validation. The bootstrap token expires after seven days and grants mobility read, diagnostics, evaluator management, dashboard read/execute/activity and telemetry write scopes. Browser code never receives this token.
- This is service-token bootstrap authentication, **not a complete OAuth authorization server**. Introduce proper key rotation and asymmetric verification/managed authorization before expanding access.
- Arbitrary browser origins are rejected. No wildcard CORS is enabled.
- Public `/api/health` checks liveness, not database readiness or source freshness.
- Docker ports bind to loopback and require generated passwords.
- The static dependency guard is an early warning, not a network firewall.
- The dashboard map loads anonymous raster tiles only from `https://tile.openstreetmap.org`, without cookies or private query data. The tile host receives the browser IP and visible-area requests; see [map behavior](docs/user-guide.md#panel-privado).

Before opening the service to users, verify Workflow transcript retention, provider account spending limits, credential rotation and deployment protection. ACL expiry/reset revokes access, not physical transcript storage; see [retention](docs/evaluation.md). Core also stores owner-scoped, sanitized conversation telemetry for up to seven days. Keep production resources isolated from previews. Review source licensing before storing or redistributing payloads.

## Account and model controls

Admin/evaluator are separate from financing. Administrators require session-verified TOTP and five-minute password/TOTP step-up for sensitive actions; they cannot read others' conversations or reveal provider keys. The last active administrator cannot be disabled/demoted through the application. See [operations and limitations](docs/accounts-and-llm.md).

Core encrypts secrets with AES-256-GCM under a private external master-key file. Full server/key control is outside this application's secrecy boundary. Endpoint profiles are immutable, HTTPS-only, DNS-validated and socket-pinned; redirects and private/metadata addresses are rejected. Credentials are bound to endpoint and credential version. Deleting a local key does not revoke it upstream.

Every model attempt requires an immutable per-turn selection and transactional budget reservation. Missing final usage retains a pending reservation; replay does not redispatch an uncertain attempt. No implicit global model key or payer fallback remains. Spending admission is not a guarantee about upstream invoices. Preview gates deny external mail/model traffic. Real email/DNS, key migration, live inference and cloud activation remain explicit later operations.

## Dependency checks

CI runs `pnpm audit --audit-level=moderate` against the complete lockfile, including development tooling, followed by `pnpm check`. Scoped overrides in [pnpm-workspace.yaml](pnpm-workspace.yaml) select patched releases rather than suppressing advisories. Remove an override only after checking the resolved tree and rerunning the audit and affected tests.

CI also runs Gitleaks 8.30.1 over reachable Git history with redacted output. The scanner binary and SHA-256 are pinned. The single reviewed documentation-path false positive is excluded by exact fingerprint in `.gitleaksignore`; new exclusions require review. Scanning does not prove absence of every credential format or inspect screenshots through OCR.

The Vercel CLI was removed because its dependency tree included an unpatched advisory. `configure:vercel` fails before reading credentials, changing files or contacting cloud services; see [cloud preparation](docs/deployment.md). Its older scoped overrides remain as guards against reintroduction, not as evidence that the CLI is installed.

The current overrides also patch indexed source-map validation in `source-map-js` and inherited renderer settings in KaTeX. The KaTeX override crosses the range requested by the Markdown math dependencies, so validate formula rendering and default trust restrictions when changing it. [Advisories and versions](docs/resources/index.md#security-updates-2026-10-06).
