// ════════════════════════════════════════════════════════════════
// ملف المشارك الكامل: ملخص الأعلام، والملاحظات، وما لم يكن يُعرض، والخط الزمني
// ════════════════════════════════════════════════════════════════
// كله من admin.participant (file.ts): الأعلام والخط الزمني مشتقان على الخادم (observations.js)، والملاحظات من
// participant_observations وحده. الواجهة تعرض ولا تحسب.
import React, { useCallback, useEffect, useState } from 'react';
import { date, dateOnly, L } from '../leaders.js';
import { ChapterLevel, FinalDocExport, openDoc } from './Capstones.jsx';
import { Submission } from './Handbook.jsx';
import { DocLevelMeter, useUI } from '../ui.jsx';
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
      ) : <p className="pf-empty-next">لا ملاحظات في الملف بعد.{canWrite ? ' اكتب أول ملاحظة بالنموذج أعلاه حين ترى واقعة تستحق التسجيل.' : ''}</p>}
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
        ) : <span className="la-muted">لا جلسات بعد. تُحجز مع خبيره المسند أعلاه، أو من «الحضور والجلسات».</span>}</dd>
        <dt>تقييم 360</dt>
        <dd>{f360.length ? f360.map((c) => <span key={c.wave} className="la-chip" style={{ marginInlineEnd: 6 }}>{c.wave === 't2' ? 'الموجة الثانية' : 'الموجة الأولى'}: {F360_AR[c.status] || c.status}</span>) : <span className="la-muted">لا دورة بعد. تُفتح من «تقييم 360» حين يحين موعد موجته.</span>}</dd>
        <dt>حضور الورش</dt>
        <dd>{att.length ? <>{att.length === 1 ? 'ورشة واحدة' : `${att.length} ورش`}: {att.slice(0, 4).map((a) => a.title || date(a.at)).join('، ')}{att.length > 4 ? '…' : ''}</> : <span className="la-muted">لا حضور مسجّل. يُسجَّل من ورقة حضور الورشة في «الحضور والجلسات».</span>}</dd>
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
        <p className="pf-empty-next">{d.code === 'locked' ? 'تُفتح وثيقة المبادرة بعد اعتماد مساره. الخطوة التالية: اعتمد مساره من تبويب «القرار».' : d.message}</p>
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
          <FinalDocExport participantId={participantId} approved={c.status === 'approved'} qr={d.qr_state} />
          <button type="button" className="btn-sm ghost" onClick={() => openDoc(d.doc, toast, 'working', null, undefined, d.pdf)}>اقرأ الوثيقة كما هي الآن</button>
          {/* صفحة المراجعة متاحة دائمًا: تُبنى من حالته الآن ولو لم يُنشأ له صف (admin.capstone لا يكتب عند القراءة) */}
          <a className="btn-sm ghost" href={`#/leaders/capstones/${encodeURIComponent(participantId)}`}>صفحة المراجعة</a>
        </span>
      </div>
      <div className="pf-cap-kpis">
        <span className="la-chip">الوثيقة: {CAP_AR[c.status] || CAP_AR.draft}</span>
        <DocLevelMeter level={d.doc?.review_levels?.level} />
        <span className="la-chip">البطاقة: {card ? CHAPTER_STATUS_AR[chapterState(card)] : 'ليست من فصوله'}</span>
        <span className={`la-chip ${d.readiness >= 80 ? 'ok' : ''}`}>الجاهزية {d.readiness ?? 0}%</span>
        {c.revisions > 0 && <span className="la-chip">أُعيدت {c.revisions} مرة</span>}
      </div>
      {c.review_note && <p className="la-muted small">آخر ملاحظة: {c.review_note}</p>}
      <ol className="pf-chapters">{(d.sections || []).map((x) => {
        const st = chapterState(x);
        return (
          <li key={x.id} data-chapter={x.key}>
            <span><b>{x.title}</b><ChapterLevel s={x} />{!x.complete && x.missing > 0 && <small className="la-muted"> · {x.missing} حقول ناقصة</small>}
              {notes[x.key] && <><br /><small className="la-muted">ملاحظة المستشار: {notes[x.key]}</small></>}</span>
            <span className="pf-ch-meta">
              <span className={`la-chip ${st === 'reviewed' ? 'ok' : st === 'returned' ? 'warn' : ''}`} title={x.status ? SUBMISSION_STATUS_ADMIN[x.status] : undefined}>{CHAPTER_STATUS_AR[st]}</span>
              <small className="la-muted">{x.updated_at ? `آخر تعديل ${dateOnly(x.updated_at)}` : 'لم يُحفظ بعد'}</small>
              {x.sub_id && ['submitted', 'reviewed', 'returned'].includes(x.status) && (
                <button type="button" className="la-link" aria-label={`${x.status === 'submitted' && canWrite ? 'اقرأ' : 'اعرض'} فصل ${x.title}`} onClick={() => setSub(x.sub_id)}>{x.status === 'submitted' && canWrite ? 'اقرأ' : 'اعرض'}</button>
              )}
            </span>
          </li>
        );
      })}</ol>
      {!(d.sections || []).length && <p className="pf-empty-next">لا فصول لوثيقته بمستواه ونطاقه بعد. الخطوة التالية: أن يبدأ بطاقة المبادرة من رحلته.</p>}
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
      ) : <p className="pf-empty-next">{types.length ? 'لا شيء بهذا النوع. اختر «الكل» لترى سجله كاملًا.' : 'لا أحداث في سجله بعد.'}</p>}
      {next && <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => page(next, types)}>{busy ? 'لحظة…' : 'اعرض الأقدم'}</button>}
    </section>
  );
}

// أسماء الجداول في معاينة الربط: ما يعرفه المدير، والباقي باسمه التقني
const MERGE_TABLE_AR = {
  participant_emails: 'البريد', enrollments: 'الإلحاق بالدفعة', cohort_placements: 'سجل الإلحاق', assessments: 'القياس', assessment_answers: 'إجابات القياس',
  participant_requirements: 'البنود', capstones: 'وثيقة المبادرة', capstone_updates: 'تحديثات المبادرة', points_ledger: 'النقاط', reading_progress: 'القراءة',
  handbook_progress: 'كتاب القائد', model_submissions: 'النماذج', certificates: 'الشهادات', payments: 'المدفوعات', guidance_messages: 'محادثة التوجيه',
  passkeys: 'مفاتيح المرور', auth_sessions: 'الجلسات', participants: 'الملف', coaching_sessions: 'جلسات التوجيه', workshop_attendance: 'حضور الورش',
};
const MERGE_KIND_AR = { moved: 'ينتقل', deleted: 'يتعارض فيبقى ما في الحساب الباقي', inserted: 'يُضاف', fields: 'حقول تُكمَّل', status: 'تغيير حال', revoked_at: 'تُنهى', sponsor_token_hash: 'رابط الراعي' };

// البريد الأساسي والبدائل، وربط حساب آخر (ترحيل 20261128190000): المعاينة تعرض ما سينتقل ببصمة، والتطبيق بها وحدها.
// الحساب الذي دخل منه صاحبه آخر مرة يبقى أساسيًا ويُدمج فيه الآخر، وكل ما يُنقل يُحفظ فيُرجع عند الحاجة
export function AccountEmails({ participantId, canWrite, suggest = '', onChanged, onMoved }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [other, setOther] = useState(suggest);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState({ on: false, name: '' });   // بلا هاتف واحد: تأكيد صريح باسم الحساب الآخر
  const load = useCallback(() => L('admin.participant-emails', { participant_id: participantId }).then(setD), [participantId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (suggest) { setOther(suggest); setPlan(null); } }, [suggest]);
  const preview = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await L('admin.participant-link-plan', { participant_id: participantId, other: other.trim() });
    setBusy(false);
    if (!r.success) { toast(r.message); return; }
    setPlan(r); setSure({ on: false, name: '' });
  };
  const apply = async () => {
    if (!(await confirm(`يبقى حساب ${plan.kept.full_name} (${plan.kept.email}) ويُدمج فيه الحساب الآخر ويُوقف، ويصير بريده بديلًا يدخل به. متابعة؟`))) return;
    setBusy(true);
    const r = await L('admin.participant-link', { participant_id: participantId, other: other.trim(), plan_hash: plan.plan_hash, ...(plan.same_phone ? {} : { confirm_different: sure.on, confirm_name: sure.name }) });
    setBusy(false);
    if (!r.success) { toast(r.message); if (r.code === 'stale') setPlan(null); return; }
    toast('رُبط الحسابان');
    setPlan(null); setOther('');
    if (r.kept_id !== participantId) { onMoved?.(r.kept_id); return; }
    load(); onChanged?.();
  };
  const act = async (action, email, done, ask) => {
    if (!(await confirm(ask, { danger: action.endsWith('remove') }))) return;
    const r = await L(action, { participant_id: participantId, email });
    toast(r.success ? done : r.message);
    if (r.success) { load(); onChanged?.(); }
  };
  if (!d) return <section className="la-card" aria-busy="true"><h3>البريد والحسابات المرتبطة</h3><p className="la-muted">لحظة…</p></section>;
  if (!d.success) return <section className="la-card"><h3>البريد والحسابات المرتبطة</h3><p className="la-muted">{d.message}</p></section>;
  return (
    <section className="la-card" aria-labelledby="pf-mail-h" data-testid="account-emails">
      <h3 id="pf-mail-h">البريد والحسابات المرتبطة</h3>
      <dl className="la-dl">
        <dt>البريد الأساسي</dt><dd dir="ltr">{d.primary.email}</dd>
        <dt>بريد بديل</dt>
        <dd>{d.alternates.length ? (
          <ul className="pf-mini">{d.alternates.map((x) => (
            <li key={x.email}><span dir="ltr">{x.email}</span> <small className="la-muted">· {x.verified_at ? `موثّق ${dateOnly(x.verified_at)}` : 'لم يدخل به بعد'}</small>
              {canWrite && <> · <button type="button" className="la-link" onClick={() => act('admin.participant-email-primary', x.email, 'صار البريد الأساسي', `يصير ${x.email} البريد الأساسي، ويبقى الحالي بديلًا يدخل به. متابعة؟`)}>اجعله أساسيًا</button>
                {' '}· <button type="button" className="la-link" onClick={() => act('admin.participant-email-remove', x.email, 'حُذف البريد البديل', `حذف ${x.email}؟ لن يدخل به صاحبه إلى هذا الحساب بعد الآن.`)}>حذف</button></>}
            </li>
          ))}</ul>
        ) : <span className="la-muted">لا بريد بديل. يُضاف حين يُربط بهذا الحساب حساب آخر للشخص نفسه.</span>}</dd>
      </dl>
      {canWrite && (
        <form className="la-row" onSubmit={preview}>
          <input aria-label="بريد الحساب الآخر أو معرّفه" dir="ltr" placeholder="بريد الحساب الآخر أو معرّفه" value={other} onChange={(e) => { setOther(e.target.value); setPlan(null); }} required />
          <button className="btn-sm ghost" disabled={busy || !other.trim()}>{busy && !plan ? 'لحظة…' : 'ربط حساب آخر'}</button>
        </form>
      )}
      {suggest && !plan && <p className="la-muted small">الجوال مسجل لحساب قائم. إن كان للشخص نفسه فاربط الحسابين بدل إنشاء حساب ثانٍ.</p>}
      {plan && (
        <div className="pf-link-plan" data-testid="link-plan">
          <p>يبقى <b>{plan.kept.full_name}</b> <span dir="ltr">({plan.kept.email})</span>، آخر دخول {plan.kept.last_login_at ? dateOnly(plan.kept.last_login_at) : 'لا دخول'}.
            ويُدمج فيه <b>{plan.merged.full_name}</b> <span dir="ltr">({plan.merged.email})</span>، آخر دخول {plan.merged.last_login_at ? dateOnly(plan.merged.last_login_at) : 'لا دخول'}، ثم يُوقف.</p>
          <ul className="pf-mini">{Object.entries(plan.summary || {}).map(([t, s]) => (
            <li key={t}><b>{MERGE_TABLE_AR[t] || t}</b>: {Object.entries(s).map(([k, v]) => `${MERGE_KIND_AR[k] || k} ${v}`).join('، ')}</li>
          ))}</ul>
          {!plan.same_phone && (
            <div className="pf-link-confirm">
              <p className="la-warn">الحسابان بلا هاتف واحد، فلا دليل آليًا على أنهما للشخص نفسه.</p>
              <label className="pf-check"><input type="checkbox" checked={sure.on} onChange={(e) => setSure({ ...sure, on: e.target.checked })} /> تحققت أن الحسابين للشخص نفسه</label>
              <input aria-label="اكتب اسم الحساب الآخر للتأكيد" placeholder={`اكتب «${plan.confirm_name}» للتأكيد`} value={sure.name} onChange={(e) => setSure({ ...sure, name: e.target.value })} />
            </div>
          )}
          <div className="la-row">
            <button type="button" className="btn-sm primary" disabled={busy || (!plan.same_phone && (!sure.on || sure.name.trim() !== String(plan.confirm_name || '').trim()))} onClick={apply}>{busy ? 'لحظة…' : 'اربط الحسابين'}</button>
            <button type="button" className="btn-sm ghost" onClick={() => setPlan(null)}>إلغاء</button>
          </div>
        </div>
      )}
    </section>
  );
}
