import { B } from "../lib/theme";
import { GoldBtn } from "./ui";

export const AuthShell = ({ children }) => (
  <div dir="rtl" className="min-h-screen flex items-center justify-center p-5" style={{ background: B.sand, fontFamily: "'DIN Next LT Arabic', 'Tajawal', 'Segoe UI', Tahoma, sans-serif" }}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <span className="px-3 py-1.5 rounded-lg text-xl font-black font-mono tracking-tight" style={{ background: B.petrol, color: B.gold }}>SSPDF</span>
        <div className="text-xs mt-2" style={{ color: B.muted }}>إطار قرار محفظة الخدمات الاستراتيجية</div>
      </div>
      <div className="card p-6" style={{ background: B.card, border: `1px solid ${B.line}`, borderRadius: 16 }}>{children}</div>
    </div>
  </div>
);

const Spinner = () => (
  <div style={{
    width: 28, height: 28, borderRadius: "50%",
    border: `3px solid ${B.lineSoft}`, borderTopColor: B.gold,
    animation: "sspdf-spin 0.8s linear infinite", margin: "0 auto",
  }} />
);

export const CheckingScreen = () => (
  <AuthShell>
    <style>{`@keyframes sspdf-spin { to { transform: rotate(360deg); } }`}</style>
    <Spinner />
    <div className="text-center text-sm mt-4" style={{ color: B.muted }}>جارٍ تحميل بياناتك…</div>
  </AuthShell>
);

export const LoginScreen = ({ authEmail, setAuthEmail, otpSent, setOtpSent, otpCode, setOtpCode, authBusy, authError, sendOtp, verifyOtp, resendIn }) => (
  <AuthShell>
    <div className="text-sm font-bold mb-1" style={{ color: B.petrol }}>تسجيل الدخول</div>
    <div className="text-xs mb-4" style={{ color: B.muted }}>Sign in via one-time email code</div>
    {!otpSent ? (
      <>
        <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="بريدك الإلكتروني"
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none inp mb-3" dir="ltr" style={{ textAlign: "right" }} />
        <GoldBtn onClick={sendOtp} disabled={authBusy || !authEmail.trim() || resendIn > 0} className="w-full py-2.5">
          {authBusy ? "جارٍ الإرسال…" : resendIn > 0 ? `أعد المحاولة بعد ${resendIn} ثانية` : "إرسال رمز الدخول"}
        </GoldBtn>
      </>
    ) : (
      <>
        <div className="text-xs mb-3" style={{ color: B.muted }}>أُرسل رمز إلى {authEmail} — أدخله هنا:</div>
        <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="000000" maxLength={6}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none inp mb-3 text-center font-mono tracking-widest" />
        <GoldBtn onClick={verifyOtp} disabled={authBusy || !otpCode.trim()} className="w-full py-2.5">
          {authBusy ? "جارٍ التحقق…" : "دخول"}
        </GoldBtn>
        <div className="flex justify-between mt-3">
          <button onClick={() => { setOtpSent(false); setOtpCode(""); }} className="text-xs" style={{ color: B.muted }}>تغيير البريد الإلكتروني</button>
          <button onClick={sendOtp} disabled={resendIn > 0 || authBusy} className="text-xs font-bold"
            style={{ color: resendIn > 0 ? B.muted : B.goldText }}>
            {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ثانية` : "إعادة إرسال الرمز"}
          </button>
        </div>
      </>
    )}
    {authError && <div className="text-xs mt-3 text-center" style={{ color: B.bad }}>{authError}</div>}
  </AuthShell>
);
