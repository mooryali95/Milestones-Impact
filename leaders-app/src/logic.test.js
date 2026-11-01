// منطق دالة leaders-api الصافي: احتساب المستوى وبناء الرحلة
import { describe, expect, it } from 'vitest';
import {
  buildJourney, filterHandbookMd, handbookModulesFor, isEmail, journeyProgress, levelFor, normalizeEmail, normalizePhone, overallLevel, placementFromAnswers,
  requirementApplies, scoreFor, seededShuffle, tierPercents, trackKey, evaluatePlacement, DEFAULT_MODEL, itemsToFlip, acquiescenceFor, behaviorNaCounts, MAX_BEHAVIOR_NA, priorityFor, reasonWithFlags, rubricPriority,
} from '../../supabase/functions/leaders-api/logic.js';

const RULES = ['milestone', 'impact', 'leadership'].flatMap((dimension) => [
  { dimension, level: 'beginner', min_knowledge: 0, min_skill: 0, min_behavior: 0 },
  { dimension, level: 'intermediate', min_knowledge: 75, min_skill: 50, min_behavior: 0 },
  { dimension, level: 'advanced', min_knowledge: 75, min_skill: 75, min_behavior: 75 },
]);

const choice = (id, dimension, tier, correct = 1) => ({
  id, dimension, tier, kind: 'choice',
  options: [0, 1, 2, 3].map((i) => ({ label: `o${i}`, score: i === correct ? 1 : 0 })),
});
const likert = (id, dimension) => ({
  id, dimension, tier: 'behavior', kind: 'likert',
  options: [0, 1, 2, 3, 4].map((score) => ({ label: `l${score}`, score })),
});

// أربعة أسئلة لكل مستوى إتقان في كل بُعد، كما في baseline-v1
function instrument() {
  const qs = [];
  for (const d of ['milestone', 'impact', 'leadership']) {
    for (let i = 0; i < 4; i++) {
      qs.push(choice(`${d}-k${i}`, d, 'knowledge'));
      qs.push(choice(`${d}-s${i}`, d, 'skill'));
      qs.push(likert(`${d}-b${i}`, d));
    }
  }
  return qs;
}

// يجيب: صحيح في أول n من أسئلة المعرفة والمواقف، وقيمة ثابتة للممارسة
function answer(qs, plan) {
  const a = {};
  for (const q of qs) {
    const p = plan[q.dimension];
    const i = Number(q.id.slice(-1));
    if (q.tier === 'knowledge') a[q.id] = i < p.k ? 1 : 0;
    if (q.tier === 'skill') a[q.id] = i < p.s ? 1 : 0;
    if (q.tier === 'behavior') a[q.id] = p.b;
  }
  return a;
}

describe('scoring', () => {
  it('scores by original option index and rejects unknown indexes', () => {
    const q = choice('q', 'milestone', 'knowledge', 2);
    expect(scoreFor(q, 2)).toBe(1);
    expect(scoreFor(q, 0)).toBe(0);
    expect(scoreFor(q, 9)).toBeNull();
  });

  it('computes tier percents per dimension', () => {
    const qs = instrument();
    const p = tierPercents(qs, answer(qs, {
      milestone: { k: 3, s: 2, b: 3 }, impact: { k: 4, s: 4, b: 4 }, leadership: { k: 0, s: 0, b: 0 },
    }));
    expect(p.milestone).toEqual({ knowledge: 75, skill: 50, behavior: 75 });
    expect(p.impact).toEqual({ knowledge: 100, skill: 100, behavior: 100 });
    expect(p.leadership).toEqual({ knowledge: 0, skill: 0, behavior: 0 });
  });

  it('treats a tier without questions as null and ignores it in rules', () => {
    const qs = [choice('a', 'milestone', 'knowledge')];
    const p = tierPercents(qs, { a: 1 });
    expect(p.milestone.skill).toBeNull();
    expect(levelFor(p.milestone, RULES.filter((r) => r.dimension === 'milestone'))).toBe('advanced');
  });
});

describe('placement', () => {
  it('places each dimension independently on the 3×3 grid', () => {
    const qs = instrument();
    const result = placementFromAnswers(qs, answer(qs, {
      milestone: { k: 1, s: 1, b: 1 },   // تأسيسي
      impact: { k: 3, s: 2, b: 0 },      // متوسط: معرفة 75 ومواقف 50
      leadership: { k: 4, s: 3, b: 3 },  // احترافي: 100/75/75
    }), RULES);
    expect(Object.fromEntries(result.map((r) => [r.dimension, r.level]))).toEqual({
      milestone: 'beginner', impact: 'intermediate', leadership: 'advanced',
    });
  });

  it('needs every condition of a level, not an average', () => {
    const qs = instrument();
    const [m] = placementFromAnswers(qs, answer(qs, {
      milestone: { k: 4, s: 4, b: 2 }, impact: { k: 0, s: 0, b: 0 }, leadership: { k: 0, s: 0, b: 0 },
    }), RULES);
    expect(m.behavior).toBe(50);
    expect(m.level).toBe('intermediate');
  });
});

describe('journey', () => {
  const stages = [
    { key: 'profile', sort: 1 }, { key: 'assessment', sort: 2 }, { key: 'approval', sort: 3 },
    { key: 'training', sort: 4 }, { key: 'old', sort: 5, active: false },
  ];
  const reqs = [
    { id: 'r1', stage_key: 'profile', code: 'P-INFO', kind: 'form', required: true, sort: 1 },
    { id: 'r2', stage_key: 'profile', code: 'P-CV', kind: 'upload', required: false, sort: 2 },
    { id: 'r3', stage_key: 'assessment', code: 'A-DONE', kind: 'auto', required: true, sort: 1 },
    { id: 'r4', stage_key: 'approval', code: 'AP-OK', kind: 'auto', required: true, sort: 1 },
    { id: 'r5', stage_key: 'training', code: 'T-ATTEND', kind: 'check', required: true, sort: 1 },
    { id: 'r6', stage_key: 'training', code: 'O-GATE', kind: 'upload', required: true, sort: 2, dimension: 'milestone', level: 'advanced' },
  ];

  it('derives system requirements from state whatever their kind', () => {
    const j = buildJourney({ stages, requirements: reqs, progress: {}, levels: {}, state: { profileCompleted: true } });
    expect(j.map((s) => s.status)).toEqual(['done', 'active', 'locked', 'locked']);
    expect(j[0].items.find((i) => i.code === 'P-CV').status).toBe('pending');
  });

  it('opens training after approval and shows only requirements for the participant level', () => {
    const state = { profileCompleted: true, baselineSubmitted: true, placementApproved: true };
    const j = buildJourney({ stages, requirements: reqs, progress: { r5: { status: 'done' } }, levels: { milestone: 'beginner' }, state });
    expect(j[3].status).toBe('done');
    expect(j[3].items.map((i) => i.code)).toEqual(['T-ATTEND']);
    expect(journeyProgress(j)).toBe(100);

    const adv = buildJourney({ stages, requirements: reqs, progress: { r5: { status: 'done' } }, levels: { milestone: 'advanced' }, state });
    expect(adv[3].status).toBe('active');
    expect(journeyProgress(adv)).toBe(88);
  });

  it('does not let a manual status override a system requirement', () => {
    const j = buildJourney({ stages, requirements: reqs, progress: { r4: { status: 'done' } }, levels: {}, state: { profileCompleted: true, baselineSubmitted: true } });
    expect(j[2].status).toBe('active');
  });

  it('applies dimension-wide and level-specific requirements', () => {
    expect(requirementApplies({ dimension: 'impact' }, {})).toBe(true);
    expect(requirementApplies({ dimension: 'impact', level: 'advanced' }, { impact: 'beginner' })).toBe(false);
    expect(requirementApplies({ active: false }, {})).toBe(false);
  });
});

describe('helpers', () => {
  it('shuffles deterministically per seed without losing items', () => {
    const list = [1, 2, 3, 4, 5, 6];
    expect(seededShuffle(list, 'a')).toEqual(seededShuffle(list, 'a'));
    expect([...seededShuffle(list, 'b')].sort()).toEqual(list);
  });

  it('normalizes email and Saudi phone numbers', () => {
    expect(normalizeEmail('  Ali@Example.COM ')).toBe('ali@example.com');
    expect(isEmail('ali@example.com')).toBe(true);
    expect(isEmail('ali@example')).toBe(false);
    expect(normalizePhone('050 123 4567')).toBe('+966501234567');
    expect(normalizePhone('966501234567')).toBe('+966501234567');
    expect(normalizePhone('+447700900123')).toBe('+447700900123');
    expect(normalizePhone('12')).toBeNull();
  });
});

describe('handbook', () => {
  const mods = [
    { id: 'a', dimension: 'impact', sort: 2, min_level: 'beginner', body_md: 'x' },
    { id: 'b', dimension: 'milestone', sort: 1, min_level: 'intermediate', body_md: 'x' },
    { id: 'c', dimension: 'milestone', sort: 2, min_level: 'advanced', body_md: 'x' },
    { id: 'd', dimension: 'impact', sort: 1, min_level: 'beginner', body_md: '  ' },
  ];

  it('includes chapters up to the participant level per dimension, skipping empty ones', () => {
    const got = handbookModulesFor(mods, { milestone: 'intermediate', impact: 'beginner' }).map((m) => m.id);
    expect(got).toEqual(['b', 'a']);
  });

  it('keeps only the level blocks that apply', () => {
    const md = 'عام\n:::min=intermediate\nمتوسط فأعلى\n:::\n:::only=beginner\nتأسيسي فقط\n:::\nختام';
    expect(filterHandbookMd(md, 'beginner')).toBe('عام\nتأسيسي فقط\nختام');
    expect(filterHandbookMd(md, 'advanced')).toBe('عام\nمتوسط فأعلى\nختام');
  });
  it('يحذف كتل النطاق بحسب نطاق المشارك، ويُظهرها لمن لم يحدده', () => {
    const md = 'عام\n:::scope=program\nبرنامج\n:::\n:::min=advanced scope=portfolio\nمحفظة متقدم\n:::\nختام';
    expect(filterHandbookMd(md, 'advanced', 'project')).toBe('عام\nختام');
    expect(filterHandbookMd(md, 'advanced', 'program')).toBe('عام\nبرنامج\nختام');
    expect(filterHandbookMd(md, 'intermediate', 'portfolio')).toBe('عام\nبرنامج\nختام');
    expect(filterHandbookMd(md, 'advanced', 'portfolio')).toBe('عام\nبرنامج\nمحفظة متقدم\nختام');
    expect(filterHandbookMd(md, 'advanced', null)).toBe('عام\nبرنامج\nمحفظة متقدم\nختام');
  });
});

describe('overallLevel', () => {
  it('takes the median of the three dimensions', () => {
    expect(overallLevel({ milestone: 'beginner', impact: 'intermediate', leadership: 'advanced' })).toBe('intermediate');
    expect(overallLevel({ milestone: 'beginner', impact: 'beginner', leadership: 'advanced' })).toBe('beginner');
    expect(overallLevel({ milestone: 'advanced', impact: 'advanced', leadership: 'beginner' })).toBe('advanced');
  });
  it('is null without placements', () => {
    expect(overallLevel({})).toBe(null);
  });
});

describe('trackKey', () => {
  it('maps the three levels to one of 27 tracks', () => {
    expect(trackKey({ milestone: 'beginner', impact: 'beginner', leadership: 'intermediate' })).toBe('M1I1L2');
    expect(trackKey({ leadership: 'advanced', impact: 'intermediate', milestone: 'advanced' })).toBe('M3I2L3');
  });
  it('has no track until every level is known', () => {
    expect(trackKey({ milestone: 'beginner', impact: 'beginner' })).toBe(null);
    expect(trackKey({})).toBe(null);
    expect(trackKey(null)).toBe(null);
  });
  it('covers 27 distinct tracks', () => {
    const L = ['beginner', 'intermediate', 'advanced'];
    const keys = new Set(L.flatMap((m) => L.flatMap((i) => L.map((l) => trackKey({ milestone: m, impact: i, leadership: l })))));
    expect(keys.size).toBe(27);
  });
});

describe('evaluatePlacement', () => {
  const ev = (k, s, b, m) => evaluatePlacement({ knowledge: k, skill: s, behavior: b }, m);
  it('weights situational judgement above self reported practice', () => {
    const r = ev(75, 25, 69);
    expect(r.composite).toBe(49.1);
    expect(r.level).toBe('beginner');
    // 5.9 نقاط تحت 55 ضمن الهامش، لكن المواقف 25 تبعد 15 عن أرضية 40: ليس حدّيًا
    expect(r.borderline).toBe(false);
  });
  it('is borderline only when both the composite gap and the floor gap are within the margin', () => {
    expect(ev(60, 50, 45).borderline).toBe(true);     // المؤشر 52.8 يبعد 2.2، وكل جانب فوق 40
    expect(ev(100, 35, 100).borderline).toBe(true);   // المؤشر 67.5، والمواقف تبعد 5 عن 40
    expect(ev(100, 20, 100).borderline).toBe(false);  // المؤشر كافٍ لكن المواقف تبعد 20
    expect(ev(45, 45, 45).borderline).toBe(false);    // كل جانب فوق الأرضية لكن المؤشر يبعد 10
    expect(ev(100, 100, 100).borderline).toBe(false); // احترافي لا يكون حدّيًا
  });
  it('places intermediate and advanced by composite', () => {
    expect(ev(75, 50, 50).level).toBe('intermediate');
    expect(ev(50, 75, 75).level).toBe('intermediate');
    expect(ev(100, 75, 75).level).toBe('advanced');
  });
  it('a weak tested tier caps the level even with a high composite', () => {
    const r = ev(100, 35, 100);
    expect(r.composite).toBeGreaterThan(55);
    expect(r.level).toBe('beginner');
    expect(r.reason).toContain('المواقف');
  });
  it('self reported practice is not a gate: low practice is flagged, not capped', () => {
    const r = ev(100, 100, 50);
    expect(r.level).toBe('advanced');
    expect(r.low_practice).toBe(true);
    expect(r.flags.map((f) => f.key)).toEqual(['low_practice']);
    expect(r.flags[0].reason_ar).toBe('اختبار مرتفع وممارسة ذاتية منخفضة');
    // الخبير المتواضع: اختبار كامل وممارسة «نادرًا» يُسكَّن متوسطًا على الأقل
    expect(ev(100, 75, 25).level).toBe('intermediate');
    expect(ev(100, 75, 25).low_practice).toBe(true);
    // ممارسة فوق أرضية المستوى الذي بلغه: لا علم
    expect(ev(75, 50, 50).low_practice).toBe(false);
    // التأسيسي لا يُعلَّم: لا اختبار ناجح يقابل الممارسة المنخفضة
    expect(ev(20, 20, 10).low_practice).toBe(false);
  });
  it('still weighs practice in the composite', () => {
    expect(ev(50, 50, 100).composite).toBe(57.5);
    expect(ev(50, 50, 100).level).toBe('intermediate');
    expect(ev(50, 50, 0).level).toBe('beginner');
  });
  it('flags acquiescence only when told, without changing the score', () => {
    const a = evaluatePlacement({ knowledge: 50, skill: 50, behavior: 100 }, DEFAULT_MODEL, { acquiescence: true });
    expect(a.acquiescence).toBe(true);
    expect(a.flags.map((f) => f.reason_ar)).toContain('ممارسة بأعلى درجة في كل العبارات');
    expect(a.composite).toBe(ev(50, 50, 100).composite);
    expect(ev(50, 50, 100).acquiescence).toBe(false);
  });
  it('gives nothing above beginner from practice alone', () => {
    const r = evaluatePlacement({ knowledge: null, skill: null, behavior: 100 });
    expect(r.composite).toBe(100);
    expect(r.level).toBe('beginner');
  });
  it('uses the admin tuned model', () => {
    expect(ev(75, 25, 69, { ...DEFAULT_MODEL, min_intermediate: 45, floor_intermediate: 25 }).level).toBe('intermediate');
  });
  it('keeps a weak tested tier above chance (25%) out of intermediate', () => {
    expect(ev(70, 35, 70).level).toBe('beginner');
    expect(ev(35, 70, 70).level).toBe('beginner');
    expect(ev(70, 45, 70).level).toBe('intermediate');
  });
  it('ignores missing tiers', () => {
    expect(evaluatePlacement({ knowledge: 80, skill: 80, behavior: null }).composite).toBe(80);
  });
});

describe('itemsToFlip', () => {
  const flip = (k, s, b, m) => itemsToFlip({ knowledge: k, skill: s, behavior: b, ...evaluatePlacement({ knowledge: k, skill: s, behavior: b }, m) }, m);
  it('counts whole questions: a knowledge or skill question is 4 of 24, a practice statement 4 of 16', () => {
    // المواقف 25 → 41.67 بسؤال واحد، فيبلغ المؤشر 57.4 وتعبر الأرضية: سؤال واحد
    expect(flip(75, 25, 69)).toBe(1);
    // المؤشر 50: سؤال مواقف يرفعه 8.33 إلى 58.3
    expect(flip(50, 50, 50)).toBe(1);
    // المؤشر 45: سؤال واحد لا يكفي (53.3)، وسؤالا مواقف يكفيان (61.7)
    expect(flip(45, 45, 45)).toBe(2);
  });
  it('must clear the floors too, not only the composite threshold', () => {
    // المؤشر 62.5 لكن المواقف 25: سؤال مواقف واحد (25 → 41.67) يعبر أرضية المتوسط 40
    expect(flip(100, 25, 100)).toBe(1);
    expect(evaluatePlacement({ knowledge: 100, skill: 41.67, behavior: 100 }).level).toBe('intermediate');
    // الممارسة لا أرضية لها: المؤشر 90 والممارسة 20 احترافي أصلًا
    expect(flip(100, 100, 20)).toBeNull();
  });
  it('is null for the top level, for no tiers, and when no number of questions reaches the next threshold', () => {
    expect(flip(100, 100, 100)).toBeNull();
    expect(itemsToFlip({ level: 'beginner', knowledge: null, skill: null, behavior: null })).toBeNull();
    expect(flip(50, 50, 50, { ...DEFAULT_MODEL, min_intermediate: 100.5, min_advanced: 100.5 })).toBeNull();
    // القفز مستويين ببعد واحد يُحتسب أيضًا: المتوسط ممنوع لكن الاحترافي في المتناول
    // (5 أسئلة مع أرضية ممارسة سابقًا؛ 4 الآن لأن الممارسة لا تحتاج رفعًا إلى 60)
    expect(flip(50, 50, 50, { ...DEFAULT_MODEL, min_intermediate: 100.5 })).toBe(4);
  });
  it('ignores missing tiers like evaluatePlacement does', () => {
    expect(flip(50, 50, null)).toBe(1);
  });
});

describe('placementFromAnswers with the composite model', () => {
  it('returns composite, reason and borderline per dimension', () => {
    const qs = [{ id: 'a', dimension: 'milestone', tier: 'knowledge', options: [{ score: 0 }, { score: 4 }] }];
    const [m] = placementFromAnswers(qs, { a: 1 }, [], DEFAULT_MODEL);
    expect(m.composite).toBe(100);
    expect(m.level).toBe('advanced');
    expect(m.borderline).toBe(false);
    expect(typeof m.reason).toBe('string');
  });
  it('flags acquiescence when every practice statement is at the top score', () => {
    const lik = [{ score: 0 }, { score: 1 }, { score: 2 }, { score: 3 }, { score: 4 }, { score: -1 }];
    const qs = [
      { id: 'k', dimension: 'milestone', tier: 'knowledge', options: [{ score: 0 }, { score: 4 }] },
      ...[1, 2, 3, 4].map((i) => ({ id: `b${i}`, dimension: 'milestone', tier: 'behavior', options: lik })),
      ...[1, 2, 3, 4].map((i) => ({ id: `c${i}`, dimension: 'impact', tier: 'behavior', options: lik })),
    ];
    const ans = { k: 1, b1: 4, b2: 4, b3: 4, b4: 4, c1: 4, c2: 4, c3: 4, c4: 3 };
    const [m, i] = placementFromAnswers(qs, ans, [], DEFAULT_MODEL);
    expect(m.acquiescence).toBe(true);
    expect(i.acquiescence).toBe(false);
    // «لا ينطبق» لا تكسر العلم ولا تُحتسب أعلى درجة
    expect(acquiescenceFor(qs, { ...ans, b4: 5 }).milestone).toBe(true);
    expect(acquiescenceFor(qs, { b1: 5, b2: 5 }).milestone).toBe(false);
    expect(reasonWithFlags(m)).toContain('ممارسة بأعلى درجة في كل العبارات');
  });
  it('counts «not applicable» per dimension for the baseline guard', () => {
    const lik = [{ score: 0 }, { score: 4 }, { score: -1 }];
    const qs = [1, 2, 3, 4].map((i) => ({ id: `b${i}`, dimension: 'leadership', tier: 'behavior', options: lik }));
    expect(behaviorNaCounts(qs, { b1: 2, b2: 1 })).toEqual({ milestone: 0, impact: 0, leadership: 1 });
    expect(behaviorNaCounts(qs, { b1: 2, b2: 2 }).leadership).toBeGreaterThan(MAX_BEHAVIOR_NA);
  });
});

describe('priorityFor', () => {
  const L = (m, i, l) => ({ milestone: m, impact: i, leadership: l });
  it('takes the single weakest dimension regardless of composites', () => {
    expect(priorityFor(L('advanced', 'beginner', 'intermediate'), { milestone: 10, impact: 90, leadership: 10 }, 'milestone')).toBe('impact');
  });
  it('breaks ties by the lowest composite among the tied weakest', () => {
    expect(priorityFor(L('beginner', 'beginner', 'advanced'), { milestone: 40, impact: 31.5, leadership: 5 })).toBe('impact');
    expect(priorityFor(L('intermediate', 'intermediate', 'intermediate'), { milestone: 70, impact: 66, leadership: 58 })).toBe('leadership');
    // تعادل في المؤشر أيضًا: ترتيب الأبعاد
    expect(priorityFor(L('beginner', 'beginner', 'beginner'), { milestone: 30, impact: 30, leadership: 30 })).toBe('milestone');
  });
  it('falls back to the track default when composites are absent', () => {
    expect(priorityFor(L('beginner', 'beginner', 'advanced'), null, 'impact')).toBe('impact');
    expect(priorityFor(L('beginner', 'beginner', 'advanced'), { milestone: 40 }, 'impact')).toBe('impact');
    expect(priorityFor(L('beginner', 'beginner', 'advanced'), null, null)).toBe('milestone');
    expect(priorityFor({ milestone: 'beginner' }, null, 'impact')).toBe('impact');
  });
  it('does not double the rubric weight when all three levels are equal', () => {
    expect(rubricPriority(L('beginner', 'beginner', 'beginner'), 'milestone')).toBeNull();
    expect(rubricPriority(L('beginner', 'beginner', 'advanced'), 'impact')).toBe('impact');
  });
});

// ── القياس المبدئي baseline-v2: حراسة جودة الأسئلة ──
import V2_SQL from '../../supabase/migrations/20261024090000_leaders_baseline_v2.sql?raw';

const V2 = [...V2_SQL.matchAll(/select id, '(\w+)', '([\w-]+)', '(\w+)', '(?:[^']|'')*', (?:null|'(?:[^']|'')*'), '(\w+)', '((?:[^']|'')*)'::jsonb/g)]
  .map(([, dimension, code, tier, kind, opts]) => ({ id: code, dimension, code, tier, kind, options: JSON.parse(opts.replace(/''/g, "'")) }));
const choices = V2.filter((q) => q.kind === 'choice');
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const keyIndex = (q) => q.options.findIndex((o) => o.score === Math.max(...q.options.map((x) => x.score)));
const longestIndex = (q) => q.options.reduce((b, o, k, a) => (o.label.length > a[b].label.length ? k : b), 0);

describe('baseline-v2', () => {
  it('keeps 4 questions per tier in each framework', () => {
    expect(V2).toHaveLength(36);
    for (const d of ['milestone', 'impact', 'leadership']) {
      for (const t of ['knowledge', 'skill', 'behavior']) expect(V2.filter((q) => q.dimension === d && q.tier === t)).toHaveLength(4);
    }
  });
  it('does not reveal the key by its length', () => {
    const cued = choices.filter((q) => keyIndex(q) === longestIndex(q));
    expect(cued.length).toBeLessThanOrEqual(6);
  });
  it('places a "longest option + always" responder at beginner in every framework', () => {
    const answers = Object.fromEntries(V2.map((q) => [q.id, q.kind === 'likert' ? 4 : longestIndex(q)]));
    const pcts = tierPercents(V2, answers);
    for (const d of ['milestone', 'impact', 'leadership']) expect(evaluatePlacement(pcts[d], DEFAULT_MODEL).level).toBe('beginner');
  });
  it('gives every frequency item a "not applicable" option', () => {
    for (const q of V2.filter((x) => x.kind === 'likert')) expect(q.options.at(-1).score).toBeLessThan(0);
  });
});

describe('tierPercents with "not applicable"', () => {
  const qs = [
    { id: 'a', dimension: 'milestone', tier: 'behavior', options: [{ score: 0 }, { score: 4 }, { score: -1 }] },
    { id: 'b', dimension: 'milestone', tier: 'behavior', options: [{ score: 0 }, { score: 4 }, { score: -1 }] },
  ];
  it('drops the question from the tier instead of scoring it zero', () => {
    expect(tierPercents(qs, { a: 1, b: 2 }).milestone.behavior).toBe(100);
  });
  it('leaves the tier empty when every answer is not applicable', () => {
    expect(tierPercents(qs, { a: 2, b: 2 }).milestone.behavior).toBe(null);
  });
});

// ── baseline-v3: مخطط الاختبار وبنك الأسئلة ──
import V3_SQL from '../../supabase/migrations/20261024120000_leaders_item_bank_v3.sql?raw';

const V3 = [...V3_SQL.matchAll(/select id, '(\w+)', '([\w-]+)', '(\w+)', '(?:[^']|'')*', (?:null|'(?:[^']|'')*'), '(\w+)', '((?:[^']|'')*)'::jsonb, \d+, '((?:[^']|'')*)', '(\w+)'/g)]
  .map(([, dimension, code, tier, kind, opts, competency, chapter]) => ({
    id: code, dimension, code, tier, kind, competency, chapter, options: JSON.parse(opts.replace(/''/g, "'")),
  }));
// رتبة طول الإجابة الصحيحة بين البدائل: 0 الأطول، 3 الأقصر
const lengthRank = (q, k) => [...q.options.keys()].sort((a, b) => q.options[b].label.length - q.options[a].label.length).indexOf(k);

describe('baseline-v3', () => {
  it('has 4 practice, 6 situation and 6 knowledge items per framework', () => {
    expect(V3).toHaveLength(48);
    for (const d of ['milestone', 'impact', 'leadership']) {
      expect(V3.filter((q) => q.dimension === d && q.tier === 'behavior')).toHaveLength(4);
      expect(V3.filter((q) => q.dimension === d && q.tier === 'skill')).toHaveLength(6);
      expect(V3.filter((q) => q.dimension === d && q.tier === 'knowledge')).toHaveLength(6);
    }
  });
  it('maps every item to a competency and a handbook chapter', () => {
    for (const q of V3) {
      expect(q.competency.length).toBeGreaterThan(3);
      expect(q.chapter).toMatch(/^(intro|ch[1-6]|labs|close)$/);
    }
  });
  it('keeps handbook term items out of the baseline', () => {
    const terms = ['M-K1', 'M-K3', 'I-K3', 'L-K1', 'L-K3', 'L-K4'];
    expect(V3.filter((q) => terms.includes(q.code))).toEqual([]);
  });
  it('spreads the key across option length ranks in every framework and tier', () => {
    for (const d of ['milestone', 'impact', 'leadership']) {
      for (const t of ['skill', 'knowledge']) {
        const ranks = [0, 0, 0, 0];
        for (const q of V3.filter((x) => x.dimension === d && x.tier === t)) ranks[lengthRank(q, keyIndex(q))] += 1;
        expect(Math.max(...ranks)).toBeLessThanOrEqual(2);
      }
    }
  });
  // من يختار بالطول يصيب 2 من 6 على الأكثر في كل جانب، أي قريبًا من التخمين.
  // ومع "دائمًا" في كل عبارات الممارسة يبقى تأسيسيًا بالمعيار المعايَر 35/50/15.
  const byLength = (rank, likert) => Object.fromEntries(V3.map((q) => [q.id, q.kind === 'likert' ? likert
    : [...q.options.keys()].find((k) => lengthRank(q, k) === rank)]));
  it('places a "pick by length + always" responder at beginner', () => {
    for (const rank of [0, 1, 2, 3]) {
      for (const likert of [2, 4]) {
        const pcts = tierPercents(V3, byLength(rank, likert));
        for (const d of ['milestone', 'impact', 'leadership']) expect(evaluatePlacement(pcts[d], DEFAULT_MODEL).level).toBe('beginner');
      }
    }
  });
  // تخمين عشوائي مع "دائمًا": يُبقي المعيار أغلبهم في التأسيسي (المحاكاة: 94%).
  it('keeps most random guessers who answer "always" at beginner', () => {
    const rand = mulberry(7);
    let up = 0, n = 0;
    for (let i = 0; i < 600; i++) {
      const pcts = tierPercents(V3, Object.fromEntries(V3.map((q) => [q.id, q.kind === 'likert' ? 4 : Math.floor(rand() * 4)])));
      for (const d of ['milestone', 'impact', 'leadership']) { n += 1; if (evaluatePlacement(pcts[d], DEFAULT_MODEL).level !== 'beginner') up += 1; }
    }
    expect(up / n).toBeLessThan(0.1);
  });
});

// ── post-v1: أسئلة المعرفة الموازية ──
import POSTK_SQL from '../../supabase/migrations/20261024160000_leaders_post_knowledge.sql?raw';

const POSTK = [...POSTK_SQL.matchAll(/select id, '(\w+)', '([\w-]+)', 'knowledge', '(?:[^']|'')*', null, 'choice', '((?:[^']|'')*)'::jsonb, \d+, '((?:[^']|'')*)', '(\w+)'/g)]
  .map(([, dimension, code, opts, competency, chapter]) => ({
    id: code, dimension, code, tier: 'knowledge', kind: 'choice', competency, chapter, options: JSON.parse(opts.replace(/''/g, "'")),
  }));

describe('post-v1 knowledge items', () => {
  it('parallels the baseline-v3 knowledge blueprint, item for item', () => {
    expect(POSTK).toHaveLength(18);
    const v3k = V3.filter((q) => q.tier === 'knowledge');
    for (const p of POSTK) {
      const twin = v3k.find((q) => `P-${q.code}` === p.code);
      expect(twin).toBeTruthy();
      expect([p.dimension, p.competency, p.chapter]).toEqual([twin.dimension, twin.competency, twin.chapter]);
      expect(p.options.filter((o) => o.score === 4)).toHaveLength(1);
    }
  });
  it('spreads the key across option length ranks and positions', () => {
    for (const d of ['milestone', 'impact', 'leadership']) {
      const ranks = [0, 0, 0, 0], pos = [0, 0, 0, 0];
      for (const q of POSTK.filter((x) => x.dimension === d)) { ranks[lengthRank(q, keyIndex(q))] += 1; pos[keyIndex(q)] += 1; }
      expect(Math.max(...ranks)).toBeLessThanOrEqual(2);
      expect(Math.max(...pos)).toBeLessThanOrEqual(3);
    }
  });
});
