-- ════════════════════════════════════════════════════════════════
-- تجميد SSPDF (D13 في سجل قرارات لجنة الخبراء): سحب صلاحيات anon وauthenticated عن مخطط sspdf
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: deferred بقرار D13، بعد جرد المخطط وتفريغه المشفر إلى أرشيف R2؛ لا تعتمد عليه الدوال
-- الترتيب بيد المالك:
--   1. الجرد قراءةً: node scripts/db/sspdf-inventory.mjs (الصفوف، والبيانات الشخصية، والصلاحيات، وآخر نشاط)
--   2. التفريغ مرة واحدة: BACKUP_SCHEMAS=sspdf BACKUP_PREFIX=archive scripts/ops/backup.sh
--   3. إخراج sspdf من المخططات المكشوفة: لوحة Supabase ← Settings ← API ← Exposed schemas (إعداد لا SQL)
--   4. هذا الترحيل بسير migrate، ثم إيقاف مشروع mi-sspdf في Cloudflare
-- يسحب الصلاحيات عن المخطط وجداوله وتسلسلاته ودواله (ومنها sspdf.bootstrap_admin الممنوحة لـ authenticated)،
-- وعن الصلاحيات الافتراضية لما يُنشأ لاحقًا. البيانات تبقى حتى تنقضي مدة الاحتفاظ المعلنة. آمن لإعادة التشغيل،
-- ولا يفعل شيئًا إن لم يوجد المخطط.

do $$
declare r text;
begin
  if to_regnamespace('sspdf') is null then
    raise notice 'sspdf: المخطط غير موجود، لا شيء يُسحب';
    return;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema sspdf from %I', r);
      execute format('revoke all on all tables in schema sspdf from %I', r);
      execute format('revoke all on all sequences in schema sspdf from %I', r);
      execute format('revoke all on all functions in schema sspdf from %I', r);
      execute format('alter default privileges in schema sspdf revoke all on tables from %I', r);
      execute format('alter default privileges in schema sspdf revoke all on sequences from %I', r);
      execute format('alter default privileges in schema sspdf revoke all on functions from %I', r);
    end if;
  end loop;
  revoke all on all functions in schema sspdf from public;
  alter default privileges in schema sspdf revoke execute on functions from public;
end $$;

insert into leaders.schema_migrations (name) values ('20261107110000_sspdf_freeze') on conflict do nothing;
