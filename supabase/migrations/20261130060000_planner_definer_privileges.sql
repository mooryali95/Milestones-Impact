-- ════════════════════════════════════════════════════════════════
-- دوال SECURITY DEFINER في تطبيق المخطِّط: سحب EXECUTE ممن لا يحتاجه (تحصين الأمان، قرار المالك 2026-11-28)
-- ════════════════════════════════════════════════════════════════
-- منحها PUBLIC الافتراضي (ومنح Supabase الافتراضي لـ anon وauthenticated) فصار كل منها نداء /rest/v1/rpc بمفتاح anon.
-- لا يستدعي أيًّا منها كود في supabase/functions؛ المستدعون: زنادات القاعدة، وسياسات RLS على جداول planner_*،
-- وخادم المخطِّط بمفتاح الخدمة.
--
-- أ) للخادم وحده (service_role)، تُسحب من public وanon وauthenticated:
--    - planner_hook_secret: تعيد سر الخطاف من Vault نصًا صريحًا. بمنحها لـ anon يُقرأ السر من المتصفح.
--    - planner_log_otp_attempt: تُدرج محاولة رمز لأي بريد؛ بمفتاح anon يُدرج المهاجم خمسًا فيُقفل دخول صاحب البريد
--      ساعة ويكرر بلا حد ويضخم الجدول. بعد السحب لا يسجل المحاولة إلا الخادم.
--    - planner_check_otp_rate: قرينتها (قراءة عدد المحاولات لبريد)، تتبعها.
--    - الزنادات الثلاثة (handle_new_user، notify_workbench، touch_updated_at): الزناد لا يحتاج EXECUTE للمستدعي،
--      فالسحب تنظيف بلا أثر وظيفي.
-- ب) لمستخدم مسجَّل لا للزائر، تُسحب من public وanon وتبقى لـ authenticated وservice_role: مساعدات سياسات RLS السبعة
--    (تستدعيها السياسات بصلاحية المستدعي المسجَّل) وplanner_transfer_ownership (تتحقق داخليًا من المالك عبر auth.uid()).
-- لا يُمس: planner_keepalive_ping (مستدعيها نبضة خارجية قد تكون بمفتاح anon، وأثرها صف واحد)، وplanner_lookup_user_by_email
-- (منح authenticated مقصود في 20261021130000). كل سطر في كتلة تتجاهل undefined_function وحده، لأن الدوال لتطبيق مشارك قد يغيرها.
-- إعادة التشغيل آمنة، ولا بيانات تتغير. الإرجاع: grant execute on function <التوقيع> to anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['planner_hook_secret()', 'planner_log_otp_attempt(text, boolean)', 'planner_check_otp_rate(text)',
                           'planner_handle_new_user()', 'planner_notify_workbench()', 'planner_touch_updated_at()'] loop
    begin
      execute format('revoke all on function public.%s from public, anon, authenticated', f);
      execute format('grant execute on function public.%s to service_role', f);
    exception when undefined_function then raise notice 'skipped (missing): public.%', f;
    end;
  end loop;
  foreach f in array array['planner_is_approved(uuid)', 'planner_is_manzuma(uuid)', 'planner_is_owner(uuid)',
                           'planner_can_read_project(text, uuid)', 'planner_owns_project(text, uuid)', 'planner_shared_with_me(text, uuid)',
                           'planner_shared_with_me_edit(text, uuid)', 'planner_transfer_ownership(text, uuid)'] loop
    begin
      execute format('revoke all on function public.%s from public, anon', f);
      execute format('grant execute on function public.%s to authenticated, service_role', f);
    exception when undefined_function then raise notice 'skipped (missing): public.%', f;
    end;
  end loop;
end $$;

insert into leaders.schema_migrations (name) values ('20261130060000_planner_definer_privileges') on conflict do nothing;
