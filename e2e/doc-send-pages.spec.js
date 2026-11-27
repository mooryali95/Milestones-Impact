// إصلاح الوثيقة (2026-11-27): «نسخة للإرسال» حقيقية من مسار PDF المتصفح نفسه (buildPdf، حيث وقع قص عنوان الفصل 8)،
// لوثيقة كاملة ولوثيقة غير مكتملة ولأخرى بعناوين طويلة جدًا. يتحقق آليًا أن لا عنوان (h2/h3/رأس قسم) مقسوم بين صفحتين ولا يتيم
// أسفل صفحة، وأن لا سطر نص يقطعه حد صفحة، وأن لا نص داخلي (مسودة عمل، فحوص الاتساق، انقر...) في نسخة الإرسال.
// SHOTS_DIR=<مجلد>: لقطة PNG لكل صفحة من الملف الناتج (الافتراضي test-results/docfix-shots)، وPDF_OUT لحفظ الملفات
import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { docSendBundle } from './support/doc-send-bundle.js';

const LEADERS = 'http://localhost:4304/';
const SHOTS = process.env.SHOTS_DIR || 'test-results/docfix-shots';
const FULL = JSON.parse(readFileSync('e2e/initiative-doc-fixture.json', 'utf8'));
const LOGO = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48"><rect width="48" height="48" rx="10" fill="#1F6F8B"/></svg>').toString('base64')}`;
const BANNED = ['PRELIMINARY', 'FINGERPRINT', 'DOCUMENT', 'Overview', 'Governance & risks', 'مسودة عمل', 'قيد البناء', 'فحوص الاتساق', 'فحوص آلية', 'سجل قرارات البوابات', 'أضف بديل', 'انقر', 'لتنتقل', 'ما ينقص', 'يحتاج مراجعة', 'مسودة للمراجعة', 'يُستكمل من فصل'];

const base = () => {
  const d = structuredClone(FULL);
  d.meta.org = { ...d.meta.org, logo: LOGO };
  d.meta.status = 'draft'; d.meta.status_title = 'قيد البناء';
  d.checks = [{ ok: false, title: 'كل منفعة لها خط أساس', detail: 'أضف بديل القياس' }];
  d.decisions = [{ at: '2026-11-01T10:00:00Z', gate: 'بوابة الاعتماد', decision: 'قدّم الوثيقة للمراجعة', by: 'القائد' }];
  return d;
};
const partial = () => { const d = base(); d.sections = d.sections.filter((s) => s.key !== 'benefits-register'); return d; };
const longHeads = () => {
  const d = partial();
  d.sections = d.sections.map((s, i) => ({ ...s, title: `${s.title}: ${'قيادة التغيير والاستدامة وقصة التحول في الجهة '.repeat(1 + (i % 3))}`.trim() }));
  return d;
};
// معتمدة ببصمة مجمّدة: نسخة الإرسال تحمل رمز التحقق في صفحة الاعتماد وعلى الغلاف
const approvedDoc = () => {
  const d = structuredClone(FULL);
  d.meta.org = { ...d.meta.org, logo: LOGO };
  d.meta.status = 'approved'; d.meta.approved_at = '2026-11-20T10:00:00Z';
  d.issued = { fingerprint: 'AB12-CD34-EF56-7890', sections: d.sections, cost: d.cost, summary: d.summary, meta: {} };
  return d;
};
const CASES = [['full', base], ['partial', partial], ['long-headings', longHeads], ['approved', approvedDoc]];

// صور صفحات jsPDF (JPEG) بترتيب الصفحات
function pageJpegs(buf) {
  const s = buf.toString('latin1');
  const objs = new Map();
  for (const m of s.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const body = m[2]; const at = body.indexOf('stream');
    if (at < 0) { objs.set(Number(m[1]), { dict: body }); continue; }
    const dict = body.slice(0, at); const len = Number(dict.match(/\/Length (\d+)/)?.[1] || 0);
    const start = m.index + m[0].indexOf(body) + at + 6 + (body[at + 6] === '\r' ? 2 : 1);
    objs.set(Number(m[1]), { dict, data: buf.subarray(start, start + len) });
  }
  const xo = new Map();
  for (const o of objs.values()) { const x = o.dict.match(/\/XObject\s*<<([\s\S]*?)>>/); if (x) for (const m of x[1].matchAll(/\/(\S+) (\d+) 0 R/g)) xo.set(m[1], Number(m[2])); }
  const content = (o) => (/FlateDecode/.test(o.dict) ? inflateSync(o.data) : o.data).toString('latin1');
  return [...objs.values()].filter((o) => /\/Type \/Page\b(?!s)/.test(o.dict)).map((o) => {
    const ids = [...(o.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)?.[1] || '').matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]));
    const c = ids.map((id) => content(objs.get(id))).join('\n');
    const name = [...c.matchAll(/\/(\S+) Do/g)].map((m) => m[1]).find((n) => /DCTDecode/.test(objs.get(xo.get(n))?.dict || ''));
    return name ? objs.get(xo.get(name)).data : null;
  });
}

test.describe.configure({ timeout: 300000 });
test.use({ launchOptions: { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } } });

let bundle;
test.beforeAll(async () => { bundle = await docSendBundle(); });

for (const [name, make] of CASES) {
  test(`نسخة للإرسال (${name}): لا عنوان مقسوم ولا يتيم، ولا سطر مقطوع، ولا نص داخلي`, async ({ page }) => {
    // صفحة فارغة على أصل المنصة، فتُحمَّل خطوط الوثيقة (/fonts) كما في التحميل الحقيقي
    await page.route(`${LEADERS}__docfix`, (x) => x.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
    await page.goto(`${LEADERS}__docfix`);
    await page.addScriptTag({ content: bundle });
    const r = await page.evaluate(async (doc) => {
      const { finalDocument, EXPORT_PRESETS, documentHtml, collectBreaks, planPages, PAGE, buildPdf } = window.DOCSEND;
      // شعار حقيقي: PNG بخلفية بيضاء (الحالة الشائعة)، فيُختبر دمج multiply لا مربع SVG
      const lc = document.createElement('canvas'); lc.width = 320; lc.height = 96;
      const lx = lc.getContext('2d'); lx.fillStyle = '#ffffff'; lx.fillRect(0, 0, 320, 96);
      lx.fillStyle = '#1F6F8B'; lx.beginPath(); lx.arc(48, 48, 34, 0, Math.PI * 2); lx.fill();
      lx.font = '600 30px sans-serif'; lx.fillText('ORG', 100, 60);
      doc.meta.org = { ...doc.meta.org, logo: lc.toDataURL('image/png') };
      const out = finalDocument(doc, EXPORT_PRESETS.send);
      // القياس في إطار بعرض الصفحة كما يفعل buildPdf
      const frame = document.createElement('iframe');
      Object.assign(frame.style, { position: 'fixed', top: '0', left: '-12000px', width: `${PAGE.w}px`, height: `${PAGE.h}px`, border: '0' });
      frame.srcdoc = documentHtml({ ...out.meta, selfFonts: true }, out.body, { pdf: true });
      document.body.appendChild(frame);
      await new Promise((ok) => { frame.onload = ok; });
      const d = frame.contentDocument;
      await d.fonts.ready;
      const plan = planPages(collectBreaks(d));
      const root = d.querySelector('.sheet');
      const top0 = root.getBoundingClientRect().top;
      const ends = plan.slice(0, -1).map((p) => p.end);
      const bad = [];
      for (const el of d.querySelectorAll('.sheet h2, .sheet h3, .sheet h4, .sec > header, .cp-f > b:first-child')) {
        const b = el.getBoundingClientRect(); const t = b.top - top0, bt = b.bottom - top0;
        if (bt - t < 1) continue;
        for (const e of ends) {
          if (t < e - 0.5 && bt > e + 0.5) bad.push({ kind: 'split', text: el.textContent.trim().slice(0, 60), e });
          if (bt <= e + 0.5 && e - bt < 30 && t > e - 400) bad.push({ kind: 'orphan', text: el.textContent.trim().slice(0, 60), e });
        }
      }
      // أسطر النص: لا حد صفحة يمر داخل سطر
      for (const el of d.querySelectorAll('.sheet p, .sheet li, .sheet td, .sheet h2, .sheet h3')) {
        const range = d.createRange(); range.selectNodeContents(el);
        for (const x of range.getClientRects()) {
          const t = x.top - top0, bt = x.bottom - top0;
          if (x.height > 2) for (const e of ends) if (t < e - 1 && bt > e + 1) bad.push({ kind: 'line', text: el.textContent.trim().slice(0, 40), e });
        }
      }
      // رأس الجدول لا يُرسم مرتين: الصفحة التي يتكرر فوقها الرأس تبدأ بعده
      for (const p of plan) if (p.head && p.start < p.head.bottom - 0.5) bad.push({ kind: 'thead-twice', e: p.start });
      // الرقم في الخلية لا ينكسر بين سطرين
      for (const n of d.querySelectorAll('.sheet td .num')) if (n.getClientRects().length > 1) bad.push({ kind: 'num-split', text: n.textContent });
      // لا سؤال توجيهي تحت عنوان باب، ولا وسم لاتيني فوقه
      for (const n of d.querySelectorAll('.in-open p')) if (/[؟?]/.test(n.textContent)) bad.push({ kind: 'ask', text: n.textContent.slice(0, 40) });
      if (d.querySelector('.in-sec .in-open .eyebrow')) bad.push({ kind: 'latin-eyebrow' });
      // رسم المنافع: لكل صف اسم داخل الرسم، ولا تتقاطع قيمة مع عمود
      for (const row of d.querySelectorAll('.in-benefits .bn-row')) {
        const svg = row.ownerSVGElement.getBoundingClientRect();
        const nm = row.querySelector('.bn-name'); const nb = nm?.getBoundingClientRect();
        if (!nm || !nm.textContent.trim() || nb.width < 4 || nb.left < svg.left - 1 || nb.right > svg.right + 1) bad.push({ kind: 'bar-label', text: nm?.textContent });
        const bars = [...row.querySelectorAll('.bn-bar')].map((x) => x.getBoundingClientRect());
        for (const v of row.querySelectorAll('.bn-val')) {
          const vb = v.getBoundingClientRect();
          if (vb.left < svg.left - 1 || bars.some((b) => vb.right > b.left + 0.5 && vb.left < b.right - 0.5 && vb.bottom > b.top + 0.5 && vb.top < b.bottom - 0.5)) bad.push({ kind: 'bar-overlap', text: v.textContent });
        }
      }
      const verify = { qr: Boolean(d.querySelector('[data-verify="qr"] svg.qr')), cover: Boolean(d.querySelector('.mast [data-verify="cover"] svg.qr')) };
      const blend = Boolean(d.querySelector('.mast.co .org.blend img'));
      const contents = d.querySelector('#in-contents')?.innerText || '';
      const text = d.body.innerText;
      frame.remove();
      const { blob, pages: built } = await buildPdf(out.meta, out.body);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { verify, blend, contents, kind: out.kind, stamp: out.meta.stamp, pages: built, bad, text, pdf: btoa(bin) };
    }, make());
    const buf = Buffer.from(r.pdf, 'base64');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PDF_OUT) { mkdirSync(process.env.PDF_OUT, { recursive: true }); writeFileSync(`${process.env.PDF_OUT}/send-${name}.pdf`, buf); }
    // لقطة PNG لكل صفحة من الملف نفسه
    mkdirSync(SHOTS, { recursive: true });
    const jpegs = pageJpegs(buf);
    expect(jpegs.length).toBe(r.pages);
    for (const [i, j] of jpegs.entries()) {
      if (!j) continue;
      const p = await page.context().newPage({ viewport: { width: 794, height: 1123 } });
      await p.setContent(`<body style="margin:0"><img id="i" style="width:794px;height:1123px;display:block" src="data:image/jpeg;base64,${j.toString('base64')}"></body>`);
      await p.locator('#i').screenshot({ path: `${SHOTS}/send-${name}-p${String(i + 1).padStart(2, '0')}.png` });
      await p.close();
    }
    expect(r.bad, JSON.stringify(r.bad.slice(0, 5))).toEqual([]);
    for (const b of BANNED) expect(r.text.includes(b), b).toBe(false);
    if (name === 'approved') { expect(r.verify.qr, 'رمز التحقق في صفحة الاعتماد').toBe(true); expect(r.verify.cover, 'رمز التحقق على الغلاف').toBe(true); }
    else expect(r.stamp).toMatch(/غير معتمدة/);
    if (r.kind === 'institutional') {
      expect(r.blend, 'شعار PNG بدمج multiply').toBe(true);
      expect(r.contents).toContain('المحتويات');
      expect(r.contents).toContain('يُوصى باعتماد');
    }
  });
}
