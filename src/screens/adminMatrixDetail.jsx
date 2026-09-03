import React from "react";
import { BRAND, TRACKS } from "../config/constants";
import { fmtShort, fmtBoth, fmtGregorian, gregorianToHijri } from "../lib/dateUtils";

// ════════════════════════════════════════════════════════════════
// تفاصيل مسجَّل المصفوفة — المواعيد والشبكة والتقدّم
// ════════════════════════════════════════════════════════════════
// خاصٌّ بمصدر «المصفوفة» وحده: بقيةُ المصادر تُعرض من سجلّ الحقول
// عرضاً عامّاً، وهذا المصدر يملك بنيةً أغنى (ستّ عشرة عملية وشبكة
// بشرية ومسار زمنيّ) لا يصفها سجلّ حقول.
//
// انفصل عن اللوحة ليبقى هيكلها مقروءاً: اللوحة توزّع وتحرس، وهذا
// يصيّر.

const DEMO_KEY = "demographic_analysis";

// قيسَ على خلفية البطاقة #FDFAF6 ونصٌّ صغير (عتبة 4.5):
// ‏#27ae60 عند 2.76 و‎#aaa عند 2.23 — يسقطان. والرقم نفسه مكتوب
// بهذا اللون، فالسقوط يمسّ القراءة لا الذوق.
const scoreColor = (v) => (v >= 70 ? "var(--ok)" : v >= 40 ? "#2E6B8A" : "#5C6B70");

const STRENGTHS = [
  ["knowledge", "معرفي"], ["social", "مجتمعي"], ["financial", "مالي"],
  ["economic", "اقتصادي"], ["sovereign", "سيادي"],
];

export default function MatrixDetail({ reg, tab, procs, appContent, canEdit, onUnlock }) {
  if (tab === "schedule") return <Schedule reg={reg} procs={procs} canEdit={canEdit} onUnlock={onUnlock} />;
  if (tab === "demo") return <Network reg={reg} appContent={appContent} />;
  return <Progress reg={reg} procs={procs} />;
}

function Schedule({ reg, procs, canEdit, onUnlock }) {
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="output-table" style={{ minWidth: "540px" }}>
          <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
          <tbody>
            {procs.map((proc, j) => {
              const d = reg.dates?.[proc.key];
              const c = reg.confirmed?.[proc.key];
              return (
                <tr key={proc.key}>
                  <td>{j + 1}</td>
                  <td style={{ fontWeight: 600 }}>{proc.nameAr}</td>
                  <td style={{ color: proc.trackColor, whiteSpace: "nowrap" }}>{proc.trackNameAr}</td>
                  <td>{d ? fmtGregorian(d) : "—"}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{d ? gregorianToHijri(d).formatted : "—"}</td>
                  <td>{c ? <span className="badge badge-ok" role="img" aria-label="مؤكَّد">✓</span> : d ? <span className="badge badge-wait">محدد</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {reg.submittedAt && (
        <div className="output-stamp" style={{ marginTop: "0.8rem" }}>
          <p>تم التقديم: <strong style={{ color: BRAND.color }}>{fmtBoth(reg.submittedAt).both}</strong></p>
        </div>
      )}
      {/* الزرّ يظهر لمن يملك التعديل وحده — والخادم يعيد الفحص */}
      {reg.submitted && canEdit && (
        <div style={{ marginTop: "0.8rem", textAlign: "center" }}>
          <button className="btn btn-s btn-danger" style={{ width: "auto" }} onClick={() => onUnlock(reg.id)}>
            فتح التعديل
          </button>
        </div>
      )}
      {reg.submitted && !canEdit && (
        <p className="adm-hint" style={{ marginTop: "0.8rem", textAlign: "center" }}>
          الخطة مُقدَّمة — وفتح التعديل يحتاج صلاحية تعديل على هذا المصدر.
        </p>
      )}
    </>
  );
}

function Network({ reg, appContent }) {
  const people = (reg[DEMO_KEY] || []).filter((x) => x.name?.trim());
  if (!people.length) {
    return <div className="empty"><p>{appContent.demo_empty_state || "لم يُكمل العميل التحليل الديموغرافي بعد"}</p></div>;
  }
  return (
    <>
      <div className="demo-section-head">{people.length} شخص في الشبكة</div>
      <div className="demo-person-grid">
        {people.map((person, pi) => {
          const targets = ["knowledge", "social", "financial", "economic"].filter((k) => person.target?.[k]);
          const labels = { knowledge: "معرفي", social: "مجتمعي", financial: "مالي", economic: "اقتصادي" };
          return (
            <div key={pi} className="demo-person-card">
              <div className="demo-person-header">
                <div className="demo-person-num">{pi + 1}</div>
                <div>
                  <div className="demo-person-name">{person.name}</div>
                  <div className="demo-person-role">
                    {[person.position, person.entity, person.relation].filter(Boolean).join(" • ") || "—"}
                  </div>
                </div>
                {person.location && (
                  <div style={{ marginRight: "auto", fontSize: "0.65rem", color: "var(--text-muted)" }}>{person.location}</div>
                )}
              </div>
              <div className="demo-section-head" style={{ marginBottom: "0.4rem" }}>قوة الشخص</div>
              {STRENGTHS.map(([k, label]) => {
                const val = person.strength?.[k] || 0;
                return (
                  <div key={k} className="demo-bar-row">
                    <div className="demo-bar-label">{label}</div>
                    <div className="demo-bar-track"><div className="demo-bar-fill" style={{ width: `${val}%`, background: scoreColor(val) }} /></div>
                    <div className="demo-bar-val" style={{ color: scoreColor(val) }}>{val}</div>
                  </div>
                );
              })}
              {targets.length > 0 && (
                <div className="demo-person-chips">
                  {targets.map((k) => (
                    <span key={k} className="demo-person-chip"
                      style={{ background: "rgba(169,122,46,0.08)", color: "var(--petrol-deep)", border: "1px solid rgba(169,122,46,0.30)" }}>
                      {labels[k]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Progress({ reg, procs }) {
  const regDates = reg.dates || {};
  const booked = procs.filter((p) => regDates[p.key])
    .sort((a, b) => new Date(regDates[a.key]) - new Date(regDates[b.key]));
  const totalDays = booked.length >= 2
    ? Math.round((new Date(regDates[booked[booked.length - 1].key]) - new Date(regDates[booked[0].key])) / 86400000)
    : 0;
  const confCount = Object.keys(reg.confirmed || {}).length;
  const trackDist = TRACKS.map((t) => ({
    id: t.id, name: t.nameAr, color: t.color,
    count: booked.filter((p) => p.trackId === t.id).length,
    // المقام عدد عمليات هذا المسار لا عمليات المصفوفة كلها
    max: procs.filter((p) => p.trackId === t.id).length || 1,
  }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.5rem", marginBottom: "1rem" }}>
        {[{ v: booked.length, l: "مواعيد", c: "var(--mi-d)" },
          { v: confCount, l: "مؤكدة", c: "var(--ok)" },
          { v: totalDays + "d", l: "مدة التخطيط", c: "var(--gold-d)" }].map((s, i) => (
          <div key={i} style={{ background: "var(--bg-deep)", borderRadius: "2px", padding: "0.75rem 0.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: "0.63rem", color: "var(--text-muted)" }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div className="demo-section-head" style={{ marginBottom: "0.55rem" }}>توزيع المسارات</div>
      {trackDist.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.38rem" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: t.color, width: "50px", flexShrink: 0 }}>{t.name}</div>
          <div style={{ flex: 1, height: "9px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ height: "100%", background: t.color, borderRadius: "2px", width: `${(t.count / t.max) * 100}%` }} />
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", width: "30px", textAlign: "center" }}>{t.count}/{t.max}</div>
        </div>
      ))}
      <div className="demo-section-head" style={{ margin: "0.75rem 0 0.55rem" }}>مسار التخطيط ({booked.length} خطوة)</div>
      {booked.length === 0 ? <div className="empty"><p>لم يحدد أي مواعيد</p></div> : (
        <div style={{ position: "relative", paddingRight: "1.2rem" }}>
          <div style={{ position: "absolute", right: "5px", top: 0, bottom: 0, width: "2px", background: "var(--mi-d)", borderRadius: "2px" }} />
          {booked.map((p, i) => {
            const d = regDates[p.key];
            const isConf = !!(reg.confirmed || {})[p.key];
            return (
              <div key={p.key} style={{ position: "relative", paddingRight: "1rem", paddingBottom: "0.6rem" }}>
                <div style={{ position: "absolute", right: "-1.2rem", top: "0.2rem", width: "12px", height: "12px", borderRadius: "50%", border: `2px solid ${p.trackColor}`, background: isConf ? p.trackColor : "var(--bg-card)" }} />
                <div style={{ background: "var(--bg-card)", borderRadius: "2px", padding: "0.55rem 0.7rem", border: "1px solid var(--border)", borderRight: `3px solid ${p.trackColor}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: "0.57rem", fontWeight: 700, color: "#fff", background: p.trackColor, padding: "0.07rem 0.33rem", borderRadius: "2px", marginLeft: "0.28rem" }}>#{i + 1}</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{p.nameAr}</span>
                  </div>
                  <div style={{ textAlign: "left", flexShrink: 0 }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--mi-d)", fontWeight: 700 }}>{fmtShort(d)}</div>
                    {isConf && <div style={{ fontSize: "0.58rem", color: "var(--ok)" }}>✓</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ textAlign: "center", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.75rem", padding: "0.55rem", background: "var(--bg-deep)", borderRadius: "2px" }}>
        التسجيل: <strong>{reg.registeredAt ? fmtBoth(reg.registeredAt).hijri : "—"}</strong>
        {reg.submittedAt && <> • التقديم: <strong>{fmtBoth(reg.submittedAt).hijri}</strong></>}
      </div>
    </div>
  );
}
