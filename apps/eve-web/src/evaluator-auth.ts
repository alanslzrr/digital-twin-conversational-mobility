export type EvaluatorIdentity = { principalId: string; label: string };

export function allowedBrowserRequest(request: Request) {
  const expected = process.env.EVALUATION_ORIGIN;
  if (!expected || request.headers.get("sec-fetch-site") === "cross-site")
    return false;
  const origin = request.headers.get("origin");
  return request.method === "GET"
    ? !origin || origin === expected
    : origin === expected;
}

const identities = new WeakMap<Request, Promise<EvaluatorIdentity | null>>();
export function readIdentity(
  request: Request,
): Promise<EvaluatorIdentity | null> {
  const existing = identities.get(request);
  if (existing) return existing;
  const lookup = (async () => {
    const cookie = request.headers.get("cookie");
    if (!cookie) return null;
    const result = await coreAccess({ action: "identify" }, cookie);
    if (!result.ok) return null;
    const identity = await result.json();
    return typeof identity.principalId === "string" &&
      typeof identity.label === "string"
      ? identity
      : null;
  })();
  identities.set(request, lookup);
  return lookup;
}

export async function coreAccess(
  input: Record<string, unknown>,
  cookie?: string,
) {
  const base = process.env.MOBILITY_MCP_URL;
  const token = process.env.MOBILITY_MCP_TOKEN;
  if (!base || !token) throw new Error("Mobility connection is not configured");
  const url = new URL("/internal/evaluation", base);
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("HTTPS required");
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  });
  return response;
}

export function accessError(status: number) {
  return Response.json(
    {
      error:
        status === 429
          ? "evaluation_limit_reached"
          : "evaluation_access_denied",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}

export async function readBoundedJson(
  request: Request,
  maximum = 8192,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body required");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maximum) throw new Error("Request too large");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
