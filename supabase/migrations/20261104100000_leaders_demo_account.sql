-- ════════════════════════════════════════════════════════════════
-- حساب العرض التوضيحي: مشارك حقيقي بعلامة is_demo للورش
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يمس أي مشارك قائم. الحساب نفسه يُنشأ من اللوحة عند أول فتح،
-- ويُستبعد من قوائم المشاركين والنظرة العامة والجهات، ولا يصله بريد، ويُعتمد مستواه آليًا.
alter table leaders.participants add column if not exists is_demo boolean not null default false;
create unique index if not exists participants_one_demo on leaders.participants ((true)) where is_demo;
