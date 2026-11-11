import React from "react";
import Wordmark from "../components/Wordmark";
import MILogo from "../MILogo";
import AuthLeft from "../components/AuthLeft";
import { BRAND } from "../config/constants";
import { CSS } from "../styles/appCss";

// ════════════════════════════════════════════════════════════════
// AUTH SCREENS — التسجيل، استئناف الجلسة، دخول المستشار
// ════════════════════════════════════════════════════════════════

// خطأ الحقل يُربط به ليقرأه قارئ الشاشة معه: الحقل يُعلَن غير صالح ويُوصف برسالته ذات المعرّف {id}-err
const errAttrs = (id, err) => (err ? { "aria-invalid": true, "aria-describedby": `${id}-err` } : {});

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
  otpCooldown = 0,
  setScreen,
}) => (
  <AuthShell>
      <AuthLeft quote="القيمة الكامنة داخل الإنسان لا تُكتشف بالتأمل، بل بالهندسة" />
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.dark}/><span className="auth-logo-text">مصفوفة التأثير</span></div>
          {otpStep === "form" ? <>
            <h1 className="auth-title">بدء الرحلة</h1>
            <p className="auth-sub">سجّل بياناتك للدخول إلى منظومة العمليات الست عشرة</p>
            <form onSubmit={handleRegister} noValidate>
              <div className={`fg ${regErrors.name ? "fg-err" : ""}`}><label htmlFor="reg-name">الاسم الكامل</label><input id="reg-name" autoComplete="name" placeholder="أدخل اسمك" value={user.name} maxLength={80} {...errAttrs("reg-name", regErrors.name)} onChange={e => { setUser({ ...user, name: e.target.value }); setRegErrors({ ...regErrors, name: "" }); }} />{regErrors.name && <div className="fg-msg" id="reg-name-err">{regErrors.name}</div>}</div>
              <div className={`fg ${regErrors.phone ? "fg-err" : ""}`}><label htmlFor="reg-phone">رقم الجوال</label><input id="reg-phone" type="tel" autoComplete="tel" placeholder="05XXXXXXXX" value={user.phone} maxLength={10} {...errAttrs("reg-phone", regErrors.phone)} onChange={e => { setUser({ ...user, phone: e.target.value }); setRegErrors({ ...regErrors, phone: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.phone && <div className="fg-msg" id="reg-phone-err">{regErrors.phone}</div>}</div>
              <div className={`fg ${regErrors.email ? "fg-err" : ""}`}><label htmlFor="reg-email">البريد الإلكتروني</label><input id="reg-email" type="email" autoComplete="email" placeholder="email@example.com" value={user.email} maxLength={254} {...errAttrs("reg-email", regErrors.email)} onChange={e => { setUser({ ...user, email: e.target.value }); setRegErrors({ ...regErrors, email: "" }); }} style={{ direction: "ltr", textAlign: "right" }} />{regErrors.email && <div className="fg-msg" id="reg-email-err">{regErrors.email}</div>}</div>
              <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ الإرسال..." : "إرسال رمز التحقق ✉"}</button>
            </form>
            <div style={{textAlign:"center",marginTop:"1.2rem",fontSize:"0.8rem",color:"var(--wg)"}}>
              لديك حساب؟ <button style={{background:"none",border:"none",color:"var(--mi-d)",fontFamily:"var(--font-ar)",fontSize:"0.8rem",cursor:"pointer",fontWeight:600}} onClick={() => { setScreen("resume"); setOtpStep("form"); }}>استئناف الجلسة</button>
            </div>
          </> : <>
            <h1 className="auth-title">رمز التحقق</h1>
            <p className="auth-sub">تم إرسال رمز مكوّن من 6 أرقام إلى<br/><strong style={{color:BRAND.dark,direction:"ltr",display:"inline-block"}}>{user.email}</strong></p>
            <form onSubmit={handleVerifyOtp} noValidate>
              <div className={`fg ${otpError ? "fg-err" : ""}`}>
                <label htmlFor="reg-otp">رمز التحقق</label>
                <input id="reg-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otpCode} {...errAttrs("reg-otp", otpError)}
                  onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  style={{ direction: "ltr", textAlign: "center", fontSize: "1.6rem", letterSpacing: "10px", fontWeight: 700 }} />
                {otpError && <div className="fg-msg" id="reg-otp-err">{otpError}</div>}
              </div>
              <button type="submit" className="btn" disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
            </form>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button style={{ background: "none", border: "none", color: BRAND.color, fontFamily: "var(--font-ar)", fontSize: "0.8rem", cursor: otpCooldown > 0 ? "default" : "pointer", opacity: otpCooldown > 0 ? 0.55 : 1 }} onClick={handleResendOtp} disabled={otpSending || otpCooldown > 0}>{otpCooldown > 0 ? `↻ إعادة الإرسال بعد ${otpCooldown} ثانية` : "↻ إعادة إرسال"}</button>
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
  otpCooldown = 0,
  setScreen,
  resumePhone,
  setResumePhone,
  resumeError,
  setResumeError,
  resumeLoading,
  handleResume,
  handleResumeVerify,
  passkeyAvailable,
  passkeyBusy,
  handlePasskeyLogin,
}) => (
  <AuthShell>
      <AuthLeft quote="القيمة الكامنة داخل الإنسان لا تُكتشف بالتأمل، بل بالهندسة" />
      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-logo"><MILogo size={28} color={BRAND.dark}/><span className="auth-logo-text">مصفوفة التأثير</span></div>
          {otpStep === "form" ? <>
            <h1 className="auth-title">استئناف الجلسة</h1>
            <p className="auth-sub">أدخل رقم جوالك لاستعادة بياناتك وخطتك السابقة</p>
            <form onSubmit={handleResume} noValidate>
              <div className={`fg ${resumeError ? "fg-err" : ""}`}>
                <label htmlFor="resume-phone">رقم الجوال المسجل</label>
                <input id="resume-phone" type="tel" autoComplete="tel" placeholder="05XXXXXXXX" value={resumePhone} maxLength={10} {...errAttrs("resume-phone", resumeError)}
                  onChange={e => { setResumePhone(e.target.value); setResumeError(""); }}
                  style={{ direction: "ltr", textAlign: "right" }} />
                {resumeError && <div className="fg-msg" id="resume-phone-err">{resumeError}</div>}
              </div>
              <button type="submit" className="btn" style={{ background: "#4A5628" }} disabled={resumeLoading}>
                {resumeLoading ? "جارٍ البحث..." : "إرسال رمز التحقق ✉"}
              </button>
            </form>
            {passkeyAvailable && <>
              <div className="auth-or">أو</div>
              <button type="button" className="btn btn-passkey" style={{ borderColor: "#4A5628", color: "#4A5628" }} disabled={passkeyBusy} onClick={handlePasskeyLogin}>{passkeyBusy ? "..." : "🔑 الدخول بمفتاح المرور"}</button>
            </>}
            <div style={{textAlign:"center",marginTop:"1.2rem",fontSize:"0.8rem",color:"var(--wg)"}}>
              مسجّل جديد؟ <button style={{background:"none",border:"none",color:"var(--mi-d)",fontFamily:"var(--font-ar)",fontSize:"0.8rem",cursor:"pointer",fontWeight:600}} onClick={() => { setScreen("register"); setOtpStep("form"); }}>بدء الرحلة</button>
            </div>
          </> : <>
            <h1 className="auth-title">رمز التحقق</h1>
            <p className="auth-sub">تم إرسال رمز إلى<br/><strong style={{color:BRAND.dark,direction:"ltr",display:"inline-block"}}>{user.email?.replace(/(.{2}).*(@.*)/, "$1***$2")}</strong></p>
            <form onSubmit={handleResumeVerify} noValidate>
              <div className={`fg ${otpError ? "fg-err" : ""}`}>
                <label htmlFor="resume-otp">رمز التحقق</label>
                <input id="resume-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otpCode} {...errAttrs("resume-otp", otpError)}
                  onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
                  style={{ direction: "ltr", textAlign: "center", fontSize: "1.6rem", letterSpacing: "10px", fontWeight: 700 }} />
                {otpError && <div className="fg-msg" id="resume-otp-err">{otpError}</div>}
              </div>
              <button type="submit" className="btn" style={{ background: "#4A5628" }} disabled={otpSending}>{otpSending ? "جارٍ التحقق..." : "تحقق ✓"}</button>
            </form>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button style={{ background: "none", border: "none", color: "#5B7B3A", fontFamily: "var(--font-ar)", fontSize: "0.8rem", cursor: otpCooldown > 0 ? "default" : "pointer", opacity: otpCooldown > 0 ? 0.55 : 1 }} onClick={handleResendOtp} disabled={otpSending || otpCooldown > 0}>{otpCooldown > 0 ? `↻ إعادة الإرسال بعد ${otpCooldown} ثانية` : "↻ إعادة إرسال"}</button>
              <button style={{ background: "none", border: "none", color: "var(--wg)", fontFamily: "var(--font-ar)", fontSize: "0.8rem", cursor: "pointer" }} onClick={() => { setOtpStep("form"); setOtpCode(""); setOtpError(""); }}>← رقم آخر</button>
            </div>
          </>}
          <button className="auth-back" onClick={() => { setScreen("splash"); setOtpStep("form"); setOtpCode(""); }}>→ العودة للرئيسية</button>
        </div>
      </div>
  </AuthShell>
);

