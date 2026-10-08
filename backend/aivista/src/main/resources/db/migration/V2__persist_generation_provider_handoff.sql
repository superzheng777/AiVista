-- Durable handoff from image-model execution to transfer/settlement. Never replay
-- a call whose request may have reached the provider without a saved response.
ALTER TABLE executions
  ADD COLUMN provider_started_at datetime(3) DEFAULT NULL AFTER provider_request_id,
  ADD COLUMN provider_response_json json DEFAULT NULL AFTER provider_started_at;

-- The previous executor did not persist a call marker. An existing RUNNING image
-- may already have reached the provider, so never reissue it during recovery.
UPDATE executions
  SET provider_started_at = created_at
  WHERE kind = 'GENERATION' AND status = 'RUNNING';
