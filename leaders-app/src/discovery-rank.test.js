// قرار المالك 2026-11-23: «الأنسب» لفكرة واحدة تتفوق وتبلغ حد القبول (3 من 4)، والتعادل والدرجة الدنيا يُقالان كما هما،
// وسؤال المستفيدين يصلح للمشكلة والفرصة معًا. وزمن القياس يُحسب ولا يُكتب يدويًا
import { describe, expect, it } from 'vitest';
import { charterFromDiscovery, discoveryQuestions, discoveryRank, DISCOVERY_CRITERIA } from './guide.js';
import { estimateMinutes, measuredMinutes, MEASURED_MIN_N } from '../../supabase/functions/leaders-api/assessment-time.js';

const all = (n) => Object.fromEntries(DISCOVERY_CRITERIA.slice(0, n).map(([k]) => [k, true]));
const f = (n) => Array.from({ length: n }, (_, i) => ({ t: `f${i}`, i }));

describe('مفاضلة الأفكار', () => {
  it('التعادل لا يُعطى «الأنسب» للأولى', () => expect(discoveryRank(f(3), [all(1), all(1), all(1)])).toEqual({ best: null, state: 'below' }));
  it('تعادل فوق الحد يُقال تعادلًا', () => expect(discoveryRank(f(3), [all(3), all(3), all(1)])).toEqual({ best: null, state: 'tie' }));
  it('فكرة واحدة تتفوق وتبلغ الحد هي الأنسب، أينما كان ترتيبها', () => expect(discoveryRank(f(3), [all(2), all(1), all(4)])).toEqual({ best: 2, state: 'best' }));
  it('تتفوق لكن دون الحد: لا وسم', () => expect(discoveryRank(f(2), [all(2), all(1)]).best).toBe(null));
  it('فكرة واحدة: لا مفاضلة', () => expect(discoveryRank(f(1), [all(4)])).toEqual({ best: null, state: null }));
});

describe('سؤال المستفيدين', () => {
  it('لا يفترض ضررًا، ويُنسخ إلى البطاقة بالصيغة نفسها', () => {
    for (const lv of ['beginner', 'intermediate']) expect(discoveryQuestions(lv).map((q) => q.label).join(' ')).not.toMatch(/يتضرر/);
    const c = charterFromDiscovery('beginner', { idea: 'مركز تدريب', answers: { who: '300 أسرة' } });
    expect(c.problem).toContain('المستفيدون أو المتأثرون: 300 أسرة');
    expect(c.problem).not.toMatch(/يتضرر/);
  });
});

describe('زمن القياس المحسوب', () => {
  it('يكبر بعدد الأسئلة وطولها، ولا يقل عن دقيقة', () => {
    const q = { text_ar: 'كلمة '.repeat(30), kind: 'choice', options: [{ label: 'أ ب ج' }, { label: 'د هـ و' }] };
    expect(estimateMinutes([])).toBe(null);
    expect(estimateMinutes([{ text_ar: 'قصير', kind: 'likert' }])).toBe(1);
    expect(estimateMinutes(Array(40).fill(q))).toBeGreaterThan(estimateMinutes(Array(10).fill(q)));
  });
  it('الوسيط الفعلي بعد عدد كافٍ، ويستبعد الجلسات المتروكة', () => {
    const row = (m) => ({ started_at: '2026-11-01T10:00:00Z', submitted_at: new Date(Date.parse('2026-11-01T10:00:00Z') + m * 6e4).toISOString() });
    expect(measuredMinutes(Array(MEASURED_MIN_N - 1).fill(row(20)))).toBe(null);
    expect(measuredMinutes([...Array(MEASURED_MIN_N).fill(row(20)), row(600), row(600)])).toBe(20);
  });
});
