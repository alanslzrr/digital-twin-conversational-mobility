// Disposable test processes only. Reject all provider/model acquisitions in QA.
import { appendFileSync } from "node:fs";

if (
  process.env.INGESTION_ENABLED !== "false" ||
  process.env.OPENAI_API_KEY ||
  !process.env.DASHBOARD_QA_NETWORK_GUARD_REPORT
)
  throw new Error("Isolated QA network guard requires disabled acquisition");
const fetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    // The EVE dev server listens on an ephemeral loopback port.
    (!["3002", "3003"].includes(url.port) &&
      process.env.DASHBOARD_QA_DEV !== "1")
  ) {
    appendFileSync(
      process.env.DASHBOARD_QA_NETWORK_GUARD_REPORT,
      "blocked_external_request\n",
      { mode: 0o600 },
    );
    throw new Error("External acquisition disabled in isolated QA");
  }
  return fetch(input, init);
};
