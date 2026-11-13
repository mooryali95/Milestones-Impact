// ════════════════════════════════════════════════════════════════
// رحلة الجهة عند الإدارة: جاهزية دفعتها، وخريطة من يقف عند كل مرحلة
// ════════════════════════════════════════════════════════════════
// الخريطة هي مكوّن بوابة الجهة نفسه (shared/ui/JourneyMap.jsx) ببيانات الخادم نفسها (admin.org-journey)،
// فما تراه الإدارة هو ما يراه مسؤول الجهة، ومعه الأسماء وما ينقص كل شخص. والجاهزية من حقول الدفعة لا من عدّ ثانٍ.
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner } from '../ui.jsx';
import JourneyMap from '../../../shared/ui/JourneyMap.jsx';

// أين يُضبط كل بند، بالمسار الذي يسلكه المدير في اللوحة
const WHERE = {
  team: 'البرامج والدفعات ← الدفعة ← «الفريق والمجموعات»',
  cohort: 'البرامج والدفعات ← الدفعة ← «تحرير»',
  schedule: 'البرامج والدفعات ← الدفعة ← «الجدول»، وفيه «وزّع على مدة الدفعة»',
  activities: 'الأنشطة ← جلسة جديدة لهذه الدفعة',
};

export default function OrgJourney({ orgId }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); L('admin.org-journey', { organization_id: orgId }).then(setD); }, [orgId]);
  if (!d) return <section className="la-card"><h3>رحلة الجهة</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>رحلة الجهة</h3><p className="la-err">{d.message}</p></section>;
  return (
    <section className="la-card oj" aria-labelledby="oj-h">
      <h3 id="oj-h">رحلة الجهة{d.cohort && <> <small className="la-muted">· {d.cohort.name}</small></>}</h3>
      {!d.cohort ? <p className="la-muted">لا دفعة مفتوحة أو جارية لهذه الجهة: مشاركوها يتبعون الدفعة المفتوحة العامة. أنشئ دفعتها من «البرامج والدفعات».</p> : (
        <>
          <p className="la-muted">{d.setup_missing ? `بقي ${d.setup_missing === 1 ? 'بند واحد' : d.setup_missing === 2 ? 'بندان' : `${d.setup_missing} بنود`} لتكتمل جاهزية الدفعة.` : 'الدفعة مكتملة الإعداد.'}</p>
          <ul className="oj-setup">
            {d.setup.map((s) => (
              <li key={s.key} className={s.ok ? 'ok' : 'todo'}>
                <span className="oj-mark" aria-hidden="true">{s.ok ? '✓' : '!'}</span>
                <span><b>{s.title}:</b> {s.detail}{!s.ok && WHERE[s.where] && <><br /><small className="la-muted">يُضبط من: {WHERE[s.where]}</small></>}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {d.journey_map ? <JourneyMap map={d.journey_map} /> : <p className="la-muted">لا مراحل معرّفة لبرنامج هذه الجهة بعد.</p>}
    </section>
  );
}
