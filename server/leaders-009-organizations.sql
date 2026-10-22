-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة · الترحيل التاسع: الجهات الشريكة
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد 001 إلى 008. آمن لإعادة التشغيل.
--
-- لكل جهة (سفراء، منظومة…) عدد مقاعد متعاقد عليه، ولون، ورمز دعوة.
-- رابط التسجيل الخاص بها: https://leaders.sunkvalue.com/?org=<invite_code>
-- كل من يسجّل منه يُنسب للجهة تلقائيًا (source = 'invite').
-- ويُنقل أي مشارك إلى جهة أو منها من لوحة الإدارة.

alter table leaders.organizations add column if not exists seats       int check (seats is null or seats between 0 and 100000);
alter table leaders.organizations add column if not exists invite_code text;
alter table leaders.organizations add column if not exists color       text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
alter table leaders.organizations add column if not exists short_name  text check (short_name is null or char_length(short_name) <= 40);

create unique index if not exists organizations_invite_uniq on leaders.organizations (lower(invite_code)) where invite_code is not null;
create unique index if not exists organizations_name_uniq   on leaders.organizations (lower(name));

-- مصدر التسجيل: يضاف "دعوة جهة"
alter table leaders.participants drop constraint if exists participants_source_check;
alter table leaders.participants add constraint participants_source_check
  check (source in ('self', 'admin', 'import', 'contact', 'invite'));

-- رموز دعوة للجهات القائمة التي لا رمز لها
update leaders.organizations
   set invite_code = lower(substr(md5(id::text || clock_timestamp()::text), 1, 8))
 where invite_code is null;

notify pgrst, 'reload schema';
