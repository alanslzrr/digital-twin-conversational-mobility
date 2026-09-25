-- Disabled by default. Only an explicitly approved operator action enables a campaign.
CREATE TABLE conversation_campaign (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  approval text NOT NULL CHECK (length(approval) > 0),
  expires_at timestamptz NOT NULL,
  input_limit integer NOT NULL CHECK (input_limit BETWEEN 1 AND 100000),
  output_limit integer NOT NULL CHECK (output_limit BETWEEN 1 AND 10000),
  call_limit integer NOT NULL CHECK (call_limit BETWEEN 1 AND 30),
  blocked boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX conversation_one_active ON conversation_campaign ((true)) WHERE enabled;
CREATE TABLE conversation_attempt (
  id uuid PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES conversation_campaign(id),
  evaluator_id uuid NOT NULL REFERENCES evaluator(id),
  session_id text NOT NULL REFERENCES evaluation_session(session_id),
  turn_id text NOT NULL,
  step_index integer NOT NULL CHECK (step_index BETWEEN 0 AND 7),
  purpose text NOT NULL CHECK (purpose IN ('step', 'compaction')),
  state text NOT NULL CHECK (state IN ('reserved', 'dispatched', 'settled', 'unknown', 'not_sent')),
  reserved_input integer NOT NULL CHECK (reserved_input > 0),
  reserved_output integer NOT NULL CHECK (reserved_output > 0),
  counted_input_tokens integer CHECK (counted_input_tokens >= 0),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  cache_read_tokens integer CHECK (cache_read_tokens >= 0),
  count_requests integer NOT NULL DEFAULT 0 CHECK (count_requests BETWEEN 0 AND 1),
  inference_requests integer NOT NULL DEFAULT 0 CHECK (inference_requests BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dispatched_at timestamptz,
  finished_at timestamptz,
  deadline timestamptz NOT NULL
);
CREATE INDEX conversation_attempt_campaign ON conversation_attempt(campaign_id);
CREATE INDEX conversation_attempt_session ON conversation_attempt(session_id, turn_id);

-- Authorized dispatches are an upper bound when a worker crashes before sending.
-- Missing provider usage is reported separately, never coerced to observed zero.
CREATE VIEW conversation_budget_report AS
SELECT campaign_id, evaluator_id, session_id, turn_id,
  count(*)::int AS reservations,
  sum(count_requests)::int AS authorized_count_requests,
  sum(inference_requests)::int AS authorized_inference_requests,
  count(*) FILTER (WHERE state='settled')::int AS confirmed_responses,
  count(*) FILTER (WHERE state IN ('reserved','dispatched','unknown'))::int AS unresolved_attempts,
  count(*) FILTER (WHERE purpose='compaction')::int AS compaction_attempts,
  count(DISTINCT (session_id,turn_id,step_index)) FILTER (WHERE purpose='step')::int AS steps,
  sum(counted_input_tokens)::bigint AS counted_input_tokens,
  sum(input_tokens)::bigint AS reported_input_tokens,
  sum(output_tokens)::bigint AS reported_output_tokens,
  sum(cache_read_tokens)::bigint AS reported_cache_read_tokens,
  count(*) FILTER (WHERE state='settled' AND cache_read_tokens IS NULL)::int AS missing_cache_readings,
  sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(input_tokens,reserved_input) END)::bigint AS charged_input_tokens,
  sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(output_tokens,reserved_output) END)::bigint AS charged_output_tokens,
  sum(extract(epoch FROM (finished_at-created_at))*1000)::bigint AS finished_attempt_latency_ms,
  sum(extract(epoch FROM (finished_at-dispatched_at))*1000)::bigint AS dispatched_attempt_latency_ms
FROM conversation_attempt
GROUP BY GROUPING SETS ((campaign_id), (campaign_id,evaluator_id), (campaign_id,evaluator_id,session_id), (campaign_id,evaluator_id,session_id,turn_id));
