import { createHmac, timingSafeEqual } from "node:crypto";
import { DashboardAccessError } from "./access";
export function encodeCursor(value: unknown) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", process.env.MOBILITY_JWT_SECRET ?? "")
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}
export function decodeCursor(value: string): Record<string, unknown> {
  try {
    if (value.length > 4096) throw new Error();
    const parts = value.split(".");
    if (parts.length !== 2) throw new Error();
    const [body, sig] = parts;
    if (!body || !sig) throw new Error();
    const expected = createHmac("sha256", process.env.MOBILITY_JWT_SECRET ?? "")
      .update(body)
      .digest();
    const actual = Buffer.from(sig, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const data: unknown = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new DashboardAccessError(400, "invalid_cursor");
  }
}
