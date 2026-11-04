-- ════════════════════════════════════════════════════════════════
-- حذف جداول النسخ الاحتياطية التي أنشأتها ترحيلات المحتوى (المرحلة هـ، 2026-11-05)
-- ════════════════════════════════════════════════════════════════
-- أحد عشر جدولًا أُنشئت للتراجع عن ترحيلات أكتوبر ونوفمبر، مستثناة من لقطة البنية،
-- ولم تُحذف بعد اعتماد ما بعدها. النسخة الليلية (backup.yml) هي المرجع الآن.
-- يُطبَّق بعد اعتماد المالك أن المحتوى الحي صحيح، فلا رجعة بعده إلا من النسخة الليلية.

drop table if exists leaders.backup_20261030_journey_text;
drop table if exists leaders.backup_20261030_phase2;
drop table if exists leaders.backup_20261030_phase3;
drop table if exists leaders.backup_20261031_level_fit;
drop table if exists leaders.backup_20261031_track_project;
drop table if exists leaders.backup_20261101_text_fixes;
drop table if exists leaders.backup_20261101_tracks_profiles;
drop table if exists leaders.handbook_modules_backup_20261101;
drop table if exists leaders.handbook_modules_backup_20261102;
drop table if exists leaders.questions_backup_20261101;
drop table if exists leaders.questions_backup_20261101_post_v2;

insert into leaders.schema_migrations (name) values ('20261105130000_leaders_drop_backup_tables') on conflict do nothing;
