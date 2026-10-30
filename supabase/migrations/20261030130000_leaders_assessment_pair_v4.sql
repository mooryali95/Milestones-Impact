-- القياس القبلي والبعدي زوج متكافئ: baseline-v4 مع post-v2
-- v1 (أربعة بنود معرفة لكل إطار) كان المفعّل، ولا أداة بعدية تقابله، فكانت خطوة القياس البعدي معطلة للجميع.
-- v4: اثنا عشر بند معرفة وتسعة مواقف وأربعة سلوك لكل إطار، بلا مصطلحات خاصة بالمنهجية لم يدرسها المشارك بعد.
-- يسري على من يبدأ القياس بعد اليوم؛ القياس المسلَّم يبقى بأداته.
update leaders.instruments set active = (key = 'baseline-v4') where kind = 'baseline';
update leaders.instruments set active = (key = 'post-v2') where kind = 'post';
