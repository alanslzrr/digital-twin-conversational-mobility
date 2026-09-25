import { z } from "zod";
import { fetchText } from "./common.ts";

let cached: { token: string; expires: number } | undefined;
async function accessToken() {
  if (cached && cached.expires > Date.now()) return cached.token;
  const client = process.env.EMT_CLIENT_ID;
  const key = process.env.EMT_PASSKEY;
  if (!client || !key) throw new Error("emt_credentials_missing");
  const body = JSON.parse(
    await fetchText(
      "https://openapi.emtmadrid.es/v2/mobilitylabs/user/login/",
      "application/json",
      { headers: { "X-ClientId": client, passKey: key } },
    ),
  );
  const parsed = z
    .object({
      code: z.enum(["00", "01"]),
      data: z
        .array(
          z.object({
            accessToken: z.string().min(1),
            tokenSecExpiration: z.coerce.number().positive(),
          }),
        )
        .min(1),
    })
    .safeParse(body);
  if (!parsed.success || !parsed.data.data[0])
    throw new Error("emt_authentication_failed");
  const row = parsed.data.data[0];
  cached = {
    token: row.accessToken,
    expires:
      Date.now() +
      Math.max(0, Math.min(row.tokenSecExpiration, 3600) - 60) * 1000,
  };
  return cached.token;
}

export async function emtRequest(path: string, body?: unknown) {
  try {
    const raw = await fetchText(
      `https://openapi.emtmadrid.es${path}`,
      "application/json",
      {
        headers: {
          accessToken: await accessToken(),
          "Content-Type": "application/json",
        },
        ...(body === undefined
          ? {}
          : { method: "POST", body: JSON.stringify(body) }),
      },
    );
    if (JSON.parse(raw)?.code !== "00") throw new Error("emt_data_unavailable");
    return raw;
  } catch (error) {
    cached = undefined;
    throw error;
  }
}
