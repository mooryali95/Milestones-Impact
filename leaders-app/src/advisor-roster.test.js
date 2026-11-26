// تصور المرحلة 1، البند 4: قائمة مشاركي الخبير تُرتَّب قبل القطع (من لديه عمل ينتظره أولًا ثم بالاسم)، وتحمل العدد
// الكلي وأنها قُطعت، فلا يسقط من القائمة من ينتظره عمل لأن اسمه آخر الأبجدية.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pickRoster, rosterLineAr, ROSTER_MAX } from '../../supabase/functions/leaders-api/peer.js';

const people = Array.from({ length: 61 }, (_, i) => ({ id: `p${i}`, full_name: `أ${String(i).padStart(2, '0')}` }));
people.push({ id: 'last', full_name: 'ياسر' });

describe('قائمة مشاركي الخبير', () => {
  it('62 مشاركًا ومن ينتظره عمل آخرهم أبجديًا: يظهر أولًا، والعدد الكلي والقطع', () => {
    const r = pickRoster(people, new Set(['last']));
    expect(ROSTER_MAX).toBe(60);
    expect(r.ids).toHaveLength(60);
    expect(r.ids[0]).toBe('last');
    expect(r.ids[1]).toBe('p0');
    expect(r.total).toBe(62);
    expect(r.truncated).toBe(true);
  });
  it('تحت الحد: الكل بالاسم بلا قطع', () => {
    const r = pickRoster(people.slice(0, 3).reverse(), new Set());
    expect(r).toEqual({ ids: ['p0', 'p1', 'p2'], total: 3, truncated: false });
  });
  it('سطر الواجهة', () => {
    expect(rosterLineAr({ total: 84, truncated: true })).toBe('تظهر 60 من 84، من لديهم عمل ينتظرك أولًا');
    expect(rosterLineAr({ total: 10, truncated: false })).toBe('');
  });
  it('المصدر: الخادم يرتب قبل القطع ويرجع total وtruncated، والواجهة تعرض السطر', () => {
    const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/file.ts'), 'utf8');
    const body = src.slice(src.indexOf('export async function participants('), src.indexOf('export async function raterConfirm'));
    expect(body).not.toMatch(/\.slice\(0, 60\)/);
    expect(body).toMatch(/pickRoster\(/);
    expect(body).toMatch(/total: roster\.total, truncated: roster\.truncated/);
    const ui = readFileSync(join(__dirname, 'screens/ExpertPortal.jsx'), 'utf8');
    expect(ui).toMatch(/rosterLineAr\(d\)/);
  });
});
