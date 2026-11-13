-- ════════════════════════════════════════════════════════════════
-- الإعدادات العامة: مخزن واحد لكل قيمة يضبطها المالك من اللوحة (قاعدة المالك 2026-11-11)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (settings.ts: appSettings تعيد القيم الافتراضية من settings.js)، فقبله تعمل الحدود كما كانت ويرفض الحفظ بسبب واضح
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261111130100_leaders_app_settings).
-- صف لكل مجموعة (feedback360، answer_review): key اسمها، وvalue ما حرّرته الإدارة منها فقط، وما سواه
-- يبقى على افتراضيه في settings.js. التحقق في الدالة (cleanGroup) لأن التعريف هناك مصدر واحد.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.app_settings (
  key text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  value jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object' and char_length(value::text) <= 8000),
  updated_by text check (updated_by is null or char_length(updated_by) <= 254),
  updated_at timestamptz not null default now()
);
comment on table leaders.app_settings is 'الإعدادات العامة التي يضبطها المالك من اللوحة: صف لكل مجموعة، والتعريف والافتراضي في settings.js';
alter table leaders.app_settings enable row level security;
revoke all on leaders.app_settings from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261111130100_leaders_app_settings') on conflict do nothing;
