INSERT INTO ingestion_job(id, source_id) VALUES ('emt-alerts', 'emt') ON CONFLICT DO NOTHING;
