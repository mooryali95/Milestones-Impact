// الكتاب التفاعلي: صيغة الاختبار، والتصحيح، والنقاط، والألقاب، والنماذج
import { describe, expect, it } from 'vitest';
import {
  chapterPoints, POINTS, RANKS, cleanAnswers, gradeQuiz, missingFields, modelsFor, parseQuiz, rankFor,
} from '../../supabase/functions/leaders-api/logic.js';

const MD = `س: ما الأثر؟
- ما ننجزه
* ما يتغيّر بسببه
لماذا: الأثر تغيير.

س: سؤال بلا إجابة صحيحة
- أ
- ب

س: ثانٍ
* نعم
- لا`;

describe('book', () => {
  it('parses quizzes and drops malformed questions', () => {
    const q = parseQuiz(MD);
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ q: 'ما الأثر؟', answer: 1, why: 'الأثر تغيير.' });
    expect(q[1].options).toEqual(['نعم', 'لا']);
  });

  it('grades and scores a chapter', () => {
    const g = gradeQuiz(parseQuiz(MD), [1, 1]);
    expect(g).toMatchObject({ score: 1, total: 2 });
    expect(g.results[1]).toMatchObject({ correct: false, answer: 0 });
    // أوزان تصور المرحلة 3 (§5.3): 10 للفصل، 3 للصحيحة، 10 للتأمل، و5 أخرى إن أجاب عن «أين ستطبقه؟»
    expect(chapterPoints(1, 'تأمل قصير جدًا')).toBe(13);
    expect(chapterPoints(2, 'تأمل كافٍ يزيد على عشرين حرفًا بوضوح')).toBe(26);
    expect(chapterPoints(2, 'تأمل كافٍ يزيد على عشرين حرفًا بوضوح', 'في اجتماع الفريق الأسبوعي يوم الأحد')).toBe(31);
  });

  it('keeps the short meaningful reflection and rewards the applied answer only with a reflection', () => {
    // القصير المقبول يمر: الحد الأدنى باقٍ 20 حرفًا و4 كلمات مختلفة
    expect(chapterPoints(0, 'سأجرب هذا مع فريقي غدًا')).toBe(20);
    expect(chapterPoints(0, 'جيد')).toBe(10);
    // «أين ستطبقه؟» بلا تأمل لا يضيف شيئًا، وجواب شكلي لا يضيف
    expect(chapterPoints(0, '', 'في اجتماع الفريق الأسبوعي يوم الأحد')).toBe(10);
    expect(chapterPoints(0, 'سأجرب هذا مع فريقي غدًا', 'هنا')).toBe(20);
    expect(POINTS).toMatchObject({ chapter: 10, perCorrect: 3, reflection: 10, reflectionApplied: 5 });
  });

  it('never lowers a rank already reached: titles depend on stored totals and thresholds are unchanged', () => {
    expect(RANKS.map((r) => r.min)).toEqual([0, 75, 200, 400, 650]);
    let prev = -1;
    for (let n = 0; n <= 900; n += 5) { const i = rankFor(n).index; expect(i).toBeGreaterThanOrEqual(prev); prev = i; }
  });

  it('ranks by points', () => {
    expect(rankFor(0)).toMatchObject({ title: 'مستكشف', next: { at: 75, left: 75 } });
    expect(rankFor(210).title).toBe('متمكّن');
    expect(rankFor(900).next).toBeNull();
  });

  it('gates models by level and checks completeness', () => {
    const models = [
      { dimension: 'impact', min_level: 'advanced', sort: 1 },
      { dimension: 'milestone', min_level: 'beginner', sort: 2 },
      { dimension: 'milestone', min_level: 'beginner', sort: 1, active: false },
    ];
    expect(modelsFor(models, { milestone: 'beginner', impact: 'intermediate', leadership: 'beginner' })).toHaveLength(1);
    const fields = [
      { key: 'p', label: 'المشروع', type: 'text' },
      { key: 't', label: 'المعالم', type: 'table', columns: ['أ', 'ب'], min_rows: 2 },
      { key: 's', label: 'القرار', type: 'select', options: ['استمرار', 'إيقاف'] },
    ];
    const a = cleanAnswers(fields, { p: 'مشروع', t: [['م1', 'x', 'زائد'], ['', 'y']], s: 'غير موجود', extra: 1 });
    expect(a).toEqual({ p: 'مشروع', t: [['م1', 'x'], ['', 'y']], s: '' });
    expect(missingFields(fields, a)).toEqual(['المعالم: 2 صفوف على الأقل', 'القرار']);
  });
});
