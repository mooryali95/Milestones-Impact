// تصور تقييم 360 (اعتمده المالك 2026-11-11): docs/content/2026-11-11-تصور-تقييم-360-v1.md
// كل مرحلة تُختبر وحدها: 0 «جديد»، و0ب من يرى تقييم الخبير، و1 نموذج المقيّم، و2 الدورة والمجموعات، و3 التقرير والاستلام.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expertOwnRating, MIN_RATINGS, RATING_DROP, RATING_WINDOW_DAYS, ratingDrop } from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('المرحلة 0: لا «خبير جديد» مكان التقييم الغائب', () => {
  it('بطاقة الترشيح لا تصف الخبير بأنه جديد', () => {
    expect(read('leaders-app/src/screens/ChooseExpert.jsx')).not.toMatch(/جديد في البرنامج|خبير جديد/);
  });
  it('حد إظهار التقييم للخبير من MIN_RATINGS وحده، لا رقم ثابت', () => {
    const src = read('supabase/functions/leaders-api/experts.ts');
    expect(src).not.toMatch(/min:\s*5\b/);
    // منذ 0ب يأتي الحد من expertOwnRating في logic.js (انظر اختبار «قبل MIN_RATINGS لا ملخص»)
    expect(src).toMatch(/min:\s*MIN_RATINGS|rating: ratings\.own/);
  });
});

describe('المرحلة 0ب: المشارك لا يرى نجوم الخبير، والخبير يرى ملخصه بنافذة دورية', () => {
  const at = (day) => new Date(Date.UTC(2026, 0, 1) + day * 864e5).toISOString();
  const r = (day, overall, s = overall) => ({ created_at: at(day), overall, scores: { useful: s, clear: s, punctual: s } });
  const keys = ['useful', 'clear', 'punctual'];
  const now = (day) => Date.UTC(2026, 0, 1) + day * 864e5;

  it('بطاقة الترشيح للمشارك بلا تقييم أصلًا، والواجهة لا تعرض نجومًا', () => {
    const src = read('supabase/functions/leaders-api/experts.ts');
    const card = src.slice(src.indexOf('const publicCard'), src.indexOf('});', src.indexOf('const publicCard')));
    expect(card).not.toMatch(/rating/);
    expect(read('leaders-app/src/screens/ChooseExpert.jsx')).not.toMatch(/★|e\.rating/);
  });
  it('قبل MIN_RATINGS لا ملخص، ويُعرف العدد والحد وحدهما', () => {
    expect(expertOwnRating([r(1, 5), r(2, 4)], keys, now(3))).toEqual({ visible: false, count: 2, min: MIN_RATINGS });
  });
  it('الملخص الأول عند بلوغ الحد، ثم لا يتحرك مع تقييم جديد قبل اجتماع 5 جديدة ومضي الشهر', () => {
    const five = [1, 2, 3, 4, 5].map((d) => r(d, 5));
    const first = expertOwnRating(five, keys, now(6));
    expect(first).toMatchObject({ visible: true, avg: 5, count: 5, pending: 0 });
    // تقييم سيئ صباح اليوم التالي: الملخص لا يتغير، فلا يُستدل منه على صاحبه
    const next = expertOwnRating([...five, r(6, 1)], keys, now(7));
    expect(next).toMatchObject({ avg: 5, count: 5, pending: 1 });
    // خمسة جديدة في أسبوع: لا تحديث قبل مضي RATING_WINDOW_DAYS
    const ten = [...five, ...[6, 7, 8, 9, 10].map((d) => r(d, 3))];
    expect(expertOwnRating(ten, keys, now(20))).toMatchObject({ count: 5, pending: 5 });
    // بعد الشهر يتحدث بالعشرة كلها
    expect(expertOwnRating(ten, keys, now(5 + RATING_WINDOW_DAYS + 1))).toMatchObject({ count: 10, avg: 4, pending: 0 });
    // مضي الشهر وحده لا يكفي: تقييمان جديدان لا يحدّثان الملخص
    expect(expertOwnRating([...five, r(40, 1), r(41, 1)], keys, now(60))).toMatchObject({ count: 5, pending: 2 });
  });
  it('المعايير مقربة إلى نصف درجة', () => {
    const x = expertOwnRating([r(1, 5, 5), r(2, 4, 4), r(3, 4, 4), r(4, 4, 4), r(5, 4, 4)], keys, now(6));
    expect(x.criteria).toEqual({ useful: 4, clear: 4, punctual: 4 });
    expect(expertOwnRating([5, 5, 4, 4, 4].map((v, i) => r(i, v, v)), keys, now(6)).criteria.useful).toBe(4.5);
  });
  it('تنبيه الإدارة حين يهبط متوسط آخر 5 تحت 3.5', () => {
    const old = [1, 2, 3, 4, 5].map((d) => r(d, 5));
    expect(ratingDrop(old)).toBeNull();
    expect(ratingDrop([...old, ...[6, 7, 8, 9, 10].map((d) => r(d, 3))])).toEqual({ avg: 3, last: RATING_DROP.last });
    expect(ratingDrop([r(1, 1), r(2, 1)])).toBeNull();
  });
  it('لوحة الخبير تقرأ الملخص الدوري، والإدارة ترى التنبيه', () => {
    expect(read('supabase/functions/leaders-api/experts.ts')).toMatch(/rating: ratings\.own/);
    expect(read('admin-app/src/screens/Experts.jsx')).toMatch(/r\.drop/);
  });
});
