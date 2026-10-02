import { getAuth } from "../better-auth";
import { database } from "../database";

export type DashboardIdentity = { evaluatorId: string };
export class DashboardAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

// This requires the forwarded Better Auth cookie, not a principal supplied by UI.
// The route must additionally authorize its own service JWT/scope.
export async function readDashboardIdentity(
  headers: Headers,
): Promise<DashboardIdentity> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) throw new DashboardAccessError(401, "authentication_required");
  const [row] = await database()`
    SELECT id FROM evaluator
    WHERE auth_user_id=${session.user.id} AND enabled AND expires_at > now()`;
  if (!row) throw new DashboardAccessError(401, "evaluator_not_active");
  return { evaluatorId: String(row.id) };
}

// Runtime writes don't have a browser cookie. Ownership is verified in the same
// SQL statement and only after a valid telemetry service JWT has been checked.
export async function requireTraceOwnership(
  evaluatorId: string,
  sessionId: string,
) {
  const [row] = await database()`
    SELECT s.session_id FROM evaluation_session s
    JOIN evaluator e ON e.id=s.evaluator_id
    WHERE s.session_id=${sessionId} AND e.id=${evaluatorId}
      AND e.enabled AND e.expires_at > now()
      AND s.revoked_at IS NULL AND s.expires_at > now()`;
  if (!row) throw new DashboardAccessError(404, "not_found");
}
