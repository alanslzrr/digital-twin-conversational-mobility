import type {
  ConversationPage,
  conversationListAction,
} from "@mobility/contracts";
import type { z } from "zod";
import { database } from "./database";

export async function listConversations(
  input: z.infer<typeof conversationListAction>,
) {
  const sql = database();
  // Cast cursor through text to bypass postgres.js Date serialization (millisecond precision).
  // Single statement: active evaluator and session visibility share one snapshot.
  const rows = await sql`
    SELECT s.session_id, s.created_at, s.expires_at FROM evaluator e
    LEFT JOIN LATERAL (
      SELECT session_id,
        to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
        to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires_at
      FROM evaluation_session
      WHERE evaluator_id=e.id AND revoked_at IS NULL AND expires_at > now()
        AND (${input.cursor?.createdAt ?? null}::text::timestamptz IS NULL OR
          (created_at,session_id) < (${input.cursor?.createdAt ?? null}::text::timestamptz,${input.cursor?.sessionId ?? null}))
      ORDER BY created_at DESC,session_id DESC LIMIT 21
    ) s ON true
    WHERE e.id=${input.principalId} AND e.enabled AND e.expires_at > now()
    ORDER BY s.created_at DESC,s.session_id DESC`;
  if (!rows.length)
    return { status: 401, body: { error: "evaluator_not_active" } };
  const visible = rows.filter((row) => row.session_id !== null);
  const sessions = visible.slice(0, 20).map((row) => ({
    sessionId: String(row.session_id),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  }));
  const last = sessions.at(-1);
  const body: ConversationPage = {
    sessions,
    nextCursor:
      visible.length > 20 && last
        ? { createdAt: last.createdAt, sessionId: last.sessionId }
        : null,
  };
  return { status: 200, body };
}
