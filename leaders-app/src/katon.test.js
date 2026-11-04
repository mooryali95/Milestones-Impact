import { describe, expect, it } from 'vitest';
import {
  absoluteCue, cbmCheck, cleanAnswer, cleanSentence, katonPoints, katonScore, katonSummary, KATON_CONFIDENCE, normalizeAnswer, sentenceDistribution, topicIssues,
} from '../../supabase/functions/leaders-api/logic.js';
import topics from '../../supabase/content/katon/v1/topics.json';

describe('نموذج «كاتون» على CBM الثلاثي', () => {
  it('الصواب 1/2/3 والخطأ 0/−2/−6 بدرجة الثقة؛ جملة الرأي لا تُسجَّل؛ بلا حكم صفر', () => {
    expect(katonScore({ verdict: 'true', confidence: 1 }, 'true')).toBe(1);
    expect(katonScore({ verdict: 'true', confidence: 2 }, 'true')).toBe(2);
    expect(katonScore({ verdict: 'true', confidence: 3 }, 'true')).toBe(3);
    expect(katonScore({ verdict: 'false', confidence: 1 }, 'true')).toBe(0);
    expect(katonScore({ verdict: 'false', confidence: 2 }, 'true')).toBe(-2);
    expect(katonScore({ verdict: 'false', confidence: 3 }, 'true')).toBe(-6);
    expect(katonScore({ verdict: 'true', confidence: 3 }, 'opinion')).toBeNull();
    expect(katonScore({ stances: ['research'] }, 'true')).toBe(0);
    // الصف القديم: «صحيحة 100%» حكم بأعلى ثقة
    expect(katonScore({ choice: 'true' }, 'false')).toBe(-6);
    expect(normalizeAnswer({ choice: 'assume' })).toEqual({ verdict: null, confidence: null, stances: ['assume'] });
  });

  it('قاعدة تسجيل سليمة: الإفصاح الصادق هو الأمثل، وتقاطعا الجدول الافتراضي عند 67% و80%', () => {
    const d = cbmCheck(null);
    expect(d.ok).toBe(true);
    expect(d.thresholds).toEqual({ c1_c2: 0.667, c2_c3: 0.8 });
    // القيمة المتوقعة لثقة q: الدرجة الأعلى لا تربح إلا فوق تقاطعها
    const ev = (c, q) => q * d.table.right[c] + (1 - q) * d.table.wrong[c];
    expect(ev(1, 0.6)).toBeGreaterThan(ev(2, 0.6));
    expect(ev(2, 0.75)).toBeGreaterThan(Math.max(ev(1, 0.75), ev(3, 0.75)));
    expect(ev(3, 0.9)).toBeGreaterThan(ev(2, 0.9));
    // الجدول القديم بروحه (مكافأة ثابتة للامتناع وعقوبة متناظرة) يُرفض
    expect(cbmCheck({ right: { 1: 5, 2: 5, 3: 6 }, wrong: { 1: 5, 2: 5, 3: -6 } }).ok).toBe(false);
    expect(cbmCheck({ right: { 1: 1, 2: 2, 3: 3 }, wrong: { 1: 0, 2: -1, 3: -1 } }).issues.length).toBeGreaterThan(0);
    expect(katonPoints({ right: { 3: 4 }, wrong: { 3: -9 } })).toEqual({ right: { 1: 1, 2: 2, 3: 4 }, wrong: { 1: 0, 2: -2, 3: -9 } });
    expect(katonPoints({ true: 8, assume: 5 })).toEqual({ right: { 1: 1, 2: 2, 3: 3 }, wrong: { 1: 0, 2: -2, 3: -6 } });   // الشكل القديم يُهمل
  });

  it('الإجابة: حكم بثقة، أو موقف واحد على الأقل، أو كلاهما', () => {
    expect(() => cleanAnswer({ verdict: 'true' })).toThrow(/درجة ثقتك/);
    expect(() => cleanAnswer({})).toThrow(/احكم/);
    expect(cleanAnswer({ verdict: 'false', confidence: '2', stances: ['idea', 'ghost', 'idea'], note: ' فكرة ' })).toEqual({ verdict: 'false', confidence: 2, stances: ['idea'], note: 'فكرة' });
    expect(cleanAnswer({ stances: ['research'] })).toMatchObject({ verdict: null, confidence: null, stances: ['research'] });
  });

  it('المعايرة على كل الأحكام: الدقة وBrier وفرط الثقة والامتناع والمنحنى، والمواقف وصفية', () => {
    const ss = [{ id: 'a', key: 'true' }, { id: 'b', key: 'false' }, { id: 'c', key: 'true' }, { id: 'd', key: 'opinion' }, { id: 'e', key: 'true' }];
    const ans = [
      { sentence_id: 'a', verdict: 'true', confidence: 3 },                       // صواب متيقن: +3، p=.9
      { sentence_id: 'b', verdict: 'true', confidence: 3, stances: ['idea'] },    // خطأ متيقن: −6
      { sentence_id: 'c', verdict: 'true', confidence: 1 },                       // صواب أرجّح: +1، p=.58
      { sentence_id: 'd', verdict: 'true', confidence: 2, stances: ['believe'] }, // رأي: لا يُسجَّل
      { sentence_id: 'e', stances: ['research'] },                               // امتناع
    ];
    const s = katonSummary(ans, ss);
    expect(s).toMatchObject({ answered: 5, keyed: 4, judged: 3, total: -2, accuracy: 67, wrong: 1, abstention: 25 });
    // Brier = ((.9−1)² + (.9−0)² + (.58−1)²) / 3 = (.01 + .81 + .1764) / 3 = .332
    expect(s.brier).toBe(0.332);
    expect(s.calibration).toBe(67);
    expect(s.overconfidence).toBe(Math.round(((0.9 + 0.9 + 0.58) / 3 - 2 / 3) * 100));
    expect(s.curve[3]).toEqual({ n: 2, accuracy: 50, expected: 90 });
    expect(s.curve[1]).toEqual({ n: 1, accuracy: 100, expected: 58 });
    expect(s.curve[2]).toEqual({ n: 0, accuracy: null, expected: 74 });
    expect(s.stances.families).toEqual({ curiosity: 20, initiative: 20, openness: 20 });
    expect(katonSummary([], ss).calibration).toBeNull();
    const d = sentenceDistribution([ans[0], ans[1], ans[4]]);
    expect(d).toMatchObject({ true3: 2, none: 1, idea: 1, research: 1 });
    expect(KATON_CONFIDENCE[2].p).toBe(0.74);
  });

  it('حارس الصياغة: الخاطئة بلا قرائن إطلاق، وموضوع بلا خاطئتين أو بلا صحيحة حازمة لا يُنشر', () => {
    expect(absoluteCue('يتولى العميل وحده التحديث')).toBe('وحده');
    expect(() => cleanSentence({ text_ar: 'تُحدَّث المصفوفة مرة واحدة في نهاية المشروع.', key: 'false' })).toThrow(/قرينة إطلاق/);
    expect(cleanSentence({ text_ar: 'يُفضَّل تأجيل تحديث المصفوفة إلى ما بعد التسليم.', key: 'false' }).key).toBe('false');
    expect(cleanSentence({ text_ar: 'المدير وحده يقرر.', key: 'true' }).key).toBe('true');   // الصحيحة لا تُمنع
    expect(() => cleanSentence({ text_ar: 'قصير' })).toThrow();
    expect(cleanSentence({ text_ar: 'جملة كاملة بما يكفي', key: 'x', question: 'who', tasks: { support: 'اشرح', ghost: 'x' } }))
      .toMatchObject({ key: 'opinion', question: 'who', tasks: { support: 'اشرح' } });
    const hedged = { key: 'true', text_ar: 'قد يساعد الجدول في التنسيق' };
    expect(topicIssues([hedged, { key: 'false', text_ar: 'يُفضَّل العمل بلا جدول' }])).toEqual(expect.arrayContaining([expect.stringContaining('جملتان خاطئتان'), expect.stringContaining('حازمة')]));
    expect(topicIssues([{ key: 'true', text_ar: 'الجدول يحدد المراحل' }, { key: 'false', text_ar: 'يُفضَّل العمل بلا جدول' }, { key: 'false', text_ar: 'غالبًا يُعدّ الجدول بعد التنفيذ' }])).toEqual([]);
  });

  it('بنك الأسس: خمسة مواضيع بست جمل وأسئلتها الست، وفي كل منها خاطئتان محوّطتان وصحيحة حازمة', () => {
    expect(topics).toHaveLength(5);
    for (const t of topics) {
      expect(t.sentences.map((s) => s.question)).toEqual(['why', 'what', 'how', 'absent', 'who', 'when']);
      for (const s of t.sentences) expect(() => cleanSentence(s)).not.toThrow();
      expect(topicIssues(t.sentences)).toEqual([]);
      for (const s of t.sentences.filter((x) => x.key === 'false')) expect(s.explain_ar).toMatch(/^الصحيح/);
    }
  });
});
