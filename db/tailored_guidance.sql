-- ============================================================================
-- ORCA tailored guidance resources — shared Supabase project
--
-- Real, authoritative URLs that tailor a hazard's "Guidance resources" carousel
-- to the caregiver's elderly profile. The BrainHack CARA caregiver app queries
-- this table by (hazard, profile.matchedTargets) and prepends matching rows to
-- the leftmost slots of the carousel, each tagged with the matched Target.
--
-- One row per (hazard, target) is enforced by a unique constraint — "for each
-- type just have one". Partial coverage is allowed; awkward combos (e.g.
-- Dengue × Mobility) can be left unseeded and the carousel falls back to the
-- generic items hardcoded in lib/media.ts.
--
-- ── ONE-SHOT, IDEMPOTENT, RE-RUNNABLE ────────────────────────────────────────
-- Paste into Supabase SQL Editor and Run. Safe to re-run.
--
-- ── SECURITY POSTURE ────────────────────────────────────────────────────────
-- RLS enabled, no policies → service_role only.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- tailored_guidance ─ one curated, verified resource per (hazard, target).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tailored_guidance (
  id           uuid primary key default gen_random_uuid(),
  hazard       text not null check (hazard in ('covid','dengue')),
  target       text not null,
  source       text not null,
  title        text not null,
  url          text not null,
  blurb        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (hazard, target)
);
create index if not exists idx_tailored_guidance_hazard
  on public.tailored_guidance (hazard);

create or replace function public.bump_tailored_guidance_updated_at()
  returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tailored_guidance_bump
  on public.tailored_guidance;
create trigger trg_tailored_guidance_bump
  before update on public.tailored_guidance
  for each row
  execute function public.bump_tailored_guidance_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — service-role only
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tailored_guidance enable row level security;
revoke all on public.tailored_guidance from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed rows — verified live (HTTP 200, no homepage redirects, page genuinely
-- covers the hazard × target intersection). Re-runnable via on conflict.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── COVID-19 ────────────────────────────────────────────────────────────────
insert into public.tailored_guidance (hazard, target, source, title, url, blurb) values
  ('covid', 'Diabetes',          'ADA',
   'Diabetes and Coronavirus',
   'https://diabetes.org/getting-sick-with-diabetes/coronavirus-covid-19',
   'American Diabetes Association sick-day rules, glucose monitoring tips and CDC-aligned guidance for people living with diabetes.'),

  ('covid', 'Heart',             'American Heart Association',
   'Beyond breathing: How COVID-19 affects your heart, brain and other organs',
   'https://www.heart.org/en/news/2024/01/16/how-covid-19-affects-your-heart-brain-and-other-organs',
   'AHA explainer on cardiac complications of COVID-19 — myocarditis, arrhythmias and elevated heart-attack risk in survivors with heart disease.'),

  ('covid', 'Stroke',             'American Stroke Association',
   'COVID-19 Stroke Podcast Series for Patients and Caregivers',
   'https://www.stroke.org/en/life-after-stroke/covid19-stroke-podcast-series-for-patients-and-caregivers',
   'Five-part American Stroke Association series for stroke survivors and their caregivers on staying safe and continuing rehab during COVID-19.'),

  ('covid', 'Cancer',             'American Cancer Society',
   'COVID-19 and Cancer',
   'https://www.cancer.org/cancer/managing-cancer/side-effects/infections/covid-19.html',
   'ACS guidance for cancer patients on COVID-19 risk, vaccination timing, and protecting an immune system weakened by treatment.'),

  ('covid', 'Kidney',             'National Kidney Foundation',
   'COVID-19 and Kidney Disease',
   'https://www.kidney.org/kidney-topics/covid-19-and-kidney-disease',
   'NKF resource for people with CKD, dialysis or transplant on heightened COVID-19 risk, vaccines and antiviral treatment options.'),

  ('covid', 'Respiratory',        'American Lung Association',
   'Maintaining Control of COPD During the COVID-19 Pandemic',
   'https://www.lung.org/blog/control-copd-during-covid-19-pandemic',
   'American Lung Association guidance on continuing controller meds, nebulizer safety and recognising emergency symptoms in COPD patients.'),

  ('covid', 'Dementia',           'NIA',
   'Caregiving in the Time of COVID-19',
   'https://www.nia.nih.gov/research/alzheimers-dementia-outreach-recruitment-engagement-resources/caregiving-time-covid-19',
   'National Institute on Aging tips for dementia caregivers on routines, hygiene reminders and back-up care plans during COVID-19.'),

  ('covid', 'Immunocompromised',  'CDC',
   'Vaccines for Moderately to Severely Immunocompromised People',
   'https://www.cdc.gov/covid/vaccines/immunocompromised-people.html',
   'CDC recommendations on additional COVID-19 vaccine doses and self-confirmation of immunocompromised status — no documentation required.'),

  ('covid', 'Mobility',           'CDC',
   'COVID-19 Information and Resources for People with Disabilities',
   'https://www.cdc.gov/disability-and-health/covid-19-resources/index.html',
   'CDC accessible-format COVID-19 guidance for people with disabilities and limited mobility, including caregiver and direct-service-provider resources.')
on conflict (hazard, target) do update set
  source     = excluded.source,
  title      = excluded.title,
  url        = excluded.url,
  blurb      = excluded.blurb,
  updated_at = now();

-- ── Dengue ───────────────────────────────────────────────────────────────────
-- Tailored, lay-accessible dengue × target content is scarce; only seed pairs
-- backed by an authoritative page that names the comorbidity. The CDC Clinical
-- Care of Dengue page explicitly lists hypertension, diabetes, asthma, chronic
-- kidney disease and chronic liver disease as co-existing conditions that
-- warrant closer monitoring and inpatient consideration, so it is referenced
-- from the relevant target rows. Other dengue × target pairs (Heart, Stroke,
-- Cancer, Dementia, Immunocompromised, Mobility) are intentionally left
-- unseeded — the carousel falls back to the generic dengue items.
insert into public.tailored_guidance (hazard, target, source, title, url, blurb) values
  ('dengue', 'Diabetes',    'CDC',
   'Clinical Care of Dengue',
   'https://www.cdc.gov/dengue/hcp/clinical-care/index.html',
   'CDC clinical-care guide lists diabetes as a co-existing condition that warrants close monitoring and earlier admission when dengue is suspected.'),

  ('dengue', 'Kidney',      'CDC',
   'Clinical Care of Dengue',
   'https://www.cdc.gov/dengue/hcp/clinical-care/index.html',
   'CDC clinical-care guide flags chronic kidney disease as a co-existing condition raising the risk of severe dengue and fluid-management complications.'),

  ('dengue', 'Respiratory', 'CDC',
   'Clinical Care of Dengue',
   'https://www.cdc.gov/dengue/hcp/clinical-care/index.html',
   'CDC clinical-care guide names asthma among the co-existing conditions that increase risk for severe dengue and warrant earlier inpatient evaluation.')
on conflict (hazard, target) do update set
  source     = excluded.source,
  title      = excluded.title,
  url        = excluded.url,
  blurb      = excluded.blurb,
  updated_at = now();

commit;
