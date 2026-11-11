import { describe, it, expect } from 'vitest';
import { countBy, filterContacts, mailto, pageList } from './contacts.js';

const rows = [
  { id: 1, name: 'سارة', email: 'sara@x.com', organization: 'وزارة', status: 'new', product: 'MI-HOME' },
  { id: 2, name: 'Omar', email: 'omar@y.com', organization: null, status: 'replied', product: 'MI-LEADERS' },
];

describe('filterContacts', () => {
  it('يبحث في الاسم والبريد والجهة دون حساسية لحالة الأحرف', () => {
    expect(filterContacts(rows, { q: 'OMAR' })).toHaveLength(1);
    expect(filterContacts(rows, { q: 'وزارة' })[0].id).toBe(1);
  });
  it('يجمع الحالة والمصدر', () => {
    expect(filterContacts(rows, { status: 'new', source: 'MI-LEADERS' })).toHaveLength(0);
    expect(filterContacts(rows, { source: 'MI-LEADERS' })[0].id).toBe(2);
  });
});

describe('pageList', () => {
  it('يختصر الصفحات البعيدة', () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
  });
});

it('countBy و mailto', () => {
  expect(countBy(rows)).toEqual({ new: 1, replied: 1 });
  expect(mailto(rows[0])).toMatch(/^mailto:sara@x\.com\?subject=/);
});

// طلبات مقياس جاهزية الأثر تمر بإجراء contact منذ 2026-11-11 (visitor-1): مصدرها باسمه لا «القادة»، في اللوحة وفي بريد المالك
describe('مصدر مقياس الجاهزية', () => {
  it('اسم المصدر وشارته من مصدر واحد، والمصفي يعرفه', async () => {
    const { SOURCE_AR, sourceTone, INTEREST_AR } = await import('./contacts.js');
    expect(SOURCE_AR['MI-ASSESSMENT']).toBe('مقياس الجاهزية');
    expect(INTEREST_AR.assessment).toBeTruthy();
    expect([sourceTone('MI-HOME'), sourceTone('MI-ASSESSMENT'), sourceTone('MI-LEADERS')]).toEqual(['home', 'home', 'leaders']);
    const rows3 = [...rows, { id: 3, name: 'ليلى', email: 'l@z.sa', status: 'new', product: 'MI-ASSESSMENT' }];
    expect(filterContacts(rows3, { source: 'MI-ASSESSMENT' }).map((r) => r.id)).toEqual([3]);
  });
  it('الشاشة لا تسمي مصدرًا مجهولًا «القادة»، وبريد المالك يسمي المقياس', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
    const ui = read('admin-app/src/screens/Contacts.jsx');
    expect(ui).not.toContain("SOURCE_AR[r.product] || 'القادة'");
    expect(ui).not.toContain("'صفحة القادة'");
    expect(read('supabase/functions/send-otp/index.ts')).toContain('"MI-ASSESSMENT": "مقياس جاهزية الأثر"');
    // رمز دخول اللوحة يقبل الأرقام العربية المشرقية بالمطبّع نفسه الذي في بوابات القادة
    const login = read('admin-app/src/screens/Login.jsx');
    expect(login).toContain('setCode(codeDigits(e.target.value))');
    expect(login).not.toContain("replace(/\\D/g, '')");
  });
});
