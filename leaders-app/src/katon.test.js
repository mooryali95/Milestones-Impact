import { describe, expect, it } from 'vitest';
import { cleanSentence, katonPoints, katonScore, katonSummary, sentenceDistribution } from '../../supabase/functions/leaders-api/logic.js';
import topics from '../../supabase/content/katon/v1/topics.json';

describe('نموذج «كاتون»', () => {
  it('اليقين يُكافأ إن صدق ويُعاقَب إن خاب، ولا يُحسب على جملة رأي', () => {
    expect(katonScore('true', 'true')).toBe(6);
    expect(katonScore('true', 'false')).toBe(-6);
    expect(katonScore('false', 'false')).toBe(6);
    expect(katonScore('true', 'opinion')).toBe(0);
    expect(katonScore('research', 'true')).toBe(2);
    expect(katonScore('assume', 'opinion')).toBe(5);
    expect(katonScore('nope', 'true')).toBeNull();
  });

  it('نقاط البرنامج تتجاوز الافتراضي', () => {
    expect(katonPoints({ true: 8, idea: '' }).true).toBe(8);
    expect(katonPoints({ true: 8, idea: '' }).idea).toBe(3);
    expect(katonScore('true', 'false', { true: 8 })).toBe(-8);
  });

  it('يلخص دقة اليقين والعائلات', () => {
    const ss = [{ id: 'a', key: 'true' }, { id: 'b', key: 'false' }, { id: 'c', key: 'true' }, { id: 'd', key: 'opinion' }];
    const ans = [{ sentence_id: 'a', choice: 'true' }, { sentence_id: 'b', choice: 'true' }, { sentence_id: 'c', choice: 'research' }, { sentence_id: 'd', choice: 'believe' }];
    const s = katonSummary(ans, ss);
    expect(s).toMatchObject({ answered: 4, total: 6 - 6 + 2 + 4, accuracy: 50, sure: 2, sure_wrong: 1 });
    expect(s.families).toEqual({ certainty: 50, curiosity: 25, initiative: 0, openness: 25 });
    expect(sentenceDistribution(ans).true).toBe(2);
  });

  it('ينظف الجملة', () => {
    expect(() => cleanSentence({ text_ar: 'قصير' })).toThrow();
    expect(cleanSentence({ text_ar: 'جملة كاملة بما يكفي', key: 'x', question: 'who', tasks: { support: 'اشرح', ghost: 'x' } }))
      .toMatchObject({ key: 'opinion', question: 'who', tasks: { support: 'اشرح' } });
  });

  it('بنك الأسس: خمسة مواضيع بست جمل لكل منها وأسئلتها الست', () => {
    expect(topics).toHaveLength(5);
    for (const t of topics) {
      expect(t.sentences.map((s) => s.question)).toEqual(['why', 'what', 'how', 'absent', 'who', 'when']);
      for (const s of t.sentences) expect(() => cleanSentence(s)).not.toThrow();
    }
  });
});
