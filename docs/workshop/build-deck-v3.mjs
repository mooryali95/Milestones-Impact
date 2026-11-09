// ورشة الأطر الثلاثة (v3، 2026-11-09): 90 دقيقة، خمسة فصول، مثال واحد يعبر الأطر الثلاثة. القوالب والهوية من v2.
// المحتوى من الكتيب v3 (supabase/content/handbook/v3): الأبواب والأهداف ومؤشرات الإتقان وسلاسل كل إطار.
// التشغيل: npm i pptxgenjs@3.12.0 ثم NODE_PATH=<node_modules> node build-deck-v3.mjs [المخرج.pptx]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');
const here = path.dirname(new URL(import.meta.url).pathname);
const { applyTheme } = require(path.join(here, 'apply-theme.js'));
const OUT = process.argv[2] || path.join(here, 'الأطر-الثلاثة-ورشة-v3.pptx');

// ── الهوية ──
const K = { graphite: '0B272F', ink: '061318', slate: '12414E', gold: 'A97A2E', copper: 'C79A4B', mist: 'EAF0F0', sand: 'EFE7D8', white: 'FFFFFF', muted: '4A6A72', goldDeep: '8E6524', sandDeep: 'E3D7C0', dim: 'C9D6D8' };
const THEME = {
  name: 'Milestone Impact', headFontFace: 'Almarai', bodyFontFace: 'Almarai',
  colors: { dk1: K.graphite, lt1: K.white, dk2: K.slate, lt2: K.sand, accent1: K.gold, accent2: K.copper, accent3: K.muted, accent4: K.mist, accent5: K.ink, accent6: K.goldDeep, hlink: K.gold, folHlink: K.goldDeep },
};
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.lang = 'ar-SA'; pres.rtlMode = true;
pres.title = 'ورشة الأطر الثلاثة'; pres.author = 'Milestone Impact'; pres.company = 'Milestone Impact';
const W = 13.333, H = 7.5, M = 0.7;
const RX = (w, right = M) => W - right - w;
const LATIN = 'Cormorant Garamond';

const T = (s, text, o = {}) => s.addText(text, { isTextBox: true, rtlMode: true, lang: 'ar-SA', align: 'right', valign: 'top', margin: 0, fontSize: 16, color: K.graphite, ...o });
const EN = (s, text, o = {}) => s.addText(text, { isTextBox: true, rtlMode: false, lang: 'en-US', align: 'right', valign: 'top', margin: 0, fontSize: 16, fontFace: LATIN, charSpacing: 4, color: K.copper, ...o });
const DIAMOND = (s, x, y, size, color = K.gold, outline = false, transparency = 0) => s.addShape(pres.ShapeType.diamond, { x, y, w: size, h: size, fill: outline ? { type: 'none' } : { color }, line: { color, width: outline ? 1 : 0, transparency } });
const RING = (s, x, y, size, color = K.gold, width = 1, transparency = 0) => s.addShape(pres.ShapeType.ellipse, { x, y, w: size, h: size, fill: { type: 'none' }, line: { color, width, transparency } });
const FRAME = (s, color = K.copper) => s.addShape(pres.ShapeType.rect, { x: 0.34, y: 0.34, w: W - 0.68, h: H - 0.68, fill: { type: 'none' }, line: { color, width: 0.75, transparency: 45 } });
const LINE = (s, x, y, w, color = K.gold, width = 1.5, transparency = 0) => s.addShape(pres.ShapeType.line, { x, y, w, h: 0, line: { color, width, transparency } });
const LOGO = (s, light, x, y, h = 0.62) => s.addImage({ path: path.join(here, light ? 'assets/logo-light.png' : 'assets/logo-dark.png'), x, y, w: h * 2.2, h });

// ── التخطيطان ──
const footer = 'Milestone Impact · ورشة الأطر الثلاثة';
pres.defineSlideMaster({ title: 'DARK', background: { color: K.graphite }, objects: [
  { text: { text: footer, options: { x: RX(5), y: 7.02, w: 5, h: 0.3, fontSize: 11, color: K.copper, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0 } } },
], slideNumber: { x: M, y: 7.02, w: 0.6, h: 0.3, fontSize: 11, color: K.copper, align: 'left', fontFace: LATIN } });
pres.defineSlideMaster({ title: 'SAND', background: { color: K.sand }, objects: [
  { text: { text: footer, options: { x: RX(5), y: 7.02, w: 5, h: 0.3, fontSize: 11, color: K.goldDeep, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0 } } },
], slideNumber: { x: M, y: 7.02, w: 0.6, h: 0.3, fontSize: 11, color: K.goldDeep, align: 'left', fontFace: LATIN } });

// رأس موحّد للشرائح الفاتحة: علامة + سطر علوي + عنوان في الموضع نفسه دائمًا
const head = (s, eyebrow, title) => {
  DIAMOND(s, W - M - 0.16, 0.72, 0.16);
  T(s, eyebrow, { x: RX(8, M + 0.32), y: 0.62, w: 8, h: 0.36, fontSize: 12.5, bold: true, color: K.goldDeep });
  T(s, title, { x: RX(11.9), y: 1.02, w: 11.9, h: 0.9, fontSize: 34, bold: true, color: K.graphite });
};
const sand = (section, eyebrow, title, notes) => { const s = pres.addSlide({ masterName: 'SAND', sectionTitle: section }); head(s, eyebrow, title); if (notes) s.addNotes(notes); return s; };
const dark = (section, notes) => { const s = pres.addSlide({ masterName: 'DARK', sectionTitle: section }); FRAME(s); if (notes) s.addNotes(notes); return s; };
// السطر الذهبي الختامي في أسفل كل شريحة محتوى (الموضع نفسه دائمًا)
const closing = (s, text, color = K.goldDeep) => T(s, text, { x: RX(11.9), y: 6.2, w: 11.9, h: 0.55, fontSize: 17, bold: true, color });

// ═══════════════ فاصل ═══════════════
const divider = (section, n, en, title, sub, notes) => {
  const s = dark(section, notes);
  DIAMOND(s, 0.8, 1.0, 5.2, K.copper, true, 60);
  DIAMOND(s, 1.9, 2.1, 3.0, K.copper, true, 40);
  EN(s, n, { x: RX(4), y: 1.35, w: 4, h: 1.6, fontSize: 120, color: K.copper, align: 'right', charSpacing: 0 });
  EN(s, en, { x: RX(8), y: 3.05, w: 8, h: 0.45, fontSize: 17, color: K.dim, charSpacing: 7 });
  T(s, title, { x: RX(9), y: 3.5, w: 9, h: 1.1, fontSize: 50, bold: true, color: K.sand });
  LINE(s, RX(1.6), 4.75, 1.6, K.gold, 2.5);
  T(s, sub, { x: RX(9), y: 4.95, w: 9, h: 0.6, fontSize: 22, color: K.dim });
  LOGO(s, true, M, 6.05, 0.62);
  return s;
};

// ── إضافات v3 ──
// لون كل إطار: عمود رفيع على الحافة اليمنى لكل شرائحه، فيعرف الحاضر موضعه دون أن يقرأ
const ACC = { m: '2F6F7E', i: K.gold, l: K.copper };
const STRIPE = (s, c) => s.addShape(pres.ShapeType.rect, { x: W - 0.12, y: 0, w: 0.12, h: H, fill: { color: c }, line: { width: 0, color: c } });
const fsand = (section, key, eyebrow, title, notes) => { const s = sand(section, eyebrow, title, notes); STRIPE(s, ACC[key]); return s; };
const fdark = (section, key, notes) => { const s = dark(section, notes); STRIPE(s, ACC[key]); return s; };
const darkHead = (s, eyebrow, title) => {
  T(s, eyebrow, { x: RX(8), y: 0.62, w: 8, h: 0.36, fontSize: 13, bold: true, color: K.copper });
  T(s, title, { x: RX(11.9), y: 1.02, w: 11.9, h: 0.9, fontSize: 34, bold: true, color: K.sand });
};
const CARD = (s, x, y, w, h, fill, line = K.goldDeep, tr = 55) => s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: line, width: 0.75, transparency: tr } });
// شبكة أبواب الإطار: ستة أبواب في عمودين، كل باب برقمه وعنوانه وسطره
const chapters = (s, list, accent) => {
  const cw = (11.9 - 0.4) / 2, ch = 1.15;
  list.forEach(([t, p], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = W - M - cw - col * (cw + 0.4), y = 2.15 + row * (ch + 0.2);
    CARD(s, x, y, cw, ch, K.white, accent, 60);
    EN(s, String(i + 1).padStart(2, '0'), { x: x + cw - 1.0, y: y + 0.22, w: 0.8, h: 0.7, fontSize: 30, color: accent, align: 'right', charSpacing: 0 });
    T(s, t, { x: x + 0.3, y: y + 0.16, w: cw - 1.45, h: 0.45, fontSize: 19, bold: true, color: K.graphite });
    T(s, p, { x: x + 0.3, y: y + 0.6, w: cw - 1.45, h: 0.42, fontSize: 14, color: K.muted });
  });
};
// سلسلة أسهم خماسية من اليمين، وتحت كل حلقة سطر اختياري
const chain = (s, items, y, sub = []) => {
  const shades = [K.slate, '1A4F5D', '275C68', K.goldDeep, K.gold];
  const cw = 11.9 / items.length;
  items.forEach((h, i) => {
    const x = W - M - cw * (i + 1);
    s.addShape(pres.ShapeType.chevron, { x: x + 0.03, y, w: cw - 0.06, h: 1.15, flipH: true, fill: { color: shades[i] }, line: { width: 0, color: shades[i] } });
    // النص بعيدًا عن رأس السهم (يسارًا) وعن فتحة السهم (يمينًا)
    T(s, h, { x: x + 0.5, y, w: cw - 1.0, h: 1.15, fontSize: 17, bold: true, color: K.sand, align: 'center', valign: 'middle' });
    if (sub[i]) T(s, sub[i], { x: x + 0.15, y: y + 1.3, w: cw - 0.3, h: 1.0, fontSize: 14, color: K.graphite, align: 'center' });
  });
};
// مؤشرات الإتقان الثلاثة كهرم مقروء: المعرفة في القاعدة والسلوك القيادي في القمة
const mastery = (s, rows, accent) => {
  const widths = [11.9, 9.6, 7.3], h = 1.05;
  rows.forEach(([lvl, txt], i) => {
    const w = widths[i], x = W - M - w - (11.9 - w) / 2, y = 4.85 - i * (h + 0.15);
    CARD(s, x, y, w, h, i === 2 ? accent : K.white, accent, i === 2 ? 0 : 50);
    T(s, lvl, { x: x + w - 2.6, y, w: 2.3, h, fontSize: 18, bold: true, color: i === 2 ? K.white : K.graphite, valign: 'middle' });
    T(s, txt, { x: x + 0.3, y, w: w - 3.0, h, fontSize: 15, color: i === 2 ? K.white : K.graphite, valign: 'middle' });
  });
};

// ═══════════════ الفصل الأول: لماذا (10 دقائق) ═══════════════
pres.addSection({ title: 'لماذا' });
{
  const s = dark('لماذا', 'دقيقة. رحّب، وقل إن الورشة تسعون دقيقة في خمسة فصول، وإن مثالًا واحدًا سيرافقنا حتى النهاية.');
  DIAMOND(s, 0.9, 1.2, 4.6, K.copper, true, 55);
  DIAMOND(s, 1.7, 2.0, 3.0, K.copper, true, 35);
  DIAMOND(s, 2.5, 2.8, 1.4, K.gold, false);
  LOGO(s, true, RX(2.5), 0.95, 1.14);
  EN(s, 'MILESTONE · IMPACT · LEADERSHIP', { x: RX(8), y: 2.55, w: 8, h: 0.4, fontSize: 15 });
  T(s, 'الأطر الثلاثة', { x: RX(8), y: 2.95, w: 8, h: 1.3, fontSize: 66, bold: true, color: K.sand });
  LINE(s, RX(1.6), 4.45, 1.6, K.gold, 2.5);
  T(s, 'من التنفيذ إلى الأثر', { x: RX(8), y: 4.65, w: 8, h: 0.6, fontSize: 26, color: K.dim });
  T(s, 'برنامج إدارة المشروعات للقادة · ورشة احترافية', { x: RX(8), y: 5.3, w: 8, h: 0.45, fontSize: 15, color: K.copper, bold: true });
}
{
  const s = dark('لماذا', 'دقيقتان. اقرأ السؤال ثم اصمت. اطلب رفع الأيدي، ثم مثالًا واحدًا من الحضور. هذا ما سنعالجه اليوم.');
  T(s, 'سؤال قبل أن نبدأ', { x: RX(10), y: 1.9, w: 10, h: 0.45, fontSize: 16, bold: true, color: K.copper });
  T(s, 'كم مشروعًا سلّمتموه في موعده، ولم يتغير بعده شيء؟', { x: RX(10.5), y: 2.45, w: 10.5, h: 2.2, fontSize: 46, bold: true, color: K.sand });
  LINE(s, RX(1.6), 4.95, 1.6, K.gold, 2.5);
  T(s, 'ارفع يدك إن مرّ بك ذلك', { x: RX(10), y: 5.15, w: 10, h: 0.5, fontSize: 20, color: K.dim });
}
{
  const s = sand('لماذا', 'الفجوة', 'الإنجاز لا يساوي القيمة',
    'دقيقتان. المشروع اكتمل كاملًا في موعده، لكن ما تغيّر عند المستفيد بقي قليلًا. هذه الفجوة سبب وجود المنهجية.');
  const bars = [['اكتمال المشروع في موعده', 1.0, K.slate, 'مكتمل'], ['ما تغيّر عند المستفيد', 0.22, K.gold, 'قليل']];
  bars.forEach(([lab, v, c, tag], i) => {
    const y = 2.55 + i * 1.55;
    T(s, lab, { x: RX(11.9), y, w: 11.9, h: 0.45, fontSize: 20, bold: true, color: K.graphite });
    s.addShape(pres.ShapeType.rect, { x: RX(11.9), y: y + 0.55, w: 11.9, h: 0.55, fill: { color: K.sandDeep }, line: { width: 0, color: K.sandDeep } });
    s.addShape(pres.ShapeType.rect, { x: W - M - 11.9 * v, y: y + 0.55, w: 11.9 * v, h: 0.55, fill: { color: c }, line: { width: 0, color: c } });
    T(s, tag, { x: W - M - 11.9 * v - 1.6, y: y + 0.55, w: 1.45, h: 0.55, fontSize: 16, bold: true, color: K.goldDeep, align: 'left', valign: 'middle' });
  });
  closing(s, 'يمكن أن ينجح المشروع وتفشل القيمة. والمنهجية تغلق هذه الفجوة.');
}
{
  const s = dark('لماذا', 'دقيقتان. الشريحة المحورية: ثلاثة أطر، ولكل إطار ما يسلّمه للذي بعده. سنعود إليها في التكامل.');
  darkHead(s, 'جوهر المنهجية', 'ثلاثة أطر تعيد بناء معادلة الإنجاز');
  const fw = [['01', 'Milestone', 'إطار المعلم', 'من إدارة الزمن إلى قيادة القيمة', ACC.m], ['02', 'Impact', 'إطار الأثر', 'من إثبات الإنجاز إلى قيادة الأثر', ACC.i], ['03', 'Leadership', 'إطار القيادة', 'من إدارة المهام إلى قيادة الأشخاص', ACC.l]];
  const pw = (11.9 - 0.5) / 3, ph = 3.55;
  fw.forEach(([n, en, ar, tag, c], i) => {
    const x = W - M - pw - i * (pw + 0.25), y = 2.3;
    CARD(s, x, y, pw, ph, K.slate, K.copper, 55);
    s.addShape(pres.ShapeType.rect, { x, y, w: pw, h: 0.1, fill: { color: c }, line: { width: 0, color: c } });
    DIAMOND(s, x + pw / 2 - 0.3, y + 0.4, 0.6, c);
    EN(s, n, { x: x + 0.3, y: y + 1.15, w: pw - 0.6, h: 0.5, fontSize: 20, align: 'center', color: K.copper });
    EN(s, en, { x: x + 0.3, y: y + 1.6, w: pw - 0.6, h: 0.45, fontSize: 18, align: 'center', color: K.dim, charSpacing: 6 });
    T(s, ar, { x: x + 0.3, y: y + 2.1, w: pw - 0.6, h: 0.6, fontSize: 28, bold: true, color: K.sand, align: 'center' });
    T(s, tag, { x: x + 0.3, y: y + 2.75, w: pw - 0.6, h: 0.6, fontSize: 15, color: K.copper, align: 'center' });
  });
  closing(s, 'المعلم يضبط التنفيذ، والأثر يبرّره، والقيادة تقودهما.', K.copper);
}
{
  const s = sand('لماذا', 'أهداف الورشة', 'في نهاية تسعين دقيقة',
    'دقيقة. أربعة أفعال يُقاس بها نجاح الورشة، ونعود إليها في الختام.');
  const goals = [['تميّز', 'ما يشرحه كل إطار وما يستهدفه'], ['تربط', 'الأطر الثلاثة في سلسلة تسليم واحدة'], ['تطبّق', 'الأطر على مثال واحد من العمل'], ['تحدد', 'أولويتك في رحلتك القيادية']];
  const cw = (11.9 - 0.6) / 4;
  goals.forEach(([v, p], i) => {
    const x = W - M - cw - i * (cw + 0.2), y = 2.4;
    CARD(s, x, y, cw, 3.2, K.white, K.goldDeep, 60);
    EN(s, String(i + 1).padStart(2, '0'), { x: x + 0.3, y: y + 0.3, w: cw - 0.6, h: 0.7, fontSize: 32, color: K.gold, align: 'right', charSpacing: 0 });
    T(s, v, { x: x + 0.3, y: y + 1.1, w: cw - 0.6, h: 0.7, fontSize: 30, bold: true, color: K.graphite });
    T(s, p, { x: x + 0.3, y: y + 1.9, w: cw - 0.6, h: 1.0, fontSize: 16, color: K.muted });
  });
  closing(s, 'نجاح الورشة ممارسة واحدة تبدأها غدًا، لا عدد الشرائح.');
}
{
  const s = dark('لماذا', 'دقيقتان. مثال توضيحي لا جهة بعينها. اطلب من الحضور أن يتخيلوا أنهم قادته. سيعود في كل فصل.');
  darkHead(s, 'مثال يرافقنا', 'برنامج رقمنة خدمات المستفيدين');
  const facts = [['النطاق', 'ثلاث خدمات للمستفيدين تتحول إلى رقمية'], ['المدة', 'ستة أشهر'], ['المنفعة المستهدفة', 'زمن الخدمة من أسبوع إلى يومين']];
  facts.forEach(([k, v], i) => {
    const y = 2.35 + i * 1.15;
    DIAMOND(s, W - M - 0.22, y + 0.2, 0.22, K.gold);
    T(s, k, { x: RX(3.2, M + 0.45), y, w: 3.2, h: 0.6, fontSize: 18, bold: true, color: K.copper });
    T(s, v, { x: RX(8.4, M + 3.8), y, w: 8.4, h: 0.6, fontSize: 24, bold: true, color: K.sand });
    if (i < 2) LINE(s, RX(11.9), y + 0.9, 11.9, K.copper, 0.75, 60);
  });
  closing(s, 'سنرى البرنامج نفسه بعين كل إطار: كيف يُضبط، وكيف يُبرَّر، وكيف يُقاد.', K.copper);
}

// ═══════════════ الفصل الثاني: إطار المعلم (18 دقيقة) ═══════════════
pres.addSection({ title: 'إطار المعلم' });
{
  const s = divider('إطار المعلم', '01', 'MILESTONE FRAMEWORK', 'إطار المعلم', 'من إدارة الزمن إلى قيادة القيمة', 'دقيقة. الإطار الأول أساس الإطارين الآخرين: لا قياس للأثر ولا قيادة للتحول دون تحكم منضبط في التنفيذ.');
  STRIPE(s, ACC.m);
  T(s, 'المستهدف: انضباط التنفيذ', { x: RX(9), y: 5.6, w: 9, h: 0.5, fontSize: 18, bold: true, color: K.copper });
}
{
  const s = fsand('إطار المعلم', 'm', 'إطار المعلم · ماذا يشرح', 'ستة أبواب من المستخلص العالمي إلى القائد',
    'ثلاث دقائق. مرّ على الأبواب بعناوينها: من أين جاءت المنهجية، ثم خصوصية سياقنا، ثم القرار، ثم إعادة تعريف المعلم، ثم الطبقات، ثم القائد.');
  chapters(s, [['المستخلص العالمي', 'PMI وAxelos ونضج المؤسسات P3M3'], ['المشاريع التنموية والحكومية', 'الإدارة بالنتائج ونظرية التغيير'], ['من الأنشطة إلى القرار', 'حلقة صناعة القرار والهيكلة المؤقتة'], ['إعادة تعريف المعلم', 'المفاهيم وأنواع المعالم الأربعة'], ['الطبقات الثلاث', 'المشروع والبرنامج والمحفظة'], ['النظام البيئي حول المعلم', 'جدارات القائد ومؤشرات الإتقان']], ACC.m);
}
{
  const s = fsand('إطار المعلم', 'm', 'إطار المعلم · الفكرة المركزية', 'المعلم نقطة قرار، لا تاريخ يمر',
    'أربع دقائق. الأبعاد الخمسة من اليمين، وجملة لكل منها: من يقرر، ومتى تُطرح الأسئلة، وحدود التحمل والتصعيد، والمعيار الذي يُفحص، والمنفعة التي يخدمها المعلم.');
  const words = [['قرار', 'من يقرر وماذا'], ['توقيت', 'متى تُطرح الأسئلة'], ['تحكّم', 'حدود التحمل والتصعيد'], ['قياس', 'معيار يُفحص'], ['قيمة', 'منفعة يخدمها']];
  const step = 11.9 / 5;
  LINE(s, RX(11.9) + step / 2, 3.35, 11.9 - step, ACC.m, 2);
  words.forEach(([w, p], i) => {
    const cx = W - M - step / 2 - i * step;
    DIAMOND(s, cx - 0.3, 3.05, 0.6, i === 4 ? K.gold : ACC.m);
    RING(s, cx - 0.62, 2.73, 1.24, ACC.m, 1, 55);
    T(s, w, { x: cx - 1.1, y: 4.15, w: 2.2, h: 0.6, fontSize: 26, bold: true, color: K.graphite, align: 'center' });
    T(s, p, { x: cx - 1.1, y: 4.75, w: 2.2, h: 0.5, fontSize: 15, color: K.muted, align: 'center' });
  });
  closing(s, 'المعلم الذي لا يُتخذ عنده قرار تاريخ يُرجى، لا نقطة تحكم.');
}
{
  const s = fsand('إطار المعلم', 'm', 'إطار المعلم · الطبقات', 'لكل طبقة معلمها، ولكل معلم سؤاله',
    'ثلاث دقائق. المشروع داخل البرنامج داخل المحفظة، ولكل طبقة سؤال: التحكم العملي، والتكامل والمنافع، والقرار الاستراتيجي.');
  const bx = RX(5.6), by = 2.2;
  s.addShape(pres.ShapeType.roundRect, { x: bx, y: by, w: 5.6, h: 3.8, rectRadius: 0.1, fill: { color: K.sandDeep }, line: { color: ACC.m, width: 0.75, transparency: 40 } });
  s.addShape(pres.ShapeType.roundRect, { x: bx + 0.7, y: by + 0.75, w: 4.2, h: 2.3, rectRadius: 0.1, fill: { color: K.white }, line: { color: ACC.m, width: 0.75, transparency: 30 } });
  s.addShape(pres.ShapeType.roundRect, { x: bx + 1.4, y: by + 1.5, w: 2.8, h: 0.8, rectRadius: 0.1, fill: { color: ACC.m }, line: { width: 0, color: ACC.m } });
  T(s, 'المحفظة', { x: bx + 0.3, y: by + 0.18, w: 5.0, h: 0.45, fontSize: 17, bold: true, color: K.graphite });
  T(s, 'البرنامج', { x: bx + 1.0, y: by + 0.9, w: 3.6, h: 0.45, fontSize: 17, bold: true, color: K.graphite });
  T(s, 'المشروع', { x: bx + 1.4, y: by + 1.5, w: 2.8, h: 0.8, fontSize: 19, bold: true, color: K.white, align: 'center', valign: 'middle' });
  const rows = [['المحفظة', 'هل نستمر؟ قرار استراتيجي'], ['البرنامج', 'هل تتكامل المشاريع نحو المنفعة؟'], ['المشروع', 'هل التنفيذ تحت السيطرة؟']];
  rows.forEach(([h, p], i) => {
    const y = 2.45 + i * 1.2;
    DIAMOND(s, M + 5.55, y + 0.17, 0.2, i === 2 ? ACC.m : K.goldDeep);
    T(s, h, { x: M, y, w: 5.35, h: 0.45, fontSize: 21, bold: true, color: K.graphite });
    T(s, p, { x: M, y: y + 0.5, w: 5.35, h: 0.45, fontSize: 16, color: K.muted });
  });
  closing(s, 'المعالم جسور تصعد عبرها القيمة من التنفيذ إلى القرار الاستراتيجي.');
}
{
  const s = fsand('إطار المعلم', 'm', 'إطار المعلم · على المثال', 'معلم «إطلاق الخدمة الأولى» قبل الإطار وبعده',
    'أربع دقائق. اليمين كما يُدار عادة: تاريخ وحالة. واليسار بالإطار: قرار ومعيار ومالك ومنفعة. اسأل: أي العمودين يمنع الانزلاق؟');
  const cw = (11.9 - 0.5) / 2;
  const cols = [['قبل: تاريخ في الجدول', ['الموعد: نهاية الشهر الثالث', 'الحالة: قيد التنفيذ', 'السؤال: هل أنجزنا؟'], K.white, K.muted], ['بعد: نقطة قرار', ['القرار: ننتقل للخدمة الثانية أو نصحح', 'المعيار: الطلبات تُنجز رقميًا بلا تدخل يدوي', 'المالك: راعي البرنامج', 'المنفعة: أول مستفيد يُخدم في يومين'], ACC.m, K.white]];
  cols.forEach(([h, items, fill, tc], i) => {
    const x = W - M - cw - i * (cw + 0.5), y = 2.25;
    CARD(s, x, y, cw, 3.7, fill, ACC.m, i ? 0 : 50);
    T(s, h, { x: x + 0.35, y: y + 0.3, w: cw - 0.7, h: 0.55, fontSize: 21, bold: true, color: i ? K.white : K.graphite });
    items.forEach((t, k) => T(s, t, { x: x + 0.35, y: y + 1.05 + k * 0.62, w: cw - 0.7, h: 0.55, fontSize: 16, color: tc }));
  });
  closing(s, 'الفرق ليس في الشكل، بل في السؤال: من «ماذا أنجزنا؟» إلى «ما القرار المطلوب؟»');
}
{
  const s = fsand('إطار المعلم', 'm', 'إطار المعلم · المستهدف', 'ثلاثة مستويات للإتقان',
    'دقيقتان. القاعدة معرفة، ثم مهارة، ثم سلوك قيادي يظهر في الخطاب. قياسك المبدئي يحدد أين تقف في كل إطار.');
  mastery(s, [['المعرفة', 'يعرف متى يستدعي المدارس العالمية، ويعرّف المعلم بمنظور قيادي'], ['المهارة', 'يصمم سجل معالم متوازنًا، ويدير بوابة مرحلة بقرار عبور موثق'], ['السلوك القيادي', 'خطابه «ما القرار المطلوب؟» لا «ماذا أنجزنا؟»']], ACC.m);
}

// ═══════════════ الفصل الثالث: إطار الأثر (18 دقيقة) ═══════════════
pres.addSection({ title: 'إطار الأثر' });
{
  const s = divider('إطار الأثر', '02', 'IMPACT FRAMEWORK', 'إطار الأثر', 'من إثبات الإنجاز إلى قيادة الأثر', 'دقيقة. الإطار الثاني جسر: يستلم انضباط التنفيذ من المعالم، ويسلّم القيادة قيمة مقيسة.');
  STRIPE(s, ACC.i);
  T(s, 'المستهدف: قيمة مقيسة', { x: RX(9), y: 5.6, w: 9, h: 0.5, fontSize: 18, bold: true, color: K.copper });
}
{
  const s = fsand('إطار الأثر', 'i', 'إطار الأثر · ماذا يشرح', 'ستة أبواب من المدارس إلى أخلاقيات البيانات',
    'ثلاث دقائق. مدارس إدارة المنافع، ثم السلسلة الخماسية، ثم تقارير الأثر، ثم إعادة تعريف الأثر، ثم الطبقات، ثم النظام البيئي.');
  chapters(s, [['مدارس المنافع والأثر', 'BRM مقابل MSP'], ['سلسلة القيمة الخماسية', 'لكل حلقة سؤالها ومقياسها ومالكها'], ['من تقارير الإنجاز إلى الأثر', 'حلقة قيادة الأثر، وKPI وOKR'], ['إعادة تعريف الأثر', 'تشريح المؤشر والمنافع السلبية'], ['الأثر عبر الطبقات', 'تجميعه وانتقاله من المشروع إلى المحفظة'], ['النظام البيئي حول الأثر', 'أخلاقيات البيانات وجدارات القائد']], ACC.i);
}
{
  const s = fsand('إطار الأثر', 'i', 'إطار الأثر · الفكرة المركزية', 'ما الذي تغيّر بسببنا؟',
    'أربع دقائق. السلسلة من اليمين، والمساءلة تصعد فيها: نسلّم المخرجات، ولا يُبرَّر الاستثمار إلا بالأثر.');
  T(s, 'سلسلة القيمة الخماسية', { x: RX(11.9), y: 2.05, w: 11.9, h: 0.45, fontSize: 16, color: K.muted });
  chain(s, ['المخرجات', 'النتائج', 'المنافع', 'التحوّل', 'الأثر\nالمستدام'], 2.6, ['ما يسلّمه المشروع', 'ما يتغير مباشرة', 'قيمة مقيسة لها مالك', 'تغيّر في طريقة العمل', 'ما يبقى بعد المشروع']);
  s.addShape(pres.ShapeType.leftArrow, { x: RX(11.9), y: 4.55, w: 11.9, h: 0.32, fill: { color: K.sandDeep }, line: { width: 0, color: K.sandDeep } });
  T(s, 'تصعد المساءلة: نسلّم المخرجات، ولا يُبرَّر الاستثمار إلا بالأثر', { x: RX(11.9), y: 5.0, w: 11.9, h: 0.45, fontSize: 17, color: K.graphite, align: 'center' });
  closing(s, 'الأثر لا يُدّعى في الختام، بل يُصمَّم من اليوم الأول ويُثبَت بالدليل.');
}
{
  const s = fsand('إطار الأثر', 'i', 'إطار الأثر · التمييز الحاسم', 'متى ننسب التغيير لأنفسنا؟',
    'ثلاث دقائق. أشهر فخ في قياس الأثر. الإسناد يحتاج عزل أثر التدخل، والمساهمة تحتاج سردية سببية بأدلة. وكلما صعدنا في السلسلة صارت اللغة لغة مساهمة.');
  const cw = (11.9 - 0.5) / 2;
  [['الإسناد', 'التغيير حدث بسبب تدخلنا تحديدًا', 'خط أساس ومقارنة ومجموعة ضابطة'], ['المساهمة', 'تدخلنا أحد عوامل صنعت التغيير', 'نظرية تغيير موثقة وأدلة داعمة']].forEach(([h, m, need], i) => {
    const x = W - M - cw - i * (cw + 0.5), y = 2.3;
    CARD(s, x, y, cw, 3.4, i ? K.white : K.gold, ACC.i, i ? 50 : 0);
    const c = i ? K.graphite : K.white;
    T(s, h, { x: x + 0.4, y: y + 0.35, w: cw - 0.8, h: 0.7, fontSize: 30, bold: true, color: c });
    T(s, m, { x: x + 0.4, y: y + 1.15, w: cw - 0.8, h: 0.8, fontSize: 19, color: c });
    T(s, 'ما يتطلبه: ' + need, { x: x + 0.4, y: y + 2.2, w: cw - 0.8, h: 0.8, fontSize: 16, bold: true, color: i ? K.goldDeep : K.white });
  });
  closing(s, 'الأمانة في النسبة أول شروط الثقة بتقرير الأثر.');
}
{
  const s = fsand('إطار الأثر', 'i', 'إطار الأثر · على المثال', 'برنامج الرقمنة يصعد السلسلة',
    'أربع دقائق. مثال توضيحي. اسأل عند كل حلقة: من مالكها؟ وما دليلها؟ وتوقف عند المنافع: زمن الخدمة هو ما يبرر البرنامج.');
  T(s, 'عند كل حلقة سؤالان: من مالكها؟ وما دليلها؟', { x: RX(11.9), y: 2.05, w: 11.9, h: 0.45, fontSize: 16, color: K.muted });
  chain(s, ['المخرجات', 'النتائج', 'المنافع', 'التحوّل', 'الأثر\nالمستدام'], 2.6, ['ثلاث خدمات رقمية تعمل', 'المستفيدون يطلبون رقميًا', 'زمن الخدمة من أسبوع إلى يومين', 'الجهة تعمل رقميًا أولًا', 'ثقة المستفيد تبقى بعد البرنامج']);
  // المنفعة هي ما يبرر البرنامج: إطار ذهبي حولها
  const cw5 = 11.9 / 5; s.addShape(pres.ShapeType.rect, { x: W - M - cw5 * 3 + 0.05, y: 2.45, w: cw5 - 0.1, h: 2.6, fill: { type: 'none' }, line: { color: K.gold, width: 2 } });
  T(s, 'هذه ما يبرر الاستثمار', { x: W - M - cw5 * 3, y: 5.15, w: cw5, h: 0.45, fontSize: 15, bold: true, color: K.goldDeep, align: 'center' });
  closing(s, 'المنفعة بلا مالك وعد، وبلا خط أساس ادعاء.');
}
{
  const s = fdark('إطار الأثر', 'i', 'دقيقتان. الأبعاد الخمسة لأي أثر يُدّعى، ثم ما يظهر في سلوك القائد: سؤال التغيير، ورفض المنافع بلا ملاك.');
  darkHead(s, 'إطار الأثر · المستهدف', 'أثر مقصود، مقيس، منسوب بأمانة، مملوك، مستدام');
  const dims = ['مقصود', 'مقيس', 'منسوب بأمانة', 'مملوك', 'مستدام'];
  const cw = 11.9 / 5;
  dims.forEach((d, i) => {
    const cx = W - M - cw / 2 - i * cw;
    RING(s, cx - 0.85, 2.35, 1.7, K.gold, 1.25, 25);
    DIAMOND(s, cx - 0.17, 3.03, 0.34, K.gold);
    T(s, d, { x: cx - 1.2, y: 4.2, w: 2.4, h: 0.6, fontSize: 21, bold: true, color: K.sand, align: 'center' });
  });
  closing(s, 'السلوك القيادي: «ما الذي تغيّر؟» بدل «ماذا أنجزنا؟»، ولا منفعة بلا مالك.', K.copper);
}

// ═══════════════ الفصل الرابع: إطار القيادة (18 دقيقة) ═══════════════
pres.addSection({ title: 'إطار القيادة' });
{
  const s = divider('إطار القيادة', '03', 'LEADERSHIP FRAMEWORK', 'إطار القيادة', 'من إدارة المهام إلى قيادة الأشخاص', 'دقيقة. قمة المنظومة: يستلم انضباط التنفيذ وقيمة مقيسة، ويضيف القائد القادر على قيادة الأشخاص نحو التحول.');
  STRIPE(s, ACC.l);
  T(s, 'المستهدف: قيادة التحول', { x: RX(9), y: 5.6, w: 9, h: 0.5, fontSize: 18, bold: true, color: K.copper });
}
{
  const s = fsand('إطار القيادة', 'l', 'إطار القيادة · ماذا يشرح', 'ستة أبواب من المدارس إلى النظام المحيط بالقائد',
    'ثلاث دقائق. مدارس القيادة، ثم الاستجابة المنضبطة، ثم التسليم القيادي، ثم إعادة تعريف قائد المشاريع، ثم الطبقات، ثم النظام البيئي وأداة DIRECT.');
  chapters(s, [['مدارس القيادة', 'الإدارة مقابل القيادة (Kotter)'], ['سلسلة الاستجابة الخماسية', 'لكل مرحلة سؤالها وفخها'], ['من التسليم الشكلي إلى القيادي', 'حلقة التسليم والتسلم'], ['إعادة تعريف قائد المشاريع', 'جدارات التأثير والتأثير بلا سلطة'], ['القائد عبر الطبقات', 'اتساع القيادة من المشروع إلى المحفظة'], ['النظام البيئي حول القائد', 'أداة DIRECT ومؤشرات الإتقان']], ACC.l);
}
{
  const s = fsand('إطار القيادة', 'l', 'إطار القيادة · الفكرة المركزية', 'الاستجابة المنضبطة مسار، لا سرعة',
    'أربع دقائق. السلسلة من اليمين. السرعة الحقيقية تُكسب في التلقي والتفهم لا في ضغط التحرك.');
  T(s, 'سلسلة الاستجابة الخماسية', { x: RX(11.9), y: 2.05, w: 11.9, h: 0.45, fontSize: 16, color: K.muted });
  chain(s, ['تلقٍّ', 'تفهّم', 'أولوية', 'تحرّك', 'إغلاق'], 2.6, ['ما المطلوب فعلًا؟', 'لماذا ولمن؟', 'ما الأهم الآن؟', 'تنفيذ بلا تردد', 'حتى يتحقق الأثر']);
  closing(s, 'السرعة بلا تفهّم تهوّر، والتفهّم بلا تحرّك تعطيل.');
}
{
  const s = fsand('إطار القيادة', 'l', 'إطار القيادة · العهدة', 'التسليم مسؤولية، لا ورقة',
    'ثلاث دقائق. الحلقة من اليمين. ومعالم الإطار الأول هي محطاتها: عندها يقع التسليم وتُقرأ الرقابة وتُتخذ قرارات العهدة. مثال: تسليم الخدمات الرقمية للجهة المشغلة بتشغيل مصاحب ثم معلم استقلال.');
  const steps = [['تسليم واضح', 'النطاق والحالة والمخاطر موثقة'], ['تتابع وتكامل', 'مرافقة المتسلم'], ['رقابة', 'متابعة مستقلة'], ['قرار', 'دعم أو تصحيح أو تصعيد'], ['تحقيق الأثر', 'العهدة تثمر وتوثق دروسها']];
  const cw = 11.9 / 5;
  LINE(s, RX(11.9) + cw / 2, 3.1, 11.9 - cw, ACC.l, 2);
  steps.forEach(([h, p], i) => {
    const cx = W - M - cw / 2 - i * cw;
    s.addShape(pres.ShapeType.ellipse, { x: cx - 0.5, y: 2.6, w: 1.0, h: 1.0, fill: { color: i === 4 ? K.gold : K.sand }, line: { color: ACC.l, width: 2 } });
    EN(s, String(i + 1), { x: cx - 0.5, y: 2.6, w: 1.0, h: 1.0, fontSize: 24, align: 'center', valign: 'middle', color: i === 4 ? K.white : K.goldDeep, charSpacing: 0 });
    T(s, h, { x: cx - 1.15, y: 3.85, w: 2.3, h: 0.55, fontSize: 19, bold: true, color: K.graphite, align: 'center' });
    T(s, p, { x: cx - 1.15, y: 4.4, w: 2.3, h: 0.8, fontSize: 14, color: K.muted, align: 'center' });
  });
  closing(s, 'المعالم محطات العهدة: عندها يُسلَّم، ويُراقَب، ويُتخذ القرار.');
}
{
  const s = fdark('إطار القيادة', 'l', 'ثلاث دقائق. الجدارات الست في الشبكة، ثم أداة DIRECT في الشريط: مسار القائد أمام أي تحدٍّ من التشخيص حتى التتبع.');
  darkHead(s, 'إطار القيادة · المستهدف', 'ست جدارات، وأداة واحدة لأي تحدٍّ');
  const comps = ['الاستجابة المنضبطة', 'انتقال العهدة', 'قيادة الذات', 'قيادة الفريق', 'القيادة التحويلية والتبادلية', 'القيادة نحو الأعلى وعبر الحدود'];
  const cw = (11.9 - 0.5) / 3, ch = 1.05;
  comps.forEach((h, i) => {
    const x = W - M - cw - (i % 3) * (cw + 0.25), y = 2.15 + Math.floor(i / 3) * (ch + 0.2);
    CARD(s, x, y, cw, ch, K.slate, K.copper, 55);
    DIAMOND(s, x + cw - 0.55, y + 0.4, 0.24, i < 2 ? K.gold : K.copper);
    T(s, h, { x: x + 0.3, y, w: cw - 1.0, h: ch, fontSize: 18, bold: true, color: K.sand, valign: 'middle' });
  });
  const dir = ['تشخيص', 'تأثير', 'حل', 'تعاطف', 'تواصل', 'تتبع'];
  EN(s, 'D I R E C T', { x: RX(11.9), y: 4.65, w: 11.9, h: 0.4, fontSize: 16, color: K.copper, align: 'right' });
  const dw = 11.9 / 6;
  dir.forEach((d, i) => {
    const x = W - M - dw * (i + 1);
    CARD(s, x + 0.05, 5.1, dw - 0.1, 0.75, i % 2 ? K.slate : '1A4F5D', K.copper, 70);
    T(s, d, { x: x + 0.05, y: 5.1, w: dw - 0.1, h: 0.75, fontSize: 17, bold: true, color: K.sand, align: 'center', valign: 'middle' });
  });
  closing(s, 'السلوك القيادي: «لماذا نتغير ومعنا من؟» بدل «أنجزوا المهام».', K.copper);
}

// ═══════════════ الفصل الخامس: التكامل والتطبيق (26 دقيقة) ═══════════════
pres.addSection({ title: 'التكامل والتطبيق' });
{
  const s = dark('التكامل والتطبيق', 'أربع دقائق. ليست ثلاثة أطر متجاورة بل سلسلة تسليم: كل إطار يستلم مما قبله ويسلّم ما بعده. على المثال: معلم الإطلاق، ثم منفعة زمن الخدمة، ثم تسليم الخدمات للجهة المشغلة.');
  darkHead(s, 'التكامل', 'كل إطار يسلّم الذي بعده');
  const blocks = [['إطار المعلم', 'يضبط', 'انضباط التنفيذ', ACC.m], ['إطار الأثر', 'يبرّر', 'قيمة مقيسة', ACC.i], ['إطار القيادة', 'يقود', 'تحول مؤسسي', ACC.l]];
  const bw = 3.2, gap = (11.9 - bw * 3) / 2;
  blocks.forEach(([h, v, out, c], i) => {
    const x = W - M - bw - i * (bw + gap), y = 2.35;
    CARD(s, x, y, bw, 2.6, K.slate, c, 0);
    s.addShape(pres.ShapeType.rect, { x, y, w: bw, h: 0.1, fill: { color: c }, line: { width: 0, color: c } });
    T(s, h, { x: x + 0.3, y: y + 0.35, w: bw - 0.6, h: 0.6, fontSize: 24, bold: true, color: K.sand, align: 'center' });
    T(s, v, { x: x + 0.3, y: y + 1.0, w: bw - 0.6, h: 0.5, fontSize: 18, color: K.copper, align: 'center' });
    T(s, 'يسلّم: ' + out, { x: x + 0.3, y: y + 1.6, w: bw - 0.6, h: 0.6, fontSize: 17, bold: true, color: K.dim, align: 'center' });
    if (i < 2) s.addShape(pres.ShapeType.leftArrow, { x: x - gap + 0.15, y: y + 1.05, w: gap - 0.3, h: 0.5, fill: { color: K.gold }, line: { width: 0, color: K.gold } });
  });
  closing(s, 'المشاريع لا تقودها المنهجيات، يقودها أشخاص يمتلكون الجدارات.', K.copper);
}
{
  const s = sand('التكامل والتطبيق', 'تمرين الورشة · 12 دقيقة', 'طبّق الأطر الثلاثة على برنامج الرقمنة',
    'ست عشرة دقيقة مع العرض. فرق من أربعة إلى ستة. ثماني دقائق عمل، ثم دقيقتان لكل فريق يعرض بطاقاته الثلاث. علّق على سؤال الإطار لا على الشكل.');
  const tasks = [['إطار المعلم', 'حدد معلمًا واحدًا: ما القرار عنده؟ ومن يتخذه؟', ACC.m], ['إطار الأثر', 'حدد منفعة واحدة: ما مؤشرها وخط أساسها؟ ومن مالكها؟', ACC.i], ['إطار القيادة', 'حدد لحظة تسليم واحدة: ماذا يُسلَّم؟ ومتى يستقل المتسلم؟', ACC.l]];
  const cw = (11.9 - 0.5) / 3;
  tasks.forEach(([h, p, c], i) => {
    const x = W - M - cw - i * (cw + 0.25), y = 2.25;
    CARD(s, x, y, cw, 3.4, K.white, c, 30);
    s.addShape(pres.ShapeType.rect, { x, y, w: cw, h: 0.12, fill: { color: c }, line: { width: 0, color: c } });
    EN(s, `0${i + 1}`, { x: x + 0.3, y: y + 0.35, w: cw - 0.6, h: 0.6, fontSize: 28, color: c, align: 'right', charSpacing: 0 });
    T(s, h, { x: x + 0.3, y: y + 1.0, w: cw - 0.6, h: 0.55, fontSize: 22, bold: true, color: K.graphite });
    T(s, p, { x: x + 0.3, y: y + 1.65, w: cw - 0.6, h: 1.5, fontSize: 17, color: K.graphite });
  });
  closing(s, 'ثماني دقائق عمل، ثم دقيقتان لكل فريق: ثلاث بطاقات، وسؤال واحد من الحضور.');
}
{
  const s = sand('التكامل والتطبيق', 'من الورشة إلى الرحلة', 'رحلة في ثلاثة أطوار',
    'دقيقتان. قياس مبدئي يحدد مستواك في كل إطار، ثم كتيب على مستواك ومبادرة من عملك، ثم قياس ما تغيّر. الشهادة «إتمام بنجاح» لمن اجتاز التقييم الختامي.');
  const phases = [['01', 'القبول', 'ملفك، وقياس مبدئي، واعتماد مسارك'], ['02', 'التأهيل', 'كتيب على مستواك، ومبادرة من عملك، وتوجيه'], ['03', 'الأثر', 'قياس ما تغيّر، وتقييم ختامي، وشهادة إتمام بنجاح']];
  const step = 11.9 / 3;
  LINE(s, RX(11.9) + step / 2, 3.3, 11.9 - step, K.gold, 2);
  phases.forEach(([n, h, p], i) => {
    const cx = W - M - step / 2 - i * step;
    s.addShape(pres.ShapeType.ellipse, { x: cx - 0.6, y: 2.7, w: 1.2, h: 1.2, fill: { color: i === 2 ? K.gold : K.sand }, line: { color: K.gold, width: 2 } });
    EN(s, n, { x: cx - 0.6, y: 2.7, w: 1.2, h: 1.2, fontSize: 26, align: 'center', valign: 'middle', color: i === 2 ? K.white : K.goldDeep, charSpacing: 0 });
    T(s, h, { x: cx - 1.8, y: 4.2, w: 3.6, h: 0.6, fontSize: 25, bold: true, color: K.graphite, align: 'center' });
    T(s, p, { x: cx - 1.8, y: 4.8, w: 3.6, h: 0.9, fontSize: 15, color: K.muted, align: 'center' });
  });
  closing(s, 'تبدأ من حيث أنت فعلًا: القياس المبدئي يحدد مستواك في كل إطار.');
}
{
  const s = dark('التكامل والتطبيق', 'أربع دقائق. وزّع البطاقات. يكتب كل حاضر ممارسة واحدة يبدأها غدًا ويحتفظ بها. ثم عُد إلى أهداف الورشة الأربعة، واذكر رابط المنصة.');
  DIAMOND(s, 0.9, 1.2, 4.6, K.copper, true, 55);
  DIAMOND(s, 1.7, 2.0, 3.0, K.copper, true, 35);
  DIAMOND(s, 2.5, 2.8, 1.4, K.gold, false);
  T(s, 'سؤال الختام', { x: RX(8), y: 2.1, w: 8, h: 0.4, fontSize: 14, bold: true, color: K.copper });
  T(s, 'ما الممارسة الواحدة التي ستبدأها غدًا؟', { x: RX(8), y: 2.55, w: 8, h: 1.9, fontSize: 42, bold: true, color: K.sand });
  LINE(s, RX(1.6), 4.7, 1.6, K.gold, 2.5);
  T(s, 'اكتبها على بطاقتك واحتفظ بها · شكرًا لكم', { x: RX(8), y: 4.9, w: 8, h: 0.5, fontSize: 19, color: K.dim });
  EN(s, 'leaders.sunkvalue.com', { x: RX(8), y: 5.45, w: 8, h: 0.5, fontSize: 20, color: K.copper, charSpacing: 2 });
  LOGO(s, true, M, 6.05, 0.62);
}

await pres.writeFile({ fileName: OUT });
await applyTheme(OUT, THEME);
console.log('✓', OUT);
