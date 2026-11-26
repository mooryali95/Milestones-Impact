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
import { documentHtml, docId, PAGE_MM, TYPE_SCALE, mmPx } from './doc.js';

// A4 بدقة 96: 210×297 مم. الهوامش مشتقة من PAGE_MM في doc.js، وهو نفسه مصدر قاعدة @page، والغلاف يبدأ من حافة الورقة
export const PAGE = Object.freeze({ w: mmPx(PAGE_MM.w), h: mmPx(PAGE_MM.h), top: mmPx(PAGE_MM.top), side: mmPx(PAGE_MM.side), bottom: mmPx(PAGE_MM.bottom) });
// pt إلى بكسل بدقة 96
const ptPx = (pt) => (pt * 96) / 72;
const CONTENT_H = PAGE.h - PAGE.top - PAGE.bottom;
const FIRST_H = PAGE.h - PAGE.bottom;
const KEEP_NEXT = 110;
const BLOCKISH = new Set(['block', 'flex', 'grid', 'table', 'table-row', 'list-item', 'table-row-group', 'flow-root']);

/**
 * حدود الصفحات من مواضع الكسر. منطق خالص.
 * @param {{ total: number, cands: { y: number, head?: { top: number, bottom: number } | null }[], forced: number[], pageH?: number, firstH?: number }} input
 * cands مواضع كسر مسموحة (أعلى عنصر يبدأ عنده الكسر)، وhead رأس جدول يتكرر في الصفحة التالية إن كان الكسر بين صفوفه.
 * يعيد [{ start, end, head }]: head رأس الجدول الذي يُرسم أعلى الصفحة قبل محتواها
 */
export function planPages({ total, cands, forced = [], pageH = CONTENT_H, firstH = FIRST_H }) {
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
      const ok = ys.filter((c) => c.y > s + 2 && c.y <= limit);
      const full = ok.filter((c) => c.y >= s + room * 0.3);
      const pick = (full.length ? full : ok).at(-1);
      end = pick ? pick.y : limit;
      next = pick?.head || null;
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
export function chapterAt(heads, start, end) {
  let cur = '';
  for (const h of [...heads].sort((a, b) => a.y - b.y)) {
    if (h.y < start) cur = h.text;
    else if (h.y < end) return h.text;
    else break;
  }
  return cur;
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
  const avoid = [], after = [], forced = [], raw = [];
  for (const el of root.querySelectorAll('*')) {
    const cs = win.getComputedStyle(el);
    if (!BLOCKISH.has(cs.display)) continue;
    const r = rectOf(el, base);
    if (r.bottom - r.top < 1 && cs.breakBefore !== 'page') continue;
    if (cs.breakBefore === 'page' && r.top > 4) forced.push(Math.floor(r.top));
    if ((cs.breakInside === 'avoid' || cs.breakInside === 'avoid-page') && r.bottom - r.top < pageH * 0.9) avoid.push(r);
    if (cs.breakAfter === 'avoid' || cs.breakAfter === 'avoid-page') after.push(r);
    // break-before: avoid (خاتمة الوثيقة): لا كسر قبله ولا بين أوله وما قبله، فلا تبقى الخاتمة وحدها في صفحة أخيرة
    if (cs.breakBefore === 'avoid' || cs.breakBefore === 'avoid-page') after.push({ top: r.top - 140, bottom: r.top - 140 + 0.5, before: r.top });
    // رأس الجدول يتكرر إن انكسر الجدول بين صفوفه
    let head = null;
    if (el.tagName === 'TR' && el.parentElement?.tagName === 'TBODY') {
      const th = el.closest('table')?.querySelector(':scope > thead');
      if (th) head = rectOf(th, base);
    }
    raw.push({ y: Math.floor(r.top), head });
    // أسطر الفقرة الطويلة: كسر بين أسطرها، ويبقى سطران على الأقل في كل جانب (orphans وwidows)
    if ((el.tagName === 'P' || el.tagName === 'LI' || el.tagName === 'TD') && r.bottom - r.top > 120) {
      const range = doc.createRange();
      range.selectNodeContents(el);
      const lines = [...new Set([...range.getClientRects()].map((x) => Math.floor(x.top - base)))].sort((a, b) => a - b);
      lines.slice(2, -2).forEach((y) => raw.push({ y, head, line: true }));
    }
  }
  const cands = raw.filter((c) => c.y > 0
    && !avoid.some((a) => c.y > a.top + 1 && c.y < a.bottom - 1)
    // ما بعد عنوان لا ينفصل عنه (break-after: avoid): يبقى معه نحو أربعة أسطر من محتواه، لا رأس جدول وحده ولا سطر واحد
    && !after.some((a) => (a.before != null ? c.y > a.top && c.y <= a.before + 1 : c.y >= a.bottom - 1 && c.y - a.bottom < KEEP_NEXT)));
  return { total, cands, forced };
}

// ── الرسم ──
const sanitize = (s) => String(s || 'وثيقة').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

// التذييل: «صفحة N من M» والرقم المرجعي بالسلم نفسه (7.5pt وزن 400)، والترويسة: اسم الباب في الطرف المقابل للجهة
function footer(ctx, n, of, scale, line) {
  const y = (PAGE.h - PAGE.bottom / 2) * scale;
  ctx.save();
  ctx.fillStyle = TYPE_SCALE.footerColor;
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.font = `400 ${ptPx(TYPE_SCALE.footer) * scale}px "Noto Kufi Arabic", sans-serif`;
  ctx.fillText(`صفحة ${n} من ${of}`, PAGE.side * scale, y);
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.font = `400 ${ptPx(TYPE_SCALE.footer) * scale}px "Noto Sans", sans-serif`;
  ctx.fillText(line, (PAGE.w - PAGE.side) * scale, y);
  ctx.restore();
}
function chapterHead(ctx, text, scale) {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = TYPE_SCALE.footerColor;
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.font = `400 ${ptPx(TYPE_SCALE.footer) * scale}px "Noto Kufi Arabic", sans-serif`;
  ctx.fillText(text.length > 60 ? `${text.slice(0, 59)}…` : text, PAGE.side * scale, (PAGE.top / 2 + 9) * scale);
  ctx.restore();
}

/**
 * يبني ملف PDF ويعيده Blob. meta وbody كما يبنيهما قالب الوثيقة (capstoneReport)
 * @param {{ onProgress?: (t: string) => void, scale?: number }} [opts]
 */
export async function buildPdf(meta0, body, { onProgress = () => {}, scale = 2 } = {}) {
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
    const plan = planPages(collectBreaks(doc));
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
    // المقاطع: صفحات متتالية حتى نحو 4500 بكسل في كل رسم، لحد ارتفاع اللوحة في المتصفحات
    const chunks = [];
    for (let i = 0; i < plan.length;) {
      let j = i;
      while (j + 1 < plan.length && plan[j + 1].end - plan[i].start <= 4500) j++;
      chunks.push({ from: i, to: j, start: plan[i].start, end: plan[j].end });
      i = j + 1;
    }
    const theads = new Map();
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    pdf.setProperties({ title: meta.title || 'وثيقة', subject: meta.subtitle || '', creator: 'Milestone Impact', author: 'Milestone Impact' });
    // التذييل بالرقم المرجعي للوثيقة، ومعه عنوان الباب لكل صفحة
    const line = meta.id;
    const heads = [...doc.querySelectorAll('.sec > header h2, .in-open h2')].map((h) => ({ y: h.getBoundingClientRect().top - base, text: h.textContent.trim() }));
    const PT = 595.28 / PAGE.w;
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
        const page = document.createElement('canvas');
        page.width = PAGE.w * scale; page.height = PAGE.h * scale;
        const ctx = page.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, page.width, page.height);
        if (k > 0 && runHead) ctx.drawImage(runHead, 0, 0, page.width, PAGE.top * scale);
        if (k > 0 && runHead) chapterHead(ctx, chapterAt(heads, p.start, p.end) || meta.title || '', scale);
        let y = (k === 0 ? 0 : PAGE.top) * scale;
        const hc = p.head && theads.get(p.head.top);
        if (hc) { ctx.drawImage(hc, 0, y); y += hc.height; }
        const h = (p.end - p.start) * scale;
        ctx.drawImage(canvas, 0, (p.start - ch.start) * scale, page.width, h, 0, y, page.width, h);
        footer(ctx, k + 1, plan.length, scale, line);
        if (k > 0) pdf.addPage('a4');
        // JPEG بجودة 0.8: نص حاد بدقة مضاعفة، والملف بحجم يُرسل بالبريد
        pdf.addImage(page.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 595.28, 841.89, undefined, 'FAST');
      }
    }
    // روابط الفهرس: تقفز إلى صفحة القسم داخل الملف
    for (const l of links) {
      const k = pageOf(l.top);
      const p = plan[k];
      const top = (k === 0 ? 0 : PAGE.top) + (p.head ? p.head.bottom - p.head.top : 0) + (l.top - p.start);
      pdf.setPage(k + 1);
      pdf.link(l.left * PT, top * PT, l.w * PT, l.h * PT, { pageNumber: l.to + 1 });
    }
    onProgress('اكتمل الملف');
    return { blob: pdf.output('blob'), pages: plan.length, plan };
  } finally {
    frame.remove();
  }
}

/**
 * الملف المتجهي من الخادم (workers/pdf-render) من HTML الوثيقة نفسه، وإلا الملف المرسوم في المتصفح.
 * server: { url, ticket } من capstone.doc، أو null. يعيد 'server' أو 'browser'
 */
export async function downloadBest(meta, body, { server = null, onProgress = () => {} } = {}) {
  if (server?.url && server?.ticket) {
    try {
      onProgress('يُولَّد الملف…');
      const html = documentHtml({ ...withDocId(meta), selfFonts: true }, body, { print: true, base: `${location.origin}/` });
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

function saveBlob(blob, meta) {
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
