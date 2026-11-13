import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chosenColumns, rowsFor, subtitleFor, tableOf, whichOptions } from './exports.js';

const cols = [
  { key: 'name', label: 'الاسم', width: 26, get: (r) => r.name },
  { key: 'n', label: 'العدد', get: (r) => r.n },
  { key: 'tags', label: 'الوسوم', get: (r) => r.tags },
  { key: 'ok', label: 'معتمد', get: (r) => r.ok },
];
const all = [{ name: 'سارة', n: 3, tags: ['أ', 'ب'], ok: true }, { name: 'خالد', n: 0, tags: [], ok: false }, { name: 'منى', n: null }];

describe('التصدير الموحد', () => {
  it('الخيارات: «المحدد» إن حُدّد شيء، و«الكل» منفصلًا إن كانت القائمة مفلترة', () => {
    expect(whichOptions({ all, filtered: all }).map((o) => [o.key, o.label, o.n])).toEqual([['filtered', 'الكل', 3]]);
    expect(whichOptions({ all, filtered: all.slice(0, 2), selected: [all[0]] }).map((o) => [o.key, o.n])).toEqual([['selected', 1], ['filtered', 2], ['all', 3]]);
  });
  it('الصفوف بحسب الاختيار، والسطر في الترويسة يقول ماذا في الملف', () => {
    const sets = { all, filtered: all.slice(0, 2), selected: [all[2]] };
    expect([rowsFor('selected', sets).length, rowsFor('filtered', sets).length, rowsFor('all', sets).length]).toEqual([1, 2, 3]);
    expect(subtitleFor('selected', 1, 3, 'مشارك')).toBe('1 مشارك محدد من 3');
    expect(subtitleFor('filtered', 2, 3)).toBe('2 من 3 حسب الفلاتر');
    expect(subtitleFor('all', 3, 3)).toBe('كل السجلات (3)');
  });
  it('الأعمدة المختارة بترتيب تعريفها، وبلا اختيار صالح: الكل', () => {
    expect(chosenColumns(cols, ['n', 'name']).map((c) => c.key)).toEqual(['name', 'n']);
    expect(chosenColumns(cols, null)).toBe(cols);
    expect(chosenColumns(cols, ['gone']).length).toBe(4);
  });
  it('الخلايا: الرقم رقم، والفارغ نص فارغ، والقائمة مفصولة، والمنطقي «نعم»', () => {
    const { head, body } = tableOf(all, cols);
    expect(head[0]).toEqual({ label: 'الاسم', width: 26 });
    expect(head[1].width).toBe(18);
    expect(body).toEqual([['سارة', 3, 'أ، ب', 'نعم'], ['خالد', 0, '', ''], ['منى', '', '', '']]);
  });
  it('لا صيغة تصدير أخرى في اللوحة: لا CSV، ولا استدعاء مباشر لـ exportWorkbook خارج الزر الموحد', () => {
    const files = [];
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.jsx?$/.test(e.name) && !/\.test\.js$/.test(e.name)) files.push(join(dir, e.name));
    });
    walk(__dirname);
    const bad = files.filter((f) => !/ExportButton\.jsx$/.test(f) && /exportWorkbook\(|csvText|csvBlob|new Blob\(/.test(readFileSync(f, 'utf8')));
    expect(bad.map((f) => f.replace(__dirname, ''))).toEqual([]);
  });
});

describe('حالات الفراغ في اللوحة', () => {
  it('لا رسالة فراغ مرتجلة في شاشة: المكوّن الموحد Empty أو NoMatch وحدهما، ولا عنوان إنجليزي فوق الصفحات', () => {
    const dir = join(__dirname, 'screens');
    const bad = readdirSync(dir).filter((f) => /\.jsx$/.test(f)).filter((f) => {
      const s = readFileSync(join(dir, f), 'utf8');
      return /className="la-empty"|className="empty-state"|ce-empty"/.test(s) || /className="page-eyebrow">[A-Za-z]/.test(s);
    });
    expect(bad).toEqual([]);
  });
});
