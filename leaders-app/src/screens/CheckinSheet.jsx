// ════════════════════════════════════════════════════════════════
// «سجّل حضوري»: الماسح داخل التطبيق والأرقام الستة (W2، تصور الحضور 2026-11-18 ب5.5 البندان 3 و4)
// ════════════════════════════════════════════════════════════════
// يفتح الكاميرا داخل التطبيق ويقرأ الرمز المتغير على شاشة القاعة (scanner.js)، ثم يسجّل الحضور بمسار المسح القائم نفسه
// (workshop.checkin برمزه). وتحته دائمًا الأرقام الستة الظاهرة تحت الرمز (workshop.checkin بالأرقام)، وآخر حل: المدرب يسجّله
// يدويًا من قائمته. الكاميرا تُطفأ عند النجاح وعند الإغلاق وعند مغادرة الشاشة.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { call } from '../api.js';
import { CAMERA_AR, makeDetector, openCamera, stopStream, tokenFromScan } from '../scanner.js';
import { latinDigits, QR_WINDOW } from '../../../supabase/functions/leaders-api/logic.js';
import { sentence } from '../checkin.js';

const SCAN_EVERY_MS = 250;

export default function CheckinSheet({ session, onClose }) {
  const video = useRef(null);
  const panel = useRef(null);
  const [cam, setCam] = useState({ state: 'starting' });   // starting | live | error
  const [scanNote, setScanNote] = useState('');
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [done, setDone] = useState(null);
  const finished = !!done;

  // الكاميرا والقراءة: تبدأ مع فتح اللوح، وتتوقف مع النجاح أو الإغلاق
  useEffect(() => {
    if (finished) return undefined;
    let alive = true, stream = null, timer = 0, sending = false;
    (async () => {
      try {
        stream = await openCamera();
        if (!alive) { stopStream(stream); return; }
        const v = video.current;
        v.srcObject = stream;
        await v.play().catch(() => {});
        const det = await makeDetector(window);
        if (!alive) return;
        setCam({ state: 'live', kind: det.kind });
        const tick = async () => {
          if (!alive) return;
          if (!sending && v.readyState >= 2) {
            const text = await det.detect(v).catch(() => null);
            const t = text ? tokenFromScan(text) : null;
            if (text && !t) setScanNote('هذا ليس رمز حضور البرنامج. وجّه الكاميرا إلى الرمز على شاشة القاعة.');
            if (t && alive) {
              sending = true;
              setScanNote('قرأنا الرمز، نسجّل حضورك…');
              const r = await call('workshop.checkin', { t });
              if (!alive) return;
              if (r.success) { setDone(r); return; }
              setScanNote(`${sentence(r.message)} نحاول مع الرمز الظاهر الآن.`);
              sending = false;
            }
          }
          timer = setTimeout(tick, SCAN_EVERY_MS);
        };
        tick();
      } catch (e) {
        if (alive) setCam({ state: 'error', message: CAMERA_AR[e?.reason] || CAMERA_AR.failed });
      }
    })();
    return () => { alive = false; clearTimeout(timer); stopStream(stream); if (video.current) video.current.srcObject = null; };
  }, [finished]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(done); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, done]);

  const clean = latinDigits(digits).replace(/\D/g, '');
  const sendCode = async (e) => {
    e.preventDefault();
    if (clean.length !== 6 || busy) return;
    setBusy(true); setCodeError('');
    const r = await call('workshop.checkin', { code: clean });
    setBusy(false);
    if (r.success) setDone(r); else setCodeError(sentence(r.message));
  };

  // في جسم الصفحة لا داخل البطاقة: عمود «ما تفعله الآن» الثابت على الشاشات الواسعة يقص ما بداخله
  return createPortal(
    <div className="acct-sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(done); }}>
      <div ref={panel} className="acct-sheet ck-sheet" role="dialog" aria-modal="true" aria-labelledby="ck-title" tabIndex={-1}>
        <span className="acct-sheet-grip" aria-hidden="true" />
        {done ? (
          <div className="ck-done" role="status">
            <span className="checkin-mark ok" aria-hidden="true">✓</span>
            <h2 id="ck-title">{done.already ? 'حضورك مسجل مسبقًا' : `سُجّل حضورك في «${done.session.title}»`}</h2>
            {done.session.location && <p className="small muted">{done.session.location}</p>}
            <button type="button" className="btn" onClick={() => onClose(done)}>تم</button>
          </div>
        ) : <>
          <h2 id="ck-title">سجّل حضورك{session?.title ? ` في «${session.title}»` : ''}</h2>
          <div className="ck-cam">
            <video ref={video} muted playsInline autoPlay aria-label="الكاميرا" />
            {cam.state === 'live' && <span className="ck-frame" aria-hidden="true" />}
            {cam.state === 'starting' && <p className="ck-cam-note">نفتح الكاميرا…</p>}
            {cam.state === 'error' && <p className="ck-cam-note" role="alert">{cam.message}</p>}
          </div>
          <p className="small muted" aria-live="polite">{scanNote || (cam.state === 'live' ? 'وجّه الكاميرا إلى الرمز على شاشة القاعة، ويُسجَّل حضورك فور قراءته.' : '')}</p>
          <form className="ck-code" onSubmit={sendCode}>
            <label htmlFor="ck-digits">أو اكتب الأرقام الستة الظاهرة تحت الرمز</label>
            <div className="ck-code-row">
              <input id="ck-digits" className="input ck-digits" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                placeholder="123456" value={digits} onChange={(e) => { setDigits(latinDigits(e.target.value)); setCodeError(''); }}
                aria-invalid={!!codeError} aria-describedby={codeError ? 'ck-code-err' : undefined} />
              <button type="submit" className="btn" disabled={busy || clean.length !== 6}>{busy ? 'نسجّل…' : 'سجّل'}</button>
            </div>
            {codeError && <p id="ck-code-err" className="small ck-err" role="alert">{codeError}</p>}
            <p className="small muted">الأرقام تتغير مع الرمز كل {QR_WINDOW} ثانية، فاكتب الظاهرة الآن.</p>
          </form>
          <p className="small muted">تعذّر المسح والأرقام؟ اطلب من المدرب تسجيل حضورك من قائمته.</p>
          <button type="button" className="acct-sheet-cancel" onClick={() => onClose(null)}>إغلاق</button>
        </>}
      </div>
    </div>,
    document.body,
  );
}
