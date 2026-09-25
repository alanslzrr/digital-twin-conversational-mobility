import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type BudgetAction, evaluateBudget } from "./conversation-budget";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
}));
vi.mock("./database", () => ({
  database: () => {
    if (!fixture.sql) throw new Error("Test database not initialized");
    return fixture.sql;
  },
}));
const enabled = process.env.RUN_BUDGET_DB_TESTS === "1";
const schema = `e2_test_${randomUUID().replaceAll("-", "")}`;
const principalId = randomUUID();
const principals = [
  principalId,
  ...Array.from({ length: 4 }, () => randomUUID()),
];
let admin: ReturnType<typeof postgres>;
let sql: ReturnType<typeof postgres>;
function begin(sessionId = "session1", turnId = "turn1", stepIndex = 0) {
  return {
    action: "budget_begin",
    principalId:
      principals[(Number(sessionId.replace("session", "")) - 1) % 5] ??
      principalId,
    sessionId,
    turnId,
    stepIndex,
    purpose: "step",
    attemptId: randomUUID(),
  } as const;
}
function action(
  input: ReturnType<typeof begin>,
  action: "budget_dispatch" | "budget_finish",
  extra = {},
): BudgetAction {
  return {
    action,
    principalId: input.principalId,
    sessionId: input.sessionId,
    attemptId: input.attemptId,
    ...extra,
  } as BudgetAction;
}
describe.skipIf(!enabled)(
  "durable budget against isolated local PostgreSQL schema",
  () => {
    beforeAll(async () => {
      const url = process.env.DATABASE_URL;
      if (
        !url ||
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
      )
        throw new Error("Explicit local database required");
      admin = postgres(url, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      sql = postgres(url, {
        max: 10,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      fixture.sql = sql;
      await sql`CREATE TABLE auth_user(id uuid PRIMARY KEY)`;
      for (const name of [
        "0003_evaluation_access.sql",
        "0008_conversation_budget.sql",
      ])
        await sql.unsafe(
          await readFile(
            new URL(
              `../../../infra/postgres/migrations/${name}`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      for (const [i, id] of principals.entries()) {
        await sql`INSERT INTO auth_user(id) VALUES (${id})`;
        await sql`INSERT INTO evaluator(id,slot,label,auth_user_id) VALUES (${id},${i + 1},'synthetic fixture',${id})`;
      }
      for (const sessionId of [
        "session1",
        "session2",
        "session3",
        "session4",
        "session5",
        "session6",
      ])
        await sql`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES (${sessionId},${begin(sessionId).principalId})`;
    });
    beforeEach(async () => {
      await sql`DELETE FROM conversation_attempt`;
      await sql`DELETE FROM conversation_campaign`;
      await sql`UPDATE evaluation_session SET revoked_at=NULL`;
      await sql`INSERT INTO conversation_campaign(id,enabled,approval,expires_at,input_limit,output_limit,call_limit) VALUES ('offline-fixture',true,'SYNTHETIC ONLY; no provider traffic',now()+interval '1 hour',100000,10000,30)`;
    });
    afterAll(async () => {
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("fails closed without an approved active campaign and for another owner", async () => {
      expect(
        (await evaluateBudget({ ...begin(), principalId: randomUUID() }))
          .status,
      ).toBe(403);
      await sql`UPDATE conversation_campaign SET enabled=false`;
      expect((await evaluateBudget(begin())).status).toBe(429);
    });
    it("serializes 20 competing requests for one session to exactly one reservation", async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => evaluateBudget(begin())),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        (await sql`SELECT count(*)::int AS n FROM conversation_attempt`)[0]?.n,
      ).toBe(1);
    });
    it("reserves globally across sessions and never oversubscribes tokens", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          evaluateBudget(begin(`session${i + 1}`)),
        ),
      );
      expect(results.filter((r) => r.status === 200).length).toBe(5);
      const [totals] =
        await sql`SELECT sum(reserved_input)::int AS input,sum(reserved_output)::int AS output,count(*)::int AS active FROM conversation_attempt`;
      expect(totals?.input).toBeLessThanOrEqual(100000);
      expect(totals?.output).toBeLessThanOrEqual(10000);
      expect(totals?.active).toBeLessThanOrEqual(5);
    });
    it("dispatch grants cannot replay, while equal settlements are idempotent", async () => {
      const input = begin();
      expect((await evaluateBudget(input)).status).toBe(200);
      const dispatch = action(input, "budget_dispatch", { inputTokens: 100 });
      expect((await evaluateBudget(dispatch)).status).toBe(200);
      expect((await evaluateBudget(dispatch)).status).toBe(429);
      const settle = action(input, "budget_finish", {
        usage: { input: 100, output: 10, cached: 80 },
        notSent: false,
      });
      expect((await evaluateBudget(settle)).status).toBe(200);
      expect((await evaluateBudget(settle)).status).toBe(200);
      expect(
        (
          await evaluateBudget(
            action(input, "budget_finish", {
              usage: { input: 0, output: 0, cached: 0 },
              notSent: false,
            }),
          )
        ).status,
      ).toBe(409);
    });
    it("unknown usage and expired reservations retain their budget and concurrency slot", async () => {
      const input = begin();
      await evaluateBudget(input);
      await sql`UPDATE conversation_attempt SET deadline=now()-interval '1 hour'`;
      expect((await evaluateBudget(begin())).status).toBe(429);
      expect(
        (
          await evaluateBudget(
            action(input, "budget_dispatch", { inputTokens: 10 }),
          )
        ).status,
      ).toBe(429);
      await evaluateBudget(
        action(input, "budget_finish", { usage: null, notSent: false }),
      );
      expect((await evaluateBudget(begin())).status).toBe(429);
      expect(
        (await sql`SELECT state FROM conversation_attempt`)[0]?.state,
      ).toBe("unknown");
    });
    it("denies refund after dispatch and blocks campaign on impossible provider usage", async () => {
      const input = begin();
      await evaluateBudget(input);
      await evaluateBudget(
        action(input, "budget_dispatch", { inputTokens: 100 }),
      );
      expect(
        (
          await evaluateBudget(
            action(input, "budget_finish", { usage: null, notSent: true }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await evaluateBudget(
            action(input, "budget_finish", {
              usage: { input: 99999, output: 1, cached: null },
              notSent: false,
            }),
          )
        ).status,
      ).toBe(409);
      expect((await evaluateBudget(begin("session2"))).status).toBe(429);
      expect(
        (await sql`SELECT blocked FROM conversation_campaign`)[0]?.blocked,
      ).toBe(true);
    });
    it("enforces retry count, step count, turn and session deadlines", async () => {
      for (let i = 0; i < 2; i++) {
        const input = begin();
        await evaluateBudget(input);
        await evaluateBudget(
          action(input, "budget_finish", { usage: null, notSent: true }),
        );
      }
      expect((await evaluateBudget(begin())).status).toBe(429);
      expect((await evaluateBudget(begin("session1", "turn1", 1))).status).toBe(
        200,
      );
      await sql`UPDATE conversation_attempt SET state='not_sent',created_at=now()-interval '91 seconds'`;
      expect((await evaluateBudget(begin("session1", "turn1", 2))).status).toBe(
        429,
      );
      await sql`UPDATE conversation_attempt SET created_at=now()-interval '31 minutes'`;
      expect(
        (await evaluateBudget(begin("session1", "new-turn", 0))).status,
      ).toBe(429);
    });
    it("new session and approval-like new turns cannot bypass the global call cap", async () => {
      await sql`UPDATE conversation_campaign SET call_limit=1`;
      const input = begin();
      await evaluateBudget(input);
      await evaluateBudget(
        action(input, "budget_finish", { usage: null, notSent: true }),
      );
      expect(
        (await evaluateBudget(begin("session2", "continuation-approved")))
          .status,
      ).toBe(429);
    });
    it("preserves reservations after a new database client simulates worker restart", async () => {
      await evaluateBudget(begin());
      await sql.end();
      sql = postgres(process.env.DATABASE_URL as string, {
        max: 10,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      fixture.sql = sql;
      expect((await evaluateBudget(begin())).status).toBe(429);
      const [report] =
        await sql`SELECT * FROM conversation_budget_report WHERE evaluator_id IS NULL`;
      expect(report?.reported_input_tokens).toBeNull();
      expect(Number(report?.charged_input_tokens)).toBe(20000);
      expect(report?.unresolved_attempts).toBe(1);
    });
    it("enforces turn output budget without an approval replenishing it", async () => {
      for (let stepIndex = 0; stepIndex < 2; stepIndex++) {
        const input = begin("session1", "turn1", stepIndex);
        expect((await evaluateBudget(input)).status).toBe(200);
        await evaluateBudget(
          action(input, "budget_dispatch", { inputTokens: 100 }),
        );
        await evaluateBudget(
          action(input, "budget_finish", {
            usage: { input: 100, output: 2048, cached: 0 },
            notSent: false,
          }),
        );
      }
      expect((await evaluateBudget(begin("session1", "turn1", 2))).status).toBe(
        429,
      );
      const [report] =
        await sql`SELECT * FROM conversation_budget_report WHERE session_id='session1' AND turn_id='turn1'`;
      expect(Number(report?.reported_output_tokens)).toBe(4096);
      expect(report?.authorized_inference_requests).toBe(2);
      expect(report?.steps).toBe(2);
    });
    it("enforces session budget across separate campaigns instead of resetting it", async () => {
      for (let i = 0; i < 5; i++) {
        const input = begin("session1", `turn-${i}`, 0);
        expect((await evaluateBudget(input)).status).toBe(200);
        await evaluateBudget(
          action(input, "budget_dispatch", { inputTokens: 20000 }),
        );
        await evaluateBudget(
          action(input, "budget_finish", {
            usage: { input: 20000, output: 2000, cached: null },
            notSent: false,
          }),
        );
      }
      await sql`UPDATE conversation_campaign SET enabled=false`;
      await sql`INSERT INTO conversation_campaign(id,enabled,approval,expires_at,input_limit,output_limit,call_limit) VALUES ('second-offline',true,'SYNTHETIC ONLY',now()+interval '1 hour',100000,10000,30)`;
      expect((await evaluateBudget(begin("session1", "new-turn"))).status).toBe(
        429,
      );
    });
    it("rechecks revocation between admission and dispatch", async () => {
      const input = begin();
      await evaluateBudget(input);
      await sql`UPDATE evaluation_session SET revoked_at=now() WHERE session_id='session1'`;
      expect(
        (
          await evaluateBudget(
            action(input, "budget_dispatch", { inputTokens: 100 }),
          )
        ).status,
      ).toBe(403);
    });
  },
);
