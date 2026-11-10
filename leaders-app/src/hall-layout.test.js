// منظور القاعة يتسع للعدد: خمسون مشاركًا يظهرون جميعًا بلا تراكب وداخل الإطار في كل مرحلة
import { describe, expect, it } from 'vitest';
import { DOOR_MAX, layout } from '../../shared/hall/HallView.jsx';
import { splitTeams } from '../../supabase/functions/leaders-api/logic.js';

const R = 22;
const lv = (l) => ({ milestone: l, impact: l, leadership: l });
const crowd = (n, joined = () => true) => Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, name: `م${i}`, joined: joined(i), team: null, levels: lv(['beginner', 'intermediate', 'advanced'][i % 3]) }));
const minGap = (pts) => { let m = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)); return m; };
const inside = (p) => p.x - R >= 0 && p.x + R <= 1600 && p.y - R >= 250 && p.y + R <= 880;

describe('منظور القاعة عند خمسين', () => {
  for (const n of [12, 30, 50, 80]) {
    it(`التدريب: ${n} يقفون جميعًا داخل الأرضية بلا تراكب`, () => {
      const pts = Object.values(layout(crowd(n), 'train'));
      expect(pts.filter(Boolean)).toHaveLength(n);
      expect(pts.every(inside)).toBe(true);
      expect(minGap(pts)).toBeGreaterThanOrEqual(2 * R);
    });
  }

  it('الدخول: من دخل يقف في القاعة، ومن لم يدخل عند الباب حتى حدّه والباقي يُعدّ ولا يُرسم', () => {
    const people = crowd(50, (i) => i < 30);
    const pos = layout(people, 'enter');
    const drawn = Object.values(pos).filter(Boolean);
    expect(drawn).toHaveLength(30 + DOOR_MAX);
    expect(drawn.every(inside)).toBe(true);
    expect(minGap(drawn)).toBeGreaterThanOrEqual(2 * R);
  });

  it('الطاولات: خمسون على الفرق الأربعة بلا تراكب وداخل الأرضية', () => {
    const people = crowd(50);
    const roles = splitTeams(people, 'mixed');
    people.forEach((p) => { p.team = roles[p.id]; });
    const pts = Object.values(layout(people, 'round'));
    expect(pts).toHaveLength(50);
    expect(pts.every(inside)).toBe(true);
    expect(minGap(pts)).toBeGreaterThanOrEqual(2 * R);
  });
});

// ── الطاولات المرقّمة داخل الفرق ──
import { assignTables, hallView, publicView, HALL_TABLE_MAX } from '../../supabase/functions/leaders-api/logic.js';

describe('طاولات القاعة', () => {
  const people = crowd(50);
  const roles = splitTeams(people, 'mixed');
  const sizes = (seat) => { const m = {}; Object.values(seat).forEach((no) => { m[no] = (m[no] || 0) + 1; }); return m; };

  it('خمسون: كل طاولة من خمسة إلى سبعة، وكلها من فريق واحد، وأرقامها متتالية من 1', () => {
    const seat = assignTables(roles);
    expect(Object.keys(seat)).toHaveLength(50);
    const n = sizes(seat);
    expect(Object.keys(n).map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: Object.keys(n).length }, (_, i) => i + 1));
    expect(Math.min(...Object.values(n))).toBeGreaterThanOrEqual(5);
    expect(Math.max(...Object.values(n))).toBeLessThanOrEqual(HALL_TABLE_MAX);
    for (const no of Object.keys(n)) expect(new Set(Object.keys(seat).filter((id) => seat[id] === Number(no)).map((id) => roles[id])).size).toBe(1);
  });

  it('المحفوظ يثبت، والمتأخر يُلحق بأصغر طاولات فريقه، ومن نُقل فريقه يترك طاولته', () => {
    const seat = assignTables(roles);
    expect(assignTables(roles, seat)).toEqual(seat);
    const late = { ...roles, zz: 'guide' };
    const after = assignTables(late, seat);
    Object.keys(seat).forEach((id) => expect(after[id]).toBe(seat[id]));
    const guideTables = [...new Set(Object.keys(seat).filter((id) => roles[id] === 'guide').map((id) => seat[id]))];
    expect(guideTables).toContain(after.zz);
    expect(sizes(seat)[after.zz]).toBe(Math.min(...guideTables.map((no) => sizes(seat)[no])));
    const mover = Object.keys(roles).find((id) => roles[id] === 'support');
    const moved = assignTables({ ...roles, [mover]: 'eval' }, seat);
    expect([...new Set(Object.keys(seat).filter((id) => roles[id] === 'eval').map((id) => seat[id]))]).toContain(moved[mover]);
  });

  it('المتأخر يأخذ مقعدًا ثامنًا في أصغر طاولة، وبعده تُفتح طاولة جديدة برقم تالٍ', () => {
    const r = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`a${i}`, 'lead']));
    const seat = assignTables(r);
    expect(new Set(Object.values(seat)).size).toBe(1);
    const eight = assignTables({ ...r, a7: 'lead' }, seat);
    expect(eight.a7).toBe(1);
    expect(assignTables({ ...r, a7: 'lead', a8: 'lead' }, eight).a8).toBe(2);
  });

  it('المنظور: خمسون على طاولاتهم المرقّمة بلا تراكب وداخل الأرضية، والحالة تحمل الطاولات', () => {
    const session = { id: 's', stage: 'round', revealed: [], round: 1, version: 1, leader_id: null, persona_id: null };
    const presence = people.map((p) => ({ participant_id: p.id, last_seen: new Date().toISOString(), hand: false }));
    const v = hallView({ session, sentence: null, members: people.map((p) => ({ id: p.id, name: p.name })), roles, presence, answers: [], points: {}, viewer: { kind: 'admin' } });
    expect(v.tables.length).toBeGreaterThanOrEqual(8);
    expect(v.people.every((p) => p.table)).toBe(true);
    const pts = Object.values(layout(v.people, 'round'));
    expect(pts).toHaveLength(50);
    expect(pts.every(inside)).toBe(true);
    expect(minGap(pts)).toBeGreaterThanOrEqual(2 * R);
  });

  it('شاشة العرض لا تحمل أحكام الأفراد ولا توزيعها ولا ملاحظاتهم قبل الكشف، وتحملها بعده', () => {
    const v = { revealed: false, distribution: { true1: 3 }, people: [{ id: 'a', name: 'أ', choice: 'true', confidence: 3, stances: ['idea'], note: 'سر', answered: true }] };
    const pub = publicView(v);
    expect(pub.distribution).toBeNull();
    expect(pub.people[0]).toMatchObject({ choice: null, confidence: null, stances: [], answered: true });
    expect('note' in pub.people[0]).toBe(false);
    expect(v.people[0].choice).toBe('true');
    expect(publicView({ ...v, revealed: true })).toMatchObject({ distribution: { true1: 3 } });
  });
});
