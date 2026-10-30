// حارس المصدر الواحد: يفشل إن عاد اسم أو رقم معرَّف في مصدره ليُنسخ في ملف آخر.
// المصادر: leaders-api/labels.js (المسميات)، logic.js (النقاط والمراتب)، lab.js، capstone.js، src/config/constants.js (التواصل).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const DIRS = ['src', 'leaders-app/src', 'admin-app/src', 'supabase/functions', 'home'];
const SKIP = /node_modules|\/assets\/|\.test\.|\.spec\./;
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (SKIP.test(p)) return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|ts|html)$/.test(p) ? [p] : [];
});
const files = DIRS.flatMap((d) => walk(join(ROOT, d))).map((p) => ({ p: p.slice(ROOT.length + 1), s: readFileSync(p, 'utf8') }));
// التعليقات توثيق لا مصدر بيانات، فلا تُفحص
const code = (s) => s.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const offenders = (re, allow = []) => files.filter(({ p, s }) => !allow.includes(p) && re.test(code(s))).map((f) => f.p);

describe('مصدر واحد لكل معلومة', () => {
  it('أسماء المستويات تُعرَّف في labels.js وحده', () => {
    expect(offenders(/beginner:\s*'تأسيسي'/, ['supabase/functions/leaders-api/labels.js'])).toEqual([]);
  });
  it('أسماء الأبعاد تُعرَّف في labels.js وحده', () => {
    expect(offenders(/(leadership|milestone):\s*'(تمكين القائد|إدارة المشروعات|القيادة|المعلم)'/, ['supabase/functions/leaders-api/labels.js'])).toEqual([]);
  });
  it('حالات المشارك تُعرَّف في labels.js وحده', () => {
    expect(offenders(/pending_approval:\s*'بانتظار الاعتماد'/, ['supabase/functions/leaders-api/labels.js'])).toEqual([]);
  });
  it('لا رقم هاتف منشور، والبريد العام mi@ وحده', () => {
    expect(offenders(/tel:|05\d{8}/)).toEqual([]);
    expect(offenders(/\b(?!mi@)[a-z]+@sunkvalue\.com/)).toEqual([]);
  });
  it('النقاط وسلّم المراتب وعتبات المختبر لا تُكتب أرقامًا في الواجهة', () => {
    expect(offenders(/RANK_AT|10 \+ data\.quiz|>= 90 \?/)).toEqual([]);
  });
  it('أوزان مشروع التخرج لا تُكتب نصًا', () => {
    expect(offenders(/بوزن 30%|وزنها مضاعف|ستة أبعاد/)).toEqual([]);
  });
  it('طرق الانعقاد والمحاور تُعرَّف في labels.js وحده', () => {
    expect(offenders(/in_person:\s*'حضوري'/, ['supabase/functions/leaders-api/labels.js'])).toEqual([]);
    expect(offenders(/admission:\s*'القبول'/, ['supabase/functions/leaders-api/labels.js'])).toEqual([]);
  });
  it('عدد المسارات ومعيار التسكين ونافذة الحضور لا تُنسخ أرقامًا', () => {
    expect(offenders(/الـ27|من 27|\/27</)).toEqual([]);
    expect(offenders(/w_knowledge:\s*35/, ['supabase/functions/leaders-api/logic.js'])).toEqual([]);
    expect(offenders(/كل 30 ثانية/)).toEqual([]);
  });
  it('مرسل البريد يُعرَّف في _shared/mail.ts وحده', () => {
    expect(offenders(/@basserh\.com/, ['supabase/functions/_shared/mail.ts'])).toEqual([]);
  });
  it('عنوان قاعدة البيانات ومفتاحها في الصفحات الثابتة يطابقان src/lib/api.js', () => {
    const api = files.find((f) => f.p === 'src/lib/api.js').s;
    const url = api.match(/https:\/\/[a-z0-9]+\.supabase\.co/)[0];
    const key = api.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)[0];
    for (const f of files.filter((x) => /supabase\.co|eyJhbGci/.test(x.s))) {
      for (const u of f.s.match(/https:\/\/[a-z0-9]+\.supabase\.co/g) || []) expect(u, f.p).toBe(url);
      for (const k of f.s.match(/eyJhbGci[\w-]+\.[\w-]+\.[\w-]+/g) || []) expect(k, f.p).toBe(key);
    }
  });
});
