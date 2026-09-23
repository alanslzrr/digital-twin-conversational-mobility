import { type BetterAuthOptions, betterAuth } from "better-auth";
import { Pool } from "pg";

export function authOptions(
  pool: Pool,
  secret: string,
  baseURL: string,
  allowSignUp = false,
): BetterAuthOptions {
  return {
    appName: "Madrid Mobility Evaluation",
    database: pool,
    secret,
    baseURL,
    trustedOrigins: [new URL(baseURL).origin],
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      disableSignUp: !allowSignUp,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    user: { modelName: "auth_user" },
    session: {
      modelName: "auth_session",
      expiresIn: 7 * 24 * 3600,
      updateAge: 24 * 3600,
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limit",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 10 } },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: baseURL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "strict" },
      // The authenticated web proxy supplies one fixed bucket for this small demo.
      // Never trust arbitrary client-provided forwarding headers for rate limiting.
      ipAddress: { ipAddressHeaders: ["x-evaluation-client-ip"] },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const result = await pool.query(
              "SELECT 1 FROM evaluator WHERE auth_user_id=$1 AND enabled AND expires_at > now()",
              [session.userId],
            );
            return result.rows.length ? { data: session } : false;
          },
        },
      },
    },
    telemetry: { enabled: false },
  };
}

let auth: ReturnType<typeof betterAuth> | undefined;
export function getAuth() {
  if (auth) return auth;
  const url = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const origin = process.env.EVALUATION_ORIGIN;
  if (!url || !secret || Buffer.byteLength(secret) < 32 || !origin)
    throw new Error("Better Auth is not configured");
  auth = betterAuth(
    authOptions(
      new Pool({
        connectionString: url,
        max: 2,
        idleTimeoutMillis: 20_000,
        connectionTimeoutMillis: 10_000,
      }),
      secret,
      origin,
    ),
  );
  return auth;
}
