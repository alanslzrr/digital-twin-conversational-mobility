import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { timestamp } from "./common";

export const dgtUrl =
  "https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml";
export const dgtAttribution = {
  attribution: "Dirección General de Tráfico (DGT), NAP España",
  sourceUrl: dgtUrl,
  metadataUrl: "https://nap.dgt.es/es/dataset/incidencias-dgt-datex2-v3-7",
  termsUrl: "https://www.dgt.es/contenido/aviso-legal/",
};
export const dgtCoverage =
  "DGT published road incidents in Spain except Catalonia and the Basque Country. Not municipal traffic measurements; no inferred diversions or guaranteed absence of incidents.";
const text = z.string().max(12000);
const instant = z.iso.datetime({ offset: true });
const point = z.object({
  pointCoordinates: z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
  }),
  _tpegNonJunctionPointExtension: z
    .object({
      extendedTpegNonJunctionPoint: z.object({
        province: text.optional(),
        municipality: text.optional(),
        kilometerPoint: z.coerce.number().optional(),
        autonomousCommunity: text.optional(),
      }),
    })
    .optional(),
});
const record = z.object({
  "@_id": z.string().min(1).max(200),
  "@_version": z.coerce.number().int().nonnegative(),
  "@_type": text,
  situationRecordCreationTime: instant,
  situationRecordVersionTime: instant,
  validity: z.object({
    validityStatus: text,
    validityTimeSpecification: z
      .object({ overallStartTime: instant, overallEndTime: instant.optional() })
      .passthrough(),
  }),
  cause: z.object({ causeType: text }).optional(),
  severity: text.optional(),
  locationReference: z.object({
    "@_type": text,
    supplementaryPositionalDescription: z
      .object({
        roadInformation: z.object({ roadName: text.optional() }).optional(),
      })
      .optional(),
    tpegPointLocation: z
      .object({
        point,
        tpegDirection: text.optional(),
        _tpegSimplePointExtension: z
          .object({
            extendedTpegSimplePoint: z.object({
              tpegDirectionRoad: text.optional(),
            }),
          })
          .optional(),
      })
      .optional(),
    tpegLinearLocation: z
      .object({
        from: point,
        to: point,
        tpegDirection: text.optional(),
        _tpegLinearLocationExtension: z
          .object({
            extendedTpegLinearLocation: z.object({
              tpegDirectionRoad: text.optional(),
            }),
          })
          .optional(),
      })
      .optional(),
  }),
  roadOrCarriagewayOrLaneManagementType: text.optional(),
  genericSituationRecordName: text.optional(),
  abnormalTrafficType: text.optional(),
  obstructionType: text.optional(),
  speedManagementType: text.optional(),
  nonWeatherRelatedRoadConditionType: text.optional(),
  generalInstructionToRoadUsersType: text.optional(),
  poorEnvironmentType: text.optional(),
});
const schema = z.object({
  payload: z.object({
    "@_type": z.string().regex(/(^|:)SituationPublication$/),
    "@_profileVersion": z.literal("3.7_1.0"),
    publicationTime: instant,
    publicationCreator: z.object({ nationalIdentifier: z.literal("DGT") }),
    situation: z
      .array(
        z.object({
          "@_id": z.string().min(1).max(200),
          headerInformation: z.object({ informationStatus: text }),
          situationRecord: z.array(record).min(1).max(100),
        }),
      )
      .max(10000)
      .default([]),
  }),
});
function location(p: z.infer<typeof point>) {
  const extra = p._tpegNonJunctionPointExtension?.extendedTpegNonJunctionPoint;
  return {
    ...p.pointCoordinates,
    province: extra?.province ?? null,
    municipality: extra?.municipality ?? null,
    kilometerPoint: extra?.kilometerPoint ?? null,
    autonomousCommunity: extra?.autonomousCommunity ?? null,
  };
}
export function parseDgt(xml: string, now = Date.now()) {
  if (
    Buffer.byteLength(xml) > 8_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error("invalid_dgt_xml");
  const data = schema.parse(
    new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: false,
      isArray: (name) => name === "situation" || name === "situationRecord",
    }).parse(xml),
  ).payload;
  const observedAt = timestamp(Date.parse(data.publicationTime) / 1000, now);
  const incidents = data.situation.flatMap((s) =>
    s.situationRecord.map((r) => {
      const linear = r.locationReference.tpegLinearLocation;
      const single = r.locationReference.tpegPointLocation;
      const start = linear
        ? location(linear.from)
        : single
          ? location(single.point)
          : null;
      const end = linear ? location(linear.to) : null;
      return {
        id: `${s["@_id"]}:${r["@_id"]}`,
        situationId: s["@_id"],
        recordId: r["@_id"],
        version: r["@_version"],
        type: r["@_type"].split(":").at(-1) ?? "unknown",
        informationStatus: s.headerInformation.informationStatus,
        createdAt: r.situationRecordCreationTime,
        updatedAt: r.situationRecordVersionTime,
        providerValidity: r.validity.validityStatus,
        startsAt: r.validity.validityTimeSpecification.overallStartTime,
        endsAt: r.validity.validityTimeSpecification.overallEndTime ?? null,
        complexValidity: Object.keys(r.validity.validityTimeSpecification).some(
          (k) => !["overallStartTime", "overallEndTime"].includes(k),
        ),
        cause: r.cause?.causeType ?? null,
        severity: r.severity ?? null,
        detail:
          r.roadOrCarriagewayOrLaneManagementType ??
          r.genericSituationRecordName ??
          r.abnormalTrafficType ??
          r.obstructionType ??
          r.speedManagementType ??
          r.nonWeatherRelatedRoadConditionType ??
          r.generalInstructionToRoadUsersType ??
          r.poorEnvironmentType ??
          null,
        road:
          r.locationReference.supplementaryPositionalDescription
            ?.roadInformation?.roadName ?? null,
        direction:
          linear?._tpegLinearLocationExtension?.extendedTpegLinearLocation
            .tpegDirectionRoad ??
          single?._tpegSimplePointExtension?.extendedTpegSimplePoint
            .tpegDirectionRoad ??
          linear?.tpegDirection ??
          single?.tpegDirection ??
          "unknown",
        location: {
          type: end ? "segment_endpoints" : start ? "point" : "unknown",
          start,
          end,
        },
      };
    }),
  );
  // Collapse identical repeats, but reject conflicting versions in one publication.
  const unique = new Map<string, (typeof incidents)[number]>();
  for (const incident of incidents) {
    const previous = unique.get(incident.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(incident))
      throw new Error("conflicting_dgt_record");
    unique.set(incident.id, incident);
  }
  return {
    observedAt,
    incidents: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)),
    profileVersion: data["@_profileVersion"],
    ...dgtAttribution,
    coverage: dgtCoverage,
  };
}
export type DgtIncident = ReturnType<typeof parseDgt>["incidents"][number];
