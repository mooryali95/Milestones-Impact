// المرحلة 26: صفحة القرار في النسخة المؤسسية (القرار المعروض عليكم)
import { describe, expect, it } from 'vitest';
import { institutionalReport } from '../../src/lib/brand/institutional.js';
import { FORMS } from '../../supabase/functions/leaders-api/document-forms.js';
import * as L from '../../supabase/functions/leaders-api/labels.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from './guide.js';

const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const decPage = (body) => (body.match(/<section class="in-dec">[\s\S]*?<\/section>/) || [''])[0];

function doc({ status = 'draft', start = '2027-03-01', quo = true } = {}) {
  const d = exampleDoc(EXAMPLES[0]);
  const sections = d.sections.map((s) => (s.key !== 'options-analysis' ? s : { ...s, fields: s.fields.map((f) => {
    if (f.key !== 'options' || !Array.isArray(f.value)) return f;
    const rows = f.value.filter((r) => !/عدم|الوضع الحالي|بلا تدخل|لا شيء|الإبقاء/.test(String(r[0] ?? '')));
    return { ...f, value: quo ? [['الإبقاء على الوضع الحالي', 'يستمر الانتظار ساعة لكل مراجع'], ...rows] : rows };
  }) }));
  return { ...d, sections, meta: { ...d.meta, example: false, status, start, sponsor: 'مدير التجمع: يعتمد الموازنة', initiative: 'تقليل الانتظار', approved_at: status === 'approved' ? '2027-01-10T09:00:00Z' : null } };
}

describe('صفحة القرار', () => {
  const r = institutionalReport(doc());
  const page = decPage(r.body);
  const t = text(page);
  it('العنوان والوصف والخانات من labels.js', () => {
    expect(r.blocked).toBeUndefined();
    for (const k of ['title', 'eyebrow', 'lead', 'decision', 'issue', 'recommend', 'resources']) expect(t, k).toContain(L.DOC_DECISION_AR[k]);
    expect(t).not.toContain('ما المطلوب منك');
    expect(t).not.toMatch(/ثلاث منافع|أعلى ثلاث مخاطر|القرار المطلوب/);
  });
  it('جملة قصيرة، وشريط ثلاث خانات، وسطر الخيارات، والموعد من تاريخ البدء', () => {
    expect(t).toMatch(/نوصي باعتماد مبادرة «تقليل الانتظار» برعاية [^:.]+\./);
    expect(page.match(/<div class="in-strip">([\s\S]*?)<\/div><\/div>/)).toBeTruthy();
    expect(t).toMatch(/إجمالي الميزانية \(شاملًا احتياطي \d+%\)/);
    expect(t).toContain(L.DOC_DECISION_AR.duration);
    expect(t).toContain('اعتماد · اعتماد بشروط · إرجاع');
    // تاريخ بدء المثال (2026-01-04) فائت، فلا يُعرض موعد قرار منقضٍ؛ حالة الموعد المستقبلي في src/lib/brand/decision-page.test.js
    expect(t).not.toContain('يلزم القرار قبل');
  });
  it('كلفة عدم القرار من بديل الوضع الحالي وحده', () => {
    expect(t).toContain(L.DOC_DECISION_AR.noDecision);
    expect(t).toContain('يستمر الانتظار ساعة لكل مراجع');
    expect(text(decPage(institutionalReport(doc({ quo: false })).body))).not.toContain(L.DOC_DECISION_AR.noDecision);
  });
  it('المنافع بسطر «من … إلى …» والمخاطر باستجابتها، بحد صفحة القرار', () => {
    if (t.includes(L.DOC_DECISION_AR.benefits)) expect(page).toMatch(/من <bdi>[^<]+<\/bdi> إلى <bdi>/);
    if (t.includes(L.DOC_DECISION_AR.risks)) expect(t).toContain(`${L.DOC_DECISION_AR.response}:`);
    const cards = (page.split(L.DOC_DECISION_AR.risks)[1] || '').match(/class="in-card"/g) || [];
    expect(cards.length).toBeLessThanOrEqual(3);
  });
  it('المعتمدة بلا موعد قرار، وخيار decision يخفي الصفحة', () => {
    expect(text(decPage(institutionalReport(doc({ status: 'approved' })).body))).not.toContain('يلزم القرار قبل');
    expect(institutionalReport(doc(), { decision: false }).body).not.toContain('class="in-dec"');
  });
  it('وسم المبلغ «شاملًا الاحتياطي» في كل موضع، ولا وسم قديم', () => {
    const all = text(r.body);
    expect(all).toContain(L.BUDGET_TOTAL_AR);
    expect(all).not.toContain('التكلفة مع الاحتياطي');
  });
});

describe('حدود العرض في document-forms.js', () => {
  it('لكل شكل limits', () => {
    expect(FORMS.card.limits).toMatchObject({ benefits: 3, risks: 5 });
    expect(FORMS.charter.limits).toMatchObject({ benefits: 5, risks: 5 });
    expect(FORMS.case.limits).toMatchObject({ benefits: 8, risks: 10 });
  });
});
