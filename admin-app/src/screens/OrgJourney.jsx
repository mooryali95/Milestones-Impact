// ════════════════════════════════════════════════════════════════
// رحلة الجهة عند الإدارة: جاهزية دفعتها، وخريطة من يقف عند كل مرحلة
// ════════════════════════════════════════════════════════════════
// الخريطة هي مكوّن بوابة الجهة نفسه (shared/ui/JourneyMap.jsx) ببيانات الخادم نفسها (admin.org-journey)،
// فما تراه الإدارة هو ما يراه مسؤول الجهة، ومعه الأسماء وما ينقص كل شخص. والجاهزية من حقول الدفعة لا من عدّ ثانٍ.
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner } from '../ui.jsx';
import JourneyMap from '../../../shared/ui/JourneyMap.jsx';

// data: إن قرأتها صفحة الجهة (لجاهزيتها) تُمرَّر هنا فلا تُقرأ مرتين
export default function OrgJourney({ orgId, canWrite = false, data = undefined }) {
  const [own, setD] = useState(null);
  useEffect(() => { if (data !== undefined) return; setD(null); L('admin.org-journey', { organization_id: orgId }).then(setD); }, [orgId, data]);
  const d = data !== undefined ? data : own;
  if (!d) return <section className="la-card"><h3>رحلة الجهة</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>رحلة الجهة</h3><p className="la-err">{d.message}</p></section>;
  return (
    <section className="la-card oj" aria-labelledby="oj-h">
      <h3 id="oj-h">رحلة الجهة{d.cohort && <> <small className="la-muted">· {d.cohort.name}</small></>}</h3>
      {!d.cohort ? (
        <div className="la-row between">
          <p className="la-muted">لا دفعة مفتوحة أو جارية لهذه الجهة: مشاركوها يتبعون الدفعة المفتوحة العامة.</p>
          {canWrite && <a className="btn-sm primary" href={`#/leaders/programs?new=${encodeURIComponent(orgId)}`}>أنشئ دفعة لهذه الجهة</a>}
        </div>
      ) : (
        <>
          <div className="la-row between">
            <p className="la-muted">{d.setup_missing ? `بقي ${d.setup_missing === 1 ? 'بند واحد' : d.setup_missing === 2 ? 'بندان' : `${d.setup_missing} بنود`} لتكتمل جاهزية الدفعة.` : 'الدفعة مكتملة الإعداد.'} كل إعداداتها في ملفها.</p>
            <span className="la-row">
              <a className="btn-sm primary" href={`#/leaders/programs/${encodeURIComponent(d.cohort.id)}`}>افتح ملف الدفعة</a>
              {canWrite && <a className="btn-sm ghost" href={`#/leaders/programs?new=${encodeURIComponent(orgId)}`}>دفعة جديدة لهذه الجهة</a>}
            </span>
          </div>
          <ul className="oj-setup">
            {d.setup.map((s) => (
              <li key={s.key} className={s.ok ? 'ok' : 'todo'}>
                <span className="oj-mark" aria-hidden="true">{s.ok ? '✓' : '!'}</span>
                <span><b>{s.title}:</b> {s.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {d.journey_map ? <JourneyMap map={d.journey_map} /> : <p className="la-muted">لا مراحل معرّفة لبرنامج هذه الجهة بعد.</p>}
    </section>
  );
}
