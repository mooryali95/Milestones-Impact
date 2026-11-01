import { describe, expect, it } from 'vitest';
import { approvalState, cleanAdjust, cleanFinalConfig, computeFinal, decisionFor, finalComponents, FINAL_DEFAULTS } from '../../supabase/functions/leaders-api/logic.js';

const src = {
  continuous: { index: 80, components: [{ label: 'اختبارات الكتيب', value: 80 }, { label: 'الخبراء', value: 60 }], trend: { dir: 'up' } },
  milestones: { total: 4, done: 3, late: 1, max_late: 5 },
  capstone: { score: 72.4 },
  post: { pct: 66 },
};

describe('التقييم الختامي', () => {
  it('يحسب كل مكوّن من مصدره ويشرحه', () => {
    const c = finalComponents(src);
    const by = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(by.milestones.value).toBe(63);
    expect(by.milestones.reason).toContain('متأخر في 1');
    expect(by.continuous.reason).toContain('أضعفها الخبراء');
    expect(by.project.value).toBe(72);
  });

  it('يجمع بالأوزان ويقترح القرار', () => {
    const r = computeFinal(finalComponents(src), {});
    // (80*30 + 63*20 + 72*30 + 66*20) / 100 = 71.4
    expect(r.auto_score).toBe(71);
    expect(r.coverage).toBe(100);
    expect(r.suggested).toBe('pass');
  });

  it('المكوّن الغائب لا يُحسب صفرًا، ويُمنع الاقتراح دون حد التغطية', () => {
    const r = computeFinal(finalComponents({ continuous: src.continuous }), {});
    expect(r.auto_score).toBe(80);
    expect(r.coverage).toBe(30);
    expect(r.suggested).toBeNull();
    expect(r.missing.length).toBe(3);
  });

  it('تعديل الخبير يحتاج تعليلًا، ومخالفة المقترح تُعلَن', () => {
    const comps = finalComponents(src);
    expect(() => cleanAdjust({ components: { project: { value: 90, reason: '' } } }, comps)).toThrow();
    const adj = cleanAdjust({ components: { project: { value: 40, reason: 'المشروع لم يُطبَّق فعليًا في الجهة' } }, decision: { value: 'pass', reason: 'رأي اللجنة بعد العرض الحي للمبادرة' } }, comps);
    const r = computeFinal(comps, {}, adj);
    expect(r.components.find((x) => x.key === 'project')).toMatchObject({ auto: 72, value: 40, adjusted: true });
    expect(r.suggested).toBe('pass_notes');
    expect(r.decision).toBe('pass');
    expect(r.departs).toBe(true);
  });

  it('الحدود والإعداد', () => {
    expect(decisionFor(45, FINAL_DEFAULTS.thresholds)).toBe('extend');
    expect(decisionFor(44, FINAL_DEFAULTS.thresholds)).toBe('fail');
    expect(() => cleanFinalConfig({ thresholds: { pass: 50, pass_notes: 60, extend: 40 } })).toThrow();
    expect(() => cleanFinalConfig({ weights: { continuous: 0, milestones: 0, project: 0, post: 0 } })).toThrow();
  });

  it('الاعتماد: خبير، أو لجنة بالأغلبية، أو بالإجماع', () => {
    const v = (...xs) => xs.map((x, i) => ({ by: `a${i}`, vote: x }));
    expect(approvalState(v('approve'), {}).done).toBe(true);
    expect(approvalState(v('approve'), { approval: 'committee_majority', committee_size: 3 }).done).toBe(false);
    expect(approvalState(v('approve', 'approve'), { approval: 'committee_majority', committee_size: 3 }).done).toBe(true);
    expect(approvalState(v('approve', 'approve', 'return'), { approval: 'committee_unanimous', committee_size: 3 })).toMatchObject({ done: false, returned: true });
  });
});
