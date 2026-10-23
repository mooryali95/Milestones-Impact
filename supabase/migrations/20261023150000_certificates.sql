-- ════════════════════════════════════════════════════════════════
-- شهادات المشاركة (23 أكتوبر 2026)
-- ════════════════════════════════════════════════════════════════
-- تُصدر الشهادة تلقائيًا حين تصير حالة المشارك «أنهى البرنامج»، وتحفظ
-- لقطة ثابتة من بياناته وقت الإصدار، فلا يغيّرها تعديل لاحق. الاسم يُقفل
-- عند الإصدار، والتحقق العام برقم الشهادة يقرأ اللقطة ويعيد حساب التوقيع.
-- المخطط مغلق إلا لـ service_role.

-- 1) الاسم الإنجليزي وقفل الاسم
alter table leaders.participants
  add column if not exists name_en text check (name_en is null or char_length(name_en) <= 120),
  add column if not exists name_locked_at timestamptz;

-- 2) شعار الجهة للعلامة المشتركة واسمها الإنجليزي
alter table leaders.organizations
  add column if not exists name_en text check (name_en is null or char_length(name_en) <= 200),
  -- PNG مفرّغ الخلفية بصيغة data URL، يعالَج في المتصفح قبل الرفع
  add column if not exists logo text check (logo is null or (logo like 'data:image/png;base64,%' and char_length(logo) <= 600000)),
  -- يظهر الشعار على شهادات مشاركي الجهة
  add column if not exists cert_cobrand boolean not null default true;

-- 3) اسم المسار بالإنجليزية لسطر الشهادة الإنجليزي
alter table leaders.tracks
  add column if not exists title_en text check (title_en is null or char_length(title_en) <= 200);

-- 4) إعدادات الشهادة (صف واحد)
create table if not exists leaders.certificate_settings (
  id           smallint primary key default 1 check (id = 1),
  enabled      boolean not null default true,
  program_ar   text not null default 'برنامج القادة',
  program_en   text not null default 'Leaders Program',
  hours        smallint check (hours is null or hours between 1 and 2000),
  -- [{ name, title, image? }]: موقّع واحد
  signatories  jsonb not null default '[]'::jsonb check (jsonb_typeof(signatories) = 'array' and jsonb_array_length(signatories) <= 1),
  updated_by   text,
  updated_at   timestamptz not null default now()
);
insert into leaders.certificate_settings (id) values (1) on conflict do nothing;

-- 5) الشهادات
create table if not exists leaders.certificates (
  id             uuid primary key default gen_random_uuid(),
  serial         text not null unique check (serial ~ '^MI-LDR-[0-9]{4}-[0-9A-Z]{6}$'),
  participant_id uuid not null references leaders.participants(id) on delete restrict,
  -- valid: سارية · revoked: ملغاة · replaced: استُبدلت بإصدار أحدث
  status         text not null default 'valid' check (status in ('valid', 'revoked', 'replaced')),
  -- كل ما يظهر على الشهادة، مجمّد وقت الإصدار
  snapshot       jsonb not null,
  -- HMAC-SHA256 للحقول الحاكمة؛ يعاد حسابه عند التحقق
  signature      text not null,
  issued_at      timestamptz not null default now(),
  issued_by      text,
  revoked_at     timestamptz,
  revoked_by     text,
  revoke_reason  text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  replaced_by    uuid references leaders.certificates(id),
  created_at     timestamptz not null default now()
);
-- شهادة سارية واحدة لكل مشارك
create unique index if not exists certificates_one_valid on leaders.certificates (participant_id) where status = 'valid';
create index if not exists certificates_participant_idx on leaders.certificates (participant_id);

-- 6) سجل التحقق العام، ومنه يُحسب حد الطلبات لكل عنوان
create table if not exists leaders.certificate_checks (
  id          bigint generated always as identity primary key,
  serial      text,
  found       boolean not null,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists certificate_checks_ip_idx on leaders.certificate_checks (ip, created_at desc);
create index if not exists certificate_checks_serial_idx on leaders.certificate_checks (serial, created_at desc);

alter table leaders.certificate_settings enable row level security;
alter table leaders.certificates enable row level security;
alter table leaders.certificate_checks enable row level security;
revoke all on leaders.certificate_settings, leaders.certificates, leaders.certificate_checks from anon, authenticated;
grant all on leaders.certificate_settings, leaders.certificates, leaders.certificate_checks to service_role;
grant usage, select on all sequences in schema leaders to service_role;
