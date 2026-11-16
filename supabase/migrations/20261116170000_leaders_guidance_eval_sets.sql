-- ════════════════════════════════════════════════════════════════
-- «التوجيه والإرشاد» H2: مجموعة تقييم الدقة في القاعدة، يراجعها المالك ويعدّلها ويعتمدها من اللوحة (قرار المالك v8)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant بلا الجدول تعمل المجموعة من الملف (guide-eval/cases.json) مسودة كما كانت، والاعتماد يرد not_migrated
-- - كل نسخة صف: حالاتها (jsonb) ورقمها وحالتها. المعتمدة لا تتغير حالاتها أبدًا (حارس في القاعدة): تعديلها يبدأ نسخة
--   مسودة جديدة منسوخة منها، فتبقى المعتمدة سجلًا لما اعتُمد ومتى ومن اعتمده.
-- - النسخة الحالية أحدثها إنشاءً. والبصمة (guide-eval.js) من حالاتها ورقمها، فأي تعديل يُسقط نجاح التقييم السابق.
-- لا يقرؤها إلا دور الخدمة. آمن لإعادة التشغيل.

create table if not exists leaders.guidance_eval_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (char_length(version) between 1 and 80),
  cases jsonb not null check (jsonb_typeof(cases) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by text check (char_length(approved_by) <= 200),
  approved_at timestamptz,
  updated_by text check (char_length(updated_by) <= 200),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((status = 'approved') = (approved_by is not null and approved_at is not null))
);
create index if not exists guidance_eval_sets_created_idx on leaders.guidance_eval_sets (created_at desc);

-- المعتمدة لا تُعدَّل حالاتها ولا رقمها ولا تعود مسودة
create or replace function leaders.guidance_eval_sets_guard()
returns trigger language plpgsql as $$
begin
  if old.status = 'approved' and (new.cases is distinct from old.cases or new.version is distinct from old.version or new.status <> 'approved') then
    raise exception 'نسخة معتمدة من مجموعة التقييم لا تُعدَّل: عدّل نسخة مسودة جديدة' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists guidance_eval_sets_guard on leaders.guidance_eval_sets;
create trigger guidance_eval_sets_guard before update on leaders.guidance_eval_sets for each row execute function leaders.guidance_eval_sets_guard();

alter table leaders.guidance_eval_sets enable row level security;
revoke all on leaders.guidance_eval_sets from anon, authenticated;
revoke all on function leaders.guidance_eval_sets_guard() from public, anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261116170000_leaders_guidance_eval_sets') on conflict do nothing;
