// ════════════════════════════════════════════════════════════════
// هوية الدفعة في وثيقة المبادرة: اسم البرنامج وشعاره ولونه (cohorts.identity، admin.cohort-identity-save)
// ════════════════════════════════════════════════════════════════
// الصدارة في الوثيقة للجهة، والدفعة سطر توقيع بعدها، وMilestone علامة خافتة. اللون يقود أرقام الأبواب وخطوطها فقط
// حين لا لون للجهة، وبعد فحص التباين (doc.js structuralAccent)، وإلا الذهبي. الوثائق المعتمدة لا تتغير: هويتها مجمّدة في لقطتها.
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { ACCENT_MIN_CONTRAST, C, contrastRatio } from '../../../src/lib/brand/doc.js';
import { IDENTITY_LOGO_MAX } from '../../../supabase/functions/leaders-api/cohort-identity.js';

const COLOR = /^#[0-9a-f]{6}$/i;

export default function CohortIdentity({ cohort, canWrite, onClose }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const [v, setV] = useState({ program: '', logo: '', color: '' });
  const [busy, setBusy] = useState(false);
  useEscape(() => onClose());
  useEffect(() => {
    L('admin.cohort-identity', { cohort_id: cohort.id }).then((r) => {
      setD(r);
      if (r.success) setV({ program: r.identity.program || '', logo: r.identity.logo || '', color: r.identity.color || '' });
    });
  }, [cohort.id]);
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const s = String(rd.result || ''); if (s.length > IDENTITY_LOGO_MAX) toast('الشعار أكبر من المسموح (نحو 150 ك.ب)'); else setV((x) => ({ ...x, logo: s })); };
    rd.readAsDataURL(f);
  };
  const save = async () => {
    setBusy(true);
    const r = await L('admin.cohort-identity-save', { cohort_id: cohort.id, identity: { program: v.program, logo: v.logo || null, color: v.color || null } });
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast('حُفظت هوية الدفعة. تظهر في الوثائق التي تُبنى من الآن، والمعتمدة تبقى كما صدرت.');
    onClose(true);
  };
  const ratio = COLOR.test(v.color) ? contrastRatio(v.color) : null;
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form cv-form" role="dialog" aria-modal="true" aria-label={`هوية دفعة ${cohort.name} في الوثيقة`}>
        <h3>هوية «{cohort.name}» في وثيقة المبادرة</h3>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : (
          <>
            <p className="la-muted">الجهة في صدارة الغلاف، وهوية الدفعة سطر توقيع بعدها، وMilestone علامة صغيرة. شعار الدفعة لا يتجاوز 9 مم ارتفاعًا.</p>
            {!d.ready && <p className="la-err">هوية الدفعة غير متاحة قبل تطبيق ترحيلها. الوثيقة تعمل بلا هوية دفعة.</p>}
            <fieldset disabled={!canWrite || !d.ready || busy}>
              <label className="cv-row"><span><b>اسم البرنامج</b><small className="la-muted">كما يظهر على الغلاف، مثل «برنامج قادة التحول، الدفعة الثالثة»</small></span>
                <input className="la-in" maxLength={d.program_max} value={v.program} onChange={(e) => setV((x) => ({ ...x, program: e.target.value }))} /></label>
              <label className="cv-row"><span><b>الشعار</b><small className="la-muted">PNG أو SVG بخلفية شفافة</small></span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick} /></label>
              {v.logo && <div className="la-row"><img src={v.logo} alt="" style={{ maxHeight: 34, maxWidth: 150, objectFit: 'contain' }} /><button type="button" className="btn-sm ghost" onClick={() => setV((x) => ({ ...x, logo: '' }))}>أزل الشعار</button></div>}
              <label className="cv-row"><span><b>اللون</b><small className="la-muted">يقود أرقام الأبواب وخطوطها حين لا لون للجهة، بشرط تباين {ACCENT_MIN_CONTRAST}:1 على الأبيض</small></span>
                <span className="la-row"><input type="color" value={COLOR.test(v.color) ? v.color : C.gold.toLowerCase()} onChange={(e) => setV((x) => ({ ...x, color: e.target.value }))} aria-label="اللون" />
                  <input className="la-in ltr" value={v.color} placeholder="#RRGGBB" onChange={(e) => setV((x) => ({ ...x, color: e.target.value.trim() }))} style={{ width: 110 }} />
                  {v.color && <button type="button" className="btn-sm ghost" onClick={() => setV((x) => ({ ...x, color: '' }))}>بلا لون</button>}</span></label>
              {ratio != null && <p className={ratio >= ACCENT_MIN_CONTRAST ? 'la-muted' : 'la-err'}>التباين على الأبيض {ratio.toFixed(1)}:1. {ratio >= ACCENT_MIN_CONTRAST ? 'يُستعمل في البنية.' : 'أقل من الحد، فتعود البنية إلى لون الهوية الذهبي تلقائيًا.'}</p>}
            </fieldset>
            <div className="la-row">
              {canWrite && d.ready && <button type="button" className="btn-sm primary" disabled={busy} onClick={save}>{busy ? 'لحظة…' : 'احفظ الهوية'}</button>}
              <button type="button" className="btn-sm ghost" onClick={() => onClose()}>إغلاق</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
