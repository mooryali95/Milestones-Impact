// مشروع التخرج: محرك الوثيقة على النماذج كما تُزرع في قاعدة البيانات
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bindAnswers, canSubmit, capstoneChecks, capstoneModels, cleanRubric, costSummary, importRows, initiativeOf,
  leaderComposite, parseDate, parseNumber, readiness, RUBRIC, rubricScore, sectionState,
} from '../../supabase/functions/leaders-api/capstone.js';
import { activityFor, cleanConfig, fieldsFor, modelsFor, modelStatus, VERIFIED_KINDS } from '../../supabase/functions/leaders-api/logic.js';
import { capstoneReport } from '../../src/lib/brand/capstone.js';
import { documentHtml } from '../../src/lib/brand/doc.js';

// حقول النماذج من الهجرة نفسها، فيُختبر المحرك على ما يراه المشارك فعلًا
const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261029120000_leaders_capstone.sql'), 'utf8');
const MODELS = {};
for (const m of sql.matchAll(/\('(\w+)', '([a-z-]+)', \d+, \$q\$[^$]*\$q\$[\s\S]*?\$q\$(\[[\s\S]*?\])\$q\$::jsonb\)/g)) {
  MODELS[m[2]] = { key: m[2], dimension: m[1], fields: JSON.parse(m[3]) };
}
MODELS['benefits-register'] = { key: 'benefits-register', dimension: 'impact', fields: [
  { key: 'project', type: 'text', bind: 'initiative' },
  { key: 'benefits', type: 'table', columns: ['المنفعة', 'المؤشر وطريقة القياس', 'خط الأساس', 'المستهدف', 'المالك بعد التسليم', 'معلم القيمة'] },
] };
MODELS['portfolio-review'] = { key: 'portfolio-review', dimension: 'milestone', fields: [{ key: 'criteria', type: 'table', columns: ['المعيار', 'الوزن %'] }] };
const cols = (k, f) => MODELS[k].fields.find((x) => x.key === f).columns;

const good = () => ({
  'initiative-charter': { title: 'تحول رقمي للخدمات', sponsor_email: 'sponsor@gov.sa', start: '2026-01-01', end: '2026-12-31' },
  'options-analysis': { options: [['عدم التدخل', '', '', '', ''], ['منصة موحدة', '', '', '', '']] },
  wbs: { packages: [['W1', 'التصميم', 'وثيقة', 'سارة', '30'], ['W2', 'البناء', 'منصة', 'خالد', '60']] },
  governance: { raci: [['W1', 'سارة', 'المدير', '', ''], ['W2', 'خالد', 'المدير', '', '']] },
  'cost-plan': { items: [['W1', 'استشارات', '2', '1000', ''], ['W2', 'ترخيص', '', '', '3000']], envelope: '10000', contingency: '10' },
  schedule: { activities: [['A1', 'التصميم', '2026-02-01', '2026-03-01', ''], ['A2', 'البناء', '2026-03-02', '2026-06-01', 'A1']] },
  raid: { items: [['R1', 'خطر', 'تأخر المورد', '4', '4', 'خالد', 'عقد بغرامات', 'W2']] },
  'benefits-register': { benefits: [['رضا المستفيد', 'نسبة الرضا', '60', '85', 'إدارة الخدمات', 'الربع الرابع']] },
  'evidence-plan': { plan: [['نسبة الرضا', 'استبيان', 'ربعي', 'الجودة', 'عينة']] },
});
const ctx = (answers, scope = 'project') => ({ scope, models: MODELS, answers });
const byKey = (checks) => Object.fromEntries(checks.map((c) => [c.key, c]));

describe('مصدر النماذج', () => {
  it('الهجرة تزرع فصول الوثيقة بجداولها', () => {
    for (const k of ['initiative-charter', 'options-analysis', 'wbs', 'schedule', 'cost-plan', 'roadmap', 'governance', 'raid', 'evidence-plan', 'change-sustain', 'transformation-story']) expect(MODELS[k], k).toBeTruthy();
    expect(MODELS['evidence-plan'].fields.find((f) => f.key === 'plan').import).toEqual({ model: 'benefits-register', field: 'benefits' });
  });
});

describe('فحوص الاتساق', () => {
  it('وثيقة متسقة تجتاز كل الفحوص', () => {
    const c = capstoneChecks(ctx(good()));
    expect(c.filter((x) => !x.ok)).toEqual([]);
    expect(Object.keys(byKey(c))).toEqual(expect.arrayContaining(['sponsor', 'do-nothing', 'wbs-owner', 'raci-cover', 'raci-a', 'cost-cover', 'cost-envelope', 'dates', 'deps', 'window', 'risk-owner', 'risk-link', 'benefit-owner', 'evidence']));
  });
  it('تكشف كل خلل في موضعه', () => {
    const a = good();
    a['initiative-charter'].sponsor_email = 'لا';
    a['options-analysis'].options = [['منصة', '', '', '', '']];
    a.wbs.packages[1][3] = '';
    a.governance.raci[0][2] = '';
    a['cost-plan'].envelope = '1000';
    a.schedule.activities[1] = ['A2', 'البناء', '2026-06-01', '2026-03-02', 'A9'];
    a.raid.items[0][5] = '';
    a.raid.items[0][7] = 'W7';
    a['evidence-plan'].plan = [['مؤشر آخر', '', '', '', '']];
    const c = byKey(capstoneChecks(ctx(a)));
    for (const k of ['sponsor', 'do-nothing', 'wbs-owner', 'raci-a', 'cost-envelope', 'dates', 'deps', 'risk-owner', 'risk-link', 'evidence']) expect(c[k].ok, k).toBe(false);
    expect(c['wbs-owner'].detail).toContain('W2');
    expect(c.deps.detail).toContain('A9');
  });
  it('الجدول خارج مدة البطاقة', () => {
    const a = good();
    a.schedule.activities[1][3] = '2027-02-01';
    expect(byKey(capstoneChecks(ctx(a))).window.ok).toBe(false);
  });
  it('فحوص النطاق: أوزان المحفظة ودفعات البرنامج', () => {
    expect(byKey(capstoneChecks(ctx({ 'portfolio-review': { criteria: [['القيمة', '60'], ['المخاطر', '30']] } }, 'portfolio'))).weights.ok).toBe(false);
    expect(byKey(capstoneChecks(ctx({ 'portfolio-review': { criteria: [['القيمة', '60'], ['المخاطر', '40']] } }, 'portfolio'))).weights.ok).toBe(true);
    expect(byKey(capstoneChecks(ctx({ roadmap: { tranches: [['الأولى', '', '', '', 'منافع']] } }, 'program'))).tranches.ok).toBe(false);
    expect(byKey(capstoneChecks(ctx({ roadmap: { tranches: [['الأولى', 'P1', '', '', 'منافع']] } }, 'project'))).tranches).toBeUndefined();
  });
  it('نموذج بلا جدوله المتوقع لا يكسر المحرك', () => {
    const models = { ...MODELS, raid: { key: 'raid', fields: [] }, 'benefits-register': { key: 'benefits-register', fields: [] } };
    expect(() => capstoneChecks({ scope: 'project', models, answers: good() })).not.toThrow();
  });
});

describe('الأرقام والتواريخ والتكلفة', () => {
  it('يقرأ الأرقام العربية والفواصل', () => {
    expect(parseNumber('١٢٬٥٠٠ ريال')).toBe(12500);
    expect(parseNumber('3,000')).toBe(3000);
    expect(parseNumber('')).toBeNull();
    expect(parseDate('2026-03-15')).toBe(Date.UTC(2026, 2, 15));
    expect(parseDate('15/3/2026')).toBe(Date.UTC(2026, 2, 15));
    expect(parseDate('مارس')).toBeNull();
  });
  it('التكلفة من الإجمالي أو الكمية بسعر الوحدة، مع الاحتياطي', () => {
    const c = costSummary(MODELS['cost-plan'], good()['cost-plan']);
    expect(c).toMatchObject({ total: 5000, by: { W1: 2000, W2: 3000 }, contingency: 10, withContingency: 5500, envelope: 10000 });
  });
});

describe('مصدر واحد للبيانات', () => {
  it('اسم المبادرة من البطاقة وحدها، والحقول المربوطة تأخذه', () => {
    expect(initiativeOf({ title: '  تحول  ' })).toBe('تحول');
    expect(initiativeOf({})).toBeNull();
    const fields = MODELS['benefits-register'].fields;
    expect(bindAnswers(fields, { project: 'قديم', benefits: [] }, 'تحول').project).toBe('تحول');
    expect(bindAnswers(fields, { project: 'قديم' }, null).project).toBe('قديم');
  });
  it('الاستيراد يطابق الأعمدة بالمعنى', () => {
    const rows = importRows(cols('evidence-plan', 'plan'), cols('benefits-register', 'benefits'), good()['benefits-register'].benefits);
    expect(rows[0][0]).toBe('نسبة الرضا');
    expect(rows[0][3]).toBe('إدارة الخدمات');
    const gate = importRows(['الخطر', 'الاحتمال', 'الأثر', 'المالك', 'الإجراء'], cols('raid', 'items'), good().raid.items);
    expect(gate[0]).toEqual(['تأخر المورد', '4', '4', 'خالد', 'عقد بغرامات']);
    expect(importRows(['أ'], ['أ'], [['', 'x'], 'bad'])).toEqual([]);
  });
});

describe('الفصول بالمستوى والنطاق', () => {
  const ms = [
    { key: 'a', dimension: 'milestone', min_level: 'beginner', sort: 1, capstone_sort: 20, scopes: [] },
    { key: 'b', dimension: 'milestone', min_level: 'beginner', sort: 2, capstone_sort: 10, scopes: ['program'] },
    { key: 'c', dimension: 'impact', min_level: 'advanced', sort: 1, capstone_sort: 30, scopes: [] },
    { key: 'd', dimension: 'impact', min_level: 'beginner', sort: 2, capstone_sort: null, scopes: [] },
  ];
  const lv = { milestone: 'beginner', impact: 'intermediate', leadership: 'beginner' };
  it('النطاق يحدد النماذج، والغائب يعني مشروعًا', () => {
    expect(modelsFor(ms, lv).map((m) => m.key)).toEqual(['a', 'd']);
    expect(modelsFor(ms, lv, 'program').map((m) => m.key)).toEqual(['a', 'b', 'd']);
  });
  it('فصول الوثيقة مرتبة بترتيبها فيها', () => {
    expect(capstoneModels(ms, lv, 'program').map((m) => m.key)).toEqual(['b', 'a']);
    expect(capstoneModels(ms, { ...lv, impact: 'advanced' }, 'program').map((m) => m.key)).toEqual(['b', 'a', 'c']);
  });
  it('الحقول تتعمق بالمستوى والنطاق', () => {
    const f = [{ key: 'x' }, { key: 'y', min_level: 'intermediate' }, { key: 'z', scopes: ['portfolio'] }];
    expect(fieldsFor(f, 'beginner').map((x) => x.key)).toEqual(['x']);
    expect(fieldsFor(f, 'advanced', 'portfolio').map((x) => x.key)).toEqual(['x', 'y', 'z']);
  });
});

describe('الجاهزية والتسليم', () => {
  it('نصف للاكتمال ونصف للاتساق', () => {
    expect(readiness([{ complete: true }, { complete: false }], [{ ok: true }, { ok: true }])).toBe(75);
    expect(readiness([], [])).toBe(50);
  });
  it('حالة الفصل من الحقول الإلزامية', () => {
    const fields = [{ key: 'a', type: 'text', required: true, label: 'أ' }];
    expect(sectionState({}, fields, { answers: { a: 'نص' }, status: 'draft' })).toMatchObject({ complete: true, status: 'draft' });
    expect(sectionState({}, fields, null).complete).toBe(false);
  });
  it('لا تسليم قبل النطاق والاسم والفصول والجاهزية', () => {
    const base = { status: 'draft', scope: 'project', initiative: 'تحول', sections: [{ complete: true, title: 'أ' }], readiness: 90 };
    expect(canSubmit(base).ok).toBe(true);
    expect(canSubmit({ ...base, status: 'submitted' }).ok).toBe(false);
    expect(canSubmit({ ...base, scope: null }).reason).toContain('نطاق');
    expect(canSubmit({ ...base, initiative: null }).reason).toContain('اسم المبادرة');
    expect(canSubmit({ ...base, sections: [{ complete: false, title: 'الحوكمة' }] }).reason).toContain('الحوكمة');
    expect(canSubmit({ ...base, readiness: 70 }).reason).toContain('80');
  });
});

describe('المعيار ونتيجة القائد', () => {
  const all = (n) => Object.fromEntries(RUBRIC.map((r) => [r.key, n]));
  it('ستة أبعاد، والإطار الأولوي مضاعف', () => {
    expect(RUBRIC).toHaveLength(6);
    expect(rubricScore(all(4))).toBe(100);
    expect(rubricScore(all(2))).toBe(50);
    expect(rubricScore({ ...all(4), strategy: 0 })).toBeNull();
    const s = { ...all(1), planning: 4, risk: 4 };
    expect(rubricScore(s, 'milestone')).toBeGreaterThan(rubricScore(s, 'leadership'));
  });
  it('يرفض بعدًا بلا درجة ويقص الملاحظات', () => {
    expect(() => cleanRubric({ ...all(3), value: 5 })).toThrow();
    const r = cleanRubric(all(3), { strategy: ' جيد ', planning: '' });
    expect(r.notes).toEqual({ strategy: 'جيد' });
  });
  it('مشروع التخرج إلزامي، وما غاب غيره يُعاد توزيع وزنه', () => {
    expect(leaderComposite({ quizzes: 100, lab: 100, capstone: 100, participation: 100 })).toMatchObject({ score: 100, complete: true });
    expect(leaderComposite({ quizzes: 80, capstone: null })).toMatchObject({ score: null, complete: false, pending: 'capstone' });
    expect(leaderComposite({ quizzes: 80, capstone: 80 })).toMatchObject({ score: 80, complete: false, parts: { quizzes: 80, capstone: 80 } });
    expect(leaderComposite({}).score).toBeNull();
  });

  it('الفحص الحاجب يمنع التسليم مهما بلغت الجاهزية', () => {
    const base = { status: 'draft', scope: 'project', initiative: 'م', sections: [{ complete: true, title: 'ب' }], readiness: 100 };
    expect(canSubmit({ ...base, checks: [{ key: 'sponsor', title: 'راعٍ', ok: false, blocking: true }] })).toMatchObject({ ok: false });
    expect(canSubmit({ ...base, checks: [{ key: 'dates', title: 'تواريخ', ok: false }] })).toMatchObject({ ok: true });
  });
});

describe('النموذج والوثيقة في الرحلة', () => {
  it('متطلب النموذج يكتمل بقاعدة قبوله، ويسقط عمّن لا يخصه', () => {
    expect(VERIFIED_KINDS).toEqual(expect.arrayContaining(['model', 'capstone']));
    const models = { wbs: { model_id: 'm1', status: 'submitted' } };
    expect(modelStatus({ model_key: 'wbs', accept: 'submitted' }, models).done).toBe(true);
    expect(modelStatus({ model_key: 'wbs', accept: 'reviewed' }, models).done).toBe(false);
    expect(modelStatus({ model_key: 'roadmap', accept: 'reviewed' }, models)).toMatchObject({ done: true, na: true });
    expect(cleanConfig('model', { model_key: 'wbs', accept: 'x' })).toEqual({ model_key: 'wbs', accept: 'reviewed' });
    expect(cleanConfig('capstone', { any: 1 })).toEqual({});
  });
  it('متطلب الوثيقة يكتمل باعتمادها', () => {
    expect(activityFor({ kind: 'capstone', config: {} }, { capstone: { status: 'approved', readiness: 90 } })).toMatchObject({ done: true });
    expect(activityFor({ kind: 'capstone', config: {} }, { capstone: { status: 'accepted' } }).done).toBe(false);
    expect(activityFor({ kind: 'model', config: { model_key: 'wbs' } }, { modelsLocked: true }).locked).toBe(true);
  });
});

describe('الوثيقة الاحترافية', () => {
  const doc = {
    meta: { ref: 'MI-CP-1', version: 1, status: 'submitted', status_title: 'قيد المراجعة', participant: { name: 'سارة<script>' }, org: { name: 'جهة' },
      track: { title: 'مسار' }, scope: 'project', scope_title: 'مشروع', initiative: 'تحول <b>رقمي</b>', start: '2026-01-01', end: '2026-12-31', readiness: 90 },
    summary: 'ملخص',
    sections: ['initiative-charter', 'wbs', 'schedule', 'raid'].map((k) => ({ key: k, title: k, icon: '◆', dimension: MODELS[k].dimension,
      fields: MODELS[k].fields.map((f) => ({ ...f, value: good()[k]?.[f.key] ?? null })) })),
    cost: costSummary(MODELS['cost-plan'], good()['cost-plan']),
    checks: capstoneChecks(ctx(good())), review: null, sponsor: null, rubric: RUBRIC,
  };
  it('يهرّب النصوص ويرسم الجدول والهيكل', () => {
    const { meta, body } = capstoneReport(doc);
    const html = documentHtml(meta, body);
    expect(html).not.toContain('<script>');
    expect(html).toContain('سارة&lt;script&gt;');
    expect(html).not.toContain('<b>رقمي</b>');
    expect(html).toContain('<svg');
    expect(html).toContain('W1');
  });
  it('الاعتماد يخفي فحوص الاتساق', () => {
    const { body } = capstoneReport({ ...doc, meta: { ...doc.meta, status: 'approved' } });
    expect(body).not.toContain('فحوص الاتساق');
  });
});
