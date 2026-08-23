import React from "react";
import MILogo from "../MILogo";
import AuthLeft from "../components/AuthLeft";
import { BRAND } from "../config/constants";
import { CSS } from "../styles/appCss";

// ════════════════════════════════════════════════════════════════
// AUTH SCREENS — التسجيل، استئناف الجلسة، دخول المستشار
// ════════════════════════════════════════════════════════════════

// القشرة المشتركة: تحقن الأنماط وتضبط تخطيط الشاشة المزدوج.
const AuthShell = ({ children }) => (
  <>
    <style>{CSS}</style>
    <div className="auth-screen">{children}</div>
  </>
);

export const RegisterScreen = ({
  otpStep,
  setOtpStep,
  user,
  setUser,
  regErrors,
  setRegErrors,
  otpSending,
  otpCode,
  setOtpCode,
  otpError,
  setOtpError,
  handleRegister,
  handleVerifyOtp,
  handleResendOtp,
  setScreen,
}) => (
  <AuthShell>
      <AuthLeft quote="القيمة الكامنة داخل الإنسان لا تُكتشف بالتأمل — بل بالهندسة" />
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.dark}/><span className="auth-logo-text">مصفوفة التأثير</span></div>
          {otpStep === "form" ? <>
            <h1 className="auth-title">ابدأ رحلتك</h1>
            <p className="auth-sub">سجّل بياناتك للدخول إلى منظومة العمليات الست عشرة</p>
            <form onSubmit={handleRegister}>
              <div className={`fg ${regErrors.name ? "fg-err" : ""}`}><label>الاسم الكامل</label><input placeholder="أدخل اسمك" value={user.name} maxLength={80} onChange={e => { setUser({ ...user, name: e.target.value }); setRegErrors({ ...regErrors, name: "" }); }} />{regErrors.name && <div className="fg-msg">{regErrors.name}</div>}</div>
              <div className={`fg ${regErrors.phone ? "fg-err" : ""}`}><label>رقم الجوال</label><input type="tel" placeholder="05XXXXXXXX" value={user.phone} maxLength={10} onChange={e => { setUser({ ...user, phone: e.target.value }); setRegErrors({ ...regErrors, phone: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.phone && <div className="fg-msg">{regErrors.phone}</div>}</div>
              <div className={`fg ${regErrors.email ? "fg-err" : ""}`}><label>البريد الإلكتروني</label><input type="email" placeholder="email@example.com" value={user.email} maxLength={254} onChange={e => { setUser({ ...user, email: e.target.value }); setRegErrors({ ...regErrors, email: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.email && <div className="fg-msg">{regErrors.email}</div>}</div>
              <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ الإرسال..." : "إرسال رمز التحقق ✉"}</button>
            </form>
            <div style={{textAlign:"center",marginTop:"1.2rem",fontSize:"0.8rem",color:"var(--wg)"}}>
              لديك حساب؟ <button style={{background:"none",border:"none",color:"var(--mi-d)",fontFamily:"var(--font-ar)",fontSize:"0.8rem",cursor:"pointer",fontWeight:600}} onClick={() => { setScreen("resume"); setOtpStep("form"); }}>استئناف الجلسة</button>
            </div>
          </> : <>
            <h1 className="auth-title">رمز التحقق</h1>
            <p className="auth-sub">تم إرسال رمز مكوّن من 6 أرقام إلى<br/><strong style={{color:BRAND.dark,direction:"ltr",display:"inline-block"}}>{user.email}</strong></p>
            <form onSubmit={handleVerifyOtp}>
              <div className={`fg ${otpError ? "fg-err" : ""}`}>
                <label>رمز التحقق</label>
                <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode}
                  onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  style={{ direction: "ltr", textAlign: "center", fontSize: "1.6rem", letterSpacing: "10px", fontWeight: 700 }} />
                {otpError && <div className="fg-msg">{otpError}</div>}
              </div>
              <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
            </form>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button style={{ background: "none", border: "none", color: BRAND.color, fontFamily: "var(--font-ar)", fontSize: "0.8rem", cursor: "pointer" }} onClick={handleResendOtp} disabled={otpSending}>↻ إعادة إرسال</button>
              <button style={{ background: "none", border: "none", color: "var(--wg)", fontFamily: "var(--font-ar)", fontSize: "0.8rem", cursor: "pointer" }} onClick={() => { setOtpStep("form"); setOtpCode(""); setOtpError(""); }}>← تغيير البيانات</button>
            </div>
          </>}
          <button className="auth-back" onClick={() => { setScreen("splash"); setOtpStep("form"); setOtpCode(""); }}>→ العودة للرئيسية</button>
        </div>
      </div>
  </AuthShell>
);

export const ResumeScreen = ({
  otpStep,
  setOtpStep,
  user,
  otpSending,
  otpCode,
  setOtpCode,
  otpError,
  setOtpError,
  handleResendOtp,
  setScreen,
  resumePhone,
  setResumePhone,
  resumeError,
  setResumeError,
  resumeLoading,
  handleResume,
  handleResumeVerify,
}) => (
  <AuthShell>
      <AuthLeft quote="القيمة الكامنة داخل الإنسان لا تُكتشف بالتأمل — بل بالهندسة" />
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.dark}/><span className="auth-logo-text">مصفوفة التأثير</span></div>
          {otpStep === "form" ? <>
            <h1 className="auth-title">استئناف الجلسة</h1>
            <p className="auth-sub">أدخل رقم جوالك لاستعادة بياناتك وخطتك السابقة</p>
            <form onSubmit={handleResume}>
              <div className={`fg ${resumeError ? "fg-err" : ""}`}>
                <label>رقم الجوال المسجل</label>
                <input type="tel" placeholder="05XXXXXXXX" value={resumePhone} maxLength={10}
                  onChange={e => { setResumePhone(e.target.value); setResumeError(""); }}
                  style={{ direction: "ltr", textAlign: "right" }} />
                {resumeError && <div className="fg-msg">{resumeError}</div>}
              </div>
              <button type="submit" className="btn" style={{ background: "linear-gradient(135deg, #4A5628, #5B7B3A)" }} disabled={resumeLoading}>
                {resumeLoading ? "جارٍ البحث..." : "إرسال رمز التحقق ✉"}
              </button>
            </form>
            <div style={{textAlign:"center",marginTop:"1.2rem",fontSize:"0.8rem",color:"var(--wg)"}}>
              مسجّل جديد؟ <button style={{background:"none",border:"none",color:"var(--mi-d)",fontFamily:"var(--font-ar)",fontSize:"0.8rem",cursor:"pointer",fontWeight:600}} onClick={() => { setScreen("register"); setOtpStep("form"); }}>ابدأ رحلتك</button>
            </div>
          </> : <>
            <h1 className="auth-title">رمز التحقق</h1>
            <p className="auth-sub">تم إرسال رمز إلى<br/><strong style={{color:BRAND.dark,direction:"ltr",display:"inline-block"}}>{user.email?.replace(/(.{2}).*(@.*)/, "$1***$2")}</strong></p>
            <form onSubmit={handleResumeVerify}>
              <div className={`fg ${otpError ? "fg-err" : ""}`}>
                <label>رمز التحقق</label>
                <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpCode}
                  onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  style={{ direction: "ltr", textAlign: "center", fontSize: "1.6rem", letterSpacing: "10px", fontWeight: 700 }} />
                {otpError && <div className="fg-msg">{otpError}</div>}
              </div>
              <button type="submit" className="btn" style={{ background: "linear-gradient(135deg, #4A5628, #5B7B3A)" }} disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
            </form>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button style={{ background: "none", border: "none", color: "#5B7B3A", fontFamily: "var(--font-ar)", fontSize: "0.8rem", cursor: "pointer" }} onClick={handleResendOtp} disabled={otpSending}>↻ إعادة إرسال</button>
              <button style={{ background: "none", border: "none", color: "var(--wg)", fontFamily: "var(--font-ar)", fontSize: "0.8rem", cursor: "pointer" }} onClick={() => { setOtpStep("form"); setOtpCode(""); setOtpError(""); }}>← رقم آخر</button>
            </div>
          </>}
          <button className="auth-back" onClick={() => { setScreen("splash"); setOtpStep("form"); setOtpCode(""); }}>→ العودة للرئيسية</button>
        </div>
      </div>
  </AuthShell>
);

export const AdminLoginScreen = ({
  setScreen,
  adminOtpStep,
  setAdminOtpStep,
  adminEmail,
  setAdminEmail,
  adminCode,
  setAdminCode,
  adminError,
  setAdminError,
  adminSending,
  handleAdminSendCode,
  handleAdminVerify,
}) => (
  <AuthShell>
      <div className="auth-left" style={{background:"linear-gradient(160deg,#0f1923 0%,#1a1a2e 100%)"}}>
        <div className="auth-left-grid"/>
        <div className="auth-left-content" style={{position:"relative",zIndex:1,textAlign:"center"}}>
          <MILogo size={52} color="#14495E"/>
          <div className="auth-left-quote" style={{color:"rgba(255,255,255,0.7)",fontSize:"1rem",marginTop:"1.5rem"}}>
            لوحة إدارة المستشار<br/>
            <span style={{color:"#14495E",fontSize:"0.8rem",letterSpacing:"2px"}}>CONSULTANT DASHBOARD</span>
          </div>
          <div className="auth-left-attr" style={{marginTop:"1rem"}}>Milestone Impact • نسخة المستشار</div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.deep}/><span className="auth-logo-text" style={{color:BRAND.deep}}>لوحة الإدارة</span></div>
          <h1 className="auth-title">دخول المستشار</h1>
          <p className="auth-sub">{adminOtpStep === "email" ? "أدخل بريدك المسجّل لإرسال رمز الدخول" : "أدخل رمز الدخول (من بريدك أو تطبيق المصادقة)"}</p>
          {adminOtpStep === "email" ? (
            <form onSubmit={handleAdminSendCode}>
              <div className={`fg ${adminError ? "fg-err" : ""}`}><label>البريد الإلكتروني</label><input type="email" dir="ltr" placeholder="admin@example.com" value={adminEmail} onChange={e => { setAdminEmail(e.target.value); setAdminError(""); }} />{adminError && <div className="fg-msg">{adminError}</div>}</div>
              <button type="submit" disabled={adminSending} className="btn" style={{background:`linear-gradient(135deg,${BRAND.deep},${BRAND.dark})`}}>{adminSending ? "..." : "إرسال الرمز ←"}</button>
            </form>
          ) : (
            <form onSubmit={handleAdminVerify}>
              <div className={`fg ${adminError ? "fg-err" : ""}`}><label>رمز الدخول (6 أرقام)</label><input inputMode="numeric" dir="ltr" maxLength={6} placeholder="______" value={adminCode} onChange={e => { setAdminCode(e.target.value.replace(/\D/g, "").slice(0,6)); setAdminError(""); }} />{adminError && <div className="fg-msg">{adminError}</div>}</div>
              <button type="submit" disabled={adminSending} className="btn" style={{background:`linear-gradient(135deg,${BRAND.deep},${BRAND.dark})`}}>{adminSending ? "..." : "دخول ←"}</button>
              <button type="button" className="auth-back" onClick={() => { setAdminOtpStep("email"); setAdminError(""); }}>→ تغيير البريد</button>
            </form>
          )}
          <button className="auth-back" onClick={() => setScreen("splash")}>→ العودة للرئيسية</button>
        </div>
      </div>
  </AuthShell>
);
