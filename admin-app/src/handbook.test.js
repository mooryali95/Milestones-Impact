import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as hb from './handbook.js';
import { applyTool, badQuiz, filterHandbookMd, HB_TOOLS, masterBook, maxPoints, nextSort, splitList, tierLabel, tiered, words } from './handbook.js';

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

  it('الكتاب الأصلي الكامل: كل الأبواب بكتلها كاملة، والكتب الـ27 مشتقة منه', () => {
    const body = 'أساس\n:::min=advanced scope=program\nللاحترافي في البرامج\n:::\nختام';
    const mods = [
      { id: 2, dimension: 'leadership', sort: 1, min_level: 'beginner', title_ar: 'ق', body_md: 'نص', quiz_md: 'س: ؟\n- أ\n* ب' },
      { id: 1, dimension: 'milestone', sort: 2, min_level: 'advanced', title_ar: 'م', body_md: body, reflection_ar: 'تأمل' },
      { id: 3, dimension: 'impact', sort: 1, min_level: 'beginner', title_ar: 'فارغ', body_md: '' },
    ];
    const book = masterBook(mods, [{ id: 9, dimension: 'impact', sort: 1, min_level: 'advanced', active: true }, { id: 8, dimension: 'impact', sort: 2, min_level: 'beginner', active: false }]);
    expect(book.chapters.map((c) => c.id)).toEqual([1, 2]);
    expect(book.chapters[0].md).toBe(body);
    expect(book.chapters[0].reflection).toBe('تأمل');
    expect(book.chapters[1].quiz).toHaveLength(1);
    expect(book.models.map((m) => m.id)).toEqual([9]);
    expect(filterHandbookMd(body, 'intermediate', 'program')).toBe('أساس\nختام');
    expect(filterHandbookMd(body, 'advanced', 'portfolio')).toContain('للاحترافي في البرامج');
  });

  it('وسوم الكتل بلغة المحرر', () => {
    expect(tierLabel('min=advanced scope=program')).toBe('للاحترافي · لقادة البرامج والمحافظ');
    expect(tierLabel(' only=beginner ')).toBe('للتأسيسي فقط');
    expect(tierLabel('min=intermediate')).toBe('للمتوسط فأعلى');
  });
});

// D08 في لوحة الإدارة: تقدير النموذج من 1 إلى 4، فيُعرض باسم درجته من السلّم الواحد لا بنجوم خمس
// كانت أعلى درجة (متميز 4) تظهر «★★★★☆» فتبدو دون الامتياز، والتنبيه يطلب «من 1 إلى 5»
describe('تقدير النموذج بالسلّم الرباعي', () => {
  it('اسم الدرجة وموضعها من أربع، وما خارج السلّم فارغ', () => {
    expect([1, 2, 3, 4].map(hb.ratingLabel)).toEqual(['دون المطلوب (1 من 4)', 'مقبول (2 من 4)', 'متقن (3 من 4)', 'متميز (4 من 4)']);
    expect([0, null, undefined, 5].map(hb.ratingLabel)).toEqual(['', '', '', '']);
    // الاسم القديم الذي تستورده شاشة المشاركين هو الدالة نفسها، فلا نجوم في أي من الشاشتين
    expect(hb.stars).toBe(hb.ratingLabel);
  });
  it('لا نجوم خمس ولا «من 1 إلى 5» في أداة التقييم', () => {
    const read = (f) => readFileSync(join(__dirname, f), 'utf8');
    expect(read('handbook.js')).not.toMatch(/★|☆/);
    expect(read('screens/Handbook.jsx')).not.toMatch(/من 1 إلى 5/);
    expect(read('screens/Handbook.jsx')).toMatch(/ratingLabel\(x\.rating\)/);
  });
});
