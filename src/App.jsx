import React, { useState, useEffect, useCallback, useMemo } from "react";
import Landing from './Landing';
import MILogo from './MILogo';
import Icon from './components/Icon';
import Footer from './components/Footer';
import ProcessModal from './components/ProcessModal';
import ConfirmDialog from './components/ConfirmDialog';
import DemographicsScreen from './screens/demographics';
import { API_URL, TRACKS, PHASES, OPERATIONS } from './config/constants';
import { validPhone, validEmail, isPast } from './lib/dateUtils';
import { publicRead, UserAPI, AdminAPI } from './lib/api';
import { LocalSession, AdminSession } from './lib/session';
import useTabHash from './lib/useTabHash';
import { printFinalTable } from './lib/print';
import AdminPanel from './screens/admin';
import { MatrixTab, ScheduleTab, ReportTab, SummaryTab, OutputTab } from './screens/tabs';
import { RegisterScreen, ResumeScreen, AdminLoginScreen } from './screens/auth';
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






const DEMO_CSS = `
.demo-banner{display:flex;align-items:center;justify-content:center;gap:1rem;flex-wrap:wrap;padding:.7rem 1rem;background:#EFE7D8;border-bottom:1px solid rgba(169,122,46,.35);color:#0B272F;font-size:.85rem;text-align:center}
.demo-banner strong{color:#8E6524}
.demo-banner-btn{padding:.45rem 1.1rem;border-radius:2px;border:1px solid #C79A4B;background:#C79A4B;color:#0D0D0F;font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
.demo-banner-btn:hover{filter:brightness(1.08)}
`;

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
  // الجولة التجريبية: بيانات نموذجية بلا تسجيل ولا حفظ على الخادم
  const [demoMode, setDemoMode] = useState(false);

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
  // 'loading' | 'ready' | 'error' — حالة جلب المحتوى الغني
  const [detailsState, setDetailsState] = useState('loading');
  const [highlightedKeys, setHighlightedKeys] = useState([]);
  const [appContent, setAppContent] = useState({});

  // ── التحليل الديموغرافي ──
  const [demoScreen, setDemoScreen] = useState(false); // هل شاشة النموذج مفتوحة
  const [demoRows, setDemoRows] = useState([]); // صفوف البيانات
  const [demoSaving, setDemoSaving] = useState(false);
  // الصفوف تُجلب من الخادم عند فتح الشاشة — تبقى فارغة حتى تصل
  const [demoLoading, setDemoLoading] = useState(false);
  const DEMO_KEY = "demographic_analysis"; // مفتاح الحفظ في DB
  const [selectedReg, setSelectedReg] = useState(null); // المسجّل المفتوح في Modal الأدمن
  const [selectedRegTab, setSelectedRegTab] = useState('schedule'); // تبويب Modal الأدمن

  const hideIntro = useCallback(() => setIntroVisible(false), []);

  // ── Auto-restore local session ──
  useEffect(() => {
    // رابط مباشر للجولة التجريبية: ?demo أو #demo
    if (/[?&]demo\b/.test(window.location.search) || window.location.hash === '#demo') {
      startDemo();
      return;
    }
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

  // Load rich process details + app content (public, read-only tables).
  // تُجلب في الخلفية بعد الإقلاع، فتظل تفاصيل العمليات فارغة حتى تصل —
  // detailsState يخبر الواجهة أن تعرض هيكل انتظار بدل فراغ صامت.
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
        // publicRead يعيد null عند تعذّر الوصول، ومصفوفة عند النجاح.
        // الفشل لا يُلقى استثناءً، فلا يكفي انتظاره في catch وحده.
        setDetailsState(details === null ? 'error' : 'ready');
      } catch (e) {
        console.log('Data not loaded:', e);
        setDetailsState('error');
      }
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
    if (demoMode) { if (!demoRows.length) setDemoRows([emptyDemoRow(), emptyDemoRow(), emptyDemoRow()]); return; }
    if (!sessionToken) return;
    setDemoLoading(true);
    const res = await UserAPI.get(sessionToken);
    const saved = res?.success ? res.registration?.[DEMO_KEY] : null;
    if (Array.isArray(saved) && saved.length > 0) {
      setDemoRows(saved);
    } else {
      setDemoRows([emptyDemoRow(), emptyDemoRow(), emptyDemoRow()]);
    }
    setDemoLoading(false);
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

  // ── الجولة التجريبية ──
  // مواعيد نموذجية بفاصل خمسة أيام تبدأ بعد أسبوع من اليوم، وثلثا العمليات مؤكدة،
  // فيرى الزائر المصفوفة والتقرير والمخرجات ممتلئة كما سيراها بعد التسجيل.
  const startDemo = () => {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    const sampleDates = {};
    const sampleConfirmed = {};
    PHASES.forEach(ph => TRACKS.forEach((tr, ti) => {
      const i = (ph.id - 1) * TRACKS.length + ti;
      const d = new Date(base);
      d.setDate(base.getDate() + 7 + i * 5);
      const key = `${tr.id}-${ph.id}`;
      sampleDates[key] = d.toISOString().slice(0, 10);
      if (i < 11) sampleConfirmed[key] = true;
    }));
    LocalSession.clear();
    setUser({ name: "جولة تجريبية", phone: "", email: "" });
    setSessionId(null);
    setSessionToken(null);
    setDates(sampleDates);
    setConfirmed(sampleConfirmed);
    setSubmitted(false);
    setReopenRequested(false);
    setDemoMode(true);
    setTab("matrix");
    setScreen("main");
  };

  const leaveDemoToRegister = () => {
    setDemoMode(false);
    setUser({ name: "", phone: "", email: "" });
    setDates({}); setConfirmed({}); setSubmitted(false); setTab("matrix");
    if (window.location.hash === '#demo') window.history.replaceState(null, '', window.location.pathname);
    setScreen("register");
  };

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
    if (demoMode) { showToast("هذه خطة تجريبية ولم تُحفظ. سجّل لتبني خطتك الحقيقية"); return; }
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
    setDemoMode(false); setDemoRows([]);
  };

  const logout = () => {
    if (datedCount > 0 && !submitted && !demoMode) {
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
    if (demoMode) { setSubmitted(false); setTab("matrix"); showToast("أُعيد فتح الخطة التجريبية"); return; }
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

  // ── ربط التبويب بالعنوان ──
  // قبل أي return مبكّر: قواعد الخطّافات تمنع استدعاءً مشروطاً.
  // التقرير محجوب حتى ثلاثة مواعيد، والنهائي حتى التقديم — فالقائمة
  // المسموحة تتغيّر مع الحالة، ورابطٌ لتبويب غير متاح يُتجاهل.
  const showReport = datedCount >= 3;
  const allowedTabs = [
    "matrix", "schedule", ...(showReport ? ["report"] : []),
    "summary", ...(submitted ? ["output"] : []),
  ];
  useTabHash({ tab, setTab, allowed: allowedTabs, enabled: screen === "main" });

  // Copyright footer
  // ════════ SPLASH ════════
  if (screen === "splash") return (
    <Landing
      onRegister={() => setScreen("register")}
      onResume={() => setScreen("resume")}
      onAdmin={() => setScreen("admin-login")}
      onDemo={startDemo}
      OPERATIONS={OPERATIONS}
    />
  );

  // ════════ REGISTER ════════
  if (screen === "register") return (
    <RegisterScreen
      otpStep={otpStep}
      setOtpStep={setOtpStep}
      user={user}
      setUser={setUser}
      regErrors={regErrors}
      setRegErrors={setRegErrors}
      otpSending={otpSending}
      otpCode={otpCode}
      setOtpCode={setOtpCode}
      otpError={otpError}
      setOtpError={setOtpError}
      handleRegister={handleRegister}
      handleVerifyOtp={handleVerifyOtp}
      handleResendOtp={handleResendOtp}
      setScreen={setScreen}
    />
  );

  // ════════ RESUME ════════
  if (screen === "resume") return (
    <ResumeScreen
      otpStep={otpStep}
      setOtpStep={setOtpStep}
      user={user}
      otpSending={otpSending}
      otpCode={otpCode}
      setOtpCode={setOtpCode}
      otpError={otpError}
      setOtpError={setOtpError}
      handleResendOtp={handleResendOtp}
      setScreen={setScreen}
      resumePhone={resumePhone}
      setResumePhone={setResumePhone}
      resumeError={resumeError}
      setResumeError={setResumeError}
      resumeLoading={resumeLoading}
      handleResume={handleResume}
      handleResumeVerify={handleResumeVerify}
    />
  );

  // ════════ ADMIN LOGIN ════════
  if (screen === "admin-login") return (
    <AdminLoginScreen
      setScreen={setScreen}
      adminOtpStep={adminOtpStep}
      setAdminOtpStep={setAdminOtpStep}
      adminEmail={adminEmail}
      setAdminEmail={setAdminEmail}
      adminCode={adminCode}
      setAdminCode={setAdminCode}
      adminError={adminError}
      setAdminError={setAdminError}
      adminSending={adminSending}
      handleAdminSendCode={handleAdminSendCode}
      handleAdminVerify={handleAdminVerify}
    />
  );

  // ════════ ADMIN PANEL ════════
  if (screen === "admin") return (
    <AdminPanel
      DEMO_KEY={DEMO_KEY}
      adminReportReg={adminReportReg}
      adminTab={adminTab}
      adminUnlock={adminUnlock}
      allRegs={allRegs}
      appContent={appContent}
      confirmed={confirmed}
      dates={dates}
      expandedContent={expandedContent}
      loadRegs={loadRegs}
      loading={loading}
      logout={logout}
      procs={procs}
      reopenRequested={reopenRequested}
      selectedReg={selectedReg}
      selectedRegTab={selectedRegTab}
      setAdminReportReg={setAdminReportReg}
      setAdminTab={setAdminTab}
      setExpandedContent={setExpandedContent}
      setSelectedReg={setSelectedReg}
      setSelectedRegTab={setSelectedRegTab}
      showToast={showToast}
      submitted={submitted}
      tab={tab}
    />
  );

  // ════════ USER MAIN ════════
  // showReport مُعرَّف أعلاه مع قائمة التبويبات المسموحة، فيبقى المصدر واحداً.
  // الأيقونة الثالثة اسمٌ من مجموعة الهوية الرسمية، لا إيموجي —
  // والهوية تحظر الإيموجي صراحةً. المقابلة دلالية لا زخرفية:
  // كل خلية في المصفوفة نقطة قرار والمعيّن رمزها في الهوية (decision)،
  // والجدول معالمُ على خط زمن (milestone)، والنهائي آخر حلقات
  // سلسلة الأثر (impact).
  const userTabs = [
    ["matrix", "المصفوفة", "decision"],
    ["schedule", "الجدول", "milestone"],
    ...(showReport ? [["report", "التقرير", "report"]] : []),
    ["summary", "المخرجات", "output"],
    ...(submitted ? [["output", "النهائي", "impact"]] : []),
  ];

  return (
    <><style>{CSS + DEMO_CSS}</style><div className="app">

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
          <button className="btn-logout" onClick={logout}>{demoMode ? "إنهاء الجولة" : "خروج"}</button>
        </div>
      </nav>

      {demoMode && (
        <div className="demo-banner" role="status">
          <span>أنت في <strong>الجولة التجريبية</strong>: البيانات نموذجية ولا يُحفظ شيء منها.</span>
          <button className="demo-banner-btn" onClick={leaveDemoToRegister}>ابدأ رحلتك الحقيقية</button>
        </div>
      )}

      {/* ══ Bottom Bar (mobile) ══ */}
      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {userTabs.map(([k,v,icon]) => (
            <button key={k} className={`bb-btn ${tab===k?"on":""}`} onClick={()=>setTab(k)}>
              {/* label={null} — الاسم المرئي تحتها يكفي قارئ الشاشة */}
              <span className="bb-icon"><Icon name={icon} size={20} label={null}/></span>
              <span className="bb-label">{v}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ════ MATRIX TAB ════ */}
      {tab === "matrix" && (
        <MatrixTab
          allDated={allDated}
          appContent={appContent}
          confirmed={confirmed}
          confirmedCount={confirmedCount}
          datedCount={datedCount}
          dates={dates}
          handleSubmit={handleSubmit}
          highlightedKeys={highlightedKeys}
          missingProcs={missingProcs}
          procs={procs}
          progressPct={progressPct}
          reopenRequested={reopenRequested}
          requestReopen={requestReopen}
          selectedCell={selectedCell}
          setDateError={setDateError}
          setHighlightedKeys={setHighlightedKeys}
          setSelectedCell={setSelectedCell}
          setTab={setTab}
          setTempDate={setTempDate}
          showToast={showToast}
          submitted={submitted}
        />
      )}

      {/* ════ SCHEDULE TAB ════ */}
      {tab === "schedule" && (
        <ScheduleTab
          confirmed={confirmed}
          datedCount={datedCount}
          dates={dates}
          procs={procs}
          setDateError={setDateError}
          setSelectedCell={setSelectedCell}
          setTab={setTab}
          setTempDate={setTempDate}
          submitted={submitted}
        />
      )}

      {/* ════ REPORT TAB ════ */}
      {tab === "report" && showReport && (
        <ReportTab
          confirmed={confirmed}
          dates={dates}
          procs={procs}
          user={user}
        />
      )}

      {/* ════ SUMMARY TAB ════ */}
      {tab === "summary" && (
        <SummaryTab
          confirmed={confirmed}
          confirmedCount={confirmedCount}
          datedCount={datedCount}
          dates={dates}
          procs={procs}
          setTab={setTab}
          submitted={submitted}
          tab={tab}
          user={user}
        />
      )}

      {/* ════ OUTPUT TAB ════ */}
      {tab === "output" && submitted && (
        <OutputTab
          confirmed={confirmed}
          dates={dates}
          handlePrint={handlePrint}
          procs={procs}
          user={user}
        />
      )}

      {/* ══ Modal ══ */}
      {selectedCell && (
        <ProcessModal
          appContent={appContent}
          detailsState={detailsState}
          confirmed={confirmed}
          dateError={dateError}
          dates={dates}
          openDemoScreen={openDemoScreen}
          procs={procs}
          saveDate={saveDate}
          selectedCell={selectedCell}
          sessionToken={sessionToken}
          setConfirmed={setConfirmed}
          setDateError={setDateError}
          setDates={setDates}
          setHighlightedKeys={setHighlightedKeys}
          setSelectedCell={setSelectedCell}
          setTempDate={setTempDate}
          showToast={showToast}
          submitted={submitted}
          tempDate={tempDate}
          toggleConfirm={toggleConfirm}
        />
      )}

      {/* ══ Confirm ══ */}
      {confirmAction && (
        <ConfirmDialog
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
      <Footer />

      {/* ═══ شاشة التحليل الديموغرافي ═══ */}
      {demoScreen && (
        <DemographicsScreen
          demoLoading={demoLoading}
          addDemoRow={addDemoRow}
          appContent={appContent}
          demoRows={demoRows}
          demoSaving={demoSaving}
          removeDemoRow={removeDemoRow}
          saveDemoData={saveDemoData}
          screen={screen}
          setDemoScreen={setDemoScreen}
          updateDemoRow={updateDemoRow}
        />
      )}
    </div></>
  );
}
