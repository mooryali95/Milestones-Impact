-- ════════════════════════════════════════════════════════════════
-- ملاحظات المشارك: سجل واحد لما يُلاحظ عليه وما يُنبَّه إليه وما يُشاد به (تصور ملف المشارك، اعتمده المالك 2026-11-13)
-- ════════════════════════════════════════════════════════════════
-- المصدر الواحد: يكتب فيه النظام تلقائيًا (source = system، بمفتاح قاعدته code ومرجع واقعته ref)، والإدارة والمستشار
-- يدويًا. منه يقرأ ملف المشارك في اللوحة، وبطاقة التنبيه عند المشارك (visible)، والبريد، ونسخة بياناته (المرئي له وحده).
-- لا يكرر إشارة محسوبة: الأعلام (جهد منخفض، معلم متأخر…) تُشتق من مصادرها عند العرض، وهذا الجدول لما يُكتب ويُبلَّغ.
create table if not exists leaders.participant_observations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'warning', 'commendation')),
  source text not null check (source in ('admin', 'advisor', 'system')),
  code text,
  ref text,
  title text,
  body text not null check (char_length(body) between 3 and 2000),
  visible boolean not null default false,
  author text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists participant_observations_person on leaders.participant_observations (participant_id, created_at desc);
-- واقعة النظام الواحدة تُكتب مرة واحدة: القاعدة ومرجعها (معرّف الجلسة أو المعلم…) لا يتكرران للمشارك نفسه
create unique index if not exists participant_observations_once on leaders.participant_observations (participant_id, code, ref) where code is not null;
alter table leaders.participant_observations enable row level security;
comment on table leaders.participant_observations is 'ملاحظات وتنبيهات وإشادات المشارك: من النظام والإدارة والمستشار. visible = يراها المشارك';

insert into leaders.schema_migrations (name) values ('20261113120000_leaders_participant_observations') on conflict do nothing;
