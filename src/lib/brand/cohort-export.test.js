// تصدير مبادرات الدفعة، المرحلة 2 (تصور 2026-11-27 باعتماد المالك): توليد كل مبادرة بالتتابع عبر مسار الوثيقة المؤسسية
// القائم (admin.doc-export ثم finalDocument) بالعامل المتجهي، وإعادة المحاولة عند 429، والبديل المرسوم في المتصفح، ثم الدمج
// بـ pdf-lib في كتاب واحد بغلاف الدفعة وملخص تنفيذي وترقيم متصل.
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { BOOK_COLUMNS, bookCover, mergeBook, renderPart, runBook, summaryRows } from './cohort-export.js';

async function pdfOf(pages) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([595, 842]);
  return d.save();
}
const res = (status, body = null, type = 'application/pdf') => ({ ok: status === 200, status, headers: { get: () => type }, arrayBuffer: async () => body });

describe('renderPart: العامل ثم المتصفح', () => {
  it('يعيد المحاولة عند 429 بتأخير متزايد ثم يأخذ ملف العامل', async () => {
    const bytes = await pdfOf(1);
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(200, bytes));
    const sleep = vi.fn(async () => {});
    const raster = vi.fn();
    const out = await renderPart({ title: 'م' }, '<p>x</p>', { url: 'https://w', ticket: 't' }, { fetchImpl, sleep, raster, toHtml: async () => '<html>' });
    expect(out.via).toBe('server');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000]);
    expect(raster).not.toHaveBeenCalled();
  });
  it('بعد استنفاد المحاولات أو خطأ غير 429 يبني في المتصفح', async () => {
    const raster = vi.fn(async () => new Uint8Array([1]));
    const fetchImpl = vi.fn().mockResolvedValue(res(429));
    const out = await renderPart({ title: 'م' }, 'b', { url: 'u', ticket: 't' }, { fetchImpl, sleep: async () => {}, raster, toHtml: async () => 'h' });
    expect(out.via).toBe('browser');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const f2 = vi.fn().mockResolvedValue(res(500));
    expect((await renderPart({}, 'b', { url: 'u', ticket: 't' }, { fetchImpl: f2, sleep: async () => {}, raster, toHtml: async () => 'h' })).via).toBe('browser');
    expect(f2).toHaveBeenCalledTimes(1);
  });
  it('بلا تذكرة يذهب إلى المتصفح مباشرة', async () => {
    const fetchImpl = vi.fn();
    const out = await renderPart({}, 'b', null, { fetchImpl, raster: async () => new Uint8Array([1]) });
    expect(out.via).toBe('browser');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('الملخص التنفيذي والغلاف', () => {
  const rows = [
    { participant_id: 'p1', full_name: 'أحمد', initiative: 'رقمنة', readiness: 80, approved_at: '2026-11-21' },
    { participant_id: 'p2', full_name: 'سارة', initiative: 'تسريع', readiness: null, approved_at: '2026-11-20' },
  ];
  it('أعمدة الملخص كما اعتمدها المالك', () => {
    expect(BOOK_COLUMNS.map((c) => c.label)).toEqual(['م', 'المشارك', 'عنوان المبادرة', 'الحالة', 'الجاهزية', 'تاريخ الاعتماد', 'رمز التحقق']);
  });
  it('رمز التحقق من بصمة كل وثيقة، والحالة معتمدة، والمتعذر معلَّم', () => {
    const s = summaryRows(rows, { p1: { fingerprint: 'FP1', start: 3 }, p2: { error: 'x' } });
    expect(s[0]).toMatchObject({ n: 1, full_name: 'أحمد', initiative: 'رقمنة', status: 'معتمدة', readiness: '80%', approved_at: '2026-11-21', code: 'FP1', page: 3 });
    expect(s[1]).toMatchObject({ status: 'تعذر توليدها', readiness: '', code: '' });
  });
  it('الغلاف بهوية الجهة من الوثيقة (lockup) وبالعدد والتاريخ، بلا بريد ولا هاتف', () => {
    const meta = { cohort_brand: { program: 'برنامج القادة' }, org: { name: 'جمعية سفراء', logo: '/l.png', email: 'x@y.sa' } };
    const c = bookCover({ cohort: { name: 'سفراء 2026' }, docMeta: meta, rows: summaryRows(rows, {}), date: '27 نوفمبر 2026', volume: { n: 1, of: 1 } });
    expect(c.meta.title).toContain('سفراء 2026');
    expect(c.meta.brand.name).toBe('جمعية سفراء');
    expect(c.meta.rows).toEqual(expect.arrayContaining([['عدد المبادرات', '2'], ['التاريخ', '27 نوفمبر 2026']]));
    expect(c.body).toContain('رمز التحقق');
    expect(JSON.stringify(c)).not.toContain('x@y.sa');
    const v = bookCover({ cohort: { name: 'د' }, docMeta: meta, rows: [], date: 'ت', volume: { n: 2, of: 3 } });
    expect(v.meta.subtitle).toContain('المجلد 2 من 3');
  });
});

describe('mergeBook: كتاب واحد بترقيم متصل', () => {
  it('يضم الغلاف ثم الوثائق بالترتيب، ويختم كل صفحة برقمها من المجموع، ويعيد صفحة بداية كل مبادرة', async () => {
    const stamps = [];
    const out = await mergeBook([{ id: 'cover', bytes: await pdfOf(2) }, { id: 'p1', bytes: await pdfOf(3) }, { id: 'p2', bytes: await pdfOf(1) }], {
      stamp: (page, n, total) => stamps.push(`${n}/${total}`), title: 'مبادرات',
    });
    const doc = await PDFDocument.load(out.bytes);
    expect(doc.getPageCount()).toBe(6);
    expect(stamps).toEqual(['1/6', '2/6', '3/6', '4/6', '5/6', '6/6']);
    expect(out.starts).toEqual({ cover: 1, p1: 3, p2: 6 });
  });
});

describe('runBook: بالتتابع مع التقدم والإيقاف', () => {
  const rows = [{ participant_id: 'a', full_name: 'أ' }, { participant_id: 'b', full_name: 'ب' }, { participant_id: 'c', full_name: 'ج' }];
  it('يولد واحدة بعد واحدة ويبلغ بالعدد والاسم، ويجمع المتعذر دون أن يوقف الباقي', async () => {
    const order = [];
    const progress = [];
    const part = vi.fn(async (r) => { order.push(r.participant_id); if (r.participant_id === 'b') throw new Error('x'); return { bytes: new Uint8Array([1]), fingerprint: `F${r.participant_id}`, via: 'server' }; });
    const out = await runBook(rows, { part, onProgress: (p) => progress.push(`${p.done + 1}/${p.total} ${p.name}`) });
    expect(order).toEqual(['a', 'b', 'c']);
    expect(progress).toEqual(['1/3 أ', '2/3 ب', '3/3 ج']);
    expect(out.parts.map((p) => p.id)).toEqual(['a', 'c']);
    expect(out.failed).toEqual([{ participant_id: 'b', full_name: 'ب', message: 'x' }]);
    expect(out.cancelled).toBe(false);
  });
  it('الإيقاف يمنع ما بعده', async () => {
    const ac = new AbortController();
    const part = vi.fn(async () => { ac.abort(); return { bytes: new Uint8Array([1]) }; });
    const out = await runBook(rows, { part, signal: ac.signal });
    expect(part).toHaveBeenCalledTimes(1);
    expect(out.cancelled).toBe(true);
  });
});

describe('رمز التحقق والعدد في الملخص (مراجعة المرحلة 2)', () => {
  it('رمز التحقق هو البصمة المجمدة المطبوعة في الوثيقة لا بصمة النسخة الحية', async () => {
    const { bookCode } = await import('./cohort-export.js');
    const fp = 'AB12-CD34-EF56-7890';
    const doc = { meta: { status: 'approved' }, issued: { fingerprint: fp, sections: [] } };
    expect(bookCode(doc)).toBe(fp);
    expect(bookCode({ meta: { status: 'approved' } })).toBe(null);
  });
  it('عدد المبادرات في الغلاف لا يحسب المتعذر', () => {
    const rows = summaryRows([{ participant_id: 'a' }, { participant_id: 'b' }], { a: { fingerprint: 'x' }, b: { error: 'e' } });
    const { meta } = bookCover({ cohort: { name: 'د' }, rows, date: 'اليوم' });
    expect(meta.rows.find(([k]) => k === 'عدد المبادرات')[1]).toBe('1');
  });
});

// ── المرحلة 3: الفهرس المرتبط والإشارات بمستويين، والتخزين المؤقت بالبصمة للاستئناف ──
import { PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { TOC_PREFIX, bookStarts, docKey, cachedPart, memoryCache, readOutline, tocHref } from './cohort-export.js';

// وثيقة فيها إشارات مرجعية (فصول) كما يخرجها العامل، وغلاف فيه روابط الفهرس
async function pdfWithOutline(pages, chapters) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([595, 842]);
  const ctx = d.context;
  const root = ctx.nextRef();
  const refs = chapters.map(() => ctx.nextRef());
  chapters.forEach(([title, pg], i) => {
    const o = { Title: PDFHexString.fromText(title), Parent: root, Dest: [d.getPage(pg).ref, 'XYZ', null, null, null] };
    if (i > 0) o.Prev = refs[i - 1];
    if (i < refs.length - 1) o.Next = refs[i + 1];
    ctx.assign(refs[i], ctx.obj(o));
  });
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: refs.length }));
  d.catalog.set(PDFName.of('Outlines'), root);
  return d.save();
}
async function coverWithLinks(ids) {
  const d = await PDFDocument.create();
  const page = d.addPage([595, 842]);
  const annots = ids.map((id, i) => d.context.register(d.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [50, 700 - i * 20, 300, 715 - i * 20], Border: [0, 0, 0],
    A: { S: 'URI', URI: PDFString.of(tocHref(id)) },
  })));
  page.node.set(PDFName.of('Annots'), d.context.obj(annots));
  return d.save();
}

describe('الفهرس المرتبط والإشارات بمستويين', () => {
  it('الغلاف فيه فهرس: لكل مبادرة رابط داخلي برقم صفحتها', () => {
    const rows = summaryRows([{ participant_id: 'p1', full_name: 'أحمد', initiative: 'رقمنة' }], { p1: { fingerprint: 'F', start: 4 } });
    const { body } = bookCover({ cohort: { name: 'د' }, rows, date: 'ت' });
    expect(body).toContain('الفهرس');
    expect(body).toContain(`href="${TOC_PREFIX}p1"`);
    expect(body).toMatch(/>4</);
  });
  it('bookStarts: صفحة بداية كل مبادرة بعد صفحات الغلاف', () => {
    expect(bookStarts(2, [{ id: 'p1', pages: 3 }, { id: 'p2', pages: 1 }, { id: 'p3', pages: 5 }])).toEqual({ p1: 3, p2: 6, p3: 7 });
  });
  it('readOutline يقرأ فصول الوثيقة بأرقام صفحاتها', async () => {
    const src = await PDFDocument.load(await pdfWithOutline(3, [['الملخص', 0], ['الخطة', 2]]));
    expect(readOutline(src)).toEqual([{ title: 'الملخص', page: 0, children: [] }, { title: 'الخطة', page: 2, children: [] }]);
  });
  it('mergeBook: المستوى الأول لكل مبادرة باسمها، والثاني فصولها على صفحاتها في الكتاب، وروابط الفهرس تقفز إلى البداية', async () => {
    const parts = [
      { id: 'cover', label: 'الغلاف والفهرس', bytes: await coverWithLinks(['p1', 'p2']) },
      { id: 'p1', label: 'أحمد: رقمنة', bytes: await pdfWithOutline(3, [['الملخص', 0], ['الخطة', 2]]) },
      { id: 'p2', label: 'سارة: تسريع', bytes: await pdfWithOutline(2, [['الملخص', 0], ['الأثر', 1]]) },
    ];
    const out = await mergeBook(parts, { stamp: () => {}, title: 'ك' });
    const doc = await PDFDocument.load(out.bytes);
    const tree = readOutline(doc);
    expect(tree.map((t) => [t.title, t.page])).toEqual([['الغلاف والفهرس', 0], ['أحمد: رقمنة', 1], ['سارة: تسريع', 4]]);
    expect(tree[1].children).toEqual([{ title: 'الملخص', page: 1, children: [] }, { title: 'الخطة', page: 3, children: [] }]);
    expect(tree[2].children.map((c) => c.page)).toEqual([4, 5]);
    const annots = doc.getPage(0).node.Annots();
    const targets = annots.asArray().map((ref) => {
      const a = doc.context.lookup(ref);
      expect(a.get(PDFName.of('A'))).toBeUndefined();
      const dest = a.lookup(PDFName.of('Dest'));
      return doc.getPages().findIndex((p) => p.ref === dest.get(0));
    });
    expect(targets).toEqual([1, 4]);
  });
});

describe('التخزين المؤقت ببصمة الوثيقة (الاستئناف)', () => {
  it('docKey ثابت للوثيقة نفسها ويتغير بأي تغير في محتواها أو مسارها', async () => {
    const a = await docKey({ title: 'م' }, '<p>1</p>');
    expect(a).toBe(await docKey({ title: 'م' }, '<p>1</p>'));
    expect(a).not.toBe(await docKey({ title: 'م' }, '<p>2</p>'));
    expect(a).not.toBe(await docKey({ title: 'ن' }, '<p>1</p>'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('cachedPart يعيد المخزن دون توليد، ويخزن ملف العامل وحده لا البديل المرسوم', async () => {
    const cache = memoryCache();
    const make = vi.fn(async () => ({ bytes: new Uint8Array([7]), via: 'server' }));
    const first = await cachedPart('k1', make, cache);
    const again = await cachedPart('k1', make, cache);
    expect(make).toHaveBeenCalledTimes(1);
    expect(first.via).toBe('server');
    expect(again).toMatchObject({ via: 'cache' });
    expect([...again.bytes]).toEqual([7]);
    const raster = vi.fn(async () => ({ bytes: new Uint8Array([1]), via: 'browser' }));
    await cachedPart('k2', raster, cache);
    await cachedPart('k2', raster, cache);
    expect(raster).toHaveBeenCalledTimes(2);
  });
  it('تعذر التخزين لا يوقف التصدير', async () => {
    const broken = { get: async () => { throw new Error('blocked'); }, put: async () => { throw new Error('blocked'); } };
    const out = await cachedPart('k', async () => ({ bytes: new Uint8Array([1]), via: 'server' }), broken);
    expect(out.via).toBe('server');
    expect((await cachedPart('k', async () => ({ bytes: new Uint8Array([2]), via: 'server' }), null)).via).toBe('server');
  });
});
