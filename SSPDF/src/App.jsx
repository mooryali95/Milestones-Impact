import { useState, useMemo, useEffect } from "react";
import { repo } from "./lib/repository";
import { supabase } from "./lib/supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ScatterChart, Scatter, ReferenceLine,
} from "recharts";

/* ════════ هوية Milestone Impact — Petrol · Gold · Sand ════════ */
const B = {
  petrol: "#061E2C",
  petrolSoft: "#3E6E8C",
  gold: "#C8A45C",
  goldText: "#8A6432",
  goldSoft: "#F3E9D7",
  sand: "#FBF8EF",
  card: "#FFFFFF",
  line: "#E7E0CF",
  lineSoft: "#F0EAD9",
  muted: "#5C6B74",
  ok: "#1C6B4F",
  warn: "#8A6A1F",
  bad: "#A13A2C",
};

const SERVICES0 = [
  { id: "S1", ar: "تدريب", en: "Training" },
  { id: "S2", ar: "ورشة تنفيذية", en: "Executive Workshop" },
  { id: "S3", ar: "كوتشينج", en: "Coaching" },
  { id: "S4", ar: "استشارة توجيهية", en: "Advisory" },
  { id: "S5", ar: "استشارات", en: "Consulting" },
  { id: "S6", ar: "تمكين مكاتب المشاريع", en: "PMO Enablement" },
  { id: "S7", ar: "تحول مؤسسي", en: "Org. Transformation" },
];

const SEGMENTS0 = [
  { id: "C1", ar: "الرؤساء التنفيذيون", en: "CEOs" },
  { id: "C2", ar: "القيادات التنفيذية", en: "Executives" },
  { id: "C3", ar: "مديرو مكاتب المشاريع", en: "PMO Managers" },
  { id: "C4", ar: "مديرو المشاريع", en: "Project Managers" },
  { id: "C5", ar: "الجهات الحكومية", en: "Government" },
  { id: "C6", ar: "الشركات الكبرى", en: "Enterprises" },
  { id: "C7", ar: "القطاع غير الربحي", en: "NGOs" },
  { id: "C8", ar: "الجامعات", en: "Universities" },
  { id: "C9", ar: "الشركات العائلية", en: "Family Business" },
  { id: "C10", ar: "مؤسسو الشركات الناشئة", en: "Founders" },
];

const CRITERIA0 = [
  { id: "c1", ar: "حجم السوق", en: "Market Size", w: 14, g: "جاذبية السوق" },
  { id: "c2", ar: "سهولة الوصول للعملاء", en: "Customer Access", w: 10, g: "جاذبية السوق" },
  { id: "c3", ar: "سرعة تحقيق الإيراد", en: "Revenue Speed", w: 12, g: "جاذبية السوق" },
  { id: "c4", ar: "الربحية المتوقعة", en: "Profitability", w: 14, g: "جاذبية السوق" },
  { id: "c5", ar: "توافق خبرات الفريق", en: "Team Fit", w: 10, g: "القدرة على الفوز" },
  { id: "c6", ar: "سهولة التنفيذ", en: "Ease of Delivery", w: 8, g: "القدرة على الفوز" },
  { id: "c7", ar: "قابلية التوسع", en: "Scalability", w: 10, g: "جاذبية السوق" },
  { id: "c8", ar: "قوة الأثر", en: "Impact", w: 6, g: "القدرة على الفوز" },
  { id: "c9", ar: "التميز التنافسي", en: "Differentiation", w: 8, g: "القدرة على الفوز" },
  { id: "c10", ar: "علاقات طويلة الأمد", en: "Long-term Relations", w: 8, g: "القدرة على الفوز" },
];

const SEED = {
  "S2|C5": {
    scores: [8, 7, 7, 8, 9, 7, 6, 8, 7, 8],
    conf: ["H", "M", "M", "M", "H", "M", "M", "H", "M", "H"],
    risk: 4, riskNote: "اعتماد على دورات الاعتماد الحكومية للمدربين",
    evidence: {
      c1: "أكثر من 300 جهة حكومية ضمن برامج التحول الوطني تحتاج بناء قدرات قيادية في المشاريع",
      c4: "ميزانيات تدريب حكومية مرتفعة وإمكانية عقود إطارية",
      c8: "أثر مباشر على تمكين تنفيذ مستهدفات رؤية 2030",
    },
  },
  "S1|C2": {
    scores: [8, 7, 8, 7, 9, 8, 7, 7, 6, 7],
    conf: ["H", "H", "M", "M", "H", "H", "M", "M", "M", "M"],
    risk: 3, riskNote: "منافسة متزايدة من بيوت التدريب الكبرى",
    evidence: {
      c1: "آلاف القيادات التنفيذية في القطاعين الحكومي والخاص بالسعودية",
      c5: "المحتوى الحالي مصمم أصلاً للقادة وجاهز (Good Enough)",
      c3: "دورة بيع قصيرة نسبياً عبر إدارات التدريب والموارد البشرية",
    },
  },
  "S1|C4": {
    scores: [9, 8, 8, 5, 9, 9, 8, 5, 4, 5],
    conf: ["M", "M", "M", "L", "H", "H", "M", "L", "L", "M"],
    risk: 5, riskNote: "حساسية سعرية عالية وحرب أسعار محتملة",
    evidence: {
      c1: "أكبر شريحة عدداً في سوق إدارة المشاريع",
      c9: "منافسة شديدة من مزودي شهادات PMP وCAPM",
      c4: "حساسية سعرية تضغط الهوامش الربحية",
    },
  },
  "S6|C5": {
    scores: [7, 6, 5, 8, 8, 5, 6, 9, 8, 9],
    conf: ["M", "M", "M", "H", "H", "M", "M", "H", "H", "H"],
    risk: 6, riskNote: "دورات شراء حكومية طويلة وتعقيد تعاقدي",
    evidence: {
      c8: "مكاتب إدارة المشاريع ركيزة أساسية في هياكل الجهات الحكومية",
      c10: "عقود تمكين طويلة الأمد تمتد من 6 إلى 18 شهراً",
      c3: "دورات الشراء الحكومية تبطئ تحقيق الإيراد",
    },
  },
  "S3|C3": {
    scores: [6, 7, 7, 7, 8, 8, 6, 7, 6, 8],
    conf: ["M", "M", "M", "M", "H", "M", "M", "M", "M", "M"],
    risk: 3, riskNote: "صعوبة إثبات العائد الملموس للكوتشينج",
    evidence: {
      c5: "خبرة الفريق المباشرة في قيادة وتأسيس مكاتب المشاريع",
      c2: "مجتمعات مهنية نشطة تسهّل الوصول للشريحة",
    },
  },
  "S4|C1": {
    scores: [6, 5, 6, 8, 8, 7, 5, 8, 7, 9],
    conf: ["L", "M", "M", "M", "H", "M", "L", "M", "M", "H"],
    risk: 5, riskNote: "الاعتماد على العلاقات الشخصية يصعّب التوسع",
    evidence: {
      c4: "أتعاب استشارية توجيهية مرتفعة لكل عميل",
      c10: "علاقة مستمرة بصفة المستشار الموثوق للرئيس التنفيذي",
      c2: "الوصول للرؤساء التنفيذيين يتطلب شبكة علاقات قوية",
    },
  },
  "S6|C6": {
    scores: [7, 5, 5, 8, 8, 5, 6, 8, 7, 8],
    conf: ["M", "M", "M", "M", "M", "M", "M", "M", "M", "M"],
    risk: 5, riskNote: "تفضيل الشركات الكبرى للمكاتب الاستشارية العالمية",
    evidence: {
      c1: "توجه الشركات الكبرى لتأسيس مكاتب مشاريع ناضجة",
      c10: "عقود سنوية متجددة للتشغيل والتمكين",
    },
  },
  "S7|C6": {
    scores: [7, 4, 3, 9, 7, 4, 5, 9, 8, 9],
    conf: ["M", "M", "H", "M", "M", "M", "M", "H", "M", "H"],
    risk: 8, riskNote: "دورة بيع طويلة جداً وتنفيذ مكثف الموارد",
    evidence: {
      c4: "مشاريع التحول تحمل عقوداً كبيرة القيمة",
      c3: "دورة بيع تمتد من 6 إلى 12 شهراً",
      c6: "يتطلب فريقاً كبيراً وحضوراً ميدانياً مستمراً",
    },
  },
  "S2|C9": {
    scores: [5, 5, 6, 6, 7, 7, 5, 6, 6, 7],
    conf: ["M", "M", "M", "M", "M", "M", "M", "M", "M", "M"],
    risk: 4, riskNote: "قرارات الشراء مرتبطة بديناميكية العائلة",
    evidence: {
      c2: "الوصول عبر مجالس العائلات والغرف التجارية",
      c1: "شريحة واعدة لكنها أصغر حجماً من الشرائح المؤسسية",
    },
  },
  "S5|C7": {
    scores: [5, 6, 5, 5, 7, 6, 5, 8, 6, 7],
    conf: ["L", "M", "M", "L", "M", "M", "M", "H", "M", "M"],
    risk: 6, riskNote: "تقلب التمويل في القطاع غير الربحي",
    evidence: {
      c4: "ميزانيات محدودة لدى أغلب الجهات غير الربحية",
      c8: "أثر تنموي واضح يعزز السمعة والمسؤولية المجتمعية",
    },
  },
};

const TEAM0 = [
  { id: 1, name: "أنت", role: "admin" },
  { id: 2, name: "م. سارة العتيبي", role: "evaluator" },
  { id: 3, name: "د. خالد الحربي", role: "analyst" },
  { id: 4, name: "أ. نورة القحطاني", role: "viewer" },
];

const ROLES = {
  admin: { ar: "مدير النظام", en: "Admin", chip: { background: B.gold, color: B.petrol }, can: { structure: true, weights: true, score: true, risk: true, analyze: true, team: true } },
  evaluator: { ar: "مقيّم", en: "Evaluator", chip: { background: B.petrolSoft, color: "#fff" }, can: { structure: false, weights: false, score: true, risk: true, analyze: true, team: false } },
  analyst: { ar: "محلل", en: "Analyst", chip: { background: B.ok, color: "#fff" }, can: { structure: false, weights: false, score: false, risk: false, analyze: true, team: false } },
  viewer: { ar: "مشاهد", en: "Viewer", chip: { background: B.muted, color: "#fff" }, can: { structure: false, weights: false, score: false, risk: false, analyze: false, team: false } },
};
/** قراءة آمنة دائماً — لا تُسقط التطبيق أبداً مهما كانت قيمة الدور غير متوقعة */
const roleInfo = (key) => ROLES[key] || ROLES.viewer;

const CONF = {
  H: { f: 1.0, ar: "عالٍ", color: B.ok },
  M: { f: 0.92, ar: "متوسط", color: B.warn },
  L: { f: 0.8, ar: "منخفض", color: B.bad },
};

const SCENARIOS = {
  conservative: { ar: "متحفظ", en: "Conservative", mult: { c2: 1.5, c3: 1.5, c5: 1.4, c6: 1.4 }, desc: "يرفع وزن سرعة الإيراد وسهولة التنفيذ والوصول" },
  expected: { ar: "متوقع", en: "Expected", mult: {}, desc: "الأوزان المعتمدة كما هي" },
  aggressive: { ar: "متفائل", en: "Aggressive", mult: { c1: 1.5, c4: 1.4, c7: 1.5 }, desc: "يرفع وزن حجم السوق والربحية والتوسع" },
};

const AUDIT0 = [
  { ts: "2026-07-01 09:15", user: "أنت", action: "إنشاء المشروع", detail: "برنامج إدارة المشروعات للقادة" },
  { ts: "2026-07-01 10:40", user: "أنت", action: "اعتماد المعايير", detail: "10 معايير وفق منهجية GE-McKinsey" },
  { ts: "2026-07-02 13:22", user: "م. سارة العتيبي", action: "تقييم", detail: "ورشة تنفيذية × الجهات الحكومية — اكتمل التقييم مع الأدلة" },
  { ts: "2026-07-02 15:05", user: "م. سارة العتيبي", action: "تقييم", detail: "تدريب × القيادات التنفيذية — اكتمل التقييم" },
  { ts: "2026-07-03 08:30", user: "د. خالد الحربي", action: "تحليل", detail: "تشغيل تحليل السيناريوهات الثلاثة" },
];

const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function calcScore(ev, criteria) {
  let raw = 0, adj = 0;
  criteria.forEach((cr, i) => {
    raw += cr.w * ev.scores[i];
    adj += cr.w * ev.scores[i] * CONF[ev.conf[i]].f;
  });
  const tw = criteria.reduce((s, c) => s + c.w, 0) || 1;
  return { raw: (raw / (tw * 9)) * 100, adj: (adj / (tw * 9)) * 100 };
}

function bucket(adj, risk) {
  if (adj >= 75 && risk <= 5) return "launch";
  if (adj >= 68) return "next";
  if (adj >= 60) return "defer";
  return "exclude";
}

const BUCKETS = {
  launch: { ar: "ابدأ الآن", color: B.ok },
  next: { ar: "الموجة التالية", color: B.petrolSoft },
  defer: { ar: "أجّل", color: B.goldText },
  exclude: { ar: "استبعد حالياً", color: B.bad },
  unscored: { ar: "لم تُقيَّم بعد", color: "#9B9690" },
};

function scenWeights(criteria, mult) {
  const ws = criteria.map((c) => c.w * (mult[c.id] || 1));
  const t = ws.reduce((a, b) => a + b, 0);
  return criteria.map((c, i) => ({ ...c, w: (ws[i] / t) * 100 }));
}

function runMonteCarlo(items, criteria, n = 1000) {
  const NOISE = { H: 0.5, M: 1.25, L: 2.5 };
  const tw = criteria.reduce((s, c) => s + c.w, 0) || 1;
  const stat = {};
  items.forEach((it) => (stat[it.key] = { top3: 0, sum: 0, min: 100, max: 0 }));
  for (let t = 0; t < n; t++) {
    const round = items.map((it) => {
      let v = 0;
      criteria.forEach((cr, i) => {
        const s = Math.min(9, Math.max(1, it.ev.scores[i] + (Math.random() * 2 - 1) * NOISE[it.ev.conf[i]]));
        v += cr.w * s;
      });
      v = (v / (tw * 9)) * 100;
      const st = stat[it.key];
      st.sum += v; st.min = Math.min(st.min, v); st.max = Math.max(st.max, v);
      return { key: it.key, v };
    });
    round.sort((a, b) => b.v - a.v);
    round.slice(0, 3).forEach((r) => stat[r.key].top3++);
  }
  return items.map((it) => ({
    key: it.key, name: it.name,
    avg: stat[it.key].sum / n, min: stat[it.key].min, max: stat[it.key].max,
    top3: (stat[it.key].top3 / n) * 100,
  })).sort((a, b) => b.top3 - a.top3);
}

const scoreStyle = (s) =>
  s >= 7 ? { background: "#E4F2EA", color: B.ok } : s >= 4 ? { background: "#F7EDD8", color: B.warn } : { background: "#F7E2DE", color: B.bad };

/* مقياس ساعاتي (Saaty Scale) لمنهجية AHP */
const SAATY = [
  { v: 1 / 9, label: "الثاني أهم بشكل مطلق (1/9)" },
  { v: 1 / 7, label: "الثاني أهم جداً (1/7)" },
  { v: 1 / 5, label: "الثاني أهم بوضوح (1/5)" },
  { v: 1 / 3, label: "الثاني أهم قليلاً (1/3)" },
  { v: 1, label: "متساويان في الأهمية (1)" },
  { v: 3, label: "الأول أهم قليلاً (3)" },
  { v: 5, label: "الأول أهم بوضوح (5)" },
  { v: 7, label: "الأول أهم جداً (7)" },
  { v: 9, label: "الأول أهم بشكل مطلق (9)" },
];

/** حساب الأوزان من مصفوفة المقارنات الزوجية عبر المتوسط الهندسي (طريقة معتمدة ومبسّطة لـ AHP) */
function computeAHPWeights(criteria, pairs) {
  const n = criteria.length;
  const M = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const v = pairs[`${i}-${j}`] ?? 1;
    M[i][j] = v; M[j][i] = 1 / v;
  }
  const geo = M.map((row) => Math.pow(row.reduce((a, b) => a * b, 1), 1 / n));
  const total = geo.reduce((a, b) => a + b, 0) || 1;
  return geo.map((g) => Math.round((g / total) * 1000) / 10);
}

const Card = ({ children, className = "", style = {} }) => (
  <div className={`card p-5 ${className}`} style={style}>{children}</div>
);

const H = ({ ar, en, sub }) => (
  <div className="mb-5">
    <div className="flex items-baseline gap-3 flex-wrap">
      <h2 className="text-xl font-bold" style={{ color: B.petrol }}>{ar}</h2>
      <span className="text-xs tracking-widest uppercase font-mono" style={{ color: B.goldText }}>{en}</span>
    </div>
    {sub && <p className="text-sm mt-1" style={{ color: B.muted }}>{sub}</p>}
  </div>
);

const Stat = ({ label, value, alert }) => (
  <Card className="text-center">
    <div className="text-2xl md:text-3xl font-bold font-mono" style={{ color: alert ? B.bad : B.petrol }}>{value}</div>
    <div className="text-xs mt-1" style={{ color: B.muted }}>{label}</div>
  </Card>
);

const Locked = ({ role }) => (
  <div className="text-xs rounded-lg px-3 py-2 mb-4" style={{ background: B.goldSoft, border: `1px solid ${B.line}`, color: B.muted }}>
    🔒 صلاحيتك الحالية ({roleInfo(role).ar}) للعرض فقط في هذه الشاشة
  </div>
);

const GoldBtn = ({ onClick, disabled, children, className = "" }) => (
  <button onClick={onClick} disabled={disabled}
    className={`px-4 py-2 rounded-lg text-sm font-bold transition ${className}`}
    style={disabled ? { background: B.lineSoft, color: B.muted } : { background: B.gold, color: B.petrol }}>
    {children}
  </button>
);

const AuthShell = ({ children }) => (
  <div dir="rtl" className="min-h-screen flex items-center justify-center p-5" style={{ background: B.sand, fontFamily: "'DIN Next LT Arabic', 'Tajawal', 'Segoe UI', Tahoma, sans-serif" }}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <span className="px-3 py-1.5 rounded-lg text-xl font-black font-mono tracking-tight" style={{ background: B.petrol, color: B.gold }}>SSPDF</span>
        <div className="text-xs mt-2" style={{ color: B.muted }}>إطار قرار محفظة الخدمات الاستراتيجية</div>
      </div>
      <div className="card p-6" style={{ background: B.card, border: `1px solid ${B.line}`, borderRadius: 16 }}>{children}</div>
    </div>
  </div>
);

const Spinner = () => (
  <div style={{
    width: 28, height: 28, borderRadius: "50%",
    border: `3px solid ${B.lineSoft}`, borderTopColor: B.gold,
    animation: "sspdf-spin 0.8s linear infinite", margin: "0 auto",
  }} />
);

const CheckingScreen = () => (
  <AuthShell>
    <style>{`@keyframes sspdf-spin { to { transform: rotate(360deg); } }`}</style>
    <Spinner />
    <div className="text-center text-sm mt-4" style={{ color: B.muted }}>جارٍ تحميل بياناتك…</div>
  </AuthShell>
);

const LoginScreen = ({ authEmail, setAuthEmail, otpSent, setOtpSent, otpCode, setOtpCode, authBusy, authError, sendOtp, verifyOtp, resendIn }) => (
  <AuthShell>
    <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>تسجيل الدخول</div>
    <div className="text-xs mb-4" style={{ color: B.muted }}>Sign in via one-time email code</div>
    {!otpSent ? (
      <>
        <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="بريدك الإلكتروني"
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none inp mb-3" dir="ltr" style={{ textAlign: "right" }} />
        <GoldBtn onClick={sendOtp} disabled={authBusy || !authEmail.trim() || resendIn > 0} className="w-full py-2.5">
          {authBusy ? "جارٍ الإرسال…" : resendIn > 0 ? `أعد المحاولة بعد ${resendIn} ثانية` : "إرسال رمز الدخول"}
        </GoldBtn>
      </>
    ) : (
      <>
        <div className="text-xs mb-3" style={{ color: B.muted }}>أُرسل رمز إلى {authEmail} — أدخله هنا:</div>
        <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="000000" maxLength={6}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none inp mb-3 text-center font-mono tracking-widest" />
        <GoldBtn onClick={verifyOtp} disabled={authBusy || !otpCode.trim()} className="w-full py-2.5">
          {authBusy ? "جارٍ التحقق…" : "دخول"}
        </GoldBtn>
        <div className="flex justify-between mt-3">
          <button onClick={() => { setOtpSent(false); setOtpCode(""); }} className="text-xs" style={{ color: B.muted }}>تغيير البريد الإلكتروني</button>
          <button onClick={sendOtp} disabled={resendIn > 0 || authBusy} className="text-xs font-bold"
            style={{ color: resendIn > 0 ? B.muted : B.goldText }}>
            {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ثانية` : "إعادة إرسال الرمز"}
          </button>
        </div>
      </>
    )}
    {authError && <div className="text-xs mt-3 text-center" style={{ color: B.bad }}>{authError}</div>}
  </AuthShell>
);


const Portal = (p) => {
  if (!p.repoActive) {
    return (
      <div>
        <H ar="بوابة المشاريع" en="Projects Portal" sub="وضع تجريبي محلي — تفعيل تعدد المشاريع يتطلب اتصالاً حقيقياً بقاعدة البيانات" />
        <div className="grid md:grid-cols-2 gap-4">
          <div onClick={() => p.setScreen("dashboard")}
            className="rounded-2xl p-6 cursor-pointer transition hover:shadow-md"
            style={{ background: B.card, border: `2px solid ${B.gold}` }}>
            <div className="text-lg font-bold" style={{ color: B.petrol }}>برنامج إدارة المشروعات للقادة</div>
            <div className="text-xs font-mono mt-1" style={{ color: B.muted }}>PM for Leaders (Demo)</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <H ar="بوابة المشاريع" en="Projects Portal" sub={`${p.myProjects.length} مشروعاً تملك صلاحية فيه`} />
      <div className="grid md:grid-cols-2 gap-4">
        {p.myProjects.map((pr) => {
          const isOpen = p.currentProject?.id === pr.id;
          return (
            <div key={pr.id} onClick={() => { p.switchProject(pr.id, pr.myRole); }}
              className="rounded-2xl p-6 cursor-pointer transition hover:shadow-md"
              style={{ background: B.card, border: isOpen ? `2px solid ${B.gold}` : `1px solid ${B.line}` }}>
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="text-lg font-bold truncate" style={{ color: B.petrol }}>{pr.name}</div>
                  {pr.name_en && <div className="text-xs font-mono mt-1" style={{ color: B.muted }}>{pr.name_en}</div>}
                </div>
                <span className="text-xs px-3 py-1 rounded-full whitespace-nowrap" style={{ background: "#E8F0F5", color: B.petrolSoft, border: `1px solid ${B.petrolSoft}` }}>
                  {pr.status === "evaluating" ? "قيد التقييم" : pr.status === "completed" ? "مكتمل" : pr.status === "on_hold" ? "معلَّق" : "مسودة"}
                </span>
              </div>
              {isOpen && p.top && (
                <div className="grid grid-cols-3 gap-3 mt-5 text-center">
                  <div><div className="font-mono font-bold" style={{ color: B.goldText }}>{p.ranked.length}</div><div className="text-xs" style={{ color: B.muted }}>تركيبة مفعّلة</div></div>
                  <div><div className="font-mono font-bold" style={{ color: B.goldText }}>{p.top.adj.toFixed(1)}</div><div className="text-xs" style={{ color: B.muted }}>أعلى نتيجة</div></div>
                  <div><span className="text-xs px-3 py-1 rounded-full font-bold" style={roleInfo(pr.myRole).chip}>{roleInfo(pr.myRole).ar}</span></div>
                </div>
              )}
              {!isOpen && (
                <div className="mt-4 text-xs" style={{ color: B.muted }}>
                  دورك: <span className="font-bold px-2 py-0.5 rounded-full" style={roleInfo(pr.myRole).chip}>{roleInfo(pr.myRole).ar}</span>
                  <span className="mr-3">اضغط للفتح</span>
                </div>
              )}
            </div>
          );
        })}

        {!p.showNewProjectForm ? (
          <div onClick={() => p.setShowNewProjectForm(true)}
            className="rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition hover:shadow-md"
            style={{ border: `2px dashed ${B.line}`, color: B.muted }}>
            <div className="text-3xl mb-2">+</div>
            <div className="text-sm">مشروع جديد</div>
          </div>
        ) : (
          <Card>
            <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>مشروع جديد</div>
            <input value={p.npName} onChange={(e) => p.setNpName(e.target.value)} placeholder="اسم المشروع بالعربية..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none inp mb-2" />
            <input value={p.npNameEn} onChange={(e) => p.setNpNameEn(e.target.value)} placeholder="English name (optional)..." dir="ltr"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none inp mb-2" />
            <textarea value={p.npDesc} onChange={(e) => p.setNpDesc(e.target.value)} placeholder="وصف مختصر (اختياري)..." rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none inp mb-2 resize-y" />
            {p.myProjects.length > 0 && (
              <select value={p.npTemplateId} onChange={(e) => p.setNpTemplateId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none inp mb-3">
                <option value="">ابدأ فارغاً (بلا قالب)</option>
                {p.myProjects.map((pr) => <option key={pr.id} value={pr.id}>نسخ خدمات وشرائح ومعايير من: {pr.name}</option>)}
              </select>
            )}
            <div className="flex gap-2">
              <GoldBtn onClick={p.handleCreateProject} disabled={!p.npName.trim() || p.projectBusy}>{p.projectBusy ? "جارٍ الإنشاء…" : "إنشاء"}</GoldBtn>
              <button onClick={() => p.setShowNewProjectForm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: B.muted, border: `1px solid ${B.line}` }}>إلغاء</button>
            </div>
          </Card>
        )}
      </div>
      {p.currentProject && (
        <Card className="mt-6">
          <div className="font-bold mb-3 text-sm" style={{ color: B.petrol }}>آخر النشاطات — {p.currentProject.name} <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>Activity Feed</span></div>
          {p.audit.slice(0, 5).map((a, i) => (
            <div key={i} className="flex gap-3 items-start py-2 text-sm" style={{ borderBottom: i < 4 ? `1px solid ${B.lineSoft}` : "none" }}>
              <span className="text-xs font-mono whitespace-nowrap" style={{ color: B.muted }}>{a.ts}</span>
              <span className="whitespace-nowrap font-bold" style={{ color: B.goldText }}>{a.action}</span>
              <span style={{ color: B.petrol }}>{a.detail}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

const ONBOARDING_STEPS = [
  { screen: "library", icon: "📚", title: "أضف الخدمات والشرائح", desc: "المتغيران الأساسيان اللذان تُبنى منهما كل التركيبات" },
  { screen: "criteria", icon: "⚖️", title: "حدّد معايير التقييم وأوزانها", desc: "مباشرة أو عبر المقارنات الزوجية (AHP)" },
  { screen: "combos", icon: "🔀", title: "ولّد التركيبات وفعّل ما يستحق", desc: "تُتولَّد تلقائياً من الخدمات × الشرائح" },
  { screen: "scoring", icon: "📝", title: "قيّم كل تركيبة بالدليل والثقة", desc: "درجة 1–9 لكل معيار مع سبب الدرجة" },
  { screen: "decision", icon: "✅", title: "راجع التوصيات والقرار", desc: "تصنيف تلقائي: ابدأ الآن / أجّل / استبعد" },
];

const OnboardingGuide = (p) => {
  const isEmpty = p.services.length === 0 && p.segments.length === 0 && p.criteria.length === 0;
  const [dismissed, setDismissed] = useState(false);
  if (!isEmpty || dismissed) return null;
  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: B.card, border: `2px dashed ${B.gold}` }}>
      <div className="flex justify-between items-start mb-3">
        <div className="font-bold text-sm" style={{ color: B.petrol }}>دليل البدء السريع <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>Quick Start</span></div>
        <button onClick={() => setDismissed(true)} className="text-xs" style={{ color: B.muted }}>إخفاء ✕</button>
      </div>
      <div className="text-xs mb-4" style={{ color: B.muted }}>هذا مشروع جديد فارغ — اتّبع الخطوات بالترتيب للوصول لأول توصية:</div>
      <div className="grid md:grid-cols-5 gap-2">
        {ONBOARDING_STEPS.map((s, i) => (
          <button key={s.screen} onClick={() => p.setScreen(s.screen)}
            className="text-right rounded-xl p-3 transition hover:shadow-md" style={{ background: B.sand, border: `1px solid ${B.line}` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-mono font-bold" style={{ color: B.goldText }}>{i + 1}</span>
              <span>{s.icon}</span>
            </div>
            <div className="text-xs font-bold mb-1" style={{ color: B.petrol }}>{s.title}</div>
            <div className="text-xs" style={{ color: B.muted }}>{s.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

const Dashboard = (p) => {
  const hasStructure = p.services.length > 0 && p.segments.length > 0;
  const hasCombos = p.ranked.length > 0;
  return (
  <div>
    <H ar="لوحة القرار" en="Decision Dashboard" sub={p.currentProject?.name || "برنامج إدارة المشروعات للقادة"} />
    <OnboardingGuide {...p} />
    {hasStructure && !hasCombos && (
      <div className="rounded-2xl p-6 mb-6 text-center" style={{ background: B.card, border: `2px dashed ${B.petrolSoft}` }}>
        <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>لا توجد تركيبات مفعّلة بعد</div>
        <div className="text-xs mb-3" style={{ color: B.muted }}>لديك خدمات وشرائح جاهزة — اذهب للتركيبات وفعّل ما يستحق التقييم لتظهر النتائج هنا</div>
        <GoldBtn onClick={() => p.setScreen("combos")}>الذهاب إلى التركيبات ←</GoldBtn>
      </div>
    )}
    {p.top && (
      <div className="rounded-2xl p-6 mb-6" style={{ background: B.petrol, border: `2px solid ${B.gold}` }}>
        <div className="text-xs tracking-widest font-mono mb-2" style={{ color: B.gold }}>TOP RECOMMENDATION</div>
        <div className="text-2xl font-bold" style={{ color: B.sand }}>{p.top.name}</div>
        <div className="flex flex-wrap gap-6 mt-4 text-sm">
          <div><span style={{ color: "#9FB2BD" }}>النتيجة المرجحة: </span><span className="font-mono font-bold" style={{ color: B.gold }}>{p.top.raw.toFixed(1)}</span></div>
          <div><span style={{ color: "#9FB2BD" }}>بعد تعديل الثقة: </span><span className="font-mono font-bold" style={{ color: "#7FD1AE" }}>{p.top.adj.toFixed(1)}</span></div>
          <div><span style={{ color: "#9FB2BD" }}>مؤشر الثقة: </span><span className="font-mono font-bold" style={{ color: B.sand }}>{p.confIdx}%</span></div>
          <div><span style={{ color: "#9FB2BD" }}>المخاطر: </span><span className="font-mono font-bold" style={{ color: B.sand }}>{p.top.risk}/9</span></div>
          <div><span className="font-bold" style={{ color: "#7FD1AE" }}>{BUCKETS[p.top.bucket].ar}</span></div>
        </div>
      </div>
    )}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Stat label="الخدمات" value={p.services.length} />
      <Stat label="الشرائح المستهدفة" value={p.segments.length} />
      <Stat label="تركيبات مفعّلة" value={`${p.ranked.length} / ${p.services.length * p.segments.length}`} />
      <Stat label="مجموع الأوزان" value={`${p.totalW}%`} alert={p.totalW !== 100} />
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>ترتيب الفرص <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>Ranking</span></div>
        <div dir="ltr" style={{ height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={p.ranked.map((r) => ({ name: r.name, v: +r.adj.toFixed(1) }))} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid stroke={B.lineSoft} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: B.muted, fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fill: B.petrol, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${B.line}`, direction: "rtl", color: B.petrol }} />
              <Bar dataKey="v" radius={[0, 6, 6, 0]}>
                {p.ranked.map((r, i) => <Cell key={i} fill={i === 0 ? B.gold : BUCKETS[r.bucket].color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>مصفوفة الفرص والمخاطر <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>Opportunity × Risk</span></div>
        <div dir="ltr" style={{ height: 340 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid stroke={B.lineSoft} />
              <XAxis type="number" dataKey="risk" name="المخاطر" domain={[0, 9]} tick={{ fill: B.muted, fontSize: 11 }} label={{ value: "Risk →", position: "insideBottomRight", fill: B.muted, fontSize: 11 }} />
              <YAxis type="number" dataKey="adj" name="النتيجة" domain={[40, 100]} tick={{ fill: B.muted, fontSize: 11 }} label={{ value: "Score", angle: -90, position: "insideLeft", fill: B.muted, fontSize: 11 }} />
              <ReferenceLine x={5} stroke={B.line} strokeDasharray="4 4" />
              <ReferenceLine y={68} stroke={B.line} strokeDasharray="4 4" />
              <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${B.line}`, direction: "rtl", color: B.petrol }} formatter={(v) => (v.toFixed ? v.toFixed(1) : v)} labelFormatter={() => ""} />
              <Scatter data={p.ranked.map((r) => ({ ...r, adj: +r.adj.toFixed(1) }))} shape="circle">
                {p.ranked.map((r, i) => <Cell key={i} fill={i === 0 ? B.gold : B.petrolSoft} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs" style={{ color: B.muted }}>الربع الأعلى يساراً = فرصة عالية بمخاطر منخفضة (المنطقة الذهبية)</div>
      </Card>
    </div>
  </div>
  );
};

const Library = (p) => {
  const [editing, setEditing] = useState(null); // "S3" أو null
  const [editVal, setEditVal] = useState("");
  return (
  <div>
    <H ar="مكتبة الخدمات والشرائح" en="Service Library & Segments" sub="المتغيران الأساسيان اللذان تتولد منهما جميع التركيبات" />
    {!p.can.structure && <Locked role={p.role} />}
    <div className="grid md:grid-cols-2 gap-4">
      {[
        { title: "نماذج الخدمة", en: "Service Models", items: p.services, set: p.setServices, val: p.newSvc, setVal: p.setNewSvc, prefix: "S" },
        { title: "الشرائح المستهدفة", en: "Customer Segments", items: p.segments, set: p.setSegments, val: p.newSeg, setVal: p.setNewSeg, prefix: "C" },
      ].map((sec) => (
        <Card key={sec.prefix}>
          <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>{sec.title} <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>{sec.en}</span></div>
          {sec.items.map((it, idx) => (
            <div key={it.id} className="flex justify-between items-center py-2 text-sm gap-2" style={{ borderBottom: idx < sec.items.length - 1 ? `1px solid ${B.lineSoft}` : "none", color: B.petrol }}>
              {editing === it.id ? (
                <>
                  <input value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                    className="flex-1 rounded-lg px-2 py-1 text-sm outline-none inp" />
                  <button onClick={() => {
                    if (!editVal.trim()) return;
                    sec.set((arr) => arr.map((x) => x.id === it.id ? { ...x, ar: editVal.trim() } : x));
                    p.log("تعديل", `${sec.title}: ${it.ar} ← ${editVal.trim()}`);
                    setEditing(null);
                  }} className="text-xs px-2 py-1 rounded-lg" style={{ background: B.gold, color: B.petrol }}>حفظ</button>
                  <button onClick={() => setEditing(null)} className="text-xs px-2 py-1" style={{ color: B.muted }}>إلغاء</button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0 truncate"><span className="font-mono text-xs ml-2" style={{ color: B.muted }}>{it.id}</span>{it.ar}</div>
                  <span className="text-xs font-mono shrink-0" style={{ color: B.muted }}>{it.en}</span>
                  {p.can.structure && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditing(it.id); setEditVal(it.ar); }} className="text-xs px-1.5" style={{ color: B.petrolSoft }}>✎</button>
                      <button onClick={() => {
                        if (!window.confirm(`حذف "${it.ar}"؟ سيُحذف معه أي تركيبات وتقييمات مرتبطة به.`)) return;
                        sec.set((arr) => arr.filter((x) => x.id !== it.id));
                        p.log("حذف", `${sec.title}: ${it.ar}`);
                      }} className="text-xs px-1.5" style={{ color: B.bad }}>🗑</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {p.can.structure && (
            <div className="flex gap-2 mt-3">
              <input value={sec.val} onChange={(e) => sec.setVal(e.target.value)} placeholder="إضافة عنصر جديد..."
                className="flex-1 rounded-lg px-3 py-2 text-sm outline-none inp" />
              <GoldBtn onClick={() => {
                if (!sec.val.trim()) return;
                const id = sec.prefix + (sec.items.length + 1);
                sec.set((arr) => [...arr, { id, ar: sec.val.trim(), en: "" }]);
                p.log("إضافة", `${sec.title}: ${sec.val.trim()}`);
                sec.setVal("");
              }}>إضافة</GoldBtn>
            </div>
          )}
        </Card>
      ))}
    </div>
  </div>
  );
};

const Combos = (p) => {
  if (p.services.length === 0 || p.segments.length === 0) {
    return (
      <div>
        <H ar="مولّد التركيبات" en="Combination Generator" sub="تحتاج خدمة واحدة وشريحة واحدة على الأقل لتوليد أي تركيبة" />
        <div className="rounded-2xl p-6 text-center" style={{ background: B.card, border: `2px dashed ${B.petrolSoft}` }}>
          <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>لا توجد خدمات أو شرائح بعد</div>
          <div className="text-xs mb-3" style={{ color: B.muted }}>أضف خدمة واحدة على الأقل وشريحة واحدة على الأقل أولاً</div>
          <GoldBtn onClick={() => p.setScreen("library")}>الذهاب إلى الخدمات والشرائح ←</GoldBtn>
        </div>
      </div>
    );
  }
  return (
  <div>
    <H ar="مولّد التركيبات" en="Combination Generator" sub={`${p.services.length} خدمات × ${p.segments.length} شرائح = ${p.services.length * p.segments.length} تركيبة ممكنة`} />
    {!p.can.structure && p.comboMode === "toggle" && <Locked role={p.role} />}
    <div className="flex flex-wrap gap-2 mb-4">
      {[["toggle", "تفعيل / استبعاد"], ["edit", "تحرير الدرجات ✎"]].map(([k, t]) => (
        <button key={k} onClick={() => p.setComboMode(k)}
          className="px-4 py-2.5 rounded-lg text-sm font-bold transition"
          style={p.comboMode === k ? { background: B.gold, color: B.petrol } : { background: "#fff", border: `1px solid ${B.line}`, color: B.petrol }}>{t}</button>
      ))}
    </div>
    <Card className="overflow-x-auto p-3 sm:p-5">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-2 text-right font-normal sticky right-0 z-10" style={{ color: B.muted, background: B.card }}>الخدمة \ الشريحة</th>
            {p.segments.map((sg) => <th key={sg.id} className="p-2 font-normal whitespace-nowrap" style={{ color: B.muted }}>{sg.ar}</th>)}
          </tr>
        </thead>
        <tbody>
          {p.services.map((sv) => (
            <tr key={sv.id} style={{ borderTop: `1px solid ${B.lineSoft}` }}>
              <td className="p-2 font-bold whitespace-nowrap sticky right-0 z-10" style={{ color: B.petrol, background: B.card }}>{sv.ar}</td>
              {p.segments.map((sg) => {
                const key = `${sv.id}|${sg.id}`;
                const ev = p.evals[key];
                const isUnscored = ev && ev.scores.every((s) => s === 5) && Object.keys(ev.evidence).length === 0;
                const sc = ev ? calcScore(ev, p.criteria).adj : null;
                const clickable = p.comboMode === "toggle" ? p.can.structure : !!ev;
                return (
                  <td key={sg.id} className="p-1 text-center">
                    <button
                      onClick={() => {
                        if (p.comboMode === "toggle") p.toggleCombo(key);
                        else if (ev) { p.setSelCombo(key); p.setScreen("scoring"); }
                      }}
                      disabled={!clickable}
                      title={isUnscored ? "لم يُقيَّم بعد — اضغط لإدخال التقييم" : ""}
                      className={`w-14 h-11 rounded-lg text-sm font-mono transition ${clickable ? "cursor-pointer" : "cursor-default"}`}
                      style={ev
                        ? (isUnscored
                          ? { border: `1px dashed ${B.petrolSoft}`, background: "#F0F5F7", color: B.petrolSoft, fontWeight: 700 }
                          : p.comboMode === "edit"
                          ? { border: `1px solid ${B.gold}`, background: B.goldSoft, color: B.goldText, fontWeight: 700 }
                          : { border: `1px solid ${B.ok}`, background: "#E4F2EA", color: B.ok, fontWeight: 700 })
                        : { border: `1px dashed ${B.line}`, color: "#B9B29E", background: "#fff" }}>
                      {ev ? (isUnscored ? "؟" : (p.comboMode === "edit" ? `${sc.toFixed(0)} ✎` : sc.toFixed(0))) : "—"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs mt-3" style={{ color: B.muted }}>
        {p.comboMode === "toggle"
          ? "اضغط أي خلية للتفعيل أو الاستبعاد · الرقم = النتيجة المعدّلة بالثقة · ؟ = لم يُقيَّم بعد"
          : "اضغط أي تركيبة مفعّلة للانتقال مباشرة إلى مصفوفة التقييم وتعديل درجاتها"}
      </div>
    </Card>
  </div>
  );
};

const Criteria = (p) => {
  const [mode, setMode] = useState("direct");
  const pairCount = (p.criteria.length * (p.criteria.length - 1)) / 2;
  return (
    <div>
      <H ar="المعايير والأوزان" en="Criteria & Weights" sub="الأوزان مضبوطة وفق منهجية GE-McKinsey: جاذبية السوق ≈ 50% والقدرة على الفوز ≈ 50%" />
      {!p.can.weights && <Locked role={p.role} />}
      <div className="flex flex-wrap gap-2 mb-4">
        {[["direct", "الأوزان المباشرة"], ["ahp", `المقارنات الزوجية AHP (${pairCount})`]].map(([k, t]) => (
          <button key={k} onClick={() => setMode(k)}
            className="px-4 py-2 rounded-lg text-sm font-bold transition"
            style={mode === k ? { background: B.gold, color: B.petrol } : { background: "#fff", border: `1px solid ${B.line}`, color: B.petrol }}>{t}</button>
        ))}
      </div>
      {mode === "direct" && (
        <Card>
          <div className="text-sm font-bold mb-4" style={{ color: p.totalW === 100 ? B.ok : B.bad }}>
            مجموع الأوزان: <span className="font-mono">{p.totalW}%</span> {p.totalW !== 100 && "⚠️ يجب أن يساوي 100%"}
            {p.totalW !== 100 && p.can.weights && (
              <button onClick={p.normalizeW} className="mr-3 px-3 py-1 rounded-lg text-xs font-bold" style={{ background: B.gold, color: B.petrol }}>موازنة تلقائية</button>
            )}
          </div>
          {p.criteria.map((cr, i) => (
            <div key={cr.id} className="grid grid-cols-12 gap-2 items-center py-2" style={{ borderBottom: i < p.criteria.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
              <div className="col-span-4 text-sm" style={{ color: B.petrol }}>{cr.ar}<div className="text-xs font-mono" style={{ color: B.muted }}>{cr.en}</div></div>
              <div className="col-span-2 text-xs hidden md:block" style={{ color: B.muted }}>{cr.g}</div>
              <div className="col-span-4 md:col-span-3">
                <input type="range" min={0} max={60} value={cr.w} disabled={!p.can.weights}
                  onChange={(e) => p.setWeight(i, +e.target.value)} className="w-full" style={{ accentColor: B.gold }} />
              </div>
              <div className="col-span-2 flex items-center gap-1">
                <input type="number" min={0} max={100} value={cr.w} disabled={!p.can.weights}
                  onChange={(e) => p.setWeight(i, Math.max(0, Math.min(100, +e.target.value || 0)))}
                  className="w-14 rounded-lg px-1 py-1 text-center font-mono font-bold text-sm outline-none inp" style={{ color: B.goldText }} />
                <span className="text-xs" style={{ color: B.muted }}>%</span>
              </div>
              <div className="col-span-2 md:col-span-1 text-left">
                {p.can.weights && (
                  <button onClick={() => {
                    if (!window.confirm(`حذف معيار "${cr.ar}"؟ ستُحذف معه كل الدرجات المرتبطة به في التقييمات.`)) return;
                    p.removeCriterion(cr.id);
                  }} className="text-xs px-1.5" style={{ color: B.bad }}>🗑</button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
      {mode === "ahp" && (
        <Card>
          {p.criteria.length < 2 ? (
            <div className="text-center py-4">
              <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>تحتاج معيارين على الأقل</div>
              <div className="text-xs" style={{ color: B.muted }}>أضف معياراً آخر من الأسفل لتتمكن من استخدام المقارنات الزوجية</div>
            </div>
          ) : (
          <>
          <div className="text-xs mb-4" style={{ color: B.muted }}>
            لكل زوج من المعايير، حدّد أيهما أهم وبأي درجة وفق المقياس القياسي (Saaty Scale)، ثم اضغط "تطبيق الأوزان المحسوبة".
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto pl-1">
            {p.criteria.map((a, i) => p.criteria.map((b, j) => {
              if (i >= j) return null;
              const key = `${i}-${j}`;
              return (
                <div key={key} className="pb-3" style={{ borderBottom: `1px solid ${B.lineSoft}` }}>
                  <div className="text-xs mb-1.5" style={{ color: B.petrol }}>
                    <span className="font-bold">{a.ar}</span> <span style={{ color: B.muted }}>مقابل</span> <span className="font-bold">{b.ar}</span>
                  </div>
                  <select value={p.ahpPairs[key] ?? 1} onChange={(e) => p.setAhpPair(key, +e.target.value)}
                    disabled={!p.can.weights}
                    className="w-full rounded-lg px-3 py-2 text-xs outline-none inp">
                    {SAATY.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </div>
              );
            }))}
          </div>
          {p.can.weights && (
            <GoldBtn onClick={() => p.applyAHP(computeAHPWeights(p.criteria, p.ahpPairs))} className="w-full py-2.5 mt-4">
              تطبيق الأوزان المحسوبة على معايير التقييم
            </GoldBtn>
          )}
          </>
          )}
        </Card>
      )}
      <Card className="mt-4 text-sm" style={{ color: B.muted }}>
        <span className="font-bold" style={{ color: B.goldText }}>المنهجية: </span>
        توزيع مباشر بالنسب المئوية أو مقارنات زوجية وفق AHP، مع تعديل النتائج بمستوى الثقة (Confidence-Adjusted Scoring) عند التقييم.
      </Card>
      {p.can.weights && (
        <Card className="mt-4">
          <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>إضافة معيار جديد</div>
          <div className="flex flex-wrap gap-2">
            <input value={p.newCrit} onChange={(e) => p.setNewCrit(e.target.value)} placeholder="اسم المعيار بالعربية..."
              className="flex-1 min-w-40 rounded-lg px-3 py-2 text-sm outline-none inp" />
            <GoldBtn onClick={() => {
              if (!p.newCrit.trim()) return;
              p.addCriterion(p.newCrit.trim());
              p.setNewCrit("");
            }}>إضافة</GoldBtn>
          </div>
        </Card>
      )}
    </div>
  );
};

const Scoring = (p) => {
  const ev = p.evals[p.selCombo];
  const sc = ev ? calcScore(ev, p.criteria) : null;
  return (
    <div>
      <H ar="مصفوفة التقييم" en="Scoring Matrix" sub="درجات 1–9 مع الدليل ومستوى الثقة لكل تقييم" />
      {!p.can.score && <Locked role={p.role} />}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select value={p.selCombo} onChange={(e) => p.setSelCombo(e.target.value)} className="w-full sm:w-auto rounded-lg px-4 py-2.5 text-sm outline-none inp">
          {Object.keys(p.evals).map((k) => <option key={k} value={k}>{p.comboName(k)}</option>)}
        </select>
        {sc && (
          <div className="text-sm" style={{ color: B.petrol }}>
            <span style={{ color: B.muted }}>النتيجة: </span><span className="font-mono font-bold" style={{ color: B.goldText }}>{sc.raw.toFixed(1)}</span>
            <span style={{ color: B.muted }} className="mr-3"> بعد الثقة: </span><span className="font-mono font-bold" style={{ color: B.ok }}>{sc.adj.toFixed(1)}</span>
          </div>
        )}
      </div>
      {ev && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ color: B.muted, borderBottom: `1px solid ${B.line}` }}>
                <th className="p-2 text-right font-normal">المعيار</th>
                <th className="p-2 font-normal">الوزن</th>
                <th className="p-2 font-normal">الدرجة</th>
                <th className="p-2 font-normal">المساهمة</th>
                <th className="p-2 font-normal">الثقة</th>
                <th className="p-2 text-right font-normal">الدليل / المرجع</th>
              </tr>
            </thead>
            <tbody>
              {p.criteria.map((cr, i) => {
                const denom = p.criteria.reduce((s, c, j) => s + c.w * ev.scores[j], 0) || 1;
                const contrib = ((cr.w * ev.scores[i]) / denom) * 100;
                return (
                  <tr key={cr.id} style={{ borderBottom: i < p.criteria.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
                    <td className="p-2 whitespace-nowrap" style={{ color: B.petrol }}>{cr.ar}</td>
                    <td className="p-2 text-center font-mono" style={{ color: B.muted }}>{cr.w}%</td>
                    <td className="p-2 text-center">
                      <select value={ev.scores[i]} disabled={!p.can.score} onChange={(e) => p.setScore(p.selCombo, i, +e.target.value)}
                        className="rounded-lg px-2 py-1 font-mono font-bold outline-none"
                        style={{ ...scoreStyle(ev.scores[i]), border: `1px solid ${B.line}` }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-center font-mono text-xs" style={{ color: B.muted }}>{contrib.toFixed(0)}%</td>
                    <td className="p-2 text-center">
                      <select value={ev.conf[i]} disabled={!p.can.score} onChange={(e) => p.setConf(p.selCombo, i, e.target.value)}
                        className="rounded-lg px-2 py-1 text-xs outline-none"
                        style={{ color: CONF[ev.conf[i]].color, background: "#fff", border: `1px solid ${B.line}`, fontWeight: 700 }}>
                        {Object.entries(CONF).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
                      </select>
                    </td>
                    <td className="p-2 min-w-64">
                      <textarea value={ev.evidence[cr.id] || ""} disabled={!p.can.score} placeholder="اكتب الدليل الذي يبرر هذه الدرجة..." rows={2}
                        onChange={(e) => p.setEvidence(p.selCombo, cr.id, e.target.value)}
                        className="w-full rounded-lg px-3 py-1.5 text-xs outline-none inp resize-y leading-relaxed" style={{ minHeight: 40 }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

const Risk = (p) => (
  <div>
    <H ar="تقييم المخاطر" en="Risk Assessment" sub="درجة مخاطر مستقلة عن الفرصة لكل تركيبة (1 = آمنة، 9 = عالية الخطورة)" />
    {!p.can.risk && <Locked role={p.role} />}
    <div className="grid md:grid-cols-2 gap-4">
      {p.ranked.map((r) => (
        <Card key={r.key}>
          <div className="flex justify-between items-center">
            <div className="font-bold text-sm" style={{ color: B.petrol }}>{r.name}</div>
            <span className="font-mono font-bold" style={{ color: r.risk <= 4 ? B.ok : r.risk <= 6 ? B.warn : B.bad }}>{r.risk}/9</span>
          </div>
          <input type="range" min={1} max={9} value={r.risk} disabled={!p.can.risk}
            onChange={(e) => p.setRisk(r.key, +e.target.value)} className="w-full mt-3" style={{ accentColor: B.gold }} />
          <div className="text-xs mt-2" style={{ color: B.muted }}>{r.ev.riskNote || "لم يُسجّل وصف للمخاطر"}</div>
        </Card>
      ))}
    </div>
  </div>
);

const Analysis = (p) => {
  const scored = useMemo(() => p.ranked.filter((r) => !r.isUnscored), [p.ranked]);
  const excludedCount = p.ranked.length - scored.length;
  const scenRank = useMemo(() => {
    const out = {};
    Object.entries(SCENARIOS).forEach(([k, s]) => {
      const w = scenWeights(p.criteria, s.mult);
      out[k] = scored.map((r) => ({ key: r.key, name: r.name, adj: calcScore(r.ev, w).adj })).sort((a, b) => b.adj - a.adj);
    });
    return out;
  }, [scored, p.criteria]);
  return (
    <div>
      <H ar="التحليل والسيناريوهات" en="Sensitivity · Scenarios · Monte Carlo" sub={excludedCount > 0 ? `اختبار استقرار القرار عند تغيّر الافتراضات — تم استبعاد ${excludedCount} تركيبة غير مُقيَّمة بعد من هذا التحليل` : "اختبار استقرار القرار عند تغيّر الافتراضات"} />
      <div className="flex gap-2 mb-4">
        {[["scen", "السيناريوهات الثلاثة"], ["mc", "محاكاة Monte Carlo"]].map(([k, t]) => (
          <button key={k} onClick={() => p.setAnTab(k)}
            className="px-4 py-2 rounded-lg text-sm font-bold"
            style={p.anTab === k ? { background: B.gold, color: B.petrol } : { background: "#fff", border: `1px solid ${B.line}`, color: B.petrol }}>{t}</button>
        ))}
      </div>
      {p.anTab === "scen" && (
        <div className="grid lg:grid-cols-3 gap-4">
          {Object.entries(SCENARIOS).map(([k, s]) => (
            <Card key={k} style={k === "expected" ? { border: `2px solid ${B.gold}` } : {}}>
              <div className="font-bold" style={{ color: B.petrol }}>{s.ar} <span className="text-xs font-mono mr-1" style={{ color: B.goldText }}>{s.en}</span></div>
              <div className="text-xs mt-1 mb-3" style={{ color: B.muted }}>{s.desc}</div>
              {scenRank[k].slice(0, 5).map((r, i) => (
                <div key={r.key} className="flex justify-between py-1.5 text-sm" style={{ borderBottom: i < 4 ? `1px solid ${B.lineSoft}` : "none", color: B.petrol }}>
                  <div><span className="font-mono ml-2" style={{ color: B.goldText }}>{i + 1}</span>{r.name}</div>
                  <span className="font-mono" style={{ color: B.muted }}>{r.adj.toFixed(1)}</span>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
      {p.anTab === "mc" && (
        <Card>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <GoldBtn disabled={!p.can.analyze || scored.length === 0} onClick={() => { p.setMc(runMonteCarlo(scored, p.criteria)); p.log("محاكاة", "تشغيل Monte Carlo — 1000 تكرار"); }} className="px-5 py-2.5">
              ▶ تشغيل المحاكاة (1000 تكرار)
            </GoldBtn>
            <div className="text-xs" style={{ color: B.muted }}>تُضاف عشوائية لكل درجة حسب مستوى الثقة، ثم يُقاس تكرار ظهور كل تركيبة ضمن أفضل 3</div>
          </div>
          {p.mc && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ color: B.muted, borderBottom: `1px solid ${B.line}` }}>
                  <th className="p-2 text-right font-normal">التركيبة</th>
                  <th className="p-2 font-normal">متوسط النتيجة</th>
                  <th className="p-2 font-normal">المدى</th>
                  <th className="p-2 font-normal">ضمن أفضل 3</th>
                  <th className="p-2 font-normal">الاستقرار</th>
                </tr>
              </thead>
              <tbody>
                {p.mc.map((r, idx) => (
                  <tr key={r.key} style={{ borderBottom: idx < p.mc.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
                    <td className="p-2" style={{ color: B.petrol }}>{r.name}</td>
                    <td className="p-2 text-center font-mono" style={{ color: B.petrol }}>{r.avg.toFixed(1)}</td>
                    <td className="p-2 text-center font-mono text-xs" style={{ color: B.muted }}>{r.min.toFixed(0)}–{r.max.toFixed(0)}</td>
                    <td className="p-2 text-center font-mono font-bold" style={{ color: B.goldText }}>{r.top3.toFixed(0)}%</td>
                    <td className="p-2 text-center">
                      <span className="text-xs px-2 py-1 rounded-full"
                        style={r.top3 >= 80 ? { background: "#E4F2EA", color: B.ok } : r.top3 >= 40 ? { background: "#F7EDD8", color: B.warn } : { background: B.lineSoft, color: B.muted }}>
                        {r.top3 >= 80 ? "مستقر" : r.top3 >= 40 ? "متأرجح" : "خارج المنافسة"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
};

const Decision = (p) => {
  const groups = { launch: [], next: [], defer: [], exclude: [], unscored: [] };
  p.ranked.forEach((r) => groups[r.bucket].push(r));
  const rationale = (r) => {
    const tops = p.criteria.map((c, i) => ({ ar: c.ar, v: c.w * r.ev.scores[i] })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.ar);
    return `أقوى محركات النتيجة: ${tops.join("، ")}.`;
  };
  return (
    <div id="decision-print-area">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-2 print-hide">
        <div></div>
        <GoldBtn onClick={() => window.print()}>⬇ تصدير PDF</GoldBtn>
      </div>
      <div className="hidden print-only mb-4">
        <div style={{ color: B.petrol, fontWeight: 900, fontSize: "1.1rem" }}>SSPDF — {p.currentProject?.name || "برنامج إدارة المشروعات للقادة"}</div>
        <div style={{ color: B.muted, fontSize: "0.75rem" }}>تقرير القرار والتوصيات — {new Date().toLocaleDateString("ar-SA")}</div>
      </div>
      <H ar="القرار والتوصيات" en="Decision & Recommendations" sub="تصنيف تلقائي وفق النتيجة المعدّلة بالثقة ودرجة المخاطر" />
      {Object.entries(BUCKETS).map(([k, b]) => (
        <div key={k} className="mb-5">
          <div className="text-sm font-bold mb-2" style={{ color: b.color }}>● {b.ar} <span className="font-normal" style={{ color: B.muted }}>({groups[k].length})</span></div>
          {groups[k].length === 0 && <div className="text-xs mr-4" style={{ color: B.muted }}>لا توجد تركيبات في هذه الفئة</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {groups[k].map((r) => (
              <Card key={r.key} style={{ borderRight: `4px solid ${b.color}` }}>
                <div className="flex justify-between">
                  <div className="font-bold text-sm" style={{ color: B.petrol }}>{r.name}</div>
                  <span className="font-mono text-sm font-bold" style={{ color: B.goldText }}>{r.adj.toFixed(1)}</span>
                </div>
                <div className="text-xs mt-2" style={{ color: B.muted }}>{r.isUnscored ? "لم يُدخَل أي تقييم بعد — النتيجة افتراضية غير حقيقية." : rationale(r)}</div>
                <div className="text-xs mt-1" style={{ color: B.muted }}>المخاطر: {r.risk}/9 · مؤشر الثقة: {Math.round((r.adj / r.raw) * 100)}%</div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const Audit = (p) => (
  <div>
    <H ar="سجل التدقيق" en="Decision Audit Trail" sub="توثيق كامل: من فعل ماذا ومتى — يُحفظ دائماً في قاعدة البيانات بعد الربط" />
    <Card>
      {p.audit.map((a, i) => (
        <div key={i} className="flex gap-4 items-start py-3" style={{ borderBottom: i < p.audit.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
          <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: B.gold }}></div>
          <div className="flex-1">
            <div className="text-sm" style={{ color: B.petrol }}><span className="font-bold">{a.user}</span> <span style={{ color: B.goldText }}>— {a.action}</span></div>
            <div className="text-sm mt-0.5" style={{ color: B.petrol }}>{a.detail}</div>
            <div className="text-xs font-mono mt-1" style={{ color: B.muted }}>{a.ts}</div>
          </div>
        </div>
      ))}
    </Card>
  </div>
);

const Team = (p) => (
  <div>
    <H ar="الفريق والصلاحيات" en="Team & Roles" sub="أربعة أدوار: مدير النظام، مقيّم، محلل، مشاهد" />
    {!p.can.team && <Locked role={p.role} />}
    <Card>
      {p.team.map((m, idx) => (
        <div key={m.id} className="flex justify-between items-center py-3" style={{ borderBottom: idx < p.team.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: B.goldSoft, color: B.goldText, border: `1px solid ${B.line}` }}>{(m.name || m.email || "?")[0]?.toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: B.petrol }}>{m.name || m.email}</div>
              {m.email && <div className="text-xs font-mono truncate" style={{ color: B.muted }}>{m.email}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap" style={roleInfo(m.role).chip}>{roleInfo(m.role).ar}</span>
            {p.repoActive !== false && (
              <span className="text-xs" title={m.linked ? "مرتبط بحساب فعلي" : "بانتظار أول تسجيل دخول"}>{m.linked ? "🟢" : "⏳"}</span>
            )}
            {p.can.team && (
              <button onClick={() => p.removeTeamMember(m)} title="حذف العضو"
                className="text-sm px-2 py-1 rounded-lg" style={{ color: B.bad, border: `1px solid ${B.line}` }}>🗑</button>
            )}
          </div>
        </div>
      ))}
      {p.can.team && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <input value={p.newMemberEmail} onChange={(e) => p.setNewMemberEmail(e.target.value)} placeholder="بريد العضو الإلكتروني..."
              type="email" dir="ltr" style={{ textAlign: "right" }}
              className="flex-1 min-w-40 rounded-lg px-3 py-2 text-sm outline-none inp" />
            <select value={p.newMemberRole} onChange={(e) => p.setNewMemberRole(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none inp">
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
            </select>
            <GoldBtn onClick={() => {
              if (!p.newMemberEmail.trim() || !p.newMemberEmail.includes("@")) { p.setTeamError("أدخل بريداً إلكترونياً صحيحاً"); return; }
              p.addTeamMember(p.newMemberEmail.trim(), p.newMemberRole, "");
              p.setNewMemberEmail("");
            }}>إضافة</GoldBtn>
          </div>
          {p.teamError && <div className="text-xs mt-2" style={{ color: B.bad }}>{p.teamError}</div>}
          <div className="text-xs mt-2" style={{ color: B.muted }}>
            🟢 عضو فعّال بالفعل · ⏳ سيُفعَّل تلقائياً فور أول تسجيل دخول له بنفس هذا البريد
          </div>
        </div>
      )}
    </Card>
    <Card className="mt-4">
      <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>مصفوفة الصلاحيات</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: B.muted, borderBottom: `1px solid ${B.line}` }}>
              <th className="p-2 text-right font-normal">الصلاحية</th>
              {Object.values(ROLES).map((r) => <th key={r.ar} className="p-2 font-normal">{r.ar}</th>)}
            </tr>
          </thead>
          <tbody>
            {[["structure", "إدارة الخدمات والتركيبات"], ["weights", "ضبط المعايير والأوزان"], ["score", "التقييم والأدلة"], ["risk", "تقييم المخاطر"], ["analyze", "تشغيل التحليلات"], ["team", "إدارة الفريق"]].map(([k, t], idx, arr) => (
              <tr key={k} style={{ borderBottom: idx < arr.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
                <td className="p-2" style={{ color: B.petrol }}>{t}</td>
                {Object.values(ROLES).map((r) => <td key={r.ar} className="p-2 text-center">{r.can[k] ? "✅" : "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  </div>
);

const Compare = (p) => {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!p.repoActive || !p.myProjects.length) return;
    p.compareAllProjects().then(setStats);
  }, [p.myProjects.length]);
  return (
    <div>
      <H ar="مقارنة المشاريع" en="Projects Comparison" sub="نظرة سريعة على كل مشاريعك جنباً إلى جنب" />
      {!p.repoActive && <Locked role={p.role} />}
      {p.repoActive && !stats && <div className="text-sm" style={{ color: B.muted }}>جارٍ التحميل…</div>}
      {stats && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ color: B.muted, borderBottom: `1px solid ${B.line}` }}>
                <th className="p-2 text-right font-normal">المشروع</th>
                <th className="p-2 font-normal">الخدمات</th>
                <th className="p-2 font-normal">الشرائح</th>
                <th className="p-2 font-normal">المعايير</th>
                <th className="p-2 font-normal">تركيبات مفعّلة</th>
                <th className="p-2 font-normal">آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              {p.myProjects.map((pr, idx) => {
                const s = stats.find((x) => x.id === pr.id) || {};
                return (
                  <tr key={pr.id} style={{ borderBottom: idx < p.myProjects.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
                    <td className="p-2 font-bold" style={{ color: B.petrol }}>{pr.name}</td>
                    <td className="p-2 text-center font-mono" style={{ color: B.muted }}>{s.services ?? "—"}</td>
                    <td className="p-2 text-center font-mono" style={{ color: B.muted }}>{s.segments ?? "—"}</td>
                    <td className="p-2 text-center font-mono" style={{ color: B.muted }}>{s.criteria ?? "—"}</td>
                    <td className="p-2 text-center font-mono font-bold" style={{ color: B.goldText }}>{s.activeCombos ?? "—"} / {s.combos ?? "—"}</td>
                    <td className="p-2 text-center text-xs font-mono" style={{ color: B.muted }}>{s.lastActivity ? s.lastActivity.slice(0, 10) : "لا نشاط"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

const SCREENS = { portal: Portal, dashboard: Dashboard, library: Library, combos: Combos, criteria: Criteria, scoring: Scoring, risk: Risk, analysis: Analysis, decision: Decision, audit: Audit, team: Team, compare: Compare };
const PINNED = ["dashboard", "🏠", "لوحة القرار"];
const NAV = [
  { g: "الاستكشاف", items: [["library", "📚", "الخدمات والشرائح"], ["combos", "🔀", "التركيبات"]] },
  { g: "التقييم", items: [["criteria", "⚖️", "المعايير والأوزان"], ["scoring", "📝", "مصفوفة التقييم"]] },
  { g: "التحليل", items: [["risk", "⚠️", "المخاطر"], ["analysis", "📊", "السيناريوهات والمحاكاة"]] },
  { g: "القرار", items: [["decision", "✅", "التوصيات"], ["audit", "🕐", "سجل التدقيق"], ["team", "👥", "الفريق والصلاحيات"]] },
];

export default function App() {
  const [role, setRole] = useState("admin");
  const [screen, setScreen] = useState("portal");
  const [services, setServices] = useState(SERVICES0);
  const [segments, setSegments] = useState(SEGMENTS0);
  const [criteria, setCriteria] = useState(CRITERIA0);
  const [evals, setEvals] = useState(() => JSON.parse(JSON.stringify(SEED)));
  const [team, setTeam] = useState(TEAM0);
  const [audit, setAudit] = useState(AUDIT0);
  const [selCombo, setSelCombo] = useState("S2|C5");
  const [anTab, setAnTab] = useState("scen");
  const [comboMode, setComboMode] = useState("toggle");
  const [mc, setMc] = useState(null);
  const [newSvc, setNewSvc] = useState("");
  const [newSeg, setNewSeg] = useState("");
  const [newCrit, setNewCrit] = useState("");
  const [myProjects, setMyProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [npName, setNpName] = useState("");
  const [npNameEn, setNpNameEn] = useState("");
  const [npDesc, setNpDesc] = useState("");
  const [npTemplateId, setNpTemplateId] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("evaluator");

  const [authState, setAuthState] = useState(repo ? "checking" : "local");
  const [authUser, setAuthUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const parseHash = () => {
    const h = window.location.hash.replace(/^#\/?/, "");
    const [pid, scr] = h.split("/");
    return { pid: pid || null, scr: scr || null };
  };

  const switchProject = async (projectId, knownRole, initialScreen = "dashboard") => {
    const d = await repo.load(projectId).catch((e) => { console.warn(e); return null; });
    if (!d) return;
    setServices(d.services); setSegments(d.segments); setCriteria(d.criteria);
    setEvals(d.evals); setAudit(d.audit.length ? d.audit : []); setTeam(d.team);
    setCurrentProject({ id: d.project.id, name: d.project.name, name_en: d.project.name_en, status: d.project.status });
    setRole(knownRole || myProjects.find((pr) => pr.id === projectId)?.myRole || "viewer");
    setScreen(initialScreen);
    window.location.hash = `#/${projectId}/${initialScreen}`;
  };

  /* حفظ مكانك في رابط الصفحة — يمنع العودة للمشروع الافتراضي عند مغادرة الصفحة والرجوع إليها */
  useEffect(() => {
    if (!currentProject) return;
    const target = `#/${currentProject.id}/${screen}`;
    if (window.location.hash !== target) window.location.hash = target;
  }, [screen, currentProject?.id]);

  useEffect(() => {
    const onHashChange = () => {
      const { pid, scr } = parseHash();
      if (pid && pid !== currentProject?.id) {
        const proj = myProjects.find((p) => p.id === pid);
        if (proj) switchProject(pid, proj.myRole, scr || "dashboard");
        else setAccessError("لا تملك صلاحية الوصول لهذا المشروع، أو أنه لم يعد موجوداً.");
      } else if (scr && scr !== screen && SCREENS[scr]) {
        setScreen(scr);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [currentProject, myProjects, screen]);

  const [accessError, setAccessError] = useState("");

  const afterLogin = async (user) => {
    setAuthUser(user);
    try {
      const projects = await repo.listMyProjects();
      setMyProjects(projects);
      if (projects.length) {
        const { pid, scr } = parseHash();
        const restored = pid && projects.find((p) => p.id === pid);
        if (pid && !restored) setAccessError("لا تملك صلاحية الوصول لهذا المشروع، أو أنه لم يعد موجوداً. تم فتح أحدث مشروع لديك بدلاً منه.");
        if (restored) {
          await switchProject(restored.id, restored.myRole, scr && SCREENS[scr] ? scr : "dashboard");
        } else {
          await switchProject(projects[0].id, projects[0].myRole);
        }
      }
    } catch (e) {
      console.warn("SSPDF listMyProjects:", e.message);
    }
    setHydrated(true);
    setAuthState("ready");
  };

  const handleCreateProject = async () => {
    if (!npName.trim()) return;
    setProjectBusy(true);
    try {
      const project = await repo.createProject({ name: npName.trim(), nameEn: npNameEn.trim(), description: npDesc.trim() });
      if (npTemplateId) await repo.copyProjectStructure(npTemplateId, project.id);
      const updated = await repo.listMyProjects();
      setMyProjects(updated);
      setShowNewProjectForm(false); setNpName(""); setNpNameEn(""); setNpDesc(""); setNpTemplateId("");
      await switchProject(project.id, "admin");
    } catch (e) {
      alert("تعذّر إنشاء المشروع: " + e.message);
    }
    setProjectBusy(false);
  };

  const addCriterion = (name) => {
    setCriteria((c) => [...c, { id: `c${Date.now()}`, ar: name, en: "", g: "", w: 0 }]);
    log("إضافة معيار", name);
  };
  const removeCriterion = (id) => {
    const cr = criteria.find((c) => c.id === id);
    setCriteria((c) => c.filter((x) => x.id !== id));
    if (cr) log("حذف معيار", cr.ar);
  };

  const compareAllProjects = () => repo.compareProjects(myProjects.map((p) => p.id));

  const [ahpPairs, setAhpPairs] = useState({});
  const setAhpPair = (key, val) => setAhpPairs((p) => ({ ...p, [key]: val }));
  const applyAHP = (weights) => {
    setCriteria((c) => c.map((cr, i) => ({ ...cr, w: weights[i] })));
    log("تطبيق AHP", "تحديث الأوزان عبر المقارنات الزوجية");
  };

  useEffect(() => {
    if (!repo) { setHydrated(true); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) afterLogin(session.user); else setAuthState("login");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) afterLogin(session.user);
      else { setAuthUser(null); setAuthState("login"); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!hydrated || !repo) return;
    const t = setTimeout(() => {
      repo.syncAll({ services, segments, criteria, evals })
        .catch((e) => console.warn("SSPDF sync:", e.message));
    }, 800);
    return () => clearTimeout(t);
  }, [hydrated, services, segments, criteria, evals]);

  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn > 0]);

  const sendOtp = async () => {
    setAuthError(""); setAuthBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("sspdf-auth", {
        body: { action: "send", email: authEmail.trim() },
      });
      if (error || !data?.success) {
        setAuthError(data?.message || "تعذّر إرسال رمز الدخول. حاول مرة أخرى.");
        if (data?.retryAfter) setResendIn(data.retryAfter);
      } else {
        setOtpSent(true);
        setResendIn(data.retryAfter || 60);
      }
    } catch (e) {
      setAuthError("تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.");
    }
    setAuthBusy(false);
  };
  const verifyOtp = async () => {
    setAuthError(""); setAuthBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("sspdf-auth", {
        body: { action: "verify", email: authEmail.trim(), otp: otpCode.trim() },
      });
      if (error || !data?.success) {
        setAuthError(data?.message || "رمز غير صحيح أو منتهي الصلاحية.");
        setAuthBusy(false);
        return;
      }
      const { error: sessErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
      if (sessErr) setAuthError("تعذّر إكمال تسجيل الدخول.");
    } catch (e) {
      setAuthError("تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.");
    }
    setAuthBusy(false);
  };
  const signOut = async () => { await supabase.auth.signOut(); };


  const can = roleInfo(role).can;
  const userName = authState === "ready" ? (authUser?.email || "مستخدم")
    : team.find((m) => m.role === role)?.name || "أنت";
  const log = (action, detail) => {
    setAudit((a) => [{ ts: now(), user: userName, action, detail }, ...a]);
    repo?.addLog(action, detail, userName).catch(() => {});
  };

  const comboName = (key) => {
    const [s, c] = key.split("|");
    const sv = services.find((x) => x.id === s), sg = segments.find((x) => x.id === c);
    return sv && sg ? `${sv.ar} × ${sg.ar}` : key;
  };

  const ranked = useMemo(() => {
    return Object.entries(evals)
      .map(([key, ev]) => {
        const sc = calcScore(ev, criteria);
        const isUnscored = ev.scores.every((s) => s === 5) && Object.keys(ev.evidence).length === 0;
        return { key, ev, name: comboName(key), ...sc, risk: ev.risk, isUnscored, bucket: isUnscored ? "unscored" : bucket(sc.adj, ev.risk) };
      })
      .sort((a, b) => (a.isUnscored !== b.isUnscored ? (a.isUnscored ? 1 : -1) : b.adj - a.adj));
  }, [evals, criteria, services, segments]);

  const top = ranked.find((r) => !r.isUnscored);
  const totalW = criteria.reduce((s, c) => s + c.w, 0);
  const confIdx = top ? Math.round((top.adj / top.raw) * 100) : 0;
  const lastUpdate = audit[0]?.ts || "—";

  const toggleCombo = (key) => {
    if (!can.structure) return;
    setEvals((e) => {
      const n = { ...e };
      if (n[key]) {
        if (!window.confirm(`هل تريد استبعاد "${comboName(key)}"؟ ستفقد كل تقييماتها المُدخلة.`)) return e;
        delete n[key]; log("استبعاد تركيبة", comboName(key));
      }
      else {
        n[key] = { scores: Array(criteria.length).fill(5), conf: Array(criteria.length).fill("M"), risk: 5, riskNote: "", evidence: {} };
        log("تفعيل تركيبة", comboName(key));
      }
      return n;
    });
  };

  const setScore = (key, i, val) => {
    setEvals((e) => { const n = { ...e }; n[key] = { ...n[key], scores: n[key].scores.map((s, j) => (j === i ? val : s)) }; return n; });
    log("تعديل تقييم", `${comboName(key)} — ${criteria[i].ar} = ${val}`);
  };
  const setConf = (key, i, val) => {
    setEvals((e) => { const n = { ...e }; n[key] = { ...n[key], conf: n[key].conf.map((s, j) => (j === i ? val : s)) }; return n; });
  };
  const setEvidence = (key, cid, val) => {
    setEvals((e) => { const n = { ...e }; n[key] = { ...n[key], evidence: { ...n[key].evidence, [cid]: val } }; return n; });
  };
  const setRisk = (key, val) => {
    setEvals((e) => { const n = { ...e }; n[key] = { ...n[key], risk: val }; return n; });
    log("تعديل المخاطر", `${comboName(key)} — درجة المخاطر = ${val}`);
  };
  const setWeight = (i, val) => {
    setCriteria((c) => c.map((cr, j) => (j === i ? { ...cr, w: val } : cr)));
  };
  const normalizeW = () => {
    const t = criteria.reduce((s, c) => s + c.w, 0) || 1;
    setCriteria((c) => c.map((cr) => ({ ...cr, w: Math.round((cr.w / t) * 100) })));
    log("موازنة الأوزان", "إعادة ضبط المجموع إلى 100%");
  };

  const [teamError, setTeamError] = useState("");
  const addTeamMember = async (email, role, displayName) => {
    setTeamError("");
    if (repo) {
      const res = await repo.addMember({ email, role, displayName });
      if (res.error) { setTeamError(res.error); return; }
      setTeam((t) => [...t, res.member]);
      log("إضافة عضو", `${email} — ${roleInfo(role).ar}`);
    } else {
      setTeam((t) => [...t, { id: Date.now(), email, name: displayName || email, role, linked: false }]);
      log("إضافة عضو", `${displayName || email} — ${roleInfo(role).ar}`);
    }
  };
  const removeTeamMember = async (member) => {
    setTeamError("");
    if (!window.confirm(`هل تريد حذف "${member.name || member.email}" من الفريق؟`)) return;
    const admins = team.filter((m) => m.role === "admin");
    if (member.role === "admin" && admins.length <= 1) {
      setTeamError("لا يمكن حذف آخر مدير نظام متبقٍ في المشروع");
      return;
    }
    if (member.userId && member.userId === authUser?.id) {
      setTeamError("لا يمكنك حذف حسابك الخاص أثناء تسجيل دخولك به");
      return;
    }
    if (repo) {
      const res = await repo.removeMember(member.id);
      if (res.error) { setTeamError(res.error); return; }
    }
    setTeam((t) => t.filter((m) => m.id !== member.id));
    log("حذف عضو", `${member.name || member.email}`);
  };

  const Screen = SCREENS[screen];
  const [openGroup, setOpenGroup] = useState(() => NAV.findIndex((g) => g.items.some(([k]) => k === screen)));
  useEffect(() => {
    const idx = NAV.findIndex((g) => g.items.some(([k]) => k === screen));
    if (idx >= 0) setOpenGroup(idx);
  }, [screen]);
  const [showSwitcher, setShowSwitcher] = useState(false);

  if (repo && authState === "checking") return <CheckingScreen />;
  if (repo && authState === "login") {
    return (
      <LoginScreen
        authEmail={authEmail} setAuthEmail={setAuthEmail}
        otpSent={otpSent} setOtpSent={setOtpSent}
        otpCode={otpCode} setOtpCode={setOtpCode}
        authBusy={authBusy} authError={authError}
        sendOtp={sendOtp} verifyOtp={verifyOtp} resendIn={resendIn}
      />
    );
  }

  const ctx = {
    role, can, team, setTeam, services, setServices, segments, setSegments,
    criteria, setCriteria, evals, setEvals, audit, selCombo, setSelCombo,
    anTab, setAnTab, comboMode, setComboMode, mc, setMc,
    newSvc, setNewSvc, newSeg, setNewSeg, newCrit, setNewCrit, addCriterion, removeCriterion,
    ahpPairs, setAhpPair, applyAHP,
    newMemberEmail, setNewMemberEmail, newMemberRole, setNewMemberRole,
    addTeamMember, removeTeamMember, teamError, repoActive: !!repo,
    ranked, top, totalW, confIdx, lastUpdate,
    comboName, toggleCombo, setScore, setConf, setEvidence, setRisk, setWeight, normalizeW, log,
    setScreen,
    myProjects, currentProject, switchProject, showNewProjectForm, setShowNewProjectForm, compareAllProjects,
    npName, setNpName, npNameEn, setNpNameEn, npDesc, setNpDesc, npTemplateId, setNpTemplateId, handleCreateProject, projectBusy,
  };

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: B.sand, color: B.petrol, fontFamily: "'DIN Next LT Arabic', 'Tajawal', 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif" }}>
      <header className="px-5 py-3 flex flex-wrap items-center gap-4 sticky top-0 z-10" style={{ background: "#fff", borderBottom: `1px solid ${B.line}` }}>
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-lg text-lg font-black font-mono tracking-tight" style={{ background: B.petrol, color: B.gold }}>SSPDF</span>
          {repo && authState === "ready" ? (
            <div className="relative">
              <button onClick={() => setShowSwitcher((s) => !s)}
                className="flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg transition"
                style={{ background: B.goldSoft, color: B.petrol }}>
                {currentProject?.name || "اختر مشروعاً"} <span style={{ color: B.goldText, fontSize: "0.7rem" }}>▾</span>
              </button>
              {showSwitcher && (
                <div className="absolute top-full right-0 mt-2 rounded-xl shadow-lg z-20 overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.line}`, minWidth: 240 }}>
                  {myProjects.map((pr) => (
                    <button key={pr.id} onClick={() => { switchProject(pr.id, pr.myRole); setShowSwitcher(false); }}
                      className="block w-full text-right px-4 py-2.5 text-sm transition"
                      style={{ background: pr.id === currentProject?.id ? B.goldSoft : "transparent", color: B.petrol, borderBottom: `1px solid ${B.lineSoft}` }}>
                      {pr.id === currentProject?.id ? "● " : ""}{pr.name}
                    </button>
                  ))}
                  <button onClick={() => { setScreen("compare"); setShowSwitcher(false); }}
                    className="block w-full text-right px-4 py-2.5 text-sm" style={{ color: B.petrolSoft, borderBottom: `1px solid ${B.lineSoft}` }}>📊 مقارنة المشاريع</button>
                  <button onClick={() => { setScreen("portal"); setShowSwitcher(false); }}
                    className="block w-full text-right px-4 py-2.5 text-sm font-bold" style={{ color: B.goldText }}>+ مشروع جديد / كل المشاريع</button>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs hidden sm:inline" style={{ color: B.muted }}>إطار قرار محفظة الخدمات الاستراتيجية</span>
          )}
        </div>
        <div className="flex-1"></div>
        <div className="flex items-center gap-2 text-xs">
          {authState === "local" ? (
            <>
              <span style={{ color: B.muted }}>الدور الحالي</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: B.goldSoft, color: B.goldText }}>وضع تجريبي محلي</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg px-3 py-1.5 outline-none inp">
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
              </select>
            </>
          ) : (
            <span style={{ color: B.muted }}>الدور: <span className="font-bold" style={{ color: B.petrol }}>{roleInfo(role).ar}</span></span>
          )}
          <span className="px-3 py-1.5 rounded-lg font-bold" style={roleInfo(role).chip}>{userName}</span>
          {authState === "ready" && (
            <button onClick={signOut} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: B.muted, border: `1px solid ${B.line}` }}>تسجيل الخروج</button>
          )}
        </div>
      </header>
      {accessError && (
        <div className="px-5 py-2.5 text-xs flex justify-between items-center" style={{ background: "#FDECEA", color: B.bad, borderBottom: `1px solid ${B.bad}` }}>
          <span>⚠️ {accessError}</span>
          <button onClick={() => setAccessError("")} className="font-bold px-2">✕</button>
        </div>
      )}
      <div className="flex">
        <nav className="w-56 shrink-0 min-h-screen p-3 hidden md:block" style={{ background: B.petrol }}>
          <button onClick={() => setScreen(PINNED[0])}
            className="flex items-center gap-2 w-full text-right px-3 py-2.5 rounded-lg text-sm mb-3 transition"
            style={screen === PINNED[0] ? { background: B.gold, color: B.petrol, fontWeight: 700 } : { color: "#E7EEF2", background: "rgba(255,255,255,0.06)" }}>
            <span>{PINNED[1]}</span><span>{PINNED[2]}</span>
          </button>
          {NAV.map((g, gi) => {
            const isOpen = openGroup === gi;
            return (
              <div key={g.g} className="mb-1.5">
                <button onClick={() => setOpenGroup(isOpen ? -1 : gi)}
                  className="flex items-center justify-between w-full text-right px-2 py-2 rounded-lg text-xs tracking-wider transition"
                  style={{ color: isOpen ? B.gold : "#7E93A0", background: isOpen ? "rgba(200,164,92,0.08)" : "transparent" }}>
                  <span>{g.g}</span>
                  <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                </button>
                {isOpen && (
                  <div className="mt-0.5 mb-2">
                    {g.items.map(([k, icon, t]) => (
                      <button key={k} onClick={() => setScreen(k)}
                        className="flex items-center gap-2 w-full text-right px-3 py-2 rounded-lg text-sm mb-0.5 transition"
                        style={screen === k ? { background: B.gold, color: B.petrol, fontWeight: 700 } : { color: "#C9D3D9" }}>
                        <span>{icon}</span><span>{t}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <main className="flex-1 p-3 sm:p-5 md:p-8 max-w-6xl">
          <div className="md:hidden mb-4">
            <select value={screen} onChange={(e) => setScreen(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none inp">
              <option value={PINNED[0]}>{PINNED[1]} {PINNED[2]}</option>
              {NAV.map((g) => (
                <optgroup key={g.g} label={g.g}>
                  {g.items.map(([k, icon, t]) => <option key={k} value={k}>{icon} {t}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <Screen {...ctx} />
        </main>
      </div>
    </div>
  );
}
