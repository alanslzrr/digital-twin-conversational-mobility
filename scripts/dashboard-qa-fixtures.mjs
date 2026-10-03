// Explicit synthetic QA only. Never import this module into product code.
export async function seedDashboardFixtures(sql) {
  const [{ current_schema: schema }] = await sql`SELECT current_schema()`;
  if (!/^dashboard_qa_[a-f0-9]+$/.test(schema))
    throw new Error("Disposable QA schema required");
  const now = new Date(),
    at = (seconds) => new Date(now.getTime() + seconds * 1000).toISOString();
  await sql`UPDATE source_catalog SET enabled=true WHERE id IN ('bicimad','madrid-parking','madrid-traffic','madrid-air','aemet','emt','renfe','dgt')`;
  const [qaPlace] =
    await sql`INSERT INTO canonical_place(name,kind,location) VALUES('QA sintética · lugar guardado','stop',ST_SetSRID(ST_MakePoint(-3.7,40.42),4326)::geography) RETURNING id`;
  await sql`INSERT INTO place_external_identifier(source_id,external_id,namespace,place_id,source_version) VALUES('emt','qa-stop','stop',${qaPlace.id},'synthetic-qa')`;
  await sql`INSERT INTO crtm_feed(dataset_id,version,fetched_at,published_at,service_start,service_end,manifest) VALUES('metro','synthetic-expired',now(),now(),current_date-interval '30 days',current_date-interval '1 day','{}')`;
  await sql`INSERT INTO crtm_stop_identity(dataset_id,external_id) VALUES('metro','qa-stop')`;
  await sql`INSERT INTO crtm_stops(dataset_id,external_id,name,latitude,longitude,location_type,wheelchair) VALUES('metro','qa-stop','QA sintética · horario caducado',40.42,-3.7,0,1)`;
  await sql`INSERT INTO crtm_routes(dataset_id,external_id,agency_id,short_name,long_name,route_type) VALUES('metro','qa-route','qa-agency','QA','Línea sintética publicada',1)`;
  await sql`INSERT INTO crtm_trips(dataset_id,external_id,route_id,service_id,headsign,wheelchair) VALUES('metro','qa-trip','qa-route','qa-calendar','Destino sintético',1)`;
  await sql`INSERT INTO crtm_calendar(dataset_id,service_id,start_date,end_date,weekdays) VALUES('metro','qa-calendar',current_date-interval '30 days',current_date-interval '1 day',ARRAY[1,2,3,4,5])`;
  await sql`INSERT INTO crtm_stop_times(dataset_id,trip_id,sequence,stop_id,arrival_seconds,departure_seconds,pickup_type,drop_off_type,timepoint) VALUES('metro','qa-trip',1,'qa-stop',28800,28860,0,0,1)`;
  const snapshots = [
    {
      job: "dgt-incidents",
      source: "dgt",
      payload: {
        incidents: [
          {
            id: "qa-dgt-nested",
            title: "QA sintética · incidencia DGT con coordenadas publicadas",
            location: {
              type: "point",
              start: { latitude: 40.4, longitude: -3.7 },
              end: null,
            },
            complexValidity: false,
            providerValidity: "active",
            startsAt: at(-3600),
            endsAt: at(3600),
          },
        ],
      },
    },
    {
      job: "bicimad",
      source: "bicimad",
      payload: {
        stations: [
          {
            id: "qa-recent",
            name: "QA sintética · estación reciente",
            latitude: 40.42,
            longitude: -3.7,
            bikes: 4,
            docks: 8,
            installed: true,
            renting: true,
            returning: true,
            observedAt: at(-5),
          },
          {
            id: "qa-old",
            name: "QA sintética · estación antigua",
            latitude: 40.41,
            longitude: -3.71,
            bikes: 9,
            docks: 3,
            installed: true,
            renting: true,
            returning: true,
            observedAt: at(-3600),
          },
          {
            id: "qa-disabled",
            name: "QA sintética · alquiler deshabilitado",
            latitude: 40.43,
            longitude: -3.72,
            bikes: 5,
            docks: 10,
            installed: true,
            renting: false,
            returning: true,
            observedAt: at(-5),
          },
          {
            id: "qa-missing",
            name: "QA sintética · sin observación",
            bikes: 0,
            docks: 0,
            installed: true,
            renting: true,
            returning: true,
          },
        ],
      },
    },
    {
      job: "madrid-parking",
      source: "madrid-parking",
      payload: {
        parkings: [
          {
            id: "qa-parking",
            name: "QA sintética · aparcamiento",
            latitude: 40.4,
            longitude: -3.7,
            availability: [
              {
                category: "a",
                name: "Categoría publicada A",
                freeSpaces: 3,
                observedAt: at(-5),
              },
              {
                category: "b",
                name: "Categoría publicada B",
                freeSpaces: 2,
                observedAt: at(-5),
              },
            ],
          },
        ],
      },
    },
    {
      job: "madrid-traffic",
      source: "madrid-traffic",
      payload: {
        sensors: [
          {
            id: "qa-sensor",
            name: "QA sintética · sensor de tráfico",
            vehiclesPerHour: 120,
            occupancyPercent: 15,
            loadPercent: 20,
            serviceLevel: 1,
          },
        ],
      },
    },
    {
      job: "madrid-air",
      source: "madrid-air",
      payload: {
        readings: [
          {
            stationId: "qa-air",
            name: "NO2",
            value: 12,
            unit: "µg/m³",
            observedAt: at(-3600),
            stationIdentity: {
              name: "QA sintética · aire",
              location: { latitude: 40.41, longitude: -3.69 },
            },
          },
        ],
      },
    },
    {
      job: "emt-alerts",
      source: "emt",
      payload: {
        alerts: [
          {
            id: "qa-notice",
            title: "QA sintética · aviso vigente",
            description:
              "Desvío publicado para validar la ficha, no aviso real.",
            startsAt: at(-3600),
            endsAt: at(3600),
            lines: ["1"],
          },
        ],
      },
    },
  ];
  for (const s of snapshots)
    await sql`INSERT INTO mobility_snapshot(job_id,source_id,observed_at,ingested_at,quality,raw_reference,payload) VALUES(${s.job},${s.source},${at(-5)},${now},'provisional','synthetic-dashboard-qa',${sql.json(s.payload)}) ON CONFLICT(job_id) DO UPDATE SET observed_at=EXCLUDED.observed_at,ingested_at=EXCLUDED.ingested_at,payload=EXCLUDED.payload`;
  await sql`UPDATE ingestion_job SET error_code='synthetic_upstream_error',last_attempt_at=now(),last_finished_at=now() WHERE id='aemet'`;
  for (let i = 0; i < 12; i++) {
    const observedAt = at(-3600 + i * 300);
    await sql`INSERT INTO mobility_history(job_id,observed_at,ingested_at,quality,raw_reference,payload,parser_version) VALUES('bicimad',${observedAt},${at(-3590 + i * 300)},'provisional','synthetic-dashboard-qa',${sql.json({ stations: [{ id: "qa-recent", name: "QA sintética · estación reciente", bikes: i % 5, docks: 12 - (i % 5), observedAt }] })},'qa-fixture')`;
  }
  const forecast = {
    product: "forecast",
    name: "QA sintética · predicción Madrid",
    municipality: "28079",
    issuedAt: at(-600),
    validFrom: at(-3600),
    validTo: at(86400),
    periods: [
      {
        kind: "temperature",
        basis: "instant",
        value: 18,
        unit: "°C",
        period: "12",
        validFrom: at(3600),
        validTo: at(3600),
      },
      {
        kind: "precipitation",
        basis: "interval",
        value: 2,
        unit: "mm",
        period: "12-18",
        validFrom: at(3600),
        validTo: at(21600),
      },
    ],
  };
  await sql`INSERT INTO weather_product(resource,payload,version,issued_at,valid_from,valid_to,fetched_at,checked_at) VALUES('forecast:28079',${sql.json(forecast)},'synthetic-qa',${at(-600)},${at(-3600)},${at(86400)},${now},${now})`;
  for (let i = 0; i < 8; i++)
    await sql`INSERT INTO operational_event(event_key,occurred_at,component,event_type,severity,source_id,job_id,operation_id,outcome,duration_ms,error_code) VALUES(${`qa-operation-${i}`},${at(-7200 + i * 900)},'ingestion','publication',${i === 3 ? "error" : "info"},'bicimad','bicimad',${`qa-op-${i}`},${i === 3 ? "error" : "success"},${10 + i},${i === 3 ? "synthetic_error" : null})`;
}
