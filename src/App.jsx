import React, { useState, useEffect, useCallback, useMemo } from "react";

/*
╔══════════════════════════════════════════════════════════════╗
║  Milestone Impact — مصفوفة التأثير                          ║
║  Version 5.0 — Production Ready                             ║
║                                                              ║
║  Admin: Secured via AWS Lambda (API_URL)                     ║
║  To change password: AWS Console → Lambda → Env Variables    ║
║                                                              ║
║  © 2026 Milestone Impact. All rights reserved.               ║
╚══════════════════════════════════════════════════════════════╝
*/

// ════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════

function gregorianToHijri(gDate) {
  const d = new Date(gDate);
  const gy = d.getFullYear(), gm = d.getMonth() + 1, gd = d.getDate();
  let jd = Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4)
    + Math.floor((367 * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12)
    - Math.floor((3 * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4) + gd - 32075;
  let l = jd - 1948440 + 10632;
  let n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  let j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719)
    + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hm = Math.floor((24 * l) / 709);
  const hd = l - Math.floor((709 * hm) / 24);
  const hy = 30 * n + j - 30;
  const months = ["محرم", "صفر", "ربيع الأول", "ربيع الثاني", "جمادى الأولى",
    "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  return { day: hd, month: hm, year: hy, formatted: `${hd} ${months[hm - 1]} ${hy}هـ` };
}

function fmtGregorian(d) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric", month: "long", day: "numeric", calendar: "gregory"
  }).format(new Date(d));
}

function fmtShort(d) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(d));
}

function fmtBoth(d) {
  const h = gregorianToHijri(d);
  const g = fmtGregorian(d);
  return { hijri: h.formatted, gregorian: g, both: `${h.formatted} | ${g}` };
}

function todayISO() { return new Date().toISOString().split("T")[0]; }
function validPhone(p) { return /^05\d{8}$/.test(p.replace(/\s/g, "")); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function isPast(d) { const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(d) < t; }

// ════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════

const API_URL = 'https://wmfbw7ff71.execute-api.us-east-1.amazonaws.com';

const BRAND = {
  color: "#6B9DAD",
  dark: "#4A7A8A",
  light: "#8BBCC8",
  deep: "#3A5F6D"
};

const TRACKS = [
  { id: "creation", nameAr: "الخلق", weight: 19, color: "#8B6914", contentAr: "الإرث التاريخي", icon: "◈" },
  { id: "innovation", nameAr: "الإبداع", weight: 2, color: "#5B7B3A", contentAr: "إعادة التعريف", icon: "◉" },
  { id: "establishment", nameAr: "الإنشاء", weight: 27, color: "#2E6B8A", contentAr: "تكوين المنتج", icon: "◆" },
  { id: "making", nameAr: "الجعل", weight: 13, color: "#6B4E3D", contentAr: "الاندماج", icon: "◇" },
];

const PHASES = [
  { id: 1, nameAr: "المرحلة الأولى", group: "current", groupAr: "الهوية الحالية" },
  { id: 2, nameAr: "المرحلة الثانية", group: "current", groupAr: "الهوية الحالية" },
  { id: 3, nameAr: "المرحلة الثالثة", group: "new", groupAr: "الهوية الاعتبارية الجديدة" },
  { id: 4, nameAr: "المرحلة الرابعة", group: "new", groupAr: "الهوية الاعتبارية الجديدة" },
];

const OPERATIONS = {
  creation: [
    { nameAr: "تحليل ديموغرافي", dur: 5, desc: "تحليل شامل للفئات المستهدفة والسوق والبيئة التنافسية" },
    { nameAr: "تحليل المنتجات", dur: 4, desc: "مراجعة وتقييم المنتجات الحالية وتحديد الفجوات" },
    { nameAr: "تكوين الهوية الجديدة", dur: 6, desc: "بناء عناصر الهوية البصرية والمفاهيمية الجديدة" },
    { nameAr: "تكوين القيمة التاريخية", dur: 3, desc: "توثيق واستثمار الإرث المؤسسي التاريخي" },
  ],
  innovation: [
    { nameAr: "تكوين معرفي", dur: 4, desc: "بناء قاعدة المعرفة المؤسسية وأنظمة التعلم" },
    { nameAr: "إعادة تشكيل العلاقات", dur: 5, desc: "إعادة هيكلة شبكة العلاقات وأصحاب المصلحة" },
    { nameAr: "الدمج مع الهوية الجديدة", dur: 6, desc: "مزج العناصر القديمة مع الجديدة بشكل متناغم" },
    { nameAr: "تكوين أنواع القيم", dur: 4, desc: "تصنيف وتطوير منظومة القيم المؤسسية" },
  ],
  establishment: [
    { nameAr: "القدرات المؤسسة", dur: 5, desc: "تطوير القدرات التنظيمية والتشغيلية الأساسية" },
    { nameAr: "القدرات القيادية", dur: 4, desc: "بناء وتمكين الكوادر القيادية والإدارية" },
    { nameAr: "بداية البراندنج", dur: 7, desc: "إطلاق استراتيجية العلامة التجارية في السوق" },
    { nameAr: "القيمة المستقبلية", dur: 3, desc: "رسم خارطة القيمة طويلة المدى والرؤية المستقبلية" },
  ],
  making: [
    { nameAr: "الاندماج مع مجالس الإدارة", dur: 5, desc: "مواءمة التحول مع هياكل الحوكمة المؤسسية" },
    { nameAr: "قيادة المنتج", dur: 4, desc: "قيادة دورة حياة المنتج من التطوير للإطلاق" },
    { nameAr: "الاندماج مع منتجات أخرى", dur: 6, desc: "التكامل مع المنظومة الأوسع والشراكات" },
    { nameAr: "الإطلاق", dur: 3, desc: "الإطلاق الرسمي والتشغيل الكامل" },
  ],
};

// ════════════════════════════════════════════════════════════════
// ANALYSIS ENGINE — Pattern Detection + Recommendations
// ════════════════════════════════════════════════════════════════

const PATTERNS = {
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

const RECOMMENDATIONS_TABLE = [
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

function analyzeBookings(procs, dates, confirmed) {
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
  const TRACK_WEIGHTS = { creation: 19, innovation: 2, establishment: 27, making: 13 };
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

// ════════════════════════════════════════════════════════════════
// DATABASE — Supabase (centralized, all devices see same data)
// ════════════════════════════════════════════════════════════════
// Setup: see SUPABASE-GUIDE.md
// 1. Create free account at supabase.com
// 2. Create table "registrations" 
// 3. Paste your URL and anon key below

const SUPABASE_URL = 'https://eormhcupwgwpllhrfxxg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0';

// OTP Helper - calls Edge Function
const OTP = {
  async send(email) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'send' }),
      });
      return await res.json();
    } catch (e) { return { success: false, message: 'خطأ في الاتصال' }; }
  },
  async verify(email, otp) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, action: 'verify' }),
      });
      return await res.json();
    } catch (e) { return { success: false, message: 'خطأ في الاتصال' }; }
  },
};

const supabase = {
  async query(method, path, body) {
    const opts = {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : undefined,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    // Clean undefined headers
    Object.keys(opts.headers).forEach(k => opts.headers[k] === undefined && delete opts.headers[k]);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  }
};

const isSupabaseConfigured = !SUPABASE_URL.includes('YOUR_PROJECT');

// Fallback to localStorage if Supabase not configured yet
const DB = isSupabaseConfigured ? {
  async getAll(prefix) {
    try {
      const data = await supabase.query('GET', `registrations?id=like.${prefix}*&select=*`);
      return data || [];
    } catch (e) { return []; }
  },
  async save(key, data) {
    try {
      // Upsert: insert or update
      const payload = { ...data, id: key };
      const existing = await supabase.query('GET', `registrations?id=eq.${key}&select=id`);
      if (existing && existing.length > 0) {
        await supabase.query('PATCH', `registrations?id=eq.${key}`, payload);
      } else {
        await supabase.query('POST', 'registrations', payload);
      }
      return true;
    } catch (e) { return false; }
  },
  async get(key) {
    try {
      const data = await supabase.query('GET', `registrations?id=eq.${key}&select=*`);
      return data && data.length > 0 ? data[0] : null;
    } catch (e) { return null; }
  },
} : {
  // Fallback: localStorage (for local dev before Supabase setup)
  async getAll(prefix) {
    try {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          try { items.push(JSON.parse(localStorage.getItem(key))); } catch (e) {}
        }
      }
      return items;
    } catch (e) { return []; }
  },
  async save(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch (e) { return false; } },
  async get(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
};

// ════════════════════════════════════════════════════════════════
// MI LOGO SVG COMPONENT
// ════════════════════════════════════════════════════════════════

const MILogo = ({ size = 40, color = BRAND.color }) => (
  <svg viewBox="0 0 60 70" fill="none" style={{ width: size, height: size * 70 / 60 }}>
    <path d="M30 8L45 23L30 38L15 23Z" stroke={color} strokeWidth="2" fill="none" />
    <circle cx="30" cy="23" r="4" stroke={color} strokeWidth="1.5" fill="none" />
    <line x1="30" y1="38" x2="30" y2="50" stroke={color} strokeWidth="2" />
    <path d="M18 50L30 65L42 50" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

// ════════════════════════════════════════════════════════════════
// INTRO ANIMATION COMPONENT
// ════════════════════════════════════════════════════════════════

const Intro = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2400),
      setTimeout(() => onComplete(), 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#FAFAF7", zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      transition: "opacity 0.8s ease", opacity: step >= 3 ? 0 : 1,
      pointerEvents: step >= 3 ? "none" : "all",
    }}>
      {/* Diamond Logo */}
      <div style={{
        transition: "all 1s cubic-bezier(0.22, 1, 0.36, 1)",
        transform: step >= 1 ? "scale(1) rotate(0deg)" : "scale(0.3) rotate(-90deg)",
        opacity: step >= 1 ? 1 : 0, marginBottom: "1.5rem",
      }}>
        <MILogo size={70} color={BRAND.color} />
      </div>

      {/* Brand Name */}
      <div style={{
        transition: "all 0.8s ease", opacity: step >= 2 ? 1 : 0,
        transform: step >= 2 ? "translateY(0)" : "translateY(15px)",
      }}>
        <div style={{
          fontFamily: "'Tajawal', sans-serif", fontSize: "2.4rem", fontWeight: 300,
          color: BRAND.color, letterSpacing: "4px", textAlign: "center", lineHeight: 1.2,
        }}>
          Milestone
          <br />
          Impact
        </div>
        <div style={{
          textAlign: "center", marginTop: "0.8rem", fontFamily: "'Amiri', serif",
          fontSize: "1rem", color: BRAND.dark, letterSpacing: "1px",
        }}>
          مصفوفة التأثير • هندسة اجتماعية
        </div>
      </div>

      {/* Progress Line */}
      <div style={{
        width: 180, height: 2, background: "#E8EFF1", borderRadius: 2,
        marginTop: "2rem", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", background: `linear-gradient(90deg, ${BRAND.color}, ${BRAND.light})`,
          borderRadius: 2, transition: "width 2.5s ease", width: step >= 1 ? "100%" : "0%",
        }} />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// PRINT FUNCTION (real working print)
// ════════════════════════════════════════════════════════════════

function printFinalTable(user, procs, dates, confirmed) {
  const rows = procs
    .filter(p => dates[p.key])
    .sort((a, b) => new Date(dates[a.key]) - new Date(dates[b.key]))
    .map((p, i) => {
      const d = dates[p.key];
      const h = gregorianToHijri(d);
      const g = fmtGregorian(d);
      const status = confirmed[p.key] ? "✓ مؤكد" : "محدد";
      return `<tr>
        <td>${i + 1}</td>
        <td style="font-weight:600">${p.nameAr}</td>
        <td><span style="color:${p.trackColor}">${p.trackIcon} ${p.trackNameAr}</span></td>
        <td>${p.trackWeight}%</td>
        <td>${p.phaseNameAr}</td>
        <td>${p.dur} أيام</td>
        <td>${g}</td>
        <td style="color:#8B6914">${h.formatted}</td>
        <td>${status}</td>
      </tr>`;
    }).join("");

  const now = fmtBoth(new Date());
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>مصفوفة التأثير — ${user.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Tajawal',sans-serif;direction:rtl;padding:2rem;color:#2C2C2C;background:#fff}
    .header{text-align:center;margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:3px solid #6B9DAD}
    .header h1{font-family:'Amiri',serif;font-size:1.8rem;color:#6B9DAD;margin-bottom:.3rem}
    .header p{color:#6B6560;font-size:.9rem}
    .info{display:flex;justify-content:center;gap:2rem;margin-bottom:1.5rem;flex-wrap:wrap}
    .info-item{text-align:center;padding:.5rem 1rem;background:#F4F8F9;border-radius:8px}
    .info-label{font-size:.72rem;color:#6B6560}
    .info-value{font-weight:700;font-size:.95rem}
    table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}
    th{background:#6B9DAD;color:#fff;padding:.6rem .5rem;font-size:.78rem;font-weight:600}
    td{padding:.5rem;border-bottom:1px solid #EDE8DC;font-size:.8rem}
    tr:nth-child(even) td{background:#FAFAF7}
    .footer{text-align:center;margin-top:1.5rem;padding-top:1rem;border-top:2px dashed #EDE8DC}
    .footer p{font-size:.8rem;color:#6B6560;margin-bottom:.3rem}
    .footer strong{color:#6B9DAD}
    .cr{font-size:.7rem;color:#999;margin-top:.5rem}
    @media print{body{padding:1rem}@page{margin:1cm}}
  </style>
</head>
<body>
  <div class="header">
    <h1>Milestone Impact — مصفوفة التأثير</h1>
    <p>نموذج خطة التأثير النهائي • هندسة اجتماعية</p>
  </div>
  <div class="info">
    <div class="info-item"><div class="info-label">اسم المشارك</div><div class="info-value">${user.name}</div></div>
    <div class="info-item"><div class="info-label">رقم الجوال</div><div class="info-value" style="direction:ltr">${user.phone}</div></div>
    <div class="info-item"><div class="info-label">البريد الإلكتروني</div><div class="info-value" style="direction:ltr;font-size:.82rem">${user.email}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>الوزن</th><th>المرحلة</th><th>المدة</th><th>التاريخ الميلادي</th><th>التاريخ الهجري</th><th>الحالة</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <p>تم الإنشاء بتاريخ: <strong>${now.both}</strong></p>
    <p>المشارك: <strong>${user.name}</strong></p>
    <div class="cr">للتواصل: 0532134539 | omar@sunkvalue.com</div>
    <div class="cr">© ${new Date().getFullYear()} Milestone Impact — جميع الحقوق محفوظة</div>
  </div>
  <script>window.onload=function(){window.print()}</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
  else { alert("يرجى السماح بالنوافذ المنبثقة (Popup) لطباعة النموذج.\n\nSettings → Allow pop-ups for this site"); }
}

// ════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════

const FONT_URL = "https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;600;700;800&family=Amiri:wght@400;700&display=swap";

const CSS = `
@import url('${FONT_URL}');
:root {
  --mi: ${BRAND.color}; --mi-d: ${BRAND.dark}; --mi-l: ${BRAND.light}; --mi-dd: ${BRAND.deep};
  --ol: #6B7B3A; --ol-d: #4A5628; --go: #C4A24E; --go-d: #8B6914;
  --cr: #F8F5EE; --sa: #EDE8DC; --ch: #2C2C2C; --wg: #6B6560; --sw: #FAFAF7;
  --ok: #5B7B3A; --no: #A0522D; --rd: #C0392B;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body, #root { font-family: 'Tajawal', sans-serif; background: var(--cr); color: var(--ch); direction: rtl; min-height: 100vh; }
.app { min-height: 100vh; }

/* ── Splash ── */
.splash { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; animation: fadeIn 0.6s; }
.splash h1 { font-family: 'Amiri', serif; font-size: 2.2rem; color: var(--mi-d); text-align: center; margin-bottom: 0.3rem; }
.splash .sub { color: var(--wg); font-size: 0.95rem; margin-bottom: 0.5rem; text-align: center; }
.splash .mi-text { font-family: 'Tajawal', sans-serif; font-size: 1.8rem; font-weight: 300; color: var(--mi); letter-spacing: 3px; text-align: center; margin: 1rem 0; line-height: 1.3; }
.s-actions { display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; justify-content: center; }
.s-btn { padding: 0.75rem 2.2rem; border: 2px solid; border-radius: 12px; font-family: 'Tajawal'; font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: all 0.3s; background: transparent; }
.s-btn:hover { transform: translateY(-2px); }
.s-btn-main { border-color: var(--mi); color: var(--mi); }
.s-btn-main:hover { background: var(--mi); color: #fff; }
.s-btn-admin { border-color: var(--mi-dd); color: var(--mi-dd); }
.s-btn-admin:hover { background: var(--mi-dd); color: #fff; }

/* ── Card ── */
.card { background: var(--sw); border-radius: 20px; padding: 2rem; width: 100%; max-width: 440px; box-shadow: 0 6px 30px rgba(0,0,0,0.05); border: 1px solid rgba(107,157,173,0.1); }
.card h2 { font-family: 'Amiri', serif; font-size: 1.4rem; color: var(--mi-d); margin-bottom: 1.2rem; text-align: center; }
.back-link { text-align: center; margin-top: 1rem; }
.back-link button { background: none; border: none; color: var(--wg); font-family: 'Tajawal'; font-size: 0.85rem; cursor: pointer; text-decoration: underline; }

/* ── Form ── */
.fg { margin-bottom: 1rem; }
.fg label { display: block; font-weight: 500; font-size: 0.85rem; color: var(--wg); margin-bottom: 0.3rem; }
.fg input { width: 100%; padding: 0.75rem 1rem; border: 2px solid var(--sa); border-radius: 10px; font-family: 'Tajawal'; font-size: 0.92rem; color: var(--ch); background: var(--sw); transition: all 0.3s; }
.fg input:focus { outline: none; border-color: var(--mi); box-shadow: 0 0 0 3px rgba(107,157,173,0.12); }
.fg-err input { border-color: var(--rd) !important; }
.fg-msg { font-size: 0.73rem; color: var(--rd); margin-top: 0.2rem; }

/* ── Buttons ── */
.btn { width: 100%; padding: 0.9rem; border: none; border-radius: 12px; font-family: 'Tajawal'; font-size: 1rem; font-weight: 700; color: #fff; background: linear-gradient(135deg, var(--mi-d), var(--mi)); cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 16px rgba(107,157,173,0.3); }
.btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(107,157,173,0.4); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-s { width: auto; padding: 0.55rem 1.1rem; font-size: 0.85rem; border-radius: 9px; }
.btn-gold { background: linear-gradient(135deg, var(--go-d), var(--go)); box-shadow: 0 4px 16px rgba(139,105,20,0.3); }
.btn-outline { background: none; border: 2px solid var(--sa); color: var(--wg); box-shadow: none; }
.btn-outline:hover { border-color: var(--mi); color: var(--mi); transform: none; box-shadow: none; }
.btn-danger { background: linear-gradient(135deg, var(--no), #C0724D); }
.btn-print { background: linear-gradient(135deg, #2C3E50, #34495E); }

/* ── Nav ── */
.nav { background: linear-gradient(135deg, var(--mi-dd), var(--mi-d)); padding: 0.8rem 1.5rem; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 3px 15px rgba(0,0,0,0.1); position: sticky; top: 0; z-index: 100; flex-wrap: wrap; gap: 0.5rem; }
.nav-admin { background: linear-gradient(135deg, #1a1a2e, #16213e); }
.nav-brand { display: flex; align-items: center; gap: 0.5rem; }
.nav-logo { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; }
.nav-text h3 { font-size: 1rem; color: #fff; font-weight: 600; }
.nav-text span { font-size: 0.72rem; color: rgba(255,255,255,0.65); }
.nav-right { display: flex; align-items: center; gap: 0.7rem; }
.tabs { display: flex; gap: 2px; background: rgba(0,0,0,0.2); border-radius: 9px; padding: 2px; }
.tab { padding: 0.4rem 0.9rem; border: none; border-radius: 7px; font-family: 'Tajawal'; font-size: 0.8rem; font-weight: 500; color: rgba(255,255,255,0.6); background: transparent; cursor: pointer; transition: all 0.25s; white-space: nowrap; }
.tab.on { background: rgba(255,255,255,0.2); color: #fff; }
.btn-logout { padding: 0.45rem 0.9rem; border: 1.5px solid rgba(255,255,255,0.4); border-radius: 8px; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); font-family: 'Tajawal'; font-size: 0.78rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
.btn-logout:hover { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.6); }

/* ── Progress ── */
.prog-wrap { padding: 1rem 1.5rem 0; }
.prog-box { background: var(--sw); border-radius: 13px; padding: 1rem 1.2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.prog-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.prog-label { font-weight: 600; font-size: 0.88rem; color: var(--mi-d); }
.prog-pct { font-size: 1.3rem; font-weight: 800; color: var(--mi-d); }
.prog-bar { height: 7px; background: var(--sa); border-radius: 7px; overflow: hidden; }
.prog-fill { height: 100%; background: linear-gradient(90deg, var(--mi-d), var(--mi)); border-radius: 7px; transition: width 0.6s ease; }
.prog-stats { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.76rem; color: var(--wg); flex-wrap: wrap; }
.prog-stats strong { color: var(--ch); }

/* ── Section ── */
.sec { padding: 1.2rem 1.5rem 1.5rem; }
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
.sec-title { font-family: 'Amiri', serif; font-size: 1.2rem; color: var(--mi-d); }

/* ── Banner ── */
.banner { background: linear-gradient(135deg, ${BRAND.color}, ${BRAND.light}); border-radius: 13px; padding: 0.9rem 1.3rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; color: #fff; }
.banner-item { text-align: center; }
.banner-item h4 { font-family: 'Amiri', serif; font-size: 0.95rem; }
.banner-item p { font-size: 0.75rem; opacity: 0.85; }

/* ── Matrix ── */
.mx-groups { display: flex; margin-bottom: 0.4rem; padding-right: 130px; gap: 3px; }
.mx-grp { flex: 1; text-align: center; padding: 0.5rem; font-family: 'Amiri', serif; font-weight: 700; font-size: 0.88rem; color: #fff; border-radius: 9px 9px 0 0; }
.mx-grp-c { background: linear-gradient(135deg, var(--mi-d), var(--mi)); }
.mx-grp-n { background: linear-gradient(135deg, var(--ol-d), var(--ol)); }
.mx-phases { display: flex; margin-bottom: 5px; padding-right: 130px; }
.mx-ph { flex: 1; text-align: center; padding: 0.35rem; font-size: 0.72rem; font-weight: 500; color: var(--wg); background: rgba(0,0,0,0.02); }
.mx-grid { display: flex; flex-direction: column; gap: 5px; }
.mx-row { display: flex; gap: 0; }
.mx-track { width: 130px; min-width: 130px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.75rem 0.4rem; border-radius: 0 10px 10px 0; color: #fff; }
.mx-tw { font-size: 1.2rem; font-weight: 800; }
.mx-tn { font-size: 0.78rem; font-weight: 600; }
.mx-tc { font-size: 0.65rem; opacity: 0.6; }
.mx-cells { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }

.cell { background: var(--sw); border-radius: 10px; padding: 0.75rem; cursor: pointer; transition: all 0.25s; border: 2px solid transparent; position: relative; overflow: hidden; min-height: 88px; display: flex; flex-direction: column; justify-content: space-between; }
.cell:hover { transform: translateY(-2px); box-shadow: 0 5px 16px rgba(0,0,0,0.06); }
.cell .bar { position: absolute; top: 0; right: 0; width: 4px; height: 100%; border-radius: 0 10px 10px 0; }
.cell.done { border-color: rgba(91,123,58,0.3); }
.cell.done::after { content: '✓'; position: absolute; top: 5px; left: 5px; width: 18px; height: 18px; background: var(--ok); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; }
.cell.dated { border-color: rgba(196,162,78,0.2); }
.cell .num { position: absolute; top: 5px; left: 5px; width: 16px; height: 16px; border-radius: 50%; background: var(--sa); color: var(--wg); font-size: 0.58rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.cell.done .num { display: none; }
.cell-name { font-weight: 600; font-size: 0.78rem; line-height: 1.3; margin-bottom: 0.2rem; }
.cell-desc { font-size: 0.67rem; color: var(--wg); line-height: 1.3; margin-bottom: 0.3rem; }
.cell-meta { display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap; }
.cell-dur { font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 4px; background: var(--sa); color: var(--wg); }
.cell-date { font-size: 0.65rem; color: var(--mi-d); font-weight: 500; }

/* ── Missing warning ── */
.missing { background: rgba(192,57,43,0.05); border: 2px solid rgba(192,57,43,0.12); border-radius: 11px; padding: 0.9rem 1.1rem; margin-top: 1rem; }
.missing h4 { color: var(--rd); font-size: 0.88rem; margin-bottom: 0.4rem; }
.missing-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.missing-chip { font-size: 0.72rem; padding: 0.18rem 0.45rem; border-radius: 5px; background: rgba(192,57,43,0.06); color: var(--rd); cursor: pointer; }

/* ── Submit section ── */
.submit { border-radius: 14px; padding: 1.3rem; text-align: center; margin: 1rem 0; }
.submit-ready { background: rgba(107,157,173,0.06); border: 2px solid var(--mi); }
.submit-wait { background: rgba(0,0,0,0.02); border: 2px dashed var(--sa); }
.submit-done { background: rgba(91,123,58,0.05); border: 2px solid var(--ok); }
.submit h3 { font-family: 'Amiri', serif; margin-bottom: 0.4rem; }
.submit p { color: var(--wg); font-size: 0.85rem; margin-bottom: 0.8rem; }

/* ── Modal ── */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.5rem; animation: fadeIn 0.2s; }
.modal { background: var(--sw); border-radius: 20px; padding: 2rem; max-width: 500px; width: 100%; box-shadow: 0 16px 48px rgba(0,0,0,0.12); animation: slideUp 0.3s; max-height: 90vh; overflow-y: auto; }
.modal-badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 6px; color: #fff; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.75rem; }
.modal h2 { font-family: 'Amiri', serif; font-size: 1.3rem; margin-bottom: 0.35rem; }
.modal-desc { color: var(--wg); font-size: 0.88rem; line-height: 1.5; margin-bottom: 1rem; }
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; margin-bottom: 1rem; }
.modal-item { background: var(--cr); padding: 0.55rem 0.75rem; border-radius: 8px; }
.modal-item-label { font-size: 0.68rem; color: var(--wg); }
.modal-item-value { font-weight: 700; font-size: 0.85rem; }
.date-section { background: var(--cr); border-radius: 10px; padding: 0.9rem; margin-bottom: 1rem; }
.date-section h4 { font-size: 0.85rem; color: var(--mi-d); margin-bottom: 0.5rem; }
.date-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.date-row input { flex: 1; min-width: 140px; padding: 0.55rem 0.75rem; border: 2px solid var(--sa); border-radius: 8px; font-family: 'Tajawal'; direction: ltr; }
.hijri-badge { font-size: 0.8rem; color: var(--go-d); font-weight: 600; padding: 0.35rem 0.6rem; background: rgba(196,162,78,0.08); border-radius: 7px; margin-top: 0.35rem; }
.modal-actions { display: flex; gap: 0.5rem; }
.modal-actions .btn { flex: 1; }

/* ── Timeline ── */
.tl { position: relative; padding-right: 1.8rem; }
.tl::before { content: ''; position: absolute; right: 6px; top: 0; bottom: 0; width: 3px; background: linear-gradient(180deg, var(--mi-d), var(--mi)); border-radius: 3px; }
.tl-item { position: relative; padding: 0 1.6rem 1.1rem 0; animation: slideR 0.35s ease both; }
.tl-dot { position: absolute; right: -1.8rem; top: 0.2rem; width: 14px; height: 14px; border-radius: 50%; border: 3px solid; background: var(--sw); }
.tl-card { background: var(--sw); border-radius: 11px; padding: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.03); border-right: 3px solid; }
.tl-step { font-size: 0.65rem; font-weight: 700; color: #fff; padding: 0.1rem 0.4rem; border-radius: 4px; display: inline-block; margin-bottom: 0.3rem; }
.tl-name { font-weight: 700; font-size: 0.9rem; margin-bottom: 0.15rem; }
.tl-track { font-size: 0.75rem; color: var(--wg); margin-bottom: 0.3rem; }
.tl-dates { font-size: 0.75rem; color: var(--mi-d); display: flex; gap: 0.5rem; flex-wrap: wrap; }
.tl-hijri { font-size: 0.7rem; color: var(--go-d); margin-top: 0.15rem; }

/* ── Admin ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1.2rem; }
.stat { background: var(--sw); border-radius: 13px; padding: 1.1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.03); text-align: center; border-top: 3px solid; }
.stat-v { font-size: 1.8rem; font-weight: 800; margin-bottom: 0.15rem; }
.stat-l { font-size: 0.78rem; color: var(--wg); }
.admin-table { background: var(--sw); border-radius: 13px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.03); overflow-x: auto; }
.admin-table table { width: 100%; border-collapse: collapse; min-width: 650px; }
.admin-table th { background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; padding: 0.75rem; font-weight: 600; font-size: 0.78rem; }
.admin-table td { padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--sa); font-size: 0.78rem; }
.badge { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 5px; font-size: 0.7rem; font-weight: 600; }
.badge-ok { background: rgba(91,123,58,0.1); color: var(--ok); }
.badge-wait { background: rgba(196,162,78,0.1); color: var(--go-d); }

/* ── Output Table ── */
.output-card { background: var(--sw); border-radius: 16px; padding: 1.5rem; box-shadow: 0 3px 14px rgba(0,0,0,0.05); margin-bottom: 1.2rem; border: 2px solid var(--mi); }
.output-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
.output-header h3 { font-family: 'Amiri', serif; font-size: 1.3rem; color: var(--mi-d); }
.output-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin-bottom: 1rem; padding: 0.8rem; background: rgba(107,157,173,0.04); border-radius: 10px; }
.output-info-item { text-align: center; }
.output-info-label { font-size: 0.68rem; color: var(--wg); }
.output-info-value { font-weight: 700; font-size: 0.9rem; }
.output-table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 10px; }
.output-table th { background: linear-gradient(135deg, var(--mi-dd), var(--mi-d)); color: #fff; padding: 0.65rem 0.7rem; font-size: 0.75rem; }
.output-table td { padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--sa); font-size: 0.78rem; }
.output-table tr:nth-child(even) td { background: rgba(107,157,173,0.02); }
.output-stamp { text-align: center; margin-top: 1rem; padding-top: 0.8rem; border-top: 2px dashed var(--sa); }
.output-stamp p { font-size: 0.78rem; color: var(--wg); margin-bottom: 0.2rem; }
.copyright { font-size: 0.72rem; color: #999; margin-top: 0.5rem; }

/* ── Summary ── */
.sum-card { background: var(--sw); border-radius: 16px; padding: 1.5rem; box-shadow: 0 3px 14px rgba(0,0,0,0.04); margin-bottom: 1rem; }
.sum-title { font-family: 'Amiri', serif; font-size: 1.2rem; color: var(--mi-d); margin-bottom: 0.7rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--sa); }
.sum-track { padding: 0.75rem; background: var(--cr); border-radius: 9px; border-right: 3px solid; margin-bottom: 0.6rem; }
.sum-track-head { font-weight: 700; margin-bottom: 0.3rem; }
.sum-track-item { display: flex; justify-content: space-between; padding: 0.2rem 0; font-size: 0.78rem; border-bottom: 1px solid rgba(0,0,0,0.03); }

/* ── Toast ── */
.toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); background: var(--ch); color: #fff; padding: 0.75rem 1.3rem; border-radius: 10px; font-size: 0.85rem; z-index: 2000; animation: slideUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards; box-shadow: 0 8px 24px rgba(0,0,0,0.2); max-width: 90vw; text-align: center; }

/* ── Confirm Modal ── */
.confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 1.5rem; animation: fadeIn 0.2s; }
.confirm-box { background: var(--sw); border-radius: 18px; padding: 2rem; max-width: 380px; width: 100%; box-shadow: 0 16px 48px rgba(0,0,0,0.15); animation: slideUp 0.3s; text-align: center; }
.confirm-box h3 { font-family: 'Amiri', serif; font-size: 1.2rem; color: var(--ch); margin-bottom: 0.6rem; }
.confirm-box p { color: var(--wg); font-size: 0.88rem; line-height: 1.6; margin-bottom: 1.2rem; white-space: pre-line; }
.confirm-btns { display: flex; gap: 0.6rem; }
.confirm-btns .btn { flex: 1; padding: 0.7rem; font-size: 0.9rem; }

.empty { text-align: center; padding: 2.5rem 1.5rem; color: var(--wg); }
.empty h3 { font-family: 'Amiri', serif; font-size: 1.15rem; color: var(--ch); margin-bottom: 0.3rem; }

/* ── Footer ── */
.app-footer { text-align: center; padding: 1.5rem; border-top: 1px solid var(--sa); margin-top: 1rem; }
.app-footer p { font-size: 0.75rem; color: #999; }

/* ── Report ── */
.rpt-card { background: var(--sw); border-radius: 16px; padding: 1.5rem; box-shadow: 0 3px 14px rgba(0,0,0,0.05); margin-bottom: 1rem; }
.rpt-pattern { text-align: center; padding: 1.5rem; background: linear-gradient(135deg, rgba(107,157,173,0.06), rgba(107,157,173,0.02)); border-radius: 14px; margin-bottom: 1.2rem; border: 1.5px solid rgba(107,157,173,0.12); }
.rpt-pattern-icon { font-size: 2.5rem; margin-bottom: 0.3rem; }
.rpt-pattern-name { font-family: 'Amiri', serif; font-size: 1.6rem; color: var(--mi-d); margin-bottom: 0.4rem; }
.rpt-pattern-desc { font-size: 0.85rem; color: var(--wg); line-height: 1.7; max-width: 500px; margin: 0 auto; }
.rpt-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin-bottom: 1.2rem; }
.rpt-stat { background: var(--cr); border-radius: 11px; padding: 0.9rem 0.6rem; text-align: center; }
.rpt-stat-v { font-size: 1.5rem; font-weight: 800; margin-bottom: 0.1rem; }
.rpt-stat-l { font-size: 0.72rem; color: var(--wg); }
.rpt-bar-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
.rpt-bar-label { width: 90px; font-size: 0.78rem; font-weight: 600; text-align: left; flex-shrink: 0; }
.rpt-bar-track { flex: 1; height: 22px; background: var(--sa); border-radius: 6px; overflow: hidden; }
.rpt-bar-fill { height: 100%; border-radius: 6px; transition: width 0.8s ease; display: flex; align-items: center; justify-content: flex-end; padding-left: 0.4rem; }
.rpt-bar-pct { font-size: 0.65rem; font-weight: 700; color: #fff; padding-left: 0.3rem; }
.rpt-bar-count { font-size: 0.72rem; color: var(--wg); width: 35px; text-align: center; flex-shrink: 0; }
.rpt-gap { background: rgba(192,57,43,0.04); border: 1.5px solid rgba(192,57,43,0.12); border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.5rem; font-size: 0.8rem; line-height: 1.6; }
.rpt-rec { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.6rem 0.8rem; background: rgba(91,123,58,0.04); border-radius: 9px; margin-bottom: 0.4rem; font-size: 0.82rem; line-height: 1.6; }
.rpt-rec-icon { color: var(--ok); font-size: 1rem; flex-shrink: 0; margin-top: 0.1rem; }
.rpt-empty { text-align: center; padding: 3rem 1.5rem; }
.rpt-empty h3 { font-family: 'Amiri', serif; color: var(--mi-d); font-size: 1.2rem; margin-bottom: 0.5rem; }
.rpt-empty p { color: var(--wg); font-size: 0.88rem; line-height: 1.6; }
.rpt-section-title { font-family: 'Amiri', serif; font-size: 1.1rem; color: var(--mi-d); margin-bottom: 0.7rem; padding-bottom: 0.4rem; border-bottom: 2px solid var(--sa); }
@media (max-width: 640px) { .rpt-stats { grid-template-columns: repeat(2, 1fr); } .rpt-bar-label { width: 70px; font-size: 0.7rem; } }

/* ── Admin Content Editor ── */
.adm-edit-card { background: var(--sw); border-radius: 12px; padding: 1rem; margin-bottom: 0.8rem; border: 1px solid var(--sa); }
.adm-edit-card:hover { border-color: var(--mi); }
.adm-edit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; cursor: pointer; }
.adm-edit-header h4 { font-size: 0.88rem; color: var(--mi-d); margin: 0; }
.adm-field { margin-bottom: 0.6rem; }
.adm-field label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--wg); margin-bottom: 0.2rem; }
.adm-field input, .adm-field textarea { width: 100%; padding: 0.5rem 0.6rem; border: 1.5px solid var(--sa); border-radius: 8px; font-family: 'Tajawal', sans-serif; font-size: 0.82rem; direction: rtl; resize: vertical; box-sizing: border-box; }
.adm-field input:focus, .adm-field textarea:focus { border-color: var(--mi); outline: none; }
.adm-field textarea { min-height: 60px; }
.adm-actions { display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.5rem; }
.adm-consultant { background: linear-gradient(135deg, rgba(107,157,173,0.04), rgba(107,157,173,0.01)); border: 1.5px solid rgba(107,157,173,0.15); border-radius: 12px; padding: 1rem; margin-bottom: 0.8rem; }
.adm-consultant h4 { color: var(--mi-d); font-size: 0.9rem; margin-bottom: 0.4rem; }
.adm-note { font-size: 0.78rem; color: var(--wg); padding: 0.4rem 0.6rem; background: rgba(139,105,20,0.04); border-radius: 7px; margin-bottom: 0.4rem; }

/* ── Smart Suggestions ── */
.smart-box { border-radius: 13px; padding: 1rem 1.2rem; margin-bottom: 1rem; animation: fadeIn 0.5s; }
.smart-welcome { background: linear-gradient(135deg, rgba(107,157,173,0.06), rgba(107,157,173,0.02)); border: 1.5px dashed var(--mi); text-align: center; }
.smart-welcome h3 { font-family: 'Amiri', serif; color: var(--mi-d); font-size: 1.1rem; margin-bottom: 0.3rem; }
.smart-welcome p { font-size: 0.82rem; color: var(--wg); line-height: 1.6; margin-bottom: 0.5rem; }
.smart-progress { background: rgba(91,123,58,0.04); border: 1.5px solid rgba(91,123,58,0.15); }
.smart-progress h4 { color: var(--ok); font-size: 0.9rem; margin-bottom: 0.3rem; }
.smart-progress p { font-size: 0.8rem; color: var(--wg); line-height: 1.5; }
.smart-suggest { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem; }
.smart-chip { font-size: 0.75rem; padding: 0.3rem 0.65rem; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-weight: 500; border: 1.5px solid; }
.smart-chip:hover { transform: translateY(-1px); opacity: 0.85; }
.smart-counter { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.78rem; color: var(--mi-d); font-weight: 600; margin-top: 0.4rem; }

/* ── Cell Hover Tooltip ── */
.cell { position: relative; }
.cell-insight { position: absolute; bottom: -2px; left: 4px; right: 4px; padding: 0.3rem 0.45rem; font-size: 0.62rem; line-height: 1.3; color: #fff; border-radius: 0 0 8px 8px; opacity: 0; transform: translateY(4px); transition: all 0.25s ease; pointer-events: none; z-index: 10; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell:hover .cell-insight { opacity: 1; transform: translateY(0); }
@media (max-width: 640px) { .cell-insight { display: none; } }

/* ── Cell Highlight (connected processes) ── */
.cell.highlighted { box-shadow: 0 0 0 2px rgba(107,157,173,0.5), 0 0 12px rgba(107,157,173,0.25); transform: translateY(-1px); }
.cell.highlighted .cell-name { color: var(--mi-d); }

/* ── Modal Enhanced Sections ── */
.modal-section { margin-bottom: 1rem; }
.modal-section-title { font-size: 0.8rem; font-weight: 700; color: var(--mi-d); margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.3rem; }
.modal-insight-box { background: linear-gradient(135deg, rgba(107,157,173,0.06), rgba(107,157,173,0.02)); border-right: 3px solid var(--mi); border-radius: 8px; padding: 0.7rem 0.9rem; font-size: 0.85rem; font-weight: 600; color: var(--mi-d); line-height: 1.6; }
.modal-why { font-size: 0.82rem; color: var(--wg); line-height: 1.7; padding: 0.5rem 0; }
.modal-outputs { display: flex; flex-direction: column; gap: 0.35rem; }
.modal-output-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--ch); padding: 0.35rem 0.6rem; background: rgba(107,157,173,0.04); border-radius: 7px; }
.modal-output-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.modal-related { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.modal-related-chip { font-size: 0.72rem; padding: 0.25rem 0.55rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; border: 1.5px solid; font-weight: 500; }
.modal-related-chip:hover { transform: translateY(-1px); opacity: 0.85; }
.modal-related-label { font-size: 0.65rem; color: var(--wg); margin-bottom: 0.2rem; }
.modal-divider { height: 1px; background: var(--sa); margin: 0.8rem 0; }

@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideUp { from { opacity: 0; transform: translateY(15px) } to { opacity: 1; transform: translateY(0) } }
@keyframes slideR { from { opacity: 0; transform: translateX(-15px) } to { opacity: 1; transform: translateX(0) } }
@keyframes fadeOut { to { opacity: 0 } }

@media (max-width: 900px) {
  .mx-groups, .mx-phases { padding-right: 85px; }
  .mx-track { width: 85px; min-width: 85px; }
  .output-info { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) {
  .mx-groups, .mx-phases { display: none; }
  .mx-row { flex-direction: column; }
  .mx-track { width: 100%; border-radius: 10px 10px 0 0; flex-direction: row; padding: 0.5rem; gap: 0.4rem; }
  .mx-cells { grid-template-columns: repeat(2, 1fr); }
  .sec { padding: 0.9rem; }
  .banner { flex-direction: column; text-align: center; }
  .output-info { grid-template-columns: 1fr; }
}
`;

// ════════════════════════════════════════════════════════════════
// LOCAL SESSION MANAGER (24-hour persistence)
// ════════════════════════════════════════════════════════════════

const SESSION_KEY = 'mi_local_session';
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

const LocalSession = {
  save(userData, sessionId, dates, confirmed, submitted, reopenRequested) {
    try {
      const payload = {
        user: userData,
        sessionId,
        dates,
        confirmed,
        submitted,
        reopenRequested,
        savedAt: Date.now(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) { console.log('LocalSession save error:', e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload?.savedAt) return null;
      if (Date.now() - payload.savedAt > SESSION_TTL) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return payload;
    } catch (e) { return null; }
  },
  update(fields) {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...payload, ...fields, savedAt: Date.now() }));
    } catch (e) { console.log('LocalSession update error:', e); }
  },
  clear() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  },
};

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════

export default function App() {
  const [introVisible, setIntroVisible] = useState(true);
  const [screen, setScreen] = useState("splash");
  const [tab, setTab] = useState("matrix");
  const [adminTab, setAdminTab] = useState("regs");
  const [adminEditProcess, setAdminEditProcess] = useState(null);
  const [adminEditContent, setAdminEditContent] = useState(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminReportReg, setAdminReportReg] = useState(null);

  const [user, setUser] = useState({ name: "", phone: "", email: "" });
  const [regErrors, setRegErrors] = useState({});
  const [sessionId, setSessionId] = useState(null);
  const [dates, setDates] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [reopenRequested, setReopenRequested] = useState(false);

  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const [allRegs, setAllRegs] = useState([]);
  const [expandedReg, setExpandedReg] = useState(null);
  const [loading, setLoading] = useState(false);

  const [selectedCell, setSelectedCell] = useState(null);
  const [tempDate, setTempDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [toast, setToast] = useState(null);
  const [resumePhone, setResumePhone] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // {title, message, onConfirm}

  // OTP states
  const [otpStep, setOtpStep] = useState("form"); // "form" | "otp"
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpPending, setOtpPending] = useState(null);

  // Process details from Supabase (rich data)
  const [processDetails, setProcessDetails] = useState({});
  const [highlightedKeys, setHighlightedKeys] = useState([]);
  const [appContent, setAppContent] = useState({});

  const hideIntro = useCallback(() => setIntroVisible(false), []);

  // ── Auto-restore local session (24h) ──
  useEffect(() => {
    const session = LocalSession.load();
    if (session?.sessionId && session?.user) {
      setUser(session.user);
      setSessionId(session.sessionId);
      setDates(session.dates || {});
      setConfirmed(session.confirmed || {});
      setSubmitted(session.submitted || false);
      setReopenRequested(session.reopenRequested || false);
      setScreen('main');
      if (session.submitted) setTab('output');
    }
  }, []);

  // Load rich process details + app content from Supabase
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      try {
        const [details, content] = await Promise.all([
          supabase.query('GET', 'process_details?select=*'),
          supabase.query('GET', 'app_content?select=*'),
        ]);
        if (details && details.length) {
          const map = {};
          details.forEach(d => { map[d.process_key] = d; });
          setProcessDetails(map);
        }
        if (content && content.length) {
          const map = {};
          content.forEach(c => { map[c.key] = c.value; });
          setAppContent(map);
        }
      } catch (e) { console.log('Data not loaded:', e); }
    })();
  }, []);

  // Build process list (merge local + Supabase data)
  const procs = useMemo(() => {
    const list = [];
    let idx = 0;
    for (const ph of PHASES) {
      for (const tr of TRACKS) {
        const op = OPERATIONS[tr.id][ph.id - 1];
        const key = `${tr.id}-${ph.id}`;
        const detail = processDetails[key] || {};
        list.push({
          key, trackId: tr.id, trackNameAr: tr.nameAr,
          trackColor: tr.color, trackWeight: tr.weight, trackIcon: tr.icon,
          trackContentAr: tr.contentAr, phaseId: ph.id, phaseNameAr: ph.nameAr,
          groupAr: ph.groupAr, group: ph.group, ...op, index: idx,
          // Rich data from Supabase
          insight: detail.insight || '',
          whyItMatters: detail.why_it_matters || '',
          fullDesc: detail.description || op.desc,
          outputs: detail.outputs || [],
          duration: detail.duration || `${op.dur} أيام`,
          feeds: detail.feeds || [],
          fedBy: detail.fed_by || [],
        });
        idx++;
      }
    }
    return list;
  }, [processDetails]);

  const confirmedCount = Object.values(confirmed).filter(Boolean).length;
  const datedCount = Object.keys(dates).length;
  const progressPct = Math.round((confirmedCount / 16) * 100);
  const allDated = datedCount === 16;
  const missingProcs = procs.filter(p => !dates[p.key]);

  const showToast = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadRegs = async () => {
    setLoading(true);
    const regs = await DB.getAll("reg:");
    setAllRegs(regs.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt)));
    setLoading(false);
  };

  // ── Admin: Save process detail ──
  const adminSaveProcess = async (processKey, updates) => {
    if (!isSupabaseConfigured) return;
    setAdminSaving(true);
    try {
      await supabase.query('PATCH', `process_details?process_key=eq.${processKey}`, updates);
      // Refresh local state
      setProcessDetails(prev => ({ ...prev, [processKey]: { ...prev[processKey], ...updates } }));
      showToast('تم الحفظ ✓');
    } catch (e) { showToast('خطأ في الحفظ'); }
    setAdminSaving(false);
  };

  // ── Admin: Save app content ──
  const adminSaveContent = async (key, value) => {
    if (!isSupabaseConfigured) return;
    setAdminSaving(true);
    try {
      await supabase.query('PATCH', `app_content?key=eq.${key}`, { value, updated_at: new Date().toISOString() });
      setAppContent(prev => ({ ...prev, [key]: value }));
      showToast('تم الحفظ ✓');
    } catch (e) { showToast('خطأ في الحفظ'); }
    setAdminSaving(false);
  };

  // ── Resume Session: Step 1 - Find & Send OTP ──
  const handleResume = async (e) => {
    e.preventDefault();
    const phone = resumePhone.replace(/\s/g, "");
    if (!validPhone(phone)) { setResumeError("صيغة غير صحيحة (05XXXXXXXX)"); return; }
    setResumeLoading(true);
    setResumeError("");
    const existing = await DB.getAll("reg:");
    const found = existing.find(r => r.phone === phone);
    if (!found) { setResumeLoading(false); setResumeError("لا يوجد تسجيل بهذا الرقم"); return; }

    // Send OTP to registered email
    const res = await OTP.send(found.email);
    setResumeLoading(false);
    if (!res.success) { setResumeError("خطأ في إرسال رمز التحقق"); return; }

    // Store found user and switch to OTP input
    setUser({ name: found.name, phone: found.phone, email: found.email });
    setOtpPending({ type: "resume", data: found });
    setOtpStep("otp");
    setOtpCode("");
    setOtpError("");
    showToast(`تم إرسال رمز التحقق إلى ${found.email.replace(/(.{2}).*(@.*)/, "$1***$2")} ✉`);
  };

  // ── Resume: Step 2 - Verify OTP ──
  const handleResumeVerify = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) { setOtpError("أدخل الرمز المكون من 6 أرقام"); return; }

    setOtpSending(true);
    setOtpError("");
    const found = otpPending?.data;
    const res = await OTP.verify(found.email, otpCode);
    setOtpSending(false);
    if (!res.success) { setOtpError(res.message || "رمز التحقق غير صحيح"); return; }

    // Restore session
    setSessionId(found.id);
    setDates(found.dates || {});
    setConfirmed(found.confirmed || {});
    setSubmitted(found.submitted || false);
    setReopenRequested(found.reopenRequested || false);
    setScreen("main");
    if (found.submitted) setTab("output");
    setOtpStep("form"); setOtpCode(""); setOtpPending(null);
    LocalSession.save(
      { name: found.name, phone: found.phone, email: found.email },
      found.id, found.dates || {}, found.confirmed || {},
      found.submitted || false, found.reopenRequested || false
    );
    showToast(`مرحباً مجدداً ${found.name}! تم استعادة بياناتك`);
  };

  // ── Register: Step 1 - Validate & Send OTP ──
  const handleRegister = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!user.name.trim()) errs.name = "الاسم مطلوب";
    if (!validPhone(user.phone)) errs.phone = "صيغة غير صحيحة (05XXXXXXXX)";
    if (!validEmail(user.email)) errs.email = "بريد إلكتروني غير صحيح";
    if (Object.keys(errs).length) { setRegErrors(errs); return; }

    // Check duplicate → auto-resume via OTP
    const existing = await DB.getAll("reg:");
    const dup = existing.find(r => r.email === user.email || r.phone === user.phone);

    setOtpSending(true);
    setOtpError("");
    const res = await OTP.send(user.email);
    setOtpSending(false);
    if (!res.success) { setRegErrors({ email: res.message || "خطأ في إرسال رمز التحقق" }); return; }

    setOtpPending(dup ? { type: "resume", data: dup } : { type: "new" });
    setOtpStep("otp");
    setOtpCode("");
    setRegErrors({});
    showToast("تم إرسال رمز التحقق إلى بريدك الإلكتروني ✉");
  };

  // ── Register: Step 2 - Verify OTP & Complete ──
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) { setOtpError("أدخل الرمز المكون من 6 أرقام"); return; }

    setOtpSending(true);
    setOtpError("");
    const res = await OTP.verify(user.email, otpCode);
    setOtpSending(false);
    if (!res.success) { setOtpError(res.message || "رمز التحقق غير صحيح"); return; }

    // OTP verified — complete registration or resume
    if (otpPending?.type === "resume") {
      const dup = otpPending.data;
      setUser({ name: dup.name, phone: dup.phone, email: dup.email });
      setSessionId(dup.id);
      setDates(dup.dates || {});
      setConfirmed(dup.confirmed || {});
      setSubmitted(dup.submitted || false);
      setReopenRequested(dup.reopenRequested || false);
      setScreen("main");
      if (dup.submitted) setTab("output");
      LocalSession.save(
        { name: dup.name, phone: dup.phone, email: dup.email },
        dup.id, dup.dates || {}, dup.confirmed || {},
        dup.submitted || false, dup.reopenRequested || false
      );
      showToast(`مرحباً مجدداً ${dup.name}! تم استعادة بياناتك`);
    } else {
      const id = `reg:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record = { id, ...user, registeredAt: new Date().toISOString(), dates: {}, confirmed: {}, submitted: false };
      await DB.save(id, record);
      setSessionId(id);
      LocalSession.save(
        { name: user.name, phone: user.phone, email: user.email },
        id, {}, {}, false, false
      );
      setScreen("main");
      showToast(`أهلاً ${user.name}! تم تسجيلك بنجاح`);
    }
    setOtpStep("form"); setOtpCode(""); setOtpPending(null); setRegErrors({});
  };

  // ── Resend OTP ──
  const handleResendOtp = async () => {
    setOtpSending(true);
    setOtpError("");
    const res = await OTP.send(user.email);
    setOtpSending(false);
    if (res.success) showToast("تم إعادة إرسال الرمز ✉");
    else setOtpError("خطأ في إعادة الإرسال");
  };

  // ── Admin Login (via Lambda) ──
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError("");
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUser, password: adminPass }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('mi_admin_token', data.token);
        setScreen("admin");
        loadRegs();
      } else {
        setAdminError(data.message);
      }
    } catch (err) {
      setAdminError("خطأ في الاتصال بالسيرفر");
    }
  };

  // ── Save Date ──
  const saveDate = async (key, dateStr) => {
    if (isPast(dateStr)) { setDateError("لا يمكن اختيار تاريخ في الماضي"); return false; }
    const conflicts = Object.entries(dates).filter(([k, v]) => k !== key && v === dateStr).map(([k]) => procs.find(p => p.key === k)?.nameAr);
    if (conflicts.length) { setDateError(`تعارض مع: ${conflicts.join("، ")}`); return false; }
    setDateError("");
    const newDates = { ...dates, [key]: dateStr };
    setDates(newDates);
    if (sessionId) { const rec = await DB.get(sessionId); if (rec) { rec.dates = newDates; await DB.save(sessionId, rec); } }
    LocalSession.update({ dates: newDates });
    return true;
  };

  // ── Confirm ──
  const toggleConfirm = async (key) => {
    const newConf = { ...confirmed, [key]: !confirmed[key] };
    if (!newConf[key]) delete newConf[key];
    setConfirmed(newConf);
    if (sessionId) { const rec = await DB.get(sessionId); if (rec) { rec.confirmed = newConf; await DB.save(sessionId, rec); } }
    LocalSession.update({ confirmed: newConf });
    setSelectedCell(null);
    showToast(newConf[key] ? "تم تأكيد الموعد ✓" : "تم إلغاء التأكيد");
  };

  // ── Final Submit ──
  const doFinalSubmit = async () => {
    setConfirmAction(null);
    if (sessionId) {
      const rec = await DB.get(sessionId);
      if (rec) { rec.submitted = true; rec.submittedAt = new Date().toISOString(); rec.dates = dates; rec.confirmed = confirmed; await DB.save(sessionId, rec); }
    }
    setSubmitted(true);
    setTab("output");
    showToast("تم حفظ الخطة النهائية! ✓");
  };

  const handleSubmit = () => {
    if (!allDated) { showToast("يجب تحديد مواعيد جميع الـ 16 عملية"); return; }
    setConfirmAction({
      title: "الموافقة النهائية",
      message: "سيتم قفل الخطة بعد التقديم.\nإذا أردت التعديل لاحقاً، يمكنك طلب إعادة الفتح من المدير.",
      onConfirm: doFinalSubmit,
    });
  };

  // ── Logout ──
  const doLogout = () => {
    LocalSession.clear();
    setScreen("splash"); setUser({ name: "", phone: "", email: "" }); setDates({}); setConfirmed({});
    setSubmitted(false); setReopenRequested(false); setSessionId(null); setTab("matrix"); setRegErrors({});
    setAdminUser(""); setAdminPass(""); setAdminError(""); setExpandedReg(null);
    setResumePhone(""); setResumeError(""); setConfirmAction(null);
    setOtpStep("form"); setOtpCode(""); setOtpError(""); setOtpPending(null);
  };

  const logout = () => {
    if (datedCount > 0 && !submitted) {
      setConfirmAction({
        title: "تأكيد الخروج",
        message: "لديك بيانات غير مُقدَّمة.\nيمكنك العودة لاحقاً عبر زر \"استئناف\".",
        onConfirm: doLogout,
      });
      return;
    }
    doLogout();
  };

  // ── Print ──
  const handlePrint = () => printFinalTable(user, procs, dates, confirmed);

  // ── Request Reopen (User) ──
  const requestReopen = async () => {
    if (sessionId) {
      const rec = await DB.get(sessionId);
      if (rec) { rec.reopenRequested = true; await DB.save(sessionId, rec); }
    }
    setReopenRequested(true);
    showToast("تم إرسال طلب إعادة الفتح للمدير ✓");
  };

  // ── Admin: Unlock a registration ──
  const adminUnlock = async (regId) => {
    const rec = await DB.get(regId);
    if (rec) {
      rec.submitted = false;
      rec.reopenRequested = false;
      rec.submittedAt = null;
      await DB.save(regId, rec);
      showToast(`تم فتح التعديل لـ ${rec.name}`);
      loadRegs();
    }
  };

  // Copyright footer
  const Footer = () => (
    <div className="app-footer">
      <p style={{ marginBottom: "0.3rem" }}>للتواصل: <a href="tel:0532134539" style={{ color: BRAND.color, textDecoration: "none" }}>0532134539</a> | <a href="mailto:omar@sunkvalue.com" style={{ color: BRAND.color, textDecoration: "none" }}>omar@sunkvalue.com</a></p>
      <p>© {new Date().getFullYear()} Milestone Impact — جميع الحقوق محفوظة</p>
    </div>
  );

  // ════════ SPLASH ════════
  if (screen === "splash") return (
    <><style>{CSS}</style><div className="app">
      {introVisible && <Intro onComplete={hideIntro} />}
      <div className="splash">
        <MILogo size={65} color={BRAND.color} />
        <div className="mi-text" style={{ marginTop: "1rem" }}>Milestone<br />Impact</div>
        <h1>مصفوفة التأثير</h1>
        <p className="sub">هندسة اجتماعية • ١٦ عملية استراتيجية</p>
        <div className="s-actions">
          <button className="s-btn s-btn-main" onClick={() => setScreen("register")}>🚀 تسجيل جديد</button>
          <button className="s-btn s-btn-main" style={{ borderColor: "#5B7B3A", color: "#5B7B3A" }} onClick={() => setScreen("resume")}>↩ استئناف</button>
          <button className="s-btn s-btn-admin" onClick={() => setScreen("admin-login")}>🔐 دخول المدير</button>
        </div>
      </div>
      <Footer />
    </div></>
  );

  // ════════ REGISTER ════════
  if (screen === "register") return (
    <><style>{CSS}</style><div className="app"><div className="splash">
      <MILogo size={50} color={BRAND.color} />
      <h1 style={{ marginTop: "0.8rem" }}>مصفوفة التأثير</h1>
      <p className="sub">{otpStep === "form" ? "سجّل بياناتك للبدء" : "أدخل رمز التحقق"}</p>
      <div className="card">
        {otpStep === "form" ? <>
          <h2>التسجيل</h2>
          <form onSubmit={handleRegister}>
            <div className={`fg ${regErrors.name ? "fg-err" : ""}`}><label>الاسم الكامل</label><input placeholder="أدخل اسمك" value={user.name} onChange={e => { setUser({ ...user, name: e.target.value }); setRegErrors({ ...regErrors, name: "" }); }} />{regErrors.name && <div className="fg-msg">{regErrors.name}</div>}</div>
            <div className={`fg ${regErrors.phone ? "fg-err" : ""}`}><label>رقم الجوال</label><input type="tel" placeholder="05XXXXXXXX" value={user.phone} onChange={e => { setUser({ ...user, phone: e.target.value }); setRegErrors({ ...regErrors, phone: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.phone && <div className="fg-msg">{regErrors.phone}</div>}</div>
            <div className={`fg ${regErrors.email ? "fg-err" : ""}`}><label>البريد الإلكتروني</label><input type="email" placeholder="email@example.com" value={user.email} onChange={e => { setUser({ ...user, email: e.target.value }); setRegErrors({ ...regErrors, email: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.email && <div className="fg-msg">{regErrors.email}</div>}</div>
            <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ الإرسال..." : "إرسال رمز التحقق ✉"}</button>
          </form>
        </> : <>
          <h2>✉ رمز التحقق</h2>
          <p style={{ fontSize: "0.85rem", color: "#6B6560", marginBottom: "1rem", textAlign: "center" }}>تم إرسال رمز مكون من 6 أرقام إلى<br /><strong style={{ color: BRAND.color, direction: "ltr", display: "inline-block" }}>{user.email}</strong></p>
          <form onSubmit={handleVerifyOtp}>
            <div className={`fg ${otpError ? "fg-err" : ""}`}>
              <label>رمز التحقق</label>
              <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode}
                onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                style={{ direction: "ltr", textAlign: "center", fontSize: "1.5rem", letterSpacing: "8px", fontWeight: 700 }} />
              {otpError && <div className="fg-msg">{otpError}</div>}
            </div>
            <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
          </form>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.8rem" }}>
            <button style={{ background: "none", border: "none", color: BRAND.color, fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={handleResendOtp} disabled={otpSending}>↻ إعادة إرسال</button>
            <button style={{ background: "none", border: "none", color: "#6B6560", fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={() => { setOtpStep("form"); setOtpCode(""); setOtpError(""); }}>← تغيير البيانات</button>
          </div>
        </>}
        <div className="back-link"><button onClick={() => { setScreen("splash"); setOtpStep("form"); setOtpCode(""); }}>→ العودة</button></div>
      </div>
    </div></div></>
  );

  // ════════ ADMIN LOGIN ════════

  // ════════ RESUME ════════
  if (screen === "resume") return (
    <><style>{CSS}</style><div className="app"><div className="splash">
      <MILogo size={50} color="#5B7B3A" />
      <h1 style={{ color: "#5B7B3A", marginTop: "0.8rem" }}>استئناف الجلسة</h1>
      <p className="sub">{otpStep === "form" ? "أدخل رقم جوالك لاستعادة بياناتك" : "أدخل رمز التحقق"}</p>
      <div className="card">
        {otpStep === "form" ? <>
          <h2>↩ استئناف</h2>
          <form onSubmit={handleResume}>
            <div className={`fg ${resumeError ? "fg-err" : ""}`}>
              <label>رقم الجوال المسجل</label>
              <input type="tel" placeholder="05XXXXXXXX" value={resumePhone}
                onChange={e => { setResumePhone(e.target.value); setResumeError(""); }}
                style={{ direction: "ltr", textAlign: "right" }} />
              {resumeError && <div className="fg-msg">{resumeError}</div>}
            </div>
            <button type="submit" className="btn" style={{ background: "linear-gradient(135deg, #4A5628, #5B7B3A)" }} disabled={resumeLoading}>
              {resumeLoading ? "جارٍ البحث..." : "إرسال رمز التحقق ✉"}
            </button>
          </form>
        </> : <>
          <h2>✉ رمز التحقق</h2>
          <p style={{ fontSize: "0.85rem", color: "#6B6560", marginBottom: "1rem", textAlign: "center" }}>تم إرسال رمز إلى<br /><strong style={{ color: "#5B7B3A", direction: "ltr", display: "inline-block" }}>{user.email?.replace(/(.{2}).*(@.*)/, "$1***$2")}</strong></p>
          <form onSubmit={handleResumeVerify}>
            <div className={`fg ${otpError ? "fg-err" : ""}`}>
              <label>رمز التحقق</label>
              <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode}
                onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                style={{ direction: "ltr", textAlign: "center", fontSize: "1.5rem", letterSpacing: "8px", fontWeight: 700 }} />
              {otpError && <div className="fg-msg">{otpError}</div>}
            </div>
            <button type="submit" className="btn" style={{ background: "linear-gradient(135deg, #4A5628, #5B7B3A)" }} disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
          </form>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.8rem" }}>
            <button style={{ background: "none", border: "none", color: "#5B7B3A", fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={handleResendOtp} disabled={otpSending}>↻ إعادة إرسال</button>
            <button style={{ background: "none", border: "none", color: "#6B6560", fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={() => { setOtpStep("form"); setOtpCode(""); setOtpError(""); }}>← رقم آخر</button>
          </div>
        </>}
        <div style={{ textAlign: "center", marginTop: "1rem", padding: "0.8rem", background: "rgba(107,157,173,0.04)", borderRadius: "8px" }}>
          <p style={{ fontSize: "0.78rem", color: "#6B6560", marginBottom: "0.3rem" }}>ليس لديك حساب؟</p>
          <button style={{ background: "none", border: "none", color: BRAND.color, fontFamily: "'Tajawal'", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }} onClick={() => { setScreen("register"); setOtpStep("form"); }}>🚀 سجّل الآن</button>
        </div>
        <div className="back-link"><button onClick={() => { setScreen("splash"); setOtpStep("form"); setOtpCode(""); }}>→ العودة</button></div>
      </div>
    </div></div></>
  );

  // ════════ ADMIN LOGIN (original) ════════
  if (screen === "admin-login") return (
    <><style>{CSS}</style><div className="app"><div className="splash">
      <MILogo size={50} color={BRAND.deep} />
      <h1 style={{ color: BRAND.deep, marginTop: "0.8rem" }}>لوحة الإدارة</h1>
      <p className="sub">Milestone Impact</p>
      <div className="card"><h2>دخول المدير</h2>
        <form onSubmit={handleAdminLogin}>
          <div className="fg"><label>اسم المستخدم</label><input placeholder="admin" value={adminUser} onChange={e => { setAdminUser(e.target.value); setAdminError(""); }} /></div>
          <div className={`fg ${adminError ? "fg-err" : ""}`}><label>كلمة المرور</label><input type="password" placeholder="••••••••" value={adminPass} onChange={e => { setAdminPass(e.target.value); setAdminError(""); }} />{adminError && <div className="fg-msg">{adminError}</div>}</div>
          <button type="submit" className="btn">🔐 دخول</button>
        </form>
        <div className="back-link"><button onClick={() => setScreen("splash")}>→ العودة</button></div>
      </div>
    </div></div></>
  );

  // ════════ ADMIN PANEL ════════
  if (screen === "admin") return (
    <><style>{CSS}</style><div className="app">
      <nav className="nav nav-admin">
        <div className="nav-brand"><div className="nav-logo"><MILogo size={16} color="#6B9DAD" /></div><div className="nav-text"><h3>لوحة الإدارة</h3><span>Milestone Impact</span></div></div>
        <div className="nav-right"><div className="tabs"><button className={`tab ${adminTab === "regs" ? "on" : ""}`} onClick={() => setAdminTab("regs")}>المسجلين</button><button className={`tab ${adminTab === "reports" ? "on" : ""}`} onClick={() => setAdminTab("reports")}>📊 التقارير</button><button className={`tab ${adminTab === "content" ? "on" : ""}`} onClick={() => setAdminTab("content")}>✏ المحتوى</button><button className={`tab ${adminTab === "stats" ? "on" : ""}`} onClick={() => setAdminTab("stats")}>إحصائيات</button></div><button className="btn-logout" onClick={logout}>← خروج</button></div>
      </nav>
      <div className="sec" style={{ animation: "fadeIn 0.4s" }}>
        <div className="stat-grid">
          <div className="stat" style={{ borderTopColor: BRAND.color }}><div className="stat-v" style={{ color: BRAND.color }}>{allRegs.length}</div><div className="stat-l">إجمالي المسجلين</div></div>
          <div className="stat" style={{ borderTopColor: "#5B7B3A" }}><div className="stat-v" style={{ color: "#5B7B3A" }}>{allRegs.filter(r => r.submitted).length}</div><div className="stat-l">خطط مكتملة</div></div>
          <div className="stat" style={{ borderTopColor: "#8B6914" }}><div className="stat-v" style={{ color: "#8B6914" }}>{allRegs.filter(r => !r.submitted).length}</div><div className="stat-l">قيد التخطيط</div></div>
          <div className="stat" style={{ borderTopColor: "#C0392B" }}><div className="stat-v" style={{ color: "#C0392B" }}>{allRegs.filter(r => r.reopenRequested).length}</div><div className="stat-l">طلبات إعادة فتح</div></div>
        </div>

        {adminTab === "regs" && <>
          <div className="sec-head"><h2 className="sec-title">سجل المشاركين</h2><button className="btn btn-s btn-outline" onClick={loadRegs}>↻ تحديث</button></div>
          <div className="admin-table"><table>
            <thead><tr><th>#</th><th>الاسم</th><th>الجوال</th><th>البريد</th><th>التسجيل</th><th>المواعيد</th><th>الحالة</th><th>إجراء</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#999" }}>جارٍ التحميل...</td></tr>
                : allRegs.length === 0 ? <tr><td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#999" }}>لا يوجد مسجلين</td></tr>
                  : allRegs.map((r, i) => <React.Fragment key={r.id}>
                    <tr style={{ background: r.reopenRequested ? "rgba(192,57,43,0.04)" : "transparent" }}>
                      <td>{i + 1}</td><td style={{ fontWeight: 600 }}>{r.name}</td><td style={{ direction: "ltr" }}>{r.phone}</td>
                      <td style={{ direction: "ltr", fontSize: "0.72rem" }}>{r.email}</td>
                      <td style={{ fontSize: "0.72rem" }}>{r.registeredAt ? fmtBoth(r.registeredAt).hijri : "—"}</td>
                      <td>{r.dates ? Object.keys(r.dates).length : 0}/16</td>
                      <td>{r.submitted ? <span className="badge badge-ok">✓ مكتمل</span> : <span className="badge badge-wait">قيد التخطيط</span>}{r.reopenRequested && <span className="badge" style={{ background: "rgba(192,57,43,0.1)", color: "#C0392B", marginRight: "0.3rem" }}>🔓 طلب فتح</span>}</td>
                      <td>{r.submitted && <button className="btn btn-s" style={{ padding: "0.2rem 0.5rem", fontSize: "0.68rem", background: "linear-gradient(135deg, #C0392B, #E74C3C)" }} onClick={() => adminUnlock(r.id)}>فتح التعديل</button>}</td>
                      <td><button className="btn btn-s btn-outline" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => setExpandedReg(expandedReg === r.id ? null : r.id)}>{expandedReg === r.id ? "▲" : "▼"}</button></td>
                    </tr>
                    {expandedReg === r.id && <tr><td colSpan={9} style={{ padding: "0.5rem" }}>
                      <div className="output-card" style={{ border: "1px solid var(--sa)" }}>
                        <h3 style={{ fontFamily: "'Amiri',serif", color: BRAND.dark, marginBottom: "0.6rem" }}>📋 جدول {r.name}</h3>
                        <table className="output-table"><thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>المرحلة</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
                          <tbody>{procs.map((p, j) => { const d = r.dates?.[p.key]; const c = r.confirmed?.[p.key]; return (
                            <tr key={p.key}><td>{j + 1}</td><td style={{ fontWeight: 600 }}>{p.nameAr}</td><td style={{ color: p.trackColor }}>{p.trackIcon} {p.trackNameAr}</td><td>{p.phaseNameAr}</td>
                              <td>{d ? fmtGregorian(d) : "—"}</td><td style={{ color: "#8B6914" }}>{d ? gregorianToHijri(d).formatted : "—"}</td>
                              <td>{c ? <span className="badge badge-ok">✓</span> : d ? <span className="badge badge-wait">محدد</span> : "—"}</td></tr>
                          ); })}</tbody>
                        </table>
                        {r.submittedAt && <div className="output-stamp"><p>تم التقديم: <strong style={{ color: BRAND.color }}>{fmtBoth(r.submittedAt).both}</strong></p></div>}
                      </div>
                    </td></tr>}
                  </React.Fragment>)}
            </tbody>
          </table></div>
        </>}

        {adminTab === "reports" && <>
          <div className="sec-head"><h2 className="sec-title">📊 تقارير العملاء — نسخة المستشار</h2></div>
          {allRegs.length === 0 && <p style={{ color: "#999", textAlign: "center" }}>لا يوجد مسجلين</p>}
          {allRegs.map(reg => {
            const regAnalysis = analyzeBookings(procs, reg.dates || {}, reg.confirmed || {});
            const bookedCount = Object.keys(reg.dates || {}).length;
            const isOpen = adminReportReg === reg.id;
            return <div key={reg.id} className="adm-consultant">
              <div className="adm-edit-header" onClick={() => setAdminReportReg(isOpen ? null : reg.id)}>
                <h4>{reg.name} — {bookedCount} حجوزات {regAnalysis ? `• نمط ${regAnalysis.pattern.nameAr}` : '• أقل من 3'}</h4>
                <span>{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && <>
                {!regAnalysis ? <p style={{ color: "#999", fontSize: "0.82rem" }}>أقل من 3 حجوزات — لا يمكن توليد تقرير</p> : <>
                  {/* النمط */}
                  <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                    <div className="rpt-stat" style={{ flex: 1 }}><div className="rpt-stat-v" style={{ color: BRAND.color, fontSize: "1.1rem" }}>{regAnalysis.pattern.icon} {regAnalysis.pattern.nameAr}</div><div className="rpt-stat-l">النمط</div></div>
                    <div className="rpt-stat" style={{ flex: 1 }}><div className="rpt-stat-v" style={{ color: "#5B7B3A" }}>{regAnalysis.trackCoverage.covered}/4</div><div className="rpt-stat-l">مسارات</div></div>
                    <div className="rpt-stat" style={{ flex: 1 }}><div className="rpt-stat-v" style={{ color: "#6B4E3D" }}>{regAnalysis.readinessAr}</div><div className="rpt-stat-l">الجاهزية</div></div>
                  </div>

                  {/* بيانات المستشار الإضافية */}
                  <div className="adm-note">⏱ <strong>الزمن بين الحجوزات:</strong> {(() => {
                    const dateVals = Object.values(reg.dates || {}).sort();
                    if (dateVals.length < 2) return 'حجز واحد فقط';
                    const first = new Date(dateVals[0]), last = new Date(dateVals[dateVals.length - 1]);
                    const diffDays = Math.round((last - first) / (1000 * 60 * 60 * 24));
                    return diffDays === 0 ? 'حجز كل المواعيد دفعة واحدة — قرار محسوم' : `${diffDays} يوم بين أول وآخر موعد — ${diffDays <= 7 ? 'قرار سريع' : 'استكشاف متأنٍ'}`;
                  })()}</div>

                  {/* نقاط النقاش */}
                  <div className="adm-note">💬 <strong>نقاط نقاش مقترحة:</strong> {regAnalysis.patternId === 'sequential' ? 'يميل للتعمق في مسار واحد — ناقش التوسع الأفقي' : regAnalysis.patternId === 'breadthFirst' ? 'يميل للاستكشاف الأفقي — ناقش التعمق في مسار محدد' : regAnalysis.patternId === 'foundationFocused' ? 'يركز على التأسيس — ناقش الانتقال للمراحل المتقدمة' : regAnalysis.patternId === 'outcomeDriven' ? 'يركز على النتائج — تحقق من متانة الأساس' : regAnalysis.patternId === 'diagnostic' ? 'يريد الصورة الكاملة أولاً — ادعم بخطة تنفيذ واضحة' : 'نمط تكاملي — ناقش أولويات التنفيذ'}</div>

                  {/* فجوات التبعية */}
                  {regAnalysis.depGaps.length > 0 && <div className="adm-note" style={{ background: "rgba(192,57,43,0.04)" }}>⚠ <strong>تبعيات مفقودة يجب مناقشتها:</strong> {regAnalysis.depGaps.map(g => `${g.process} ← ${g.missing}`).join(' | ')}</div>}

                  {/* التوصيات */}
                  {regAnalysis.recommendations.length > 0 && <div style={{ marginTop: "0.4rem" }}>{regAnalysis.recommendations.map((r, i) => <div key={i} className="rpt-rec" style={{ fontSize: "0.78rem" }}><span className="rpt-rec-icon">💡</span><span>{r}</span></div>)}</div>}
                </>}
              </>}
            </div>;
          })}
        </>}

        {adminTab === "content" && <>
          <div className="sec-head"><h2 className="sec-title">✏ إدارة المحتوى</h2></div>

          {/* تعديل نصوص الحالات */}
          <div className="adm-edit-card">
            <h4 style={{ color: BRAND.dark, marginBottom: "0.8rem" }}>📝 نصوص الحالات الخاصة</h4>
            {[
              { key: 'welcome_title', label: 'عنوان الترحيب (0 حجوزات)' },
              { key: 'welcome_desc', label: 'وصف الترحيب' },
              { key: 'welcome_hint', label: 'تلميح البداية' },
              { key: 'starter_processes', label: 'عمليات البداية المقترحة (process keys مفصولة بفاصلة)' },
              { key: 'progress_title', label: 'عنوان (1-2 حجوزات)' },
              { key: 'progress_desc', label: 'وصف (1-2 حجوزات)' },
              { key: 'suggest_label', label: 'نص الاقتراحات الذكية' },
              { key: 'suggest_deps_label', label: 'نص شريط التبعيات (3+)' },
            ].map(item => <div key={item.key} className="adm-field">
              <label>{item.label}</label>
              <input value={appContent[item.key] || ''} onChange={e => setAppContent(prev => ({ ...prev, [item.key]: e.target.value }))} onBlur={e => adminSaveContent(item.key, e.target.value)} />
            </div>)}
          </div>

          {/* تعديل بيانات العمليات */}
          <div className="adm-edit-card">
            <h4 style={{ color: BRAND.dark, marginBottom: "0.8rem" }}>🔧 بيانات العمليات الـ 16</h4>
            {procs.map(p => {
              const detail = processDetails[p.key] || {};
              const isOpen = adminEditProcess === p.key;
              return <div key={p.key} style={{ borderBottom: "1px solid var(--sa)", paddingBottom: "0.5rem", marginBottom: "0.5rem" }}>
                <div className="adm-edit-header" onClick={() => setAdminEditProcess(isOpen ? null : p.key)}>
                  <span style={{ fontSize: "0.82rem" }}><span style={{ color: p.trackColor }}>{p.trackIcon}</span> {p.nameAr} <span style={{ fontSize: "0.68rem", color: "#999" }}>({p.key})</span></span>
                  <span>{isOpen ? '▲' : '▼'}</span>
                </div>
                {isOpen && <div style={{ padding: "0.5rem 0" }}>
                  {[
                    { field: 'insight', label: 'البصيرة المنهجية', type: 'input' },
                    { field: 'description', label: 'الوصف التفصيلي', type: 'textarea' },
                    { field: 'why_it_matters', label: 'لماذا يهم', type: 'textarea' },
                    { field: 'duration', label: 'المدة الزمنية', type: 'input' },
                  ].map(f => <div key={f.field} className="adm-field">
                    <label>{f.label}</label>
                    {f.type === 'input'
                      ? <input defaultValue={detail[f.field] || ''} onBlur={e => adminSaveProcess(p.key, { [f.field]: e.target.value })} />
                      : <textarea defaultValue={detail[f.field] || ''} onBlur={e => adminSaveProcess(p.key, { [f.field]: e.target.value })} />}
                  </div>)}
                  <div className="adm-field">
                    <label>المخرجات (مفصولة بـ |)</label>
                    <input defaultValue={(detail.outputs || []).join(' | ')} onBlur={e => adminSaveProcess(p.key, { outputs: e.target.value.split('|').map(s => s.trim()).filter(Boolean) })} />
                  </div>
                  {adminSaving && <span style={{ fontSize: "0.72rem", color: BRAND.color }}>جاري الحفظ...</span>}
                </div>}
              </div>;
            })}
          </div>
        </>}

        {adminTab === "stats" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0.75rem" }}>
          {TRACKS.map(t => (<div key={t.id} className="sum-card" style={{ padding: "1rem", borderRight: `3px solid ${t.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}><span style={{ fontWeight: 700, color: t.color }}>{t.icon} {t.nameAr}</span><span style={{ fontWeight: 700, color: t.color }}>{t.weight}%</span></div>
            <div style={{ fontSize: "0.78rem", color: "#6B6560" }}>مواعيد: <strong>{allRegs.reduce((s, r) => s + (r.dates ? procs.filter(p => p.trackId === t.id && r.dates[p.key]).length : 0), 0)}</strong> • مؤكدة: <strong>{allRegs.reduce((s, r) => s + (r.confirmed ? procs.filter(p => p.trackId === t.id && r.confirmed[p.key]).length : 0), 0)}</strong></div>
          </div>))}
        </div>}
      </div>
      <Footer />
    </div></>
  );

  // ════════ USER MAIN ════════
  const userTabs = [["matrix", "المصفوفة"], ["schedule", "الجدول"], ["report", "📊 التقرير"], ["summary", "المخرجات"]];
  if (submitted) userTabs.push(["output", "📋 النموذج النهائي"]);

  return (
    <><style>{CSS}</style><div className="app">
      <nav className="nav">
        <div className="nav-brand"><div className="nav-logo"><MILogo size={16} color="#fff" /></div><div className="nav-text"><h3>مصفوفة التأثير</h3><span>{user.name}</span></div></div>
        <div className="nav-right"><div className="tabs">{userTabs.map(([k, v]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{v}</button>)}</div><button className="btn-logout" onClick={logout}>← خروج</button></div>
      </nav>

      <div className="prog-wrap"><div className="prog-box">
        <div className="prog-top"><span className="prog-label">نسبة الإنجاز</span><span className="prog-pct">{progressPct}%</span></div>
        <div className="prog-bar"><div className="prog-fill" style={{ width: `${progressPct}%` }} /></div>
        <div className="prog-stats"><span><strong>{datedCount}</strong>/16 موعد</span><span><strong>{confirmedCount}</strong>/16 مؤكد</span>{submitted && <span style={{ color: "#5B7B3A", fontWeight: 700 }}>✓ تم التقديم</span>}</div>
      </div></div>

      {/* ═══ MATRIX ═══ */}
      {tab === "matrix" && <div className="sec" style={{ animation: "fadeIn 0.4s" }}>
        <div className="sec-head"><h2 className="sec-title">مصفوفة التأثير — ١٦ عملية</h2></div>
        <div className="banner">
          <div className="banner-item"><h4>مصفوفة التأثير</h4><p>هندسة اجتماعية</p></div>
          <div className="banner-item"><h4>المبدأ الرابع</h4><p>الزمن استراتيجي</p></div>
          <div className="banner-item"><h4>المبدأ السابع</h4><p>المال والمجتمع يجمعهما العقل</p></div>
        </div>

        {/* ── Smart Suggestions ── */}
        {!submitted && datedCount === 0 && <div className="smart-box smart-welcome">
          <h3>{appContent.welcome_title || 'ابدأ رحلة التحول'}</h3>
          <p>{appContent.welcome_desc || 'اختر أول عملية لبدء بناء خطتك الاستراتيجية'}</p>
          <p style={{ fontSize: "0.78rem", color: BRAND.dark }}>💡 {appContent.welcome_hint || 'يبدأ معظم العملاء بـ:'}</p>
          <div className="smart-suggest">
            {(appContent.starter_processes || 'creation-1,establishment-1').split(',').map(k => k.trim()).map(k => { const p = procs.find(x => x.key === k); return p ? <span key={k} className="smart-chip" style={{ borderColor: p.trackColor + '50', color: p.trackColor, background: p.trackColor + '0A' }} onClick={() => { setSelectedCell(p); setTempDate(""); setDateError(""); setHighlightedKeys([...(p.feeds || []), ...(p.fedBy || [])]); }}>{p.trackIcon} {p.nameAr}</span> : null; })}
          </div>
          <div className="smart-counter" style={{ marginTop: "0.6rem", color: "#999" }}>0 من 16 عملية</div>
        </div>}

        {!submitted && datedCount >= 1 && datedCount <= 2 && <div className="smart-box smart-progress">
          <h4>{appContent.progress_title || '🌱 بداية ممتازة!'}</h4>
          <p>{appContent.progress_desc || 'أكمل 3 حجوزات على الأقل لنكشف لك نمط تفكيرك التحويلي'}</p>
          {(() => {
            const booked = Object.keys(dates);
            const suggestions = new Set();
            booked.forEach(k => {
              const p = procs.find(x => x.key === k);
              if (p) { (p.feeds || []).forEach(f => { if (!dates[f]) suggestions.add(f); }); }
            });
            const sugList = [...suggestions].slice(0, 3).map(k => procs.find(x => x.key === k)).filter(Boolean);
            return sugList.length > 0 ? <>
              <p style={{ fontSize: "0.76rem", color: BRAND.dark, marginTop: "0.4rem" }}>{appContent.suggest_label || '🔗 بناءً على اختياراتك، قد يهمك أيضاً:'}</p>
              <div className="smart-suggest">
                {sugList.map(p => <span key={p.key} className="smart-chip" style={{ borderColor: p.trackColor + '50', color: p.trackColor, background: p.trackColor + '0A' }} onClick={() => { setSelectedCell(p); setTempDate(""); setDateError(""); setHighlightedKeys([...(p.feeds || []), ...(p.fedBy || [])]); }}>{p.trackIcon} {p.nameAr}</span>)}
              </div>
            </> : null;
          })()}
        </div>}

        {!submitted && datedCount >= 3 && datedCount < 16 && (() => {
          const booked = Object.keys(dates);
          const suggestions = new Set();
          booked.forEach(k => {
            const p = procs.find(x => x.key === k);
            if (p) { (p.feeds || []).forEach(f => { if (!dates[f]) suggestions.add(f); }); }
          });
          const sugList = [...suggestions].slice(0, 4).map(k => procs.find(x => x.key === k)).filter(Boolean);
          return sugList.length > 0 ? <div className="smart-box" style={{ background: "rgba(107,157,173,0.03)", border: "1px solid rgba(107,157,173,0.1)", borderRadius: "13px", padding: "0.8rem 1.1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.3rem" }}>
              <span style={{ fontSize: "0.8rem", color: BRAND.dark, fontWeight: 600 }}>{appContent.suggest_deps_label || '🔗 اقتراحات بناءً على التبعيات'}</span>
              <span className="smart-counter">{datedCount}/16</span>
            </div>
            <div className="smart-suggest" style={{ marginTop: "0.4rem" }}>
              {sugList.map(p => <span key={p.key} className="smart-chip" style={{ borderColor: p.trackColor + '50', color: p.trackColor, background: p.trackColor + '0A' }} onClick={() => { setSelectedCell(p); setTempDate(""); setDateError(""); setHighlightedKeys([...(p.feeds || []), ...(p.fedBy || [])]); }}>{p.trackIcon} {p.nameAr}</span>)}
            </div>
          </div> : null;
        })()}
        <div className="mx-groups"><div className="mx-grp mx-grp-c" style={{ flex: 2 }}>الهوية الحالية</div><div className="mx-grp mx-grp-n" style={{ flex: 2 }}>الهوية الاعتبارية الجديدة</div></div>
        <div className="mx-phases">{PHASES.map(p => <div key={p.id} className="mx-ph">{p.nameAr}</div>)}</div>
        <div className="mx-grid">{TRACKS.map(tr => <div key={tr.id} className="mx-row">
          <div className="mx-track" style={{ background: `linear-gradient(135deg,${tr.color},${tr.color}CC)` }}><span className="mx-tw">{tr.weight}%</span><span className="mx-tn">{tr.nameAr}</span><span className="mx-tc">{tr.contentAr}</span></div>
          <div className="mx-cells">{PHASES.map(ph => {
            const op = OPERATIONS[tr.id][ph.id - 1], key = `${tr.id}-${ph.id}`, proc = procs.find(p => p.key === key);
            const hasD = !!dates[key], isDone = !!confirmed[key];
            const isHL = highlightedKeys.includes(key);
            return (<div key={key} className={`cell ${isDone ? "done" : ""} ${hasD && !isDone ? "dated" : ""} ${isHL ? "highlighted" : ""}`}
              onClick={() => {
                if (submitted) { showToast("تم قفل الخطة بعد التقديم النهائي"); return; }
                setSelectedCell(proc);
                setTempDate(dates[key] || ""); setDateError("");
                // Highlight connected processes
                setHighlightedKeys([...(proc.feeds || []), ...(proc.fedBy || [])]);
              }}
              onMouseLeave={() => { if (!selectedCell) setHighlightedKeys([]); }}>
              <div className="bar" style={{ background: tr.color }} /><span className="num">{proc.index + 1}</span>
              <div><div className="cell-name">{op.nameAr}</div><div className="cell-desc">{op.desc.slice(0, 35)}…</div></div>
              <div className="cell-meta"><span className="cell-dur">{op.dur} أيام</span>{hasD && <span className="cell-date">{fmtShort(dates[key])}</span>}</div>
              {proc.insight && <div className="cell-insight" style={{ background: `${tr.color}E6` }}>{proc.insight}</div>}
            </div>);
          })}</div>
        </div>)}</div>

        {!allDated && datedCount > 0 && !submitted && <div className="missing"><h4>⚠ متبقي {16 - datedCount} عملية بدون موعد</h4><div className="missing-chips">{missingProcs.map(p => <span key={p.key} className="missing-chip" onClick={() => { setSelectedCell(p); setTempDate(""); setDateError(""); }}>{p.trackIcon} {p.nameAr}</span>)}</div></div>}

        {!submitted && <div className={`submit ${allDated ? "submit-ready" : "submit-wait"}`}>
          {allDated ? <><h3 style={{ color: BRAND.dark }}>✓ جاهز للموافقة النهائية</h3><p>{confirmedCount}/16 مؤكدة</p><button className="btn btn-s btn-gold" onClick={handleSubmit}>✓ موافقة نهائية</button></>
            : <><h3 style={{ color: "#999" }}>يجب تحديد جميع المواعيد الـ 16</h3><p>{datedCount}/16 محدد</p></>}
        </div>}
        {submitted && <div className="submit submit-done">
          <h3 style={{ color: "#5B7B3A" }}>🔒 تم قفل الخطة بعد الموافقة النهائية</h3>
          <p>اذهب لتبويب "📋 النموذج النهائي" لعرض أو طباعة النموذج</p>
          {!reopenRequested
            ? <button className="btn btn-s btn-outline" style={{ marginTop: "0.5rem" }} onClick={requestReopen}>🔓 طلب إعادة فتح التعديل</button>
            : <p style={{ color: BRAND.color, fontWeight: 600, marginTop: "0.5rem" }}>⏳ تم إرسال طلب الفتح — بانتظار موافقة المدير</p>
          }
        </div>}
      </div>}

      {/* ═══ SCHEDULE ═══ */}
      {tab === "schedule" && <div className="sec" style={{ animation: "fadeIn 0.4s" }}>
        <div className="sec-head"><h2 className="sec-title">الجدول الزمني</h2></div>
        {datedCount === 0 ? <div className="empty"><h3>لا توجد مواعيد</h3><p>حدد المواعيد من المصفوفة</p></div>
          : <div className="tl">{procs.filter(p => dates[p.key]).sort((a, b) => new Date(dates[a.key]) - new Date(dates[b.key])).map((item, i) => {
            const d = dates[item.key], h = fmtBoth(d), isDone = !!confirmed[item.key];
            return (<div key={item.key} className="tl-item" style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="tl-dot" style={{ borderColor: item.trackColor, background: isDone ? item.trackColor : "var(--sw)" }} />
              <div className="tl-card" style={{ borderRightColor: item.trackColor }}>
                <span className="tl-step" style={{ background: item.trackColor }}>خطوة {i + 1}</span>
                {isDone && <span className="badge badge-ok" style={{ marginRight: "0.4rem" }}>مؤكد</span>}
                <div className="tl-name">{item.nameAr}</div>
                <div className="tl-track">{item.trackIcon} {item.trackNameAr} • {item.phaseNameAr}</div>
                <div className="tl-dates"><span>📅 {h.gregorian}</span><span>{item.dur} أيام</span></div>
                <div className="tl-hijri">🌙 {h.hijri}</div>
              </div>
            </div>);
          })}</div>}
      </div>}

      {/* ═══ REPORT ═══ */}
      {tab === "report" && <div className="sec" style={{ animation: "fadeIn 0.4s" }}>
        <div className="sec-head"><h2 className="sec-title">📊 التقرير التحليلي</h2></div>
        {(() => {
          const analysis = analyzeBookings(procs, dates, confirmed);
          if (!analysis) return <div className="rpt-card rpt-empty">
            <h3>تحتاج حجوزات إضافية</h3>
            <p>أكمل <strong>3 حجوزات</strong> على الأقل لتوليد تحليل دقيق لنمط تفكيرك التحويلي</p>
            <div className="smart-counter" style={{ justifyContent: "center", marginTop: "0.8rem", color: "#999" }}>{datedCount} من 3 مطلوبة</div>
          </div>;

          const { pattern, trackCoverage, phaseCoverage, weightBalance, avgPhase, readinessAr, depGaps, recommendations, timeline, trackDist, totalBooked, isComplete } = analysis;

          return <>
            {/* القسم 1 — الترويسة */}
            <div className="rpt-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div><div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><MILogo size={20} color={BRAND.color} /><strong style={{ fontFamily: "'Amiri',serif", color: BRAND.dark }}>Milestone Impact</strong></div><div style={{ fontSize: "0.78rem", color: "#999", marginTop: "0.2rem" }}>تقرير مولّد تلقائياً بناءً على نمط الحجز</div></div>
              <div style={{ textAlign: "left" }}><div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{user.name}</div><div style={{ fontSize: "0.72rem", color: "#999" }}>{new Date().toLocaleDateString('ar-SA')} • {totalBooked} حجوزات</div></div>
            </div>

            {/* القسم 2 — نمط التفكير */}
            <div className="rpt-card">
              <div className="rpt-pattern">
                <div className="rpt-pattern-icon">{pattern.icon}</div>
                <div className="rpt-pattern-name">نمط {pattern.nameAr}</div>
                <div className="rpt-pattern-desc">{pattern.desc}</div>
              </div>
              {isComplete && <div style={{ textAlign: "center", padding: "0.6rem", background: "rgba(91,123,58,0.06)", borderRadius: "10px", marginTop: "-0.5rem" }}>
                <strong style={{ color: "#5B7B3A", fontSize: "0.9rem" }}>🏆 رحلة تحول كاملة</strong>
                <p style={{ fontSize: "0.78rem", color: "#666", marginTop: "0.2rem" }}>ترتيب حجوزاتك يكشف أولوياتك الحقيقية حتى مع التغطية الكاملة</p>
              </div>}
            </div>

            {/* القسم 3 — الإحصائيات */}
            <div className="rpt-card">
              <h3 className="rpt-section-title">الإحصائيات</h3>
              <div className="rpt-stats">
                <div className="rpt-stat"><div className="rpt-stat-v" style={{ color: BRAND.color }}>{totalBooked}</div><div className="rpt-stat-l">عمليات محجوزة</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{ color: "#5B7B3A" }}>{trackCoverage.covered}/4</div><div className="rpt-stat-l">مسارات مشمولة</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{ color: "#8B6914" }}>{avgPhase}</div><div className="rpt-stat-l">متوسط المرحلة</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{ color: "#6B4E3D" }}>{readinessAr}</div><div className="rpt-stat-l">مستوى الجاهزية</div></div>
              </div>
            </div>

            {/* القسم 4 — رحلة الحجز (Timeline) */}
            <div className="rpt-card">
              <h3 className="rpt-section-title">رحلة الحجز</h3>
              {timeline.map((t, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0", borderBottom: i < timeline.length - 1 ? "1px solid var(--sa)" : "none" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: t.trackColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, flexShrink: 0 }}>{t.step}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{t.nameAr}</div>
                  <div style={{ fontSize: "0.72rem", color: "#999" }}>{t.trackIcon} {t.trackNameAr} • {t.phaseNameAr}</div>
                </div>
                <div style={{ textAlign: "left", flexShrink: 0 }}>
                  <div style={{ fontSize: "0.75rem", color: BRAND.dark }}>{fmtShort(t.date)}</div>
                  {t.isConfirmed && <div style={{ fontSize: "0.62rem", color: "#5B7B3A" }}>✓ مؤكد</div>}
                </div>
              </div>)}
            </div>

            {/* القسم 5 — توزيع الاهتمام */}
            <div className="rpt-card">
              <h3 className="rpt-section-title">توزيع الاهتمام</h3>
              {trackDist.map(t => <div key={t.id} className="rpt-bar-row">
                <div className="rpt-bar-label" style={{ color: t.color }}>{t.icon} {t.nameAr}</div>
                <div className="rpt-bar-track"><div className="rpt-bar-fill" style={{ width: `${t.pct}%`, background: t.color }}>{t.pct > 15 && <span className="rpt-bar-pct">{t.pct}%</span>}</div></div>
                <div className="rpt-bar-count">{t.count}/4</div>
              </div>)}
            </div>

            {/* القسم 6 — فجوات التبعية */}
            {depGaps.length > 0 && <div className="rpt-card">
              <h3 className="rpt-section-title">⚠ فجوات التبعية</h3>
              {depGaps.map((g, i) => <div key={i} className="rpt-gap">
                حجزت <strong>{g.process}</strong> لكن لم تحجز <strong>{g.missing}</strong> ({g.missingIcon} {g.missingTrack}) التي تغذيها <span className="rpt-gap-arrow">←</span> يُنصح بتغطية هذه الفجوة
              </div>)}
            </div>}

            {/* القسم 7 — التوصيات */}
            {recommendations.length > 0 && <div className="rpt-card">
              <h3 className="rpt-section-title">التوصيات</h3>
              {recommendations.map((r, i) => <div key={i} className="rpt-rec"><span className="rpt-rec-icon">💡</span><span>{r}</span></div>)}
            </div>}

            {/* القسم 8 — التذييل */}
            <div className="rpt-card" style={{ textAlign: "center", padding: "1rem" }}>
              <MILogo size={18} color={BRAND.color} />
              <div style={{ fontSize: "0.72rem", color: "#999", marginTop: "0.3rem" }}>Milestone Impact — تقرير مولّد تلقائياً بناءً على نمط الحجز</div>
            </div>
          </>;
        })()}
      </div>}

      {/* ═══ SUMMARY ═══ */}
      {tab === "summary" && <div className="sec" style={{ animation: "fadeIn 0.4s" }}>
        <div className="sec-head"><h2 className="sec-title">المخرجات</h2></div>
        <div className="sum-card"><h3 className="sum-title">ملخص الخطة</h3>
          <div className="modal-grid" style={{ marginBottom: "1rem" }}>
            <div className="modal-item"><div className="modal-item-label">المشارك</div><div className="modal-item-value">{user.name}</div></div>
            <div className="modal-item"><div className="modal-item-label">مواعيد</div><div className="modal-item-value">{datedCount}/16</div></div>
            <div className="modal-item"><div className="modal-item-label">مؤكدة</div><div className="modal-item-value">{confirmedCount}/16</div></div>
            <div className="modal-item"><div className="modal-item-label">الحالة</div><div className="modal-item-value">{submitted ? "✓ مكتمل" : "قيد التخطيط"}</div></div>
          </div>
          {TRACKS.map(tr => <div key={tr.id} className="sum-track" style={{ borderRightColor: tr.color }}><div className="sum-track-head" style={{ color: tr.color }}>{tr.icon} {tr.nameAr} ({tr.weight}%)</div>{procs.filter(p => p.trackId === tr.id).map(p => <div key={p.key} className="sum-track-item"><span>{confirmed[p.key] ? "✓" : "○"} {p.nameAr}</span><span style={{ color: "#6B6560", fontSize: "0.75rem" }}>{dates[p.key] ? `${fmtShort(dates[p.key])} • ${fmtBoth(dates[p.key]).hijri}` : "—"}</span></div>)}</div>)}
        </div>
      </div>}

      {/* ═══ FINAL OUTPUT TABLE ═══ */}
      {tab === "output" && submitted && <div className="sec" style={{ animation: "fadeIn 0.4s" }}>
        <div className="output-card">
          <div className="output-header"><h3>📋 نموذج مصفوفة التأثير النهائي</h3><button className="btn btn-s btn-print" onClick={handlePrint}>🖨 طباعة</button></div>
          <div className="output-info">
            <div className="output-info-item"><div className="output-info-label">اسم المشارك</div><div className="output-info-value">{user.name}</div></div>
            <div className="output-info-item"><div className="output-info-label">رقم الجوال</div><div className="output-info-value" style={{ direction: "ltr" }}>{user.phone}</div></div>
            <div className="output-info-item"><div className="output-info-label">البريد</div><div className="output-info-value" style={{ fontSize: "0.78rem", direction: "ltr" }}>{user.email}</div></div>
          </div>
          <table className="output-table">
            <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>الوزن</th><th>المرحلة</th><th>المدة</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
            <tbody>{procs.filter(p => dates[p.key]).sort((a, b) => new Date(dates[a.key]) - new Date(dates[b.key])).map((p, j) => (
              <tr key={p.key}><td>{j + 1}</td><td style={{ fontWeight: 600 }}>{p.nameAr}</td><td style={{ color: p.trackColor }}>{p.trackIcon} {p.trackNameAr}</td><td>{p.trackWeight}%</td><td>{p.phaseNameAr}</td><td>{p.dur} أيام</td><td>{fmtGregorian(dates[p.key])}</td><td style={{ color: "#8B6914" }}>{gregorianToHijri(dates[p.key]).formatted}</td><td>{confirmed[p.key] ? <span className="badge badge-ok">✓ مؤكد</span> : <span className="badge badge-wait">محدد</span>}</td></tr>
            ))}</tbody>
          </table>
          <div className="output-stamp">
            <p>تم الإنشاء: <strong style={{ color: BRAND.color }}>{fmtBoth(new Date()).both}</strong></p>
            <p>المشارك: <strong>{user.name}</strong></p>
            <div className="copyright">للتواصل: <a href="tel:0532134539" style={{ color: BRAND.color, textDecoration: "none" }}>0532134539</a> | <a href="mailto:omar@sunkvalue.com" style={{ color: BRAND.color, textDecoration: "none" }}>omar@sunkvalue.com</a></div>
            <div className="copyright">© {new Date().getFullYear()} Milestone Impact — جميع الحقوق محفوظة</div>
          </div>
        </div>
      </div>}

      {/* ═══ MODAL ═══ */}
      {selectedCell && <div className="overlay" onClick={() => { setSelectedCell(null); setHighlightedKeys([]); }}><div className="modal" onClick={e => e.stopPropagation()}>
        <span className="modal-badge" style={{ background: selectedCell.trackColor }}>{selectedCell.trackIcon} {selectedCell.trackNameAr} • {selectedCell.phaseNameAr}</span>
        <h2>{selectedCell.nameAr}</h2>

        {/* البصيرة المنهجية */}
        {selectedCell.insight && <div className="modal-section">
          <div className="modal-insight-box">💡 {selectedCell.insight}</div>
        </div>}

        {/* الوصف التفصيلي */}
        <p className="modal-desc">{selectedCell.fullDesc || selectedCell.desc}</p>

        {/* لماذا يهم */}
        {selectedCell.whyItMatters && <div className="modal-section">
          <div className="modal-section-title">⚡ لماذا يهم</div>
          <div className="modal-why">{selectedCell.whyItMatters}</div>
        </div>}

        <div className="modal-grid">
          <div className="modal-item"><div className="modal-item-label">المدة</div><div className="modal-item-value">{selectedCell.duration || `${selectedCell.dur} أيام`}</div></div>
          <div className="modal-item"><div className="modal-item-label">الوزن</div><div className="modal-item-value">{selectedCell.trackWeight}%</div></div>
          <div className="modal-item"><div className="modal-item-label">المنطقة</div><div className="modal-item-value" style={{ fontSize: "0.78rem" }}>{selectedCell.groupAr}</div></div>
          <div className="modal-item"><div className="modal-item-label">الترتيب</div><div className="modal-item-value">#{selectedCell.index + 1}</div></div>
        </div>

        {/* المخرجات المتوقعة */}
        {selectedCell.outputs && selectedCell.outputs.length > 0 && <div className="modal-section">
          <div className="modal-section-title">📋 المخرجات المتوقعة</div>
          <div className="modal-outputs">
            {selectedCell.outputs.map((out, i) => <div key={i} className="modal-output-item"><div className="modal-output-dot" style={{ background: selectedCell.trackColor }} />{out}</div>)}
          </div>
        </div>}

        {/* العمليات المرتبطة */}
        {((selectedCell.feeds && selectedCell.feeds.length > 0) || (selectedCell.fedBy && selectedCell.fedBy.length > 0)) && <div className="modal-section">
          <div className="modal-section-title">🔗 شبكة الترابط</div>
          {selectedCell.fedBy && selectedCell.fedBy.length > 0 && <>
            <div className="modal-related-label">← تتغذى من:</div>
            <div className="modal-related" style={{ marginBottom: "0.4rem" }}>
              {selectedCell.fedBy.map(k => { const p = procs.find(x => x.key === k); return p ? <span key={k} className="modal-related-chip" style={{ borderColor: p.trackColor + '60', color: p.trackColor, background: p.trackColor + '08' }} onClick={() => { setSelectedCell(p); setTempDate(dates[p.key] || ""); setDateError(""); setHighlightedKeys([...(p.feeds || []), ...(p.fedBy || [])]); }}>{p.trackIcon} {p.nameAr}</span> : null; })}
            </div>
          </>}
          {selectedCell.feeds && selectedCell.feeds.length > 0 && <>
            <div className="modal-related-label">→ تغذي:</div>
            <div className="modal-related">
              {selectedCell.feeds.map(k => { const p = procs.find(x => x.key === k); return p ? <span key={k} className="modal-related-chip" style={{ borderColor: p.trackColor + '60', color: p.trackColor, background: p.trackColor + '08' }} onClick={() => { setSelectedCell(p); setTempDate(dates[p.key] || ""); setDateError(""); setHighlightedKeys([...(p.feeds || []), ...(p.fedBy || [])]); }}>{p.trackIcon} {p.nameAr}</span> : null; })}
            </div>
          </>}
        </div>}

        <div className="modal-divider" />

        <div className="date-section"><h4>📅 تحديد تاريخ البدء</h4>
          <div className="date-row">
            <input type="date" value={tempDate} min={todayISO()} onChange={e => { setTempDate(e.target.value); setDateError(""); }} />
            <button className="btn btn-s btn-gold" disabled={!tempDate} onClick={async () => { const ok = await saveDate(selectedCell.key, tempDate); if (ok) showToast("تم حفظ التاريخ ✓"); }}>حفظ</button>
          </div>
          {dateError && <div className="fg-msg" style={{ marginTop: "0.3rem" }}>{dateError}</div>}
          {tempDate && !dateError && <div className="hijri-badge">🌙 {gregorianToHijri(tempDate).formatted}</div>}
          {dates[selectedCell.key] && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem" }}>
            <span style={{ fontSize: "0.78rem", color: BRAND.dark }}>المحفوظ: {fmtBoth(dates[selectedCell.key]).both}</span>
            <button style={{ background: "none", border: "none", color: "#C0392B", fontSize: "0.72rem", cursor: "pointer", fontFamily: "'Tajawal'" }} onClick={async () => {
              const newDates = { ...dates }; delete newDates[selectedCell.key];
              const newConf = { ...confirmed }; delete newConf[selectedCell.key];
              setDates(newDates); setConfirmed(newConf);
              if (sessionId) { const rec = await DB.get(sessionId); if (rec) { rec.dates = newDates; rec.confirmed = newConf; await DB.save(sessionId, rec); } }
              setTempDate(""); showToast("تم حذف التاريخ");
            }}>✕ حذف التاريخ</button>
          </div>}
        </div>
        <div className="modal-actions">
          <button className={`btn ${confirmed[selectedCell.key] ? "btn-danger" : ""}`} onClick={() => toggleConfirm(selectedCell.key)} disabled={!dates[selectedCell.key]}>{confirmed[selectedCell.key] ? "إلغاء التأكيد ✕" : "تأكيد الموعد ✓"}</button>
          <button className="btn btn-outline" onClick={() => { setSelectedCell(null); setHighlightedKeys([]); }}>إغلاق</button>
        </div>
        {!dates[selectedCell.key] && <p style={{ fontSize: "0.72rem", color: "#A0522D", marginTop: "0.4rem", textAlign: "center" }}>حدد التاريخ أولاً</p>}
      </div></div>}

      {/* ═══ CONFIRM MODAL ═══ */}
      {confirmAction && <div className="confirm-overlay" onClick={() => setConfirmAction(null)}>
        <div className="confirm-box" onClick={e => e.stopPropagation()}>
          <h3>{confirmAction.title}</h3>
          <p>{confirmAction.message}</p>
          <div className="confirm-btns">
            <button className="btn btn-danger" onClick={confirmAction.onConfirm}>نعم، متأكد</button>
            <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>إلغاء</button>
          </div>
        </div>
      </div>}

      {toast && <div className="toast">{toast}</div>}
      <Footer />
    </div></>
  );
}
