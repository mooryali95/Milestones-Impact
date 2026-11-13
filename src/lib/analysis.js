// ════════════════════════════════════════════════════════════════
// ANALYSIS ENGINE — وصف خطة الحجز + التوصيات
// ════════════════════════════════════════════════════════════════
// Pure module: given the process list plus a user's booked dates/confirmations,
// describe the SHAPE OF THE PLAN (not the person), coverage dimensions,
// dependency gaps, and recommendations. No React, no I/O.
//
// حدّ هذه الوحدة (تدقيق القياس 2026-11-13 §4.12): هي قراءة وصفية لخطة حجز،
// وليست أداة قياس. مدخلها تواريخ حجز لا غير، فلا يصح أن يُستخرج منها وصف
// لشخصية صاحبها ولا لطريقة تفكيره. كل نص هنا يصف الخطة نفسها.

import { TRACKS } from "../config/constants";

// الأوزان من مصدرها الوحيد (constants.js)، لا تُكتب هنا مرة ثانية.
const TRACK_WEIGHTS = Object.fromEntries(TRACKS.map(t => [t.id, t.weight]));
const TRACK_ORDER = Object.fromEntries(TRACKS.map((t, i) => [t.id, i]));

// أشكال الخطة. المفاتيح الداخلية باقية كما هي (patternId)، والنص وصف للخطة.
export const PATTERNS = {
  sequential: {
    id: 'sequential', nameAr: 'تسلسلي', icon: '→',
    desc: 'في خطتك مسار واحد على الأقل يتقدم مرحلة بعد مرحلة: ثلاث عمليات أو أكثر منه محجوزة بترتيب مراحلها.',
  },
  breadthFirst: {
    id: 'breadthFirst', nameAr: 'استكشافي عرضي', icon: '⟷',
    desc: 'حجوزاتك الأولى تتوزع على ثلاثة مسارات أو أكثر في مرحلة أو مرحلتين، قبل التقدم في أي مسار منها.',
  },
  integrative: {
    id: 'integrative', nameAr: 'تكاملي', icon: '◈',
    desc: 'خطتك تجمع بين مسارات ومراحل مختلفة، ولا يغلب عليها شكل واحد من الأشكال الأخرى.',
  },
  foundationFocused: {
    id: 'foundationFocused', nameAr: 'تأسيسي', icon: '▣',
    desc: 'ثلاثة أرباع حجوزاتك أو أكثر تقع في المرحلتين الأولى والثانية، أي في جانب الهوية الحالية.',
  },
  outcomeDriven: {
    id: 'outcomeDriven', nameAr: 'موجه بالنتائج', icon: '◎',
    desc: 'ثلاثة أرباع حجوزاتك أو أكثر تقع في المرحلتين الثالثة والرابعة، أي في جانب الهوية الاعتبارية الجديدة.',
  },
  diagnostic: {
    id: 'diagnostic', nameAr: 'تشخيصي', icon: '◉',
    desc: 'خطتك تحجز المرحلة الأولى في ثلاثة مسارات أو أكثر.',
  },
};

// ── ترتيب الحجوزات ──
// بالتاريخ أولًا. وعند تساوي التاريخ: المرحلة الأدنى أولًا، ثم ترتيب المسار في
// TRACKS. فالنتيجة لا تتوقف على ترتيب المصفوفة الداخل ولا على ثبات الفرز.
// (أثره: عمليتان من مسار واحد في يوم واحد تُعدّان بترتيب مراحلهما.)
export function sortBookings(booked, dates) {
  return [...booked].sort((a, b) =>
    (new Date(dates[a.key]) - new Date(dates[b.key]))
    || (a.phaseId - b.phaseId)
    || ((TRACK_ORDER[a.trackId] ?? 99) - (TRACK_ORDER[b.trackId] ?? 99)));
}

// ── شكل الخطة: قائمة أسبقية واحدة، وأول قاعدة تنطبق هي النتيجة ──
// الأشكال غير متنافية (خطة واحدة قد تحقق أكثر من قاعدة)، فالأسبقية قرار معلن:
// الأخص قبل الأعم، وما يصف بنية الخطة كلها قبل ما يصف جزءًا منها.
//
//  1. sequential        ثلاث عمليات أو أكثر من مسار واحد، محجوزة بترتيب زمني
//                       ومراحلها تصعد +1 كل مرة. أشد القواعد شرطًا (مسار وترتيب
//                       ومرحلة معًا) وأبعدها عن الوقوع مصادفة، فتُقدَّم. وقواعد
//                       النسبة لا تنقضها: سلسلة 1←2←3 ثلثاها في المرحلتين الأوليين
//                       بطبيعتها، وكان حجز إضافي واحد يقلبها «تأسيسية» بصمت.
//  2. diagnostic        المرحلة الأولى محجوزة في ثلاثة مسارات أو أكثر. أخص من
//                       «تأسيسي» (حالة منه في الغالب) فتسبقه، كما كان.
//  3. outcomeDriven     75% من الحجوزات أو أكثر في المرحلتين 3 و4.
//  4. foundationFocused 75% أو أكثر في المرحلتين 1 و2. (3 و4 لا يجتمعان، فلا
//                       أثر لترتيبهما.)
//  5. breadthFirst      أول أربعة حجوزات تمس ثلاثة مسارات أو أكثر في مرحلتين على
//                       الأكثر. يصف بداية الخطة فقط، فيتأخر عما يصفها كلها.
//  6. integrative       ما عدا ذلك.
//
// الفرق عن السلوك السابق («آخر قاعدة تنطبق تغلب»): الخطة المتسلسلة كانت
// تُعاد تسميتها تشخيصية أو تأسيسية أو موجهة بالنتائج إن انطبقت إحداها معها،
// والآن تبقى متسلسلة. بقية الأسبقيات على حالها.
// العتبات (75%، أول أربعة، ثلاثة مسارات) اصطلاحية بلا سند تجريبي.
export function detectPattern(sorted) {
  const count = sorted.length;

  const byTrack = {};
  sorted.forEach(p => { (byTrack[p.trackId] ||= []).push(p.phaseId); });
  const hasSequential = Object.values(byTrack).some(seq =>
    seq.length >= 3 && seq.every((ph, i) => i === 0 || ph === seq[i - 1] + 1));
  if (hasSequential) return 'sequential';

  const phase1Tracks = new Set(sorted.filter(p => p.phaseId === 1).map(p => p.trackId));
  if (phase1Tracks.size >= 3) return 'diagnostic';

  const p34Count = sorted.filter(p => p.phaseId >= 3).length;
  if (p34Count >= count * 0.75) return 'outcomeDriven';

  const p12Count = sorted.filter(p => p.phaseId <= 2).length;
  if (p12Count >= count * 0.75) return 'foundationFocused';

  const first = sorted.slice(0, 4);
  if (new Set(first.map(p => p.trackId)).size >= 3 && new Set(first.map(p => p.phaseId)).size <= 2) return 'breadthFirst';

  return 'integrative';
}

// ── الجاهزية: درجات متداخلة، كل درجة تشترط التي دونها ──
//  early    (مبكرة)  ما دون ذلك.
//  medium   (متوسطة) مساران أو أكثر، والمرحلتان الأولى والثانية محجوزتان.
//  advanced (متقدمة) شروط «متوسطة» + ثلاثة مسارات أو أكثر + ثلاث مراحل أو أكثر.
//  complete (شاملة)  شروط «متقدمة» + المسارات الأربعة + المراحل الأربع.
// كانت «متقدمة» لا تشترط المرحلتين 1 و2، فخطة بمراحل 1 و3 و4 تتخطى «متوسطة»
// إلى «متقدمة». الآن تبقى «مبكرة» حتى تُحجز المرحلة الثانية.
export function readinessOf(tracks, phases) {
  const medium = tracks.size >= 2 && phases.has(1) && phases.has(2);
  const advanced = medium && tracks.size >= 3 && phases.size >= 3;
  const complete = advanced && tracks.size === 4 && phases.size === 4;
  if (complete) return { readiness: 'complete', readinessAr: 'شاملة' };
  if (advanced) return { readiness: 'advanced', readinessAr: 'متقدمة' };
  if (medium) return { readiness: 'medium', readinessAr: 'متوسطة' };
  return { readiness: 'early', readinessAr: 'مبكرة' };
}

export const RECOMMENDATIONS_TABLE = [
  { id: 'no_phase1', condition: (ctx) => !ctx.phases.has(1), text: 'يُنصح بالبدء من المرحلة الأولى لبناء أساس واقعي للتحول' },
  { id: 'single_track', condition: (ctx) => ctx.tracks.size === 1, text: 'يُنصح بالتوسع لمسارات إضافية لتحقيق تكامل بين أبعاد التحول' },
  { id: 'skipped_phases', condition: (ctx) => (ctx.phases.has(3) || ctx.phases.has(4)) && !ctx.phases.has(1) && !ctx.phases.has(2), text: 'البناء على مراحل سابقة يضمن نضجاً أعمق — يُنصح بتغطية الفجوة' },
  { id: 'theory_only', condition: (ctx) => ctx.tracks.has('creation') && ctx.tracks.has('innovation') && !ctx.tracks.has('establishment') && !ctx.tracks.has('making'), text: 'التحليل بدون تنفيذ يبقى نظرياً — يُنصح بالانتقال لمسارات التجسيد' },
  { id: 'exec_only', condition: (ctx) => !ctx.tracks.has('creation') && !ctx.tracks.has('innovation') && (ctx.tracks.has('establishment') || ctx.tracks.has('making')), text: 'التنفيذ بدون تأسيس هوياتي قد يفتقر للعمق — يُنصح بتغطية مسارات الهوية' },
  { id: 'full_coverage', condition: (ctx) => ctx.tracks.size === 4 && ctx.phases.size === 4, text: 'تغطية شاملة ممتازة — المسار جاهز لبناء خطة تنفيذ متكاملة' },
  { id: 'current_only', condition: (ctx) => ctx.phases.size > 0 && [...ctx.phases].every(p => p <= 2), text: 'الفهم العميق للواقع أساس ممتاز — الخطوة التالية الانتقال لبناء الهوية الجديدة' },
  { id: 'new_only', condition: (ctx) => ctx.phases.size > 0 && [...ctx.phases].every(p => p >= 3), text: 'بناء هوية جديدة دون فهم الحالية قد ينتج هوية منفصلة عن الواقع' },
  { id: 'integrative_deep', condition: (ctx) => ctx.patternId === 'integrative' && ctx.tracks.size >= 3, text: 'خطتك تمتد على ثلاثة مسارات أو أكثر، ويُنصح بتعميق كل مسار بعد الاستكشاف الأولي' },
  { id: 'has_dep_gaps', condition: (ctx) => ctx.depGaps.length > 0, text: 'هناك عمليات تتغذى على عمليات سابقة لم تُحجز — يُنصح بتغطية التبعيات' },
];

export function analyzeBookings(procs, dates, confirmed) {
  const booked = procs.filter(p => dates[p.key]);
  const bookedKeys = new Set(booked.map(p => p.key));
  const count = booked.length;

  if (count < 3) return null;

  const sorted = sortBookings(booked, dates);

  // Track/Phase coverage
  const tracks = new Set(booked.map(p => p.trackId));
  const phases = new Set(booked.map(p => p.phaseId));

  const patternId = detectPattern(sorted);
  const pattern = PATTERNS[patternId];

  // ── Dimensions ──
  const trackCoverage = { total: 4, covered: tracks.size, pct: Math.round((tracks.size / 4) * 100) };
  const phaseCoverage = { total: 4, covered: phases.size, pct: Math.round((phases.size / 4) * 100) };

  // Weight balance
  const totalWeight = Object.values(TRACK_WEIGHTS).reduce((s, w) => s + w, 0);
  const coveredWeight = [...tracks].reduce((s, t) => s + (TRACK_WEIGHTS[t] || 0), 0);
  const weightBalance = { totalWeight, coveredWeight, pct: Math.round((coveredWeight / totalWeight) * 100) };

  // أبعد مرحلة محجوزة. المراحل ترتيبية، فلا يُحسب لها متوسط بكسر عشري
  // (كان avgPhase)، والحد الأعلى إحصاء صحيح للبيانات الترتيبية.
  const furthestPhase = Math.max(...booked.map(p => p.phaseId));

  const { readiness, readinessAr } = readinessOf(tracks, phases);

  // ── Dependency Gaps ──
  const depGaps = [];
  booked.forEach(p => {
    (p.fedBy || []).forEach(depKey => {
      if (!bookedKeys.has(depKey)) {
        const depProc = procs.find(x => x.key === depKey);
        if (depProc) {
          depGaps.push({
            process: p.nameAr, processKey: p.key,
            missing: depProc.nameAr, missingKey: depKey,
            missingTrack: depProc.trackNameAr, missingIcon: depProc.trackIcon,
          });
        }
      }
    });
  });

  // ── Recommendations ──
  const ctx = { tracks, phases, patternId, depGaps, count, booked };
  const recommendations = RECOMMENDATIONS_TABLE.filter(r => r.condition(ctx)).map(r => r.text).slice(0, 4);

  // ── Booking Timeline ──
  const timeline = sorted.map((p, i) => ({
    step: i + 1, key: p.key, nameAr: p.nameAr,
    trackId: p.trackId, trackNameAr: p.trackNameAr, trackColor: p.trackColor, trackIcon: p.trackIcon,
    phaseId: p.phaseId, phaseNameAr: p.phaseNameAr,
    date: dates[p.key], isConfirmed: !!confirmed[p.key],
  }));

  // ── Track Distribution ──
  const trackDist = TRACKS.map(t => ({
    id: t.id, nameAr: t.nameAr, icon: t.icon, color: t.color, weight: t.weight,
    count: booked.filter(p => p.trackId === t.id).length,
    total: 4, pct: Math.round((booked.filter(p => p.trackId === t.id).length / 4) * 100),
  }));

  return {
    pattern, patternId,
    trackCoverage, phaseCoverage, weightBalance, furthestPhase,
    readiness, readinessAr,
    depGaps, recommendations,
    timeline, trackDist,
    totalBooked: count, totalProcesses: 16,
    isComplete: count === 16,
  };
}
