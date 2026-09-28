import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import {
  type JobId,
  jobPolicies,
  localIngestionEnabled,
  retryDelay,
} from "@mobility/domain";
import type postgres from "postgres";
import { fetchWeather } from "./adapters/aemet";
import { parseBicimad } from "./adapters/bicimad";
import { fetchText, sourceErrorCode, timestamp } from "./adapters/common";
import { dgtUrl, parseDgt } from "./adapters/dgt";
import { fetchEmtIncidents } from "./adapters/emt";
import { parseAir, parseTraffic } from "./adapters/madrid";
import { parseParking } from "./adapters/parking";
import { parseRenfe, spanishText } from "./adapters/renfe";
import { database } from "./database";
import { publishDgt } from "./dgt-publication";

const compress = promisify(gzip);
export const ingestionEnabled = () => localIngestionEnabled(process.env);
const rawRoot = () =>
  resolve(process.env.LOCAL_DATA_DIR ?? "../../data", "raw");

async function acquire(id: JobId) {
  const sql = database();
  const token = randomUUID();
  const [job] =
    await sql`UPDATE ingestion_job SET lease_until=now()+interval '90 seconds', lease_token=${token}, last_attempt_at=now(), last_finished_at=NULL, attempts=attempts+1, recovered_leases=recovered_leases+CASE WHEN lease_token IS NOT NULL THEN 1 ELSE 0 END
    WHERE id=${id} AND next_due_at<=now() AND (lease_until IS NULL OR lease_until<now())
    AND EXISTS (SELECT 1 FROM source_catalog s WHERE s.id=ingestion_job.source_id AND s.enabled)
    AND EXISTS (SELECT 1 FROM ingestion_activity WHERE active_until>now()) RETURNING failures`;
  return job ? { token, failures: Number(job.failures) } : null;
}

async function load(id: JobId) {
  const sql = database();
  if (id === "dgt-incidents") {
    const raw = await fetchText(dgtUrl, "application/xml");
    const { observedAt, ...payload } = parseDgt(raw);
    return { raw, observedAt, interval: 60, payload };
  }
  if (id === "emt-alerts") {
    const { raw, observedAt, alerts } = await fetchEmtIncidents();
    return { raw, observedAt, interval: 120, payload: { alerts } };
  }
  if (id === "aemet") {
    const { raw, observedAt, readings } = await fetchWeather();
    return { raw, observedAt, interval: 600, payload: { readings } };
  }
  if (id === "renfe-trips" || id === "renfe-alerts") {
    const endpoint = id === "renfe-trips" ? "trip_updates" : "alerts";
    const raw = await fetchText(`https://gtfsrt.renfe.com/${endpoint}.json`);
    const parsed = parseRenfe(JSON.parse(raw));
    const [version] =
      await sql`SELECT version FROM static_feed WHERE source_id='renfe' AND service_start<=(now() AT TIME ZONE 'Europe/Madrid')::date AND service_end>=(now() AT TIME ZONE 'Europe/Madrid')::date`;
    if (!version) throw new Error("static_feed_missing_or_expired");
    const routes =
      await sql`SELECT external_id,short_name,long_name FROM transit_route WHERE source_id='renfe'`;
    const routeIds = new Set(routes.map((row) => row.external_id));
    if (id === "renfe-alerts") {
      const alerts = parsed.entities.flatMap((entity) => {
        const a = entity.alert;
        if (
          !a?.informedEntity?.some((v) => v.routeId && routeIds.has(v.routeId))
        )
          return [];
        return [
          {
            id: entity.id,
            title: spanishText(a.headerText),
            description: spanishText(a.descriptionText),
            effect: a.effect ?? "UNKNOWN_EFFECT",
            cause: a.cause ?? "UNKNOWN_CAUSE",
            activePeriods: a.activePeriod ?? [],
            selectors: a.informedEntity,
            routeIds: a.informedEntity.flatMap((v) =>
              v.routeId && routeIds.has(v.routeId) ? [v.routeId] : [],
            ),
          },
        ];
      });
      return {
        raw,
        observedAt: parsed.observedAt,
        interval: 30,
        payload: { alerts, staticVersion: version.version },
      };
    }
    const ids = parsed.entities.flatMap((entity) =>
      entity.tripUpdate ? [entity.tripUpdate.trip.tripId] : [],
    );
    const trips = ids.length
      ? await sql`SELECT t.external_id, t.route_id,r.short_name,r.long_name FROM transit_trip t JOIN transit_route r ON r.source_id=t.source_id AND r.external_id=t.route_id WHERE t.source_id='renfe' AND t.external_id IN ${sql(ids)}`
      : [];
    const mapping = new Map(trips.map((row) => [row.external_id, row]));
    const updates = parsed.entities.flatMap((entity) => {
      const update = entity.tripUpdate;
      const match = update && mapping.get(update.trip.tripId);
      if (!update || !match) return [];
      return [
        {
          ...update,
          observedAt: update.timestamp
            ? timestamp(update.timestamp)
            : parsed.observedAt,
          routeId: match.route_id as string,
          line: match.short_name as string,
          routeName: match.long_name as string,
        },
      ];
    });
    return {
      raw,
      observedAt: parsed.observedAt,
      interval: 20,
      payload: {
        updates,
        staticVersion: version.version,
        unmatchedTrips: ids.length - updates.length,
        matching: {
          denominator: "trip_updates_in_received_national_feed",
          received: ids.length,
          matchedMadrid: updates.length,
          unmatchedCoverageUnknown: ids.length - updates.length,
          matchedFraction: ids.length ? updates.length / ids.length : null,
          note: "Unmatched does not imply a Madrid matching error; no regional identity is asserted for unmatched trips.",
        },
        coverage: "Matched Madrid GTFS trips only",
      },
    };
  }
  if (id === "bicimad") {
    const base = "https://madrid.publicbikesystem.net/customer/gbfs/v2/es/";
    const [information, status] = await Promise.all([
      fetchText(`${base}station_information`),
      fetchText(`${base}station_status`),
    ]);
    const parsed = parseBicimad(JSON.parse(information), JSON.parse(status));
    return {
      raw: JSON.stringify({
        information: JSON.parse(information),
        status: JSON.parse(status),
      }),
      observedAt: parsed.observedAt,
      interval: parsed.ttl,
      payload: {
        stations: parsed.stations,
        feedObservedAt: parsed.feedObservedAt,
      },
    };
  }
  if (id === "madrid-air") {
    const raw = await fetchText(
      "https://ciudadesabiertas.madrid.es/dynamicAPI/API/query/calair_tiemporeal.json?pageSize=5000",
    );
    const parsed = parseAir(JSON.parse(raw));
    return {
      raw,
      observedAt: parsed.observedAt,
      interval: 600,
      payload: { readings: parsed.readings },
    };
  }
  if (id === "madrid-parking") {
    const raw = await fetchText(
      "https://servayto.madrid.es/MTPAR_WSINFO/InfoParking",
      "text/xml",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: '"http://tempuri.org/iInfoParking/GetListParking"',
        },
        body: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetListParking xmlns="http://tempuri.org/"><language>es</language></GetListParking></soap:Body></soap:Envelope>',
      },
    );
    const parsed = parseParking(raw);
    return {
      raw,
      observedAt: parsed.observedAt,
      interval: 60,
      payload: { parkings: parsed.parkings },
    };
  }
  const raw = await fetchText(
    "https://informo.madrid.es/informo/tmadrid/pm.xml",
    "application/xml",
  );
  const parsed = parseTraffic(raw);
  return {
    raw,
    observedAt: parsed.observedAt,
    interval: 300,
    payload: { sensors: parsed.sensors },
  };
}

export async function ingest(id: JobId) {
  if (!ingestionEnabled()) return { job: id, status: "disabled" };
  const lease = await acquire(id);
  if (!lease) return { job: id, status: "not_due_or_inactive" };
  const sql = database();
  const policy = jobPolicies[id];
  let stage: "source" | "raw_storage" | "publication" = "source";
  try {
    const result = await load(id);
    const hash = createHash("sha256").update(result.raw).digest("hex");
    const filename = `${id}-${hash}.gz`;
    stage = "raw_storage";
    await mkdir(rawRoot(), { recursive: true });
    // Content address deduplicates retries. Files never enter the web app or model.
    await writeFile(resolve(rawRoot(), filename), await compress(result.raw), {
      mode: 0o600,
    });
    const payload = JSON.parse(
      JSON.stringify(result.payload),
    ) as postgres.JSONValue;
    stage = "publication";
    return await sql.begin(async (tx) => {
      const [owned] =
        await tx`SELECT id FROM ingestion_job WHERE id=${id} AND lease_token=${lease.token} AND lease_until>now() FOR UPDATE`;
      if (!owned) return { job: id, status: "lease_lost" };
      const [previous] =
        await tx`SELECT observed_at FROM mobility_snapshot WHERE job_id=${id}`;
      const historicalOnly =
        previous &&
        new Date(previous.observed_at).getTime() >
          Date.parse(result.observedAt);
      const observed = new Date(result.observedAt);
      const ingested = new Date();
      const reference = `sha256:${hash}`;
      if (!historicalOnly && "incidents" in result.payload)
        await publishDgt(tx, result.payload.incidents, observed);
      if (!historicalOnly && "stations" in result.payload) {
        const identifiers =
          await tx`SELECT external_id,place_id FROM place_external_identifier WHERE source_id='bicimad' AND namespace='gbfs.station'`;
        const ids = new Map(
          identifiers.map((row) => [row.external_id, row.place_id as string]),
        );
        const places = result.payload.stations.map((station) => ({
          id: ids.get(station.id) ?? randomUUID(),
          external_id: station.id,
          name: station.name,
          longitude: station.longitude,
          latitude: station.latitude,
        }));
        await tx`INSERT INTO canonical_place(id,name,kind,location)
          SELECT id::uuid,name,'bike_station',ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography
          FROM jsonb_to_recordset(${tx.json(places)}) AS p(id text,name text,longitude float8,latitude float8)
          ON CONFLICT (id) DO UPDATE SET name=excluded.name,location=excluded.location,updated_at=now()`;
        if (places.length)
          await tx`INSERT INTO place_external_identifier ${tx(places.map((p) => ({ source_id: "bicimad", namespace: "gbfs.station", external_id: p.external_id, place_id: p.id })))} ON CONFLICT DO NOTHING`;
      }
      const parserVersion =
        id === "dgt-incidents"
          ? "dgt-3.7-v1"
          : id === "renfe-alerts"
            ? "local-v3-selectors"
            : "local-v2";
      await tx`INSERT INTO raw_batch(source_id,object_key,sha256,fetched_at,expires_at,parser_version,content_type) VALUES (${policy.source},${filename},${hash},${ingested},${new Date(ingested.getTime() + 86400000)},${parserVersion},${id === "dgt-incidents" || id === "madrid-traffic" || id === "madrid-parking" ? "application/xml" : "application/json"}) ON CONFLICT (object_key) DO UPDATE SET expires_at=excluded.expires_at`;
      if (!historicalOnly)
        await tx`INSERT INTO mobility_snapshot(job_id,source_id,observed_at,ingested_at,quality,raw_reference,payload) VALUES (${id},${policy.source},${observed},${ingested},'provisional',${reference},${tx.json(payload)}) ON CONFLICT (job_id) DO UPDATE SET observed_at=excluded.observed_at,ingested_at=excluded.ingested_at,quality=excluded.quality,raw_reference=excluded.raw_reference,payload=excluded.payload`;
      const contentHash = createHash("sha256")
        .update(JSON.stringify({ parserVersion, payload }))
        .digest("hex");
      const [lastRevision] =
        await tx`SELECT content_hash,parser_version FROM mobility_history
        WHERE job_id=${id} AND observed_at=${observed}
        ORDER BY ingested_at DESC,revision_id DESC LIMIT 1`;
      if (
        lastRevision?.content_hash !== contentHash ||
        lastRevision?.parser_version !== parserVersion
      )
        await tx`INSERT INTO mobility_history(job_id,observed_at,ingested_at,quality,raw_reference,payload,parser_version,static_version,content_hash)
          VALUES (${id},${observed},${ingested},'provisional',${reference},${tx.json(payload)},${parserVersion},${"staticVersion" in result.payload ? (result.payload.staticVersion as string) : null},${contentHash})`;
      const currentObserved = historicalOnly
        ? new Date(previous.observed_at)
        : observed;
      await tx`UPDATE ingestion_job SET lease_token=NULL,lease_until=NULL,failures=0,error_code=NULL,error_stage=NULL,last_finished_at=now(),observed_at=${currentObserved},ingested_at=CASE WHEN ${Boolean(historicalOnly)} THEN ingested_at ELSE ${ingested} END,next_due_at=now()+${Math.max(policy.interval, result.interval)}*interval '1 second' WHERE id=${id}`;
      const health =
        Date.now() - currentObserved.getTime() > policy.maxAge * 1000
          ? "degraded"
          : "healthy";
      await tx`UPDATE source_health SET status=${health},last_attempt_at=now(),last_success_at=now(),last_observed_at=${currentObserved},error_code=NULL WHERE source_id=${policy.source}`;
      return {
        job: id,
        status: historicalOnly ? "historical_only" : health,
        observedAt: result.observedAt,
      };
    });
  } catch (error) {
    // Never log upstream bodies, URLs with keys, validation payloads or DB credentials.
    const code =
      stage === "source" ||
      (error instanceof Error && error.message === "out_of_order_feed")
        ? sourceErrorCode(error)
        : "ingestion_storage_error";
    return await sql.begin(async (tx) => {
      const [owned] =
        await tx`UPDATE ingestion_job SET lease_token=NULL,lease_until=NULL,failures=failures+1,error_code=${code},error_stage=${stage},last_finished_at=now(),next_due_at=now()+${retryDelay(policy.interval, lease.failures + 1)}*interval '1 second' WHERE id=${id} AND lease_token=${lease.token} AND lease_until>now() RETURNING id`;
      if (!owned) return { job: id, status: "lease_lost" };
      await tx`UPDATE source_health SET status='degraded',last_attempt_at=now(),error_code=${code} WHERE source_id=${policy.source}`;
      return { job: id, status: "error", error: code };
    });
  }
}

export async function activate() {
  if (!ingestionEnabled()) return;
  await database()`UPDATE ingestion_activity SET active_until=GREATEST(active_until,now()+interval '30 minutes')`;
}

export async function prune() {
  const sql = database();
  await sql`DELETE FROM mobility_history WHERE ingested_at<now()-interval '24 hours'`;
  const expired =
    await sql`DELETE FROM raw_batch WHERE expires_at<now() RETURNING object_key`;
  for (const row of expired) {
    if (/^[a-z-]+-[a-f0-9]{64}\.gz$/.test(row.object_key))
      await unlink(resolve(rawRoot(), row.object_key)).catch(() => {});
  }
  // Also expire orphan files left by a process crash before the transaction.
  for (const name of await readdir(rawRoot()).catch(() => [] as string[])) {
    if (!/^[a-z-]+-[a-f0-9]{64}\.gz$/.test(name)) continue;
    const path = resolve(rawRoot(), name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < Date.now() - 86400000)
      await unlink(path).catch(() => {});
  }
}

// A worker lane requests one eligible job at a time. There is no batch barrier:
// the other lane can keep draining due jobs while this lane waits for a provider.
export async function tick(lane?: "0" | "1") {
  if (!ingestionEnabled()) return { status: "disabled" };
  const sql = database();
  if (lane)
    await sql`UPDATE ingestion_worker SET last_seen_at=now() WHERE id=${lane}`;
  const [activity] =
    await sql`SELECT active_until>now() AS active FROM ingestion_activity`;
  if (!activity?.active) return { status: "idle" };
  const due = await sql`SELECT id FROM ingestion_job
    WHERE next_due_at<=now() AND (lease_until IS NULL OR lease_until<now())
    ORDER BY next_due_at,id`;
  const queue = due.map((row) => row.id as JobId);
  const run = async () => {
    const results = [];
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const result = await ingest(id);
        results.push(result);
        if (lane && result.status !== "not_due_or_inactive") break;
      } catch {
        // Storage/acquisition failures must not reject a sibling lane or expose
        // credentials. An acquired lease expires normally before another attempt.
        results.push({ job: id, status: "storage_error" });
        if (lane) break;
      }
    }
    return results;
  };
  const results = lane
    ? await run()
    : (await Promise.all([run(), run()])).flat();
  if (lane)
    await sql`UPDATE ingestion_worker SET last_seen_at=now() WHERE id=${lane}`;
  // Retention is maintained by the full/manual tick, or once per minute by lane 0.
  const maintenance =
    lane === "0"
      ? await sql`UPDATE ingestion_worker SET last_pruned_at=now()
        WHERE id='0' AND (last_pruned_at IS NULL OR last_pruned_at<now()-interval '1 minute') RETURNING id`
      : [];
  if (!lane || maintenance.length) await prune();
  return { status: "active", results };
}
