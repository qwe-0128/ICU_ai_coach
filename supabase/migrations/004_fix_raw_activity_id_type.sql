-- ============ Fix raw_activity_id column type ============
-- ICU activity IDs are strings like "i147395284" or plain numbers "18459765932"
-- Change from BIGINT to TEXT using USING clause

ALTER TABLE training_summaries 
  ALTER COLUMN raw_activity_id TYPE TEXT USING raw_activity_id::TEXT;

-- Also add an index for faster lookups by raw_activity_id
CREATE INDEX IF NOT EXISTS idx_ts_raw_activity_id ON training_summaries(raw_activity_id);
