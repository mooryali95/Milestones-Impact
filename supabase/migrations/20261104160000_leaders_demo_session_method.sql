-- جلسة حساب العرض تُفتح من لوحة الإدارة بطريقة «demo»، ولم تكن ضمن الطرق المسموحة،
-- فكان «افتح حساب العرض» يفشل بـ«تعذّر تنفيذ العملية».
alter table leaders.auth_sessions drop constraint if exists auth_sessions_method_check;
alter table leaders.auth_sessions add constraint auth_sessions_method_check
  check (method in ('email_link', 'email_code', 'passkey', 'google', 'demo'));
