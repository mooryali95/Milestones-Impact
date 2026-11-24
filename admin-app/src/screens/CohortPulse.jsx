// ════════════════════════════════════════════════════════════════
// «نبض الدفعات الجارية» في البرامج والدفعات: سطر لكل دفعة جارية بجهتها وجاهزيتها وأقرب جلسة وما ينتظر قرارًا
// ════════════════════════════════════════════════════════════════
// انتقل من «نظرة عامة» (تصور تبويبات الإدارة 2026-11-24): المصدر واحد، رد admin.today (today-desk.js في الخادم) نفسه،
// ومكانه قائمة الدفعات. الدفعة المتعثرة (بلا جلسة قريبة، مقاعد...) سطر في «تنبيهات» نظرة عامة من الرد نفسه، فلا تتكرر
// في شريط «يحتاج انتباهك». جدول يصير بطاقات على الهاتف. يختفي حين لا دفعة جارية، وتعذّر القراءة سطر خافت
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { dateTime } from '../dates.js';

// دفعة الجهة التي لم يُقرأ اسم جهتها «جهة»، لا «أفراد»
const KIND_AR = { open: 'مفتوحة', individuals: 'أفراد', org: 'جهة' };

export function PulseTable({ t }) {
  if (!t) return null;
  if (!t.success) return <p className="la-muted small cp-err" role="status">تعذّرت قراءة نبض الدفعات الجارية الآن.</p>;
  const rows = t.pulse || [];
  if (!rows.length) return null;
  const plus = t.waiting_partial ? '+' : '';
  return (
    <section className="today-pulse" aria-labelledby="cp-h">
      <h3 className="la-phase" id="cp-h">نبض الدفعات الجارية</h3>
      <div className="today-pulse-wrap">
        {/* الأدوار صريحة: البطاقات على الهاتف (display: block) تُسقط دلالة الجدول في Safari وVoiceOver */}
        <table className="la-table today-pulse-t" role="table">
          <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">الدفعة</th><th scope="col" role="columnheader">الجهة</th><th scope="col" role="columnheader">الجاهزية</th><th scope="col" role="columnheader">أقرب جلسة</th><th scope="col" role="columnheader">ينتظر قرارًا</th></tr></thead>
          <tbody role="rowgroup">
            {rows.map((r) => (
              <tr key={r.id} data-id={r.id} role="row">
                <th scope="row" role="rowheader" data-label="الدفعة"><a className="la-link" href={`#/leaders/programs/${encodeURIComponent(r.id)}`}>{r.name}</a></th>
                <td role="cell" data-label="الجهة">{r.org || <span className="la-muted">{KIND_AR[r.kind] || 'جهة'}</span>}</td>
                <td role="cell" data-label="الجاهزية"><span className={`la-chip ${r.readiness?.missing ? 'warn' : 'ok'}`}>{r.readiness?.summary}</span></td>
                <td role="cell" data-label="أقرب جلسة">{r.next_at ? dateTime(r.next_at) : r.handbook ? <span className="la-muted">صيغة الكتاب</span> : t.unchecked?.includes('cohort_no_session') ? <span className="la-muted">غير مقروءة</span> : <span className="la-muted">لا جلسة مؤرخة</span>}</td>
                <td role="cell" data-label="ينتظر قرارًا">{r.waiting == null ? <span className="la-muted">غير مقروء</span> : <bdi dir="ltr">{r.waiting}{r.waiting ? plus : ''}</bdi>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* المتعثرة سطر في «تنبيهات» نظرة عامة من الرد نفسه: رابط لا نسخة */}
      {(t.alerts || []).some((a) => a.target?.tab === 'programs') && <p className="la-muted small"><a className="la-link" href="#/leaders/overview">دفعات تحتاج انتباهك في «تنبيهات» نظرة عامة ←</a></p>}
    </section>
  );
}

export default function CohortPulse() {
  const [t, setT] = useState(null);
  useEffect(() => {
    let live = true;
    L('admin.today', {}).then((r) => live && setT(r), (e) => live && setT({ success: false, message: e?.message }));
    return () => { live = false; };
  }, []);
  return <PulseTable t={t} />;
}
