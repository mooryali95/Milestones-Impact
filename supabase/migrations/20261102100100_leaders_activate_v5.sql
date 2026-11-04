-- ════════════════════════════════════════════════════════════════
-- تفعيل القياس v5 (المرحلة ج) — يُطبَّق بقرار، لا مع الترحيل السابق
-- ════════════════════════════════════════════════════════════════
-- يتطلب 20261102100000_leaders_instruments_v5.sql. القياسات المبدوءة والمسلّمة تبقى بأداتها.
-- المبدئي: أداة واحدة مفعّلة (baseline-v5). البعدي: post-v3 لمن بدأ على baseline-v5.
-- post-v2 يبقى مفعّلًا عمدًا: postInstrumentFor (participant.ts) يختار من الأدوات البعدية المفعّلة
-- ما يقابل مبدئي المشارك (pairs_with)، فإطفاؤه يحرم من سلّم baseline-v4 من قياسه البعدي.
-- يُطفأ post-v2 بعد أن يُتم آخر مشاركي baseline-v4 قياسهم البعدي:
--   update leaders.instruments set active = false where key = 'post-v2';
do $$ begin
  if (select count(*) from leaders.questions q join leaders.instruments i on i.id = q.instrument_id where i.key in ('baseline-v5', 'post-v3')) = 0 then
    raise exception 'v5: الأداتان بلا فقرات؛ طبّق 20261102100000_leaders_instruments_v5.sql أولًا';
  end if;
  if not exists (select 1 from leaders.schema_migrations where name = '20261105150000_leaders_v5_1_pre_activation') then
    raise exception 'v5: طبّق 20261105150000_leaders_v5_1_pre_activation.sql (إصلاحات ما قبل التفعيل) أولًا';
  end if;
end $$;
update leaders.instruments set active = (key = 'baseline-v5') where kind = 'baseline';
update leaders.instruments set active = (key in ('post-v3', 'post-v2')) where kind = 'post';
