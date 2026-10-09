import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelProfileInput, type TurnBinding } from "@mobility/contracts";
import { SignJWT } from "jose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST as authRoute } from "../../app/api/auth/[...all]/route";
import { getAuth } from "../better-auth";
import { database } from "../database";
import { accountAction } from "./accounts";
import { catalogAction } from "./catalog";
import {
  type ControlIdentity,
  controlIdentity,
  requireSession,
} from "./identity";
import { dispatchAttempt, reserveAttempt, settleAttempt } from "./ledger";
import { acceptMailEvent, drainAccountMail } from "./mail";
import { proxyInference } from "./proxy";
import { prepareSelection, runtimeSelection } from "./selection";
import { snapshot } from "./snapshot";

const enabled = process.env.RUN_CONTROL_DB_TESTS === "1";
const url = process.env.MOBAI_TEST_DATABASE_URL;
const password = "synthetic-test-password-only";
const origin = "http://127.0.0.1:3000";
let directory: string;
let admin: ControlIdentity,
  user: ControlIdentity,
  other: ControlIdentity,
  headers: Headers;
let modelId: string,
  providerId: string,
  credentialId: string,
  grantId: string,
  poolId: string;
let fakeSecret: string;
function cookies(h: Headers) {
  return h
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
async function actor(label: string, role: "admin" | "evaluator" = "evaluator") {
  const result = await getAuth().api.createUser({
    body: { name: label, email: `${label}@example.test`, password },
  });
  const sql = database();
  const [e] =
    await sql`INSERT INTO evaluator(label,auth_user_id) VALUES(${label},${result.user.id}) RETURNING id`;
  const login = await getAuth().api.signInEmail({
    body: { email: `${label}@example.test`, password },
    returnHeaders: true,
  });
  const h = new Headers({ cookie: cookies(login.headers), origin });
  const session = await getAuth().api.getSession({ headers: h });
  if (!session || !e) throw new Error("Fixture login failed");
  await sql`UPDATE auth_user SET role=${role},"twoFactorEnabled"=${role === "admin"} WHERE id=${result.user.id}`;
  if (role === "admin") {
    await sql`INSERT INTO control_mfa(session_id) VALUES(${session.session.id})`;
    await sql`INSERT INTO control_reauth(session_id,expires_at) VALUES(${session.session.id},now()+interval '5 minutes')`;
  }
  return {
    identity: {
      id: e.id,
      authId: result.user.id,
      sessionId: session.session.id,
      email: `${label}@example.test`,
      label,
      role,
      mfa: role === "admin",
      reauthenticated: role === "admin",
    } satisfies ControlIdentity,
    headers: h,
  };
}
async function binding(
  who = user,
  sessionId = "owned",
  grant = grantId,
): Promise<TurnBinding> {
  const selection = await prepareSelection(
    {
      action: "selection.prepare",
      selection: { modelId, grantId: grant, confirmProviderChange: false },
    },
    who.id,
  );
  return (await runtimeSelection({
    action: "turn.bind",
    principalId: who.id,
    selectionId: selection.selectionId,
    sessionId,
    turnId: randomUUID(),
  })) as TurnBinding;
}
function context(b: TurnBinding, stepIndex = 0) {
  return {
    principalId: b.principalId,
    sessionId: b.sessionId,
    turnId: b.turnId,
    bindingId: b.id,
    stepIndex,
    purpose: "step" as const,
  };
}
async function anotherGrant(userId: string) {
  const result = await catalogAction(
    {
      action: "grant.create",
      grant: {
        userId,
        poolId,
        modelIds: [modelId],
        budgetMicros: 100_000,
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        inputTokenLimit: 1_000_000,
        outputTokenLimit: 100_000,
        callLimit: 30,
        concurrencyLimit: 1,
      },
    },
    admin,
  );
  return (result as { id: string }).id;
}
describe.skipIf(!enabled)(
  "isolated PostgreSQL control-plane integration",
  () => {
    beforeAll(async () => {
      if (
        !url ||
        new URL(url).hostname !== "127.0.0.1" ||
        new URL(url).pathname !== "/mobai_control_test"
      )
        throw new Error(
          "Dedicated loopback mobai_control_test database required; never use a development database",
        );
      vi.stubEnv("DATABASE_URL", url);
      vi.stubEnv("EVALUATION_ORIGIN", origin);
      vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("base64"));
      vi.stubEnv("MOBAI_LLM_ENABLED", "true");
      vi.stubEnv("MOBAI_EMAIL_ENABLED", "false");
      vi.stubEnv("MOBILITY_BUDGET_MODE", "interactive");
      directory = await mkdtemp(join(tmpdir(), "mobai-control-test-"));
      const key = join(directory, "key");
      await writeFile(key, randomBytes(32).toString("base64"), { mode: 0o600 });
      vi.stubEnv("MOBAI_SECRET_KEY_FILE", key);
      const sql = database();
      await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
      const migrations = new URL(
        "../../../../infra/postgres/migrations/",
        import.meta.url,
      );
      for (const name of (await readdir(migrations))
        .filter((n) => n.endsWith(".sql"))
        .sort())
        await sql.unsafe(await readFile(new URL(name, migrations), "utf8"));
    }, 30000);
    beforeEach(async () => {
      const sql = database();
      await sql.unsafe(
        "TRUNCATE auth_user,llm_provider,secret_value,control_rate,control_audit,conversation_campaign CASCADE",
      );
      await sql`UPDATE control_settings SET capacity=30,global_concurrency=5,user_concurrency=1,requests_per_minute=6,requests_per_day=60,input_tokens_per_session=100000,output_tokens_per_session=10000,output_tokens_per_call=512`;
      const a = await actor("administrator", "admin");
      admin = a.identity;
      headers = a.headers;
      user = (await actor("evaluator")).identity;
      other = (await actor("another")).identity;
      providerId = randomUUID();
      modelId = randomUUID();
      fakeSecret = `synthetic-${randomUUID()}`;
      await sql`INSERT INTO llm_provider(id,profile,enabled) VALUES(${providerId},${sql.json({ name: "Fixture", baseUrl: "https://fixture.invalid/v1", protocols: ["responses", "chat-completions"], authentication: "bearer", modelList: true })},true)`;
      const profile = modelProfileInput.parse({
        providerId,
        modelId: "fixture",
        name: "Fixture",
        protocol: "responses",
        contextTokens: 8192,
        maxOutputTokens: 1024,
        tools: true,
        streaming: true,
        ready: true,
        inputMicrosPerMillion: 1_000_000,
        outputMicrosPerMillion: 2_000_000,
        pricesValidUntil: "2099-01-01T00:00:00Z",
      });
      await sql`INSERT INTO llm_model(id,provider_id,profile,version,enabled) VALUES(${modelId},${providerId},${sql.json(profile)},1,true)`;
      const key = await catalogAction(
        {
          action: "credential.create",
          providerId,
          alias: "Sponsor fixture",
          secret: fakeSecret,
        },
        admin,
      );
      credentialId = (key as { id: string }).id;
      const pool = await catalogAction(
        {
          action: "pool.create",
          credentialId,
          name: "Fixture pool",
          budgetMicros: 100_000,
          expiresAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
        },
        admin,
      );
      poolId = (pool as { id: string }).id;
      grantId = await anotherGrant(user.id);
    }, 15000);
    afterAll(async () => {
      if (enabled) {
        await database().end({ timeout: 1 });
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
      }
    });
    it("isolates ownership and never includes secrets or sponsor keys in user/admin projections", async () => {
      const b = await binding();
      await expect(
        requireSession(database(), other.id, b.sessionId),
      ).rejects.toThrow("access_denied");
      const own = await snapshot(user, false),
        adminView = await snapshot(admin, true);
      expect(own.credentials).toHaveLength(0);
      expect(adminView.credentials).toHaveLength(1);
      expect(own.users).toHaveLength(0);
      expect(JSON.stringify([own, adminView, b])).not.toContain(fakeSecret);
      await expect(snapshot(user, true)).rejects.toThrow("access_denied");
      await expect(
        catalogAction({ action: "credential.delete", id: credentialId }, other),
      ).rejects.toThrow("access_denied");
    });
    it("requires session MFA, step-up and an unrevoked admin session, and protects the last admin", async () => {
      await expect(
        accountAction(
          {
            action: "user.update",
            id: admin.id,
            role: "evaluator",
            enabled: true,
            expiresAt: new Date(Date.now() + 86400_000).toISOString(),
          },
          admin,
          headers,
        ),
      ).rejects.toThrow("last_admin");
      await database()`DELETE FROM control_mfa WHERE session_id=${admin.sessionId}`;
      await expect(
        snapshot(await controlIdentity(headers), true),
      ).rejects.toThrow("mfa_required");
      await expect(
        catalogAction(
          { action: "provider.toggle", id: providerId, enabled: false },
          admin,
        ),
      ).rejects.toThrow("mfa_required");
      await database()`DELETE FROM auth_session WHERE id=${admin.sessionId}`;
      await expect(
        catalogAction(
          { action: "provider.toggle", id: providerId, enabled: false },
          admin,
        ),
      ).rejects.toThrow("authentication_required");
    });
    it("admits only one concurrent invitation at capacity, does not return links, and encrypts queued payloads", async () => {
      await database()`UPDATE control_settings SET capacity=4`;
      const results = await Promise.allSettled(
        ["one", "two"].map((n) =>
          accountAction(
            { action: "user.invite", name: n, email: `${n}@example.test` },
            admin,
            headers,
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        JSON.stringify(results.filter((r) => r.status === "fulfilled")),
      ).not.toMatch(/token|password|https?:/);
      expect(
        (await database()`SELECT count(*)::integer AS count FROM evaluator`)[0]
          ?.count,
      ).toBe(4);
      const mail =
        await database()`SELECT ciphertext FROM secret_value s JOIN account_mail m ON m.secret_id=s.id`;
      expect(mail).toHaveLength(1);
      expect(mail[0]?.ciphertext).not.toContain("@example.test");
      expect(await drainAccountMail()).toBe(0);
    });
    it("enrolls real Better Auth TOTP, stamps this session only and rejects bad recovery codes", async () => {
      const login = await getAuth().api.signInEmail({
        body: { email: user.email, password },
        returnHeaders: true,
      });
      const userHeaders = new Headers({
        cookie: cookies(login.headers),
        origin,
      });
      const enrolled = await getAuth().api.enableTwoFactor({
        body: { password },
        headers: userHeaders,
      });
      if (enrolled.method !== "totp") throw new Error("TOTP fixture expected");
      const secret = new URL(enrolled.totpURI).searchParams.get("secret");
      if (!secret) throw new Error("Missing synthetic TOTP secret");
      let bits = "";
      for (const c of secret.toUpperCase().replace(/=+$/, ""))
        bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
          .indexOf(c)
          .toString(2)
          .padStart(5, "0");
      const key = Buffer.from(
        (bits.match(/.{8}/g) ?? []).map((b) => Number.parseInt(b, 2)),
      );
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
      const digest = createHmac("sha1", key).update(counter).digest(),
        offset = (digest.at(-1) ?? 0) & 15;
      const code = String(
        (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
      ).padStart(6, "0");
      const serviceSecret = randomBytes(32).toString("hex");
      vi.stubEnv("MOBILITY_JWT_SECRET", serviceSecret);
      vi.stubEnv("MOBILITY_JWT_ISSUER", "fixture");
      vi.stubEnv("MOBILITY_JWT_AUDIENCE", "fixture");
      const service = await new SignJWT({ scope: "mobility.evaluation.manage" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("fixture")
        .setIssuer("fixture")
        .setAudience("fixture")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode(serviceSecret));
      userHeaders.set("authorization", `Bearer ${service}`);
      userHeaders.set("content-type", "application/json");
      const response = await authRoute(
        new Request(`${origin}/api/auth/two-factor/verify-totp`, {
          method: "POST",
          headers: userHeaders,
          body: JSON.stringify({ code, trustDevice: false }),
        }),
        { params: Promise.resolve({ all: ["two-factor", "verify-totp"] }) },
      );
      expect(response.status).toBe(200);
      const merged = new Headers({
        cookie: cookies(response.headers) || (userHeaders.get("cookie") ?? ""),
        origin,
      });
      expect((await controlIdentity(merged)).mfa).toBe(true);
      await database()`UPDATE auth_user SET role='admin' WHERE id=${user.authId}`;
      const verified = await controlIdentity(merged);
      expect(verified.reauthenticated).toBe(false);
      await accountAction(
        { action: "reauth", password, code },
        verified,
        merged,
      );
      expect((await controlIdentity(merged)).reauthenticated).toBe(true);
      const next = await getAuth().api.signInEmail({
        body: { email: user.email, password },
        returnHeaders: true,
      });
      expect(next.response).toMatchObject({ twoFactorRedirect: true });
      const pending = new Headers({ cookie: cookies(next.headers), origin });
      await expect(
        getAuth().api.verifyBackupCode({
          body: { code: "invalid-fixture" },
          headers: pending,
        }),
      ).rejects.toThrow();
      expect(enrolled.backupCodes.length).toBeGreaterThan(0);
      const recovered = await getAuth().api.verifyBackupCode({
        body: { code: enrolled.backupCodes[0] ?? "" },
        headers: pending,
        returnHeaders: true,
      });
      expect(recovered.response).toBeTruthy();
    });
    it("cannot reactivate an account beyond capacity", async () => {
      await database()`UPDATE evaluator SET enabled=false WHERE id=${other.id}`;
      await database()`UPDATE control_settings SET capacity=2`;
      await expect(
        accountAction(
          {
            action: "user.update",
            id: other.id,
            role: "evaluator",
            enabled: true,
            expiresAt: new Date(Date.now() + 86400_000).toISOString(),
          },
          admin,
          headers,
        ),
      ).rejects.toThrow("capacity_reached");
    });
    it("uses single-use replacement reset links and revokes sessions on password recovery", async () => {
      await accountAction(
        { action: "user.recover", id: user.id },
        admin,
        headers,
      );
      const sent: string[] = [];
      await drainAccountMail(async (payload) => {
        sent.push(payload.url);
        return randomUUID();
      });
      await accountAction(
        { action: "user.recover", id: user.id },
        admin,
        headers,
      );
      await drainAccountMail(async (payload) => {
        sent.push(payload.url);
        return randomUUID();
      });
      const token = (url: string) =>
        new URLSearchParams(new URL(url).hash.slice(1)).get("token") ?? "";
      await expect(
        getAuth().api.resetPassword({
          body: {
            token: token(sent[0] ?? ""),
            newPassword: "replacement-password-only",
          },
        }),
      ).rejects.toThrow();
      await getAuth().api.resetPassword({
        body: {
          token: token(sent[1] ?? ""),
          newPassword: "replacement-password-only",
        },
      });
      expect(
        await database()`SELECT id FROM auth_session WHERE "userId"=${user.authId}`,
      ).toHaveLength(0);
      await expect(
        getAuth().api.resetPassword({
          body: {
            token: token(sent[1] ?? ""),
            newPassword: "another-password-only",
          },
        }),
      ).rejects.toThrow();
    });
    it("leases mail, bounds retries and expires payloads without sending stale links", async () => {
      await accountAction(
        { action: "user.recover", id: user.id },
        admin,
        headers,
      );
      const sender = vi.fn(async () => {
        throw new Error("simulated mail outage");
      });
      for (let i = 0; i < 4; i++) {
        await database()`UPDATE account_mail SET available_at=now()`;
        await drainAccountMail(sender);
      }
      expect(sender).toHaveBeenCalledTimes(3);
      expect(
        (await database()`SELECT state,attempts FROM account_mail`)[0],
      ).toMatchObject({ state: "failed", attempts: 3 });
      await database()`UPDATE account_mail SET expires_at=now()-interval '1 second'`;
      await drainAccountMail(sender);
      expect(
        (await database()`SELECT state,secret_id FROM account_mail`)[0],
      ).toMatchObject({ state: "expired", secret_id: null });
    });
    it("verifies and deduplicates delivery webhooks, including delivery arriving before send acknowledgment", async () => {
      const secret = randomBytes(32);
      vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${secret.toString("base64")}`);
      const providerId = randomUUID(),
        eventId = "msg_fixture_event",
        timestamp = String(Math.floor(Date.now() / 1000));
      const raw = JSON.stringify({
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data: { email_id: providerId },
      });
      const signature = createHmac("sha256", secret)
        .update(`${eventId}.${timestamp}.${raw}`)
        .digest("base64");
      const h = new Headers({
        "svix-id": eventId,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      });
      await expect(
        acceptMailEvent(raw, new Headers({ "svix-id": eventId })),
      ).rejects.toThrow("access_denied");
      await accountAction(
        { action: "user.recover", id: user.id },
        admin,
        headers,
      );
      await drainAccountMail(async () => {
        await acceptMailEvent(raw, h);
        await acceptMailEvent(raw, h);
        return providerId;
      });
      expect((await database()`SELECT state FROM account_mail`)[0]?.state).toBe(
        "delivered",
      );
      expect(await database()`SELECT id FROM account_mail_event`).toHaveLength(
        1,
      );
    });
    it("pins first-request ownership, prevents consent bypass and forbids changing an active selection", async () => {
      const b = await binding();
      await expect(
        prepareSelection(
          {
            action: "selection.prepare",
            selection: {
              modelId,
              grantId,
              sessionId: b.sessionId,
              confirmProviderChange: true,
            },
          },
          user.id,
        ),
      ).rejects.toThrow("turn_active");
      await expect(
        runtimeSelection({
          action: "turn.bind",
          principalId: other.id,
          selectionId: (
            await database()`SELECT selection_id FROM llm_turn WHERE id=${b.id}`
          )[0]?.selection_id,
          sessionId: b.sessionId,
          turnId: "forged",
        }),
      ).rejects.toThrow("access_denied");
      const unscoped = await prepareSelection(
        {
          action: "selection.prepare",
          selection: { modelId, grantId, confirmProviderChange: false },
        },
        user.id,
      );
      await expect(
        runtimeSelection({
          action: "selection.validate",
          principalId: user.id,
          sessionId: b.sessionId,
          selectionId: unscoped.selectionId,
        }),
      ).rejects.toThrow("turn_active");
      await runtimeSelection({
        action: "turn.finish",
        principalId: user.id,
        sessionId: b.sessionId,
        turnId: b.turnId,
        status: "completed",
      });
      // Legacy history has no binding and still requires an explicit recipient confirmation.
      await database()`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('legacy',${user.id})`;
      await expect(
        runtimeSelection({
          action: "selection.validate",
          principalId: user.id,
          sessionId: "legacy",
          selectionId: unscoped.selectionId,
        }),
      ).rejects.toThrow("provider_consent_required");
    });
    it("blocks duplicate and replayed dispatches and retains unknown cost until an auditable reconciliation", async () => {
      const b = await binding();
      const attempt = await reserveAttempt(context(b), "{}");
      await dispatchAttempt(attempt.id, b);
      await expect(reserveAttempt(context(b), "{}")).rejects.toThrow(
        "execution_uncertain",
      );
      await expect(dispatchAttempt(attempt.id, b)).rejects.toThrow(
        "operation_conflict",
      );
      await settleAttempt(attempt.id, b, null, null, "execution_uncertain", 10);
      const pending = await snapshot(user, false);
      expect(pending.totals.reservedMicros).toBeGreaterThan(0);
      expect(pending.totals.unknownAttempts).toBe(1);
      await accountAction(
        {
          action: "attempt.reconcile",
          id: attempt.id,
          costMicros: 50,
          note: "Verified synthetic provider receipt",
        },
        admin,
        headers,
      );
      expect((await snapshot(user, false)).totals.usedMicros).toBe(50);
      expect(
        (
          await database()`SELECT state,cost_micros FROM llm_attempt WHERE id=${attempt.id}`
        )[0],
      ).toMatchObject({ state: "unknown", cost_micros: null });
      await expect(
        accountAction(
          {
            action: "attempt.reconcile",
            id: attempt.id,
            costMicros: 0,
            note: "No destructive rewrite allowed",
          },
          admin,
          headers,
        ),
      ).rejects.toThrow("operation_conflict");
    });
    it("serializes shared pool reservations across users and rechecks lower budgets before dispatch", async () => {
      const another = await anotherGrant(other.id);
      const [a, b] = await Promise.all([
        binding(),
        binding(other, "second", another),
      ]);
      await database()`UPDATE llm_pool SET budget_micros=10000 WHERE id=${poolId}`;
      const results = await Promise.allSettled([
        reserveAttempt(context(a), "{}"),
        reserveAttempt(context(b), "{}"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const success = results.find((r) => r.status === "fulfilled");
      if (success?.status !== "fulfilled")
        throw new Error("Expected reservation");
      await database()`UPDATE llm_pool SET budget_micros=1 WHERE id=${poolId}`;
      await expect(
        dispatchAttempt(success.value.id, success.value.binding),
      ).rejects.toThrow("budget_exhausted");
    });
    it("blocks credential rotation/deletion or account/grant suspension without fallback", async () => {
      const b = await binding();
      await catalogAction(
        {
          action: "credential.replace",
          id: credentialId,
          secret: `synthetic-${randomUUID()}`,
        },
        admin,
      );
      await expect(reserveAttempt(context(b), "{}")).rejects.toThrow(
        "credential_disabled",
      );
      await catalogAction(
        { action: "credential.delete", id: credentialId },
        admin,
      );
      expect(await database()`SELECT id FROM secret_value`).toHaveLength(0);
    });
    it.each(["responses", "chat-completions"] as const)(
      "dispatches only once with fake %s JSON, records usage and never leaks the injected credential",
      async (protocol) => {
        await database()`UPDATE llm_model SET profile=jsonb_set(profile,'{protocol}',to_jsonb(${protocol}::text)) WHERE id=${modelId}`;
        const b = await binding();
        const network = vi.fn(
          async (_url: string, init: { headers: Record<string, string> }) => {
            expect(init.headers.Authorization).toBe(`Bearer ${fakeSecret}`);
            return Response.json(
              protocol === "responses"
                ? {
                    id: "fixture-response",
                    output: [],
                    usage: { input_tokens: 10, output_tokens: 5 },
                  }
                : {
                    id: "fixture-response",
                    choices: [],
                    usage: { prompt_tokens: 10, completion_tokens: 5 },
                  },
            );
          },
        );
        const request = new Request("http://localhost/internal/llm", {
          method: "POST",
          headers: {
            "x-mobai-principal": user.id,
            "x-mobai-session": b.sessionId,
            "x-mobai-turn": b.turnId,
            "x-mobai-binding": b.id,
            "x-mobai-step": "0",
            "x-mobai-purpose": "step",
          },
          body: JSON.stringify({
            model: "fixture",
            [protocol === "responses" ? "input" : "messages"]: [
              { role: "user", content: "Hello" },
            ],
          }),
        });
        const response = await proxyInference(
          request.clone(),
          protocol,
          network,
        );
        expect(await response.text()).not.toContain(fakeSecret);
        expect(network).toHaveBeenCalledTimes(1);
        await expect(
          proxyInference(request, protocol, network),
        ).rejects.toThrow("execution_uncertain");
        expect(network).toHaveBeenCalledTimes(1);
        expect((await snapshot(user, false)).totals).toMatchObject({
          inputTokens: 10,
          outputTokens: 5,
          usedMicros: 20,
          reservedMicros: 0,
        });
      },
    );
    it("enforces grant expiry, user suspension and per-user concurrency separately from capacity", async () => {
      const b = await binding();
      await expect(binding(user, "another-session")).rejects.toThrow(
        "turn_active",
      );
      await database()`UPDATE llm_grant SET expires_at=now()-interval '1 second' WHERE id=${grantId}`;
      await expect(reserveAttempt(context(b), "{}")).rejects.toThrow(
        "funding_expired",
      );
      await database()`UPDATE evaluator SET enabled=false WHERE id=${user.id}`;
      await expect(reserveAttempt(context(b), "{}")).rejects.toThrow(
        "authentication_required",
      );
    });
    it.each(["responses", "chat-completions"] as const)(
      "keeps interrupted %s streams and absent usage reserved",
      async (protocol) => {
        await database()`UPDATE llm_model SET profile=jsonb_set(profile,'{protocol}',to_jsonb(${protocol}::text)) WHERE id=${modelId}`;
        const b = await binding();
        const request = new Request("http://localhost/internal/llm", {
          method: "POST",
          headers: {
            "x-mobai-principal": user.id,
            "x-mobai-session": b.sessionId,
            "x-mobai-turn": b.turnId,
            "x-mobai-binding": b.id,
            "x-mobai-step": "0",
            "x-mobai-purpose": "step",
          },
          body: JSON.stringify({
            model: "fixture",
            stream: true,
            [protocol === "responses" ? "input" : "messages"]: [],
          }),
        });
        const response = await proxyInference(
          request,
          protocol,
          async () =>
            new Response('data: {"id":"fixture-partial"}\n\n', {
              headers: { "content-type": "text/event-stream" },
            }),
        );
        await response.text();
        const view = await snapshot(user, false);
        expect(view.totals.unknownAttempts).toBe(1);
        expect(view.totals.reservedMicros).toBeGreaterThan(0);
        expect(view.attempts[0]?.usage).toBeNull();
      },
    );
    it.each(["responses", "chat-completions"] as const)(
      "settles complete %s SSE and bounds each tool-loop attempt",
      async (protocol) => {
        await database()`UPDATE llm_model SET profile=jsonb_set(profile,'{protocol}',to_jsonb(${protocol}::text)) WHERE id=${modelId}`;
        const b = await binding();
        const event =
          protocol === "responses"
            ? {
                type: "response.completed",
                response: {
                  id: "sse-result",
                  usage: { input_tokens: 10, output_tokens: 5 },
                  output: [
                    {
                      type: "function_call",
                      call_id: "tool-1",
                      name: "mobility",
                      arguments: "{}",
                    },
                  ],
                },
              }
            : {
                id: "sse-result",
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          id: "tool-1",
                          type: "function",
                          function: { name: "mobility", arguments: "{}" },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 5 },
              };
        const network = vi.fn(
          async () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  // Real networks can split a frame at every byte boundary.
                  for (const byte of new TextEncoder().encode(
                    `data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`,
                  ))
                    controller.enqueue(Uint8Array.of(byte));
                  controller.close();
                },
              }),
              {
                headers: { "content-type": "text/event-stream" },
              },
            ),
        );
        const request = new Request("http://localhost/internal/llm", {
          method: "POST",
          headers: {
            "x-mobai-principal": user.id,
            "x-mobai-session": b.sessionId,
            "x-mobai-turn": b.turnId,
            "x-mobai-binding": b.id,
            "x-mobai-step": "0",
            "x-mobai-purpose": "step",
          },
          body: JSON.stringify({
            model: "fixture",
            stream: true,
            [protocol === "responses" ? "input" : "messages"]: [],
          }),
        });
        expect(
          await (await proxyInference(request, protocol, network)).text(),
        ).toContain("tool-1");
        const view = await snapshot(user, false);
        expect(view.attempts[0]).toMatchObject({
          state: "settled",
          costMicros: 20,
          usage: { inputTokens: 10, outputTokens: 5 },
        });
        expect(view.consumption[0]).toMatchObject({
          userId: user.id,
          modelId,
          providerId,
          calls: 1,
          usedMicros: 20,
        });
        expect(view.grants[0]?.availableMicros).toBe(99980);
        await database()`UPDATE llm_pool SET enabled=false WHERE id=${poolId}`;
        expect((await snapshot(user, false)).grants[0]?.status).toBe(
          "suspended",
        );
      },
    );
    it("rechecks reduced system limits at dispatch and freezes the policy version", async () => {
      const b = await binding();
      const attempt = await reserveAttempt(context(b), "{}");
      await database()`UPDATE control_settings SET version=version+1,output_tokens_per_call=128`;
      await expect(dispatchAttempt(attempt.id, b)).rejects.toThrow(
        "budget_exhausted",
      );
      expect(b.policy.outputTokensPerCall).toBe(512);
      expect(b.outputLimit).toBe(512);
      expect(
        (
          await database()`SELECT state FROM llm_attempt WHERE id=${attempt.id}`
        )[0]?.state,
      ).toBe("reserved");
    });
    it.each(["register-first", "bind-first"] as const)(
      "binds the first request safely when %s wins the EVE race",
      async (order) => {
        const selected = await prepareSelection(
          {
            action: "selection.prepare",
            selection: { modelId, grantId, confirmProviderChange: false },
          },
          user.id,
        );
        const registration = {
          action: "session.register" as const,
          principalId: user.id,
          sessionId: "first-race",
          selectionId: selected.selectionId,
        };
        const turn = {
          ...registration,
          action: "turn.bind" as const,
          turnId: randomUUID(),
        };
        if (order === "register-first") await runtimeSelection(registration);
        const b = (await runtimeSelection(turn)) as TurnBinding;
        await runtimeSelection(registration);
        expect(b.sessionId).toBe("first-race");
        expect(await runtimeSelection(turn)).toEqual(b);
        expect(
          await database()`SELECT session_id FROM evaluation_session WHERE evaluator_id=${user.id}`,
        ).toHaveLength(1);
      },
    );
    it("does not use first-session registration to adopt an existing legacy history without consent", async () => {
      await database()`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('legacy',${user.id})`;
      const selected = await prepareSelection(
        {
          action: "selection.prepare",
          selection: { modelId, grantId, confirmProviderChange: false },
        },
        user.id,
      );
      await expect(
        runtimeSelection({
          action: "session.register",
          principalId: user.id,
          sessionId: "legacy",
          selectionId: selected.selectionId,
        }),
      ).rejects.toThrow("provider_consent_required");
    });
    it("keeps campaigns opt-in and records one linked attempt rather than duplicate financial charges", async () => {
      vi.stubEnv("MOBILITY_BUDGET_MODE", "campaign");
      await database()`INSERT INTO conversation_campaign(id,enabled,approval,expires_at,input_limit,output_limit,call_limit) VALUES('fixture-campaign',true,'offline synthetic approval',now()+interval '1 hour',100000,10000,30)`;
      const b = await binding();
      const request = new Request("http://localhost/internal/llm", {
        method: "POST",
        headers: {
          "x-mobai-principal": user.id,
          "x-mobai-session": b.sessionId,
          "x-mobai-turn": b.turnId,
          "x-mobai-binding": b.id,
          "x-mobai-step": "0",
          "x-mobai-purpose": "step",
        },
        body: JSON.stringify({ model: "fixture", input: [] }),
      });
      const network = vi.fn(async () =>
        Response.json({
          id: "campaign-response",
          usage: { input_tokens: 2, output_tokens: 1 },
          output: [],
        }),
      );
      await (await proxyInference(request, "responses", network)).text();
      expect(network).toHaveBeenCalledTimes(1);
      expect(
        await database()`SELECT a.id FROM llm_attempt a JOIN conversation_attempt c ON c.id=a.id WHERE a.state='settled' AND c.state='settled' AND c.counted_input_tokens IS NULL AND c.input_upper_bound>0`,
      ).toHaveLength(1);
      expect((await snapshot(user, false)).totals.usedMicros).toBe(4);
      vi.stubEnv("MOBILITY_BUDGET_MODE", "interactive");
    });
  },
);
