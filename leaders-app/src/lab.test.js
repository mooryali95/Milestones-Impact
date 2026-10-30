// مختبر القائد: المحرك، والمحتوى، والترحيل المولّد منه
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import {
  computeSchedule, gradeStep, labAward, labVisible, meterState, nextIndex, practicePct, publicSpec, validateLab, MASTERY,
} from '../../supabase/functions/leaders-api/lab.js';
import { ITEMS } from '../../scripts/lab/phase1.mjs';

// الإجابة الكاملة لخطوة من حلها، كما سيرسلها مشارك متقن
function perfect(st) {
  if (st.type === 'order') return st.answer;
  if (st.type === 'classify') return Object.fromEntries(st.items.map((x) => [x.id, x.bin]));
  if (st.type === 'match') return Object.fromEntries(st.left.map((x) => [x.id, x.match]));
  if (st.type === 'choice') return [...st.options].sort((a, b) => b.score - a.score)[0].id;
  if (st.type === 'allocate') return st.ideal;
  if (st.type === 'schedule') return { links: st.expected };
  if (st.type === 'plot') return Object.fromEntries(st.items.map((x) => [x.id, [x.x, x.y]]));
  if (st.type === 'matrix') return st.expected;
  return null;
}

describe('الجدول الزمني', () => {
  const t = [{ id: 'a', dur: 10 }, { id: 'b', dur: 5 }];
  it('الأنواع الأربعة مع الإزاحة', () => {
    expect(computeSchedule(t, [{ from: 'a', to: 'b', type: 'FS', lag: 2 }]).rows.b.es).toBe(12);
    expect(computeSchedule(t, [{ from: 'a', to: 'b', type: 'SS', lag: 3 }]).rows.b.es).toBe(3);
    expect(computeSchedule(t, [{ from: 'a', to: 'b', type: 'FF', lag: 0 }]).rows.b.ef).toBe(10);
    expect(computeSchedule(t, [{ from: 'a', to: 'b', type: 'SF', lag: 8 }]).rows.b.ef).toBe(8);
  });
  it('الفائض والمسار الحرج', () => {
    const r = computeSchedule([...t, { id: 'c', dur: 2 }], [{ from: 'a', to: 'b', type: 'FS' }, { from: 'a', to: 'c', type: 'FS' }]);
    expect(r.duration).toBe(15);
    expect(r.critical).toEqual(['a', 'b']);
    expect(r.rows.c.float).toBe(3);
  });
  it('يكشف الحلقة المغلقة', () => {
    expect(computeSchedule(t, [{ from: 'a', to: 'b', type: 'FS' }, { from: 'b', to: 'a', type: 'FS' }]).cycle).toBe(true);
  });
  it('جدول مركز الخدمات: 90 يومًا، والأدلة والتدريب بفائض 25', () => {
    const st = ITEMS.find((x) => x.key === 'schedule-critical-path').spec.steps[0];
    const r = computeSchedule(st.tasks, st.expected);
    expect(r.duration).toBe(90);
    expect(r.critical).toEqual(['design', 'gate', 'build', 'integ', 'pilot', 'launch']);
    expect(r.rows.content.float).toBe(25);
    expect(r.rows.train.float).toBe(25);
  });
});

describe('التصحيح', () => {
  it('الترتيب القريب يأخذ أغلب الدرجة', () => {
    const st = { type: 'order', answer: ['a', 'b', 'c', 'd'] };
    expect(gradeStep(st, ['a', 'b', 'c', 'd']).score).toBe(1);
    expect(gradeStep(st, ['b', 'a', 'c', 'd']).score).toBeCloseTo(5 / 6);
    expect(gradeStep(st, ['a', 'b']).score).toBe(0);
  });
  it('الاعتمادية بالطرفين الصحيحين ونوع خاطئ نصف درجة، والزائدة تُنقص', () => {
    const st = { type: 'schedule', tasks: [{ id: 'a', dur: 1 }, { id: 'b', dur: 1 }, { id: 'c', dur: 1 }], expected: [{ from: 'a', to: 'b', type: 'FS', lag: 0 }] };
    expect(gradeStep(st, { links: [{ from: 'a', to: 'b', type: 'FS' }] }).score).toBe(1);
    expect(gradeStep(st, { links: [{ from: 'a', to: 'b', type: 'SS' }] }).score).toBe(0.5);
    expect(gradeStep(st, { links: [{ from: 'a', to: 'b', type: 'FS' }, { from: 'b', to: 'c', type: 'FS' }] }).score).toBe(0.5);
  });
  it('المصفوفة الثلاثية: الخانة المجاورة نصف درجة', () => {
    const st = { type: 'plot', size: 3, items: [{ id: 'r', x: 2, y: 2 }] };
    expect(gradeStep(st, { r: [2, 2] }).score).toBe(1);
    expect(gradeStep(st, { r: [1, 2] }).score).toBe(0.5);
    expect(gradeStep(st, { r: [0, 0] }).score).toBe(0);
  });
  it('مصفوفة المسؤوليات تكشف الصف بلا صاحب قرار واحد', () => {
    const st = { type: 'matrix', rows: [{ id: 'x' }], cols: [{ id: 'p' }, { id: 'q' }], expected: { x: { p: 'A', q: 'R' } }, once_per_row: ['A'] };
    expect(gradeStep(st, { x: { p: 'A', q: 'R' } }).score).toBe(1);
    const r = gradeStep(st, { x: { p: 'A', q: 'A' } });
    expect(r.score).toBe(0.5);
    expect(r.broken).toEqual([{ row: 'x', value: 'A', count: 2 }]);
  });
  it('التوزيع الذي لا يساوي المجموع صفر', () => {
    const st = { type: 'allocate', total: 100, items: [{ id: 'a' }, { id: 'b' }], ideal: { a: 60, b: 40 } };
    expect(gradeStep(st, { a: 60, b: 30 }).score).toBe(0);
    expect(gradeStep(st, { a: 50, b: 50 }).score).toBeCloseTo(0.9);
  });
});

describe('من يرى المختبر', () => {
  const items = [
    { id: 'i1', dimension: 'impact', min_level: 'beginner', audience: 'granted', sort: 1 },
    { id: 'i2', dimension: 'milestone', min_level: 'advanced', audience: 'all', sort: 1 },
    { id: 'i3', dimension: 'leadership', min_level: 'beginner', audience: 'all', sort: 1, active: false },
  ];
  const ids = (who) => labVisible(items, who).map((x) => x.id);
  it('لا شيء دون منح، والمفتوحة للجميع تتبع المستوى المعتمد', () => {
    expect(ids({ participantId: 'p' })).toEqual([]);
    expect(ids({ participantId: 'p', levels: { milestone: 'intermediate' } })).toEqual([]);
    expect(ids({ participantId: 'p', levels: { milestone: 'advanced' } })).toEqual(['i2']);
  });
  it('منح الجهة يفتح المختبر كله لمشاركيها دون اعتماد مسار، والموقوفة لا تظهر', () => {
    const grants = [{ organization_id: 'o', item_id: null }];
    expect(ids({ participantId: 'p', organizationId: 'o', grants })).toEqual(['i2', 'i1']);
    expect(ids({ participantId: 'p', organizationId: 'x', grants })).toEqual([]);
  });
  it('منح الشخص لأداة واحدة، والمنتهي لا يُحتسب', () => {
    expect(ids({ participantId: 'p', grants: [{ participant_id: 'p', item_id: 'i1' }] })).toEqual(['i1']);
    expect(ids({ participantId: 'q', grants: [{ participant_id: 'p', item_id: 'i1' }] })).toEqual([]);
    expect(ids({ participantId: 'p', grants: [{ participant_id: 'p', item_id: 'i1', expires_at: '2020-01-01T00:00:00Z' }] })).toEqual([]);
  });
});

describe('النقاط والنتيجة', () => {
  it('نقاط الإتقان عند 70 والمكافأة عند 90', () => {
    expect(labAward(40, MASTERY - 1)).toEqual({ mastery: 0, excellence: 0 });
    expect(labAward(40, 75)).toEqual({ mastery: 40, excellence: 0 });
    expect(labAward(40, 95)).toEqual({ mastery: 40, excellence: 10 });
  });
  it('النتيجة على خطوات المسار فقط، موزونة', () => {
    const spec = { steps: [{ weight: 2 }, { weight: 1 }, { weight: 1 }] };
    expect(practicePct(spec, { 0: { score: 1 }, 2: { score: 0 } }, [0, 2])).toBe(67);
  });
});

describe('محتوى المرحلة الأولى', () => {
  it('ست أدوات وموقفان، اثنتان لكل إطار، بمفاتيح فريدة', () => {
    expect(ITEMS.filter((x) => x.kind === 'tool')).toHaveLength(6);
    expect(ITEMS.filter((x) => x.kind === 'scenario')).toHaveLength(2);
    for (const d of ['milestone', 'impact', 'leadership']) expect(ITEMS.filter((x) => x.kind === 'tool' && x.dimension === d)).toHaveLength(2);
    expect(new Set(ITEMS.map((x) => x.key)).size).toBe(ITEMS.length);
  });

  for (const it0 of ITEMS) {
    it(`${it0.title_ar}: صالح، ولا يكشف حلوله، والإجابة الكاملة 100%`, () => {
      const spec = validateLab(it0.spec);
      const keys = new Set();
      const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { keys.add(k); walk(x); }); };
      walk(publicSpec(spec));
      for (const k of ['answer', 'bin', 'match', 'expected', 'ideal', 'score', 'why_ar', 'then_ar', 'feedback_ar', 'effects', 'note_ar', 'next', 'x', 'y']) expect(keys.has(k)).toBe(false);
      // مشارك متقن يمضي في المسار كاملًا بأفضل القرارات
      const results = {};
      const path = [];
      const effects = [];
      let i = 0;
      while (i >= 0) {
        const st = spec.steps[i];
        const ans = perfect(st);
        const r = gradeStep(st, ans);
        expect(r.score).toBe(1);
        results[i] = r; path.push(i); effects.push(r.effects);
        i = nextIndex(spec, i, ans);
      }
      expect(practicePct(spec, results, path)).toBe(100);
      const m = meterState(spec, effects);
      for (const v of Object.values(m)) expect(v).toBeGreaterThanOrEqual(0);
    });
  }

  it('البوابة الحمراء تتفرع: الاستمرار يقود إلى الأزمة ثم الإغلاق، والتصحيح إلى خطة الفريق', () => {
    const spec = validateLab(ITEMS.find((x) => x.key === 'red-gate').spec);
    const at = (id) => spec.steps.findIndex((s) => s.id === id);
    expect(nextIndex(spec, at('gate'), 'go')).toBe(at('crisis'));
    expect(nextIndex(spec, at('crisis'), 'own')).toBe(at('close'));
    expect(nextIndex(spec, at('gate'), 'adjust')).toBe(at('pilot'));
    expect(nextIndex(spec, at('close'), null)).toBe(-1);
  });

  it('الترحيل مطابق لما يولده المحتوى', () => {
    const sql = readFileSync('supabase/migrations/20261026140000_leaders_lab.sql', 'utf8');
    const fresh = execFileSync('node', ['scripts/lab/build.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    expect(sql).toBe(fresh);
  });
});
