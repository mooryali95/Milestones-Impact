-- ════════════════════════════════════════════════════════════════
-- سجل التذكير الموحد: كل تذكير يصل المشارك، من أي مرسل، في جدول واحد (المرحلة P3، اعتمدها المالك 2026-11-16)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تكتب السجل إن وُجد الجدول، وإن غاب تُرسل التذكير وتحدّث reminded_at كما كانت (nudges.ts)
-- المصدر الواحد لما ذُكِّر به المشارك: الإدارة، والمرشد (مشرف الرحلة)، والمساعد نيابة عنه، ومنسق الجهة، والتذكير الآلي.
-- منه يُقرأ الحد المشترك («ذكّره المرشد قبل يومين») فلا تتكرر التذكيرات، وسجل الملف للإدارة، وأثر كل تذكير.
-- snapshot: موضعه لحظة الإرسال (المرحلة وما أنجز منها والتقدم)، فيُقاس الأثر بمقارنته بحاله بعدها، لا بعدّ منفصل.
-- لا يُحذف منه شيء: سجل تاريخ. آمن لإعادة التشغيل.
create table if not exists leaders.nudges (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  sender text not null check (sender in ('admin', 'mentor', 'assistant', 'coordinator', 'auto')),
  sender_label text,
  sender_ref text,
  stage_key text not null,
  stage_title text,
  step text,
  channels text[] not null default array['email']::text[],
  subject text,
  body text not null check (char_length(body) between 3 and 2000),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists nudges_person on leaders.nudges (participant_id, created_at desc);
create index if not exists nudges_sender on leaders.nudges (sender, created_at desc);
alter table leaders.nudges enable row level security;
comment on table leaders.nudges is 'سجل التذكير الموحد: كل تذكير وصل المشارك، مرسله ومرحلته وقناته، ولقطة موضعه لقياس الأثر';

insert into leaders.schema_migrations (name) values ('20261116080000_leaders_nudges') on conflict do nothing;
