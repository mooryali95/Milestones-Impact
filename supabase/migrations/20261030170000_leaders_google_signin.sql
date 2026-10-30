-- الدخول بحساب Google: طريقة جلسة رابعة بجانب رابط البريد ورمزه ومفتاح المرور
alter table leaders.auth_sessions drop constraint if exists auth_sessions_method_check;
alter table leaders.auth_sessions add constraint auth_sessions_method_check
  check (method = any (array['email_link', 'email_code', 'passkey', 'google']));
