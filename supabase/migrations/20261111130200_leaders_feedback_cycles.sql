-- ════════════════════════════════════════════════════════════════
-- تقييم 360، المرحلة 2: دورات التقييم ومجموعات المقيّمين (تصور 2026-11-11، اعتمده المالك)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (feedback360.ts: الشاشة تقول «غير متاح بعد» ولا تُفشل شيئًا)، والمقيّمون القائمون يُقرؤون بمرحلتيهم pre وpost وحدهما قبله وبعده
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261111130200_leaders_feedback_cycles).
-- docs/content/2026-11-11-تصور-تقييم-360-v1.md §5.3. يبني على بنية المقيّمين القائمة ولا يكررها:
--   • feedback_cycles: دورة لكل مشارك في كل موجة (t1 ثم t2 بعد الفاصل المضبوط في الإعدادات)، بحالتها من الترشيح
--     إلى اعتماد المستشار فالنافذة فالإغلاق فالتسليم في جلسة التوجيه، وتقديره الذاتي وخطة تطويره.
--   • raters: صف المقيّم نفسه (الرابط والتحقق D19 والموافقة D18 والبريد)، بمرحلة f360 وربط بالدورة،
--     وحالة nominated (رشّحه المشارك ولم يعتمد المستشار القائمة بعد، فلا رابط له)،
--     ومجموعة stakeholder، وcomment_hidden (حجب الإدارة لملاحظة تكشف صاحبها أو تسيء).
--   • التفرد: المشارك والبريد والمرحلة لما سوى 360 كما كان، والدورة والبريد لـ360 (فيُدعى المقيّم نفسه في الموجتين).
-- للتطوير وحده: لا يقرؤه التقييم الختامي ولا الشهادة ولا تقارير الجهة الفردية. لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.feedback_cycles (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  wave text not null check (wave in ('t1', 't2')),
  instrument_id uuid not null references leaders.instruments(id),
  status text not null default 'nominating' check (status in ('nominating', 'approval', 'open', 'closed', 'released', 'cancelled')),
  self_answers jsonb check (self_answers is null or jsonb_typeof(self_answers) = 'object'),
  self_submitted_at timestamptz,
  submitted_at timestamptz,
  return_note text check (return_note is null or char_length(return_note) <= 500),
  approved_by text check (approved_by is null or char_length(approved_by) <= 300),
  approved_at timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  reminded_days int[] not null default '{}',
  closed_at timestamptz,
  released_by text check (released_by is null or char_length(released_by) <= 300),
  released_at timestamptz,
  debrief_session_id uuid references leaders.coaching_sessions(id) on delete set null,
  plan jsonb check (plan is null or (jsonb_typeof(plan) = 'object' and char_length(plan::text) <= 4000)),
  plan_at timestamptz,
  created_at timestamptz not null default now(),
  unique (participant_id, wave)
);
create index if not exists feedback_cycles_status on leaders.feedback_cycles (status, closes_at);
comment on table leaders.feedback_cycles is 'تقييم 360 للتطوير: دورة لكل مشارك في كل موجة. لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عن الفرد';
alter table leaders.feedback_cycles enable row level security;
revoke all on leaders.feedback_cycles from anon, authenticated;

alter table leaders.raters add column if not exists cycle_id uuid references leaders.feedback_cycles(id) on delete cascade;
alter table leaders.raters add column if not exists comment_hidden boolean not null default false;
create index if not exists raters_cycle_idx on leaders.raters (cycle_id) where cycle_id is not null;

alter table leaders.raters drop constraint if exists raters_relation_check;
alter table leaders.raters add constraint raters_relation_check check (relation = any (array['manager', 'peer', 'report', 'stakeholder']));
alter table leaders.raters drop constraint if exists raters_status_check;
alter table leaders.raters add constraint raters_status_check check (status = any (array['nominated', 'awaiting', 'invited', 'submitted', 'revoked']));
alter table leaders.raters drop constraint if exists raters_phase_check;
alter table leaders.raters add constraint raters_phase_check check (phase = any (array['pre', 'post', 'f360']));
-- مقيّم 360 مربوط بدورته، ومقيّم الأثر بلا دورة
alter table leaders.raters drop constraint if exists raters_cycle_phase_check;
alter table leaders.raters add constraint raters_cycle_phase_check check ((phase = 'f360') = (cycle_id is not null));

alter table leaders.raters drop constraint if exists raters_participant_email_phase_key;
create unique index if not exists raters_participant_email_phase_key on leaders.raters (participant_id, email, phase) where cycle_id is null;
create unique index if not exists raters_cycle_email_key on leaders.raters (cycle_id, email) where cycle_id is not null;

insert into leaders.schema_migrations (name) values ('20261111130200_leaders_feedback_cycles') on conflict do nothing;
