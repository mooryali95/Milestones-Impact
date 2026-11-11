import { describe, expect, it } from 'vitest';
import { checkImport, IMPORT_MAX, importCounts, importLimitIssue, parseImport } from '../../supabase/functions/leaders-api/import.js';

describe('استيراد المشاركين: القراءة', () => {
  it('لصق Excel بعلامة الجدولة، وسطر العناوين لا يُحسب', () => {
    const rows = parseImport('الاسم\tالبريد\tالجوال\tالمسمى\nسارة الأحمد\tSara@Example.sa\t0551234567\tمديرة مشاريع\nعمر علي\tomar@example.sa');
    expect(rows).toEqual([
      { line: 2, full_name: 'سارة الأحمد', email: 'Sara@Example.sa', phone: '0551234567', job_title: 'مديرة مشاريع' },
      { line: 3, full_name: 'عمر علي', email: 'omar@example.sa', phone: '', job_title: '' },
    ]);
  });
  it('CSV بفاصلة أو فاصلة منقوطة، وبأي ترتيب للأعمدة', () => {
    expect(parseImport('sara@example.sa,"سارة الأحمد",+966551234567')[0]).toMatchObject({ full_name: 'سارة الأحمد', email: 'sara@example.sa', phone: '+966551234567' });
    expect(parseImport('0551234567;عمر علي;omar@example.sa;مهندس')[0]).toMatchObject({ full_name: 'عمر علي', email: 'omar@example.sa', phone: '0551234567', job_title: 'مهندس' });
  });
  it('السطر الأول بلا بريد ولا جوال سطر عناوين يُهمل', () => { expect(parseImport('اسم فقط\n\n  ')).toEqual([]); });
  it('البريد المعيب أو الغائب لا يُسقط الصف: يبقى برقم سطره ويظهر ناقصًا', () => {
    const rows = parseImport('الاسم\tالبريد\nسارة الأحمد\tsara@example.sa\nخالد العتيبي\tkhaled@example\n\nمنى السالم\tmona@@example.sa\nعمر علي\t0551234567\nريم الحربي\treem.example.sa');
    expect(rows.map((r) => [r.line, r.full_name, r.email])).toEqual([
      [2, 'سارة الأحمد', 'sara@example.sa'], [3, 'خالد العتيبي', 'khaled@example'], [5, 'منى السالم', 'mona@@example.sa'],
      [6, 'عمر علي', ''], [7, 'ريم الحربي', ''],
    ]);
    const out = checkImport(rows);
    expect(out.map((r) => [r.line, r.status, r.reason || null])).toEqual([
      [2, 'ok', null], [3, 'invalid', 'البريد غير صحيح'], [5, 'invalid', 'البريد غير صحيح'], [6, 'invalid', 'البريد مطلوب'], [7, 'invalid', 'البريد مطلوب'],
    ]);
    expect(importCounts(out)).toEqual({ ok: 1, invalid: 4 });
  });
});

describe('استيراد المشاركين: التحقق', () => {
  it('يوحّد البريد ويصنّف الناقص والمكرر والمسجل', () => {
    const out = checkImport([
      { full_name: 'سارة الأحمد', email: ' Sara@Example.sa ' },
      { full_name: 'س', email: 'short@example.sa' },
      { full_name: 'بلا بريد صحيح', email: 'nope' },
      { full_name: 'سارة مكررة', email: 'sara@example.sa' },
      { full_name: 'مسجل قديم', email: 'old@example.sa' },
      { full_name: 'جوال خاطئ', email: 'p@example.sa', phone: '12' },
    ], new Set(['old@example.sa']));
    expect(out.map((r) => r.status)).toEqual(['ok', 'invalid', 'invalid', 'duplicate', 'exists', 'invalid']);
    expect(out[0].email).toBe('sara@example.sa');
    expect(importCounts(out)).toEqual({ ok: 1, invalid: 3, duplicate: 1, exists: 1 });
  });
  it('لا يتجاوز الحد', () => {
    const many = Array.from({ length: IMPORT_MAX + 20 }, (_, i) => ({ full_name: `مشارك ${i}`, email: `p${i}@example.sa` }));
    expect(checkImport(many)).toHaveLength(IMPORT_MAX);
  });
  it('فوق الحد رسالة واحدة توقف الإرسال، وعند الحد لا رسالة', () => {
    expect(importLimitIssue(IMPORT_MAX)).toBe('');
    expect(importLimitIssue(IMPORT_MAX + 20)).toBe(`في الجدول ${IMPORT_MAX + 20} صفًا، والحد ${IMPORT_MAX} صفًا في المرة الواحدة. قسّمه دفعات.`);
  });
  it('رقم السطر يعبر إلى الخادم ويعود، وما ليس رقمًا صحيحًا يُترك فارغًا', () => {
    const out = checkImport([{ line: 4, full_name: 'سارة الأحمد', email: 'sara@example.sa' }, { line: 'x', full_name: 'عمر علي', email: 'omar@example.sa' }]);
    expect(out.map((r) => r.line)).toEqual([4, null]);
  });
});
