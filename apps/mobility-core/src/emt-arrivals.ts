import { createHash, randomUUID } from "node:crypto";
import { retryDelay } from "@mobility/domain";
import { getFreshness } from "@mobility/provenance";
import { sourceErrorCode } from "./adapters/common";
import {
  fetchEmtArrivals,
  type parseEmtArrivals,
} from "./adapters/emt-transit";
import { database } from "./database";
import { ingestionEnabled } from "./ingestion";

const iso = (value: Date | string) => new Date(value).toISOString();
type Arrival = ReturnType<typeof parseEmtArrivals>["arrivals"][number];

export function presentEmtArrivals(
  arrivals: Arrival[],
  observedAt: string,
  fresh: boolean,
  now = Date.now(),
) {
  return arrivals
    .filter(
      (a) =>
        !fresh ||
        !a.estimatedArrivalAt ||
        Date.parse(a.estimatedArrivalAt) >= now,
    )
    .map((a) => ({
      ...a,
      // Retain the original estimate as evidence; never call an old countdown live.
      remainingSeconds:
        fresh && a.estimatedArrivalAt && Date.parse(a.estimatedArrivalAt) >= now
          ? Math.ceil((Date.parse(a.estimatedArrivalAt) - now) / 1000)
          : null,
      basis: fresh ? "provider_estimate" : "stale_provider_estimate",
      observedAt,
    }))
    .sort(
      (a, b) =>
        (a.estimateSecondsAtObservation ?? Infinity) -
        (b.estimateSecondsAtObservation ?? Infinity),
    );
}

async function refresh(stopId: string) {
  if (!ingestionEnabled()) return;
  const sql = database();
  const token = randomUUID();
  const claim = await sql.begin(async (tx) => {
    const [gate] =
      await tx`SELECT failures FROM emt_arrival_gate WHERE next_due_at<=now()
      AND (lease_until IS NULL OR lease_until<now())
      AND EXISTS(SELECT 1 FROM ingestion_activity WHERE active_until>now())
      AND EXISTS(SELECT 1 FROM source_catalog WHERE id='emt' AND enabled)
      FOR UPDATE SKIP LOCKED`;
    if (!gate) return null;
    const [stop] =
      await tx`UPDATE emt_arrival_cache SET lease_token=${token},lease_until=now()+interval '90 seconds'
      WHERE stop_id=${stopId} AND next_due_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING failures`;
    if (!stop) return null;
    await tx`UPDATE emt_arrival_gate SET lease_token=${token},lease_until=now()+interval '90 seconds'`;
    return { failures: Math.max(Number(stop.failures), Number(gate.failures)) };
  });
  if (!claim) return;
  try {
    const result = await fetchEmtArrivals(stopId);
    const hash = `sha256:${createHash("sha256").update(result.raw).digest("hex")}`;
    await sql.begin(async (tx) => {
      const [owner] =
        await tx`SELECT singleton FROM emt_arrival_gate WHERE lease_token=${token} AND lease_until>now() FOR UPDATE`;
      if (!owner) return;
      const [saved] =
        await tx`UPDATE emt_arrival_cache SET payload=${tx.json(result.arrivals)},observed_at=${result.observedAt},ingested_at=now(),raw_reference=${hash},
        next_due_at=now()+interval '30 seconds',lease_token=NULL,lease_until=NULL,failures=0,error_code=NULL
        WHERE stop_id=${stopId} AND lease_token=${token} AND lease_until>now()
        AND (observed_at IS NULL OR observed_at<=${result.observedAt}) RETURNING stop_id`;
      if (!saved) throw Error("out_of_order_feed");
      await tx`UPDATE emt_arrival_gate SET next_due_at=now()+interval '5 seconds',lease_token=NULL,lease_until=NULL,failures=0,error_code=NULL WHERE lease_token=${token}`;
    });
  } catch (error) {
    const reason = sourceErrorCode(error);
    const failures = Math.min(claim.failures + 1, 20);
    const delay = retryDelay(30, failures);
    await sql.begin(async (tx) => {
      const [owner] =
        await tx`SELECT singleton FROM emt_arrival_gate WHERE lease_token=${token} AND lease_until>now() FOR UPDATE`;
      if (!owner) return;
      await tx`UPDATE emt_arrival_cache SET next_due_at=now()+${delay}*interval '1 second',lease_token=NULL,lease_until=NULL,failures=${failures},error_code=${reason}
        WHERE stop_id=${stopId} AND lease_token=${token} AND lease_until>now()`;
      await tx`UPDATE emt_arrival_gate SET next_due_at=now()+${delay}*interval '1 second',lease_token=NULL,lease_until=NULL,failures=${failures},error_code=${reason} WHERE lease_token=${token}`;
    });
  }
}

export async function emtArrivals(placeId: string, limit: number) {
  const sql = database();
  const [stop] =
    await sql`SELECT p.id,p.name,i.external_id,c.version,c.fetched_at,c.manifest FROM canonical_place p
    JOIN place_external_identifier i ON i.place_id=p.id AND i.source_id='emt' AND i.namespace='api.stop'
    JOIN emt_catalog c ON i.source_version=c.version WHERE p.id=${placeId}`;
  if (!stop)
    return {
      status: "unavailable",
      reason: "current_emt_stop_required",
      arrivals: [],
    };
  await refresh(stop.external_id);
  const [row] =
    await sql`SELECT * FROM emt_arrival_cache WHERE stop_id=${stop.external_id}`;
  const [gate] =
    await sql`SELECT next_due_at,lease_until,error_code FROM emt_arrival_gate`;
  const memberships =
    await sql`SELECT r.external_id AS "lineId",r.short_name AS label,s.direction,r.long_name AS headers
    FROM emt_stop_line s JOIN transit_route r ON r.source_id='emt' AND r.external_id=s.line_id WHERE s.stop_id=${stop.external_id} ORDER BY r.short_name,s.direction`;
  const provenance = row?.observed_at
    ? {
        source: "emt" as const,
        observedAt: iso(row.observed_at),
        ingestedAt: iso(row.ingested_at),
        quality: "provisional" as const,
        rawReference: row.raw_reference as string,
      }
    : null;
  const freshness = getFreshness(provenance, 30);
  const retained =
    freshness.ageSeconds !== null && freshness.ageSeconds <= 86400;
  return {
    status: retained ? "available" : "unavailable",
    reason: retained ? null : "no_recent_cached_prediction_or_refresh_deferred",
    stop: { placeId: stop.id, stopId: stop.external_id, name: stop.name },
    catalog: {
      version: stop.version,
      referenceDate: stop.manifest.referenceDate ?? null,
      currentDay:
        stop.manifest.referenceDate ===
        new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(
          new Date(),
        ),
      fetchedAt: iso(stop.fetched_at),
      ageSeconds: Math.max(
        0,
        Math.floor((Date.now() - new Date(stop.fetched_at).getTime()) / 1000),
      ),
      memberships,
    },
    attribution: "Powered by EMT de Madrid",
    sourceUrl: "https://www.emtmadrid.es/",
    provenance,
    freshness,
    provenanceScope: "provider_operation_time_not_vehicle_measurement",
    refresh: {
      enabled: ingestionEnabled(),
      error: row?.error_code ?? gate?.error_code ?? null,
      inProgress: Boolean(
        gate?.lease_until && new Date(gate.lease_until).getTime() > Date.now(),
      ),
      nextAllowedAt:
        row && gate
          ? iso(
              new Date(
                Math.max(
                  new Date(row.next_due_at).getTime(),
                  new Date(gate.next_due_at).getTime(),
                ),
              ),
            )
          : null,
    },
    arrivals:
      retained && provenance
        ? presentEmtArrivals(
            row?.payload ?? [],
            provenance.observedAt,
            freshness.status === "fresh",
          ).slice(0, limit)
        : [],
    warning:
      "EMT estimates for this stop only, not departures, timetables or OTP coverage. Empty predictions do not establish no service. Old estimates are not live. Direction codes are preserved from the catalog, not inferred from the stop name. Cache retains only the latest observation, not historical replay; rawReference is a checksum, not an archived raw file.",
  };
}
