import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { madridTime, numeric, timestamp } from "./common";

const air = z.object({
  records: z.array(z.record(z.string(), z.string())).max(5000),
  totalRecords: z.number(),
});
const pollutants: Record<string, { name: string; unit: string }> = {
  "1": { name: "SO2", unit: "µg/m³" },
  "6": { name: "CO", unit: "mg/m³" },
  "7": { name: "NO", unit: "µg/m³" },
  "8": { name: "NO2", unit: "µg/m³" },
  "9": { name: "PM2.5", unit: "µg/m³" },
  "10": { name: "PM10", unit: "µg/m³" },
  "12": { name: "NOx", unit: "µg/m³" },
  "14": { name: "O3", unit: "µg/m³" },
};
export function parseAir(input: unknown, now = Date.now()) {
  const data = air.parse(input);
  if (data.records.length !== data.totalRecords)
    throw new Error("incomplete_air_page");
  const readings = data.records.flatMap((r) => {
    const pollutant = pollutants[String(Number(r.MAGNITUD))];
    if (!pollutant) return [];
    for (let hour = 24; hour >= 1; hour--) {
      const suffix = String(hour).padStart(2, "0");
      if (r[`V${suffix}`] !== "V") continue;
      const value = numeric.safeParse(r[`H${suffix}`]);
      if (!value.success || value.data < 0) continue;
      try {
        const observedAt = madridTime(
          Number(r.ANO),
          Number(r.MES),
          Number(r.DIA),
          hour,
        );
        timestamp(Date.parse(observedAt) / 1000, now);
        return [
          {
            stationId: r.ESTACION ?? "",
            samplingPoint: r.PUNTO_MUESTREO ?? "",
            ...pollutant,
            value: value.data,
            observedAt,
            validation: "V",
          },
        ];
      } catch {
        /* Skip ambiguous DST or future readings, never substitute fetch time. */
      }
    }
    return [];
  });
  if (!readings.length) throw new Error("no_valid_air_observations");
  return {
    observedAt: readings
      .map((r) => r.observedAt)
      .sort()
      .at(-1) as string,
    readings,
  };
}

const traffic = z.object({
  pms: z.object({
    fecha_hora: z.string(),
    pm: z
      .array(
        z.object({
          idelem: numeric,
          descripcion: z.string(),
          intensidad: numeric,
          ocupacion: numeric,
          carga: numeric,
          nivelServicio: numeric,
          error: z.string(),
        }),
      )
      .max(10000),
  }),
});
export function parseTraffic(xml: string, now = Date.now()) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error("invalid_traffic_xml");
  const data = traffic.parse(
    new XMLParser({
      parseTagValue: false,
      processEntities: false,
      isArray: (name) => name === "pm",
    }).parse(xml),
  ).pms;
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    data.fecha_hora,
  );
  if (!match) throw new Error("invalid_traffic_date");
  const observedAt = madridTime(
    Number(match[3]),
    Number(match[2]),
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  timestamp(Date.parse(observedAt) / 1000, now);
  return {
    observedAt,
    sensors: data.pm
      .filter(
        (r) =>
          r.error === "N" &&
          r.intensidad >= 0 &&
          r.ocupacion >= 0 &&
          r.carga >= 0 &&
          r.nivelServicio >= 0,
      )
      .map((r) => ({
        id: String(r.idelem),
        name: r.descripcion,
        vehiclesPerHour: r.intensidad,
        occupancyPercent: r.ocupacion,
        loadPercent: r.carga,
        serviceLevel: r.nivelServicio,
      })),
  };
}
