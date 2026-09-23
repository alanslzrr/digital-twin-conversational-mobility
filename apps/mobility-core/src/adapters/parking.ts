import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { numeric, timestamp } from "./common";

const schema = z.object({
  Envelope: z.object({
    Body: z.object({
      GetListParkingResponse: z.object({
        GetListParkingResult: z.object({
          code: numeric,
          ArrayOflstParking: z.object({
            lstParking: z
              .array(
                z.object({
                  id: numeric,
                  name: z.string(),
                  address: z.string().optional(),
                  latitude: numeric.pipe(z.number().min(-90).max(90)),
                  longitude: numeric.pipe(z.number().min(-180).max(180)),
                  lstOccupation: z
                    .object({
                      occupation: z.array(
                        z.object({
                          code: z.string(),
                          free: numeric,
                          moment: z.iso.datetime({ offset: true }),
                          name: z.string(),
                        }),
                      ),
                    })
                    .optional(),
                }),
              )
              .max(1000),
          }),
        }),
      }),
    }),
  }),
});
export function parseParking(xml: string, now = Date.now()) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error("invalid_parking_xml");
  const result = schema.parse(
    new XMLParser({
      removeNSPrefix: true,
      parseTagValue: false,
      processEntities: false,
      isArray: (name) => name === "lstParking" || name === "occupation",
    }).parse(xml),
  ).Envelope.Body.GetListParkingResponse.GetListParkingResult;
  if (result.code !== 0) throw new Error("parking_service_error");
  const parkings = result.ArrayOflstParking.lstParking.map((p) => ({
    id: String(p.id),
    name: p.name,
    address: p.address ?? "",
    latitude: p.latitude,
    longitude: p.longitude,
    availability: (p.lstOccupation?.occupation ?? []).flatMap((o) => {
      if (o.free < 0 || !Number.isInteger(o.free)) return [];
      try {
        return [
          {
            category: o.code,
            name: o.name,
            freeSpaces: o.free,
            observedAt: timestamp(Date.parse(o.moment) / 1000, now),
          },
        ];
      } catch {
        return [];
      }
    }),
  }));
  const times = parkings
    .flatMap((p) => p.availability.map((o) => o.observedAt))
    .sort();
  if (!times.length) throw new Error("no_parking_observations");
  return { observedAt: times.at(-1) as string, parkings };
}
