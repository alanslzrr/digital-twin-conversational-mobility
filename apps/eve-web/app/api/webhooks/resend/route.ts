import { coreControlUrl } from "../../../../src/control-client";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  try {
    const token = process.env.MOBILITY_MCP_TOKEN;
    if (!token) return new Response(null, { status: 503 });
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) return new Response(null, { status: 413 });
      parts.push(part.value);
    }
    const response = await fetch(coreControlUrl("/internal/mail/webhook"), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      },
      body: Buffer.concat(parts),
    });
    await response.body?.cancel();
    return new Response(null, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 503 });
  } finally {
    await reader.cancel().catch(() => {});
  }
}
