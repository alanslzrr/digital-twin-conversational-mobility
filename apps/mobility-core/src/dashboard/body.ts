import { DashboardAccessError } from "./access";

// Enforce bytes during streaming; Content-Length is not authoritative.
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (!request.body) throw new DashboardAccessError(400, "invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new DashboardAccessError(413, "request_too_large");
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      );
    } catch {
      throw new DashboardAccessError(400, "invalid_request");
    }
  } finally {
    reader.releaseLock();
  }
}
