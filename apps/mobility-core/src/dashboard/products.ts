import { jobPolicies } from "@mobility/domain";
export const presentationProducts = [
  ...Object.entries(jobPolicies).map(([id, policy]) => ({
    id,
    source: policy.source,
    mode: "periodic" as const,
    category: (
      {
        "renfe-trips": "departures",
        "renfe-alerts": "incidents",
        "emt-alerts": "incidents",
        "dgt-incidents": "incidents",
        bicimad: "bikes",
        "madrid-air": "environment",
        aemet: "environment",
        "madrid-traffic": "traffic",
        "madrid-parking": "parking",
      } as const
    )[id as keyof typeof jobPolicies],
    label: (
      {
        "renfe-trips": "Estimaciones Renfe",
        "renfe-alerts": "Avisos Renfe",
        "emt-alerts": "Avisos EMT",
        "dgt-incidents": "Incidencias DGT",
        bicimad: "Bicicletas BiciMAD",
        "madrid-air": "Calidad del aire",
        aemet: "Observaciones meteorológicas",
        "madrid-traffic": "Sensores de tráfico",
        "madrid-parking": "Ocupación de aparcamientos",
      } as const
    )[id as keyof typeof jobPolicies],
    maxAge: policy.maxAge,
  })),
  {
    id: "emt:arrivals",
    source: "emt",
    mode: "demand" as const,
    category: "departures" as const,
    label: "Llegadas EMT",
    maxAge: 30,
  },
  {
    id: "weather:forecast",
    source: "aemet",
    mode: "demand" as const,
    category: "environment" as const,
    label: "Predicción horaria",
    maxAge: 1800,
  },
  {
    id: "weather:daily",
    source: "aemet",
    mode: "demand" as const,
    category: "environment" as const,
    label: "Predicción diaria",
    maxAge: 1800,
  },
  {
    id: "weather:warnings",
    source: "aemet",
    mode: "demand" as const,
    category: "incidents" as const,
    label: "Avisos meteorológicos",
    maxAge: 300,
  },
];
