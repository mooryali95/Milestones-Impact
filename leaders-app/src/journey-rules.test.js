import { describe, expect, it } from 'vitest';
import { buildJourney, cleanStageRules, journeyProgress, stageRuleSummary, stageRulesIssues } from '../../supabase/functions/leaders-api/logic.js';

// رحلة الأدمن المعتمدة: ورشة تعريفية ← تدريب ← (توجيه على رأس العمل | استشارة عند الطلب) ← توجيه قيادي ← دعم وتمكين ← تقييم
const stages = [
  { key: 'intro', sort: 1, title_ar: 'الورشة التعريفية' },
  { key: 'training', sort: 2, title_ar: 'التدريب' },
  { key: 'otj', sort: 3, title_ar: 'التوجيه على رأس العمل', rules: { mode: 'on_demand', unlock: 'stages', after: ['training'] } },
  { key: 'consult', sort: 4, title_ar: 'الاستشارة', rules: { mode: 'on_demand', unlock: 'always', complete: 'any' } },
  { key: 'coaching', sort: 5, title_ar: 'التوجيه القيادي' },
  { key: 'support', sort: 6, title_ar: 'الدعم والتمكين', rules: { complete: 'approval' } },
  { key: 'final', sort: 7, title_ar: 'التقييم الختامي' },
];
const reqs = stages.map((s, i) => ({ id: `r${i}`, stage_key: s.key, code: `C${i}`, kind: 'check', required: true, sort: 1 }));
const run = (done = [], extra = {}) => buildJourney({
  stages, requirements: reqs, levels: {}, state: {},
  progress: Object.fromEntries(done.map((k) => [`r${stages.findIndex((s) => s.key === k)}`, { status: 'done' }])), ...extra,
});
const st = (j) => Object.fromEntries(j.map((s) => [s.key, s.status]));

describe('محرك قواعد المراحل', () => {
  it('يبقي السلوك الأصلي حين لا قواعد: مرحلة حالية واحدة وما بعدها مقفل', () => {
    const plain = stages.map(({ rules: _r, ...s }) => s);
    const j = buildJourney({ stages: plain, requirements: reqs, progress: { r0: { status: 'done' } }, levels: {}, state: {} });
    expect(j.map((s) => s.status)).toEqual(['done', 'active', 'locked', 'locked', 'locked', 'locked', 'locked']);
  });

  it('مراحل عند الطلب لا توقف ما بعدها، والاستشارة متاحة من البداية', () => {
    const s = st(run(['intro']));
    expect(s).toMatchObject({ intro: 'done', training: 'active', otj: 'locked', consult: 'available', coaching: 'locked' });
    const s2 = st(run(['intro', 'training']));
    expect(s2).toMatchObject({ otj: 'available', consult: 'available', coaching: 'active' });
  });

  it('تكتمل باعتماد يدوي فقط حين يُطلب ذلك، وما بعدها ينتظره', () => {
    const j = run(['intro', 'training', 'coaching', 'support']);
    expect(st(j)).toMatchObject({ support: 'active', final: 'locked' });
    expect(j.find((s) => s.key === 'final').lock_reason).toContain('الدعم والتمكين');
    const ok = run(['intro', 'training', 'coaching'], { overrides: { support: 'complete' } });
    expect(st(ok)).toMatchObject({ support: 'done', final: 'active' });
  });

  it('تدخل الأدمن: فتح مرحلة مقفلة وإعفاء من أخرى', () => {
    expect(st(run([], { overrides: { coaching: 'open' } })).coaching).toBe('active');
    const j = run(['intro'], { overrides: { training: 'skip' } });
    expect(j.find((s) => s.key === 'training')).toMatchObject({ status: 'done', skipped: true });
    expect(st(j).coaching).toBe('active');
  });

  it('الفتح بالأيام من بداية الدفعة، ويرجع إلى ما قبلها إن غاب التاريخ', () => {
    const timed = [{ key: 'a', sort: 1, title_ar: 'أ', rules: { unlock: 'day', day: 10 } }];
    const r = [{ id: 'x', stage_key: 'a', code: 'X', kind: 'check', required: true, sort: 1 }];
    const at = (today, cohortStart) => buildJourney({ stages: timed, requirements: r, progress: {}, levels: {}, state: {}, cohortStart, today })[0];
    expect(at('2026-01-05', '2026-01-01')).toMatchObject({ status: 'locked', lock_reason: 'تُفتح في 2026-01-11' });
    expect(at('2026-01-11', '2026-01-01').status).toBe('active');
    expect(at('2026-01-05', null).status).toBe('active');
  });

  it('التقدم لا يُنقَص بمراحل عند الطلب لم يحتجها المشارك', () => {
    const j = run(['intro', 'training', 'coaching'], { overrides: { support: 'complete', final: 'complete' } });
    expect(journeyProgress(j)).toBe(100);
  });

  it('ينظف القواعد ويرفض المجهول والمرجع الذاتي', () => {
    expect(cleanStageRules({ mode: 'required', unlock: 'previous', complete: 'required' }, ['a'])).toEqual({});
    expect(cleanStageRules({ mode: 'on_demand', unlock: 'stages', after: ['a', 'a'] }, ['a', 'b'], 'b')).toEqual({ mode: 'on_demand', unlock: 'stages', after: ['a'] });
    expect(() => cleanStageRules({ mode: 'x' }, [])).toThrow();
    expect(() => cleanStageRules({ unlock: 'stages', after: ['b'] }, ['a', 'b'], 'b')).toThrow('نفسها');
    expect(() => cleanStageRules({ unlock: 'stages', after: [] }, ['a'])).toThrow();
    expect(() => cleanStageRules({ unlock: 'day', day: -1 }, [])).toThrow();
  });

  it('يكشف الحلقات والمراجع لمراحل مخفية', () => {
    const loop = [
      { key: 'a', sort: 1, title_ar: 'أ', rules: { unlock: 'stages', after: ['b'] } },
      { key: 'b', sort: 2, title_ar: 'ب', rules: { unlock: 'stages', after: ['a'] } },
    ];
    expect(stageRulesIssues(loop).some((x) => x.level === 'error' && x.msg.includes('حلقة'))).toBe(true);
    const hidden = [{ key: 'a', sort: 1, title_ar: 'أ', active: false }, { key: 'b', sort: 2, title_ar: 'ب', rules: { unlock: 'stages', after: ['a'] } }];
    expect(stageRulesIssues(hidden)[0].msg).toContain('مخفية');
    expect(stageRulesIssues(stages).filter((x) => x.level === 'error')).toEqual([]);
  });

  it('يلخص القاعدة بجملة للأدمن', () => {
    expect(stageRuleSummary(stages[2], stages)).toBe('عند الطلب · تُفتح بعد اكتمال: التدريب · تكتمل بمتطلباتها الإلزامية');
    expect(stageRuleSummary(stages[0], stages)).toBe('إلزامية · تُفتح بعد اكتمال الإلزامية قبلها · تكتمل بمتطلباتها الإلزامية');
  });
});
