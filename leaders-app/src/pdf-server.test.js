// @vitest-environment jsdom
// PDF من الخادم لكل وثيقة writeDocument بمسار واحد (المرحلتان 3أ و3ب، قرار المالك 2026-11-25): زر «تحميل PDF» يطلب تذكرة
// بجلسة الصفحة ويمر بـdownloadBest، والرجوع إلى المتصفح محفوظ فيها. والعامل يقبل أصل الإدارة، ويحد الطلبات لكل صاحب تذكرة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const best = vi.fn(async () => 'server');
vi.mock('../../src/lib/brand/pdf.js', () => ({ downloadBest: best, downloadPdf: vi.fn() }));
const { writeDocument } = await import('../../src/lib/brand/doc.js');
const { pdfServer, setPdfTicketSource } = await import('../../src/lib/brand/pdf-source.js');
const { allowedRequest, appOrigins, limitKey } = await import('../../workers/pdf-render/policy.js');

const root = join(__dirname, '../..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const META = { kind: 'EXP', kindLabel: 'Expert Hours', title: 'شهادة ساعات خبرة', pdfName: 'شهادة', rows: [] };
function popup() {
  const doc = document.implementation.createHTMLDocument('');
  return { document: doc, print: vi.fn(), close: vi.fn() };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { setPdfTicketSource(null); best.mockClear(); });

describe('مصدر التذكرة (pdf-source.js)', () => {
  it('بلا مصدر null، ومصدر الوثيقة يسبق مصدر التطبيق، والتعذر والرد الناقص null', async () => {
    expect(await pdfServer()).toBeNull();
    setPdfTicketSource(async () => ({ url: 'https://pdf.example.test', ticket: 'app' }));
    expect(await pdfServer()).toEqual({ url: 'https://pdf.example.test', ticket: 'app' });
    expect(await pdfServer(async () => ({ url: 'https://pdf.example.test', ticket: 'own' }))).toEqual({ url: 'https://pdf.example.test', ticket: 'own' });
    expect(await pdfServer(async () => { throw new Error('x'); })).toBeNull();
    expect(await pdfServer(async () => ({ url: 'https://pdf.example.test' }))).toBeNull();
  });
});

describe('زر «تحميل PDF» في writeDocument (المرحلة 3أ)', () => {
  it('يطلب التذكرة عند النقر ويمر بـdownloadBest بها', async () => {
    const source = vi.fn(async () => ({ url: 'https://pdf.example.test', ticket: 't1' }));
    setPdfTicketSource(source);
    const win = popup();
    expect(writeDocument(win, META, '<p>x</p>')).toBe(true);
    expect(source).not.toHaveBeenCalled();
    win.document.querySelector('[data-act="pdf"]').click();
    await flush(); await flush();
    expect(source).toHaveBeenCalledTimes(1);
    expect(best).toHaveBeenCalledTimes(1);
    expect(best.mock.calls[0][2].server).toEqual({ url: 'https://pdf.example.test', ticket: 't1' });
  });
  it('بلا تذكرة يمر بـdownloadBest بلا خادم، فيبني المتصفح الملف كما كان', async () => {
    const win = popup();
    writeDocument(win, META, '<p>x</p>');
    win.document.querySelector('[data-act="pdf"]').click();
    await flush(); await flush();
    expect(best.mock.calls[0][2].server).toBeNull();
  });
  it('التطبيقان يسجلان مصدرهما مرة عند الإقلاع، والتذكرة بجلسة الصفحة بلا إخراج من الجلسة', () => {
    expect(read('leaders-app/src/main.jsx')).toMatch(/setPdfTicketSource\(\(\) => pdfTicket\(\)\)/);
    const api = read('leaders-app/src/api.js');
    expect(api).toMatch(/export async function pdfTicket[\s\S]{0,400}const r = await send\('pdf\.ticket', token\)/);
    expect(read('admin-app/src/main.jsx')).toMatch(/setPdfTicketSource\(\(\) => pdfTicket\(\)\)/);
    expect(read('admin-app/src/leaders.js')).toMatch(/post\('leaders-api', \{ action: 'pdf\.ticket', token \}/);
    expect(read('admin-app/public/_headers')).toMatch(/connect-src[^;]*https:\/\/pdf\.sunkvalue\.com/);
    const doc = read('src/lib/brand/doc.js');
    expect(doc).toMatch(/downloadBest\(meta, body, \{ server, onProgress/);
    expect(doc).not.toMatch(/downloadPdf\(meta, body/);
  });
  it('التقارير وشهادة الخبير تحمل اسم ملف فيظهر زر «تحميل PDF»', async () => {
    const { reportFileName, orgReport } = await import('../../src/lib/brand/reports.js');
    expect(reportFileName('تقرير', 'هيئة/ تجريبية', new Date(2026, 10, 25))).toBe('تقرير-هيئة-تجريبية-2026-11-25');
    expect(read('src/lib/brand/reports.js').match(/pdfName: reportFileName\(/g)).toHaveLength(2);
    expect(read('leaders-app/src/screens/ExpertPortal.jsx')).toMatch(/pdfName: reportFileName\('شهادة-ساعات-خبرة'/);
    expect(typeof orgReport).toBe('function');
  });
  it('الخادم: pdf.ticket لأي جلسة صالحة، وcapstone.doc يبقى بتذكرته كما كان', () => {
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toContain("'pdf.ticket': (b) => pdfTicketAny(b.token),");
    const t = read('supabase/functions/leaders-api/pdf-ticket.ts');
    for (const k of ['participant', 'expert', 'coordinator', 'admin']) expect(t).toContain(`\`${k}-`);
    expect(read('supabase/functions/leaders-api/capstone.ts')).toMatch(/pdf: await pdfTicket\(p\.id, docFingerprint\(document\)\)/);
  });
});

describe('العامل: أصول متعددة وأصل الإدارة وسقف لكل صاحب تذكرة (المرحلة 3ب)', () => {
  const env = { APP_ORIGIN: 'https://leaders.sunkvalue.com', ALLOWED_ORIGINS: 'https://leaders.sunkvalue.com, https://admin.sunkvalue.com' };
  it('الأصول من ALLOWED_ORIGINS مع APP_ORIGIN، والطلب الفرعي من أي منها وحدها', () => {
    const list = appOrigins(env);
    expect(list).toEqual(['https://leaders.sunkvalue.com', 'https://admin.sunkvalue.com']);
    expect(allowedRequest('https://admin.sunkvalue.com/fonts/x.woff2', list)).toBe(true);
    expect(allowedRequest('https://leaders.sunkvalue.com/a.png', list)).toBe(true);
    expect(allowedRequest('https://evil.example/a.png', list)).toBe(false);
    expect(allowedRequest('data:image/png;base64,AA', list)).toBe(true);
    // الصيغة القديمة (أصل واحد نصًا) باقية
    expect(allowedRequest('https://leaders.sunkvalue.com/a.png', 'https://leaders.sunkvalue.com')).toBe(true);
  });
  it('مفتاح السقف صاحب التذكرة وحده، وأصل الإدارة مضبوط في الإعداد', () => {
    expect(limitKey('participant-abc')).toBe('participant-abc');
    expect(limitKey('')).toBe('anon');
    const toml = read('workers/pdf-render/wrangler.toml');
    expect(toml).toMatch(/ALLOWED_ORIGINS = "https:\/\/leaders\.sunkvalue\.com,https:\/\/admin\.sunkvalue\.com"/);
    expect(toml).toMatch(/name = "PDF_LIMIT"/);
    const w = read('workers/pdf-render/index.js');
    expect(w).toMatch(/env\.PDF_LIMIT\?\.limit/);
    expect(w).toMatch(/allowedRequest\(r\.url\(\), origins\)/);
    expect(w).not.toMatch(/console\.(log|info)\([^)]*html/);
  });
});

describe('Cloudflare معالجًا للوثيقة في سجل التغييرات (قرار المالك 8)', () => {
  it('نسخة غير جوهرية بتاريخ بعد آخر نسخة، في سجل التغييرات وحده، والبصمة للنسخة الجديدة', async () => {
    const { POLICY_CHANGES, POLICY_VERSION, POLICY_MATERIAL_VERSION } = await import('../../supabase/functions/leaders-api/labels.js');
    const [last, prev] = POLICY_CHANGES;
    expect(last.version).toBe('2026-11-27');
    expect(last.version > prev.version).toBe(true);
    expect(last.material).toBe(false);
    expect(last.items.join(' ')).toMatch(/Cloudflare/);
    expect(POLICY_VERSION).toBe('2026-11-27');
    // الجوهرية لم تتغير: لا تُعاد الموافقة ولا يُعلَن
    expect(POLICY_MATERIAL_VERSION).toBe('2026-11-22');
    expect(read('supabase/functions/leaders-api/policy-digest.js')).toMatch(/version: '2026-11-27'/);
  });
});
