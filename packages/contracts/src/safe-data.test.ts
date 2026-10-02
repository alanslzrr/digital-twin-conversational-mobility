import { describe, expect, it } from "vitest";
import { safeProjection } from "./safe-data";

describe("public allowlist projection", () => {
  it("drops unknown fields, secrets and object storage references recursively", () => {
    const p = safeProjection({
      name: "station",
      authorization: "Bearer canary",
      rawReference: "private/key",
      arbitraryMetadata: { name: "secret" },
      result: { name: "valid", password: "canary", value: 1 },
    });
    expect(p.data).toEqual({
      name: "station",
      result: { name: "valid", value: 1 },
    });
    expect(p.redacted).toBe(true);
  });
  it("cannot bypass projection through JSON-encoded tool content", () => {
    const p = safeProjection({
      content: [
        {
          text: JSON.stringify({
            name: "safe",
            secret: "canary",
            rawReference: "private/key",
          }),
        },
      ],
    });
    expect(JSON.stringify(p.data)).not.toContain("canary");
    expect(JSON.stringify(p.data)).not.toContain("private/key");
  });
  it("redacts credential URLs and common opaque credentials", () => {
    expect(
      JSON.stringify(
        safeProjection({
          text: "Bearer abc123 https://user:pass@example.com/a?key=foo sk-proj-abcdefghijk",
        }).data,
      ),
    ).not.toContain("abc123");
  });
  it("retains valid bounded JSON and marks truncation", () => {
    const p = safeProjection(
      Array.from({ length: 100 }, () => ({ name: "x".repeat(100) })),
      300,
    );
    expect(p.retainedBytes).toBeLessThanOrEqual(300);
    expect(p.truncated).toBe(true);
    expect(() => JSON.parse(JSON.stringify(p.data))).not.toThrow();
  });
});
