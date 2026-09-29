import type {
  AccessibilityDeclaration,
  AccessibilityRef,
} from "@mobility/contracts";
export type AccessibilityRecord = AccessibilityRef & {
  code: number | null;
  locationType?: number | null | undefined;
  parentId?: string | null | undefined;
  lines?: string[] | undefined;
  provenance: AccessibilityDeclaration["provenance"];
};
export const accessibilityKey = (r: AccessibilityRef) =>
  JSON.stringify([r.feed, r.version, r.entity, r.externalId]);
export function unknownAccessibility(
  ref: AccessibilityRef,
  reason = "attribute_or_mapping_missing",
): AccessibilityDeclaration {
  return {
    ...ref,
    status: "unknown",
    normalizedCode: null,
    locationType: null,
    scope:
      ref.entity === "stop"
        ? "stop_wheelchair_boarding"
        : "trip_wheelchair_vehicle",
    reason,
    inheritedFrom: null,
    provenance: null,
    qualityNotes: [],
    operationalStatus: "not_verified",
  };
}
export function interpretAccessibility(
  ref: AccessibilityRef,
  row?: AccessibilityRecord,
  parent?: AccessibilityRecord,
): AccessibilityDeclaration {
  const result = unknownAccessibility(ref);
  if (!row) return result;
  if (accessibilityKey(ref) !== accessibilityKey(row) || !ref.version)
    return { ...result, reason: "feed_version_or_identity_mismatch" };
  result.provenance = row.provenance;
  result.locationType =
    ref.entity === "stop" ? (row.locationType ?? null) : null;
  result.normalizedCode = [0, 1, 2].includes(row.code ?? -1)
    ? (row.code as 0 | 1 | 2)
    : null;
  if (ref.entity === "stop" && ![0, 1, 2].includes(row.locationType ?? -1))
    return { ...result, reason: "unsupported_location_type" };
  let code = result.normalizedCode;
  if (code === 0 || code === null) {
    if (
      ref.entity === "stop" &&
      row.parentId &&
      [0, 2].includes(row.locationType ?? -1)
    ) {
      if (
        parent?.entity !== "stop" ||
        parent.externalId !== row.parentId ||
        parent.externalId === row.externalId ||
        parent.feed !== row.feed ||
        parent.version !== row.version ||
        parent.locationType !== 1 ||
        parent.parentId
      )
        return { ...result, reason: "invalid_or_missing_parent" };
      if (parent.code === 1 || parent.code === 2) {
        code = parent.code;
        result.inheritedFrom = {
          feed: parent.feed,
          version: parent.version as string,
          externalId: parent.externalId,
          normalizedCode: parent.code,
          ingestedAt: parent.provenance?.ingestedAt ?? null,
        };
      }
    }
  }
  result.status =
    code === 1
      ? "declared_accessible"
      : code === 2
        ? "declared_not_accessible"
        : "unknown";
  result.reason =
    result.status === "unknown"
      ? "no_static_declaration"
      : result.inheritedFrom
        ? "inherited_parent_declaration"
        : "explicit_static_declaration";
  const lines = (row.lines ?? []).filter(
    (l) => ["ML2", "ML3"].includes(l) && (!ref.line || ref.line === l),
  );
  if (
    ref.entity === "stop" &&
    code === 2 &&
    row.feed === "light-rail" &&
    row.version ===
      "7e49cfc0980c8e61d96a258d1076ec410a26f66767586d1b1dea49b9caa39467" &&
    lines.length
  )
    result.qualityNotes.push({
      code: "mlo_gtfs_discrepancy",
      lines,
      message:
        "This GTFS version declares negative stop accessibility for ML2/ML3, conflicting with MLO's general information. Codes retained; discrepancy unresolved; equipment operation not verified.",
      sourceUrl: "https://www.metroligero-oeste.es/atencion-al-cliente",
      researchedAt: "2026-09-29",
    });
  return result;
}
