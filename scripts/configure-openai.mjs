// Fail before reading or copying any legacy secret into Web.
console.error(
  "Global provider keys are retired. Register an authorized provider in /admin and a write-only credential in /account, or assign an explicit sponsorship. Never copy provider keys to eve-web. See docs/accounts-and-llm.md.",
);
process.exitCode = 1;
