// الترحيل المطبّق لا يتغير: بصمات كل ما طُبّق على الإنتاج في scripts/db/applied-manifest.json (البذرة سجل 9 نوفمبر 2026).
// بوابة النشر تقارن الأسماء وحدها، فملف مطبّق عُدّل أو أعيد توليده لا يصل الإنتاج ويفترق المستودع عنه بلا إشارة.
// ويجمّد هذا مصادر المولّدات بالتبعية: v5 وv5.1 وv5.2 وedits-v5_2.mjs، لأن المولّد يطابق ترحيله المودع في CI.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addApplied, drift, readManifest } from '../../scripts/db/applied-manifest.mjs';

const root = join(__dirname, '../..');
const m = readManifest();

describe('الترحيلات المطبّقة مجمّدة ببصماتها', () => {
  it('كل ترحيل مطبّق باقٍ ببايتاته كما طُبّق', () => {
    expect(drift(m)).toEqual([]);
  });
  it('البذرة كل سجل 9 نوفمبر 2026 (92 ترحيلًا) ومنها ترحيلات القياس v5 الأربعة، ببصمات sha256 مرتبة', () => {
    const names = Object.keys(m.migrations);
    expect(m.as_of).toBe('2026-11-09');
    expect(names.length).toBeGreaterThanOrEqual(92);
    for (const n of ['20261102100000_leaders_instruments_v5', '20261102100100_leaders_activate_v5', '20261105150000_leaders_v5_1_pre_activation', '20261107190000_leaders_v5_2_balance']) expect(names).toContain(n);
    expect(Object.values(m.migrations).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    expect(names).toEqual([...names].sort());
  });
  it('الترحيل الجديد خارج البيان حتى يُطبَّق، والإضافة باسم صريح ولا تغيّر بصمة قائمة', () => {
    const hash = (n) => ({ a: 'h1', b: 'h2' })[n] ?? null;
    const base = { as_of: 'x', migrations: { a: 'h1' } };
    expect(addApplied(base, ['b'], hash).migrations).toEqual({ a: 'h1', b: 'h2' });
    expect(() => addApplied({ migrations: { a: 'old' } }, ['a'], hash)).toThrow(/لا يُعدَّل/);
    expect(() => addApplied(base, ['zz'], hash)).toThrow(/لا ملف/);
    expect(drift({ migrations: { a: 'old', zz: 'h' } }, hash)).toHaveLength(2);
    // لا وضع يجمع المجلد كله: الملف الجديد لا يدخل البيان إلا باسمه بعد تطبيقه
    expect(readFileSync(join(root, 'scripts/db/applied-manifest.mjs'), 'utf8')).not.toMatch(/readdirSync/);
  });
});
