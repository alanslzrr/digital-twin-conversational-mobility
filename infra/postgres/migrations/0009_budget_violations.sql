-- Preserve received usage even when it violates the grant. Never release its slot.
ALTER TABLE conversation_attempt DROP CONSTRAINT conversation_attempt_state_check;
ALTER TABLE conversation_attempt ADD CONSTRAINT conversation_attempt_state_check
  CHECK (state IN ('reserved','dispatched','settled','unknown','not_sent','violation'));
-- Cache values remain raw reports; violations must not be interpreted as valid settlements.
CREATE OR REPLACE VIEW conversation_budget_report AS
SELECT campaign_id, evaluator_id, session_id, turn_id,
  count(*)::int AS reservations,
  sum(count_requests)::int AS authorized_count_requests,
  sum(inference_requests)::int AS authorized_inference_requests,
  count(*) FILTER (WHERE state='settled')::int AS confirmed_responses,
  count(*) FILTER (WHERE state IN ('reserved','dispatched','unknown','violation'))::int AS unresolved_attempts,
  count(*) FILTER (WHERE purpose='compaction')::int AS compaction_attempts,
  count(DISTINCT (session_id,turn_id,step_index)) FILTER (WHERE purpose='step')::int AS steps,
  sum(counted_input_tokens)::bigint AS counted_input_tokens,
  sum(input_tokens)::bigint AS reported_input_tokens,
  sum(output_tokens)::bigint AS reported_output_tokens,
  sum(cache_read_tokens)::bigint AS reported_cache_read_tokens,
  count(*) FILTER (WHERE state='settled' AND cache_read_tokens IS NULL)::int AS missing_cache_readings,
  sum(CASE WHEN state='not_sent' THEN 0 WHEN state='violation' THEN greatest(input_tokens,reserved_input) ELSE coalesce(input_tokens,reserved_input) END)::bigint AS charged_input_tokens,
  sum(CASE WHEN state='not_sent' THEN 0 WHEN state='violation' THEN greatest(output_tokens,reserved_output) ELSE coalesce(output_tokens,reserved_output) END)::bigint AS charged_output_tokens,
  sum(extract(epoch FROM (finished_at-created_at))*1000)::bigint AS finished_attempt_latency_ms,
  sum(extract(epoch FROM (finished_at-dispatched_at))*1000)::bigint AS dispatched_attempt_latency_ms,
  count(*) FILTER (WHERE state='violation')::int AS budget_violations
FROM conversation_attempt
GROUP BY GROUPING SETS ((campaign_id), (campaign_id,evaluator_id), (campaign_id,evaluator_id,session_id), (campaign_id,evaluator_id,session_id,turn_id));
