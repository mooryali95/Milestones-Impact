-- ════════════════════════════════════════════════════════════════
-- تجميد المحتوى لكل دفعة (D02 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تكتب أعمدة الإصدار إن وُجدت وتتجاوزها قبله، والأقفال تبدأ بتطبيقه
-- content_releases: بيان كل إصدار محتوى ببصماته (sha256 لكل باب وسؤال وأداة ونموذج وإعداد)، يُكتب بترحيل يولّده
--   scripts/content/release.mjs ولا يُعدَّل ولا يُحذف. content_patches: سجل التصويب الحرج بتوقيعين وسببه.
-- cohorts.content_release: إصدار الدفعة يُثبَّت عند بدئها، ولا يتغير بعد تثبيته إلا بمسار الترقيع.
-- أعمدة الإصدار مع كل نتيجة باب ومحاولة مختبر، وفي نتيجة الباب بصمة اختباره وإجاباته نصًا (لإعادة التصحيح العادل).
-- القفل: اختبار الباب لا يتغير بعد أول نتيجة، ومواصفة الأداة بعد أول محاولة منتهية، لأي كاتب (اللوحة أو ترحيل)،
--   إلا بترحيل ترقيع يضبط leaders.content_patch = on. آمن لإعادة التشغيل.

create table if not exists leaders.content_releases (
  id text primary key check (id ~ '^\d{4}\.\d{2}-[a-z0-9]+(\.\d+)?$'),
  created_at timestamptz not null default now(),
  base_id text references leaders.content_releases (id),
  git_ref text check (git_ref is null or git_ref ~ '^[0-9a-f]{7,40}$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null,
  signed_by text[] not null default '{}',
  note text check (note is null or char_length(note) <= 2000)
);

create table if not exists leaders.content_patches (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  release_id text not null references leaders.content_releases (id),
  base_release_id text not null references leaders.content_releases (id),
  entity text not null check (entity in ('handbook_modules', 'lab_items', 'questions', 'learning_models')),
  entity_key text not null check (char_length(entity_key) <= 200),
  reason text not null check (char_length(reason) between 10 and 2000),
  signed_by text[] not null check (cardinality(signed_by) >= 2),
  regrade text not null check (regrade in ('rekey', 'drop', 'none'))
);

create or replace function leaders.content_ledger_frozen() returns trigger language plpgsql as $$
begin
  raise exception 'سجل إصدارات المحتوى وتصويباته لا يُعدَّل ولا يُحذف' using errcode = '42501';
end $$;
drop trigger if exists content_releases_frozen on leaders.content_releases;
create trigger content_releases_frozen before update or delete on leaders.content_releases for each row execute function leaders.content_ledger_frozen();
drop trigger if exists content_patches_frozen on leaders.content_patches;
create trigger content_patches_frozen before update or delete on leaders.content_patches for each row execute function leaders.content_ledger_frozen();

alter table leaders.cohorts add column if not exists content_release text references leaders.content_releases (id);
alter table leaders.handbook_progress add column if not exists content_release text;
alter table leaders.handbook_progress add column if not exists quiz_fingerprint text;
alter table leaders.handbook_progress add column if not exists quiz_answers jsonb;
alter table leaders.lab_attempts add column if not exists content_release text;

-- إصدار الدفعة لا يتغير بعد تثبيته إلا بمسار الترقيع
create or replace function leaders.cohort_release_pinned() returns trigger language plpgsql as $$
begin
  if old.content_release is not null and new.content_release is distinct from old.content_release
     and coalesce(current_setting('leaders.content_patch', true), '') <> 'on' then
    raise exception 'إصدار محتوى الدفعة «%» مثبت (D02)، ولا يتغير إلا بمسار الترقيع', old.name using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists cohort_release_pinned on leaders.cohorts;
create trigger cohort_release_pinned before update of content_release on leaders.cohorts for each row execute function leaders.cohort_release_pinned();

-- اختبار الباب مقفل بعد أول نتيجة
create or replace function leaders.handbook_quiz_locked() returns trigger language plpgsql as $$
begin
  if new.quiz_md is distinct from old.quiz_md
     and coalesce(current_setting('leaders.content_patch', true), '') <> 'on'
     and exists (select 1 from leaders.handbook_progress hp where hp.module_id = old.id and hp.quiz_total > 0) then
    raise exception 'اختبار الباب «%» مقفل بعد أول نتيجة (D02)، والتصويب بمسار الترقيع بتوقيعين', old.title_ar using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists handbook_quiz_locked on leaders.handbook_modules;
create trigger handbook_quiz_locked before update of quiz_md on leaders.handbook_modules for each row execute function leaders.handbook_quiz_locked();

-- مواصفة الأداة مقفلة بعد أول محاولة منتهية
create or replace function leaders.lab_spec_locked() returns trigger language plpgsql as $$
begin
  if new.spec is distinct from old.spec
     and coalesce(current_setting('leaders.content_patch', true), '') <> 'on'
     and exists (select 1 from leaders.lab_attempts la where la.item_id = old.id and la.finished_at is not null) then
    raise exception 'مواصفة الأداة «%» مقفلة بعد أول محاولة منتهية (D02)، والتصويب بمسار الترقيع بتوقيعين', old.title_ar using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists lab_spec_locked on leaders.lab_items;
create trigger lab_spec_locked before update of spec on leaders.lab_items for each row execute function leaders.lab_spec_locked();

alter table leaders.content_releases enable row level security;
alter table leaders.content_patches enable row level security;
revoke all on leaders.content_releases, leaders.content_patches from anon, authenticated;
revoke all on sequence leaders.content_patches_id_seq from anon, authenticated;
revoke all on function leaders.content_ledger_frozen(), leaders.cohort_release_pinned(), leaders.handbook_quiz_locked(), leaders.lab_spec_locked() from public;

insert into leaders.schema_migrations (name) values ('20261107180000_leaders_content_releases') on conflict do nothing;
