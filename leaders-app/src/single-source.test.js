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
const offenders = (re, allow = []) => files.filter(({ p, s }) => !allow.includes(p) && re.test(s)).map((f) => f.p);

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
});
