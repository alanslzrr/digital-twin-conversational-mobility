import type { RuntimeLlmAction } from "@mobility/contracts";

export function coreControlUrl(path: string) {
  const base = process.env.MOBILITY_MCP_URL;
  if (!base) throw new Error("service_unavailable");
  const url = new URL(path, base);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("service_unavailable");
  return url;
}
export async function runtimeControl(action: RuntimeLlmAction) {
  const token = process.env.MOBILITY_MCP_TOKEN;
  if (!token) throw new Error("service_unavailable");
  const response = await fetch(coreControlUrl("/internal/llm/runtime"), {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(action),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string" ? result.error : "service_unavailable",
    );
  return result;
}
