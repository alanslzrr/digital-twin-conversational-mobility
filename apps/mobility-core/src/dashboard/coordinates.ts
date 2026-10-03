/** Same closed precedence for map filtering and list presentation. */
const paths = [
  [],
  ["coordinate"],
  ["stationIdentity", "location"],
  ["location", "start"],
] as const;
export function entityCoordinates(entity: Record<string, unknown>) {
  const value = (axis: "latitude" | "longitude") => {
    for (const path of paths) {
      let candidate: unknown = entity;
      for (const key of [...path, axis])
        candidate =
          candidate && typeof candidate === "object"
            ? (candidate as Record<string, unknown>)[key]
            : undefined;
      if (typeof candidate === "number" && Number.isFinite(candidate))
        return candidate;
    }
    return null;
  };
  return { latitude: value("latitude"), longitude: value("longitude") };
}
/** Only closed field paths enter SQL; no user input or identifiers. */
export function coordinateSql(axis: "latitude" | "longitude") {
  return `coalesce(${paths
    .map((path) => {
      const extraction = `entity#>'{${[...path, axis].join(",")}}'`;
      return `CASE WHEN jsonb_typeof(${extraction})='number' THEN (${extraction})::text::float8 END`;
    })
    .join(",")})`;
}
