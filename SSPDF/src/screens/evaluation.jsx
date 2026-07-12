import { useState } from "react";
import { B, CONF, SAATY, roleInfo } from "../lib/theme";
import { calcScore, scoreStyle, computeAHPWeights } from "../lib/calc";
import { Card, H, Locked, GoldBtn } from "../components/ui";

export const Criteria = (p) => {
  const [mode, setMode] = useState("direct");
  const pairCount = (p.criteria.length * (p.criteria.length - 1)) / 2;
  return (
    <div>
      <H ar="المعايير والأوزان" en="Criteria & Weights" sub="الأوزان مضبوطة وفق منهجية GE-McKinsey: جاذبية السوق ≈ 50% والقدرة على الفوز ≈ 50%" />
      {!p.can.weights && <Locked role={p.role} />}
      <div className="flex flex-wrap gap-2 mb-4">
        {[["direct", "الأوزان المباشرة"], ["ahp", `المقارنات الزوجية AHP (${pairCount})`]].map(([k, t]) => (
          <button key={k} onClick={() => setMode(k)}
            className="px-4 py-2 rounded-lg text-sm font-bold transition"
            style={mode === k ? { background: B.gold, color: B.petrol } : { background: "#fff", border: `1px solid ${B.line}`, color: B.petrol }}>{t}</button>
        ))}
      </div>
      {mode === "direct" && (
        <Card>
          <div className="text-sm font-bold mb-4" style={{ color: p.totalW === 100 ? B.ok : B.bad }}>
            مجموع الأوزان: <span className="font-mono">{p.totalW}%</span> {p.totalW !== 100 && "⚠️ يجب أن يساوي 100%"}
            {p.totalW !== 100 && p.can.weights && (
              <button onClick={p.normalizeW} className="mr-3 px-3 py-1 rounded-lg text-xs font-bold" style={{ background: B.gold, color: B.petrol }}>موازنة تلقائية</button>
            )}
          </div>
          {p.criteria.map((cr, i) => (
            <div key={cr.id} className="grid grid-cols-12 gap-2 items-center py-2" style={{ borderBottom: i < p.criteria.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
              <div className="col-span-4 text-sm" style={{ color: B.petrol }}>{cr.ar}<div className="text-xs font-mono" style={{ color: B.muted }}>{cr.en}</div></div>
              <div className="col-span-2 text-xs hidden md:block" style={{ color: B.muted }}>{cr.g}</div>
              <div className="col-span-4 md:col-span-3">
                <input type="range" min={0} max={60} value={cr.w} disabled={!p.can.weights}
                  onChange={(e) => p.setWeight(i, +e.target.value)} className="w-full" style={{ accentColor: B.gold }} />
              </div>
              <div className="col-span-2 flex items-center gap-1">
                <input type="number" min={0} max={100} value={cr.w} disabled={!p.can.weights}
                  onChange={(e) => p.setWeight(i, Math.max(0, Math.min(100, +e.target.value || 0)))}
                  className="w-14 rounded-lg px-1 py-1 text-center font-mono font-bold text-sm outline-none inp" style={{ color: B.goldText }} />
                <span className="text-xs" style={{ color: B.muted }}>%</span>
              </div>
              <div className="col-span-2 md:col-span-1 text-left">
                {p.can.weights && (
                  <button onClick={() => {
                    if (!window.confirm(`حذف معيار "${cr.ar}"؟ ستُحذف معه كل الدرجات المرتبطة به في التقييمات.`)) return;
                    p.removeCriterion(cr.id);
                  }} className="text-xs px-1.5" style={{ color: B.bad }}>🗑</button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
      {mode === "ahp" && (
        <Card>
          {p.criteria.length < 2 ? (
            <div className="text-center py-4">
              <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>تحتاج معيارين على الأقل</div>
              <div className="text-xs" style={{ color: B.muted }}>أضف معياراً آخر من الأسفل لتتمكن من استخدام المقارنات الزوجية</div>
            </div>
          ) : (
          <>
          <div className="text-xs mb-4" style={{ color: B.muted }}>
            لكل زوج من المعايير، حدّد أيهما أهم وبأي درجة وفق المقياس القياسي (Saaty Scale)، ثم اضغط "تطبيق الأوزان المحسوبة".
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto pl-1">
            {p.criteria.flatMap((a, i) => p.criteria.map((b, j) => {
              if (i >= j) return null;
              const key = `${i}-${j}`;
              return (
                <div key={key} className="pb-3" style={{ borderBottom: `1px solid ${B.lineSoft}` }}>
                  <div className="text-xs mb-1.5" style={{ color: B.petrol }}>
                    <span className="font-bold">{a.ar}</span> <span style={{ color: B.muted }}>مقابل</span> <span className="font-bold">{b.ar}</span>
                  </div>
                  <select value={p.ahpPairs[key] ?? 1} onChange={(e) => p.setAhpPair(key, +e.target.value)}
                    disabled={!p.can.weights}
                    className="w-full rounded-lg px-3 py-2 text-xs outline-none inp">
                    {SAATY.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </div>
              );
            }).filter(Boolean))}
          </div>
          {p.can.weights && (
            <GoldBtn onClick={() => p.applyAHP(computeAHPWeights(p.criteria, p.ahpPairs))} className="w-full py-2.5 mt-4">
              تطبيق الأوزان المحسوبة على معايير التقييم
            </GoldBtn>
          )}
          </>
          )}
        </Card>
      )}
      <Card className="mt-4 text-sm" style={{ color: B.muted }}>
        <span className="font-bold" style={{ color: B.goldText }}>المنهجية: </span>
        توزيع مباشر بالنسب المئوية أو مقارنات زوجية وفق AHP، مع تعديل النتائج بمستوى الثقة (Confidence-Adjusted Scoring) عند التقييم.
      </Card>
      {p.can.weights && (
        <Card className="mt-4">
          <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>إضافة معيار جديد</div>
          <div className="flex flex-wrap gap-2">
            <input value={p.newCrit} onChange={(e) => p.setNewCrit(e.target.value)} placeholder="اسم المعيار بالعربية..."
              className="flex-1 min-w-40 rounded-lg px-3 py-2 text-sm outline-none inp" />
            <GoldBtn onClick={() => {
              if (!p.newCrit.trim()) return;
              p.addCriterion(p.newCrit.trim());
              p.setNewCrit("");
            }}>إضافة</GoldBtn>
          </div>
        </Card>
      )}
    </div>
  );
};

export const Scoring = (p) => {
  const ev = p.evals[p.selCombo];
  const sc = ev ? calcScore(ev, p.criteria) : null;
  return (
    <div>
      <H ar="مصفوفة التقييم" en="Scoring Matrix" sub="درجات 1–9 مع الدليل ومستوى الثقة لكل تقييم" />
      {!p.can.score && <Locked role={p.role} />}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select value={p.selCombo} onChange={(e) => p.setSelCombo(e.target.value)} className="w-full sm:w-auto rounded-lg px-4 py-2.5 text-sm outline-none inp">
          {Object.keys(p.evals).map((k) => <option key={k} value={k}>{p.comboName(k)}</option>)}
        </select>
        {sc && (
          <div className="text-sm" style={{ color: B.petrol }}>
            <span style={{ color: B.muted }}>النتيجة: </span><span className="font-mono font-bold" style={{ color: B.goldText }}>{sc.raw.toFixed(1)}</span>
            <span style={{ color: B.muted }} className="mr-3"> بعد الثقة: </span><span className="font-mono font-bold" style={{ color: B.ok }}>{sc.adj.toFixed(1)}</span>
          </div>
        )}
      </div>
      {ev && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ color: B.muted, borderBottom: `1px solid ${B.line}` }}>
                <th className="p-2 text-right font-normal">المعيار</th>
                <th className="p-2 font-normal">الوزن</th>
                <th className="p-2 font-normal">الدرجة</th>
                <th className="p-2 font-normal">المساهمة</th>
                <th className="p-2 font-normal">الثقة</th>
                <th className="p-2 text-right font-normal">الدليل / المرجع</th>
              </tr>
            </thead>
            <tbody>
              {p.criteria.map((cr, i) => {
                const denom = p.criteria.reduce((s, c, j) => s + c.w * ev.scores[j], 0) || 1;
                const contrib = ((cr.w * ev.scores[i]) / denom) * 100;
                return (
                  <tr key={cr.id} style={{ borderBottom: i < p.criteria.length - 1 ? `1px solid ${B.lineSoft}` : "none" }}>
                    <td className="p-2 whitespace-nowrap" style={{ color: B.petrol }}>{cr.ar}</td>
                    <td className="p-2 text-center font-mono" style={{ color: B.muted }}>{cr.w}%</td>
                    <td className="p-2 text-center">
                      <select value={ev.scores[i]} disabled={!p.can.score} onChange={(e) => p.setScore(p.selCombo, i, +e.target.value)}
                        className="rounded-lg px-2 py-1 font-mono font-bold outline-none"
                        style={{ ...scoreStyle(ev.scores[i]), border: `1px solid ${B.line}` }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-center font-mono text-xs" style={{ color: B.muted }}>{contrib.toFixed(0)}%</td>
                    <td className="p-2 text-center">
                      <select value={ev.conf[i]} disabled={!p.can.score} onChange={(e) => p.setConf(p.selCombo, i, e.target.value)}
                        className="rounded-lg px-2 py-1 text-xs outline-none"
                        style={{ color: CONF[ev.conf[i]].color, background: "#fff", border: `1px solid ${B.line}`, fontWeight: 700 }}>
                        {Object.entries(CONF).map(([k, v]) => <option key={k} value={k}>{v.ar}</option>)}
                      </select>
                    </td>
                    <td className="p-2 min-w-64">
                      <textarea value={ev.evidence[cr.id] || ""} disabled={!p.can.score} placeholder="اكتب الدليل الذي يبرر هذه الدرجة..." rows={2}
                        onChange={(e) => p.setEvidence(p.selCombo, cr.id, e.target.value)}
                        className="w-full rounded-lg px-3 py-1.5 text-xs outline-none inp resize-y leading-relaxed" style={{ minHeight: 40 }} />
                    </td>
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
