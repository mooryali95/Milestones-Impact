// تدقيق اللوحة 2026-11-23 (المرحلة 1، البند 6): قيمة فارغة لا تُطبع «undefined أيام» في لمحة الرحلة ولا في عدّ الأيام
import { describe, expect, it } from 'vitest';
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { daysAr, sessionsAr } from '../../supabase/functions/leaders-api/journey.js';

describe('حماية العرض من القيم الفارغة', () => {
  it('daysAr وsessionsAr: المجهول «—»، والصفر رقم لا «undefined»', () => {
    expect(daysAr(undefined)).toBe('—');
    expect(daysAr(NaN)).toBe('—');
    expect(daysAr(0)).toBe('0 أيام');
    expect(sessionsAr(null)).toBe('—');
    expect(daysAr(3)).toBe('ثلاثة أيام');
    expect(daysAr(14)).toBe('14 يومًا');
  });

  it('رحلة بلا مدد: بطاقة «المدة» تقول «—»، ولا «undefined» في أي بطاقة', () => {
    const stages = [
      { key: 'onboard', title_ar: 'التهيئة', phase: 'admission', sort: 1 },
      { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2 },
    ];
    const t = journeyTimeline({ stages, requirements: [] }, { title: 'رحلة البرنامج' });
    const json = JSON.stringify(t);
    expect(json).not.toContain('undefined');
    expect(json).not.toContain('NaN');
    const card = (t.cards || []).find((c) => c.key === 'duration');
    expect(card?.value).toBe('—');
  });
});

// المرحلة 4: مساعد العرض المشترك في اللوحة
import { dash, joinOr } from './display.js';
describe('dash وjoinOr', () => {
  it('المجهول «—» والصفر والنص كما هما', () => {
    for (const v of [undefined, null, NaN, Infinity, '', 'undefined', 'null', 'NaN']) expect(dash(v)).toBe('—');
    expect(dash(0)).toBe(0);
    expect(dash('نص')).toBe('نص');
    expect(dash(undefined, 0)).toBe(0);
  });
  it('joinOr: جزء غائب يُسقط القالب كله', () => {
    expect(joinOr([3, '←', 5])).toBe('3 ← 5');
    expect(joinOr([undefined, '←', 5])).toBe('—');
  });
});
