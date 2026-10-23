import { describe, expect, it } from 'vitest';
import { applyTool, badQuiz, HB_TOOLS, maxPoints, nextSort, splitList, tiered, words } from './handbook.js';

const tool = (label) => HB_TOOLS.find((t) => t[1] === label);

describe('استوديو الكتاب', () => {
  it('عدّ الكلمات يتجاهل وسوم المستوى', () => {
    expect(words(':::min=advanced\nنص من ثلاث\n:::')).toBe(3);
    expect(tiered('أ\n:::only=beginner\nب\n:::')).toBe(true);
    expect(tiered('بلا كتل')).toBe(false);
  });

  it('أدوات المحرر: أول السطر، والإحاطة، وكتلة المستوى', () => {
    expect(applyTool('سطر\nثانٍ', 5, 5, tool('عنوان'))).toEqual({ value: 'سطر\n## ثانٍ', caret: 8 });
    expect(applyTool('كلمة مهمة', 5, 9, tool('غامق')).value).toBe('كلمة **مهمة**');
    expect(applyTool('أ', 1, 1, tool('فقرة للاحترافي')).value).toBe('أ\n:::min=advanced\nاكتب الفقرة هنا\n:::\n');
  });

  it('الأسئلة الناقصة تُكتشف، والنقاط من ثوابت الخادم', () => {
    expect(badQuiz('س: كامل\n- أ\n* ب\n\nس: بلا صحيح\n- أ\n- ب')).toBe(1);
    expect(maxPoints(3, true)).toBe(30);
    expect(maxPoints(0, false)).toBe(10);
  });

  it('الترتيب التالي داخل الإطار، والقوائم بالفاصلتين', () => {
    expect(nextSort([{ dimension: 'impact', sort: 4 }, { dimension: 'milestone', sort: 9 }], 'impact')).toBe(5);
    expect(nextSort([], 'impact')).toBe(1);
    expect(splitList('أ، ب ,ج,')).toEqual(['أ', 'ب', 'ج']);
  });
});
