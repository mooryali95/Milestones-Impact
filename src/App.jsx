import React, { useState, useEffect, useCallback, useMemo } from "react";
import Landing from './Landing';
import { API_URL, BRAND, TRACKS, PHASES, OPERATIONS } from './config/constants';
import { gregorianToHijri, fmtGregorian, fmtShort, fmtBoth, validPhone, validEmail, isPast } from './lib/dateUtils';
import { analyzeBookings } from './lib/analysis';
import { publicRead, UserAPI, AdminAPI } from './lib/api';
import { LocalSession, AdminSession } from './lib/session';
import { CSS } from './styles/appCss';

/*
╔══════════════════════════════════════════════════════════════╗
║  Milestone Impact — مصفوفة التأثير                          ║
║  Version 5.0 — Production Ready                             ║
║                                                              ║
║  Auth: email OTP / TOTP via admin-api Edge Function          ║
║  App composition root — feature logic lives in ./lib & ./config ║
║                                                              ║
║  © 2026 Milestone Impact. All rights reserved.               ║
╚══════════════════════════════════════════════════════════════╝
*/

// ════════════════════════════════════════════════════════════════
// MI LOGO — المعيّن الرسمي من حزمة الهوية v5
// المصدر: svg/icon-transparent.svg — لا تُعدّل الشكل
// ════════════════════════════════════════════════════════════════

const BRAND_GOLD = "#A97A2E";

const MILogo = ({ size = 40, color = BRAND_GOLD }) => (
  <svg
    viewBox="0 0 512 512"
    style={{ width: size, height: size, display: "block" }}
    role="img"
    aria-label="Milestone Impact"
  >
    <rect
      x="176" y="176" width="160" height="160"
      transform="rotate(45 256 256)"
      fill={color}
    />
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
    .header{text-align:center;margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:3px solid #14495E}
    .header h1{font-family:'Amiri',serif;font-size:1.8rem;color:#14495E;margin-bottom:.3rem}
    .header p{color:#6B6560;font-size:.9rem}
    .info{display:flex;justify-content:center;gap:2rem;margin-bottom:1.5rem;flex-wrap:wrap}
    .info-item{text-align:center;padding:.5rem 1rem;background:#F4F8F9;border-radius:8px}
    .info-label{font-size:.72rem;color:#6B6560}
    .info-value{font-weight:700;font-size:.95rem}
    table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}
    th{background:#14495E;color:#fff;padding:.6rem .5rem;font-size:.78rem;font-weight:600}
    td{padding:.5rem;border-bottom:1px solid #EDE8DC;font-size:.8rem}
    tr:nth-child(even) td{background:#FAFAF7}
    .footer{text-align:center;margin-top:1.5rem;padding-top:1rem;border-top:2px dashed #EDE8DC}
    .footer p{font-size:.8rem;color:#6B6560;margin-bottom:.3rem}
    .footer strong{color:#14495E}
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


const AuthLeft = ({ title, quote, highlight, tracks }) => (
  <div className="auth-left">
    <div className="auth-left-grid"/>
    <div className="auth-left-content">
      <MILogo size={52} color="#C8A45C"/>
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
          <div key={t.n} className="auth-left-track" style={{background:t.c+'22',color:t.c,border:'1px solid '+t.c+'44'}}>
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
  const [sessionToken, setSessionToken] = useState(null);
  const [dates, setDates] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [reopenRequested, setReopenRequested] = useState(false);

  const [adminEmail, setAdminEmail] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminOtpStep, setAdminOtpStep] = useState("email"); // "email" | "code"
  const [adminSending, setAdminSending] = useState(false);
  const [adminToken, setAdminToken] = useState(null);
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

  // OTP Rate Limiting — client-side guard
  const [otpLastSent, setOtpLastSent] = useState(null);       // timestamp of last send
  const [otpFailCount, setOtpFailCount] = useState(0);        // consecutive failed verifications
  const OTP_COOLDOWN_SEC = 60;   // seconds between resends
  const OTP_MAX_FAILS    = 3;    // max failed verifications before lockout

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
    const savedAdminToken = AdminSession.load();
    if (savedAdminToken) {
      setAdminToken(savedAdminToken);
      setScreen("admin");
      loadRegs(savedAdminToken);
      return;
    }
    // Restore user session (24h) — requires a valid session token
    const session = LocalSession.load();
    if (session?.sessionId && session?.token && session?.user) {
      setUser(session.user);
      setSessionId(session.sessionId);
      setSessionToken(session.token);
      setDates(session.dates || {});
      setConfirmed(session.confirmed || {});
      setSubmitted(session.submitted || false);
      setReopenRequested(session.reopenRequested || false);
      setScreen('main');
      if (session.submitted) setTab('output');
    }
  }, []);

  // Load rich process details + app content (public, read-only tables)
  useEffect(() => {
    (async () => {
      try {
        const [details, content] = await Promise.all([
          publicRead('process_details?select=*'),
          publicRead('app_content?select=*'),
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

  const loadRegs = async (tokenArg) => {
    const token = tokenArg || adminToken;
    if (!token) return;
    setLoading(true);
    const res = await AdminAPI.call(token, 'list-regs');
    if (res?.success) {
      const regs = res.registrations || [];
      setAllRegs(regs.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt)));
    } else if (res?.message) {
      showToast(res.message);
      if (res.message.includes('الجلسة')) doLogout();
    }
    setLoading(false);
  };

  // ── Admin: Save process detail ──
  const adminSaveProcess = async (processKey, updates) => {
    if (!adminToken) return;
    setAdminSaving(true);
    const res = await AdminAPI.call(adminToken, 'save-process', { process_key: processKey, updates });
    if (res?.success) {
      setProcessDetails(prev => ({ ...prev, [processKey]: { ...prev[processKey], ...updates } }));
      showToast('تم الحفظ ✓');
    } else { showToast(res?.message || 'خطأ في الحفظ'); }
    setAdminSaving(false);
  };

  // ── Admin: Save app content ──
  const adminSaveContent = async (key, value) => {
    if (!adminToken) return;
    setAdminSaving(true);
    const res = await AdminAPI.call(adminToken, 'save-content', { key, value });
    if (res?.success) {
      setAppContent(prev => ({ ...prev, [key]: value }));
      showToast('تم الحفظ ✓');
    } else { showToast(res?.message || 'خطأ في الحفظ'); }
    setAdminSaving(false);
  };

  // ── Apply a verified user session returned by user-api ──
  const applyUserSession = (res) => {
    const reg = res.registration || {};
    const u = { name: reg.name || "", phone: reg.phone || "", email: reg.email || "" };
    setUser(u);
    setSessionId(reg.id);
    setSessionToken(res.token);
    setDates(reg.dates || {});
    setConfirmed(reg.confirmed || {});
    setSubmitted(reg.submitted || false);
    setReopenRequested(reg.reopenRequested || false);
    if (Array.isArray(reg.demographic_analysis)) setDemoRows(reg.demographic_analysis);
    setScreen("main");
    if (reg.submitted) setTab("output");
    LocalSession.save(u, reg.id, reg.dates || {}, reg.confirmed || {},
      reg.submitted || false, reg.reopenRequested || false, res.token);
  };

  // ── Resume Session: Step 1 — server finds account by phone & sends OTP ──
  const handleResume = async (e) => {
    e.preventDefault();
    const phone = resumePhone.replace(/\s/g, "");
    if (!validPhone(phone)) { setResumeError("صيغة غير صحيحة (05XXXXXXXX)"); return; }

    setResumeLoading(true);
    setResumeError("");
    const res = await UserAPI.resumeSend(phone);
    setResumeLoading(false);
    if (!res.success) { setResumeError(res.message || "خطأ في إرسال رمز التحقق"); return; }

    setOtpLastSent(Date.now());
    setOtpFailCount(0);
    setUser({ name: "", phone, email: "" });
    setOtpPending({ type: "resume", phone });
    setOtpStep("otp");
    setOtpCode("");
    setOtpError("");
    showToast(`تم إرسال رمز التحقق إلى ${res.maskedEmail || "بريدك المسجّل"} ✉`);
  };

  // ── Resume: Step 2 — verify OTP, receive session token ──
  const handleResumeVerify = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) { setOtpError("أدخل الرمز المكون من 6 أرقام"); return; }

    setOtpSending(true);
    setOtpError("");
    const res = await UserAPI.verify({ otp: otpCode, phone: otpPending?.phone });
    setOtpSending(false);
    if (!res.success) { setOtpError(res.message || "رمز التحقق غير صحيح"); return; }

    applyUserSession(res);
    setOtpStep("form"); setOtpCode(""); setOtpPending(null);
    showToast(`مرحباً مجدداً ${res.registration?.name || ""}! تم استعادة بياناتك`);
  };

  // ── Register: Step 1 — validate locally, server sends OTP (dedupe server-side) ──
  const handleRegister = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!user.name.trim()) errs.name = "الاسم مطلوب";
    if (user.name.trim().length > 80) errs.name = "الاسم طويل جداً (80 حرف كحد أقصى)";
    if (!validPhone(user.phone)) errs.phone = "صيغة غير صحيحة (05XXXXXXXX)";
    if (!validEmail(user.email)) errs.email = "بريد إلكتروني غير صحيح";
    if (Object.keys(errs).length) { setRegErrors(errs); return; }

    setOtpSending(true);
    setOtpError("");
    const res = await UserAPI.registerSend(user.name.trim(), user.phone.replace(/\s/g, ""), user.email.trim());
    setOtpSending(false);
    if (!res.success) { setRegErrors({ email: res.message || "خطأ في إرسال رمز التحقق" }); return; }

    setOtpLastSent(Date.now());
    setOtpFailCount(0);
    setOtpPending({ type: res.mode === "resume" ? "resume" : "new" });
    setOtpStep("otp");
    setOtpCode("");
    setRegErrors({});
    showToast("تم إرسال رمز التحقق إلى بريدك الإلكتروني ✉");
  };

  // ── Register: Step 2 — verify OTP; server creates the record & issues a token ──
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) { setOtpError("أدخل الرمز المكون من 6 أرقام"); return; }

    setOtpSending(true);
    setOtpError("");
    const res = await UserAPI.verify({
      otp: otpCode,
      email: user.email.trim(),
      name: user.name.trim(),
      phone: user.phone.replace(/\s/g, ""),
    });
    setOtpSending(false);
    if (!res.success) { setOtpError(res.message || "رمز التحقق غير صحيح"); return; }

    applyUserSession(res);
    setOtpStep("form"); setOtpCode(""); setOtpPending(null); setRegErrors({});
    showToast(res.mode === "new"
      ? `أهلاً ${res.registration?.name || ""}! تم تسجيلك بنجاح`
      : `مرحباً مجدداً ${res.registration?.name || ""}! تم استعادة بياناتك`);
  };

  // ── Resend OTP ──
  const handleResendOtp = async () => {
    setOtpSending(true);
    setOtpError("");
    const res = (otpPending?.type === "resume" && otpPending.phone)
      ? await UserAPI.resumeSend(otpPending.phone)
      : await UserAPI.registerSend(user.name.trim(), user.phone.replace(/\s/g, ""), user.email.trim());
    setOtpSending(false);
    if (res.success) {
      setOtpLastSent(Date.now());
      setOtpFailCount(0);
      showToast("تم إعادة إرسال الرمز ✉");
    } else {
      setOtpError(res.message || "خطأ في إعادة الإرسال");
    }
  };

  // ── Admin Login: Step 1 — send OTP to a registered admin email ──
  const handleAdminSendCode = async (e) => {
    e.preventDefault();
    const email = adminEmail.trim().toLowerCase();
    if (!validEmail(email)) { setAdminError("بريد إلكتروني غير صحيح"); return; }
    setAdminSending(true);
    setAdminError("");
    const res = await AdminAPI.loginSend(email);
    setAdminSending(false);
    if (!res.success) { setAdminError(res.message || "تعذّر إرسال رمز الدخول"); return; }
    setAdminOtpStep("code");
    setAdminCode("");
    showToast("تم إرسال رمز الدخول إلى بريدك ✉ (أو استخدم تطبيق المصادقة إن كان مفعّلاً)");
  };

  // ── Admin Login: Step 2 — verify TOTP/OTP, receive admin session token ──
  const handleAdminVerify = async (e) => {
    e.preventDefault();
    if (adminCode.length !== 6) { setAdminError("أدخل الرمز المكون من 6 أرقام"); return; }
    setAdminSending(true);
    setAdminError("");
    const res = await AdminAPI.loginVerify(adminEmail.trim().toLowerCase(), adminCode);
    setAdminSending(false);
    if (!res.success) { setAdminError(res.message || "الرمز غير صحيح"); return; }
    AdminSession.save(res.token);
    setAdminToken(res.token);
    setAdminOtpStep("email");
    setAdminCode("");
    setScreen("admin");
    loadRegs(res.token);
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
    if (!sessionToken) return;
    const res = await UserAPI.get(sessionToken);
    const saved = res?.success ? res.registration?.[DEMO_KEY] : null;
    if (Array.isArray(saved) && saved.length > 0) {
      setDemoRows(saved);
    } else {
      setDemoRows([emptyDemoRow(), emptyDemoRow(), emptyDemoRow()]);
    }
  };

  const saveDemoData = async () => {
    if (!sessionToken) return;
    // ── التحقق: يجب وجود صف واحد على الأقل مكتمل (اسم + بُعد واحد) ──
    const validRows = demoRows.filter(r => {
      if (!r.name?.trim()) return false;
      const hasStrength = Object.values(r.strength || {}).some(v => Number(v) > 0);
      return hasStrength;
    });
    if (validRows.length === 0) {
      showToast("⚠ يجب إدخال اسم شخص واحد على الأقل مع تحديد قوته");
      return;
    }
    setDemoSaving(true);
    const res = await UserAPI.save(sessionToken, { [DEMO_KEY]: demoRows });
    if (res?.success) {
      LocalSession.update({ [DEMO_KEY]: demoRows });
      showToast(`تم حفظ التحليل — ${validRows.length} شخص ✓`);
    } else { showToast(res?.message || "خطأ في الحفظ"); }
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
    if (sessionToken) await UserAPI.save(sessionToken, { dates: newDates });
    LocalSession.update({ dates: newDates });
    return true;
  };

  // ── Confirm ──
  const toggleConfirm = async (key) => {
    const newConf = { ...confirmed, [key]: !confirmed[key] };
    if (!newConf[key]) delete newConf[key];
    setConfirmed(newConf);
    if (sessionToken) await UserAPI.save(sessionToken, { confirmed: newConf });
    LocalSession.update({ confirmed: newConf });
    setSelectedCell(null);
    showToast(newConf[key] ? "تم تأكيد الموعد ✓" : "تم إلغاء التأكيد");
  };

  // ── Final Submit ──
  const doFinalSubmit = async () => {
    setConfirmAction(null);
    const submittedAt = new Date().toISOString();
    if (sessionToken) {
      await UserAPI.save(sessionToken, { dates, confirmed, submitted: true, submittedAt });
    }
    setSubmitted(true);
    setTab("output");
    showToast("تم حفظ الخطة النهائية! ✓");
    // ── إشعار المستشار ──
    try {
      await fetch(`${API_URL}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'plan_submitted',
          name: user.name,
          phone: user.phone,
          email: user.email,
          submittedAt,
          datesCount: Object.keys(dates).length,
          confirmedCount: Object.keys(confirmed).length,
        }),
      });
    } catch (e) { /* إشعار اختياري — لا يوقف التجربة */ }
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
    if (adminToken) AdminAPI.call(adminToken, 'logout').catch(() => {});
    LocalSession.clear();
    AdminSession.clear();
    setScreen("splash"); setUser({ name: "", phone: "", email: "" }); setDates({}); setConfirmed({});
    setSubmitted(false); setReopenRequested(false); setSessionId(null); setSessionToken(null); setTab("matrix"); setRegErrors({});
    setAdminEmail(""); setAdminCode(""); setAdminOtpStep("email"); setAdminToken(null); setAdminError(""); setExpandedReg(null);
    setResumePhone(""); setResumeError(""); setConfirmAction(null);
    setOtpStep("form"); setOtpCode(""); setOtpError(""); setOtpPending(null);
    setOtpLastSent(null); setOtpFailCount(0);
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
    if (sessionToken) await UserAPI.save(sessionToken, { reopenRequested: true });
    setReopenRequested(true);
    showToast("تم إرسال طلب إعادة الفتح للمدير ✓");
  };

  // ── Admin: Unlock a registration ──
  const adminUnlock = async (regId) => {
    const res = await AdminAPI.call(adminToken, 'unlock-reg', { id: regId });
    if (res?.success) {
      showToast('تم فتح التعديل');
      loadRegs();
    } else { showToast(res?.message || 'خطأ'); }
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
    <Landing
      onRegister={() => setScreen("register")}
      onResume={() => setScreen("resume")}
      onAdmin={() => setScreen("admin-login")}
      OPERATIONS={OPERATIONS}
    />
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
              <div className={`fg ${regErrors.name ? "fg-err" : ""}`}><label>الاسم الكامل</label><input placeholder="أدخل اسمك" value={user.name} maxLength={80} onChange={e => { setUser({ ...user, name: e.target.value }); setRegErrors({ ...regErrors, name: "" }); }} />{regErrors.name && <div className="fg-msg">{regErrors.name}</div>}</div>
              <div className={`fg ${regErrors.phone ? "fg-err" : ""}`}><label>رقم الجوال</label><input type="tel" placeholder="05XXXXXXXX" value={user.phone} maxLength={10} onChange={e => { setUser({ ...user, phone: e.target.value }); setRegErrors({ ...regErrors, phone: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.phone && <div className="fg-msg">{regErrors.phone}</div>}</div>
              <div className={`fg ${regErrors.email ? "fg-err" : ""}`}><label>البريد الإلكتروني</label><input type="email" placeholder="email@example.com" value={user.email} maxLength={254} onChange={e => { setUser({ ...user, email: e.target.value }); setRegErrors({ ...regErrors, email: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.email && <div className="fg-msg">{regErrors.email}</div>}</div>
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
                <input type="tel" placeholder="05XXXXXXXX" value={resumePhone} maxLength={10}
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
          <MILogo size={52} color="#14495E"/>
          <div className="auth-left-quote" style={{color:"rgba(255,255,255,0.7)",fontSize:"1rem",marginTop:"1.5rem"}}>
            لوحة إدارة المستشار<br/>
            <span style={{color:"#14495E",fontSize:"0.8rem",letterSpacing:"2px"}}>CONSULTANT DASHBOARD</span>
          </div>
          <div className="auth-left-attr" style={{marginTop:"1rem"}}>Milestone Impact • نسخة المستشار</div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.deep}/><span className="auth-logo-text" style={{color:BRAND.deep}}>لوحة الإدارة</span></div>
          <h1 className="auth-title">دخول المستشار</h1>
          <p className="auth-sub">{adminOtpStep === "email" ? "أدخل بريدك المسجّل لإرسال رمز الدخول" : "أدخل رمز الدخول (من بريدك أو تطبيق المصادقة)"}</p>
          {adminOtpStep === "email" ? (
            <form onSubmit={handleAdminSendCode}>
              <div className={`fg ${adminError ? "fg-err" : ""}`}><label>البريد الإلكتروني</label><input type="email" dir="ltr" placeholder="admin@example.com" value={adminEmail} onChange={e => { setAdminEmail(e.target.value); setAdminError(""); }} />{adminError && <div className="fg-msg">{adminError}</div>}</div>
              <button type="submit" disabled={adminSending} className="btn" style={{background:`linear-gradient(135deg,${BRAND.deep},${BRAND.dark})`}}>{adminSending ? "..." : "إرسال الرمز ←"}</button>
            </form>
          ) : (
            <form onSubmit={handleAdminVerify}>
              <div className={`fg ${adminError ? "fg-err" : ""}`}><label>رمز الدخول (6 أرقام)</label><input inputMode="numeric" dir="ltr" maxLength={6} placeholder="______" value={adminCode} onChange={e => { setAdminCode(e.target.value.replace(/\D/g, "").slice(0,6)); setAdminError(""); }} />{adminError && <div className="fg-msg">{adminError}</div>}</div>
              <button type="submit" disabled={adminSending} className="btn" style={{background:`linear-gradient(135deg,${BRAND.deep},${BRAND.dark})`}}>{adminSending ? "..." : "دخول ←"}</button>
              <button type="button" className="auth-back" onClick={() => { setAdminOtpStep("email"); setAdminError(""); }}>→ تغيير البريد</button>
            </form>
          )}
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
          <div className="nav-logo"><MILogo size={15} color="#14495E"/></div>
          <div>
            <div style={{fontSize:"0.82rem",color:"#fff",fontWeight:700}}>لوحة الإدارة</div>
            <div style={{fontSize:"0.62rem",color:"rgba(255,255,255,0.4)"}}>Milestone Impact</div>
          </div>
        </div>
        <div className="nav-center">
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
      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {[["regs","👥","المسجلين"],["reports","📊","التقارير"],["content","✏","المحتوى"],["stats","📈","إحصائيات"]].map(([k,icon,label])=>(
            <button key={k} className={`bb-btn ${adminTab===k?"on":""}`} onClick={()=>setAdminTab(k)}>
              <span className="bb-icon">{icon}</span>
              <span className="bb-label">{label}</span>
            </button>
          ))}
        </div>
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
          <div className="admin-layout">
            {/* Sidebar — قائمة المسجلين */}
            <div className="admin-sidebar">
              <div className="admin-sidebar-header">
                سجل المشاركين
                <button className="btn btn-s btn-outline" style={{float:"left",marginTop:"-2px"}} onClick={loadRegs}>↻</button>
              </div>
              {loading ? <div style={{padding:"1.5rem",textAlign:"center",color:"var(--text-muted)",fontSize:"0.85rem"}}>جارٍ التحميل...</div>
              : allRegs.length === 0 ? <div style={{padding:"1.5rem",textAlign:"center",color:"var(--text-muted)",fontSize:"0.85rem"}}>لا يوجد مسجلين</div>
              : <div style={{padding:"0.5rem"}}>
                {allRegs.map((r,i) => {
                  const datesCount = r.dates ? Object.keys(r.dates).length : 0;
                  const pct = Math.round((datesCount/16)*100);
                  const initials = r.name ? r.name.split(" ").slice(0,2).map(w=>w[0]).join("") : "?";
                  const trackColors = ["#8B6914","#5B7B3A","#2E6B8A","#6B4E3D"];
                  const avatarColor = trackColors[i % 4];
                  const isSelected = selectedReg?.id === r.id;
                  return (
                    <div key={r.id}
                      style={{
                        display:"flex",alignItems:"center",gap:"0.6rem",
                        padding:"0.65rem 0.75rem",borderRadius:"10px",cursor:"pointer",
                        background:isSelected?"rgba(20, 73, 94,0.1)":"transparent",
                        border:isSelected?"1px solid var(--mi)":"1px solid transparent",
                        marginBottom:"0.25rem",transition:"all 0.15s"
                      }}
                      onClick={()=>{ setSelectedReg(r); setSelectedRegTab("schedule"); }}>
                      <div style={{width:"32px",height:"32px",borderRadius:"50%",background:avatarColor,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:700,flexShrink:0}}>{initials}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"0.82rem",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                        <div style={{fontSize:"0.65rem",color:"var(--text-muted)",display:"flex",gap:"0.3rem",alignItems:"center",marginTop:"0.1rem"}}>
                          <div style={{flex:1,height:"3px",background:"var(--border)",borderRadius:"2px",overflow:"hidden"}}>
                            <div style={{height:"100%",background:avatarColor,borderRadius:"2px",width:`${pct}%`}}/>
                          </div>
                          <span>{datesCount}/16</span>
                          {r.submitted && <span style={{color:"var(--ok)"}}>✓</span>}
                          {r.reopenRequested && <span style={{color:"var(--err)"}}>🔓</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>}
            </div>

            {/* Main — تفاصيل المسجّل */}
            <div className="admin-main">
              {!selectedReg
                ? <div style={{background:"var(--bg-card)",borderRadius:"var(--r-lg)",border:"1px solid var(--border)",padding:"3rem",textAlign:"center"}}>
                    <div style={{fontSize:"2.5rem",marginBottom:"0.75rem",opacity:0.4}}>👤</div>
                    <div style={{fontSize:"1rem",color:"var(--text-muted)",fontFamily:"'Amiri',serif"}}>اختر مشاركاً من القائمة</div>
                  </div>
                : <div style={{background:"var(--bg-card)",borderRadius:"var(--r-lg)",border:"1px solid var(--border)",overflow:"hidden"}}>
                    {/* Header */}
                    <div style={{background:"linear-gradient(135deg,#12161e,#1a2535)",color:"#fff",padding:"1rem 1.3rem",display:"flex",alignItems:"center",gap:"0.75rem"}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'Amiri',serif",fontSize:"1.1rem",fontWeight:700}}>{selectedReg.name}</div>
                        <div style={{fontSize:"0.7rem",opacity:0.55,direction:"ltr"}}>{selectedReg.phone} | {selectedReg.email}</div>
                      </div>
                      <div style={{display:"flex",background:"rgba(0,0,0,0.25)",borderRadius:"8px",padding:"2px",gap:"1px"}}>
                        {[["schedule","📅 المواعيد"],["demo","🗺️ التحليل"],["history","📈 التقدم"]].map(([k,v])=>(
                          <button key={k} className={`reg-modal-tab ${selectedRegTab===k?"on":""}`} onClick={()=>setSelectedRegTab(k)}>{v}</button>
                        ))}
                      </div>
                      <button className="reg-modal-close" onClick={()=>setSelectedReg(null)}>✕</button>
                    </div>
                    {/* Body */}
                    <div style={{padding:"1.3rem",maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
                      {selectedRegTab === "schedule" && <>{(() => {
                        const r = selectedReg;
                        return <>
                          <div style={{overflowX:"auto"}}>
                            <table className="output-table" style={{minWidth:"540px"}}>
                              <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
                              <tbody>{procs.map((p,j)=>{
                                const d=r.dates?.[p.key], c=r.confirmed?.[p.key];
                                return <tr key={p.key}><td>{j+1}</td><td style={{fontWeight:600}}>{p.nameAr}</td><td style={{color:p.trackColor,whiteSpace:"nowrap"}}>{p.trackIcon} {p.trackNameAr}</td><td>{d?fmtGregorian(d):"—"}</td><td style={{color:"#8B6914"}}>{d?gregorianToHijri(d).formatted:"—"}</td><td>{c?<span className="badge badge-ok">✓</span>:d?<span className="badge badge-wait">محدد</span>:"—"}</td></tr>;
                              })}</tbody>
                            </table>
                          </div>
                          {r.submittedAt && <div className="output-stamp" style={{marginTop:"0.8rem"}}><p>تم التقديم: <strong style={{color:BRAND.color}}>{fmtBoth(r.submittedAt).both}</strong></p></div>}
                          {r.submitted && <div style={{marginTop:"0.8rem",textAlign:"center"}}><button className="btn btn-s btn-danger" style={{width:"auto"}} onClick={()=>{ adminUnlock(r.id); setSelectedReg(null); }}>🔓 فتح التعديل</button></div>}
                        </>;
                      })()}</>}
                      {selectedRegTab === "demo" && <>{(!selectedReg[DEMO_KEY]||selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).length===0)
                        ? <div className="empty"><h3>🗺️</h3><p>{appContent.demo_empty_state||'لم يُكمل العميل التحليل الديموغرافي بعد'}</p></div>
                        : <><div className="demo-section-head">{selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).length} شخص في الشبكة</div>
                          <div className="demo-person-grid">
                            {selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).map((person,pi)=>{
                              const scoreColor=(v)=>v>=70?"#27ae60":v>=40?"#2E6B8A":"#aaa";
                              const targets=["knowledge","social","financial","economic"].filter(k=>person.target?.[k]);
                              const targetLabels={knowledge:"معرفي",social:"مجتمعي",financial:"مالي",economic:"اقتصادي"};
                              return <div key={pi} className="demo-person-card">
                                <div className="demo-person-header"><div className="demo-person-num">{pi+1}</div><div><div className="demo-person-name">{person.name}</div><div className="demo-person-role">{[person.position,person.entity,person.relation].filter(Boolean).join(" • ")||"—"}</div></div>{person.location&&<div style={{marginRight:"auto",fontSize:"0.65rem",color:"var(--text-muted)"}}>📍{person.location}</div>}</div>
                                <div className="demo-section-head" style={{marginBottom:"0.4rem"}}>قوة الشخص</div>
                                {[["knowledge","معرفي"],["social","مجتمعي"],["financial","مالي"],["economic","اقتصادي"],["sovereign","سيادي"]].map(([k,label])=>{const val=person.strength?.[k]||0;return <div key={k} className="demo-bar-row"><div className="demo-bar-label">{label}</div><div className="demo-bar-track"><div className="demo-bar-fill" style={{width:`${val}%`,background:scoreColor(val)}}/></div><div className="demo-bar-val" style={{color:scoreColor(val)}}>{val}</div></div>;})}
                                {targets.length>0&&<div className="demo-person-chips">{targets.map(k=><span key={k} className="demo-person-chip" style={{background:"#8B691415",color:"#8B6914",border:"1px solid #8B691430"}}>{targetLabels[k]}</span>)}</div>}
                              </div>;
                            })}
                          </div></>
                      }</>}
                      {selectedRegTab === "history" && (() => {
                        const r = selectedReg;
                        const regDates = r.dates || {};
                        const bookedProcs = procs.filter(p=>regDates[p.key]).sort((a,b)=>new Date(regDates[a.key])-new Date(regDates[b.key]));
                        const totalDays = bookedProcs.length>=2 ? Math.round((new Date(regDates[bookedProcs[bookedProcs.length-1].key])-new Date(regDates[bookedProcs[0].key]))/(1000*60*60*24)) : 0;
                        const confCount = Object.keys(r.confirmed||{}).length;
                        const trackDist=[{id:'creation',name:'الخلق',color:'#8B6914'},{id:'innovation',name:'الإبداع',color:'#5B7B3A'},{id:'establishment',name:'الإنشاء',color:'#2E6B8A'},{id:'making',name:'الجعل',color:'#6B4E3D'}].map(t=>({...t,count:bookedProcs.filter(p=>p.trackId===t.id).length}));
                        return <div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.5rem',marginBottom:'1rem'}}>
                            {[{v:bookedProcs.length,l:'مواعيد',c:'var(--mi-d)'},{v:confCount,l:'مؤكدة',c:'var(--ok)'},{v:totalDays+'d',l:'مدة التخطيط',c:'var(--gold-d)'}].map((s,i)=>(
                              <div key={i} style={{background:'var(--bg-deep)',borderRadius:'12px',padding:'0.75rem 0.5rem',textAlign:'center'}}>
                                <div style={{fontSize:'1.35rem',fontWeight:800,color:s.c}}>{s.v}</div>
                                <div style={{fontSize:'0.63rem',color:'var(--text-muted)'}}>{s.l}</div>
                              </div>
                            ))}
                          </div>
                          <div className="demo-section-head" style={{marginBottom:'0.55rem'}}>توزيع المسارات</div>
                          {trackDist.map(t=><div key={t.id} style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.38rem'}}>
                            <div style={{fontSize:'0.7rem',fontWeight:700,color:t.color,width:'50px',flexShrink:0}}>{t.name}</div>
                            <div style={{flex:1,height:'9px',background:'var(--border)',borderRadius:'5px',overflow:'hidden'}}><div style={{height:'100%',background:t.color,borderRadius:'5px',width:`${(t.count/4)*100}%`}}/></div>
                            <div style={{fontSize:'0.68rem',color:'var(--text-muted)',width:'26px',textAlign:'center'}}>{t.count}/4</div>
                          </div>)}
                          <div className="demo-section-head" style={{margin:'0.75rem 0 0.55rem'}}>مسار التخطيط ({bookedProcs.length} خطوة)</div>
                          {bookedProcs.length===0 ? <div className="empty"><p>لم يحدد أي مواعيد</p></div>
                          : <div style={{position:'relative',paddingRight:'1.2rem'}}>
                              <div style={{position:'absolute',right:'5px',top:0,bottom:0,width:'2px',background:'linear-gradient(180deg,var(--mi-d),var(--border))',borderRadius:'2px'}}/>
                              {bookedProcs.map((p,i)=>{const d=regDates[p.key],isConf=!!(r.confirmed||{})[p.key];return <div key={p.key} style={{position:'relative',paddingRight:'1rem',paddingBottom:'0.6rem'}}>
                                <div style={{position:'absolute',right:'-1.2rem',top:'0.2rem',width:'12px',height:'12px',borderRadius:'50%',border:`2px solid ${p.trackColor}`,background:isConf?p.trackColor:'var(--bg-card)'}}/>
                                <div style={{background:'var(--bg-card)',borderRadius:'10px',padding:'0.55rem 0.7rem',border:`1px solid var(--border)`,borderRight:`3px solid ${p.trackColor}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                  <div><span style={{fontSize:'0.57rem',fontWeight:700,color:'#fff',background:p.trackColor,padding:'0.07rem 0.33rem',borderRadius:'4px',marginLeft:'0.28rem'}}>#{i+1}</span><span style={{fontSize:'0.8rem',fontWeight:700}}>{p.nameAr}</span></div>
                                  <div style={{textAlign:'left',flexShrink:0}}><div style={{fontSize:'0.68rem',color:'var(--mi-d)',fontWeight:700}}>{fmtShort(d)}</div>{isConf&&<div style={{fontSize:'0.58rem',color:'var(--ok)'}}>✓</div>}</div>
                                </div>
                              </div>;})}
                            </div>}
                          <div style={{textAlign:'center',fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'0.75rem',padding:'0.55rem',background:'var(--bg-deep)',borderRadius:'8px'}}>
                            📅 التسجيل: <strong>{r.registeredAt?fmtBoth(r.registeredAt).hijri:'—'}</strong>{r.submittedAt&&<> • ✅ التقديم: <strong>{fmtBoth(r.submittedAt).hijri}</strong></>}
                          </div>
                        </div>;
                      })()}
                    </div>
                  </div>
              }
            </div>
          </div>
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
        <div className="nav-center">
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

      {/* ══ Bottom Bar (mobile) ══ */}
      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {userTabs.map(([k,v,icon]) => (
            <button key={k} className={`bb-btn ${tab===k?"on":""}`} onClick={()=>setTab(k)}>
              <span className="bb-icon">{icon}</span>
              <span className="bb-label">{v}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ════ MATRIX TAB ════ */}
      {tab === "matrix" && <div className="sec sec-pb" style={{animation:"fadeIn 0.4s"}}>

        {/* Context Bar — replaces Banner */}
        <div className="ctx-bar" style={{overflow:"hidden"}}>
          <div className="ctx-stat">
            <span className="ctx-stat-num">{datedCount}</span>
            <span className="ctx-stat-label">/ 16 موعد</span>
          </div>
          <div className="ctx-div"/>
          <div className="ctx-stat">
            <span className="ctx-stat-num">{confirmedCount}</span>
            <span className="ctx-stat-label">مؤكدة</span>
          </div>
          <div className="ctx-div"/>
          <div className="ctx-bar-prog">
            <div className="ctx-bar-track"><div className="ctx-bar-fill" style={{width:`${progressPct}%`}}/></div>
            <span style={{fontSize:".72rem",fontWeight:700,color:"var(--mi-d)",flexShrink:0}}>{progressPct}%</span>
          </div>
          {submitted && <span style={{fontSize:".75rem",color:"var(--ok)",fontWeight:700,marginRight:"auto"}}>🔒 مكتملة</span>}
        </div>

        {/* المصفوفة — Mobile First / Desktop Table */}
        {/* Column headers — desktop only */}
        <div className="mx-col-headers">
          <div className="mx-col-header-empty">
            <div>
              <div className="mx-col-header-label">المحاور</div>
              <div className="mx-col-header-mi">مصفوفة التأثير</div>
            </div>
          </div>
          {PHASES.map(ph => (
            <div key={ph.id} className={`mx-phase-header ${ph.group}`}>
              <div className="mx-phase-num">المرحلة {ph.id}</div>
              <div className="mx-phase-name">{ph.nameAr}</div>
              <div className="mx-phase-group">{ph.groupAr}</div>
            </div>
          ))}
        </div>

        <div className="mx-wrap">
          {TRACKS.map(tr => (
            <div key={tr.id} className="mx-track-section">
              <div className="mx-track-header" style={{background:`linear-gradient(135deg,${tr.color},${tr.color}BB)`,color:"#fff"}}>
                <span className="mx-track-icon">{tr.icon}</span>
                <span className="mx-track-name">{tr.nameAr}</span>
                <span className="mx-track-desc">{tr.contentAr}</span>
                <span className="mx-track-weight" style={{background:"rgba(0,0,0,0.25)"}}>{tr.weight}%</span>
              </div>
              <div className="mx-cells-grid">
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
                      <div className="cell-accent" style={{background:tr.color}}/>
                      <div className="cell-top">
                        <span className="cell-num">#{proc.index+1}</span>
                        {isDone && <span className="cell-check">✓</span>}
                      </div>
                      <div className="cell-name">{op.nameAr}</div>
                      <div className="cell-bottom">
                        <span className="cell-dur">{proc.duration||`${op.dur}w`}</span>
                        {hasD && <span className="cell-date">{fmtShort(dates[key])}</span>}
                      </div>
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
            <div className="modal-pull"/>
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
                <button onClick={openDemoScreen} style={{width:"100%",display:"flex",alignItems:"center",gap:".75rem",padding:".85rem 1rem",border:"none",borderRadius:"12px",background:"linear-gradient(135deg,#8B6914,#C8A45C)",color:"#fff",cursor:"pointer",transition:"all .25s",boxShadow:"0 4px 16px rgba(139,105,20,.3)",fontFamily:"Tajawal,sans-serif"}}
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
                  onClick={()=>{const newD={...dates};const newC={...confirmed};delete newD[selectedCell.key];delete newC[selectedCell.key];setDates(newD);setConfirmed(newC);if(sessionToken){UserAPI.save(sessionToken,{dates:newD,confirmed:newC});}LocalSession.update({dates:newD,confirmed:newC});setTempDate("");showToast("تم حذف التاريخ");}}>
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
              <div className="demo-header-sub">{appContent.demo_screen_sub || 'تفكيك البنية البشرية'}</div>
            </div>
            <div className="demo-header-badge">{demoRows.filter(r => r.name.trim()).length} شخص</div>
          </div>

          {/* Body */}
          <div className="demo-body">

            {/* Intro */}
            <div className="demo-intro">
              <div className="demo-intro-title">🧭 {appContent.demo_intro_title || 'ما هذا النموذج؟'}</div>
              <div className="demo-intro-text">{appContent.demo_intro_text || 'هذه خريطة شبكتك البشرية.'}</div>
            </div>

            {/* Person Cards */}
            {demoRows.map((row, idx) => (
              <div key={row.id} className="demo-card">

                {/* Card Header */}
                <div className="demo-card-header">
                  <div className="demo-card-num">{idx + 1}</div>
                  <div className="demo-card-name">{row.name || `الشخص ${idx + 1}`}</div>
                  <button className="demo-card-remove" onClick={() => removeDemoRow(row.id)}>✕ حذف</button>
                </div>

                <div className="demo-card-body">

                  {/* ── الاسم (full width) ── */}
                  <div className="demo-field-group">
                    <div className="demo-field">
                      <label>الاسم الكامل *</label>
                      <input placeholder="اسم الشخص" value={row.name}
                        onChange={e => updateDemoRow(row.id, 'name', e.target.value)} />
                    </div>
                  </div>

                  {/* ── صفان ── */}
                  <div className="demo-field-row" style={{marginBottom:"0.55rem"}}>
                    <div className="demo-field">
                      <label>الجهة / المؤسسة</label>
                      <input placeholder="الشركة أو الجهة" value={row.entity}
                        onChange={e => updateDemoRow(row.id, 'entity', e.target.value)} />
                    </div>
                    <div className="demo-field">
                      <label>المنصب</label>
                      <input placeholder="الدور" value={row.position}
                        onChange={e => updateDemoRow(row.id, 'position', e.target.value)} />
                    </div>
                  </div>

                  <div className="demo-field-row" style={{marginBottom:"0.55rem"}}>
                    <div className="demo-field">
                      <label>طبيعة العلاقة</label>
                      <select value={row.relation} onChange={e => updateDemoRow(row.id, 'relation', e.target.value)}>
                        <option value="">اختر</option>
                        <option>أقارب</option><option>زملاء</option><option>أصدقاء</option>
                        <option>عملاء</option><option>شركاء</option><option>معارف</option><option>أخرى</option>
                      </select>
                    </div>
                    <div className="demo-field">
                      <label>الموقع الجغرافي</label>
                      <input placeholder="المدينة" value={row.location}
                        onChange={e => updateDemoRow(row.id, 'location', e.target.value)} />
                    </div>
                  </div>

                  <div className="demo-field-group">
                    <div className="demo-field">
                      <label>الحدث المشترك</label>
                      <input placeholder="مثال: زميل عمل، حضرنا نفس البرنامج..." value={row.sharedEvent}
                        onChange={e => updateDemoRow(row.id, 'sharedEvent', e.target.value)} />
                    </div>
                  </div>

                  {/* ── قوة الشخص — Steppers ── */}
                  <div className="demo-sec-title">⚡ قوة الشخص (0–100)</div>
                  <div className="demo-stepper-grid">
                    {[['knowledge','🧠 معرفي','#2E6B8A'],['social','🤝 مجتمعي','#5B7B3A'],['financial','💰 مالي','#8B6914'],['economic','📈 اقتصادي','#6B4E3D'],['sovereign','👑 سيادي','#6B2D8A']].map(([k,label,color]) => {
                      const val = row.strength?.[k] || 0;
                      return (
                        <div key={k} className="demo-stepper-row">
                          <div className="demo-stepper-label">{label}</div>
                          <div className="demo-stepper">
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['strength',k], Math.max(0, val-10))}>−</button>
                            <div className="demo-stepper-track">
                              <div className="demo-stepper-fill" style={{width:`${val}%`,background:color}}/>
                            </div>
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['strength',k], Math.min(100, val+10))}>+</button>
                            <div className="demo-stepper-val" style={{color: val>0 ? color : 'var(--wg)'}}>{val}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── نوع علاقتي به — Steppers ── */}
                  <div className="demo-sec-title">🤝 نوع علاقتي به (0–100)</div>
                  <div className="demo-stepper-grid">
                    {[['knowledge','🧠 معرفي','#2E6B8A'],['social','🤝 مجتمعي','#5B7B3A'],['financial','💰 مالي','#8B6914'],['economic','📈 اقتصادي','#6B4E3D']].map(([k,label,color]) => {
                      const val = row.myRelation?.[k] || 0;
                      return (
                        <div key={k} className="demo-stepper-row">
                          <div className="demo-stepper-label">{label}</div>
                          <div className="demo-stepper">
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['myRelation',k], Math.max(0, val-10))}>−</button>
                            <div className="demo-stepper-track">
                              <div className="demo-stepper-fill" style={{width:`${val}%`,background:color}}/>
                            </div>
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['myRelation',k], Math.min(100, val+10))}>+</button>
                            <div className="demo-stepper-val" style={{color: val>0 ? color : 'var(--wg)'}}>{val}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── المستهدف — Chips 2×2 ── */}
                  <div className="demo-sec-title">🎯 ما أستهدف تفعيله معه</div>
                  <div className="demo-targets">
                    {[['knowledge','🧠 معرفي'],['social','🤝 مجتمعي'],['financial','💰 مالي'],['economic','📈 اقتصادي']].map(([k,label]) => (
                      <div key={k}
                        className={`demo-target-chip ${row.target?.[k] ? 'active' : ''}`}
                        onClick={() => updateDemoRow(row.id, ['target',k], !row.target?.[k])}>
                        {label}
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            ))}

            {/* Add Person */}
            <button className="demo-add-btn" style={{width:"100%",textAlign:"center",marginBottom:"1rem"}} onClick={addDemoRow}>
              + {appContent.demo_add_btn || 'إضافة شخص'}
            </button>

          </div>

          {/* Footer */}
          <div className="demo-footer">
            <span style={{fontSize:"0.76rem",color:"var(--wg)"}}>
              {demoRows.filter(r => r.name.trim()).length} / {demoRows.length} مكتمل
            </span>
            <button className="btn btn-gold btn-s" onClick={saveDemoData} disabled={demoSaving} style={{minWidth:"120px"}}>
              {demoSaving ? "جارٍ الحفظ..." : `💾 ${appContent.demo_save_btn || 'حفظ التحليل'}`}
            </button>
          </div>

        </div>
        </div>
      )}
    </div></>
  );
}
