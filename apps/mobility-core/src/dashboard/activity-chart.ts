import { dashboardActivityChart } from "@mobility/contracts";
import { database } from "../database";

export function bucketStep(from: string, to: string) {
  const length = Date.parse(to) - Date.parse(from);
  const step = [300000, 3600000, 21600000].find(
    (s) => Math.ceil(length / s) <= 28,
  );
  if (!step || length <= 0) throw new Error("Invalid activity range");
  return step;
}
export async function readActivityChart(
  from: string,
  to: string,
  filters: {
    source?: string | undefined;
    type?: string | undefined;
    severity?: string | undefined;
    outcome?: string | undefined;
  } = {},
) {
  const step = bucketStep(from, to);
  return database().begin(
    "isolation level repeatable read read only",
    async (sql) => {
      await sql`SET LOCAL statement_timeout='3s'`;
      const rows =
        await sql`WITH retained AS (SELECT * FROM operational_event WHERE expires_at>now()), selected AS (
      SELECT * FROM retained WHERE occurred_at>=${from}::timestamptz AND occurred_at<${to}::timestamptz
      AND (${filters.outcome ?? null}::text IS NULL OR outcome=${filters.outcome ?? null})
      AND (${filters.source ?? null}::text IS NULL OR source_id=${filters.source ?? null}) AND (${filters.type ?? null}::text IS NULL OR event_type=${filters.type ?? null}) AND (${filters.severity ?? null}::text IS NULL OR severity=${filters.severity ?? null}))
      SELECT floor(extract(epoch FROM (occurred_at-${from}::timestamptz))*1000/${step})::int AS bucket,
      count(*) FILTER(WHERE event_type='publication' AND outcome='success')::int AS publications, count(*) FILTER(WHERE severity='error')::int AS errors, count(*)::int AS total FROM selected GROUP BY bucket ORDER BY bucket`;
      const [bounds] =
        await sql`SELECT min(occurred_at) AS first,max(occurred_at) AS last FROM operational_event WHERE expires_at>now()`;
      const first = bounds?.first ? new Date(bounds.first).toISOString() : null;
      const last = bounds?.last ? new Date(bounds.last).toISOString() : null;
      const bins = Array.from(
        { length: Math.ceil((Date.parse(to) - Date.parse(from)) / step) },
        (_, index) => {
          const start = Date.parse(from) + index * step,
            end = Math.min(start + step, Date.parse(to));
          const r = rows.find((r) => r.bucket === index);
          const known = first !== null && end > Date.parse(first);
          return {
            from: new Date(start).toISOString(),
            to: new Date(end).toISOString(),
            publications: known ? Number(r?.publications ?? 0) : null,
            errors: known ? Number(r?.errors ?? 0) : null,
          };
        },
      );
      return dashboardActivityChart.parse({
        from,
        to,
        firstRetainedEventAt: first,
        lastRetainedEventAt: last,
        bins,
        publications:
          first === null
            ? null
            : rows.reduce((n, r) => n + Number(r.publications), 0),
        errors:
          first === null
            ? null
            : rows.reduce((n, r) => n + Number(r.errors), 0),
        total:
          first === null ? null : rows.reduce((n, r) => n + Number(r.total), 0),
        coverage: "best_effort",
      });
    },
  );
}
