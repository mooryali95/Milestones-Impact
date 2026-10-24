-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: طريقة التنفيذ وطريقة التوثيق يختارهما المشرف لكل نشاط
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. يُشغَّل بعد 20261024150000_leaders_verified_activities.
--
-- الجلسات الجماعية (workshop) لم تعد حضورية فقط: لكل جلسة طريقتها،
-- حضوري بمكان، أو عن بعد برابط اجتماع. وطريقة توثيق الحضور تُختار في
-- إعداد المتطلب (config.verify): رمز QR يعرضه المدرب في القاعة أو على
-- الشاشة المشتركة، أو الانضمام من التطبيق، أو تسجيل يدوي من المدرب.
-- الجلسات الفردية (coaching) تُضبط طريقتها في config.mode: عن بعد أو حضوري أو كلاهما.

alter table leaders.workshop_sessions add column if not exists mode text not null default 'in_person';
alter table leaders.workshop_sessions drop constraint if exists workshop_sessions_mode_check;
alter table leaders.workshop_sessions add constraint workshop_sessions_mode_check check (mode in ('in_person', 'online'));
alter table leaders.workshop_sessions add column if not exists join_url text check (char_length(join_url) <= 500);

alter table leaders.workshop_attendance drop constraint if exists workshop_attendance_method_check;
alter table leaders.workshop_attendance add constraint workshop_attendance_method_check check (method in ('qr', 'manual', 'join'));
