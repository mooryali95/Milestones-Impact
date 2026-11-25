// تشريح المبادرة: المعنى، وخريطة الفصول بمراحلها، والمسرد، والإحالة إلى الكتاب، وخطة الانطلاق، وإخراج الوثيقة.
// التصور: docs/content/2026-11-15-تصور-فهم-المبادرة-وإخراج-وثيقتها-v1.md
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import A from '../../supabase/content/initiative-guide/v1/anatomy.json';
import { annotate, chapterInfo, define, GLOSSARY, groupByPhase, MEANING, PHASES, termsIn } from '../../supabase/content/initiative-guide/v1/anatomy.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { RISK_HIGH } from '../../supabase/functions/leaders-api/capstone.js';
import { launchPlan, LAUNCH_WINDOWS } from '../../supabase/functions/leaders-api/business-case.js';
import { capstoneReport, columnWidths } from '../../src/lib/brand/capstone.js';
import { documentHtml } from '../../src/lib/brand/doc.js';
import { exampleDoc } from './guide.js';
import { bookRef, chapterTone, nextChapter } from './screens/InitiativeMap.jsx';
import { OUT, render } from '../../scripts/content/anatomy-doc.mjs';

const BOOK = 'supabase/content/handbook/v3.1';
const bookFile = (dim, key) => readdirSync(BOOK).map((f) => `${BOOK}/${f}`).find((f) => f.includes(`/${dim}_`) && readFileSync(f, 'utf8').includes(`chapter_key: ${key}\n`));
const KEYS = EXAMPLES[0].sections.map((s) => s.key);

describe('خريطة الوثيقة: كل فصل في مرحلة واحدة، وله سبب وإحالة إلى باب قائم', () => {
  it('كل فصل في المثالين في مرحلة واحدة بالضبط، ولا مفتاح في المراحل بلا دليل', () => {
    for (const k of KEYS) expect(PHASES.filter((p) => p.chapters.includes(k)).length, k).toBe(1);
    for (const p of PHASES) for (const k of p.chapters) expect(chapterInfo(k)?.why, k).toBeTruthy();
    expect(Object.keys(A.chapters).sort()).toEqual(PHASES.flatMap((p) => p.chapters).sort());
  });
  it('كل إحالة إلى الكتاب بهوية قسم (section_id)، تُقرأ منها الباب والعنوان، والعنوان موجود في بابه', () => {
    const raw = [A.meaning.handbook, ...Object.values(A.chapters).map((c) => c.handbook)];
    for (const h of raw) expect(Object.keys(h), JSON.stringify(h)).toEqual(['section_id']);
    const refs = [MEANING.handbook, ...Object.keys(A.chapters).map((k) => chapterInfo(k).handbook)];
    for (const h of refs) expect(h, 'إحالة لا تُقرأ').toBeTruthy();
    for (const h of refs) {
      const f = bookFile(h.dimension, h.chapter_key);
      expect(f, `${h.dimension} ${h.chapter_key}`).toBeTruthy();
      expect(readFileSync(f, 'utf8'), h.look_for).toMatch(new RegExp(`^#{2,3} ${h.look_for.replace(/[()]/g, '\\$&')}$`, 'm'));
    }
  });
  it('التجميع بالمراحل يحفظ ترتيب الخادم ورقم الفصل، وما لم يُصنَّف في «فصول أخرى»', () => {
    const secs = [{ key: 'wbs' }, { key: 'initiative-charter' }, { key: 'new-thing' }];
    const g = groupByPhase(secs);
    expect(g.map((x) => x.key)).toEqual(['why', 'plan', 'other']);
    expect(g[0].items[0].n).toBe(2);
    expect(g[2].items[0]).toMatchObject({ key: 'new-thing', n: 3 });
  });
  it('الفصل التالي المقترح: المعاد أولًا ثم أول ناقص، والإحالة تحمل طريق العودة', () => {
    const s = [{ id: 'a', complete: true }, { id: 'b', complete: false }, { id: 'c', status: 'returned', complete: false }];
    expect(nextChapter(s).id).toBe('c');
    expect(nextChapter([s[0], s[1]]).id).toBe('b');
    expect(chapterTone(s[2])).toBe('bad');
    expect(bookRef({ id: 'x', key: 'raid', title: 'سجل المخاطر' })).toMatchObject({ dimension: 'milestone', chapter_id: 'x', from: 'سجل المخاطر' });
  });
});

describe('المسرد: تعريف واحد لكل مصطلح، يُعلَّم في موضعه', () => {
  it('حد الخطر يُقرأ من مصدره لا من المحتوى', () => {
    expect(JSON.stringify(A)).not.toMatch(/\b12 فأكثر/);
    expect(define('درجة الخطر').def).toContain(`${RISK_HIGH} فأكثر`);
    for (const g of GLOSSARY) expect(g.def).not.toMatch(/\{[A-Z_]+\}/);
  });
  it('لا صيغة لمصطلحين', () => {
    const forms = GLOSSARY.flatMap((g) => [g.term, ...g.aka]);
    expect(new Set(forms).size).toBe(forms.length);
  });
  it('الأطول أولًا، وأول ظهور فقط، ولا داخل كلمة أطول', () => {
    const p = annotate('الموازنة المتاحة تغطي الموازنة');
    expect(p.filter((x) => x.term).map((x) => x.text)).toEqual(['الموازنة المتاحة']);
    expect(annotate('عدد المعلمين').some((x) => x.term)).toBe(false);
    expect(annotate('الاحتمال (1 إلى 5)')[0].term.term).toBe('درجة الخطر');
    expect(annotate('وخط الأساس').find((x) => x.term).text).toBe('خط الأساس');
    expect(annotate('نص بلا مصطلح')).toEqual([{ text: 'نص بلا مصطلح' }]);
  });
  it('المصطلحات الواردة في نص بترتيب المسرد', () => {
    expect(termsIn('المنفعة لها خط الأساس والمستهدف').map((g) => g.term)).toEqual(['المنفعة', 'خط الأساس', 'المستهدف']);
  });
});

describe('خطة الانطلاق: أول 90 يومًا مولّدة من الفصول', () => {
  it('المثال المحلول: الخطوة الأولى في أول 30 يومًا، ومعالم وأنشطة مؤرخة، وقياس ومخاطر تُراقب', () => {
    for (const ex of EXAMPLES) {
      const l = launchPlan(exampleDoc(ex));
      expect(l.windows.map((w) => w.key)).toEqual(LAUNCH_WINDOWS.map((w) => w.key));
      expect(l.windows[0].items[0]).toMatch(/^الخطوة الأولى: /);
      expect(l.windows.flatMap((w) => w.items).length, ex.sector).toBeGreaterThan(3);
      expect(l.measure.length).toBeGreaterThan(0);
      expect(l.missing).toEqual([]);
    }
  });
  it('بطاقة بلا تواريخ ولا خطوة: لا نوافذ ممتلئة، وما يلزم لإكمالها مذكور', () => {
    const l = launchPlan({ sections: [{ key: 'initiative-charter', fields: [{ key: 'title', value: 'س' }] }] });
    expect(l.empty).toBe(true);
    expect(l.missing).toEqual(expect.arrayContaining(['اكتب الخطوة الأولى في بطاقة المبادرة', 'اكتب تاريخ البداية في بطاقة المبادرة']));
  });
  it('بلا بطاقة لا خطة', () => expect(launchPlan({ sections: [] })).toBeNull());
});

describe('إخراج الوثيقة الاحترافية', () => {
  const doc = exampleDoc(EXAMPLES[1]);
  const { meta, body } = capstoneReport(doc);
  it('الفهرس يربط كل فصل بمرساته، والأقسام الأمامية كذلك', () => {
    for (const s of doc.sections) {
      expect(body).toContain(`href="#ch-${s.key}"`);
      expect(body).toContain(`id="ch-${s.key}"`);
    }
    for (const k of ['charter', 'case', 'launch', 'glossary']) expect(body).toContain(`id="ch-${k}"`);
  });
  it('لا تكرار: جدول البدائل في فصله وحده، ومسوّغات المبادرة تحيل إليه', () => {
    const first = doc.sections.find((s) => s.key === 'options-analysis').fields.find((f) => f.key === 'options').value[0][0];
    expect(body.split(first).length - 1).toBe(1);
    expect(body).toMatch(/البدائل<\/b> \(\d+ صفوف\): <a href="#ch-options-analysis">/);
  });
  it('فصل البطاقة لا يكرر ما في الميثاق، والبريد لا يُطبع', () => {
    const ch = body.slice(body.indexOf('id="ch-initiative-charter"'), body.indexOf('id="ch-options-analysis"'));
    expect(ch).toContain('في ميثاق المبادرة أعلاه');
    expect(ch).not.toContain('<b>الهدف الاستراتيجي</b>');
    expect(body).not.toMatch(/بريد الراعي/);
  });
  it('عربية في عناوينها وترقيمها: لا عنوان قسم صغير بالإنجليزية، والترقيم «صفحة من»', () => {
    expect(body).not.toMatch(/class="eyebrow">[A-Za-z]/);
    expect(meta.pageAr).toBe(true);
    expect(documentHtml(meta, body)).toContain('content: "صفحة " counter(page) " من " counter(pages)');
    expect(documentHtml({ title: 'x' }, '')).toContain('"PAGE " counter(page)');
  });
  it('خطة الانطلاق ومسرد المصطلحات ملحقان، والمسرد لما ورد في الوثيقة وحدها', () => {
    expect(body).toContain('خطة الانطلاق: أول 90 يومًا');
    expect(body).toContain('مسرد المصطلحات');
    expect(body).toContain('<th>خط الأساس</th>');
  });
  it('عرض العمود بقدر محتواه: عمود الوصف أعرض من عمود الرقم، والتاريخ لا ينكسر', () => {
    const w = columnWidths(['الرمز', 'الوصف', 'الاحتمال (1 إلى 5)'], [['R1', 'تأخر واجهة نظام المواعيد من إدارة التقنية المعنية', '4']]).map(parseFloat);
    expect(w[1]).toBeGreaterThan(w[2] * 2);
    expect(Math.round(w.reduce((a, b) => a + b, 0))).toBe(100);
    const d = columnWidths(['السلوك', 'الموعد'], [['نص طويل جدًا يصف سلوكًا أسبوعيًا محددًا قابلًا للقياس', '2026-05-31']]).map(parseFloat);
    expect(d[1]).toBeGreaterThan(14);
  });
});

describe('مرجع الخبير: مولَّد من المصدر الواحد ومطابق له', () => {
  it('الملف المودع هو ناتج التوليد نفسه (node scripts/content/anatomy-doc.mjs)', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(render());
  });
});
