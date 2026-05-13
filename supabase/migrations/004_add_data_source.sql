-- Migration: Add data_source column to training_summaries
-- Detects Strava-synced activities missing performance data (due to Strava privacy policies)
ALTER TABLE training_summaries ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) DEFAULT 'unknown';
-- Values: 'icu', 'strava_empty', 'unknown'
CREATE INDEX IF NOT EXISTS idx_training_summaries_data_source ON training_summaries(athlete_id, data_source);