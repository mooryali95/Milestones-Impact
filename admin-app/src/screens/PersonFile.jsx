// ════════════════════════════════════════════════════════════════
// ملف المشارك الكامل: ملخص الأعلام، والملاحظات، وما لم يكن يُعرض، والخط الزمني
// ════════════════════════════════════════════════════════════════
// كله من admin.participant (file.ts): الأعلام والخط الزمني مشتقان على الخادم (observations.js)، والملاحظات من
// participant_observations وحده. الواجهة تعرض ولا تحسب.
import React, { useState } from 'react';
import { date, L } from '../leaders.js';
import { useUI } from '../ui.jsx';
import { OBS_KIND_AR, OBS_SOURCE_AR } from '../../../supabase/functions/leaders-api/observations.js';
// تسميات الحالات من مصادرها الوحيدة: جلسات التوجيه من labels.js، ووثيقة المبادرة من capstone.js، ودورة 360 من feedback360.js
import { COACH_STATUS_ADMIN as SESSION_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { STATUS_TITLES as CAP_AR } from '../../../supabase/functions/leaders-api/capstone.js';
import { CYCLE_STATUS_AR as F360_AR } from '../../../supabase/functions/leaders-api/feedback360.js';

const TONE = { bad: 'bad', warn: 'warn', info: '', ok: 'ok' };

// ما يستحق نظر المراجع الآن، في سطر واحد أعلى الملف
export function FileFlags({ flags }) {
  if (!flags?.length) return <p className="pf-flags la-muted">لا أعلام على هذا الملف.</p>;
  return (
    <ul className="pf-flags" aria-label="ملخص الأعلام">
      {flags.map((f, i) => <li key={`${f.key}-${i}`}><span className={`la-chip ${TONE[f.tone] ?? ''}`} title={f.detail || undefined}>{f.label}</span></li>)}
    </ul>
  );
}

export function Observations({ participantId, list, canWrite, onChanged, action = 'admin.observation-add', call = L }) {
  const { toast, confirm } = useUI();
  const [v, setV] = useState({ kind: 'note', title: '', body: '', visible: false });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (v.visible && !(await confirm(`هذه ${OBS_KIND_AR[v.kind]} مرئية للمشارك: تظهر له بطاقة في الموقع ويصله بريد بنصها. متابعة؟`))) return;
    setBusy(true);
    const r = await call(action, { participant_id: participantId, ...v });
    setBusy(false);
    toast(r.success ? (v.visible ? 'حُفظت وأُبلغ المشارك' : 'حُفظت في الملف') : r.message);
    if (r.success) { setV({ kind: 'note', title: '', body: '', visible: false }); onChanged?.(); }
  };
  const remove = async (o) => {
    if (!(await confirm('حذف هذه الملاحظة من الملف؟ يبقى أثر الحذف في السجل.', { danger: true }))) return;
    const r = await L('admin.observation-remove', { id: o.id });
    toast(r.success ? 'حُذفت' : r.message);
    if (r.success) onChanged?.();
  };
  return (
    <section className="la-card pf-obs" aria-labelledby="pf-obs-h">
      <h3 id="pf-obs-h">الملاحظات والتنبيهات <small className="la-muted">· {list?.length || 0}</small></h3>
      {canWrite && (
        <form className="pf-obs-form" onSubmit={save}>
          <div className="la-row">
            <select aria-label="النوع" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
              {Object.entries(OBS_KIND_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input aria-label="عنوان قصير (اختياري)" placeholder="عنوان قصير (اختياري)" value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </div>
          <textarea aria-label="نص الملاحظة" rows={3} required minLength={3} maxLength={2000} placeholder="ما الذي لاحظته؟ اكتب الواقعة وتاريخها وما يُنتظر بعدها." value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
          <div className="la-row between">
            <label className="pf-check"><input type="checkbox" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} /> يراها المشارك (بطاقة في الموقع وبريد)</label>
            <button className="btn-sm primary" disabled={busy}>{busy ? 'لحظة…' : 'أضف إلى الملف'}</button>
          </div>
        </form>
      )}
      {list?.length ? (
        <ul className="pf-obs-list">
          {list.map((o) => (
            <li key={o.id} className={`pf-o ${o.kind}`}>
              <div className="la-row between">
                <span><span className={`la-chip ${o.kind === 'warning' ? 'warn' : o.kind === 'commendation' ? 'ok' : ''}`}>{OBS_KIND_AR[o.kind] || o.kind}</span> {o.title && <b>{o.title}</b>}</span>
                <small className="la-muted">{OBS_SOURCE_AR[o.source] || o.source} · {date(o.created_at)}</small>
              </div>
              <p>{o.body}</p>
              <small className="la-muted">
                {o.visible ? (o.acknowledged_at ? `مرئية للمشارك، واطّلع عليها ${date(o.acknowledged_at)}` : 'مرئية للمشارك، ولم يطّلع عليها بعد') : 'داخلية: لا يراها المشارك'}
                {canWrite && o.source !== 'system' && action === 'admin.observation-add' && <> · <button type="button" className="la-link" onClick={() => remove(o)}>حذف</button></>}
              </small>
            </li>
          ))}
        </ul>
      ) : <p className="la-muted">لا ملاحظات في الملف بعد.</p>}
    </section>
  );
}

// ما كان غائبًا عن الملف: جلسات التوجيه، ووثيقة المبادرة، وتقييم 360، وحضور الورش
export function FileExtras({ r }) {
  const sessions = r.sessions || [], att = r.attendance || [], f360 = r.feedback360 || [];
  const cap = r.capstone;
  return (
    <section className="la-card" aria-labelledby="pf-x-h">
      <h3 id="pf-x-h">الجلسات والمبادرة والحضور</h3>
      <dl className="la-dl">
        <dt>جلسات التوجيه</dt>
        <dd>{sessions.length ? (
          <ul className="pf-mini">{sessions.slice(0, 8).map((s) => (
            <li key={s.id}><span className={`la-chip ${s.status === 'no_show' ? 'bad' : s.status === 'attended' ? 'ok' : ''}`}>{SESSION_AR[s.status] || s.status}</span> {date(s.starts_at)}{s.expert && <> · {s.expert}</>}</li>
          ))}{sessions.length > 8 && <li className="la-muted">و{sessions.length - 8} أقدم</li>}</ul>
        ) : <span className="la-muted">لا جلسات بعد</span>}</dd>
        <dt>وثيقة المبادرة</dt>
        <dd>{cap ? <>{CAP_AR[cap.status] || cap.status}{cap.readiness != null && <> · الجاهزية {cap.readiness}%</>}{cap.revisions > 0 && <> · أُعيدت {cap.revisions} مرة</>}{cap.review_note && <><br /><small className="la-muted">آخر ملاحظة: {cap.review_note}</small></>}</> : <span className="la-muted">لم يبدأها</span>}</dd>
        <dt>تقييم 360</dt>
        <dd>{f360.length ? f360.map((c) => <span key={c.wave} className="la-chip" style={{ marginInlineEnd: 6 }}>{c.wave === 't2' ? 'الموجة الثانية' : 'الموجة الأولى'}: {F360_AR[c.status] || c.status}</span>) : <span className="la-muted">لا دورة بعد</span>}</dd>
        <dt>حضور الورش</dt>
        <dd>{att.length ? <>{att.length === 1 ? 'ورشة واحدة' : `${att.length} ورش`}: {att.slice(0, 4).map((a) => a.title || date(a.at)).join('، ')}{att.length > 4 ? '…' : ''}</> : <span className="la-muted">لا حضور مسجّل</span>}</dd>
      </dl>
    </section>
  );
}

export function Timeline({ rows }) {
  const [all, setAll] = useState(false);
  const list = rows || [];
  const shown = all ? list : list.slice(0, 25);
  return (
    <section className="la-card" aria-labelledby="pf-t-h">
      <h3 id="pf-t-h">الخط الزمني <small className="la-muted">· {list.length}</small></h3>
      {list.length ? (
        <ol className="pf-time">
          {shown.map((t, i) => (
            <li key={i} className={t.tone}>
              <small className="pf-when">{date(t.at)}</small>
              <span><b>{t.text}</b>{t.by && <small className="la-muted"> · {t.by}</small>}{t.detail && <><br /><small className="la-muted">{t.detail}</small></>}</span>
            </li>
          ))}
        </ol>
      ) : <p className="la-muted">لا شيء بعد.</p>}
      {list.length > 25 && <button type="button" className="la-link" onClick={() => setAll(!all)}>{all ? 'اعرض الأحدث فقط' : `اعرض الكل (${list.length})`}</button>}
    </section>
  );
}
