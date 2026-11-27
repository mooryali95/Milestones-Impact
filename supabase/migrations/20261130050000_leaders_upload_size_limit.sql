-- deploy-gate: tolerant إعداد مخزن فقط لا تقرؤه الدوال: سقف حجم الملف وأنواعه في leaders-private، والدوال الأقدم تصدر روابطها كما كانت.
-- ════════════════════════════════════════════════════════════════
-- سقف حجم كل ملف وأنواعه في المخزن الخاص (تقرير الأمن الثالث): رابط الرفع الموقّع لا يحمل سقفًا، فالمخزن يفرضه.
-- محروس بوجود المخطط: القاعدة المحلية للقطة البنية بلا storage. آمن لإعادة التشغيل.
-- ════════════════════════════════════════════════════════════════
-- restore: update storage.buckets s set file_size_limit = b.file_size_limit, allowed_mime_types = b.allowed_mime_types from leaders.backup_20261130_upload_bucket b where s.id = b.id
do $$
begin
  if to_regclass('storage.buckets') is not null then
    create table if not exists leaders.backup_20261130_upload_bucket as
      select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'leaders-private';
    alter table leaders.backup_20261130_upload_bucket enable row level security;
    revoke all on leaders.backup_20261130_upload_bucket from anon, authenticated;
    update storage.buckets
       set file_size_limit = 10485760,
           allowed_mime_types = array[
             'application/pdf',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/vnd.openxmlformats-officedocument.presentationml.presentation',
             'image/png', 'image/jpeg'
           ]
     where id = 'leaders-private';
  end if;
end $$;

insert into leaders.schema_migrations (name) values ('20261130050000_leaders_upload_size_limit') on conflict do nothing;
