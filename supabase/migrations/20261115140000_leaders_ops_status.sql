-- ════════════════════════════════════════════════════════════════
-- حالة قنوات التشغيل: آخر نجاح وآخر خطأ لكل قناة (سلاك الآن)، لبطاقة «صحة البريد والتنبيه» في النظرة العامة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (_shared/slack.ts: recordSlack يكتب بلا انتظار ويتوقف عشر دقائق، وopsHealth يعرض حالة سلاك «غير مقروءة»)، فقبله تعمل البطاقة بلا آخر نشر
-- صف واحد لكل قناة (channel)، يُكتب بعد كل نشر ولا يُنتظر، والمشغّل أدناه يبقي الأحدث ويُسقط المكرر خلال دقيقة.
-- error: رمز الخطأ كما يرده سلاك (invalid_auth وchannel_not_found وnot_in_channel)، لا نص رسالة ولا رمز ولا بريد.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.ops_status (
  channel text primary key check (channel in ('slack')),
  ok_at timestamptz,
  error_at timestamptz,
  error text check (char_length(error) <= 80),
  updated_at timestamptz not null default now()
);

-- الكتابة من نسخ كثيرة بلا انتظار ولا ترتيب، فالقاعدة تحكم لا النسخة:
--   1) الأحدث يبقى: كتابة متأخرة الوصول لا تعيد ok_at ولا error_at إلى الوراء، والخطأ يبقى مع وقته.
--   2) مرة في الدقيقة لكل نتيجة: ما لا يغير الحال (نجاح بعد نجاح، أو الخطأ نفسه بعد نفسه) خلال دقيقة لا يُكتب.
--   النتيجة الأحدث تُكتب دائمًا، فنجاح نسخة بعد خطأ نسخة أخرى لا يُحجب.
create or replace function leaders.ops_status_keep_latest() returns trigger
language plpgsql set search_path = '' as $$
declare
  was_ok boolean := old.error_at is null or (old.ok_at is not null and old.ok_at >= old.error_at);
  is_ok boolean;
begin
  new.ok_at := greatest(old.ok_at, new.ok_at);
  if old.error_at is not null and (new.error_at is null or new.error_at <= old.error_at) then
    new.error_at := old.error_at;
    new.error := old.error;
  end if;
  is_ok := new.error_at is null or (new.ok_at is not null and new.ok_at >= new.error_at);
  -- يُسقط تقدم وقت النتيجة الغالبة نفسها أقل من دقيقة، والوقت الآخر والرمز على حالهما
  if is_ok = was_ok and new.error is not distinct from old.error and (
       (is_ok and new.error_at is not distinct from old.error_at and new.ok_at < old.ok_at + interval '1 minute')
    or (not is_ok and new.ok_at is not distinct from old.ok_at and new.error_at < old.error_at + interval '1 minute')) then
    return null;
  end if;
  return new;
end $$;
revoke all on function leaders.ops_status_keep_latest() from public, anon, authenticated;
drop trigger if exists ops_status_keep_latest on leaders.ops_status;
create trigger ops_status_keep_latest before update on leaders.ops_status
  for each row execute function leaders.ops_status_keep_latest();

alter table leaders.ops_status enable row level security;
revoke all on leaders.ops_status from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261115140000_leaders_ops_status') on conflict do nothing;
