// عرض ورشة الأطر الثلاثة (v2): عرض عام فاخر بالهوية، كل شريحة تركيب بصري بأشكال لا نقاط، RTL كامل.
// التشغيل: npm i pptxgenjs@3.12.0 ثم NODE_PATH=<node_modules> node build-deck-v2.mjs [المخرج.pptx]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');
const here = path.dirname(new URL(import.meta.url).pathname);
const { applyTheme } = require(path.join(here, 'apply-theme.js'));
const OUT = process.argv[2] || path.join(here, 'الأطر-الثلاثة-ورشة-v2.pptx');

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
pres.title = 'الأطر الثلاثة: عرض الورشة'; pres.author = 'Milestone Impact'; pres.company = 'Milestone Impact';
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
  { text: { text: footer, options: { x: RX(5), y: 7.02, w: 5, h: 0.3, fontSize: 9.5, color: K.copper, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0 } } },
], slideNumber: { x: M, y: 7.02, w: 0.6, h: 0.3, fontSize: 9.5, color: K.copper, align: 'left', fontFace: LATIN } });
pres.defineSlideMaster({ title: 'SAND', background: { color: K.sand }, objects: [
  { text: { text: footer, options: { x: RX(5), y: 7.02, w: 5, h: 0.3, fontSize: 9.5, color: K.goldDeep, align: 'right', rtlMode: true, lang: 'ar-SA', margin: 0 } } },
], slideNumber: { x: M, y: 7.02, w: 0.6, h: 0.3, fontSize: 9.5, color: K.goldDeep, align: 'left', fontFace: LATIN } });

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

// ═══════════════ 1. الغلاف ═══════════════
pres.addSection({ title: 'الافتتاح' });
{
  const s = dark('الافتتاح', 'افتتاح الورشة: جملة عن البرنامج، ثم إن اليوم عن الأطر الثلاثة بشكل عام، لا عن أدواتها. المدة المقترحة 40 دقيقة مع النقاش.');
  // تكوين هندسي: ثلاثة معيّنات متداخلة بخطوط رفيعة على اليسار
  DIAMOND(s, 0.9, 1.2, 4.6, K.copper, true, 55);
  DIAMOND(s, 1.7, 2.0, 3.0, K.copper, true, 35);
  DIAMOND(s, 2.5, 2.8, 1.4, K.gold, false);
  LOGO(s, true, RX(2.5), 0.95, 1.14);
  EN(s, 'MILESTONE · IMPACT · LEADERSHIP', { x: RX(8), y: 2.55, w: 8, h: 0.4, fontSize: 15 });
  T(s, 'الأطر الثلاثة', { x: RX(8), y: 2.95, w: 8, h: 1.3, fontSize: 66, bold: true, color: K.sand });
  LINE(s, RX(1.6), 4.45, 1.6, K.gold, 2.5);
  T(s, 'من التنفيذ إلى الأثر', { x: RX(8), y: 4.65, w: 8, h: 0.6, fontSize: 24, color: K.dim });
  T(s, 'برنامج إدارة المشروعات للقادة · ورشة تعريفية', { x: RX(8), y: 5.3, w: 8, h: 0.45, fontSize: 14, color: K.copper, bold: true });
}

// ═══════════════ 2. لماذا ═══════════════
{
  const s = sand('الافتتاح', 'لماذا هذه المنهجية؟', 'التوسّع لا يعني بالضرورة قيمة متحققة',
    'نبدأ من المشكلة: مشاريع وبرامج ومحافظ تتوسع، والقيمة لا تتبعها دائمًا. الدوائر الثلاث هي ما تدار، والنقلات الثلاث ما تفعله المنهجية. اطلب مثالًا من الحضور.');
  // ثلاث دوائر متداخلة: المشروعات، البرامج، المحافظ
  const cx = 3.9, cy = 4.2;
  RING(s, cx - 1.55, cy - 1.55, 3.1, K.goldDeep, 1.25, 20);
  RING(s, cx - 0.35, cy - 1.55, 3.1, K.goldDeep, 1.25, 20);
  RING(s, cx - 0.95, cy - 0.5, 3.1, K.goldDeep, 1.25, 20);
  T(s, 'المشروعات', { x: cx - 1.55, y: cy - 1.25, w: 1.6, h: 0.4, fontSize: 13, bold: true, color: K.graphite, align: 'center' });
  T(s, 'البرامج', { x: cx + 0.9, y: cy - 1.25, w: 1.6, h: 0.4, fontSize: 13, bold: true, color: K.graphite, align: 'center' });
  T(s, 'المحافظ', { x: cx - 0.8, y: cy + 1.95, w: 1.6, h: 0.4, fontSize: 13, bold: true, color: K.graphite, align: 'center' });
  DIAMOND(s, cx - 0.12, cy + 0.05, 0.24, K.gold);
  // النقلات الثلاث على اليمين
  const shifts = [['01', 'قيادة التحوّل', 'لا متابعة التنفيذ'], ['02', 'قياس القيمة', 'لا سرد الإنجاز'], ['03', 'منظومة مترابطة', 'لا مشروعات منفصلة']];
  shifts.forEach(([n, h, p], i) => {
    const y = 2.35 + i * 1.2;
    EN(s, n, { x: RX(1.0), y, w: 1.0, h: 0.7, fontSize: 34, color: K.gold, align: 'right' });
    T(s, h, { x: RX(4.2, M + 1.15), y: y + 0.02, w: 4.2, h: 0.5, fontSize: 22, bold: true, color: K.graphite });
    T(s, p, { x: RX(4.2, M + 1.15), y: y + 0.5, w: 4.2, h: 0.4, fontSize: 14, color: K.muted });
    if (i < 2) LINE(s, RX(5.3), y + 1.05, 5.3, K.sandDeep, 1);
  });
  closing(s, 'المنهجية تعيد بناء العلاقة بين التنفيذ والأثر والقيادة.');
}

// ═══════════════ 3. الأطر الثلاثة ═══════════════
{
  const s = dark('الافتتاح', 'الشريحة المحورية: ثلاثة أبعاد لرحلة واحدة. المعلم يضبط التنفيذ، والأثر يبرره، والقيادة تحرك الأشخاص. الترتيب من اليمين.');
  T(s, 'جوهر المنهجية', { x: RX(8), y: 0.62, w: 8, h: 0.36, fontSize: 12.5, bold: true, color: K.copper });
  T(s, 'ثلاثة أطر تعيد بناء معادلة الإنجاز', { x: RX(11.9), y: 1.02, w: 11.9, h: 0.9, fontSize: 34, bold: true, color: K.sand });
  const fw = [['01', 'Milestone', 'إطار المعلم', 'من إدارة الزمن إلى قيادة القيمة'], ['02', 'Impact', 'إطار الأثر', 'من إثبات الإنجاز إلى قيادة الأثر'], ['03', 'Leadership', 'إطار القيادة', 'من إدارة المهام إلى قيادة الأشخاص']];
  const pw = (11.9 - 0.5) / 3, ph = 3.55;
  fw.forEach(([n, en, ar, tag], i) => {
    const x = W - M - pw - i * (pw + 0.25), y = 2.3;
    s.addShape(pres.ShapeType.rect, { x, y, w: pw, h: ph, fill: { color: K.slate }, line: { color: K.copper, width: 0.75, transparency: 55 } });
    DIAMOND(s, x + pw / 2 - 0.3, y + 0.35, 0.6, K.gold);
    EN(s, n, { x: x + 0.3, y: y + 1.1, w: pw - 0.6, h: 0.5, fontSize: 20, align: 'center', color: K.copper });
    EN(s, en, { x: x + 0.3, y: y + 1.55, w: pw - 0.6, h: 0.45, fontSize: 18, align: 'center', color: K.dim, charSpacing: 6 });
    T(s, ar, { x: x + 0.3, y: y + 2.05, w: pw - 0.6, h: 0.6, fontSize: 26, bold: true, color: K.sand, align: 'center' });
    T(s, tag, { x: x + 0.3, y: y + 2.7, w: pw - 0.6, h: 0.6, fontSize: 14, color: K.copper, align: 'center' });
  });
  closing(s, 'المعلم يضبط التنفيذ، والأثر يبرّره، والقيادة تقودهما.', K.copper);
}

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

// ═══════════════ إطار المعلم ═══════════════
pres.addSection({ title: 'إطار المعلم' });
divider('إطار المعلم', '01', 'MILESTONE FRAMEWORK', 'إطار المعلم', 'من إدارة الزمن إلى قيادة القيمة', 'الإطار الأول هو الأساس الذي يُبنى عليه الإطاران الآخران.');
{
  const s = sand('إطار المعلم', 'إطار المعلم', 'المعلم نقطة قيادة وتحكّم، لا نقطة زمنية',
    'الفكرة الواحدة: المعلم ليس تاريخًا في الجدول بل نقطة قرار لها خمسة أبعاد. اقرأ الكلمات الخمس من اليمين واشرح كل واحدة بجملة.');
  // خمسة معيّنات على خط ذهبي، والكلمات تحتها
  const words = ['قرار', 'توقيت', 'تحكّم', 'قياس', 'قيمة'];
  const x0 = RX(11.9), xw = 11.9, step = xw / 5;
  LINE(s, x0 + step / 2, 3.35, xw - step, K.gold, 2);
  words.forEach((w, i) => {
    const cx = W - M - step / 2 - i * step;
    DIAMOND(s, cx - 0.3, 3.05, 0.6, K.gold);
    RING(s, cx - 0.62, 2.73, 1.24, K.gold, 1, 55);
    T(s, w, { x: cx - 1.0, y: 4.2, w: 2.0, h: 0.6, fontSize: 24, bold: true, color: K.graphite, align: 'center' });
  });
  T(s, 'خمسة أبعاد يحملها كل معلم', { x: RX(11.9), y: 2.1, w: 11.9, h: 0.45, fontSize: 15, color: K.muted });
  closing(s, 'عندما نعيد تعريف المعلم، ننتقل من إدارة الزمن إلى قيادة القيمة.');
}
{
  const s = sand('إطار المعلم', 'إطار المعلم', 'لكل طبقة معلمها',
    'ثلاث طبقات متداخلة: المشروع في الداخل، يحتويه البرنامج، وتحتويهما المحفظة. ولكل طبقة سؤالها: تحكم عملي، تكامل ومنافع، قرار استراتيجي.');
  // ثلاثة مستطيلات متداخلة على اليمين
  const bx = RX(5.6), by = 2.2;
  s.addShape(pres.ShapeType.roundRect, { x: bx, y: by, w: 5.6, h: 3.8, rectRadius: 0.1, fill: { color: K.sandDeep }, line: { color: K.goldDeep, width: 0.75, transparency: 40 } });
  s.addShape(pres.ShapeType.roundRect, { x: bx + 0.7, y: by + 0.75, w: 4.2, h: 2.3, rectRadius: 0.1, fill: { color: K.white }, line: { color: K.goldDeep, width: 0.75, transparency: 30 } });
  s.addShape(pres.ShapeType.roundRect, { x: bx + 1.4, y: by + 1.5, w: 2.8, h: 0.8, rectRadius: 0.1, fill: { color: K.gold }, line: { width: 0, color: K.gold } });
  T(s, 'المحفظة', { x: bx + 0.3, y: by + 0.18, w: 5.0, h: 0.45, fontSize: 15, bold: true, color: K.graphite });
  T(s, 'البرنامج', { x: bx + 1.0, y: by + 0.9, w: 3.6, h: 0.45, fontSize: 15, bold: true, color: K.graphite });
  T(s, 'المشروع', { x: bx + 1.4, y: by + 1.5, w: 2.8, h: 0.8, fontSize: 18, bold: true, color: K.white, align: 'center', valign: 'middle' });
  // الأسئلة الثلاثة على اليسار
  const rows = [['المحفظة', 'قرار استراتيجي'], ['البرنامج', 'تكامل ومنافع'], ['المشروع', 'تحكّم عملي']];
  rows.forEach(([h, p], i) => {
    const y = 2.45 + i * 1.2;
    DIAMOND(s, M + 5.55, y + 0.17, 0.2, i === 2 ? K.gold : K.goldDeep);
    T(s, h, { x: M, y, w: 5.35, h: 0.45, fontSize: 20, bold: true, color: K.graphite });
    T(s, p, { x: M, y: y + 0.48, w: 5.35, h: 0.4, fontSize: 15, color: K.muted });
  });
  closing(s, 'المعالم جسور تصعد عبرها القيمة من التنفيذ إلى الأثر الاستراتيجي.');
}

// ═══════════════ إطار الأثر ═══════════════
pres.addSection({ title: 'إطار الأثر' });
divider('إطار الأثر', '02', 'IMPACT FRAMEWORK', 'إطار الأثر', 'من إثبات الإنجاز إلى قيادة الأثر', 'الإطار الثاني يجيب في كل تقرير عن سؤال واحد.');
{
  const s = sand('إطار الأثر', 'إطار الأثر', 'ما الذي تغيّر بسببنا؟',
    'السؤال الواحد الذي يجيب عنه كل تقرير أثر. السلسلة من اليمين: المخرجات، النتائج، المنافع، التحوّل، الأثر المستدام. المساءلة تصعد في السلسلة.');
  const chain = ['المخرجات', 'النتائج', 'المنافع', 'التحوّل', 'الأثر\nالمستدام'];
  const shades = [K.slate, '1A4F5D', '275C68', K.goldDeep, K.gold];
  const cw = 11.9 / 5;
  chain.forEach((h, i) => {
    const x = W - M - cw * (i + 1);
    s.addShape(pres.ShapeType.chevron, { x: x + 0.03, y: 2.55, w: cw - 0.06, h: 1.25, flipH: true, fill: { color: shades[i] }, line: { width: 0, color: shades[i] } });
    T(s, h, { x: x + 0.45, y: 2.55, w: cw - 0.75, h: 1.25, fontSize: 15, bold: true, color: K.sand, align: 'center', valign: 'middle' });
  });
  T(s, 'سلسلة القيمة الخماسية', { x: RX(11.9), y: 2.05, w: 11.9, h: 0.45, fontSize: 15, color: K.muted });
  // سهم اتجاه المساءلة
  s.addShape(pres.ShapeType.leftArrow, { x: RX(11.9), y: 4.15, w: 11.9, h: 0.32, fill: { color: K.sandDeep }, line: { width: 0, color: K.sandDeep } });
  T(s, 'تصعد المساءلة: نسلّم المخرجات، ولا يُبرَّر الاستثمار إلا بالأثر', { x: RX(11.9), y: 4.6, w: 11.9, h: 0.45, fontSize: 15, color: K.graphite, align: 'center' });
  closing(s, 'الأثر لا يُدّعى في الختام، بل يُصمَّم من اليوم الأول ويُثبَت بالدليل.');
}
{
  const s = dark('إطار الأثر', 'الأبعاد الخمسة التي لا تنفصل في أي أثر يُدّعى. اقرأها وتوقف عند «منسوب بأمانة»: لغة المساهمة لا الإسناد.');
  T(s, 'إطار الأثر', { x: RX(8), y: 0.62, w: 8, h: 0.36, fontSize: 12.5, bold: true, color: K.copper });
  T(s, 'خمسة أبعاد لا تنفصل', { x: RX(11.9), y: 1.02, w: 11.9, h: 0.9, fontSize: 34, bold: true, color: K.sand });
  const dims = ['مقصود', 'مقيس', 'منسوب بأمانة', 'مملوك', 'مستدام'];
  const cw = 11.9 / 5;
  dims.forEach((d, i) => {
    const cx = W - M - cw / 2 - i * cw;
    RING(s, cx - 0.95, 2.6, 1.9, K.copper, 1.25, 25);
    DIAMOND(s, cx - 0.17, 3.38, 0.34, K.gold);
    T(s, d, { x: cx - 1.2, y: 4.75, w: 2.4, h: 0.6, fontSize: 20, bold: true, color: K.sand, align: 'center' });
  });
  closing(s, 'الأثر مقصود ومقيس ومنسوب بأمانة ومملوك ومستدام.', K.copper);
}

// ═══════════════ إطار القيادة ═══════════════
pres.addSection({ title: 'إطار القيادة' });
divider('إطار القيادة', '03', 'LEADERSHIP FRAMEWORK', 'إطار القيادة', 'من إدارة المهام إلى قيادة الأشخاص', 'المشاريع لا تقودها المنهجيات، يقودها أشخاص يمتلكون الجدارات.');
{
  const s = sand('إطار القيادة', 'إطار القيادة', 'الاستجابة المنضبطة مسار، لا سرعة',
    'السلسلة من اليمين: تلقٍّ، تفهّم، أولوية، تحرّك، إغلاق. السرعة الحقيقية تُكسب في التلقي والتفهّم لا في ضغط التحرّك.');
  const chain = ['تلقٍّ', 'تفهّم', 'أولوية', 'تحرّك', 'إغلاق'];
  const shades = [K.slate, '1A4F5D', '275C68', K.goldDeep, K.gold];
  const cw = 11.9 / 5;
  chain.forEach((h, i) => {
    const x = W - M - cw * (i + 1);
    s.addShape(pres.ShapeType.chevron, { x: x + 0.03, y: 2.55, w: cw - 0.06, h: 1.25, flipH: true, fill: { color: shades[i] }, line: { width: 0, color: shades[i] } });
    T(s, h, { x: x + 0.45, y: 2.55, w: cw - 0.75, h: 1.25, fontSize: 17, bold: true, color: K.sand, align: 'center', valign: 'middle' });
  });
  T(s, 'سلسلة الاستجابة الخماسية', { x: RX(11.9), y: 2.05, w: 11.9, h: 0.45, fontSize: 15, color: K.muted });
  T(s, 'والعهدة التي تنتقل مسؤولية لا ورقة: تسليم موثّق، وتتابع، ورقابة، حتى يتحقق الأثر.', { x: RX(11.9), y: 4.35, w: 11.9, h: 0.6, fontSize: 16, color: K.graphite, align: 'center' });
  closing(s, 'السرعة بلا تفهّم تهوّر، والتفهّم بلا تحرّك تعطيل.');
}
{
  const s = dark('إطار القيادة', 'الجدارات الست بأسمائها فقط: جدارتان من اجتهاد المنهجية، وأربع للتأثير في الاتجاهات. التميّز في اتجاه واحد أشهر أسباب التعثر.');
  T(s, 'إطار القيادة', { x: RX(8), y: 0.62, w: 8, h: 0.36, fontSize: 12.5, bold: true, color: K.copper });
  T(s, 'ست جدارات لقائد المشاريع', { x: RX(11.9), y: 1.02, w: 11.9, h: 0.9, fontSize: 34, bold: true, color: K.sand });
  const comps = ['الاستجابة المنضبطة', 'انتقال العهدة', 'قيادة الذات', 'قيادة الفريق', 'القيادة التحويلية والتبادلية', 'القيادة نحو الأعلى وعبر الحدود'];
  const cw = (11.9 - 0.5) / 3, ch = 1.6;
  comps.forEach((h, i) => {
    const x = W - M - cw - (i % 3) * (cw + 0.25), y = 2.25 + Math.floor(i / 3) * (ch + 0.3);
    s.addShape(pres.ShapeType.rect, { x, y, w: cw, h: ch, fill: { color: K.slate }, line: { color: K.copper, width: 0.75, transparency: 55 } });
    DIAMOND(s, x + cw - 0.35 - 0.26, y + 0.38, 0.26, i < 2 ? K.gold : K.copper);
    T(s, h, { x: x + 0.35, y: y + 0.3, w: cw - 1.05, h: 1.0, fontSize: 18, bold: true, color: K.sand, valign: 'middle' });
  });
  closing(s, 'القيادة تُقرأ في الفريق لا في القائد: توجيه، ومواءمة، والتزام.', K.copper);
}

// ═══════════════ التكامل ═══════════════
pres.addSection({ title: 'التكامل والختام' });
{
  const s = dark('التكامل والختام', 'الدوائر الثلاث المتداخلة: المعلم يضبط، والأثر يبرّر، والقيادة تقود؛ وفي ملتقاها أثر مؤسسي مستدام. اسأل: أين يقف مشروعكم اليوم في كل دائرة؟');
  T(s, 'النموذج المتكامل', { x: RX(8), y: 0.62, w: 8, h: 0.36, fontSize: 12.5, bold: true, color: K.copper });
  T(s, 'ثلاثة أطر، رحلة واحدة', { x: RX(11.9), y: 1.02, w: 11.9, h: 0.9, fontSize: 34, bold: true, color: K.sand });
  const cx = W / 2, cy = 3.75, r = 1.25;
  const circles = [[cx + 0.85, cy - 0.5], [cx - 0.85, cy - 0.5], [cx, cy + 0.85]];
  circles.forEach(([x, y]) => s.addShape(pres.ShapeType.ellipse, { x: x - r, y: y - r, w: 2 * r, h: 2 * r, fill: { color: K.slate, transparency: 35 }, line: { color: K.copper, width: 1.25, transparency: 25 } }));
  // العناوين داخل الأطراف الخارجية لكل دائرة
  T(s, 'إطار المعلم', { x: cx + 0.95, y: cy - 1.25, w: 1.3, h: 0.45, fontSize: 15, bold: true, color: K.sand, align: 'center' });
  T(s, 'يضبط', { x: cx + 0.95, y: cy - 0.82, w: 1.3, h: 0.35, fontSize: 12, color: K.copper, align: 'center' });
  T(s, 'إطار الأثر', { x: cx - 2.25, y: cy - 1.25, w: 1.3, h: 0.45, fontSize: 15, bold: true, color: K.sand, align: 'center' });
  T(s, 'يبرّر', { x: cx - 2.25, y: cy - 0.82, w: 1.3, h: 0.35, fontSize: 12, color: K.copper, align: 'center' });
  T(s, 'إطار القيادة', { x: cx - 0.75, y: cy + 1.05, w: 1.5, h: 0.45, fontSize: 15, bold: true, color: K.sand, align: 'center' });
  T(s, 'يقود', { x: cx - 0.75, y: cy + 1.48, w: 1.5, h: 0.35, fontSize: 12, color: K.copper, align: 'center' });
  DIAMOND(s, cx - 0.18, cy - 0.15, 0.36, K.gold);
  T(s, 'أثر مؤسسي مستدام', { x: cx - 1.1, y: cy + 0.25, w: 2.2, h: 0.4, fontSize: 12, bold: true, color: K.copper, align: 'center' });
  closing(s, 'المشاريع لا تقودها المنهجيات، يقودها أشخاص يمتلكون الجدارات.', K.copper);
}

// ═══════════════ الرحلة ═══════════════
{
  const s = sand('التكامل والختام', 'من المعرفة إلى الممارسة', 'رحلة في ثلاثة أطوار',
    'الربط بالبرنامج: قياس مبدئي يحدد المستوى في كل إطار على حدة، ثم تأهيل على مشروع حقيقي، ثم قياس الأثر وتقرير. للمهتمين: leaders.sunkvalue.com.');
  const phases = [['01', 'القبول', 'ملفك، وقياس مبدئي، واعتماد مسارك'], ['02', 'التأهيل', 'تدريب، وتطبيق على مشروعك، وتوجيه'], ['03', 'الأثر', 'دعم، وقياس ما تغيّر، وشهادة موثّقة']];
  const step = 11.9 / 3;
  LINE(s, RX(11.9) + step / 2, 3.3, 11.9 - step, K.gold, 2);
  phases.forEach(([n, h, p], i) => {
    const cx = W - M - step / 2 - i * step;
    s.addShape(pres.ShapeType.ellipse, { x: cx - 0.6, y: 2.7, w: 1.2, h: 1.2, fill: { color: i === 2 ? K.gold : K.sand }, line: { color: K.gold, width: 2 } });
    EN(s, n, { x: cx - 0.6, y: 2.7, w: 1.2, h: 1.2, fontSize: 26, align: 'center', valign: 'middle', color: i === 2 ? K.white : K.goldDeep, charSpacing: 0 });
    T(s, h, { x: cx - 1.8, y: 4.2, w: 3.6, h: 0.6, fontSize: 24, bold: true, color: K.graphite, align: 'center' });
    T(s, p, { x: cx - 1.8, y: 4.8, w: 3.6, h: 0.8, fontSize: 14, color: K.muted, align: 'center' });
  });
  closing(s, 'تبدأ من حيث أنت فعلًا: مستواك يُقاس في كل إطار على حدة.');
}

// ═══════════════ الختام ═══════════════
{
  const s = dark('التكامل والختام', 'اختم بالسؤال، واطلب من كل مشارك جملة واحدة، ثم اذكر رابط المنصة.');
  DIAMOND(s, 0.9, 1.2, 4.6, K.copper, true, 55);
  DIAMOND(s, 1.7, 2.0, 3.0, K.copper, true, 35);
  DIAMOND(s, 2.5, 2.8, 1.4, K.gold, false);
  T(s, 'سؤال الختام', { x: RX(8), y: 2.1, w: 8, h: 0.4, fontSize: 13, bold: true, color: K.copper });
  T(s, 'ما الممارسة الواحدة التي ستبدأها غدًا؟', { x: RX(8), y: 2.55, w: 8, h: 1.9, fontSize: 40, bold: true, color: K.sand });
  LINE(s, RX(1.6), 4.7, 1.6, K.gold, 2.5);
  T(s, 'شكرًا لكم · النقاش مفتوح', { x: RX(8), y: 4.9, w: 8, h: 0.5, fontSize: 18, color: K.dim });
  EN(s, 'leaders.sunkvalue.com', { x: RX(8), y: 5.45, w: 8, h: 0.5, fontSize: 20, color: K.copper, charSpacing: 2 });
  LOGO(s, true, M, 6.05, 0.62);
}

await pres.writeFile({ fileName: OUT });
await applyTheme(OUT, THEME);
console.log('✓', OUT);
