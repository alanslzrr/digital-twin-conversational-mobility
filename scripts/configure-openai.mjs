import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Deliberately copy only the model credential, never the root database secrets.
const root = parseEnv(readFileSync(".env.local", "utf8"));
const key = root.OPENAI_API_KEY?.trim();
if (!key || /[\r\n"\\]/.test(key)) {
  throw new Error("Provide a valid OPENAI_API_KEY in root .env.local first");
}
const path = "apps/eve-web/.env.local";
const contents = readFileSync(path, "utf8")
  .split("\n")
  .filter(
    (line) =>
      !/^\s*(?:export\s+)?(?:OPENAI_API_KEY|AI_GATEWAY_API_KEY|EVE_MODEL)\s*=/.test(
        line,
      ),
  )
  .join("\n")
  .trimEnd();
const temporary = `${path}.${process.pid}.tmp`;
writeFileSync(temporary, `${contents}\nOPENAI_API_KEY="${key}"\n`, {
  mode: 0o600,
  flag: "wx",
});
renameSync(temporary, path);
chmodSync(".env.local", 0o600);
console.log(
  "Configured direct OpenAI in eve-web only; model gpt-6-luna. Secret values hidden.",
);
