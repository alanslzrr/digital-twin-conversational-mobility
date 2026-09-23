# Security

Do not include credentials, tokens, raw conversation contents or personal travel histories in issues or pull requests. Report security problems privately to the repository owner.

## Current boundaries

- The repository is private. No open-source license has been selected.
- Local secrets are generated randomly with mode `0600`; all `.env*` files except examples are ignored.
- EVE has no provider/storage credentials, no default shell/web tools and only one allowlisted MCP tool.
- EVE accepts local-development traffic only. **Production and preview conversation routes remain closed** until evaluator authentication and session ownership authorization exist.
- MCP requires HS256 service JWTs with issuer, audience, subject, expiry and scope validation. The bootstrap token expires after seven days and grants diagnostics only.
- This is service-token bootstrap authentication, **not a complete OAuth authorization server**. Introduce proper key rotation and asymmetric verification/managed authorization before expanding access.
- Arbitrary browser origins are rejected. No wildcard CORS is enabled.
- Public `/api/health` checks liveness, not database readiness or source freshness.
- Docker ports bind to loopback and require generated passwords.
- The static dependency guard is an early warning, not a network firewall.

Before evaluation, add per-user access control and session ownership, rate limits, retention/deletion for conversations, budget controls, credential rotation and deployment-protection checks. Keep production resources isolated from previews. Review source licensing before storing or redistributing payloads.
