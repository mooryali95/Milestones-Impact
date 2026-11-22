// نافذة «اسأل مختصًا» (قرار المالك 2026-11-22): بطاقات خبراء أوضح، ومهلة الرد من الإعدادات، والمساعد خطوة أولى حين يكون مفتوحًا
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialsOf, replyWithin } from './screens/ChooseExpert.jsx';

const read = (p) => readFileSync(p, 'utf8');

describe('بطاقة الخبير', () => {
  it('الحرفان من الاسم بلا اللقب ولا «بن»', () => {
    expect(initialsOf('م صهيب بن فرج السعد')).toBe('ص ف');
    expect(initialsOf('م عمر عبدالحميد')).toBe('ع ع');
    expect(initialsOf('')).toBe('');
  });
  it('المهلة بالأيام لا بالساعات', () => {
    expect(replyWithin(48)).toBe('يومين');
    expect(replyWithin(24)).toBe('يوم');
    expect(replyWithin(72)).toBe('3 أيام');
    expect(replyWithin(168)).toBe('7 أيام');
  });
  it('الملف الناقص يُقال بدل الفراغ، والمهلة من الخادم، والأول «الأنسب»', () => {
    const src = read('leaders-app/src/screens/ChooseExpert.jsx');
    expect(src).toContain('ملف مختصر');
    expect(src).toContain('Number(d.offer_hours) || 48');
    expect(src).toContain('الأنسب لطلبك');
    expect(read('supabase/functions/leaders-api/experts.ts')).toContain('offer_hours: await offerHours()');
  });
});

describe('المساعد خطوة أولى في «اسأل مختصًا»', () => {
  it('GuideChat داخل النافذة (يحجب نفسه إن كانت بوابته مغلقة)، و«أريد التأكد» يملأ طلب الخبير', () => {
    const src = read('leaders-app/src/screens/AskExpert.jsx');
    expect(src).toContain('<GuideChat context="capstone"');
    expect(src).toContain("note={confirm?.note || askNote(chapterTitle, detail)}");
    expect(read('leaders-app/src/screens/Guidance.jsx')).toContain('if (!d?.success || !d.gate?.ok) return null;');
  });
});
