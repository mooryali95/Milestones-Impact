// تقييم المدير قبل وبعد خارج مفتاح 360 (تصور المرحلة 3 §5.1، البند 3.3)
import { describe, expect, it } from 'vitest';
import {
  MANAGER_ITEMS, MANAGER_PRE_SINCE, managerItems, managerPreAllowed, managerView, orgRaterView, NO_MANAGER, SELF_ONLY_AR,
} from '../../supabase/functions/leaders-api/manager-rating.js';
import { featureGate, featureHiddenCodes } from '../../supabase/functions/leaders-api/features.js';
import { AUTO_CHECKS } from '../../supabase/functions/leaders-api/logic.js';

const q = (id, dimension, sort) => ({ id, dimension, sort, text_rater_ar: 'عبارة' });

describe('تقييم المدير', () => {
  it('ثماني فقرات سلوك موزعة على الأطر بترتيبها، وما بلا صيغة المقيّم لا يدخل', () => {
    expect(MANAGER_ITEMS).toBe(8);
    const qs = [];
    for (const d of ['milestone', 'impact', 'leadership']) for (let i = 1; i <= 5; i++) qs.push(q(`${d}${i}`, d, i));
    qs.push({ id: 'x', dimension: 'impact', sort: 0, text_rater_ar: null });
    const out = managerItems(qs);
    expect(out).toHaveLength(8);
    expect(out.map((x) => x.id)).toEqual(['milestone1', 'impact1', 'leadership1', 'milestone2', 'impact2', 'leadership2', 'milestone3', 'impact3']);
    expect(managerItems(qs.slice(0, 3))).toHaveLength(3);
  });

  it('القبلي للدفعات الجديدة وحدها: الجارية قبل الإطلاق لا تراه، والدفعة بلا موعد أو العامة تراه', () => {
    expect(MANAGER_PRE_SINCE).toBe('2026-11-26');
    expect(managerPreAllowed({ starts_on: '2026-09-01', is_default: false })).toBe(false);
    expect(managerPreAllowed({ starts_on: '2026-12-01', is_default: false })).toBe(true);
    expect(managerPreAllowed({ starts_on: null, is_default: false })).toBe(true);
    expect(managerPreAllowed({ starts_on: '2026-09-01', is_default: true })).toBe(true);
    expect(managerPreAllowed(null)).toBe(true);
  });

  it('المفتاح مطفأ: بنود المدير ظاهرة وE-360 وحده مخفي، والقبلي يُخفى للدفعة الجارية', () => {
    expect(featureHiddenCodes({ f360: false })).toEqual(['E-360']);
    expect(featureHiddenCodes({ f360: false }, { preAllowed: false })).toEqual(['E-360', 'T-360']);
    expect(featureHiddenCodes({ f360: true }, { preAllowed: false })).toEqual([]);
  });

  it('المفتاح مطفأ: أفعال المدير تمر وأفعال 360 مرفوضة', () => {
    for (const a of ['rater.invite', 'rater.revoke', 'xp.rater-confirm']) expect(featureGate(a, { f360: false })).toBeNull();
    for (const a of ['f360.start', 'f360.nominate', 'f360.submit', 'xp.f360-decide']) expect(featureGate(a, { f360: false })?.fail?.code).toBe('f360_off');
  });

  it('بلا مدير: زميل أعلى أو «ذاتي فقط»، و«ذاتي فقط» يكمل T-360 فلا حبس', () => {
    expect(NO_MANAGER).toEqual(['senior', 'self']);
    expect(SELF_ONLY_AR).toBe('ذاتي فقط');
    expect(AUTO_CHECKS['T-360']({ preRated: false, selfOnly: true })).toBe(true);
    expect(AUTO_CHECKS['T-360']({ preRated: false })).toBe(false);
  });

  it('المشارك يرى المتوسط لكل بُعد لا الإجابات', () => {
    const v = managerView([{ dimension: 'impact', rater: { now: 70, before: 55, n: 1 } }, { dimension: 'milestone', rater: null }]);
    expect(v).toEqual({ impact: { now: 70, before: 55 } });
    expect(JSON.stringify(v)).not.toMatch(/answers|email|q1/);
    expect(managerView(null)).toBeNull();
    expect(managerView([{ dimension: 'impact', rater: null }])).toBeNull();
  });

  it('الجهة لا ترى أقل من خمسة: مؤشر المدير المجمع يُحجب دون الحد، ولا يخرج تقدير مدير بعينه في الصفوف', () => {
    const cohort = { impact: { n: 9, rater: { n: 4, pre: 50, post: 60 } }, milestone: { n: 9, rater: { n: 6, pre: 50, post: 62 } } };
    const people = [{ full_name: 'أ', dimensions: [{ dimension: 'impact', rater: { now: 70, before: 50 }, composite_pre: 40 }] }];
    const out = orgRaterView(cohort, people, 5);
    expect(out.cohort.impact.rater).toBeNull();
    expect(out.cohort.milestone.rater).toEqual({ n: 6, pre: 50, post: 62 });
    expect(out.participants[0].dimensions[0]).toEqual({ dimension: 'impact', composite_pre: 40 });
  });
});
