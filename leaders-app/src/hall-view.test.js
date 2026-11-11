// منظور القاعة بخمسين ومئة مشارك: المقاعد لا تتراكب ولا تخرج عن الأرضية، والجوال يعرض الفرق قائمة مقروءة
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hallLayout, seatRadius } from '../../shared/hall/HallView.jsx';

const TEAMS = ['support', 'lead', 'guide', 'eval'];
// القيادة أصغر الفرق كما في splitTeams: ثُمن الحضور
const people = (n, { joined = true, teams = true } = {}) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, name: `م${i}`, joined, present: joined, team: teams ? (i % 8 === 0 ? 'lead' : TEAMS[[0, 2, 3][i % 3]]) : null,
}));
const overlaps = (pos, slack = 0) => {
  const list = Object.values(pos); let n = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < (list[i].r + list[j].r) * (1 - slack)) n += 1;
  }
  return n;
};
const inside = (pos) => Object.values(pos).every((p) => p.x - p.r >= 0 && p.x + p.r <= 1600 && p.y - p.r >= 262 && p.y + p.r <= 900);

describe('منظور القاعة يتسع للدفعة كلها', () => {
  for (const n of [12, 50, 100]) {
    it(`${n} مشاركًا على الطاولات: لا دائرتان تتراكبان، والكل داخل الأرضية`, () => {
      const pos = hallLayout(people(n), 'round');
      expect(Object.keys(pos)).toHaveLength(n);
      expect(overlaps(pos)).toBe(0);
      expect(inside(pos)).toBe(true);
    });
    it(`${n} مشاركًا أمام المنصة (الدخول والتدريب): صفوف داخل الأرضية بلا تراكب`, () => {
      for (const stage of ['enter', 'train']) {
        const pos = hallLayout(people(n, { teams: false }), stage);
        expect(overlaps(pos)).toBe(0);
        expect(inside(pos)).toBe(true);
      }
    });
  }

  it('من لم يدخل بعد عند الباب لا في مكان واحد، ومن بلا فريق على حافة الأرضية لا فوق الطاولات', () => {
    const waiting = hallLayout(people(50, { joined: false, teams: false }), 'enter');
    expect(new Set(Object.values(waiting).map((p) => `${p.x},${p.y}`)).size).toBe(50);
    const loose = people(50).map((p, i) => (i < 3 ? { ...p, team: null } : p));
    const pos = hallLayout(loose, 'round');
    for (const p of loose.slice(0, 3)) expect(pos[p.id].y).toBeGreaterThan(800);
    expect(overlaps(pos)).toBe(0);
  });

  it('نصف قطر المقعد يصغر مع العدد ولا ينزل عن المقروء', () => {
    expect(seatRadius(9, 184, 88)).toBe(22);
    expect(seatRadius(30, 184, 88)).toBeLessThan(22);
    expect(seatRadius(200, 184, 88)).toBe(11);
  });

  it('تطبيق المشارك يعرض الفرق قائمة لا الساحة المصغّرة، وشريط التوزيع بأسماء الخانات', () => {
    const hall = readFileSync('leaders-app/src/screens/Hall.jsx', 'utf8');
    expect(hall).toContain('<HallTeams view={v} me={v.me} />');
    expect(hall).not.toMatch(/<HallView /);
    expect(readFileSync('shared/hall/HallView.jsx', 'utf8')).toContain('{OPT_AR[k]} <tspan');
  });

  it('إخفاق عابر في سؤال الحالة الدوري لا يُعرض خطأً: يُعرض حين يتوالى، ويزول عند أول نجاح', () => {
    const hall = readFileSync('leaders-app/src/screens/Hall.jsx', 'utf8');
    expect(hall).toContain('if (force || fails.current >= POLL_FAIL_LIMIT)');
    expect(hall).toContain("fails.current = 0; setPollErr('');");
    expect(readFileSync('shared/hall/HallControl.jsx', 'utf8')).toContain('if (force || fails.current === POLL_FAIL_LIMIT) toast(r.message, true)');
    expect(readFileSync('scripts/integration/hall-load.mjs', 'utf8')).toContain('ok(worst < POLL_FAIL_LIMIT');
  });
});
