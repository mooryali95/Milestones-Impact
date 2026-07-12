import { B, BUCKETS, ROLES, roleInfo } from "../lib/theme";
import { Card, H, Locked, GoldBtn } from "../components/ui";

export const Decision = (p) => {
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

export const Audit = (p) => (
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

export const Team = (p) => (
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
            <span className="text-xs" title={m.linked ? "مرتبط بحساب فعلي" : "بانتظار أول تسجيل دخول"}>{m.linked ? "🟢" : "⏳"}</span>
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
