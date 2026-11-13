// اختبار وحدة لحساب «مقياس جاهزية الأثر» في الموقع العام.
// الملف المختبَر سكربت متصفح عادي (بلا وحدات): يعلّق واجهته على globalThis.MIAssessmentCore.
import '../../home/assets/program/js/assessment-core.js';
import { readFileSync } from 'fs';

const CORE = globalThis.MIAssessmentCore;
const { LINKS, SCALE, QUESTIONS, TOTAL, LEVEL_CUTOFFS, CLOSE_GAP, scoreReadiness } = CORE;

// إجابات من مجاميع الحلقات الخمس (كل مجموع من 0 إلى 9 موزّع على ثلاث عبارات)
const split = (sum) => [Math.min(3, sum), Math.min(3, Math.max(0, sum - 3)), Math.max(0, sum - 6)];
const fromSums = (sums) => sums.flatMap(split);

describe('بنية المقياس', () => {
  it('خمس حلقات، ثلاث عبارات لكل حلقة، 15 عبارة', () => {
    expect(LINKS.map((l) => l.key)).toEqual(['inputs', 'activities', 'outputs', 'outcomes', 'impact']);
    LINKS.forEach((l) => {
      expect(l.questions).toHaveLength(3);
      expect(l.advice.length).toBeGreaterThan(20);
    });
    expect(TOTAL).toBe(15);
    expect(QUESTIONS).toHaveLength(15);
    expect(QUESTIONS.map((q) => q.li)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect(new Set(QUESTIONS.map((q) => q.text)).size).toBe(15);
    QUESTIONS.forEach((q) => expect(q.text.endsWith('.')).toBe(true));
  });

  it('سلّم تغطية رباعي من 0 إلى 3', () => {
    expect(SCALE.map((s) => s.v)).toEqual([0, 1, 2, 3]);
    expect(SCALE.map((s) => s.label)).toEqual(['لا يحدث', 'في بعض المشاريع', 'في أغلب المشاريع', 'في كل المشاريع']);
  });

  it('أربعة مستويات بحدودها في ثابت واحد', () => {
    expect(LEVEL_CUTOFFS.map((l) => l.min)).toEqual([0, 40, 60, 80]);
    expect(LEVEL_CUTOFFS.map((l) => l.name)).toEqual(['مرحلة النية', 'مرحلة التأسيس', 'مرحلة الانضباط', 'مرحلة الأثر المؤسسي']);
  });

  it('الصفحة تحمّل ملف الحساب قبل ملف الواجهة', () => {
    const html = readFileSync('home/assessment/index.html', 'utf8');
    const core = html.indexOf('/assets/program/js/assessment-core.js');
    const ui = html.indexOf('/assets/program/js/assessment.js');
    expect(core).toBeGreaterThan(-1);
    expect(ui).toBeGreaterThan(core);
    expect(html).not.toContain('مستوى النضج');
  });
});

describe('scoreReadiness: الدرجات', () => {
  it('الحدّان: كل الإجابات 0 ثم كل الإجابات 3', () => {
    const zero = scoreReadiness(new Array(15).fill(0));
    expect(zero.total).toBe(0);
    expect(zero.perLink.map((l) => l.pct)).toEqual([0, 0, 0, 0, 0]);
    const full = scoreReadiness(new Array(15).fill(3));
    expect(full.total).toBe(100);
    expect(full.perLink.map((l) => l.pct)).toEqual([100, 100, 100, 100, 100]);
    expect(full.version).toBe('readiness-v2');
  });

  it('نسبة الحلقة = المجموع ÷ 9', () => {
    const r = scoreReadiness(fromSums([9, 6, 3, 1, 0]));
    expect(r.perLink.map((l) => l.sum)).toEqual([9, 6, 3, 1, 0]);
    expect(r.perLink.map((l) => l.pct)).toEqual([100, 67, 33, 11, 0]);
    expect(r.perLink.map((l) => l.name)).toEqual(['المدخلات', 'الأنشطة', 'المخرجات', 'النتائج', 'الأثر']);
  });

  it('الدرجة الكلية متوسط غير موزون لنسب الحلقات: لكل حلقة 20%', () => {
    // حلقة واحدة كاملة والبقية صفر = 20 أيًّا كانت الحلقة
    for (let li = 0; li < 5; li++) {
      const sums = [0, 0, 0, 0, 0];
      sums[li] = 9;
      expect(scoreReadiness(fromSums(sums)).total).toBe(20);
    }
    // المتوسط يُحسب من النسب غير المقرّبة: (5×(4/9))×100 = 44.4 لا 44×5÷5 بتقريب متراكم
    expect(scoreReadiness(fromSums([4, 4, 4, 4, 4])).total).toBe(44);
    expect(scoreReadiness(fromSums([9, 6, 3, 1, 0])).total).toBe(42);
  });

  it('يرفض إجابات ناقصة أو خارج السلّم', () => {
    expect(() => scoreReadiness(new Array(12).fill(1))).toThrow();
    expect(() => scoreReadiness([...new Array(14).fill(1), null])).toThrow();
    expect(() => scoreReadiness([...new Array(14).fill(1), 4])).toThrow();
    expect(() => scoreReadiness([...new Array(14).fill(1), 1.5])).toThrow();
  });
});

describe('scoreReadiness: المستويات عند الحدود', () => {
  const level = (total45) => {
    // مجموع من 45 موزّع على الحلقات بالتساوي ما أمكن
    const sums = [0, 0, 0, 0, 0];
    for (let i = 0; i < total45; i++) sums[i % 5]++;
    const r = scoreReadiness(fromSums(sums));
    return [r.total, r.level.name];
  };
  it('40 و60 و80 تبدأ عندها المستويات', () => {
    expect(level(17)).toEqual([38, 'مرحلة النية']);
    expect(level(18)).toEqual([40, 'مرحلة التأسيس']);
    expect(level(26)).toEqual([58, 'مرحلة التأسيس']);
    expect(level(27)).toEqual([60, 'مرحلة الانضباط']);
    expect(level(35)).toEqual([78, 'مرحلة الانضباط']);
    expect(level(36)).toEqual([80, 'مرحلة الأثر المؤسسي']);
  });
  it('levelFor عند الحدود نفسها', () => {
    expect([0, 39, 40, 59, 60, 79, 80, 100].map((t) => CORE.levelFor(t).min)).toEqual([0, 0, 40, 40, 60, 60, 80, 80]);
  });
});

describe('scoreReadiness: الحلقة الأضعف والتعادل والتقارب', () => {
  it('حلقة واحدة أضعف بفارق خطوتين أو أكثر تُسمّى وحدها', () => {
    const r = scoreReadiness(fromSums([6, 6, 2, 4, 6]));
    expect(r.focus.kind).toBe('single');
    expect(r.focus.links.map((l) => l.key)).toEqual(['outputs']);
    expect(r.focus.label).toBe('الحلقة الأضعف:');
    expect(r.focus.names).toBe('المخرجات');
    expect(r.weakest.map((l) => l.key)).toEqual(['outputs']);
  });

  it('التعادل في أدنى درجة يسمّي كل الحلقات المتعادلة لا أسبقها ترتيبًا', () => {
    const r = scoreReadiness(fromSums([2, 6, 2, 6, 2]));
    expect(r.focus.kind).toBe('tied');
    expect(r.focus.links.map((l) => l.key)).toEqual(['inputs', 'outputs', 'impact']);
    expect(r.focus.names).toBe('المدخلات، المخرجات والأثر');
    expect(r.weakest).toHaveLength(3);
  });

  it('التعادل في أعلى درجة يسمّي كل الأقوى', () => {
    const r = scoreReadiness(fromSums([9, 3, 9, 5, 1]));
    expect(r.strongest.map((l) => l.key)).toEqual(['inputs', 'outputs']);
  });

  it('فارق خطوة واحدة (نحو 11 نقطة، أقل من 12) يُعرض تقاربًا لا حلقة أضعف', () => {
    expect(CLOSE_GAP).toBe(12);
    const r = scoreReadiness(fromSums([7, 7, 3, 4, 7]));
    expect(r.focus.kind).toBe('close');
    expect(r.focus.links.map((l) => l.key)).toEqual(['outputs', 'outcomes']);
    expect(r.focus.names).toBe('المخرجات والنتائج');
    expect(r.focus.label).toContain('متقاربة');
    // الحلقة الأدنى رقميًا تبقى معروفة للترتيب، لكنها لا تُعلن أضعف حلقة
    expect(r.weakest.map((l) => l.key)).toEqual(['outputs']);
  });

  it('فارق خطوتين (نحو 22 نقطة) ليس تقاربًا', () => {
    expect(scoreReadiness(fromSums([7, 7, 3, 5, 7])).focus.kind).toBe('single');
  });

  it('تساوي الحلقات الخمس لا يسمّي حلقة', () => {
    const r = scoreReadiness(fromSums([5, 5, 5, 5, 5]));
    expect(r.focus.kind).toBe('even');
    expect(r.focus.links).toEqual([]);
    expect(r.focus.names).toBe('');
  });
});
