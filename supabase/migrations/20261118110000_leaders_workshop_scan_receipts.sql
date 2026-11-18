-- ════════════════════════════════════════════════════════════════
-- حضور لا يتعثر (W1): إيصال المسح لمن مسح رمز الحضور قبل دخوله
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يرد workshop.scan بـnot_migrated فيحفظ التطبيق الرمز نفسه كما كان، ويبقى المسح بعد الدخول كما هو (activities.ts: workshopScan وworkshopCheckin)
-- تصور الرحلة بالسحب والورش والحضور (2026-11-18)، ب5.5 البند 2: الرمز المتغير يُقبل 30 إلى 60 ثانية، والدخول برمز البريد
-- يأخذ دقائق، فكان الحضور يضيع بعد الدخول. الآن يتحقق الخادم من الرمز لحظة المسح (بلا جلسة دخول) ويعطي إيصالًا موقّعًا
-- بسر الجلسة، مربوطًا بها، عمره 15 دقيقة لا يتجاوز إغلاق نافذة الحضور، ويُستهلك مرة واحدة لمشارك واحد بعد دخوله.
-- الصف لا يحمل بيانات شخصية قبل الاستهلاك: بصمة عنوان الشبكة (مملّحة) لحد المعدل وحدها. ويُحذف بعد انتهائه بيوم (purge).
-- لا يقرؤه إلا دور الخدمة كبقية جداول الحضور. آمن لإعادة التشغيل.

create table if not exists leaders.workshop_scan_receipts (
  id uuid primary key,
  session_id uuid not null references leaders.workshop_sessions(id) on delete cascade,
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- الاستهلاك: من سُجّل حضوره به ومتى. مرة واحدة، فلا يُعاد لمشارك آخر
  participant_id uuid references leaders.participants(id) on delete cascade,
  consumed_at timestamptz,
  constraint workshop_scan_receipts_consumed_check check ((participant_id is null) = (consumed_at is null))
);
create index if not exists workshop_scan_receipts_ip_idx on leaders.workshop_scan_receipts (ip_hash, created_at);
create index if not exists workshop_scan_receipts_session_idx on leaders.workshop_scan_receipts (session_id, created_at);
create index if not exists workshop_scan_receipts_expires_idx on leaders.workshop_scan_receipts (expires_at);

alter table leaders.workshop_scan_receipts enable row level security;
revoke all on leaders.workshop_scan_receipts from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261118110000_leaders_workshop_scan_receipts') on conflict do nothing;
