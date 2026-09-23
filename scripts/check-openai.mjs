import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const { OPENAI_API_KEY: apiKey } = parseEnv(readFileSync(".env.local", "utf8"));
if (!apiKey?.trim())
  throw new Error("OPENAI_API_KEY is missing in root .env.local");
const headers = {
  Authorization: `Bearer ${apiKey.trim()}`,
  "Content-Type": "application/json",
};
const live = process.argv.includes("--live");
const response = await fetch(
  `https://api.openai.com/v1/${live ? "responses" : "models/gpt-6-luna"}`,
  {
    method: live ? "POST" : "GET",
    headers,
    ...(live
      ? {
          body: JSON.stringify({
            model: "gpt-6-luna",
            input: "Reply with exactly OK.",
            reasoning: { effort: "none" },
            max_output_tokens: 32,
            store: false,
          }),
        }
      : {}),
    signal: AbortSignal.timeout(60_000),
  },
);
// Never print provider error bodies: authentication errors can echo credentials.
if (!response.ok)
  throw new Error(
    `OpenAI check failed: HTTP ${response.status}; request ${response.headers.get("x-request-id") ?? "unknown"}`,
  );
const result = await response.json();
if (live) {
  assert.equal(result.status, "completed");
  const output = result.output
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("");
  assert.equal(output.trim(), "OK");
  console.log(
    JSON.stringify({
      check: "OpenAI Responses",
      model: result.model,
      status: result.status,
      usage: result.usage,
    }),
  );
} else {
  assert.equal(result.id, "gpt-6-luna");
  console.log(
    "OpenAI credential and gpt-6-luna access verified (no inference request).",
  );
}
