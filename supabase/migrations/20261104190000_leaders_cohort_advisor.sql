-- المستشار الأساسي للدفعة: يصله كل نموذج ووثيقة يسلّمها مشاركوها ويقيّمها من بوابته؛ الإدارة ترى وتقيّم أيضًا.
-- مصدره الدفعة وحدها (الجهة تُخصَّص بدفعتها)، ويُغيَّر متى شاء الأدمن فتنتقل إليه المراجعات المعلّقة.
alter table leaders.cohorts add column if not exists advisor_expert_id uuid references leaders.experts(id) on delete set null;
create index if not exists cohorts_advisor on leaders.cohorts (advisor_expert_id);
