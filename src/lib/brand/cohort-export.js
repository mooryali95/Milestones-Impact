// ════════════════════════════════════════════════════════════════
// كتاب مبادرات الدفعة (تصور 2026-11-27 باعتماد المالك، المرحلة 2): التوليد بالتتابع والدمج في ملف واحد
// ════════════════════════════════════════════════════════════════
// كل مبادرة من مسارها القائم وحده: admin.doc-export ثم finalDocument (النسخة المؤسسية) فتبقى الوثيقة مصدرًا واحدًا، وتُرسل إلى
// العامل المتجهي (workers/pdf-render) بتذكرتها، وعند 429 انتظار متزايد وإعادة، وإلا البناء في المتصفح (buildPdf). الغلاف والملخص
// التنفيذي وثيقة واحدة بقالب documentHtml نفسه وعلامة الجهة المشتركة (lockup عبر meta.brand من identityOf)، ثم الدمج بـ pdf-lib
// بترقيم متصل. لا يمس هذا الملف مصادر الوثيقة، ويستورد منها فقط.
// المرحلة 3: فهرس في الغلاف بروابط تقفز إلى صفحة بداية كل مبادرة، وإشارات مرجعية بمستويين (المبادرة ثم فصولها من outline
// ملفها)، وتخزين مؤقت في IndexedDB ببصمة الوثيقة فيعيد الاستئناف ما لم يتغير دون توليد.
// المرحلة 4: تقسيم تلقائي إلى أجزاء مرقمة إن تجاوز الملف نحو 80MB أو 600 صفحة، وZIP اختياري للمبادرات منفردة (fflate).
import { PDFHexString, PDFName } from 'pdf-lib';
import { strToU8, zipSync } from 'fflate';
import { esc, raw, table } from './doc.js';
import { identityOf } from './institutional.js';
import { issuedFingerprint } from '../../../supabase/functions/leaders-api/doc-quality.js';

/** رمز التحقق المطبوع في الوثيقة المعتمدة: البصمة المجمدة (verifyMark) لا بصمة النسخة الحية */
export const bookCode = (doc) => issuedFingerprint(doc);

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

// روابط الفهرس في الغلاف عناوين بهذه البادئة، تحولها mergeBook إلى قفزة داخلية لصفحة البداية
export const TOC_PREFIX = 'https://toc.invalid/';
export const tocHref = (id) => `${TOC_PREFIX}${encodeURIComponent(id)}`;
const TOC_COLUMNS = [{ key: 'n', label: 'م', width: '7mm' }, { key: 'full_name', label: 'المشارك' }, { key: 'initiative', label: 'المبادرة' }, { key: 'page', label: 'الصفحة', width: '16mm' }];
function tocSection(rows) {
  const list = rows.filter((r) => r.status !== 'تعذر توليدها');
  if (!list.length) return '';
  const link = (r, v) => raw(`<a href="${esc(tocHref(r.participant_id))}">${esc(v ?? '')}</a>`);
  return `<section class="sec"><header><h2>الفهرس</h2></header>
${table(TOC_COLUMNS, list.map((r) => [r.n, r.full_name, link(r, r.initiative), r.page ? link(r, String(r.page)) : '']))}</section>`;
}

/** صفحة بداية كل مبادرة إن سبقتها صفحات الغلاف coverPages ({ id, pages } بالترتيب) */
export function bookStarts(coverPages, parts) {
  const starts = {};
  let at = coverPages + 1;
  for (const p of parts) { starts[p.id] = at; at += p.pages; }
  return starts;
}
/** يولد الغلاف بتقدير لعدد صفحاته (make(est) يعيد { pages, coverPages }) ويعيد حتى يثبت، فلا تنزاح أرقام الفهرس */
export async function settleCover(make, max = 4) {
  let c = await make(1);
  for (let i = 1; i < max && c.pages !== c.coverPages; i++) c = await make(c.pages);
  return c;
}
export async function pageCount(bytes) {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
}

/** الغلاف والملخص التنفيذي: meta بهوية الجهة من أول وثيقة (identityOf)، وجسم بجدول الملخص */
export function bookCover({ cohort, docMeta = {}, rows = [], date, volume = { n: 1, of: 1 }, part = { n: 1, of: 1 } }) {
  const { brand } = identityOf(docMeta || {});
  const name = cohort?.name || 'الدفعة';
  const included = rows.filter((r) => r.status !== 'تعذر توليدها').length;
  const vol = (volume.of > 1 ? ` · المجلد ${volume.n} من ${volume.of}` : '') + (part.of > 1 ? ` · الجزء ${part.n} من ${part.of}` : '');
  const meta = {
    kind: 'BOOK', brand, eyebrow: brand.program || 'برنامج القادة', title: `مبادرات ${name}`,
    subtitle: `المبادرات المعتمدة، النسخة المؤسسية${vol}`, pageAr: true,
    rows: [['الدفعة', name], ['الجهة', brand.name || 'مبادرة مجتمعية'], ['التاريخ', date], ['عدد المبادرات', String(included)]],
    pdfName: `Cohort-Initiatives${volume.of > 1 ? `-${volume.n}` : ''}${part.of > 1 ? `-part-${part.n}` : ''}`,
  };
  const body = `<section class="sec"><header><h2>الملخص التنفيذي</h2></header>
<p>${esc(`يضم هذا الكتاب ${included} مبادرة معتمدة من «${name}» بنسختها المؤسسية، ولكل منها رمز تحقق يثبت مطابقتها لما اعتُمد في المنصة.`)}</p>
${table(BOOK_COLUMNS, rows.map((r) => BOOK_COLUMNS.map((c) => r[c.key] ?? '')))}</section>${tocSection(rows)}`;
  return { meta, body };
}

/** يدمج الأجزاء ({ id, label?, bytes }) بالترتيب في ملف واحد ويختم كل صفحة برقمها المتصل، ويبني الإشارات بمستويين ويحول
 * روابط الفهرس إلى قفزات داخلية. يعيد { bytes, pages, starts } */
export async function mergeBook(parts, { stamp = null, title = '' } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const starts = {};
  const tree = [];
  const pageRefs = [];
  for (const p of parts) {
    const src = await PDFDocument.load(p.bytes, { ignoreEncryption: true });
    starts[p.id] = out.getPageCount() + 1;
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((pg) => { out.addPage(pg); pageRefs.push(pg.ref); });
    if (!copied.length) continue;
    let chapters = safeOutline(src);
    if (chapters.length === 1 && chapters[0].children.length) chapters = chapters[0].children;
    tree.push({
      title: p.label || String(p.id), ref: copied[0].ref,
      children: chapters.filter((c) => copied[c.page]).map((c) => ({ title: c.title, ref: copied[c.page].ref, children: [] })),
    });
  }
  const total = out.getPageCount();
  const font = stamp ? null : await out.embedFont(StandardFonts.Helvetica);
  out.getPages().forEach((page, i) => {
    if (stamp) return stamp(page, i + 1, total);
    const t = `${i + 1} / ${total}`;
    const size = 7;
    page.drawText(t, { x: (page.getWidth() - font.widthOfTextAtSize(t, size)) / 2, y: 18, size, font, color: rgb(0.37, 0.44, 0.46) });
  });
  linkToc(out, starts, pageRefs);
  if (tree.length && parts.some((p) => p.label)) writeOutline(out, tree);
  if (title) out.setTitle(title);
  out.setProducer('Milestone Impact');
  return { bytes: await out.save(), pages: total, starts };
}

const textOf = (v) => (v && typeof v.decodeText === 'function' ? v.decodeText() : '');
function safeOutline(doc) {
  try { return readOutline(doc); } catch (e) { console.warn('cohort book: outline unreadable:', e?.message || e); return []; }
}
function namedDest(doc, name) {
  const cat = doc.catalog;
  const old = cat.lookup(PDFName.of('Dests'));
  if (old && old.lookup) { const d = old.lookup(PDFName.of(name)); if (d) return d; }
  const names = cat.lookup(PDFName.of('Names'));
  const node = names && names.lookup ? names.lookup(PDFName.of('Dests')) : null;
  const walk = (n, depth) => {
    if (!n || depth > 32) return null;
    const arr = n.lookup(PDFName.of('Names'));
    if (arr) for (let i = 0; i + 1 < arr.size(); i += 2) if (textOf(arr.lookup(i)) === name) return arr.lookup(i + 1);
    const kids = n.lookup(PDFName.of('Kids'));
    if (kids) for (let i = 0; i < kids.size(); i++) { const r = walk(kids.lookup(i), depth + 1); if (r) return r; }
    return null;
  };
  const d = walk(node, 0);
  return d && d.lookup && !d.size ? d.lookup(PDFName.of('D')) : d;
}

/** إشارات الوثيقة المرجعية: [{ title, page (من صفر), children }]، وما لا تُعرف صفحته يُترك */
export function readOutline(doc) {
  const { catalog, context } = doc;
  const key = (k) => PDFName.of(k);
  const root = catalog.lookup(key('Outlines'));
  if (!root || !root.lookup) return [];
  const pages = doc.getPages().map((p) => p.ref);
  const pageOf = (item) => {
    let dest = item.lookup(key('Dest'));
    if (!dest) { const a = item.lookup(key('A')); dest = a && a.lookup ? a.lookup(key('D')) : null; }
    if (dest && !dest.size) dest = namedDest(doc, dest.decodeText ? dest.decodeText() : String(dest.asString?.() ?? dest).replace(/^\//, ''));
    if (!dest || !dest.size || !dest.size()) return -1;
    return pages.indexOf(dest.get(0));
  };
  const seen = new Set();
  const walk = (first, depth) => {
    const list = [];
    for (let ref = first; ref && !seen.has(ref) && depth < 8; ) {
      seen.add(ref);
      const item = context.lookup(ref);
      if (!item || !item.lookup) break;
      const page = pageOf(item);
      const children = walk(item.get(key('First')), depth + 1);
      if (page >= 0) list.push({ title: textOf(item.lookup(key('Title'))), page, children });
      ref = item.get(key('Next'));
    }
    return list;
  };
  return walk(root.get(key('First')), 0);
}

function writeOutline(out, tree) {
  const ctx = out.context;
  const rootRef = ctx.nextRef();
  const build = (items, parent) => {
    const refs = items.map(() => ctx.nextRef());
    items.forEach((it, i) => {
      const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Parent: parent, Dest: [it.ref, 'XYZ', null, null, null] });
      if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < refs.length - 1) d.set(PDFName.of('Next'), refs[i + 1]);
      if (it.children.length) {
        const kids = build(it.children, refs[i]);
        d.set(PDFName.of('First'), kids[0]);
        d.set(PDFName.of('Last'), kids[kids.length - 1]);
        d.set(PDFName.of('Count'), ctx.obj(-it.children.length)); // مطوية: المبادرة تُفتح على فصولها
      }
      ctx.assign(refs[i], d);
    });
    return refs;
  };
  const top = build(tree, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: top.length }));
  out.catalog.set(PDFName.of('Outlines'), rootRef);
  out.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

/** روابط الفهرس (TOC_PREFIX) في أي صفحة تصير قفزة إلى صفحة بداية المبادرة */
function linkToc(out, starts, pageRefs) {
  const ctx = out.context;
  for (const page of out.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i);
      const act = a && a.lookup ? a.lookup(PDFName.of('A')) : null;
      const uri = act && act.lookup ? textOf(act.lookup(PDFName.of('URI'))) : '';
      if (!uri.startsWith(TOC_PREFIX)) continue;
      const at = starts[decodeURIComponent(uri.slice(TOC_PREFIX.length).replace(/\/$/, ''))];
      a.delete(PDFName.of('A'));
      // مبادرة في جزء آخر أو تعذر توليدها: لا يبقى رابط خارجي ميت
      if (!at || !pageRefs[at - 1]) continue;
      a.set(PDFName.of('Dest'), ctx.obj([pageRefs[at - 1], 'XYZ', null, null, null]));
    }
  }
}

// ── التخزين المؤقت ببصمة الوثيقة: SHA-256 لما يُرسل إلى العامل (meta والجسم)، فأي تغير في الوثيقة أو هويتها يغير المفتاح ──
export async function docKey(meta, body) {
  const data = new TextEncoder().encode(JSON.stringify([meta ?? null, String(body ?? '')]));
  const h = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function memoryCache() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}
const IDB = { name: 'mi-cohort-book', store: 'parts', max: 400 };
/** مخزن IndexedDB في متصفح المستخدم وحده؛ إن تعذر فتحه يعيد null فيمضي التصدير بلا تخزين */
export function idbCache(idb = globalThis.indexedDB) {
  if (!idb) return null;
  let dbp = null;
  const open = () => (dbp ||= new Promise((ok, no) => {
    const r = idb.open(IDB.name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB.store);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((ok, no) => {
      const t = db.transaction(IDB.store, mode);
      const req = fn(t.objectStore(IDB.store));
      t.oncomplete = () => ok(req?.result ?? null);
      t.onerror = () => no(t.error);
      t.onabort = () => no(t.error);
    });
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)).then((v) => v?.bytes ? new Uint8Array(v.bytes) : null),
    put: async (k, bytes) => {
      await tx('readwrite', (s) => s.put({ bytes, at: Date.now() }, k));
      const n = await tx('readonly', (s) => s.count());
      if (n > IDB.max) await tx('readwrite', (s) => s.clear()); // سقف بسيط يمنع تراكم بلا حد
    },
  };
}
/** يعيد الملف المخزن بالمفتاح، وإلا يولده؛ ويخزن ملف العامل وحده (البديل المرسوم يُعاد ليأخذ المتجهي لاحقًا) */
export async function cachedPart(key, make, cache) {
  if (cache && key) {
    try { const hit = await cache.get(key); if (hit) return { bytes: hit, via: 'cache' }; } catch (e) { console.warn('cohort book cache:', e?.message || e); }
  }
  const x = await make();
  if (cache && key && x?.via === 'server') {
    try { await cache.put(key, x.bytes); } catch (e) { console.warn('cohort book cache:', e?.message || e); }
  }
  return x;
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

// ── المرحلة 4: التقسيم التلقائي بالحجم وعدد الصفحات، وملف ZIP للمبادرات منفردة ──
/** سقف الملف الواحد: نحو 80MB أو 600 صفحة، فما زاد يُقسم إلى أجزاء مرقمة بالغلاف والملخص نفسيهما */
export const SPLIT_LIMITS = Object.freeze({ bytes: 80 * 1024 * 1024, pages: 600 });
/** يوزع الأجزاء ({ id, size, pages }) بترتيبها على ملفات لا يتجاوز كل منها الحد مع غلافه، ولا تُفرّق مبادرة واحدة */
export function splitBySize(parts, limits = SPLIT_LIMITS, cover = { size: 0, pages: 0 }) {
  const groups = [];
  let cur = null;
  for (const p of parts) {
    const fits = cur && cur.ids.length && cur.size + p.size <= limits.bytes && cur.pages + p.pages <= limits.pages;
    if (!fits) { cur = { ids: [], size: cover.size || 0, pages: cover.pages || 0 }; groups.push(cur); }
    cur.ids.push(p.id); cur.size += p.size; cur.pages += p.pages;
  }
  return groups.map((g) => g.ids);
}
/** اسم ملف المبادرة داخل ZIP: رقم ترتيبها ثم اسمها بلا رموز تمنعها أنظمة الملفات */
export function partFileName(n, name) {
  const clean = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${String(n).padStart(2, '0')} ${clean || 'مبادرة'}.pdf`;
}
/** ملف ZIP بلا ضغط (ملفات PDF مضغوطة أصلًا) لكل مبادرة منفردة، ومعه نص فهرس اختياري */
export function zipParts(files, { index = '' } = {}) {
  const entries = {};
  files.forEach((f, i) => { entries[partFileName(i + 1, f.name)] = [f.bytes, { level: 0 }]; });
  if (index) entries['فهرس.txt'] = [strToU8(index), { level: 6 }];
  return zipSync(entries);
}
export function saveZip(bytes, meta) {
  const name = `${meta.pdfName || 'Cohort-Initiatives'}.zip`;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return name;
}
