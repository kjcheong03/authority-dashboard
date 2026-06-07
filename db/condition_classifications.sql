-- ============================================================================
-- ORCA condition-classification cache — shared Supabase project
--
-- Stores AI-resolved mappings from free-text patient conditions (e.g.
-- "Type 2 Diabetes", "Hypertension") to the controlled Target vocabulary
-- used by the Authority Dashboard's audience picker:
--   {Diabetes, Heart, Stroke, Cancer, Kidney, Respiratory, Dementia,
--    Immunocompromised, Mobility}
--
-- The BrainHack CARA caregiver app calls /api/profile/classify on profile
-- save; that endpoint reads/writes this table to avoid paying OpenAI for
-- conditions already classified by any caregiver.
--
-- ── ONE-SHOT, IDEMPOTENT, RE-RUNNABLE ────────────────────────────────────────
-- Paste into Supabase SQL Editor and Run. Safe to re-run.
--
-- ── SECURITY POSTURE ────────────────────────────────────────────────────────
-- RLS enabled, no policies → service_role only. Both the Authority Dashboard
-- and BrainHack CARA Next.js servers use the service-role client; the browser
-- never queries this table directly.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- condition_classifications ─ cross-caregiver cache of (free-text condition →
-- matched Target categories) verdicts. One row per normalized condition string.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.condition_classifications (
  normalized_condition text primary key,
  targets              text[] not null,
  model                text not null default 'gpt-4o-mini',
  reasoning            text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  hit_count            int not null default 0
);
create index if not exists idx_condition_classifications_updated
  on public.condition_classifications (updated_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-bump updated_at + hit_count on every read-style upsert. The endpoint
-- updates these explicitly, so the trigger only fires on direct UPDATEs.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bump_condition_classifications_updated_at()
  returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_condition_classifications_bump
  on public.condition_classifications;
create trigger trg_condition_classifications_bump
  before update on public.condition_classifications
  for each row
  execute function public.bump_condition_classifications_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — service-role only
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.condition_classifications enable row level security;
revoke all on public.condition_classifications from anon, authenticated;

commit;
