import { describe, expect, it } from 'vitest';
import { cohortHub, cohortKind, intake, wizardBlock, wizardBody, wizardNotes } from './cohort-hub.js';

const org = { id: 'o1', name: 'سفراء', status: 'active', invite_code: 'sufara' };
const prog = { id: 'p1', name: 'إدارة المشروعات', requirements: 40, versions: [{ id: 'v2', number: 2 }, { id: 'v1', number: 1 }] };
const base = { id: 'c1', name: 'دفعة سفراء', organization_id: 'o1', program_id: 'p1', program_version_id: 'v2', status: 'open', starts_on: '2026-11-10', ends_on: '2027-02-10', schedule: { s1: {} }, advisor_expert_id: 'e1', advisor_name: 'د. سلمان', team_expert_ids: ['e2'], members: 29, upcoming_sessions: 2, pending_approval: 0 };
const hub = (c, extra = {}) => cohortHub({ cohort: c, cohorts: extra.cohorts || [c], orgs: [org], programs: [prog] });
const item = (h, k) => h.items.find((x) => x.key === k);

describe('ملف الدفعة', () => {
  it('ثلاثة أنواع: جهة، ومفتوحة، وأفراد', () => {
    expect(cohortKind({ organization_id: 'o1' })).toBe('org');
    expect(cohortKind({ is_default: true })).toBe('open');
    expect(cohortKind({})).toBe('individuals');
  });

  it('دفعة جهة مكتملة: كل البنود سليمة، والرابط رابط الجهة، والالتحاق تلقائي', () => {
    const h = hub(base);
    expect(h.missing).toBe(0);
    expect(h.link).toBe('https://leaders.sunkvalue.com/j/sufara');
    expect(item(h, 'intake').detail).toContain('تلقائيًا');
    expect(h.items.map((x) => x.key)).toEqual(['intake', 'program', 'period', 'schedule', 'advisor', 'sessions', 'members', 'approval']);
  });

  it('دفعة «مخطط لها» لا تستقبل منضمي الجهة، والزر يفتح تحريرها', () => {
    const i = item(hub({ ...base, status: 'planned' }), 'intake');
    expect(i.ok).toBe(false);
    expect(i.action).toBe('edit');
  });

  it('دفعة أحدث للجهة نفسها تأخذ المنضمين الجدد: يُسمّيها البند ويفتحها', () => {
    const newer = { ...base, id: 'c2', name: 'دفعة سفراء 2', starts_on: '2027-03-01' };
    const i = item(hub(base, { cohorts: [base, newer] }), 'intake');
    expect(i.ok).toBe(false);
    expect(i.other).toBe('c2');
    expect(i.detail).toContain('دفعة سفراء 2');
    expect(i.detail).toContain('الملحقون يدويًا بهذه الدفعة باقون فيها، والبقية ينتقلون إلى الدفعة الأحدث');
  });

  it('جهة غير فعّالة: لا رابط، والبند يفتح الجهة', () => {
    const h = cohortHub({ cohort: base, cohorts: [base], orgs: [{ ...org, status: 'paused' }], programs: [prog] });
    expect(h.link).toBeNull();
    expect(item(h, 'intake').action).toBe('org');
  });

  it('دفعة أفراد بلا رابط، والالتحاق يدوي ولا يُعدّ نقصًا', () => {
    const h = hub({ ...base, organization_id: null });
    expect(h.link).toBeNull();
    expect(item(h, 'intake').ok).toBe(true);
    expect(item(h, 'intake').action).toBe('participants');
  });

  it('النسخة المثبتة القديمة تقترح الترقية، والبرنامج بلا متطلبات نقص يفتح الرحلة', () => {
    expect(item(hub({ ...base, program_version_id: 'v1' }), 'program').action).toBe('upgrade');
    const empty = cohortHub({ cohort: base, cohorts: [base], orgs: [org], programs: [{ ...prog, requirements: 0 }] });
    expect(item(empty, 'program')).toMatchObject({ ok: false, action: 'journey' });
  });

  it('الدفعة غير المثبتة على نسخة نقص يُصلح بالترقية، وبلا نسخة للبرنامج بالتحرير', () => {
    const un = item(hub({ ...base, program_version_id: null }), 'program');
    expect(un).toMatchObject({ ok: false, action: 'pin' });
    expect(un.detail).toContain('غير مثبتة على نسخة');
    expect(un.detail).toContain('النسخة 2');
    const none = cohortHub({ cohort: { ...base, program_version_id: null }, cohorts: [base], orgs: [org], programs: [{ ...prog, versions: [] }] });
    expect(item(none, 'program')).toMatchObject({ ok: false, action: 'edit' });
    expect(item(none, 'program').detail).toContain('تُحفظ نسخته الأولى');
    expect(item(hub(base), 'program').detail).toContain('مثبتة على النسخة 2');
  });

  it('ما ينقص يحمل زر ضبطه: المستشار والخطة والاعتماد', () => {
    // خطة المراحل (R2a): ناجحة بتاريخ البداية لا بعدد مفاتيح schedule، وبلا بداية تفتح «تحرير الدفعة» لتحديده
    const h = hub({ ...base, advisor_expert_id: null, schedule: {}, starts_on: null, pending_approval: 12 });
    expect(item(h, 'advisor').action).toBe('team');
    expect(item(h, 'schedule')).toMatchObject({ ok: false, action: 'edit', title: 'خطة المراحل' });
    expect(item(h, 'approval')).toMatchObject({ ok: false, action: 'approve' });
    expect(h.missing).toBe(4);
    const empty = item(hub({ ...base, schedule: {} }), 'schedule');
    expect(empty).toMatchObject({ ok: true, action: null, detail: 'تواريخ المراحل من بداية الدفعة ومدد البرنامج' });
    // ما وُزّع قبل R2a يبقى مثبتًا: البند ناجح ويفتح تبويب الرحلة لـ«حرّر التواريخ لتتبع المدد»
    const pinned = item(hub({ ...base, schedule: { s1: { start: '2026-11-10', end: '2026-11-20' }, s2: { days: 9 } } }), 'schedule');
    expect(pinned).toMatchObject({ ok: true, action: 'plan' });
    expect(pinned.detail).toBe('مرحلة واحدة بمدة خاصة بالدفعة، مرحلة واحدة مثبتة بتاريخ لا يتبع المدد');
    expect(item(hub({ ...base, is_default: true, organization_id: null, starts_on: null }), 'schedule').ok).toBe(true);
  });

  it('الجلسات لا تظهر حين لم تُقرأ (null)، فلا يُعرض نقص غير حقيقي', () => {
    expect(item(hub({ ...base, upcoming_sessions: null }), 'sessions')).toBeUndefined();
  });

  it('المغلقة لا تُعدّ ناقصة الالتحاق', () => {
    expect(intake({ cohort: { ...base, status: 'closed' }, cohorts: [], org }).ok).toBe(true);
  });
});

describe('معالج الدفعة الجديدة', () => {
  it('لكل خطوة شرط انتقال واحد', () => {
    expect(wizardBlock(0, { kind: 'org' })).toBe('اختر الجهة');
    expect(wizardBlock(0, { kind: 'individuals' })).toBe('');
    expect(wizardBlock(1, {})).toBe('اختر البرنامج');
    // البرنامج الفارغ يقف عند خطوته، لا عند «أنشئ الدفعة»
    expect(wizardBlock(1, { program_id: 'p0' }, [{ id: 'p0', name: 'فارغ', requirements: 0 }])).toContain('بلا متطلبات بعد، فلا تُنشأ عليه دفعة');
    expect(wizardBlock(1, { program_id: 'p1' }, [prog])).toBe('');
    expect(wizardBlock(2, { name: ' ' })).toBe('اكتب اسم الدفعة');
    expect(wizardBlock(2, { name: 'د', starts_on: '2027-02-01', ends_on: '2027-01-01' })).toBe('تاريخ النهاية قبل البداية');
    expect(wizardBlock(2, { name: 'د', starts_on: '2027-01-01', ends_on: '2027-02-01' })).toBe('');
  });
  it('ينبّه إلى دفعة الجهة القائمة، والحالة «مخطط لها»', () => {
    const notes = wizardNotes({ v: { kind: 'org', organization_id: 'o1', status: 'planned', program_id: 'p1' }, cohorts: [base], orgs: [org], programs: [prog] });
    expect(notes.join(' ')).toContain('دفعة سفراء');
    // بقاعدة pickCohort: الملحق يدويًا يبقى، ومن تبع الدفعة بجهته ينتقل إلى الأحدث (تصحيح بتنسيق الزميل)
    expect(notes.join(' ')).toContain('الملحقون يدويًا باقون، والبقية ينتقلون إلى الدفعة الأحدث');
    expect(notes.join(' ')).toContain('مخطط لها');
  });
  it('جسم الحفظ: دفعة الأفراد بلا جهة، والتثبيت على أحدث نسخة دائمًا (والخادم ينشئ النسخة 1 إن لم توجد)', () => {
    expect(wizardBody({ kind: 'individuals', organization_id: 'o1', name: ' أ ', program_id: 'p1' })).toMatchObject({ organization_id: null, name: 'أ', program_version_id: 'latest', status: 'open' });
    expect(wizardBody({ kind: 'org', organization_id: 'o1', name: 'ب', program_id: 'p1', pin: false }).program_version_id).toBe('latest');
  });
});

describe('مقاعد الدفعة تنبيه لا منع', () => {
  it('تجاوزها نقص في بند الأعضاء بزر، وبلا مقاعد لا تنبيه', () => {
    const over = cohortHub({ cohort: { ...base, capacity: 25 }, cohorts: [base], orgs: [org], programs: [prog] }).items.find((x) => x.key === 'members');
    expect(over).toMatchObject({ ok: false, action: 'participants' });
    expect(over.detail).toContain('29 عضوًا وسعة الدفعة التشغيلية 25');
    const fits = cohortHub({ cohort: { ...base, capacity: 40 }, cohorts: [base], orgs: [org], programs: [prog] }).items.find((x) => x.key === 'members');
    expect(fits).toMatchObject({ ok: true });
    expect(fits.detail).toContain('40 مقعدًا');
  });
});

describe('المقاعد من العقد في معالج دفعة الجهة (تقييم P3)', () => {
  it('دفعة الجهة لا تُرسل سعة من المعالج، ودفعة الأفراد ترسل ما كُتب', () => {
    expect(wizardBody({ kind: 'org', organization_id: 'o1', name: 'ب', program_id: 'p1', capacity: '50' })).not.toHaveProperty('capacity');
    expect(wizardBody({ kind: 'individuals', name: 'أ', program_id: 'p1', capacity: '20' }).capacity).toBe(20);
  });
  it('تجاوز سعة دفعة الجهة يقود إلى السعة التشغيلية ويسمي العقد في ملف الجهة', () => {
    const org = { id: 'o1', name: 'سفراء', status: 'active', invite_code: 'sufara-leaders' };
    const prog = { id: 'p1', name: 'القادة', requirements: 10, versions: [] };
    const c = { id: 'c1', name: 'د', organization_id: 'o1', program_id: 'p1', status: 'open', members: 30, capacity: 25 };
    const m = cohortHub({ cohort: c, cohorts: [c], orgs: [org], programs: [prog] }).items.find((x) => x.key === 'members');
    expect(m.detail).toMatch(/سعة الدفعة التشغيلية 25/);
    expect(m.detail).toMatch(/مقاعد العقد الملزمة في ملف الجهة/);
  });
});
