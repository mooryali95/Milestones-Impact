import React, { useMemo, useState } from "react";
import Icon from "../components/Icon";
import MILogo from "../MILogo";
import Footer from "../components/Footer";
import StateNotice from "../components/StateNotice";
import { BRAND } from "../config/constants";
import { SOURCES, FIELD } from "../config/sources";
import { CAN, can, canManageAccess, visibleSources } from "../lib/permissions";
import { RESULT } from "../lib/api";
import { fmtBoth, fmtShort } from "../lib/dateUtils";
import { analyzeBookings } from "../lib/analysis";
import { CSS } from "../styles/appCss";
import MatrixDetail from "./adminMatrixDetail";
import AdminAccess from "./adminAccess";
import AdminAnalytics from "./adminAnalytics";

// ════════════════════════════════════════════════════════════════
// ADMIN PANEL — لوحة المستشار
// ════════════════════════════════════════════════════════════════
// كانت اللوحة تعرف مصدراً واحداً (تسجيلات المصفوفة) وتفترض شكله في
// شيفرتها. فطلبات الموقع — وهي تصل إلى contact_requests منذ نُشر
// الموقع — لم يرها المستشار قطّ.
//
// الآن: «الوارد» واحدٌ يجمع كل المصادر المسجَّلة في sources.js،
// كلُّ صفٍّ موسومٌ بمصدره ولونه، ومرشِّحٌ يعزل مصدراً بعينه. والتفاصيل
// تُصيَّر من وصف الحقول، فنموذجٌ جديد غداً يظهر بلا لمس هذا الملف.
//
// وكل تبويبٍ وكل إجراءٍ محروسٌ بإذن. وحراسة الواجهة عرضٌ لا منع —
// الخادم يعيد الفحص، والعقد في server/admin-api-contract.md.

const FIXED_TABS = [
  { id: "reports", labelAr: "التقارير", icon: "report" },
  { id: "analytics", labelAr: "التحليلات", icon: "growth" },
  // «الحوكمة» أقرب ما في مجموعة الهوية إلى ضبط الوصول — ولا يوجد قفل
  { id: "access", labelAr: "الوصول", icon: "governance" },
];

// قيمةُ حقلٍ بحسب نوعه المُعلَن في السجلّ
function FieldValue({ field, value }) {
  if (value === null || value === undefined || value === "") return <span className="fv-empty">—</span>;
  switch (field.type) {
    case FIELD.DATE: return <span>{fmtBoth(value).both}</span>;
    case FIELD.EMAIL: return <a href={`mailto:${value}`} className="fv-link" dir="ltr">{value}</a>;
    case FIELD.PHONE: return <a href={`tel:${value}`} className="fv-link" dir="ltr">{value}</a>;
    case FIELD.BADGE: return <span className="badge badge-wait">{value}</span>;
    case FIELD.LINK: return <a href={value} className="fv-link" dir="ltr" target="_blank" rel="noreferrer noopener">{value}</a>;
    case FIELD.LONG: return <p className="fv-long">{value}</p>;
    default: return <span>{value}</span>;
  }
}

function statusOf(source, row) {
  for (const s of source.statuses || []) if (s.match(row)) return s;
  return null;
}

const AdminPanel = (p) => {
  const {
    adminEmail, adminReportReg, adminTab, adminUnlock, appContent, expandedContent,
    loading, logout, myPerms, procs, reload, rows, setAdminReportReg, setAdminTab,
    setExpandedContent, setSelectedReg, setSelectedRegTab, selectedReg, selectedRegTab,
    showToast, accessState, admins, savePermissions, savingPerms,
    analyticsState, analyticsData, analyticsRange, setAnalyticsRange,
  } = p;

  const [filter, setFilter] = useState("all");     // معرّف مصدر أو "all"
  const [query, setQuery] = useState("");

  const mine = useMemo(() => visibleSources(myPerms, SOURCES), [myPerms]);
  const canAccess = canManageAccess(myPerms);

  // كل الصفوف من كل مصدرٍ مرئيّ، موسومةً بمصدرها ومرتّبةً بالأحدث.
  const inbox = useMemo(() => {
    const all = [];
    for (const s of mine) {
      const bundle = rows[s.id];
      if (!bundle || bundle.state !== RESULT.OK) continue;
      for (const row of bundle.data) {
        all.push({ source: s, row, when: row[s.dateKey] ? new Date(row[s.dateKey]).getTime() : 0 });
      }
    }
    return all.sort((a, b) => b.when - a.when);
  }, [mine, rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inbox.filter(({ source, row }) => {
      if (filter !== "all" && source.id !== filter) return false;
      if (!q) return true;
      return source.fields.some((f) => String(row[f.key] || "").toLowerCase().includes(q));
    });
  }, [inbox, filter, query]);

  // حالةٌ جامعة للوارد: إن لم ينجح أيّ مصدر، اعرض سبب الأول بدل فراغ.
  const inboxProblem = useMemo(() => {
    if (!mine.length) return null;
    const ok = mine.some((s) => rows[s.id]?.state === RESULT.OK);
    if (ok) return null;
    const first = mine.map((s) => rows[s.id]).find(Boolean);
    return first || { state: RESULT.ERROR, message: "لم تُطلب البيانات بعد" };
  }, [mine, rows]);

  // تبويبٌ لا يملك محتواه لا يُعرض أصلاً — أهون من فتحه على رفض.
  const tabs = [
    { id: "inbox", labelAr: "الوارد", icon: "process" },
    ...FIXED_TABS.filter((t) => {
      if (t.id === "access") return canAccess;
      if (t.id === "reports") return can(myPerms, "matrix", CAN.VIEW);
      return true;
    }),
  ];

  // ── الأذونات لم تصل بعد ──
  if (!myPerms) {
    return (
      <><style>{CSS}</style><div className="app">
        <nav className="nav nav-admin"><div className="nav-brand">
          <div className="nav-logo"><MILogo size={15} color="#14495E" /></div>
          <div><div style={{ fontSize: "0.82rem", color: "#fff", fontWeight: 700 }}>لوحة الإدارة</div></div>
        </div><div className="nav-right"><button className="btn-logout" onClick={logout}>خروج</button></div></nav>
        <div className="sec">
          <div className="notice notice-wait">
            <h3>جارٍ التحقّق من صلاحياتك</h3>
            <p>
              لا تُعرض اللوحة قبل أن يقول الخادم ما تملكه — عرضُها ثم إخفاء ما لا تملك
              يكشف ما لا ينبغي أن يُرى.
            </p>
            <p className="notice-detail">
              إن طال هذا، فالغالب أن إجراء <strong>whoami</strong> لم يُنفَّذ في admin-api بعد.
              الخطوات في <strong>server/admin-api-contract.md</strong>.
            </p>
            <button className="btn btn-s btn-outline" style={{ marginTop: ".7rem", width: "auto" }} onClick={reload}>
              إعادة المحاولة
            </button>
          </div>
        </div>
        <Footer />
      </div></>
    );
  }

  return (
    <><style>{CSS}</style><div className="app">

      <nav className="nav nav-admin">
        <div className="nav-brand">
          <div className="nav-logo"><MILogo size={15} color="#14495E" /></div>
          <div>
            <div style={{ fontSize: "0.82rem", color: "#fff", fontWeight: 700 }}>لوحة الإدارة</div>
            <div style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.55)" }} dir="ltr">{adminEmail || "Milestone Impact"}</div>
          </div>
        </div>
        <div className="nav-center">
          <div className="tabs">
            {tabs.map((t) => (
              <button key={t.id} className={`tab ${adminTab === t.id ? "on" : ""}`} onClick={() => setAdminTab(t.id)}>{t.labelAr}</button>
            ))}
          </div>
        </div>
        <div className="nav-right"><button className="btn-logout" onClick={logout}>خروج</button></div>
      </nav>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {tabs.map((t) => (
            <button key={t.id} className={`bb-btn ${adminTab === t.id ? "on" : ""}`} onClick={() => setAdminTab(t.id)}>
              <span className="bb-icon"><Icon name={t.icon} size={18} /></span>
              <span className="bb-label">{t.labelAr}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sec" style={{ animation: "fadeIn 0.4s" }}>

        {/* ══ الوارد ══ */}
        {adminTab === "inbox" && (
          !mine.length ? (
            <div className="notice notice-deny">
              <h3>لا تملك صلاحية عرض أي مصدر</h3>
              <p>اطلب من صاحب إدارة الوصول أن يمنحك إذن العرض على ما تحتاجه.</p>
            </div>
          ) : (
            <>
              <div className="stat-grid stat-grid-auto">
                {mine.map((s) => {
                  const b = rows[s.id];
                  const n = b?.state === RESULT.OK ? b.data.length : null;
                  return (
                    <div key={s.id} className="stat" style={{ borderTopColor: s.color }}>
                      <div className="stat-v" style={{ color: s.color }}>{n === null ? "—" : n}</div>
                      <div className="stat-l">{s.nameAr}</div>
                    </div>
                  );
                })}
              </div>

              <div className="inbox-bar">
                <div className="src-filters">
                  <button className={`src-chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
                    الكل <span className="src-chip-n">{inbox.length}</span>
                  </button>
                  {mine.map((s) => (
                    <button key={s.id} className={`src-chip ${filter === s.id ? "on" : ""}`} onClick={() => setFilter(s.id)}>
                      <span className="src-dot" style={{ background: s.color }} aria-hidden="true" />
                      {s.nameAr}
                      <span className="src-chip-n">{inbox.filter((i) => i.source.id === s.id).length}</span>
                    </button>
                  ))}
                </div>
                <div className="inbox-actions">
                  <label className="sr-only" htmlFor="inbox-q">بحث في الوارد</label>
                  <input id="inbox-q" className="inbox-search" type="search" placeholder="بحث بالاسم أو الجهة أو البريد…"
                    value={query} onChange={(e) => setQuery(e.target.value)} />
                  <button className="btn btn-s btn-outline" onClick={reload} aria-label="تحديث الوارد">↻</button>
                </div>
              </div>

              {/* أسبابُ عدم وصول مصدرٍ بعينه — كلٌّ باسمه، لا صمت */}
              {mine.map((s) => {
                const b = rows[s.id];
                if (!b || b.state === RESULT.OK) return null;
                return (
                  <div key={s.id} className="src-problem">
                    <span className="src-dot" style={{ background: s.color }} aria-hidden="true" />
                    <strong>{s.nameAr}</strong>
                    <StateNotice state={b.state} message={b.message} onRetry={reload} />
                  </div>
                );
              })}

              {loading && <div className="adm-hint" style={{ padding: "1rem", textAlign: "center" }}>جارٍ التحميل…</div>}

              {!loading && inboxProblem === null && filtered.length === 0 && (
                <div className="empty">
                  <h3>{query || filter !== "all" ? "لا نتائج لهذا الترشيح" : "الوارد فارغ"}</h3>
                  <p>{query || filter !== "all" ? "جرّب مصدراً آخر أو امسح البحث." : "لم يصل أي طلب بعد."}</p>
                </div>
              )}

              <div className="inbox-list">
                {filtered.map(({ source, row }) => {
                  const st = statusOf(source, row);
                  const id = row[source.idKey];
                  const open = selectedReg?.id === id && selectedReg?.__source === source.id;
                  return (
                    <div key={`${source.id}:${id}`} className={`inbox-row ${open ? "on" : ""}`}
                      style={{ borderRightColor: source.color }}
                      onClick={() => { setSelectedReg(open ? null : { ...row, id, __source: source.id }); setSelectedRegTab("schedule"); }}>
                      <div className="inbox-row-main">
                        <div className="inbox-row-title">{row[source.titleKey] || "بلا اسم"}</div>
                        <div className="inbox-row-meta">
                          {/* الجواب على «من أين جاء هذا؟» — في كل صفّ، لا في تبويب */}
                          <span className="src-tag" style={{ color: source.color, borderColor: `${source.color}55` }}>
                            <span className="src-dot" style={{ background: source.color }} aria-hidden="true" />
                            {source.nameAr}
                          </span>
                          {st && <span className="badge badge-wait">{st.labelAr}</span>}
                          {row[source.dateKey] && <span className="inbox-row-date">{fmtShort(row[source.dateKey])}</span>}
                        </div>
                      </div>
                      <span className="inbox-row-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
                    </div>
                  );
                })}
              </div>

              {/* ── التفاصيل ── */}
              {selectedReg && (() => {
                const source = SOURCES.find((s) => s.id === selectedReg.__source);
                if (!source) return null;
                const isMatrix = source.id === "matrix";
                return (
                  <div className="detail-card">
                    <div className="detail-head" style={{ background: source.color }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="detail-name">{selectedReg[source.titleKey]}</div>
                        <div className="detail-where">{source.whereAr}</div>
                      </div>
                      {isMatrix && (
                        <div className="reg-modal-tabs">
                          {[["schedule", "المواعيد"], ["demo", "الشبكة"], ["history", "التقدم"]].map(([k, v]) => (
                            <button key={k} className={`reg-modal-tab ${selectedRegTab === k ? "on" : ""}`} onClick={() => setSelectedRegTab(k)}>{v}</button>
                          ))}
                        </div>
                      )}
                      <button className="reg-modal-close" aria-label="إغلاق التفاصيل" onClick={() => setSelectedReg(null)}>✕</button>
                    </div>
                    <div className="detail-body">
                      {isMatrix ? (
                        <MatrixDetail reg={selectedReg} tab={selectedRegTab} procs={procs} appContent={appContent}
                          canEdit={can(myPerms, source.id, CAN.EDIT)}
                          onUnlock={(regId) => { adminUnlock(regId); setSelectedReg(null); }} />
                      ) : (
                        <dl className="field-list">
                          {source.fields.map((f) => (
                            <div key={f.key} className="field-row">
                              <dt>{f.labelAr}</dt>
                              <dd><FieldValue field={f} value={selectedReg[f.key]} /></dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {!can(myPerms, source.id, CAN.EXPORT) && (
                        <p className="adm-hint" style={{ marginTop: ".8rem" }}>التصدير يحتاج صلاحية تصدير على هذا المصدر.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )
        )}

        {/* ══ التقارير — تحليل المصفوفة ══ */}
        {adminTab === "reports" && (() => {
          const src = SOURCES.find((s) => s.id === "matrix");
          if (!can(myPerms, "matrix", CAN.VIEW)) {
            return <StateNotice state={RESULT.DENIED} message="التقارير مبنيّة على تسجيلات المصفوفة." />;
          }
          const bundle = rows.matrix;
          if (!bundle || bundle.state !== RESULT.OK) {
            return <StateNotice state={bundle?.state || RESULT.ERROR} message={bundle?.message} onRetry={reload} />;
          }
          return (
            <>
              <div className="sec-head"><h2 className="sec-title">تقارير العملاء</h2></div>
              {bundle.data.length === 0 && <div className="empty"><h3>لا يوجد مسجلين</h3></div>}
              {bundle.data.map((reg) => {
                const a = analyzeBookings(procs, reg.dates || {}, reg.confirmed || {});
                const bookedCount = Object.keys(reg.dates || {}).length;
                const isOpen = adminReportReg === reg.id;
                return (
                  <div key={reg.id} className="adm-consultant">
                    <div className="adm-edit-header" onClick={() => setAdminReportReg(isOpen ? null : reg.id)}>
                      <h4>
                        <span className="src-dot" style={{ background: src.color }} aria-hidden="true" />
                        {reg.name} — {bookedCount} حجوزات {a ? `• نمط ${a.pattern.nameAr}` : "• أقل من 3"}
                      </h4>
                      <span>{isOpen ? "▲" : "▼"}</span>
                    </div>
                    {isOpen && (!a ? <p className="adm-hint">أقل من 3 حجوزات</p> : (
                      <>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                          <div className="rpt-stat" style={{ flex: 1 }}><div className="rpt-stat-v" style={{ color: BRAND.color, fontSize: "1.1rem" }}>{a.pattern.nameAr}</div><div className="rpt-stat-l">النمط</div></div>
                          <div className="rpt-stat" style={{ flex: 1 }}><div className="rpt-stat-v" style={{ color: "var(--ok)" }}>{a.trackCoverage.covered}/4</div><div className="rpt-stat-l">مسارات</div></div>
                          <div className="rpt-stat" style={{ flex: 1 }}><div className="rpt-stat-v" style={{ color: "var(--petrol-mid)" }}>{a.readinessAr}</div><div className="rpt-stat-l">الجاهزية</div></div>
                        </div>
                        <div className="adm-note"><strong>الزمن بين الحجوزات:</strong> {(() => {
                          const v = Object.values(reg.dates || {}).sort();
                          if (v.length < 2) return "حجز واحد فقط";
                          const d = Math.round((new Date(v[v.length - 1]) - new Date(v[0])) / 86400000);
                          return d === 0 ? "حجز كل المواعيد دفعة واحدة" : d <= 7 ? `${d} يوم — قرار سريع` : `${d} يوم — استكشاف متأنٍ`;
                        })()}</div>
                        <div className="adm-note"><strong>نقاط نقاش:</strong> {
                          a.patternId === "sequential" ? "يميل للتعمق — ناقش التوسع"
                            : a.patternId === "breadthFirst" ? "يميل للاستكشاف — ناقش التعمق"
                              : a.patternId === "foundationFocused" ? "يركز على التأسيس — ناقش الانتقال"
                                : "نمط تكاملي — ناقش الأولويات"}</div>
                        {a.depGaps.length > 0 && (
                          <div className="adm-note adm-note-warn"><strong>تبعيات مفقودة:</strong> {a.depGaps.map((g) => `${g.process} ← ${g.missing}`).join(" | ")}</div>
                        )}
                        {a.recommendations.map((rec, i) => <div key={i} className="rpt-rec"><span>{rec}</span></div>)}
                      </>
                    ))}
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* ══ التحليلات ══ */}
        {adminTab === "analytics" && (
          <AdminAnalytics state={analyticsState.state} data={analyticsData} message={analyticsState.message}
            range={analyticsRange} setRange={setAnalyticsRange} onRetry={reload} />
        )}

        {/* ══ الوصول ══ */}
        {adminTab === "access" && (
          <AdminAccess state={accessState.state} admins={admins} message={accessState.message}
            myEmail={adminEmail} onSave={savePermissions} saving={savingPerms} onRetry={reload} />
        )}

        {/* المحتوى — مرجعٌ للمستشار، والتحرير في Supabase مباشرة */}
        {adminTab === "content" && (
          <>
            <div className="sec-head"><h2 className="sec-title">المحتوى</h2></div>
            <div className="adm-consultant">
              <h4>المحتوى يُدار من قاعدة البيانات مباشرة</h4>
              <p className="adm-note" style={{ marginTop: "0.5rem" }}>
                النصوص في جدولَي <strong>app_content</strong> و<strong>process_details</strong>.
              </p>
            </div>
            {procs.map((proc) => {
              const isOpen = expandedContent === proc.key;
              return (
                <div key={proc.key} className="adm-edit-card">
                  <div className="adm-edit-header" onClick={() => setExpandedContent(isOpen ? null : proc.key)}>
                    <h4 style={{ color: proc.trackColor }}>{proc.nameAr}</h4>
                    <span>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && ["insight", "why_it_matters", "description"].map((field) => (
                    <div key={field} className="adm-field">
                      <label htmlFor={`adm-${proc.key}-${field}`}>
                        {{ insight: "البصيرة المنهجية", why_it_matters: "لماذا يهم", description: "الوصف التفصيلي" }[field]}
                      </label>
                      <textarea id={`adm-${proc.key}-${field}`} rows={2} readOnly
                        defaultValue={field === "insight" ? proc.insight : field === "why_it_matters" ? proc.whyItMatters : proc.fullDesc}
                        onBlur={() => showToast("التعديل يتم عبر Supabase مباشرة")} />
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}

      </div>
      <Footer />
    </div></>
  );
};

export default AdminPanel;
