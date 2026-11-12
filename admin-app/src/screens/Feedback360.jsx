// ════════════════════════════════════════════════════════════════
// تقييم 360 في اللوحة: حالة الدورات ونسب الاستجابة بلا نتيجة فرد، وإغلاق نافذة مبكرًا
// ════════════════════════════════════════════════════════════════
// (تصور 2026-11-11، اعتمده المالك) للتطوير وحده. الحدود والمهل من «الإعدادات العامة» (المجموعة feedback360).
// الأعداد من groupCounts نفسها التي يرى بها المشارك والمستشار (feedback360.js).
import React, { useCallback, useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { CYCLE_STATUS_AR } from '../../../supabase/functions/leaders-api/feedback360.js';
import { FEEDBACK_GROUP_AR } from '../../../supabase/functions/leaders-api/labels.js';

const WAVE_AR = { t1: 'الأولى', t2: 'الثانية' };
const countsAr = (c) => Object.entries(c || {}).filter(([, x]) => x.invited).map(([g, x]) => `${FEEDBACK_GROUP_AR[g]} ${x.submitted}/${x.invited}`).join(' · ') || '—';

export default function Feedback360({ canWrite, onPerson }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [status, setStatus] = useState('');
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
                  <td>{canWrite && c.status === 'open' && <button className="btn-sm ghost" onClick={() => close(c)}>أغلق الآن</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
