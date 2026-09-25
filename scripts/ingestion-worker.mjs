import { setTimeout } from "node:timers/promises";
import { SignJWT } from "jose";

if (process.env.VERCEL || !process.env.MOBILITY_JWT_SECRET)
  throw new Error(
    "Local worker requires the local signing key; never run it in Vercel",
  );
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
const once = process.argv.includes("--once");
async function run(lane) {
  let activate = process.argv.includes("--activate") && lane !== "1";
  do {
    try {
      const token = await new SignJWT({ scope: "mobility.ingestion.manage" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("local-ingestion-worker")
        .setIssuer("mobility-local")
        .setAudience("mobility-core")
        .setIssuedAt()
        .setExpirationTime("2m")
        .sign(new TextEncoder().encode(process.env.MOBILITY_JWT_SECRET));
      const requestActivation = activate;
      activate = false; // Never repeat activation after a lost/failed response.
      const response = await fetch("http://127.0.0.1:3001/internal/ingestion", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activate: requestActivation,
          ...(lane ? { lane } : {}),
        }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(110_000),
        ]),
      });
      if (!response.ok) throw new Error(`worker_http_${response.status}`);
      console.log(JSON.stringify(await response.json()));
    } catch {
      if (!controller.signal.aborted)
        console.error(
          "Local tick failed; Core may be starting or ingestion disabled.",
        );
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once")) break;
    await setTimeout(5_000, undefined, { signal: controller.signal }).catch(
      () => {},
    );
  } while (!controller.signal.aborted);
}
// Reuse the existing two lanes, but do not synchronize their next iterations.
// Each request claims at most one due job; missed intervals are never replayed.
await Promise.all(once ? [run()] : [run("0"), run("1")]);
