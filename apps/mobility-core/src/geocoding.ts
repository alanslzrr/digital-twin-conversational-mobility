import { createHash, randomUUID } from "node:crypto";
import { sourceErrorCode } from "./adapters/common";
import { fetchGeocodes, geocoderConfig } from "./adapters/geocoder";
import { database } from "./database";
import { resolvePlace } from "./mobility";

type Candidate = Awaited<ReturnType<typeof fetchGeocodes>>[number] & {
  id: string;
};
const coverage =
  "Madrid-region bounding box, not an administrative boundary. Coordinate/address estimates from OSM, not entrances or accessibility guarantees. No autocomplete, bulk lookup or private/confidential addresses.";
function present(
  candidates: Candidate[],
  fetchedAt: Date | string,
  provider: string,
  cached: boolean,
) {
  return {
    status: candidates.length ? "found" : "not_found",
    places: candidates,
    ambiguous: candidates.length > 1,
    requiresConfirmation: true,
    basis: "external_geocoder",
    cached,
    coverage,
    provenance: {
      provider,
      fetchedAt: new Date(fetchedAt).toISOString(),
      ageSeconds: Math.max(
        0,
        Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000),
      ),
      attribution: "© OpenStreetMap contributors",
      licence: "ODbL",
      termsUrl: "https://www.openstreetmap.org/copyright",
      coordinatesAreEstimates: true,
    },
  };
}
export async function resolveAddress(query: string, allowExternal: boolean) {
  const local = await resolvePlace(query, 5);
  if (local.places.length)
    return { ...local, basis: "local_catalog", externalRequest: false };
  const config = geocoderConfig();
  if (!config)
    return {
      status: "unavailable",
      reason: "geocoder_not_configured",
      places: [],
      coverage,
    };
  const normalized = query
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  const key = createHash("sha256")
    .update(JSON.stringify([config.url, normalized, "madrid-es-v1"]))
    .digest("hex");
  const sql = database();
  const [cached] =
    await sql`SELECT * FROM geocode_cache WHERE cache_key=${key} AND expires_at>now()`;
  if (cached)
    return present(
      cached.payload as Candidate[],
      cached.fetched_at,
      config.url,
      true,
    );
  if (!allowExternal)
    return {
      status: "confirmation_required",
      reason: "public_address_external_lookup_consent_required",
      places: [],
      coverage,
    };
  const token = randomUUID();
  const [gate] =
    await sql`UPDATE geocode_gate SET lease_token=${token},lease_until=now()+interval '30 seconds'
    WHERE singleton AND next_due_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING failures`;
  if (!gate)
    return {
      status: "unavailable",
      reason: "geocoder_busy_or_backoff",
      retryAfterSeconds: 2,
      places: [],
      coverage,
    };
  try {
    const candidates = await fetchGeocodes(normalized, config);
    return await sql.begin(async (tx) => {
      const [owner] =
        await tx`SELECT singleton FROM geocode_gate WHERE lease_token=${token} AND lease_until>now() FOR UPDATE`;
      if (!owner)
        return {
          status: "unavailable",
          reason: "geocoder_lease_expired",
          places: [],
          coverage,
        };
      const saved: Candidate[] = [];
      for (const candidate of candidates) {
        const [existing] =
          await tx`SELECT place_id FROM place_external_identifier WHERE source_id='osm' AND namespace='geocoder.osm' AND external_id=${candidate.externalId}`;
        let id = existing?.place_id as string | undefined;
        if (!id) {
          const [place] =
            await tx`INSERT INTO canonical_place(name,kind,location) VALUES(${candidate.name},'address',ST_SetSRID(ST_MakePoint(${candidate.longitude},${candidate.latitude}),4326)::geography) RETURNING id`;
          if (!place) throw Error("geocoder_insert_failed");
          id = place.id as string;
          await tx`INSERT INTO place_external_identifier(source_id,namespace,external_id,place_id) VALUES('osm','geocoder.osm',${candidate.externalId},${id})`;
        } else
          await tx`UPDATE canonical_place SET name=${candidate.name},location=ST_SetSRID(ST_MakePoint(${candidate.longitude},${candidate.latitude}),4326)::geography,updated_at=now() WHERE id=${id}`;
        saved.push({ ...candidate, id });
      }
      const fetchedAt = new Date().toISOString();
      await tx`DELETE FROM geocode_cache WHERE expires_at<=now()`;
      await tx`DELETE FROM geocode_cache WHERE cache_key IN(SELECT cache_key FROM geocode_cache ORDER BY fetched_at DESC OFFSET 4999)`;
      await tx`INSERT INTO geocode_cache(cache_key,provider,fetched_at,expires_at,payload) VALUES(${key},${config.url},${fetchedAt},now()+${saved.length ? 604800 : 3600}*interval '1 second',${tx.json(saved)}) ON CONFLICT(cache_key) DO UPDATE SET fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,payload=excluded.payload`;
      await tx`UPDATE geocode_gate SET lease_token=NULL,lease_until=NULL,next_due_at=now()+interval '2 seconds',failures=0,error_code=NULL WHERE lease_token=${token}`;
      return present(saved, fetchedAt, config.url, false);
    });
  } catch (error) {
    const reason = sourceErrorCode(error);
    await sql`UPDATE geocode_gate SET lease_token=NULL,lease_until=NULL,next_due_at=now()+interval '60 seconds',failures=failures+1,error_code=${reason} WHERE lease_token=${token}`;
    return { status: "unavailable", reason, places: [], coverage };
  }
}
