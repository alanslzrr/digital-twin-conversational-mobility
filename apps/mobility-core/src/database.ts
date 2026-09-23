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
