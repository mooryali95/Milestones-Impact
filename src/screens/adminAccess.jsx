import React, { useState } from "react";
import { SOURCES } from "../config/sources";
import { CAN_LIST, normalize, summarize } from "../lib/permissions";
import { RESULT } from "../lib/api";
import StateNotice from "../components/StateNotice";

// ════════════════════════════════════════════════════════════════
// إدارة الوصول — من يرى ماذا
// ════════════════════════════════════════════════════════════════
// مصفوفةٌ صريحة: صفٌّ لكل مستشار، ومربّعٌ لكل (مصدر × فعل). لا
// أدوار جاهزة، فالدور يُخفي ما يملكه الشخص فعلاً خلف اسم.
//
// ولا تُعرض هذه الشاشة إلا لمن يملك manage_access — والخادم يعيد
// فحصه، فإخفاء التبويب ليس منعاً.

export default function AdminAccess({ state, admins, message, myEmail, onSave, saving, onRetry }) {
  const [draft, setDraft] = useState(null);   // { email, manage_access, sources }
  const [error, setError] = useState("");

  if (state !== RESULT.OK) {
    return <StateNotice state={state} message={message} onRetry={onRetry}
      emptyTitle="لا مستشارين" emptyBody="لم يُسجَّل أحدٌ في جدول الصلاحيات بعد." />;
  }

  const startEdit = (a) => {
    const p = normalize({ manage_access: a.manage_access, sources: a.sources });
    setDraft({ email: a.email, manage_access: p?.manage_access || false, sources: p?.sources || {} });
    setError("");
  };

  const toggle = (sourceId, can) => {
    setDraft((d) => {
      const list = new Set(d.sources[sourceId] || []);
      if (list.has(can)) {
        list.delete(can);
        // العرض أساس البقية: بلا عرض لا معنى لتعديلٍ أو تصدير،
        // فإسقاطه يُسقطها معه بدل ترك حالة متناقضة.
        if (can === "view") list.clear();
      } else {
        list.add(can);
        if (can !== "view") list.add("view");
      }
      return { ...d, sources: { ...d.sources, [sourceId]: [...list] } };
    });
  };

  const save = () => {
    // الحارس الذي يمنع إقفال اللوحة على الجميع. والخادم يعيده —
    // فهذا يشرح قبل الرفض، لا يستبدله.
    const lastManager = admins.filter((a) => a.manage_access).length === 1;
    if (draft.email === myEmail && !draft.manage_access && lastManager) {
      setError("أنت آخر من يملك إدارة الوصول. إسقاطها عن نفسك يُقفل اللوحة على الجميع بلا طريق رجوع — امنحها لغيرك أولاً.");
      return;
    }
    onSave(draft.email, { manage_access: draft.manage_access, sources: draft.sources });
    setDraft(null);
  };

  return (
    <>
      <div className="sec-head"><h2 className="sec-title">إدارة الوصول</h2></div>

      <div className="adm-consultant">
        <h4>الصلاحية تُفرَض في الخادم</h4>
        <p className="adm-note" style={{ marginTop: ".5rem" }}>
          ما يُخفى هنا يُخفى من العرض. ومن يملك رمز جلسة يستطيع نداء الواجهة البرمجية مباشرةً،
          فكل إجراء في <strong>admin-api</strong> يعيد فحص الإذن قبل أن يردّ. تفصيل العقد في
          <strong> server/admin-api-contract.md</strong>.
        </p>
      </div>

      {admins.map((a) => {
        const editing = draft?.email === a.email;
        return (
          <div key={a.email} className="adm-edit-card">
            <div className="adm-edit-header" onClick={() => (editing ? setDraft(null) : startEdit(a))}>
              <h4>
                {a.email}
                {a.email === myEmail && <span className="adm-tag" style={{ marginRight: ".4rem" }}>أنت</span>}
                {a.manage_access && <span className="adm-tag adm-tag-gold" style={{ marginRight: ".4rem" }}>إدارة الوصول</span>}
              </h4>
              <span>{editing ? "▲" : "▼"}</span>
            </div>

            {!editing && (
              <p className="adm-hint" style={{ padding: "0 .1rem .4rem" }}>
                {summarize(normalize({ manage_access: a.manage_access, sources: a.sources }), SOURCES)}
              </p>
            )}

            {editing && (
              <div style={{ paddingTop: ".5rem" }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="perm-table">
                    <thead>
                      <tr>
                        <th>المصدر</th>
                        {CAN_LIST.map((c) => <th key={c.id} title={c.descAr}>{c.labelAr}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {SOURCES.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span className="src-dot" style={{ background: s.color }} aria-hidden="true" />
                            <strong>{s.nameAr}</strong>
                            <div className="adm-hint">{s.whereAr}</div>
                          </td>
                          {CAN_LIST.map((c) => {
                            const on = (draft.sources[s.id] || []).includes(c.id);
                            return (
                              <td key={c.id}>
                                <label className="perm-cell">
                                  <input type="checkbox" checked={on} onChange={() => toggle(s.id, c.id)}
                                    aria-label={`${c.labelAr} — ${s.nameAr}`} />
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <label className="perm-manage">
                  <input type="checkbox" checked={draft.manage_access}
                    onChange={(e) => setDraft({ ...draft, manage_access: e.target.checked })} />
                  <span>إدارة الوصول — تعديل صلاحيات الآخرين</span>
                </label>

                {error && <p className="fg-msg" style={{ marginTop: ".5rem" }}>{error}</p>}

                <div style={{ display: "flex", gap: ".5rem", marginTop: ".7rem" }}>
                  <button className="btn btn-s btn-gold" onClick={save} disabled={saving}>
                    {saving ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}
                  </button>
                  <button className="btn btn-s btn-outline" onClick={() => setDraft(null)}>إلغاء</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
