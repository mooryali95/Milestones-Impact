// «يحتاج تدخلك» في لوحة الجهة: يُعدّ مما وصل اللوحة بحسب الصلاحيات، ولا يظهر بلا شيء
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { needsYou } from './screens/OrgPortal.jsx';
import { filterRows } from './coord.js';

const NOW = Date.parse('2026-11-10T08:00:00Z');
const day = (n) => new Date(NOW - n * 864e5).toISOString();
const base = {
  permissions: { list: true, activity: true },
  kpis: { seats_waiting: 2 },
  raters_pending: [{ id: 'r1' }],
  participants: [
    { status: 'registered', last_login_at: day(1) }, { status: 'profiled', last_login_at: day(2) }, { status: 'assessing', last_login_at: day(20) },
    { status: 'enrolled', last_login_at: day(15) }, { status: 'enrolled', last_login_at: day(3) }, { status: 'completed', last_login_at: day(40) },
  ],
};

describe('ما يحتاج تدخل المنسق', () => {
  it('يعدّ المقيّمين والمقاعد ومن لم يكمل القياس ومن توقف', () => {
    const by = Object.fromEntries(needsYou(base, NOW).map((x) => [x.key, x.n]));
    expect(by).toEqual({ raters: 1, seats: 2, baseline: 3, stale: 2 });
  });
  it('من أنهى البرنامج لا يُحسب متوقفًا، ولا يُحسب التوقف بلا صلاحية النشاط', () => {
    expect(needsYou({ ...base, permissions: { list: true, activity: false } }, NOW).some((x) => x.key === 'stale')).toBe(false);
  });
  it('صلاحية الأرقام المجمّعة: لا عدّ من الصفوف الفردية', () => {
    expect(needsYou({ ...base, permissions: { list: false, activity: true }, participants: base.participants }, NOW).map((x) => x.key)).toEqual(['raters', 'seats']);
  });
  // org-7: كان كل عنصر نصًا يطلب من المنسق ضبط المرشّح بنفسه، وتلميح المقيّمين يقول «أسفل» والبطاقة أعلاه
  it('كل عنصر يُعرض بنقرة: المرشّح الذي يحصرهم بالعدد نفسه، أو بطاقة المقيّمين أعلاه', () => {
    const items = Object.fromEntries(needsYou(base, NOW).map((x) => [x.key, x]));
    for (const k of ['baseline', 'stale']) {
      expect(items[k].show?.stage).toBeTruthy();
      expect(filterRows(base.participants, { stage: items[k].show.stage }, NOW)).toHaveLength(items[k].n);
    }
    expect(items.raters.show).toEqual({ to: 'ra-h' });
    expect(items.raters.hint).toContain('أعلى');
    const src = readFileSync('leaders-app/src/screens/OrgPortal.jsx', 'utf8');
    expect(src).toContain('onShow(x.show)');
    expect(src).toContain('id="op-people-h"');
  });
  it('لا شيء ينتظر: القسم لا يظهر', () => {
    expect(needsYou({ permissions: { list: true }, kpis: {}, raters_pending: [], participants: [{ status: 'enrolled' }] }, NOW)).toEqual([]);
  });
  it('نص الشارة الصغير بدرجة تبلغ تباين 4.5 إلى 1', () => {
    const css = readFileSync('leaders-app/src/styles.css', 'utf8');
    expect(css).toContain('.chip.warn { background: var(--st-warn-bg); color: var(--st-warn-text); }');
    expect(css).toContain('.chip.ok { background: var(--st-ok-bg); color: var(--st-ok-text); }');
  });
});
