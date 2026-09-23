INSERT INTO ingestion_job(id, source_id) VALUES ('aemet', 'aemet') ON CONFLICT DO NOTHING;
