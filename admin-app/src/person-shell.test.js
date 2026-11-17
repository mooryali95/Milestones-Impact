// هيكل ملف المشارك (P2): التبويب الافتتاحي، وأرقام ما ينتظر في كل تبويب، والإجراء الأهم، واللمحة
import { describe, expect, it } from 'vitest';
import { glance, primaryAction, startTab, tabBadges, TABS } from './screens/PersonShell.jsx';

const file = (o = {}) => ({ participant: { status: 'enrolled', created_at: '2026-10-01', ...o.p }, journey: [], models: [], observations: [], sessions: [], book: [], ...o });

describe('التبويب الافتتاحي', () => {
  it('من لم يُعتمد بعد يفتح على القرار ولو اختار المدير تبويبًا آخر قبله', () => {
    for (const status of ['registered', 'profiled', 'assessing', 'pending_approval']) expect(startTab({ status }, 'log'), status).toBe('decision');
  });
  it('المعتمد يفتح على آخر تبويب في الجلسة، وإلا الرحلة، ولا يقبل تبويبًا مجهولًا', () => {
    expect(startTab({ status: 'enrolled' }, 'learning')).toBe('learning');
    expect(startTab({ status: 'enrolled' }, null)).toBe('journey');
    expect(startTab({ status: 'placed' }, 'xyz')).toBe('journey');
    expect(startTab({ status: 'withdrawn' }, 'log')).toBe('log');
  });
  it('ستة تبويبات بالترتيب المعتمد', () => {
    expect(TABS.map(([, l]) => l)).toEqual(['القرار', 'الرحلة', 'التعلم', 'المبادرة والجلسات', 'الملف', 'السجل']);
  });
});

describe('ما ينتظر المراجع والإجراء الأهم', () => {
  const journey = [{ items: [{ status: 'submitted' }, { status: 'done' }] }, { items: [{ status: 'submitted' }] }];
  it('الأرقام على التبويبات من بيانات الملف نفسها', () => {
    expect(tabBadges(file({ p: { status: 'pending_approval' } })).decision).toBe('!');
    const b = tabBadges(file({ journey, models: [{ status: 'submitted' }, { status: 'draft' }], observations: [{}, {}] }));
    expect(b).toEqual({ decision: null, journey: 2, learning: 1, log: 2 });
  });
  it('إجراء واحد بالأولوية: الاعتماد، ثم المسلَّم، ثم النماذج، ثم الملاحظة. ولا شيء لمن لا يكتب', () => {
    expect(primaryAction(file({ p: { status: 'pending_approval' }, journey }), true)).toMatchObject({ tab: 'decision', label: 'راجع واعتمد' });
    expect(primaryAction(file({ journey }), true)).toMatchObject({ tab: 'journey', label: 'راجع المسلَّم (2)' });
    expect(primaryAction(file({ models: [{ status: 'submitted' }] }), true)).toMatchObject({ tab: 'learning' });
    expect(primaryAction(file(), true)).toMatchObject({ tab: 'log', label: 'أضف ملاحظة' });
    expect(primaryAction(file({ p: { status: 'pending_approval' } }), false)).toBeNull();
  });
});

describe('اللمحة', () => {
  it('التقدم والمرحلة الحالية والجلسات', () => {
    const g = Object.fromEntries(glance(file({ progress: 40, journey: [{ status: 'done', title_ar: 'التهيئة' }, { status: 'active', title_ar: 'التدريب' }],
      sessions: [{ status: 'attended' }, { status: 'no_show' }] })).map(([k, v, s]) => [k, [v, s]]));
    expect(g['التقدم']).toEqual(['40%', '1 من 2 مراحل']);
    expect(g['المرحلة الحالية'][0]).toBe('التدريب');
    expect(g['الجلسات']).toEqual(['1 حضرها', 'من 2']);
    expect(g['آخر دخول'][0]).toBe('لم يدخل');
  });
  it('مرحلتان تسيران معًا نشطتان تُسميان معًا (currentStages، R3b)', () => {
    const g = Object.fromEntries(glance(file({ journey: [
      { key: 'p', sort: 1, status: 'done', title_ar: 'التهيئة' },
      { key: 'a', sort: 2, status: 'active', title_ar: 'التدريب' },
      { key: 'b', sort: 3, status: 'active', title_ar: 'التوجيه', rules: { unlock: 'with', with: 'a' } },
    ] })).map(([k, v]) => [k, v]));
    expect(g['المرحلة الحالية']).toBe('التدريب والتوجيه');
  });
  it('من أتم الرحلة كلها', () => {
    const g = Object.fromEntries(glance(file({ journey: [{ status: 'done' }] })).map(([k, v]) => [k, v]));
    expect(g['المرحلة الحالية']).toBe('أتم الرحلة');
  });
});
