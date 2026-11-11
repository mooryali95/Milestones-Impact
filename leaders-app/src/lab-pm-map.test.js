// خريطة عمليات إدارة المشاريع في المختبر (التصور المعتمد 2026-11-11):
// المصدر الواحد للبطاقات، وتمهيد المرحلة صفر بالأنواع القائمة، وترحيلاتها المولّدة منها
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { gradeStep, nextIndex, practicePct, publicSpec, validateLab } from '../../supabase/functions/leaders-api/lab.js';
import { AREAS, GROUPS, PROCESSES, byId } from '../../scripts/lab/pm-data.mjs';
import { ITEMS as INTRO } from '../../scripts/lab/phase3.mjs';

const gen = (phase) => execFileSync('node', ['scripts/lab/build-items.mjs', phase], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// الإجابة الكاملة لخطوة من الأنواع القائمة
function perfect(st) {
  if (st.type === 'order') return st.answer;
  if (st.type === 'classify') return Object.fromEntries(st.items.map((x) => [x.id, x.bin]));
  if (st.type === 'match') return Object.fromEntries(st.left.map((x) => [x.id, x.match]));
  if (st.type === 'choice') return [...st.options].sort((a, b) => b.score - a.score)[0].id;
  return null;
}
const keysOf = (v, keys = new Set()) => {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, keys));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { keys.add(k); keysOf(x, keys); });
  return keys;
};

describe('بطاقات الخريطة: مصدر واحد مصحح عن العدة المطبوعة', () => {
  it('49 عملية في 10 مجالات و5 مجموعات، بتوزيع مفتاح الحل: 2 و24 و10 و12 و1', () => {
    expect(PROCESSES).toHaveLength(49);
    expect(AREAS.map((a) => a.n)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(GROUPS.map((g) => g.id)).toEqual(['init', 'plan', 'exec', 'mc', 'close']);
    const per = Object.fromEntries(GROUPS.map((g) => [g.id, PROCESSES.filter((p) => p.col === g.id).length]));
    expect(per).toEqual({ init: 2, plan: 24, exec: 10, mc: 12, close: 1 });
    expect(new Set(PROCESSES.map((p) => p.id)).size).toBe(49);
    // 30 خانة مشغولة و20 فارغة من 50، بعدّ مفتاح الحل (التصور قال 25 فارغة، والعدّ يصححه)
    expect(new Set(PROCESSES.map((p) => `${p.row}${p.col}`)).size).toBe(30);
    expect(PROCESSES.every((p) => p.note_ar)).toBe(true);
  });
  it('الرقم «س.ص» يكشف الصف، والأخطاء المطبوعة مصححة (4.9 و2.9 و3.5 و4.6 و5.4 و1.11)', () => {
    for (const p of PROCESSES) expect(Number(p.code.split('.')[1])).toBe(AREAS.find((a) => a.id === p.row).n);
    expect(byId['p9-4']).toMatchObject({ code: '4.9', label: 'تطوير فريق العمل', col: 'exec' });
    expect(byId['p9-2']).toMatchObject({ code: '2.9', label: 'تقدير موارد الأنشطة', col: 'plan' });
    expect(byId['p5-3'].label).toBe('تحديد النطاق');
    expect(byId['p6-4'].label).toBe('تقدير مدة الأنشطة');
    expect(byId['p4-5'].label).toBe('المتابعة والتحكم في عمل المشروع');
    expect(byId['p11-1'].label).toBe('وضع خطة إدارة المخاطر');
    const all = PROCESSES.map((p) => p.label).join(' ');
    for (const bad of ['لتحديد', 'مده', 'والتحكمفي']) expect(all).not.toContain(bad);
  });
  it('قائمة التصحيحات للمطبعة تذكر كل تصحيح', () => {
    const doc = readFileSync('docs/content/2026-11-11-تصحيحات-عدة-خريطة-العمليات-للطباعة-v1.md', 'utf8');
    for (const s of ['4.9', '2.9', 'لتحديد', 'مده', 'والتحكمفي', 'المخاطر', 'pm-data.mjs']) expect(doc).toContain(s);
  });
});

describe('المرحلة صفر: تمهيد الخريطة بالأنواع القائمة', () => {
  const it0 = INTRO[0];
  it('أداة واحدة لإطار المعلم في الباب الأول، بخطوات من الأنواع القائمة وحدها', () => {
    expect(INTRO).toHaveLength(1);
    expect(it0).toMatchObject({ key: 'pm-process-map-intro', kind: 'tool', dimension: 'milestone', chapter_key: 'ch1', min_level: 'beginner' });
    expect(it0.spec.steps.map((s) => s.type)).toEqual(['order', 'classify', 'match', 'choice', 'choice', 'choice']);
    const st = validateLab(it0.spec).steps;
    expect(st[1].items).toHaveLength(15);
    expect(st[2].left).toHaveLength(10);
    // الخلاصة تصف الخريطة بأمانة: الكلاسيكية من الإصدار السادس، لا المعيار الحالي
    expect(it0.spec.story_ar).toMatch(/الإصدار السادس/);
  });
  it('صالح، ولا يكشف حلوله، والإجابة الكاملة 100%', () => {
    const spec = validateLab(it0.spec);
    const keys = keysOf(publicSpec(spec));
    for (const k of ['answer', 'bin', 'match', 'score', 'why_ar', 'feedback_ar', 'note_ar', 'row', 'col']) expect(keys.has(k)).toBe(false);
    const results = {}; const path = [];
    for (let i = 0; i >= 0; i = nextIndex(spec, i, perfect(spec.steps[i]))) {
      const r = gradeStep(spec.steps[i], perfect(spec.steps[i]));
      expect(r.score).toBe(1);
      results[i] = r; path.push(i);
    }
    expect(practicePct(spec, results, path)).toBe(100);
  });
  it('الخلط بين «إدارة الجودة» و«ضبط الجودة» يعيد شرحه', () => {
    const st = validateLab(it0.spec).steps[1];
    const a = { ...perfect(st), 'p8-3': 'exec' };
    const r = gradeStep(st, a);
    expect(r.score).toBeCloseTo(14 / 15);
    expect(r.notes).toEqual([{ id: 'p8-3', note_ar: byId['p8-3'].note_ar }]);
  });
  it('الترحيل مطابق لما يولّده المحتوى، بوسم بوابة النشر وسطر السجل', () => {
    const sql = readFileSync('supabase/migrations/20261111120000_leaders_lab_pm_intro.sql', 'utf8');
    expect(sql).toBe(gen('phase3'));
    expect(sql.split('\n').slice(0, 15).join('\n')).toMatch(/^-- deploy-gate: tolerant /m);
    expect(sql).toContain("insert into leaders.schema_migrations (name) values ('20261111120000_leaders_lab_pm_intro') on conflict do nothing;");
    expect(sql).toContain('on conflict (key) do nothing;');
  });
  it('مولّد المرحلة الثانية بلا تغيير', () => {
    expect(readFileSync('supabase/migrations/20261030160000_leaders_lab_phase2.sql', 'utf8')).toBe(gen('phase2'));
  });
});
