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

describe('المرحلة 1: الفرز السريع', () => {
  const now = new Date('2026-11-26T09:00:00Z');
  const all = [
    { id: 1, status: 'new', created_at: '2026-11-25T08:00:00Z' },
    { id: 2, status: 'new', created_at: '2026-11-10T08:00:00Z' },
    { id: 3, status: 'read', created_at: '2026-11-20T08:00:00Z' },
    { id: 4, status: 'replied', created_at: '2026-11-01T08:00:00Z' },
    { id: 5, status: 'archived', created_at: '2026-10-01T08:00:00Z' },
  ];
  it('أرقام البطاقات من كل الطلبات لا من المرشَّح، وكل بطاقة قيمة من حقل الحالة', async () => {
    const { cardCounts, CONTACT_CARDS, CONTACT_FIELDS } = await import('./contacts.js');
    expect(cardCounts(all)).toEqual({ new: 2, read: 1, replied: 1 });
    expect(cardCounts([])).toEqual({ new: 0, read: 0, replied: 0 });
    const status = CONTACT_FIELDS.find((x) => x.key === 'status');
    expect(status.hidden).toBe(true);
    CONTACT_CARDS.forEach((c) => expect(status.options.map(([v]) => v)).toContain(c.key));
    // البطاقة تكتب في f.status نفسه، فالمرشَّح يطابق عددها
    CONTACT_CARDS.forEach((c) => expect(filterContacts(all, { status: c.key }).length).toBe(cardCounts(all)[c.key]));
  });
  it('المتأخر: جديد أو مقروء بعد المهلة، لا ما رُد عليه', async () => {
    const { awaitingDays, isLate, LATE_DAYS } = await import('./contacts.js');
    expect(LATE_DAYS).toBe(3);
    expect(all.map((r) => awaitingDays(r, now))).toEqual([1, 16, 6, null, null]);
    expect(all.filter((r) => isLate(r, now)).map((r) => r.id)).toEqual([2, 3]);
  });
  it('mailto يرفض بريدًا يحقن معاملات، ويرمّز الصالح', async () => {
    const { validEmail } = await import('./contacts.js');
    expect(mailto({ name: 'x', email: 'a@b.com?cc=evil@x.com' })).toBeNull();
    expect(mailto({ name: 'x', email: 'a@b.com\nBcc: e@x.com' })).toBeNull();
    expect(mailto({ name: 'x', email: '' })).toBeNull();
    expect(mailto({ name: 'x', email: 'a+b@x.sa' })).toMatch(/^mailto:a%2Bb@x\.sa\?/);
    expect(validEmail(' sara@x.com ')).toBe(true);
  });
  it('الشاشة: لا تعليم بالمقروء عند الفتح مباشرة، ولا بريد في صف الجدول، ولا رموز يونيكود للأيقونات', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const ui = readFileSync(join(__dirname, 'screens/Contacts.jsx'), 'utf8');
    expect(ui).toContain('READ_AFTER_MS = 1500');
    expect(ui).not.toMatch(/const open = \(r\) => \{[^}]*setStatus/);
    expect(ui).not.toMatch(/[✉↻✓✕‹›]/);
    expect(ui).not.toContain('<th>البريد</th>');
    expect(ui).not.toContain('style={{');
    expect(ui).toContain("confirm('هل أرسلت الرد؟'");
  });
  it('أعمدة البريد والجوال والرسالة في التصدير غير مختارة افتراضيًا', async () => {
    const { chosenColumns, sensitivePicked } = await import('./exports.js');
    const cols = [{ key: 'name' }, { key: 'email', sensitive: true }, { key: 'message', sensitive: true }];
    expect(chosenColumns(cols, null).map((c) => c.key)).toEqual(['name']);
    expect(chosenColumns(cols, ['email', 'name']).map((c) => c.key)).toEqual(['name', 'email']);
    expect(chosenColumns(cols, ['gone']).map((c) => c.key)).toEqual(['name']);
    expect(sensitivePicked(cols, ['email', 'name']).map((c) => c.key)).toEqual(['email']);
  });
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
    // أسماء الصفحات في _shared/contact.ts مصدرًا واحدًا لعنوان البريد وسطر Slack (مركز الإشعارات، المرحلة 3)
    expect(read('supabase/functions/_shared/contact.ts')).toContain("'MI-ASSESSMENT': 'مقياس جاهزية الأثر'");
    expect(read('supabase/functions/send-otp/index.ts')).toContain('CONTACT_PAGES[r.product as string]');
    // رمز دخول اللوحة يقبل الأرقام العربية المشرقية بالمطبّع نفسه الذي في بوابات القادة
    const login = read('admin-app/src/screens/Login.jsx');
    expect(login).toContain('setCode(codeDigits(e.target.value))');
    expect(login).not.toContain("replace(/\\D/g, '')");
  });
});
