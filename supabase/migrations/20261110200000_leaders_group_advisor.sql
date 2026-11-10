-- ════════════════════════════════════════════════════════════════
-- خبير المجموعة: إسناد خبير لمجموعة داخل الدفعة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب العمود (advisor.ts: groupAdvisorId وgroupScoped، وprograms.ts: cohortGroups
-- وcohortGroupSave)، فقبله المستشار هو مستشار الدفعة الأساسي كما كان، واللوحة لا تعرض اختيار خبير المجموعة.
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261110200000_leaders_group_advisor).
-- الأخص يغلب (باعتماد المالك في 10 نوفمبر): خبير المجموعة إن عُيّن وكان معتمدًا هو مستشار أعضائها (يصله تسليمهم،
-- ويقيّم نماذجهم، ويجري تقييمهم الختامي)، وإلا فمستشار الدفعة الأساسي. القاعة تبقى لمستشار الدفعة.
-- حذف الخبير يفرغ الحقل فيعود الأعضاء لمستشار الدفعة. آمن لإعادة التشغيل.
alter table leaders.cohort_groups add column if not exists advisor_expert_id uuid references leaders.experts (id) on delete set null;
create index if not exists cohort_groups_advisor on leaders.cohort_groups (advisor_expert_id) where advisor_expert_id is not null;

insert into leaders.schema_migrations (name) values ('20261110200000_leaders_group_advisor') on conflict do nothing;
