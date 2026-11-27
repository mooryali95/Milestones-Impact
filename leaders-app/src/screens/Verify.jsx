// ════════════════════════════════════════════════════════════════
// التحقق العام من شهادة: leaders.sunkvalue.com/v/<الرقم>
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا دخول، يصلها من يمسح رمز QR على الشهادة. تعرض حالة
// الشهادة وما يثبتها وحده: الاسم والبرنامج والدفعة والجهة وتاريخ الإصدار والرقم. لا لقطة ولا توقيع ولا قرار
// تقييم، فلا تُعرض الشهادة كاملة هنا؛ نسختها الرسمية عند صاحبها.
import { CONTACT_EMAIL, DOC_VERIFY_AR } from '../../../supabase/functions/leaders-api/labels.js';
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

function CertificateVerify() {
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

  const state = !r ? null : !r.success ? null : !r.found ? 'missing' : r.status;
  const c = r?.certificate;
  return (
    <div className="vf">
      <h1 className="eyebrow" style={{ textAlign: 'center' }}>التحقق من الشهادات · Certificate verification</h1>
      <div className="vf-card" aria-live="polite" data-tour="verify">
        {serial && !r && <div className="spinner" aria-label="جارٍ التحقق" style={{ margin: '20px auto' }} />}
        {r && !r.success && <p className="muted">{r.message}</p>}
        {state && <>
          <p className={`vf-state ${state}`}><i aria-hidden="true" />{STATE[state]}</p>
          {state === 'replaced' && r.replacement && <p className="small"><a href={`/v/${r.replacement}`}>اعرض الإصدار الأحدث</a></p>}
          {c && <>
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

// ── التحقق العام من وثيقة مبادرة معتمدة: /v/doc/<البصمة> (رمز QR في صفحة اعتمادها) ──
// ما يُعرض هو ما على غلاف الوثيقة وحده (الرقم، والمبادرة، والجهة، والبرنامج، وتاريخ الاعتماد)، بلا محتوى ولا أسماء أشخاص
export const fingerprintFromPath = () => decodeURIComponent(location.pathname.replace(/^\/v\/doc\/?/, '')).trim().toUpperCase();

export function DocumentVerify() {
  const [fp] = useState(fingerprintFromPath);
  const [r, setR] = useState(null);
  useEffect(() => { if (fp) call('doc.verify', { fingerprint: fp }).then(setR); }, [fp]);
  const d = r?.document;
  return (
    <div className="vf">
      <h1 className="eyebrow" style={{ textAlign: 'center' }}>التحقق من وثائق المبادرات · Document verification</h1>
      <div className="vf-card" aria-live="polite">
        {fp && !r && <div className="spinner" aria-label="جارٍ التحقق" style={{ margin: '20px auto' }} />}
        {r && !r.success && <p className="muted">{r.message}</p>}
        {r?.success && !r.found && <p className="vf-state missing"><i aria-hidden="true" />لا وثيقة معتمدة بهذه البصمة. تأكد منها كما هي مطبوعة في صفحة الاعتماد (مثل 1A2B-3C4D-5E6F-7A8B). النسخة الحية غير المعتمدة لا تُتحقق.</p>}
        {d && r.withheld && <>
          <p className="vf-state valid" data-verify="withheld"><i aria-hidden="true" />{DOC_VERIFY_AR.withheld}</p>
          <dl>
            <dt>البصمة</dt><dd className="ltr" style={{ textAlign: 'start' }}>{d.fingerprint}</dd>
            <dt>الجهة المصدِرة</dt><dd>{d.issuer}</dd>
          </dl>
        </>}
        {d && !r.withheld && <>
          <p className="vf-state valid"><i aria-hidden="true" />وثيقة معتمدة وأصلية: بصمتها تطابق النسخة المحفوظة لحظة اعتمادها</p>
          {d.initiative && <p className="vf-name">{d.initiative}</p>}
          <dl>
            {d.form && <><dt>الوثيقة</dt><dd>{d.form}</dd></>}
            <dt>رقم الوثيقة</dt><dd className="ltr" style={{ textAlign: 'start' }}>{d.ref}</dd>
            <dt>البصمة</dt><dd className="ltr" style={{ textAlign: 'start' }}>{d.fingerprint}</dd>
            {d.org && <><dt>الجهة</dt><dd>{d.org}</dd></>}
            {d.program && <><dt>البرنامج</dt><dd>{d.program}</dd></>}
            <dt>تاريخ الاعتماد</dt><dd>{fmt(d.approved_at)}</dd>
            <dt>الجهة المصدِرة</dt><dd>{d.issuer}</dd>
          </dl>
          <p className="small muted">إن اختلفت البصمة المطبوعة عن هذه، فالنسخة التي بين يديك ليست المعتمدة.</p>
        </>}
      </div>
    </div>
  );
}

export default function Verify() {
  return location.pathname.startsWith('/v/doc/') ? <DocumentVerify /> : <CertificateVerify />;
}
