import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type postgres from "postgres";
import { database } from "../database";

export type ControlSql = ReturnType<typeof database> | postgres.TransactionSql;
export interface SecretStore {
  put(value: string, purpose: string, sql?: ControlSql): Promise<string>;
  read(id: string, purpose: string): Promise<string>;
  remove(id: string, sql?: ControlSql): Promise<void>;
}
export function seal(value: string, purpose: string, key: Buffer) {
  if (key.length !== 32)
    throw new Error("Invalid secret encryption configuration");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function unseal(value: string, purpose: string, key: Buffer) {
  const data = Buffer.from(value, "base64url");
  if (key.length !== 32 || data.length < 29)
    throw new Error("Invalid encrypted secret");
  const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  cipher.setAAD(Buffer.from(purpose));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
async function masterKey() {
  const path = process.env.MOBAI_SECRET_KEY_FILE;
  if (!path?.startsWith("/")) throw new Error("Secret key file required");
  const info = await stat(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error("Secret key file must be private");
  const key = Buffer.from((await readFile(path, "utf8")).trim(), "base64");
  if (key.length !== 32)
    throw new Error("Invalid secret encryption configuration");
  return key;
}
export const secretStore: SecretStore = {
  async put(value, purpose, sql = database()) {
    const id = randomUUID();
    const ciphertext = seal(value, `${id}:${purpose}`, await masterKey());
    await sql`INSERT INTO secret_value(id,key_id,ciphertext) VALUES(${id},'local-v1',${ciphertext})`;
    return id;
  },
  async read(id, purpose) {
    const [row] =
      await database()`SELECT key_id,ciphertext FROM secret_value WHERE id=${id}`;
    if (row?.key_id !== "local-v1") throw new Error("Secret unavailable");
    return unseal(row.ciphertext, `${id}:${purpose}`, await masterKey());
  },
  async remove(id, sql = database()) {
    await sql`DELETE FROM secret_value WHERE id=${id}`;
  },
};
export async function secretFingerprint(value: string) {
  return createHmac("sha256", await masterKey())
    .update(value)
    .digest("hex")
    .slice(0, 12);
}
