-- deploy-gate: tolerant عمود جديد بقيمة افتراضية false: الدوال الأقدم تقرأ registrations بـ select * فيصلها حقل زائد لا تقرؤه،
-- وتكتب أعمدة مسماة فلا تمسه. لا يتغير به مطلوب ولا جاهزية، ولا يُحذف أي صف.
-- ════════════════════════════════════════════════════════════════
-- وسم حسابات الاختبار في مصفوفة التأثير (registrations.is_test)
-- ════════════════════════════════════════════════════════════════
-- التصور: صفحة مصفوفة التأثير البند 13، المرحلة 5 (اعتمده المالك).
-- يكتبه الخادم وحده: admin-api (update-reg) بصلاحية الكتابة للمدير، ويُدقَّق في admin_audit_log بالفاعل والوقت.
-- الجدول مقفل عن anon وauthenticated منذ 20261114120000_public_lockdown، وuser-api لا يقبله في SAVE_FIELDS.
-- يُستبعد الموسوم من الإحصاءات و«متوقفون وطلبات إعادة فتح» وحدها (قاعدة counted)، ويبقى في القوائم بشارة «اختبار».
-- آمن لإعادة التشغيل.

alter table public.registrations add column if not exists is_test boolean not null default false;

insert into leaders.schema_migrations (name) values ('20261129160000_registrations_is_test') on conflict do nothing;
