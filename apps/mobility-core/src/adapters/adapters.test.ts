import { describe, expect, it } from "vitest";
import { parseBicimad } from "./bicimad";
import { madridTime, numeric, sourceErrorCode, timestamp } from "./common";
import { parseAir, parseTraffic } from "./madrid";
import { parseRenfe, spanishText } from "./renfe";

const now = Date.parse("2026-09-23T19:00:00Z");
const seconds = now / 1000;
describe("source timestamps", () => {
  it("reports bounded failure categories without echoing upstream secrets", () => {
    expect(
      sourceErrorCode(new DOMException("secret URL", "TimeoutError")),
    ).toBe("upstream_timeout");
    expect(
      sourceErrorCode(
        new TypeError("failed https://provider.test?api_key=secret"),
      ),
    ).toBe("upstream_network_error");
    expect(sourceErrorCode(new Error("credentials: secret"))).toBe(
      "source_fetch_or_validation_failed",
    );
    expect(sourceErrorCode(new Error("upstream_http_403"))).toBe(
      "upstream_http_403",
    );
  });
  it("rejects future observations, NaN and blank numbers", () => {
    expect(() => timestamp(seconds + 31, now)).toThrow();
    expect(() => timestamp(Number.NaN, now)).toThrow();
    expect(numeric.safeParse(" ").success).toBe(false);
    expect(timestamp(seconds - 600, now)).toBe("2026-09-23T18:50:00.000Z");
  });
  it("converts winter/summer civil time and H24 correctly", () => {
    expect(madridTime(2026, 1, 10, 12)).toBe("2026-01-10T11:00:00.000Z");
    expect(madridTime(2026, 9, 23, 12)).toBe("2026-09-23T10:00:00.000Z");
    expect(madridTime(2026, 9, 23, 24)).toBe("2026-09-23T22:00:00.000Z");
  });
  it("rejects ambiguous/nonexistent DST hours and invalid dates", () => {
    expect(() => madridTime(2026, 3, 29, 2)).toThrow();
    expect(() => madridTime(2026, 10, 25, 2)).toThrow();
    expect(() => madridTime(2026, 2, 31, 12)).toThrow();
  });
});
describe("official Renfe JSON", () => {
  it("trims padded IDs without inventing departure estimates", () => {
    const data = parseRenfe(
      {
        header: { timestamp: String(seconds) },
        entity: [
          {
            id: "id",
            tripUpdate: {
              trip: { tripId: " 1064X123C1 " },
              stopTimeUpdate: [
                {
                  stopId: " 18000 ",
                  arrival: { time: String(seconds + 120), delay: 12 },
                },
              ],
            },
          },
        ],
      },
      now,
    );
    expect(data.entities[0]?.tripUpdate?.trip.tripId).toBe("1064X123C1");
    expect(
      data.entities[0]?.tripUpdate?.stopTimeUpdate?.[0]?.departure,
    ).toBeUndefined();
  });
  it("accepts cancellation without fabricated stop times", () => {
    const data = parseRenfe(
      {
        header: { timestamp: seconds },
        entity: [
          {
            id: "cancel",
            tripUpdate: {
              trip: { tripId: "t", scheduleRelationship: "CANCELED" },
            },
          },
        ],
      },
      now,
    );
    expect(data.entities[0]?.tripUpdate?.stopTimeUpdate).toBeUndefined();
  });
  it("rejects differential updates and preserves empty complete snapshots", () => {
    expect(() =>
      parseRenfe(
        {
          header: { timestamp: seconds, incrementality: "DIFFERENTIAL" },
          entity: [],
        },
        now,
      ),
    ).toThrow();
    expect(
      parseRenfe({ header: { timestamp: seconds }, entity: [] }, now).entities,
    ).toEqual([]);
  });
  it("prefers Spanish alerts and treats text as data", () => {
    expect(
      spanishText({
        translation: [
          { text: "Hello", language: "en" },
          { text: "Aviso", language: "es" },
        ],
      }),
    ).toBe("Aviso");
  });
});

const info = {
  last_updated: seconds,
  ttl: 10,
  data: { stations: [{ station_id: "1", name: "Sol", lat: 40.4, lon: -3.7 }] },
};
const status = {
  last_updated: seconds,
  ttl: 10,
  data: {
    stations: [
      {
        station_id: "1",
        last_reported: seconds - 200,
        num_bikes_available: 0,
        num_docks_available: 3,
        is_installed: true,
        is_renting: 0,
        is_returning: 1,
      },
    ],
  },
};
describe("BiciMAD GBFS", () => {
  it("preserves last_reported even when newer than the feed header", () => {
    const result = parseBicimad(
      info,
      { ...status, last_updated: seconds - 300 },
      now,
    );
    expect(result.stations[0]?.observedAt).toBe(timestamp(seconds - 200, now));
    expect(result.stations[0]?.feedObservedAt).toBe(
      timestamp(seconds - 300, now),
    );
    expect(result.stations[0]?.timestampConsistency).toBe("station_after_feed");
  });
  it("preserves station observation time and zero availability", () => {
    const data = parseBicimad(info, status, now);
    expect(data.stations[0]?.bikes).toBe(0);
    expect(data.stations[0]?.renting).toBe(false);
    expect(data.stations[0]?.observedAt).toBe(timestamp(seconds - 200, now));
    expect(data.ttl).toBe(20);
  });
  it("does not join unknown stations", () => {
    expect(
      parseBicimad({ ...info, data: { stations: [] } }, status, now).stations,
    ).toEqual([]);
  });
  it("rejects impossible counts", () => {
    expect(() =>
      parseBicimad(
        info,
        {
          ...status,
          data: {
            stations: [{ ...status.data.stations[0], num_bikes_available: -1 }],
          },
        },
        now,
      ),
    ).toThrow();
  });
});
describe("municipal observations", () => {
  const record = {
    ESTACION: "11",
    MAGNITUD: "8",
    ANO: "2026",
    MES: "09",
    DIA: "23",
    PUNTO_MUESTREO: "28079011_8_8",
    H19: "0",
    V19: "V",
    H20: "90",
    V20: "N",
    H24: "999",
    V24: "V",
  };
  it("preserves a valid zero and ignores invalid or future air measurements", () => {
    const result = parseAir({ totalRecords: 1, records: [record] }, now);
    expect(result.readings[0]?.value).toBe(0);
    expect(result.readings[0]?.unit).toBe("µg/m³");
    expect(result.observedAt).toBe("2026-09-23T17:00:00.000Z");
  });
  it("rejects incomplete paginated air feeds", () => {
    expect(() =>
      parseAir({ totalRecords: 2, records: [record] }, now),
    ).toThrow();
  });
  const xml =
    "<pms><fecha_hora>23/09/2026 20:55:00</fecha_hora><pm><idelem>1</idelem><descripcion>CALLE</descripcion><intensidad>0</intensidad><ocupacion>0</ocupacion><carga>0</carga><nivelServicio>0</nivelServicio><error>N</error></pm></pms>";
  it("parses singleton XML sensors and converts local time", () => {
    const result = parseTraffic(xml, now);
    expect(result.observedAt).toBe("2026-09-23T18:55:00.000Z");
    expect(result.sensors[0]?.vehiclesPerHour).toBe(0);
  });
  it("excludes erroneous sensors and blocks entity expansion", () => {
    expect(
      parseTraffic(xml.replace("<intensidad>0", "<intensidad>-1"), now).sensors,
    ).toEqual([]);
    expect(
      parseTraffic(xml.replace("<error>N", "<error>S"), now).sensors,
    ).toEqual([]);
    expect(() =>
      parseTraffic(`<!DOCTYPE pms [<!ENTITY bad 'x'>]>${xml}`, now),
    ).toThrow();
    expect(() => parseTraffic("<broken>", now)).toThrow();
  });
});

it("accepts municipal single-digit hours", () => {
  const xml =
    "<pms><fecha_hora>25/09/2026 8:50:02</fecha_hora><pm><idelem>1</idelem><descripcion>CALLE</descripcion><intensidad>0</intensidad><ocupacion>0</ocupacion><carga>0</carga><nivelServicio>0</nivelServicio><error>N</error></pm></pms>";
  expect(parseTraffic(xml, Date.parse("2026-09-25T08:00:00Z")).observedAt).toBe(
    "2026-09-25T06:50:02.000Z",
  );
});
