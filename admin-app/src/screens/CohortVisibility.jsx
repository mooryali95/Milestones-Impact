// ════════════════════════════════════════════════════════════════
// رؤية الدفعة: ما يراه مستشارها والخبير المسند، باستثناء من الإعداد العام
// ════════════════════════════════════════════════════════════════
// المفاتيح وتسمياتها من الخادم (visibility.js عبر admin.cohort-visibility): لكل مفتاح الإعداد العام، واستثناء هذه
// الدفعة إن وُجد، والنافذ. «كالإعداد العام» يزيل الاستثناء. الحفظ يُسجَّل، وما وُسّع يُسمّى في الرد.
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';

const stateAr = (on) => (on ? 'مرئي' : 'محجوب');

export default function CohortVisibility({ cohort, canWrite, onClose }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  useEscape(() => onClose());
  useEffect(() => {
    L('admin.cohort-visibility', { cohort_id: cohort.id }).then((r) => {
      setD(r);
      if (r.success) setV(Object.fromEntries(r.keys.filter((k) => k.override !== null).map((k) => [k.key, k.override])));
    });
  }, [cohort.id]);
  const set = (key, value) => setV((x) => { const n = { ...x }; if (value === '') delete n[key]; else n[key] = value === 'on'; return n; });
  const save = async () => {
    setBusy(true);
    const r = await L('admin.cohort-visibility-save', { cohort_id: cohort.id, visibility: v });
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast(r.widened?.length ? `حُفظت. وُسّعت الرؤية في: ${r.widened.join('، ')}` : 'حُفظت استثناءات الرؤية');
    onClose(true);
  };
  const groups = d?.success ? [...new Set(d.keys.map((k) => k.audience))] : [];
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form cv-form" role="dialog" aria-modal="true" aria-label={`رؤية دفعة ${cohort.name}`}>
        <h3>رؤية «{cohort.name}»</h3>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : (
          <>
            <p className="la-muted">ما يراه مستشار هذه الدفعة والخبير المسند إلى مشاركيها. «كالإعداد العام» يتبع ما ضُبط في الإعدادات العامة، وأي اختيار آخر استثناء لهذه الدفعة وحدها.</p>
            {!d.ready && <p className="la-err">استثناءات الدفعة غير متاحة قبل تطبيق ترحيلها. الإعداد العام يعمل.</p>}
            {groups.map((g) => (
              <fieldset key={g} className="cv-group" disabled={!canWrite || !d.ready || busy}>
                <legend>{d.keys.find((k) => k.audience === g).audience_ar}</legend>
                {d.keys.filter((k) => k.audience === g).map((k) => (
                  <label key={k.key} className="cv-row">
                    <span><b>{k.label}</b><small className="la-muted">{k.hint}</small></span>
                    <select aria-label={`${k.audience_ar}: ${k.label}`} value={k.key in v ? (v[k.key] ? 'on' : 'off') : ''} onChange={(e) => set(k.key, e.target.value)}>
                      <option value="">كالإعداد العام ({stateAr(k.general)})</option>
                      <option value="on">مرئي لهذه الدفعة</option>
                      <option value="off">محجوب عن هذه الدفعة</option>
                    </select>
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="la-row">
              {canWrite && d.ready && <button type="button" className="btn-sm primary" disabled={busy} onClick={save}>{busy ? 'لحظة…' : 'احفظ الاستثناءات'}</button>}
              <button type="button" className="btn-sm ghost" onClick={() => onClose()}>إغلاق</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// «عاين بعين…»: ما يصل المستشار أو الخبير المسند عن هذا المشارك بالمفاتيح النافذة الآن (admin.preview-as)
export function PreviewAs({ participantId, onClose }) {
  const [as, setAs] = useState('advisor');
  const [d, setD] = useState(null);
  useEscape(onClose);
  useEffect(() => { setD(null); L('admin.preview-as', { participant_id: participantId, as }).then(setD); }, [participantId, as]);
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form cv-form" role="dialog" aria-modal="true" aria-label="معاينة بعين الخبير">
        <h3>ماذا يرى الخبير عن {d?.name || 'هذا المشارك'}</h3>
        <div className="la-row" role="group" aria-label="الدور">
          <button type="button" className={`btn-sm ${as === 'advisor' ? 'primary' : 'ghost'}`} aria-pressed={as === 'advisor'} onClick={() => setAs('advisor')}>مستشار الدفعة</button>
          <button type="button" className={`btn-sm ${as === 'assigned' ? 'primary' : 'ghost'}`} aria-pressed={as === 'assigned'} onClick={() => setAs('assigned')}>خبير مسند بطلب</button>
        </div>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : (
          <>
            <p className="la-muted">من الحمولة الحقيقية التي تصله الآن، بمفاتيح الرؤية النافذة لدفعة المشارك. «محجوب» قد يعني أيضًا أن لا بيانات بعد.</p>
            <ul className="cv-sees">
              {d.sees.map((x) => <li key={x.label} className={x.visible ? 'ok' : 'off'}><span aria-hidden="true">{x.visible ? '✓' : '—'}</span> {x.label} <small className="la-muted">{x.visible ? (x.value || 'مرئي') : 'محجوب أو فارغ'}</small></li>)}
            </ul>
            <p className="la-muted small">ما يحق له فعله: {[d.can.answers && 'فتح الإجابات', d.can.observe && 'إضافة ملاحظة', d.can.final_edit && 'تعديل الختامي', d.can.hall && 'إدارة القاعة'].filter(Boolean).join('، ') || 'القراءة فقط'}.</p>
          </>
        )}
        <div className="la-row"><button type="button" className="btn-sm ghost" onClick={onClose}>إغلاق</button></div>
      </div>
    </div>
  );
}
