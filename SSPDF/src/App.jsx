import { useState, useMemo, useEffect } from "react";
import { repo } from "./lib/repository";
import { supabase } from "./lib/supabaseClient";
import {
  B, SERVICES0, SEGMENTS0, CRITERIA0, SEED, TEAM0, AUDIT0, roleInfo,
} from "./lib/theme";
import { now, calcScore, bucket } from "./lib/calc";
import { AuthShell, CheckingScreen, LoginScreen } from "./components/auth-screens";
import { Portal } from "./screens/discovery";
import { Dashboard } from "./screens/dashboard";
import { Library, Combos } from "./screens/discovery";
import { Criteria, Scoring } from "./screens/evaluation";
import { Risk, Analysis } from "./screens/analysisScreens";
import { Decision, Audit, Team } from "./screens/decisionScreens";
import { Compare } from "./screens/compare";

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

  const [authState, setAuthState] = useState(repo ? "checking" : "misconfigured");
  const [authUser, setAuthUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const slugify = (text) =>
    (text || "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const projectSlug = (p) => slugify(p?.name_en) || p?.id || "";

  const parseHash = () => {
    const h = window.location.hash.replace(/^#\/?/, "");
    const [slug, scr] = h.split("/");
    return { slug: slug || null, scr: scr || null };
  };

  const switchProject = async (projectId, knownRole, initialScreen = "dashboard") => {
    const d = await repo.load(projectId).catch((e) => { console.warn(e); return null; });
    if (!d) return;
    setServices(d.services); setSegments(d.segments); setCriteria(d.criteria);
    setEvals(d.evals); setAudit(d.audit.length ? d.audit : []); setTeam(d.team);
    setCurrentProject({ id: d.project.id, name: d.project.name, name_en: d.project.name_en, status: d.project.status });
    setRole(knownRole || myProjects.find((pr) => pr.id === projectId)?.myRole || "viewer");
    setScreen(initialScreen);
    window.location.hash = `#/${slugify(d.project.name_en) || projectId}/${initialScreen}`;
  };

  /* حفظ مكانك في رابط الصفحة — يمنع العودة للمشروع الافتراضي عند مغادرة الصفحة والرجوع إليها */
  useEffect(() => {
    if (!currentProject) return;
    const target = `#/${projectSlug(currentProject)}/${screen}`;
    if (window.location.hash !== target) window.location.hash = target;
  }, [screen, currentProject?.id]);

  useEffect(() => {
    const onHashChange = () => {
      const { slug, scr } = parseHash();
      if (slug && slug !== projectSlug(currentProject)) {
        const proj = myProjects.find((p) => projectSlug(p) === slug);
        if (proj) switchProject(proj.id, proj.myRole, scr || "dashboard");
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
        const { slug, scr } = parseHash();
        const restored = slug && projects.find((p) => projectSlug(p) === slug);
        if (slug && !restored) setAccessError("لا تملك صلاحية الوصول لهذا المشروع، أو أنه لم يعد موجوداً. تم فتح أحدث مشروع لديك بدلاً منه.");
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

  const saveProjectEdit = async (projectId, name, nameEn) => {
    try {
      await repo.updateProject(projectId, { name: name.trim(), nameEn: nameEn.trim() });
      const updated = await repo.listMyProjects();
      setMyProjects(updated);
      if (currentProject?.id === projectId) {
        setCurrentProject((cp) => ({ ...cp, name: name.trim(), name_en: nameEn.trim() }));
      }
      log("تعديل مشروع", name.trim());
    } catch (e) {
      alert("تعذّر حفظ التعديل: " + e.message);
    }
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

  if (!repo || authState === "misconfigured") {
    return (
      <AuthShell>
        <div className="text-sm font-bold mb-2" style={{ color: B.bad }}>⚠️ التطبيق غير مُهيَّأ بشكل صحيح</div>
        <div className="text-xs" style={{ color: B.muted }}>تعذّر الاتصال بقاعدة البيانات. تواصل مع الفريق التقني.</div>
      </AuthShell>
    );
  }
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
    addTeamMember, removeTeamMember, teamError,
    ranked, top, totalW, confIdx, lastUpdate,
    comboName, toggleCombo, setScore, setConf, setEvidence, setRisk, setWeight, normalizeW, log,
    setScreen,
    myProjects, currentProject, switchProject, showNewProjectForm, setShowNewProjectForm, compareAllProjects,
    npName, setNpName, npNameEn, setNpNameEn, npDesc, setNpDesc, npTemplateId, setNpTemplateId, handleCreateProject, projectBusy, saveProjectEdit,
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
          <span style={{ color: B.muted }}>الدور: <span className="font-bold" style={{ color: B.petrol }}>{roleInfo(role).ar}</span></span>
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
        <main className="flex-1 p-3 sm:p-5 md:p-8 max-w-6xl mx-auto w-full">
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
