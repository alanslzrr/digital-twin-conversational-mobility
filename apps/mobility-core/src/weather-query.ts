import type { PendingQuery, Row } from "postgres";

// Cancel queued as well as executing queries: a pool wait must not outlive the
// route's weather budget. Await the query's terminal state; no detached DB work.
export async function weatherQuery<T extends Row[]>(
  query: PendingQuery<T>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const abort = () => {
    query.cancel();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await query;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
