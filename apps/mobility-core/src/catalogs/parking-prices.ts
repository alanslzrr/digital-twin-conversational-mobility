import { createHash } from "node:crypto";
import { parkingTariffSchema } from "@mobility/contracts";
import { z } from "zod";

// Explicit municipal IDs matched to the EMT directory on 2026-10-01.
// Do not extend general rates to another operator, aliases or special tariffs.
const data = {
  tariffs: [
    {
      id: "general",
      vehicleType: "car",
      currency: "EUR",
      vatIncluded: true,
      vatPercent: 21,
      source:
        "https://www.emtmadrid.es/getattachment/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos/TGen-v2.png.aspx",
      checkedAt: "2026-10-01",
      effectiveFrom: "2026-01-01",
      referenceYear: 2026,
      referenceYearBasis: "published_effective_date",
      bands: [
        {
          fromMinute: 1,
          toMinute: 30,
          rateUnitsPerMinute: 513,
        },
        {
          fromMinute: 31,
          toMinute: 90,
          rateUnitsPerMinute: 464,
        },
        {
          fromMinute: 91,
          toMinute: 660,
          rateUnitsPerMinute: 615,
        },
      ],
      maximum: {
        durationMinutes: 1440,
        amountCents: 3935,
      },
      examples: [
        {
          durationMinutes: 30,
          amountCents: 150,
        },
        {
          durationMinutes: 60,
          amountCents: 290,
        },
        {
          durationMinutes: 90,
          amountCents: 430,
        },
        {
          durationMinutes: 120,
          amountCents: 615,
        },
        {
          durationMinutes: 180,
          amountCents: 985,
        },
        {
          durationMinutes: 240,
          amountCents: 1350,
        },
        {
          durationMinutes: 300,
          amountCents: 1720,
        },
        {
          durationMinutes: 360,
          amountCents: 2090,
        },
        {
          durationMinutes: 420,
          amountCents: 2460,
        },
        {
          durationMinutes: 660,
          amountCents: 3935,
        },
      ],
      conditions: [
        "Turismos, uso rotacional; no incluye abonos ni bonificaciones no acreditadas.",
      ],
      flatBand: {
        fromMinute: 661,
        toMinute: 1440,
        amountCents: 3935,
      },
    },
    {
      id: "orense",
      vehicleType: "car",
      currency: "EUR",
      vatIncluded: true,
      vatPercent: 21,
      source:
        "https://www.emtmadrid.es/getattachment/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos/DS-18.png.aspx",
      checkedAt: "2026-10-01",
      effectiveFrom: "2026-01-01",
      referenceYear: 2026,
      referenceYearBasis: "published_effective_date",
      bands: [
        {
          fromMinute: 1,
          toMinute: 30,
          rateUnitsPerMinute: 513,
        },
        {
          fromMinute: 31,
          toMinute: 90,
          rateUnitsPerMinute: 464,
        },
        {
          fromMinute: 91,
          toMinute: 222,
          rateUnitsPerMinute: 615,
        },
      ],
      maximum: {
        durationMinutes: 1440,
        amountCents: 1800,
      },
      examples: [
        {
          durationMinutes: 30,
          amountCents: 150,
        },
        {
          durationMinutes: 60,
          amountCents: 290,
        },
        {
          durationMinutes: 90,
          amountCents: 430,
        },
        {
          durationMinutes: 120,
          amountCents: 615,
        },
        {
          durationMinutes: 180,
          amountCents: 985,
        },
      ],
      conditions: [
        "Turismos, uso rotacional; no incluye abonos ni bonificaciones no acreditadas.",
      ],
    },
    {
      id: "portugal",
      vehicleType: "car",
      currency: "EUR",
      vatIncluded: true,
      vatPercent: 21,
      source:
        "https://www.emtmadrid.es/getattachment/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos/DS-20.png.aspx",
      checkedAt: "2026-10-01",
      effectiveFrom: null,
      referenceYear: 2026,
      referenceYearBasis: "checked_year",
      bands: [
        {
          fromMinute: 1,
          toMinute: 30,
          rateUnitsPerMinute: 513,
        },
        {
          fromMinute: 31,
          toMinute: 90,
          rateUnitsPerMinute: 464,
        },
        {
          fromMinute: 91,
          toMinute: 222,
          rateUnitsPerMinute: 615,
        },
      ],
      maximum: {
        durationMinutes: 1440,
        amountCents: 2000,
      },
      examples: [
        {
          durationMinutes: 30,
          amountCents: 150,
        },
        {
          durationMinutes: 60,
          amountCents: 290,
        },
        {
          durationMinutes: 90,
          amountCents: 430,
        },
        {
          durationMinutes: 120,
          amountCents: 615,
        },
        {
          durationMinutes: 180,
          amountCents: 985,
        },
      ],
      conditions: [
        "Turismos, uso rotacional; no incluye abonos ni bonificaciones no acreditadas.",
      ],
      parkAndRide: {
        minimumMinutes: 300,
        maximumMinutes: 960,
        source:
          "https://www.emtmadrid.es/Bloques-EMT/EMT-Parking/Disuasorios/Condiciones-de-utilizacion?lang=es-ES",
        conditions: [
          "Usar transporte público colectivo durante la estancia.",
          "Al retirar el vehículo, presentar en control el tique de aparcamiento y el título de transporte utilizado ese día.",
        ],
      },
    },
    {
      id: "recuerdo",
      vehicleType: "car",
      currency: "EUR",
      vatIncluded: true,
      vatPercent: 21,
      source:
        "https://www.emtmadrid.es/getattachment/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos/DS-25.png.aspx",
      checkedAt: "2026-10-01",
      effectiveFrom: null,
      referenceYear: 2026,
      referenceYearBasis: "checked_year",
      bands: [
        {
          fromMinute: 1,
          toMinute: 30,
          rateUnitsPerMinute: 513,
        },
        {
          fromMinute: 31,
          toMinute: 90,
          rateUnitsPerMinute: 464,
        },
        {
          fromMinute: 91,
          toMinute: 222,
          rateUnitsPerMinute: 615,
        },
      ],
      maximum: {
        durationMinutes: 1440,
        amountCents: 2500,
      },
      examples: [
        {
          durationMinutes: 30,
          amountCents: 150,
        },
        {
          durationMinutes: 60,
          amountCents: 290,
        },
        {
          durationMinutes: 90,
          amountCents: 430,
        },
        {
          durationMinutes: 120,
          amountCents: 615,
        },
        {
          durationMinutes: 180,
          amountCents: 985,
        },
      ],
      conditions: [
        "Turismos, uso rotacional; no incluye abonos ni bonificaciones no acreditadas.",
      ],
      parkAndRide: {
        minimumMinutes: 300,
        maximumMinutes: 960,
        source:
          "https://www.emtmadrid.es/Bloques-EMT/EMT-Parking/Disuasorios/Condiciones-de-utilizacion?lang=es-ES",
        conditions: [
          "Usar transporte público colectivo durante la estancia.",
          "Al retirar el vehículo, presentar en control el tique de aparcamiento y el título de transporte utilizado ese día.",
        ],
      },
    },
    {
      id: "fuente-mora",
      vehicleType: "car",
      currency: "EUR",
      vatIncluded: true,
      vatPercent: 21,
      source:
        "https://www.emtmadrid.es/getattachment/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos/DS-15.png.aspx",
      checkedAt: "2026-10-01",
      effectiveFrom: null,
      referenceYear: 2026,
      referenceYearBasis: "checked_year",
      bands: [
        {
          fromMinute: 1,
          toMinute: 30,
          rateUnitsPerMinute: 513,
        },
        {
          fromMinute: 31,
          toMinute: 90,
          rateUnitsPerMinute: 464,
        },
        {
          fromMinute: 91,
          toMinute: 222,
          rateUnitsPerMinute: 615,
        },
      ],
      maximum: {
        durationMinutes: 1440,
        amountCents: 1500,
      },
      examples: [
        {
          durationMinutes: 30,
          amountCents: 150,
        },
        {
          durationMinutes: 60,
          amountCents: 290,
        },
        {
          durationMinutes: 90,
          amountCents: 430,
        },
        {
          durationMinutes: 120,
          amountCents: 615,
        },
        {
          durationMinutes: 180,
          amountCents: 985,
        },
      ],
      conditions: [
        "Turismos, uso rotacional; no incluye abonos ni bonificaciones no acreditadas.",
      ],
      parkAndRide: {
        minimumMinutes: 300,
        maximumMinutes: 960,
        source:
          "https://www.emtmadrid.es/Bloques-EMT/EMT-Parking/Disuasorios/Condiciones-de-utilizacion?lang=es-ES",
        conditions: [
          "Usar transporte público colectivo durante la estancia.",
          "Al retirar el vehículo, presentar en control el tique de aparcamiento y el título de transporte utilizado ese día.",
        ],
      },
    },
    {
      id: "pitis-campaign",
      vehicleType: "car",
      currency: "EUR",
      vatIncluded: null,
      vatPercent: null,
      source:
        "https://www.emtmadrid.es/Bloques-EMT/EMT-Parking/Disuasorios/Nuestros-aparcamientos-disuasorios?lang=es-ES",
      checkedAt: "2026-10-01",
      effectiveFrom: null,
      referenceYear: 2026,
      referenceYearBasis: "checked_year",
      bands: [
        {
          fromMinute: 1,
          toMinute: 1440,
          rateUnitsPerMinute: 0,
        },
      ],
      maximum: {
        durationMinutes: 1440,
        amountCents: 0,
      },
      examples: [],
      conditions: [
        "Campaña de gratuidad Pitis: EMT publica actualmente cualquier estancia gratuita. No publica una fecha de finalización; referencia comprobada el 01/10/2026.",
      ],
    },
  ],
  parkings: [
    {
      id: "5",
      name: "Nuestra Señora del Recuerdo",
      address: "Calle de la Hiedra",
      latitude: 40.472181,
      longitude: -3.67916,
      tariffId: "recuerdo",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "7",
      name: "Avenida de Portugal",
      address: "Avda. de Portugal, s/n. Frente al nº 51",
      latitude: 40.415415,
      longitude: -3.727515,
      tariffId: "portugal",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "9",
      name: "Paseo de Recoletos",
      address: "Paseo Recoletos",
      latitude: 40.421191,
      longitude: -3.691953,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "12",
      name: "Almagro",
      address: "Almagro",
      latitude: 40.429801,
      longitude: -3.693238,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "15",
      name: "Jacinto Benavente",
      address: "Plaza J. Benavente",
      latitude: 40.414267,
      longitude: -3.703448,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
      operatingNote:
        "El directorio EMT indica cerrado por obras; la tarifa no acredita acceso ni apertura.",
    },
    {
      id: "22",
      name: "Orense",
      address: "Avda. General Perón",
      latitude: 40.453019,
      longitude: -3.694009,
      tariffId: "orense",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "25",
      name: "Marqués de Salamanca",
      address: "Plaza M. Salamanca",
      latitude: 40.430293,
      longitude: -3.679197,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "53",
      name: "Plaza de España",
      address: "Plaza de España",
      latitude: 40.423636,
      longitude: -3.711583,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "67",
      name: "Villa de París",
      address: "Plaza Villa de París",
      latitude: 40.425848,
      longitude: -3.693658,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "71",
      name: "Pedro Zerolo",
      address: "Plaza Pedro Zerolo",
      latitude: 40.42080587,
      longitude: -3.699301,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "84",
      name: "Plaza Mayor",
      address: "Plaza Mayor s/n",
      latitude: 40.4200305,
      longitude: -3.6963131,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "99",
      name: "Olavide",
      address: "Pl. Olavide",
      latitude: 40.431717,
      longitude: -3.700565,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "100",
      name: "Fuencarral",
      address: "Cl. Fuencarral",
      latitude: 40.43009,
      longitude: -3.702953,
      tariffId: "general",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "102",
      name: "Pitis",
      address: "Calle Gloria Fuertes",
      latitude: 40.495468,
      longitude: -3.725125,
      tariffId: "pitis-campaign",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
    },
    {
      id: "103",
      name: "FuenteMora",
      address: "Calle Dulce Chacon",
      latitude: 40.484881,
      longitude: -3.666177,
      tariffId: "fuente-mora",
      identitySource:
        "https://www.emtmadrid.es/Bloques-EMT-Contenido/EMT-Aparcamientos/Publicos.aspx?lang=es-ES",
      identityEvidence:
        "Nombre y dirección corresponden al directorio EMT, no asignación por proximidad.",
      aliases: ["Fuente de la Mora"],
    },
  ],
} as const;

const identitySchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  address: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  tariffId: z.string(),
  identitySource: z.url(),
  identityEvidence: z.string(),
  aliases: z.array(z.string()).optional(),
  operatingNote: z.string().optional(),
});
export const parkingPrices = z
  .object({
    tariffs: z.array(parkingTariffSchema),
    parkings: z.array(identitySchema),
  })
  .parse(data);

const ids = new Set(parkingPrices.parkings.map((p) => p.id));
const tariffIds = new Set(parkingPrices.tariffs.map((t) => t.id));
if (
  ids.size !== parkingPrices.parkings.length ||
  tariffIds.size !== parkingPrices.tariffs.length ||
  parkingPrices.parkings.some((p) => !tariffIds.has(p.tariffId))
)
  throw new Error("invalid_parking_tariff_mapping");
for (const tariff of parkingPrices.tariffs) {
  let end = 0;
  for (const band of tariff.bands) {
    if (band.fromMinute <= end || band.fromMinute > band.toMinute)
      throw new Error("invalid_parking_tariff_bands");
    end = band.toMinute;
  }
  if (
    tariff.flatBand &&
    (tariff.flatBand.fromMinute <= end ||
      tariff.flatBand.fromMinute > tariff.flatBand.toMinute)
  )
    throw new Error("invalid_parking_flat_band");
  if (
    new Set(tariff.examples.map((e) => e.durationMinutes)).size !==
      tariff.examples.length ||
    tariff.examples.some((e) => e.amountCents > tariff.maximum.amountCents)
  )
    throw new Error("invalid_parking_tariff_examples");
}
export const parkingPriceVersion = `sha256:${createHash("sha256").update(JSON.stringify(parkingPrices)).digest("hex")}`;
