// ════════════════════════════════════════════════════════════════
// تقييم 360 في اللوحة: حالة الدورات ونسب الاستجابة بلا نتيجة فرد، وإغلاق نافذة مبكرًا
// ════════════════════════════════════════════════════════════════
// (تصور 2026-11-11، اعتمده المالك) للتطوير وحده. الحدود والمهل من «الإعدادات العامة» (المجموعة feedback360).
// الأعداد من groupCounts نفسها التي يرى بها المشارك والمستشار (feedback360.js).
import React, { useCallback, useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { Report360Panel } from '../../../src/lib/Report360.jsx';
import { CYCLE_STATUS_AR } from '../../../supabase/functions/leaders-api/feedback360.js';
import { FEEDBACK_GROUP_AR, FEEDBACK_OPEN_AR } from '../../../supabase/functions/leaders-api/labels.js';

const WAVE_AR = { t1: 'الأولى', t2: 'الثانية' };
const countsAr = (c) => Object.entries(c || {}).filter(([, x]) => x.invited).map(([g, x]) => `${FEEDBACK_GROUP_AR[g]} ${x.submitted}/${x.invited}`).join(' · ') || '—';

// تقرير فرد للدعم الفني: يُحمَّل عند الطلب فيُسجَّل كل فتح على الخادم (admin.f360-report)، ومعه الملاحظات
// بمعرّف صاحبها لا اسمه لحجب ما يكشفه أو يسيء. التركيز وحبسه من useModalFocus (ui.jsx)، وEsc من useEscape
function ReportDialog({ c, onClose }) {
  const { toast } = useUI();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => L('admin.f360-report', { cycle_id: c.id }).then((r) => (r.success ? setData(r) : setError(r.message))), [c.id]);
  useEffect(() => { load(); }, [load]);
  useEscape(onClose);
  const hide = async (n) => {
    const r = await L('admin.f360-comment', { rater_id: n.rater_id, hidden: !n.hidden });
    toast(r.success ? (r.hidden ? 'حُجبت الملاحظة' : 'أُظهرت الملاحظة') : r.message);
    if (r.success) load();
  };
  return (
    <Report360Panel title={`تقرير 360 · ${c.participant}`} data={data} error={error} onClose={onClose}>
      {data?.notes?.length > 0 && (
        <section className="la-card" aria-label="مراجعة الملاحظات" style={{ marginTop: 16 }}>
          <h3>مراجعة الملاحظات</h3>
          <p className="la-muted">احجب ملاحظة تكشف صاحبها أو تسيء. الحجب يُسجَّل، ويسري على ما يراه المشارك والمستشار.</p>
          {data.notes.map((n, i) => (
            <div key={n.rater_id} className="la-row between">
              <div>{Object.entries(n.open).map(([k, t]) => <p key={k}><small className="la-muted">{FEEDBACK_OPEN_AR[k]}</small> {t}</p>)}</div>
              <button type="button" className="btn-sm ghost" aria-label={`${n.hidden ? 'أظهر' : 'احجب'} الملاحظة ${i + 1}`} onClick={() => hide(n)}>{n.hidden ? 'أظهر' : 'احجب'}</button>
            </div>
          ))}
        </section>
      )}
    </Report360Panel>
  );
}

export default function Feedback360({ canWrite, onPerson }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [status, setStatus] = useState('');
  const [view, setView] = useState(null);
  const load = useCallback(() => L('admin.f360', status ? { status } : {}).then(setD), [status]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  const close = async (c) => {
    if (!(await confirm(`تُغلق نافذة ${c.participant} الآن، ويُبلَّغ مستشاره أن التقرير جاهز. متابعة؟`))) return;
    const r = await L('admin.f360-close', { cycle_id: c.id });
    toast(r.success ? 'أُغلقت النافذة' : r.message);
    if (r.success) load();
  };
  const t = d.totals;
  return (
    <div>
      {!d.ready && <div className="la-card la-muted" role="status">جدول دورات 360 لم يُرحَّل بعد، فلا دورات.</div>}
      <div className="la-card">
        <h3>تقييم 360 للتطوير</h3>
        <p className="la-muted">للتطوير وحده: لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عن الفرد. لا تظهر هنا نتيجة فرد؛ فتح تقرير فرد للدعم الفني يُسجَّل باسمك.</p>
        {t && <p>{t.cycles} دورة · {t.open} مفتوحة · استجابة {t.response_pct == null ? '—' : `${t.response_pct}%`} ({t.submitted} من {t.invited})</p>}
        <label className="la-row">الحالة
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(CYCLE_STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="la-card">
        {!d.cycles.length ? <p className="la-muted">لا دورات.</p> : (
          <table className="la-table">
            <thead><tr><th scope="col">المشارك</th><th scope="col">الموجة</th><th scope="col">الحالة</th><th scope="col">المجموعات (أرسل/دُعي)</th><th scope="col">الإغلاق</th><th scope="col">إجراء</th></tr></thead>
            <tbody>
              {d.cycles.map((c) => (
                <tr key={c.id}>
                  <td><button type="button" className="btn-sm ghost" onClick={() => onPerson?.(c.participant_id)}>{c.participant}</button>{c.is_test && <span className="la-chip">اختبار</span>}</td>
                  <td>{WAVE_AR[c.wave]}</td>
                  <td>{c.status_ar}</td>
                  <td>{countsAr(c.counts)}</td>
                  <td>{date(c.closes_at)}</td>
                  <td className="la-row">{canWrite && c.status === 'open' && <button className="btn-sm ghost" onClick={() => close(c)}>أغلق الآن</button>}
                    {canWrite && ['closed', 'released'].includes(c.status) && <button className="btn-sm ghost" onClick={() => setView(c)} aria-label={`تقرير ${c.participant}`}>التقرير</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {view && <ReportDialog c={view} onClose={() => setView(null)} />}
    </div>
  );
}
