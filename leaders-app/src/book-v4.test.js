// كتاب القائد v4: فحص الكتل والاختبار، وخلط الخيارات، ومحتوى الترحيل
import { describe, expect, it } from 'vitest';
import { filterHandbookMd, gradeQuiz, lintHandbookMd, lintQuiz, parseQuiz, shuffleQuiz } from '../../supabase/functions/leaders-api/logic.js';
import SQL from '../../supabase/migrations/20261026160000_leaders_book_v4.sql?raw';

const errors = (xs) => xs.filter((x) => x.level === 'error');

describe('lintHandbookMd', () => {
  it('passes clean blocks', () => {
    expect(lintHandbookMd('نص\n:::min=intermediate\nفقرة\n:::\n:::min=advanced scope=program\nفقرة\n:::')).toEqual([]);
  });
  it('flags an unclosed block, nesting, and unknown tags as errors', () => {
    expect(errors(lintHandbookMd(':::min=advanced\nفقرة'))[0]).toMatchObject({ line: 1 });
    expect(errors(lintHandbookMd(':::min=intermediate\nأ\n:::min=advanced\nب\n:::'))[0]).toMatchObject({ line: 3 });
    expect(errors(lintHandbookMd(':::min=expert\nأ\n:::'))).toHaveLength(1);
    expect(errors(lintHandbookMd(':::min=intermediate only=advanced\nأ\n:::'))).toHaveLength(1);
  });
  it('flags a block no reader can see for the chapter level', () => {
    expect(errors(lintHandbookMd(':::only=beginner\nأ\n:::', 'intermediate'))).toHaveLength(1);
  });
  it('warns on stray closers, empty blocks, and tags that hide nothing', () => {
    const w = lintHandbookMd('أ\n:::\n:::min=intermediate\n:::\n:::min=advanced\nب\n:::', 'advanced');
    expect(errors(w)).toEqual([]);
    expect(w.map((x) => x.line)).toEqual([2, 3, 3, 5]);
  });
});

describe('lintQuiz', () => {
  it('flags a question that will not show, duplicates, and several keys', () => {
    expect(errors(lintQuiz('س: أ\n- ب\n- ج'))).toHaveLength(1);
    expect(errors(lintQuiz('س: أ\n* ب\n- ب\n- ج\nلماذا: د'))).toHaveLength(1);
    expect(errors(lintQuiz('س: أ\n* ب\n* ج\n- د\nلماذا: هـ'))).toHaveLength(1);
  });
  it('warns when the key gives itself away by length, or there is no why', () => {
    const w = lintQuiz('س: أ\n- قصير\n- قصير جدًا\n* إجابة صحيحة طويلة بوضوح تكشف نفسها\n\nس: ب\n- خيار أول\n* خيار ثان\n- خيار ثالث');
    expect(w.map((x) => [x.q, x.level])).toEqual([[1, 'warn'], [1, 'warn'], [2, 'warn']]);
  });
});

describe('shuffleQuiz', () => {
  const quiz = parseQuiz('س: أ\n- 1\n* 2\n- 3\n- 4\nلماذا: ـ\n\nس: ب\n* 1\n- 2\n- 3\n- 4');
  it('keeps each option and moves the key with it', () => {
    const s = shuffleQuiz(quiz, 'p1m1');
    s.forEach((q, i) => {
      expect([...q.options].sort()).toEqual([...quiz[i].options].sort());
      expect(q.options[q.answer]).toBe(quiz[i].options[quiz[i].answer]);
    });
  });
  it('is stable for one reader and differs across readers', () => {
    expect(shuffleQuiz(quiz, 'p1m1')).toEqual(shuffleQuiz(quiz, 'p1m1'));
    const orders = new Set(Array.from({ length: 12 }, (_, i) => shuffleQuiz(quiz, `p${i}m1`)[0].options.join()));
    expect(orders.size).toBeGreaterThan(3);
  });
  it('grades the index the reader saw', () => {
    const s = shuffleQuiz(quiz, 'p9m2');
    expect(gradeQuiz(s, s.map((q) => q.answer)).score).toBe(2);
    expect(gradeQuiz(s, s.map((q) => (q.answer + 1) % 4)).score).toBe(0);
  });
});

describe('book v4 migration', () => {
  const quizzes = [...SQL.matchAll(/_hb_quizset\('(\w+)', '(\w+)', '([0-9a-f]{32})', \$q\$([\s\S]*?)\$q\$\)/g)]
    .map(([, d, c, md5, md]) => ({ d, c, md5, md, qs: parseQuiz(md) }));

  it('rewrites all 27 chapter quizzes, each guarded by the original fingerprint', () => {
    expect(quizzes).toHaveLength(27);
    expect(new Set(quizzes.map((q) => `${q.d}.${q.c}`)).size).toBe(27);
  });
  it('writes four close options, a why, and no lint findings for every question', () => {
    for (const q of quizzes) {
      expect(q.qs.length, `${q.d}.${q.c}`).toBeGreaterThan(0);
      for (const x of q.qs) {
        expect(x.options, x.q).toHaveLength(4);
        expect(x.why, x.q).not.toBe('');
      }
      expect(lintQuiz(q.md), `${q.d}.${q.c}`).toEqual([]);
    }
  });
  it('does not let the longest option give the key away', () => {
    const all = quizzes.flatMap((q) => q.qs);
    const longest = all.filter((x) => x.options[x.answer].length >= Math.max(...x.options.map((o) => o.length))).length;
    expect(longest / all.length).toBeLessThanOrEqual(0.25);
  });

  const block = (mark) => {
    const m = SQL.match(new RegExp(`'${mark}',\\n\\$x\\$([\\s\\S]*?)\\$x\\$\\);`));
    return m && m[1];
  };
  it('teaches feedback, influence, RACI and indicator anatomy to every level', () => {
    for (const mark of ['## التأثير بلا سلطة', '## تشريح المؤشر']) {
      const text = block(mark);
      expect(text, mark).toBeTruthy();
      expect(text).not.toMatch(/^:::/m);
      expect(filterHandbookMd(text, 'beginner')).toBe(text.trim());
    }
    const lead = block('## التأثير بلا سلطة');
    for (const s of ['## التغذية الراجعة البنّاءة', 'الموقف', 'السلوك', 'الأثر', '## التفويض الواضح: مصفوفة RACI', 'واحد فقط']) expect(lead).toContain(s);
    const ind = block('## تشريح المؤشر');
    for (const s of ['خط الأساس', 'القيمة المستهدفة', 'الموعد المستهدف', 'الوحدة', 'المصدر والدورية', 'المالك']) expect(ind).toContain(s);
  });
  it('opens conflict modes to every level and names all four dependency types', () => {
    expect(SQL).toMatch(/:::min=intermediate\n- \*\*إدارة الخلاف \(TKI\)\*\*[^\n]*\n:::\$x\$,\n\$x\$- \*\*إدارة الخلاف \(TKI\)\*\*/);
    for (const t of ['(FS)', '(SS)', '(FF)', '(SF)', '(Lag)']) expect(SQL).toContain(t);
  });
  it('points assessment items at the chapter that teaches them', () => {
    expect(SQL).toMatch(/q\.chapter_key = 'ch6'\n\s+and q\.code in \('L-B2', 'L-B4', 'L-K5', 'L-K5B', 'L-K6', 'L-K6B', 'L-S2', 'L-S2B', 'L-S4'\)/);
    expect(SQL).toContain("q.chapter_key = 'ch5' and q.code = 'I-B4'");
  });
});
