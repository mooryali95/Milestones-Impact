-- الرعاية تُثبَّت في سجل الاستحقاقات لحظة سريانها (مصدر sponsor)، فلا يُسحب الإعفاء ممن بدأ رحلته
-- إن أُوقفت جهته لاحقًا. الإعفاء الجديد يشترط جهة نشطة.
alter table leaders.entitlements drop constraint if exists entitlements_source_check;
alter table leaders.entitlements add constraint entitlements_source_check check (source in ('paid', 'admin', 'grandfathered', 'sponsor'));
alter table leaders.entitlements add column if not exists organization_id uuid references leaders.organizations(id) on delete set null;
