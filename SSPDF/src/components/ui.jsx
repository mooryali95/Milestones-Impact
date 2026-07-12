import { B, roleInfo } from "../lib/theme";

export const Card = ({ children, className = "", style = {} }) => (
  <div className={`card p-5 ${className}`} style={style}>{children}</div>
);

export const H = ({ ar, en, sub }) => (
  <div className="mb-5">
    <div className="flex items-baseline gap-3 flex-wrap">
      <h2 className="text-xl font-bold" style={{ color: B.petrol }}>{ar}</h2>
      <span className="text-xs tracking-widest uppercase font-mono" style={{ color: B.goldText }}>{en}</span>
    </div>
    {sub && <p className="text-sm mt-1" style={{ color: B.muted }}>{sub}</p>}
  </div>
);

export const Stat = ({ label, value, alert }) => (
  <Card className="text-center">
    <div className="text-2xl md:text-3xl font-bold font-mono" style={{ color: alert ? B.bad : B.petrol }}>{value}</div>
    <div className="text-xs mt-1" style={{ color: B.muted }}>{label}</div>
  </Card>
);

export const Locked = ({ role }) => (
  <div className="text-xs rounded-lg px-3 py-2 mb-4" style={{ background: B.goldSoft, border: `1px solid ${B.line}`, color: B.muted }}>
    🔒 صلاحيتك الحالية ({roleInfo(role).ar}) للعرض فقط في هذه الشاشة
  </div>
);

export const GoldBtn = ({ onClick, disabled, children, className = "" }) => (
  <button onClick={onClick} disabled={disabled}
    className={`px-4 py-2 rounded-lg text-sm font-bold transition ${className}`}
    style={disabled ? { background: B.lineSoft, color: B.muted } : { background: B.gold, color: B.petrol }}>
    {children}
  </button>
);

export const Spinner = () => (
  <div style={{
    width: 28, height: 28, borderRadius: "50%",
    border: `3px solid ${B.lineSoft}`, borderTopColor: B.gold,
    animation: "sspdf-spin 0.8s linear infinite", margin: "0 auto",
  }} />
);
