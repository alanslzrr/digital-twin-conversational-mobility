import { describe, expect, it } from "vitest";
import { safeProjection } from "./safe-data";

describe("public allowlist projection", () => {
  it("preserves public routing activation time without exposing its manifest", () => {
    const activatedAt = "2026-10-03T10:00:00.000Z";
    expect(
      safeProjection({
        routes: [
          {
            id: "release-1",
            state: "active",
            activatedAt,
            createdAt: activatedAt,
            manifest: { secret: "not-public" },
          },
        ],
      }).data,
    ).toEqual({
      routes: [
        {
          id: "release-1",
          state: "active",
          activatedAt,
          createdAt: activatedAt,
        },
      ],
    });
    expect(safeProjection({ activatedAt: null }).data).toEqual({
      activatedAt: null,
    });
  });
  it("preserves public measurement semantics while removing credentials", () => {
    const p = safeProjection({
      vehiclesPerHour: 120,
      occupancyPercent: 15,
      periodMinutes: 60,
      basis: "interval",
      authorization: "Bearer synthetic-secret",
      measurements: [
        {
          name: "precipitation",
          value: 2,
          unit: "mm",
          periodMinutes: 60,
          password: "synthetic-password",
        },
      ],
    });
    expect(p.data).toMatchObject({
      vehiclesPerHour: 120,
      occupancyPercent: 15,
      periodMinutes: 60,
      basis: "interval",
    });
    expect(JSON.stringify(p.data)).not.toContain("synthetic-secret");
    expect(JSON.stringify(p.data)).not.toContain("synthetic-password");
  });
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
