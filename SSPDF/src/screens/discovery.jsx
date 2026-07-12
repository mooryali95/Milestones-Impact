import { useState } from "react";
import { B, roleInfo } from "../lib/theme";
import { calcScore } from "../lib/calc";
import { Card, H, Locked, GoldBtn } from "../components/ui";

export const Portal = (p) => {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  return (
    <div>
      <H ar="بوابة المشاريع" en="Projects Portal" sub={`${p.myProjects.length} مشروعاً تملك صلاحية فيه`} />
      <div className="grid md:grid-cols-2 gap-4">
        {p.myProjects.map((pr) => {
          const isOpen = p.currentProject?.id === pr.id;
          const isEditing = editingId === pr.id;
          if (isEditing) {
            return (
              <Card key={pr.id} style={{ border: `2px solid ${B.gold}` }}>
                <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>تعديل بيانات المشروع</div>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="الاسم بالعربية..."
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none inp mb-2" />
                <input value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} placeholder="English name..." dir="ltr"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none inp mb-1" />
                <div className="text-xs mb-3" style={{ color: B.muted }}>الاسم الإنجليزي يبني رابط المشروع (مثلاً project-name)</div>
                <div className="flex gap-2">
                  <GoldBtn onClick={() => { p.saveProjectEdit(pr.id, editName, editNameEn); setEditingId(null); }} disabled={!editName.trim()}>حفظ</GoldBtn>
                  <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: B.muted, border: `1px solid ${B.line}` }}>إلغاء</button>
                </div>
              </Card>
            );
          }
          return (
            <div key={pr.id} onClick={() => { p.switchProject(pr.id, pr.myRole); }}
              className="rounded-2xl p-6 cursor-pointer transition hover:shadow-md"
              style={{ background: B.card, border: isOpen ? `2px solid ${B.gold}` : `1px solid ${B.line}` }}>
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="text-lg font-bold truncate" style={{ color: B.petrol }}>{pr.name}</div>
                  {pr.name_en && <div className="text-xs font-mono mt-1" style={{ color: B.muted }}>{pr.name_en}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs px-3 py-1 rounded-full whitespace-nowrap" style={{ background: "#E8F0F5", color: B.petrolSoft, border: `1px solid ${B.petrolSoft}` }}>
                    {pr.status === "evaluating" ? "قيد التقييم" : pr.status === "completed" ? "مكتمل" : pr.status === "on_hold" ? "معلَّق" : "مسودة"}
                  </span>
                  {pr.myRole === "admin" && (
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(pr.id); setEditName(pr.name); setEditNameEn(pr.name_en || ""); }}
                      className="text-xs px-1.5" style={{ color: B.petrolSoft }}>✎</button>
                  )}
                </div>
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
              className="w-full rounded-lg px-3 py-2 text-sm outline-none inp mb-1" />
            <div className="text-xs mb-2" style={{ color: B.muted }}>يُستخدم لبناء رابط أنيق للمشروع (مثلاً project-name) — بلا اسم إنجليزي سيُستخدم معرّف تقني بديل</div>
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

export const OnboardingGuide = (p) => {
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

export const Library = (p) => {
  const [editing, setEditing] = useState(null);
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

export const Combos = (p) => {
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
