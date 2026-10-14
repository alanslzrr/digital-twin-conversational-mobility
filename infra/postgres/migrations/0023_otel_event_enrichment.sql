-- One native span enriches one existing terminal event; no second event/usage ledger.
ALTER TABLE conversation_trace_event ADD COLUMN otel_span jsonb
  CHECK (otel_span IS NULL OR (
    jsonb_typeof(otel_span) = 'object' AND octet_length(otel_span::text) <= 512
  ));
CREATE UNIQUE INDEX conversation_trace_event_otel_idx
  ON conversation_trace_event(session_id, (otel_span->>'traceId'), (otel_span->>'spanId'))
  WHERE otel_span IS NOT NULL;
