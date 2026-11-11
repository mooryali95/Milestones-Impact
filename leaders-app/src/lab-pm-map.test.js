// خريطة عمليات إدارة المشاريع في المختبر (التصور المعتمد 2026-11-11):
// المصدر الواحد للبطاقات، وتمهيد المرحلة صفر بالأنواع القائمة، وترحيلاتها المولّدة منها
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { gradeStep, labLevelOf, MASTERY, nextIndex, practicePct, publicSpec, validateLab } from '../../supabase/functions/leaders-api/lab.js';
import { AREAS, GROUPS, PROCESSES, byId } from '../../scripts/lab/pm-data.mjs';
import { ITEMS as INTRO } from '../../scripts/lab/phase3.mjs';
import { ITEMS as MAP_ITEMS } from '../../scripts/lab/pm-map.mjs';

const BOARD_ITEM = MAP_ITEMS[0];

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

// ── المرحلة الأولى: نوع الخطوة board ──
const MAP = validateLab(BOARD_ITEM.spec);
const boardOf = (id) => MAP.steps.find((s) => s.id === id);
const fullAnswer = (st) => Object.fromEntries(st.cards.map((c) => [c.id, [c.row, c.col]]));

describe('اللوحة: التحقق من المواصفة', () => {
  const base = { type: 'board', prompt_ar: 'ضع', rows: [{ id: 'r1', label: 'صف' }, { id: 'r2', label: 'صف2' }], cols: [{ id: 'c1', label: 'عمود' }, { id: 'c2', label: 'عمود2' }], cards: [{ id: 'k', label: 'بطاقة', row: 'r1', col: 'c2' }] };
  const v = (st) => () => validateLab({ steps: [{ type: 'order', prompt_ar: 'رتب', items: [{ id: 'a', label: 'أ' }, { id: 'b', label: 'ب' }], answer: ['a', 'b'] }, st] });
  it('البطاقة بصف أو عمود غير موجود، والمعرّف المكرر، والحدود: 15 صفًا و8 أعمدة و80 بطاقة', () => {
    expect(v(base)).not.toThrow();
    expect(v({ ...base, cards: [{ id: 'k', label: 'ب', row: 'zz', col: 'c1' }] })).toThrow(/بلا صف أو عمود/);
    expect(v({ ...base, cards: [{ id: 'k', label: 'ب', row: 'r1', col: 'c1' }, { id: 'k', label: 'ج', row: 'r1', col: 'c1' }] })).toThrow(/مكرر/);
    expect(v({ ...base, rows: Array.from({ length: 16 }, (_, i) => ({ id: `r${i}`, label: 'ص' })), cards: [{ id: 'k', label: 'ب', row: 'r1', col: 'c1' }] })).toThrow(/خمسة عشر/);
    expect(v({ ...base, cols: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: 'ع' })) })).toThrow(/ثمانية/);
    expect(v({ ...base, cards: Array.from({ length: 81 }, (_, i) => ({ id: `k${i}`, label: 'ب', row: 'r1', col: 'c1' })) })).toThrow(/ثمانون/);
    expect(v({ ...base, levels: { beginner: { solved_rows: ['r1'] } } })).toThrow(/لا يبقى/);
    expect(v({ ...base, levels: { beginner: { counts: 'all' } } })).toThrow(/عدّادات/);
    expect(v({ ...base, only_levels: ['expert'] })).toThrow(/only_levels/);
    expect(() => validateLab({ steps: [{ ...base, only_levels: ['advanced'] }] })).toThrow(/الأولى/);
  });
});

describe('اللوحة: التصحيح بدرجة المحورين والخلط', () => {
  const st = boardOf('map');
  it('الإجابة الكاملة درجة كاملة بلا خلط، والصف المحلول خارج المقام للتأسيسي فقط', () => {
    const b = gradeStep(st, fullAnswer(st), { level: 'beginner' });
    expect(b).toMatchObject({ score: 1, ok: true, total: 42, right: 42, half: 0 });
    expect(gradeStep(st, fullAnswer(st), { level: 'advanced' }).total).toBe(49);
    // بطاقات الصف المحلول لا تُحتسب ولو غابت من الإجابة
    const noInteg = Object.fromEntries(Object.entries(fullAnswer(st)).filter(([k]) => byId[k].row !== 'integ'));
    expect(gradeStep(st, noInteg, { level: 'beginner' }).score).toBe(1);
    expect(gradeStep(st, noInteg, { level: 'advanced' }).score).toBeCloseTo(42 / 49);
  });
  it('الصف الصحيح والعمود الخطأ نصف درجة، والعكس نصف، وكلاهما خطأ صفر، والمكشوفة بالتلميح صفر', () => {
    const one = { ...st, cards: [st.cards.find((c) => c.id === 'p8-3')] };
    expect(gradeStep(one, { 'p8-3': ['quality', 'mc'] }, { level: 'advanced' }).score).toBe(1);
    expect(gradeStep(one, { 'p8-3': ['quality', 'exec'] }, { level: 'advanced' }).score).toBe(0.5);
    expect(gradeStep(one, { 'p8-3': ['risk', 'mc'] }, { level: 'advanced' }).score).toBe(0.5);
    expect(gradeStep(one, { 'p8-3': ['risk', 'exec'] }, { level: 'advanced' }).score).toBe(0);
    expect(gradeStep(one, {}, { level: 'advanced' }).score).toBe(0);
    expect(gradeStep(one, { 'p8-3': ['quality', 'mc'] }, { level: 'advanced', revealed: ['p8-3'] })).toMatchObject({ score: 0, revealed: 1 });
  });
  it('لوحة بعمود واحد (رؤوس الصفوف) لا تمنح نصف درجة على المحور الثابت', () => {
    const h = boardOf('heads');
    expect(gradeStep(h, { 'a-scope': ['s6', 'head'] }, { level: 'advanced' }).half).toBe(0);
  });
  it('مصفوفة الخلط بين الأعمدة وأخطاء الصفوف، وشرح كل بطاقة أخطأ فيها', () => {
    const a = { ...fullAnswer(st), 'p8-2': ['quality', 'mc'], 'p10-2': ['comm', 'mc'], 'p5-5': ['scope', 'plan'] };
    const r = gradeStep(st, a, { level: 'advanced' });
    expect(r.confusion.cols.exec.mc).toBe(2);
    expect(r.confusion.cols.mc.plan).toBe(1);
    expect(r.confusion.cols.plan.plan).toBe(24);
    expect(r.confusion.rows).toMatchObject({ quality: 1, comm: 1, scope: 1, integ: 0 });
    expect(r.notes.map((n) => n.id).sort()).toEqual(['p10-2', 'p5-5', 'p8-2']);
    expect(r.score).toBeCloseTo((46 + 1.5) / 49);
  });
});

describe('اللوحة: ما يصل المشارك بحسب مستواه', () => {
  const pub = (level) => publicSpec(MAP, (x) => x, level);
  it('لا يصل row ولا col ولا الشرح لأي مستوى، إلا مواضع الصف المحلول للتأسيسي', () => {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      const p = pub(level);
      const st = p.steps[2];
      for (const c of st.cards) expect(Object.keys(c).sort()).toEqual(level === 'beginner' ? ['code', 'id', 'label'] : ['id', 'label']);
      const keys = keysOf(p);
      for (const k of ['answer', 'note_ar', 'why_ar', 'hint1_ar', 'row', 'col', 'levels']) expect(keys.has(k)).toBe(false);
      const solved = Object.keys(st.scaffold.solved);
      expect(solved.every((id) => byId[id].row === 'integ')).toBe(true);
      expect(solved).toHaveLength(level === 'beginner' ? 7 : 0);
    }
  });
  it('السقالة تتلاشى: عدّاد لكل خلية للتأسيسي، ولكل عمود للمتوسط، ولا شيء للاحترافي', () => {
    const [b, m, a] = ['beginner', 'intermediate', 'advanced'].map((l) => pub(l).steps[2].scaffold);
    expect(b).toMatchObject({ show_code: true, counts: 'cell', feedback: 'instant', solved_rows: ['integ'] });
    expect(b.cell_counts.sched.plan).toBe(5);
    expect(b.cell_counts.integ).toEqual({ init: 1, plan: 1, exec: 2, mc: 2, close: 1 });
    expect(m).toMatchObject({ show_code: false, counts: 'col', feedback: 'check2', checks: 2 });
    expect(m.col_counts).toEqual({ init: 2, plan: 24, exec: 10, mc: 12, close: 1 });
    expect(m.cell_counts).toBeUndefined();
    expect(a).toMatchObject({ show_code: false, counts: 'none', feedback: 'submit', checks: 0, solved: {} });
    expect(a.col_counts).toBeUndefined();
  });
  it('رؤوس الصفوف للاحترافي وحده: تُتخطى لغيره في المسار وتُعلَّم skip، فلا تدخل النسبة', () => {
    expect(pub('advanced').steps[1].skip).toBeUndefined();
    expect(pub('beginner').steps[1].skip).toBe(true);
    expect(nextIndex(MAP, 0, null, 'beginner')).toBe(2);
    expect(nextIndex(MAP, 0, null, 'intermediate')).toBe(2);
    expect(nextIndex(MAP, 0, null, 'advanced')).toBe(1);
    // غير المعتمد يأخذ التأسيسي
    expect(labLevelOf(null, 'milestone')).toBe('beginner');
    expect(labLevelOf({ milestone: 'advanced' }, 'milestone')).toBe('advanced');
  });
  it('الأداة كاملة 100% لكل مستوى بمساره، والإتقان 70% يتطلب أغلب اللوحة', () => {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      const results = {}; const path = [];
      for (let i = 0; i >= 0; i = nextIndex(MAP, i, perfectAny(MAP.steps[i]), level)) {
        results[i] = gradeStep(MAP.steps[i], perfectAny(MAP.steps[i]), { level });
        expect(results[i].score, `${level} ${i}`).toBe(1);
        path.push(i);
      }
      expect(path.includes(1)).toBe(level === 'advanced');
      expect(practicePct(MAP, results, path)).toBe(100);
    }
    // اللوحة نصف النسبة (وزن 4 من 8): بثلثها مع كمال الباقي دون الإتقان، وبنصفها مع خطأ موقفين دونه أيضًا
    const r = (map, c) => ({ 0: { score: 1 }, 2: { score: map }, 3: { score: c[0] }, 4: { score: c[1] }, 5: { score: c[2] } });
    expect(practicePct(MAP, r(0.3, [1, 1, 1]), [0, 2, 3, 4, 5])).toBeLessThan(MASTERY);
    expect(practicePct(MAP, r(0.5, [1, 0, 0]), [0, 2, 3, 4, 5])).toBeLessThan(MASTERY);
    expect(practicePct(MAP, r(0.9, [1, 1, 0]), [0, 2, 3, 4, 5])).toBeGreaterThanOrEqual(MASTERY);
  });
  it('الترحيل مطابق لما يولّده المحتوى، بوسم بوابة النشر وسطر السجل', () => {
    const sql = readFileSync('supabase/migrations/20261111120100_leaders_lab_pm_map.sql', 'utf8');
    expect(sql).toBe(gen('pm-map'));
    expect(sql.split('\n').slice(0, 15).join('\n')).toMatch(/^-- deploy-gate: tolerant /m);
    expect(sql).toContain("insert into leaders.schema_migrations (name) values ('20261111120100_leaders_lab_pm_map') on conflict do nothing;");
  });
});

function perfectAny(st) {
  return st.type === 'board' ? fullAnswer(st) : perfect(st);
}
