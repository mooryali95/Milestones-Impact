// ════════════════════════════════════════════════════════════════
// ملف المشارك الكامل: ملخص الأعلام، والملاحظات، وما لم يكن يُعرض، والخط الزمني
// ════════════════════════════════════════════════════════════════
// كله من admin.participant (file.ts): الأعلام والخط الزمني مشتقان على الخادم (observations.js)، والملاحظات من
// participant_observations وحده. الواجهة تعرض ولا تحسب.
import React, { useCallback, useEffect, useState } from 'react';
import { date, dateOnly, L } from '../leaders.js';
import { openDoc } from './Capstones.jsx';
import { Submission } from './Handbook.jsx';
import { useUI } from '../ui.jsx';
import { OBS_KIND_AR, OBS_SOURCE_AR } from '../../../supabase/functions/leaders-api/observations.js';
// تسميات الحالات من مصادرها الوحيدة: جلسات التوجيه من labels.js، ووثيقة المبادرة من capstone.js، ودورة 360 من feedback360.js
import { COACH_STATUS_ADMIN as SESSION_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { CHARTER_KEY, chapterState, STATUS_TITLES_ADMIN as CAP_AR } from '../../../supabase/functions/leaders-api/capstone.js';
import { CHAPTER_STATUS_AR, SUBMISSION_STATUS_ADMIN } from '../../../supabase/functions/leaders-api/labels.js';
import { TIMELINE_TYPE_AR, TIMELINE_TYPES } from '../../../supabase/functions/leaders-api/observations.js';
import { CYCLE_STATUS_AR as F360_AR } from '../../../supabase/functions/leaders-api/feedback360.js';

const TONE = { bad: 'bad', warn: 'warn', info: '', ok: 'ok' };

// ما يستحق نظر المراجع الآن، في سطر واحد أعلى الملف
export function FileFlags({ flags, quiet = false }) {
  if (!flags?.length) return quiet ? null : <p className="pf-flags la-muted">لا أعلام على هذا الملف.</p>;
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

// ما كان غائبًا عن الملف: جلسات التوجيه، وتقييم 360، وحضور الورش. وثيقة المبادرة في بطاقتها الحية (InitiativePanel)
export function FileExtras({ r }) {
  const sessions = r.sessions || [], att = r.attendance || [], f360 = r.feedback360 || [];
  return (
    <section className="la-card" aria-labelledby="pf-x-h">
      <h3 id="pf-x-h">الجلسات والحضور</h3>
      <dl className="la-dl">
        <dt>جلسات التوجيه</dt>
        <dd>{sessions.length ? (
          <ul className="pf-mini">{sessions.slice(0, 8).map((s) => (
            <li key={s.id}><span className={`la-chip ${s.status === 'no_show' ? 'bad' : s.status === 'attended' ? 'ok' : ''}`}>{SESSION_AR[s.status] || s.status}</span> {date(s.starts_at)}{s.expert && <> · {s.expert}</>}</li>
          ))}{sessions.length > 8 && <li className="la-muted">و{sessions.length - 8} أقدم</li>}</ul>
        ) : <span className="la-muted">لا جلسات بعد</span>}</dd>
        <dt>تقييم 360</dt>
        <dd>{f360.length ? f360.map((c) => <span key={c.wave} className="la-chip" style={{ marginInlineEnd: 6 }}>{c.wave === 't2' ? 'الموجة الثانية' : 'الموجة الأولى'}: {F360_AR[c.status] || c.status}</span>) : <span className="la-muted">لا دورة بعد</span>}</dd>
        <dt>حضور الورش</dt>
        <dd>{att.length ? <>{att.length === 1 ? 'ورشة واحدة' : `${att.length} ورش`}: {att.slice(0, 4).map((a) => a.title || date(a.at)).join('، ')}{att.length > 4 ? '…' : ''}</> : <span className="la-muted">لا حضور مسجّل</span>}</dd>
      </dl>
    </section>
  );
}

// المبادرة حية (تصور 2026-11-23): الوثيقة مبنية من حالته الآن (admin.capstone، يبنيها build في capstone.ts ولو لم يسلّمها
// ولا صف له بعد، وقراءتها لا تكتب). العنوان وحال البطاقة والوثيقة والجاهزية، ثم الفصول بحالها وآخر تعديل وملاحظة
// المستشار، و«اقرأ الوثيقة كما هي الآن» بالقالب نفسه الذي يقرؤه المشارك والراعي
export function InitiativePanel({ participantId, canWrite = false, onChanged }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const [sub, setSub] = useState(null);
  const load = useCallback(() => L('admin.capstone', { participant_id: participantId }).then(setD), [participantId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <section className="la-card" aria-busy="true"><h3>المبادرة</h3><p className="la-muted">لحظة…</p></section>;
  if (!d.success) {
    return (
      <section className="la-card" aria-labelledby="pf-cap-h">
        <h3 id="pf-cap-h">المبادرة</h3>
        <p className="la-muted">{d.code === 'locked' ? 'تُفتح وثيقة المبادرة بعد اعتماد مساره.' : d.message}</p>
      </section>
    );
  }
  const c = d.capstone || {};
  const card = (d.sections || []).find((x) => x.key === CHARTER_KEY);
  const notes = c.notes || {};
  return (
    <section className="la-card pf-cap" aria-labelledby="pf-cap-h">
      <div className="la-row between">
        <h3 id="pf-cap-h">{d.doc?.meta?.initiative || 'مبادرة بلا اسم بعد'}</h3>
        <span className="la-row">
          <button type="button" className="btn-sm primary" onClick={() => openDoc(d.doc, toast)}>اقرأ الوثيقة كما هي الآن</button>
          {/* صفحة المراجعة متاحة دائمًا: تُبنى من حالته الآن ولو لم يُنشأ له صف (admin.capstone لا يكتب عند القراءة) */}
          <a className="btn-sm ghost" href={`#/leaders/capstones/${encodeURIComponent(participantId)}`}>صفحة المراجعة</a>
        </span>
      </div>
      <div className="pf-cap-kpis">
        <span className="la-chip">الوثيقة: {CAP_AR[c.status] || CAP_AR.draft}</span>
        <span className="la-chip">البطاقة: {card ? CHAPTER_STATUS_AR[chapterState(card)] : 'ليست من فصوله'}</span>
        <span className={`la-chip ${d.readiness >= 80 ? 'ok' : ''}`}>الجاهزية {d.readiness ?? 0}%</span>
        {c.revisions > 0 && <span className="la-chip">أُعيدت {c.revisions} مرة</span>}
      </div>
      {c.review_note && <p className="la-muted small">آخر ملاحظة: {c.review_note}</p>}
      <ol className="pf-chapters">{(d.sections || []).map((x) => {
        const st = chapterState(x);
        return (
          <li key={x.id} data-chapter={x.key}>
            <span><b>{x.title}</b>{!x.complete && x.missing > 0 && <small className="la-muted"> · {x.missing} حقول ناقصة</small>}
              {notes[x.key] && <><br /><small className="la-muted">ملاحظة المستشار: {notes[x.key]}</small></>}</span>
            <span className="pf-ch-meta">
              <span className={`la-chip ${st === 'reviewed' ? 'ok' : st === 'returned' ? 'warn' : ''}`} title={x.status ? SUBMISSION_STATUS_ADMIN[x.status] : undefined}>{CHAPTER_STATUS_AR[st]}</span>
              <small className="la-muted">{x.updated_at ? `آخر تعديل ${dateOnly(x.updated_at)}` : 'لم يُحفظ بعد'}</small>
              {x.sub_id && ['submitted', 'reviewed', 'returned'].includes(x.status) && (
                <button type="button" className="la-link" aria-label={`${x.status === 'submitted' && canWrite ? 'قيّم' : 'اعرض'} فصل ${x.title}`} onClick={() => setSub(x.sub_id)}>{x.status === 'submitted' && canWrite ? 'قيّم' : 'اعرض'}</button>
              )}
            </span>
          </li>
        );
      })}</ol>
      {!(d.sections || []).length && <p className="la-muted">لا فصول لوثيقته بمستواه ونطاقه بعد. الخطوة التالية: أن يبدأ بطاقة المبادرة من رحلته.</p>}
      {sub && <Submission id={sub} canWrite={canWrite} onClose={(saved) => { setSub(null); if (saved) { load(); onChanged?.(); } }} />}
    </section>
  );
}

// السجل الكامل (تصور 2026-11-23): كل ما جرى له من تسجيله، صفحة صفحة من admin.participant-timeline، ومرشح بالنوع
export function FullTimeline({ participantId }) {
  const [types, setTypes] = useState([]);
  const [rows, setRows] = useState(null);
  const [next, setNext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const page = useCallback(async (before, picked) => {
    setBusy(true);
    const r = await L('admin.participant-timeline', { participant_id: participantId, before, types: picked });
    setBusy(false);
    if (!r.success) { setErr(r.message || 'تعذّر تحميل السجل'); return; }
    setErr('');
    setRows((old) => (before ? [...(old || []), ...r.rows] : r.rows));
    setNext(r.next);
  }, [participantId]);
  useEffect(() => { page(null, types); }, [page, types]);
  const flip = (t) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  return (
    <section className="la-card" aria-labelledby="pf-t-h">
      <h3 id="pf-t-h">السجل الكامل</h3>
      <div className="pf-tl-chips" role="group" aria-label="نوع الأحداث">
        <button type="button" className={`pf-tl-chip${types.length ? '' : ' on'}`} aria-pressed={!types.length} onClick={() => setTypes([])}>الكل</button>
        {TIMELINE_TYPES.map((t) => <button key={t} type="button" className={`pf-tl-chip${types.includes(t) ? ' on' : ''}`} aria-pressed={types.includes(t)} onClick={() => flip(t)}>{TIMELINE_TYPE_AR[t]}</button>)}
      </div>
      {err && <p className="la-err" role="alert">{err}</p>}
      {rows == null ? <p className="la-muted">لحظة…</p> : rows.length ? (
        <ol className="pf-time" data-testid="full-timeline">
          {rows.map((t, i) => (
            <li key={`${t.at}-${i}`} className={t.tone} data-type={t.type}>
              <small className="pf-when">{date(t.at)}</small>
              <span><b>{t.text}</b>{t.by && <small className="la-muted"> · {t.by}</small>}{t.detail && <><br /><small className="la-muted">{t.detail}</small></>}</span>
            </li>
          ))}
        </ol>
      ) : <p className="la-muted">لا شيء بهذا النوع.</p>}
      {next && <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => page(next, types)}>{busy ? 'لحظة…' : 'اعرض الأقدم'}</button>}
    </section>
  );
}
