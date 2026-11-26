// المرحلة 30: اختبار مرجعي لملف PDF الوثيقة المؤسسية في Chromium، لكل شكل (بطاقة، ميثاق، حالة عمل) في الحالتين (حية، معتمدة).
// PDF المتصفح (pdf.js): عدد الصفحات في مدى الشكل (document-forms.js pages)، والعلامة المائية في كل صفحة من الحية وغيابها في المعتمدة
// (تُقرأ من بنية الملف نفسه: صورة الصفحة ثم طبقة العلامة بشفافية GState)، والترويسة والتذييل يُرسمان بالخط العربي محمّلًا في مستند اللوحة.
// PDF الخادم: HTML المرسل إلى العامل يحمل خطوطه وشعاراته data URI، فيطبعه Chromium (كما يطبعه workers/pdf-render) بلا أي طلب شبكة.
// SHOTS_DIR=<مجلد>: تُحفظ لقطة الصفحة الأولى لكل حالة p30-<شكل>-<حالة>.png (الافتراضي test-results/p30-shots).
import { test, expect, chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync, crc32 } from 'node:zlib';
import { FORMS } from '../supabase/functions/leaders-api/document-forms.js';
import { DOC_LIVE_HEAD_AR } from '../supabase/functions/leaders-api/labels.js';

const LEADERS = 'http://localhost:4304/';
const T = 't'.repeat(40);
const SHOTS = process.env.SHOTS_DIR || 'test-results/p30-shots';
const LOGO = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48"><rect width="48" height="48" rx="10" fill="#1F6F8B"/></svg>').toString('base64')}`;
const FULL = JSON.parse(readFileSync('e2e/initiative-doc-fixture.json', 'utf8'));

function docOf(form, state) {
  const d = structuredClone(FULL);
  d.meta.org = { ...d.meta.org, logo: LOGO };
  d.meta.doc_form = { key: form, name: FORMS[form].name, en: FORMS[form].en };
  if (state === 'approved') Object.assign(d.meta, { status: 'approved', status_title: 'معتمدة', approved_at: '2026-11-20T09:00:00Z' });
  return d;
}

// ── قراءة بنية PDF (jsPDF): الكائنات وتدفقاتها، ومحتوى كل صفحة ──
function parsePdf(buf) {
  const s = buf.toString('latin1');
  const objs = new Map();
  for (const m of s.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const body = m[2];
    const at = body.indexOf('stream');
    if (at < 0) { objs.set(Number(m[1]), { dict: body }); continue; }
    const dict = body.slice(0, at);
    const len = Number(dict.match(/\/Length (\d+)/)?.[1] || 0);
    const start = m.index + m[0].indexOf(body) + at + 'stream'.length + (body[at + 6] === '\r' ? 2 : 1);
    objs.set(Number(m[1]), { dict, data: buf.subarray(start, start + len) });
  }
  const content = (o) => (/FlateDecode/.test(o.dict) ? inflateSync(o.data) : o.data).toString('latin1');
  const pages = [...objs.values()].filter((o) => /\/Type \/Page\b(?!s)/.test(o.dict)).map((o) => {
    const ids = [...(o.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)?.[1] || '').matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]));
    return ids.map((id) => content(objs.get(id))).join('\n');
  });
  return { objs, pages, text: s };
}
// اسم الصورة المرسومة في الصفحة وكائنها
function xobjects(pdf) {
  const map = new Map();
  for (const o of pdf.objs.values()) {
    const x = o.dict.match(/\/XObject\s*<<([\s\S]*?)>>/);
    if (x) for (const m of x[1].matchAll(/\/(\S+) (\d+) 0 R/g)) map.set(m[1], Number(m[2]));
  }
  return map;
}
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
// صورة jsPDF بتنبؤ PNG (Predictor 15) هي بيانات IDAT نفسها، فتُلفّ ملف PNG كما هي
function pngOf(o, colorType) {
  const w = Number(o.dict.match(/\/Width (\d+)/)[1]); const h = Number(o.dict.match(/\/Height (\d+)/)[1]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', o.data), pngChunk('IEND', Buffer.alloc(0))]);
}

/** يفحص الملف ويعيد { pages, marks, firstJpeg, mark } */
function inspect(buf) {
  const pdf = parsePdf(buf);
  const xo = xobjects(pdf);
  const draws = pdf.pages.map((c) => [...c.matchAll(/\/(\S+) Do/g)].map((m) => m[1]));
  const isImage = (name, re) => { const o = pdf.objs.get(xo.get(name)); return Boolean(o && re.test(o.dict)); };
  // العلامة: صورة PNG بقناع شفافية (SMask) تُرسم داخل حالة رسم بشفافية GState، فوق صورة الصفحة JPEG
  const marks = draws.map((names, i) => names.filter((n) => isImage(n, /\/SMask/)).length > 0 && /\/GS\d+ gs[\s\S]*Do/.test(pdf.pages[i]));
  const first = pdf.objs.get(xo.get(draws[0].find((n) => isImage(n, /DCTDecode/))));
  const markName = draws[0].find((n) => isImage(n, /\/SMask/));
  let mark = null;
  if (markName) {
    const o = pdf.objs.get(xo.get(markName));
    const smask = pdf.objs.get(Number(o.dict.match(/\/SMask (\d+) 0 R/)[1]));
    const ca = Number(pdf.text.match(/\/ca ([\d.]+)/)?.[1] || 1);
    mark = { rgb: pngOf(o, 2).toString('base64'), alpha: pngOf(smask, 0).toString('base64'), ca };
  }
  return { pages: pdf.pages.length, draws, marks, firstJpeg: first?.data, mark };
}

// لقطة الصفحة الأولى كما في الملف: صورة الصفحة، وفوقها العلامة بقناعها وشفافيتها
async function shot(browser, name, jpeg, mark) {
  mkdirSync(SHOTS, { recursive: true });
  const p = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await p.setContent('<body style="margin:0"><canvas id="c" width="794" height="1123"></canvas></body>');
  await p.evaluate(async ({ jpeg, mark }) => {
    const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
    const c = document.getElementById('c'); const ctx = c.getContext('2d');
    ctx.drawImage(await load(`data:image/jpeg;base64,${jpeg}`), 0, 0, c.width, c.height);
    if (!mark) return;
    const [rgb, a] = await Promise.all([load(`data:image/png;base64,${mark.rgb}`), load(`data:image/png;base64,${mark.alpha}`)]);
    const t = document.createElement('canvas'); t.width = rgb.width; t.height = rgb.height;
    const tx = t.getContext('2d'); tx.drawImage(rgb, 0, 0);
    const px = tx.getImageData(0, 0, t.width, t.height);
    const m = document.createElement('canvas'); m.width = a.width; m.height = a.height;
    const mx = m.getContext('2d'); mx.drawImage(a, 0, 0);
    const al = mx.getImageData(0, 0, m.width, m.height).data;
    for (let i = 0; i < px.data.length; i += 4) px.data[i + 3] = al[i];
    tx.putImageData(px, 0, 0);
    ctx.globalAlpha = mark.ca;
    ctx.drawImage(t, 0, 0, c.width, c.height);
  }, { jpeg: jpeg.toString('base64'), mark });
  await p.locator('#c').screenshot({ path: `${SHOTS}/p30-${name}.png` });
  await p.close();
}

// ── رسم الترويسة والتذييل: كل fillText يُسجَّل مع حال الخط في مستند لوحته لحظة الرسم ──
const RECORD = () => {
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
    try {
      const d = this.canvas.ownerDocument;
      const kufi = /Noto Kufi Arabic/.test(this.font);
      const loaded = kufi ? [...d.fonts].some((f) => /Noto Kufi Arabic/.test(f.family) && f.status === 'loaded') && d.fonts.check(this.font.replace(/,.*$/, ''), String(text)) : null;
      (window.top.__p30 ||= []).push({ text: String(text), font: this.font, kufi, loaded });
    } catch { /* تسجيل فقط */ }
    return orig.call(this, text, ...rest);
  };
};

test.describe.configure({ timeout: 240000 });
test.use({ launchOptions: { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } } });

for (const form of ['card', 'charter', 'case']) {
  for (const state of ['live', 'approved']) {
    test(`PDF المتصفح: ${FORMS[form].name} ${state === 'live' ? 'الحية' : 'المعتمدة'}، صفحات في مدى الشكل، والعلامة ${state === 'live' ? 'في كل صفحة' : 'غائبة'}، والترويسة والتذييل بالخط العربي`, async ({ page, context, browser }) => {
      await context.addInitScript(RECORD);
      const doc = docOf(form, state);
      await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: JSON.parse(r.request().postData() || '{}').action === 'sponsor.get' ? { success: true, done: false, sponsor: 'م. خالد', doc } : { success: true } }));
      await page.goto(`${LEADERS}sponsor?t=${T}`);
      const pop = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'اقرأ الوثيقة كاملة' }).click();
      const w = await pop;
      const dl = page.waitForEvent('download', { timeout: 200000 });
      await w.getByRole('button', { name: 'تحميل PDF' }).click();
      const d = await dl;
      expect(d.suggestedFilename()).toMatch(new RegExp(`^${FORMS[form].name.replace(/\s+/g, '-')}-`));
      const buf = readFileSync(await d.path());
      if (process.env.PDF_OUT) { mkdirSync(process.env.PDF_OUT, { recursive: true }); await d.saveAs(`${process.env.PDF_OUT}/${form}-${state}.pdf`); }
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      const r = inspect(buf);
      const [min, max] = FORMS[form].pages;
      expect(r.pages, `صفحات ${form}/${state}`).toBeGreaterThanOrEqual(min);
      // المرحلة 30 (إكمال): الحد الأعلى مفروض على الأشكال الثلاثة، والبطاقة منها بلا استثناء
      expect(r.pages, `صفحات ${form}/${state}`).toBeLessThanOrEqual(max);
      // صورة صفحة في كل صفحة، والعلامة في كل صفحة من الحية ولا في صفحة من المعتمدة
      expect(r.draws.every((n) => n.length >= 1)).toBe(true);
      expect(r.marks).toEqual(Array(r.pages).fill(state === 'live'));
      // الترويسة والتذييل: «صفحة N من M» لكل صفحة، واسم الباب (أو ترويسة الحية) لكل صفحة بعد الغلاف، وكلها والخط العربي محمّل في مستند لوحتها
      const rec = await page.evaluate(() => window.__p30 || []);
      const foot = rec.filter((x) => /^صفحة \d+ من \d+$/.test(x.text));
      expect(foot.map((x) => x.text)).toEqual(Array.from({ length: r.pages }, (_, i) => `صفحة ${i + 1} من ${r.pages}`));
      const kufi = rec.filter((x) => x.kufi);
      expect(kufi.length).toBeGreaterThanOrEqual(r.pages + (r.pages - 1) + (state === 'live' ? 1 : 0));
      expect(kufi.filter((x) => !x.loaded).map((x) => x.text)).toEqual([]);
      if (state === 'live') expect(rec.filter((x) => x.text === DOC_LIVE_HEAD_AR && x.kufi && x.loaded).length === r.pages - 1).toBe(true);
      await shot(browser, `${form}-${state}`, r.firstJpeg, r.mark);
    });
  }
}

// ── PDF الخادم: العامل يُحاكى بـ Chromium نفسه بقيوده (لا سكربت، ولا شبكة إلا data:) ──
const ME = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'beginner', track: { title: 'مسار' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
};
for (const state of ['live', 'approved']) {
  test(`PDF الخادم (${state === 'live' ? 'ملف العمل الحي' : 'حالة العمل المعتمدة'}): الخطوط والشعارات مضمّنة، فيُطبع بلا أي طلب شبكة`, async ({ page, browser }) => {
    const doc = docOf('case', state);
    doc.meta.org.logo = '/favicon.svg';
    const sent = [];
    await page.route(/functions\/v1\/leaders-api/, (r) => {
      const b = JSON.parse(r.request().postData() || '{}');
      const v = {
        me: ME,
        'capstone.get': { success: true, initiative: doc.meta.initiative, scope: 'project', scope_title: 'مشروع', level: 'beginner', track: null, doc_form: doc.meta.doc_form,
          capstone: { status: 'submitted', status_title: 'بانتظار المراجعة', summary: '' }, sections: doc.sections.map((s) => ({ id: s.key, key: s.key, title: s.title, icon: '◆', dimension: s.dimension, complete: true, missing: 0, status: 'draft' })),
          checks: [], readiness: 90, ready_min: 80, card: { state: 'approved', sla: 'يومي عمل' }, can_submit: false, blocker: 'x', rubric: [], examples: { doc: false } },
        'capstone.doc': { success: true, doc, pdf: { url: 'https://pdf.sunkvalue.com', ticket: 'test.ticket.sig' } },
        certificate: { success: true, certificate: null },
      }[b.action];
      return r.fulfill({ json: v ?? { success: true } });
    });
    const worker = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const ctx = await worker.newContext({ javaScriptEnabled: false });
    const blocked = [];
    await page.route('https://pdf.sunkvalue.com/pdf', async (r) => {
      const b = JSON.parse(r.request().postData() || '{}');
      sent.push(b);
      const wp = await ctx.newPage({ viewport: { width: 794, height: 1123 } });
      await wp.route('**/*', (x) => (/^(data|about|blob):/.test(x.request().url()) ? x.continue() : (blocked.push(x.request().url()), x.abort())));
      await wp.setContent(b.html, { waitUntil: 'load' });
      await wp.evaluate(() => document.fonts.ready).catch(() => {});
      await wp.emulateMedia({ media: 'print' });
      mkdirSync(SHOTS, { recursive: true });
      await wp.screenshot({ path: `${SHOTS}/p30-server-case-${state}.png` });
      const pdf = await wp.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
      await wp.close();
      await r.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
    });
    await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-pdf-0000000000000000000000'); });
    await page.goto(LEADERS);
    await page.getByRole('button', { name: 'مبادرتي' }).first().click();
    const dl = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: state === 'live' ? 'تحميل ملف العمل PDF' : /^تحميل حالة العمل/ }).click();
    const d = await dl;
    await worker.close();
    expect(sent).toHaveLength(1);
    const html = sent[0].html;
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toContain('href="/fonts/fonts.css"');
    expect(html).toMatch(/url\(data:font\/woff2;base64,/);
    expect(html).not.toMatch(/url\(['"]?\/fonts\//);
    expect(html).not.toContain('src="/favicon.svg"');
    expect(blocked).toEqual([]);
    const buf = readFileSync(await d.path());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    // نص متجهي بخط مضمّن (لا صور صفحات)، والخط العربي من الخطوط المضمّنة نفسها
    const s = buf.toString('latin1');
    expect(s).toMatch(/\/FontFile2|\/FontFile3|\/FontFile\b/);
    expect(s).toMatch(/NotoKufiArabic|Noto ?Kufi/i);
  });
}
