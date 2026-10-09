-- Additive account/LLM control plane. Existing principal and session IDs survive.
ALTER TABLE evaluator DROP CONSTRAINT evaluator_slot_check;
ALTER TABLE evaluator ALTER COLUMN slot DROP NOT NULL;
ALTER TABLE evaluator ADD COLUMN account_state text NOT NULL DEFAULT 'active'
  CHECK (account_state IN ('active','pending'));
ALTER TABLE evaluator ADD COLUMN invitation_expires_at timestamptz;
ALTER TABLE auth_user ADD COLUMN role text NOT NULL DEFAULT 'evaluator' CHECK (role IN ('admin','evaluator'));
ALTER TABLE auth_user ADD COLUMN banned boolean NOT NULL DEFAULT false;
ALTER TABLE auth_user ADD COLUMN "banReason" text;
ALTER TABLE auth_user ADD COLUMN "banExpires" timestamptz;
ALTER TABLE auth_user ADD COLUMN "twoFactorEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE auth_session ADD COLUMN "impersonatedBy" text;
CREATE TABLE auth_two_factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), secret text NOT NULL, "backupCodes" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT true, "failedVerificationCount" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamptz
);
CREATE INDEX auth_two_factor_user_idx ON auth_two_factor("userId");
CREATE TABLE control_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  capacity integer NOT NULL DEFAULT 30 CHECK(capacity BETWEEN 1 AND 500),
  global_concurrency integer NOT NULL DEFAULT 5 CHECK(global_concurrency BETWEEN 1 AND 30),
  user_concurrency integer NOT NULL DEFAULT 1 CHECK(user_concurrency BETWEEN 1 AND 5),
  requests_per_minute integer NOT NULL DEFAULT 6 CHECK(requests_per_minute BETWEEN 1 AND 60),
  requests_per_day integer NOT NULL DEFAULT 60 CHECK(requests_per_day BETWEEN 1 AND 1000),
  input_tokens_per_session integer NOT NULL DEFAULT 100000 CHECK(input_tokens_per_session BETWEEN 1024 AND 1000000),
  output_tokens_per_session integer NOT NULL DEFAULT 10000 CHECK(output_tokens_per_session BETWEEN 256 AND 100000),
  output_tokens_per_call integer NOT NULL DEFAULT 2048 CHECK(output_tokens_per_call BETWEEN 128 AND 32000)
);
INSERT INTO control_settings DEFAULT VALUES;
CREATE TABLE control_mfa (
  session_id uuid PRIMARY KEY REFERENCES auth_session(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE control_reauth (
  session_id uuid PRIMARY KEY REFERENCES auth_session(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES evaluator(id),
  action text NOT NULL, target_id uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX control_audit_created_idx ON control_audit(created_at DESC);
CREATE TABLE control_rate (
  key text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL CHECK(count>0),
  PRIMARY KEY(key,window_start)
);
CREATE TABLE secret_value (
  id uuid PRIMARY KEY, key_id text NOT NULL, ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE llm_provider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO llm_provider(profile) VALUES
 ('{"name":"OpenAI","baseUrl":"https://api.openai.com/v1","protocols":["responses","chat-completions"],"authentication":"bearer","modelList":true}'),
 ('{"name":"OpenRouter","baseUrl":"https://openrouter.ai/api/v1","protocols":["chat-completions"],"authentication":"bearer","modelList":true}'),
 ('{"name":"Vercel AI Gateway","baseUrl":"https://ai-gateway.vercel.sh/v1","protocols":["chat-completions","responses"],"authentication":"bearer","modelList":true}'),
 ('{"name":"DeepSeek","baseUrl":"https://api.deepseek.com/v1","protocols":["chat-completions"],"authentication":"bearer","modelList":true}'),
 ('{"name":"OpenCode Zen","baseUrl":"https://opencode.ai/zen/v1","protocols":["chat-completions","responses"],"authentication":"bearer","modelList":true}'),
 ('{"name":"OpenCode Go","baseUrl":"https://opencode.ai/zen/go/v1","protocols":["chat-completions"],"authentication":"bearer","modelList":false}');
CREATE TABLE llm_model (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES llm_provider(id),
  profile jsonb NOT NULL, version integer NOT NULL CHECK(version>0), enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX llm_model_version_idx ON llm_model(provider_id,(profile->>'modelId'),version);
CREATE TABLE llm_credential (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES llm_provider(id),
  owner_id uuid NOT NULL REFERENCES evaluator(id), alias text NOT NULL,
  origin text NOT NULL CHECK(origin IN ('user','admin')), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  enabled boolean NOT NULL DEFAULT true, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE llm_credential_version (
  credential_id uuid NOT NULL REFERENCES llm_credential(id), version integer NOT NULL,
  secret_id uuid REFERENCES secret_value(id), fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(credential_id,version)
);
CREATE TABLE llm_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), credential_id uuid NOT NULL REFERENCES llm_credential(id),
  name text NOT NULL, budget_micros bigint NOT NULL CHECK(budget_micros>0),
  expires_at timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE llm_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES evaluator(id),
  pool_id uuid NOT NULL REFERENCES llm_pool(id), model_ids uuid[] NOT NULL,
  budget_micros bigint NOT NULL CHECK(budget_micros>0), expires_at timestamptz NOT NULL,
  input_token_limit bigint NOT NULL CHECK(input_token_limit>0), output_token_limit bigint NOT NULL CHECK(output_token_limit>0),
  call_limit integer NOT NULL CHECK(call_limit>0), concurrency_limit integer NOT NULL DEFAULT 1 CHECK(concurrency_limit BETWEEN 1 AND 5), enabled boolean NOT NULL DEFAULT true,
  CHECK(cardinality(model_ids)>0)
);
CREATE TABLE llm_selection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal_id uuid NOT NULL REFERENCES evaluator(id),
  session_id text REFERENCES evaluation_session(session_id), model_id uuid NOT NULL REFERENCES llm_model(id),
  credential_id uuid NOT NULL REFERENCES llm_credential(id), credential_version integer NOT NULL,
  grant_id uuid REFERENCES llm_grant(id), expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  bound_turn_id text, consent_provider_id uuid REFERENCES llm_provider(id),
  initial_session_id text REFERENCES evaluation_session(session_id),
  FOREIGN KEY(credential_id,credential_version) REFERENCES llm_credential_version(credential_id,version)
);
CREATE TABLE llm_preference (
  principal_id uuid PRIMARY KEY REFERENCES evaluator(id), selection jsonb NOT NULL
);
CREATE TABLE llm_turn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal_id uuid NOT NULL REFERENCES evaluator(id),
  session_id text NOT NULL REFERENCES evaluation_session(session_id), turn_id text NOT NULL,
  selection_id uuid NOT NULL REFERENCES llm_selection(id), binding jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','waiting','completed','failed','cancelled')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,turn_id)
);
CREATE INDEX llm_turn_active_idx ON llm_turn(principal_id,status,expires_at);
CREATE TABLE llm_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), binding_id uuid NOT NULL REFERENCES llm_turn(id),
  logical_key text NOT NULL, principal_id uuid NOT NULL REFERENCES evaluator(id),
  session_id text NOT NULL, turn_id text NOT NULL, provider_id uuid NOT NULL REFERENCES llm_provider(id),
  model_id uuid NOT NULL REFERENCES llm_model(id), credential_id uuid NOT NULL REFERENCES llm_credential(id),
  credential_version integer NOT NULL, grant_id uuid REFERENCES llm_grant(id), pool_id uuid REFERENCES llm_pool(id),
  purpose text NOT NULL CHECK(purpose IN ('step','compaction')), request_hash text NOT NULL,
  state text NOT NULL CHECK(state IN ('reserved','dispatched','settled','unknown','not_sent')),
  reserved_micros bigint NOT NULL CHECK(reserved_micros>=0), cost_micros bigint CHECK(cost_micros>=0),
  cost_source text NOT NULL DEFAULT 'unknown' CHECK(cost_source IN ('unknown','provider','rate_card')),
  reserved_input integer NOT NULL CHECK(reserved_input>0), reserved_output integer NOT NULL CHECK(reserved_output>0),
  usage jsonb, price_snapshot jsonb NOT NULL, provider_response_id text,
  error_code text, duration_ms integer, deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE(binding_id,logical_key)
);
CREATE INDEX llm_attempt_grant_idx ON llm_attempt(grant_id);
CREATE INDEX llm_attempt_pool_idx ON llm_attempt(pool_id);
CREATE INDEX llm_attempt_principal_idx ON llm_attempt(principal_id,created_at DESC);
CREATE TABLE llm_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL UNIQUE REFERENCES llm_attempt(id),
  actor_id uuid NOT NULL REFERENCES evaluator(id), cost_micros bigint NOT NULL CHECK(cost_micros>=0),
  note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW llm_accounting AS
  SELECT a.*, COALESCE(r.cost_micros,a.cost_micros) AS accounted_micros,
    CASE WHEN a.state='not_sent' THEN 0
      WHEN r.id IS NOT NULL THEN r.cost_micros
      WHEN a.cost_micros IS NOT NULL THEN a.cost_micros ELSE a.reserved_micros END AS exposure_micros,
    CASE WHEN r.id IS NOT NULL OR a.cost_micros IS NOT NULL OR a.state='not_sent' THEN 0 ELSE a.reserved_micros END AS pending_micros
  FROM llm_attempt a LEFT JOIN llm_reconciliation r ON r.attempt_id=a.id;
CREATE TABLE account_mail (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES evaluator(id), secret_id uuid REFERENCES secret_value(id),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','delivered','bounced','failed','expired')),
  attempts integer NOT NULL DEFAULT 0, provider_id text UNIQUE, expires_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_mail_event (
  id text PRIMARY KEY, provider_id text NOT NULL, type text NOT NULL,
  occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- New multi-provider campaign admissions use an upper bound, never a fabricated tokenizer reading.
ALTER TABLE conversation_attempt ADD COLUMN input_upper_bound integer CHECK(input_upper_bound>0);
