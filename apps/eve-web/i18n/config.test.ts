import { createFormatter, createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  formatLocale,
  LOCALE_MAX_AGE,
  localeCookie,
  persistLocale,
  resolveLocale,
  UI_TIME_ZONE,
} from "./config";
import { type MessageKey, messages, ownedCopyKeys } from "./messages";

const keys = (catalog: Record<string, Record<string, string>>) =>
  Object.entries(catalog)
    .flatMap(([namespace, values]) =>
      Object.keys(values).map((key) => `${namespace}.${key}`),
    )
    .sort();
describe("global UI locale", () => {
  it("defaults to Spanish and accepts only the exact supported cookies", () => {
    for (const value of [
      undefined,
      null,
      "",
      "fr",
      "ES",
      "en-GB",
      "en; Secure",
      123,
    ])
      expect(resolveLocale(value)).toBe("es");
    expect(resolveLocale("es")).toBe("es");
    expect(resolveLocale("en")).toBe("en");
  });
  it("persists for twelve months without identity or private attributes", () => {
    expect(LOCALE_MAX_AGE).toBe(31536000);
    expect(localeCookie("en", true)).toBe(
      "mobility-locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(localeCookie("es", false)).not.toContain("Secure");
    const target = { cookie: "" };
    persistLocale("en", target, false);
    expect(target.cookie).toContain("mobility-locale=en");
  });
  it("does not throw if browser persistence is blocked", () => {
    const target = {
      get cookie() {
        return "";
      },
      set cookie(_: string) {
        throw new Error("Synthetic blocked persistence");
      },
    };
    expect(() => persistLocale("en", target, true)).not.toThrow();
  });
  it("keeps semantic catalog keys and interpolation arguments in parity", () => {
    expect(keys(messages.es)).toEqual(keys(messages.en));
    for (const [namespace, values] of Object.entries(messages.en))
      for (const [key, value] of Object.entries(values)) {
        const spanish = messages.es[
          namespace as keyof typeof messages.es
        ] as Record<string, string>;
        expect(spanish[key]?.length, `${namespace}.${key}`).toBeGreaterThan(0);
        const args = (text: string) =>
          [...text.matchAll(/\{(\w+)(?:\}|,)/g)]
            .filter(
              (m) =>
                !/(?:zero|one|two|few|many|other|=\d+)\s+$/.test(
                  text.slice(0, m.index),
                ),
            )
            .map((m) => m[1])
            .sort();
        expect(args(spanish[key]!)).toEqual(args(value));
      }
    for (const key of Object.values(ownedCopyKeys))
      expect(keys(messages.en)).toContain(key);
  });
  it("formats every catalog message without ICU or missing-key errors", () => {
    for (const locale of ["es", "en"] as const) {
      const translate = createTranslator({
        locale,
        messages: messages[locale],
        onError: (error) => {
          throw error;
        },
      });
      for (const [namespace, values] of Object.entries(messages[locale]))
        for (const [key, value] of Object.entries(values)) {
          const args = Object.fromEntries(
            [...value.matchAll(/\{(\w+)(?:\}|,)/g)].map((m) => [
              m[1]!,
              [
                "count",
                "included",
                "observed",
                "recent",
                "stale",
                "unavailable",
                "total",
              ].includes(m[1]!)
                ? 2
                : "Synthetic value",
            ]),
          );
          expect(
            translate(`${namespace}.${key}` as MessageKey, args),
          ).toBeTruthy();
        }
    }
  });
  it("supports immediate interpolation and Spanish/English plurals", () => {
    const es = createTranslator({ locale: "es", messages: messages.es }),
      en = createTranslator({ locale: "en", messages: messages.en });
    expect(es("presentation.records", { count: 1 })).toBe("1 registro");
    expect(es("presentation.records", { count: 2 })).toBe("2 registros");
    expect(en("presentation.records", { count: 1 })).toBe("1 record");
    expect(en("presentation.records", { count: 2 })).toBe("2 records");
    expect(es("presentation.connect", { name: "Original Provider" })).toBe(
      "Conectar Original Provider",
    );
  });
  it("formats presentation without changing evidence instants or Madrid timezone", () => {
    expect(new Intl.NumberFormat(formatLocale("es")).format(1234.5)).toBe(
      "1234,5",
    );
    expect(new Intl.NumberFormat(formatLocale("en")).format(1234.5)).toBe(
      "1,234.5",
    );
    const iso = "2026-03-29T01:30:00Z";
    for (const locale of ["es", "en"] as const) {
      const format = createFormatter({
        locale,
        timeZone: UI_TIME_ZONE,
      });
      expect(
        format.dateTime(new Date(iso), {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }),
      ).toBe("03:30");
    }
    expect(iso).toBe("2026-03-29T01:30:00Z");
  });
});
