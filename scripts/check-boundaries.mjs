import { readdir, readFile } from "node:fs/promises";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter(
        (entry) => !entry.name.startsWith(".") && entry.name !== "node_modules",
      )
      .map((entry) =>
        entry.isDirectory()
          ? files(`${directory}/${entry.name}`)
          : [`${directory}/${entry.name}`],
      ),
  );
  return results.flat();
}

const forbidden =
  /@mobility\/(?:adapter-[\w-]+|domain|routing|place-resolver)|@upstash\/redis|@vercel\/(?:blob|queue|sandbox)|\b(?:EMT_PASSKEY|EMT_CLIENT_ID|AEMET_API_KEY|DATABASE_URL|BLOB_READ_WRITE_TOKEN)\b/;
for (const file of await files("apps/eve-web")) {
  if (!/\.(?:tsx?|json)$/.test(file)) continue;
  if (forbidden.test(await readFile(file, "utf8")))
    throw new Error(`Domain boundary violation in ${file}`);
}
const agent = await readFile("apps/eve-web/agent/agent.ts", "utf8");
if (!/defaultTools:\s*false/.test(agent))
  throw new Error("EVE default tools must remain disabled");
console.log(
  "Agent/domain dependency and secret boundaries verified (static guard, not an egress firewall)",
);
