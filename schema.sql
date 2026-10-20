-- Run once with:
--   npx wrangler d1 execute ca-star-survey-db --file=./schema.sql
-- (add --remote to run it against the live database instead of the local test one)

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  location_code TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  contact_id TEXT,
  created_at TEXT NOT NULL,
  comment_added_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_survey_location ON survey_responses (location_code);
CREATE INDEX IF NOT EXISTS idx_survey_created ON survey_responses (created_at);
