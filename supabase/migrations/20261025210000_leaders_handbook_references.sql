-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: مراجع الكتيب ووسم المفاهيم وتصحيح المعلومات المتقادمة
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. نتيجة مراجعة الأطر الثلاثة (أكتوبر 2026)، المرحلة الأولى.
--
-- لا يكتب فوق ما حُرِّر من لوحة الإدارة:
--   • التصحيح يستبدل جملة بعينها، فإن لم يجدها (لأنها حُرِّرت) لا يفعل شيئًا.
--   • الإضافة تُلحق فقرة في آخر الباب مرة واحدة، بعلامة تمنع تكرارها.
--
-- المحتوى:
--   1. تصحيح: ICB4 بدل تقسيم ICB3، ومثلث المواهب بصيغة 2022، و OPM3
--      ليس خمسة مستويات، ومساءلة متدرجة في سلسلة النتائج، والمربع
--      الرابع في مصفوفة أصحاب المصلحة.
--   2. وسم ما هو من اجتهاد المنهجية (المعالم الأربعة، السلسلة الخماسية،
--      جدارتا الاستجابة والتسليم، DIRECT) وتوضيح حدود القيادة الموقفية و TKI.
--   3. باب الخاتمة في كل إطار: «طبيعة المفاهيم والمراجع».
--   4. تصحيح إسناد مصادر ثلاثة نماذج تعليمية.

create or replace function leaders._hb_fix(p_dim text, p_chap text, p_old text, p_new text)
returns void language sql as $$
  update leaders.handbook_modules
     set body_md = replace(body_md, p_old, p_new)
   where dimension = p_dim and chapter_key = p_chap
     and position(p_old in coalesce(body_md, '')) > 0
     and position(p_new in coalesce(body_md, '')) = 0;
$$;

create or replace function leaders._hb_append(p_dim text, p_chap text, p_marker text, p_text text)
returns void language sql as $$
  update leaders.handbook_modules
     set body_md = rtrim(body_md) || E'\n\n' || p_text
   where dimension = p_dim and chapter_key = p_chap
     and coalesce(body_md, '') <> ''
     and position(p_marker in body_md) = 0;
$$;

-- ── 1. تصحيح المعلومات ──

select leaders._hb_fix('milestone', 'ch1',
  $x$- **IPMA و ICB** (أوروبا): جدارات الأفراد السلوكية والسياقية والفنية.$x$,
  $x$- **IPMA و ICB4** (أوروبا): جدارات الأفراد في ثلاثة مجالات: المنظور، والأشخاص، والممارسة.$x$);

select leaders._hb_fix('milestone', 'ch1',
  $x$## نضج المؤسسات (P3M3 و OPM3)
خمسة مستويات لا يمكن القفز بينها، والمعالم هي أداة الانتقال من مستوى إلى الذي يليه:$x$,
  $x$## نضج المؤسسات (P3M3)
خمسة مستويات في نموذج P3M3 لا يمكن القفز بينها، والمعالم هي أداة الانتقال من مستوى إلى الذي يليه (أما OPM3 من PMI فيقيس النضج بمراحل تحسين: توحيد، فقياس، فضبط، فتحسين):$x$);

select leaders._hb_fix('milestone', 'ch2',
  $x$> المساءلة تصعد في السلسلة: ننفذ الأنشطة، لكننا نُحاسب على النتائج والأثر.$x$,
  $x$> المساءلة تتدرج في السلسلة: نُحاسب على المخرجات، ونتحمل مسؤولية الإسهام في النتائج، ونتعلم من قياس الأثر الذي تشترك في صنعه عوامل كثيرة.$x$);

select leaders._hb_fix('leadership', 'ch1',
  $x$- **PMI Talent Triangle**: توازن القائد بين التقني والقيادي وإدارة الأعمال الاستراتيجية.$x$,
  $x$- **PMI Talent Triangle** (تحديث 2022): توازن القائد بين طرق العمل، والمهارات القوية، وفطنة الأعمال.$x$);

select leaders._hb_fix('leadership', 'ch1',
  $x$- **IPMA ICB**: جدارات الأفراد السلوكية والسياقية والفنية.$x$,
  $x$- **IPMA ICB4**: جدارات الأفراد في المنظور والأشخاص والممارسة، ومنها عشر جدارات للأشخاص كالقيادة والعمل الجماعي وإدارة الخلاف.$x$);

select leaders._hb_fix('leadership', 'ch1',
  $x$- **من ICB**: الجدارات السلوكية والسياقية تُقاس وتُطور كالفنية.$x$,
  $x$- **من ICB4**: جدارات الأشخاص والمنظور تُقاس وتُطور كجدارات الممارسة.$x$);

select leaders._hb_fix('leadership', 'ch5',
  $x$- اهتمام عالٍ ونفوذ منخفض: إبقاؤه مطلعًا وكسبه سفيرًا.$x$,
  $x$- اهتمام عالٍ ونفوذ منخفض: إبقاؤه مطلعًا وكسبه سفيرًا.
- نفوذ منخفض واهتمام منخفض: متابعة دورية بأقل جهد.$x$);

-- ── 2. وسم المفاهيم وحدود النماذج ──

select leaders._hb_fix('leadership', 'ch1',
  $x$- **Hersey و Blanchard (القيادة الموقفية)**: لا نمط أفضل؛ النمط يتبع جاهزية الفرد والموقف.$x$,
  $x$- **Hersey و Blanchard (القيادة الموقفية)**: لا نمط أفضل؛ النمط يتبع جاهزية الفرد والموقف. نموذج تطبيقي واسع الانتشار، لكن سنده البحثي محدود، فنستعمله أداة تفكير لا قاعدة صارمة.$x$);

select leaders._hb_fix('leadership', 'ch1',
  $x$- **القيادة التحويلية**: إلهام وتحفيز يحولان الالتزام إلى تبنٍّ للتغيير.$x$,
  $x$- **القيادة التحويلية** (Bass و Avolio): إلهام وتحفيز يحولان الالتزام إلى تبنٍّ للتغيير، بأربعة عناصر: القدوة، والإلهام، والاستثارة الفكرية، والاهتمام الفردي. وهي من أقوى نظريات القيادة سندًا في الأبحاث.$x$);

select leaders._hb_fix('leadership', 'ch4',
  $x$- **القيادة الموقفية**: أربعة أنماط (توجيه، تدريب، مساندة، تفويض)، والنمط يتبع جاهزية الفرد لا شخصية القائد.$x$,
  $x$- **القيادة الموقفية**: أربعة أنماط (توجيه، تدريب، مساندة، تفويض)، والنمط يتبع جاهزية الفرد لا شخصية القائد. أسماء الأنماط من نسخة Blanchard المعروفة بـ SLII، وهي تسمي الجاهزية «مستوى النمو».$x$);

select leaders._hb_fix('leadership', 'ch4',
  $x$- **إدارة الخلاف (TKI)**: خمسة أنماط: تنافس، تعاون، تسوية، تجنب، مجاملة. لكل موقف نمطه بحسب أهمية القضية وأهمية العلاقة.$x$,
  $x$- **إدارة الخلاف (TKI)**: خمسة أنماط: تنافس، تعاون، تسوية، تجنب، مجاملة. لكل موقف نمطه بحسب أهمية القضية وأهمية العلاقة، وهذا تبسيط لمحوري النموذج الأصليين: الحزم والتعاون.$x$);

select leaders._hb_fix('leadership', 'ch4',
  $x$- **أداة DIRECT للتحديات**: تشخيص، ثم تأثير، ثم حل، يسندها تعاطف وتواصل، ثم تتبع حتى الإغلاق. مسار منضبط للتحديات القيادية اليومية.$x$,
  $x$- **أداة DIRECT للتحديات**: تشخيص، ثم تأثير، ثم حل، يسندها تعاطف وتواصل، ثم تتبع حتى الإغلاق. مسار منضبط للتحديات القيادية اليومية، وهي أداة من اجتهاد هذه المنهجية.$x$);

select leaders._hb_append('leadership', 'ch2', 'سند هذه الجدارة',
  $x$> **سند هذه الجدارة**: سلسلة الاستجابة من اجتهاد هذه المنهجية. وأصلها في الأدبيات مفهوم «قصد القائد» في القيادة بالمهمة (افهم المقصود لا الكلمات)، وأبحاث Eisenhardt عن سرعة القرار في البيئات المتقلبة.$x$);

select leaders._hb_append('leadership', 'ch3', 'سند هذه الجدارة',
  $x$> **سند هذه الجدارة**: حلقة التسليم والتسلم من اجتهاد هذه المنهجية. وأصلها في الأدبيات أبحاث نقل المعرفة في المنظمات القائمة على المشاريع، وتسليم المخرجات في PRINCE2، ونموذج التسعين يومًا لـ Michael Watkins في انتقال المسؤولية.$x$);

select leaders._hb_fix('milestone', 'ch4',
  $x$> كل مشروع يحتاج مزيجًا من الأنواع الأربعة؛ الاقتصار على المعالم التقنية أشهر أخطاء الجدولة.$x$,
  $x$> كل مشروع يحتاج مزيجًا من الأنواع الأربعة؛ الاقتصار على المعالم التقنية أشهر أخطاء الجدولة. (التصنيف الرباعي من اجتهاد هذه المنهجية.)$x$);

select leaders._hb_fix('impact', 'ch2',
  $x$## سلسلة القيمة الخماسية
امتداد لسلسلة النتائج في الإطار الأول، لكن بعدسة قياس القيمة والأثر:$x$,
  $x$## سلسلة القيمة الخماسية
امتداد لسلسلة النتائج في الإطار الأول، لكن بعدسة قياس القيمة والأثر. وهي صياغة هذه المنهجية، تجمع سلسلة نتائج RBM ومفهوم المنافع في MSP و BRM:$x$);

select leaders._hb_fix('impact', 'ch2',
  $x$- **المساهمة**: الإقرار بأن تدخلنا أحد عوامل متعددة صنعت التغيير. تُبنى على سردية سببية موثقة (نظرية التغيير) وأدلة داعمة، وهي اللغة الأمينة لأعلى السلسلة.$x$,
  $x$- **المساهمة**: الإقرار بأن تدخلنا أحد عوامل متعددة صنعت التغيير. تُبنى على سردية سببية موثقة (نظرية التغيير) وأدلة داعمة، وهي اللغة الأمينة لأعلى السلسلة. ومنهجها المعروف «تحليل الإسهام» عند John Mayne.$x$);

select leaders._hb_fix('impact', 'ch4',
  $x$- **مستدام**: هل يبقى التغيير بعد انتهاء التدخل وتمويله؟$x$,
  $x$- **مستدام**: هل يبقى التغيير بعد انتهاء التدخل وتمويله؟

وتقابل هذه الأبعاد الأبعادَ الخمسة لمشروع إدارة الأثر (Impact Management Project): ماذا، ولمن، وكم، والإسهام، والمخاطر.$x$);

-- ── 3. طبيعة المفاهيم والمراجع في خاتمة كل إطار ──

select leaders._hb_append('milestone', 'close', '## طبيعة المفاهيم والمراجع',
  $x$## طبيعة المفاهيم والمراجع
**معايير دولية**: الإدارة بالمراحل ومبرر الاستمرار (PRINCE2)، ومجالات الأداء وجدولة المعالم (PMBOK)، ونضج المؤسسات (P3M3)، والإدارة القائمة على النتائج والإطار المنطقي.

**نماذج بحثية وتطبيقية**: بوابات المراحل (Robert Cooper)، وتحليل اتجاه المعالم (MTA)، ونظرية التغيير.

**من اجتهاد هذه المنهجية**: المعلم بأبعاده الخمسة، وأنواع المعالم الأربعة، وحلقة صناعة القرار.

**مراجع للاستزادة**:
- PMI (2021). A Guide to the Project Management Body of Knowledge, 7th ed.
- Axelos (2023). Managing Successful Projects with PRINCE2, 7th ed.
- Axelos (2016). P3M3 Maturity Model.
- IPMA (2015). Individual Competence Baseline, version 4.
- ISO 21502:2020. Project, programme and portfolio management.
- Cooper, R. G. (1990). Stage gate systems: a new tool for managing new products. Business Horizons.
- UNDG (2011). Results Based Management Handbook.$x$);

select leaders._hb_append('impact', 'close', '## طبيعة المفاهيم والمراجع',
  $x$## طبيعة المفاهيم والمراجع
**معايير دولية**: إدارة تحقق المنافع (PMI)، وإدارة البرامج بالمنافع (MSP)، ومعايير التقييم الستة (OECD DAC)، ومبادئ القيمة الاجتماعية (SROI).

**نماذج بحثية وتطبيقية**: نظرية التغيير، والإطار المنطقي، وتحليل الإسهام، والأهداف والنتائج المفتاحية (OKR).

**من اجتهاد هذه المنهجية**: سلسلة القيمة الخماسية، وأبعاد الأثر الخمسة، وحلقة قيادة الأثر، وتصنيف الأثر الرباعي.

**مراجع للاستزادة**:
- PMI (2019). Benefits Realization Management: A Practice Guide.
- Axelos (2020). Managing Successful Programmes, 5th ed.
- OECD DAC (2019). Better Criteria for Better Evaluation.
- Social Value International (2012). A Guide to Social Return on Investment.
- Weiss, C. (1995). Nothing as practical as good theory. Aspen Institute.
- Mayne, J. (2012). Contribution analysis: coming of age? Evaluation.
- Doerr, J. (2018). Measure What Matters.$x$);

select leaders._hb_append('leadership', 'close', '## طبيعة المفاهيم والمراجع',
  $x$## طبيعة المفاهيم والمراجع
**معايير دولية**: جدارات الأفراد (IPMA ICB4)، ومثلث المواهب (PMI).

**نماذج بحثية وتطبيقية**: القيادة التحويلية (سند بحثي قوي)، والأمان النفسي (سند قوي)، والإدارة مقابل القيادة (Kotter)، وإدارة الخلاف (TKI)، ومصفوفة أصحاب المصلحة (Mendelow)، والقيادة الموقفية (منتشرة تطبيقيًا، وسندها البحثي محدود).

**من اجتهاد هذه المنهجية**: جدارة سرعة الاستجابة، وجدارة التسليم والتسلم، والجدارات الأربع، وأداة DIRECT.

**مراجع للاستزادة**:
- IPMA (2015). Individual Competence Baseline, version 4.
- Bass, B. M., & Avolio, B. J. (1994). Improving Organizational Effectiveness through Transformational Leadership.
- Judge, T., & Piccolo, R. (2004). Transformational and transactional leadership: a meta analytic test. Journal of Applied Psychology.
- Edmondson, A. (1999). Psychological safety and learning behavior in work teams. Administrative Science Quarterly.
- Kotter, J. (1990). A Force for Change: How Leadership Differs from Management.
- Thomas, K., & Kilmann, R. (1974). Thomas Kilmann Conflict Mode Instrument.
- Hersey, P., & Blanchard, K. (1969). Life cycle theory of leadership. Training and Development Journal.
- Thompson, G., & Vecchio, R. (2009). Situational leadership theory: a test of three versions. The Leadership Quarterly.
- Müller, R., & Turner, J. R. (2010). Leadership competency profiles of successful project managers. International Journal of Project Management.
- Watkins, M. (2013). The First 90 Days.$x$);

-- ── 4. إسناد مصادر النماذج التعليمية ──

update leaders.learning_models
   set source_ar = $x$مستلهم من دليل PMI لإدارة تحقق المنافع (2019) وMSP (Axelos)$x$
 where key = 'benefits-register' and source_ar = $x$مستلهم من Benefits Realisation Management (APMG) وMSP (Axelos)$x$;

update leaders.learning_models
   set source_ar = $x$مستلهم من قاعدة 70/20/10 (Lombardo و Eichinger، من أبحاث Center for Creative Leadership) ونموذج GROW (John Whitmore)$x$
 where key = 'development-plan' and source_ar = $x$مستلهم من نموذج 70-20-10 (Center for Creative Leadership) ونموذج GROW$x$;

update leaders.learning_models
   set source_ar = $x$أداة DIRECT من اجتهاد منهجية Milestone Impact$x$
 where key = 'direct' and source_ar = $x$أداة DIRECT من منهجية Milestone Impact$x$;

drop function leaders._hb_fix(text, text, text, text);
drop function leaders._hb_append(text, text, text, text);
