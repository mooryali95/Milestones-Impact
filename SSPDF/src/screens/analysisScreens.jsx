import { useMemo } from "react";
import { B, SCENARIOS } from "../lib/theme";
import { calcScore, scenWeights, runMonteCarlo } from "../lib/calc";
import { Card, H, Locked, GoldBtn } from "../components/ui";

export const Risk = (p) => (
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

export const Analysis = (p) => {
  const scored = useMemo(() => p.ranked.filter((r) => !r.isUnscored), [p.ranked]);
  const excludedCount = p.ranked.length - scored.length;
  const scenRank = useMemo(() => {
    const out = {};
    Object.entries(SCENARIOS).forEach(([k, s]) => {
      const w = scenWeights(p.criteria, s.mult);
      out[k] = scored.map((r) => ({ key: r.key, name: r.name, adj: calcScore(r.ev, w).adj })).sort((a, b) => b.adj - a.adj);
    });
    return out;
  }, [scored, p.criteria]);
  return (
    <div>
      <H ar="التحليل والسيناريوهات" en="Sensitivity · Scenarios · Monte Carlo" sub={excludedCount > 0 ? `اختبار استقرار القرار عند تغيّر الافتراضات — تم استبعاد ${excludedCount} تركيبة غير مُقيَّمة بعد من هذا التحليل` : "اختبار استقرار القرار عند تغيّر الافتراضات"} />
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
            <GoldBtn disabled={!p.can.analyze || scored.length === 0} onClick={() => { p.setMc(runMonteCarlo(scored, p.criteria)); p.log("محاكاة", "تشغيل Monte Carlo — 1000 تكرار"); }} className="px-5 py-2.5">
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
