import { expect, it } from "vitest";
import { parseParking } from "./parking";

const xml = (occupation: string) =>
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetListParkingResponse><GetListParkingResult><code>0</code><ArrayOflstParking><lstParking><id>1</id><name>Test</name><latitude>40.4</latitude><longitude>-3.7</longitude>${occupation}</lstParking><lstParking><id>2</id><name>No observations</name><latitude>40.4</latitude><longitude>-3.7</longitude></lstParking></ArrayOflstParking></GetListParkingResult></GetListParkingResponse></s:Body></s:Envelope>`;
const occupation =
  "<lstOccupation><occupation><code>001</code><free>0</free><moment>2026-09-23T12:00:00+02:00</moment><name>Total</name></occupation></lstOccupation>";
const now = Date.parse("2026-09-23T10:02:00Z");
it("keeps zero spaces distinct from absent occupancy", () => {
  const data = parseParking(xml(occupation), now);
  expect(data.parkings[0]?.availability[0]?.freeSpaces).toBe(0);
  expect(data.parkings[1]?.availability).toEqual([]);
  expect(data.observedAt).toBe("2026-09-23T10:00:00.000Z");
});
it("rejects undated, future and negative-only observations", () => {
  expect(() => parseParking(xml(""), now)).toThrow();
  expect(() =>
    parseParking(xml(occupation.replace("<free>0", "<free>-1")), now),
  ).toThrow();
  expect(() => parseParking(xml(occupation), now - 3600000)).toThrow();
  expect(() =>
    parseParking(xml(occupation.replace("+02:00", "")), now),
  ).toThrow();
});
it("blocks XML declarations and remote entities", () => {
  expect(() => parseParking(`<!DOCTYPE bad>${xml(occupation)}`, now)).toThrow();
});
