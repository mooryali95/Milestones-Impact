import { useState, useEffect } from "react";
import { B } from "../lib/theme";
import { Card, H } from "../components/ui";

export const Compare = (p) => {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!p.myProjects.length) return;
    p.compareAllProjects().then(setStats);
  }, [p.myProjects.length]);
  return (
    <div>
      <H ar="مقارنة المشاريع" en="Projects Comparison" sub="نظرة سريعة على كل مشاريعك جنباً إلى جنب" />
      {!stats && <div className="text-sm" style={{ color: B.muted }}>جارٍ التحميل…</div>}
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
