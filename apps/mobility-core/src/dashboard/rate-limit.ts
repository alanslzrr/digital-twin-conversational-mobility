import { database } from "../database";

export type DashboardRateClass = "read" | "execute" | "activity";
const policies = {
  read: [{ kind: "minute", limit: 120 }],
  activity: [{ kind: "minute", limit: 2 }],
  execute: [
    { kind: "minute", limit: 6 },
    { kind: "day", limit: 60 },
  ],
} as const;

// Conditional atomic UPSERTs enforce limits across tabs/processes. Throwing from
// the transaction rolls back a minute increment when the daily budget is full.
class RateDenied extends Error {
  constructor(public readonly retryAfter: number) {
    super("dashboard_rate_limited");
  }
}
export async function takeDashboardRate(
  evaluatorId: string,
  rateClass: DashboardRateClass,
) {
  const sql = database();
  try {
    await sql.begin(async (tx) => {
      // PostgreSQL transaction time fixes the same windows for all statements.
      for (const policy of policies[rateClass]) {
        const rows = await tx`
          INSERT INTO dashboard_rate_window(evaluator_id,rate_class,window_kind,window_start,requests,expires_at)
          SELECT ${evaluatorId},${rateClass},${policy.kind},date_trunc(${policy.kind},now()),1,
            date_trunc(${policy.kind},now()) + CASE WHEN ${policy.kind}='minute' THEN interval '1 minute' ELSE interval '1 day' END
          WHERE EXISTS (SELECT 1 FROM evaluator WHERE id=${evaluatorId} AND enabled AND expires_at > now())
          ON CONFLICT (evaluator_id,rate_class,window_kind,window_start)
          DO UPDATE SET requests=dashboard_rate_window.requests+1
          WHERE dashboard_rate_window.requests < ${policy.limit}
          RETURNING requests`;
        if (!rows.length) {
          const [window] = await tx`
            SELECT greatest(1,ceil(extract(epoch FROM
              (date_trunc(${policy.kind},now()) + CASE WHEN ${policy.kind}='minute' THEN interval '1 minute' ELSE interval '1 day' END)-now())))::integer AS seconds`;
          throw new RateDenied(Number(window?.seconds ?? 60));
        }
      }
    });
    return { allowed: true as const };
  } catch (error) {
    if (error instanceof RateDenied)
      return { allowed: false as const, retryAfter: error.retryAfter };
    throw error;
  }
}
