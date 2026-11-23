-- ════════════════════════════════════════════════════════════════
-- رموز الرعاية: رموز تولّدها الإدارة لكل جهة، بعدد مستخدمين وتاريخ انتهاء اختياريين
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يرد نموذج «رشّحتك جهة؟» كل رمز ردَّ الرمز غير المعروف (sponsor-codes.ts: غياب الجدول أو الدالة
-- يُعامل كرمز غير معروف)، وروابط الجهات /j/ تعمل كما كانت، وتقول لوحة الجهة «غير مفعّل بعد» وتُرفض كتابة الرموز بـnot_migrated
-- رمز رابط الجهة (organizations.invite_code) يبقى للرابط /j/ وحده ولا يُقبل مكتوبًا (قرار المالك). الرمز هنا يربط المشارك بجهته فقط، والمقاعد
-- يحكمها التثبيت القائم (pin_sponsor_seat) لا هذا الجدول. الرمز محفوظ بأحرف صغيرة، ولا يطابق رمز رابط جهة (يفرضه الخادم).
-- الرمز صالح ما دامت جهته غير موقوفة (status <> 'inactive')، ويُفحص ذلك والانتهاء لحظة الاستهلاك.
-- redeem_sponsor_code: استهلاك ذري في معاملة الدالة: صف الاستخدام أولًا (فريد للمشارك في الرمز، فلا يُعدّ مرتين)، ثم
-- زيادة العدّاد بشرط الحالة والانتهاء والحد، وإن لم يُزد حُذف صف الاستخدام وأُعيد السبب. لا يستدعيها إلا دور الخدمة.
-- جدولان جديدان ودالة: لا صف قائم يتغير. آمن لإعادة التشغيل.

create table if not exists leaders.sponsor_codes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references leaders.organizations (id) on delete cascade,
  code            text not null check (code ~ '^[a-z0-9-]{4,40}$'),
  max_uses        integer check (max_uses is null or max_uses > 0),
  used            integer not null default 0 check (used >= 0),
  expires_at      timestamptz,
  active          boolean not null default true,
  note            text check (char_length(note) <= 300),
  created_by      text,
  created_at      timestamptz not null default now()
);
create unique index if not exists sponsor_codes_code_uidx on leaders.sponsor_codes (code);
create index if not exists sponsor_codes_org_idx on leaders.sponsor_codes (organization_id, created_at);

create table if not exists leaders.sponsor_code_uses (
  code_id        uuid not null references leaders.sponsor_codes (id) on delete cascade,
  participant_id uuid not null references leaders.participants (id) on delete cascade,
  used_at        timestamptz not null default now(),
  primary key (code_id, participant_id)
);
create index if not exists sponsor_code_uses_participant_idx on leaders.sponsor_code_uses (participant_id);

-- يعيد صفًا واحدًا: org_id (الجهة عند النجاح) وreason: ok، أو unknown (لا رمز، أو جهته موقوفة)، أو stopped، أو expired، أو exhausted
create or replace function leaders.redeem_sponsor_code(p_code text, p_participant uuid, p_now timestamptz default now())
returns table (org_id uuid, reason text) language plpgsql as $$
declare
  c leaders.sponsor_codes%rowtype;
  took boolean;
  bumped uuid;
begin
  select * into c from leaders.sponsor_codes s where s.code = lower(btrim(coalesce(p_code, '')));
  if not found then
    return query select null::uuid, 'unknown'::text;
    return;
  end if;
  -- رموز الجهة الموقوفة تتوقف معها فورًا، كرمز غير معروف (كرمز رابطها في الخادم)
  if not exists (select 1 from leaders.organizations o where o.id = c.organization_id and o.status is distinct from 'inactive') then
    return query select null::uuid, 'unknown'::text;
    return;
  end if;
  insert into leaders.sponsor_code_uses (code_id, participant_id, used_at) values (c.id, p_participant, p_now)
  on conflict do nothing;
  get diagnostics took = row_count;
  -- استعمله المشارك نفسه من قبل: لا عدّ ثانٍ
  if not took then
    return query select c.organization_id, 'ok'::text;
    return;
  end if;
  update leaders.sponsor_codes s set used = s.used + 1
   where s.id = c.id and s.active and (s.expires_at is null or s.expires_at > p_now) and (s.max_uses is null or s.used < s.max_uses)
  returning s.id into bumped;
  if bumped is null then
    delete from leaders.sponsor_code_uses u where u.code_id = c.id and u.participant_id = p_participant;
    select * into c from leaders.sponsor_codes s where s.id = c.id;
    return query select null::uuid, (case when not c.active then 'stopped'
      when c.expires_at is not null and c.expires_at <= p_now then 'expired' else 'exhausted' end)::text;
    return;
  end if;
  return query select c.organization_id, 'ok'::text;
end;
$$;

alter table leaders.sponsor_codes enable row level security;
alter table leaders.sponsor_code_uses enable row level security;
revoke all on leaders.sponsor_codes from public, anon, authenticated;
revoke all on leaders.sponsor_code_uses from public, anon, authenticated;
revoke all on function leaders.redeem_sponsor_code(text, uuid, timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on leaders.sponsor_codes to service_role;
    grant all on leaders.sponsor_code_uses to service_role;
    grant execute on function leaders.redeem_sponsor_code(text, uuid, timestamptz) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261126100000_leaders_sponsor_codes') on conflict do nothing;
