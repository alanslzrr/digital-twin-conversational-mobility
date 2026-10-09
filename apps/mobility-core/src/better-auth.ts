import { type BetterAuthOptions, betterAuth } from "better-auth";
import { admin, twoFactor } from "better-auth/plugins";
import { defaultAc } from "better-auth/plugins/admin/access";
import { Pool } from "pg";
import { queueAccountMail } from "./control/mail";

export function authOptions(
  pool: Pool,
  secret: string,
  baseURL: string,
  allowSignUp = false,
) {
  return {
    appName: "mobai",
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
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        await queueAccountMail(user.id, user.email, url, token);
      },
      onPasswordReset: async ({ user }) => {
        await pool.query(
          "UPDATE evaluator SET account_state='active' WHERE auth_user_id=$1 AND enabled AND expires_at>now() AND (account_state='active' OR invitation_expires_at>now())",
          [user.id],
        );
        await pool.query(
          'UPDATE auth_user SET "emailVerified"=true WHERE id=$1',
          [user.id],
        );
      },
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
      max: 300,
      customRules: { "/sign-in/email": { window: 60, max: 60 } },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: baseURL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "strict" },
      // Global proxy bucket; per-account login/recovery limits are enforced at the route.
      ipAddress: { ipAddressHeaders: ["x-evaluation-client-ip"] },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const result = await pool.query(
              "SELECT 1 FROM evaluator WHERE auth_user_id=$1 AND enabled AND expires_at > now() AND account_state='active'",
              [session.userId],
            );
            return result.rows.length ? { data: session } : false;
          },
        },
      },
    },
    plugins: [
      admin({
        defaultRole: "evaluator",
        adminRoles: ["admin"],
        roles: {
          admin: defaultAc.newRole({
            user: ["create", "set-role"],
            session: [],
          }),
          evaluator: defaultAc.newRole({ user: [], session: [] }),
        },
      }),
      twoFactor({
        issuer: "mobai",
        skipVerificationOnEnable: false,
        schema: { twoFactor: { modelName: "auth_two_factor" } },
        backupCodeOptions: { storeBackupCodes: "encrypted" },
      }),
    ],
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

function createAuth() {
  const url = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const origin = process.env.EVALUATION_ORIGIN;
  if (!url || !secret || Buffer.byteLength(secret) < 32 || !origin)
    throw new Error("Better Auth is not configured");
  return betterAuth(
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
}
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  auth ??= createAuth();
  return auth;
}
