-- Five explicit evaluator slots, linked to Better Auth identities.
CREATE TABLE evaluator (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot smallint NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 5),
  label text NOT NULL,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth_user(id),
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_session (
  session_id text PRIMARY KEY,
  evaluator_id uuid NOT NULL REFERENCES evaluator(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  revoked_at timestamptz
);
CREATE INDEX evaluation_session_owner_idx ON evaluation_session(evaluator_id);

-- Fixed-window counters are updated atomically, never held in function memory.
CREATE TABLE evaluation_usage (
  evaluator_id uuid NOT NULL REFERENCES evaluator(id),
  window_start timestamptz NOT NULL,
  window_kind text NOT NULL CHECK (window_kind IN ('minute', 'day')),
  requests integer NOT NULL CHECK (requests > 0),
  PRIMARY KEY (evaluator_id, window_start, window_kind)
);
