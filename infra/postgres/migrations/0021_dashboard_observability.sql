-- Additive observability only. Mobility snapshots, EVE messages and auth are unchanged.
CREATE TABLE operational_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 1 AND 160),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  component text NOT NULL,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','error')),
  source_id text,
  job_id text,
  resource_id text,
  operation_id text NOT NULL,
  outcome text NOT NULL,
  error_code text,
  error_stage text,
  duration_ms double precision CHECK (duration_ms >= 0 AND duration_ms < 'Infinity'::float8),
  attempt integer CHECK (attempt >= 0),
  next_eligible_at timestamptz,
  -- Closed numeric counters; no arbitrary error text or private arguments.
  acquired_count integer CHECK (acquired_count >= 0),
  published_count integer CHECK (published_count >= 0),
  CHECK (expires_at <= recorded_at + interval '7 days')
);
CREATE INDEX operational_event_time_idx ON operational_event(occurred_at DESC,id DESC);
CREATE INDEX operational_event_source_time_idx ON operational_event(source_id,occurred_at DESC,id DESC);
CREATE INDEX operational_event_expiry_idx ON operational_event(expires_at,id);

CREATE TABLE conversation_observability (
  session_id text PRIMARY KEY REFERENCES evaluation_session(session_id) ON DELETE CASCADE,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  capture_started_at timestamptz NOT NULL,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  retained_bytes bigint NOT NULL DEFAULT 0 CHECK (retained_bytes BETWEEN 0 AND 16777216),
  event_count integer NOT NULL DEFAULT 0 CHECK (event_count BETWEEN 0 AND 10000),
  omitted_events bigint NOT NULL DEFAULT 0 CHECK (omitted_events >= 0),
  known_gaps bigint NOT NULL DEFAULT 0 CHECK (known_gaps >= 0),
  coverage text NOT NULL DEFAULT 'best_effort' CHECK (coverage IN ('best_effort','partial')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (last_observed_at >= first_observed_at),
  CHECK (expires_at <= capture_started_at + interval '7 days')
);
CREATE INDEX conversation_observability_expiry_idx ON conversation_observability(expires_at,session_id);

CREATE TABLE conversation_trace_payload (
  id uuid PRIMARY KEY,
  session_id text NOT NULL REFERENCES conversation_observability(session_id) ON DELETE CASCADE,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('model_input','model_output','tool_input','tool_output')),
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  original_bytes bigint NOT NULL CHECK (original_bytes >= 0),
  retained_bytes integer NOT NULL CHECK (retained_bytes BETWEEN 0 AND 512000),
  redacted boolean NOT NULL,
  truncated boolean NOT NULL,
  capture_status text NOT NULL CHECK (capture_status IN ('captured','partial','missing','omitted')),
  reason text,
  captured_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (session_id,id),
  UNIQUE (session_id,content_hash,kind),
  CHECK (retained_bytes <= original_bytes),
  CHECK (expires_at <= captured_at + interval '7 days')
);
CREATE INDEX conversation_trace_payload_expiry_idx ON conversation_trace_payload(expires_at,id);

CREATE TABLE conversation_trace_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text NOT NULL REFERENCES conversation_observability(session_id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 160),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  turn_id text,
  step_index integer CHECK (step_index >= 0),
  sequence bigint NOT NULL CHECK (sequence >= 0),
  purpose text CHECK (purpose IN ('step','compaction')),
  attempt_id uuid,
  call_id text,
  tool text,
  provider_response_id text,
  status text NOT NULL CHECK (status IN ('prepared','running','succeeded','incomplete','failed','cancelled','rejected','unknown')),
  duration_ms double precision CHECK (duration_ms >= 0 AND duration_ms < 'Infinity'::float8),
  is_error boolean,
  error_code text,
  input_tokens bigint CHECK (input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens >= 0),
  cached_input_tokens bigint CHECK (cached_input_tokens >= 0),
  reasoning_tokens bigint CHECK (reasoning_tokens >= 0),
  payload_1 uuid,
  payload_2 uuid,
  payload_3 uuid,
  payload_4 uuid,
  capture_status text NOT NULL CHECK (capture_status IN ('captured','partial','missing','omitted')),
  sent_call_ids text[] NOT NULL DEFAULT '{}',
  UNIQUE (session_id,event_key),
  -- Composite FKs prevent accidentally linking another session's blob.
  FOREIGN KEY (session_id,payload_1) REFERENCES conversation_trace_payload(session_id,id),
  FOREIGN KEY (session_id,payload_2) REFERENCES conversation_trace_payload(session_id,id),
  FOREIGN KEY (session_id,payload_3) REFERENCES conversation_trace_payload(session_id,id),
  FOREIGN KEY (session_id,payload_4) REFERENCES conversation_trace_payload(session_id,id),
  CHECK (cached_input_tokens IS NULL OR input_tokens IS NULL OR cached_input_tokens <= input_tokens),
  CHECK (cardinality(sent_call_ids) <= 128),
  CHECK (expires_at <= occurred_at + interval '7 days')
);
CREATE INDEX conversation_trace_event_time_idx ON conversation_trace_event(session_id,occurred_at,id);
CREATE INDEX conversation_trace_event_turn_idx ON conversation_trace_event(session_id,turn_id,id);
CREATE INDEX conversation_trace_event_attempt_idx ON conversation_trace_event(session_id,attempt_id,id);
CREATE INDEX conversation_trace_event_call_idx ON conversation_trace_event(session_id,call_id,id);
CREATE INDEX conversation_trace_event_expiry_idx ON conversation_trace_event(expires_at,id);

CREATE TABLE dashboard_tool_execution (
  id uuid PRIMARY KEY,
  evaluator_id uuid NOT NULL REFERENCES evaluator(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  tool text NOT NULL,
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  result jsonb,
  state text NOT NULL CHECK (state IN ('running','succeeded','failed','cancelled','outcome_unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  deadline_at timestamptz NOT NULL,
  lease_until timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  retained_bytes integer NOT NULL DEFAULT 0 CHECK (retained_bytes BETWEEN 0 AND 264192),
  reserved_bytes integer NOT NULL DEFAULT 0 CHECK (reserved_bytes BETWEEN 0 AND 264192),
  truncated boolean NOT NULL DEFAULT false,
  error_code text,
  UNIQUE (evaluator_id,request_id),
  CHECK (deadline_at <= created_at + interval '60 seconds'),
  CHECK (lease_until <= created_at + interval '70 seconds'),
  CHECK (lease_until >= deadline_at),
  CHECK (expires_at <= created_at + interval '7 days')
);
-- Expired running reservations must be terminalized in the next reservation POST.
-- A GET never updates state or starts a tool.
CREATE UNIQUE INDEX dashboard_execution_running_idx ON dashboard_tool_execution(evaluator_id) WHERE state = 'running';
CREATE INDEX dashboard_execution_owner_time_idx ON dashboard_tool_execution(evaluator_id,created_at DESC,id);
CREATE INDEX dashboard_execution_expiry_idx ON dashboard_tool_execution(expires_at,id);

CREATE TABLE dashboard_rate_window (
  evaluator_id uuid NOT NULL REFERENCES evaluator(id) ON DELETE CASCADE,
  rate_class text NOT NULL CHECK (rate_class IN ('read','execute','activity')),
  window_kind text NOT NULL CHECK (window_kind IN ('minute','day')),
  window_start timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (evaluator_id,rate_class,window_kind,window_start)
);
CREATE INDEX dashboard_rate_window_expiry_idx ON dashboard_rate_window(expires_at);

-- Only these rows, not evaluator/evaluation_usage, are locked for observability.
CREATE TABLE observability_quota (
  evaluator_id uuid PRIMARY KEY REFERENCES evaluator(id) ON DELETE CASCADE,
  retained_bytes bigint NOT NULL DEFAULT 0 CHECK (retained_bytes BETWEEN 0 AND 268435456),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes BETWEEN 0 AND 268435456),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (retained_bytes + reserved_bytes <= 268435456)
);
