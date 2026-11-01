-- ════════════════════════════════════════════════════════════════
-- التقييم المستمر: معيار المعلم الوصفي لكل مشارك
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. بقية مصادر التقييم المستمر قائمة في جداولها
-- (handbook_progress، model_submissions، expert_ratings) ولا تُنسخ.
-- scores: { understanding|structure|execution|impact|presentation: 1..4 }
alter table leaders.participant_milestones add column if not exists scores jsonb not null default '{}'::jsonb;
