// حراس الحزمة 5 (D04 وإحكام إشعار Creem): الدفع بعد اعتماد المسار، ولا منح إلا بدفع يطابق ما طُلب،
// ولا إعادة منح بعد استرداد، والمطابقة للمعلّق وحده، وبريد الاعتماد برابط الدفع وتذكيراه، والقمع.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { businessDays, pathOf, weeksAr } from './screens/Paywall.jsx';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const pay = read('supabase/functions/leaders-api/payments.ts');

describe('الخادم', () => {
  it('صفحة دفع البرنامج تشترط اعتماد المسار', () => {
    expect(pay).toMatch(/if \(item === 'program' && !APPROVED\.includes\(p\.status\)\) throw new Fail\([^)]*409, 'pay_wait_approval'\)/);
    expect(pay).toMatch(/export const APPROVED = \['placed', 'enrolled', 'completed'\];/);
  });
  it('التسوية بعد التحقق من المبلغ والعملة والمنتج والوضع، وتُعلَّق المخالفة بتنبيه، ولا تسوية لمسترد', () => {
    const settle = pay.slice(pay.indexOf('async function settle('), pay.indexOf('async function revokeFor('));
    expect(settle).toMatch(/if \(!settleable\(pay\)\)/);
    expect(settle).toMatch(/const issues = paidIssues\(pay, obj\);[\s\S]*alertOps\('payment_mismatch'/);
    expect(settle.indexOf('paidIssues')).toBeLessThan(settle.indexOf("from('entitlements').insert"));
  });
  it('المطابقة للمعلّق وحده', () => {
    const rec = pay.slice(pay.indexOf('export async function adminReconcile('));
    expect(rec).toMatch(/if \(pay\.status !== 'pending'\) throw new Fail\([^)]*409, 'not_pending'\)/);
  });
  it('بريد الاعتماد يحمل رابط إكمال التسجيل لمن عليه الرسم، وتذكيرا 3 و7 أيام من المهمة الساعية مرة لكل يوم', () => {
    expect(read('supabase/functions/leaders-api/admin.ts')).toMatch(/const pay = await programPaymentDue\(id\)[\s\S]{0,200}approvedMail\(p\.full_name, pay\)/);
    expect(pay).toMatch(/export const REMINDER_DAYS = \[3, 7\];/);
    expect(pay).toMatch(/\.eq\('action', 'payment\.reminder'\)\.eq\('entity_id', p\.id\)\.eq\('after->>day', String\(due\)\)/);
    expect(read('supabase/functions/leaders-api/index.ts')).toMatch(/pay_reminders: await Y\.payReminders\(\)/);
    const due = read('supabase/functions/leaders-api/entitlements.ts');
    expect(due).toMatch(/export async function programPaymentDue/);
    expect(due).toMatch(/if \(org\?\.status === 'active'\) return false;/);
  });
  it('القمع من القياس إلى الاعتماد إلى التسجيل في لوحة الدفع', () => {
    expect(pay).toMatch(/funnel: await funnel\(\)/);
    expect(pay).toMatch(/return \{ assessed, approved, enrolled:/);
  });
});

describe('الواجهة', () => {
  it('قبل الاعتماد حالة انتظار لا بوابة دفع، والدفع بعده', () => {
    expect(read('leaders-app/src/App.jsx')).toMatch(/screen = me\.profile\?\.approved \? <Paywall item="program" me=\{me\} onUpdate=\{accept\} \/> : <AwaitingApproval me=\{me\} \/>;/);
  });
  it('ملخص المسار من الرحلة نفسها، وأسابيعه بعربية صحيحة', () => {
    const p = pathOf([{ title_ar: 'أ', duration_days: 14, items: [{ kind: 'reading' }, { kind: 'model' }] }, { title_ar: 'ب', duration_days: 70, items: [{ kind: 'model' }] }]);
    expect(p).toEqual({ stages: 2, readings: 1, models: 2, weeks: 12, titles: ['أ', 'ب'] });
    expect([1, 2, 3, 10, 11].map(weeksAr)).toEqual(['أسبوع', 'أسبوعين', '3 أسابيع', '10 أسابيع', '11 أسبوعًا']);
  });
  it('يوما العمل يتخطيان الجمعة والسبت', () => {
    const thu = new Date('2026-11-05T10:00:00');   // الخميس
    expect(businessDays(thu, 2).getDay()).toBe(1);   // الاثنين
    expect(businessDays(new Date('2026-11-08T10:00:00'), 2).getDay()).toBe(2);   // الأحد ← الثلاثاء
  });
  it('نص الباقة من KATON_ENABLED، والإفصاح أن النتيجة تحدد المسار لا السعر', () => {
    const pw = read('leaders-app/src/screens/Paywall.jsx');
    expect(pw).toMatch(/\$\{KATON_ENABLED \? ' و«كاتون»' : ''\}/);
    expect(pw).toContain('نتيجتك تحدد مسارك لا سعرك');
  });
});
