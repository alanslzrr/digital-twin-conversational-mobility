import { createHash, randomUUID } from "node:crypto";
import type { WeatherProduct } from "@mobility/contracts";
import { localIngestionEnabled, retryDelay } from "@mobility/domain";
import { sourceErrorCode } from "./adapters/common";
import {
  fetchWeatherProduct,
  WeatherHttpError,
} from "./adapters/journey-weather";
import { weatherDatabase } from "./database";
import { weatherQuery } from "./weather-query";
export const weatherInterval = (resource: string) =>
  resource === "warnings:28" ? 300 : 1800;
// Same gate + owner-token pattern as EMT arrivals, shared by read-through and existing worker lanes.
export async function refreshWeather(resource: string, signal: AbortSignal) {
  if (!localIngestionEnabled(process.env) || signal.aborted) return false;
  const sql = weatherDatabase(),
    token = randomUUID();
  const [row] = await weatherQuery(
    sql`
    WITH gate AS MATERIALIZED (
      SELECT singleton FROM weather_gate WHERE next_due_at<=now() AND (lease_until IS NULL OR lease_until<now())
      AND EXISTS(SELECT 1 FROM ingestion_activity WHERE active_until>now()) AND EXISTS(SELECT 1 FROM source_catalog WHERE id='aemet' AND enabled)
      FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE weather_product SET lease_token=${token},lease_until=now()+interval '45 seconds',attempts=attempts+1
      WHERE resource=${resource} AND demanded_until>now() AND next_due_at<=now() AND (lease_until IS NULL OR lease_until<now())
      AND EXISTS(SELECT 1 FROM gate) RETURNING *
    ), gated AS (
      UPDATE weather_gate SET lease_token=${token},lease_until=now()+interval '45 seconds' WHERE EXISTS(SELECT 1 FROM claimed) RETURNING singleton
    ) SELECT claimed.* FROM claimed,gated`,
    signal,
  );
  if (!row) return false;
  try {
    const result = await fetchWeatherProduct(resource, signal, {
      payload: row.payload as WeatherProduct | null,
      lastModified: row.last_modified,
    });
    signal.throwIfAborted();
    const interval = weatherInterval(resource);
    const p = result.notModified ? null : result.payload;
    const version = p
      ? createHash("sha256").update(JSON.stringify(p)).digest("hex")
      : null;
    const saved = await weatherQuery(
      sql`
      WITH owner AS MATERIALIZED (SELECT singleton FROM weather_gate WHERE lease_token=${token} AND lease_until>now() FOR UPDATE),
      saved AS (
        UPDATE weather_product SET
          payload=CASE WHEN ${result.notModified} THEN payload ELSE ${sql.json(p)} END,
          version=CASE WHEN ${result.notModified} THEN version ELSE ${version} END,
          issued_at=CASE WHEN ${result.notModified} THEN issued_at ELSE ${p?.issuedAt ?? null}::timestamptz END,
          valid_from=CASE WHEN ${result.notModified} THEN valid_from ELSE ${p?.validFrom ?? null}::timestamptz END,
          valid_to=CASE WHEN ${result.notModified} THEN valid_to ELSE ${p?.validTo ?? null}::timestamptz END,
          fetched_at=CASE WHEN ${result.notModified} THEN fetched_at ELSE now() END,
          last_modified=CASE WHEN ${result.notModified} THEN last_modified ELSE ${result.notModified ? null : result.lastModified} END,
          checked_at=now(),next_due_at=now()+${interval}*interval '1 second',error_code=NULL,failures=0,lease_token=NULL,lease_until=NULL
        WHERE resource=${resource} AND lease_token=${token} AND lease_until>now() AND EXISTS(SELECT 1 FROM owner)
        AND (CASE WHEN ${result.notModified} THEN payload IS NOT NULL ELSE issued_at IS NULL OR issued_at<=${p?.issuedAt ?? null}::timestamptz END)
        RETURNING resource
      ), released AS (
        UPDATE weather_gate SET lease_token=NULL,lease_until=NULL,next_due_at=now()+interval '10 seconds'
        WHERE lease_token=${token} AND EXISTS(SELECT 1 FROM saved) RETURNING singleton
      ) SELECT saved.* FROM saved,released`,
      signal,
    );
    if (!saved.length) throw Error("out_of_order_feed");
  } catch (error) {
    const code = sourceErrorCode(error),
      failures = Math.min(Number(row.failures) + 1, 20),
      delay = Math.max(
        retryDelay(15, failures),
        error instanceof WeatherHttpError ? error.retryAfter : 0,
      );
    // Cleanup gets a small independent budget after provider cancellation. If the
    // DB is unavailable, the bounded lease expires and another tick can recover.
    await weatherQuery(
      sql`
      WITH failed AS (
        UPDATE weather_product SET error_code=${code},failures=${failures},next_due_at=now()+${delay}*interval '1 second',lease_token=NULL,lease_until=NULL WHERE resource=${resource} AND lease_token=${token}
      ) UPDATE weather_gate SET lease_token=NULL,lease_until=NULL,next_due_at=now()+${delay}*interval '1 second' WHERE lease_token=${token}`,
      AbortSignal.timeout(500),
    ).catch(() => {});
  }
  return true;
}
export async function weatherWorkerTick() {
  if (!localIngestionEnabled(process.env)) return false;
  const sql = weatherDatabase();
  const signal = AbortSignal.timeout(12000);
  const rows = await weatherQuery(
    sql`SELECT resource FROM weather_product WHERE demanded_until>now() AND next_due_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_due_at,resource LIMIT 1`,
    signal,
  );
  if (!rows[0]) return false;
  return refreshWeather(rows[0].resource, signal);
}
export async function weatherProducts(
  resources: string[],
  signal: AbortSignal,
) {
  const sql = weatherDatabase();
  const wanted = [...new Set(resources)].slice(0, 13);
  if (!wanted.length) return [];
  await weatherQuery(
    sql`INSERT INTO weather_product(resource,demanded_until)
    SELECT resource,now()+interval '30 minutes' FROM unnest(${wanted}::text[]) AS resource
    ON CONFLICT(resource) DO UPDATE SET demanded_until=GREATEST(weather_product.demanded_until,EXCLUDED.demanded_until)`,
    signal,
  );
  const read = () =>
    weatherQuery(
      sql`SELECT * FROM weather_product WHERE resource=ANY(${wanted})`,
      signal,
    );
  let rows = await read();
  // Existing payloads (including known missing horizons) never cause a route-time download.
  const missing = rows.find(
    (r) => !r.payload && new Date(r.next_due_at).getTime() <= Date.now(),
  );
  if (missing && !signal.aborted)
    await refreshWeather(missing.resource, signal);
  if (rows.some((r) => !r.payload) && !signal.aborted) rows = await read();
  return rows;
}
