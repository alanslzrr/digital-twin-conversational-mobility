import type { TurnBinding } from "@mobility/contracts";
import { database } from "../database";

/** Request-scoped best-effort cancellation, including revocations made on another Core instance.
 * This is not a recurring worker: it exists only for one admitted HTTP request, at most 60 seconds.
 */
export function watchRevocation(
  binding: TurnBinding,
  deadline: number,
  parent: AbortSignal,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined,
    closed = false;
  const close = () => {
    closed = true;
    if (timer) clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  };
  const abort = () => {
    controller.abort();
    close();
  };
  const tick = async () => {
    if (closed) return;
    if (Date.now() >= deadline) {
      abort();
      return;
    }
    try {
      const [row] =
        await database()`SELECT c.id FROM llm_credential c JOIN evaluator e ON e.id=${binding.principalId}
        JOIN auth_user u ON u.id=e.auth_user_id JOIN evaluation_session s ON s.session_id=${binding.sessionId} AND s.evaluator_id=e.id
        JOIN llm_provider p ON p.id=c.provider_id JOIN llm_model m ON m.id=${binding.model.id}
        WHERE c.id=${binding.credentialId} AND c.version=${binding.credentialVersion} AND c.enabled AND c.deleted_at IS NULL
        AND e.enabled AND e.account_state='active' AND e.expires_at>now() AND NOT u.banned AND s.revoked_at IS NULL AND s.expires_at>now() AND p.enabled AND m.enabled
        AND (${binding.grantId}::uuid IS NULL OR EXISTS(SELECT 1 FROM llm_grant g JOIN llm_pool p ON p.id=g.pool_id
          WHERE g.id=${binding.grantId} AND g.user_id=e.id AND g.enabled AND p.enabled AND g.expires_at>now() AND p.expires_at>now() AND m.id=ANY(g.model_ids)))`;
      if (!row) {
        abort();
        return;
      }
    } catch {
      abort();
      return;
    }
    if (!closed) {
      timer = setTimeout(tick, 1000);
      timer.unref();
    }
  };
  if (parent.aborted) abort();
  else {
    parent.addEventListener("abort", abort, { once: true });
    timer = setTimeout(tick, 1000);
    timer.unref();
  }
  return { signal: controller.signal, close };
}
