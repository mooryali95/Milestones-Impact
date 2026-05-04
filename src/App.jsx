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
  { id: "innovation", nameAr: "الإبداع", weight: 21, color: "#5B7B3A", contentAr: "إعادة التعريف", icon: "◉" },
  { id: "establishment", nameAr: "الإنشاء", weight: 47, color: "#2E6B8A", contentAr: "تكوين المنتج", icon: "◆" },
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
    { nameAr: "تحليل ديموغرافي", dur: 5 },
    { nameAr: "تحليل المنتجات", dur: 4 },
    { nameAr: "تكوين الهوية الجديدة", dur: 6 },
    { nameAr: "تكوين القيمة التاريخية", dur: 3 },
  ],
  innovation: [
    { nameAr: "تكوين معرفي", dur: 4 },
    { nameAr: "إعادة تشكيل العلاقات", dur: 5 },
    { nameAr: "الدمج مع الهوية الجديدة", dur: 6 },
    { nameAr: "تكوين أنواع القيم", dur: 4 },
  ],
  establishment: [
    { nameAr: "القدرات المؤسسية", dur: 5 },
    { nameAr: "القدرات القيادية", dur: 4 },
    { nameAr: "بداية البراند", dur: 7 },
    { nameAr: "القيمة المستقبلية", dur: 3 },
  ],
  making: [
    { nameAr: "الاندماج مع مجالس الإدارة", dur: 5 },
    { nameAr: "قيادة المنتج", dur: 4 },
    { nameAr: "الاندماج مع منتجات أخرى", dur: 6 },
    { nameAr: "الإطلاق", dur: 3 },
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
  --cr: #F8F4ED; --sa: #EAE3D6; --ch: #1E1E1E; --wg: #6B6458; --sw: #FAFAF7;
  --ok: #5B7B3A; --no: #A0522D; --rd: #C0392B;
  --radius: 14px; --shadow-sm: 0 2px 8px rgba(0,0,0,0.04); --shadow-md: 0 6px 24px rgba(0,0,0,0.07);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body, #root { font-family: 'Tajawal', sans-serif; background: var(--cr); color: var(--ch); direction: rtl; min-height: 100vh; }
.app { min-height: 100vh; display: flex; flex-direction: column; }

/* ── Auth Screens (Split Layout) ── */
.auth-screen { min-height: 100vh; display: grid; grid-template-columns: 1fr 480px; }
@media(max-width: 800px) { .auth-screen { grid-template-columns: 1fr; } }
.auth-left {
  background: linear-gradient(160deg, #1a2535 0%, #0f1923 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 3rem; position: relative; overflow: hidden;
}
@media(max-width: 800px) { .auth-left { display: none; } }
.auth-left-grid {
  position: absolute; inset: 0; opacity: .04;
  background-image: linear-gradient(rgba(139,105,20,1) 1px,transparent 1px), linear-gradient(90deg,rgba(139,105,20,1) 1px,transparent 1px);
  background-size: 48px 48px;
}
.auth-left-content { position: relative; z-index: 1; text-align: center; max-width: 340px; }
.auth-left-quote { font-family: 'Amiri', serif; font-size: 1.35rem; color: rgba(255,255,255,0.85); line-height: 1.9; margin: 1.8rem 0; }
.auth-left-quote span { color: #C4A24E; }
.auth-left-attr { font-size: 0.68rem; letter-spacing: 3px; color: rgba(255,255,255,0.3); text-transform: uppercase; }
.auth-left-tracks { display: flex; gap: 0.5rem; justify-content: center; margin-top: 2rem; }
.auth-left-track { padding: 0.3rem 0.7rem; border-radius: 20px; font-size: 0.68rem; font-weight: 600; letter-spacing: 1px; }
.auth-right { background: var(--sw); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2.5rem 2rem; }
.auth-form-wrap { width: 100%; max-width: 360px; }
.auth-logo { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 2rem; justify-content: center; }
.auth-logo-text { font-family: 'Amiri', serif; font-size: 1.1rem; color: var(--mi-d); }
.auth-title { font-family: 'Amiri', serif; font-size: 1.7rem; color: var(--ch); margin-bottom: 0.3rem; }
.auth-sub { font-size: 0.85rem; color: var(--wg); margin-bottom: 2rem; line-height: 1.6; }
.auth-back { background: none; border: none; color: var(--wg); font-family: 'Tajawal'; font-size: 0.8rem; cursor: pointer; margin-top: 1.2rem; display: block; text-align: center; transition: color 0.2s; }
.auth-back:hover { color: var(--mi-d); }

/* ── Card ── */
.card { background: var(--sw); border-radius: 20px; padding: 2rem; width: 100%; max-width: 440px; box-shadow: var(--shadow-md); border: 1px solid rgba(107,157,173,0.1); }
.card h2 { font-family: 'Amiri', serif; font-size: 1.4rem; color: var(--mi-d); margin-bottom: 1.2rem; text-align: center; }
.back-link { text-align: center; margin-top: 1rem; }
.back-link button { background: none; border: none; color: var(--wg); font-family: 'Tajawal'; font-size: 0.85rem; cursor: pointer; text-decoration: underline; }

/* ── Form ── */
.fg { margin-bottom: 1rem; }
.fg label { display: block; font-weight: 600; font-size: 0.8rem; color: var(--wg); margin-bottom: 0.35rem; letter-spacing: 0.3px; }
.fg input { width: 100%; padding: 0.8rem 1rem; border: 1.5px solid var(--sa); border-radius: 10px; font-family: 'Tajawal'; font-size: 0.92rem; color: var(--ch); background: var(--cr); transition: all 0.25s; }
.fg input:focus { outline: none; border-color: var(--mi); background: var(--sw); box-shadow: 0 0 0 3px rgba(107,157,173,0.1); }
.fg-err input { border-color: var(--rd) !important; }
.fg-msg { font-size: 0.72rem; color: var(--rd); margin-top: 0.25rem; }

/* ── Buttons ── */
.btn { width: 100%; padding: 0.9rem; border: none; border-radius: 11px; font-family: 'Tajawal'; font-size: 0.95rem; font-weight: 700; color: #fff; background: linear-gradient(135deg, var(--mi-d), var(--mi)); cursor: pointer; transition: all 0.25s; box-shadow: 0 4px 14px rgba(107,157,173,0.25); letter-spacing: 0.3px; }
.btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(107,157,173,0.35); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-s { width: auto; padding: 0.5rem 1rem; font-size: 0.82rem; border-radius: 8px; }
.btn-gold { background: linear-gradient(135deg, var(--go-d), var(--go)); box-shadow: 0 4px 14px rgba(139,105,20,0.25); }
.btn-gold:hover { box-shadow: 0 6px 20px rgba(139,105,20,0.35); }
.btn-outline { background: none; border: 1.5px solid var(--sa); color: var(--wg); box-shadow: none; }
.btn-outline:hover { border-color: var(--mi); color: var(--mi); transform: none; box-shadow: none; }
.btn-danger { background: linear-gradient(135deg, var(--no), #C0724D); }
.btn-print { background: linear-gradient(135deg, #2C3E50, #34495E); }

/* ── Nav — Unified Compact ── */
.nav {
  background: linear-gradient(135deg, var(--mi-dd), var(--mi-d));
  padding: 0 1.5rem;
  height: 54px;
  display: flex; align-items: center; justify-content: space-between;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  position: sticky; top: 0; z-index: 100;
  gap: 0.5rem;
}
.nav-admin { background: linear-gradient(135deg, #1a1a2e, #16213e); }
.nav-brand { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.nav-logo { width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; }
.nav-user { font-size: 0.78rem; color: rgba(255,255,255,0.85); font-weight: 600; }
.nav-center { flex: 1; display: flex; justify-content: center; }
.tabs { display: flex; gap: 1px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 2px; }
.tab { padding: 0.35rem 0.8rem; border: none; border-radius: 6px; font-family: 'Tajawal'; font-size: 0.78rem; font-weight: 500; color: rgba(255,255,255,0.55); background: transparent; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.tab.on { background: rgba(255,255,255,0.18); color: #fff; font-weight: 600; }
.nav-right { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
.nav-prog { display: flex; align-items: center; gap: 0.5rem; }
.nav-prog-bar { width: 80px; height: 4px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; }
.nav-prog-fill { height: 100%; background: linear-gradient(90deg, #C4A24E, #E8D48A); border-radius: 4px; transition: width 0.5s ease; }
.nav-prog-pct { font-size: 0.72rem; color: rgba(255,255,255,0.7); font-weight: 600; min-width: 28px; }
.btn-logout { padding: 0.35rem 0.8rem; border: 1px solid rgba(255,255,255,0.25); border-radius: 7px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); font-family: 'Tajawal'; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; }
.btn-logout:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.4); }

/* ── Section ── */
.sec { padding: 1.2rem 1.5rem 1.5rem; }
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
.sec-title { font-family: 'Amiri', serif; font-size: 1.2rem; color: var(--mi-d); }

/* ── Banner ── */
.banner { background: linear-gradient(135deg, ${BRAND.color}, ${BRAND.light}); border-radius: var(--radius); padding: 0.9rem 1.3rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; color: #fff; }
.banner-item { text-align: center; }
.banner-item h4 { font-family: 'Amiri', serif; font-size: 0.95rem; }
.banner-item p { font-size: 0.75rem; opacity: 0.85; }

/* ── Matrix ── */
.mx-groups { display: flex; margin-bottom: 0.4rem; padding-right: 110px; gap: 3px; }
.mx-grp { flex: 1; text-align: center; padding: 0.45rem; font-family: 'Amiri', serif; font-weight: 700; font-size: 0.82rem; color: #fff; border-radius: 8px 8px 0 0; }
.mx-grp-c { background: linear-gradient(135deg, var(--mi-d), var(--mi)); }
.mx-grp-n { background: linear-gradient(135deg, var(--ol-d), var(--ol)); }
.mx-phases { display: flex; margin-bottom: 4px; padding-right: 110px; }
.mx-ph { flex: 1; text-align: center; padding: 0.3rem; font-size: 0.68rem; font-weight: 600; color: var(--wg); background: rgba(0,0,0,0.02); letter-spacing: 0.3px; }
.mx-grid { display: flex; flex-direction: column; gap: 4px; }
.mx-row { display: flex; gap: 0; }
.mx-track { width: 110px; min-width: 110px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.6rem 0.3rem; border-radius: 0 10px 10px 0; color: #fff; gap: 1px; }
.mx-tw { font-size: 1.1rem; font-weight: 800; line-height: 1; }
.mx-tn { font-size: 0.72rem; font-weight: 700; }
.mx-tc { font-size: 0.58rem; opacity: 0.55; }
.mx-cells { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }

/* ── Cell — Redesigned ── */
.cell {
  background: var(--sw); border-radius: 10px; padding: 0.7rem 0.65rem 0.6rem;
  cursor: pointer; transition: all 0.2s ease; border: 1.5px solid transparent;
  position: relative; overflow: hidden; min-height: 100px;
  display: flex; flex-direction: column; justify-content: space-between;
  box-shadow: var(--shadow-sm);
}
.cell:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.08); border-color: rgba(107,157,173,0.2); }
.cell .bar { position: absolute; top: 0; right: 0; width: 3px; height: 100%; border-radius: 0 10px 10px 0; }
.cell.done { border-color: rgba(91,123,58,0.25); background: rgba(91,123,58,0.03); }
.cell.done::after { content: '✓'; position: absolute; top: 5px; left: 5px; width: 17px; height: 17px; background: var(--ok); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.58rem; font-weight: 700; }
.cell.dated { border-color: rgba(196,162,78,0.25); }
.cell .num { position: absolute; top: 5px; left: 5px; width: 16px; height: 16px; border-radius: 50%; background: var(--sa); color: var(--wg); font-size: 0.56rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.cell.done .num { display: none; }
.cell-name { font-weight: 700; font-size: 0.8rem; line-height: 1.35; color: var(--ch); padding-left: 18px; }
.cell-meta { display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap; margin-top: 0.35rem; }
.cell-dur { font-size: 0.62rem; padding: 0.1rem 0.35rem; border-radius: 4px; background: var(--sa); color: var(--wg); font-weight: 500; }
.cell-date { font-size: 0.62rem; color: var(--mi-d); font-weight: 600; }

/* ── Cell Hover Tooltip ── */
.cell-insight { position: absolute; bottom: 0; left: 0; right: 0; padding: 0.3rem 0.45rem; font-size: 0.6rem; line-height: 1.3; color: #fff; border-radius: 0 0 8px 8px; opacity: 0; transform: translateY(4px); transition: all 0.22s ease; pointer-events: none; z-index: 10; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell:hover .cell-insight { opacity: 1; transform: translateY(0); }
@media (max-width: 640px) { .cell-insight { display: none; } }
.cell.highlighted { box-shadow: 0 0 0 2px rgba(107,157,173,0.45), 0 4px 14px rgba(107,157,173,0.18); transform: translateY(-1px); }

/* ── Missing warning ── */
.missing { background: rgba(192,57,43,0.04); border: 1.5px solid rgba(192,57,43,0.1); border-radius: 11px; padding: 0.9rem 1.1rem; margin-top: 1rem; }
.missing h4 { color: var(--rd); font-size: 0.85rem; margin-bottom: 0.4rem; }
.missing-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.missing-chip { font-size: 0.7rem; padding: 0.18rem 0.45rem; border-radius: 5px; background: rgba(192,57,43,0.06); color: var(--rd); cursor: pointer; }

/* ── Submit ── */
.submit { border-radius: var(--radius); padding: 1.2rem; text-align: center; margin: 1rem 0; }
.submit-ready { background: rgba(107,157,173,0.05); border: 2px solid var(--mi); }
.submit-wait { background: rgba(0,0,0,0.02); border: 2px dashed var(--sa); }
.submit-done { background: rgba(91,123,58,0.04); border: 2px solid var(--ok); }
.submit h3 { font-family: 'Amiri', serif; margin-bottom: 0.4rem; font-size: 1.1rem; }
.submit p { color: var(--wg); font-size: 0.83rem; margin-bottom: 0.7rem; }

/* ── Modal ── */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.5rem; animation: fadeIn 0.2s; }
.modal { background: var(--sw); border-radius: 18px; padding: 1.8rem; max-width: 560px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.14); animation: slideUp 0.28s cubic-bezier(0.22,1,0.36,1); max-height: 90vh; overflow-y: auto; }
.modal-badge { display: inline-block; padding: 0.22rem 0.65rem; border-radius: 6px; color: #fff; font-size: 0.7rem; font-weight: 700; margin-bottom: 0.8rem; letter-spacing: 0.5px; }
.modal h2 { font-family: 'Amiri', serif; font-size: 1.6rem; margin-bottom: 0.4rem; color: var(--ch); line-height: 1.2; }
.modal-desc { color: var(--wg); font-size: 0.87rem; line-height: 1.75; margin-bottom: 1rem; }
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem; }
.modal-item { background: var(--cr); padding: 0.55rem 0.75rem; border-radius: 9px; }
.modal-item-label { font-size: 0.65rem; color: var(--wg); font-weight: 600; letter-spacing: 0.3px; }
.modal-item-value { font-weight: 700; font-size: 0.88rem; margin-top: 0.1rem; }
.date-section { background: var(--cr); border-radius: 11px; padding: 0.9rem; margin-bottom: 1rem; }
.date-section h4 { font-size: 0.82rem; color: var(--mi-d); margin-bottom: 0.5rem; font-weight: 700; }
.date-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.date-row input { flex: 1; min-width: 140px; padding: 0.55rem 0.75rem; border: 1.5px solid var(--sa); border-radius: 8px; font-family: 'Tajawal'; direction: ltr; font-size: 0.9rem; background: var(--sw); transition: border-color 0.2s; }
.date-row input:focus { outline: none; border-color: var(--mi); }
.hijri-badge { font-size: 0.78rem; color: var(--go-d); font-weight: 700; padding: 0.35rem 0.65rem; background: rgba(196,162,78,0.1); border-radius: 7px; margin-top: 0.35rem; }
.modal-actions { display: flex; gap: 0.5rem; }
.modal-actions .btn { flex: 1; }
.modal-section { margin-bottom: 0.9rem; }
.modal-section-title { font-size: 0.75rem; font-weight: 700; color: var(--mi-d); margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.3rem; letter-spacing: 0.3px; }
.modal-insight-box { background: linear-gradient(135deg, rgba(107,157,173,0.07), rgba(107,157,173,0.02)); border-right: 3px solid var(--mi); border-radius: 9px; padding: 0.75rem 1rem; font-size: 0.87rem; font-weight: 600; color: var(--mi-d); line-height: 1.65; }
.modal-why { font-size: 0.83rem; color: var(--wg); line-height: 1.75; padding: 0.4rem 0; }
.modal-outputs { display: flex; flex-direction: column; gap: 0.3rem; }
.modal-output-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--ch); padding: 0.35rem 0.65rem; background: rgba(107,157,173,0.04); border-radius: 7px; }
.modal-output-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.modal-related { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.modal-related-chip { font-size: 0.7rem; padding: 0.25rem 0.55rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; border: 1.5px solid; font-weight: 500; }
.modal-related-chip:hover { transform: translateY(-1px); opacity: 0.82; }
.modal-related-label { font-size: 0.63rem; color: var(--wg); margin-bottom: 0.2rem; font-weight: 600; }
.modal-divider { height: 1px; background: var(--sa); margin: 0.8rem 0; }

/* ── Timeline ── */
.tl { position: relative; padding-right: 1.8rem; }
.tl::before { content: ''; position: absolute; right: 6px; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, var(--mi-d), var(--mi-l)); border-radius: 2px; }
.tl-item { position: relative; padding: 0 1.6rem 1rem 0; animation: slideR 0.3s ease both; }
.tl-dot { position: absolute; right: -1.8rem; top: 0.2rem; width: 13px; height: 13px; border-radius: 50%; border: 2.5px solid; background: var(--sw); }
.tl-card { background: var(--sw); border-radius: 11px; padding: 0.9rem 1rem; box-shadow: var(--shadow-sm); border-right: 3px solid; }
.tl-step { font-size: 0.62rem; font-weight: 700; color: #fff; padding: 0.1rem 0.4rem; border-radius: 4px; display: inline-block; margin-bottom: 0.3rem; }
.tl-name { font-weight: 700; font-size: 0.88rem; margin-bottom: 0.12rem; }
.tl-track { font-size: 0.72rem; color: var(--wg); margin-bottom: 0.25rem; }
.tl-dates { font-size: 0.73rem; color: var(--mi-d); display: flex; gap: 0.5rem; flex-wrap: wrap; }
.tl-hijri { font-size: 0.68rem; color: var(--go-d); margin-top: 0.12rem; font-weight: 600; }

/* ── Admin ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1.2rem; }
.stat { background: var(--sw); border-radius: var(--radius); padding: 1.1rem; box-shadow: var(--shadow-sm); text-align: center; border-top: 3px solid; }
.stat-v { font-size: 1.8rem; font-weight: 800; margin-bottom: 0.12rem; }
.stat-l { font-size: 0.75rem; color: var(--wg); }
.admin-table { background: var(--sw); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); overflow-x: auto; }
.admin-table table { width: 100%; border-collapse: collapse; min-width: 650px; }
.admin-table th { background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; padding: 0.7rem 0.75rem; font-weight: 600; font-size: 0.76rem; }
.admin-table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--sa); font-size: 0.78rem; }
.badge { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 5px; font-size: 0.68rem; font-weight: 700; }
.badge-ok { background: rgba(91,123,58,0.1); color: var(--ok); }
.badge-wait { background: rgba(196,162,78,0.1); color: var(--go-d); }

/* ── Output Table ── */
.output-card { background: var(--sw); border-radius: 16px; padding: 1.5rem; box-shadow: var(--shadow-md); margin-bottom: 1.2rem; border: 2px solid var(--mi); }
.output-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
.output-header h3 { font-family: 'Amiri', serif; font-size: 1.3rem; color: var(--mi-d); }
.output-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin-bottom: 1rem; padding: 0.8rem; background: rgba(107,157,173,0.04); border-radius: 10px; }
.output-info-item { text-align: center; }
.output-info-label { font-size: 0.65rem; color: var(--wg); font-weight: 600; }
.output-info-value { font-weight: 700; font-size: 0.88rem; }
.output-table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 10px; }
.output-table th { background: linear-gradient(135deg, var(--mi-dd), var(--mi-d)); color: #fff; padding: 0.6rem 0.7rem; font-size: 0.74rem; }
.output-table td { padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--sa); font-size: 0.77rem; }
.output-table tr:nth-child(even) td { background: rgba(107,157,173,0.02); }
.output-stamp { text-align: center; margin-top: 1rem; padding-top: 0.8rem; border-top: 2px dashed var(--sa); }
.output-stamp p { font-size: 0.78rem; color: var(--wg); margin-bottom: 0.2rem; }
.copyright { font-size: 0.7rem; color: #aaa; margin-top: 0.5rem; }

/* ── Summary ── */
.sum-card { background: var(--sw); border-radius: 16px; padding: 1.5rem; box-shadow: var(--shadow-sm); margin-bottom: 1rem; }
.sum-title { font-family: 'Amiri', serif; font-size: 1.2rem; color: var(--mi-d); margin-bottom: 0.7rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--sa); }
.sum-track { padding: 0.75rem; background: var(--cr); border-radius: 9px; border-right: 3px solid; margin-bottom: 0.6rem; }
.sum-track-head { font-weight: 700; margin-bottom: 0.3rem; }
.sum-track-item { display: flex; justify-content: space-between; padding: 0.2rem 0; font-size: 0.77rem; border-bottom: 1px solid rgba(0,0,0,0.03); }

/* ── Toast ── */
.toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); background: #1E1E1E; color: #fff; padding: 0.7rem 1.3rem; border-radius: 10px; font-size: 0.83rem; z-index: 2000; animation: slideUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards; box-shadow: 0 8px 24px rgba(0,0,0,0.22); max-width: 90vw; text-align: center; }

/* ── Confirm ── */
.confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 1.5rem; animation: fadeIn 0.2s; }
.confirm-box { background: var(--sw); border-radius: 18px; padding: 2rem; max-width: 380px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.18); animation: slideUp 0.3s; text-align: center; }
.confirm-box h3 { font-family: 'Amiri', serif; font-size: 1.25rem; color: var(--ch); margin-bottom: 0.6rem; }
.confirm-box p { color: var(--wg); font-size: 0.87rem; line-height: 1.65; margin-bottom: 1.2rem; white-space: pre-line; }
.confirm-btns { display: flex; gap: 0.6rem; }
.confirm-btns .btn { flex: 1; padding: 0.7rem; font-size: 0.88rem; }

/* ── Empty ── */
.empty { text-align: center; padding: 2.5rem 1.5rem; color: var(--wg); }
.empty h3 { font-family: 'Amiri', serif; font-size: 1.15rem; color: var(--ch); margin-bottom: 0.3rem; }

/* ── Footer ── */
.app-footer { text-align: center; padding: 1.2rem; border-top: 1px solid var(--sa); margin-top: auto; }
.app-footer p { font-size: 0.72rem; color: #bbb; }

/* ── Report ── */
.rpt-card { background: var(--sw); border-radius: 16px; padding: 1.5rem; box-shadow: var(--shadow-sm); margin-bottom: 1rem; }
.rpt-pattern { text-align: center; padding: 1.4rem; background: linear-gradient(135deg, rgba(107,157,173,0.05), rgba(107,157,173,0.01)); border-radius: var(--radius); margin-bottom: 1.2rem; border: 1.5px solid rgba(107,157,173,0.1); }
.rpt-pattern-icon { font-size: 2.2rem; margin-bottom: 0.3rem; }
.rpt-pattern-name { font-family: 'Amiri', serif; font-size: 1.5rem; color: var(--mi-d); margin-bottom: 0.4rem; }
.rpt-pattern-desc { font-size: 0.83rem; color: var(--wg); line-height: 1.75; max-width: 500px; margin: 0 auto; }
.rpt-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin-bottom: 1.2rem; }
.rpt-stat { background: var(--cr); border-radius: 11px; padding: 0.9rem 0.6rem; text-align: center; }
.rpt-stat-v { font-size: 1.4rem; font-weight: 800; margin-bottom: 0.1rem; }
.rpt-stat-l { font-size: 0.7rem; color: var(--wg); }
.rpt-bar-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
.rpt-bar-label { width: 85px; font-size: 0.76rem; font-weight: 600; text-align: left; flex-shrink: 0; }
.rpt-bar-track { flex: 1; height: 20px; background: var(--sa); border-radius: 5px; overflow: hidden; }
.rpt-bar-fill { height: 100%; border-radius: 5px; transition: width 0.8s ease; display: flex; align-items: center; justify-content: flex-end; padding-left: 0.3rem; }
.rpt-bar-pct { font-size: 0.62rem; font-weight: 700; color: #fff; }
.rpt-bar-count { font-size: 0.7rem; color: var(--wg); width: 32px; text-align: center; flex-shrink: 0; }
.rpt-gap { background: rgba(192,57,43,0.03); border: 1.5px solid rgba(192,57,43,0.1); border-radius: 9px; padding: 0.65rem 0.85rem; margin-bottom: 0.45rem; font-size: 0.79rem; line-height: 1.6; }
.rpt-rec { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.6rem 0.75rem; background: rgba(91,123,58,0.04); border-radius: 9px; margin-bottom: 0.4rem; font-size: 0.81rem; line-height: 1.65; }
.rpt-rec-icon { color: var(--ok); font-size: 0.95rem; flex-shrink: 0; margin-top: 0.1rem; }
.rpt-empty { text-align: center; padding: 3rem 1.5rem; }
.rpt-empty h3 { font-family: 'Amiri', serif; color: var(--mi-d); font-size: 1.2rem; margin-bottom: 0.5rem; }
.rpt-empty p { color: var(--wg); font-size: 0.87rem; line-height: 1.65; }
.rpt-section-title { font-family: 'Amiri', serif; font-size: 1.05rem; color: var(--mi-d); margin-bottom: 0.7rem; padding-bottom: 0.4rem; border-bottom: 2px solid var(--sa); }
@media (max-width: 640px) { .rpt-stats { grid-template-columns: repeat(2, 1fr); } .rpt-bar-label { width: 65px; font-size: 0.7rem; } }

/* ── Admin Content Editor ── */
.adm-edit-card { background: var(--sw); border-radius: 11px; padding: 1rem; margin-bottom: 0.75rem; border: 1px solid var(--sa); }
.adm-edit-card:hover { border-color: var(--mi); }
.adm-edit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; cursor: pointer; }
.adm-edit-header h4 { font-size: 0.87rem; color: var(--mi-d); margin: 0; }
.adm-field { margin-bottom: 0.6rem; }
.adm-field label { display: block; font-size: 0.7rem; font-weight: 600; color: var(--wg); margin-bottom: 0.2rem; }
.adm-field input, .adm-field textarea { width: 100%; padding: 0.5rem 0.6rem; border: 1.5px solid var(--sa); border-radius: 8px; font-family: 'Tajawal', sans-serif; font-size: 0.82rem; direction: rtl; resize: vertical; box-sizing: border-box; background: var(--cr); }
.adm-field input:focus, .adm-field textarea:focus { border-color: var(--mi); outline: none; }
.adm-field textarea { min-height: 60px; }
.adm-actions { display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.5rem; }
.adm-consultant { background: linear-gradient(135deg, rgba(107,157,173,0.03), rgba(107,157,173,0.01)); border: 1.5px solid rgba(107,157,173,0.12); border-radius: 11px; padding: 1rem; margin-bottom: 0.75rem; }
.adm-consultant h4 { color: var(--mi-d); font-size: 0.88rem; margin-bottom: 0.4rem; }
.adm-note { font-size: 0.77rem; color: var(--wg); padding: 0.4rem 0.6rem; background: rgba(139,105,20,0.04); border-radius: 7px; margin-bottom: 0.4rem; }

/* ── Smart Suggestions ── */
.smart-box { border-radius: var(--radius); padding: 1rem 1.2rem; margin-bottom: 1rem; animation: fadeIn 0.5s; }
.smart-welcome { background: linear-gradient(135deg, rgba(107,157,173,0.05), rgba(107,157,173,0.01)); border: 1.5px dashed var(--mi); text-align: center; }
.smart-welcome h3 { font-family: 'Amiri', serif; color: var(--mi-d); font-size: 1.1rem; margin-bottom: 0.3rem; }
.smart-welcome p { font-size: 0.82rem; color: var(--wg); line-height: 1.6; margin-bottom: 0.5rem; }
.smart-progress { background: rgba(91,123,58,0.04); border: 1.5px solid rgba(91,123,58,0.12); }
.smart-progress h4 { color: var(--ok); font-size: 0.88rem; margin-bottom: 0.3rem; }
.smart-progress p { font-size: 0.8rem; color: var(--wg); line-height: 1.5; }
.smart-suggest { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem; }
.smart-chip { font-size: 0.73rem; padding: 0.3rem 0.65rem; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-weight: 600; border: 1.5px solid; }
.smart-chip:hover { transform: translateY(-1px); opacity: 0.82; }
.smart-counter { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.76rem; color: var(--mi-d); font-weight: 700; margin-top: 0.4rem; }

/* ── Demo Form ── */
.demo-field label { font-size: 0.7rem; font-weight: 600; color: var(--wg); }
.demo-field input,.demo-field select { border: 1.5px solid var(--sa); border-radius: 8px; padding: 0.45rem 0.6rem; font-family: Tajawal,sans-serif; font-size: 0.82rem; background: var(--cr); color: var(--mi-d); }
.demo-field input:focus,.demo-field select:focus { outline: none; border-color: #8B6914; }
.demo-section-label { font-size: 0.75rem; font-weight: 700; color: var(--mi-d); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.6rem; background: var(--cr); border-radius: 8px; }
.demo-scores { display: grid; grid-template-columns: repeat(5,1fr); gap: 0.5rem; margin-bottom: 0.8rem; }
.demo-scores-4 { grid-template-columns: repeat(4,1fr); }
.demo-score { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
.demo-score label { font-size: 0.65rem; color: var(--wg); text-align: center; }
.demo-score input[type=number] { width: 100%; border: 1.5px solid var(--sa); border-radius: 8px; padding: 0.35rem; text-align: center; font-family: Tajawal,sans-serif; font-size: 0.85rem; font-weight: 700; color: var(--mi-d); background: var(--cr); }
.demo-score input[type=number]:focus { outline: none; border-color: #8B6914; }
.demo-targets { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.demo-target-chip { display: flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.75rem; border-radius: 20px; border: 1.5px solid var(--sa); font-size: 0.75rem; cursor: pointer; transition: all 0.2s; user-select: none; }
.demo-target-chip.active { border-color: #8B6914; background: #8B691415; color: #8B6914; font-weight: 600; }
.demo-footer { background: var(--sw); border-top: 1px solid var(--sa); padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-shrink: 0; }
.demo-add-btn { background: none; border: 1.5px dashed var(--sa); border-radius: 10px; padding: 0.5rem 1rem; color: var(--wg); cursor: pointer; font-family: Tajawal,sans-serif; font-size: 0.82rem; }
.demo-add-btn:hover { border-color: #8B6914; color: #8B6914; }

/* ── Demo CTA ── */
.demo-cta { background: linear-gradient(135deg,#8B691408,#8B691415); border:1.5px solid #8B691430; border-radius:12px; padding:1rem 1.1rem; margin-top:0.8rem; display:flex; align-items:center; gap:0.75rem; cursor:pointer; transition:all 0.2s; }
.demo-cta:hover { border-color:#8B6914; background:linear-gradient(135deg,#8B691415,#8B691422); transform:translateY(-1px); box-shadow:0 4px 16px rgba(139,105,20,0.15); }
.demo-cta-icon { font-size:1.6rem; flex-shrink:0; }
.demo-cta-text { flex:1; }
.demo-cta-title { font-weight:700; font-size:0.88rem; color:#8B6914; margin-bottom:0.15rem; }
.demo-cta-desc { font-size:0.75rem; color:var(--wg); line-height:1.4; }
.demo-cta-arrow { color:#8B6914; font-size:1.1rem; flex-shrink:0; }

/* ── Demo Screen ── */
.demo-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(5px); display:flex; align-items:center; justify-content:center; z-index:1500; padding:1rem; animation:fadeIn 0.2s; }
.demo-screen { background:var(--sw); border-radius:20px; width:100%; max-width:720px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.2); animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1); }
.demo-header { background:linear-gradient(135deg,#1a1a2e,#16213e); color:#fff; padding:1rem 1.4rem; display:flex; align-items:center; gap:0.8rem; flex-shrink:0; border-radius:20px 20px 0 0; }
.demo-header-back { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.18); color:#fff; border-radius:8px; padding:0.35rem 0.8rem; cursor:pointer; font-family:Tajawal,sans-serif; font-size:0.78rem; transition:background 0.2s; }
.demo-header-back:hover { background:rgba(255,255,255,0.2); }
.demo-header-info { flex:1; }
.demo-header-title { font-family:Amiri,serif; font-size:1rem; font-weight:700; }
.demo-header-sub { font-size:0.68rem; opacity:0.6; margin-top:0.08rem; }
.demo-header-badge { background:#8B6914; padding:0.25rem 0.65rem; border-radius:20px; font-size:0.7rem; font-weight:700; white-space:nowrap; }
.demo-body { flex:1; overflow-y:auto; padding:1.2rem 1.4rem; }
.demo-intro { background:var(--sw); border-radius:14px; padding:1.1rem 1.3rem; margin-bottom:1.5rem; border-right:4px solid #8B6914; box-shadow:var(--shadow-sm); }
.demo-intro-title { font-weight:700; color:#8B6914; margin-bottom:0.35rem; font-size:0.9rem; display:flex; align-items:center; gap:0.4rem; }
.demo-intro-text { font-size:0.82rem; color:var(--wg); line-height:1.75; }
.demo-card { background:var(--sw); border-radius:16px; padding:1.3rem; margin-bottom:1rem; box-shadow:var(--shadow-sm); border:1.5px solid var(--sa); transition:border-color 0.2s; }
.demo-card:hover { border-color:#8B691430; }
.demo-card-header { display:flex; align-items:center; gap:0.6rem; margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid var(--sa); }
.demo-card-num { width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#8B6914,#A07820); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.78rem; font-weight:700; flex-shrink:0; }
.demo-card-name { font-weight:700; font-size:0.92rem; color:var(--ch); flex:1; }
.demo-card-remove { background:none; border:none; color:#C0392B; cursor:pointer; font-size:0.8rem; padding:0.2rem 0.5rem; border-radius:6px; transition:background 0.2s; }
.demo-card-remove:hover { background:rgba(192,57,43,0.08); }

/* ── Demo Admin Table ── */
.demo-admin-table { width:100%; border-collapse:collapse; font-size:0.74rem; margin-top:0.5rem; overflow-x:auto; display:block; }
.demo-admin-table th { background:#1a1a2e; color:#fff; padding:0.5rem 0.6rem; font-weight:600; text-align:right; white-space:nowrap; }
.demo-admin-table td { padding:0.5rem 0.6rem; border-bottom:1px solid var(--sa); vertical-align:top; }
.demo-score-pill { display:inline-block; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700; font-size:0.72rem; }
.demo-empty-state { text-align:center; padding:2rem; color:var(--wg); font-size:0.85rem; }

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

/* ══ USER PAGE — UX Improvements ══ */
/* Bottom Tab Bar — Mobile */
.user-bottom-bar{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--mi-dd);border-top:1px solid rgba(255,255,255,0.1);z-index:200;padding:.3rem 0;box-shadow:0 -4px 16px rgba(0,0,0,0.12);}
.user-bottom-bar button{flex:1;background:none;border:none;color:rgba(255,255,255,0.4);font-family:Tajawal,sans-serif;font-size:.62rem;padding:.35rem 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:.12rem;transition:color .2s;}
.user-bottom-bar button.on{color:#fff;}
.user-bottom-bar .ubb-icon{font-size:.95rem;}
/* Context Bar (replaces banner) */
.ctx-bar{display:flex;align-items:center;gap:.6rem;padding:.65rem 1rem;background:var(--sw);border-radius:var(--radius);border:1.5px solid var(--sa);margin-bottom:1rem;flex-wrap:wrap;}
.ctx-stat{display:flex;align-items:center;gap:.35rem;font-size:.78rem;}
.ctx-stat-num{font-weight:800;font-size:1rem;color:var(--mi-d);}
.ctx-stat-label{color:var(--wg);font-size:.72rem;}
.ctx-divider{width:1px;height:24px;background:var(--sa);flex-shrink:0;}
.ctx-bar-prog{flex:1;min-width:120px;display:flex;align-items:center;gap:.5rem;}
.ctx-bar-track{flex:1;height:6px;background:var(--sa);border-radius:4px;overflow:hidden;}
.ctx-bar-fill{height:100%;background:linear-gradient(90deg,var(--mi-d),#C4A24E);border-radius:4px;transition:width .5s ease;}
/* Smart Suggestions — Below Matrix */
.smart-below{background:linear-gradient(135deg,rgba(107,157,173,0.04),rgba(107,157,173,0.01));border:1px solid rgba(107,157,173,0.12);border-radius:var(--radius);padding:.85rem 1rem;margin-top:.75rem;}
.smart-below-label{font-size:.72rem;color:var(--mi-d);font-weight:700;margin-bottom:.4rem;display:flex;align-items:center;gap:.3rem;}
/* Mobile Matrix — Track indicator */
.mx-mobile-track{display:none;font-size:.72rem;font-weight:700;color:#fff;padding:.4rem .8rem;border-radius:8px 8px 0 0;margin-top:.5rem;}
/* Modal — X button */
.modal-x{position:absolute;top:.9rem;left:1rem;width:28px;height:28px;border-radius:50%;background:var(--sa);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem;color:var(--wg);transition:all .2s;z-index:1;}
.modal-x:hover{background:var(--mi);color:#fff;}
.modal{position:relative;}
/* Submit — enhanced */
.submit-missing-link{font-size:.75rem;color:var(--mi-d);cursor:pointer;text-decoration:underline;font-weight:600;margin-top:.4rem;display:inline-block;}
/* Schedule — inline edit */
.tl-edit-btn{background:none;border:1px solid var(--sa);border-radius:6px;padding:.18rem .45rem;font-size:.65rem;color:var(--wg);cursor:pointer;font-family:Tajawal,sans-serif;transition:all .2s;margin-right:.3rem;}
.tl-edit-btn:hover{border-color:var(--mi);color:var(--mi);}
/* Report — hide tab when <3 bookings handled in JS */
/* Merge summary+output hint */
.output-tab-hint{text-align:center;padding:.6rem;background:rgba(91,123,58,0.06);border-radius:8px;font-size:.78rem;color:var(--ok);margin-bottom:.8rem;cursor:pointer;}
@media(max-width:640px){
  .user-bottom-bar{display:flex;}
  .user-desktop-tabs{display:none!important;}
  .sec{padding-bottom:5rem;}
  .ctx-divider{display:none;}
  .mx-mobile-track{display:block;}
}
.admin-bottom-bar{display:none;position:fixed;bottom:0;left:0;right:0;background:#1a1a2e;border-top:1px solid rgba(255,255,255,0.08);z-index:200;padding:.3rem 0;}
.admin-bottom-bar button{flex:1;background:none;border:none;color:rgba(255,255,255,0.4);font-family:Tajawal,sans-serif;font-size:.65rem;padding:.35rem 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:.15rem;transition:color .2s;}
.admin-bottom-bar button.on{color:#6B9DAD;}
.admin-bottom-bar .bar-icon{font-size:1rem;}
.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.2rem;}
.stat{background:var(--sw);border-radius:var(--radius);padding:1rem .8rem;box-shadow:var(--shadow-sm);text-align:center;border-top:3px solid;}
.stat-v{font-size:1.7rem;font-weight:800;margin-bottom:.1rem;}
.stat-l{font-size:.72rem;color:var(--wg);}
.reg-list{display:flex;flex-direction:column;gap:.55rem;}
.reg-card{background:var(--sw);border-radius:var(--radius);padding:.9rem 1rem;box-shadow:var(--shadow-sm);border:1.5px solid var(--sa);cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:.7rem;}
.reg-card:hover{border-color:var(--mi);box-shadow:var(--shadow-md);transform:translateY(-1px);}
.reg-card.has-alert{border-color:rgba(192,57,43,.3);background:rgba(192,57,43,.02);}
.reg-card-avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:Amiri,serif;font-size:1rem;font-weight:700;color:#fff;flex-shrink:0;}
.reg-card-info{flex:1;min-width:0;}
.reg-card-name{font-weight:700;font-size:.88rem;color:var(--ch);margin-bottom:.12rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.reg-card-meta{font-size:.7rem;color:var(--wg);display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;}
.reg-card-right{display:flex;flex-direction:column;align-items:flex-end;gap:.25rem;flex-shrink:0;}
.reg-progress-mini{width:56px;height:4px;background:var(--sa);border-radius:4px;overflow:hidden;}
.reg-progress-fill{height:100%;border-radius:4px;transition:width .4s;}
.reg-progress-pct{font-size:.63rem;color:var(--wg);font-weight:700;}
.reg-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(5px);z-index:1200;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .2s;padding:0;}
.reg-modal{background:var(--sw);width:100%;max-width:820px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;animation:slideUp .3s cubic-bezier(.22,1,.36,1);border-radius:20px 20px 0 0;}
.reg-modal-header{background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:.9rem 1.1rem;display:flex;align-items:center;gap:.65rem;flex-shrink:0;border-radius:20px 20px 0 0;}
.reg-modal-close{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:8px;padding:.28rem .65rem;cursor:pointer;font-family:Tajawal,sans-serif;font-size:.76rem;flex-shrink:0;}
.reg-modal-info{flex:1;min-width:0;}
.reg-modal-name{font-family:Amiri,serif;font-size:1rem;font-weight:700;}
.reg-modal-phone{font-size:.68rem;opacity:.55;direction:ltr;}
.reg-modal-tabs{display:flex;background:rgba(0,0,0,.2);border-radius:7px;padding:2px;flex-shrink:0;}
.reg-modal-tab{padding:.28rem .65rem;border:none;border-radius:5px;font-family:Tajawal,sans-serif;font-size:.72rem;color:rgba(255,255,255,.5);background:transparent;cursor:pointer;transition:all .2s;white-space:nowrap;}
.reg-modal-tab.on{background:rgba(255,255,255,.18);color:#fff;font-weight:700;}
.reg-modal-body{flex:1;overflow-y:auto;padding:1.1rem;}
.reg-modal-actions{padding:.8rem 1.1rem;border-top:1px solid var(--sa);display:flex;gap:.5rem;flex-shrink:0;}
.demo-person-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem;}
.demo-person-card{background:var(--cr);border-radius:12px;padding:1rem;border:1.5px solid var(--sa);}
.demo-person-header{display:flex;align-items:center;gap:.55rem;margin-bottom:.85rem;}
.demo-person-num{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#8B6914,#C4A24E);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0;}
.demo-person-name{font-weight:700;font-size:.88rem;color:var(--ch);}
.demo-person-role{font-size:.7rem;color:var(--wg);margin-top:.04rem;}
.demo-bar-row{display:flex;align-items:center;gap:.45rem;margin-bottom:.3rem;}
.demo-bar-label{font-size:.63rem;color:var(--wg);width:40px;flex-shrink:0;text-align:right;}
.demo-bar-track{flex:1;height:9px;background:var(--sa);border-radius:5px;overflow:hidden;}
.demo-bar-fill{height:100%;border-radius:5px;transition:width .6s ease;}
.demo-bar-val{font-size:.63rem;font-weight:700;width:22px;text-align:left;flex-shrink:0;}
.demo-person-chips{display:flex;flex-wrap:wrap;gap:.28rem;margin-top:.65rem;padding-top:.55rem;border-top:1px solid var(--sa);}
.demo-person-chip{font-size:.63rem;padding:.15rem .45rem;border-radius:10px;font-weight:700;}
.demo-section-head{font-size:.7rem;font-weight:700;color:var(--wg);margin-bottom:.5rem;letter-spacing:.5px;text-transform:uppercase;}
@media(max-width:640px){
  .admin-bottom-bar{display:flex;}
  .admin-desktop-tabs{display:none!important;}
  .sec{padding-bottom:5rem;}
  .stat-grid{grid-template-columns:repeat(2,1fr);gap:.5rem;}
  .demo-person-grid{grid-template-columns:1fr;}
  .reg-modal{border-radius:20px 20px 0 0;}
}
@media(min-width:641px){
  .reg-modal-overlay{align-items:center;padding:1rem;}
  .reg-modal{border-radius:20px;}
}`;

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

const ADMIN_SESSION_KEY = 'mi_admin_session';
const ADMIN_SESSION_TTL = 4 * 60 * 60 * 1000; // 4 hours

const AdminSession = {
  save(token) {
    try {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token, savedAt: Date.now() }));
    } catch (e) {}
  },
  load() {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload?.savedAt || Date.now() - payload.savedAt > ADMIN_SESSION_TTL) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        return null;
      }
      return payload.token;
    } catch (e) { return null; }
  },
  clear() {
    try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) {}
  },
};


const AuthLeft = ({ title, quote, highlight, tracks }) => (
  <div className="auth-left">
    <div className="auth-left-grid"/>
    <div className="auth-left-content">
      <MILogo size={52} color="#C4A24E"/>
      <div className="auth-left-quote">
        {quote.split('||').map((part,i) =>
          i === 1 ? <span key={i}>{part}</span> : <span key={i}>{part}</span>
        )}
      </div>
      <div className="auth-left-attr">Milestone Impact • الإطار الحاكم</div>
      <div className="auth-left-tracks">
        {[
          {n:'الخلق',c:'#8B6914',w:'19%'},
          {n:'الإبداع',c:'#5B7B3A',w:'21%'},
          {n:'الإنشاء',c:'#2E6B8A',w:'47%'},
          {n:'الجعل',c:'#6B4E3D',w:'13%'},
        ].map(t=>(
          <div key={t.n} className="auth-left-track" style={{background:t.c+'22',color:t.c,border:`1px solid ${t.c}44`}}>
            {t.n} {t.w}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════

export default function App() {
  const [introVisible, setIntroVisible] = useState(true);
  const [screen, setScreen] = useState("splash");
  const [tab, setTab] = useState("matrix");
  const [adminTab, setAdminTab] = useState("regs");
  const [expandedContent, setExpandedContent] = useState(null);
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

  // ── التحليل الديموغرافي ──
  const [demoScreen, setDemoScreen] = useState(false); // هل شاشة النموذج مفتوحة
  const [demoRows, setDemoRows] = useState([]); // صفوف البيانات
  const [demoSaving, setDemoSaving] = useState(false);
  const DEMO_KEY = "demographic_analysis"; // مفتاح الحفظ في DB
  const [selectedReg, setSelectedReg] = useState(null); // المسجّل المفتوح في Modal الأدمن
  const [selectedRegTab, setSelectedRegTab] = useState('schedule'); // تبويب Modal الأدمن

  const hideIntro = useCallback(() => setIntroVisible(false), []);

  // ── Auto-restore local session ──
  useEffect(() => {
    // Restore admin session (4h)
    const adminToken = AdminSession.load();
    if (adminToken) {
      setScreen("admin");
      loadRegs();
      return;
    }
    // Restore user session (24h)
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
          fullDesc: detail.description || '',
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
        AdminSession.save(data.token);
        setScreen("admin");
        loadRegs();
      } else {
        setAdminError(data.message);
      }
    } catch (err) {
      setAdminError("خطأ في الاتصال بالسيرفر");
    }
  };

  // ══ التحليل الديموغرافي — منطق البيانات ══

  const emptyDemoRow = () => ({
    id: Date.now() + Math.random(),
    name: "", entity: "", position: "", relation: "",
    age: "", location: "", sharedEvent: "",
    strength: { knowledge: 0, social: 0, financial: 0, economic: 0, sovereign: 0 },
    myRelation: { knowledge: 0, social: 0, financial: 0, economic: 0 },
    target: { knowledge: false, social: false, financial: false, economic: false },
  });

  const loadDemoData = async () => {
    if (!sessionId) return;
    const rec = await DB.get(sessionId);
    const saved = rec?.[DEMO_KEY];
    if (saved && saved.length > 0) {
      setDemoRows(saved);
    } else {
      setDemoRows([emptyDemoRow(), emptyDemoRow(), emptyDemoRow()]);
    }
  };

  const saveDemoData = async () => {
    if (!sessionId) return;
    setDemoSaving(true);
    try {
      const rec = await DB.get(sessionId);
      if (rec) { rec[DEMO_KEY] = demoRows; await DB.save(sessionId, rec); }
      LocalSession.update({ [DEMO_KEY]: demoRows });
      showToast("تم حفظ التحليل الديموغرافي ✓");
    } catch(e) { showToast("خطأ في الحفظ"); }
    setDemoSaving(false);
  };

  const openDemoScreen = () => { loadDemoData(); setDemoScreen(true); setSelectedCell(null); };

  const updateDemoRow = (id, field, value) => {
    setDemoRows(rows => rows.map(r => {
      if (r.id !== id) return r;
      if (Array.isArray(field)) {
        const [group, key] = field;
        return { ...r, [group]: { ...r[group], [key]: value } };
      }
      return { ...r, [field]: value };
    }));
  };

  const addDemoRow = () => setDemoRows(rows => [...rows, emptyDemoRow()]);
  const removeDemoRow = (id) => { if (demoRows.length > 1) setDemoRows(rows => rows.filter(r => r.id !== id)); };

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
    AdminSession.clear();
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
    <><style>{CSS}</style><style>{`
/* LANDING PAGE — Luxury Editorial */
.lp{font-family:'Tajawal',sans-serif;direction:rtl;background:#0D0D0F;color:#E8E2D9;overflow-x:hidden;}
.lp *,.lp *::before,.lp *::after{box-sizing:border-box;margin:0;padding:0;}
.lp-hero{min-height:100vh;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 2rem;overflow:hidden;}
.lp-hero-bg{position:absolute;inset:0;z-index:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,#1C2B3A 0%,#0D0D0F 70%);}
.lp-hero-grid{position:absolute;inset:0;z-index:1;opacity:.06;background-image:linear-gradient(rgba(139,105,20,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(139,105,20,.8) 1px,transparent 1px);background-size:60px 60px;}
.lp-hero-glow{position:absolute;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(107,157,173,.08) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-55%);z-index:1;pointer-events:none;}
.lp-hero-content{position:relative;z-index:2;text-align:center;max-width:780px;}
.lp-eyebrow{font-size:.68rem;letter-spacing:4px;text-transform:uppercase;color:#8B6914;margin-bottom:2rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:.8rem;}
.lp-eyebrow::before,.lp-eyebrow::after{content:'';display:block;width:40px;height:1px;background:#8B6914;opacity:.6;}
.lp-hero-logo{margin-bottom:1.8rem;animation:lp-float 6s ease-in-out infinite;}
@keyframes lp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.lp-hero-title{font-family:'Amiri',serif;font-size:clamp(2.8rem,7vw,5rem);font-weight:700;line-height:1.1;margin-bottom:.6rem;background:linear-gradient(135deg,#E8E2D9 0%,#C4A24E 50%,#8B6914 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.lp-hero-en{font-family:'Tajawal',sans-serif;font-weight:200;font-size:clamp(1rem,2.5vw,1.5rem);letter-spacing:6px;color:rgba(107,157,173,.7);margin-bottom:1.4rem;}
.lp-hero-sub{font-size:clamp(.9rem,2vw,1.1rem);color:rgba(232,226,217,.55);line-height:1.8;max-width:520px;margin:0 auto 2.8rem;font-weight:300;}
.lp-hero-line{width:1px;height:50px;background:linear-gradient(to bottom,#8B6914,transparent);margin:0 auto 2.8rem;}
.lp-hero-actions{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;}
.lp-btn-primary{padding:.85rem 2.2rem;border-radius:3px;border:1px solid #8B6914;background:linear-gradient(135deg,#8B6914,#C4A24E);color:#0D0D0F;font-family:'Tajawal',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer;letter-spacing:1px;transition:all .3s;position:relative;overflow:hidden;}
.lp-btn-primary::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent,rgba(255,255,255,.15),transparent);transform:translateX(-100%);transition:transform .5s;}
.lp-btn-primary:hover::after{transform:translateX(100%);}
.lp-btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(139,105,20,.4);}
.lp-btn-ghost{padding:.85rem 2.2rem;border-radius:3px;border:1px solid rgba(107,157,173,.35);background:transparent;color:#6B9DAD;font-family:'Tajawal',sans-serif;font-size:.9rem;font-weight:500;cursor:pointer;letter-spacing:1px;transition:all .3s;}
.lp-btn-ghost:hover{border-color:#6B9DAD;background:rgba(107,157,173,.08);transform:translateY(-2px);}
.lp-btn-admin{display:block;margin:1.5rem auto 0;background:none;border:none;color:rgba(232,226,217,.2);font-family:'Tajawal',sans-serif;font-size:.72rem;cursor:pointer;letter-spacing:2px;transition:color .3s;}
.lp-btn-admin:hover{color:rgba(232,226,217,.45);}
.lp-scroll-hint{position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:.5rem;color:rgba(232,226,217,.2);font-size:.65rem;letter-spacing:2px;animation:lp-bounce 2s ease-in-out infinite;}
@keyframes lp-bounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(6px)}}
.lp-scroll-line{width:1px;height:30px;background:linear-gradient(to bottom,rgba(139,105,20,.5),transparent);}
.lp-divider{display:flex;align-items:center;gap:1.5rem;padding:0 2rem;max-width:900px;margin:0 auto;}
.lp-divider-line{flex:1;height:1px;background:linear-gradient(to right,transparent,rgba(139,105,20,.3),transparent);}
.lp-divider-gem{color:#8B6914;font-size:.8rem;}
.lp-section{padding:6rem 2rem;max-width:1100px;margin:0 auto;}
.lp-section-label{font-size:.62rem;letter-spacing:4px;text-transform:uppercase;color:#8B6914;margin-bottom:.8rem;font-weight:600;}
.lp-section-title{font-family:'Amiri',serif;font-size:clamp(1.8rem,4vw,2.8rem);font-weight:700;line-height:1.2;margin-bottom:1rem;color:#E8E2D9;}
.lp-section-body{font-size:1rem;color:rgba(232,226,217,.5);line-height:1.9;max-width:620px;font-weight:300;}
.lp-manifesto{background:#0A0A0C;padding:6rem 2rem;}
.lp-manifesto-inner{max-width:760px;margin:0 auto;text-align:center;}
.lp-manifesto-quote{font-family:'Amiri',serif;font-size:clamp(1.2rem,3vw,1.9rem);color:#E8E2D9;line-height:1.9;margin-bottom:2rem;position:relative;padding:0 1rem;}
.lp-manifesto-quote::before{content:'"';position:absolute;right:-10px;top:-20px;font-size:5rem;color:#8B691420;font-family:'Amiri',serif;line-height:1;}
.lp-manifesto-attr{font-size:.72rem;letter-spacing:3px;color:#8B6914;text-transform:uppercase;}
.lp-tracks{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(139,105,20,.1);border:1px solid rgba(139,105,20,.1);border-radius:4px;overflow:hidden;}
@media(max-width:700px){.lp-tracks{grid-template-columns:1fr 1fr;}}
.lp-track{padding:2rem 1.5rem;background:#0D0D0F;position:relative;overflow:hidden;transition:background .3s;}
.lp-track::before{content:'';position:absolute;top:0;right:0;width:3px;height:100%;}
.lp-track-creation::before{background:#8B6914;}
.lp-track-innovation::before{background:#5B7B3A;}
.lp-track-establishment::before{background:#2E6B8A;}
.lp-track-making::before{background:#6B4E3D;}
.lp-track:hover{background:#111115;}
.lp-track-icon{font-size:1.4rem;margin-bottom:.8rem;}
.lp-track-name{font-family:'Amiri',serif;font-size:1.2rem;font-weight:700;margin-bottom:.3rem;}
.lp-track-weight{font-size:2rem;font-weight:200;opacity:.12;position:absolute;top:1rem;left:1.5rem;font-family:'Tajawal',sans-serif;}
.lp-track-desc{font-size:.75rem;color:rgba(232,226,217,.4);line-height:1.6;margin-bottom:.8rem;}
.lp-track-ops{display:flex;flex-direction:column;gap:.3rem;margin-top:.8rem;padding-top:.8rem;border-top:1px solid rgba(255,255,255,.05);}
.lp-track-op{font-size:.68rem;color:rgba(232,226,217,.3);padding:.2rem 0;display:flex;align-items:center;gap:.4rem;}
.lp-track-op::before{content:'';width:4px;height:4px;border-radius:50%;flex-shrink:0;}
.lp-track-creation .lp-track-op::before{background:#8B6914;}
.lp-track-innovation .lp-track-op::before{background:#5B7B3A;}
.lp-track-establishment .lp-track-op::before{background:#2E6B8A;}
.lp-track-making .lp-track-op::before{background:#6B4E3D;}
.lp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;}
@media(max-width:700px){.lp-steps{grid-template-columns:1fr;}}
.lp-step{text-align:center;padding:2rem;}
.lp-step-num{width:56px;height:56px;border-radius:50%;border:1px solid rgba(139,105,20,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;font-family:'Amiri',serif;font-size:1.4rem;color:#8B6914;position:relative;}
.lp-step-num::before{content:'';position:absolute;inset:-4px;border-radius:50%;border:1px solid rgba(139,105,20,.15);}
.lp-step-title{font-family:'Amiri',serif;font-size:1.1rem;margin-bottom:.5rem;color:#E8E2D9;}
.lp-step-desc{font-size:.78rem;color:rgba(232,226,217,.4);line-height:1.7;}
.lp-cta-final{padding:8rem 2rem;text-align:center;background:radial-gradient(ellipse 80% 50% at 50% 100%,#1C2B3A 0%,#0D0D0F 70%);position:relative;overflow:hidden;}
.lp-cta-final::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(139,105,20,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(139,105,20,.04) 1px,transparent 1px);background-size:40px 40px;}
.lp-cta-final-inner{position:relative;z-index:1;}
.lp-cta-final-title{font-family:'Amiri',serif;font-size:clamp(2rem,5vw,3.5rem);margin-bottom:.8rem;background:linear-gradient(135deg,#E8E2D9,#C4A24E);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.lp-cta-final-sub{color:rgba(232,226,217,.4);font-size:.9rem;margin-bottom:2.5rem;letter-spacing:1px;}
.lp-footer{padding:2rem;border-top:1px solid rgba(139,105,20,.1);text-align:center;background:#0D0D0F;}
.lp-footer-text{font-size:.68rem;color:rgba(232,226,217,.18);letter-spacing:2px;line-height:2;}
@keyframes lp-fade-up{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.lp-a1{animation:lp-fade-up .9s ease both;}
.lp-a2{animation:lp-fade-up .9s .15s ease both;}
.lp-a3{animation:lp-fade-up .9s .3s ease both;}
.lp-a4{animation:lp-fade-up .9s .45s ease both;}
.lp-a5{animation:lp-fade-up .9s .6s ease both;}
    `}</style>
    <div className="lp">

      {/* ══ HERO ══ */}
      <section className="lp-hero">
        <div className="lp-hero-bg"/>
        <div className="lp-hero-grid"/>
        <div className="lp-hero-glow"/>
        <div className="lp-hero-content">
          <div className="lp-eyebrow lp-a1">مصفوفة التأثير</div>
          <div className="lp-hero-logo lp-a2"><MILogo size={72} color="#C4A24E"/></div>
          <h1 className="lp-hero-title lp-a3">هندسة القيمة</h1>
          <div className="lp-hero-en lp-a3">MILESTONE IMPACT</div>
          <p className="lp-hero-sub lp-a4">نموذج تحولي من ستة عشر عملية استراتيجية —<br/>يشتغل على القيمة الكامنة داخل الإنسان، ويحوّلها إلى أثر قابل للقياس</p>
          <div className="lp-hero-line lp-a4"/>
          <div className="lp-hero-actions lp-a5">
            <button className="lp-btn-primary" onClick={() => setScreen("register")}>ابدأ رحلتك</button>
            <button className="lp-btn-ghost" onClick={() => setScreen("resume")}>استئناف الجلسة</button>
          </div>
          <button className="lp-btn-admin" onClick={() => setScreen("admin-login")}>⌘ دخول المدير</button>
        </div>
        <div className="lp-scroll-hint"><span>اكتشف</span><div className="lp-scroll-line"/></div>
      </section>

      {/* ══ MANIFESTO ══ */}
      <div className="lp-manifesto">
        <div className="lp-manifesto-inner">
          <div className="lp-section-label" style={{marginBottom:"1.5rem"}}>الفلسفة</div>
          <div className="lp-manifesto-quote">
            لا يشتغل هذا النموذج على الفرد بوصفه موضوع تطوير،<br/>
            ولا على السوق بوصفه مجال ربح —<br/>
            بل على <span style={{color:"#C4A24E"}}>القيمة الكامنة داخل الإنسان</span>،<br/>
            وكيف تتحرك عبر الشبكات التي يصنعها
          </div>
          <div className="lp-manifesto-attr">Milestone Impact • الإطار الحاكم</div>
        </div>
      </div>

      {/* ══ TRACKS ══ */}
      <div style={{background:"#0A0A0C",padding:"6rem 0"}}>
        <div className="lp-section" style={{paddingTop:0,paddingBottom:"3rem"}}>
          <div className="lp-section-label">المنظومة</div>
          <h2 className="lp-section-title">أربعة مسارات تحريك</h2>
          <p className="lp-section-body" style={{marginBottom:"3rem"}}>المسارات ليست مراحل متتالية — بل حالات تشغيل تعمل في آنٍ واحد، تتشابك وتتبادل التأثير</p>
        </div>
        <div style={{maxWidth:"1100px",margin:"0 auto",padding:"0 2rem 2rem"}}>
          <div className="lp-tracks">
            {[
              {id:"creation",name:"الخلق",icon:"◈",color:"#8B6914",weight:19,desc:"استدعاء الإرث وتفكيك البنية البشرية",ops:OPERATIONS.creation.map(o=>o.nameAr)},
              {id:"innovation",name:"الإبداع",icon:"◉",color:"#5B7B3A",weight:21,desc:"إعادة تعريف القيمة وإطار الإدراك",ops:OPERATIONS.innovation.map(o=>o.nameAr)},
              {id:"establishment",name:"الإنشاء",icon:"◆",color:"#2E6B8A",weight:47,desc:"تكوين الكيان ومنظومة الإنتاج",ops:OPERATIONS.establishment.map(o=>o.nameAr)},
              {id:"making",name:"الجعل",icon:"◇",color:"#6B4E3D",weight:13,desc:"الاندماج وإغلاق حلقة الأثر",ops:OPERATIONS.making.map(o=>o.nameAr)},
            ].map(t=>(
              <div key={t.id} className={`lp-track lp-track-${t.id}`}>
                <div className="lp-track-weight">{t.weight}%</div>
                <div className="lp-track-icon" style={{color:t.color}}>{t.icon}</div>
                <div className="lp-track-name" style={{color:t.color}}>{t.name}</div>
                <div className="lp-track-desc">{t.desc}</div>
                <div className="lp-track-ops">{t.ops.map((op,i)=><div key={i} className="lp-track-op">{op}</div>)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ DIVIDER ══ */}
      <div style={{padding:"3rem 0",background:"#0A0A0C"}}>
        <div className="lp-divider"><div className="lp-divider-line"/><div className="lp-divider-gem">◈</div><div className="lp-divider-line"/></div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <div style={{background:"#0D0D0F",padding:"6rem 2rem"}}>
        <div style={{maxWidth:"1100px",margin:"0 auto"}}>
          <div className="lp-section-label">المسار</div>
          <h2 className="lp-section-title" style={{marginBottom:"3rem"}}>ثلاث لحظات تحول</h2>
          <div className="lp-steps">
            {[
              {n:"١",title:"التسجيل والتوثيق",desc:"سجّل بياناتك وادخل إلى مصفوفة العمليات الست عشرة — كل عملية تُبنى على ما سبقها"},
              {n:"٢",title:"التحليل والتخطيط",desc:"حدد مواعيد كل عملية، وابنِ خريطتك الزمنية مع تحليل ديموغرافي للشبكة البشرية حولك"},
              {n:"٣",title:"الأثر والتحول",desc:"أكمل خطتك التحولية وتسلّم تقريرك الكامل — الأثر مقيس، والقيمة محوّلة"},
            ].map((s,i)=>(
              <div key={i} className="lp-step">
                <div className="lp-step-num">{s.n}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ CTA FINAL ══ */}
      <div className="lp-cta-final">
        <div className="lp-cta-final-inner">
          <div className="lp-section-label" style={{marginBottom:"1.2rem"}}>ابدأ الآن</div>
          <div className="lp-cta-final-title">القيمة الكامنة تنتظر</div>
          <div className="lp-cta-final-sub">ست عشرة عملية • مسار واحد • أثر لا يُنسى</div>
          <div style={{display:"flex",gap:"1rem",justifyContent:"center",flexWrap:"wrap"}}>
            <button className="lp-btn-primary" onClick={()=>setScreen("register")}>ابدأ رحلتك ←</button>
            <button className="lp-btn-ghost" onClick={()=>setScreen("resume")}>استئناف الجلسة</button>
          </div>
        </div>
      </div>

      {/* ══ FOOTER ══ */}
      <div className="lp-footer">
        <div className="lp-footer-text">
          MILESTONE IMPACT © {new Date().getFullYear()}<br/>
          جميع الحقوق محفوظة • لا يُسمح بإعادة النشر أو التوزيع
        </div>
      </div>

    </div></>
  );

  // ════════ REGISTER ════════
  if (screen === "register") return (
    <><style>{CSS}</style>
    <div className="auth-screen">
      <AuthLeft quote="القيمة الكامنة داخل الإنسان لا تُكتشف بالتأمل — بل بالهندسة" />
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.dark}/><span className="auth-logo-text">مصفوفة التأثير</span></div>
          {otpStep === "form" ? <>
            <h1 className="auth-title">ابدأ رحلتك</h1>
            <p className="auth-sub">سجّل بياناتك للدخول إلى منظومة العمليات الست عشرة</p>
            <form onSubmit={handleRegister}>
              <div className={`fg ${regErrors.name ? "fg-err" : ""}`}><label>الاسم الكامل</label><input placeholder="أدخل اسمك" value={user.name} onChange={e => { setUser({ ...user, name: e.target.value }); setRegErrors({ ...regErrors, name: "" }); }} />{regErrors.name && <div className="fg-msg">{regErrors.name}</div>}</div>
              <div className={`fg ${regErrors.phone ? "fg-err" : ""}`}><label>رقم الجوال</label><input type="tel" placeholder="05XXXXXXXX" value={user.phone} onChange={e => { setUser({ ...user, phone: e.target.value }); setRegErrors({ ...regErrors, phone: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.phone && <div className="fg-msg">{regErrors.phone}</div>}</div>
              <div className={`fg ${regErrors.email ? "fg-err" : ""}`}><label>البريد الإلكتروني</label><input type="email" placeholder="email@example.com" value={user.email} onChange={e => { setUser({ ...user, email: e.target.value }); setRegErrors({ ...regErrors, email: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.email && <div className="fg-msg">{regErrors.email}</div>}</div>
              <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ الإرسال..." : "إرسال رمز التحقق ✉"}</button>
            </form>
            <div style={{textAlign:"center",marginTop:"1.2rem",fontSize:"0.8rem",color:"var(--wg)"}}>
              لديك حساب؟ <button style={{background:"none",border:"none",color:"var(--mi-d)",fontFamily:"'Tajawal'",fontSize:"0.8rem",cursor:"pointer",fontWeight:600}} onClick={() => { setScreen("resume"); setOtpStep("form"); }}>استئناف الجلسة</button>
            </div>
          </> : <>
            <h1 className="auth-title">رمز التحقق</h1>
            <p className="auth-sub">تم إرسال رمز مكوّن من 6 أرقام إلى<br/><strong style={{color:BRAND.dark,direction:"ltr",display:"inline-block"}}>{user.email}</strong></p>
            <form onSubmit={handleVerifyOtp}>
              <div className={`fg ${otpError ? "fg-err" : ""}`}>
                <label>رمز التحقق</label>
                <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode}
                  onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  style={{ direction: "ltr", textAlign: "center", fontSize: "1.6rem", letterSpacing: "10px", fontWeight: 700 }} />
                {otpError && <div className="fg-msg">{otpError}</div>}
              </div>
              <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
            </form>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button style={{ background: "none", border: "none", color: BRAND.color, fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={handleResendOtp} disabled={otpSending}>↻ إعادة إرسال</button>
              <button style={{ background: "none", border: "none", color: "var(--wg)", fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={() => { setOtpStep("form"); setOtpCode(""); setOtpError(""); }}>← تغيير البيانات</button>
            </div>
          </>}
          <button className="auth-back" onClick={() => { setScreen("splash"); setOtpStep("form"); setOtpCode(""); }}>→ العودة للرئيسية</button>
        </div>
      </div>
    </div></>
  );

  // ════════ ADMIN LOGIN ════════

  // ════════ RESUME ════════
  if (screen === "resume") return (
    <><style>{CSS}</style>
    <div className="auth-screen">
      <AuthLeft quote="القيمة الكامنة داخل الإنسان لا تُكتشف بالتأمل — بل بالهندسة" />
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.dark}/><span className="auth-logo-text">مصفوفة التأثير</span></div>
          {otpStep === "form" ? <>
            <h1 className="auth-title">استئناف الجلسة</h1>
            <p className="auth-sub">أدخل رقم جوالك لاستعادة بياناتك وخطتك السابقة</p>
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
            <div style={{textAlign:"center",marginTop:"1.2rem",fontSize:"0.8rem",color:"var(--wg)"}}>
              مسجّل جديد؟ <button style={{background:"none",border:"none",color:"var(--mi-d)",fontFamily:"'Tajawal'",fontSize:"0.8rem",cursor:"pointer",fontWeight:600}} onClick={() => { setScreen("register"); setOtpStep("form"); }}>ابدأ رحلتك</button>
            </div>
          </> : <>
            <h1 className="auth-title">رمز التحقق</h1>
            <p className="auth-sub">تم إرسال رمز إلى<br/><strong style={{color:BRAND.dark,direction:"ltr",display:"inline-block"}}>{user.email?.replace(/(.{2}).*(@.*)/, "$1***$2")}</strong></p>
            <form onSubmit={handleResumeVerify}>
              <div className={`fg ${otpError ? "fg-err" : ""}`}>
                <label>رمز التحقق</label>
                <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode}
                  onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  style={{ direction: "ltr", textAlign: "center", fontSize: "1.6rem", letterSpacing: "10px", fontWeight: 700 }} />
                {otpError && <div className="fg-msg">{otpError}</div>}
              </div>
              <button type="submit" className="btn" style={{ background: "linear-gradient(135deg, #4A5628, #5B7B3A)" }} disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
            </form>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button style={{ background: "none", border: "none", color: "#5B7B3A", fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={handleResendOtp} disabled={otpSending}>↻ إعادة إرسال</button>
              <button style={{ background: "none", border: "none", color: "var(--wg)", fontFamily: "'Tajawal'", fontSize: "0.8rem", cursor: "pointer" }} onClick={() => { setOtpStep("form"); setOtpCode(""); setOtpError(""); }}>← رقم آخر</button>
            </div>
          </>}
          <button className="auth-back" onClick={() => { setScreen("splash"); setOtpStep("form"); setOtpCode(""); }}>→ العودة للرئيسية</button>
        </div>
      </div>
    </div></>
  );

  // ════════ ADMIN LOGIN ════════
  if (screen === "admin-login") return (
    <><style>{CSS}</style>
    <div className="auth-screen">
      <div className="auth-left" style={{background:"linear-gradient(160deg,#0f1923 0%,#1a1a2e 100%)"}}>
        <div className="auth-left-grid"/>
        <div className="auth-left-content" style={{position:"relative",zIndex:1,textAlign:"center"}}>
          <MILogo size={52} color="#6B9DAD"/>
          <div className="auth-left-quote" style={{color:"rgba(255,255,255,0.7)",fontSize:"1rem",marginTop:"1.5rem"}}>
            لوحة إدارة المستشار<br/>
            <span style={{color:"#6B9DAD",fontSize:"0.8rem",letterSpacing:"2px"}}>CONSULTANT DASHBOARD</span>
          </div>
          <div className="auth-left-attr" style={{marginTop:"1rem"}}>Milestone Impact • نسخة المستشار</div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.deep}/><span className="auth-logo-text" style={{color:BRAND.deep}}>لوحة الإدارة</span></div>
          <h1 className="auth-title">دخول المستشار</h1>
          <p className="auth-sub">أدخل بيانات الدخول للوصول إلى لوحة المراجعة والإدارة</p>
          <form onSubmit={handleAdminLogin}>
            <div className="fg"><label>اسم المستخدم</label><input placeholder="admin" value={adminUser} onChange={e => { setAdminUser(e.target.value); setAdminError(""); }} /></div>
            <div className={`fg ${adminError ? "fg-err" : ""}`}><label>كلمة المرور</label><input type="password" placeholder="••••••••" value={adminPass} onChange={e => { setAdminPass(e.target.value); setAdminError(""); }} />{adminError && <div className="fg-msg">{adminError}</div>}</div>
            <button type="submit" className="btn" style={{background:`linear-gradient(135deg,${BRAND.deep},${BRAND.dark})`}}>دخول ←</button>
          </form>
          <button className="auth-back" onClick={() => setScreen("splash")}>→ العودة للرئيسية</button>
        </div>
      </div>
    </div></>
  );

  // ════════ ADMIN PANEL ════════
  if (screen === "admin") return (
    <><style>{CSS}</style><div className="app">

      {/* ── Nav ── */}
      <nav className="nav nav-admin">
        <div className="nav-brand">
          <div className="nav-logo"><MILogo size={15} color="#6B9DAD"/></div>
          <div>
            <div style={{fontSize:"0.82rem",color:"#fff",fontWeight:700}}>لوحة الإدارة</div>
            <div style={{fontSize:"0.62rem",color:"rgba(255,255,255,0.4)"}}>Milestone Impact</div>
          </div>
        </div>
        <div className="nav-center admin-desktop-tabs">
          <div className="tabs">
            {[["regs","المسجلين"],["reports","التقارير"],["content","المحتوى"],["stats","إحصائيات"]].map(([k,v])=>(
              <button key={k} className={`tab ${adminTab===k?"on":""}`} onClick={()=>setAdminTab(k)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="nav-right">
          <button className="btn-logout" onClick={logout}>خروج</button>
        </div>
      </nav>

      {/* ── Bottom Bar (mobile) ── */}
      <div className="admin-bottom-bar">
        {[["regs","👥","المسجلين"],["reports","📊","التقارير"],["content","✏","المحتوى"],["stats","📈","إحصائيات"]].map(([k,icon,label])=>(
          <button key={k} className={adminTab===k?"on":""} onClick={()=>setAdminTab(k)}>
            <span className="bar-icon">{icon}</span>{label}
          </button>
        ))}
      </div>

      <div className="sec" style={{animation:"fadeIn 0.4s"}}>

        {/* ── Stats ── */}
        <div className="stat-grid">
          <div className="stat" style={{borderTopColor:BRAND.color}}><div className="stat-v" style={{color:BRAND.color}}>{allRegs.length}</div><div className="stat-l">إجمالي المسجلين</div></div>
          <div className="stat" style={{borderTopColor:"#5B7B3A"}}><div className="stat-v" style={{color:"#5B7B3A"}}>{allRegs.filter(r=>r.submitted).length}</div><div className="stat-l">خطط مكتملة</div></div>
          <div className="stat" style={{borderTopColor:"#8B6914"}}><div className="stat-v" style={{color:"#8B6914"}}>{allRegs.filter(r=>!r.submitted).length}</div><div className="stat-l">قيد التخطيط</div></div>
          <div className="stat" style={{borderTopColor:"#C0392B"}}><div className="stat-v" style={{color:"#C0392B"}}>{allRegs.filter(r=>r.reopenRequested).length}</div><div className="stat-l">طلبات فتح</div></div>
        </div>

        {/* ══ TAB: المسجلون ══ */}
        {adminTab === "regs" && <>
          <div className="sec-head">
            <h2 className="sec-title">سجل المشاركين</h2>
            <button className="btn btn-s btn-outline" onClick={loadRegs}>↻ تحديث</button>
          </div>
          {loading ? <div className="empty"><p>جارٍ التحميل...</p></div>
          : allRegs.length === 0 ? <div className="empty"><h3>لا يوجد مسجلين</h3></div>
          : <div className="reg-list">
            {allRegs.map((r,i) => {
              const datesCount = r.dates ? Object.keys(r.dates).length : 0;
              const pct = Math.round((datesCount/16)*100);
              const initials = r.name ? r.name.split(" ").slice(0,2).map(w=>w[0]).join("") : "?";
              const trackColors = ["#8B6914","#5B7B3A","#2E6B8A","#6B4E3D"];
              const avatarColor = trackColors[i % 4];
              return (
                <div key={r.id} className={`reg-card ${r.reopenRequested?"has-alert":""}`}
                  onClick={()=>{ setSelectedReg(r); setSelectedRegTab("schedule"); }}>
                  <div className="reg-card-avatar" style={{background:avatarColor}}>{initials}</div>
                  <div className="reg-card-info">
                    <div className="reg-card-name">{r.name}</div>
                    <div className="reg-card-meta">
                      <span style={{direction:"ltr"}}>{r.phone}</span>
                      <span>•</span>
                      <span>{r.registeredAt ? fmtBoth(r.registeredAt).hijri : "—"}</span>
                      {r.reopenRequested && <span style={{color:"#C0392B",fontWeight:700}}>🔓 طلب فتح</span>}
                    </div>
                  </div>
                  <div className="reg-card-right">
                    {r.submitted
                      ? <span className="badge badge-ok">✓ مكتمل</span>
                      : <span className="badge badge-wait">جارٍ</span>}
                    <div className="reg-progress-mini">
                      <div className="reg-progress-fill" style={{width:`${pct}%`,background:avatarColor}}/>
                    </div>
                    <div className="reg-progress-pct">{datesCount}/16</div>
                  </div>
                </div>
              );
            })}
          </div>}
        </>}

        {/* ══ TAB: التقارير ══ */}
        {adminTab === "reports" && <>
          <div className="sec-head"><h2 className="sec-title">تقارير العملاء</h2></div>
          {allRegs.length === 0 && <div className="empty"><h3>لا يوجد مسجلين</h3></div>}
          {allRegs.map(reg => {
            const regAnalysis = analyzeBookings(procs, reg.dates || {}, reg.confirmed || {});
            const bookedCount = Object.keys(reg.dates || {}).length;
            const isOpen = adminReportReg === reg.id;
            return <div key={reg.id} className="adm-consultant">
              <div className="adm-edit-header" onClick={() => setAdminReportReg(isOpen ? null : reg.id)}>
                <h4>{reg.name} — {bookedCount} حجوزات {regAnalysis ? `• نمط ${regAnalysis.pattern.nameAr}` : "• أقل من 3"}</h4>
                <span>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && <>
                {!regAnalysis ? <p style={{color:"#999",fontSize:"0.82rem"}}>أقل من 3 حجوزات</p> : <>
                  <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                    <div className="rpt-stat" style={{flex:1}}><div className="rpt-stat-v" style={{color:BRAND.color,fontSize:"1.1rem"}}>{regAnalysis.pattern.icon} {regAnalysis.pattern.nameAr}</div><div className="rpt-stat-l">النمط</div></div>
                    <div className="rpt-stat" style={{flex:1}}><div className="rpt-stat-v" style={{color:"#5B7B3A"}}>{regAnalysis.trackCoverage.covered}/4</div><div className="rpt-stat-l">مسارات</div></div>
                    <div className="rpt-stat" style={{flex:1}}><div className="rpt-stat-v" style={{color:"#6B4E3D"}}>{regAnalysis.readinessAr}</div><div className="rpt-stat-l">الجاهزية</div></div>
                  </div>
                  <div className="adm-note">⏱ <strong>الزمن بين الحجوزات:</strong> {(()=>{ const dateVals = Object.values(reg.dates||{}).sort(); if(dateVals.length<2) return "حجز واحد فقط"; const diffDays = Math.round((new Date(dateVals[dateVals.length-1])-new Date(dateVals[0]))/(1000*60*60*24)); return diffDays===0?"حجز كل المواعيد دفعة واحدة":diffDays<=7?`${diffDays} يوم — قرار سريع`:`${diffDays} يوم — استكشاف متأنٍ`; })()}</div>
                  <div className="adm-note">💬 <strong>نقاط نقاش:</strong> {regAnalysis.patternId==="sequential"?"يميل للتعمق — ناقش التوسع":regAnalysis.patternId==="breadthFirst"?"يميل للاستكشاف — ناقش التعمق":regAnalysis.patternId==="foundationFocused"?"يركز على التأسيس — ناقش الانتقال":"نمط تكاملي — ناقش الأولويات"}</div>
                  {regAnalysis.depGaps.length>0 && <div className="adm-note" style={{background:"rgba(192,57,43,0.04)"}}>⚠ <strong>تبعيات مفقودة:</strong> {regAnalysis.depGaps.map(g=>`${g.process} ← ${g.missing}`).join(" | ")}</div>}
                  {regAnalysis.recommendations.length>0 && regAnalysis.recommendations.map((rec,i)=><div key={i} className="rpt-rec"><span className="rpt-rec-icon">💡</span><span>{rec}</span></div>)}
                </>}
              </>}
            </div>;
          })}
        </>}

        {/* ══ TAB: المحتوى ══ */}
        {adminTab === "content" && <>
          <div className="sec-head"><h2 className="sec-title">إدارة المحتوى</h2></div>
          <div className="adm-consultant"><h4>🔒 المحتوى يُدار من قاعدة البيانات مباشرة عبر Supabase</h4><p className="adm-note" style={{marginTop:"0.5rem"}}>جميع النصوص محفوظة في جداول <strong>app_content</strong> و<strong>process_details</strong>. لا يمكن تعديلها من هنا لحماية الملكية الفكرية.</p></div>
          {procs.map((proc) => {
            const isOpen = expandedContent === proc.key;
            return <div key={proc.key} className="adm-edit-card">
              <div className="adm-edit-header" onClick={() => setExpandedContent(isOpen ? null : proc.key)}>
                <h4 style={{color:proc.trackColor}}>{proc.trackIcon} {proc.nameAr}</h4>
                <span>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && <>
                {["insight","why_it_matters","description"].map(field => (
                  <div key={field} className="adm-field">
                    <label>{{insight:"البصيرة المنهجية",why_it_matters:"لماذا يهم",description:"الوصف التفصيلي"}[field]}</label>
                    <textarea defaultValue={field==="insight"?proc.insight:field==="why_it_matters"?proc.whyItMatters:proc.fullDesc} rows={2}
                      onBlur={async(e)=>{ try{ const {supabase} = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"); } catch(err){} showToast("التعديل يتم عبر Supabase مباشرة"); }} readOnly />
                  </div>
                ))}
              </>}
            </div>;
          })}
        </>}

        {/* ══ TAB: الإحصائيات ══ */}
        {adminTab === "stats" && <>
          <div className="sec-head"><h2 className="sec-title">إحصائيات</h2></div>
          <div className="adm-consultant">
            <h4>📊 توزيع المسارات</h4>
            {TRACKS.map(tr => {
              const count = allRegs.reduce((acc,r) => acc + Object.keys(r.dates||{}).filter(k=>k.startsWith(tr.id)).length, 0);
              const max = 16 * (allRegs.length || 1);
              return <div key={tr.id} className="rpt-bar-row" style={{marginTop:"0.5rem"}}>
                <div className="rpt-bar-label" style={{color:tr.color,fontWeight:700}}>{tr.nameAr}</div>
                <div className="rpt-bar-track"><div className="rpt-bar-fill" style={{width:`${(count/max)*100}%`,background:tr.color}}/></div>
                <div className="rpt-bar-count">{count}</div>
              </div>;
            })}
          </div>
        </>}

      </div>

      {/* ══ REG MODAL ══ */}
      {selectedReg && (
        <div className="reg-modal-overlay" onClick={()=>setSelectedReg(null)}>
          <div className="reg-modal" onClick={e=>e.stopPropagation()}>

            {/* Header */}
            <div className="reg-modal-header">
              <button className="reg-modal-close" onClick={()=>setSelectedReg(null)}>✕ إغلاق</button>
              <div className="reg-modal-info">
                <div className="reg-modal-name">{selectedReg.name}</div>
                <div className="reg-modal-phone">{selectedReg.phone} | {selectedReg.email}</div>
              </div>
              <div className="reg-modal-tabs">
                <button className={`reg-modal-tab ${selectedRegTab==="schedule"?"on":""}`} onClick={()=>setSelectedRegTab("schedule")}>📅 المواعيد</button>
                <button className={`reg-modal-tab ${selectedRegTab==="demo"?"on":""}`} onClick={()=>setSelectedRegTab("demo")}>🗺️ التحليل</button>
              </div>
            </div>

            {/* Body */}
            <div className="reg-modal-body">

              {/* ── تبويب المواعيد ── */}
              {selectedRegTab === "schedule" && <>
                <div className="demo-section-head">جدول المواعيد الـ 16</div>
                <div style={{overflowX:"auto"}}>
                  <table className="output-table" style={{minWidth:"540px"}}>
                    <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
                    <tbody>{procs.map((p,j)=>{
                      const d = selectedReg.dates?.[p.key];
                      const c = selectedReg.confirmed?.[p.key];
                      return <tr key={p.key}>
                        <td>{j+1}</td>
                        <td style={{fontWeight:600}}>{p.nameAr}</td>
                        <td style={{color:p.trackColor,whiteSpace:"nowrap"}}>{p.trackIcon} {p.trackNameAr}</td>
                        <td>{d ? fmtGregorian(d) : "—"}</td>
                        <td style={{color:"#8B6914"}}>{d ? gregorianToHijri(d).formatted : "—"}</td>
                        <td>{c ? <span className="badge badge-ok">✓</span> : d ? <span className="badge badge-wait">محدد</span> : "—"}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                {selectedReg.submittedAt && <div className="output-stamp" style={{marginTop:"0.8rem"}}>
                  <p>تم التقديم: <strong style={{color:BRAND.color}}>{fmtBoth(selectedReg.submittedAt).both}</strong></p>
                </div>}
                {selectedReg.submitted && <div style={{marginTop:"0.8rem",textAlign:"center"}}>
                  <button className="btn btn-s" style={{background:"linear-gradient(135deg,#C0392B,#E74C3C)",width:"auto"}} onClick={()=>{ adminUnlock(selectedReg.id); setSelectedReg(null); }}>🔓 فتح التعديل</button>
                </div>}
              </>}

              {/* ── تبويب التحليل الديموغرافي ── */}
              {selectedRegTab === "demo" && <>
                {(!selectedReg[DEMO_KEY] || selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).length === 0)
                  ? <div className="empty"><h3>🗺️</h3><p>{appContent.demo_empty_state || 'لم يُكمل العميل التحليل الديموغرافي بعد'}</p></div>
                  : <>
                    <div className="demo-section-head">{selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).length} شخص في الشبكة</div>
                    <div className="demo-person-grid">
                      {selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).map((person, pi) => {
                        const scoreColor = (v) => v>=70?"#27ae60":v>=40?"#2E6B8A":"#aaa";
                        const targets = ["knowledge","social","financial","economic"].filter(k=>person.target?.[k]);
                        const targetLabels = {knowledge:"معرفي",social:"مجتمعي",financial:"مالي",economic:"اقتصادي"};
                        return (
                          <div key={pi} className="demo-person-card">
                            <div className="demo-person-header">
                              <div className="demo-person-num">{pi+1}</div>
                              <div>
                                <div className="demo-person-name">{person.name}</div>
                                <div className="demo-person-role">{[person.position,person.entity,person.relation].filter(Boolean).join(" • ") || "—"}</div>
                              </div>
                              {person.location && <div style={{marginRight:"auto",fontSize:"0.65rem",color:"var(--wg)"}}>📍{person.location}</div>}
                            </div>

                            <div className="demo-section-head" style={{marginBottom:"0.4rem"}}>قوة الشخص</div>
                            {[["knowledge","معرفي"],["social","مجتمعي"],["financial","مالي"],["economic","اقتصادي"],["sovereign","سيادي"]].map(([k,label])=>{
                              const val = person.strength?.[k] || 0;
                              return <div key={k} className="demo-bar-row">
                                <div className="demo-bar-label">{label}</div>
                                <div className="demo-bar-track"><div className="demo-bar-fill" style={{width:`${val}%`,background:scoreColor(val)}}/></div>
                                <div className="demo-bar-val" style={{color:scoreColor(val)}}>{val}</div>
                              </div>;
                            })}

                            {targets.length > 0 && <div className="demo-person-chips">
                              <span style={{fontSize:"0.62rem",color:"var(--wg)",marginLeft:"0.3rem"}}>المستهدف:</span>
                              {targets.map(k=><span key={k} className="demo-person-chip" style={{background:"#8B691415",color:"#8B6914",border:"1px solid #8B691430"}}>{targetLabels[k]}</span>)}
                            </div>}

                            {person.sharedEvent && <div style={{marginTop:"0.5rem",fontSize:"0.68rem",color:"var(--wg)",fontStyle:"italic"}}>"{person.sharedEvent}"</div>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                }
              </>}

            </div>
          </div>
        </div>
      )}

      <Footer />
    </div></>
  );

  // ════════ USER MAIN ════════
  // Tabs — report hidden until 3+ bookings
  const showReport = datedCount >= 3;
  const userTabs = [
    ["matrix", "المصفوفة", "🗂"],
    ["schedule", "الجدول", "📅"],
    ...(showReport ? [["report", "التقرير", "📊"]] : []),
    ["summary", "المخرجات", "📋"],
    ...(submitted ? [["output", "النهائي", "🏁"]] : []),
  ];

  return (
    <><style>{CSS}</style><div className="app">

      {/* ══ Nav ══ */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-logo"><MILogo size={15} color="#fff"/></div>
          <span className="nav-user">{user.name}</span>
        </div>
        <div className="nav-center user-desktop-tabs">
          <div className="tabs">
            {userTabs.map(([k,v]) => (
              <button key={k} className={`tab ${tab===k?"on":""}`} onClick={() => setTab(k)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="nav-right">
          <div className="nav-prog">
            <div className="nav-prog-bar"><div className="nav-prog-fill" style={{width:`${progressPct}%`}}/></div>
            <span className="nav-prog-pct">{progressPct}%</span>
          </div>
          <button className="btn-logout" onClick={logout}>خروج</button>
        </div>
      </nav>

      {/* ══ Bottom Tab Bar (mobile) ══ */}
      <div className="user-bottom-bar">
        {userTabs.map(([k,v,icon]) => (
          <button key={k} className={tab===k?"on":""} onClick={()=>setTab(k)}>
            <span className="ubb-icon">{icon}</span>{v}
          </button>
        ))}
      </div>

      {/* ════ MATRIX TAB ════ */}
      {tab === "matrix" && <div className="sec" style={{animation:"fadeIn 0.4s"}}>

        {/* Context Bar — replaces Banner */}
        <div className="ctx-bar">
          <div className="ctx-stat">
            <span className="ctx-stat-num">{datedCount}</span>
            <span className="ctx-stat-label">/ 16 موعد</span>
          </div>
          <div className="ctx-divider"/>
          <div className="ctx-stat">
            <span className="ctx-stat-num">{confirmedCount}</span>
            <span className="ctx-stat-label">مؤكدة</span>
          </div>
          <div className="ctx-divider"/>
          <div className="ctx-bar-prog">
            <div className="ctx-bar-track"><div className="ctx-bar-fill" style={{width:`${progressPct}%`}}/></div>
            <span style={{fontSize:".72rem",fontWeight:700,color:"var(--mi-d)",flexShrink:0}}>{progressPct}%</span>
          </div>
          {submitted && <span style={{fontSize:".75rem",color:"var(--ok)",fontWeight:700,marginRight:"auto"}}>🔒 مكتملة</span>}
        </div>

        {/* المصفوفة */}
        <div className="mx-groups">
          <div className="mx-grp mx-grp-c" style={{flex:2}}>الهوية الحالية</div>
          <div className="mx-grp mx-grp-n" style={{flex:2}}>الهوية الاعتبارية الجديدة</div>
        </div>
        <div className="mx-phases">{PHASES.map(p => <div key={p.id} className="mx-ph">{p.nameAr}</div>)}</div>
        <div className="mx-grid">
          {TRACKS.map(tr => (
            <div key={tr.id} className="mx-row">
              <div className="mx-track" style={{background:`linear-gradient(135deg,${tr.color},${tr.color}CC)`}}>
                <span className="mx-tw">{tr.weight}%</span>
                <span className="mx-tn">{tr.nameAr}</span>
                <span className="mx-tc">{tr.contentAr}</span>
              </div>
              <div className="mx-cells">
                {PHASES.map(ph => {
                  const op = OPERATIONS[tr.id][ph.id-1], key=`${tr.id}-${ph.id}`, proc=procs.find(p=>p.key===key);
                  const hasD=!!dates[key], isDone=!!confirmed[key], isHL=highlightedKeys.includes(key);
                  return (
                    <div key={key}
                      className={`cell ${isDone?"done":""} ${hasD&&!isDone?"dated":""} ${isHL?"highlighted":""}`}
                      onClick={() => {
                        if (submitted){showToast("تم قفل الخطة بعد التقديم النهائي");return;}
                        setSelectedCell(proc); setTempDate(dates[key]||""); setDateError("");
                        setHighlightedKeys([...(proc.feeds||[]),...(proc.fedBy||[])]);
                      }}
                      onMouseLeave={()=>{ if(!selectedCell) setHighlightedKeys([]); }}>
                      <div className="bar" style={{background:tr.color}}/>
                      <span className="num">{proc.index+1}</span>
                      <div className="cell-name">{op.nameAr}</div>
                      <div className="cell-meta">
                        <span className="cell-dur">{proc.duration||`${op.dur}w`}</span>
                        {hasD && <span className="cell-date">{fmtShort(dates[key])}</span>}
                      </div>
                      {proc.insight && <div className="cell-insight" style={{background:`${tr.color}E6`}}>{proc.insight}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Smart Suggestions — BELOW matrix */}
        {!submitted && datedCount === 0 && (
          <div className="smart-below">
            <div className="smart-below-label">💡 {appContent.welcome_hint||'يبدأ معظم العملاء بـ:'}</div>
            <p style={{fontSize:".78rem",color:"var(--wg)",marginBottom:".5rem"}}>{appContent.welcome_desc||'اختر أول عملية لبدء بناء خطتك الاستراتيجية'}</p>
            <div className="smart-suggest">
              {(appContent.starter_processes||'creation-1,establishment-1').split(',').map(k=>k.trim()).map(k=>{
                const p=procs.find(x=>x.key===k);
                return p ? <span key={k} className="smart-chip" style={{borderColor:p.trackColor+'50',color:p.trackColor,background:p.trackColor+'0A'}}
                  onClick={()=>{setSelectedCell(p);setTempDate("");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);}}>
                  {p.trackIcon} {p.nameAr}</span> : null;
              })}
            </div>
          </div>
        )}

        {!submitted && datedCount>=1 && datedCount<=2 && (()=>{
          const booked=Object.keys(dates);
          const suggestions=new Set();
          booked.forEach(k=>{const p=procs.find(x=>x.key===k);if(p)(p.feeds||[]).forEach(f=>{if(!dates[f])suggestions.add(f);});});
          const sugList=[...suggestions].slice(0,3).map(k=>procs.find(x=>x.key===k)).filter(Boolean);
          return sugList.length>0 ? (
            <div className="smart-below">
              <div className="smart-below-label">🔗 {appContent.suggest_label||'بناءً على اختياراتك، قد يهمك:'}</div>
              <div className="smart-suggest">
                {sugList.map(p=><span key={p.key} className="smart-chip" style={{borderColor:p.trackColor+'50',color:p.trackColor,background:p.trackColor+'0A'}}
                  onClick={()=>{setSelectedCell(p);setTempDate("");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);}}>
                  {p.trackIcon} {p.nameAr}</span>)}
              </div>
            </div>
          ) : null;
        })()}

        {!submitted && datedCount>=3 && datedCount<16 && (()=>{
          const booked=Object.keys(dates);
          const suggestions=new Set();
          booked.forEach(k=>{const p=procs.find(x=>x.key===k);if(p)(p.feeds||[]).forEach(f=>{if(!dates[f])suggestions.add(f);});});
          const sugList=[...suggestions].slice(0,4).map(k=>procs.find(x=>x.key===k)).filter(Boolean);
          return sugList.length>0 ? (
            <div className="smart-below">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".4rem"}}>
                <div className="smart-below-label" style={{marginBottom:0}}>🔗 {appContent.suggest_deps_label||'اقتراحات بناءً على التبعيات'}</div>
                <span className="smart-counter">{datedCount}/16</span>
              </div>
              <div className="smart-suggest">
                {sugList.map(p=><span key={p.key} className="smart-chip" style={{borderColor:p.trackColor+'50',color:p.trackColor,background:p.trackColor+'0A'}}
                  onClick={()=>{setSelectedCell(p);setTempDate("");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);}}>
                  {p.trackIcon} {p.nameAr}</span>)}
              </div>
            </div>
          ) : null;
        })()}

        {/* Missing + Submit */}
        {!allDated && datedCount>0 && !submitted && (
          <div className="missing">
            <h4>⚠ متبقي {16-datedCount} عملية بدون موعد</h4>
            <div className="missing-chips">
              {missingProcs.map(p=><span key={p.key} className="missing-chip"
                onClick={()=>{setSelectedCell(p);setTempDate("");setDateError("");}}>
                {p.trackIcon} {p.nameAr}</span>)}
            </div>
          </div>
        )}

        {!submitted && (
          <div className={`submit ${allDated?"submit-ready":"submit-wait"}`}>
            {allDated ? <>
              <h3 style={{color:BRAND.dark}}>✓ جاهز للموافقة النهائية</h3>
              <p>{confirmedCount}/16 مؤكدة</p>
              <button className="btn btn-s btn-gold" onClick={handleSubmit}>✓ موافقة نهائية</button>
            </> : <>
              <h3 style={{color:"#aaa"}}>يجب تحديد جميع المواعيد الـ 16</h3>
              <p style={{color:"var(--wg)"}}>{datedCount}/16 محدد</p>
              {datedCount>0 && <span className="submit-missing-link" onClick={()=>{ const m=missingProcs[0]; if(m){setSelectedCell(m);setTempDate("");setDateError("");}}}>
                ابدأ بـ: {missingProcs[0]?.nameAr} ←
              </span>}
            </>}
          </div>
        )}

        {submitted && (
          <div className="submit submit-done">
            <h3 style={{color:"#5B7B3A"}}>🔒 تم قفل الخطة بعد الموافقة النهائية</h3>
            <p style={{marginBottom:".5rem"}}>يمكنك مراجعة النموذج النهائي أو طلب إعادة الفتح</p>
            <div style={{display:"flex",gap:".5rem",justifyContent:"center",flexWrap:"wrap"}}>
              <button className="btn btn-s btn-gold" onClick={()=>setTab("output")}>📋 النموذج النهائي</button>
              {!reopenRequested
                ? <button className="btn btn-s btn-outline" onClick={requestReopen}>🔓 طلب إعادة فتح</button>
                : <span style={{color:BRAND.color,fontWeight:600,fontSize:".82rem"}}>⏳ بانتظار موافقة المدير</span>}
            </div>
          </div>
        )}
      </div>}

      {/* ════ SCHEDULE TAB ════ */}
      {tab === "schedule" && <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="sec-head">
          <h2 className="sec-title">الجدول الزمني</h2>
          <span style={{fontSize:".78rem",color:"var(--wg)"}}>{datedCount} موعد</span>
        </div>
        {datedCount===0
          ? <div className="empty"><h3>لا توجد مواعيد بعد</h3><p>حدد المواعيد من <span style={{color:"var(--mi-d)",cursor:"pointer",fontWeight:600}} onClick={()=>setTab("matrix")}>المصفوفة</span></p></div>
          : <div className="tl">
            {procs.filter(p=>dates[p.key]).sort((a,b)=>new Date(dates[a.key])-new Date(dates[b.key])).map((item,i)=>{
              const d=dates[item.key], h=fmtBoth(d), isDone=!!confirmed[item.key];
              return (
                <div key={item.key} className="tl-item" style={{animationDelay:`${i*.04}s`}}>
                  <div className="tl-dot" style={{borderColor:item.trackColor,background:isDone?item.trackColor:"var(--sw)"}}/>
                  <div className="tl-card" style={{borderRightColor:item.trackColor}}>
                    <div style={{display:"flex",alignItems:"center",gap:".4rem",marginBottom:".3rem"}}>
                      <span className="tl-step" style={{background:item.trackColor}}>خطوة {i+1}</span>
                      {isDone && <span className="badge badge-ok">مؤكد ✓</span>}
                      {!submitted && <button className="tl-edit-btn" onClick={()=>{setSelectedCell(item);setTempDate(d);setDateError("");setTab("matrix");setTimeout(()=>setTab("schedule"),50);}}>✏ تعديل</button>}
                    </div>
                    <div className="tl-name">{item.nameAr}</div>
                    <div className="tl-track">{item.trackIcon} {item.trackNameAr} • {item.phaseNameAr}</div>
                    <div className="tl-dates"><span>📅 {h.gregorian}</span><span>{item.duration||`${item.dur} أيام`}</span></div>
                    <div className="tl-hijri">🌙 {h.hijri}</div>
                  </div>
                </div>
              );
            })}
          </div>}
      </div>}

      {/* ════ REPORT TAB ════ */}
      {tab === "report" && showReport && <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="sec-head"><h2 className="sec-title">التقرير التحليلي</h2></div>
        {(()=>{
          const analysis=analyzeBookings(procs,dates,confirmed);
          if(!analysis) return <div className="rpt-card rpt-empty"><h3>تحتاج حجوزات إضافية</h3><p>أكمل <strong>3 حجوزات</strong> على الأقل</p></div>;
          const {pattern,trackCoverage,phaseCoverage,weightBalance,avgPhase,readinessAr,depGaps,recommendations,timeline,trackDist,totalBooked,isComplete}=analysis;
          return <>
            <div className="rpt-card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:".5rem"}}>
              <div><div style={{display:"flex",alignItems:"center",gap:".5rem"}}><MILogo size={18} color={BRAND.color}/><strong style={{fontFamily:"'Amiri',serif",color:BRAND.dark}}>Milestone Impact</strong></div><div style={{fontSize:".75rem",color:"#999",marginTop:".15rem"}}>تقرير مولّد تلقائياً</div></div>
              <div style={{textAlign:"left"}}><div style={{fontSize:".82rem",fontWeight:600}}>{user.name}</div><div style={{fontSize:".7rem",color:"#999"}}>{new Date().toLocaleDateString('ar-SA')} • {totalBooked} حجوزات</div></div>
            </div>
            <div className="rpt-card"><div className="rpt-pattern">
              <div className="rpt-pattern-icon">{pattern.icon}</div>
              <div className="rpt-pattern-name">نمط {pattern.nameAr}</div>
              <div className="rpt-pattern-desc">{pattern.desc}</div>
            </div>
            {isComplete && <div style={{textAlign:"center",padding:".6rem",background:"rgba(91,123,58,0.06)",borderRadius:"10px",marginTop:"-.5rem"}}>
              <strong style={{color:"#5B7B3A",fontSize:".88rem"}}>🏆 رحلة تحول كاملة</strong>
            </div>}</div>
            <div className="rpt-card"><h3 className="rpt-section-title">الإحصائيات</h3>
              <div className="rpt-stats">
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:BRAND.color}}>{totalBooked}</div><div className="rpt-stat-l">محجوزة</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:"#5B7B3A"}}>{trackCoverage.covered}/4</div><div className="rpt-stat-l">مسارات</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:"#8B6914"}}>{avgPhase}</div><div className="rpt-stat-l">متوسط المرحلة</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:"#6B4E3D"}}>{readinessAr}</div><div className="rpt-stat-l">الجاهزية</div></div>
              </div>
            </div>
            <div className="rpt-card"><h3 className="rpt-section-title">رحلة الحجز</h3>
              {timeline.map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:".6rem",padding:".45rem 0",borderBottom:i<timeline.length-1?"1px solid var(--sa)":"none"}}>
                <div style={{width:"26px",height:"26px",borderRadius:"50%",background:t.trackColor,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".7rem",fontWeight:700,flexShrink:0}}>{t.step}</div>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:".84rem"}}>{t.nameAr}</div><div style={{fontSize:".7rem",color:"#999"}}>{t.trackIcon} {t.trackNameAr}</div></div>
                <div style={{textAlign:"left",flexShrink:0}}><div style={{fontSize:".73rem",color:BRAND.dark}}>{fmtShort(t.date)}</div>{t.isConfirmed&&<div style={{fontSize:".62rem",color:"#5B7B3A"}}>✓ مؤكد</div>}</div>
              </div>)}
            </div>
            <div className="rpt-card"><h3 className="rpt-section-title">توزيع الاهتمام</h3>
              {trackDist.map(t=><div key={t.id} className="rpt-bar-row">
                <div className="rpt-bar-label" style={{color:t.color}}>{t.icon} {t.nameAr}</div>
                <div className="rpt-bar-track"><div className="rpt-bar-fill" style={{width:`${t.pct}%`,background:t.color}}>{t.pct>15&&<span className="rpt-bar-pct">{t.pct}%</span>}</div></div>
                <div className="rpt-bar-count">{t.count}/4</div>
              </div>)}
            </div>
            {depGaps.length>0 && <div className="rpt-card"><h3 className="rpt-section-title">⚠ فجوات التبعية</h3>
              {depGaps.map((g,i)=><div key={i} className="rpt-gap">حجزت <strong>{g.process}</strong> لكن لم تحجز <strong>{g.missing}</strong> التي تغذيها</div>)}
            </div>}
            {recommendations.length>0 && <div className="rpt-card"><h3 className="rpt-section-title">التوصيات</h3>
              {recommendations.map((r,i)=><div key={i} className="rpt-rec"><span className="rpt-rec-icon">💡</span><span>{r}</span></div>)}
            </div>}
            <div className="rpt-card" style={{textAlign:"center",padding:"1rem"}}><MILogo size={16} color={BRAND.color}/><div style={{fontSize:".7rem",color:"#999",marginTop:".25rem"}}>Milestone Impact — تقرير مولّد تلقائياً</div></div>
          </>;
        })()}
      </div>}

      {/* ════ SUMMARY TAB ════ */}
      {tab === "summary" && <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="sec-head"><h2 className="sec-title">المخرجات</h2></div>
        {submitted && <div className="output-tab-hint" onClick={()=>setTab("output")}>📋 الخطة مكتملة — اضغط هنا لعرض النموذج النهائي وطباعته</div>}
        <div className="sum-card"><h3 className="sum-title">ملخص الخطة</h3>
          <div className="modal-grid" style={{marginBottom:"1rem"}}>
            <div className="modal-item"><div className="modal-item-label">المشارك</div><div className="modal-item-value">{user.name}</div></div>
            <div className="modal-item"><div className="modal-item-label">مواعيد</div><div className="modal-item-value">{datedCount}/16</div></div>
            <div className="modal-item"><div className="modal-item-label">مؤكدة</div><div className="modal-item-value">{confirmedCount}/16</div></div>
            <div className="modal-item"><div className="modal-item-label">الحالة</div><div className="modal-item-value">{submitted?"✓ مكتمل":"قيد التخطيط"}</div></div>
          </div>
          {TRACKS.map(tr=>{
            const trackProcs=procs.filter(p=>p.trackId===tr.id);
            return <div key={tr.id} className="sum-track" style={{borderRightColor:tr.color}}>
              <div className="sum-track-head" style={{color:tr.color}}>{tr.icon} {tr.nameAr}</div>
              {trackProcs.map(p=>{const d=dates[p.key],c=confirmed[p.key];return(
                <div key={p.key} className="sum-track-item">
                  <span>{p.nameAr}</span>
                  <span>{d?<span style={{color:c?"var(--ok)":"var(--mi-d)",fontWeight:600}}>{c?"✓ ":""}{fmtShort(d)}</span>:"—"}</span>
                </div>);
              })}
            </div>;
          })}
        </div>
      </div>}

      {/* ════ OUTPUT TAB ════ */}
      {tab === "output" && submitted && <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="output-card">
          <div className="output-header"><h3>📋 نموذج مصفوفة التأثير النهائي</h3><button className="btn btn-s btn-print" onClick={handlePrint}>🖨 طباعة</button></div>
          <div className="output-info">
            <div className="output-info-item"><div className="output-info-label">المشارك</div><div className="output-info-value">{user.name}</div></div>
            <div className="output-info-item"><div className="output-info-label">الجوال</div><div className="output-info-value" style={{direction:"ltr"}}>{user.phone}</div></div>
            <div className="output-info-item"><div className="output-info-label">البريد</div><div className="output-info-value" style={{direction:"ltr",fontSize:".78rem"}}>{user.email}</div></div>
          </div>
          <table className="output-table">
            <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>المرحلة</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
            <tbody>{procs.map((p,i)=>{const d=dates[p.key],c=confirmed[p.key];return(
              <tr key={p.key}>
                <td>{i+1}</td><td style={{fontWeight:600}}>{p.nameAr}</td>
                <td style={{color:p.trackColor}}>{p.trackIcon} {p.trackNameAr}</td>
                <td>{p.phaseNameAr}</td>
                <td>{d?fmtGregorian(d):"—"}</td>
                <td style={{color:"#8B6914"}}>{d?gregorianToHijri(d).formatted:"—"}</td>
                <td>{c?<span className="badge badge-ok">✓</span>:d?<span className="badge badge-wait">محدد</span>:"—"}</td>
              </tr>);
            })}</tbody>
          </table>
          {dates && Object.keys(dates).length > 0 && <div className="output-stamp"><p>تاريخ الإنشاء: <strong style={{color:BRAND.color}}>{new Date().toLocaleDateString('ar-SA')}</strong></p></div>}
          <div className="copyright">© {new Date().getFullYear()} Milestone Impact — جميع الحقوق محفوظة</div>
        </div>
      </div>}

      {/* ══ Modal ══ */}
      {selectedCell && (
        <div className="overlay" onClick={()=>{setSelectedCell(null);setHighlightedKeys([]);}}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <button className="modal-x" onClick={()=>{setSelectedCell(null);setHighlightedKeys([]);}}>✕</button>
            <span className="modal-badge" style={{background:selectedCell.trackColor}}>{selectedCell.trackIcon} {selectedCell.trackNameAr} • {selectedCell.phaseNameAr}</span>
            <h2>{selectedCell.nameAr}</h2>
            {selectedCell.insight && <div className="modal-section"><div className="modal-insight-box">💡 {selectedCell.insight}</div></div>}
            {selectedCell.fullDesc && <p className="modal-desc">{selectedCell.fullDesc}</p>}
            {selectedCell.whyItMatters && <div className="modal-section">
              <div className="modal-section-title">⚡ لماذا يهم</div>
              <div className="modal-why">{selectedCell.whyItMatters}</div>
            </div>}
            {selectedCell.outputs?.length>0 && <div className="modal-section">
              <div className="modal-section-title">📋 المخرجات المتوقعة</div>
              <div className="modal-outputs">{selectedCell.outputs.map((o,i)=><div key={i} className="modal-output-item"><div className="modal-output-dot" style={{background:selectedCell.trackColor}}/>{o}</div>)}</div>
            </div>}
            <div className="modal-grid">
              <div className="modal-item"><div className="modal-item-label">المدة</div><div className="modal-item-value">{selectedCell.duration||`${selectedCell.dur} أيام`}</div></div>
              <div className="modal-item"><div className="modal-item-label">الوزن</div><div className="modal-item-value">{selectedCell.trackWeight}%</div></div>
              <div className="modal-item"><div className="modal-item-label">الترتيب</div><div className="modal-item-value">#{selectedCell.index+1}</div></div>
              <div className="modal-item"><div className="modal-item-label">المنطقة</div><div className="modal-item-value">{selectedCell.groupAr}</div></div>
            </div>
            {(selectedCell.fedBy?.length>0||selectedCell.feeds?.length>0) && <div className="modal-section">
              <div className="modal-section-title">🔗 شبكة الترابط</div>
              {selectedCell.fedBy?.length>0 && <><div className="modal-related-label">← تُغذّى من:</div>
                <div className="modal-related">{selectedCell.fedBy.map(k=>{const p=procs.find(x=>x.key===k);return p?<span key={k} className="modal-related-chip" style={{borderColor:p.trackColor+'60',color:p.trackColor,background:p.trackColor+'08'}} onClick={()=>{setSelectedCell(p);setTempDate(dates[p.key]||"");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);}}>{p.trackIcon} {p.nameAr}</span>:null;})}</div></>}
              {selectedCell.feeds?.length>0 && <><div className="modal-related-label" style={{marginTop:".5rem"}}>→ تُغذّي:</div>
                <div className="modal-related">{selectedCell.feeds.map(k=>{const p=procs.find(x=>x.key===k);return p?<span key={k} className="modal-related-chip" style={{borderColor:p.trackColor+'60',color:p.trackColor,background:p.trackColor+'08'}} onClick={()=>{setSelectedCell(p);setTempDate(dates[p.key]||"");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);}}>{p.trackIcon} {p.nameAr}</span>:null;})}</div></>}
            </div>}
            <div className="modal-divider"/>
            {selectedCell && (selectedCell.nameAr==="تحليل ديموغرافي"||selectedCell.key==="creation-1") && (
              <div style={{margin:"0.8rem 0"}}>
                <div style={{fontSize:".68rem",color:"var(--wg)",fontWeight:600,letterSpacing:".5px",marginBottom:".5rem",textTransform:"uppercase"}}>أداة مرتبطة بهذه العملية</div>
                <button onClick={openDemoScreen} style={{width:"100%",display:"flex",alignItems:"center",gap:".75rem",padding:".85rem 1rem",border:"none",borderRadius:"12px",background:"linear-gradient(135deg,#8B6914,#C4A24E)",color:"#fff",cursor:"pointer",transition:"all .25s",boxShadow:"0 4px 16px rgba(139,105,20,.3)",fontFamily:"Tajawal,sans-serif"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 6px 22px rgba(139,105,20,.4)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 4px 16px rgba(139,105,20,.3)";}}>
                  <span style={{fontSize:"1.3rem",flexShrink:0}}>🗺️</span>
                  <span style={{flex:1,textAlign:"right"}}>
                    <span style={{display:"block",fontWeight:700,fontSize:".88rem",marginBottom:".1rem"}}>{appContent.demo_cta_title||'ابدأ تحليلك الديموغرافي'}</span>
                    <span style={{display:"block",fontSize:".72rem",opacity:.85}}>{appContent.demo_cta_desc||'رسّم شبكتك البشرية'}</span>
                  </span>
                  <span style={{fontSize:"1rem",flexShrink:0,opacity:.8}}>←</span>
                </button>
              </div>
            )}
            <div className="date-section">
              <h4>📅 تحديد تاريخ البدء</h4>
              <div className="date-row">
                <button className="btn btn-s btn-gold" onClick={()=>saveDate(selectedCell.key,tempDate)} disabled={!tempDate}>حفظ</button>
                <input type="date" value={tempDate} min={new Date().toISOString().split("T")[0]}
                  onChange={e=>{setTempDate(e.target.value);setDateError("");}}
                  style={{flex:1,minWidth:"140px",padding:".55rem .75rem",border:"1.5px solid var(--sa)",borderRadius:"8px",fontFamily:"Tajawal",direction:"ltr",fontSize:".9rem",background:"var(--sw)"}}/>
              </div>
              {dateError && <p style={{fontSize:".72rem",color:"var(--rd)",marginTop:".25rem"}}>{dateError}</p>}
              {dates[selectedCell.key] && <div className="hijri-badge">🌙 {gregorianToHijri(dates[selectedCell.key]).formatted}</div>}
              {dates[selectedCell.key] && !submitted && <div style={{marginTop:".5rem"}}>
                <button style={{background:"none",border:"none",color:"var(--rd)",fontFamily:"Tajawal",fontSize:".75rem",cursor:"pointer"}}
                  onClick={()=>{const newD={...dates};const newC={...confirmed};delete newD[selectedCell.key];delete newC[selectedCell.key];setDates(newD);setConfirmed(newC);if(sessionId){DB.get(sessionId).then(rec=>{if(rec){rec.dates=newD;rec.confirmed=newC;DB.save(sessionId,rec);}});}setTempDate("");showToast("تم حذف التاريخ");}}>
                  ✕ حذف التاريخ
                </button>
              </div>}
            </div>
            <div className="modal-actions">
              <button className={`btn ${confirmed[selectedCell.key]?"btn-danger":""}`} onClick={()=>toggleConfirm(selectedCell.key)} disabled={!dates[selectedCell.key]}>
                {confirmed[selectedCell.key]?"إلغاء التأكيد ✕":"تأكيد الموعد ✓"}
              </button>
              <button className="btn btn-outline" onClick={()=>{setSelectedCell(null);setHighlightedKeys([]);}}>إغلاق</button>
            </div>
            {!dates[selectedCell.key] && <p style={{fontSize:".72rem",color:"#A0522D",marginTop:".4rem",textAlign:"center"}}>حدد التاريخ أولاً</p>}
          </div>
        </div>
      )}

      {/* ══ Confirm ══ */}
      {confirmAction && <div className="confirm-overlay" onClick={()=>setConfirmAction(null)}>
        <div className="confirm-box" onClick={e=>e.stopPropagation()}>
          <h3>{confirmAction.title}</h3>
          <p>{confirmAction.message}</p>
          <div className="confirm-btns">
            <button className="btn btn-danger" onClick={confirmAction.onConfirm}>نعم، متأكد</button>
            <button className="btn btn-outline" onClick={()=>setConfirmAction(null)}>إلغاء</button>
          </div>
        </div>
      </div>}

      {toast && <div className="toast">{toast}</div>}
      <Footer />

      {/* ═══ شاشة التحليل الديموغرافي ═══ */}
      {demoScreen && (
        <div className="demo-overlay" onClick={() => setDemoScreen(false)}>
        <div className="demo-screen" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="demo-header">
            <button className="demo-header-back" onClick={() => setDemoScreen(false)}>← رجوع</button>
            <div className="demo-header-info">
              <div className="demo-header-title">◈ {appContent.demo_screen_title || 'التحليل الديموغرافي'}</div>
              <div className="demo-header-sub">{appContent.demo_screen_sub || 'تفكيك البنية البشرية التي تتحرك داخلها قيمتك'}</div>
            </div>
            <div className="demo-header-badge">{demoRows.filter(r => r.name.trim()).length} شخص</div>
          </div>

          {/* Body */}
          <div className="demo-body">
            <div className="demo-intro">
              <div className="demo-intro-title">🧭 {appContent.demo_intro_title || 'ما هذا النموذج؟'}</div>
              <div className="demo-intro-text" style={{fontSize:"0.8rem"}}>{appContent.demo_intro_text || 'هذه خريطة شبكتك البشرية.'}</div>
            </div>

            {demoRows.map((row, idx) => (
              <div key={row.id} className="demo-card">
                {/* Card Header */}
                <div className="demo-card-header">
                  <div className="demo-card-num">{idx + 1}</div>
                  <div className="demo-card-name">{row.name || `الشخص ${idx + 1}`}</div>
                  <button className="demo-card-remove" onClick={() => removeDemoRow(row.id)} title="حذف">✕</button>
                </div>

                {/* الهوية */}
                <div className="demo-section-label">👤 البيانات الأساسية</div>
                <div className="demo-fields demo-fields-3" style={{ marginBottom: "0.6rem" }}>
                  <div className="demo-field">
                    <label>الاسم *</label>
                    <input placeholder="اسم الشخص" value={row.name} onChange={e => updateDemoRow(row.id, 'name', e.target.value)} />
                  </div>
                  <div className="demo-field">
                    <label>الجهة / المؤسسة</label>
                    <input placeholder="الشركة أو الجهة" value={row.entity} onChange={e => updateDemoRow(row.id, 'entity', e.target.value)} />
                  </div>
                  <div className="demo-field">
                    <label>المنصب</label>
                    <input placeholder="الدور أو المنصب" value={row.position} onChange={e => updateDemoRow(row.id, 'position', e.target.value)} />
                  </div>
                </div>
                <div className="demo-fields demo-fields-3">
                  <div className="demo-field">
                    <label>طبيعة العلاقة</label>
                    <select value={row.relation} onChange={e => updateDemoRow(row.id, 'relation', e.target.value)}>
                      <option value="">اختر</option>
                      <option>أقارب</option><option>زملاء</option><option>أصدقاء</option>
                      <option>عملاء</option><option>شركاء</option><option>معارف</option><option>أخرى</option>
                    </select>
                  </div>
                  <div className="demo-field">
                    <label>العمر التقريبي</label>
                    <input type="number" min="15" max="99" placeholder="45" value={row.age} onChange={e => updateDemoRow(row.id, 'age', e.target.value)} />
                  </div>
                  <div className="demo-field">
                    <label>الموقع الجغرافي</label>
                    <input placeholder="المدينة / الدولة" value={row.location} onChange={e => updateDemoRow(row.id, 'location', e.target.value)} />
                  </div>
                </div>
                <div className="demo-fields" style={{ marginTop: "0.6rem" }}>
                  <div className="demo-field" style={{ gridColumn: "1/-1" }}>
                    <label>الحدث المشترك (كيف التقيتما؟)</label>
                    <input placeholder="مثال: زميل عمل، حضرنا نفس البرنامج..." value={row.sharedEvent} onChange={e => updateDemoRow(row.id, 'sharedEvent', e.target.value)} />
                  </div>
                </div>

                {/* قوة الشخص */}
                <div className="demo-section-label" style={{ marginTop: "1rem" }}>⚡ قوة الشخص بشكل عام (0–100)</div>
                <div className="demo-scores">
                  {[['knowledge','معرفي'],['social','مجتمعي'],['financial','مالي'],['economic','اقتصادي'],['sovereign','سيادي']].map(([k, label]) => (
                    <div key={k} className="demo-score">
                      <label>{label}</label>
                      <input type="number" min="0" max="100" value={row.strength[k]}
                        onChange={e => updateDemoRow(row.id, ['strength', k], Math.min(100, Math.max(0, +e.target.value || 0)))}
                        style={{ borderColor: row.strength[k] > 60 ? '#8B6914' : row.strength[k] > 30 ? '#2E6B8A' : undefined }}
                      />
                    </div>
                  ))}
                </div>

                {/* نوع العلاقة الشخصية */}
                <div className="demo-section-label">🤝 نوع علاقتي به (0–100)</div>
                <div className="demo-scores demo-scores-4">
                  {[['knowledge','معرفي'],['social','مجتمعي'],['financial','مالي'],['economic','اقتصادي']].map(([k, label]) => (
                    <div key={k} className="demo-score">
                      <label>{label}</label>
                      <input type="number" min="0" max="100" value={row.myRelation[k]}
                        onChange={e => updateDemoRow(row.id, ['myRelation', k], Math.min(100, Math.max(0, +e.target.value || 0)))}
                      />
                    </div>
                  ))}
                </div>

                {/* المستهدف */}
                <div className="demo-section-label">🎯 ما أستهدف تفعيله معه</div>
                <div className="demo-targets">
                  {[['knowledge','معرفي 🧠'],['social','مجتمعي 🤝'],['financial','مالي 💰'],['economic','اقتصادي 📈']].map(([k, label]) => (
                    <div key={k}
                      className={`demo-target-chip ${row.target[k] ? 'active' : ''}`}
                      onClick={() => updateDemoRow(row.id, ['target', k], !row.target[k])}
                    >{label}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="demo-footer">
            <button className="demo-add-btn" onClick={addDemoRow}>+ {appContent.demo_add_btn || 'إضافة شخص'}</button>
            <span style={{fontSize:"0.78rem",color:"var(--wg)"}}>{demoRows.filter(r => r.name.trim()).length} / {demoRows.length} مكتمل</span>
            <button className="btn btn-gold btn-s" onClick={saveDemoData} disabled={demoSaving}>
              {demoSaving ? "جارٍ الحفظ..." : `💾 ${appContent.demo_save_btn || 'حفظ التحليل'}`}
            </button>
          </div>
        </div>
        </div>
      )}
    </div></>
  );
}
