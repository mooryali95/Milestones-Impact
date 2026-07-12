import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ScatterChart, Scatter, ReferenceLine,
} from "recharts";
import { B, BUCKETS } from "../lib/theme";
import { Card, H, Stat, GoldBtn } from "../components/ui";
import { OnboardingGuide } from "./discovery";

export const Dashboard = (p) => {
  const hasStructure = p.services.length > 0 && p.segments.length > 0;
  const hasCombos = p.ranked.length > 0;
  return (
  <div>
    <H ar="لوحة القرار" en="Decision Dashboard" sub={p.currentProject?.name || "برنامج إدارة المشروعات للقادة"} />
    <OnboardingGuide {...p} />
    {hasStructure && !hasCombos && (
      <div className="rounded-2xl p-6 mb-6 text-center" style={{ background: B.card, border: `2px dashed ${B.petrolSoft}` }}>
        <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>لا توجد تركيبات مفعّلة بعد</div>
        <div className="text-xs mb-3" style={{ color: B.muted }}>لديك خدمات وشرائح جاهزة — اذهب للتركيبات وفعّل ما يستحق التقييم لتظهر النتائج هنا</div>
        <GoldBtn onClick={() => p.setScreen("combos")}>الذهاب إلى التركيبات ←</GoldBtn>
      </div>
    )}
    {p.top && (
      <div className="rounded-2xl p-6 mb-6" style={{ background: B.petrol, border: `2px solid ${B.gold}` }}>
        <div className="text-xs tracking-widest font-mono mb-2" style={{ color: B.gold }}>TOP RECOMMENDATION</div>
        <div className="text-2xl font-bold" style={{ color: B.sand }}>{p.top.name}</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="font-mono font-bold" style={{ color: B.gold }}>{p.top.raw.toFixed(1)}</div>
            <div className="text-xs mt-0.5" style={{ color: "#9FB2BD" }}>النتيجة المرجحة</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="font-mono font-bold" style={{ color: "#7FD1AE" }}>{p.top.adj.toFixed(1)}</div>
            <div className="text-xs mt-0.5" style={{ color: "#9FB2BD" }}>بعد تعديل الثقة</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="font-mono font-bold" style={{ color: B.sand }}>{p.confIdx}%</div>
            <div className="text-xs mt-0.5" style={{ color: "#9FB2BD" }}>مؤشر الثقة</div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="font-mono font-bold" style={{ color: B.sand }}>{p.top.risk}/9</div>
            <div className="text-xs mt-0.5" style={{ color: "#9FB2BD" }}>المخاطر</div>
          </div>
          <div className="rounded-xl p-3 text-center col-span-2 sm:col-span-1" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="font-bold" style={{ color: "#7FD1AE" }}>{BUCKETS[p.top.bucket].ar}</div>
            <div className="text-xs mt-0.5" style={{ color: "#9FB2BD" }}>التصنيف</div>
          </div>
        </div>
      </div>
    )}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Stat label="الخدمات" value={p.services.length} />
      <Stat label="الشرائح المستهدفة" value={p.segments.length} />
      <Stat label="تركيبات مفعّلة" value={`${p.ranked.length} / ${p.services.length * p.segments.length}`} />
      <Stat label="مجموع الأوزان" value={`${p.totalW}%`} alert={p.totalW !== 100} />
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
          <div className="font-bold text-sm" style={{ color: B.petrol }}>ترتيب الفرص <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>Ranking</span></div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: B.muted }}>
            {Object.entries(BUCKETS).map(([k, b]) => (
              <span key={k} className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 4, background: b.color, display: "inline-block" }}></span>{b.ar}</span>
            ))}
          </div>
        </div>
        <div dir="ltr" style={{ height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={p.ranked.map((r) => ({ name: r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name, fullName: r.name, v: +r.adj.toFixed(1) }))} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid stroke={B.lineSoft} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: B.muted, fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fill: B.petrol, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${B.line}`, direction: "rtl", color: B.petrol }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""} />
              <Bar dataKey="v" radius={[0, 6, 6, 0]}>
                {p.ranked.map((r, i) => <Cell key={i} fill={i === 0 ? B.gold : BUCKETS[r.bucket].color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <div className="font-bold text-sm mb-3" style={{ color: B.petrol }}>مصفوفة الفرص والمخاطر <span className="text-xs font-mono mr-2" style={{ color: B.goldText }}>Opportunity × Risk</span></div>
        <div dir="ltr" style={{ height: 340 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid stroke={B.lineSoft} />
              <XAxis type="number" dataKey="risk" name="المخاطر" domain={[0, 9]} tick={{ fill: B.muted, fontSize: 11 }} label={{ value: "Risk →", position: "insideBottomRight", fill: B.muted, fontSize: 11 }} />
              <YAxis type="number" dataKey="adj" name="النتيجة" domain={[40, 100]} tick={{ fill: B.muted, fontSize: 11 }} label={{ value: "Score", angle: -90, position: "insideLeft", fill: B.muted, fontSize: 11 }} />
              <ReferenceLine x={5} stroke={B.line} strokeDasharray="4 4" />
              <ReferenceLine y={68} stroke={B.line} strokeDasharray="4 4" />
              <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${B.line}`, direction: "rtl", color: B.petrol }} formatter={(v) => (v.toFixed ? v.toFixed(1) : v)} labelFormatter={() => ""} />
              <Scatter data={p.ranked.map((r) => ({ ...r, adj: +r.adj.toFixed(1) }))} shape="circle">
                {p.ranked.map((r, i) => <Cell key={i} fill={i === 0 ? B.gold : B.petrolSoft} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs" style={{ color: B.muted }}>الربع الأعلى يساراً = فرصة عالية بمخاطر منخفضة (المنطقة الذهبية)</div>
      </Card>
    </div>
  </div>
  );
};
