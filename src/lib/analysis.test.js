import { analyzeBookings, detectPattern, readinessOf, sortBookings, PATTERNS, RECOMMENDATIONS_TABLE } from './analysis';
import { TRACKS } from '../config/constants';

// Minimal proc factory matching the shape App builds from TRACKS × PHASES.
const proc = (trackId, phaseId, extra = {}) => ({
  key: `${trackId}-${phaseId}`,
  trackId,
  phaseId,
  nameAr: `${trackId} ${phaseId}`,
  trackNameAr: trackId,
  trackColor: '#000',
  trackIcon: '◆',
  phaseNameAr: `مرحلة ${phaseId}`,
  fedBy: [],
  ...extra,
});

const datesFor = (procs, start = '2026-08-01') =>
  procs.reduce((acc, p, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    acc[p.key] = d.toISOString().slice(0, 10);
    return acc;
  }, {});

describe('analyzeBookings', () => {
  test('returns null with fewer than 3 bookings', () => {
    const procs = [proc('creation', 1), proc('creation', 2)];
    expect(analyzeBookings(procs, datesFor(procs), {})).toBeNull();
  });

  test('detects a sequential pattern within one track', () => {
    const procs = [proc('creation', 1), proc('creation', 2), proc('creation', 3)];
    const r = analyzeBookings(procs, datesFor(procs), {});
    expect(r.patternId).toBe('sequential');
    expect(r.pattern).toBe(PATTERNS.sequential);
    expect(r.totalBooked).toBe(3);
  });

  test('flags dependency gaps for unbooked feeders', () => {
    const feeder = proc('creation', 1); // exists in the matrix but stays unbooked
    const booked = [
      proc('establishment', 1, { fedBy: ['creation-1'] }),
      proc('establishment', 2),
      proc('making', 1),
    ];
    const procs = [feeder, ...booked];
    // only the three `booked` procs get dates; the feeder is intentionally left out
    const r = analyzeBookings(procs, datesFor(booked), {});
    expect(r.depGaps).toHaveLength(1);
    expect(r.depGaps[0].missingKey).toBe('creation-1');
    // a dep gap must surface the corresponding recommendation
    expect(r.recommendations).toContain(
      RECOMMENDATIONS_TABLE.find(x => x.id === 'has_dep_gaps').text
    );
  });

  test('reports complete readiness at full 4×4 coverage', () => {
    const procs = [];
    for (const t of ['creation', 'innovation', 'establishment', 'making'])
      for (let ph = 1; ph <= 4; ph++) procs.push(proc(t, ph));
    const r = analyzeBookings(procs, datesFor(procs), {});
    expect(r.trackCoverage.covered).toBe(4);
    expect(r.phaseCoverage.covered).toBe(4);
    expect(r.readiness).toBe('complete');
    expect(r.weightBalance.pct).toBe(100);
    expect(r.isComplete).toBe(true);
  });
});

// يبني خطة من أزواج [مسار، مرحلة] بترتيب الحجز (يوم لكل حجز).
const plan = (...pairs) => {
  const procs = pairs.map(([t, ph]) => proc(t, ph));
  return analyzeBookings(procs, datesFor(procs), {});
};
const C = 'creation', I = 'innovation', E = 'establishment', M = 'making';

describe('شكل الخطة: كل شكل وحده', () => {
  test('sequential: ثلاث عمليات من مسار واحد تصعد مرحلة مرحلة', () => {
    expect(plan([C, 2], [C, 3], [C, 4]).patternId).toBe('sequential');
  });
  test('sequential لا ينطبق إن حُجز المسار بغير ترتيب مراحله أو بقفزة', () => {
    expect(plan([C, 3], [C, 2], [C, 1], [I, 4]).patternId).not.toBe('sequential');
    expect(plan([C, 1], [C, 2], [C, 4], [I, 4]).patternId).not.toBe('sequential');
  });
  test('diagnostic: المرحلة الأولى في ثلاثة مسارات', () => {
    expect(plan([C, 1], [I, 1], [E, 1]).patternId).toBe('diagnostic');
  });
  test('outcomeDriven: 75% أو أكثر في المرحلتين 3 و4', () => {
    expect(plan([C, 3], [I, 4], [E, 3], [M, 2]).patternId).toBe('outcomeDriven');
  });
  test('foundationFocused: 75% أو أكثر في المرحلتين 1 و2', () => {
    expect(plan([C, 1], [I, 2], [C, 2], [E, 4]).patternId).toBe('foundationFocused');
  });
  test('breadthFirst: أول أربعة حجوزات على ثلاثة مسارات في مرحلتين', () => {
    // 4 من 6 في المرحلتين الأوليين (67%)، والمرحلة الأولى في مسارين فقط
    expect(plan([C, 2], [I, 2], [E, 1], [C, 1], [C, 4], [I, 4]).patternId).toBe('breadthFirst');
  });
  test('integrative: ما لا ينطبق عليه شكل آخر', () => {
    expect(plan([C, 1], [C, 3], [I, 2], [I, 4]).patternId).toBe('integrative');
  });
  test('كل شكل معرّف تصل إليه قاعدة، ولا فئة ميتة', () => {
    const reached = new Set([
      plan([C, 2], [C, 3], [C, 4]), plan([C, 1], [I, 1], [E, 1]), plan([C, 3], [I, 4], [E, 3], [M, 2]),
      plan([C, 1], [I, 2], [C, 2], [E, 4]), plan([C, 2], [I, 2], [E, 1], [C, 1], [C, 4], [I, 4]), plan([C, 1], [C, 3], [I, 2], [I, 4]),
    ].map(r => r.patternId));
    expect([...reached].sort()).toEqual(Object.keys(PATTERNS).sort());
    expect(PATTERNS.reEvaluating).toBeUndefined();
    for (const [k, v] of Object.entries(PATTERNS)) expect(v.id).toBe(k);
  });
});

describe('شكل الخطة: الأسبقية بين القواعد', () => {
  test('sequential يسبق foundationFocused: حجز رابع في المرحلتين الأوليين لا يعيد التسمية', () => {
    // 3 من 4 في المرحلتين 1 و2 (75%)
    expect(plan([C, 1], [C, 2], [C, 3], [I, 2]).patternId).toBe('sequential');
  });
  test('sequential يسبق outcomeDriven', () => {
    // 3 من 4 في المرحلتين 3 و4
    expect(plan([C, 2], [C, 3], [C, 4], [I, 4]).patternId).toBe('sequential');
  });
  test('sequential يسبق diagnostic', () => {
    expect(plan([C, 1], [C, 2], [C, 3], [I, 1], [E, 1]).patternId).toBe('sequential');
  });
  test('diagnostic يسبق foundationFocused و breadthFirst', () => {
    // كلها في المرحلة الأولى: تنطبق الثلاث معًا
    expect(plan([C, 1], [I, 1], [E, 1], [M, 1]).patternId).toBe('diagnostic');
  });
  test('diagnostic يسبق outcomeDriven', () => {
    // 9 من 12 في المرحلتين 3 و4 (75%)، والمرحلة الأولى في ثلاثة مسارات: تنطبق القاعدتان
    const both = [[C, 1], [I, 1], [E, 1], [M, 3], [M, 4], [I, 3], [I, 4], [E, 3], [E, 4], [C, 4], [C, 3], [M, 3]].map(([t, ph]) => ({ trackId: t, phaseId: ph }));
    expect(both.filter(p => p.phaseId >= 3).length / both.length).toBeGreaterThanOrEqual(0.75);
    expect(detectPattern(both)).toBe('diagnostic');
  });
  test('foundationFocused و outcomeDriven يسبقان breadthFirst', () => {
    expect(plan([C, 2], [I, 2], [E, 2], [M, 1]).patternId).toBe('foundationFocused');
    expect(plan([C, 3], [I, 3], [E, 4], [M, 4]).patternId).toBe('outcomeDriven');
  });
  test('النتيجة لا تتوقف على ترتيب المصفوفة الداخلة', () => {
    const procs = [proc(C, 1), proc(C, 2), proc(C, 3), proc(I, 2), proc(E, 1)];
    const dates = datesFor(procs);
    const a = analyzeBookings(procs, dates, {});
    const b = analyzeBookings([...procs].reverse(), dates, {});
    expect(b.patternId).toBe(a.patternId);
    expect(b.timeline.map(t => t.key)).toEqual(a.timeline.map(t => t.key));
  });
});

describe('تساوي التواريخ', () => {
  const sameDay = (procs) => Object.fromEntries(procs.map(p => [p.key, '2026-08-01']));
  test('يُرتَّب بالمرحلة ثم بترتيب المسار في TRACKS، أيًّا كان ترتيب الإدخال', () => {
    const procs = [proc(M, 2), proc(E, 1), proc(C, 2), proc(I, 1), proc(C, 1)];
    const expected = ['creation-1', 'innovation-1', 'establishment-1', 'creation-2', 'making-2'];
    expect(sortBookings(procs, sameDay(procs)).map(p => p.key)).toEqual(expected);
    expect(sortBookings([...procs].reverse(), sameDay(procs)).map(p => p.key)).toEqual(expected);
    expect(analyzeBookings([...procs].reverse(), sameDay(procs), {}).timeline.map(t => t.key)).toEqual(expected);
  });
  test('التاريخ يسبق المرحلة حين يختلف', () => {
    const procs = [proc(C, 1), proc(C, 2), proc(C, 3)];
    const dates = { 'creation-1': '2026-08-03', 'creation-2': '2026-08-02', 'creation-3': '2026-08-01' };
    expect(sortBookings(procs, dates).map(p => p.phaseId)).toEqual([3, 2, 1]);
  });
  test('مسار محجوز كله في يوم واحد يُقرأ بترتيب مراحله (sequential) بأي ترتيب إدخال', () => {
    const procs = [proc(C, 3), proc(C, 1), proc(C, 2)];
    expect(analyzeBookings(procs, sameDay(procs), {}).patternId).toBe('sequential');
    expect(analyzeBookings([...procs].reverse(), sameDay(procs), {}).patternId).toBe('sequential');
  });
});

describe('الجاهزية', () => {
  test('early: مسار واحد', () => {
    expect(plan([C, 1], [C, 2], [C, 3]).readiness).toBe('early');
  });
  test('early: مساران دون المرحلة الثانية', () => {
    expect(plan([C, 1], [I, 1], [I, 3]).readiness).toBe('early');
  });
  test('medium: مساران والمرحلتان 1 و2', () => {
    const r = plan([C, 1], [I, 2], [I, 1]);
    expect(r.readiness).toBe('medium');
    expect(r.readinessAr).toBe('متوسطة');
  });
  test('advanced: ثلاثة مسارات وثلاث مراحل منها 1 و2', () => {
    const r = plan([C, 1], [I, 2], [E, 3]);
    expect(r.readiness).toBe('advanced');
    expect(r.readinessAr).toBe('متقدمة');
  });
  test('ثلاثة مسارات وثلاث مراحل دون المرحلة الثانية ليست متقدمة (كانت تتخطى «متوسطة»)', () => {
    const r = plan([C, 1], [I, 3], [E, 4]);
    expect(r.readiness).toBe('early');
    expect(r.readinessAr).toBe('مبكرة');
  });
  test('complete: المسارات الأربعة والمراحل الأربع', () => {
    const r = plan([C, 1], [I, 2], [E, 3], [M, 4]);
    expect(r.readiness).toBe('complete');
    expect(r.readinessAr).toBe('شاملة');
  });
  test('مطّردة: إضافة حجز لا تُنزل الدرجة، وكل درجة تحقق شروط التي دونها (كل التركيبات)', () => {
    const rank = { early: 0, medium: 1, advanced: 2, complete: 3 };
    const ids = TRACKS.map(t => t.id);
    const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map(s => [...s, x])), [[]]).filter(s => s.length);
    for (const ts of subsets(ids)) for (const ps of subsets([1, 2, 3, 4])) {
      const tracks = new Set(ts), phases = new Set(ps);
      const lvl = rank[readinessOf(tracks, phases).readiness];
      if (lvl >= 1) expect(tracks.size >= 2 && phases.has(1) && phases.has(2)).toBe(true);
      if (lvl >= 2) expect(tracks.size >= 3 && phases.size >= 3).toBe(true);
      if (lvl >= 3) expect(tracks.size === 4 && phases.size === 4).toBe(true);
      // التوسع بمسار أو مرحلة لا يُنقص الدرجة
      for (const t of ids) expect(rank[readinessOf(new Set([...tracks, t]), phases).readiness]).toBeGreaterThanOrEqual(lvl);
      for (const ph of [1, 2, 3, 4]) expect(rank[readinessOf(tracks, new Set([...phases, ph])).readiness]).toBeGreaterThanOrEqual(lvl);
    }
  });
});

describe('النص والمؤشرات', () => {
  test('لا وصف يتكلم عن شخصية صاحب الخطة ولا عن تفكيره', () => {
    const texts = [...Object.values(PATTERNS).flatMap(p => [p.nameAr, p.desc]), ...RECOMMENDATIONS_TABLE.map(r => r.text)];
    for (const t of texts) {
      expect(t).not.toContain('شخصية');
      expect(t).not.toMatch(/يعكس|تفكير|ذهني|نمط/);
    }
    for (const p of Object.values(PATTERNS)) expect(p.desc).not.toContain('—');
  });
  test('furthestPhase عدد صحيح هو أبعد مرحلة محجوزة، ولا متوسط بكسر', () => {
    const r = plan([C, 1], [I, 1], [E, 3]);
    expect(r.furthestPhase).toBe(3);
    expect(r).not.toHaveProperty('avgPhase');
  });
  test('وزن التغطية من أوزان constants.js نفسها', () => {
    const w = Object.fromEntries(TRACKS.map(t => [t.id, t.weight]));
    const total = TRACKS.reduce((s, t) => s + t.weight, 0);
    const r = plan([C, 1], [C, 2], [E, 4]);
    expect(r.weightBalance.totalWeight).toBe(total);
    expect(r.weightBalance.coveredWeight).toBe(w[C] + w[E]);
    expect(r.trackDist.map(t => t.weight)).toEqual(TRACKS.map(t => t.weight));
  });
});
