// ════════════════════════════════════════════════════════════════
// التحقق الإضافي: بالبصمة (مفتاح المرور) أو برمز تطبيق المصادقة، بما يملكه الحساب وحده
// ════════════════════════════════════════════════════════════════
// نافذة واحدة لغرضين (step_up.ts): agent_key تأكيد لمرة واحدة قبل تغيير مفتاح المساعد (Agent.jsx)،
// وwrite «فعّل الكتابة» يرفع جلسة رمز البريد نفسها إلى عامل ثانٍ (شريط «للقراءة فقط» في App.jsx).
import React, { useCallback, useEffect, useState } from 'react';
import { call, session } from './api.js';
import { passkeyCancelled, passkeyGet, passkeySupported } from './passkey.js';
import { Spinner, useEscape } from './ui.jsx';

// رسائل الرموز التي ترد من التحقق نفسه، وما سواها رسالة الخادم كما هي
const CODE_AR = {
  replay: 'استُعمل هذا الرمز للتو. انتظر الرمز التالي في التطبيق.',
  bad_code: 'الرمز غير صحيح. أدخل الرمز الحالي من تطبيق المصادقة.',
};
export const stepUpMessage = (r) => CODE_AR[r?.code] || r?.message || 'تعذّر التحقق';

const NOTE = {
  agent_key: 'تأكيد لمرة واحدة صالح 5 دقائق لهذه الجلسة وحدها.',
  write: 'تأكيد واحد يفتح التعديل لهذه الجلسة حتى تنتهي، كأنك دخلت به. لا تحتاج إلى الخروج.',
};

export default function StepUp({ onDone, onCancel, title, purpose = 'agent_key' }) {
  const [sec, setSec] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const me = session.load()?.user || {};
  useEscape(onCancel);
  // تعذر القراءة لا يترك النافذة على مؤشر التحميل: يُعرض الخطأ مع إعادة المحاولة
  const readSec = useCallback(() => { setSec(null); call('security-status').then((r) => setSec(r?.success ? r : { failed: true })).catch(() => setSec({ failed: true })); }, []);
  useEffect(() => { readSec(); }, [readSec]);
  const hasKey = !!sec?.passkeys?.length && passkeySupported();
  // حال تطبيق المصادقة الآن من security-status، وجلسة الدخول احتياط لخادم أقدم
  const canTotp = !!(sec?.totp_enabled ?? me.totp_enabled) && !(sec?.passkey_only ?? me.passkey_only);
  const viaKey = async () => {
    setBusy(true); setErr('');
    try {
      const o = await call('step-up-options', { purpose });
      if (!o.success) throw new Error(stepUpMessage(o));
      const response = await passkeyGet(o.options);
      const v = await call('step-up-verify', { purpose, response });
      if (!v.success) throw new Error(stepUpMessage(v));
      onDone('passkey');
    } catch (e) { if (!passkeyCancelled(e)) setErr(e.message || 'تعذّر التحقق'); }
    setBusy(false);
  };
  const viaCode = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const v = await call('step-up-totp', { purpose, code: code.trim() });
    setBusy(false);
    if (!v.success) return setErr(stepUpMessage(v));
    setCode('');
    onDone('totp');
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="mid-box ag-stepup" role="dialog" aria-modal="true" aria-labelledby="ag-su-h">
        <h3 id="ag-su-h">{title}</h3>
        <p className="la-muted">{NOTE[purpose] || NOTE.agent_key}</p>
        {!sec ? <Spinner /> : sec.failed ? <div className="la-err" role="alert">تعذّرت قراءة طرق التحقق على حسابك. <button type="button" className="btn-sm ghost" onClick={readSec}>أعد المحاولة</button></div> : (
          <div className="ag-su-opts">
            {hasKey && <button type="button" className="btn-sm primary" disabled={busy} onClick={viaKey}>أكّد بالبصمة (مفتاح المرور)</button>}
            {canTotp && (
              <form onSubmit={viaCode} className="ag-su-code">
                <label>أكّد برمز تطبيق المصادقة
                  <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="رمز تطبيق المصادقة" />
                </label>
                <button type="submit" className="btn-sm" disabled={busy || code.length !== 6}>أكّد بالرمز</button>
              </form>
            )}
            {!hasKey && !canTotp && <p className="la-err" role="alert">لا مفتاح مرور ولا تطبيق مصادقة على حسابك. أضف أحدهما من «الإعدادات» (⚙) أولًا.</p>}
          </div>
        )}
        {err && <p className="la-err" role="alert">{err}</p>}
        <div className="mid-act"><button type="button" className="mid-btn" onClick={onCancel}>إلغاء</button></div>
      </div>
    </div>
  );
}
