// Public HTTPS origins do not select the private listening port.
export function webPort(env = process.env) {
  const origin = new URL(env.EVALUATION_ORIGIN || "http://127.0.0.1:3000");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    origin.hostname,
  );
  const port = Number(env.MOBAI_WEB_PORT || (loopback && origin.port) || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("MOBAI_WEB_PORT must be an unprivileged TCP port");
  return port;
}
