CREATE TABLE monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  method text NOT NULL DEFAULT 'GET' CHECK (method IN ('GET','HEAD')),
  interval_seconds int NOT NULL CHECK (interval_seconds BETWEEN 30 AND 86400),
  timeout_ms int NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 30000),
  expected_status int NOT NULL DEFAULT 200 CHECK (expected_status BETWEEN 100 AND 599),
  paused boolean NOT NULL DEFAULT false,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  consecutive_failures int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monitors_due_idx ON monitors (next_check_at) WHERE NOT paused;

CREATE TABLE checks (
  id bigserial PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  status_code int,
  response_ms int,
  error text
);
CREATE INDEX checks_monitor_time_idx ON checks (monitor_id, checked_at DESC);

CREATE TABLE incidents (
  id bigserial PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  last_error text
);
CREATE UNIQUE INDEX one_open_incident_per_monitor ON incidents (monitor_id) WHERE resolved_at IS NULL;
