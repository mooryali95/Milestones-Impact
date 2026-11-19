-- ════════════════════════════════════════════════════════════════
-- سبب التسجيل اليدوي للحضور: عمود note في workshop_attendance (تصور تشغيل الدفعة 2026-11-19، المرحلة 2)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يُكتب الحضور اليدوي بلا العمود ويبقى سببه في سجل التدقيق وحده، وورقة الحضور تُقرأ بلا السبب (activities.ts: markBatch وattendanceRows)
-- السبب الذي يكتبه المدير أو المدرب مرة واحدة لورقة الحضور (تعطل الرمز، بلا هاتف، سُجل لاحقًا، أو نص قصير) يُحفظ مع صف
-- الحضور اليدوي نفسه، فيظهر في ورقة الحضور بجانب من سجّله. سجل التدقيق يبقى يُكتب كما كان.
-- اختياري: فارغ لكل حضور سجّله المشارك بنفسه ولكل صف قائم. بحد 300 حرف كحد الخادم (MARK_REASON_MAX).
-- عمود فارغ بلا قيمة افتراضية على جدول قائم: لا إعادة كتابة للجدول، والدوال قبله لا تقرؤه. آمن لإعادة التشغيل.

alter table leaders.workshop_attendance add column if not exists note text;
alter table leaders.workshop_attendance drop constraint if exists workshop_attendance_note_check;
alter table leaders.workshop_attendance add constraint workshop_attendance_note_check check (note is null or char_length(note) <= 300) not valid;
alter table leaders.workshop_attendance validate constraint workshop_attendance_note_check;

insert into leaders.schema_migrations (name) values ('20261119110000_leaders_workshop_attendance_note') on conflict do nothing;
