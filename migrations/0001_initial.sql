PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS league_schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  map_region_id TEXT
);

CREATE TABLE IF NOT EXISTS league_stats (
  season_id TEXT NOT NULL,
  school_id TEXT NOT NULL REFERENCES league_schools(id),
  total_heat INTEGER NOT NULL DEFAULT 0,
  rounds INTEGER NOT NULL DEFAULT 0,
  best_heat INTEGER NOT NULL DEFAULT 0,
  best_round_id TEXT NOT NULL,
  best_at TEXT NOT NULL,
  best_mode TEXT NOT NULL,
  PRIMARY KEY (season_id, school_id)
);

-- Stateless start tickets are not stored. A row appears only after a successful
-- finish, and the primary key consumes the signed round ID exactly once.
CREATE TABLE IF NOT EXISTS league_rounds (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  school_id TEXT NOT NULL REFERENCES league_schools(id),
  points INTEGER NOT NULL,
  receipt TEXT
);

CREATE INDEX IF NOT EXISTS league_rounds_client_finished
  ON league_rounds(client_hash, finished_at);
CREATE INDEX IF NOT EXISTS league_rounds_ip_finished
  ON league_rounds(ip_hash, finished_at);
CREATE INDEX IF NOT EXISTS league_rounds_school_finished
  ON league_rounds(season_id, school_id, finished_at, id);
