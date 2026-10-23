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
