// المرحلة 1 من تصور ملف المشارك: قائمة الوثائق وملف كل مشارك يقرآن الحالة نفسها، فأعداد القائمة = مجموع ما تقوله الملفات
import { describe, expect, it } from 'vitest';
import { capstoneListRows, capstoneState } from '../../supabase/functions/leaders-api/capstone.js';
import { isChapter, tabBadges } from './screens/PersonShell.jsx';

const P = (name) => ({ full_name: name, is_demo: false });
// بيانات واحدة: صفوف capstones، ومن بدأ بطاقته (تسليم البطاقة)، والجاهزية الحية من build لما قيد البناء
const fixture = {
  capstones: [
    { participant_id: 'a', status: 'submitted', readiness: 86, participants: P('أ') },
    { participant_id: 'b', status: 'returned', readiness: 82, participants: P('ب') },
    { participant_id: 'c', status: 'approved', readiness: 95, participants: P('ج') },
    { participant_id: 'd', status: 'draft', readiness: null, participants: P('د') },
  ],
  started: [
    { participant_id: 'a', participants: P('أ') },     // له صف: لا يتكرر
    { participant_id: 'e', participants: P('هـ') },    // بدأ بطاقته ولا صف له: مسودة
    { participant_id: 'f', participants: P('و') },
  ],
  live: { b: 64, d: 40, e: 12, f: null },
};
// ما يقرؤه ملف كل مشارك (admin.capstone): صفه إن وُجد، وجاهزيته الحية
const fileOf = (id) => capstoneState(fixture.capstones.find((r) => r.participant_id === id) || null, fixture.live[id] ?? null);
const tally = (xs) => xs.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});

describe('قائمة الوثائق = ملفات المشاركين', () => {
  const rows = capstoneListRows(fixture);
  it('كل من بدأ بطاقته يظهر مرة واحدة', () => {
    expect(rows.map((r) => r.participant_id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('عدد كل حالة في القائمة = عددها في الملفات', () => {
    expect(tally(rows)).toEqual(tally(rows.map((r) => fileOf(r.participant_id))));
    expect(tally(rows)).toEqual({ submitted: 1, returned: 1, approved: 1, draft: 3 });
  });
  it('الجاهزية واحدة: حية لما قيد البناء، ومحفوظة لما سُلّم', () => {
    for (const r of rows) expect(r.readiness).toBe(fileOf(r.participant_id).readiness);
    expect(rows.find((r) => r.participant_id === 'b').readiness).toBe(64);
    expect(rows.find((r) => r.participant_id === 'a').readiness).toBe(86);
  });
  it('مرشح الحالة لا يغيّر العدّ', () => {
    expect(capstoneListRows({ ...fixture, status: 'draft' })).toHaveLength(3);
    expect(capstoneListRows({ ...fixture, status: 'submitted' })).toHaveLength(1);
  });
  it('الوثيقة المسلَّمة في القائمة = شارة «المبادرة» في ملفات المشاركين', () => {
    const inList = rows.filter((r) => r.status === 'submitted').length;
    const inFiles = rows.reduce((n, r) => n + (tabBadges({ capstone: fileOf(r.participant_id) }).initiative || 0), 0);
    expect(inFiles).toBe(inList);
  });
});

describe('الفصول في «المبادرة» وحدها', () => {
  const models = [
    { status: 'submitted', learning_models: { key: 'm1', capstone_sort: null } },
    { status: 'submitted', learning_models: { key: 'initiative_charter', capstone_sort: 1 } },
    { status: 'submitted', learning_models: { key: 'c2', capstone_sort: 2 } },
    { status: 'draft', learning_models: { key: 'c3', capstone_sort: 3 } },
  ];
  it('شارة «التعلم» بلا الفصول، و«المبادرة» الفصول المسلَّمة والوثيقة', () => {
    const b = tabBadges({ models, capstone: { status: 'submitted' } });
    expect(b.learning).toBe(1);
    expect(b.initiative).toBe(3);
    expect(models.filter(isChapter)).toHaveLength(3);
  });
});
