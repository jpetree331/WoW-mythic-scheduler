-- Add roles (JSON array) for flexible role selection
ALTER TABLE players ADD COLUMN roles TEXT; -- JSON array of roles

-- Backfill existing rows: wrap single role into array
UPDATE players SET roles = json_array(role) WHERE roles IS NULL OR roles = '';

