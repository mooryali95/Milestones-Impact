-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة — الترحيل الرابع: مخزن الملفات الخاص وفهارس الأداء
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد الترحيلات الثلاثة السابقة. آمن لإعادة التشغيل.
--
-- مخزن leaders-private خاص تمامًا: لا سياسات على storage.objects له،
-- فلا يصل إليه المتصفح إلا برابط موقّع قصير العمر تصدره دالة leaders-api
-- (رفع السيرة الذاتية وأدلة المتطلبات، وعرضها للمستشار في لوحة الإدارة).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leaders-private', 'leaders-private', false, 10485760,   -- 10MB لكل ملف
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── فهارس للاستعلامات المتكررة في الدالة ──
create index if not exists email_challenges_email_created_idx on leaders.email_challenges (email, created_at desc);
create index if not exists email_challenges_ip_created_idx    on leaders.email_challenges (ip, created_at desc);
create index if not exists auth_sessions_participant_idx      on leaders.auth_sessions (participant_id);
create index if not exists passkeys_participant_idx           on leaders.passkeys (participant_id);
create index if not exists assessments_participant_idx        on leaders.assessments (participant_id, started_at desc);
create index if not exists participant_requirements_status_idx on leaders.participant_requirements (status);
create index if not exists participants_status_idx            on leaders.participants (status);
