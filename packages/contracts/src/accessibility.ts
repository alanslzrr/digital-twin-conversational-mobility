export type AccessibilityStatus =
  | "declared_accessible"
  | "declared_not_accessible"
  | "unknown";
export type AccessibilityRef = {
  feed: string;
  version: string | null;
  entity: "stop" | "trip";
  externalId: string;
  line?: string | undefined;
};
export type AccessibilityDeclaration = AccessibilityRef & {
  status: AccessibilityStatus;
  normalizedCode: 0 | 1 | 2 | null;
  locationType: number | null;
  scope: "stop_wheelchair_boarding" | "trip_wheelchair_vehicle";
  reason: string;
  inheritedFrom: {
    feed: string;
    version: string;
    externalId: string;
    normalizedCode: 1 | 2;
    ingestedAt: string | null;
  } | null;
  provenance: {
    source: string;
    feed: string;
    version: string;
    sourceUrl: string | null;
    ingestedAt: string | null;
    catalogImportedAt: string | null;
    publishedAt: string | null;
    fetchedAt: string | null;
    preparedAt: string | null;
    serviceStart: string | null;
    serviceEnd: string | null;
    currentServiceEnvelope: boolean | null;
    temporalWarning: string | null;
    inspectionAt: null;
    realtime: false;
  } | null;
  qualityNotes: {
    code: string;
    lines: string[];
    message: string;
    sourceUrl: string;
    researchedAt: string;
  }[];
  operationalStatus: "not_verified";
};
