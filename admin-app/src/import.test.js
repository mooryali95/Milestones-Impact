import { describe, expect, it } from 'vitest';
import { checkImport, IMPORT_MAX, importCounts, parseImport } from '../../supabase/functions/leaders-api/import.js';

describe('استيراد المشاركين: القراءة', () => {
  it('لصق Excel بعلامة الجدولة، وسطر العناوين لا يُحسب', () => {
    const rows = parseImport('الاسم\tالبريد\tالجوال\tالمسمى\nسارة الأحمد\tSara@Example.sa\t0551234567\tمديرة مشاريع\nعمر علي\tomar@example.sa');
    expect(rows).toEqual([
      { full_name: 'سارة الأحمد', email: 'Sara@Example.sa', phone: '0551234567', job_title: 'مديرة مشاريع' },
      { full_name: 'عمر علي', email: 'omar@example.sa', phone: '', job_title: '' },
    ]);
  });
  it('CSV بفاصلة أو فاصلة منقوطة، وبأي ترتيب للأعمدة', () => {
    expect(parseImport('sara@example.sa,"سارة الأحمد",+966551234567')[0]).toMatchObject({ full_name: 'سارة الأحمد', email: 'sara@example.sa', phone: '+966551234567' });
    expect(parseImport('0551234567;عمر علي;omar@example.sa;مهندس')[0]).toMatchObject({ full_name: 'عمر علي', email: 'omar@example.sa', phone: '0551234567', job_title: 'مهندس' });
  });
  it('سطر بلا بريد يُهمل', () => { expect(parseImport('اسم فقط\n\n  ')).toEqual([]); });
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
});
