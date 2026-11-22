import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupWorkshopReqs, journeyHref } from './attendance-groups.js';

const programs = [{ id: 'p1', name: 'سفارات' }, { id: 'p2', name: 'رواد' }];
const archived_programs = [{ id: 'old', name: 'دفعة 2025' }];
const requirements = [
  { id: 'r1', program_id: 'p2', kind: 'workshop', active: true },
  { id: 'r2', program_id: 'p1', kind: 'workshop', active: true },
  { id: 'r3', program_id: 'p1', kind: 'workshop', active: false },
  { id: 'r4', program_id: 'old', kind: 'workshop', active: true },
  { id: 'r5', program_id: 'p1', kind: 'coaching', active: true },
];
const workshops = [{ requirement_id: 'r2' }, { requirement_id: 'r2' }];

describe('بطاقات الحضور مجمعة حسب البرنامج من مصدر واحد', () => {
  it('البرامج الحية بترتيبها، والموقوف والمؤرشف مخفيان، وغير الجلسات خارجها', () => {
    const { groups, hidden } = groupWorkshopReqs({ requirements, programs, archived_programs, workshops });
    expect(groups.map((g) => [g.program_id, g.reqs.map((r) => r.id)])).toEqual([['p1', ['r2']], ['p2', ['r1']]]);
    expect(hidden).toBe(2);
    expect(groups[0].reqs[0].sessions).toBe(2);
  });
  it('«أظهر المؤرشف والموقوف» يعيدهما، والمؤرشف آخرًا بوسمه', () => {
    const { groups } = groupWorkshopReqs({ requirements, programs, archived_programs, workshops }, { showHidden: true });
    expect(groups.map((g) => g.program_id)).toEqual(['p1', 'p2', 'old']);
    expect(groups[2]).toMatchObject({ archived: true, name: 'دفعة 2025' });
    expect(groups[0].reqs.find((r) => r.id === 'r3').off).toBe(true);
  });
  it('حمولة بلا قائمة برامج لا تخفي شيئًا', () => {
    const { groups, hidden } = groupWorkshopReqs({ requirements: [requirements[0]] });
    expect(hidden).toBe(0);
    expect(groups[0].reqs.map((r) => r.id)).toEqual(['r1']);
  });
  it('كل متطلب يظهر مرة واحدة فقط', () => {
    const { groups } = groupWorkshopReqs({ requirements, programs, archived_programs, workshops }, { showHidden: true });
    const ids = groups.flatMap((g) => g.reqs.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('«+ متطلب حضور» ينقل إلى محرر الرحلة ولا ينشئ متطلبًا من شاشة الحضور', () => {
    expect(journeyHref('p 1', 'add=workshop')).toBe('#/leaders/journey/p%201?add=workshop');
    const src = readFileSync('admin-app/src/screens/Activities.jsx', 'utf8');
    expect(src).not.toMatch(/entity: 'stage_requirements'/);
    expect(src).toContain("journeyHref(pid, 'add=workshop')");
    const j = readFileSync('admin-app/src/screens/Methodology.jsx', 'utf8');
    expect(j).toContain("newReq(first.key, 'workshop')");
  });
});
