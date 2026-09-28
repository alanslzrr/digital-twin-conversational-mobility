import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
}));
vi.mock("./database", () => ({ database: () => fixture.sql }));

import { listConversations } from "./conversations";

const schema = `r21_test_${randomUUID().replaceAll("-", "")}`;
const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
describe.skipIf(process.env.RUN_CONVERSATION_DB_TESTS !== "1")(
  "conversation index in isolated PostgreSQL",
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
        max: 1,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      fixture.sql = sql;
      await sql`CREATE TABLE auth_user(id uuid PRIMARY KEY)`;
      await sql.unsafe(
        await readFile(
          new URL(
            "../../../infra/postgres/migrations/0003_evaluation_access.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (const [i, id] of ids.entries()) {
        await sql`INSERT INTO auth_user VALUES(${id})`;
        await sql`INSERT INTO evaluator(id,slot,label,auth_user_id) VALUES(${id},${i + 1},'fixture',${id})`;
      }
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id,created_at) SELECT 'own-'||lpad(n::text,3,'0'),${ids[0]},now()-interval '1 minute' FROM generate_series(1,45) n`;
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('foreign',${ids[1]})`;
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id,expires_at,revoked_at) VALUES('expired',${ids[0]},now()-interval '1 second',NULL),('revoked',${ids[0]},now()+interval '1 day',now())`;
      await sql`UPDATE evaluator SET enabled=false WHERE id=${ids[3]}`;
    });
    afterAll(async () => {
      if (sql) await sql.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("paginates identical dates without duplicates or side effects", async () => {
      const before =
        await sql`SELECT * FROM evaluation_session ORDER BY session_id`;
      const seen: string[] = [];
      let cursor: { createdAt: string; sessionId: string } | undefined;
      do {
        const result = await listConversations({
          action: "list_sessions",
          principalId: ids[0],
          ...(cursor ? { cursor } : {}),
        });
        expect(result.status).toBe(200);
        if (!("sessions" in result.body)) throw new Error("missing page");
        expect(result.body.sessions.length).toBeLessThanOrEqual(20);
        seen.push(...result.body.sessions.map((s) => s.sessionId));
        cursor = result.body.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toEqual(
        Array.from(
          { length: 45 },
          (_, i) => `own-${String(45 - i).padStart(3, "0")}`,
        ),
      );
      expect(
        await sql`SELECT * FROM evaluation_session ORDER BY session_id`,
      ).toEqual(before);
      expect(await sql`SELECT * FROM evaluation_usage`).toHaveLength(0);
    });
    it("separates owners and valid empty lists from disabled evaluators", async () => {
      const other = await listConversations({
        action: "list_sessions",
        principalId: ids[1],
      });
      expect(other.body).toMatchObject({
        sessions: [{ sessionId: "foreign" }],
      });
      expect(
        (
          await listConversations({
            action: "list_sessions",
            principalId: ids[2],
          })
        ).body,
      ).toEqual({ sessions: [], nextCursor: null });
      expect(
        (
          await listConversations({
            action: "list_sessions",
            principalId: ids[3],
          })
        ).status,
      ).toBe(401);
      await sql`UPDATE evaluator SET expires_at=now()-interval '1 second' WHERE id=${ids[2]}`;
      expect(
        (
          await listConversations({
            action: "list_sessions",
            principalId: ids[2],
          })
        ).status,
      ).toBe(401);
    });
  },
);
