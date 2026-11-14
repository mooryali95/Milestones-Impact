import { describe, expect, it } from 'vitest';
import { cohortHub, cohortKind, intake, wizardBlock, wizardBody, wizardNotes } from './cohort-hub.js';

const org = { id: 'o1', name: 'سفراء', status: 'active', invite_code: 'sufara' };
const prog = { id: 'p1', name: 'إدارة المشروعات', requirements: 40, versions: [{ id: 'v2', number: 2 }, { id: 'v1', number: 1 }] };
const base = { id: 'c1', name: 'دفعة سفراء', organization_id: 'o1', program_id: 'p1', status: 'open', starts_on: '2026-11-10', ends_on: '2027-02-10', schedule: { s1: {} }, advisor_expert_id: 'e1', advisor_name: 'د. سلمان', team_expert_ids: ['e2'], members: 29, upcoming_sessions: 2, pending_approval: 0 };
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

  it('ما ينقص يحمل زر ضبطه: المستشار والجدول والاعتماد', () => {
    const h = hub({ ...base, advisor_expert_id: null, schedule: {}, pending_approval: 12 });
    expect(item(h, 'advisor').action).toBe('team');
    expect(item(h, 'schedule').action).toBe('schedule');
    expect(item(h, 'approval')).toMatchObject({ ok: false, action: 'approve' });
    expect(h.missing).toBe(3);
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
    expect(wizardBlock(2, { name: ' ' })).toBe('اكتب اسم الدفعة');
    expect(wizardBlock(2, { name: 'د', starts_on: '2027-02-01', ends_on: '2027-01-01' })).toBe('تاريخ النهاية قبل البداية');
    expect(wizardBlock(2, { name: 'د', starts_on: '2027-01-01', ends_on: '2027-02-01' })).toBe('');
  });
  it('ينبّه إلى دفعة الجهة القائمة، والحالة «مخطط لها»', () => {
    const notes = wizardNotes({ v: { kind: 'org', organization_id: 'o1', status: 'planned', program_id: 'p1' }, cohorts: [base], orgs: [org], programs: [prog] });
    expect(notes.join(' ')).toContain('دفعة سفراء');
    expect(notes.join(' ')).toContain('مخطط لها');
  });
  it('جسم الحفظ: دفعة الأفراد بلا جهة، والتثبيت على أحدث نسخة', () => {
    expect(wizardBody({ kind: 'individuals', organization_id: 'o1', name: ' أ ', program_id: 'p1', pin: true })).toMatchObject({ organization_id: null, name: 'أ', program_version_id: 'latest', status: 'open' });
    expect(wizardBody({ kind: 'org', organization_id: 'o1', name: 'ب', program_id: 'p1' }).program_version_id).toBe('');
    // برنامج بلا نسخة محفوظة (كل برنامج جديد): لا يُرسل 'latest' فيرفضه الخادم، بل يتبع آخر تعديل
    expect(wizardBody({ kind: 'org', organization_id: 'o1', name: 'ب', program_id: 'p1', pin: true }, { canPin: false }).program_version_id).toBe('');
  });
});
