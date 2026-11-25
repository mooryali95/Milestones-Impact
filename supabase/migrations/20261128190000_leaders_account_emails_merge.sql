-- ════════════════════════════════════════════════════════════════
-- حساب واحد بأكثر من بريد: الربط بدل «الأرشفة والإقفال» (اعتمده المالك 2026-11-25)
-- ════════════════════════════════════════════════════════════════
-- الترتيب: يُطبَّق هذا الترحيل قبل 20261128180000 (فهرس الهاتف الفريد)، ثم 20261128180000 بعده: «20261128190000، 20261128180000».
-- حاجب: الدوال بعده تقرأ participant_emails عند الدخول، وتستدعي merge_participants وmerge_preview في ربط الإدارة.
-- 1) participant_emails: البريد البديل لحساب قائم. البريد الأساسي يبقى في participants.email وحده (المصدر الواحد)، فالجدول للبدائل
--    وحدها وis_primary فيه false دائمًا بقيد؛ «اجعله أساسيًا» يبادل بين الموضعين في دالة واحدة (participant_email_make_primary).
--    البريد الواحد لا يكون لحسابين أبدًا: فهرس فريد على lower(email) في كل جدول، ومشغّل على الجدولين يرفض بريدًا موجودًا في الآخر،
--    بقفل استشاري على البريد نفسه فلا يمر طلبان متزامنان بين الفحص والكتابة. الرفض بالرمز 23505 كتعارض الفهرس.
-- 2) merge_participants(keep, dup): يدمج الحساب المكرر في الباقي داخل معاملته:
--    - بريد المكرر يصير بديلًا للباقي، ويُستبدل في صفه بعنوان مقفل (merged-<id>@merged.invalid) فلا يُدخل به إليه، ويُوقف، وتُبطل جلساته.
--    - كل جدول له مفتاح أجنبي إلى participants (من pg_constraint، فلا يُنسى جدول) تُنقل صفوفه إلى الباقي، عدا الجلسات وتحديات الدخول.
--    - تعارض مفتاح فريد: يبقى الصف الأبعد تقدمًا في جداول التقدم والاعتماد (merge_rank)، وإلا صف الباقي. الخاسر يُحفظ كاملًا في سجل الدمج
--      ثم يُحذف، وما يشير إليه من صفوف يُنقل أولًا إلى الفائز. الشهادة لا تُحذف: سارية المكرر تصير replaced إن كان للباقي سارية.
--    - كنس أخير: كل صف بقي يشير إلى المكرر في جدول من الجداول نفسها يُنقل أو يُسجَّل، ثم تحقق يرمي إن بقي شيء.
--    - إلحاقان قائمان بدفعتين مختلفتين: إلحاق المكرر يُسحب (withdrawn) فلا يصير للباقي دفعتان. وفي الدفعة نفسها يُدمجان.
--    - الحقول الفارغة في ملف الباقي تأخذ قيمة المكرر، وحاله في الرحلة الأبعد بينهما.
--    - كل تغيير سطر في participant_merge_rows (set/deleted/inserted)، فـ unmerge_participants يعيده كما كان.
--    - سطر audit_log participant.merged بمعرّف الباقي (kept_id) وأعداد ما انتقل، بلا بريد.
-- 3) merge_preview: الدمج نفسه داخل معاملة فرعية تُرجع، فيعيد ما سينتقل ويتعارض كما سيقع، ولا يكتب شيئًا.
-- 4) معالجة لمرة واحدة: كل زوج بهاتف واحد من الحسابات غير التجريبية القائمة، وحساب الاختبار منها (النطاق نفسه في التحقق الذاتي
--    وفي فهرس 20261128180000 وفي حارس الهاتف holdsPhone، فالثلاثة قاعدة واحدة)، الباقي الأحدث دخولًا ثم الأحدث إنشاءً
--    (قاعدة 20261128170000 نفسها)، يُدمج فيه المكرر ولو كان له أثر. والمكرر الذي أرشفه 20261128170000 يُدمج كذلك فيصير بريده بديلًا.
--    ثم تحقق ذاتي يرمي (فيُرجع الترحيل كله) إن بقي هاتف لأكثر من حساب قائم، فيُطبَّق 20261128180000 بعده بلا رفض.
-- الخصوصية: حذف المشارك (المحو) يحذف قبله حساباته المدموجة فيه وصفوفه في backup_20261128_account_merge (participant_merge_erase)،
--    وسجل الدمج يُمحى معه بالمفتاح الأجنبي. جدول النسخة يُحذف بعد 30 يومًا من التطبيق (RUNBOOK.md §4).
-- آمن لإعادة التشغيل: المكرر المدموج موقوف وبريده مقفل فلا يعود في الأزواج، والجداول والدوال بـ if not exists وor replace.

-- restore: select leaders.unmerge_participants(m.id, 'system', 'restore:20261128190000') from leaders.participant_merges m where m.actor = 'migration:20261128190000' and m.restored_at is null order by m.created_at desc, m.id desc

-- ── 1) البريد البديل ──
create table if not exists leaders.participant_emails (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  email text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  source text not null default 'admin_link',
  created_at timestamptz not null default now(),
  constraint participant_emails_email_check check (char_length(email) <= 254 and email = lower(btrim(email)) and position('@' in email) > 1),
  constraint participant_emails_alternate_only check (not is_primary),
  constraint participant_emails_source_check check (source in ('merge', 'admin_link', 'migration'))
);
create unique index if not exists participant_emails_email_uniq on leaders.participant_emails (lower(email));
create index if not exists participant_emails_participant_idx on leaders.participant_emails (participant_id);
alter table leaders.participant_emails enable row level security;
revoke all on leaders.participant_emails from anon, authenticated;

-- بريد واحد لحساب واحد عبر الجدولين
create or replace function leaders.email_owner_guard() returns trigger language plpgsql as $f$
declare e text := lower(new.email);
begin
  if tg_op = 'UPDATE' and lower(old.email) = e then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('leaders.email:' || e, 0));
  if tg_table_name = 'participant_emails' then
    if exists (select 1 from leaders.participants where lower(email) = e) then
      raise exception using errcode = '23505', message = 'email_taken: البريد أساسي لحساب قائم', detail = 'participant_emails_cross_uniq';
    end if;
  elsif exists (select 1 from leaders.participant_emails where lower(email) = e) then
    raise exception using errcode = '23505', message = 'email_taken: البريد بديل لحساب قائم', detail = 'participant_emails_cross_uniq';
  end if;
  return new;
end $f$;
create or replace trigger participants_email_owner before insert or update of email on leaders.participants
  for each row execute function leaders.email_owner_guard();
create or replace trigger participant_emails_email_owner before insert or update of email on leaders.participant_emails
  for each row execute function leaders.email_owner_guard();

-- ── 2) سجل الدمج ──
create table if not exists leaders.participant_merges (
  id uuid primary key default gen_random_uuid(),
  kept_id uuid not null references leaders.participants(id) on delete cascade,
  merged_id uuid not null references leaders.participants(id) on delete cascade,
  actor text not null,
  restored_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists participant_merges_merged_idx on leaders.participant_merges (merged_id);
create table if not exists leaders.participant_merge_rows (
  id bigint generated always as identity primary key,
  merge_id uuid not null references leaders.participant_merges(id) on delete cascade,
  kind text not null check (kind in ('set', 'deleted', 'inserted')),
  tbl text not null,
  col text not null,
  ref jsonb not null
);
create index if not exists participant_merge_rows_merge_idx on leaders.participant_merge_rows (merge_id);
alter table leaders.participant_merges enable row level security;
alter table leaders.participant_merge_rows enable row level security;
revoke all on leaders.participant_merges from anon, authenticated;
revoke all on leaders.participant_merge_rows from anon, authenticated;

create or replace function leaders.merge_qname(p_rel regclass) returns text language sql stable as $f$
  select format('%I.%I', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.oid = p_rel
$f$;

-- المفتاح الأساسي للصف (أو الصف كله إن لم يكن له مفتاح)
create or replace function leaders.merge_pk(p_rel regclass, p_row jsonb) returns jsonb language sql stable as $f$
  select coalesce((select jsonb_object_agg(a.attname, p_row -> a.attname::text)
                     from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                    where i.indrelid = p_rel and i.indisprimary), p_row)
$f$;

create or replace function leaders.merge_epoch(t text) returns numeric language sql immutable as $f$
  select coalesce(extract(epoch from t::timestamptz)::numeric, 0)
$f$;

-- رتبة الصف في جداول التقدم والاعتماد: عند تعارض المفتاح يبقى الأبعد تقدمًا أيًا كان حسابه (مقارنة مصفوفات، الأكبر أبعد).
-- null: لا رتبة للجدول، فيبقى صف الحساب الباقي. حضور الورش اتحاد بطبعه: التعارض حضور الورشة نفسها، فلا يضيع شيء.
create or replace function leaders.merge_rank(p_tbl text, r jsonb) returns numeric[] language sql immutable as $f$
  select case split_part(p_tbl, '.', 2)
    when 'final_evaluations' then array[coalesce(array_position(array['draft', 'returned', 'pending', 'approved'], r ->> 'status'), 0), leaders.merge_epoch(r ->> 'decided_at'), leaders.merge_epoch(r ->> 'updated_at')]
    when 'handbook_progress' then array[coalesce((r ->> 'quiz_score')::numeric, 0), leaders.merge_epoch(r ->> 'completed_at')]
    when 'reading_progress' then array[coalesce((r ->> 'active_seconds')::numeric, 0), coalesce((r ->> 'words')::numeric, 0)]
    when 'video_progress' then array[(r ->> 'completed_at' is not null)::int, coalesce((r ->> 'watched_seconds')::numeric, 0), leaders.merge_epoch(r ->> 'completed_at')]
    when 'content_progress' then array[(r ->> 'completed_at' is not null)::int, coalesce((r ->> 'watched_seconds')::numeric, 0), leaders.merge_epoch(r ->> 'completed_at')]
    when 'participant_requirements' then array[coalesce(array_position(array['pending', 'returned', 'submitted', 'done'], r ->> 'status'), 0), leaders.merge_epoch(r ->> 'completed_at'), leaders.merge_epoch(r ->> 'submitted_at')]
    when 'placements' then array[(r ->> 'approved_at' is not null)::int, leaders.merge_epoch(r ->> 'approved_at'), leaders.merge_epoch(r ->> 'decided_at')]
    when 'participant_milestones' then array[(r ->> 'done_at' is not null)::int, leaders.merge_epoch(r ->> 'done_at'), leaders.merge_epoch(r ->> 'updated_at')]
    when 'assessments' then array[(r ->> 'status' = 'submitted')::int, leaders.merge_epoch(r ->> 'submitted_at'), leaders.merge_epoch(r ->> 'started_at')]
    else null end
$f$;


-- نقل ما يشير إلى صف (p_from) إلى صف آخر (p_to) في الجدول نفسه، بـ merge_resolve فتعارض التابع يُحل كذلك
create or replace function leaders.merge_rehome(p_mid uuid, p_rel regclass, p_from jsonb, p_to jsonb, p_depth int) returns void language plpgsql as $f$
declare fk record; ch record; oldv jsonb; q text := leaders.merge_qname(p_rel);
begin
  for fk in
    select c.conrelid, a.attname fcol, ra.attname rcol
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
     where c.contype = 'f' and c.confrelid = p_rel and cardinality(c.conkey) = 1
  loop
    oldv := p_from -> fk.rcol::text;
    if oldv is null or jsonb_typeof(oldv) = 'null' then continue; end if;
    for ch in execute format('select t.ctid c, to_jsonb(t) j from %s t where t.%I = (jsonb_populate_record(null::%s, $1)).%I',
                             leaders.merge_qname(fk.conrelid), fk.fcol, q, fk.rcol) using p_from
    loop
      if p_to is null then raise exception 'merge_unresolved: % (يشير إليه %)', q, leaders.merge_qname(fk.conrelid); end if;
      perform leaders.merge_resolve(p_mid, fk.conrelid, fk.fcol, ch.c, ch.j, p_to -> fk.rcol::text, p_depth + 1);
    end loop;
  end loop;
end $f$;

-- تغيير عمود في صف إلى قيمة جديدة. إن تعارض مع مفتاح فريد: يُبحث عن نظيره بأعمدة الفهرس نفسه، ثم يبقى الأبعد تقدمًا (merge_rank)،
-- وعند التساوي أو بلا رتبة صف الحساب الباقي. ما يشير إلى الخاسر يُنقل إلى الفائز، ثم يُحفظ الخاسر كاملًا ويُحذف.
-- الشهادة لا تُحذف أبدًا (الشهادة السارية للمكرر تصير replaced قبل النقل)، وما يشير إليه ولا نظير له يرمي فيُرجع الدمج كله.
create or replace function leaders.merge_resolve(p_mid uuid, p_rel regclass, p_col text, p_ctid tid, p_row jsonb, p_new jsonb, p_depth int default 0)
returns void language plpgsql as $f$
declare
  q text := leaders.merge_qname(p_rel);
  target jsonb := p_row || jsonb_build_object(p_col, p_new);
  after jsonb; other jsonb; octid tid; cond text; ix record;
begin
  if p_depth > 4 then raise exception 'merge_too_deep: %', q; end if;
  begin
    execute format('update %s t set %I = (jsonb_populate_record(null::%s, $1)).%I where ctid = $2 returning to_jsonb(t)', q, p_col, q, p_col)
      into after using target, p_ctid;
    insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref)
    values (p_mid, 'set', q, p_col, jsonb_build_object('pk', leaders.merge_pk(p_rel, after), 'old', p_row -> p_col, 'new', p_new, 'updated_at', p_row -> 'updated_at', 'h', md5(p_row::text)));
    return;
  exception when unique_violation or exclusion_violation then
    null;
  end;
  if q = 'leaders.certificates' then raise exception 'merge_certificate_conflict: شهادة لا تُحذف'; end if;
  for ix in
    select i.indkey::int2[] k, pg_get_expr(i.indpred, i.indrelid) pred
      from pg_index i
     where i.indrelid = p_rel and i.indisunique and not (0 = any(i.indkey::int2[]))
       and (select a.attnum from pg_attribute a where a.attrelid = p_rel and a.attname = p_col) = any(i.indkey::int2[])
     order by i.indisprimary desc, i.indexrelid
  loop
    select string_agg(format('t.%I is not distinct from (jsonb_populate_record(null::%s, $1)).%I', a.attname, q, a.attname), ' and ')
      into cond from pg_attribute a where a.attrelid = p_rel and a.attnum = any(ix.k);
    execute format('select to_jsonb(t), t.ctid from %s t where %s%s and t.ctid <> $2 limit 1', q, cond, coalesce(' and (' || ix.pred || ')', ''))
      into other, octid using target, p_ctid;
    exit when other is not null;
  end loop;
  -- الأبعد تقدمًا يبقى: صف المكرر يفوز، فيُنقل إليه ما يشير إلى صف الباقي، ويُحفظ صف الباقي ويُحذف، ثم يُنقل صف المكرر
  if p_depth = 0 and other is not null and leaders.merge_rank(q, p_row) > leaders.merge_rank(q, other) then
    perform leaders.merge_rehome(p_mid, p_rel, other, p_row, p_depth);
    execute format('delete from %s where ctid = $1', q) using octid;
    insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref) values (p_mid, 'deleted', q, p_col, jsonb_build_object('row', other, 'won', 'merged'));
    execute format('update %s t set %I = (jsonb_populate_record(null::%s, $1)).%I where ctid = $2 returning to_jsonb(t)', q, p_col, q, p_col)
      into after using target, p_ctid;
    insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref)
    values (p_mid, 'set', q, p_col, jsonb_build_object('pk', leaders.merge_pk(p_rel, after), 'old', p_row -> p_col, 'new', p_new, 'updated_at', p_row -> 'updated_at', 'h', md5(p_row::text)));
    return;
  end if;
  perform leaders.merge_rehome(p_mid, p_rel, p_row, other, p_depth);
  execute format('delete from %s where ctid = $1', q) using p_ctid;
  insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref) values (p_mid, 'deleted', q, p_col, jsonb_build_object('row', p_row));
end $f$;

-- تسجيل تغيير عمود في صف بمفتاحه (للإرجاع)
create or replace function leaders.merge_note_set(p_mid uuid, p_rel regclass, p_col text, p_row jsonb, p_new jsonb) returns void language sql as $f$
  insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref)
  values (p_mid, 'set', leaders.merge_qname(p_rel), p_col,
          jsonb_build_object('pk', leaders.merge_pk(p_rel, p_row), 'old', p_row -> p_col, 'new', p_new, 'updated_at', p_row -> 'updated_at', 'h', md5(p_row::text)))
$f$;

-- ما انتقل وما تعارض، بالأعداد وحدها لكل جدول
create or replace function leaders.merge_summary(p_mid uuid) returns jsonb language sql stable as $f$
  select coalesce(jsonb_object_agg(t, s), '{}'::jsonb) from (
    select split_part(tbl, '.', 2) t, jsonb_object_agg(k, n) s from (
      select tbl, case when kind = 'set' and tbl = 'leaders.participants' then 'fields'
                       when kind = 'set' and col = 'participant_id' then 'moved'
                       when kind = 'set' then col else kind end k, count(*) n
        from leaders.participant_merge_rows where merge_id = p_mid group by 1, 2) x group by 1) y
$f$;

create or replace function leaders.merge_participants(p_keep uuid, p_dup uuid, p_actor text, p_actor_type text default 'system', p_source text default 'merge')
returns uuid language plpgsql as $f$
declare
  k record; d record; mid uuid; fk record; r record; cap jsonb; c text; kv jsonb; dv jsonb; n int;
  stages text[] := array['registered', 'profiled', 'assessing', 'pending_approval', 'placed', 'enrolled', 'completed'];
  fill text[] := array['phone', 'job_title', 'organization_name', 'sector', 'years_experience', 'bio', 'cv_path', 'linkedin_url', 'name_en', 'work_scope', 'profile_completed_at'];
begin
  if p_keep is null or p_dup is null or p_keep = p_dup then raise exception 'merge_same: حسابان مختلفان مطلوبان'; end if;
  perform 1 from leaders.participants where id in (p_keep, p_dup) order by id for update;
  select * into k from leaders.participants where id = p_keep;
  select * into d from leaders.participants where id = p_dup;
  if k.id is null or d.id is null then raise exception 'merge_missing: الحساب غير موجود'; end if;
  if k.is_demo or d.is_demo then raise exception 'merge_demo: الحساب التجريبي لا يُربط'; end if;
  if k.status in ('suspended', 'withdrawn') then raise exception 'merge_kept_inactive: الحساب الباقي موقوف أو منسحب'; end if;
  if d.email like 'merged-%@merged.invalid' then raise exception 'merge_already: الحساب مدموج من قبل'; end if;

  insert into leaders.participant_merges (kept_id, merged_id, actor) values (p_keep, p_dup, p_actor) returning id into mid;

  -- أ) البريد والحال: بريد المكرر يصير بديلًا للباقي، وصفه يُوقف بعنوان مقفل
  perform leaders.merge_note_set(mid, 'leaders.participants', 'email', to_jsonb(d), to_jsonb('merged-' || p_dup || '@merged.invalid'));
  perform leaders.merge_note_set(mid, 'leaders.participants', 'status', to_jsonb(d), to_jsonb('suspended'::text));
  update leaders.participants set email = 'merged-' || p_dup || '@merged.invalid', status = 'suspended', updated_at = now() where id = p_dup;
  insert into leaders.participant_emails (participant_id, email, verified_at, source)
  values (p_keep, lower(d.email), d.email_verified_at, p_source) returning to_jsonb(participant_emails.*) into kv;
  insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref)
  values (mid, 'inserted', 'leaders.participant_emails', 'id', jsonb_build_object('pk', jsonb_build_object('id', kv -> 'id')));
  for r in update leaders.auth_sessions s set revoked_at = now() where s.participant_id = p_dup and s.revoked_at is null
           returning to_jsonb(s) - 'revoked_at' || jsonb_build_object('revoked_at', null) j loop
    perform leaders.merge_note_set(mid, 'leaders.auth_sessions', 'revoked_at', r.j, to_jsonb(now()));
  end loop;

  -- ب) ملف الباقي: الفارغ يأخذ قيمة المكرر، والحال الأبعد في الرحلة
  for c in select unnest(fill) loop
    kv := to_jsonb(k) -> c; dv := to_jsonb(d) -> c;
    if (kv is null or jsonb_typeof(kv) = 'null') and dv is not null and jsonb_typeof(dv) <> 'null' then
      perform leaders.merge_note_set(mid, 'leaders.participants', c, to_jsonb(k), dv);
      execute format('update leaders.participants t set %I = (jsonb_populate_record(null::leaders.participants, $1)).%I where id = $2', c, c)
        using jsonb_build_object(c, dv), p_keep;
    end if;
  end loop;
  if coalesce(array_position(stages, d.status), 0) > coalesce(array_position(stages, k.status), 0) then
    perform leaders.merge_note_set(mid, 'leaders.participants', 'status', to_jsonb(k), to_jsonb(d.status));
    update leaders.participants set status = d.status where id = p_keep;
  end if;
  update leaders.participants set updated_at = now() where id = p_keep;

  -- ج) إلحاق قائم بدفعة أخرى والباقي ملحق: يُسحب إلحاق المكرر فلا يصير للباقي دفعتان
  for r in select to_jsonb(e) j, e.id from leaders.enrollments e
            where e.participant_id = p_dup and e.status <> 'withdrawn'
              and exists (select 1 from leaders.enrollments x where x.participant_id = p_keep and x.status <> 'withdrawn' and x.cohort_id <> e.cohort_id) loop
    perform leaders.merge_note_set(mid, 'leaders.enrollments', 'status', r.j, to_jsonb('withdrawn'::text));
    update leaders.enrollments set status = 'withdrawn' where id = r.id;
  end loop;

  -- د) الوثيقة: صفوف تحديثها تشير إلى capstones(participant_id) لا إلى المشارك، فإن لم تكن للباقي وثيقة تُنسخ وثيقة المكرر إليه أولًا
  --    (بلا رمز الراعي الفريد)، فتنتقل التحديثات، ثم تُحذف وثيقة المكرر في تعارض المفتاح ويعود رمز الراعي إلى النسخة
  select to_jsonb(x) into cap from leaders.capstones x where x.participant_id = p_dup;
  if cap is not null and not exists (select 1 from leaders.capstones where participant_id = p_keep) then
    insert into leaders.capstones select (jsonb_populate_record(null::leaders.capstones, cap || jsonb_build_object('participant_id', p_keep, 'sponsor_token_hash', null))).*;
    insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref)
    values (mid, 'inserted', 'leaders.capstones', 'participant_id', jsonb_build_object('pk', jsonb_build_object('participant_id', p_keep)));
  else
    cap := null;
  end if;

  -- الشهادة لا تُحذف: سارية المكرر تصير replaced إن كان للباقي سارية (فهرس certificates_one_valid)، ثم تنتقل كما هي بسجل replaced_by
  for r in select to_jsonb(x) j, x.id from leaders.certificates x
            where x.participant_id = p_dup and x.status = 'valid'
              and exists (select 1 from leaders.certificates y where y.participant_id = p_keep and y.status = 'valid') loop
    perform leaders.merge_note_set(mid, 'leaders.certificates', 'status', r.j, to_jsonb('replaced'::text));
    update leaders.certificates set status = 'replaced' where id = r.id;
  end loop;

  -- هـ) كل جدول يشير إلى المشارك: نقل جماعي، وعند التعارض صفًا صفًا. الوثيقة بعد صفوف تحديثها
  for fk in
    select c2.conrelid rel, cl.relname, a.attname col
      from pg_constraint c2
      join pg_class cl on cl.oid = c2.conrelid
      join pg_attribute a on a.attrelid = c2.conrelid and a.attnum = c2.conkey[1]
     where c2.contype = 'f' and c2.confrelid = 'leaders.participants'::regclass and cardinality(c2.conkey) = 1
       and cl.relname not in ('auth_sessions', 'webauthn_challenges', 'participant_merges')
     order by (cl.relname = 'capstones'), cl.relname collate "C", a.attname collate "C"
  loop
    begin
      execute format('with u as (update %1$s t set %2$I = $1 where t.%2$I = $2 returning to_jsonb(t) j)
                      insert into leaders.participant_merge_rows (merge_id, kind, tbl, col, ref)
                      select $3, ''set'', %3$L, %4$L, jsonb_build_object(''pk'', leaders.merge_pk(%3$L::regclass, j), ''old'', to_jsonb($2), ''new'', to_jsonb($1), ''updated_at'', j -> ''updated_at'', ''h'', md5(j::text)) from u',
                     leaders.merge_qname(fk.rel), fk.col, leaders.merge_qname(fk.rel), fk.col)
        using p_keep, p_dup, mid;
    exception when unique_violation or exclusion_violation then
      for r in execute format('select t.ctid c, to_jsonb(t) j from %s t where t.%I = $1', leaders.merge_qname(fk.rel), fk.col) using p_dup loop
        perform leaders.merge_resolve(mid, fk.rel, fk.col, r.c, r.j, to_jsonb(p_keep));
      end loop;
    end;
  end loop;

  -- و) الكنس الأخير: صف بقي يشير إلى المكرر (أُضيف أثناء الدمج أو فاته النقل الجماعي) يُنقل أو يُسجَّل صفًا صفًا، ثم لا يبقى شيء
  for fk in
    select c2.conrelid rel, cl.relname, a.attname col
      from pg_constraint c2 join pg_class cl on cl.oid = c2.conrelid
      join pg_attribute a on a.attrelid = c2.conrelid and a.attnum = c2.conkey[1]
     where c2.contype = 'f' and c2.confrelid = 'leaders.participants'::regclass and cardinality(c2.conkey) = 1
       and cl.relname not in ('auth_sessions', 'webauthn_challenges', 'participant_merges')
  loop
    for r in execute format('select t.ctid c, to_jsonb(t) j from %s t where t.%I = $1', leaders.merge_qname(fk.rel), fk.col) using p_dup loop
      perform leaders.merge_resolve(mid, fk.rel, fk.col, r.c, r.j, to_jsonb(p_keep));
    end loop;
    execute format('select count(*) from %s t where t.%I = $1', leaders.merge_qname(fk.rel), fk.col) into n using p_dup;
    if n > 0 then raise exception 'merge_stray: % صف في %.% بقي للمكرر', n, fk.relname, fk.col; end if;
  end loop;

  if cap is not null and cap ->> 'sponsor_token_hash' is not null then
    perform leaders.merge_note_set(mid, 'leaders.capstones', 'sponsor_token_hash', (select to_jsonb(x) from leaders.capstones x where participant_id = p_keep), cap -> 'sponsor_token_hash');
    update leaders.capstones set sponsor_token_hash = cap ->> 'sponsor_token_hash' where participant_id = p_keep and sponsor_token_hash is null;
  end if;

  insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
  values (p_actor_type, p_actor, 'participant.merged', 'participants', p_dup::text, jsonb_build_object('status', d.status),
          jsonb_build_object('status', 'suspended', 'kept_id', p_keep, 'merge_id', mid, 'summary', leaders.merge_summary(mid),
                             'why', 'حساب ثانٍ للشخص نفسه: دُمج في الحساب الباقي وصار بريده بديلًا له'));
  return mid;
end $f$;

-- بصمة ما سيقع: لكل سطر في سجل الدمج جدوله ونوعه ومفتاح الصف وقيمته السابقة ووقت تحديثه وبصمة الصف كله (والصف كاملًا للمتعارض)، فأي تغيّر
-- في صف سيُمس بعد المعاينة يغيّر البصمة. ما تولّده القاعدة عند كل تشغيل (معرّف البريد البديل الجديد، ووقت إبطال الجلسة) خارجها
create or replace function leaders.merge_fingerprint(p_mid uuid) returns text language sql stable as $f$
  select md5(coalesce(string_agg(concat_ws('|', tbl, kind, col,
           case kind when 'inserted' then '' when 'deleted' then (ref -> 'row')::text
                else concat_ws('|', (ref -> 'pk')::text, (ref -> 'old')::text, (ref -> 'updated_at')::text, ref ->> 'h') end), ';' order by id), ''))
    from leaders.participant_merge_rows where merge_id = p_mid
$f$;

-- المعاينة: الدمج نفسه ثم إرجاعه، فيعود ما سيقع (الأعداد والبصمة) ولا يبقى منه شيء
create or replace function leaders.merge_preview(p_keep uuid, p_dup uuid) returns jsonb language plpgsql as $f$
declare res jsonb; mid uuid;
begin
  begin
    mid := leaders.merge_participants(p_keep, p_dup, 'preview', 'system', 'admin_link');
    res := jsonb_build_object('summary', leaders.merge_summary(mid), 'fingerprint', leaders.merge_fingerprint(mid));
    raise exception using errcode = 'P0001', message = 'merge_preview_rollback';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'merge_preview_rollback' then raise; end if;
  end;
  return res;
end $f$;

-- الإرجاع: سطور الدمج بعكس ترتيبها. الجلسات المبطلة تبقى مبطلة (لا تُحيا جلسة بعد الدمج). سطر لم يجد صفه (تغيّر بعد الدمج)
-- يُعد ويعود في { skipped } وفي سطر السجل، لا يُتجاوز بصمت. وصف أُضيف في الدمج ويشير إليه الآن ما ليس في سجله يمنع الإرجاع.
create or replace function leaders.unmerge_participants(p_merge uuid, p_actor_type text, p_actor text) returns jsonb language plpgsql as $f$
declare m record; r record; cols text; n int; skipped int := 0; skips jsonb := '[]'::jsonb; cur jsonb; fk record; refs int;
begin
  select * into m from leaders.participant_merges where id = p_merge for update;
  if m.id is null or m.restored_at is not null then return jsonb_build_object('skipped', 0, 'already', true); end if;
  for r in select * from leaders.participant_merge_rows where merge_id = p_merge order by id desc loop
    if r.kind = 'set' then
      continue when r.tbl = 'leaders.auth_sessions';
      execute format('update %1$s t set %2$I = (jsonb_populate_record(null::%1$s, $1)).%2$I where t.%2$I is not distinct from (jsonb_populate_record(null::%1$s, $3)).%2$I and to_jsonb(t) @> $2',
                     r.tbl, r.col) using jsonb_build_object(r.col, r.ref -> 'old'), r.ref -> 'pk', jsonb_build_object(r.col, r.ref -> 'new');
      get diagnostics n = row_count;
      if n = 0 then skipped := skipped + 1; skips := skips || jsonb_build_object('tbl', r.tbl, 'col', r.col, 'pk', r.ref -> 'pk'); end if;
    elsif r.kind = 'deleted' then
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
        from pg_attribute a where a.attrelid = r.tbl::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      execute format('insert into %1$s (%2$s) overriding system value select %2$s from jsonb_populate_record(null::%1$s, $1)', r.tbl, cols) using r.ref -> 'row';
    else
      execute format('select to_jsonb(t) from %s t where to_jsonb(t) @> $1', r.tbl) into cur using r.ref -> 'pk';
      if cur is null then
        skipped := skipped + 1; skips := skips || jsonb_build_object('tbl', r.tbl, 'col', r.col, 'pk', r.ref -> 'pk');
        continue;
      end if;
      for fk in
        select c.conrelid, a.attname fcol, ra.attname rcol from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
          join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
         where c.contype = 'f' and c.confrelid = r.tbl::regclass and cardinality(c.conkey) = 1
      loop
        execute format('select count(*) from %s t where t.%I = (jsonb_populate_record(null::%s, $1)).%I', leaders.merge_qname(fk.conrelid), fk.fcol, r.tbl, fk.rcol)
          into refs using cur;
        if refs > 0 then
          raise exception 'unmerge_blocked: % أُضيف إليه بعد الدمج % صف في %، فلا يُحذف', r.tbl, refs, leaders.merge_qname(fk.conrelid);
        end if;
      end loop;
      execute format('delete from %s t where to_jsonb(t) @> $1', r.tbl) using r.ref -> 'pk';
    end if;
  end loop;
  update leaders.participant_merges set restored_at = now() where id = p_merge;
  insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
  values (p_actor_type, p_actor, 'participant.unmerged', 'participants', m.merged_id::text, null,
          jsonb_build_object('kept_id', m.kept_id, 'merge_id', p_merge, 'skipped', skipped, 'skipped_rows', skips));
  return jsonb_build_object('skipped', skipped, 'skipped_rows', skips);
end $f$;

-- «اجعله أساسيًا»: البريد البديل يصير أساسيًا والأساسي بديلًا، في معاملة واحدة
create or replace function leaders.participant_email_make_primary(p_participant uuid, p_email text) returns void language plpgsql as $f$
declare p record; a record; e text := lower(btrim(p_email));
begin
  select * into p from leaders.participants where id = p_participant for update;
  if p.id is null then raise exception 'email_primary_missing: الحساب غير موجود'; end if;
  select * into a from leaders.participant_emails where participant_id = p_participant and lower(email) = e;
  if a.id is null then raise exception 'email_primary_not_alias: البريد ليس بديلًا لهذا الحساب'; end if;
  delete from leaders.participant_emails where id = a.id;
  update leaders.participants set email = e, email_verified_at = a.verified_at, updated_at = now() where id = p_participant;
  insert into leaders.participant_emails (participant_id, email, verified_at, source) values (p_participant, lower(p.email), p.email_verified_at, a.source);
end $f$;

-- المحو: حذف المشارك يحذف قبله حساباته المدموجة فيه (الشخص نفسه)، وصفوفه في نسخة الترحيل الاحتياطية. سجل الدمج يُمحى بمفتاحه الأجنبي
create or replace function leaders.participant_merge_erase() returns trigger language plpgsql as $f$
begin
  -- اسم جدول النسخة يُركَّب: الجدول يُحذف بعد 30 يومًا، والدالة الدائمة لا تحمل اسمه في البنية المرجعية
  if to_regclass('leaders.backup_' || '20261128_account_merge') is not null then
    execute format('delete from leaders.%I where id = $1 or merge_kept_id = $1', 'backup_' || '20261128_account_merge') using old.id;
  end if;
  delete from leaders.participants p using leaders.participant_merges m
   where m.kept_id = old.id and m.restored_at is null and p.id = m.merged_id and p.id <> old.id;
  return old;
end $f$;
create or replace trigger participants_merge_erase before delete on leaders.participants
  for each row execute function leaders.participant_merge_erase();

do $$
declare f text;
begin
  foreach f in array array['email_owner_guard()', 'merge_qname(regclass)', 'merge_pk(regclass, jsonb)', 'merge_resolve(uuid, regclass, text, tid, jsonb, jsonb, integer)',
                           'merge_note_set(uuid, regclass, text, jsonb, jsonb)', 'merge_summary(uuid)', 'merge_participants(uuid, uuid, text, text, text)',
                           'merge_preview(uuid, uuid)', 'unmerge_participants(uuid, text, text)', 'participant_email_make_primary(uuid, text)',
                           'merge_epoch(text)', 'merge_rank(text, jsonb)', 'merge_rehome(uuid, regclass, jsonb, jsonb, integer)', 'merge_fingerprint(uuid)',
                           'participant_merge_erase()'] loop
    execute format('alter function leaders.%s set search_path = leaders, public', f);
    execute format('revoke all on function leaders.%s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function leaders.%s to service_role', f);
    end if;
  end loop;
end $$;

-- ── 4) معالجة لمرة واحدة ──
-- مفتاح الهاتف: تعبير فهرس 20261128180000 نفسه (phoneKey في phone-key.js)
create or replace function pg_temp.pkey(p text) returns text language sql immutable as $f$
  select case when d ~ '^05[0-9]{8}$' then '966' || substr(d, 2) when d ~ '^5[0-9]{8}$' then '966' || d else d end
    from (select regexp_replace(regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') as d) x
$f$;

-- الأزواج: (أ) حسابات غير تجريبية قائمة بهاتف واحد (نطاق الفهرس نفسه)، الباقي الأحدث دخولًا ثم إنشاءً، (ب) ما أرشفه 20261128170000 ولم يُدمج بعد
create or replace function pg_temp.merge_pairs()
returns table (dup_id uuid, kept_id uuid) language sql stable as $f$
  with p as (
    select id, pg_temp.pkey(phone) k,
           row_number() over (partition by pg_temp.pkey(phone) order by last_login_at desc nulls last, created_at desc, id) rn
      from leaders.participants
     where not is_demo and status not in ('suspended', 'withdrawn') and length(pg_temp.pkey(phone)) >= 8),
  g as (select k from p group by k having count(*) > 1)
  select d.id, kp.id from g join p d on d.k = g.k and d.rn > 1 join p kp on kp.k = g.k and kp.rn = 1
  union
  select pa.id, kp.id
    from leaders.audit_log a
    join leaders.participants pa on pa.id::text = a.entity_id
    join leaders.participants kp on kp.id::text = a.after ->> 'kept_id'
   where a.action = 'participant.duplicate_archived' and pa.status = 'suspended' and pa.email not like 'merged-%@merged.invalid'
     and not kp.is_demo and kp.status not in ('suspended', 'withdrawn')
$f$;

-- النسخة الاحتياطية (مرة): صفوف الحسابات قبل الدمج. والصفوف المنقولة والمتعارضة في participant_merge_rows يعيدها سطر restore
create table if not exists leaders.backup_20261128_account_merge as
  select pa.*, mp.kept_id as merge_kept_id from pg_temp.merge_pairs() mp join leaders.participants pa on pa.id = mp.dup_id
  union all
  select pa.*, null from leaders.participants pa where pa.id in (select kept_id from pg_temp.merge_pairs());
alter table leaders.backup_20261128_account_merge enable row level security;
revoke all on leaders.backup_20261128_account_merge from anon, authenticated;

do $$
declare r record; mid uuid;
begin
  for r in select * from pg_temp.merge_pairs() order by kept_id, dup_id loop
    mid := leaders.merge_participants(r.kept_id, r.dup_id, 'migration:20261128190000', 'system', 'migration');
    raise notice 'account_merge: دُمج % في % (%)', r.dup_id, r.kept_id, leaders.merge_summary(mid);
  end loop;
end $$;

-- التحقق الذاتي: لا هاتف لأكثر من حساب قائم (نطاق فهرس 20261128180000)، ولا بريد في الجدولين معًا
do $$
declare n int; m int;
begin
  select count(*) into n from (
    select pg_temp.pkey(phone) k from leaders.participants
     where not is_demo and status not in ('suspended', 'withdrawn') and length(pg_temp.pkey(phone)) >= 8
     group by 1 having count(*) > 1) x;
  if n > 0 then raise exception 'account_merge: % phone number(s) still shared by more than one active account', n; end if;
  select count(*) into m from leaders.participant_emails e join leaders.participants p on lower(p.email) = lower(e.email);
  if m > 0 then raise exception 'account_merge: % email(s) both primary and alternate', m; end if;
end $$;

insert into leaders.schema_migrations (name) values ('20261128190000_leaders_account_emails_merge') on conflict do nothing;
