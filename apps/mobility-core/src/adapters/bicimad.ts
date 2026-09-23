import { z } from "zod";
import { epoch, id, timestamp } from "./common";

const header = { last_updated: epoch, ttl: z.number().int().min(0).max(86400) };
const flag = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform(Boolean);
const information = z.object({
  ...header,
  data: z.object({
    stations: z
      .array(
        z.object({
          station_id: id,
          name: z.string().min(1).max(500),
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180),
          capacity: z.number().int().nonnegative().optional(),
        }),
      )
      .max(5000),
  }),
});
const status = z.object({
  ...header,
  data: z.object({
    stations: z
      .array(
        z.object({
          station_id: id,
          last_reported: epoch,
          num_bikes_available: z.number().int().nonnegative(),
          num_docks_available: z.number().int().nonnegative(),
          is_installed: flag,
          is_renting: flag,
          is_returning: flag,
        }),
      )
      .max(5000),
  }),
});

export function parseBicimad(info: unknown, state: unknown, now = Date.now()) {
  const places = information.parse(info);
  const live = status.parse(state);
  const byId = new Map(
    places.data.stations.map((station) => [station.station_id, station]),
  );
  return {
    observedAt: timestamp(live.last_updated, now),
    ttl: Math.max(20, live.ttl),
    stations: live.data.stations.flatMap((s) => {
      const place = byId.get(s.station_id);
      if (!place) return [];
      timestamp(s.last_reported, now);
      return [
        {
          id: s.station_id,
          name: place.name,
          latitude: place.lat,
          longitude: place.lon,
          bikes: s.num_bikes_available,
          docks: s.num_docks_available,
          installed: s.is_installed,
          renting: s.is_renting,
          returning: s.is_returning,
          observedAt: timestamp(
            Math.min(s.last_reported, live.last_updated),
            now,
          ),
        },
      ];
    }),
  };
}
