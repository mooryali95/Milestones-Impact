-- ════════════════════════════════════════════════════════════════
-- مصدر واحد للدفعة الحاكمة (تصور المرحلة 4، م2): التعبئة والفهرس الفريد الجزئي
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-4-مصدر-واحد-للدفعة-الحاكمة-v1.md §5 البندان 2 و3 و§6 م2 (اعتمده المالك 2026-11-26).
-- ترحيل حاجب عمدًا (بلا وسم deploy-gate): الدوال بعده لا تستنتج الدفعة بالجهة (م3)، فلا تُنشر قبل أن يكون لكل مشارك قائم
-- إلحاق صريح. يُشغَّل قبله scripts/db/verify-single-cohort.sql قراءةً وتُعرض أرقامه على المالك، ثم premigration-backup.mjs ثم التطبيق
-- (apply-and-deploy)، ثم الفحص نفسه يعطي صفرًا في الإلحاق المزدوج ومن بلا دفعة غير المستثنين.
-- أ) الإلحاق المزدوج: لكل مشارك بأكثر من إلحاق قائم يبقى الأحدث (created_at ثم المعرّف) ويُسحب ما سواه (status = 'withdrawn')،
--    بنسخة في backup_20261129_single_cohort وسطر audit_log enrollment.duplicate_withdrawn. لا يُحذف صف.
-- ب) من لا إلحاق قائم له يُلحق بـ place_participant (الدالة نفسها التي يستعملها التسجيل) بالمصدر 'manual' والفاعل
--    migration:20261129230000، فيُلحق بدفعة جهته الجارية التي كان يحكمه بها الاستنتاج فلا تتغير رحلته، أو استقبالها، أو المنصة العامة.
--    يُستثنى: التجريبي (دفعته من عموده)، والحسابات الخمسة التي سماها المالك (ببصمة الاسم كما في 20261128170000)، والموقوف والمنسحب
--    (لا رحلة لهم). حساب الاختبار (is_test) ذو الجهة يُلحق بدفعة جهتها ليرى ما يراه المشارك، ويبقى معفى من العد بعلامته (القرار 3).
-- ج) الفهرس الفريد الجزئي enrollments_one_active: إلحاق قائم واحد لكل مشارك، يمنع السباق بين نقلين.
-- د) تحقق ذاتي يرمي (فيُرجع الترحيل كله) إن بقي مشارك غير مستثنى بلا دفعة أو بإلحاقين.
-- آمن لإعادة التشغيل: المسحوب لا يعود قائمًا، والملحق له دفعة، والنسخة الاحتياطية تُنسخ إليها الصفوف مرة.

-- restore: drop index if exists leaders.enrollments_one_active; update leaders.enrollments e set status = b.status, updated_at = now() from leaders.backup_20261129_single_cohort b where b.kind = 'withdraw' and e.id::text = b.ref; delete from leaders.enrollments e using leaders.cohort_placements c where c.actor = 'migration:20261129230000' and e.participant_id = c.participant_id and e.cohort_id = c.cohort_id; delete from leaders.cohort_placements where actor = 'migration:20261129230000'; delete from leaders.cohorts c using leaders.backup_20261129_single_cohort b where b.kind = 'cohort' and c.id::text = b.ref and not exists (select 1 from leaders.enrollments e where e.cohort_id = c.id)

-- الحسابات الخمسة التي استثناها المالك: بصمات 20261128170000 نفسها
create or replace function pg_temp.excluded_test(n text) returns boolean language sql immutable as $f$
  select md5(regexp_replace(coalesce(n, ''), '^[\s ]+|[\s ]+$', '', 'g')) in ('fabd495fc8a7654531ea1b20e4260a4a', '95f8958a8fbcda02de1a8a5cf8f4f3a9', '34bba4869d4a4a9b23ca3d3b021ffa9b',
                                         '406c5913519e5427b9a6717e29cf2f12', 'a3b0d8be3bc69a1c348a6f2ec974a3eb')
$f$;

-- الإلحاقات القائمة الزائدة: كل إلحاق قائم ليس الأحدث لمشاركه
create or replace function pg_temp.extra_enrollments()
returns table (id uuid, participant_id uuid, cohort_id uuid, status text) language sql stable as $f$
  select x.id, x.participant_id, x.cohort_id, x.status from (
    select e.id, e.participant_id, e.cohort_id, e.status,
           row_number() over (partition by e.participant_id order by e.created_at desc, e.id desc) rn
      from leaders.enrollments e where e.status <> 'withdrawn') x
   where x.rn > 1
$f$;

-- من يُلحق: قائم بلا إلحاق قائم وليس مستثنى. حساب الاختبار بجهة فقط
create or replace function pg_temp.to_place()
returns table (id uuid) language sql stable as $f$
  select pa.id from leaders.participants pa
   where not pa.is_demo and not pg_temp.excluded_test(pa.full_name)
     and pa.status not in ('suspended', 'withdrawn')
     and (not pa.is_test or pa.organization_id is not null)
     and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn')
$f$;

-- النسخة الاحتياطية: الإلحاقات التي ستُسحب (kind withdraw)، ثم من يُلحق (place) والدفعات التي ينشئها الإلحاق (cohort)
create table if not exists leaders.backup_20261129_single_cohort as
  select 'withdraw'::text kind, x.participant_id, x.id::text ref, x.status, now() backed_up_at from pg_temp.extra_enrollments() x;
alter table leaders.backup_20261129_single_cohort enable row level security;
revoke all on leaders.backup_20261129_single_cohort from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'backup_20261129_single_cohort_participant_fk') then
    alter table leaders.backup_20261129_single_cohort add constraint backup_20261129_single_cohort_participant_fk
      foreign key (participant_id) references leaders.participants(id) on delete cascade;
  end if;
end $$;

-- أ) الإلحاق المزدوج
insert into leaders.backup_20261129_single_cohort (kind, participant_id, ref, status)
select 'withdraw', x.participant_id, x.id::text, x.status from pg_temp.extra_enrollments() x
 where not exists (select 1 from leaders.backup_20261129_single_cohort b where b.kind = 'withdraw' and b.ref = x.id::text);

with upd as (
  update leaders.enrollments e set status = 'withdrawn', updated_at = now()
    from pg_temp.extra_enrollments() x where e.id = x.id
  returning e.id, e.participant_id, e.cohort_id
)
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
select 'system', 'migration:20261129230000', 'enrollment.duplicate_withdrawn', 'enrollments', u.id::text,
       jsonb_build_object('participant_id', u.participant_id, 'cohort_id', u.cohort_id, 'status', b.status),
       jsonb_build_object('status', 'withdrawn', 'why', 'إلحاق قائم ثانٍ للمشارك نفسه؛ يبقى الأحدث')
  from upd u left join leaders.backup_20261129_single_cohort b on b.kind = 'withdraw' and b.ref = u.id::text;

-- ب) الإلحاق، واحدًا واحدًا. 'none' يرمي فورًا. الدفعات التي ينشئها الإلحاق تُسجَّل فيحذفها سطر restore إن بقيت فارغة
insert into leaders.backup_20261129_single_cohort (kind, participant_id)
select 'place', t.id from pg_temp.to_place() t;
create temp table single_cohort_before on commit drop as select id from leaders.cohorts;
do $$
declare r record; res record;
begin
  for r in select id from pg_temp.to_place() order by id loop
    select * into res from leaders.place_participant(r.id, 'manual', null, 'migration:20261129230000');
    if res.outcome = 'none' then
      raise exception 'single_cohort: place_participant returned none for participant %', r.id;
    end if;
    insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
    values ('system', 'migration:20261129230000', 'participant.cohort_backfill', 'participants', r.id::text, null,
            jsonb_build_object('cohort_id', res.cohort_id, 'outcome', res.outcome));
  end loop;
end $$;
insert into leaders.backup_20261129_single_cohort (kind, ref)
select 'cohort', c.id::text from leaders.cohorts c
 where not exists (select 1 from single_cohort_before x where x.id = c.id)
   and not exists (select 1 from leaders.backup_20261129_single_cohort b where b.kind = 'cohort' and b.ref = c.id::text);
drop table single_cohort_before;

-- ج) إلحاق قائم واحد لكل مشارك
create unique index if not exists enrollments_one_active on leaders.enrollments (participant_id) where status <> 'withdrawn';

-- د) التحقق الذاتي
do $$
declare n int; m int;
begin
  select count(*) into n from pg_temp.to_place();
  if n > 0 then raise exception 'single_cohort: % participant(s) still without a cohort', n; end if;
  select count(*) into m from (select participant_id from leaders.enrollments where status <> 'withdrawn' group by 1 having count(*) > 1) x;
  if m > 0 then raise exception 'single_cohort: % participant(s) enrolled in more than one cohort', m; end if;
end $$;

insert into leaders.schema_migrations (name) values ('20261129230000_leaders_single_cohort') on conflict do nothing;
