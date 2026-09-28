import type postgres from "postgres";
import type { DgtIncident } from "./adapters/dgt";
export async function publishDgt(
  sql: postgres.TransactionSql,
  incidents: DgtIncident[],
  observed: Date,
) {
  // Called under the ingestion lease, only for non-regressing full publications.
  const ids = incidents.map((i) => i.id);
  await sql`UPDATE dgt_incident SET withdrawn_at=${observed} WHERE withdrawn_at IS NULL AND NOT (id=ANY(${ids}::text[]))`;
  if (incidents.length)
    await sql`INSERT INTO dgt_incident(id,payload,last_seen_at)
    SELECT id,payload,${observed} FROM jsonb_to_recordset(${sql.json(incidents.map((i) => ({ id: i.id, payload: i })))}) AS r(id text,payload jsonb)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen_at=excluded.last_seen_at,withdrawn_at=NULL`;
  await sql`DELETE FROM dgt_incident WHERE withdrawn_at<now()-interval '24 hours'`;
}
