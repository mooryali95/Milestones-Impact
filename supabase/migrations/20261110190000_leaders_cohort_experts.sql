-- ════════════════════════════════════════════════════════════════
-- فريق خبراء الدفعة: أكثر من خبير للدفعة، يُعرضون على مشاركيها أولًا
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (experts.ts: cohortTeam، وprograms.ts: list وcohortSave)، فقبله
-- العرض على المشارك بالترتيب العام كما كان، وحفظ الدفعة بلا فريق يعمل، وحفظها بفريق يُرفض بسبب واضح.
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261110190000_leaders_cohort_experts).
-- الدفعة نقطة الربط (باعتماد المالك في 10 نوفمبر): المستشار الأساسي يبقى في cohorts.advisor_expert_id وحده،
-- وهنا بقية الفريق. صف لكل خبير في كل دفعة. أدوار الخبير من ملفه (experts.roles) لا من هنا، فلا مصدر ثانٍ لها.
-- العضوية تقدّم الخبير في العرض على مشاركي الدفعة ولا تمنحه صلاحيات المستشار الأساسي.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.cohort_experts (
  cohort_id uuid not null references leaders.cohorts (id) on delete cascade,
  expert_id uuid not null references leaders.experts (id) on delete cascade,
  added_by text check (added_by is null or char_length(added_by) <= 200),
  created_at timestamptz not null default now(),
  primary key (cohort_id, expert_id)
);
create index if not exists cohort_experts_expert on leaders.cohort_experts (expert_id);
alter table leaders.cohort_experts enable row level security;
revoke all on leaders.cohort_experts from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261110190000_leaders_cohort_experts') on conflict do nothing;
