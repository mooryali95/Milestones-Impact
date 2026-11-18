// ════════════════════════════════════════════════════════════════
// شاشة رمز الحضور للقاعة: مشتركة بين لوحة الإدارة وبوابة الخبير (W2، تصور الحضور 2026-11-18 ب5.5)
// ════════════════════════════════════════════════════════════════
// الرمز يتجدد كل 30 ثانية، وتحته الأرقام الستة من التوقيع والنافذة نفسيهما (workshopQr في activities.ts)، و«X من Y حضروا»
// وأسماء من لم يحضر من قائمة الحضور القائمة (workshopAttendance)، تُقرأ أول مرة وكلما تغيّر عدد الحاضرين.
// الشاشة لا تعرف مصدرها: loadQr وloadPeople يمرّرهما المستعمل (admin.workshop-qr أو xp.workshop-qr)، فالتوليد واحد على الخادم.
// الأسماء مطوية افتراضيًا: الشاشة تُعرض في القاعة، فيفتحها المدرب حين يريد.
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { BRAND } from '../js/brand.js';
import { countAr } from '../../supabase/functions/leaders-api/labels.js';
import { isUndated, QR_WINDOW, SCAN_RECEIPT_MINUTES } from '../../supabase/functions/leaders-api/logic.js';

// «123 456»: مجموعتان من ثلاثة أرقام تُقرأ من آخر القاعة، باتجاه LTR دائمًا داخل bdi
export const codeGroups = (c) => (/^\d{6}$/.test(String(c || '')) ? `${String(c).slice(0, 3)} ${String(c).slice(3)}` : '');

// العدد يطابق المعدود: «حاضر واحد»، «حاضران»، «5 حاضرين»، «11 حاضرًا»
export const attendedAr = (n) => (n ? countAr(n, 'حاضر واحد', 'حاضران', 'حاضرين', 'حاضرًا') : 'لم يحضر أحد بعد');

export default function PresenterQr({ loadQr, loadPeople, onClose, whenText = () => '' }) {
  const [d, setD] = useState(null);
  const [img, setImg] = useState('');
  const [people, setPeople] = useState(null);
  const [absentShown, setAbsentShown] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const attended = d?.success ? d.attended : null;
  useEffect(() => {
    if (attended == null || !loadPeople) return undefined;
    let alive = true;
    loadPeople().then((r) => { if (alive) setPeople(r?.success ? r.people : null); });
    return () => { alive = false; };
  }, [attended, loadPeople]);
  useEffect(() => {
    let t = 0, alive = true;
    const load = async () => {
      const r = await loadQr();
      if (!alive) return;
      setD(r);
      if (r?.success) setImg(await QRCode.toDataURL(r.url, { width: 640, margin: 1, color: { dark: BRAND.ink, light: BRAND.white } }));
      t = setTimeout(load, ((r?.refresh_in || 10) + 0.5) * 1000);
    };
    load();
    return () => { alive = false; clearTimeout(t); };
  }, [loadQr]);
  const expected = people ? people.length : null;
  const absent = people ? people.filter((p) => !p.attendance) : [];
  const code = d?.success ? codeGroups(d.code) : '';
  return (
    <div className="pq" role="dialog" aria-modal="true" aria-label="رمز الحضور" tabIndex={-1}>
      <button type="button" className="pq-x" onClick={onClose} aria-label="إغلاق">✕</button>
      {!d ? <div className="pq-wait" role="status">جارٍ تجهيز الرمز…</div> : !d.success ? <div className="pq-err" role="alert">{d.message}</div> : <>
        <h2>{d.session.title}</h2>
        <p className="pq-sub">{[d.session.location, whenText(d.session)].filter(Boolean).join(' · ')}</p>
        {d.open ? <>
          <img src={img} alt="رمز الحضور" />
          {code && <div className="pq-code">
            <span className="pq-code-k">أو اكتب الأرقام في التطبيق</span>
            {/* تُنطق رقمًا رقمًا لا عددًا واحدًا من ستة منازل */}
            <bdi dir="ltr" className="pq-digits" aria-label={d.code.split('').join(' ')}>{code}</bdi>
          </div>}
        </> : <div className="pq-err">{isUndated(d.session) ? 'حدد موعد الجلسة أولًا: تسجيل الحضور يُفتح قبل البدء بساعة.' : 'تسجيل الحضور لهذه الجلسة غير متاح الآن (يُفتح قبل البدء بساعة)، ويظهر الرمز هنا وحده حين يُفتح.'}</div>}
        <p className="pq-hint">امسح الرمز بكاميرا جوالك أو من «سجّل حضوري» في التطبيق، وإن طُلب منك الدخول فادخل خلال {SCAN_RECEIPT_MINUTES} دقيقة دون مسح ثانٍ. يتجدد الرمز والأرقام كل {QR_WINDOW} ثانية.</p>
        <b className="pq-count" aria-live="polite">{expected ? <><bdi dir="ltr">{expected - absent.length}</bdi> من <bdi dir="ltr">{expected}</bdi> حضروا</> : attendedAr(d.attended)}</b>
        {absent.length > 0 && <>
          <button type="button" className="pq-absent-t" aria-expanded={absentShown} onClick={() => setAbsentShown((v) => !v)}>{absentShown ? 'أخفِ الأسماء' : `من لم يحضر بعد (${absent.length})`}</button>
          {absentShown && <ul className="pq-absent">{absent.map((p) => <li key={p.id}>{p.full_name}</li>)}</ul>}
        </>}
      </>}
    </div>
  );
}
