// ════════════════════════════════════════════════════════════════
// أثر المبادرات: المستوى الرابع في قياس الأثر (نتائج الجهة)
// ════════════════════════════════════════════════════════════════
// بجانب قياس كفاءات القائد قبل البرنامج وبعده: مبادرات التخرج المعتمدة،
// وتنفيذها، وما تحقق من منافعها بأرقام يؤكدها رعاتها. الأرقام كلها من
// ملخص المتابعة على الخادم، فلا حساب هنا.
import React, { useEffect, useState } from 'react';
import { L, date } from '../leaders.js';
import { Spinner } from '../ui.jsx';

export const HEALTH_CHIP = { green: 'ok', amber: 'warn', red: 'bad', stale: 'warn', pending: '', closed: 'ok' };
const CP = { upcoming: 'لم يحن موعدها', due: 'حان موعدها', missed: 'فاتت', submitted: 'أُرسلت', verified: 'أكّدها الراعي', disputed: 'اعترض الراعي' };
const pct = (v) => (v == null ? '·' : `${v}%`);

// متابعة مبادرة واحدة، في صفحة الوثيقة عند المستشار
export function TrackingPanel({ t }) {
  if (!t?.summary) return null;
  const s = t.summary;
  const last = t.updates?.[0];
  return (
    <section className="la-card">
      <div className="la-row between"><h3>متابعة التنفيذ والأثر</h3><span className={`la-chip ${HEALTH_CHIP[s.health] || ''}`}>{s.health_title}</span></div>
      <p className="la-muted">اليوم {s.day} من الاعتماد · {s.updates} تحديث · آخره {last ? date(last.updated_at) : 'لم يصل بعد'}</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">معالم في موعدها</div><div className="stat-value">{pct(s.milestones.on_time)}</div></div>
        <div className="stat-card"><div className="stat-label">تحققت</div><div className="stat-value">{s.milestones.done} / {s.milestones.total}</div></div>
        <div className="stat-card"><div className="stat-label">تحقق المنافع</div><div className="stat-value">{pct(s.benefits.realization)}</div></div>
        <div className="stat-card"><div className="stat-label">منافع مقيسة</div><div className="stat-value">{s.benefits.measured} / {s.benefits.total}</div></div>
      </div>
      <table className="la-table">
        <thead><tr><th>المنفعة</th><th>خط الأساس</th><th>المستهدف</th><th>الفعلي</th><th>التحقق</th></tr></thead>
        <tbody>{t.state.benefits.map((b) => <tr key={b.key}><td>{b.title}</td><td>{b.baseline || '·'}</td><td>{b.target || '·'}</td><td>{b.value ?? '·'}</td><td>{b.realization == null ? '·' : `${Math.round(b.realization * 100)}%`}</td></tr>)}</tbody>
      </table>
      <table className="la-table">
        <thead><tr><th>المعلم</th><th>المستهدف</th><th>الحالة</th><th>ملاحظة</th></tr></thead>
        <tbody>{t.state.milestones.map((m) => <tr key={m.key}><td>{m.title}</td><td>{m.due || '·'}</td><td>{t.statuses[m.status] || 'لم يُحدَّث'}{m.actual ? ` · ${m.actual}` : ''}</td><td>{m.note || ''}</td></tr>)}</tbody>
      </table>
      <p>{s.checkpoints.map((c) => <span key={c.key} className="la-chip">{c.title}: {c.verify_title || CP[c.status]}</span>)}</p>
      {last?.blockers && <p><b>ما يعيقه:</b> {last.blockers}</p>}
      {last?.support && <p><b>ما يحتاجه:</b> {last.support}</p>}
    </section>
  );
}

// المحفظة: كل المبادرات المعتمدة أو مبادرات جهة واحدة
export default function Outcomes({ org, onOpen }) {
  const [r, setR] = useState(null);
  useEffect(() => { setR(null); L('admin.outcomes', org ? { organization_id: org } : {}).then(setR); }, [org]);
  if (!r) return <Spinner />;
  if (!r.success) return <div className="la-err" role="alert">{r.message}</div>;
  const t = r.totals;
  return (
    <section className="la-card">
      <h3>أثر المبادرات <small className="la-muted">· المستوى الرابع: نتائج الجهة</small></h3>
      <p className="la-muted">مبادرات التخرج المعتمدة وتنفيذها بعد البرنامج. الخطة من الوثيقة المعتمدة، والفعلي من تحديثات القادة الشهرية، ويؤكد الرعاة أرقام مراجعتي اليوم 90 و180.</p>
      {!t.approved ? <p className="la-muted">لا مبادرات معتمدة بعد.</p> : (
        <>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">مبادرات معتمدة</div><div className="stat-value">{t.approved}</div></div>
            <div className="stat-card"><div className="stat-label">تتابع تنفيذها</div><div className="stat-value">{t.reporting}</div></div>
            <div className="stat-card"><div className="stat-label">معالم في موعدها</div><div className="stat-value">{pct(t.on_time)}</div></div>
            <div className="stat-card"><div className="stat-label">تحقق المنافع</div><div className="stat-value s-replied">{pct(t.realization)}</div></div>
            <div className="stat-card"><div className="stat-label">مراجعات أكّدها الرعاة</div><div className="stat-value">{t.verified}</div></div>
          </div>
          <p>{Object.entries(t.health).map(([k, n]) => <span key={k} className={`la-chip ${HEALTH_CHIP[k] || ''}`}>{r.health[k]}: {n}</span>)}</p>
          <table className="la-table">
            <thead><tr><th>المبادرة</th><th>القائد</th><th>الجهة</th><th>الحالة</th><th>في موعدها</th><th>تحقق المنافع</th><th>اليوم</th></tr></thead>
            <tbody>{r.initiatives.map((x) => (
              <tr key={x.participant_id}>
                <td><button className="la-link" onClick={() => onOpen(x.participant_id)}>{x.initiative || 'بلا اسم'}</button></td>
                <td>{x.full_name}</td><td>{x.organization || '·'}</td>
                <td>{x.summary ? <span className={`la-chip ${HEALTH_CHIP[x.summary.health] || ''}`}>{x.summary.health_title}</span> : '·'}</td>
                <td>{pct(x.summary?.milestones.on_time)}</td><td>{pct(x.summary?.benefits.realization)}</td><td>{x.summary?.day ?? '·'}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
    </section>
  );
}
