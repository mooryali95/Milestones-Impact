// فحص ما قبل التسليم (المرحلة 3 من «بوابتان، والباقي ملاحظات»): تلميحات لا تمنع، بلا شبكة، من علامات النموذج الجيد
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { preSubmitHints, PRESUBMIT_MIN_CHARS } from './presubmit.js';

const F = [
  { key: 'goal', label: 'المؤشر المستهدف', type: 'textarea' },
  { key: 'when', label: 'موعد الإطلاق', type: 'text' },
  { key: 'owner', label: 'المسؤول عن التنفيذ', type: 'textarea' },
  { key: 'risks', label: 'المخاطر', type: 'table', columns: ['الخطر', 'الأثر', 'المعالجة'] },
  { key: 'x1', label: 'ملاحظات إضافية', type: 'textarea', required: false },
  { key: 'x2', label: 'روابط', type: 'text', required: false },
];
const long = (s) => `${s} ${'وذلك لأن الفريق يحتاج إلى وضوح في الخطوات والأدوار حتى يتقدم العمل '.repeat(2)}`;

describe('preSubmitHints', () => {
  it('نموذج مكتمل محدد: لا تلميح', () => {
    const a = { goal: long('رفع الرضا إلى 85% خلال الربع'), when: '1 مارس 2027', owner: long('مدير التحول'), risks: [['تأخر', 'عال', 'خطة بديلة']], x1: long('لا شيء'), x2: 'x' };
    expect(preSubmitHints(F, a)).toEqual([]);
  });
  it('المقتضب، وطلب الرقم والتاريخ والدور بلا أثر، والجدول الناقص، والاختياري الفارغ', () => {
    const a = { goal: long('تحسين تجربة المستفيد'), when: 'قريبًا', owner: 'نحن', risks: [['تأخر', '', '']] };
    const keys = preSubmitHints(F, a).map((h) => h.key);
    expect(keys).toEqual(['_optional', 'goal', 'when', 'owner', 'risks']);
    expect(preSubmitHints(F, a).find((h) => h.key === 'owner').text).toMatch('مقتضب');
    expect('نحن'.length).toBeLessThan(PRESUBMIT_MIN_CHARS);
  });
  it('الحقل الفارغ لا يُلمَّح له (الإلزامي يمنعه الخادم)، وحقل اسم المبادرة من البطاقة يُتجاوز', () => {
    expect(preSubmitHints([{ key: 'n', label: 'اسم المبادرة', type: 'text', bind: 'initiative' }], {}, { initiative: 'م' })).toEqual([]);
    expect(preSubmitHints([F[0]], {})).toEqual([]);
  });
  it('لا تمنع التسليم: «سلّم على أي حال» في الشاشة، ولا نداء شبكة في الوحدة', () => {
    const src = readFileSync('leaders-app/src/presubmit.js', 'utf8');
    expect(src).not.toMatch(/fetch\(|call\(/);
    const ui = readFileSync('leaders-app/src/screens/Models.jsx', 'utf8');
    expect(ui).toMatch('سلّم على أي حال');
    expect(ui).not.toMatch('تسليم للمستشار');
  });
});
