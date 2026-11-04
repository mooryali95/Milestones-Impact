-- ════════════════════════════════════════════════════════════════
-- شهادة الجهة: إعداد موحّد لكل جهة فوق الإعداد العام (23 أكتوبر 2026)
-- ════════════════════════════════════════════════════════════════
-- مصدر واحد للحقيقة: الإعداد العام في certificate_settings، وما تخصّصه
-- الجهة في organizations.cert فقط. ما لا تذكره الجهة يُورث من العام.
-- الحل في دالة واحدة على الخادم (certificates.ts › profileFor).
--
-- organizations.cert:
--   { program_ar?, program_en?, hours?, signatory? }
--   signatory غائب = يُورث · null = بلا موقّع (ختم Milestone وحده) · كائن = موقّع الجهة

-- 1) الموقّع الواحد في الإعداد العام: عمود واحد بدل مصفوفة
alter table leaders.certificate_settings
  add column if not exists signatory jsonb check (signatory is null or jsonb_typeof(signatory) = 'object');
-- التحويل من المصفوفة يُنفَّذ فقط إن كان العمود القديم ما زال موجودًا (إعادة التطبيق فوق لقطة حديثة لا تجده)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'leaders' and table_name = 'certificate_settings' and column_name = 'signatories') then
    execute $q$update leaders.certificate_settings set signatory = signatories -> 0 where signatory is null and jsonb_array_length(signatories) > 0$q$;
  end if;
end $$;
alter table leaders.certificate_settings drop column if exists signatories;

-- 2) تخصيص الجهة
alter table leaders.organizations
  add column if not exists cert jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cert) = 'object' and pg_column_size(cert) <= 320000);
