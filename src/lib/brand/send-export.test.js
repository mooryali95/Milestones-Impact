// إصلاح الوثيقة (2026-11-27): نسخة الإرسال وثيقة خارجية تُسلَّم لجهة. لا أدوات عمل داخلية فيها، وختم واحد للمسودة،
// وفهرس مؤسسي، وملخص تنفيذي غير فارغ، وشعار الجهة بلا لوحة بيضاء، وسجل البوابات بلا تكرار، وسبب غياب رمز التحقق قبل التحميل،
// ومخطط الصفحات لا يقطع سطرًا ولا عنوانًا أبدًا
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { capstoneReport } from './capstone.js';
import { EXPORT_PRESETS, exportSummary, finalDocument, nowrapNumbers } from './institutional.js';
import { documentHtml, LOGO_MM, C } from './doc.js';
import { planPages, safeEnd } from './pdf.js';
import { gateDecisions } from '../../../supabase/functions/leaders-api/closure.js';
import { execSummary, firstSentences } from '../../../supabase/functions/leaders-api/business-case.js';
import { qrExportReason } from '../../../supabase/functions/leaders-api/doc-options.js';
import { DOC_QR_EXPORT_AR, DOC_SEND_STAMP_AR, DOC_TEXT, DOC_LIVE_AR, docRecommendAr } from '../../../supabase/functions/leaders-api/labels.js';

const FULL = JSON.parse(readFileSync('e2e/initiative-doc-fixture.json', 'utf8'));
const PNG = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(40, 'A')}`;
const live = () => {
  const d = structuredClone(FULL);
  d.meta.status = 'draft'; d.meta.status_title = 'قيد البناء';
  d.meta.org = { ...d.meta.org, logo: PNG };
  d.checks = [{ ok: false, title: 'كل منفعة لها خط أساس', detail: 'أضف بديل القياس' }];
  d.decisions = [{ at: '2026-11-01T10:00:00Z', gate: 'بوابة الاعتماد', decision: 'قدّم الوثيقة للمراجعة', by: 'القائد' }];
  return d;
};
// وثيقة لم تكتمل مؤسسيًا (بلا سجل المنافع): مسار ملف العمل بخيار الإرسال
const partial = () => { const d = live(); d.sections = d.sections.filter((s) => !['benefits-register', 'cost-plan'].includes(s.key)); return d; };
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const html = (out) => documentHtml(out.meta, out.body);
// قائمة الدفاع الثاني: عبارات العمل الداخلي التي لا تظهر في نسخة الإرسال (في الاختبار وحده، لا في الحزمة)
const BANNED = ['مسودة عمل', 'قيد البناء', 'فحوص الاتساق', 'فحوص آلية', 'سجل قرارات البوابات', 'أضف بديل', 'انقر', 'لتنتقل', 'ما ينقص', 'يحتاج مراجعة',
  'في الملحق الأخير', 'يفحصها النظام', 'فلا تُكتب مرتين', 'ما تفعله غدًا', 'يتسلم بعدك', 'لتكتمل الخطة', 'يُستكمل من فصل', DOC_LIVE_AR];
// كلمات الواجهة بحدود الكلمة («راقب» لا تطابق «مراقبة»)؛ عبارات محتوى المشارك نفسه لا تُفحص
const word = (w) => new RegExp(`(^|[\\s،.:«(])${w}([\\s،.:»)]|$)`);

for (const [name, make] of [['مكتملة (المؤسسية)', live], ['غير مكتملة (ملف العمل)', partial]]) describe(`نسخة الإرسال لوثيقة غير معتمدة ${name}`, () => {
  const out = finalDocument(make(), EXPORT_PRESETS.send);
  const t = text(html(out));
  it('لا أدوات عمل داخلية ولا تعليمات واجهة', () => {
    for (const b of BANNED) expect(t.includes(b), b).toBe(false);
    for (const w of ['اضغط']) expect(word(w).test(t), w).toBe(false);
    expect(out.body).not.toMatch(/class="cp-draft"|class="cp-check"/);
  });
  it('رقم الوثيقة بلا لاحقة إصدار (-V) في المتن والتذييل واسم الملف', () => {
    expect(html(out)).not.toMatch(/MI-CP-[\w-]*-V\d/);
    expect(String(out.meta.id)).not.toMatch(/-V\d/);
    expect(String(out.meta.footer || '')).not.toMatch(/-V\d/);
    expect(String(out.meta.pdfName || '')).not.toMatch(/-V\d/);
  });
  it('ختم واحد رصين على الغلاف، بلا علامة مائية ولا حالة داخلية في الغلاف', () => {
    expect(out.meta.stamp).toBe(DOC_SEND_STAMP_AR);
    expect(t.split(DOC_SEND_STAMP_AR).length - 1).toBe(1);
    expect(out.meta.live).not.toBe(true);
    expect(out.meta.rows.some(([k]) => k === 'الحالة')).toBe(false);
    expect(String(out.meta.subtitle || '')).not.toMatch(/برنامج القادة ·/);
    expect(out.meta.closing).toBe(DOC_TEXT.sendClosing);
  });
  it('الفهرس: «المحتويات» بلا وصف ولا عدّ ولا أسئلة', () => {
    if (out.kind !== 'working') return;
    const toc = out.body.slice(out.body.indexOf('id="ch-toc"'), out.body.indexOf('</section>', out.body.indexOf('id="ch-toc"')));
    expect(toc).toContain(DOC_TEXT.toc.title);
    expect(toc).not.toMatch(/class="note"/);
    expect(text(toc)).not.toMatch(/\d+\s*(فصل|فصلان|فصول)/);
    expect(text(toc)).not.toContain('؟');
  });
  it('ملف العمل والنسخة الكاملة يحتفظان بالفحوص وصندوق المسودة بلا حالة داخلية', () => {
    const full = finalDocument(partial(), EXPORT_PRESETS.full);
    expect(full.body).toContain('فحوص الاتساق');
    expect(full.body).toContain('سجل قرارات البوابات');
    expect(full.body).toContain(DOC_TEXT.draftNotice);
    expect(text(full.body)).not.toContain('(قيد البناء)');
  });
});

describe('نسخة الإرسال لوثيقة معتمدة', () => {
  it('لا محتوى داخلي، ولا سجل بوابات', () => {
    const d = live(); d.meta.status = 'approved'; d.meta.approved_at = '2026-11-20T09:00:00Z';
    const out = finalDocument(d, EXPORT_PRESETS.send);
    const t = text(out.body);
    for (const b of BANNED) expect(t.includes(b), b).toBe(false);
  });
});

describe('الملخص التنفيذي: لا صفحة شبه فارغة', () => {
  it('خلاصة من البطاقة حين لا خلاصة محفوظة، ومشكلة بجملة، وتوصية', () => {
    const d = partial(); d.summary = ''; d.cost = { total: 0, withContingency: 0, envelope: 50000 };
    const x = execSummary(d);
    expect(x.summary).toBeTruthy();
    expect(x.problem).toBeTruthy();
    expect(x.cost.kind).toBe('envelope');
    const out = finalDocument(d, EXPORT_PRESETS.send);
    const sum = out.body.slice(out.body.indexOf(DOC_TEXT.summary.title));
    expect(text(sum.slice(0, sum.indexOf('</section>'))).length).toBeGreaterThan(150);
  });
  it('القطع عند حد جملة أو كلمة، لا وسط كلمة', () => {
    const long = `${'كلمة طويلة جدا '.repeat(30)}`;
    const cut = firstSentences(long, 100);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(long[cut.length - 1]).toMatch(/\s/);
    expect(firstSentences('جملة أولى تامة هنا. وجملة ثانية أطول من الحد بكثير جدا جدا', 40)).toBe('جملة أولى تامة هنا.');
  });
  it('سطر التوصية من الأجزاء الموجودة وحدها، بلا خانة فارغة', () => {
    expect(docRecommendAr({})).toBeNull();
    expect(docRecommendAr({ amount: '100 ريال' })).toBe('يُوصى باعتماد تمويل قدره 100 ريال.');
    expect(docRecommendAr({ firstStep: 'مسح الحالة', operator: 'الإدارة' })).not.toMatch(/\/|undefined|null/);
  });
  it('ملف العمل يشير إلى الفصل الناقص، ونسخة الإرسال لا', () => {
    const d = live(); d.sections = d.sections.filter((s) => s.key !== 'benefits-register');
    expect(capstoneReport(d).body).toContain('يُستكمل من فصل');
    expect(finalDocument(d, EXPORT_PRESETS.send).body).not.toContain('يُستكمل من فصل');
  });
});

describe('شعار الجهة على الغلاف', () => {
  const out = finalDocument(live(), EXPORT_PRESETS.send);
  const h = html(out);
  it('بلا لوحة بيضاء، ودمج multiply للنقطي، وشريط مسطح بلا نقش تحته، وحجم أكبر متوازن', () => {
    expect(h).not.toMatch(/class="org plate"/);
    expect(h).toMatch(/class="org logo-zone blend"/);
    expect(h).not.toMatch(/\.org\.plate/);
    expect(h).toMatch(/\.mast\.co \.org\.blend img \{ mix-blend-mode: multiply; \}/);
    expect(h).toMatch(new RegExp(`\\.mast\\.co \\.top \\{ background: ${C.mist};`));
    expect(LOGO_MM.max).toBeGreaterThanOrEqual(24);
    expect(LOGO_MM.max / LOGO_MM.by).toBeGreaterThanOrEqual(2.5);
    expect(LOGO_MM.max / LOGO_MM.by).toBeLessThanOrEqual(4);
  });
  it('SVG بلا دمج، والرابط الخارجي يُرفض فيُكتب الاسم', () => {
    const d = live(); d.meta.org.logo = `data:image/svg+xml;base64,${btoa('<svg/>')}`;
    expect(html(finalDocument(d, EXPORT_PRESETS.send))).toMatch(/class="org logo-zone"/);
    d.meta.org.logo = 'https://evil.example/x.png';
    expect(html(finalDocument(d, EXPORT_PRESETS.send))).not.toContain('evil.example');
  });
});

describe('سجل البوابات بلا صفوف مكررة', () => {
  it('القرار نفسه على الكيان نفسه خلال دقائق صف واحد، والكيانان المختلفان صفان', () => {
    const ev = [
      { action: 'capstone.submit', created_at: '2026-11-01T10:00:00Z', entity_id: 'a' },
      { action: 'capstone.submit', created_at: '2026-11-01T10:00:40Z', entity_id: 'a' },
      { action: 'capstone.submit', created_at: '2026-11-01T10:01:10Z', entity_id: 'a' },
      { action: 'submission.review', created_at: '2026-11-01T10:00:00Z', entity_id: 'b', after: {} },
      { action: 'submission.review', created_at: '2026-11-01T10:00:05Z', entity_id: 'c', after: {} },
      { action: 'capstone.submit', created_at: '2026-11-05T10:00:00Z', entity_id: 'a' },
    ];
    const out = gateDecisions(ev);
    expect(out.filter((x) => x.decision === 'قدّم الوثيقة للمراجعة')).toHaveLength(2);
    expect(out.filter((x) => x.gate === 'بوابة البطاقة')).toHaveLength(2);
    expect(out[0]).not.toHaveProperty('entity');
  });
});

describe('رمز التحقق: السبب قبل التحميل', () => {
  it('qrExportReason للحالات الأربع', () => {
    expect(qrExportReason({ approved: false, issued: true })).toBe('draft');
    expect(qrExportReason({ approved: true, issued: false })).toBe('unissued');
    expect(qrExportReason({ approved: true, issued: true, qr: false })).toBe('withheld');
    expect(qrExportReason({ approved: true, issued: true, qr: true })).toBeNull();
    for (const k of ['draft', 'unissued', 'withheld']) expect(DOC_QR_EXPORT_AR[k]).toBeTruthy();
  });
  it('سطر الملخص يقول «دون رمز تحقق» لغير المعتمدة وللمعتمدة بلا بصمة', () => {
    expect(exportSummary(EXPORT_PRESETS.send, { approved: false })).toContain(DOC_QR_EXPORT_AR.summaryNone);
    expect(exportSummary(EXPORT_PRESETS.send, { approved: true, available: false })).toContain(DOC_QR_EXPORT_AR.summaryNone);
    expect(exportSummary(EXPORT_PRESETS.send, { approved: true, available: true })).toContain('رمز التحقق');
    expect(exportSummary(EXPORT_PRESETS.send, { approved: true, available: true })).not.toContain(DOC_QR_EXPORT_AR.summaryNone);
  });
  it('لوح التصدير يقرأ qr_state كاملًا ويُظهر السبب سطرًا لا تلميحًا', () => {
    const src = readFileSync('admin-app/src/screens/Capstones.jsx', 'utf8');
    expect(src).not.toContain('رمز التحقق للوثيقة المعتمدة فقط');
    expect(src).toMatch(/DOC_QR_EXPORT_AR\[reason\]/);
    expect(src).toMatch(/qr=\{d\.qr_state\}/);
    expect(readFileSync('admin-app/src/screens/PersonFile.jsx', 'utf8')).toMatch(/qr=\{d\.qr_state\}/);
  });
});

describe('مخطط الصفحات: لا قطع وسط سطر ولا عنوان يتيم', () => {
  it('حادثة الفصل 8: لا كسر مسموح في النافذة، فيُختار أعلى سطر لا الحد', () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({ top: i * 30 + 5, bottom: i * 30 + 25 }));
    const heads = [{ top: 905, bottom: 945 }];
    const pages = planPages({ total: 1800, cands: [], pageH: 1000, firstH: 1000, lines, heads });
    for (const p of pages.slice(0, -1)) {
      expect([...lines, ...heads].some((b) => p.end > b.top + 0.5 && p.end < b.bottom - 0.5)).toBe(false);
    }
  });
  it('رأس الجدول لا يُكرر حين يرجع الحد فوقه (حادثة الصفحة 4): الرأس يبدأ الصفحة مرة واحدة', () => {
    const head = { top: 960, bottom: 990 };
    const heads = [{ top: 930, bottom: 955 }];
    const pages = planPages({ total: 1800, cands: [{ y: 990, head }], pageH: 1000, firstH: 1000, lines: [], heads });
    expect(pages[0].end).toBe(930);
    expect(pages[1].head).toBe(null);
  });
  it('الأرقام في خلايا الجداول لا تنكسر، والكيانات لا تُمس', () => {
    const out = nowrapNumbers('<td class="x1">480,000 سنويًا &#39; 5%</td><th>9</th>');
    expect(out).toContain('<bdi class="num">480,000</bdi> سنويًا &#39; <bdi class="num">5%</bdi>');
    expect(out).toContain('class="x1"');
    expect(out).toContain('<th>9</th>');
  });
  it('لا يبقى عنوان آخر الصفحة: الكسر بعد العنوان يرد إلى أعلاه', () => {
    expect(safeEnd(950, 0, { heads: [{ top: 900, bottom: 940 }] })).toBe(900);
    expect(safeEnd(920, 0, { heads: [{ top: 900, bottom: 940 }] })).toBe(900);
    expect(safeEnd(700, 0, { heads: [{ top: 900, bottom: 940 }] })).toBe(700);
  });
  it('خاصية: لأي مدخلات عشوائية لا يقع حد داخل سطر، ويتقدم كل حد', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 50; k++) {
      const lines = []; let y = 0;
      while (y < 5000) { const h = 14 + rnd() * 30; lines.push({ top: y, bottom: y + h }); y += h + 2 + rnd() * 20; }
      const cands = lines.filter(() => rnd() < 0.1).map((l) => ({ y: Math.floor(l.top) }));
      const pages = planPages({ total: 5000, cands, pageH: 900, firstH: 800, lines });
      let prev = 0;
      for (const p of pages) {
        expect(p.end).toBeGreaterThan(prev);
        prev = p.end;
        if (p.end < 5000) expect(lines.some((b) => p.end > b.top + 0.5 && p.end < b.bottom - 0.5)).toBe(false);
      }
    }
  });
  it('CSS: العنوان ورأس القسم لا ينقسمان، ولا ينفصلان عما بعدهما', () => {
    const h = html(finalDocument(live(), EXPORT_PRESETS.send));
    expect(h).toMatch(/h2, h3, h4 \{ break-after: avoid; break-inside: avoid; \}/);
    expect(h).toMatch(/\.sec > header \{[^}]*break-inside: avoid;/);
    expect(h).toMatch(/\.sec > header \+ \* \{ break-before: avoid; \}/);
    expect(h).toMatch(/\.tbl thead \{ display: table-header-group; \}/);
  });
});
