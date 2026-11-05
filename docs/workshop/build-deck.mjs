// عرض ورشة الأطر الثلاثة بهوية Milestone Impact: عربي أولًا (RTL)، مبني بـpptxgenjs ومنسّق بسمة الهوية.
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
// التشغيل: npm i pptxgenjs@3.12.0 (في مجلد مؤقت أو هنا) ثم NODE_PATH=<node_modules> node build-deck.mjs [المخرج.pptx]
const pptxgen = require('pptxgenjs');
const { applyTheme } = require(path.join(path.dirname(new URL(import.meta.url).pathname), 'apply-theme.js'));
const here = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.argv[2] || path.join(here, 'الأطر-الثلاثة-ورشة.pptx');

// ── الهوية (shared/css/mi-tokens.css) ──
const K = { graphite: '0B272F', ink: '061318', slate: '12414E', gold: 'A97A2E', copper: 'C79A4B', mist: 'EAF0F0', sand: 'EFE7D8', white: 'FFFFFF', muted: '4A6A72', goldDeep: '8E6524', line: 'D5DEDF' };
const THEME = {
  name: 'Milestone Impact', headFontFace: 'Noto Kufi Arabic', bodyFontFace: 'Noto Kufi Arabic',
  colors: { dk1: K.graphite, lt1: K.white, dk2: K.slate, lt2: K.mist, accent1: K.gold, accent2: K.copper, accent3: K.muted, accent4: K.sand, accent5: K.ink, accent6: K.goldDeep, hlink: K.gold, folHlink: K.goldDeep },
};
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';            // 13.333 × 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.lang = 'ar-SA'; pres.rtlMode = true;
pres.title = 'الأطر الثلاثة: ورشة تعريفية'; pres.author = 'Milestone Impact'; pres.company = 'Milestone Impact';
const C = pres.SchemeColor;
const W = 13.333, H = 7.5, M = 0.6;
const RX = (w, right = M) => W - right - w;   // x لصندوق ملتصق باليمين

// ── نصوص بالعربية: كل نص RTL ومحاذاة يمين ما لم يُحدد غيره ──
const T = (slide, text, o = {}) => slide.addText(text, { isTextBox: true, rtlMode: true, lang: 'ar-SA', align: 'right', valign: 'top', margin: 0, fontSize: 14, color: C.text1, ...o });
const DIAMOND = (slide, x, y, s = 0.14, color = C.accent1) => slide.addShape(pres.ShapeType.diamond, { x, y, w: s, h: s, fill: { color }, line: { color, width: 0 } });
const FRAME = (slide) => slide.addShape(pres.ShapeType.rect, { x: 0.32, y: 0.32, w: W - 0.64, h: H - 0.64, fill: { type: 'none' }, line: { color: K.copper, width: 0.75, transparency: 45 } });
const CARD = (slide, x, y, w, h, o = {}) => slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: o.fill || C.background1 }, line: { color: o.line || K.line, width: 0.75 }, shadow: { type: 'outer', color: '0B272F', blur: 6, offset: 1, angle: 90, opacity: 0.08 } });

// ── التخطيطات ──
const footerText = 'Milestone Impact · ورشة الأطر الثلاثة';
pres.defineSlideMaster({ title: 'DARK', background: { color: K.graphite }, objects: [
  { text: { text: footerText, options: { x: RX(5), y: 7.02, w: 5, h: 0.3, fontSize: 10, color: K.copper, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0 } } },
], slideNumber: { x: M, y: 7.02, w: 0.8, h: 0.3, fontSize: 10, color: K.copper, align: 'left' } });
pres.defineSlideMaster({ title: 'LIGHT', background: { color: K.mist }, objects: [
  { placeholder: { options: { name: 'eyebrow', type: 'body', x: RX(8, M + 0.3), y: 0.52, w: 8, h: 0.32, fontSize: 12, bold: true, color: K.gold, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0 }, text: '' } },
  { placeholder: { options: { name: 'title', type: 'title', x: RX(12.1), y: 0.84, w: 12.1, h: 0.75, fontSize: 30, bold: true, color: K.graphite, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0, valign: 'top' }, text: '' } },
  { text: { text: footerText, options: { x: RX(5), y: 7.02, w: 5, h: 0.3, fontSize: 10, color: K.muted, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0 } } },
], slideNumber: { x: M, y: 7.02, w: 0.8, h: 0.3, fontSize: 10, color: K.muted, align: 'left' } });

const content = (section, eyebrow, title, notes) => {
  const s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: section });
  s.addText(eyebrow, { placeholder: 'eyebrow', rtlMode: true, lang: 'ar-SA', align: 'right' });
  s.addText(title, { placeholder: 'title', rtlMode: true, lang: 'ar-SA', align: 'right' });
  DIAMOND(s, W - M - 0.14, 0.6, 0.14);
  if (notes) s.addNotes(notes);
  return s;
};
const divider = (section, n, en, title, sub, notes) => {
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: section });
  FRAME(s);
  T(s, n, { x: RX(2), y: 1.6, w: 2, h: 0.9, fontSize: 54, bold: true, color: K.copper, align: 'right' });
  T(s, en, { x: RX(10), y: 2.55, w: 10, h: 0.5, fontSize: 18, color: K.copper, align: 'right', fontFace: 'Noto Sans', rtlMode: false, charSpacing: 4 });
  T(s, title, { x: RX(11.5), y: 3.1, w: 11.5, h: 1.2, fontSize: 44, bold: true, color: K.sand, align: 'right' });
  T(s, sub, { x: RX(11.5), y: 4.4, w: 11.5, h: 0.8, fontSize: 20, color: 'C9D6D8', align: 'right' });
  s.addImage({ path: path.join(here, 'assets/logo-light.png'), x: M, y: 6.15, w: 1.54, h: 0.7 });
  if (notes) s.addNotes(notes);
  return s;
};

// ── 1. الغلاف ──
pres.addSection({ title: 'الافتتاح' });
{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'الافتتاح' });
  FRAME(s);
  s.addImage({ path: path.join(here, 'assets/logo-light.png'), x: RX(2.42), y: 0.95, w: 2.42, h: 1.1 });
  T(s, 'برنامج إدارة المشروعات للقادة · ورشة تعريفية', { x: RX(10), y: 2.55, w: 10, h: 0.45, fontSize: 16, color: K.copper, bold: true });
  T(s, 'الأطر الثلاثة', { x: RX(10), y: 3.0, w: 10, h: 1.1, fontSize: 60, bold: true, color: K.sand });
  T(s, 'من التنفيذ إلى الأثر: كيف يعيد المعلم والأثر والقيادة بناء معادلة الإنجاز', { x: RX(10.5), y: 4.15, w: 10.5, h: 0.9, fontSize: 22, color: 'C9D6D8' });
  s.addShape(pres.ShapeType.line, { x: RX(1.6), y: 5.35, w: 1.6, h: 0, line: { color: K.gold, width: 2.5 } });
  T(s, 'Milestone · Impact · Leadership', { x: RX(10), y: 5.55, w: 10, h: 0.4, fontSize: 14, color: K.copper, fontFace: 'Noto Sans', rtlMode: false, align: 'right', charSpacing: 3 });
  s.addNotes('افتتاح الورشة: نعرّف بالبرنامج في جملة، ثم نقول إن اليوم عن الأطر الثلاثة بشكل عام لا عن أدواتها التفصيلية. المدة المقترحة للعرض 45 إلى 60 دقيقة مع النقاش.');
}

// ── 2. لماذا هذه المنهجية ──
{
  const s = content('الافتتاح', 'لماذا هذه المنهجية؟', 'التوسّع لا يعني بالضرورة قيمة متحققة',
    'نبدأ من المشكلة: المؤسسات تتوسع في المشاريع والبرامج والمحافظ، لكن التوسع لا ينعكس دائمًا على القيمة. ثلاث نقلات تلخص ما تفعله المنهجية. اطلب من الحضور مثالًا من واقعهم على مشروع أُنجز في موعده ولم يغيّر شيئًا.');
  T(s, 'تشهد المؤسسات توسّعًا متزايدًا في المشاريع والبرامج والمحافظ وبرامج التحوّل، لكن هذا التوسّع لا ينعكس دائمًا على القيمة التي تتحقق. المنهجية تعيد بناء العلاقة بين التنفيذ والأثر والقيادة في ثلاث نقلات.', { x: RX(12.1), y: 1.75, w: 12.1, h: 1.0, fontSize: 15, color: K.muted });
  const shifts = [
    ['01', 'قيادة التحوّل وصناعة الأثر', 'من قراراتٍ تشغيلية متفرّقة إلى قيادةٍ متكاملة تُحدث التحوّل.'],
    ['02', 'قياس القيمة وإدارة المنافع', 'من تقاريرَ تروي ما حدث إلى تقاريرَ تُبرز ما تحقّق من قيمة.'],
    ['03', 'تكامل المشروعات والبرامج والمحافظ', 'من مشروعاتٍ منفصلة إلى منظومةٍ مترابطة تُولِّد قيمةً مستدامة.'],
  ];
  const cw = (12.1 - 0.4) / 3;
  shifts.forEach(([n, h, p], i) => {
    const x = W - M - cw - i * (cw + 0.2);
    CARD(s, x, 3.0, cw, 2.9);
    T(s, n, { x: x + cw - 0.3 - 1.2, y: 3.2, w: 1.2, h: 0.7, fontSize: 36, bold: true, color: K.gold, fontFace: 'Noto Sans', rtlMode: false });
    T(s, h, { x: x + 0.3, y: 4.0, w: cw - 0.6, h: 0.8, fontSize: 18, bold: true, color: K.graphite });
    T(s, p, { x: x + 0.3, y: 4.85, w: cw - 0.6, h: 0.9, fontSize: 14, color: K.muted });
  });
}

// ── 3. الأطر الثلاثة ──
{
  const s = content('الافتتاح', 'جوهر المنهجية', 'ثلاثة أطر تعيد بناء معادلة الإنجاز',
    'الشريحة المحورية: الأطر ليست ثلاث أدوات بل ثلاثة أبعاد لرحلة واحدة. المعلم يضبط التنفيذ، والأثر يبرره، والقيادة تحرك الأشخاص ليتحقق ذلك كله. الترتيب في العرض من اليمين: المعلم فالأثر فالقيادة.');
  const fw = [
    ['Milestone', 'إطار المعلم', 'من إدارة الزمن إلى قيادة القيمة', 'يُعيد تعريف المعلم من نقطةٍ زمنية في جدول إلى نقطة قيادةٍ وتحكّم، ويبني حوكمةً فعّالة عبر المشروعات والبرامج والمحافظ.', ['المشروع', 'البرنامج', 'المحفظة', 'نقاط التحكّم']],
    ['Impact', 'إطار الأثر', 'من إثبات الإنجاز إلى قيادة الأثر', 'يقيس القيمة عبر سلسلة خماسية تبدأ بالمخرجات وتنتهي بالأثر المستدام، ليُجيب كل تقرير عن سؤالٍ واحد: ما الذي تغيّر بسببنا؟', ['المخرجات', 'المنافع', 'التحوّل', 'الأثر المستدام']],
    ['Leadership', 'إطار القيادة', 'من إدارة المهام إلى قيادة الأشخاص', 'يُعدّ القائد لقيادة الفرق نحو التحوّل عبر جدارات: الاستجابة المنضبطة، وانتقال العهدة، والتأثير في الاتجاهات، والقيادة الموقفية.', ['الاستجابة', 'العهدة', 'الاتجاهات', 'الموقفية']],
  ];
  const cw = (12.1 - 0.4) / 3;
  fw.forEach(([en, ar, tag, p, chips], i) => {
    const x = W - M - cw - i * (cw + 0.2);
    CARD(s, x, 1.8, cw, 4.55);
    T(s, en, { x: x + 0.3, y: 2.0, w: cw - 0.6, h: 0.4, fontSize: 13, color: K.gold, fontFace: 'Noto Sans', rtlMode: false, align: 'right', charSpacing: 3 });
    T(s, ar, { x: x + 0.3, y: 2.38, w: cw - 0.6, h: 0.55, fontSize: 22, bold: true, color: K.graphite });
    T(s, tag, { x: x + 0.3, y: 2.95, w: cw - 0.6, h: 0.7, fontSize: 14, bold: true, color: K.goldDeep });
    T(s, p, { x: x + 0.3, y: 3.7, w: cw - 0.6, h: 1.45, fontSize: 13, color: K.muted });
    chips.forEach((c, j) => {
      const chw = (cw - 0.6 - 0.3) / 2, chx = x + 0.3 + (j % 2 === 0 ? chw + 0.3 : 0), chy = 5.25 + Math.floor(j / 2) * 0.5;
      s.addShape(pres.ShapeType.roundRect, { x: chx, y: chy, w: chw, h: 0.4, rectRadius: 0.2, fill: { color: K.sand }, line: { color: K.sand, width: 0 } });
      T(s, c, { x: chx, y: chy, w: chw, h: 0.4, fontSize: 11, bold: true, color: K.graphite, align: 'center', valign: 'middle' });
    });
  });
  T(s, 'تكامل الأطر الثلاثة يحوّل إدارة المشاريع من متابعة تنفيذية إلى قيادة للأثر والتحوّل.', { x: RX(12.1), y: 6.5, w: 12.1, h: 0.4, fontSize: 14, bold: true, color: K.goldDeep });
}

// ── الإطار الأول: المعلم ──
pres.addSection({ title: 'إطار المعلم' });
divider('إطار المعلم', '01', 'MILESTONE FRAMEWORK', 'إطار المعلم', 'من إدارة الزمن إلى قيادة القيمة',
  'الإطار الأول هو الأساس: لا قياس للأثر ولا قيادة للتحوّل دون منظومة تحكّم واضحة في التنفيذ.');
{
  const s = content('إطار المعلم', 'إطار المعلم', 'إعادة تعريف المعلم: من نقطة زمنية إلى نقطة قيادة وتحكّم',
    'المعلم في الجدولة التقليدية تاريخ يُرجى. في هذا الإطار نقطة مدتها صفر لها خمسة أبعاد: قرار، وتوقيت، وتحكم، وقياس، وقيمة. المعلم الذي ينقصه بعد يسقط من نقطة تحكم إلى موعد. اربط بالتجربة: معلم «تسليم النظام» بلا معيار يُفحص.');
  const dims = [['قرار', 'من يقرر عند المعلم وماذا'], ['توقيت', 'متى تُطرح الأسئلة بدل أن تتقادم'], ['تحكّم', 'حدود التحمّل والتصعيد'], ['قياس', 'معيار يُفحص لا تاريخ يُرجى'], ['قيمة', 'منفعة يخدمها المعلم']];
  const cw = (12.1 - 0.8) / 5;
  dims.forEach(([h, p], i) => {
    const x = W - M - cw - i * (cw + 0.2);
    CARD(s, x, 1.9, cw, 1.75);
    DIAMOND(s, x + cw - 0.3 - 0.16, 2.12, 0.16);
    T(s, h, { x: x + 0.25, y: 2.4, w: cw - 0.5, h: 0.5, fontSize: 20, bold: true, color: K.graphite });
    T(s, p, { x: x + 0.25, y: 2.9, w: cw - 0.5, h: 0.65, fontSize: 12, color: K.muted });
  });
  T(s, 'حلقة صناعة القرار عند كل معلم', { x: RX(12.1), y: 4.0, w: 12.1, h: 0.4, fontSize: 16, bold: true, color: K.graphite });
  const loop = ['سؤال', 'قراءة', 'قرار موثّق'];
  const lw = 2.4;
  loop.forEach((t, i) => {
    const x = W - M - lw - i * (lw + 0.9);
    s.addShape(pres.ShapeType.roundRect, { x, y: 4.5, w: lw, h: 0.7, rectRadius: 0.35, fill: { color: K.graphite }, line: { color: K.graphite, width: 0 } });
    T(s, t, { x, y: 4.5, w: lw, h: 0.7, fontSize: 16, bold: true, color: K.sand, align: 'center', valign: 'middle' });
    if (i < loop.length - 1) s.addShape(pres.ShapeType.leftArrow, { x: x - 0.75, y: 4.67, w: 0.6, h: 0.36, fill: { color: K.gold }, line: { color: K.gold, width: 0 } });
  });
  T(s, 'المعلم هو البنية التحتية لهذه الحلقة؛ بدونه تصبح القرارات عشوائية التوقيت ومبنية على معلومات متقادمة.', { x: RX(12.1), y: 5.45, w: 12.1, h: 0.5, fontSize: 14, color: K.goldDeep, bold: true });
  T(s, 'أربعة أنواع يحتاجها كل مشروع: تعاقدية، وتقنية، وحوكمية، وقيمة. الاقتصار على المعالم التقنية أشهر أخطاء الجدولة.', { x: RX(12.1), y: 6.0, w: 12.1, h: 0.5, fontSize: 13, color: K.muted });
}
{
  const s = content('إطار المعلم', 'إطار المعلم', 'لكل طبقة معلمها: المشروع والبرنامج والمحفظة',
    'الطبقات الثلاث: التحكم العملي في المشروع، والتكامل وخريطة المنافع في البرنامج، والقرار الاستراتيجي والمفاضلة في المحفظة. اللافت للحضور: عدد المبادرات الموقفة عند معالم المراجعة مؤشر صحة لا فشل.');
  const layers = [
    ['المحفظة', 'قرار استراتيجي', 'المبادرات تُدار وحدةً واحدة لتحقيق الاستراتيجية؛ معالم المراجعة تعيد التوجيه أو توقف ما لا يستحق الاستمرار.'],
    ['البرنامج', 'تكامل ومنافع', 'مشاريع مترابطة تُدار معًا لمنافع لا تتحقق منفردة؛ المعلم هنا نقطة تكامل وخريطة منافع.'],
    ['المشروع', 'تحكّم عملي', 'مخرجات محددة في نطاق وزمن وتكلفة؛ المعلم بوابة مرحلة ونقطة قياس وتحقق.'],
  ];
  layers.forEach(([h, tag, p], i) => {
    const y = 1.85 + i * 1.35, x = RX(12.1), w = 12.1;
    CARD(s, x, y, w, 1.15);
    s.addShape(pres.ShapeType.roundRect, { x: x + w - 0.3 - 2.3, y: y + 0.25, w: 2.3, h: 0.65, rectRadius: 0.1, fill: { color: i === 0 ? K.graphite : i === 1 ? K.slate : K.gold }, line: { width: 0, color: K.graphite } });
    T(s, h, { x: x + w - 0.3 - 2.3, y: y + 0.25, w: 2.3, h: 0.65, fontSize: 18, bold: true, color: K.sand, align: 'center', valign: 'middle' });
    T(s, tag, { x: x + 0.3, y: y + 0.18, w: w - 3.2, h: 0.4, fontSize: 15, bold: true, color: K.goldDeep });
    T(s, p, { x: x + 0.3, y: y + 0.58, w: w - 3.2, h: 0.5, fontSize: 13, color: K.muted });
  });
  T(s, 'المشروع الناجح في محفظة خاطئة نجاح محلي وخسارة مؤسسية. والمعالم جسور تصعد عبرها القيمة من التنفيذ إلى الأثر الاستراتيجي.', { x: RX(12.1), y: 6.05, w: 12.1, h: 0.6, fontSize: 14, bold: true, color: K.goldDeep });
}
const messages = (section, eyebrow, list, notes) => {
  const s = content(section, eyebrow, 'خمس رسائل جوهرية', notes);
  list.forEach((m, i) => {
    const y = 1.85 + i * 0.95, x = RX(12.1), w = 12.1;
    CARD(s, x, y, w, 0.8);
    s.addShape(pres.ShapeType.ellipse, { x: x + w - 0.25 - 0.55, y: y + 0.125, w: 0.55, h: 0.55, fill: { color: K.gold }, line: { width: 0, color: K.gold } });
    T(s, String(i + 1), { x: x + w - 0.25 - 0.55, y: y + 0.125, w: 0.55, h: 0.55, fontSize: 16, bold: true, color: K.white, align: 'center', valign: 'middle', fontFace: 'Noto Sans', rtlMode: false });
    T(s, m, { x: x + 0.3, y: y + 0.12, w: w - 1.3, h: 0.6, fontSize: 15, color: K.graphite, valign: 'middle' });
  });
  return s;
};
messages('إطار المعلم', 'إطار المعلم', [
  'لا مدرسة أفضل بإطلاق، بل مستخلص قيادي يُنتقى بوعي من المدارس العالمية.',
  'إدارة المشاريع نموذج فكري لصناعة القرار، لا علم متابعة للأنشطة.',
  'المعلم نقطة قيادة وتحكّم: قرار وتوقيت وتحكّم وقياس وقيمة.',
  'لكل طبقة معلمها: تحكّم عملي في المشروع، وتكامل في البرنامج، وقرار استراتيجي في المحفظة.',
  'المعالم جسور تصعد عبرها القيمة من التنفيذ إلى الأثر الاستراتيجي.',
], 'اختم الإطار الأول بالرسائل الخمس واقرأها كما هي. ثم الجسر إلى الإطار الثاني: المعلم يضبط التنفيذ، لكن ما الذي يتغيّر بسببه؟');

// ── الإطار الثاني: الأثر ──
pres.addSection({ title: 'إطار الأثر' });
divider('إطار الأثر', '02', 'IMPACT FRAMEWORK', 'إطار الأثر', 'من إثبات الإنجاز إلى قيادة الأثر',
  'الإطار الثاني يجيب عن سؤال واحد في كل تقرير: ما الذي تغيّر بسببنا؟');
{
  const s = content('إطار الأثر', 'إطار الأثر', 'سلسلة القيمة الخماسية: من المخرجات إلى الأثر المستدام',
    'اقرأ السلسلة من اليمين: المخرجات ما يسلّمه المشروع، النتائج المباشرة التغيير الأولي في السلوك أو الاستخدام، المنافع التحسن المقيس، الأثر الأوسع التحول في المنظومة، الأثر المستدام الباقي بعد انتهاء التمويل. نقطتان: المساءلة تصعد، والإسناد يضعف كلما صعدنا فتقوى لغة المساهمة.');
  const chain = [['المخرجات', 'ما يسلّمه المشروع فعليًا عند إغلاقه'], ['النتائج\nالمباشرة', 'التغيير الأولي في السلوك أو الاستخدام'], ['المنافع', 'التحسن المقيس الذي يعود على المؤسسة أو المستفيد'], ['الأثر\nالأوسع', 'التحوّل في المنظومة أو المجتمع'], ['الأثر\nالمستدام', 'التغيير الباقي بعد انتهاء التدخل وتمويله']];
  const cw = 12.1 / 5, shades = [K.slate, '1A4F5D', '275C68', K.goldDeep, K.gold];
  chain.forEach(([h, p], i) => {
    const x = W - M - cw * (i + 1);
    s.addShape(pres.ShapeType.chevron, { x: x + 0.02, y: 2.0, w: cw - 0.04, h: 1.1, flipH: true, fill: { color: shades[i] }, line: { width: 0, color: shades[i] } });
    T(s, h, { x: x + 0.42, y: 2.0, w: cw - 0.7, h: 1.1, fontSize: 13, bold: true, color: K.sand, align: 'center', valign: 'middle' });
    T(s, p, { x: x + 0.15, y: 3.25, w: cw - 0.3, h: 0.9, fontSize: 12, color: K.muted, align: 'center' });
  });
  CARD(s, RX(12.1), 4.45, 12.1, 0.85, { fill: K.sand, line: K.sand });
  T(s, 'المساءلة تصعد في السلسلة: نسلّم المخرجات، لكن الاستثمار لا يُبرَّر إلا بالمنافع والأثر المستدام.', { x: RX(11.6), y: 4.45, w: 11.6, h: 0.85, fontSize: 15, bold: true, color: K.graphite, valign: 'middle' });
  CARD(s, RX(12.1), 5.5, 12.1, 0.85, { fill: K.sand, line: K.sand });
  T(s, 'كلما صعدنا في السلسلة ضعف الإسناد وقويت لغة المساهمة؛ وادعاء الإسناد في أعلى السلسلة يُفقد التقرير مصداقيته.', { x: RX(11.6), y: 5.5, w: 11.6, h: 0.85, fontSize: 15, bold: true, color: K.graphite, valign: 'middle' });
}
{
  const s = content('إطار الأثر', 'إطار الأثر', 'من تقارير الإنجاز إلى تقارير الأثر',
    'قارن العمودين: تقرير الإنجاز يروي ما حدث ويعدّ المخرجات ويُدّعى في الختام؛ تقرير الأثر يجيب عن سؤال التغيير بمنفعة لها مالك ومؤشر وخط أساس وموعد، ويُصمَّم من اليوم الأول. ثم الأبعاد الخمسة للأثر. مثال: انخفاض البطالة 3% مع افتتاح مصنعين: اللغة الأمينة لغة مساهمة.');
  const cols = [
    ['تقرير الأثر', K.graphite, K.sand, ['يجيب عن سؤال واحد: ما الذي تغيّر بسببنا؟', 'كل منفعة لها مالك ومؤشر وخط أساس وموعد', 'يُصمَّم من اليوم الأول ويُثبَت بالدليل', 'يذكر المنافع السلبية والآثار غير المقصودة']],
    ['تقرير الإنجاز', K.white, K.graphite, ['يروي ما حدث ويعدّ المخرجات والأنشطة', 'وعود إنشائية بلا مؤشر ولا خط أساس', 'يُدّعى في الختام حين تتضح النتائج', 'ترويجي: لا منافع سلبية ولا آثار غير مقصودة']],
  ];
  const cw = (12.1 - 0.3) / 2;
  cols.forEach(([h, bg, fg, items], i) => {
    const x = W - M - cw - i * (cw + 0.3);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.85, w: cw, h: 3.0, rectRadius: 0.08, fill: { color: bg }, line: { color: i === 0 ? bg : K.line, width: 0.75 } });
    T(s, h, { x: x + 0.3, y: 2.0, w: cw - 0.6, h: 0.5, fontSize: 20, bold: true, color: i === 0 ? K.copper : K.goldDeep });
    items.forEach((it, j) => {
      DIAMOND(s, x + cw - 0.3 - 0.12, 2.68 + j * 0.56, 0.12, i === 0 ? K.copper : K.gold);
      T(s, it, { x: x + 0.3, y: 2.55 + j * 0.56, w: cw - 0.85, h: 0.5, fontSize: 13, color: fg, valign: 'middle' });
    });
  });
  T(s, 'أبعاد الأثر الخمسة التي لا تنفصل', { x: RX(12.1), y: 5.1, w: 12.1, h: 0.4, fontSize: 15, bold: true, color: K.graphite });
  const dims = ['مقصود', 'مقيس', 'منسوب بأمانة', 'مملوك', 'مستدام'];
  const pw = (12.1 - 0.8) / 5;
  dims.forEach((d, i) => {
    const x = W - M - pw - i * (pw + 0.2);
    s.addShape(pres.ShapeType.roundRect, { x, y: 5.6, w: pw, h: 0.6, rectRadius: 0.3, fill: { color: K.sand }, line: { width: 0, color: K.sand } });
    T(s, d, { x, y: 5.6, w: pw, h: 0.6, fontSize: 14, bold: true, color: K.graphite, align: 'center', valign: 'middle' });
  });
  T(s, 'الأثر لا يُدّعى في الختام، بل يُصمَّم من اليوم الأول ويُثبَت بالدليل.', { x: RX(12.1), y: 6.35, w: 12.1, h: 0.4, fontSize: 14, bold: true, color: K.goldDeep });
}
messages('إطار الأثر', 'إطار الأثر', [
  'لا نموذج قياس أفضل بإطلاق، بل مستخلص يُنتقى بوعي من مدارس المنافع والأثر.',
  'الأثر لا يُقاس بما ننجزه بل بما يتغيّر بسببه، والتقرير يجيب عن سؤال التغيير.',
  'الأثر مقصود ومقيس ومنسوب بأمانة ومملوك ومستدام: خمسة أبعاد لا تنفصل.',
  'لكل طبقة أثرها: نتيجة في المشروع، ومنفعة مملوكة في البرنامج، ومفاضلة بالأدلة في المحفظة.',
  'المعالم تبقى الجسور، وحمولتها الأدلة الصاعدة من المخرجات إلى الأثر المستدام.',
], 'الرسائل الخمس للإطار الثاني. الجسر إلى الثالث: المعلم يضبط التنفيذ، والأثر يبرره، فمن يقودهما؟');

// ── الإطار الثالث: القيادة ──
pres.addSection({ title: 'إطار القيادة' });
divider('إطار القيادة', '03', 'LEADERSHIP FRAMEWORK', 'إطار القيادة', 'من إدارة المهام إلى قيادة الأشخاص',
  'المشاريع لا تقودها المنهجيات، يقودها أشخاص يمتلكون الجدارات.');
{
  const s = content('إطار القيادة', 'إطار القيادة', 'الجدارات الست لقائد المشاريع',
    'جدارتان من اجتهاد المنهجية: الاستجابة المنضبطة وانتقال العهدة. وأربع جدارات للتأثير في الاتجاهات: قيادة الذات، وقيادة الفريق، والقيادة التحويلية والتبادلية، والقيادة نحو الأعلى وعبر الحدود. التميز في اتجاه واحد أشهر أسباب تعثر قادة المشاريع.');
  const comps = [
    ['الاستجابة المنضبطة', 'تلقٍّ فتفهّم فأولوية فتحرّك فإغلاق؛ والتفهّم يتسع للاعتراض المسبّب قبل التحرّك.', K.gold],
    ['انتقال العهدة', 'تسليم موثّق وتتابع ورقابة حتى استقلال المتسلّم وتحقق الأثر؛ مسؤولية لا ورقة.', K.gold],
    ['قيادة الذات', 'وعي بالذات، وضبط الانفعال، ومرونة تحت الضغط: من لا يقود نفسه لا يقود غيره.', K.slate],
    ['قيادة الفريق', 'تمكين وتفويض واضح وأمان نفسي: فريق يرفع المشكلة مبكرًا وينجز بلا وصاية.', K.slate],
    ['القيادة التحويلية والتبادلية', 'رؤية ملهمة وكسب المقاومين وتوقعات واضحة ومكافأة عادلة: من الامتثال إلى التبنّي.', K.slate],
    ['القيادة نحو الأعلى وعبر الحدود', 'إقناع الإدارة العليا وكسب الإدارات الموازية وحل تعارض الموارد: تحريك من لا سلطة لك عليهم.', K.slate],
  ];
  const cw = (12.1 - 0.4) / 3, ch = 2.05;
  comps.forEach(([h, p, col], i) => {
    const x = W - M - cw - (i % 3) * (cw + 0.2), y = 1.85 + Math.floor(i / 3) * (ch + 0.25);
    CARD(s, x, y, cw, ch);
    s.addShape(pres.ShapeType.ellipse, { x: x + cw - 0.3 - 0.5, y: y + 0.25, w: 0.5, h: 0.5, fill: { color: col }, line: { width: 0, color: col } });
    T(s, String(i + 1), { x: x + cw - 0.3 - 0.5, y: y + 0.25, w: 0.5, h: 0.5, fontSize: 14, bold: true, color: K.white, align: 'center', valign: 'middle', fontFace: 'Noto Sans', rtlMode: false });
    T(s, h, { x: x + 0.3, y: y + 0.2, w: cw - 1.25, h: 0.7, fontSize: 14, bold: true, color: K.graphite, valign: 'middle' });
    T(s, p, { x: x + 0.3, y: y + 0.95, w: cw - 0.6, h: 1.0, fontSize: 12, color: K.muted });
  });
  T(s, 'التميّز في اتجاه واحد أشهر أسباب تعثّر قادة المشاريع.', { x: RX(12.1), y: 6.45, w: 12.1, h: 0.4, fontSize: 14, bold: true, color: K.goldDeep });
}
{
  const s = content('إطار القيادة', 'إطار القيادة', 'سلسلة الاستجابة الخماسية وحلقة التسليم والتسلّم',
    'السلسلة من اليمين: تلقي الأمر بدقة وإقرار الاستلام، التفهّم قبل التحرّك، الأولوية بين المهام والموارد، التحرّك المنضبط بتفويض واضح، الإغلاق بإبلاغ الإنجاز وتوثيق التعلم. السرعة الحقيقية تُكسب في التلقي والتفهّم لا في ضغط التحرّك. ثم العهدة: ما يُسلَّم بلا تتابع ورقابة يعود مشكلة أكبر.');
  const chain = [['تلقّي الأمر', 'استقبال التوجيه بدقة وإقرار الاستلام'], ['التفهّم', 'تحليل المقصود والسياق قبل التحرّك'], ['الأولوية', 'موقع المهمة بين الأولويات ومواردها'], ['التحرّك', 'تنفيذ سريع منضبط بتفويض واضح'], ['الإغلاق', 'إبلاغ الإنجاز وتوثيق التعلّم']];
  const cw = 12.1 / 5, shades = [K.slate, '1A4F5D', '275C68', K.goldDeep, K.gold];
  chain.forEach(([h, p], i) => {
    const x = W - M - cw * (i + 1);
    s.addShape(pres.ShapeType.chevron, { x: x + 0.02, y: 1.95, w: cw - 0.04, h: 1.0, flipH: true, fill: { color: shades[i] }, line: { width: 0, color: shades[i] } });
    T(s, h, { x: x + 0.42, y: 1.95, w: cw - 0.7, h: 1.0, fontSize: 13, bold: true, color: K.sand, align: 'center', valign: 'middle' });
    T(s, p, { x: x + 0.15, y: 3.05, w: cw - 0.3, h: 0.8, fontSize: 12, color: K.muted, align: 'center' });
  });
  T(s, 'السرعة بلا تفهّم تهوّر، والتفهّم بلا تحرّك تعطيل؛ الجدارة في المسار كاملًا لا في مرحلة منه.', { x: RX(12.1), y: 3.95, w: 12.1, h: 0.45, fontSize: 14, bold: true, color: K.goldDeep });
  CARD(s, RX(12.1), 4.65, 12.1, 1.75, { fill: K.graphite, line: K.graphite });
  T(s, 'حلقة التسليم والتسلّم: العهدة مسؤولية لا ورقة', { x: RX(11.6), y: 4.8, w: 11.6, h: 0.5, fontSize: 17, bold: true, color: K.copper });
  T(s, 'تسليم موثّق، ثم تتابع ورقابة، حتى استقلال المتسلّم وتحقق الأثر. مسؤوليتان متقابلتان: المسلِّم لا يبرأ بالتوقيع، والمتسلِّم لا يبرأ بالاستلام. وما يُسلَّم بلا تتابع ورقابة يعود مشكلة أكبر بعد حين.', { x: RX(11.6), y: 5.3, w: 11.6, h: 1.0, fontSize: 13, color: 'C9D6D8' });
}
messages('إطار القيادة', 'إطار القيادة', [
  'لا نمط قياديًا أفضل بإطلاق، لكن الأبحاث ترجّح سلوكيات بعينها: إلهام، واهتمام بكل فرد، ووضوح توقعات، وأمان نفسي.',
  'الاستجابة المنضبطة مسار: تلقٍّ فتفهّم فأولوية فتحرّك فإغلاق، والتفهّم يتسع للاعتراض المسبّب قبل التحرّك.',
  'انتقال العهدة مسؤولية لا ورقة: تسليم موثّق وتتابع ورقابة حتى استقلال المتسلّم وتحقق الأثر.',
  'لكل طبقة قيادتها: فريق آمن في المشروع، وأصحاب مصلحة يصطفّون في البرنامج، ومؤسسة تتحوّل في المحفظة.',
  'القيادة تُقرأ في الفريق لا في القائد: توجيه ومواءمة والتزام، والأدوات وسائل لا غايات.',
], 'الرسائل الخمس للإطار الثالث. السؤال للحضور: بماذا تعرف أن قيادتك نجحت؟ الجواب: بما يظهر في فريقك من توجيه ومواءمة والتزام.');

// ── التكامل والبرنامج والختام ──
pres.addSection({ title: 'التكامل والختام' });
{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'التكامل والختام' });
  FRAME(s);
  T(s, 'النموذج المتكامل', { x: RX(10), y: 0.7, w: 10, h: 0.45, fontSize: 14, bold: true, color: K.copper });
  T(s, 'ثلاثة أطر، رحلة واحدة', { x: RX(10), y: 1.1, w: 10, h: 0.9, fontSize: 40, bold: true, color: K.sand });
  const parts = [['إطار المعلم', 'إنجاز منظّم وتنفيذ بوضوح', 'يضبط'], ['إطار الأثر', 'قيمة محققة وأثر مستدام', 'يبرّر'], ['إطار القيادة', 'توجيه وترابط واستجابة فعّالة', 'يقود']];
  const cw = (12.1 - 0.5) / 3;
  parts.forEach(([h, p, v], i) => {
    const x = W - M - cw - i * (cw + 0.25);
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.35, w: cw, h: 2.1, rectRadius: 0.08, fill: { color: K.slate }, line: { color: K.copper, width: 0.75, transparency: 50 } });
    T(s, v, { x: x + 0.3, y: 2.55, w: cw - 0.6, h: 0.45, fontSize: 13, bold: true, color: K.copper });
    T(s, h, { x: x + 0.3, y: 3.0, w: cw - 0.6, h: 0.6, fontSize: 24, bold: true, color: K.sand });
    T(s, p, { x: x + 0.3, y: 3.7, w: cw - 0.6, h: 0.9, fontSize: 15, color: 'C9D6D8' });
  });
  T(s, 'المشاريع لا تقودها المنهجيات، يقودها أشخاص يمتلكون الجدارات. وحين تتكامل الإدارة والقيادة والقيمة، تتحوّل المشاريع إلى منظومة أثر مؤسسي مستدام.', { x: RX(12.1), y: 4.85, w: 12.1, h: 1.1, fontSize: 18, bold: true, color: K.copper });
  s.addNotes('شريحة التكامل: المعلم يضبط، والأثر يبرّر، والقيادة تقود. اقرأ الاقتباس كاملًا ثم اسأل: أين يقف مشروعكم اليوم في كل بُعد؟');
}
{
  const s = content('التكامل والختام', 'من المعرفة إلى الممارسة', 'كيف يتحوّل هذا إلى رحلة في البرنامج',
    'الربط بالبرنامج: قياس مبدئي يحدد مستوى كل مشارك في كل إطار على حدة (تأسيسي، متوسط، احترافي)، ثم رحلة في ثلاثة أطوار على المنصة. للمهتمين: leaders.sunkvalue.com.');
  const phases = [
    ['القبول', ['ملفك في دقيقتين', 'قياس مبدئي في 12 دقيقة يحدد مستواك في كل إطار', 'اعتماد المسار خلال 3 أيام عمل']],
    ['التأهيل', ['4 أيام تدريبية على الأطر الثلاثة', '4 أسابيع تطبيق على مشروع من عملك', 'استشارة وتوجيه قيادي']],
    ['الأثر', ['دعم وتمكين 3 أشهر', 'قياس ما تغيّر فعلًا', 'تقرير لك ولجهتك وشهادة يمكن التحقق منها']],
  ];
  const cw = (12.1 - 0.4) / 3;
  phases.forEach(([h, items], i) => {
    const x = W - M - cw - i * (cw + 0.2);
    CARD(s, x, 1.85, cw, 3.4);
    T(s, `0${i + 1}`, { x: x + cw - 0.3 - 1.0, y: 2.05, w: 1.0, h: 0.6, fontSize: 30, bold: true, color: K.gold, fontFace: 'Noto Sans', rtlMode: false });
    T(s, h, { x: x + 0.3, y: 2.7, w: cw - 0.6, h: 0.5, fontSize: 22, bold: true, color: K.graphite });
    items.forEach((it, j) => {
      DIAMOND(s, x + cw - 0.3 - 0.12, 3.42 + j * 0.6, 0.12);
      T(s, it, { x: x + 0.3, y: 3.3 + j * 0.6, w: cw - 0.85, h: 0.55, fontSize: 12.5, color: K.muted, valign: 'middle' });
    });
  });
  const lv = ['تأسيسي', 'متوسط', 'احترافي'];
  T(s, 'ثلاثة مستويات في كل إطار على حدة، فتبدأ من حيث أنت فعلًا:', { x: RX(12.1), y: 5.5, w: 12.1, h: 0.4, fontSize: 14, bold: true, color: K.graphite });
  lv.forEach((l, i) => {
    const pw = 2.2, x = W - M - pw - i * (pw + 0.2);
    s.addShape(pres.ShapeType.roundRect, { x, y: 5.95, w: pw, h: 0.55, rectRadius: 0.28, fill: { color: i === 2 ? K.graphite : K.sand }, line: { width: 0, color: K.sand } });
    T(s, l, { x, y: 5.95, w: pw, h: 0.55, fontSize: 14, bold: true, color: i === 2 ? K.sand : K.graphite, align: 'center', valign: 'middle' });
  });
}
{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'التكامل والختام' });
  FRAME(s);
  T(s, 'سؤال الختام', { x: RX(10), y: 1.9, w: 10, h: 0.45, fontSize: 14, bold: true, color: K.copper });
  T(s, 'ما الممارسة الواحدة التي ستبدأها غدًا من هذه الأطر؟', { x: RX(11.5), y: 2.4, w: 11.5, h: 1.8, fontSize: 40, bold: true, color: K.sand });
  s.addShape(pres.ShapeType.line, { x: RX(1.6), y: 4.5, w: 1.6, h: 0, line: { color: K.gold, width: 2.5 } });
  T(s, 'شكرًا لكم · النقاش مفتوح', { x: RX(10), y: 4.75, w: 10, h: 0.5, fontSize: 18, color: 'C9D6D8' });
  T(s, 'leaders.sunkvalue.com', { x: RX(10), y: 5.3, w: 10, h: 0.5, fontSize: 18, color: K.copper, fontFace: 'Noto Sans', rtlMode: false, align: 'right', charSpacing: 2 });
  s.addImage({ path: path.join(here, 'assets/logo-light.png'), x: M, y: 6.15, w: 1.54, h: 0.7 });
  s.addNotes('اختم بالسؤال نفسه الذي يختم به كل إطار في الكتيب، واطلب من كل مشارك جملة واحدة. ثم اذكر رابط المنصة لمن يريد البدء.');
}

await pres.writeFile({ fileName: OUT });
await applyTheme(OUT, THEME);
console.log('✓', OUT);
