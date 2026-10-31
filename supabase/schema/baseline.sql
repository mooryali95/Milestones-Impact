-- ════════════════════════════════════════════════════════════════
-- بنية قاعدة البيانات كما هي في الإنتاج: المرجع الكامل لجداول leaders وpublic
-- ════════════════════════════════════════════════════════════════
-- مولَّد آليًا بـ scripts/db/snapshot.mjs من فهارس النظام؛ لا يُحرَّر يدويًا.
-- يبني قاعدة جديدة كاملة، ولا يغيّر القاعدة الحية (كل أمر مشروط). الترحيلات في
-- supabase/migrations هي سجل التغييرات، وهذا الملف حالتها المجمّعة الآن.
-- server/*.sql أرشيف تاريخي لا مصدر.

-- كما في pg_dump: دوال SQL يشير بعضها إلى بعض، فلا يُتحقق من أجسامها لحظة الإنشاء
set check_function_bodies = off;
create schema if not exists leaders;

create sequence if not exists public.admin_audit_log_id_seq as bigint;

create sequence if not exists public.admin_role_permissions_id_seq as integer;

create sequence if not exists public.email_otps_id_seq as integer;

create sequence if not exists public.process_details_id_seq as integer;

create sequence if not exists public.reports_id_seq as integer;

create table if not exists leaders.assessment_answers (
  assessment_id uuid not null,
  question_id uuid not null,
  value jsonb not null,
  score numeric(6,2),
  answered_at timestamp with time zone default now() not null,
  constraint assessment_answers_pkey PRIMARY KEY (assessment_id, question_id)
);

create table if not exists leaders.assessment_results (
  assessment_id uuid not null,
  dimension text not null,
  score numeric(5,2) not null,
  level text not null,
  knowledge_pct numeric(5,2),
  skill_pct numeric(5,2),
  behavior_pct numeric(5,2),
  composite_pct numeric(5,2),
  borderline boolean,
  reason_ar text,
  behavior_before_pct numeric(5,2),
  skill_anchor_pct numeric(5,2),
  skill_form_pct numeric(5,2),
  behavior_common_pct numeric(5,2),
  behavior_pre_common_pct numeric(5,2),
  constraint assessment_results_pkey PRIMARY KEY (assessment_id, dimension)
);

create table if not exists leaders.assessments (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  instrument_id uuid not null,
  status text default 'in_progress'::text not null,
  started_at timestamp with time zone default now() not null,
  submitted_at timestamp with time zone,
  form text,
  constraint assessments_form_check CHECK ((form = ANY (ARRAY['A'::text, 'B'::text]))),
  constraint assessments_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'void'::text]))),
  constraint assessments_pkey PRIMARY KEY (id)
);

create table if not exists leaders.audit_log (
  id bigint generated always as identity not null,
  actor_type text not null,
  actor text,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamp with time zone default now() not null,
  constraint audit_log_actor_type_check CHECK ((actor_type = ANY (ARRAY['admin'::text, 'participant'::text, 'system'::text, 'coordinator'::text]))),
  constraint audit_log_pkey PRIMARY KEY (id)
);

create table if not exists leaders.auth_sessions (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  token_hash text not null,
  method text not null,
  user_agent text,
  ip inet,
  created_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  constraint auth_sessions_method_check CHECK ((method = ANY (ARRAY['email_link'::text, 'email_code'::text, 'passkey'::text, 'google'::text]))),
  constraint auth_sessions_pkey PRIMARY KEY (id),
  constraint auth_sessions_token_hash_key UNIQUE (token_hash)
);

create table if not exists leaders.capstones (
  participant_id uuid not null,
  status text default 'draft'::text not null,
  summary_ar text,
  readiness smallint,
  revisions smallint default 0 not null,
  submitted_at timestamp with time zone,
  scores jsonb,
  notes jsonb,
  review_note text,
  score numeric(5,1),
  reviewed_by text,
  reviewed_at timestamp with time zone,
  sponsor_name text,
  sponsor_email text,
  sponsor_token_hash text,
  sponsor_status text,
  sponsor_note text,
  sponsor_invited_at timestamp with time zone,
  sponsor_expires_at timestamp with time zone,
  sponsor_at timestamp with time zone,
  sponsor_waived text,
  approved_at timestamp with time zone,
  approved_by text,
  snapshot jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint capstones_review_note_check CHECK (((review_note IS NULL) OR (char_length(review_note) <= 3000))),
  constraint capstones_sponsor_note_check CHECK (((sponsor_note IS NULL) OR (char_length(sponsor_note) <= 2000))),
  constraint capstones_sponsor_status_check CHECK (((sponsor_status IS NULL) OR (sponsor_status = ANY (ARRAY['pending'::text, 'endorsed'::text, 'declined'::text])))),
  constraint capstones_sponsor_waived_check CHECK (((sponsor_waived IS NULL) OR (char_length(sponsor_waived) <= 500))),
  constraint capstones_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'returned'::text, 'accepted'::text, 'approved'::text]))),
  constraint capstones_summary_ar_check CHECK (((summary_ar IS NULL) OR (char_length(summary_ar) <= 3000))),
  constraint capstones_pkey PRIMARY KEY (participant_id),
  constraint capstones_sponsor_token_hash_key UNIQUE (sponsor_token_hash)
);

create table if not exists leaders.certificate_checks (
  id bigint generated always as identity not null,
  serial text,
  found boolean not null,
  ip inet,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  constraint certificate_checks_pkey PRIMARY KEY (id)
);

create table if not exists leaders.certificate_settings (
  id smallint default 1 not null,
  enabled boolean default true not null,
  program_ar text default 'برنامج القادة'::text not null,
  program_en text default 'Leaders Program'::text not null,
  hours smallint,
  updated_by text,
  updated_at timestamp with time zone default now() not null,
  signatory jsonb,
  constraint certificate_settings_hours_check CHECK (((hours IS NULL) OR ((hours >= 1) AND (hours <= 2000)))),
  constraint certificate_settings_id_check CHECK ((id = 1)),
  constraint certificate_settings_signatory_check CHECK (((signatory IS NULL) OR (jsonb_typeof(signatory) = 'object'::text))),
  constraint certificate_settings_pkey PRIMARY KEY (id)
);

create table if not exists leaders.certificates (
  id uuid default gen_random_uuid() not null,
  serial text not null,
  participant_id uuid not null,
  status text default 'valid'::text not null,
  snapshot jsonb not null,
  signature text not null,
  issued_at timestamp with time zone default now() not null,
  issued_by text,
  revoked_at timestamp with time zone,
  revoked_by text,
  revoke_reason text,
  replaced_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint certificates_revoke_reason_check CHECK (((revoke_reason IS NULL) OR (char_length(revoke_reason) <= 500))),
  constraint certificates_serial_check CHECK ((serial ~ '^MI-LDR-[0-9]{4}-[0-9A-Z]{6}$'::text)),
  constraint certificates_status_check CHECK ((status = ANY (ARRAY['valid'::text, 'revoked'::text, 'replaced'::text]))),
  constraint certificates_pkey PRIMARY KEY (id),
  constraint certificates_serial_key UNIQUE (serial)
);

create table if not exists leaders.coaching_sessions (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  requirement_id uuid not null,
  kind text not null,
  provider text,
  external_id text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  join_url text,
  status text default 'booked'::text not null,
  coach text,
  note text,
  confirmed_by text,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  expert_id uuid,
  constraint coaching_sessions_kind_check CHECK ((kind = ANY (ARRAY['booked'::text, 'instant'::text, 'manual'::text]))),
  constraint coaching_sessions_note_check CHECK ((char_length(note) <= 2000)),
  constraint coaching_sessions_provider_check CHECK ((provider = ANY (ARRAY['calcom'::text, 'calendly'::text, 'instant'::text, 'manual'::text]))),
  constraint coaching_sessions_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'booked'::text, 'attended'::text, 'no_show'::text, 'cancelled'::text]))),
  constraint coaching_sessions_pkey PRIMARY KEY (id),
  constraint coaching_sessions_external_id_key UNIQUE (external_id)
);

create table if not exists leaders.cohorts (
  id uuid default gen_random_uuid() not null,
  name text not null,
  track text default 'individual'::text not null,
  organization_id uuid,
  starts_on date,
  ends_on date,
  capacity smallint,
  status text default 'planned'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  program_id uuid not null,
  program_version_id uuid,
  is_default boolean default false not null,
  delivery jsonb default '{}'::jsonb not null,
  notes_ar text,
  constraint cohorts_notes_ar_check CHECK ((char_length(notes_ar) <= 2000)),
  constraint cohorts_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'open'::text, 'running'::text, 'closed'::text]))),
  constraint cohorts_track_check CHECK ((track = ANY (ARRAY['individual'::text, 'institutional'::text]))),
  constraint cohorts_pkey PRIMARY KEY (id)
);

create table if not exists leaders.content_items (
  id uuid default gen_random_uuid() not null,
  kind text not null,
  title_ar text not null,
  description_ar text,
  url text not null,
  minutes smallint,
  dimension text,
  min_level text,
  only_level text,
  track_keys text[] default '{}'::text[] not null,
  exclude_tracks text[] default '{}'::text[] not null,
  required boolean default true not null,
  min_pct smallint default 90 not null,
  sort integer default 0 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint content_items_check CHECK ((NOT ((min_level IS NOT NULL) AND (only_level IS NOT NULL)))),
  constraint content_items_check1 CHECK (((dimension IS NOT NULL) OR ((min_level IS NULL) AND (only_level IS NULL)))),
  constraint content_items_description_ar_check CHECK ((char_length(description_ar) <= 2000)),
  constraint content_items_dimension_check CHECK (((dimension IS NULL) OR (dimension = ANY (ARRAY['milestone'::text, 'impact'::text, 'leadership'::text])))),
  constraint content_items_kind_check CHECK ((kind = ANY (ARRAY['video'::text, 'file'::text, 'link'::text]))),
  constraint content_items_min_level_check CHECK (((min_level IS NULL) OR (min_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])))),
  constraint content_items_min_pct_check CHECK (((min_pct >= 10) AND (min_pct <= 100))),
  constraint content_items_minutes_check CHECK (((minutes IS NULL) OR ((minutes >= 0) AND (minutes <= 600)))),
  constraint content_items_only_level_check CHECK (((only_level IS NULL) OR (only_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])))),
  constraint content_items_title_ar_check CHECK (((char_length(title_ar) >= 1) AND (char_length(title_ar) <= 200))),
  constraint content_items_url_check CHECK (((url ~ '^https://'::text) AND (char_length(url) <= 1000))),
  constraint content_items_pkey PRIMARY KEY (id)
);

create table if not exists leaders.content_progress (
  participant_id uuid not null,
  item_id uuid not null,
  duration real,
  ranges jsonb default '[]'::jsonb not null,
  watched_seconds real default 0 not null,
  opened_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_ping_at timestamp with time zone,
  constraint content_progress_pkey PRIMARY KEY (participant_id, item_id)
);

create table if not exists leaders.coordinator_challenges (
  id uuid default gen_random_uuid() not null,
  coordinator_id uuid not null,
  email text not null,
  code_hash text not null,
  link_token_hash text not null,
  attempts smallint default 0 not null,
  ip inet,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint coordinator_challenges_pkey PRIMARY KEY (id),
  constraint coordinator_challenges_link_token_hash_key UNIQUE (link_token_hash)
);

create table if not exists leaders.coordinator_sessions (
  id uuid default gen_random_uuid() not null,
  coordinator_id uuid not null,
  token_hash text not null,
  method text not null,
  ip inet,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  constraint coordinator_sessions_pkey PRIMARY KEY (id),
  constraint coordinator_sessions_token_hash_key UNIQUE (token_hash)
);

create table if not exists leaders.dimensions (
  key text not null,
  title_ar text not null,
  title_en text not null,
  sort smallint not null,
  constraint dimensions_key_check CHECK ((key = ANY (ARRAY['milestone'::text, 'impact'::text, 'leadership'::text]))),
  constraint dimensions_pkey PRIMARY KEY (key)
);

create table if not exists leaders.email_challenges (
  id uuid default gen_random_uuid() not null,
  email text not null,
  purpose text not null,
  code_hash text not null,
  link_token_hash text not null,
  pending_profile jsonb,
  attempts smallint default 0 not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  ip inet,
  created_at timestamp with time zone default now() not null,
  constraint email_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['register'::text, 'login'::text]))),
  constraint email_challenges_pkey PRIMARY KEY (id),
  constraint email_challenges_link_token_hash_key UNIQUE (link_token_hash)
);

create table if not exists leaders.enrollments (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  cohort_id uuid not null,
  status text default 'nominated'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint enrollments_status_check CHECK ((status = ANY (ARRAY['nominated'::text, 'accepted'::text, 'active'::text, 'completed'::text, 'withdrawn'::text]))),
  constraint enrollments_pkey PRIMARY KEY (id),
  constraint enrollments_participant_id_cohort_id_key UNIQUE (participant_id, cohort_id)
);

create table if not exists leaders.expert_requests (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  role text not null,
  dimension text,
  status text default 'open'::text not null,
  expert_id uuid,
  offer_token_hash text,
  offered_at timestamp with time zone,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  tried uuid[] default '{}'::uuid[] not null,
  score numeric(5,2),
  manual_reason text,
  note text,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint expert_requests_dimension_check CHECK (((dimension IS NULL) OR (dimension = ANY (ARRAY['milestone'::text, 'impact'::text, 'leadership'::text])))),
  constraint expert_requests_manual_reason_check CHECK (((manual_reason IS NULL) OR (char_length(manual_reason) <= 500))),
  constraint expert_requests_note_check CHECK (((note IS NULL) OR (char_length(note) <= 1000))),
  constraint expert_requests_role_check CHECK ((role = ANY (ARRAY['coach'::text, 'advisor'::text, 'specialist'::text, 'assessor'::text, 'mentor'::text]))),
  constraint expert_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'offered'::text, 'accepted'::text, 'unmatched'::text, 'cancelled'::text, 'completed'::text]))),
  constraint expert_requests_pkey PRIMARY KEY (id)
);

create table if not exists leaders.experts (
  id uuid default gen_random_uuid() not null,
  email text not null,
  full_name text not null,
  title text,
  phone text,
  bio text,
  linkedin_url text,
  roles text[] default '{}'::text[] not null,
  dimensions text[] default '{}'::text[] not null,
  levels text[] default '{}'::text[] not null,
  sectors text[] default '{}'::text[] not null,
  languages text[] default '{ar}'::text[] not null,
  weekly_hours smallint,
  years_experience smallint,
  hourly_rate numeric(10,2),
  status text default 'applied'::text not null,
  source text default 'application'::text not null,
  admin_note text,
  applied_ip text,
  approved_by text,
  approved_at timestamp with time zone,
  invited_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint experts_admin_note_check CHECK (((admin_note IS NULL) OR (char_length(admin_note) <= 2000))),
  constraint experts_bio_check CHECK (((bio IS NULL) OR (char_length(bio) <= 3000))),
  constraint experts_dimensions_check CHECK ((dimensions <@ ARRAY['milestone'::text, 'impact'::text, 'leadership'::text])),
  constraint experts_email_check CHECK (((email = lower(email)) AND (char_length(email) <= 254))),
  constraint experts_full_name_check CHECK (((char_length(full_name) >= 2) AND (char_length(full_name) <= 120))),
  constraint experts_hourly_rate_check CHECK (((hourly_rate IS NULL) OR (hourly_rate >= (0)::numeric))),
  constraint experts_languages_check CHECK ((languages <@ ARRAY['ar'::text, 'en'::text])),
  constraint experts_levels_check CHECK ((levels <@ ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])),
  constraint experts_linkedin_url_check CHECK (((linkedin_url IS NULL) OR (char_length(linkedin_url) <= 300))),
  constraint experts_phone_check CHECK (((phone IS NULL) OR (char_length(phone) <= 30))),
  constraint experts_roles_check CHECK ((roles <@ ARRAY['coach'::text, 'advisor'::text, 'specialist'::text, 'assessor'::text, 'mentor'::text])),
  constraint experts_source_check CHECK ((source = ANY (ARRAY['application'::text, 'admin'::text]))),
  constraint experts_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'invited'::text, 'active'::text, 'paused'::text, 'suspended'::text, 'rejected'::text]))),
  constraint experts_title_check CHECK (((title IS NULL) OR (char_length(title) <= 160))),
  constraint experts_weekly_hours_check CHECK (((weekly_hours IS NULL) OR ((weekly_hours >= 0) AND (weekly_hours <= 60)))),
  constraint experts_years_experience_check CHECK (((years_experience IS NULL) OR ((years_experience >= 0) AND (years_experience <= 60)))),
  constraint experts_pkey PRIMARY KEY (id),
  constraint experts_email_key UNIQUE (email)
);

create table if not exists leaders.grid_cells (
  dimension text not null,
  level text not null,
  description_ar text,
  updated_at timestamp with time zone default now() not null,
  path_title_ar text,
  constraint grid_cells_pkey PRIMARY KEY (dimension, level)
);

create table if not exists leaders.handbook_exports (
  id bigint generated always as identity not null,
  ref text not null,
  participant_id uuid not null,
  chapters smallint not null,
  ip inet,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  constraint handbook_exports_ref_check CHECK ((ref ~ '^MI-BK-[0-9]{8}-[0-9A-Z]{5}$'::text)),
  constraint handbook_exports_pkey PRIMARY KEY (id),
  constraint handbook_exports_ref_key UNIQUE (ref)
);

create table if not exists leaders.handbook_modules (
  id uuid default gen_random_uuid() not null,
  dimension text not null,
  chapter_key text not null,
  sort smallint not null,
  title_ar text not null,
  min_level text not null,
  body_md text,
  reflection_ar text,
  quiz_md text,
  constraint handbook_modules_pkey PRIMARY KEY (id),
  constraint handbook_modules_dimension_chapter_key_key UNIQUE (dimension, chapter_key)
);

create table if not exists leaders.handbook_progress (
  participant_id uuid not null,
  module_id uuid not null,
  completed_at timestamp with time zone default now() not null,
  quiz_score smallint default 0 not null,
  quiz_total smallint default 0 not null,
  reflection text,
  constraint handbook_progress_reflection_check CHECK (((reflection IS NULL) OR (char_length(reflection) <= 4000))),
  constraint handbook_progress_pkey PRIMARY KEY (participant_id, module_id)
);

create table if not exists leaders.handbook_views (
  id bigint generated always as identity not null,
  participant_id uuid not null,
  module_id uuid,
  page_no smallint,
  ip inet,
  user_agent text,
  viewed_at timestamp with time zone default now() not null,
  constraint handbook_views_pkey PRIMARY KEY (id)
);

create table if not exists leaders.instruments (
  id uuid default gen_random_uuid() not null,
  key text not null,
  title_ar text not null,
  kind text not null,
  active boolean default false not null,
  created_at timestamp with time zone default now() not null,
  version smallint default 1 not null,
  intro_ar text,
  est_minutes smallint,
  pairs_with text,
  constraint instruments_kind_check CHECK ((kind = ANY (ARRAY['baseline'::text, 'post'::text, 'final'::text]))),
  constraint instruments_pkey PRIMARY KEY (id),
  constraint instruments_key_key UNIQUE (key)
);

create table if not exists leaders.journey_stages (
  key text not null,
  sort smallint not null,
  title_ar text not null,
  duration_label text not null,
  duration_days smallint not null,
  description_ar text,
  active boolean default true not null,
  activities_ar text,
  outcome_ar text,
  phase text,
  mode text,
  mode_note_ar text,
  builds_on_ar text,
  program_id uuid not null,
  constraint journey_stages_mode_check CHECK ((mode = ANY (ARRAY['in_person'::text, 'online'::text, 'hybrid'::text, 'self'::text]))),
  constraint journey_stages_phase_check CHECK ((phase = ANY (ARRAY['admission'::text, 'qualification'::text, 'impact'::text]))),
  constraint journey_stages_pkey PRIMARY KEY (program_id, key)
);

create table if not exists leaders.lab_attempts (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  item_id uuid not null,
  current smallint default 0 not null,
  path smallint[] default '{}'::smallint[] not null,
  answers jsonb default '{}'::jsonb not null,
  results jsonb default '{}'::jsonb not null,
  pct smallint,
  started_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  constraint lab_attempts_pct_check CHECK (((pct IS NULL) OR ((pct >= 0) AND (pct <= 100)))),
  constraint lab_attempts_pkey PRIMARY KEY (id)
);

create table if not exists leaders.lab_grants (
  id uuid default gen_random_uuid() not null,
  organization_id uuid,
  participant_id uuid,
  item_id uuid,
  expires_at timestamp with time zone,
  created_by text,
  created_at timestamp with time zone default now() not null,
  constraint lab_grants_check CHECK (((organization_id IS NULL) <> (participant_id IS NULL))),
  constraint lab_grants_pkey PRIMARY KEY (id)
);

create table if not exists leaders.lab_items (
  id uuid default gen_random_uuid() not null,
  key text not null,
  kind text not null,
  dimension text not null,
  chapter_key text,
  sort smallint default 1 not null,
  min_level text default 'beginner'::text not null,
  minutes smallint default 10 not null,
  points smallint default 30 not null,
  title_ar text not null,
  summary_ar text,
  spec jsonb not null,
  active boolean default true not null,
  audience text default 'granted'::text not null,
  updated_at timestamp with time zone default now() not null,
  constraint lab_items_audience_check CHECK ((audience = ANY (ARRAY['granted'::text, 'all'::text]))),
  constraint lab_items_key_check CHECK ((key ~ '^[a-z0-9-]{2,60}$'::text)),
  constraint lab_items_kind_check CHECK ((kind = ANY (ARRAY['tool'::text, 'scenario'::text]))),
  constraint lab_items_minutes_check CHECK (((minutes >= 1) AND (minutes <= 120))),
  constraint lab_items_points_check CHECK (((points >= 0) AND (points <= 500))),
  constraint lab_items_summary_ar_check CHECK ((char_length(summary_ar) <= 1000)),
  constraint lab_items_title_ar_check CHECK ((char_length(title_ar) <= 200)),
  constraint lab_items_pkey PRIMARY KEY (id),
  constraint lab_items_key_key UNIQUE (key)
);

create table if not exists leaders.learning_models (
  id uuid default gen_random_uuid() not null,
  dimension text not null,
  key text not null,
  sort smallint default 1 not null,
  title_ar text not null,
  icon text,
  summary_ar text,
  when_ar text,
  steps_ar text,
  source_ar text,
  min_level text default 'beginner'::text not null,
  points smallint default 30 not null,
  fields jsonb default '[]'::jsonb not null,
  active boolean default true not null,
  updated_at timestamp with time zone default now() not null,
  capstone_sort smallint,
  scopes text[] default '{}'::text[] not null,
  constraint learning_models_key_check CHECK ((key ~ '^[a-z0-9-]{2,60}$'::text)),
  constraint learning_models_points_check CHECK (((points >= 0) AND (points <= 500))),
  constraint learning_models_pkey PRIMARY KEY (id),
  constraint learning_models_key_key UNIQUE (key)
);

create table if not exists leaders.levels (
  key text not null,
  title_ar text not null,
  title_en text not null,
  sort smallint not null,
  constraint levels_key_check CHECK ((key = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))),
  constraint levels_pkey PRIMARY KEY (key)
);

create table if not exists leaders.model_submissions (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  model_id uuid not null,
  answers jsonb default '{}'::jsonb not null,
  status text default 'draft'::text not null,
  rating smallint,
  feedback_ar text,
  bonus smallint default 0 not null,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewed_by text,
  updated_at timestamp with time zone default now() not null,
  constraint model_submissions_bonus_check CHECK (((bonus >= 0) AND (bonus <= 100))),
  constraint model_submissions_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5)))),
  constraint model_submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'reviewed'::text, 'returned'::text]))),
  constraint model_submissions_pkey PRIMARY KEY (id),
  constraint model_submissions_participant_id_model_id_key UNIQUE (participant_id, model_id)
);

create table if not exists leaders.org_coordinators (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  email text not null,
  full_name text,
  phone text,
  status text default 'invited'::text not null,
  permissions jsonb default '{"export": true, "scores": false, "contact": false}'::jsonb not null,
  weekly_report boolean default true not null,
  invited_at timestamp with time zone,
  last_login_at timestamp with time zone,
  last_report_at timestamp with time zone,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  template text default 'program'::text not null,
  expires_at timestamp with time zone,
  constraint org_coordinators_email_check CHECK (((email = lower(email)) AND (char_length(email) <= 254))),
  constraint org_coordinators_full_name_check CHECK (((full_name IS NULL) OR (char_length(full_name) <= 120))),
  constraint org_coordinators_phone_check CHECK (((phone IS NULL) OR (char_length(phone) <= 30))),
  constraint org_coordinators_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text]))),
  constraint org_coordinators_template_check CHECK ((template = ANY (ARRAY['executive'::text, 'program'::text, 'hr'::text, 'custom'::text]))),
  constraint org_coordinators_pkey PRIMARY KEY (id)
);

create table if not exists leaders.organizations (
  id uuid default gen_random_uuid() not null,
  name text not null,
  sector text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text default 'active'::text not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  seats integer,
  invite_code text,
  color text,
  short_name text,
  domains text[] default '{}'::text[] not null,
  name_en text,
  logo text,
  cert_cobrand boolean default true not null,
  cert jsonb default '{}'::jsonb not null,
  delivery_default text,
  has_logo boolean generated always as ((logo IS NOT NULL)) stored,
  constraint organizations_cert_check CHECK (((jsonb_typeof(cert) = 'object'::text) AND (pg_column_size(cert) <= 320000))),
  constraint organizations_color_check CHECK (((color IS NULL) OR (color ~ '^#[0-9A-Fa-f]{6}$'::text))),
  constraint organizations_delivery_default_check CHECK (((delivery_default IS NULL) OR (delivery_default = ANY (ARRAY['in_person'::text, 'online'::text])))),
  constraint organizations_logo_check CHECK (((logo IS NULL) OR ((logo ~~ 'data:image/png;base64,%'::text) AND (char_length(logo) <= 600000)))),
  constraint organizations_name_check CHECK ((char_length(name) <= 200)),
  constraint organizations_name_en_check CHECK (((name_en IS NULL) OR (char_length(name_en) <= 200))),
  constraint organizations_seats_check CHECK (((seats IS NULL) OR ((seats >= 0) AND (seats <= 100000)))),
  constraint organizations_short_name_check CHECK (((short_name IS NULL) OR (char_length(short_name) <= 40))),
  constraint organizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
  constraint organizations_pkey PRIMARY KEY (id)
);

create table if not exists leaders.participant_requirements (
  participant_id uuid not null,
  requirement_id uuid not null,
  status text default 'pending'::text not null,
  evidence_path text,
  note text,
  completed_at timestamp with time zone,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  constraint participant_requirements_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'done'::text, 'returned'::text]))),
  constraint participant_requirements_pkey PRIMARY KEY (participant_id, requirement_id)
);

create table if not exists leaders.participants (
  id uuid default gen_random_uuid() not null,
  email text not null,
  full_name text not null,
  phone text,
  job_title text,
  organization_id uuid,
  organization_name text,
  status text default 'registered'::text not null,
  email_verified_at timestamp with time zone,
  passkey_prompted_at timestamp with time zone,
  passkey_dismissed_at timestamp with time zone,
  last_login_at timestamp with time zone,
  person_id uuid,
  contact_request_id text,
  source text default 'self'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  sector text,
  years_experience smallint,
  bio text,
  cv_path text,
  linkedin_url text,
  profile_completed_at timestamp with time zone,
  org_via text,
  campaign text,
  referrer_host text,
  reminded_at timestamp with time zone,
  name_en text,
  name_locked_at timestamp with time zone,
  work_scope text,
  constraint participants_bio_check CHECK ((char_length(bio) <= 2000)),
  constraint participants_campaign_check CHECK (((campaign IS NULL) OR (campaign ~ '^[a-z0-9_-]{1,40}$'::text))),
  constraint participants_email_check CHECK ((char_length(email) <= 254)),
  constraint participants_full_name_check CHECK ((char_length(full_name) <= 120)),
  constraint participants_job_title_check CHECK ((char_length(job_title) <= 120)),
  constraint participants_linkedin_url_check CHECK ((char_length(linkedin_url) <= 300)),
  constraint participants_name_en_check CHECK (((name_en IS NULL) OR (char_length(name_en) <= 120))),
  constraint participants_org_via_check CHECK (((org_via IS NULL) OR (org_via = ANY (ARRAY['link'::text, 'domain'::text, 'admin'::text])))),
  constraint participants_organization_name_check CHECK ((char_length(organization_name) <= 200)),
  constraint participants_phone_check CHECK ((char_length(phone) <= 20)),
  constraint participants_referrer_host_check CHECK (((referrer_host IS NULL) OR (char_length(referrer_host) <= 120))),
  constraint participants_sector_check CHECK ((char_length(sector) <= 120)),
  constraint participants_source_check CHECK ((source = ANY (ARRAY['self'::text, 'admin'::text, 'import'::text, 'contact'::text, 'invite'::text]))),
  constraint participants_status_check CHECK ((status = ANY (ARRAY['registered'::text, 'profiled'::text, 'assessing'::text, 'pending_approval'::text, 'placed'::text, 'enrolled'::text, 'completed'::text, 'withdrawn'::text, 'suspended'::text]))),
  constraint participants_work_scope_check CHECK (((work_scope IS NULL) OR (work_scope = ANY (ARRAY['project'::text, 'program'::text, 'portfolio'::text])))),
  constraint participants_years_experience_check CHECK (((years_experience >= 0) AND (years_experience <= 60))),
  constraint participants_pkey PRIMARY KEY (id)
);

create table if not exists leaders.passkeys (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  credential_id text not null,
  public_key bytea not null,
  sign_count bigint default 0 not null,
  transports text[],
  aaguid text,
  backed_up boolean default false not null,
  device_label text,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone,
  constraint passkeys_device_label_check CHECK ((char_length(device_label) <= 80)),
  constraint passkeys_pkey PRIMARY KEY (id),
  constraint passkeys_credential_id_key UNIQUE (credential_id)
);

create table if not exists leaders.placement_model (
  id smallint default 1 not null,
  w_knowledge numeric(5,2) default 35 not null,
  w_skill numeric(5,2) default 50 not null,
  w_behavior numeric(5,2) default 15 not null,
  min_intermediate numeric(5,2) default 55 not null,
  min_advanced numeric(5,2) default 80 not null,
  floor_intermediate numeric(5,2) default 40 not null,
  floor_advanced numeric(5,2) default 60 not null,
  borderline numeric(5,2) default 8 not null,
  updated_at timestamp with time zone default now() not null,
  rci_reliability numeric(4,2) default 0.75 not null,
  rci_sd numeric(5,2) default 15 not null,
  impact_min_n smallint default 50 not null,
  rater_threshold numeric(5,2) default 15 not null,
  min_behavior_items smallint default 3 not null,
  rci_practice numeric(5,2) default 0 not null,
  constraint placement_model_borderline_check CHECK (((borderline >= (0)::numeric) AND (borderline <= (30)::numeric))),
  constraint placement_model_check CHECK ((min_advanced > min_intermediate)),
  constraint placement_model_check1 CHECK ((((w_knowledge + w_skill) + w_behavior) > (0)::numeric)),
  constraint placement_model_floor_advanced_check CHECK (((floor_advanced >= (0)::numeric) AND (floor_advanced <= (100)::numeric))),
  constraint placement_model_floor_intermediate_check CHECK (((floor_intermediate >= (0)::numeric) AND (floor_intermediate <= (100)::numeric))),
  constraint placement_model_id_check CHECK ((id = 1)),
  constraint placement_model_impact_min_n_check CHECK ((impact_min_n >= 5)),
  constraint placement_model_min_advanced_check CHECK (((min_advanced >= (0)::numeric) AND (min_advanced <= (100)::numeric))),
  constraint placement_model_min_behavior_items_check CHECK (((min_behavior_items >= 0) AND (min_behavior_items <= 10))),
  constraint placement_model_min_intermediate_check CHECK (((min_intermediate >= (0)::numeric) AND (min_intermediate <= (100)::numeric))),
  constraint placement_model_rater_threshold_check CHECK (((rater_threshold >= (0)::numeric) AND (rater_threshold <= (50)::numeric))),
  constraint placement_model_rci_practice_check CHECK (((rci_practice >= (0)::numeric) AND (rci_practice <= (30)::numeric))),
  constraint placement_model_rci_reliability_check CHECK (((rci_reliability > (0)::numeric) AND (rci_reliability < (1)::numeric))),
  constraint placement_model_rci_sd_check CHECK ((rci_sd > (0)::numeric)),
  constraint placement_model_w_behavior_check CHECK ((w_behavior >= (0)::numeric)),
  constraint placement_model_w_knowledge_check CHECK ((w_knowledge >= (0)::numeric)),
  constraint placement_model_w_skill_check CHECK ((w_skill >= (0)::numeric)),
  constraint placement_model_pkey PRIMARY KEY (id)
);

create table if not exists leaders.placements (
  participant_id uuid not null,
  dimension text not null,
  level text not null,
  source text not null,
  assessment_id uuid,
  decided_by text,
  decided_at timestamp with time zone default now() not null,
  approved_at timestamp with time zone,
  approved_by text,
  admin_note text,
  constraint placements_source_check CHECK ((source = ANY (ARRAY['assessment'::text, 'admin'::text]))),
  constraint placements_pkey PRIMARY KEY (participant_id, dimension)
);

create table if not exists leaders.points_ledger (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  source text not null,
  ref_id uuid,
  points smallint not null,
  note text,
  created_at timestamp with time zone default now() not null,
  constraint points_ledger_source_check CHECK ((source = ANY (ARRAY['chapter'::text, 'model'::text, 'review'::text, 'bonus'::text, 'lab'::text, 'lab_bonus'::text, 'capstone'::text]))),
  constraint points_ledger_pkey PRIMARY KEY (id),
  constraint points_ledger_participant_id_source_ref_id_key UNIQUE (participant_id, source, ref_id)
);

create table if not exists leaders.program_versions (
  id uuid default gen_random_uuid() not null,
  program_id uuid not null,
  number integer not null,
  label text not null,
  data jsonb not null,
  created_by text,
  created_at timestamp with time zone default now() not null,
  constraint program_versions_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 160))),
  constraint program_versions_number_check CHECK ((number > 0)),
  constraint program_versions_pkey PRIMARY KEY (id),
  constraint program_versions_program_id_number_key UNIQUE (program_id, number)
);

create table if not exists leaders.programs (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description_ar text,
  is_default boolean default false not null,
  archived_at timestamp with time zone,
  created_by text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  cert jsonb default '{}'::jsonb not null,
  constraint programs_check CHECK ((NOT (is_default AND (archived_at IS NOT NULL)))),
  constraint programs_description_ar_check CHECK ((char_length(description_ar) <= 2000)),
  constraint programs_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  constraint programs_pkey PRIMARY KEY (id)
);

create table if not exists leaders.questions (
  id uuid default gen_random_uuid() not null,
  instrument_id uuid not null,
  dimension text not null,
  code text not null,
  text_ar text not null,
  help_ar text,
  kind text default 'likert'::text not null,
  options jsonb,
  weight numeric(5,2) default 1 not null,
  sort smallint default 0 not null,
  active boolean default true not null,
  tier text default 'knowledge'::text not null,
  competency_ar text,
  chapter_key text,
  anchor_code text,
  retro boolean default false not null,
  text_rater_ar text,
  form text,
  constraint questions_form_check CHECK ((form = ANY (ARRAY['A'::text, 'B'::text]))),
  constraint questions_kind_check CHECK ((kind = ANY (ARRAY['likert'::text, 'choice'::text, 'text'::text]))),
  constraint questions_tier_check CHECK ((tier = ANY (ARRAY['knowledge'::text, 'skill'::text, 'behavior'::text, 'transfer'::text]))),
  constraint questions_pkey PRIMARY KEY (id),
  constraint questions_instrument_id_code_key UNIQUE (instrument_id, code)
);

create table if not exists leaders.raters (
  id uuid default gen_random_uuid() not null,
  participant_id uuid not null,
  instrument_id uuid not null,
  email text not null,
  full_name text,
  relation text default 'manager'::text not null,
  token_hash text not null,
  status text default 'invited'::text not null,
  answers jsonb,
  comment text,
  invited_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '30 days'::interval) not null,
  opened_at timestamp with time zone,
  submitted_at timestamp with time zone,
  phase text default 'post'::text not null,
  constraint raters_comment_check CHECK (((comment IS NULL) OR (char_length(comment) <= 2000))),
  constraint raters_email_check CHECK (((email = lower(email)) AND (char_length(email) <= 254))),
  constraint raters_full_name_check CHECK (((full_name IS NULL) OR (char_length(full_name) <= 120))),
  constraint raters_phase_check CHECK ((phase = ANY (ARRAY['pre'::text, 'post'::text]))),
  constraint raters_relation_check CHECK ((relation = ANY (ARRAY['manager'::text, 'peer'::text, 'report'::text]))),
  constraint raters_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'submitted'::text, 'revoked'::text]))),
  constraint raters_pkey PRIMARY KEY (id),
  constraint raters_participant_email_phase_key UNIQUE (participant_id, email, phase),
  constraint raters_token_hash_key UNIQUE (token_hash)
);

create table if not exists leaders.reading_progress (
  participant_id uuid not null,
  module_id uuid not null,
  words integer default 0 not null,
  active_seconds integer default 0 not null,
  slices smallint[] default '{}'::smallint[] not null,
  first_at timestamp with time zone default now() not null,
  last_ping_at timestamp with time zone,
  constraint reading_progress_pkey PRIMARY KEY (participant_id, module_id)
);

create table if not exists leaders.reports (
  id uuid default gen_random_uuid() not null,
  participant_id uuid,
  organization_id uuid,
  kind text not null,
  title_ar text not null,
  file_path text,
  issued_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint reports_check CHECK (((participant_id IS NOT NULL) OR (organization_id IS NOT NULL))),
  constraint reports_kind_check CHECK ((kind = ANY (ARRAY['individual'::text, 'institutional'::text]))),
  constraint reports_pkey PRIMARY KEY (id)
);

create table if not exists leaders.stage_requirements (
  id uuid default gen_random_uuid() not null,
  stage_key text not null,
  dimension text,
  level text,
  code text not null,
  sort smallint default 0 not null,
  title_ar text not null,
  help_ar text,
  kind text default 'check'::text not null,
  required boolean default true not null,
  needs_review boolean default false not null,
  active boolean default true not null,
  config jsonb default '{}'::jsonb not null,
  program_id uuid not null,
  constraint stage_requirements_check CHECK (((level IS NULL) OR (dimension IS NOT NULL))),
  constraint stage_requirements_kind_check CHECK ((kind = ANY (ARRAY['check'::text, 'upload'::text, 'form'::text, 'meeting'::text, 'reading'::text, 'auto'::text, 'video'::text, 'workshop'::text, 'coaching'::text, 'curriculum'::text, 'model'::text, 'capstone'::text]))),
  constraint stage_requirements_pkey PRIMARY KEY (id),
  constraint stage_requirements_program_code_key UNIQUE (program_id, code)
);

create table if not exists leaders.tracks (
  key text not null,
  milestone_level text not null,
  impact_level text not null,
  leadership_level text not null,
  sort integer default 0 not null,
  priority_dimension text,
  title_ar text not null,
  summary_ar text,
  focus_ar text,
  project_ar text,
  journey_ar text,
  updated_at timestamp with time zone default now() not null,
  title_en text,
  constraint tracks_key_check CHECK ((key ~ '^M[1-3]I[1-3]L[1-3]$'::text)),
  constraint tracks_title_en_check CHECK (((title_en IS NULL) OR (char_length(title_en) <= 200))),
  constraint tracks_pkey PRIMARY KEY (key),
  constraint tracks_milestone_level_impact_level_leadership_level_key UNIQUE (milestone_level, impact_level, leadership_level)
);

create table if not exists leaders.video_progress (
  participant_id uuid not null,
  requirement_id uuid not null,
  duration numeric default 0 not null,
  ranges jsonb default '[]'::jsonb not null,
  watched_seconds numeric default 0 not null,
  last_ping_at timestamp with time zone,
  completed_at timestamp with time zone,
  constraint video_progress_pkey PRIMARY KEY (participant_id, requirement_id)
);

create table if not exists leaders.webauthn_challenges (
  id uuid default gen_random_uuid() not null,
  participant_id uuid,
  challenge text not null,
  purpose text not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint webauthn_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['register'::text, 'authenticate'::text]))),
  constraint webauthn_challenges_pkey PRIMARY KEY (id),
  constraint webauthn_challenges_challenge_key UNIQUE (challenge)
);

create table if not exists leaders.workshop_attendance (
  session_id uuid not null,
  participant_id uuid not null,
  checked_in_at timestamp with time zone default now() not null,
  method text not null,
  recorded_by text,
  ip inet,
  user_agent text,
  constraint workshop_attendance_method_check CHECK ((method = ANY (ARRAY['qr'::text, 'manual'::text, 'join'::text]))),
  constraint workshop_attendance_pkey PRIMARY KEY (session_id, participant_id)
);

create table if not exists leaders.workshop_sessions (
  id uuid default gen_random_uuid() not null,
  requirement_id uuid not null,
  title_ar text not null,
  location_ar text,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  secret text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  mode text default 'in_person'::text not null,
  join_url text,
  cohort_id uuid,
  constraint workshop_sessions_check CHECK ((ends_at > starts_at)),
  constraint workshop_sessions_join_url_check CHECK ((char_length(join_url) <= 500)),
  constraint workshop_sessions_location_ar_check CHECK ((char_length(location_ar) <= 300)),
  constraint workshop_sessions_mode_check CHECK ((mode = ANY (ARRAY['in_person'::text, 'online'::text]))),
  constraint workshop_sessions_title_ar_check CHECK ((char_length(title_ar) <= 200)),
  constraint workshop_sessions_pkey PRIMARY KEY (id)
);

create table if not exists public.admin_audit_log (
  id bigint default nextval('admin_audit_log_id_seq'::regclass) not null,
  user_id uuid,
  user_email text,
  action text not null,
  target_table text,
  target_id text,
  meta jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now() not null,
  constraint admin_audit_log_pkey PRIMARY KEY (id)
);

create table if not exists public.admin_passkeys (
  id uuid default gen_random_uuid() not null,
  admin_id uuid not null,
  credential_id text not null,
  public_key bytea not null,
  sign_count bigint default 0 not null,
  transports text[],
  aaguid text,
  backed_up boolean default false not null,
  device_label text,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone,
  constraint admin_passkeys_device_label_check CHECK ((char_length(device_label) <= 80)),
  constraint admin_passkeys_pkey PRIMARY KEY (id),
  constraint admin_passkeys_credential_id_key UNIQUE (credential_id)
);

create table if not exists public.admin_role_permissions (
  id integer default nextval('admin_role_permissions_id_seq'::regclass) not null,
  role_id text not null,
  system text not null,
  permission text not null,
  created_at timestamp with time zone default now() not null,
  constraint admin_role_permissions_pkey PRIMARY KEY (id),
  constraint admin_role_permissions_role_id_system_permission_key UNIQUE (role_id, system, permission)
);

create table if not exists public.admin_roles (
  id text not null,
  name_ar text not null,
  description text,
  created_at timestamp with time zone default now() not null,
  constraint admin_roles_pkey PRIMARY KEY (id)
);

create table if not exists public.admin_users (
  id uuid not null,
  email text not null,
  name text not null,
  role_id text not null,
  is_active boolean default true not null,
  last_login timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  totp_secret text,
  totp_enabled boolean default false,
  is_owner boolean default false not null,
  passkey_only boolean default false not null,
  constraint admin_users_pkey PRIMARY KEY (id),
  constraint admin_users_email_key UNIQUE (email)
);

create table if not exists public.api_sessions (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  kind text not null,
  subject text not null,
  meta jsonb default '{}'::jsonb not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now() not null,
  constraint api_sessions_kind_check CHECK ((kind = ANY (ARRAY['user'::text, 'admin'::text]))),
  constraint api_sessions_pkey PRIMARY KEY (id),
  constraint api_sessions_token_hash_key UNIQUE (token_hash)
);

create table if not exists public.app_content (
  key text not null,
  value text not null,
  description text,
  updated_at timestamp with time zone default now(),
  constraint app_content_pkey PRIMARY KEY (key)
);

create table if not exists public.contact_requests (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  product text not null,
  source_url text,
  name text not null,
  organization text not null,
  email text not null,
  phone text not null,
  interest text not null,
  interest_label text,
  context text,
  user_agent text,
  language text,
  status text default 'new'::text not null,
  constraint contact_requests_email_chk CHECK (((char_length(email) <= 254) AND (email ~* '^[^@\s<>"''();,]+@[^@\s<>"''();,]+\.[a-z]{2,}$'::text))) NOT VALID,
  constraint contact_requests_len_chk CHECK (((char_length(product) <= 40) AND ((char_length(name) >= 1) AND (char_length(name) <= 120)) AND (char_length(organization) <= 200) AND (char_length(interest) <= 40) AND (COALESCE(char_length(interest_label), 0) <= 200) AND (COALESCE(char_length(context), 0) <= 4000) AND (COALESCE(char_length(source_url), 0) <= 1024) AND (COALESCE(char_length(user_agent), 0) <= 512) AND (COALESCE(char_length(language), 0) <= 35))) NOT VALID,
  constraint contact_requests_phone_chk CHECK ((phone ~ '^[0-9٠-٩+() -]{0,30}$'::text)) NOT VALID,
  constraint contact_requests_status_chk CHECK ((status = ANY (ARRAY['new'::text, 'read'::text, 'replied'::text, 'archived'::text]))) NOT VALID,
  constraint contact_requests_pkey PRIMARY KEY (id)
);

create table if not exists public.email_otps (
  id integer default nextval('email_otps_id_seq'::regclass) not null,
  email text not null,
  otp_code text not null,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone default (now() + '00:10:00'::interval),
  verified boolean default false,
  constraint email_otps_pkey PRIMARY KEY (id)
);

create table if not exists public.mail_log (
  id bigint generated always as identity not null,
  kind text not null,
  ref text not null,
  created_at timestamp with time zone default now() not null,
  constraint mail_log_kind_check CHECK ((kind = ANY (ARRAY['notify'::text, 'confirm'::text]))),
  constraint mail_log_pkey PRIMARY KEY (id),
  constraint mail_log_kind_ref_key UNIQUE (kind, ref)
);

create table if not exists public.page_views (
  id bigint generated always as identity not null,
  site text not null,
  path text not null,
  title text,
  referrer text,
  visit_id text not null,
  device text,
  lang text,
  created_at timestamp with time zone default now() not null,
  constraint page_views_pkey PRIMARY KEY (id)
);

create table if not exists public.planner_heartbeat (
  id smallint default 1 not null,
  last_ping timestamp with time zone default now() not null,
  pings bigint default 0 not null,
  constraint planner_heartbeat_one_row CHECK ((id = 1)),
  constraint planner_heartbeat_pkey PRIMARY KEY (id)
);

create table if not exists public.planner_links (
  id uuid default gen_random_uuid() not null,
  project_id text not null,
  source text not null,
  external_id text not null,
  external_label text,
  sync_snapshot jsonb,
  synced_at timestamp with time zone,
  owner uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  constraint planner_links_source_check CHECK ((source = ANY (ARRAY['manzuma'::text, 'mi_product'::text, 'other'::text]))),
  constraint planner_links_pkey PRIMARY KEY (id),
  constraint planner_links_project_id_source_external_id_key UNIQUE (project_id, source, external_id)
);

create table if not exists public.planner_login_otps (
  id uuid default gen_random_uuid() not null,
  email text not null,
  otp_code text not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  verified boolean default false not null,
  ip_address text,
  constraint planner_login_otps_pkey PRIMARY KEY (id)
);

create table if not exists public.planner_master_links (
  master_id text not null,
  plan_id text not null,
  created_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  constraint planner_master_links_not_self CHECK ((master_id <> plan_id)),
  constraint planner_master_links_pkey PRIMARY KEY (master_id, plan_id)
);

create table if not exists public.planner_otp_attempts (
  id uuid default gen_random_uuid() not null,
  email text not null,
  success boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint planner_otp_attempts_pkey PRIMARY KEY (id)
);

create table if not exists public.planner_plan_summaries (
  project_id text not null,
  summary jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint planner_plan_summaries_pkey PRIMARY KEY (project_id)
);

create table if not exists public.planner_profiles (
  id uuid not null,
  email text not null,
  status text default 'pending'::text not null,
  role text default 'member'::text not null,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint planner_profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manzuma'::text, 'member'::text]))),
  constraint planner_profiles_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  constraint planner_profiles_pkey PRIMARY KEY (id)
);

create table if not exists public.planner_project_shares (
  id uuid default gen_random_uuid() not null,
  project_id text not null,
  shared_with uuid not null,
  permission text default 'view'::text not null,
  shared_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint planner_project_shares_permission_check CHECK ((permission = ANY (ARRAY['view'::text, 'edit'::text]))),
  constraint planner_project_shares_pkey PRIMARY KEY (id),
  constraint planner_project_shares_project_id_shared_with_key UNIQUE (project_id, shared_with)
);

create table if not exists public.planner_projects (
  id text not null,
  name text default ''::text not null,
  data jsonb not null,
  schema_version integer default 2 not null,
  updated bigint default 0 not null,
  owner uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  origin text default 'native'::text not null,
  constraint planner_projects_origin_check CHECK ((origin = ANY (ARRAY['native'::text, 'manzuma'::text]))),
  constraint planner_projects_pkey PRIMARY KEY (id)
);

create table if not exists public.planner_resources (
  id text not null,
  data jsonb not null,
  updated bigint default 0 not null,
  owner uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint planner_resources_pkey PRIMARY KEY (id)
);

create table if not exists public.process_details (
  id integer default nextval('process_details_id_seq'::regclass) not null,
  process_key text not null,
  track_id text not null,
  phase_id integer not null,
  name_ar text not null,
  description text not null,
  insight text not null,
  why_it_matters text not null,
  outputs text[] not null,
  duration text not null,
  feeds text[] default '{}'::text[],
  fed_by text[] default '{}'::text[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint process_details_pkey PRIMARY KEY (id),
  constraint process_details_process_key_key UNIQUE (process_key)
);

create table if not exists public.registrations (
  id text not null,
  name text not null,
  phone text not null,
  email text not null,
  "registeredAt" timestamp with time zone default now(),
  dates jsonb default '{}'::jsonb,
  confirmed jsonb default '{}'::jsonb,
  submitted boolean default false,
  "submittedAt" timestamp with time zone,
  "reopenRequested" boolean default false,
  demographic_analysis jsonb,
  constraint registrations_pkey PRIMARY KEY (id)
);

create table if not exists public.reports (
  id integer default nextval('reports_id_seq'::regclass) not null,
  registration_id text not null,
  pattern_type text not null,
  pattern_name_ar text not null,
  pattern_description text not null,
  track_coverage jsonb default '{}'::jsonb,
  phase_coverage jsonb default '{}'::jsonb,
  weight_balance jsonb default '{}'::jsonb,
  readiness_level text not null,
  readiness_label_ar text not null,
  recommendations jsonb default '[]'::jsonb,
  dependency_gaps jsonb default '[]'::jsonb,
  booking_snapshot jsonb default '{}'::jsonb,
  dimensions jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  constraint reports_pkey PRIMARY KEY (id)
);

create table if not exists public.totp_attempts (
  id uuid default gen_random_uuid() not null,
  email text not null,
  success boolean default false not null,
  ip text,
  created_at timestamp with time zone default now(),
  constraint totp_attempts_pkey PRIMARY KEY (id)
);

create table if not exists public.user_passkeys (
  id uuid default gen_random_uuid() not null,
  registration_id text not null,
  credential_id text not null,
  public_key bytea not null,
  sign_count bigint default 0 not null,
  transports text[],
  aaguid text,
  backed_up boolean default false not null,
  device_label text,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone,
  constraint user_passkeys_device_label_check CHECK ((char_length(device_label) <= 80)),
  constraint user_passkeys_pkey PRIMARY KEY (id),
  constraint user_passkeys_credential_id_key UNIQUE (credential_id)
);

create table if not exists public.webauthn_challenges (
  id uuid default gen_random_uuid() not null,
  scope text not null,
  purpose text not null,
  subject text,
  challenge text not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint webauthn_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['register'::text, 'authenticate'::text]))),
  constraint webauthn_challenges_scope_check CHECK ((scope = ANY (ARRAY['admin'::text, 'user'::text]))),
  constraint webauthn_challenges_pkey PRIMARY KEY (id),
  constraint webauthn_challenges_challenge_key UNIQUE (challenge)
);

do $$ begin
  alter table leaders.assessment_answers add constraint assessment_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES leaders.questions(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.assessment_answers add constraint assessment_answers_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES leaders.assessments(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.assessment_results add constraint assessment_results_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES leaders.assessments(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.assessment_results add constraint assessment_results_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.assessment_results add constraint assessment_results_level_fkey FOREIGN KEY (level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.assessments add constraint assessments_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.assessments add constraint assessments_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES leaders.instruments(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.auth_sessions add constraint auth_sessions_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.capstones add constraint capstones_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.certificates add constraint certificates_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES leaders.certificates(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.certificates add constraint certificates_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE RESTRICT;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.coaching_sessions add constraint coaching_sessions_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.coaching_sessions add constraint coaching_sessions_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES leaders.experts(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.coaching_sessions add constraint coaching_sessions_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES leaders.stage_requirements(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.cohorts add constraint cohorts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES leaders.organizations(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.cohorts add constraint cohorts_program_version_id_fkey FOREIGN KEY (program_version_id) REFERENCES leaders.program_versions(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.cohorts add constraint cohorts_program_id_fkey FOREIGN KEY (program_id) REFERENCES leaders.programs(id) ON DELETE RESTRICT;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.content_progress add constraint content_progress_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.content_progress add constraint content_progress_item_id_fkey FOREIGN KEY (item_id) REFERENCES leaders.content_items(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.coordinator_challenges add constraint coordinator_challenges_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES leaders.org_coordinators(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.coordinator_sessions add constraint coordinator_sessions_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES leaders.org_coordinators(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.enrollments add constraint enrollments_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.enrollments add constraint enrollments_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES leaders.cohorts(id) ON DELETE RESTRICT;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.expert_requests add constraint expert_requests_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.expert_requests add constraint expert_requests_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES leaders.experts(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.grid_cells add constraint grid_cells_level_fkey FOREIGN KEY (level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.grid_cells add constraint grid_cells_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.handbook_exports add constraint handbook_exports_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.handbook_modules add constraint handbook_modules_min_level_fkey FOREIGN KEY (min_level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.handbook_modules add constraint handbook_modules_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.handbook_progress add constraint handbook_progress_module_id_fkey FOREIGN KEY (module_id) REFERENCES leaders.handbook_modules(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.handbook_progress add constraint handbook_progress_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.handbook_views add constraint handbook_views_module_id_fkey FOREIGN KEY (module_id) REFERENCES leaders.handbook_modules(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.handbook_views add constraint handbook_views_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.journey_stages add constraint journey_stages_program_id_fkey FOREIGN KEY (program_id) REFERENCES leaders.programs(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.lab_attempts add constraint lab_attempts_item_id_fkey FOREIGN KEY (item_id) REFERENCES leaders.lab_items(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.lab_attempts add constraint lab_attempts_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.lab_grants add constraint lab_grants_item_id_fkey FOREIGN KEY (item_id) REFERENCES leaders.lab_items(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.lab_grants add constraint lab_grants_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.lab_grants add constraint lab_grants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES leaders.organizations(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.lab_items add constraint lab_items_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.lab_items add constraint lab_items_min_level_fkey FOREIGN KEY (min_level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.learning_models add constraint learning_models_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.learning_models add constraint learning_models_min_level_fkey FOREIGN KEY (min_level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.model_submissions add constraint model_submissions_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.model_submissions add constraint model_submissions_model_id_fkey FOREIGN KEY (model_id) REFERENCES leaders.learning_models(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.org_coordinators add constraint org_coordinators_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES leaders.organizations(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.participant_requirements add constraint participant_requirements_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES leaders.stage_requirements(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.participant_requirements add constraint participant_requirements_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.participants add constraint participants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES leaders.organizations(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.passkeys add constraint passkeys_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.placements add constraint placements_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES leaders.assessments(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.placements add constraint placements_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.placements add constraint placements_level_fkey FOREIGN KEY (level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.placements add constraint placements_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.points_ledger add constraint points_ledger_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.program_versions add constraint program_versions_program_id_fkey FOREIGN KEY (program_id) REFERENCES leaders.programs(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.questions add constraint questions_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.questions add constraint questions_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES leaders.instruments(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.raters add constraint raters_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES leaders.instruments(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.raters add constraint raters_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.reading_progress add constraint reading_progress_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.reading_progress add constraint reading_progress_module_id_fkey FOREIGN KEY (module_id) REFERENCES leaders.handbook_modules(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.reports add constraint reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES leaders.organizations(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.reports add constraint reports_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.stage_requirements add constraint stage_requirements_program_id_fkey FOREIGN KEY (program_id) REFERENCES leaders.programs(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.stage_requirements add constraint stage_requirements_dimension_fkey FOREIGN KEY (dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.stage_requirements add constraint stage_requirements_level_fkey FOREIGN KEY (level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.stage_requirements add constraint stage_requirements_stage_fk FOREIGN KEY (program_id, stage_key) REFERENCES leaders.journey_stages(program_id, key) ON UPDATE CASCADE ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.tracks add constraint tracks_impact_level_fkey FOREIGN KEY (impact_level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.tracks add constraint tracks_priority_dimension_fkey FOREIGN KEY (priority_dimension) REFERENCES leaders.dimensions(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.tracks add constraint tracks_milestone_level_fkey FOREIGN KEY (milestone_level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.tracks add constraint tracks_leadership_level_fkey FOREIGN KEY (leadership_level) REFERENCES leaders.levels(key);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.video_progress add constraint video_progress_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES leaders.stage_requirements(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.video_progress add constraint video_progress_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.webauthn_challenges add constraint webauthn_challenges_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.workshop_attendance add constraint workshop_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES leaders.workshop_sessions(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.workshop_attendance add constraint workshop_attendance_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES leaders.participants(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.workshop_sessions add constraint workshop_sessions_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES leaders.cohorts(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table leaders.workshop_sessions add constraint workshop_sessions_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES leaders.stage_requirements(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.admin_audit_log add constraint admin_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES admin_users(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.admin_passkeys add constraint admin_passkeys_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.admin_role_permissions add constraint admin_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES admin_roles(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.admin_users add constraint admin_users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.admin_users add constraint admin_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES admin_roles(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_links add constraint planner_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES planner_projects(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_links add constraint planner_links_owner_fkey FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_master_links add constraint planner_master_links_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES planner_projects(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_master_links add constraint planner_master_links_master_id_fkey FOREIGN KEY (master_id) REFERENCES planner_projects(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_master_links add constraint planner_master_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_plan_summaries add constraint planner_plan_summaries_project_id_fkey FOREIGN KEY (project_id) REFERENCES planner_projects(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_profiles add constraint planner_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_profiles add constraint planner_profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_project_shares add constraint planner_project_shares_project_id_fkey FOREIGN KEY (project_id) REFERENCES planner_projects(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_project_shares add constraint planner_project_shares_shared_with_fkey FOREIGN KEY (shared_with) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_project_shares add constraint planner_project_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_projects add constraint planner_projects_owner_fkey FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.planner_resources add constraint planner_resources_owner_fkey FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.user_passkeys add constraint user_passkeys_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

CREATE INDEX IF NOT EXISTS assessments_participant_idx ON leaders.assessments USING btree (participant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON leaders.audit_log USING btree (entity, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_sessions_participant_idx ON leaders.auth_sessions USING btree (participant_id);

CREATE INDEX IF NOT EXISTS capstones_status_idx ON leaders.capstones USING btree (status, submitted_at);

CREATE INDEX IF NOT EXISTS certificate_checks_ip_idx ON leaders.certificate_checks USING btree (ip, created_at DESC);

CREATE INDEX IF NOT EXISTS certificate_checks_serial_idx ON leaders.certificate_checks USING btree (serial, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS certificates_one_valid ON leaders.certificates USING btree (participant_id) WHERE (status = 'valid'::text);

CREATE INDEX IF NOT EXISTS certificates_participant_idx ON leaders.certificates USING btree (participant_id);

CREATE INDEX IF NOT EXISTS coaching_sessions_expert_idx ON leaders.coaching_sessions USING btree (expert_id);

CREATE INDEX IF NOT EXISTS coaching_sessions_participant_idx ON leaders.coaching_sessions USING btree (participant_id, requirement_id);

CREATE INDEX IF NOT EXISTS coaching_sessions_status_idx ON leaders.coaching_sessions USING btree (status, starts_at);

CREATE UNIQUE INDEX IF NOT EXISTS cohorts_one_default ON leaders.cohorts USING btree ((true)) WHERE is_default;

CREATE INDEX IF NOT EXISTS cohorts_org_idx ON leaders.cohorts USING btree (organization_id, status);

CREATE INDEX IF NOT EXISTS content_items_order_idx ON leaders.content_items USING btree (dimension, sort);

CREATE INDEX IF NOT EXISTS coordinator_challenges_email_idx ON leaders.coordinator_challenges USING btree (email, created_at DESC);

CREATE INDEX IF NOT EXISTS coordinator_sessions_coord_idx ON leaders.coordinator_sessions USING btree (coordinator_id);

CREATE INDEX IF NOT EXISTS email_challenges_email_created_idx ON leaders.email_challenges USING btree (email, created_at DESC);

CREATE INDEX IF NOT EXISTS email_challenges_email_idx ON leaders.email_challenges USING btree (lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS email_challenges_ip_created_idx ON leaders.email_challenges USING btree (ip, created_at DESC);

CREATE INDEX IF NOT EXISTS expert_requests_expert_idx ON leaders.expert_requests USING btree (expert_id);

CREATE UNIQUE INDEX IF NOT EXISTS expert_requests_live_idx ON leaders.expert_requests USING btree (participant_id, role) WHERE (status = ANY (ARRAY['open'::text, 'offered'::text, 'accepted'::text]));

CREATE INDEX IF NOT EXISTS expert_requests_status_idx ON leaders.expert_requests USING btree (status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS expert_requests_token_idx ON leaders.expert_requests USING btree (offer_token_hash) WHERE (offer_token_hash IS NOT NULL);

CREATE INDEX IF NOT EXISTS experts_status_idx ON leaders.experts USING btree (status);

CREATE INDEX IF NOT EXISTS handbook_exports_participant_idx ON leaders.handbook_exports USING btree (participant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS handbook_views_participant_idx ON leaders.handbook_views USING btree (participant_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS lab_attempts_participant_idx ON leaders.lab_attempts USING btree (participant_id, item_id);

CREATE INDEX IF NOT EXISTS lab_grants_org_idx ON leaders.lab_grants USING btree (organization_id);

CREATE INDEX IF NOT EXISTS lab_grants_participant_idx ON leaders.lab_grants USING btree (participant_id);

CREATE UNIQUE INDEX IF NOT EXISTS lab_grants_target_idx ON leaders.lab_grants USING btree (COALESCE(organization_id, participant_id), COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS learning_models_capstone_idx ON leaders.learning_models USING btree (capstone_sort) WHERE (capstone_sort IS NOT NULL);

CREATE INDEX IF NOT EXISTS org_coordinators_email_idx ON leaders.org_coordinators USING btree (email);

CREATE INDEX IF NOT EXISTS org_coordinators_org_idx ON leaders.org_coordinators USING btree (organization_id);

CREATE INDEX IF NOT EXISTS organizations_domains_gin ON leaders.organizations USING gin (domains);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_invite_uniq ON leaders.organizations USING btree (lower(invite_code)) WHERE (invite_code IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_uniq ON leaders.organizations USING btree (lower(name));

CREATE INDEX IF NOT EXISTS participant_requirements_status_idx ON leaders.participant_requirements USING btree (status);

CREATE UNIQUE INDEX IF NOT EXISTS participants_email_uniq ON leaders.participants USING btree (lower(email));

CREATE INDEX IF NOT EXISTS participants_org_idx ON leaders.participants USING btree (organization_id);

CREATE INDEX IF NOT EXISTS participants_person_idx ON leaders.participants USING btree (person_id) WHERE (person_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS participants_status_idx ON leaders.participants USING btree (status);

CREATE INDEX IF NOT EXISTS passkeys_participant_idx ON leaders.passkeys USING btree (participant_id);

CREATE INDEX IF NOT EXISTS points_ledger_participant ON leaders.points_ledger USING btree (participant_id);

CREATE UNIQUE INDEX IF NOT EXISTS programs_one_default ON leaders.programs USING btree ((true)) WHERE is_default;

CREATE INDEX IF NOT EXISTS questions_instrument_idx ON leaders.questions USING btree (instrument_id, dimension, sort);

CREATE INDEX IF NOT EXISTS raters_participant_idx ON leaders.raters USING btree (participant_id);

CREATE INDEX IF NOT EXISTS stage_requirements_program_idx ON leaders.stage_requirements USING btree (program_id, stage_key, sort);

CREATE INDEX IF NOT EXISTS stage_requirements_stage_idx ON leaders.stage_requirements USING btree (stage_key, sort);

CREATE INDEX IF NOT EXISTS workshop_attendance_participant_idx ON leaders.workshop_attendance USING btree (participant_id);

CREATE INDEX IF NOT EXISTS workshop_sessions_cohort_idx ON leaders.workshop_sessions USING btree (cohort_id);

CREATE INDEX IF NOT EXISTS workshop_sessions_req_idx ON leaders.workshop_sessions USING btree (requirement_id, starts_at);

CREATE INDEX IF NOT EXISTS admin_passkeys_admin_idx ON public.admin_passkeys USING btree (admin_id);

CREATE INDEX IF NOT EXISTS api_sessions_expires_idx ON public.api_sessions USING btree (expires_at);

CREATE INDEX IF NOT EXISTS contact_requests_created_idx ON public.contact_requests USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.admin_audit_log USING btree (action);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.admin_audit_log USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.admin_audit_log USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_contact_requests_created_at ON public.contact_requests USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_requests_email ON public.contact_requests USING btree (email);

CREATE INDEX IF NOT EXISTS idx_contact_requests_product ON public.contact_requests USING btree (product);

CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON public.contact_requests USING btree (status);

CREATE INDEX IF NOT EXISTS idx_email_otps_email ON public.email_otps USING btree (email);

CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON public.email_otps USING btree (expires_at);

CREATE INDEX IF NOT EXISTS idx_planner_links_project ON public.planner_links USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_planner_links_source ON public.planner_links USING btree (source, external_id);

CREATE INDEX IF NOT EXISTS idx_planner_projects_owner_updated ON public.planner_projects USING btree (owner, updated DESC);

CREATE INDEX IF NOT EXISTS idx_process_details_key ON public.process_details USING btree (process_key);

CREATE INDEX IF NOT EXISTS idx_process_details_track ON public.process_details USING btree (track_id);

CREATE INDEX IF NOT EXISTS idx_reports_created ON public.reports USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_reports_reg ON public.reports USING btree (registration_id);

CREATE INDEX IF NOT EXISTS page_views_created_idx ON public.page_views USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS page_views_site_path_idx ON public.page_views USING btree (site, path);

CREATE INDEX IF NOT EXISTS page_views_visit_idx ON public.page_views USING btree (visit_id);

CREATE INDEX IF NOT EXISTS planner_login_otps_ip_idx ON public.planner_login_otps USING btree (ip_address, created_at);

CREATE INDEX IF NOT EXISTS planner_master_links_plan_idx ON public.planner_master_links USING btree (plan_id);

CREATE INDEX IF NOT EXISTS planner_projects_updated_idx ON public.planner_projects USING btree (owner, updated DESC);

CREATE INDEX IF NOT EXISTS planner_resources_updated_idx ON public.planner_resources USING btree (owner, updated DESC);

CREATE INDEX IF NOT EXISTS planner_shares_with_idx ON public.planner_project_shares USING btree (shared_with);

CREATE INDEX IF NOT EXISTS user_passkeys_reg_idx ON public.user_passkeys USING btree (registration_id);

CREATE INDEX IF NOT EXISTS webauthn_challenges_created_idx ON public.webauthn_challenges USING btree (created_at);

alter table leaders.assessment_answers enable row level security;

alter table leaders.assessment_results enable row level security;

alter table leaders.assessments enable row level security;

alter table leaders.audit_log enable row level security;

alter table leaders.auth_sessions enable row level security;

alter table leaders.capstones enable row level security;

alter table leaders.certificate_checks enable row level security;

alter table leaders.certificate_settings enable row level security;

alter table leaders.certificates enable row level security;

alter table leaders.coaching_sessions enable row level security;

alter table leaders.cohorts enable row level security;

alter table leaders.content_items enable row level security;

alter table leaders.content_progress enable row level security;

alter table leaders.coordinator_challenges enable row level security;

alter table leaders.coordinator_sessions enable row level security;

alter table leaders.dimensions enable row level security;

alter table leaders.email_challenges enable row level security;

alter table leaders.enrollments enable row level security;

alter table leaders.expert_requests enable row level security;

alter table leaders.experts enable row level security;

alter table leaders.grid_cells enable row level security;

alter table leaders.handbook_exports enable row level security;

alter table leaders.handbook_modules enable row level security;

alter table leaders.handbook_progress enable row level security;

alter table leaders.handbook_views enable row level security;

alter table leaders.instruments enable row level security;

alter table leaders.journey_stages enable row level security;

alter table leaders.lab_attempts enable row level security;

alter table leaders.lab_grants enable row level security;

alter table leaders.lab_items enable row level security;

alter table leaders.learning_models enable row level security;

alter table leaders.levels enable row level security;

alter table leaders.model_submissions enable row level security;

alter table leaders.org_coordinators enable row level security;

alter table leaders.organizations enable row level security;

alter table leaders.participant_requirements enable row level security;

alter table leaders.participants enable row level security;

alter table leaders.passkeys enable row level security;

alter table leaders.placement_model enable row level security;

alter table leaders.placements enable row level security;

alter table leaders.points_ledger enable row level security;

alter table leaders.program_versions enable row level security;

alter table leaders.programs enable row level security;

alter table leaders.questions enable row level security;

alter table leaders.raters enable row level security;

alter table leaders.reading_progress enable row level security;

alter table leaders.reports enable row level security;

alter table leaders.stage_requirements enable row level security;

alter table leaders.tracks enable row level security;

alter table leaders.video_progress enable row level security;

alter table leaders.webauthn_challenges enable row level security;

alter table leaders.workshop_attendance enable row level security;

alter table leaders.workshop_sessions enable row level security;

alter table public.admin_audit_log enable row level security;

alter table public.admin_passkeys enable row level security;

alter table public.admin_role_permissions enable row level security;

alter table public.admin_roles enable row level security;

alter table public.admin_users enable row level security;

alter table public.api_sessions enable row level security;

alter table public.app_content enable row level security;

alter table public.contact_requests enable row level security;

alter table public.email_otps enable row level security;

alter table public.mail_log enable row level security;

alter table public.page_views enable row level security;

alter table public.planner_heartbeat enable row level security;

alter table public.planner_links enable row level security;

alter table public.planner_login_otps enable row level security;

alter table public.planner_master_links enable row level security;

alter table public.planner_otp_attempts enable row level security;

alter table public.planner_plan_summaries enable row level security;

alter table public.planner_profiles enable row level security;

alter table public.planner_project_shares enable row level security;

alter table public.planner_projects enable row level security;

alter table public.planner_resources enable row level security;

alter table public.process_details enable row level security;

alter table public.registrations enable row level security;

alter table public.reports enable row level security;

alter table public.totp_attempts enable row level security;

alter table public.user_passkeys enable row level security;

alter table public.webauthn_challenges enable row level security;

CREATE OR REPLACE FUNCTION leaders.instrument_reliability(p_instrument uuid)
 RETURNS TABLE(dimension text, n integer, k integer, alpha numeric, sd numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'leaders', 'pg_temp'
AS $function$
  with s as (
    select a.id as aid, q.dimension, q.id as qid, aa.score
    from leaders.assessments a
    join leaders.assessment_answers aa on aa.assessment_id = a.id
    join leaders.questions q on q.id = aa.question_id
    where a.instrument_id = p_instrument and a.status = 'submitted'
      and q.active and q.tier in ('knowledge', 'skill', 'behavior')
  ),
  kk as (
    select q.dimension, count(*)::int as k from leaders.questions q
    where q.instrument_id = p_instrument and q.active and q.tier in ('knowledge', 'skill', 'behavior')
    group by q.dimension
  ),
  complete as (
    select s.dimension, s.aid from s join kk using (dimension)
    group by s.dimension, s.aid, kk.k
    having count(*) = kk.k and min(s.score) >= 0
  ),
  cs as (select s.* from s join complete c using (dimension, aid)),
  items as (select dimension, qid, var_samp(score) as v from cs group by dimension, qid),
  tot as (select dimension, aid, sum(score) as t from cs group by dimension, aid),
  agg as (
    select kk.dimension, kk.k,
      (select count(*)::int from tot where tot.dimension = kk.dimension) as n,
      (select sum(v) from items where items.dimension = kk.dimension) as iv,
      (select var_samp(t) from tot where tot.dimension = kk.dimension) as tv
    from kk
  )
  select agg.dimension, agg.n, agg.k,
    case when agg.k > 1 and agg.n >= 3 and agg.tv > 0
      then round((agg.k::numeric / (agg.k - 1)) * (1 - agg.iv / agg.tv), 2) end,
    (select round(stddev_samp(r.composite_pct), 2) from leaders.assessment_results r
      join leaders.assessments a on a.id = r.assessment_id
      where a.instrument_id = p_instrument and a.status = 'submitted' and r.dimension = agg.dimension)
  from agg;
$function$
;

CREATE OR REPLACE FUNCTION leaders.sync_org_name_to_participants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.name is distinct from old.name then
    update leaders.participants set organization_name = new.name where organization_id = new.id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION leaders.sync_participant_org_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.organization_id is not null and (tg_op = 'INSERT' or new.organization_id is distinct from old.organization_id or new.organization_name is distinct from old.organization_name) then
    select o.name into new.organization_name from leaders.organizations o where o.id = new.organization_id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION leaders.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'leaders'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_owner_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.is_owner then raise exception 'owner_protected' using errcode = 'P0001'; end if;
    return old;
  end if;
  if new.is_owner and (tg_op = 'INSERT' or not old.is_owner) then
    raise exception 'owner_protected' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and (
       not new.is_owner
       or new.role_id   is distinct from old.role_id
       or new.is_active is distinct from old.is_active
       or lower(new.email) is distinct from lower(old.email)) then
    raise exception 'owner_protected' using errcode = 'P0001';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_daily(p_from timestamp with time zone, p_to timestamp with time zone, p_site text DEFAULT NULL::text)
 RETURNS TABLE(day date, views bigint, visits bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select date_trunc('day', created_at)::date as day,
         count(*)                            as views,
         count(distinct visit_id)            as visits
  from public.page_views
  where created_at >= p_from
    and created_at <  p_to
    and (p_site is null or site = p_site)
  group by 1
  order by 1;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_pages(p_from timestamp with time zone, p_to timestamp with time zone, p_site text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(site text, path text, views bigint, visits bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select site, path,
         count(*)                 as views,
         count(distinct visit_id) as visits
  from public.page_views
  where created_at >= p_from
    and created_at <  p_to
    and (p_site is null or site = p_site)
  group by 1, 2
  order by views desc
  limit p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_sources(p_from timestamp with time zone, p_to timestamp with time zone, p_site text DEFAULT NULL::text)
 RETURNS TABLE(kind text, label text, visits bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with v as (
    select distinct on (visit_id) visit_id, referrer, device
    from public.page_views
    where created_at >= p_from and created_at < p_to and (p_site is null or site = p_site)
    order by visit_id, created_at
  )
  select 'referrer', coalesce(nullif(split_part(regexp_replace(referrer, '^https?://(www\.)?', ''), '/', 1), ''), 'مباشر'), count(*)
  from v group by 2
  union all
  select 'device', coalesce(device, 'غير معروف'), count(*) from v group by 2
  order by 1, 3 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.contact_requests_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- الدالة تعمل بصلاحية مالكها، فدور المتصل يُقرأ من توكن الطلب لا من current_user.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
       in ('anon', 'authenticated') then
    new.id         := gen_random_uuid();
    new.created_at := now();
    new.status     := 'new';
    new.email      := lower(trim(new.email));
    if (select count(*) from public.contact_requests
        where lower(email) = new.email and created_at > now() - interval '1 hour') >= 3 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    if (select count(*) from public.contact_requests
        where created_at > now() - interval '1 hour') >= 60 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_admin_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role_id FROM public.admin_users
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_system text, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    JOIN public.admin_role_permissions arp ON arp.role_id = au.role_id
    WHERE au.id = auth.uid()
      AND au.is_active = true
      AND (arp.system = p_system OR arp.system = '*')
      AND arp.permission = p_permission
  );
$function$
;

CREATE OR REPLACE FUNCTION public.planner_can_read_project(pid text, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select planner_is_approved (uid) and exists (
    select 1 from public.planner_projects p
    where p.id = pid and (
      p.owner = uid
      or planner_is_owner (uid)
      or (p.origin = 'manzuma' and planner_is_manzuma (uid))
      or planner_shared_with_me (p.id, uid)));
$function$
;

CREATE OR REPLACE FUNCTION public.planner_check_otp_rate(check_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*) < 5 from public.planner_otp_attempts
  where email = check_email and created_at > now() - interval '1 hour';
$function$
;

CREATE OR REPLACE FUNCTION public.planner_guard_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.owner is distinct from old.owner
     and coalesce(current_setting('planner.transfer_ok', true), '') <> '1' then
    raise exception 'الملكية تُنقَل بـplanner_transfer_ownership وحدها'
      using errcode = '42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.planner_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.planner_profiles (id, email, status, role)
  values (new.id, new.email, 'pending', 'member')
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.planner_hook_secret()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'planner_hook_secret';
$function$
;

CREATE OR REPLACE FUNCTION public.planner_is_approved(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.planner_profiles
                 where id = uid and status = 'approved');
$function$
;

CREATE OR REPLACE FUNCTION public.planner_is_manzuma(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.planner_profiles
                 where id = uid and role in ('manzuma','owner') and status = 'approved');
$function$
;

CREATE OR REPLACE FUNCTION public.planner_is_owner(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.planner_profiles
                 where id = uid and role = 'owner' and status = 'approved');
$function$
;

CREATE OR REPLACE FUNCTION public.planner_keepalive_ping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare prev timestamptz; n bigint;
begin
  -- تُقرأ النبضةُ السابقة **قبل** استبدالها: هي الدليل. فزائرٌ
  -- ينادي الدالّة يدوياً يصير نبضةً بنفسه، فلو أُرجعت الجديدةُ
  -- وحدها لقالت «الآن» دائماً ولم تُثبت جدولاً.
  select last_ping, pings into prev, n
    from public.planner_heartbeat where id = 1;

  insert into public.planner_heartbeat as h (id, last_ping, pings)
  values (1, now(), 1)
  on conflict (id) do update
    set last_ping = now(), pings = h.pings + 1;

  return jsonb_build_object('previous', prev, 'pings', coalesce(n, 0) + 1);
end $function$
;

CREATE OR REPLACE FUNCTION public.planner_log_otp_attempt(log_email text, was_success boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into public.planner_otp_attempts(email, success) values (log_email, was_success);
$function$
;

CREATE OR REPLACE FUNCTION public.planner_lookup_user_by_email(lookup_email text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from public.planner_profiles
  where email = lookup_email and status = 'approved'
    and public.planner_is_approved(auth.uid())
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.planner_notify_workbench()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pid text := CASE WHEN TG_TABLE_NAME = 'planner_plan_summaries' THEN NEW.project_id ELSE NEW.id END;
BEGIN
  PERFORM net.http_post(
    url     := 'https://urdgaplsjirwqovpncbn.supabase.co/functions/v1/planner-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-planner-hook', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'planner_hook_secret')),
    body    := jsonb_build_object('mode', 'push', 'planId', pid),
    timeout_milliseconds := 20000);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;   -- التنبيه لا يُسقط حفظ الخطة أبداً
END $function$
;

CREATE OR REPLACE FUNCTION public.planner_owns_project(pid text, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.planner_projects
                 where id = pid and owner = uid);
$function$
;

CREATE OR REPLACE FUNCTION public.planner_shared_with_me(pid text, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.planner_project_shares
                 where project_id = pid and shared_with = uid);
$function$
;

CREATE OR REPLACE FUNCTION public.planner_shared_with_me_edit(pid text, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.planner_project_shares
                 where project_id = pid and shared_with = uid and permission = 'edit');
$function$
;

CREATE OR REPLACE FUNCTION public.planner_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.planner_transfer_ownership(pid text, new_owner uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  cur uuid;
  me  uuid := auth.uid();
  em  text;
begin
  if me is null then
    raise exception 'لا جلسة' using errcode = '42501';
  end if;

  select owner into cur from public.planner_projects where id = pid;
  if cur is null then
    raise exception 'لا توجد خطة بهذا المعرّف' using errcode = 'P0002';
  end if;

  -- مالك الخطة وحده، أو مشرف المنظومة
  if not (cur = me or public.planner_is_owner (me)) then
    raise exception 'نقل الملكية لمالك الخطة وحده' using errcode = '42501';
  end if;

  if new_owner = cur then
    raise exception 'هو مالكها أصلاً' using errcode = '22023';
  end if;

  -- لا تُنقَل خطةٌ إلى من لا يستطيع فتحها: غيرُ المعتمَد لا تراه
  -- سياسةُ القراءة، فالنقل إليه إخفاءٌ للخطة لا تسليمٌ لها
  if not public.planner_is_approved (new_owner) then
    raise exception 'المنقول إليه غير معتمَد في المنظومة' using errcode = '42501';
  end if;

  -- المالك السابق يصير محرِّراً: النقل تسليمُ قرارٍ لا مصادرةُ عمل،
  -- وسحبُ وصولِ صاحبها فجأةً أثرٌ لا يطلبه من ينقل
  select email into em from public.planner_profiles where id = cur;
  insert into public.planner_project_shares (project_id, shared_with, shared_by, shared_email, permission)
       values (pid, cur, me, em, 'edit')
  on conflict (project_id, shared_with)
    do update set permission = 'edit';

  -- ومشاركةُ المالك الجديد تُحذَف: دورُه الآن فوقها، وبقاؤها يُظهره
  -- في قائمة «المُشارَك معهم» بدورٍ أدنى ممّا يملك
  delete from public.planner_project_shares
   where project_id = pid and shared_with = new_owner;

  -- الرايةُ تُرفَع للمعاملة وحدها، فيعرف الحارسُ أن هذا نقلٌ مسمّى
  perform set_config('planner.transfer_ok', '1', true);
  update public.planner_projects set owner = new_owner where id = pid;
  perform set_config('planner.transfer_ok', '', true);
  return new_owner;
end $function$
;

do $$ begin
  create policy admin_insert_audit on public.admin_audit_log as PERMISSIVE for INSERT to authenticated with check ((get_my_admin_role() IS NOT NULL));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_read_audit on public.admin_audit_log as PERMISSIVE for SELECT to authenticated using ((get_my_admin_role() = 'super_admin'::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_read_permissions on public.admin_role_permissions as PERMISSIVE for SELECT to authenticated using ((get_my_admin_role() IS NOT NULL));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_read_roles on public.admin_roles as PERMISSIVE for SELECT to authenticated using ((get_my_admin_role() IS NOT NULL));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_read_users on public.admin_users as PERMISSIVE for SELECT to authenticated using (((id = auth.uid()) OR (get_my_admin_role() = 'super_admin'::text)));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy super_admin_manage_users on public.admin_users as PERMISSIVE for ALL to authenticated using ((get_my_admin_role() = 'super_admin'::text)) with check ((get_my_admin_role() = 'super_admin'::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Allow read all" on public.app_content as PERMISSIVE for SELECT to public using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_read_contact_requests on public.contact_requests as PERMISSIVE for SELECT to authenticated using (has_permission('MI'::text, 'read'::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy admin_update_contact_requests on public.contact_requests as PERMISSIVE for UPDATE to authenticated using (has_permission('MI'::text, 'write'::text)) with check (has_permission('MI'::text, 'write'::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy anon_insert_contact_requests on public.contact_requests as PERMISSIVE for INSERT to anon with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "anon can insert page views" on public.page_views as PERMISSIVE for INSERT to anon with check (((char_length(site) <= 40) AND (char_length(path) <= 512) AND (COALESCE(char_length(title), 0) <= 300) AND (COALESCE(char_length(referrer), 0) <= 512) AND (char_length(visit_id) <= 64)));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_heartbeat_read on public.planner_heartbeat as PERMISSIVE for SELECT to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_links_delete on public.planner_links as PERMISSIVE for DELETE to public using (((owner = auth.uid()) OR planner_is_owner(auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_links_insert on public.planner_links as PERMISSIVE for INSERT to public with check ((planner_is_approved(auth.uid()) AND (owner = auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_links_select on public.planner_links as PERMISSIVE for SELECT to public using ((planner_is_approved(auth.uid()) AND ((owner = auth.uid()) OR planner_is_owner(auth.uid()))));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_links_update on public.planner_links as PERMISSIVE for UPDATE to public using (((owner = auth.uid()) OR planner_is_owner(auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_mlinks_delete on public.planner_master_links as PERMISSIVE for DELETE to public using ((planner_owns_project(master_id, auth.uid()) OR planner_is_owner(auth.uid()) OR planner_shared_with_me_edit(master_id, auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_mlinks_insert on public.planner_master_links as PERMISSIVE for INSERT to public with check ((planner_is_approved(auth.uid()) AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM planner_projects p
  WHERE (p.id = planner_master_links.plan_id))) AND (planner_owns_project(master_id, auth.uid()) OR planner_is_owner(auth.uid()) OR planner_shared_with_me_edit(master_id, auth.uid()))));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_mlinks_select on public.planner_master_links as PERMISSIVE for SELECT to public using (((EXISTS ( SELECT 1
   FROM planner_projects m
  WHERE (m.id = planner_master_links.master_id))) OR (EXISTS ( SELECT 1
   FROM planner_projects p
  WHERE (p.id = planner_master_links.plan_id)))));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_summaries_delete on public.planner_plan_summaries as PERMISSIVE for DELETE to public using ((planner_owns_project(project_id, auth.uid()) OR planner_is_owner(auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_summaries_insert on public.planner_plan_summaries as PERMISSIVE for INSERT to public with check ((planner_is_approved(auth.uid()) AND (planner_owns_project(project_id, auth.uid()) OR planner_is_owner(auth.uid()) OR planner_shared_with_me_edit(project_id, auth.uid()))));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_summaries_select on public.planner_plan_summaries as PERMISSIVE for SELECT to public using (((EXISTS ( SELECT 1
   FROM planner_projects p
  WHERE (p.id = planner_plan_summaries.project_id))) OR (EXISTS ( SELECT 1
   FROM (planner_master_links l
     JOIN planner_projects m ON ((m.id = l.master_id)))
  WHERE ((l.plan_id = planner_plan_summaries.project_id) AND planner_can_read_project(l.plan_id, l.created_by))))));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_summaries_update on public.planner_plan_summaries as PERMISSIVE for UPDATE to public using ((planner_owns_project(project_id, auth.uid()) OR planner_is_owner(auth.uid()) OR planner_shared_with_me_edit(project_id, auth.uid()))) with check ((planner_owns_project(project_id, auth.uid()) OR planner_is_owner(auth.uid()) OR planner_shared_with_me_edit(project_id, auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_profiles_insert on public.planner_profiles as PERMISSIVE for INSERT to public with check (((id = auth.uid()) AND (COALESCE(status, 'pending'::text) = 'pending'::text) AND (COALESCE(role, 'member'::text) = 'member'::text)));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_profiles_owner_update on public.planner_profiles as PERMISSIVE for UPDATE to public using (planner_is_owner(auth.uid())) with check (planner_is_owner(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_profiles_select on public.planner_profiles as PERMISSIVE for SELECT to public using (((id = auth.uid()) OR planner_is_owner(auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_shares_delete on public.planner_project_shares as PERMISSIVE for DELETE to public using ((planner_is_owner(auth.uid()) OR planner_owns_project(project_id, auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_shares_insert on public.planner_project_shares as PERMISSIVE for INSERT to public with check ((planner_is_owner(auth.uid()) OR planner_owns_project(project_id, auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_shares_select on public.planner_project_shares as PERMISSIVE for SELECT to public using (((shared_with = auth.uid()) OR (shared_by = auth.uid()) OR planner_is_owner(auth.uid()) OR planner_owns_project(project_id, auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_shares_update on public.planner_project_shares as PERMISSIVE for UPDATE to public using ((planner_is_owner(auth.uid()) OR planner_owns_project(project_id, auth.uid()))) with check ((planner_is_owner(auth.uid()) OR planner_owns_project(project_id, auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_projects_delete on public.planner_projects as PERMISSIVE for DELETE to public using (((owner = auth.uid()) OR planner_is_owner(auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_projects_insert on public.planner_projects as PERMISSIVE for INSERT to public with check ((planner_is_approved(auth.uid()) AND (owner = auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_projects_select on public.planner_projects as PERMISSIVE for SELECT to public using ((planner_is_approved(auth.uid()) AND ((owner = auth.uid()) OR planner_is_owner(auth.uid()) OR ((origin = 'manzuma'::text) AND planner_is_manzuma(auth.uid())) OR planner_shared_with_me(id, auth.uid()))));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_projects_update on public.planner_projects as PERMISSIVE for UPDATE to public using (((owner = auth.uid()) OR planner_is_owner(auth.uid()) OR planner_shared_with_me_edit(id, auth.uid()))) with check (((owner = auth.uid()) OR planner_is_owner(auth.uid()) OR planner_shared_with_me_edit(id, auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_resources_delete on public.planner_resources as PERMISSIVE for DELETE to public using (((owner = auth.uid()) OR planner_is_owner(auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_resources_insert on public.planner_resources as PERMISSIVE for INSERT to public with check ((planner_is_approved(auth.uid()) AND (owner = auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_resources_select on public.planner_resources as PERMISSIVE for SELECT to public using ((planner_is_approved(auth.uid()) AND ((owner = auth.uid()) OR planner_is_owner(auth.uid()))));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy planner_resources_update on public.planner_resources as PERMISSIVE for UPDATE to public using (((owner = auth.uid()) OR planner_is_owner(auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Allow read all" on public.process_details as PERMISSIVE for SELECT to public using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_only on public.totp_attempts as PERMISSIVE for ALL to public using (false);
exception when duplicate_object then null; end $$;

CREATE OR REPLACE TRIGGER cohorts_touch BEFORE UPDATE ON leaders.cohorts FOR EACH ROW EXECUTE FUNCTION leaders.touch_updated_at();

CREATE OR REPLACE TRIGGER enrollments_touch BEFORE UPDATE ON leaders.enrollments FOR EACH ROW EXECUTE FUNCTION leaders.touch_updated_at();

CREATE OR REPLACE TRIGGER grid_cells_touch BEFORE UPDATE ON leaders.grid_cells FOR EACH ROW EXECUTE FUNCTION leaders.touch_updated_at();

CREATE OR REPLACE TRIGGER organizations_name_sync AFTER UPDATE OF name ON leaders.organizations FOR EACH ROW EXECUTE FUNCTION leaders.sync_org_name_to_participants();

CREATE OR REPLACE TRIGGER organizations_touch BEFORE UPDATE ON leaders.organizations FOR EACH ROW EXECUTE FUNCTION leaders.touch_updated_at();

CREATE OR REPLACE TRIGGER participants_org_name BEFORE INSERT OR UPDATE OF organization_id, organization_name ON leaders.participants FOR EACH ROW EXECUTE FUNCTION leaders.sync_participant_org_name();

CREATE OR REPLACE TRIGGER participants_touch BEFORE UPDATE ON leaders.participants FOR EACH ROW EXECUTE FUNCTION leaders.touch_updated_at();

CREATE OR REPLACE TRIGGER placement_model_touch BEFORE UPDATE ON leaders.placement_model FOR EACH ROW EXECUTE FUNCTION leaders.touch_updated_at();

CREATE OR REPLACE TRIGGER tracks_touch BEFORE UPDATE ON leaders.tracks FOR EACH ROW EXECUTE FUNCTION leaders.touch_updated_at();

CREATE OR REPLACE TRIGGER admin_owner_guard BEFORE INSERT OR DELETE OR UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION admin_owner_guard();

CREATE OR REPLACE TRIGGER contact_requests_guard BEFORE INSERT ON public.contact_requests FOR EACH ROW EXECUTE FUNCTION contact_requests_guard();

CREATE OR REPLACE TRIGGER planner_projects_notify_wb AFTER INSERT OR UPDATE OF data, updated, name ON public.planner_projects FOR EACH ROW EXECUTE FUNCTION planner_notify_workbench();

CREATE OR REPLACE TRIGGER planner_projects_owner_guard BEFORE UPDATE ON public.planner_projects FOR EACH ROW EXECUTE FUNCTION planner_guard_owner();

CREATE OR REPLACE TRIGGER planner_summaries_notify_wb AFTER INSERT OR UPDATE ON public.planner_plan_summaries FOR EACH ROW EXECUTE FUNCTION planner_notify_workbench();

CREATE OR REPLACE TRIGGER trg_planner_projects_touch BEFORE UPDATE ON public.planner_projects FOR EACH ROW EXECUTE FUNCTION planner_touch_updated_at();

CREATE OR REPLACE TRIGGER trg_planner_resources_touch BEFORE UPDATE ON public.planner_resources FOR EACH ROW EXECUTE FUNCTION planner_touch_updated_at();

-- ── بيانات مرجعية ──
insert into leaders.dimensions (key, title_ar, title_en, sort) values
  ('impact', 'تحويل المشروع إلى أثر', 'Impact', 2),
  ('leadership', 'تمكين القائد', 'Leadership', 3),
  ('milestone', 'إدارة المشروعات', 'Milestone', 1)
on conflict do nothing;

insert into leaders.levels (key, title_ar, title_en, sort) values
  ('advanced', 'احترافي', 'Professional', 3),
  ('beginner', 'تأسيسي', 'Foundation', 1),
  ('intermediate', 'متوسط', 'Intermediate', 2)
on conflict do nothing;

