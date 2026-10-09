// No implicit billing account or automatic billable validation.
console.error(
  "The fixed-provider check is retired. Run pnpm test:control:db for offline adapters. Real model validation requires explicit approval, Core external-consumption opt-in, a configured model and an explicit credential or sponsorship.",
);
process.exitCode = 1;
