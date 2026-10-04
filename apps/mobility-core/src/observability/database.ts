import { Pool, type PoolClient } from "pg";
import type postgres from "postgres";

let pool: Pool | undefined;
export function observabilityPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Observability database unavailable");
  pool ??= new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 100,
    idleTimeoutMillis: 20000,
    application_name: "mobility-observability",
  });
  return pool;
}
/** Dedicated bounded pool: no waits behind chat locks and no detached transaction.
 * PG17 terminates a transaction after 150ms; the client watchdog destroys a stuck
 * connection. Checkout itself is bounded to 100ms by pg. */
export async function boundedTransaction<T>(
  action: (client: PoolClient) => Promise<T>,
) {
  const started = performance.now();
  const client = await observabilityPool().connect();
  let killed = false;
  const timer = setTimeout(
    () => {
      killed = true;
      client.release(true);
    },
    Math.max(1, 150 - (performance.now() - started)),
  );
  try {
    await client.query("BEGIN");
    await client.query(
      "SET LOCAL transaction_timeout='150ms'; SET LOCAL statement_timeout='100ms'; SET LOCAL lock_timeout='25ms'",
    );
    const result = await action(client);
    if (killed) throw new Error("Observability deadline");
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!killed) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    if (!killed) client.release();
  }
}
export type CoreSql = ReturnType<typeof postgres>;
