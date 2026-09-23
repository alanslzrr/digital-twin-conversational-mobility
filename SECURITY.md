# Security

Do not include credentials, tokens, raw conversation contents or personal travel histories in issues or pull requests. Report security problems privately to the repository owner.

## Current boundaries

- The repository is private. No open-source license has been selected.
- Local secrets are generated randomly with mode `0600`; all `.env*` files except examples are ignored.
- EVE has only its direct model API key and the Core service token, no mobility-provider/storage credentials, no default shell/web tools and only one allowlisted MCP tool.
- Better Auth email/password is proxied through Web to Core. No public signup, OAuth or email reset flow is exposed. Five pre-provisioned evaluator slots; emails are identifiers, not verified ownership claims.
- EVE channel guards enforce fresh database identity, exact origin/CSRF, session ownership, payload restrictions and atomic generation quotas (6/minute, 60/day per evaluator). No development bypass.
- Login rate limiting is database-backed: 10 attempts/minute shared across the small evaluation proxy. This can temporarily block all evaluators after abuse; it is deliberate, not a per-IP limit.
- Cookies are HttpOnly, SameSite=Strict and Secure on HTTPS. Cookie cache is disabled so revocation is checked in the database.
- MCP requires HS256 service JWTs with issuer, audience, subject, expiry and scope validation. The bootstrap token expires after seven days and grants diagnostics and evaluator-management scopes.
- This is service-token bootstrap authentication, **not a complete OAuth authorization server**. Introduce proper key rotation and asymmetric verification/managed authorization before expanding access.
- Arbitrary browser origins are rejected. No wildcard CORS is enabled.
- Public `/api/health` checks liveness, not database readiness or source freshness.
- Docker ports bind to loopback and require generated passwords.
- The static dependency guard is an early warning, not a network firewall.

Before publication, verify physical Workflow transcript deletion/retention, provider account spending limits, credential rotation and deployment protection. ACL expiry/reset revokes access, not physical transcript storage; see docs/evaluation.md. Keep production resources isolated from previews. Review source licensing before storing or redistributing payloads.

## Deployment tooling dependencies

`vercel@59.25.4` pins older dependencies with published advisories even though the application production dependency audit is clean. Exact-version overrides in `pnpm-workspace.yaml` replace those releases rather than hiding or dismissing the alerts. CI audits the complete lockfile, including development tooling.

Most overrides stay within the original major version. The exception is the CLI's Undici 5.x, which has no release covering all reported advisories: it is advanced to 6.28.1. The CLI and its Node builder use the preserved fetch/request/Headers interfaces; the project's EVE runtime remains on its own Undici 8 release. Verify CLI version/auth/project reads locally and run the application build and integration suite after changes. Other framework builders and a real cloud deployment are not validated by these checks. Remove overrides only once upstream dependencies and a full audit demonstrate that they are unnecessary.
