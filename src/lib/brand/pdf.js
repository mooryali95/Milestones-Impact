// ════════════════════════════════════════════════════════════════
// ملف PDF جاهز من الوثيقة نفسها: يُرسم في المتصفح ويُقسَّم صفحات بقواعد الطباعة نفسها
// ════════════════════════════════════════════════════════════════
// قرار المالك (2026-11-15، الخياران ب وج): الملف يُبنى في متصفح من يطلبه، ونافذة الطباعة باقية بجانبه.
// مصدر واحد لقواعد الصفحات: CSS الوثيقة (break-before وbreak-after وbreak-inside) يحكم الطباعة ويحكم هذا الملف،
// فلا تُكتب قاعدة مرتين. الخطوات:
//   1. الوثيقة في إطار مخفي بعرض A4 (794 بكسل) وبخطوط المنصة.
//   2. collectBreaks يجمع من الإطار مواضع الكسر المسموحة والإجبارية ورؤوس الجداول.
//   3. planPages (منطق خالص مختبر) يختار حد كل صفحة: لا عنوان وحده أسفل الصفحة، ولا صف جدول مقطوع، ولا سطر يتيم.
//   4. تُرسم المقاطع (html-to-image) وتُركَّب صفحات A4 بهوامشها وترقيمها العربي، ويتكرر رأس الجدول المنقسم.
//   5. jsPDF يجمعها ملفًا، وروابط الفهرس تقفز إلى صفحاتها، وأرقام صفحاتها تُكتب في الفهرس.
import { documentHtml, docId, PAGE_MM, TYPE_SCALE, mmPx, WATERMARK, isLiveDoc } from './doc.js';
import { DOC_LIVE_HEAD_AR } from '../../../supabase/functions/leaders-api/labels.js';

// A4 بدقة 96: 210×297 مم. الهوامش مشتقة من PAGE_MM في doc.js، وهو نفسه مصدر قاعدة @page، والغلاف يبدأ من حافة الورقة
export const PAGE = Object.freeze({ w: mmPx(PAGE_MM.w), h: mmPx(PAGE_MM.h), top: mmPx(PAGE_MM.top), side: mmPx(PAGE_MM.side), bottom: mmPx(PAGE_MM.bottom) });
// pt إلى بكسل بدقة 96
const ptPx = (pt) => (pt * 96) / 72;
const CONTENT_H = PAGE.h - PAGE.top - PAGE.bottom;
// المرحلة 5: الغلاف بلا تذييل، فيمتد إلى حافة الورقة
const FIRST_H = PAGE.h;
const KEEP_NEXT = 110;
const KEEP_LABEL = 30;
const BLOCKISH = new Set(['block', 'flex', 'grid', 'table', 'table-row', 'list-item', 'table-row-group', 'flow-root']);

/**
 * حدود الصفحات من مواضع الكسر. منطق خالص.
 * @param {{ total: number, cands: { y: number, head?: { top: number, bottom: number } | null }[], forced: number[], pageH?: number, firstH?: number }} input
 * cands مواضع كسر مسموحة (أعلى عنصر يبدأ عنده الكسر)، وhead رأس جدول يتكرر في الصفحة التالية إن كان الكسر بين صفوفه.
 * يعيد [{ start, end, head }]: head رأس الجدول الذي يُرسم أعلى الصفحة قبل محتواها
 */
// lines: صناديق أسطر النص والصور وصفوف الجداول [{ top, bottom }]، وheads: صناديق العناوين. القطع لا يقع داخل أي منها أبدًا،
// ولا يبقى عنوان آخر الصفحة بلا سطر بعده: صفحة أقصر قليلًا مقبولة، والسطر المقطوع والعنوان المقسوم غير مقبولين
export function safeEnd(y, s, { lines = [], heads = [] } = {}) {
  let end = y;
  for (let i = 0; i < 8; i++) {
    const inBox = [...lines, ...heads].filter((b) => end > b.top + 0.5 && end < b.bottom - 0.5 && b.top > s + 2).sort((a, b) => a.top - b.top)[0];
    // العنوان اليتيم: الكسر بعد العنوان مباشرة (قبل أول سطر يليه) يرد إلى أعلى العنوان
    const orphan = heads.find((h) => end >= h.bottom - 0.5 && end <= h.bottom + ORPHAN_GAP && h.top > s + 2);
    const back = inBox?.top ?? orphan?.top;
    if (back == null || back >= end) break;
    end = back;
  }
  return end;
}
const ORPHAN_GAP = 48;

export function planPages(input) {
  // المرحلة 6: الصلب الممتلئ مقدَّم على اللين، إلا إن زاد ذلك الوثيقة صفحة؛ فحينها يُقبل أبعد كسر لين يملأ الصفحة أكثر من الصلب
  // (عقد مدى صفحات الشكل document-forms.js يسري على البديل المصور كما على المتجهي)
  const strict = planWith(input, false);
  const loose = planWith(input, true);
  return loose.length < strict.length ? loose : strict;
}

function planWith({ total, cands, forced = [], pageH = CONTENT_H, firstH = FIRST_H, lines = [], heads = [] }, preferFill) {
  const ys = [...cands].sort((a, b) => a.y - b.y);
  const fs = [...new Set(forced)].sort((a, b) => a - b);
  const pages = [];
  let s = 0, head = null;
  for (let guard = 0; s < total - 2 && guard < 500; guard++) {
    const room = (pages.length ? pageH : firstH) - (head ? head.bottom - head.top : 0);
    const limit = s + room;
    if (limit >= total) { pages.push({ start: s, end: total, head }); break; }
    const f = fs.find((y) => y > s + 2 && y <= limit);
    let end, next = null;
    if (f != null) end = f;
    else {
      // أبعد كسر مسموح يملأ الصفحة، بشرط ألا تبقى الصفحة شبه فارغة؛ فإن لم يوجد فأي كسر مسموح، ثم القطع عند الحد
      // المرحلة 5: الكسر اللين (soft) داخل كتلة break-inside: avoid يُقبل حين لا كسر صلب يملأ الصفحة، فلا تبقى صفحة تحت 25%
      const ok = ys.filter((c) => c.y > s + 2 && c.y <= limit);
      const hard = ok.filter((c) => !c.soft);
      const full = hard.filter((c) => c.y >= s + room * 0.3);
      const softFull = ok.filter((c) => c.soft && c.y >= s + room * 0.3);
      const sparse = preferFill && full.length && softFull.at(-1)?.y > full.at(-1).y;
      const pick = (sparse ? softFull : full.length ? full : softFull.length ? softFull : hard.length ? hard : ok).at(-1);
      if (pick) { end = pick.y; next = pick.head || null; }
      else {
        // لا كسر مسموح في النافذة: الحد نفسه إن وقع في فراغ واضح (4 بكسل فأكثر عن أي سطر)، وإلا أعلى آخر سطر أو صندوق يبدأ فيها
        const boxes = [...lines, ...heads];
        const clear = !boxes.some((b) => limit > b.top - 4 && limit < b.bottom + 4);
        const tops = boxes.map((b) => b.top).filter((y) => y > s + 2 && y <= limit).sort((a, b) => a - b);
        end = clear || !tops.length ? limit : tops.at(-1);
      }
      const safe = safeEnd(end, s, { lines, heads });
      if (safe > s + 2) end = safe;
      // رجع الحد فوق رأس الجدول: الرأس نفسه يبدأ الصفحة التالية، فلا يُكرر فوقه نسخة ثانية
      if (next && end < next.bottom - 0.5) next = null;
    }
    pages.push({ start: s, end, head });
    s = end;
    head = next;
  }
  return pages;
}

/**
 * اسم الباب في ترويسة صفحة، كما تفعل string(chapter) في الطباعة: أول باب يبدأ في الصفحة، وإلا آخر باب بدأ قبلها. منطق خالص.
 * @param {{ y: number, text: string }[]} heads عناوين الأبواب بمواضعها
 */
// الصفحة التي تبدأ بتتمة باب سابق تحمل اسمه هو (لا اسم باب يبدأ في أسفلها): الباب الجديد يُسمّي الصفحة إن بدأ في أعلاها
export const HEAD_TOP = 80;
export function chapterAt(heads, start, end) {
  let cur = '';
  for (const h of [...heads].sort((a, b) => a.y - b.y)) {
    if (h.y < start) cur = h.text;
    else if (h.y < end) return !cur || h.y - start <= HEAD_TOP ? h.text : cur;
    else break;
  }
  return cur;
}

/** الفهرس الجانبي (outline) من عناوين الأبواب: [{ title, page }] بترقيم يبدأ من 1، بلا فارغ ولا تكرار متتال. منطق خالص */
export function outlineItems(heads, pageOf) {
  const out = [];
  for (const h of [...heads].sort((a, b) => a.y - b.y)) {
    const title = String(h.text || '').replace(/\s+/g, ' ').trim();
    if (!title || out.at(-1)?.title === title) continue;
    out.push({ title, page: Math.max(0, pageOf(h.y)) + 1 });
  }
  return out;
}

/** يثبّت الرقم المرجعي مرة واحدة: الغلاف والتذييل وترويسة الطباعة من المصدر نفسه. منطق خالص. */
export const withDocId = (meta = {}) => (meta.id ? meta : { ...meta, id: docId(meta.kind || 'DOC') });

// ── القياس في الإطار ──
const rectOf = (el, base) => { const r = el.getBoundingClientRect(); return { top: r.top - base, bottom: r.bottom - base, left: r.left, right: r.right }; };

/** مواضع الكسر من قواعد CSS في الوثيقة المرسومة: { total, cands, forced } */
export function collectBreaks(doc, pageH = CONTENT_H) {
  const win = doc.defaultView;
  const root = doc.querySelector('.sheet');
  const base = root.getBoundingClientRect().top;
  const total = Math.ceil(root.getBoundingClientRect().height);
  const avoid = [], after = [], forced = [], raw = [], lines = [], heads = [];
  for (const el of root.querySelectorAll('*')) {
    const cs = win.getComputedStyle(el);
    if (!BLOCKISH.has(cs.display)) continue;
    const r = rectOf(el, base);
    if (r.bottom - r.top < 1 && cs.breakBefore !== 'page') continue;
    if (cs.breakBefore === 'page' && r.top > 4) forced.push(Math.floor(r.top));
    if ((cs.breakInside === 'avoid' || cs.breakInside === 'avoid-page') && r.bottom - r.top < pageH * 0.9) avoid.push(r);
    // المرحلة 6: break-after: page كسر إجباري عند نهايته، والغلاف (أول الوثيقة) ما داخله لين لا يُختار ولو جاوز طوله 90% من الصفحة
    if (cs.breakAfter === 'page' && r.bottom > 4) { forced.push(Math.floor(r.bottom)); if (r.top < 4) avoid.push(r); }
    // العنوان: h1-h4 ورأس القسم، وتسمية الحقل ذات الشريط (.cp-f > b مثل «كيف يحدث التغيير») فلا تبقى وحدها أسفل الصفحة
    const isHead = /^H[1-4]$/.test(el.tagName) || (el.tagName === 'HEADER' && el.parentElement?.classList.contains('sec'))
      || (el.tagName === 'B' && el.parentElement?.classList.contains('cp-f') && el === el.parentElement.firstElementChild);
    if (isHead && r.bottom - r.top < pageH * 0.4) heads.push(r);
    if (/^(IMG|SVG|CANVAS|FIGURE|TR)$/i.test(el.tagName) && r.bottom - r.top < pageH * 0.9) lines.push({ top: r.top, bottom: r.bottom });
    // العنوان يبقى معه نحو أربعة أسطر؛ والوسم الصغير (تسمية حقل) يبقى معه سطره الأول وحده، فلا يمحو بداية الفصل التالي
    if (cs.breakAfter === 'avoid' || cs.breakAfter === 'avoid-page' || isHead) after.push({ ...r, keep: isHead ? KEEP_NEXT : KEEP_LABEL });
    // break-before: avoid (خاتمة الوثيقة): لا كسر قبله ولا بين أوله وما قبله، فلا تبقى الخاتمة وحدها في صفحة أخيرة
    if (cs.breakBefore === 'avoid' || cs.breakBefore === 'avoid-page') after.push({ top: r.top - 140, bottom: r.top - 140 + 0.5, before: r.top });
    // رأس الجدول يتكرر إن انكسر الجدول بين صفوفه
    let head = null;
    if (el.tagName === 'TR' && el.parentElement?.tagName === 'TBODY') {
      const th = el.closest('table')?.querySelector(':scope > thead');
      if (th) head = rectOf(th, base);
    }
    // الصف الأخير لا ينتقل وحده مع رأس مكرر إلى صفحة جديدة (صف يتيم): لا كسر قبله، فيبقى مع ما قبله
    const widowRow = el.tagName === 'TR' && el.parentElement?.tagName === 'TBODY' && !el.nextElementSibling && el.previousElementSibling;
    if (!widowRow) raw.push({ y: Math.floor(r.top), head });
    // أسطر الفقرة الطويلة: كسر بين أسطرها، ويبقى سطران على الأقل في كل جانب (orphans وwidows)
    if (doc.createRange && (/^(P|LI|TD|TH|H[1-6]|DT|DD|B|SPAN|SMALL|A)$/.test(el.tagName) || (el.tagName === 'DIV' && !el.firstElementChild))) {
      const range = doc.createRange();
      range.selectNodeContents(el);
      for (const x of range.getClientRects()) if (x.height > 2) lines.push({ top: x.top - base, bottom: x.bottom - base });
      if ((el.tagName === 'P' || el.tagName === 'LI' || el.tagName === 'TD') && r.bottom - r.top > 120) {
        const ls = [...new Set([...range.getClientRects()].map((x) => Math.floor(x.top - base)))].sort((a, b) => a - b);
        ls.slice(2, -2).forEach((y) => raw.push({ y, head, line: true }));
      }
    }
  }
  // ما بعد عنوان لا ينفصل عنه (break-after: avoid): يبقى معه نحو أربعة أسطر من محتواه، لا رأس جدول وحده ولا سطر واحد
  // وما داخل كتلة لا تنقسم يبقى كسرًا لينًا (soft) لا يُختار إلا لتجنب صفحة شبه فارغة (planPages)
  const cands = raw.filter((c) => c.y > 0
    && !after.some((a) => (a.before != null ? c.y > a.top && c.y <= a.before + 1 : c.y >= a.bottom - 1 && c.y - a.bottom < (a.keep ?? KEEP_NEXT))))
    .map((c) => (avoid.some((a) => c.y > a.top + 1 && c.y < a.bottom - 1) ? { ...c, soft: true } : c));
  return { total, cands, forced, lines, heads };
}

// ── الرسم ──
// البديل المصور (تصور الفخامة، المرحلة 1، الخيار ب): المسار المتجهي على الخادم هو الأصل، وهذا الملف بديل حين يتعذر.
// مقياس 3 (نحو 288 نقطة في البوصة) بدل 2، ولا طبقة نص خفية: jsPDF لا يشكّل الحروف العربية بلا خط مضمّن، وطبقة بحروف
// منفصلة تضلل البحث والنسخ. فيُعلَّم الملف صراحة: «نسخة مصورة» في تذييل كل صفحة، وscanned-copy في كلماته المفتاحية
// (scripts/pdf-path.mjs يقرؤها). المقاطع تقصر بالمقياس فتبقى اللوحة دون حد مساحتها في Safari
export const RASTER_SCALE = 3;
export const SCANNED_NOTE_AR = 'نسخة مصورة';
// حد Safari مساحة لا ارتفاع: 16777216 بكسل للوحة، فعرض الصفحة 794 بمقياس 3 يحتمل نحو 2340 بكسل CSS (صفحتان إلا قليلًا)، لا 3000
const CANVAS_AREA = 16 * 1024 * 1024;
export const CHUNK_PX = (scale) => Math.min(Math.floor(9000 / scale), Math.floor(CANVAS_AREA / (Math.ceil(PAGE.w * scale) * scale)) - 1);
const sanitize = (s) => String(s || 'وثيقة').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

// المرحلة 30: الترويسة والتذييل يُرسمان على لوحات من مستند الإطار (حيث حُمّلت خطوط الوثيقة) بعد انتظار الخطين بوزنهما وحجمهما،
// كما فعلت المرحلة 28 بالعلامة المائية، فلا يقعان على الخط البديل. CHROME_FONTS مصدر الخطين للرسم والانتظار معًا
export const CHROME_FONTS = Object.freeze({ ar: '"Noto Kufi Arabic", sans-serif', latin: '"Noto Sans", sans-serif' });
export async function loadChromeFonts(doc, scale = 2, sample = 'صفحة ١') {
  const px = ptPx(TYPE_SCALE.footer) * scale;
  try {
    await Promise.all([doc.fonts?.load?.(`400 ${px}px "Noto Kufi Arabic"`, sample), doc.fonts?.load?.(`400 ${px}px "Noto Sans"`, 'MI-CP-0 V1')]);
  } catch { /* الخط البديل أهون من فشل الملف */ }
}

// التذييل: «صفحة N من M» والرقم المرجعي بالسلم نفسه (7.5pt وزن 400)، والترويسة: اسم الباب في الطرف المقابل للجهة
function footer(ctx, n, of, scale, line) {
  const y = (PAGE.h - PAGE.bottom / 2) * scale;
  ctx.save();
  ctx.fillStyle = TYPE_SCALE.footerColor;
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.font = `400 ${ptPx(TYPE_SCALE.footer) * scale}px ${CHROME_FONTS.ar}`;
  ctx.fillText(`صفحة ${n} من ${of} · ${SCANNED_NOTE_AR}`, PAGE.side * scale, y);
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.font = `400 ${ptPx(TYPE_SCALE.footer) * scale}px ${CHROME_FONTS.latin}`;
  ctx.fillText(line, (PAGE.w - PAGE.side) * scale, y);
  ctx.restore();
}
function chapterHead(ctx, text, scale) {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = TYPE_SCALE.footerColor;
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.font = `400 ${ptPx(TYPE_SCALE.footer) * scale}px ${CHROME_FONTS.ar}`;
  ctx.fillText(text.length > 60 ? `${text.slice(0, 59)}…` : text, PAGE.side * scale, (PAGE.top / 2 + 9) * scale);
  ctx.restore();
}

// المرحلة 28: العلامة المائية للحية طبقةٌ بـ jsPDF فوق كل صفحة (الغلاف معها)، بشفافية GState لا بلون مخفف في الصورة.
// النص العربي يُشكَّل في لوحة (jsPDF لا يصل الحروف العربية) ويُضاف صورة شفافة، والزاوية والحجم واللون من WATERMARK في doc.js
const A4 = { w: 595.28, h: 841.89 };
// اللوحة تُنشأ من مستند الإطار الذي حُمّلت فيه خطوط الوثيقة، وننتظر الخط بوزنه وحجمه قبل الرسم فلا يقع على الخط البديل
export async function watermarkCanvas(scale = 2, doc = document) {
  const font = `500 ${ptPx(WATERMARK.size) * scale}px "Noto Kufi Arabic"`;
  try { await doc.fonts?.load?.(font, WATERMARK.text); } catch { /* الخط البديل أهون من فشل الملف */ }
  const c = doc.createElement('canvas');
  c.width = PAGE.w * scale; c.height = PAGE.h * scale;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((-WATERMARK.angle * Math.PI) / 180);
  ctx.fillStyle = WATERMARK.color;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${ptPx(WATERMARK.size) * scale}px "Noto Kufi Arabic", sans-serif`;
  ctx.fillText(WATERMARK.text, 0, 0);
  return c.toDataURL('image/png');
}
export function stampWatermark(pdf, png) {
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.saveGraphicsState();
    pdf.setGState(new pdf.GState({ opacity: WATERMARK.opacity }));
    pdf.addImage(png, 'PNG', 0, 0, A4.w, A4.h, 'mi-watermark', 'FAST');
    pdf.restoreGraphicsState();
  }
  return n;
}

/**
 * يبني ملف PDF ويعيده Blob. meta وbody كما يبنيهما قالب الوثيقة (capstoneReport)
 * @param {{ onProgress?: (t: string) => void, scale?: number }} [opts]
 */
export async function buildPdf(meta0, body, { onProgress = () => {}, scale = RASTER_SCALE } = {}) {
  // الرقم المرجعي يُولَّد مرة واحدة فيطابق الغلافُ التذييلَ
  const meta = withDocId(meta0);
  onProgress('يُجهَّز الملف…');
  const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', top: '0', left: '-12000px', width: `${PAGE.w}px`, height: `${PAGE.h}px`, border: '0', opacity: '0', pointerEvents: 'none' });
  frame.srcdoc = documentHtml({ ...meta, selfFonts: true }, body, { pdf: true });
  document.body.appendChild(frame);
  try {
    await new Promise((ok) => { frame.onload = ok; });
    const doc = frame.contentDocument;
    await doc.fonts.ready;
    await Promise.all([...doc.images].map((im) => (im.complete ? null : new Promise((ok) => { im.onload = ok; im.onerror = ok; }))));
    const root = doc.querySelector('.sheet');
    // الغلاف المؤسسي (بجهة) صفحة كاملة إلى الحافة؛ والوثيقة بلا جهة تبقي هامشها السفلي في الصفحة الأولى
    const plan = planPages({ ...collectBreaks(doc), firstH: meta.brand ? FIRST_H : PAGE.h - PAGE.bottom });
    const pageOf = (y) => Math.max(0, plan.findIndex((p) => y >= p.start && y < p.end));

    // أرقام صفحات الفهرس تُكتب في مواضعها المحجوزة قبل الرسم (لا يتغير بها التخطيط)
    const base = root.getBoundingClientRect().top;
    const links = [];
    for (const a of doc.querySelectorAll('a[href^="#"]')) {
      const target = doc.getElementById(a.getAttribute('href').slice(1));
      if (!target) continue;
      const tp = pageOf(target.getBoundingClientRect().top - base);
      const slot = a.closest('li')?.querySelector('.cp-pgno');
      if (slot) slot.textContent = String(tp + 1);
      const r = a.closest('li')?.getBoundingClientRect() || a.getBoundingClientRect();
      links.push({ top: r.top - base, h: r.height, left: r.left, w: r.width, to: tp });
    }

    const fontEmbedCSS = await getFontEmbedCSS(root);
    // ترويسة الصفحات بعد الغلاف (doc.js runningHead): تُرسم مرة وتتكرر
    const headEl = doc.getElementById('pdf-head');
    const runHead = headEl ? await toCanvas(headEl, { width: PAGE.w, height: PAGE.top, pixelRatio: scale, fontEmbedCSS, backgroundColor: '#ffffff', cacheBust: false }) : null;
    // المقاطع: صفحات متتالية حتى CHUNK_PX في كل رسم (نحو 2340 بكسل بمقياس 3)، لحد مساحة اللوحة في المتصفحات
    const chunks = [];
    for (let i = 0; i < plan.length;) {
      let j = i;
      while (j + 1 < plan.length && plan[j + 1].end - plan[i].start <= CHUNK_PX(scale)) j++;
      chunks.push({ from: i, to: j, start: plan[i].start, end: plan[j].end });
      i = j + 1;
    }
    const theads = new Map();
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    pdf.setProperties({ title: meta.title || 'وثيقة', subject: [meta.subtitle, SCANNED_NOTE_AR].filter(Boolean).join(' · '), keywords: 'scanned-copy', creator: 'Milestone Impact', author: 'Milestone Impact' });
    // التذييل بالرقم المرجعي للوثيقة، ومعه عنوان الباب لكل صفحة
    // والبصمة المجمّدة معه للمعتمدة (meta.footer، المرحلة 32)
    const line = meta.footer || meta.id;
    const heads = [...doc.querySelectorAll('.sec > header h2, .in-open h2')].map((h) => ({ y: h.getBoundingClientRect().top - base, text: h.textContent.trim() }));
    const PT = 595.28 / PAGE.w;
    await loadChromeFonts(doc, scale, `${heads.map((h) => h.text).join(' ')} ${DOC_LIVE_HEAD_AR} صفحة ١ من ٢ ${SCANNED_NOTE_AR}`);
    for (const ch of chunks) {
      onProgress(`صفحة ${ch.to + 1} من ${plan.length}…`);
      const canvas = await toCanvas(root, {
        width: PAGE.w, height: ch.end - ch.start, pixelRatio: scale, fontEmbedCSS, backgroundColor: '#ffffff', cacheBust: false,
        style: { transform: `translateY(${-ch.start}px)`, transformOrigin: 'top right', margin: '0' },
      });
      // رؤوس الجداول التي تتكرر تُقتطع من مقطعها حين تمر
      for (const p of plan) {
        if (p.head && !theads.has(p.head.top) && p.head.top >= ch.start && p.head.bottom <= ch.end) {
          const hc = document.createElement('canvas');
          hc.width = PAGE.w * scale; hc.height = Math.ceil((p.head.bottom - p.head.top) * scale);
          hc.getContext('2d').drawImage(canvas, 0, (p.head.top - ch.start) * scale, hc.width, hc.height, 0, 0, hc.width, hc.height);
          theads.set(p.head.top, hc);
        }
      }
      for (let k = ch.from; k <= ch.to; k++) {
        const p = plan[k];
        const page = doc.createElement('canvas');
        page.width = PAGE.w * scale; page.height = PAGE.h * scale;
        const ctx = page.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, page.width, page.height);
        if (k > 0 && runHead) ctx.drawImage(runHead, 0, 0, page.width, PAGE.top * scale);
        if (k > 0 && runHead) chapterHead(ctx, isLiveDoc(meta) ? DOC_LIVE_HEAD_AR : (chapterAt(heads, p.start, p.end) || meta.title || ''), scale);
        let y = (k === 0 ? 0 : PAGE.top) * scale;
        const hc = p.head && theads.get(p.head.top);
        if (hc) { ctx.drawImage(hc, 0, y); y += hc.height; }
        const h = (p.end - p.start) * scale;
        ctx.drawImage(canvas, 0, (p.start - ch.start) * scale, page.width, h, 0, y, page.width, h);
        // الغلاف بلا رقم صفحة ولا مرجع تذييل
        if (k > 0) footer(ctx, k + 1, plan.length, scale, line);
        if (k > 0) pdf.addPage('a4');
        // JPEG بجودة 0.8: نص حاد بمقياس 3، والملف بحجم يُرسل بالبريد
        pdf.addImage(page.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 595.28, 841.89, undefined, 'FAST');
      }
    }
    if (isLiveDoc(meta)) stampWatermark(pdf, await watermarkCanvas(scale, doc));
    // روابط الفهرس: تقفز إلى صفحة القسم داخل الملف
    for (const l of links) {
      const k = pageOf(l.top);
      const p = plan[k];
      const top = (k === 0 ? 0 : PAGE.top) + (p.head ? p.head.bottom - p.head.top : 0) + (l.top - p.start);
      pdf.setPage(k + 1);
      pdf.link(l.left * PT, top * PT, l.w * PT, l.h * PT, { pageNumber: l.to + 1 });
    }
    // الفهرس الجانبي (المرحلة 5): باب لكل عنوان، كما يولّده المسار المتجهي (outline: true في workers/pdf-render)
    for (const it of outlineItems(heads, pageOf)) pdf.outline.add(null, it.title, { pageNumber: it.page });
    onProgress('اكتمل الملف');
    return { blob: pdf.output('blob'), pages: plan.length, plan };
  } finally {
    frame.remove();
  }
}

// ── المرحلة 30: تضمين الخطوط والشعارات في HTML الخادم ──
// العامل يطبع HTML بلا سكربت وشبكته محصورة في أصول التطبيقات؛ التضمين يجعل الملف لا يعتمد على شبكته أصلًا، فيطابق ما يُرى في المتصفح.
// الخطوط مقتطعة سلفًا في /fonts (مجموعات unicode-range)، وتُضمَّن data:font/woff2;base64. الشعار المحلي (/...) data URI.
// ما يتعذر جلبه يبقى رابطه كما هو (مع <base>)، فلا يفشل الملف بسببه. منطق خالص بجالب يُمرَّر
// يقبل أي ترتيب للسمات وأي سمات زائدة (crossorigin...) فلا يتوقف التضمين بصمت إن تغير الوسم في doc.js
const FONT_LINK = /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*?\bhref=["'](\/fonts\/[\w.-]+\.css)["'][^>]*>/g;
const LOCAL_SRC = /(<img\b[^>]*?\ssrc=")(\/(?!\/)[^"]+)(")/g;
const LOCAL_URL = /url\((['"]?)(\/(?!\/)[^)'"]+)\1\)/g;

/** @param {string} html @param {(path: string, as: 'text' | 'data') => Promise<string>} get */
export async function embedAssets(html, get) {
  const memo = new Map();
  const once = (path, as) => { const k = `${as}:${path}`; if (!memo.has(k)) memo.set(k, Promise.resolve().then(() => get(path, as)).catch(() => null)); return memo.get(k); };
  const replaceAsync = async (str, re, fn) => {
    const outs = await Promise.all([...str.matchAll(re)].map((m) => fn(...m)));
    let i = 0;
    return str.replace(re, () => outs[i++]);
  };
  let out = await replaceAsync(html, FONT_LINK, async (whole, href) => {
    const css = await once(href, 'text');
    if (!css) return whole;
    const inlined = await replaceAsync(css, LOCAL_URL, async (u, q, path) => { const d = await once(path, 'data'); return d ? `url(${d})` : u; });
    return `<style data-embedded="${href}">${inlined.replace(/<\/style/gi, '<\\/style')}</style>`;
  });
  out = await replaceAsync(out, LOCAL_SRC, async (whole, pre, path, post) => { const d = await once(path.replace(/&amp;/g, '&'), 'data'); return d ? `${pre}${d}${post}` : whole; });
  return out;
}

/** جالب المتصفح لـ embedAssets: من أصل الصفحة نفسها، نصًا أو data URI */
export async function fetchAsset(path, as) {
  const r = await fetch(new URL(path, location.origin), { cache: 'force-cache' });
  if (!r.ok) throw new Error(`asset ${r.status}`);
  if (as === 'text') return r.text();
  const blob = await r.blob();
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = no; fr.readAsDataURL(blob); });
}

/**
 * الملف المتجهي من الخادم (workers/pdf-render) من HTML الوثيقة نفسه، وإلا الملف المرسوم في المتصفح.
 * server: { url, ticket } من capstone.doc، أو null. يعيد 'server' أو 'browser'
 */
export async function downloadBest(meta, body, { server = null, onProgress = () => {} } = {}) {
  if (server?.url && server?.ticket) {
    try {
      onProgress('يُولَّد الملف…');
      const html = await embedAssets(documentHtml({ ...withDocId(meta), selfFonts: true }, body, { print: true, base: `${location.origin}/` }), fetchAsset);
      const r = await fetch(`${server.url}/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ ticket: server.ticket, html, name: meta.pdfName || meta.title }) });
      if (!r.ok || !/pdf/.test(r.headers.get('content-type') || '')) throw new Error(`pdf-render ${r.status}`);
      saveBlob(await r.blob(), meta);
      onProgress('اكتمل الملف');
      return 'server';
    } catch (e) {
      console.warn('server pdf unavailable, building in the browser:', e?.message || e);
    }
  }
  await downloadPdf(meta, body, { onProgress });
  return 'browser';
}

export function saveBlob(blob, meta) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitize(meta.pdfName || meta.title)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** يبني الملف ويحفظه باسمه. الرابط يُنقر في نافذة المنصة التي أنشأت الملف: نافذة الوثيقة (about:blank) تتجاهل اسم الملف */
export async function downloadPdf(meta, body, { onProgress } = {}) {
  const { blob, pages } = await buildPdf(meta, body, { onProgress });
  const url = URL.createObjectURL(blob);
  const saveIn = window;
  const a = saveIn.document.createElement('a');
  a.href = url;
  a.download = `${sanitize(meta.pdfName || meta.title)}.pdf`;
  saveIn.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return pages;
}
