// تصدير مبادرات الدفعة، المرحلة 1 (تصور 2026-11-27 باعتماد المالك): المعتمد وحده، بلا بيانات تواصل الراعي ولا المشارك،
// ومنسق الجهة لجهته وحدها، والجدول المصاحب XLSX من الصفوف نفسها، والتقسيم التلقائي للدفعات الكبيرة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COHORT_EXPORT_COLUMNS, COHORT_EXPORT_VOLUME, exportRows, sheetColumns, volumesOf, withoutContact } from '../../supabase/functions/leaders-api/cohort-export.js';
import { LEADERS_ADMIN_LOGGED_READS, NO_REPLAY } from '../../supabase/functions/_shared/action-kinds.js';

const people = [
  { id: 'p1', full_name: 'سارة', organization_id: 'o1', organization_name: 'هيئة أ', email: 's@a.sa', phone: '+966500000000' },
  { id: 'p2', full_name: 'أحمد', organization_id: 'o2', organization_name: 'هيئة ب', email: 'a@b.sa' },
  { id: 'p3', full_name: 'ريم', organization_id: 'o1', organization_name: 'هيئة أ' },
];
const capstones = [
  { participant_id: 'p1', status: 'approved', readiness: 92, score: 4.5, approved_at: '2026-11-20T08:00:00Z', sponsor_name: 'د. خالد', sponsor_email: 'k@a.sa' },
  { participant_id: 'p2', status: 'approved', readiness: 80, score: 4, approved_at: '2026-11-21T08:00:00Z', sponsor_name: 'منى' },
  { participant_id: 'p3', status: 'submitted', readiness: 70 },
];
const charters = [
  { participant_id: 'p1', answers: { title: 'تسريع الخدمة', sponsor: 'د. خالد', sponsor_email: 'k@a.sa', sponsor_phone: '0500' } },
  { participant_id: 'p2', answers: { title: ' رقمنة الأرشيف ' } },
];

describe('تصدير مبادرات الدفعة: الصفوف', () => {
  it('المعتمد وحده، مرتبًا بالاسم، بعنوان المبادرة واسم الراعي', () => {
    const rows = exportRows({ people, capstones, charters });
    expect(rows.map((r) => r.participant_id)).toEqual(['p2', 'p1']);
    expect(rows[1]).toMatchObject({ full_name: 'سارة', organization: 'هيئة أ', initiative: 'تسريع الخدمة', sponsor: 'د. خالد', readiness: 92, score: 4.5, approved_at: '2026-11-20' });
    expect(rows[0].initiative).toBe('رقمنة الأرشيف');
  });
  it('لا بريد ولا هاتف في أي صف (الراعي ولا المشارك)', () => {
    const text = JSON.stringify(exportRows({ people, capstones, charters }));
    expect(text).not.toMatch(/@|\+966|0500|email|phone/);
  });
  it('منسق الجهة: صفوف جهته وحدها', () => {
    expect(exportRows({ people, capstones, charters, orgId: 'o1' }).map((r) => r.participant_id)).toEqual(['p1']);
    expect(exportRows({ people, capstones, charters, orgId: 'o9' })).toEqual([]);
  });
  it('withoutContact يحذف مفاتيح التواصل بعمق', () => {
    expect(withoutContact({ a: 1, sponsor_email: 'x', n: { phone: '1', mobile: '2', keep: 'y' }, l: [{ email: 'e', t: 't' }] }))
      .toEqual({ a: 1, n: { keep: 'y' }, l: [{ t: 't' }] });
  });
});

describe('الجدول والتقسيم', () => {
  it('sheetColumns: الأعمدة نفسها بقارئ لكل منها، والترقيم المتصل', () => {
    const rows = exportRows({ people, capstones, charters });
    const cols = sheetColumns(rows);
    expect(cols.map(({ key, label }) => ({ key, label }))).toEqual(COHORT_EXPORT_COLUMNS);
    expect(rows.map((r) => cols[0].get(r))).toEqual([1, 2]);
    expect(cols.find((c) => c.key === 'initiative').get(rows[1])).toBe('تسريع الخدمة');
  });
  it('التقسيم التلقائي: مجلدات لا تتجاوز الحد، بترقيم متصل', () => {
    const many = Array.from({ length: COHORT_EXPORT_VOLUME * 2 + 3 }, (_, i) => ({ participant_id: `p${i}` }));
    const v = volumesOf(many);
    expect(v).toHaveLength(3);
    expect(v.map((x) => x.count)).toEqual([COHORT_EXPORT_VOLUME, COHORT_EXPORT_VOLUME, 3]);
    expect(v[2]).toMatchObject({ n: 3, from: COHORT_EXPORT_VOLUME * 2 + 1, to: COHORT_EXPORT_VOLUME * 2 + 3 });
    expect(volumesOf([])).toEqual([]);
  });
});

describe('تسجيل الفعل في العقد', () => {
  const index = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/index.ts'), 'utf8');
  it('admin.cohort-export اطلاع مسجَّل لكل أدوار اللوحة، وcoord.cohort-export لا يُعاد تلقائيًا', () => {
    expect(LEADERS_ADMIN_LOGGED_READS.has('admin.cohort-export')).toBe(true);
    expect(NO_REPLAY.has('coord.cohort-export')).toBe(true);
    expect(index).toMatch(/'admin\.cohort-export': \(a, b\) => CX\.adminExport\(a, b\)/);
    expect(index).toMatch(/'coord\.cohort-export': \(c, b\) => CX\.coordExport\(c, b\)/);
  });
});
