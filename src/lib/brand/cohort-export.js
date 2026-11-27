// ════════════════════════════════════════════════════════════════
// كتاب مبادرات الدفعة (تصور 2026-11-27 باعتماد المالك، المرحلة 2): التوليد بالتتابع والدمج في ملف واحد
// ════════════════════════════════════════════════════════════════
// كل مبادرة من مسارها القائم وحده: admin.doc-export ثم finalDocument (النسخة المؤسسية) فتبقى الوثيقة مصدرًا واحدًا، وتُرسل إلى
// العامل المتجهي (workers/pdf-render) بتذكرتها، وعند 429 انتظار متزايد وإعادة، وإلا البناء في المتصفح (buildPdf). الغلاف والملخص
// التنفيذي وثيقة واحدة بقالب documentHtml نفسه وعلامة الجهة المشتركة (lockup عبر meta.brand من identityOf)، ثم الدمج بـ pdf-lib
// بترقيم متصل. لا يمس هذا الملف مصادر الوثيقة، ويستورد منها فقط.
import { esc, table } from './doc.js';
import { identityOf } from './institutional.js';

export const BOOK_COLUMNS = Object.freeze([
  { key: 'n', label: 'م', width: '7mm' },
  { key: 'full_name', label: 'المشارك' },
  { key: 'initiative', label: 'عنوان المبادرة' },
  { key: 'status', label: 'الحالة' },
  { key: 'readiness', label: 'الجاهزية' },
  { key: 'approved_at', label: 'تاريخ الاعتماد', ltr: true },
  { key: 'code', label: 'رمز التحقق', ltr: true },
]);
// حدود العامل: 20 طلبًا في الدقيقة لكل تذكرة، فالانتظار عند 429 يتضاعف من ثانيتين، وثلاث إعادات ثم المتصفح
export const RETRY_DELAYS = Object.freeze([2000, 4000, 8000]);
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function defaultHtml(meta, body) {
  const [{ documentHtml }, { embedAssets, fetchAsset, withDocId }] = await Promise.all([import('./doc.js'), import('./pdf.js')]);
  return embedAssets(documentHtml({ ...withDocId(meta), selfFonts: true }, body, { print: true, base: `${location.origin}/` }), fetchAsset);
}
async function defaultRaster(meta, body) {
  const { buildPdf } = await import('./pdf.js');
  const { blob } = await buildPdf(meta, body);
  return new Uint8Array(await blob.arrayBuffer());
}

/** ملف وثيقة واحدة: العامل بتذكرتها مع إعادة عند 429، وإلا المتصفح. يعيد { bytes, via } */
export async function renderPart(meta, body, server, { fetchImpl = (...a) => fetch(...a), sleep = pause, raster = defaultRaster, toHtml = defaultHtml, delays = RETRY_DELAYS } = {}) {
  if (server?.url && server?.ticket) {
    try {
      const html = await toHtml(meta, body);
      for (let i = 0; ; i++) {
        const r = await fetchImpl(`${server.url}/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ ticket: server.ticket, html, name: meta.pdfName || meta.title }) });
        if (r.status === 429 && i < delays.length) { await sleep(delays[i]); continue; }
        if (!r.ok || !/pdf/.test(r.headers.get('content-type') || '')) throw new Error(`pdf-render ${r.status}`);
        return { bytes: new Uint8Array(await r.arrayBuffer()), via: 'server' };
      }
    } catch (e) {
      console.warn('cohort book: server pdf unavailable, building in the browser:', e?.message || e);
    }
  }
  return { bytes: await raster(meta, body), via: 'browser' };
}

/** صفوف الملخص التنفيذي من صفوف الخطة ونتائج التوليد ({ [participant_id]: { fingerprint, start } | { error } }) */
export function summaryRows(rows, results = {}) {
  return rows.map((r, i) => {
    const x = results[r.participant_id] || {};
    return {
      n: i + 1, participant_id: r.participant_id, full_name: r.full_name || '', initiative: r.initiative || '',
      status: x.error ? 'تعذر توليدها' : 'معتمدة', readiness: !x.error && r.readiness != null ? `${r.readiness}%` : '',
      approved_at: r.approved_at || '', code: x.error ? '' : x.fingerprint || '', page: x.start || null,
    };
  });
}

/** الغلاف والملخص التنفيذي: meta بهوية الجهة من أول وثيقة (identityOf)، وجسم بجدول الملخص */
export function bookCover({ cohort, docMeta = {}, rows = [], date, volume = { n: 1, of: 1 } }) {
  const { brand } = identityOf(docMeta || {});
  const name = cohort?.name || 'الدفعة';
  const vol = volume.of > 1 ? ` · المجلد ${volume.n} من ${volume.of}` : '';
  const meta = {
    kind: 'BOOK', brand, eyebrow: brand.program || 'برنامج القادة', title: `مبادرات ${name}`,
    subtitle: `المبادرات المعتمدة، النسخة المؤسسية${vol}`, pageAr: true,
    rows: [['الدفعة', name], ['الجهة', brand.name || 'مبادرة مجتمعية'], ['التاريخ', date], ['عدد المبادرات', String(rows.length)]],
    pdfName: `Cohort-Initiatives${volume.of > 1 ? `-${volume.n}` : ''}`,
  };
  const body = `<section class="sec"><header><h2>الملخص التنفيذي</h2></header>
<p>${esc(`يضم هذا الكتاب ${rows.length} مبادرة معتمدة من «${name}» بنسختها المؤسسية، ولكل منها رمز تحقق يثبت مطابقتها لما اعتُمد في المنصة.`)}</p>
${table(BOOK_COLUMNS, rows.map((r) => BOOK_COLUMNS.map((c) => r[c.key] ?? '')))}</section>`;
  return { meta, body };
}

/** يدمج الأجزاء ({ id, bytes }) بالترتيب في ملف واحد ويختم كل صفحة برقمها المتصل. يعيد { bytes, pages, starts } */
export async function mergeBook(parts, { stamp = null, title = '' } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const starts = {};
  for (const p of parts) {
    const src = await PDFDocument.load(p.bytes, { ignoreEncryption: true });
    starts[p.id] = out.getPageCount() + 1;
    for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg);
  }
  const total = out.getPageCount();
  const font = stamp ? null : await out.embedFont(StandardFonts.Helvetica);
  out.getPages().forEach((page, i) => {
    if (stamp) return stamp(page, i + 1, total);
    const t = `${i + 1} / ${total}`;
    const size = 7;
    page.drawText(t, { x: (page.getWidth() - font.widthOfTextAtSize(t, size)) / 2, y: 18, size, font, color: rgb(0.37, 0.44, 0.46) });
  });
  if (title) out.setTitle(title);
  out.setProducer('Milestone Impact');
  return { bytes: await out.save(), pages: total, starts };
}

/** يولد المبادرات واحدة بعد واحدة: part(row) يعيد { bytes, fingerprint }. المتعذر يُجمع ولا يوقف الباقي، والإيقاف بـ signal */
export async function runBook(rows, { part, onProgress = () => {}, signal = null }) {
  const parts = [];
  const failed = [];
  const results = {};
  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) return { parts, failed, results, cancelled: true };
    const r = rows[i];
    onProgress({ done: i, total: rows.length, name: r.full_name || '' });
    try {
      const x = await part(r);
      parts.push({ id: r.participant_id, bytes: x.bytes });
      results[r.participant_id] = { fingerprint: x.fingerprint || null, via: x.via || null };
    } catch (e) {
      failed.push({ participant_id: r.participant_id, full_name: r.full_name || '', message: e?.message || String(e) });
      results[r.participant_id] = { error: e?.message || String(e) };
    }
  }
  return { parts, failed, results, cancelled: !!signal?.aborted };
}

/** يحفظ الكتاب المدمج باسمه عبر saveBlob نفسه (pdf.js) */
export async function saveBook(bytes, meta) {
  const { saveBlob } = await import('./pdf.js');
  saveBlob(new Blob([bytes], { type: 'application/pdf' }), { title: meta.title, pdfName: meta.pdfName });
}
