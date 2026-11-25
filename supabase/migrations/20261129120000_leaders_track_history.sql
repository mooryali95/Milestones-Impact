-- deploy-gate: tolerant الدوال تتسامح مع غيابه: الاعتماد يكتب السجل و«الجديد» بعد حفظ المستويات وخطؤه يُسجَّل ولا يُسقط الاعتماد،
-- والقراءة (الرحلة والوثيقة والكتيب) تعيد قوائم فارغة إن غاب الجدولان، فلا وسم «جديد» ولا سجل قبل الترحيل.
-- ════════════════════════════════════════════════════════════════
-- سجل المسار و«جديد في مستواك» (بطاقة المسار، المرحلة 3، قرار المالك 2026-11-25)
-- ════════════════════════════════════════════════════════════════
-- 1) participant_track_history: كل اعتماد غيّر مسار المشارك (M{m}I{i}L{l})، من أين وإلى أين، ومن اعتمده ومتى، وسطر التطور
--    وأعداد ما أضيف. يراه المشارك والمستشار. يُحذف مع الحساب، ويُصدَّر في نسخة بياناته (privacy.js).
-- 2) participant_new_items: ما أضافه المسار الجديد (باب كتيب، فصل وثيقة، حقل في فصل) حتى يراه المشارك، بدل تخزين المتصفح:
--    الوسم يتبعه على كل جهاز، ولا يضيع بمسح المتصفح. seen_at حين يفتحه.
-- الدوال وحدها تقرأ وتكتب (service_role)، كبقية جداول leaders. آمن لإعادة التشغيل.

create table if not exists leaders.participant_track_history (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  from_track text check (from_track is null or from_track ~ '^M[1-3]I[1-3]L[1-3]$'),
  to_track text not null check (to_track ~ '^M[1-3]I[1-3]L[1-3]$'),
  profile_key text,
  line text,
  added jsonb not null default '{}'::jsonb,
  decided_by text,
  created_at timestamptz not null default now()
);
create index if not exists participant_track_history_by_participant on leaders.participant_track_history (participant_id, created_at desc);
alter table leaders.participant_track_history enable row level security;
revoke all on leaders.participant_track_history from anon, authenticated;

create table if not exists leaders.participant_new_items (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  kind text not null check (kind in ('handbook', 'chapter', 'field')),
  key text not null check (char_length(key) between 1 and 200),
  track_key text check (track_key is null or track_key ~ '^M[1-3]I[1-3]L[1-3]$'),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (participant_id, kind, key)
);
alter table leaders.participant_new_items enable row level security;
revoke all on leaders.participant_new_items from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261129120000_leaders_track_history') on conflict do nothing;
