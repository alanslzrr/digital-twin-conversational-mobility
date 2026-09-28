import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;
export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  client ??= postgres(url, {
    max: 2,
    connect_timeout: 10,
    idle_timeout: 20,
    prepare: false,
  });
  return client;
}

let weatherClient: ReturnType<typeof postgres> | undefined;
// Same PostgreSQL, only bounded non-transactional weather statements. Isolation
// avoids waiting behind/pipelining into other Core transactions when cancelling.
export function weatherDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  weatherClient ??= postgres(url, {
    max: 2,
    ...{ max_pipeline: 0 }, // Pinned 3.4.9 supports this; never use begin() on this client.
    connect_timeout: 2,
    idle_timeout: 20,
    prepare: false,
    connection: {
      statement_timeout: 1000,
      application_name: "mobility-weather",
    },
  });
  return weatherClient;
}
