-- قراءة فقط: جرد الفصول الثمانية غير المعرّفة في المستودع (docs/content/2026-11-24-جرد-ما-يراه-كل-مستوى-في-الوثيقة-v1.md §3). لا يكتب شيئًا.
-- 0) هل طُبّق ترحيل المستفيدين والوصول، وهل الحقلان في البطاقة
select (exists (select 1 from leaders.schema_migrations where name = '20261128130000_leaders_charter_beneficiaries')
        and exists (select 1 from leaders.learning_models where key = 'initiative-charter' and fields @> '[{"key":"beneficiaries"},{"key":"reach"}]'::jsonb)) as ok,
  'ledger=' || (exists (select 1 from leaders.schema_migrations where name = '20261128130000_leaders_charter_beneficiaries'))::text
  || ' · fields=' || coalesce((select string_agg(f->>'key', ',' order by o) from leaders.learning_models m, jsonb_array_elements(m.fields) with ordinality e(f, o) where m.key = 'initiative-charter'), '-') as detail;
-- 1) لكل فصل من الثمانية: الإطار، يظهر من، نشط، وعدد الحقول لكل مستوى (نطاق مشروع، دون حقول المسار)، وحقول كل مستوى
select true as ok, coalesce(string_agg(
  m.key || ' · dim=' || coalesce(m.dimension, '-') || ' · from=' || coalesce(m.min_level, 'beginner') || ' · active=' || coalesce(m.active::text, '-')
  || ' · B=' || (select count(*) from jsonb_array_elements(m.fields) f where coalesce(f->>'min_level', 'beginner') = 'beginner' and not f ? 'track' and (not f ? 'scopes' or f->'scopes' ? 'project'))
  || ' I=' || (select count(*) from jsonb_array_elements(m.fields) f where coalesce(f->>'min_level', 'beginner') in ('beginner', 'intermediate') and not f ? 'track' and (not f ? 'scopes' or f->'scopes' ? 'project'))
  || ' A=' || (select count(*) from jsonb_array_elements(m.fields) f where not f ? 'track' and (not f ? 'scopes' or f->'scopes' ? 'project'))
  || ' · fields=' || coalesce((select string_agg((f->>'key') || ':' || coalesce(f->>'min_level', 'b') || case when f ? 'track' then ':track' else '' end || case when f->>'required' = 'false' then ':opt' else '' end, ',' order by o) from jsonb_array_elements(m.fields) with ordinality e(f, o)), '-'),
  ' | ' order by m.sort), 'لا فصول') as detail
from leaders.learning_models m
where m.key in ('benefits-register','milestone-register','theory-of-change','stakeholder-map','stage-gate','impact-report','portfolio-review','development-plan');
