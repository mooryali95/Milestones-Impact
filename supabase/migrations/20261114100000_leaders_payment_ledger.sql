-- ════════════════════════════════════════════════════════════════
-- سجل المدفوعات: تفاصيل العملية في أعمدتها، وربط الإشعار بعمليته، ومفاتيح بريد الدفع (اعتمده المالك 2026-11-13)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تكتب هذه الأعمدة بتحديث منفصل يتحمل غيابها (payments.ts saveLedger)، وتقرأ العملية بـ* فتعمل قبل الترحيل وبعده
-- المصدر الواحد: جدول payments هو السجل. الأعمدة تُملأ من إشعار Creem نفسه المحفوظ بنصه في payment_events (payments-ledger.js).
alter table leaders.payments
  add column if not exists subtotal_cents integer,
  add column if not exists tax_cents integer,
  add column if not exists country text,
  add column if not exists customer_name text,
  add column if not exists transaction_id text,
  add column if not exists refund_cents integer,
  add column if not exists refund_reason text,
  add column if not exists admin_note text,
  add column if not exists receipt_sent_at timestamptz,
  add column if not exists reminded_at timestamptz;
comment on column leaders.payments.subtotal_cents is 'المجموع قبل الضريبة من إشعار Creem (order.sub_total)';
comment on column leaders.payments.admin_note is 'ملاحظة الإدارة على العملية (غير note الذي تكتبه المعالجة الآلية)';

alter table leaders.payment_events add column if not exists payment_id uuid references leaders.payments(id) on delete set null;
create index if not exists payment_events_payment on leaders.payment_events (payment_id);

-- مفاتيح بريد الدفع: كلها مغلقة حتى يفتحها المدير
alter table leaders.payment_settings add column if not exists notify jsonb not null default '{}'::jsonb;

-- ملء ما سبق من الإشعارات المحفوظة: ربط كل إشعار بعمليته، ثم تفاصيل العملية من إشعار اكتمالها
update leaders.payment_events e set payment_id = p.id
  from leaders.payments p
 where e.payment_id is null
   and (e.payload->'object'->>'request_id' = p.id::text or e.payload->'object'->'metadata'->>'payment_id' = p.id::text);
update leaders.payments p set
  subtotal_cents = nullif(e.payload->'object'->'order'->>'sub_total', '')::integer,
  tax_cents = nullif(e.payload->'object'->'order'->>'tax_amount', '')::integer,
  country = left(e.payload->'object'->'customer'->>'country', 8),
  customer_name = left(e.payload->'object'->'customer'->>'name', 120),
  transaction_id = left(coalesce(e.payload->'object'->'order'->'transaction'->>'id', e.payload->'object'->'order'->>'transaction'), 80)
  from leaders.payment_events e
 where e.payment_id = p.id and e.type = 'checkout.completed' and p.subtotal_cents is null
   and (e.payload->'object'->'order'->>'sub_total') ~ '^[0-9]+$';

insert into leaders.schema_migrations (name) values ('20261114100000_leaders_payment_ledger') on conflict do nothing;
