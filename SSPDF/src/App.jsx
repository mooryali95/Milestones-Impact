import { useState, useMemo, useEffect } from "react";
import { repo, getMyRole } from "./lib/repository";
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
    🔒 صلاحيتك الحالية ({ROLES[role].ar}) للعرض فقط في هذه الشاشة
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

const CheckingScreen = () => (
  <AuthShell><div className="text-center text-sm" style={{ color: B.muted }}>جارٍ التحقق من الجلسة…</div></AuthShell>
);

const LoginScreen = ({ authEmail, setAuthEmail, otpSent, setOtpSent, otpCode, setOtpCode, authBusy, authError, sendOtp, verifyOtp }) => (
  <AuthShell>
    <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>تسجيل الدخول</div>
    <div className="text-xs mb-4" style={{ color: B.muted }}>Sign in via one-time email code</div>
    {!otpSent ? (
      <>
        <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="بريدك الإلكتروني"
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none inp mb-3" dir="ltr" style={{ textAlign: "right" }} />
        <GoldBtn onClick={sendOtp} disabled={authBusy || !authEmail.trim()} className="w-full py-2.5">
          {authBusy ? "جارٍ الإرسال…" : "إرسال رمز الدخول"}
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
        <button onClick={() => { setOtpSent(false); setOtpCode(""); }} className="w-full text-xs mt-3" style={{ color: B.muted }}>تغيير البريد الإلكتروني</button>
      </>
    )}
    {authError && <div className="text-xs mt-3 text-center" style={{ color: B.bad }}>{authError}</div>}
  </AuthShell>
);

const PendingScreen = ({ adminClaimed, authBusy, claimAdminNow, authUser, signOut }) => (
  <AuthShell>
    {!adminClaimed ? (
      <>
        <div className="text-sm font-bold mb-2" style={{ color: B.petrol }}>لا يوجد مدير نظام مرتبط بعد</div>
        <div className="text-xs mb-4" style={{ color: B.muted }}>بصفتك أول من يسجّل الدخول، يمكنك المطالبة بصلاحية مدير النظام لهذا المشروع.</div>
        <GoldBtn onClick={claimAdminNow} disabled={authBusy} className="w-full py-2.5">
          {authBusy ? "جارٍ الربط…" : "المطالبة بصلاحية مدير النظام"}
        </GoldBtn>
      </>
    ) : (
      <>
        <div className="text-sm font-bold mb-2" style={{ color: B.petrol }}>بانتظار تفعيل صلاحيتك</div>
        <div className="text-xs mb-4" style={{ color: B.muted }}>حسابك ({authUser?.email}) لم يُربط بعد بأي دور في المشروع. تواصل مع مدير النظام لتفعيله من جدول العضوية.</div>
      </>
    )}
    <button onClick={signOut} className="w-full text-xs mt-4" style={{ color: B.muted }}>تسجيل الخروج</button>
  </AuthShell>
);

const Portal = (p) => (
  <div>
    <H ar="بوابة المشاريع" en="Projects Portal" sub="جميع المنتجات والبرامج الخاضعة لإطار القرار — يتسع لـ 50+ منتجاً بعد الربط بقاعدة البيانات" />
    <div className="grid md:grid-cols-2 gap-4">
      <div onClick={() => p.setScreen("dashboard")}
        className="rounded-2xl p-6 cursor-pointer transition hover:shadow-md"
        style={{ background: B.card, border: `2px solid ${B.gold}` }}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-lg font-bold" style={{ color: B.petrol }}>برنامج إدارة المشروعات للقادة</div>
            <div className="text-xs font-mono mt-1" style={{ color: B.muted }}>PM for Leaders</div>
          </div>
          <span className="text-xs px-3 py-1 rounded-full" style={{ background: "#E8F0F5", color: B.petrolSoft, border: `1px solid ${B.petrolSoft}` }}>قيد التقييم</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5 text-center">
          <div><div className="font-mono font-bold" style={{ color: B.goldText }}>{p.ranked.length}</div><div className="text-xs" style={{ color: B.muted }}>تركيبة مفعّلة</div></div>
          <div><div className="font-mono font-bold" style={{ color: B.goldText }}>{p.top ? p.top.adj.toFixed(1) : "—"}</div><div className="text-xs" style={{ color: B.muted }}>أعلى نتيجة</div></div>
          <div><div className="font-mono font-bold" style={{ color: B.goldText }}>{Math.round((p.ranked.length / (p.services.length * p.segments.length)) * 100)}%</div><div className="text-xs" style={{ color: B.muted }}>التغطية</div></div>
        </div>
        <div className="mt-4 pt-4 text-sm" style={{ borderTop: `1px solid ${B.lineSoft}` }}>
          <span style={{ color: B.muted }}>التوصية الحالية: </span>
          <span className="font-bold" style={{ color: B.ok }}>{p.top?.name}</span>
        </div>
        <div className="text-xs mt-2" style={{ color: B.muted }}>آخر تحديث: {p.lastUpdate}</div>
      </div>
      <div className="rounded-2xl p-6 flex flex-col items-center justify-center"
        style={{ border: `2px dashed ${B.line}`, color: B.muted }}>
        <div className="text-3xl mb-2">+</div>
        <div className="text-sm">مشروع جديد</div>
        <div className="text-xs mt-1 text-center">يُفعّل في المرحلة الثانية بعد الربط بقاعدة البيانات<br /><span className="font-mono">Supabase · schema: sspdf</span></div>
      </div>
    </div>
    <Card className="mt-6">
      <div className="font-bold mb-3 text-sm" style={{ color: B.petrol }}>آخر النشاطات <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>Activity Feed</span></div>
      {p.audit.slice(0, 5).map((a, i) => (
        <div key={i} className="flex gap-3 items-start py-2 text-sm" style={{ borderBottom: i < 4 ? `1px solid ${B.lineSoft}` : "none" }}>
          <span className="text-xs font-mono whitespace-nowrap" style={{ color: B.muted }}>{a.ts}</span>
          <span className="whitespace-nowrap font-bold" style={{ color: B.goldText }}>{a.action}</span>
          <span style={{ color: B.petrol }}>{a.detail}</span>
        </div>
      ))}
    </Card>
  </div>
);

const Dashboard = (p) => (
  <div>
    <H ar="لوحة القرار" en="Decision Dashboard" sub="برنامج إدارة المشروعات للقادة" />
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

const Library = (p) => (
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
            <div key={it.id} className="flex justify-between items-center py-2 text-sm" style={{ borderBottom: idx < sec.items.length - 1 ? `1px solid ${B.lineSoft}` : "none", color: B.petrol }}>
              <div><span className="font-mono text-xs ml-2" style={{ color: B.muted }}>{it.id}</span>{it.ar}</div>
              <span className="text-xs font-mono" style={{ color: B.muted }}>{it.en}</span>
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

const Combos = (p) => (
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
                      className={`w-14 h-11 rounded-lg text-sm font-mono transition ${clickable ? "cursor-pointer" : "cursor-default"}`}
                      style={ev
                        ? (p.comboMode === "edit"
                          ? { border: `1px solid ${B.gold}`, background: B.goldSoft, color: B.goldText, fontWeight: 700 }
                          : { border: `1px solid ${B.ok}`, background: "#E4F2EA", color: B.ok, fontWeight: 700 })
                        : { border: `1px dashed ${B.line}`, color: "#B9B29E", background: "#fff" }}>
                      {ev ? (p.comboMode === "edit" ? `${sc.toFixed(0)} ✎` : sc.toFixed(0)) : "—"}
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
          ? "اضغط أي خلية للتفعيل أو الاستبعاد · الرقم = النتيجة المعدّلة بالثقة"
          : "اضغط أي تركيبة مفعّلة للانتقال مباشرة إلى مصفوفة التقييم وتعديل درجاتها"}
      </div>
    </Card>
  </div>
);

const Criteria = (p) => (
  <div>
    <H ar="المعايير والأوزان" en="Criteria & Weights" sub="الأوزان مضبوطة وفق منهجية GE-McKinsey: جاذبية السوق ≈ 50% والقدرة على الفوز ≈ 50%" />
    {!p.can.weights && <Locked role={p.role} />}
    <Card>
      <div className="text-sm font-bold mb-4" style={{ color: p.totalW === 100 ? B.ok : B.bad }}>
        مجموع الأوزان: <span className="font-mono">{p.totalW}%</span> {p.totalW !== 100 && "⚠️ يجب أن يساوي 100%"}
        {p.totalW !== 100 && p.can.weights && (
          <button onClick={p.normalizeW} className="mr-3 px-3 py-1 rounded-lg text-xs font-bold" style={{ background: B.gold, color: B.petrol }}>موازنة تلقائية</button>
        )}
      </div>
      {p.criteria.map((cr, i) => (
        <div key={cr.id} className="grid grid-cols-12 gap-3 items-center py-2" style={{ borderBottom: i < p.criteria.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
          <div className="col-span-5 md:col-span-4 text-sm" style={{ color: B.petrol }}>{cr.ar}<div className="text-xs font-mono" style={{ color: B.muted }}>{cr.en}</div></div>
          <div className="col-span-2 text-xs hidden md:block" style={{ color: B.muted }}>{cr.g}</div>
          <div className="col-span-5 md:col-span-4">
            <input type="range" min={0} max={60} value={cr.w} disabled={!p.can.weights}
              onChange={(e) => p.setWeight(i, +e.target.value)} className="w-full" style={{ accentColor: B.gold }} />
          </div>
          <div className="col-span-2 flex items-center gap-1">
            <input type="number" min={0} max={100} value={cr.w} disabled={!p.can.weights}
              onChange={(e) => p.setWeight(i, Math.max(0, Math.min(100, +e.target.value || 0)))}
              className="w-14 rounded-lg px-1 py-1 text-center font-mono font-bold text-sm outline-none inp" style={{ color: B.goldText }} />
            <span className="text-xs" style={{ color: B.muted }}>%</span>
          </div>
        </div>
      ))}
    </Card>
    <Card className="mt-4 text-sm" style={{ color: B.muted }}>
      <span className="font-bold" style={{ color: B.goldText }}>المنهجية: </span>
      توزيع مباشر بالنسب المئوية مستمد من مصفوفة GE-McKinsey لجاذبية السوق مقابل القدرة التنافسية، مع تعديل النتائج بمستوى الثقة (Confidence-Adjusted Scoring). وحدة المقارنات الزوجية <span className="font-mono">AHP</span> مجدولة في مرحلة التوسع.
    </Card>
  </div>
);

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
  const scenRank = useMemo(() => {
    const out = {};
    Object.entries(SCENARIOS).forEach(([k, s]) => {
      const w = scenWeights(p.criteria, s.mult);
      out[k] = p.ranked.map((r) => ({ key: r.key, name: r.name, adj: calcScore(r.ev, w).adj })).sort((a, b) => b.adj - a.adj);
    });
    return out;
  }, [p.ranked, p.criteria]);
  return (
    <div>
      <H ar="التحليل والسيناريوهات" en="Sensitivity · Scenarios · Monte Carlo" sub="اختبار استقرار القرار عند تغيّر الافتراضات" />
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
            <GoldBtn disabled={!p.can.analyze} onClick={() => { p.setMc(runMonteCarlo(p.ranked, p.criteria)); p.log("محاكاة", "تشغيل Monte Carlo — 1000 تكرار"); }} className="px-5 py-2.5">
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
  const groups = { launch: [], next: [], defer: [], exclude: [] };
  p.ranked.forEach((r) => groups[r.bucket].push(r));
  const rationale = (r) => {
    const tops = p.criteria.map((c, i) => ({ ar: c.ar, v: c.w * r.ev.scores[i] })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.ar);
    return `أقوى محركات النتيجة: ${tops.join("، ")}.`;
  };
  return (
    <div>
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
                <div className="text-xs mt-2" style={{ color: B.muted }}>{rationale(r)}</div>
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
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: B.goldSoft, color: B.goldText, border: `1px solid ${B.line}` }}>{m.name[0]}</div>
            <div className="text-sm font-bold" style={{ color: B.petrol }}>{m.name}</div>
          </div>
          <span className="text-xs px-3 py-1 rounded-full font-bold" style={ROLES[m.role].chip}>{ROLES[m.role].ar}</span>
        </div>
      ))}
      {p.can.team && (
        <div className="flex flex-wrap gap-2 mt-4">
          <input value={p.newMember} onChange={(e) => p.setNewMember(e.target.value)} placeholder="اسم العضو الجديد..."
            className="flex-1 min-w-40 rounded-lg px-3 py-2 text-sm outline-none inp" />
          <select value={p.newMemberRole} onChange={(e) => p.setNewMemberRole(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none inp">
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
          </select>
          <GoldBtn onClick={() => {
            if (!p.newMember.trim()) return;
            p.setTeam((t) => [...t, { id: Date.now(), name: p.newMember.trim(), role: p.newMemberRole }]);
            p.log("إضافة عضو", `${p.newMember.trim()} — ${ROLES[p.newMemberRole].ar}`);
            p.setNewMember("");
          }}>إضافة</GoldBtn>
        </div>
      )}
      {p.can.team && (
        <div className="text-xs mt-2" style={{ color: B.muted }}>
          ⚠️ الإضافة هنا للعرض فقط. صلاحيته الفعلية تُفعَّل بعد تسجيل دخوله لأول مرة وربط حسابه من قاعدة البيانات (schema: sspdf).
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

const SCREENS = { portal: Portal, dashboard: Dashboard, library: Library, combos: Combos, criteria: Criteria, scoring: Scoring, risk: Risk, analysis: Analysis, decision: Decision, audit: Audit, team: Team };
const NAV = [
  { g: "عام", items: [["portal", "بوابة المشاريع"], ["dashboard", "لوحة القرار"]] },
  { g: "الاستكشاف", items: [["library", "الخدمات والشرائح"], ["combos", "التركيبات"]] },
  { g: "التقييم", items: [["criteria", "المعايير والأوزان"], ["scoring", "مصفوفة التقييم"]] },
  { g: "التحليل", items: [["risk", "المخاطر"], ["analysis", "السيناريوهات والمحاكاة"]] },
  { g: "القرار", items: [["decision", "التوصيات"], ["audit", "سجل التدقيق"], ["team", "الفريق والصلاحيات"]] },
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
  const [newMember, setNewMember] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("evaluator");

  const [authState, setAuthState] = useState(repo ? "checking" : "local");
  const [authUser, setAuthUser] = useState(null);
  const [teamDisplayName, setTeamDisplayName] = useState("");
  const [adminClaimed, setAdminClaimed] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const afterLogin = async (user) => {
    setAuthUser(user);
    if (!hydrated) {
      const d = await repo.load().catch(() => null);
      if (d) {
        setServices(d.services); setSegments(d.segments); setCriteria(d.criteria);
        setEvals(d.evals); if (d.audit.length) setAudit(d.audit);
      }
      setHydrated(true);
    }
    const info = await getMyRole(supabase, repo.projectId);
    if (info.role) {
      setRole(info.role);
      setTeamDisplayName(info.displayName || user.email);
      setAuthState("ready");
    } else {
      setAdminClaimed(info.adminClaimed);
      setAuthState("pending");
    }
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

  const sendOtp = async () => {
    setAuthError(""); setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail.trim() });
    setAuthBusy(false);
    if (error) setAuthError(error.message); else setOtpSent(true);
  };
  const verifyOtp = async () => {
    setAuthError(""); setAuthBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: authEmail.trim(), token: otpCode.trim(), type: "email" });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  };
  const claimAdminNow = async () => {
    setAuthBusy(true);
    await repo.claimAdmin(authUser.email).catch(() => {});
    const info = await getMyRole(supabase, repo.projectId);
    setAuthBusy(false);
    if (info.role) { setRole(info.role); setTeamDisplayName(info.displayName || authUser.email); setAuthState("ready"); }
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  const can = ROLES[role].can;
  const userName = authState === "ready" ? (teamDisplayName || authUser?.email || "مستخدم")
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
        return { key, ev, name: comboName(key), ...sc, risk: ev.risk, bucket: bucket(sc.adj, ev.risk) };
      })
      .sort((a, b) => b.adj - a.adj);
  }, [evals, criteria, services, segments]);

  const top = ranked[0];
  const totalW = criteria.reduce((s, c) => s + c.w, 0);
  const confIdx = top ? Math.round((top.adj / top.raw) * 100) : 0;
  const lastUpdate = audit[0]?.ts || "—";

  const toggleCombo = (key) => {
    if (!can.structure) return;
    setEvals((e) => {
      const n = { ...e };
      if (n[key]) { delete n[key]; log("استبعاد تركيبة", comboName(key)); }
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

  if (repo && authState === "checking") return <CheckingScreen />;
  if (repo && authState === "login") {
    return (
      <LoginScreen
        authEmail={authEmail} setAuthEmail={setAuthEmail}
        otpSent={otpSent} setOtpSent={setOtpSent}
        otpCode={otpCode} setOtpCode={setOtpCode}
        authBusy={authBusy} authError={authError}
        sendOtp={sendOtp} verifyOtp={verifyOtp}
      />
    );
  }
  if (repo && authState === "pending") {
    return (
      <PendingScreen
        adminClaimed={adminClaimed} authBusy={authBusy}
        claimAdminNow={claimAdminNow} authUser={authUser} signOut={signOut}
      />
    );
  }

  const ctx = {
    role, can, team, setTeam, services, setServices, segments, setSegments,
    criteria, setCriteria, evals, setEvals, audit, selCombo, setSelCombo,
    anTab, setAnTab, comboMode, setComboMode, mc, setMc,
    newSvc, setNewSvc, newSeg, setNewSeg, newMember, setNewMember, newMemberRole, setNewMemberRole,
    ranked, top, totalW, confIdx, lastUpdate,
    comboName, toggleCombo, setScore, setConf, setEvidence, setRisk, setWeight, normalizeW, log,
    setScreen,
  };
  const Screen = SCREENS[screen];

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: B.sand, color: B.petrol, fontFamily: "'DIN Next LT Arabic', 'Tajawal', 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif" }}>
      <header className="px-5 py-3 flex flex-wrap items-center gap-4 sticky top-0 z-10" style={{ background: "#fff", borderBottom: `1px solid ${B.line}` }}>
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-lg text-lg font-black font-mono tracking-tight" style={{ background: B.petrol, color: B.gold }}>SSPDF</span>
          <span className="text-xs hidden sm:inline" style={{ color: B.muted }}>إطار قرار محفظة الخدمات الاستراتيجية</span>
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
            <span style={{ color: B.muted }}>الدور: <span className="font-bold" style={{ color: B.petrol }}>{ROLES[role].ar}</span></span>
          )}
          <span className="px-3 py-1.5 rounded-lg font-bold" style={ROLES[role]?.chip}>{userName}</span>
          {authState === "ready" && (
            <button onClick={signOut} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: B.muted, border: `1px solid ${B.line}` }}>تسجيل الخروج</button>
          )}
        </div>
      </header>
      <div className="flex">
        <nav className="w-52 shrink-0 min-h-screen p-3 hidden md:block" style={{ background: B.petrol }}>
          {NAV.map((g) => (
            <div key={g.g} className="mb-4">
              <div className="text-xs tracking-wider mb-1 px-2" style={{ color: "#7E93A0" }}>{g.g}</div>
              {g.items.map(([k, t]) => (
                <button key={k} onClick={() => setScreen(k)}
                  className="block w-full text-right px-3 py-2 rounded-lg text-sm mb-0.5 transition"
                  style={screen === k ? { background: B.gold, color: B.petrol, fontWeight: 700 } : { color: "#C9D3D9" }}>{t}</button>
              ))}
            </div>
          ))}
        </nav>
        <main className="flex-1 p-3 sm:p-5 md:p-8 max-w-6xl">
          <div className="md:hidden mb-4">
            <select value={screen} onChange={(e) => setScreen(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none inp">
              {NAV.flatMap((g) => g.items).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          <Screen {...ctx} />
        </main>
      </div>
    </div>
  );
}
