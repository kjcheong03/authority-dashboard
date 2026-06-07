-- ============================================================================
-- ORCA Authority Dashboard — Supabase / Postgres schema
-- One-shot. Idempotent. Safe to re-run.
--
-- Persists every research run so officers can:
--   (a) reload a finished run without re-running the 3-min pipeline
--   (b) autofill the broadcast draft from a saved run
--   (c) get an immutable audit trail of broadcasts
--
-- ── How to run on Supabase ─────────────────────────────────────────────────
-- 1. Supabase Dashboard → SQL Editor → New query
-- 2. Paste this entire file → Run
-- 3. All access happens server-side from Next.js API routes using the
--    SERVICE_ROLE key (bypasses RLS). The browser never queries directly.
-- 4. Env vars to add (Vercel + .env.local):
--      NEXT_PUBLIC_SUPABASE_URL        = https://<project>.supabase.co
--      SUPABASE_SERVICE_ROLE_KEY       = eyJ... (server-only — keep secret)
-- ────────────────────────────────────────────────────────────────────────────

-- Supabase ships with pgcrypto enabled and gen_random_uuid() ready to go.


-- ─────────────────────────────────────────────────────────────────────────────
-- runs ─ the root entity. One row per research investigation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic           TEXT NOT NULL,
  region          TEXT NOT NULL DEFAULT '',
  audience        TEXT NOT NULL DEFAULT 'Caregivers',
  mode            TEXT NOT NULL DEFAULT 'live'
                    CHECK (mode IN ('live', 'replay')),
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'complete', 'failed', 'stopped')),
  phase           TEXT,                              -- ingest | misinfo | draft | done
  pct             SMALLINT NOT NULL DEFAULT 0,
  error           TEXT,
  streaming_url   TEXT,                              -- TinyFish live stream URL
  officer_id      TEXT,                              -- nullable until auth wired
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_topic_lc   ON runs (LOWER(topic));
CREATE INDEX IF NOT EXISTS idx_runs_status     ON runs (status);


-- ─────────────────────────────────────────────────────────────────────────────
-- findings ─ verified facts extracted from official sources during ingest.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS findings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agency      TEXT NOT NULL,                         -- "MOH", "NEA", "WHO", "data.gov.sg"
  stat        TEXT,                                  -- short figure ("5 clusters")
  text        TEXT NOT NULL,                         -- the verified finding
  url         TEXT,                                  -- source URL
  time_ago    TEXT,                                  -- "12 mins ago" / "as of …"
  ordinal     INT NOT NULL DEFAULT 0,                -- preserve emit order
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_findings_run ON findings (run_id, ordinal);


-- ─────────────────────────────────────────────────────────────────────────────
-- claims ─ misinformation claims detected from public channels.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  client_id   TEXT,                                  -- "claim_0", "claim_1" (the SSE id)
  text        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'UNVERIFIED'
                CHECK (severity IN ('UNVERIFIED', 'MINOR_DISCREPANCY')),
  where_seen  TEXT,                                  -- "WhatsApp", "r/singapore" …
  shares      TEXT,                                  -- spread indicator if any
  contradicts TEXT,
  analysis    TEXT,
  fix         TEXT,                                  -- suggested clarification
  velocity    TEXT,                                  -- SURGING / RISING / …
  ordinal     INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claims_run        ON claims (run_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_claims_run_client ON claims (run_id, client_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- claim_origins ─ origin / amplification / debunk timeline per claim.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_origins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id      UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  single_source BOOLEAN,                             -- claim-level flag
  date_str      TEXT,                                -- "2026-05-19"
  outlet        TEXT NOT NULL,                       -- "WhatsApp", "WHO", …
  event         TEXT NOT NULL,                       -- short clause
  type          TEXT NOT NULL
                  CHECK (type IN ('origin', 'amplification', 'debunk', 'investigation')),
  url           TEXT,
  ordinal       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_origins_claim ON claim_origins (claim_id, ordinal);


-- ─────────────────────────────────────────────────────────────────────────────
-- claim_factchecks ─ published fact-checks corroborating a claim.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_factchecks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id   UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  publisher  TEXT NOT NULL,                          -- "AFP Fact Check"
  rating     TEXT NOT NULL,                          -- "False", "Misleading"
  title      TEXT,
  url        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_factchecks_claim ON claim_factchecks (claim_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- spread ─ GDELT coverage signal. One row per run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spread (
  run_id              UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  velocity_label      TEXT,                          -- SURGING / RISING / …
  total_articles      INT,
  top_countries       JSONB,
  singapore_articles  INT,
  singapore_velocity  TEXT,
  tone_label          TEXT,                          -- ALARMIST / NEGATIVE / NEUTRAL / POSITIVE
  avg_tone            NUMERIC,
  source              TEXT CHECK (source IN ('bigquery', 'doc')),
  timeline            JSONB                          -- daily {date, global, sg, tone}
);


-- ─────────────────────────────────────────────────────────────────────────────
-- assessments ─ broadcast triage verdict. One per run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
  run_id          UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  verdict         TEXT NOT NULL CHECK (verdict IN ('BROADCAST', 'MONITOR', 'NO ACTION')),
  rationale       TEXT NOT NULL,
  urgency         TEXT NOT NULL CHECK (urgency IN ('HIGH', 'NORMAL')),
  audience        TEXT NOT NULL,
  signal_local    TEXT,
  signal_spread   TEXT,
  signal_misinfo  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- drafts ─ the AI-generated advisory. One per run. Editable post-completion.
-- This is the row a "Load run" feature reads to autofill the broadcast panel.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drafts (
  run_id        UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,                       -- markdown w/ **bold** + [text](url)
  target        TEXT NOT NULL,
  urgency       TEXT NOT NULL CHECK (urgency IN ('HIGH', 'NORMAL')),
  checklist     JSONB,                               -- array of strings, optional
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- broadcasts ─ immutable record of every approved broadcast (audit-grade).
-- A run can produce 0..n broadcasts (re-broadcasts allowed); each one snapshots
-- the exact draft at the moment of approval.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  draft_snapshot  JSONB NOT NULL,                    -- full draft frozen at send time
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  urgency         TEXT NOT NULL CHECK (urgency IN ('HIGH', 'NORMAL')),
  audience_mode   TEXT NOT NULL DEFAULT 'all'
                    CHECK (audience_mode IN ('all', 'selected')),
  target_profiles JSONB,                             -- ["Diabetes", "Heart", …]
  reach_estimate  INT,                               -- e.g. 380000
  confirmation_id TEXT NOT NULL,                     -- "BCST-2026-06-04-A7F3"
  status          TEXT NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by         TEXT                               -- officer_id, nullable
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_run     ON broadcasts (run_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_sent_at ON broadcasts (sent_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- sources ─ consulted source list per run (drives the source chips).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id    UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  url       TEXT NOT NULL,
  ordinal   INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sources_run ON sources (run_id, ordinal);


-- ─────────────────────────────────────────────────────────────────────────────
-- run_logs ─ every SSE log line from a run. Drives the /audit page.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_logs (
  id        BIGSERIAL PRIMARY KEY,
  run_id    UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  level     TEXT NOT NULL CHECK (level IN ('info', 'warn', 'ok')),
  message   TEXT NOT NULL,
  ts        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_run_logs_run ON run_logs (run_id, ts);


-- ─────────────────────────────────────────────────────────────────────────────
-- View ─ latest completed run per topic. Powers the "Resume previous run for
-- this topic" UX so officers don't re-run the pipeline unnecessarily.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW latest_complete_runs_per_topic AS
SELECT DISTINCT ON (LOWER(topic)) *
FROM runs
WHERE status = 'complete'
ORDER BY LOWER(topic), completed_at DESC NULLS LAST, created_at DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-bump drafts.updated_at on every UPDATE (so we know when the officer
-- last edited the draft, even without explicit timestamp passing).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bump_drafts_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drafts_bump_updated_at ON drafts;
CREATE TRIGGER trg_drafts_bump_updated_at
  BEFORE UPDATE ON drafts
  FOR EACH ROW
  EXECUTE FUNCTION bump_drafts_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- Per-finding / per-claim TinyFish provenance (idempotent).
-- Each finding/claim was produced by a specific TinyFish session, and that
-- session has a step ID whose screenshot + HTML snapshot we use as evidence.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE findings ADD COLUMN IF NOT EXISTS tinyfish_run_id  TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS tinyfish_step_id TEXT;
ALTER TABLE claims   ADD COLUMN IF NOT EXISTS tinyfish_run_id  TEXT;
ALTER TABLE claims   ADD COLUMN IF NOT EXISTS tinyfish_step_id TEXT;


-- ─────────────────────────────────────────────────────────────────────────────
-- channel_sessions ─ one row per (research run × TinyFish channel). Captures
-- the per-source session metadata that findings/claims point at: the TinyFish
-- run_id, the last meaningful step (drives the snapshot button), the start URL,
-- the goal, plus the session's lifecycle status. Lets the audit page show
-- exactly which page each source landed on without joining through every row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_sessions (
  run_id            UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  channel_id        TEXT NOT NULL,                       -- "moh", "reddit", …
  lane              TEXT NOT NULL                        -- "verified" | "online"
                      CHECK (lane IN ('verified', 'online')),
  tinyfish_run_id   TEXT,                                -- the upstream session id
  last_step_id      TEXT,                                -- drives snapshot proxy
  start_url         TEXT,
  goal              TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'ok', 'failed', 'cancelled')),
  item_count        INT NOT NULL DEFAULT 0,              -- findings or claims produced
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  PRIMARY KEY (run_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_sessions_run ON channel_sessions (run_id);
CREATE INDEX IF NOT EXISTS idx_channel_sessions_tf  ON channel_sessions (tinyfish_run_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- hazard_gdelt ─ pre-cached GDELT signal per topic (COVID-19, Dengue, etc.).
-- Page-load reads from here so the top GDELT cards render instantly. A refresh
-- button on each card forces a fresh BigQuery call and upserts back.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hazard_gdelt (
  topic       TEXT PRIMARY KEY,
  spread      JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security (Supabase)
--
-- All tables are LOCKED to anon/auth keys. The Next.js API routes use the
-- SERVICE_ROLE key, which bypasses RLS. The browser never queries Postgres
-- directly — it talks to /api/* which then uses the service-role client.
--
-- This is the right posture for an authority tool: nothing should be readable
-- from a stray client key.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims            ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_origins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_factchecks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE spread            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_gdelt      ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_sessions  ENABLE ROW LEVEL SECURITY;
-- (No policies defined → only service_role key can read/write.)
