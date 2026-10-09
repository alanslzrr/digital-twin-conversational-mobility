// Legacy slot/password administration is intentionally retired. Never issue other users' passwords.
console.error(
  "Five-slot administration has been replaced. Use pnpm accounts bootstrap <email> [name] for the first local administrator, then /admin for invitations, recovery and suspension. Existing principal IDs are preserved. See docs/accounts-and-llm.md.",
);
process.exitCode = 1;
