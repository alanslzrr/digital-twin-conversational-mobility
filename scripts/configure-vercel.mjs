// Fail before reading credentials or contacting cloud services. Restore this
// workflow only with an audited deployment CLI and explicit cloud approval.
console.error(
  "Cloud configuration disabled: Vercel CLI was removed because its dependency tree contains unpatched GHSA-vfj7-8cjw-p6xm. See docs/deployment.md.",
);
process.exitCode = 1;
