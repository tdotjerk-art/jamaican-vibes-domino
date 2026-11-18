-- Jamaican Vibes Domino credit pilot: proposed PostgreSQL migration.
-- Do not run on a live database until the application uses SQL transactions.
-- Credit values are internal game credits, not money or transferable tokens.
BEGIN;

CREATE TABLE IF NOT EXISTS domino_credit_accounts (
  id CHAR(32) PRIMARY KEY,
  signup_name VARCHAR(20) NOT NULL,
  signup_name_key VARCHAR(20) GENERATED ALWAYS AS (lower(signup_name)) STORED UNIQUE,
  token_sha256 CHAR(64) NOT NULL,
  balance INTEGER NOT NULL DEFAULT 100 CHECK (balance BETWEEN 0 AND 1000000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (signup_name !~* 'tdot')
);

CREATE TABLE IF NOT EXISTS domino_credit_operations (
  account_id CHAR(32) NOT NULL REFERENCES domino_credit_accounts(id),
  operation_id VARCHAR(120) NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, operation_id)
);

CREATE TABLE IF NOT EXISTS domino_credit_tournaments (
  id VARCHAR(48) PRIMARY KEY,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 2 AND 128),
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'started', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS domino_credit_tournament_entries (
  tournament_id VARCHAR(48) NOT NULL REFERENCES domino_credit_tournaments(id),
  account_id CHAR(32) NOT NULL REFERENCES domino_credit_accounts(id),
  status VARCHAR(16) NOT NULL CHECK (status IN ('registered', 'withdrawn', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, account_id)
);

CREATE INDEX IF NOT EXISTS domino_credit_tournament_active_entries
 ON domino_credit_tournament_entries (tournament_id)
 WHERE status = 'registered';

COMMIT;
