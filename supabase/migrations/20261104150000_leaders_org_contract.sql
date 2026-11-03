-- السعر التعاقدي لكل جهة: قيمة رحلة المشارك المرعي منها (يعدّلها الأدمن)، وإظهارها له أو إخفاؤها، ومدة العقد.
-- القيمة تُثبَّت في الاستحقاق لحظة الربط (value_cents)، فتغيير سعر الجهة لا يعيد كتابة ما سبق.
-- فارغ = السعر المعلن (القياس + البرنامج).
alter table leaders.organizations add column if not exists contract_cents integer check (contract_cents is null or contract_cents >= 0);
alter table leaders.organizations add column if not exists show_value boolean not null default true;
alter table leaders.organizations add column if not exists contract_starts date;
alter table leaders.organizations add column if not exists contract_ends date;
alter table leaders.entitlements add column if not exists value_cents integer;
