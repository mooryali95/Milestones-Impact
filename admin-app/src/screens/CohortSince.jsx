// ════════════════════════════════════════════════════════════════
// شريط «منذ آخر زيارة» أعلى تبويب «المتابعة» (تصور تشغيل الدفعة 2026-11-19، المرحلة 3، القسم 4.6)
// ════════════════════════════════════════════════════════════════
// ما تغيّر في الدفعة منذ آخر مرة نظر فيها هذا المدير: سطور مجمعة، كل سطر يصفّي الجدول تحته بأصحابه. لا حساب للمرحلة ولا
// للتأخر هنا: السطور من صفوف «المتابعة» نفسها بلحظاتها (cohortChanges في cohort-changes.js)، فتبديل «منذ» بلا طلب جديد.
// وقت آخر زيارة من الخادم (visit في رد admin.cohort-journey)، لكل مدير ولكل دفعة. لا يتقدم بفتح التبويب: يتقدم بعد أن
// يُعرض هذا الشريط والصفحة ظاهرة (admin.cohort-visit)، وما عُرض يبقى معروضًا في الزيارة نفسها، و«اعتبرها مقروءة» تفرغه.
// إن تعذّرت قراءة وقت آخر زيارة (visit.failed من الخادم): آخر سبعة أيام بجملة تقول ذلك، وبلا تقدم ولا زر «اعتبرها مقروءة».
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dateTime, L } from '../leaders.js';
import { cohortChanges, DEFAULT_SINCE_DAYS, SINCE_OPTIONS, sinceFor } from '../../../supabase/functions/leaders-api/cohort-changes.js';

const EMPTY_AR = { visit: 'لا جديد منذ آخر زيارة', yesterday: 'لا جديد منذ أمس', week: `لا جديد في آخر ${DEFAULT_SINCE_DAYS} أيام` };

/** @param {{ cohortId: string, rows: any[], map: any, at: string, visit: any, picked: string, onPick: (line: any|null) => void }} p */
export default function CohortSince({ cohortId, rows, map, at, visit, picked, onPick }) {
  const stored = !!visit && !visit.failed;
  const [opt, setOpt] = useState('visit');
  // «اعتبرها مقروءة» في هذه الجلسة: «منذ» يصير لحظة القراءة المعروضة، فيفرغ الشريط بلا إعادة تحميل
  const [readAt, setReadAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const now = Date.parse(at) || Date.now();
  const base = readAt || (stored ? visit.since : null);
  const since = sinceFor(opt, { visit: base, now });
  const ch = useMemo(() => cohortChanges(rows, { since, now, stages: map?.stages || [] }), [rows, map, since, now]);

  // التقدم بعد العرض: مرة لكل قراءة، وحين تكون الصفحة ظاهرة فعلًا (تبويب في الخلفية لا يُعدّ قراءة)
  const sent = useRef('');
  useEffect(() => {
    if (!stored || !at) return undefined;
    const go = () => {
      if (document.visibilityState !== 'visible' || sent.current === at) return;
      sent.current = at;
      L('admin.cohort-visit', { cohort_id: cohortId, at, op: 'seen' });
    };
    go();
    document.addEventListener('visibilitychange', go);
    return () => document.removeEventListener('visibilitychange', go);
  }, [cohortId, at, stored]);

  const markRead = async () => {
    setBusy(true); setErr('');
    const r = await L('admin.cohort-visit', { cohort_id: cohortId, at, op: 'read' });
    setBusy(false);
    if (!r?.success) { setErr(r?.message || 'تعذّر الحفظ، أعد المحاولة'); return; }
    setReadAt(at); setOpt('visit'); onPick(null);
  };

  const note = !stored ? `تعذّرت قراءة وقت آخر زيارة الآن، فنعرض آخر ${DEFAULT_SINCE_DAYS} أيام. حدّث الصفحة لإعادة المحاولة.`
    : opt === 'visit' && !base ? `أول زيارة لك لهذه الدفعة، فنعرض آخر ${DEFAULT_SINCE_DAYS} أيام.` : null;
  return (
    <section className="cs" aria-labelledby="cs-h" data-testid="cohort-since">
      <div className="cs-head">
        <h3 id="cs-h">منذ آخر زيارة</h3>
        <div className="cs-opts" role="group" aria-label="اعرض ما تغيّر منذ">
          {SINCE_OPTIONS.map(([k, l]) => (
            <button key={k} type="button" className={`cs-opt${opt === k ? ' on' : ''}`} aria-pressed={opt === k} onClick={() => { setOpt(k); onPick(null); }}>{l}</button>
          ))}
        </div>
        {stored && <button type="button" className="btn-sm ghost cs-read" onClick={markRead} disabled={busy || (opt === 'visit' && !ch.lines.length && !!base)}>{busy ? 'يُحفظ…' : 'اعتبرها مقروءة'}</button>}
      </div>
      <p className="la-muted small cs-when">{note || <>ما تغيّر منذ <bdi>{dateTime(since)}</bdi>.</>}{ch.lines.length > 0 && ' اضغط سطرًا لتصفية الجدول بأصحابه.'}</p>
      {err && <p className="la-err" role="alert">{err}</p>}
      {!ch.lines.length ? <p className="cs-empty" role="status" data-testid="cs-empty">{EMPTY_AR[opt]}</p> : (
        <ul className="cs-lines" role="list">
          {ch.lines.map((l) => (
            <li key={l.key}>
              <button type="button" className={`cs-line k-${l.kind}${picked === l.key ? ' on' : ''}`} aria-pressed={picked === l.key} data-kind={l.kind} onClick={() => onPick(picked === l.key ? null : l)}>{l.text}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
