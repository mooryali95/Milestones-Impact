-- التبديل بين الحسابات (مشارك ↔ خبير ↔ منسق جهة) لصاحب البريد نفسه: جلسة الوجهة تُصدر من جلسة نافذة
-- في بوابة أخرى، فتُسجَّل بطريقة «switch».
alter table leaders.auth_sessions drop constraint if exists auth_sessions_method_check;
alter table leaders.auth_sessions add constraint auth_sessions_method_check
  check (method in ('email_link', 'email_code', 'passkey', 'google', 'demo', 'switch'));
