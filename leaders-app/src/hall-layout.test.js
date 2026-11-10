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

// ── مؤقت الإجابة ──
import { answersClosed, answerSeconds, clock, secondsLeft, HALL_GRACE_MS } from '../../supabase/functions/leaders-api/logic.js';

describe('مؤقت القاعة', () => {
  const end = '2026-11-10T10:01:30.000Z', t = new Date(end).getTime();
  it('يعدّ إلى وقت الخادم ولا ينزل تحت الصفر، وبلا وقت نهاية لا مؤقت', () => {
    expect(secondsLeft(end, t - 90000)).toBe(90);
    expect(secondsLeft(end, t - 400)).toBe(1);
    expect(secondsLeft(end, t + 5000)).toBe(0);
    expect(secondsLeft(null, t)).toBeNull();
    expect(clock(90)).toBe('1:30');
    expect(clock(5)).toBe('0:05');
  });
  it('الإجابة تُقبل حتى مهلة بعد النهاية ثم تُقفل، وبلا مؤقت لا تُقفل', () => {
    expect(answersClosed(end, t + HALL_GRACE_MS - 1)).toBe(false);
    expect(answersClosed(end, t + HALL_GRACE_MS + 1)).toBe(true);
    expect(answersClosed(null, t)).toBe(false);
  });
  it('مدة الإجابة 90 افتراضًا ومحصورة بين 20 و600', () => {
    expect(answerSeconds(undefined)).toBe(90);
    expect(answerSeconds(5)).toBe(20);
    expect(answerSeconds(45)).toBe(45);
    expect(answerSeconds(9999)).toBe(600);
  });
  it('الحالة تحمل وقت النهاية في الجولة قبل الكشف وحدها، وساعة الخادم دائمًا', () => {
    const base = { id: 's', revealed: [], round: 1, version: 1, leader_id: null, persona_id: null, phase_ends_at: end };
    const sentence = { id: 'x', key: 'true', question: 'why', text_ar: 'جملة', tasks: {} };
    const args = { sentence, members: [], roles: {}, presence: [], answers: [], points: {}, viewer: { kind: 'participant', id: 'a' }, now: t - 1000 };
    const v = hallView({ ...args, session: { ...base, stage: 'round' } });
    expect(v.session.ends_at).toBe(end);
    expect(v.now).toBe(new Date(t - 1000).toISOString());
    expect(hallView({ ...args, session: { ...base, stage: 'reveal', revealed: ['x'] } }).session.ends_at).toBeNull();
    expect(hallView({ ...args, session: { ...base, stage: 'train' } }).session.ends_at).toBeNull();
  });
});

// ── الحضور بالمشاركة، وجلستك القادمة ──
import { hallAttendance } from '../../supabase/functions/leaders-api/logic.js';
import { nextSession, sessionIcs } from './screens/Journey.jsx';

describe('حضور القاعة بالمشاركة', () => {
  const ans = (p, ...ss) => ss.map((s) => ({ participant_id: p, sentence_id: s }));
  it('يحضر من أجاب عن 60% من الجولات المكشوفة، ولا تُحسب إجابة عن جملة لم تُكشف', () => {
    const r = hallAttendance(['s1', 's2', 's3', 's4', 's5'], [...ans('a', 's1', 's2', 's3'), ...ans('b', 's1', 's2'), ...ans('c', 's1', 's2', 's9', 's8'), ...ans('x', 's1', 's2', 's3', 's4')], ['a', 'b', 'c', 'd']);
    expect(r).toEqual({ rounds: 5, need: 3, eligible: ['a'] });
  });
  it('جولة واحدة مكشوفة تكفي إجابتها، وبلا جولة مكشوفة لا حضور من القاعة', () => {
    expect(hallAttendance(['s1'], ans('a', 's1'), ['a', 'b']).eligible).toEqual(['a']);
    expect(hallAttendance([], ans('a', 's1'), ['a'])).toEqual({ rounds: 0, need: 0, eligible: [] });
  });
});

describe('جلستك القادمة', () => {
  const now = Date.parse('2026-11-15T06:00:00Z');
  const s = (id, start, end, extra = {}) => ({ id, title: `جلسة ${id}`, starts_at: start, ends_at: end, mode: 'in_person', location: 'قاعة التدريب; الدور 3', attended: false, open: false, ...extra });
  const journey = [{ key: 'training', items: [{ kind: 'workshop', activity: { type: 'workshop', sessions: [
    s('old', '2026-11-10T06:00:00Z', '2026-11-10T10:00:00Z'), s('far', '2026-11-20T06:00:00Z', '2026-11-20T10:00:00Z'), s('near', '2026-11-16T06:00:00Z', '2026-11-16T10:00:00Z'),
  ] } }, { kind: 'reading' }] }];
  it('أقرب جلسة لم تنتهِ، ولا شيء حين تنتهي كلها أو لا ورشة', () => {
    expect(nextSession(journey, now).id).toBe('near');
    expect(nextSession(journey, Date.parse('2026-12-01T00:00:00Z'))).toBeNull();
    expect(nextSession([{ items: [{ kind: 'reading' }] }], now)).toBeNull();
  });
  it('ملف التقويم بتوقيت UTC وبحروفه الخاصة مهرّبة', () => {
    const ics = sessionIcs(nextSession(journey, now));
    expect(ics).toContain('DTSTART:20261116T060000Z');
    expect(ics).toContain('DTEND:20261116T100000Z');
    expect(ics).toContain(String.raw`LOCATION:قاعة التدريب\; الدور 3`);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
