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

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
  session: vi.fn(),
}));
vi.mock("../database", () => ({ database: () => fixture.sql }));
vi.mock("../better-auth", () => ({
  getAuth: () => ({ api: { getSession: fixture.session } }),
}));

import { readDashboardIdentity, requireTraceOwnership } from "./access";
import { takeDashboardRate } from "./rate-limit";

const schema = `dashboard_test_${randomUUID().replaceAll("-", "")}`;
const ids = [randomUUID(), randomUUID()] as const;
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
describe.skipIf(process.env.RUN_DASHBOARD_DB_TESTS !== "1")(
  "dashboard foundation in isolated local PostgreSQL",
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
        max: 4,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      fixture.sql = sql;
      await sql`CREATE TABLE auth_user(id uuid PRIMARY KEY)`;
      for (const name of [
        "0003_evaluation_access.sql",
        "0021_dashboard_observability.sql",
      ]) {
        await sql.unsafe(
          await readFile(
            new URL(
              `../../../../infra/postgres/migrations/${name}`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      }
      for (const [i, id] of ids.entries()) {
        await sql`INSERT INTO auth_user VALUES(${id})`;
        await sql`INSERT INTO evaluator(id,slot,label,auth_user_id) VALUES(${id},${i + 1},'synthetic dashboard fixture',${id})`;
      }
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('own',${ids[0]}),('foreign',${ids[1]})`;
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id,expires_at,revoked_at) VALUES('expired',${ids[0]},now()-interval '1 second',NULL),('revoked',${ids[0]},now()+interval '1 day',now())`;
      await sql`INSERT INTO conversation_observability(session_id,capture_started_at,first_observed_at,last_observed_at,expires_at)
      SELECT session_id,now(),now(),now(),now()+interval '7 days' FROM evaluation_session WHERE session_id IN ('own','foreign')`;
    });
    afterAll(async () => {
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    beforeEach(async () => {
      await sql`UPDATE evaluator SET enabled=true,expires_at=now()+interval '30 days'`;
      await sql`TRUNCATE dashboard_rate_window`;
      fixture.session.mockReset().mockResolvedValue({ user: { id: ids[0] } });
    });
    it("uses Better Auth identity and denies disabled/expired evaluators", async () => {
      const headers = new Headers({ cookie: "synthetic-cookie" });
      await expect(readDashboardIdentity(headers)).resolves.toEqual({
        evaluatorId: ids[0],
      });
      expect(fixture.session).toHaveBeenCalledWith({ headers });
      fixture.session.mockResolvedValueOnce(null);
      await expect(readDashboardIdentity(headers)).rejects.toMatchObject({
        status: 401,
      });
      await sql`UPDATE evaluator SET enabled=false WHERE id=${ids[0]}`;
      await expect(readDashboardIdentity(headers)).rejects.toMatchObject({
        status: 401,
      });
      await sql`UPDATE evaluator SET enabled=true,expires_at=now()-interval '1 second' WHERE id=${ids[0]}`;
      await expect(readDashboardIdentity(headers)).rejects.toMatchObject({
        status: 401,
      });
    });
    it("uses non-enumerable ownership checks and never creates a session", async () => {
      await expect(
        requireTraceOwnership(ids[0], "own"),
      ).resolves.toBeUndefined();
      for (const session of ["foreign", "expired", "revoked", "unknown"]) {
        await expect(
          requireTraceOwnership(ids[0], session),
        ).rejects.toMatchObject({ status: 404, code: "not_found" });
      }
      expect(
        await sql`SELECT 1 FROM evaluation_session WHERE session_id='unknown'`,
      ).toHaveLength(0);
      expect(await sql`SELECT 1 FROM evaluation_usage`).toHaveLength(0);
    });
    it("enforces atomic read/activity budgets across concurrent requests and separates users", async () => {
      await sql`INSERT INTO dashboard_rate_window VALUES(${ids[0]},'read','minute',date_trunc('minute',now()),119,date_trunc('minute',now())+interval '1 minute')`;
      const reads = await Promise.all(
        Array.from({ length: 8 }, () => takeDashboardRate(ids[0], "read")),
      );
      expect(reads.filter((r) => r.allowed)).toHaveLength(1);
      for (const denied of reads.filter((r) => !r.allowed)) {
        if (!denied.allowed) expect(denied.retryAfter).toBeGreaterThan(0);
      }
      await expect(takeDashboardRate(ids[1], "read")).resolves.toEqual({
        allowed: true,
      });
      const heartbeats = await Promise.all(
        Array.from({ length: 8 }, () => takeDashboardRate(ids[0], "activity")),
      );
      expect(heartbeats.filter((r) => r.allowed)).toHaveLength(2);
      expect(await sql`SELECT 1 FROM evaluation_usage`).toHaveLength(0);
    });
    it("rolls back a minute increment when the manual daily budget is exhausted", async () => {
      await sql`INSERT INTO dashboard_rate_window VALUES(${ids[0]},'execute','day',date_trunc('day',now()),60,date_trunc('day',now())+interval '1 day')`;
      expect((await takeDashboardRate(ids[0], "execute")).allowed).toBe(false);
      expect(
        await sql`SELECT 1 FROM dashboard_rate_window WHERE window_kind='minute'`,
      ).toHaveLength(0);
    });
    it("enforces quotas in the database without locking chat quota rows", async () => {
      await sql`INSERT INTO observability_quota(evaluator_id,retained_bytes) VALUES(${ids[0]},268435455)`;
      await expect(
        sql`UPDATE observability_quota SET reserved_bytes=2 WHERE evaluator_id=${ids[0]}`,
      ).rejects.toMatchObject({ code: "23514" });
      const [row] =
        await sql`SELECT retained_bytes,reserved_bytes FROM observability_quota WHERE evaluator_id=${ids[0]}`;
      expect(Number(row?.retained_bytes)).toBe(268435455);
      expect(Number(row?.reserved_bytes)).toBe(0);
      await expect(
        sql`UPDATE conversation_observability SET retained_bytes=16777217 WHERE session_id='own'`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        sql`UPDATE conversation_observability SET event_count=10001 WHERE session_id='own'`,
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("blocks cross-session payload references and enforces session-local deduplication", async () => {
      const first = randomUUID(),
        second = randomUUID();
      for (const [session, id] of [
        ["own", first],
        ["foreign", second],
      ]) {
        await sql`INSERT INTO conversation_trace_payload(id,session_id,content_hash,kind,schema_version,content,original_bytes,retained_bytes,redacted,truncated,capture_status,captured_at,expires_at)
        VALUES(${id ?? ""},${session ?? ""},${"a".repeat(64)},'model_input',1,'{}',2,2,false,false,'captured',now(),now()+interval '7 days')`;
      }
      await expect(sql`INSERT INTO conversation_trace_event(session_id,event_key,content_hash,kind,occurred_at,sequence,status,payload_1,capture_status,expires_at)
      VALUES('own','bad-link',${"b".repeat(64)},'attempt_completed',now(),1,'succeeded',${second},'captured',now()+interval '7 days')`).rejects.toMatchObject(
        { code: "23503" },
      );
      await sql`INSERT INTO conversation_trace_event(session_id,event_key,content_hash,kind,occurred_at,sequence,status,payload_1,capture_status,expires_at)
      VALUES('own','good-link',${"b".repeat(64)},'attempt_completed',now(),1,'succeeded',${first},'captured',now()+interval '7 days')`;
      expect(await sql`SELECT 1 FROM conversation_trace_event`).toHaveLength(1);
      await expect(
        sql`UPDATE conversation_trace_payload SET expires_at=captured_at+interval '8 days' WHERE id=${first}`,
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("keeps a single running reservation per owner, separate from other evaluators", async () => {
      const insert = (
        owner: string,
      ) => sql`INSERT INTO dashboard_tool_execution(id,evaluator_id,request_id,request_hash,tool,input,state,deadline_at,lease_until)
      VALUES(${randomUUID()},${owner},${randomUUID()},${"c".repeat(64)},'get_network_status','{}','running',now()+interval '60 seconds',now()+interval '70 seconds')`;
      await insert(ids[0]);
      await expect(insert(ids[0])).rejects.toMatchObject({ code: "23505" });
      await insert(ids[1]);
      expect(await sql`SELECT 1 FROM dashboard_tool_execution`).toHaveLength(2);
    });
  },
);
