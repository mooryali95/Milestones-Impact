-- ════════════════════════════════════════════════════════════════
-- الدفع عبر Creem: الاستحقاقات مصدر واحد لما يحق لكل مشارك
-- ════════════════════════════════════════════════════════════════
-- القياس المبدئي (assessment) وإكمال البرنامج (program). الحق يأتي من: دفع، أو جهة راعية
-- (تُحسب حيًا من organization_id ولا تُخزَّن)، أو منحة إدارية، أو إعفاء المشاركين السابقين.
-- الدفع لا يُعتمد إلا بإشعار Creem الموقّع (payment_events)، ولا يُحتسب الإشعار مرتين.

create table if not exists leaders.payment_settings (
  id                  boolean primary key default true check (id),
  enabled             boolean not null default false,          -- مطفأ: يمر الجميع مجانًا حتى التفعيل
  currency            text not null default 'USD',
  assessment_product  text,
  assessment_cents    integer not null default 100 check (assessment_cents >= 0),
  program_product     text,
  program_cents       integer not null default 9900 check (program_cents >= 0),
  updated_by          text,
  updated_at          timestamptz not null default now()
);
insert into leaders.payment_settings (id, assessment_product, program_product)
values (true, 'prod_29M2OZlfjTY3BIDZa6fRml', 'prod_4FirbtP1xWCp6zxREZjGXa')
on conflict (id) do nothing;

create table if not exists leaders.payments (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid references leaders.participants(id) on delete set null,
  email           text not null,
  item            text not null check (item in ('assessment', 'program')),
  product_id      text not null,
  checkout_id     text unique,
  order_id        text,
  customer_id     text,
  amount_cents    integer,
  currency        text,
  status          text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed', 'expired')),
  mode            text not null default 'live' check (mode in ('test', 'live')),
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  refunded_at     timestamptz,
  note            text
);
create index if not exists payments_participant on leaders.payments (participant_id);
create index if not exists payments_status on leaders.payments (status, created_at desc);
create index if not exists payments_order on leaders.payments (order_id);

create table if not exists leaders.entitlements (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references leaders.participants(id) on delete cascade,
  item            text not null check (item in ('assessment', 'program')),
  source          text not null check (source in ('paid', 'admin', 'grandfathered')),
  payment_id      uuid references leaders.payments(id) on delete set null,
  granted_by      text,
  note            text,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by      text
);
create unique index if not exists entitlements_one_live on leaders.entitlements (participant_id, item) where revoked_at is null;

create table if not exists leaders.payment_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      text unique,
  type          text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);
create index if not exists payment_events_time on leaders.payment_events (received_at desc);

-- المشاركون الحاليون معفون من الاثنين (قرار المالك)
insert into leaders.entitlements (participant_id, item, source, granted_by, note)
select p.id, i.item, 'grandfathered', 'migration', 'مشارك قبل تفعيل الدفع'
from leaders.participants p cross join (values ('assessment'), ('program')) as i(item)
where not p.is_demo
on conflict do nothing;

alter table leaders.payment_settings enable row level security;
alter table leaders.payments enable row level security;
alter table leaders.entitlements enable row level security;
alter table leaders.payment_events enable row level security;
revoke all on leaders.payment_settings, leaders.payments, leaders.entitlements, leaders.payment_events from public, anon, authenticated;
