// تصور بناء المبادرة (اعتمده المالك 2026-11-14، الخيار ج): docs/content/2026-11-14-تصور-بناء-المبادرة-وحالة-العمل-v1.md
// الميثاق وحالة العمل عرضان مولّدان من الفصول، والمبرر والتكلفة للتأسيسي، والراعي توضيح لا شرط، وفصل الشراء.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { businessCase, caseStatus, charterData, FIVE_CASES, highRisks } from '../../supabase/functions/leaders-api/business-case.js';
import { capstoneChecks, CARD_REVIEW_CRITERIA } from '../../supabase/functions/leaders-api/capstone.js';
import { fieldsFor } from '../../supabase/functions/leaders-api/logic.js';
import { capstoneReport } from '../../src/lib/brand/capstone.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const MIG = read('supabase/migrations/20261114140000_leaders_initiative_business_case.sql');

const field = (key, type, value, columns = null) => ({ key, label: key, type, columns, value });
const doc = () => ({
  meta: { status: 'draft' },
  cost: { total: 40000, contingency: 10, withContingency: 44000, envelope: 50000, by: {} },
  sections: [
    { key: 'initiative-charter', dimension: 'milestone', title: 'بطاقة المبادرة', fields: [
      field('title', 'text', 'رقمنة خدمات المستفيدين'), field('objective', 'textarea', 'تحسين تجربة المستفيد'),
      field('problem', 'textarea', 'متوسط الإنجاز 9 أيام والمستهدف 3'), field('start', 'text', '2026-01-01'), field('end', 'text', '2026-12-31'),
      field('sponsor', 'text', 'وكيل الخدمات: يعتمد الموازنة'), field('deliverables', 'table', [['منصة', 'تعمل', 'يونيو']], ['المخرج', 'معيار القبول', 'الموعد']),
    ] },
    { key: 'options-analysis', dimension: 'impact', title: 'المبرر والبدائل', fields: [
      field('options', 'table', [['عدم التدخل', '', '0', '', ''], ['منصة موحدة', '', '40000', '', '']], ['البديل', 'الوصف', 'التكلفة التقديرية', 'المنفعة المتوقعة', 'المخاطر الرئيسة']),
      field('recommendation', 'textarea', 'المنصة الموحدة لأنها تختصر الزمن'),
    ] },
    { key: 'benefits-register', dimension: 'impact', title: 'سجل المنافع', fields: [
      field('benefits', 'table', [['زمن الإنجاز', 'أيام', '9', '3', 'إدارة الخدمات']], ['المنفعة', 'المؤشر وطريقة القياس', 'خط الأساس', 'المستهدف', 'المالك بعد التسليم']),
    ] },
    { key: 'cost-plan', dimension: 'milestone', title: 'الموارد والتكلفة', fields: [field('funding', 'textarea', 'الميزانية التشغيلية')] },
    { key: 'procurement', dimension: 'milestone', title: 'الشراء والتعاقد', fields: [field('need', 'select', 'لا، تُنفَّذ بموارد الجهة')] },
    { key: 'raid', dimension: 'milestone', title: 'سجل المخاطر', fields: [
      field('items', 'table', [['R1', 'خطر', 'تأخر المورد', '4', '4', 'خالد', 'عقد بغرامات', ''], ['R2', 'خطر', 'خطر صغير', '1', '2', '', '', '']],
        ['الرمز', 'النوع', 'الوصف', 'الاحتمال (1 إلى 5)', 'شدة الأثر (1 إلى 5)', 'المالك', 'الاستجابة', 'مرتبط بحزمة']),
    ] },
  ],
});

describe('حالة العمل: الأبعاد الخمسة', () => {
  it('خمسة أبعاد بترتيب نموذج الحالات الخمس، ولكل بعد فصوله', () => {
    expect(FIVE_CASES.map((c) => c.key)).toEqual(['strategic', 'economic', 'commercial', 'financial', 'management']);
    for (const c of FIVE_CASES) expect(c.chapters.length).toBeGreaterThan(0);
  });
  it('حالة البعد من فصوله في وثيقة المشارك: غائب، ناقص، مكتمل', () => {
    const s = caseStatus([{ key: 'initiative-charter', complete: true }, { key: 'theory-of-change', complete: false }, { key: 'cost-plan', complete: true }]);
    const by = Object.fromEntries(s.map((x) => [x.key, x]));
    expect(by.strategic).toMatchObject({ state: 'partial', done: 1, total: 2 });
    expect(by.financial).toMatchObject({ state: 'done', done: 1, total: 1 });
    expect(by.commercial.state).toBe('none');
  });
  it('يُبنى من الفصول نفسها: التوصية والبدائل والموازنة والمخاطر العالية', () => {
    const bc = Object.fromEntries(businessCase(doc()).map((c) => [c.key, c]));
    expect(bc.economic.points).toContainEqual(['التوصية ومبررها', 'المنصة الموحدة لأنها تختصر الزمن']);
    expect(bc.economic.table.rows).toHaveLength(2);
    expect(bc.financial.points.find(([k]) => k === 'الموازنة المتاحة')[1]).toContain('والتكلفة ضمنها');
    expect(bc.commercial.points).toContainEqual(['الحاجة إلى الشراء', 'لا، تُنفَّذ بموارد الجهة']);
    expect(bc.management.points.find(([k]) => k === 'المخاطر العالية')[1]).toContain('تأخر المورد');
  });
  it('البعد الذي لا فصل له في الوثيقة يُقال إنه غائب، لا يُخفى', () => {
    const d = doc();
    d.sections = d.sections.filter((s) => s.key !== 'procurement');
    expect(businessCase(d).find((c) => c.key === 'commercial').missing).toBe('ليس من فصول وثيقتك في مستواك');
  });
  it('المخاطر العالية: الاحتمال × الأثر 12 فأكثر فقط', () => {
    expect(highRisks(doc()).map((x) => x.title)).toEqual(['تأخر المورد']);
  });
});

describe('ميثاق المبادرة: صفحة مولّدة', () => {
  it('الموازنة من التكلفة والمنافع من سجلها والراعي توضيح لدوره', () => {
    const c = Object.fromEntries(charterData(doc()).rows);
    expect(c['الموازنة']).toBe('التكلفة مع الاحتياطي 44,000 ريال، من موازنة متاحة 50,000 ريال');
    expect(c['أهم المنافع']).toBe('زمن الإنجاز (من 9 إلى 3)');
    expect(c['الراعي ودوره']).toBe('وكيل الخدمات: يعتمد الموازنة');
    expect(c['مصدر التمويل']).toBe('الميزانية التشغيلية');
  });
  it('بلا بطاقة لا ميثاق', () => expect(charterData({ sections: [] })).toBeNull());
  it('الوثيقة الاحترافية تحمل الميثاق وحالة العمل قبل الفهرس', () => {
    const { body } = capstoneReport(doc());
    const i = (t) => body.indexOf(t);
    expect(i('ميثاق المبادرة')).toBeGreaterThan(0);
    expect(i('حالة العمل')).toBeGreaterThan(i('ميثاق المبادرة'));
    expect(i('فهرس الوثيقة')).toBeGreaterThan(i('حالة العمل'));
    expect(body).toContain('البعد التجاري');
  });
});

describe('الترحيل: المبرر والتكلفة للتأسيسي، والراعي توضيح، وفصل الشراء', () => {
  it('متسامح مع النشر ويسجّل اسمه ويأخذ نسخة قبل التغيير', () => {
    expect(MIG.split('\n')[0]).toMatch(/^-- deploy-gate: tolerant/);
    expect(MIG).toContain("insert into leaders.schema_migrations (name) values ('20261114140000_leaders_initiative_business_case')");
    expect(MIG).toContain('create table if not exists leaders.backup_20261114_business_case');
  });
  it('المبرر والتكلفة ينزلان للتأسيسي فقط من المتوسط، وما حرّرته الإدارة لا يُمس', () => {
    expect(MIG).toContain("update leaders.learning_models set min_level = 'beginner' where key = 'options-analysis' and min_level = 'intermediate';");
    expect(MIG).toContain("update leaders.learning_models set min_level = 'beginner' where key = 'cost-plan' and min_level = 'intermediate';");
    // كل تعديل حقل مشروط بقيمته الأصلية
    for (const m of MIG.matchAll(/select pg_temp\.patch_if\('[^']+', '[^']+', '(\w+)', '([^']*)'/g)) expect(['hint', 'label']).toContain(m[1]);
  });
  it('الراعي وبريده اختياريان بتوضيح أن المبادرة قد تكون افتراضية', () => {
    expect(MIG).toMatch(/"label": "الراعي: منصبه ودوره في هيكل المبادرة", "required": false/);
    expect(MIG).toMatch(/"label": "بريد الراعي \(إن كان للمبادرة راعٍ فعلي\)", "required": false/);
    expect(CARD_REVIEW_CRITERIA.join(' ')).not.toContain('ليست تمرينًا');
    expect(CARD_REVIEW_CRITERIA).toContain('واقعية في سياق جهته، حقيقية كانت أو افتراضية');
  });

  const proc = (() => {
    const m = MIG.match(/\('milestone', 'procurement'[\s\S]*?\$q\$(\[[\s\S]*?\])\$q\$::jsonb\)/);
    return { key: 'procurement', dimension: 'milestone', fields: JSON.parse(m[1]) };
  })();
  it('فصل الشراء: سؤال واحد إلزامي للتأسيسي، والباقي يتعمق بالمستوى', () => {
    const req = (lvl) => fieldsFor(proc.fields, lvl).filter((f) => f.required !== false).map((f) => f.key);
    expect(req('beginner')).toEqual(['need']);
    expect(fieldsFor(proc.fields, 'beginner').map((f) => f.key)).toEqual(['need', 'items']);
    expect(fieldsFor(proc.fields, 'advanced').map((f) => f.key)).toEqual(['need', 'items', 'lead_time', 'contract']);
    expect(proc.fields[0].options[1].startsWith('نعم')).toBe(true);
  });
  it('من قال إنه يحتاج شراء يكتب بندًا، ومن لا يحتاج لا يُفحص', () => {
    const run = (answers) => capstoneChecks({ scope: 'project', models: { procurement: proc }, answers: { procurement: answers } }).find((c) => c.key === 'procurement');
    expect(run({ need: proc.fields[0].options[0] })).toBeUndefined();
    expect(run({ need: proc.fields[0].options[1], items: [] }).ok).toBe(false);
    expect(run({ need: proc.fields[0].options[1], items: [['منصة', '30000', 'منافسة عامة', 'مارس']] }).ok).toBe(true);
  });
});
