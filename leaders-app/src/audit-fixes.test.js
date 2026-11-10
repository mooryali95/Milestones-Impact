// إصلاحات خطة الفحص الخارجي (2026-11-10): اسم الشهادة، وعدّاد المرحلة
import { describe, expect, it } from 'vitest';
import { certName } from './screens/Profile.jsx';
import { stageCount } from './screens/Journey.jsx';

describe('اسم يصلح للشهادة', () => {
  it('يقبل اسمين فأكثر بالعربية أو اللاتينية', () => {
    for (const n of ['سارة الأحمد', 'عبد الله بن محمد آل سعود', "Sarah O'Neil", 'Jean-Luc Picard', 'مُحمَّد العلي']) expect(certName(n), n).toBe(true);
  });
  it('يرفض الكلمة الواحدة والأرقام والرموز والحرف المنفرد', () => {
    for (const n of ['', 'سارة', 'OmarManzoma', 'سارة 2', 'O M', 'سارة @الأحمد', '   ']) expect(certName(n), n).toBe(false);
  });
});

describe('عدّاد المرحلة', () => {
  const it2 = (required, status) => ({ required, status });
  it('يحسب المطلوب فقط ويذكر الاختياري وحده', () => {
    expect(stageCount({ done: 1, total: 2, items: [it2(true, 'done'), it2(false, 'pending')] })).toBe('1 من 1 · واحد اختياري');
    expect(stageCount({ done: 1, total: 3, items: [it2(true, 'done'), it2(true, 'pending'), it2(true, 'pending')] })).toBe('1 من 3');
  });
  it('مرحلة كلها اختيارية تبقى بعدّادها الكامل', () => {
    expect(stageCount({ done: 1, total: 2, items: [it2(false, 'done'), it2(false, 'pending')] })).toBe('1 من 2');
  });
});
