import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { authorize } from "./auth";

// Test-only key, never used by setup or any runtime configuration.
const config = {
  secret: "test-only-not-a-deployment-key-32-bytes",
  issuer: "test",
  audience: "mobility-core",
};
async function token(
  scope = "mobility.diagnostics.read",
  audience = config.audience,
  expiration = "5m",
) {
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("eve-web")
    .setIssuer(config.issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(new TextEncoder().encode(config.secret));
}
function request(bearer?: string, origin?: string) {
  return new Request("http://localhost/mcp", {
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(origin ? { origin } : {}),
    },
  });
}
async function status(result: ReturnType<typeof authorize>) {
  const value = await result;
  return value instanceof Response ? value.status : 200;
}

describe("MCP service authentication", () => {
  it("fails closed without a configured key", async () => {
    expect(
      await status(
        authorize(
          request(),
          { ...config, secret: "" },
          "mobility.diagnostics.read",
        ),
      ),
    ).toBe(503);
  });
  it("rejects anonymous and malformed tokens", async () => {
    for (const bearer of [undefined, "not-a-jwt"]) {
      expect(
        await status(
          authorize(request(bearer), config, "mobility.diagnostics.read"),
        ),
      ).toBe(401);
    }
  });
  it("accepts a valid scoped service token", async () => {
    expect(
      await authorize(
        request(await token()),
        config,
        "mobility.diagnostics.read",
      ),
    ).toEqual({ subject: "eve-web", scopes: ["mobility.diagnostics.read"] });
  });
  it("requires the exact scope", async () => {
    expect(
      await status(
        authorize(
          request(await token("mobility.read")),
          config,
          "mobility.diagnostics.read",
        ),
      ),
    ).toBe(403);
  });
  it("rejects tokens for another audience and expired tokens", async () => {
    for (const bearer of [
      await token(undefined, "different-service"),
      await token(undefined, undefined, "-1m"),
    ]) {
      expect(
        await status(
          authorize(request(bearer), config, "mobility.diagnostics.read"),
        ),
      ).toBe(401);
    }
  });
  it("rejects arbitrary browser origins even with a valid token", async () => {
    expect(
      await status(
        authorize(
          request(await token(), "https://untrusted.example"),
          config,
          "mobility.diagnostics.read",
        ),
      ),
    ).toBe(403);
  });
});
