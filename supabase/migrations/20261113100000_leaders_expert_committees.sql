-- ════════════════════════════════════════════════════════════════
-- عضوية لجنتي المحتوى والقياس على سجل الخبير (تصور وضوح الإدارة، المرحلة 3، اعتمده المالك 2026-11-13)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تحفظ ملف الخبير بلا العمود، وتقول عن عضوية اللجنة «تُحفظ بعد تطبيق ترحيلها» (experts.ts adminSave)، والقراءة بـ* فلا تتأثر
-- المصدر الواحد: كانت العضوية مقاعد فارغة في وثيقة (docs/content/لجنة-المحتوى-والقياس-التشكيل-v1.md). صارت حقلًا على
-- سجل الخبير نفسه، ومقعد كل إطار في لجنة المحتوى يُشتق من أبعاد الخبير (dimensions) القائمة، فلا قائمة ثانية.
alter table leaders.experts add column if not exists committees text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'experts_committees_chk') then
    alter table leaders.experts add constraint experts_committees_chk check (committees <@ array['content', 'measurement']::text[]);
  end if;
end $$;
comment on column leaders.experts.committees is 'عضوية لجان الحوكمة: content (لجنة المحتوى) وmeasurement (لجنة القياس). يضبطها المدير من ملف الخبير';

insert into leaders.schema_migrations (name) values ('20261113100000_leaders_expert_committees') on conflict do nothing;
