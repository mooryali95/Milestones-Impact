-- deploy-gate: tolerant الدوال تتسامح مع غيابه: تعذّر قراءة participant_mail_prefs يُرسل البريد كما كان بلا ترويسة ولا تسجيل، والطابور يعيد الإدراج بلا عمود headers، ومركز الرسائل يرد 503 برسالة
-- ════════════════════════════════════════════════════════════════
-- مركز رسائل المشارك وتفضيلات بريده (اعتمده المالك 2026-11-25)
-- ════════════════════════════════════════════════════════════════
-- 1) participant_mail_prefs: الفئات التي كتمها المشارك من بريده (مفاتيح MAIL_CATEGORIES القابلة للكتم في labels.js).
--    الضروري (رموز الدخول والأمان والدفع والخصوصية) لا يُكتم: الدوال تُسقط غيره قبل الحفظ (mail-prefs.js cleanMuted).
-- 2) participant_notifications: كل بريد غير ضروري أُرسل إلى المشارك أو كُتم، بعنوانه ومقتطفه وحالة قراءته. يُحذف مع الحساب.
-- 3) mail_queue.headers: ترويستا الإلغاء بنقرة (List-Unsubscribe) مع الرسالة المنتظرة، فتخرج بهما حين تتسع الحصة.
-- الدوال وحدها تقرأ وتكتب (service_role)، فلا صلاحية لـanon ولا authenticated، كبقية جداول leaders.
-- آمن لإعادة التشغيل.

create table if not exists leaders.participant_mail_prefs (
  participant_id uuid primary key references leaders.participants(id) on delete cascade,
  muted text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table leaders.participant_mail_prefs enable row level security;
revoke all on leaders.participant_mail_prefs from anon, authenticated;

create table if not exists leaders.participant_notifications (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  category text not null,
  title text not null,
  excerpt text,
  ref text,
  emailed boolean not null default true,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists participant_notifications_by_participant on leaders.participant_notifications (participant_id, created_at desc);
alter table leaders.participant_notifications enable row level security;
revoke all on leaders.participant_notifications from anon, authenticated;

alter table leaders.mail_queue add column if not exists headers jsonb;

insert into leaders.schema_migrations (name) values ('20261128200000_leaders_participant_messages') on conflict do nothing;
