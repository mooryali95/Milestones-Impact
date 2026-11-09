// ════════════════════════════════════════════════════════════════
// التحقق العام من شهادة: leaders.sunkvalue.com/v/<الرقم>
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا دخول، يصلها من يمسح رمز QR على الشهادة. تعرض حالة
// الشهادة وبياناتها من اللقطة المحفوظة على الخادم، وتفتح نسختها الرسمية.
import { CONTACT_EMAIL } from '../../../supabase/functions/leaders-api/labels.js';
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';

// D05: غير السارية تُعرض حالتها وحدها؛ الخادم لا يرسل لقطتها، فلا اسم ولا تفاصيل شخصية
const STATE = {
  valid: 'شهادة صحيحة وسارية',
  suspended: 'شهادة معلّقة حتى يُستكمل اعتماد التقييم الختامي',
  revoked: 'شهادة ملغاة',
  replaced: 'استُبدلت بإصدار أحدث',
  invalid: `بيانات الشهادة لا تطابق توقيعها. لا تعتمد عليها، وراسل ${CONTACT_EMAIL} للتأكد.`,
  missing: 'لا توجد شهادة بهذا الرقم. تأكد من الرقم كما هو مطبوع على الشهادة (مثل MI-LDR-2026-XXXXXX).',
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

export const serialFromPath = () => decodeURIComponent(location.pathname.replace(/^\/v\/?/, '')).trim().toUpperCase();

export default function Verify() {
  const [serial, setSerial] = useState(serialFromPath);
  const [q, setQ] = useState(serial);
  const [r, setR] = useState(null);

  useEffect(() => {
    if (!serial) return;
    setR(null);
    call('cert.verify', { serial }).then(setR);
  }, [serial]);

  const search = (e) => {
    e.preventDefault();
    const s = q.trim().toUpperCase();
    history.replaceState(null, '', `/v/${encodeURIComponent(s)}`);
    setSerial(s);
  };
  const open = async () => {
    const win = window.open('', '_blank');
    const { writeCertificate } = await import('../../../src/lib/brand/certificate.js');
    const stamp = r.status === 'valid' ? undefined : r.status === 'replaced' ? 'مستبدلة' : 'ملغاة';
    await writeCertificate(win, r.certificate, { status: stamp });
  };

  const state = !r ? null : !r.success ? null : !r.found ? 'missing' : r.status;
  const c = r?.certificate;
  return (
    <div className="vf">
      <p className="eyebrow" style={{ textAlign: 'center' }}>التحقق من الشهادات · Certificate verification</p>
      <div className="vf-card" aria-live="polite" data-tour="verify">
        {serial && !r && <div className="spinner" aria-label="جارٍ التحقق" style={{ margin: '20px auto' }} />}
        {r && !r.success && <p className="muted">{r.message}</p>}
        {state && <>
          <p className={`vf-state ${state}`}><i aria-hidden="true" />{STATE[state]}</p>
          {state === 'replaced' && r.replacement && <p className="small"><a href={`/v/${r.replacement}`}>اعرض الإصدار الأحدث</a></p>}
          {c && <>
            {c.kind === 'completion_success' && <p className="small muted">شهادة إتمام بنجاح</p>}
            <p className="vf-name">{c.name_ar}</p>
            {c.name_en && <p className="vf-en">{c.name_en}</p>}
            <dl>
              <dt>رقم الشهادة</dt><dd className="ltr" style={{ textAlign: 'start' }}>{c.serial}</dd>
              <dt>البرنامج</dt><dd>{c.program_ar}{c.track_ar ? ` · ${c.track_ar}` : ''}</dd>
              {c.cohort_ar && <><dt>الدفعة</dt><dd>{c.cohort_ar}</dd></>}
              {c.org?.name && <><dt>الجهة</dt><dd>{c.org.name}</dd></>}
              <dt>تاريخ الإصدار</dt><dd>{fmt(c.issued_at)}</dd>
              {r.revoked_at && <><dt>{state === 'replaced' ? 'تاريخ الاستبدال' : 'تاريخ الإلغاء'}</dt><dd>{fmt(r.revoked_at)}</dd></>}
              <dt>الجهة المصدِرة</dt><dd>Milestone Impact</dd>
            </dl>
            {state !== 'invalid' && <button className="btn sm" onClick={open}>اعرض الشهادة</button>}
          </>}
        </>}
        <form className="vf-search" onSubmit={search}>
          <label className="sr-only" htmlFor="vf-q">رقم الشهادة</label>
          <input id="vf-q" className="input ltr" value={q} onChange={(e) => setQ(e.target.value)} placeholder="MI-LDR-2026-XXXXXX" />
          <button className="btn sm ghost">تحقّق</button>
        </form>
      </div>
    </div>
  );
}
