-- عدة مطّلعين لكل جهة: لكل مطّلع قالب صلاحيات ومدة اختيارية.
-- القيد القديم (مطّلع واحد لكل جهة) يُرفع، والبريد يبقى لجهة واحدة (يُفحص في الخادم).
alter table leaders.org_coordinators drop constraint if exists org_coordinators_organization_id_key;
alter table leaders.org_coordinators add column if not exists template text not null default 'program';
alter table leaders.org_coordinators add column if not exists expires_at timestamptz;
alter table leaders.org_coordinators drop constraint if exists org_coordinators_template_check;
alter table leaders.org_coordinators add constraint org_coordinators_template_check
  check (template in ('executive', 'program', 'hr', 'custom'));
create index if not exists org_coordinators_org_idx on leaders.org_coordinators (organization_id);
-- قائمة المشاركين صلاحية صريحة الآن؛ المطّلعون الحاليون يرونها كما كانوا
update leaders.org_coordinators set permissions = permissions || '{"list": true}'::jsonb where not (permissions ? 'list');
