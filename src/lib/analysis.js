// ════════════════════════════════════════════════════════════════
// ANALYSIS ENGINE — Pattern Detection + Recommendations
// ════════════════════════════════════════════════════════════════
// Pure module: given the process list plus a user's booked dates/confirmations,
// derive their working pattern, coverage dimensions, dependency gaps, and
// recommendations. No React, no I/O — safe to unit-test in isolation.

import { TRACKS } from "../config/constants";

export const PATTERNS = {
  sequential: {
    id: 'sequential', nameAr: 'تسلسلي', icon: '→',
    desc: 'تفضّل إكمال مسار كامل قبل الانتقال لغيره — تفكير عميق ومركز. هذا النمط يعكس شخصية منهجية تؤمن بأن الإتقان يسبق التوسع.',
  },
  breadthFirst: {
    id: 'breadthFirst', nameAr: 'استكشافي عرضي', icon: '⟷',
    desc: 'تستكشف المسارات المتعددة قبل التعمق — رؤية شمولية. هذا النمط يعكس تفكيراً استراتيجياً يرى الصورة الكاملة قبل التفاصيل.',
  },
  integrative: {
    id: 'integrative', nameAr: 'تكاملي', icon: '◈',
    desc: 'تبحث عن نقاط التقاطع بين المسارات — تفكير منظومي. هذا النمط يعكس وعياً بأن المسارات مترابطة وأن القيمة الحقيقية في التكامل.',
  },
  foundationFocused: {
    id: 'foundationFocused', nameAr: 'تأسيسي', icon: '▣',
    desc: 'تبني أساساً قوياً قبل الانطلاق — حكمة البناء المتين. هذا النمط يعكس إدراكاً بأن التحول الحقيقي يبدأ من الجذور.',
  },
  outcomeDriven: {
    id: 'outcomeDriven', nameAr: 'موجه بالنتائج', icon: '◎',
    desc: 'تهتم بالمخرجات النهائية والتطبيق العملي. هذا النمط يعكس توجهاً عملياتياً يركز على القيمة الملموسة.',
  },
  diagnostic: {
    id: 'diagnostic', nameAr: 'تشخيصي', icon: '◉',
    desc: 'تريد فهم الصورة الكاملة قبل أي تنفيذ — نهج استراتيجي. هذا النمط يعكس تفكيراً تحليلياً يؤمن بأن التشخيص الدقيق نصف العلاج.',
  },
  reEvaluating: {
    id: 'reEvaluating', nameAr: 'معاد التقييم', icon: '↺',
    desc: 'تعيد تقييم أولوياتك — مرحلة نضج في التفكير. هذا النمط يعكس مرونة ذهنية وقدرة على التكيف مع المعطيات الجديدة.',
  },
};

export const RECOMMENDATIONS_TABLE = [
  { id: 'no_phase1', condition: (ctx) => !ctx.phases.has(1), text: 'يُنصح بالبدء من المرحلة الأولى لبناء أساس واقعي للتحول' },
  { id: 'single_track', condition: (ctx) => ctx.tracks.size === 1, text: 'يُنصح بالتوسع لمسارات إضافية لتحقيق تكامل بين أبعاد التحول' },
  { id: 'skipped_phases', condition: (ctx) => (ctx.phases.has(3) || ctx.phases.has(4)) && !ctx.phases.has(1) && !ctx.phases.has(2), text: 'البناء على مراحل سابقة يضمن نضجاً أعمق — يُنصح بتغطية الفجوة' },
  { id: 'theory_only', condition: (ctx) => ctx.tracks.has('creation') && ctx.tracks.has('innovation') && !ctx.tracks.has('establishment') && !ctx.tracks.has('making'), text: 'التحليل بدون تنفيذ يبقى نظرياً — يُنصح بالانتقال لمسارات التجسيد' },
  { id: 'exec_only', condition: (ctx) => !ctx.tracks.has('creation') && !ctx.tracks.has('innovation') && (ctx.tracks.has('establishment') || ctx.tracks.has('making')), text: 'التنفيذ بدون تأسيس هوياتي قد يفتقر للعمق — يُنصح بتغطية مسارات الهوية' },
  { id: 'full_coverage', condition: (ctx) => ctx.tracks.size === 4 && ctx.phases.size === 4, text: 'تغطية شاملة ممتازة — المسار جاهز لبناء خطة تنفيذ متكاملة' },
  { id: 'current_only', condition: (ctx) => ctx.phases.size > 0 && [...ctx.phases].every(p => p <= 2), text: 'الفهم العميق للواقع أساس ممتاز — الخطوة التالية الانتقال لبناء الهوية الجديدة' },
  { id: 'new_only', condition: (ctx) => ctx.phases.size > 0 && [...ctx.phases].every(p => p >= 3), text: 'بناء هوية جديدة دون فهم الحالية قد ينتج هوية منفصلة عن الواقع' },
  { id: 'integrative_deep', condition: (ctx) => ctx.patternId === 'integrative' && ctx.tracks.size >= 3, text: 'نمط منظومي متقدم — يُنصح بتعميق كل مسار بعد الاستكشاف الأولي' },
  { id: 'has_dep_gaps', condition: (ctx) => ctx.depGaps.length > 0, text: 'هناك عمليات تتغذى على عمليات سابقة لم تُحجز — يُنصح بتغطية التبعيات' },
];

export function analyzeBookings(procs, dates, confirmed) {
  const booked = procs.filter(p => dates[p.key]);
  const bookedKeys = new Set(booked.map(p => p.key));
  const count = booked.length;

  if (count < 3) return null;

  // Sort by date booked
  const sorted = [...booked].sort((a, b) => new Date(dates[a.key]) - new Date(dates[b.key]));

  // Track/Phase coverage
  const tracks = new Set(booked.map(p => p.trackId));
  const phases = new Set(booked.map(p => p.phaseId));

  // ── Pattern Detection ──
  let patternId = 'integrative'; // default

  // Check Sequential: consecutive in same track (1→2→3→4)
  const trackSequences = {};
  sorted.forEach(p => {
    if (!trackSequences[p.trackId]) trackSequences[p.trackId] = [];
    trackSequences[p.trackId].push(p.phaseId);
  });
  const hasSequential = Object.values(trackSequences).some(seq => {
    if (seq.length < 3) return false;
    for (let i = 1; i < seq.length; i++) { if (seq[i] !== seq[i-1] + 1) return false; }
    return true;
  });
  if (hasSequential) patternId = 'sequential';

  // Check Breadth-First: same phase from different tracks first
  else {
    const firstPhases = sorted.slice(0, Math.min(4, count)).map(p => p.phaseId);
    const firstTracks = new Set(sorted.slice(0, Math.min(4, count)).map(p => p.trackId));
    if (firstTracks.size >= 3 && new Set(firstPhases).size <= 2) patternId = 'breadthFirst';
  }

  // Check Foundation-Focused: mostly phase 1-2
  const p12Count = booked.filter(p => p.phaseId <= 2).length;
  if (p12Count >= count * 0.75 && count >= 3) patternId = 'foundationFocused';

  // Check Outcome-Driven: mostly phase 3-4
  const p34Count = booked.filter(p => p.phaseId >= 3).length;
  if (p34Count >= count * 0.75 && count >= 3) patternId = 'outcomeDriven';

  // Check Diagnostic: phase 1 from 3+ tracks
  const phase1Tracks = new Set(booked.filter(p => p.phaseId === 1).map(p => p.trackId));
  if (phase1Tracks.size >= 3) patternId = 'diagnostic';

  const pattern = PATTERNS[patternId];

  // ── Dimensions ──
  const trackCoverage = { total: 4, covered: tracks.size, pct: Math.round((tracks.size / 4) * 100) };
  const phaseCoverage = { total: 4, covered: phases.size, pct: Math.round((phases.size / 4) * 100) };

  // Weight balance
  const TRACK_WEIGHTS = { creation: 19, innovation: 21, establishment: 47, making: 13 };
  const totalWeight = Object.values(TRACK_WEIGHTS).reduce((s, w) => s + w, 0);
  const coveredWeight = [...tracks].reduce((s, t) => s + (TRACK_WEIGHTS[t] || 0), 0);
  const weightBalance = { totalWeight, coveredWeight, pct: Math.round((coveredWeight / totalWeight) * 100) };

  // Average phase
  const avgPhase = (booked.reduce((s, p) => s + p.phaseId, 0) / count).toFixed(1);

  // Readiness
  let readiness = 'early', readinessAr = 'مبكرة';
  if (tracks.size >= 2 && phases.has(1) && phases.has(2)) { readiness = 'medium'; readinessAr = 'متوسطة'; }
  if (tracks.size >= 3 && phases.size >= 3) { readiness = 'advanced'; readinessAr = 'متقدمة'; }
  if (tracks.size === 4 && phases.size === 4) { readiness = 'complete'; readinessAr = 'شاملة'; }

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
    trackCoverage, phaseCoverage, weightBalance, avgPhase,
    readiness, readinessAr,
    depGaps, recommendations,
    timeline, trackDist,
    totalBooked: count, totalProcesses: 16,
    isComplete: count === 16,
  };
}
