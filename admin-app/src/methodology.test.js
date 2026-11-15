import { describe, expect, it } from 'vitest';
import { evaluate, MODEL_DEFAULT, reorderIds, trackKey, trackLevels, lines } from './methodology.js';

describe('المنهجية', () => {
  it('رمز المسار يُقرأ ويُبنى بالاتجاهين', () => {
    expect(trackLevels('M2I1L3')).toEqual({ milestone: 'intermediate', impact: 'beginner', leadership: 'advanced' });
    expect(trackKey('advanced', 'beginner', 'intermediate')).toBe('M3I1L2');
  });

  it('المؤشر المركّب موزون، والجانب الأضعف يمنع المستوى الأعلى', () => {
    const r = evaluate({ knowledge: 75, skill: 25, behavior: 69 }, MODEL_DEFAULT);
    expect(r.composite).toBe(49.1);
    expect(r.level).toBe('beginner');
    expect(evaluate({ knowledge: 90, skill: 90, behavior: 90 }, MODEL_DEFAULT).level).toBe('advanced');
    // مؤشر عالٍ لكن مواقف تحت حد الاحترافي
    expect(evaluate({ knowledge: 100, skill: 50, behavior: 100 }, MODEL_DEFAULT).level).toBe('intermediate');
    // الممارسة الذاتية ليست بوابة: تُعلَّم ولا تمنع
    const lp = evaluate({ knowledge: 100, skill: 100, behavior: 50 }, MODEL_DEFAULT);
    expect(lp.level).toBe('advanced');
    expect(lp.low).toBe(100);
    expect(lp.low_practice).toBe(true);
    expect(evaluate({}, MODEL_DEFAULT)).toBeNull();
  });

  it('إعادة الترتيب داخل مجموعة العنصر فقط، ولا شيء على الطرف', () => {
    const rows = [
      { id: 'a', stage_key: 's1', sort: 1 }, { id: 'b', stage_key: 's1', sort: 2 },
      { id: 'x', stage_key: 's2', sort: 1 }, { id: 'c', stage_key: 's1', sort: 3 },
    ];
    expect(reorderIds(rows, 'stage_requirements', 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(reorderIds(rows, 'stage_requirements', 'c', 1)).toBeNull();
    expect(reorderIds([{ key: 'k1', sort: 1 }, { key: 'k2', sort: 2 }], 'journey_stages', 'k1', 1)).toEqual(['k2', 'k1']);
  });

  it('البنود تُنظَّف من الترقيم والشرطات', () => {
    expect(lines('1. أول\n- ثانٍ\n\n•  ثالث')).toEqual(['أول', 'ثانٍ', 'ثالث']);
  });
});

// admin-program-7 (مراجعة الجولة ب-1): نموذج تحرير الخلية كان يقول «الوصف للمشارك» والشاشة نفسها تقول إن الخلايا لا تصل المشارك
describe('خلايا المصفوفة في المنهجية: نص صادق', () => {
  it('حقل وصف الخلية لا يَعِد بظهوره للمشارك', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'methodology.js'), 'utf8');
    expect(src).not.toContain("'الوصف للمشارك'");
    expect(src).toContain('لا يظهر للمشارك');
  });
});

// P2: أسماء مقروءة في نموذج الدفعة. خيارات البنود المخفية وتسميات حقول التنفيذ بلا رموز خام ولا رمز داخلي،
// والعنوانان المتطابقان يتميزان بالمرحلة
describe('نموذج الدفعة: أسماء البنود كما يقرؤها المدير', async () => {
  const { cohortFields, hiddenHelp, reqLabel } = await import('./methodology.js');
  const reqs = [
    { code: 'O-SESS', title_ar: 'جلسات التوجيه ({sessions:O-SESS})', kind: 'coaching', active: true, stage_key: 's2', stage_title_ar: 'التطبيق', config: { sessions_required: 4, mode: 'online' } },
    { code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية ({days:T-ATTEND})', kind: 'workshop', active: true, stage_key: 's1', stage_title_ar: 'التأسيس', required: true, config: { sessions_required: 3 } },
    { code: 'R-A', title_ar: 'تأمل', kind: 'check', active: true, stage_key: 's1', stage_title_ar: 'التأسيس', required: false },
    { code: 'R-B', title_ar: 'تأمل', kind: 'check', active: true, stage_key: 's2', stage_title_ar: 'التطبيق', required: false },
    { code: 'E-MGR', title_ar: 'إفادة المدير', kind: 'check', active: true, stage_key: 's2', stage_title_ar: 'التطبيق', required: false },
  ];
  const fields = cohortFields({ reqs });
  const texts = fields.flatMap((f) => [f.label, ...Object.values(f.options || {})]).map(String);
  it('لا نمط {x:y} ولا رمز داخلي في المخرجات', () => {
    expect(texts.filter((t) => /\{[a-z_]+(:[A-Z0-9-]+)?\}/.test(t))).toEqual([]);
    expect(texts.filter((t) => /O-SESS|T-ATTEND|R-A|R-B/.test(t))).toEqual([]);
  });
  it('{sessions:O-SESS} يصير «أربع جلسات»، والمرحلة بين قوسين', () => {
    expect(reqLabel(reqs[0], reqs)).toBe('جلسات التوجيه (أربع جلسات) (التطبيق)');
    const hidden = fields.find((f) => f.name === 'hidden_requirements');
    expect(hidden.options['O-SESS']).toBe('جلسات التوجيه (أربع جلسات) (التطبيق)');
    expect(fields.find((f) => f.name === 'd:O-SESS:mode').label).toBe('جلسات التوجيه (أربع جلسات) (التطبيق): طريقة الجلسة');
  });
  it('عنوانان متطابقان يتميزان بالمرحلة', () => {
    const hidden = fields.find((f) => f.name === 'hidden_requirements');
    expect(hidden.options['R-A']).toBe('تأمل (التأسيس)');
    expect(hidden.options['R-B']).toBe('تأمل (التطبيق)');
  });
  it('الإخفاء الكاسر يُنبَّه إليه قبل الحفظ، ورمز تعتمد عليه ميزة يُحذَّر منه', () => {
    expect(hiddenHelp({ hidden_requirements: ['T-ATTEND'] }, reqs)).toContain('لن يُحفظ: إخفاء هذه البنود يترك مرحلة «التأسيس»');
    expect(hiddenHelp({ hidden_requirements: ['R-A'] }, reqs)).not.toContain('لن يُحفظ');
    expect(hiddenHelp({ hidden_requirements: ['E-MGR'] }, reqs)).toContain('تنبيه: «إفادة المدير (التطبيق)» يكتمل بتقدير المدير المباشر');
  });
  it('إخفاء كاسر محفوظ قبل فتح النموذج لا يُنبَّه إليه بمنع الحفظ، ولا يُرسل المحفوظ مع الدفعة', async () => {
    const { cohortToForm, formToCohort } = await import('./methodology.js');
    const v = cohortToForm({ hidden_requirements: ['T-ATTEND'] });
    expect(hiddenHelp(v, reqs)).not.toContain('لن يُحفظ');
    expect(formToCohort(v)).not.toHaveProperty('hidden_before');
    expect(formToCohort(v).hidden_requirements).toEqual(['T-ATTEND']);
  });
  it('المحفوظ يبقى في حال النموذج كما يبنيها Form من الحقول وحدها، ولا يُعرض ولا يُرسل', async () => {
    const { cohortToForm } = await import('./methodology.js');
    const values = cohortToForm({ hidden_requirements: ['T-ATTEND'] });
    // Form يبني حاله من أسماء الحقول فقط، ويرسل ويعرض ما show له true
    const state = Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? '']));
    expect(state.hidden_before).toEqual(['T-ATTEND']);
    expect(fields.find((f) => f.name === 'hidden_requirements').help(state)).not.toContain('لن يُحفظ');
    expect(fields.filter((f) => !f.show || f.show(state)).map((f) => f.name)).not.toContain('hidden_before');
  });
  it('الدفعة المثبتة على نسخة: لا حكم قاطع من آخر تعديل، بل إشارة إلى فحص النسخة عند الحفظ', () => {
    const pinned = hiddenHelp({ hidden_requirements: ['T-ATTEND'], program_version_id: 'v2' }, reqs);
    expect(pinned).not.toContain('لن يُحفظ');
    expect(pinned).toContain('يُفحص الإخفاء عند الحفظ على النسخة المثبتة. وحسب آخر تعديل على البرنامج: إخفاء هذه البنود يترك مرحلة «التأسيس»');
    expect(hiddenHelp({ hidden_requirements: ['R-A'], program_version_id: 'v2' }, reqs)).toContain('يُفحص الإخفاء عند الحفظ على النسخة المثبتة.');
    expect(hiddenHelp({ hidden_requirements: ['R-A'], program_version_id: 'v2' }, reqs)).not.toContain('حسب آخر تعديل');
  });
});

// P3: المقاعد من العقد مصدرًا واحدًا في العرض، والسعة التشغيلية مطوية لدفعة الجهة وظاهرة لغيرها
describe('نموذج الدفعة: مقاعد العقد والسعة التشغيلية', async () => {
  const { capacityWarning, cohortFields, cohortToForm, contractLine, formToCohort } = await import('./methodology.js');
  const org = { id: 'o1', name: 'جمعية سفراء', seats: 50, seats_used: 31, contract_ends: '2027-06-30', auto_cohort: { id: 'c1', name: 'سفراء 2026', via: 'organization' } };
  const open = { id: 'o2', name: 'منظومة', seats: null, seats_used: 4, auto_cohort: { id: 'c0', name: 'الدفعة المفتوحة', via: 'default' } };
  const fields = cohortFields({ orgs: [org, open] });
  const shown = (v) => fields.filter((f) => !f.show || f.show(v));
  it('سطر العقد: المقاعد والمستهلك من العقد كله ونهايته، والدفعة التي يدخلها الجدد', () => {
    expect(contractLine(org)).toBe('عقد الجهة: 50 مقعدًا، المستهلك 31 من العقد كله، ينتهي \u20662027-06-30\u2069. أعضاء الجهة الجدد يدخلون الآن تلقائيًا دفعة «سفراء 2026».');
    expect(contractLine(open)).toContain('عقد الجهة: بلا حد في العقد، المستهلك 4 من العقد كله.');
    expect(contractLine(open)).toContain('الدفعة المفتوحة العامة');
    expect(contractLine({ ...org, seats_used: null })).not.toContain('المستهلك');
    expect(fields.find((f) => f.name === 'organization_id').help({ organization_id: 'o1' })).toBe(contractLine(org));
    expect(fields.find((f) => f.name === 'organization_id').help({ organization_id: '' })).toBe('');
  });
  it('سطر العقد يقول حاله كما يفحصها pin_sponsor_seat: قبل البدء وبعد النهاية والجهة غير النشطة', () => {
    const today = '2026-11-15';
    const after = contractLine({ ...org, contract_ends: '2026-11-01' }, today);
    expect(after).toContain('انتهى العقد في \u20662026-11-01\u2069، فلا يُعفى أعضاء جدد.');
    expect(after).not.toContain('ينتهي');
    expect(contractLine({ ...org, contract_ends: '2026-11-15' }, today)).toContain('ينتهي \u20662026-11-15\u2069');
    const before = contractLine({ ...org, contract_starts: '2026-12-01' }, today);
    expect(before).toContain('العقد لم يبدأ بعد (يبدأ \u20662026-12-01\u2069)، فلا يُعفى أحد قبله.');
    expect(contractLine({ ...org, contract_starts: '2026-11-15' }, today)).not.toContain('لم يبدأ');
    expect(contractLine({ ...org, status: 'suspended' }, today)).toContain('الجهة غير نشطة، فلا يُعفى أحد.');
    expect(contractLine({ ...org, status: 'active' }, today)).toBe(contractLine(org, today));
    expect(contractLine(org, today)).not.toMatch(/انتهى|لم يبدأ|غير نشطة/);
  });
  it('عقد 50 وسعة 60 يحذّر، وبلا حد في العقد لا تحذير', () => {
    expect(capacityWarning(org, 60)).toContain('تتجاوز مقاعد عقد الجهة (50)');
    expect(capacityWarning(org, 40)).toBe('');
    expect(capacityWarning(open, 600)).toBe('');
    const cap = shown({ organization_id: 'o1', capacity_on: true }).find((f) => f.name === 'capacity');
    expect(cap.label).toBe('سعة تشغيلية (اختياري)');
    expect(cap.help({ organization_id: 'o1', capacity: '60' })).toContain('تتجاوز');
  });
  it('دفعة الجهة: السعة مطوية خلف اختيار، وإلغاؤه يمحوها. دفعة الأفراد: الحقل العادي ظاهر', () => {
    expect(shown({ organization_id: 'o1', capacity_on: false }).map((f) => f.name)).not.toContain('capacity');
    expect(shown({ organization_id: 'o1', capacity_on: false }).map((f) => f.name)).toContain('capacity_on');
    const indiv = shown({ organization_id: '' }).filter((f) => f.name.startsWith('capacity'));
    expect(indiv.map((f) => [f.name, f.label])).toEqual([['capacity', 'المقاعد']]);
    expect(cohortToForm({ capacity: 20 }).capacity_on).toBe(true);
    expect(cohortToForm({ capacity: null }).capacity_on).toBe(false);
    expect(formToCohort({ organization_id: 'o1', capacity_on: false })).toMatchObject({ capacity: null });
    expect(formToCohort({ organization_id: 'o1', capacity_on: true, capacity: 20 })).toEqual({ organization_id: 'o1', capacity: 20, delivery: {} });
    expect(formToCohort({ organization_id: null, capacity: 20 })).toEqual({ organization_id: null, capacity: 20, delivery: {} });
  });
});
