-- deploy-gate: tolerant الدوال تتسامح مع غيابه: تعذّر قراءة expert_id أو coordinator_id في participant_mail_prefs يُرسل بريد الخبير والمنسق كما كان
-- بلا ترويسة ولا تسجيل، وصندوق الخبير وتفضيلاته يردان 503 برسالة، والإغلاق التلقائي (resolved_at) يُتجاهل خطؤه، وبريد المشارك لا يتغير
-- ════════════════════════════════════════════════════════════════
-- بريد الخبراء والمنسقين وصندوق الخبير (اعتمده المالك 2026-11-25، القرارات 1-5)
-- ════════════════════════════════════════════════════════════════
-- توسيع جدولي مركز الرسائل القائمين (20261128200000) لا جداول موازية: الصف لمشارك أو خبير أو منسق، واحد منها لا غير.
-- 1) participant_mail_prefs: مفتاح أساسي جديد id، وparticipant_id يصبح قابلًا للفراغ بفهرس فريد يحفظ upsert القائم
--    (on conflict participant_id)، وexpert_id وcoordinator_id بفهرسين فريدين، كلها بحذف متسلسل مع صاحبها.
-- 2) participant_notifications: expert_id وcoordinator_id، وabout_participant_id (المشارك الذي يذكره إشعار الخبير بالاسم):
--    حذف حساب المشارك يمحو ما كُتب عنه في صناديق الخبراء (on delete cascade، قرار المالك 3). وaction_until وresolved_at
--    لعناصر «ينتظرك»: تُغلق حين يُنجز العمل في موضعه بـref نفسه.
-- قيد واحد لكل جدول: num_nonnulls(participant_id, expert_id, coordinator_id) = 1، يُضاف not valid ثم يُتحقق منه.
-- الدوال وحدها تقرأ وتكتب (service_role)، فلا صلاحية لـanon ولا authenticated، كبقية جداول leaders.
-- لا بيانات تتغير: الأعمدة الجديدة فارغة، والمفتاح الجديد يملأ نفسه بقيمته الافتراضية. آمن لإعادة التشغيل.

-- ── 1) participant_mail_prefs ──
alter table leaders.participant_mail_prefs add column if not exists id uuid not null default gen_random_uuid();
alter table leaders.participant_mail_prefs add column if not exists expert_id uuid references leaders.experts(id) on delete cascade;
alter table leaders.participant_mail_prefs add column if not exists coordinator_id uuid references leaders.org_coordinators(id) on delete cascade;
create unique index if not exists participant_mail_prefs_participant_key on leaders.participant_mail_prefs (participant_id);
create unique index if not exists participant_mail_prefs_expert_key on leaders.participant_mail_prefs (expert_id);
create unique index if not exists participant_mail_prefs_coordinator_key on leaders.participant_mail_prefs (coordinator_id);
do $$
declare
  old_pk text;
begin
  -- المفتاح الأساسي القديم على participant_id يُستبدل بـid (الفهرس الفريد أعلاه يحفظ on conflict participant_id).
  -- يُسقط باسمه الفعلي من pg_constraint، فلا يفشل إن خالف الاسم الافتراضي
  select conname into old_pk from pg_constraint where conrelid = 'leaders.participant_mail_prefs'::regclass and contype = 'p'
    and pg_get_constraintdef(oid) ilike '%(participant_id)%';
  if old_pk is not null then
    execute format('alter table leaders.participant_mail_prefs drop constraint %I', old_pk);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'leaders.participant_mail_prefs'::regclass and contype = 'p') then
    alter table leaders.participant_mail_prefs add constraint participant_mail_prefs_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'leaders.participant_mail_prefs'::regclass and conname = 'participant_mail_prefs_one_owner') then
    alter table leaders.participant_mail_prefs add constraint participant_mail_prefs_one_owner check (num_nonnulls(participant_id, expert_id, coordinator_id) = 1) not valid;
  end if;
end $$;
alter table leaders.participant_mail_prefs alter column participant_id drop not null;
alter table leaders.participant_mail_prefs validate constraint participant_mail_prefs_one_owner;

-- ── 2) participant_notifications ──
alter table leaders.participant_notifications add column if not exists expert_id uuid references leaders.experts(id) on delete cascade;
alter table leaders.participant_notifications add column if not exists coordinator_id uuid references leaders.org_coordinators(id) on delete cascade;
alter table leaders.participant_notifications add column if not exists about_participant_id uuid references leaders.participants(id) on delete cascade;
alter table leaders.participant_notifications add column if not exists action_until timestamptz;
alter table leaders.participant_notifications add column if not exists resolved_at timestamptz;
alter table leaders.participant_notifications alter column participant_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'leaders.participant_notifications'::regclass and conname = 'participant_notifications_one_owner') then
    alter table leaders.participant_notifications add constraint participant_notifications_one_owner check (num_nonnulls(participant_id, expert_id, coordinator_id) = 1) not valid;
  end if;
end $$;
alter table leaders.participant_notifications validate constraint participant_notifications_one_owner;
create index if not exists participant_notifications_by_expert on leaders.participant_notifications (expert_id, created_at desc) where expert_id is not null;
create index if not exists participant_notifications_by_coordinator on leaders.participant_notifications (coordinator_id, created_at desc) where coordinator_id is not null;
create index if not exists participant_notifications_by_about on leaders.participant_notifications (about_participant_id) where about_participant_id is not null;
create index if not exists participant_notifications_by_ref on leaders.participant_notifications (ref) where ref is not null and resolved_at is null;

insert into leaders.schema_migrations (name) values ('20261129130000_leaders_staff_messages') on conflict do nothing;
