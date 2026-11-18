-- ════════════════════════════════════════════════════════════════
-- مفتاح منع التكرار للكتابة (ش9): نتيجة أول تنفيذ بالمفتاح والفاعل مدة 24 ساعة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يتجاهل الخادم المفتاح ولا يعلن x-idem، فلا يعيد العميل الكتابة تلقائيًا بعد خطأ شبكة ويعرض «تعذّر التأكد، تحقّق قبل الإعادة» (idempotency.ts)
-- تصور «تحديث المنصة بلا أثر على المستخدمين» (2026-11-18)، المرحلة 3 البند 6: العميل يرسل مع كل كتابة مفتاحًا ثابتًا عبر
-- إعاداتها، والخادم يعيد النتيجة الأولى بدل التنفيذ ثانية، فلا يتكرر حفظ ولا تسليم ولا رسالة بعد خطأ شبكة أو 504.
-- لا بيانات شخصية ولا أسرار: الفاعل بصمة sha256 للدور ومعرّفه، والطلب بصمته وحدها، والرد بلا رمز ولا سر ولا يتجاوز
-- 32 ألف حرف (وإلا حُفظ مختصره). status فارغ = التنفيذ جارٍ. يُحذف الصف بعد 24 ساعة: pg_cron كل ساعة أدناه، وpurge
-- الأسبوعي في system.ts احتياطًا، والخادم يعامل الأقدم غائبًا فلا يعيد رده.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.

create table if not exists leaders.idempotency_keys (
  actor text not null check (char_length(actor) = 64),
  key text not null check (key ~ '^[A-Za-z0-9_-]{16,64}$'),
  action text not null check (char_length(action) <= 80),
  req_hash text not null check (char_length(req_hash) = 64),
  status smallint check (status is null or (status >= 200 and status < 600)),
  response jsonb check (response is null or pg_column_size(response) <= 65536),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (actor, key)
);
create index if not exists idempotency_keys_created_idx on leaders.idempotency_keys (created_at);

alter table leaders.idempotency_keys enable row level security;
revoke all on leaders.idempotency_keys from anon, authenticated;

-- كل ساعة عند الدقيقة 17: حذف ما مضى عليه 24 ساعة، فلا تبقى الصفوف إلى التنظيف الأسبوعي. cron.schedule بالاسم نفسه يحدّث
-- المهمة، فإعادة التشغيل آمنة. وبلا pg_cron يبقى purge الأسبوعي والخادم لا يعيد رد صف أقدم من 24 ساعة.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('leaders-idempotency-purge', '17 * * * *', $q$delete from leaders.idempotency_keys where created_at < now() - interval '24 hours'$q$);
  else
    raise notice 'pg_cron غير مفعل: leaders-idempotency-purge لم تُجدول';
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261118140000_leaders_idempotency_keys') on conflict do nothing;
