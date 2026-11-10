-- ════════════════════════════════════════════════════════════════
-- أرضية المستوى المتوسط 50 في معيار التسكين الحي (D07 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تقرأ الأرضية من الصف، فتعمل قبله وبعده
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261110110000_leaders_placement_floor_50) بقرار المالك في 2026-11-10.
-- D07 والحدود المؤقتة للدفعة الأولى: أرضية المتوسط على المعرفة والمواقف 50 (كانت 40)، فوق التخمين (25%) بهامش واضح.
-- الكود على 50 (DEFAULT_MODEL.floor_intermediate في logic.js)، والصف الحي بُذر على 40 (20261024140000) والصف يغلب الكود
-- (evaluatePlacement)، فكان كل قياس مبدئي يُسلَّم يُسكَّن على 40 خلافًا للمعتمد.
-- الحارس: يُحدَّث الصف الذي ما زال على 40 وحدها، فلا يُكتب فوق قيمة حُفظت من اللوحة. والتغيير في سجل التدقيق بقيمته قبل وبعد.
-- افتراضي العمود يبقى 40 كما في اللقطة: الجدول صف واحد (id = 1) فلا يُدرج غيره.
-- لا يعيد تسكين أحد: التسكينات القائمة تبقى كما اعتُمدت، والأرضية الجديدة تسري على ما يُسلَّم بعده.
-- تحقق بعده: select floor_intermediate, floor_advanced, updated_at from leaders.placement_model where id = 1;
-- آمن لإعادة التشغيل.

with changed as (
  update leaders.placement_model set floor_intermediate = 50, updated_at = now()
   where id = 1 and floor_intermediate = 40
  returning id
)
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
select 'system', 'migration', 'placement_model.save', 'placement_model', '1',
       jsonb_build_object('floor_intermediate', 40),
       jsonb_build_object('floor_intermediate', 50, 'reason', 'D07: أرضية المتوسط 50 للدفعة الأولى، بقرار المالك في 2026-11-10')
  from changed;

insert into leaders.schema_migrations (name) values ('20261110110000_leaders_placement_floor_50') on conflict do nothing;
