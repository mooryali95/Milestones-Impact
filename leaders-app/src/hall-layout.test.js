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
