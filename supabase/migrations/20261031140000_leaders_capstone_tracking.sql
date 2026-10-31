-- ════════════════════════════════════════════════════════════════
-- متابعة تنفيذ المبادرة وأثرها بعد اعتماد وثيقتها
-- ════════════════════════════════════════════════════════════════
-- الخطة لا تُخزَّن هنا: معالمها ومنافعها من لقطة الوثيقة المعتمدة
-- (capstones.snapshot). هذا الجدول يحمل الفعلي وحده: تحديث واحد لكل شهر،
-- ونقطتا مراجعة عند اليوم 90 و180 يؤكد فيهما راعي المبادرة الأرقام.

create table if not exists leaders.capstone_updates (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references leaders.capstones(participant_id) on delete cascade,
  period            text not null check (period ~ '^\d{4}-\d{2}$'),
  checkpoint        text check (checkpoint is null or checkpoint in ('d90', 'd180')),
  -- { m0: { status, date?, note? } } و { b0: { value, note?, evidence? } }
  milestones        jsonb not null default '{}',
  benefits          jsonb not null default '{}',
  narrative         text check (narrative is null or char_length(narrative) <= 2000),
  blockers          text check (blockers is null or char_length(blockers) <= 1000),
  support           text check (support is null or char_length(support) <= 1000),
  -- تأكيد الراعي لمراجعة الأثر: رابط خاص بلا حساب، يُخزَّن رمزه مجزّأً
  verify_name       text,
  verify_email      text,
  verify_token_hash text unique,
  verify_status     text check (verify_status is null or verify_status in ('pending', 'confirmed', 'disputed')),
  verify_note       text check (verify_note is null or char_length(verify_note) <= 2000),
  verify_expires_at timestamptz,
  verify_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (participant_id, period)
);
create unique index if not exists capstone_updates_checkpoint on leaders.capstone_updates (participant_id, checkpoint) where checkpoint is not null;
alter table leaders.capstone_updates enable row level security;
grant all on leaders.capstone_updates to service_role;

-- تذكير التحديث الشهري: مرة لكل شهر
alter table leaders.capstones add column if not exists tracking_reminded_at timestamptz;

-- نقاط التحديث وتأكيد الأثر
alter table leaders.points_ledger drop constraint if exists points_ledger_source_check;
alter table leaders.points_ledger add constraint points_ledger_source_check
  check (source in ('chapter', 'model', 'review', 'bonus', 'lab', 'lab_bonus', 'capstone', 'tracking'));
