// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة: الجلسات الجماعية والفردية، حضورية أو عن بعد
// ════════════════════════════════════════════════════════════════
// الجلسات الجماعية: مواعيد حضورية أو عن بعد، وحضور يُوثَّق بالطريقة المختارة
// للمتطلب (رمز QR يتجدد كل 30 ثانية، أو الانضمام من التطبيق، أو يدويًا).
// الجلسات الفردية: حجوزات منصة المواعيد، وتوفر
// الاتصال الفوري، وتأكيد الموجّه لكل جلسة (حضر أو لم يحضر).
// إعداد كل نشاط (الرابط، العدد المطلوب) في «الرحلة والمتطلبات».
import React, { useCallback, useEffect, useRef, useState } from 'react';
import PresenterQr from '../../../shared/ui/PresenterQr.jsx';
import AttendanceSheet from '../../../shared/ui/AttendanceSheet.jsx';
import { L, weekTime as when } from '../leaders.js';
import Form from '../Form.jsx';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { readQuery } from '../route.js';
import { mailConfirm, saveBody, savedAr, sessionExtras, VERIFY_AR, withCapacity } from '../workshop-days.js';

import { COACH_STATUS_ADMIN, READ_STATUS_ADMIN, SESSION_MODE_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { isUndated, minutesAr, renderJourneyText, SESSION_DEFAULTS, SESSION_LINK_LATER_AR, SESSION_TBD_AR, sessionsAr } from '../../../supabase/functions/leaders-api/logic.js';

// «خارج نافذة «التدريب» (1 إلى 14 مارس)»، واسم الدفعة للجلسة العامة أو حين تقع خارج النافذة في أكثر من دفعة
export const outsideAr = (x, named = false) => `خارج نافذة «${x.stage}»${x.window_ar ? ` (${x.window_ar})` : ''}${named ? ` في ${x.cohort}` : ''}. الحضور يُحسب، وراجع الموعد أو مدة المرحلة`;
// موعد الجلسة أو «يُحدد لاحقًا» (J1): لا خانة فارغة ولا تاريخ 1970
const sessionWhen = (s) => (isUndated(s) ? SESSION_TBD_AR : when(s.starts_at));
// عنوان المتطلب برموزه مملوءة كما يراه المشارك: «حضور الأيام التدريبية (أربعة أيام)» لا «({days:T-ATTEND})» (التدقيق 2026-11-10، البند 9.9)
const reqTitle = (r) => renderJourneyText(r?.title_ar || '', { reqs: r ? [r] : [] });

export const SESSION_FIELDS = [
  { name: 'title_ar', label: 'عنوان الجلسة (مثل: اليوم الأول، Milestone)' },
  { name: 'mode', label: 'الطريقة', type: 'select', options: { in_person: SESSION_MODE_AR.in_person, online: SESSION_MODE_AR.online } },
  { name: 'location_ar', label: 'المكان (القاعة والمدينة)', show: (v) => v.mode !== 'online' },
  { name: 'join_url', label: 'رابط الاجتماع (Zoom أو Teams أو Google Meet)', dir: 'ltr', show: (v) => v.mode === 'online',
    help: (v) => (v.join_url ? 'يظهر للمشارك قبل الجلسة بساعة فقط.' : `اختياري: اتركه فارغًا ليُضاف لاحقًا، ويرى المشارك «${SESSION_LINK_LATER_AR}».`) },
  { name: 'starts_at', label: 'تبدأ', type: 'datetime',
    help: (v) => (!v.starts_at && !v.ends_at ? `اختياري: اترك البدء والانتهاء فارغين إن لم يُحدد الموعد بعد، فتظهر الجلسة «${SESSION_TBD_AR}» بلا دعوة ولا تذكير.` : null) },
  { name: 'ends_at', label: 'تنتهي', type: 'datetime' },
  { name: 'active', label: 'مفعّلة', type: 'check' },
];
// الجلسة لدفعة بعينها، أو لكل الدفعات التي تتبع برنامج المتطلب. الحقل يظهر متى كانت للبرنامج دفعة واحدة على الأقل:
// كان يختفي مع الدفعة الوحيدة، فتُحفظ الجلسة عامة بلا دعوة ولا تذكير، ويفك تحريرها ربطًا قائمًا (التدقيق 2026-11-11، admin-program-3).
// current: دفعة الجلسة المحررة إن لم تعد في القائمة (القائمة للدفعات غير المغلقة)، فلا تظهر «كل الدفعات» مكانها
// دفعات النشاط: دفعات برنامجه المفتوحة وحدها، فلا تُربط جلسة بدفعة برنامج آخر. والدفعة المغلقة (لا تصل في القائمة) باسمها العام
export const cohortsOfProgram = (cohorts, programId) => (cohorts || []).filter((c) => c.program_id === programId);
export const cohortNameOf = (cohorts, id) => cohorts.find((c) => c.id === id)?.name || 'دفعة مغلقة';
// capacity: حقل السعة بعد ترحيل عمودها وحده (W3، capacity_ready من الخادم)، وقبله يُحفظ اليوم بلاها
// trainersOf وmail (المرحلة 4): حقل المدرب واختيارا البريد عند الحفظ (sessionExtras)، قبل «مفعّلة» آخر النموذج
export const sessionFields = (cohorts, current = null, { capacity = false, trainersOf = null, mail = null } = {}) => {
  const options = Object.fromEntries(cohorts.map((c) => [c.id, c.name]));
  if (current && !options[current]) options[current] = 'دفعة مغلقة';
  const base = withCapacity(SESSION_FIELDS, capacity);
  const at = base.findIndex((f) => f.name === 'active');
  const extra = sessionExtras({ trainersOf, mail });
  const own = at < 0 ? [...base, ...extra] : [...base.slice(0, at), ...extra.filter((f) => f.name === 'expert_id'), ...base.slice(at), ...extra.filter((f) => f.name !== 'expert_id')];
  return !Object.keys(options).length ? own : [
    { name: 'cohort_id', label: 'الدفعة', type: 'select', empty: 'كل الدفعات', options,
      help: 'لكل دفعة مواعيدها وقاعاتها، ودعوتها بملف التقويم وتذكيرها قبل يوم وقبل ساعة يصلان أعضاءها. الجلسة العامة تظهر لكل الدفعات بلا دعوة ولا تذكير.' },
    ...own,
  ];
};
const MODE_AR = SESSION_MODE_AR;
const COACH_ST = Object.fromEntries(Object.entries({ booked: '', requested: 'warn', attended: 'ok', no_show: 'bad', cancelled: '' }).map(([k, tone]) => [k, [COACH_STATUS_ADMIN[k], tone]]));

// ── شاشة رمز الحضور للقاعة ──
// المكوّن المشترك مع بوابة الخبير (shared/ui/PresenterQr.jsx): الرمز والأرقام الستة من admin.workshop-qr، والمتوقع وأسماء
// من لم يحضر من قائمة الحضور نفسها (admin.workshop-attendance)
export function QrScreen({ id, onClose, onSheet = null }) {
  const loadQr = useCallback(() => L('admin.workshop-qr', { id }), [id]);
  const loadPeople = useCallback(() => L('admin.workshop-attendance', { id }), [id]);
  return <PresenterQr loadQr={loadQr} loadPeople={loadPeople} onClose={onClose} onManual={onSheet} whenText={sessionWhen} />;
}

// ── ورقة الحضور (تصور تشغيل الدفعة 2026-11-19، المرحلة 2) ──
// المكوّن المشترك مع بوابة الخبير (shared/ui/AttendanceSheet.jsx): مربع لكل متوقع، و«علّم الكل حاضرًا»، وسبب واحد، وحفظ واحد
// بـadmin.workshop-mark-bulk (الكاتب نفسه والتحقق نفسه لكل مشارك على الخادم). تُفتح من «الحضور والجلسات» ومن يوم الورشة في بطاقة
// المرحلة ومن «سجّل حضورهم في جلسة» في تبويب «المتابعة».
// cohortId (من بطاقة مرحلة الدفعة): الجلسة العامة تُقرأ بأعضاء تلك الدفعة وحدهم، فتطابق أعداد البطاقة.
// preselect وnames (من «المتابعة»): المحددون معلَّمون مسبقًا، ومن ليس منهم في قائمة الجلسة يُذكر باسمه ولا يُرسل.
// طريقة الحضور في الورقة من ATTEND_METHOD_AR نفسها (stateAr في attendance-sheet.js)
const sheetSub = (d) => [reqTitle(d.requirement), sessionWhen(d.session)].filter(Boolean).join(' · ');
export function Attendance({ id, cohortId = null, canWrite, preselect, names, onClose }) {
  const load = useCallback(() => L('admin.workshop-attendance', cohortId ? { id, cohort_id: cohortId } : { id }), [id, cohortId]);
  const save = useCallback((body) => L('admin.workshop-mark-bulk', body), []);
  const note = useCallback((d) => (cohortId && !d.session?.cohort_id ? 'جلسة عامة لكل الدفعات، والقائمة هنا لأعضاء هذه الدفعة وحدهم.' : ''), [cohortId]);
  return <AttendanceSheet sessionId={id} load={load} save={save} role="admin" canWrite={canWrite} preselect={preselect} names={names} sub={sheetSub} note={note} when={when} onClose={onClose} />;
}

// الدعوة تذهب لأعضاء الدفعة كلهم، فتُؤكَّد؛ وإعادتها تُؤكَّد صريحة. مصدر واحد لهذه الشاشة ولأيام بطاقة المرحلة (W3)
export async function inviteSession(s, { confirm, toast }) {
  if (!(await confirm(s.invited_at ? `أُرسلت دعوة «${s.title_ar}» من قبل. إرسالها مرة أخرى لكل أعضاء الدفعة؟` : `تُرسل دعوة «${s.title_ar}» بالبريد إلى كل أعضاء الدفعة، ومعها ملف تقويم. متابعة؟`))) return false;
  const r = await L('admin.workshop-invite', { id: s.id, again: !!s.invited_at });
  if (!r.success) { toast(r.message); return false; }
  toast(r.failed ? `أُرسلت ${r.sent} دعوة، وتعذّرت ${r.failed}` : `أُرسلت الدعوة إلى ${r.sent} مشاركًا`);
  return true;
}

function Workshops({ data, reload, canWrite }) {
  const { toast, confirm } = useUI();
  const invite = async (s) => { if (await inviteSession(s, { confirm, toast })) reload(); };
  const [form, setForm] = useState(null);
  const [qr, setQr] = useState(null);
  const [att, setAtt] = useState(null);
  const reqs = data.requirements.filter((r) => r.kind === 'workshop');
  const capacity = !!data.capacity_ready;
  // مدربو كل دفعة من الخادم (cohort_trainers)، والحقل للجلسة ذات الدفعة وحدها. ورسالة الحفظ تحمل ما جرى للبريد
  const trainersOf = data.trainer_ready ? (v) => (v.cohort_id ? data.cohort_trainers?.[v.cohort_id] || [] : null) : null;
  const saved = useRef(null);
  const save = (base) => async (v) => { const r = await L('admin.workshop-save', saveBody(v, base)); saved.current = r?.success ? r : null; return r; };
  // القفز من «الرحلة في لمحة» (‎?req=<المتطلب>‎): إلى جلسات النشاط وزر «+ موعد» عنده
  useEffect(() => {
    const req = new URLSearchParams(readQuery()).get('req');
    const el = req && document.getElementById(`ws-${req}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    (el.querySelector('.ws-add') || el).focus?.({ preventScroll: true });
  }, []);
  if (!reqs.length) return <p className="la-muted">لا متطلب من نوع «جلسات جماعية بمواعيد». أضفه في أي مرحلة من «الرحلة والمتطلبات».</p>;
  return (
    <>
      {reqs.map((r) => {
        const list = data.workshops.filter((s) => s.requirement_id === r.id);
        const cohorts = cohortsOfProgram(data.cohorts, r.program_id);
        const cohortName = (id) => cohortNameOf(cohorts, id);
        return (
          <section key={r.id} id={`ws-${r.id}`} className="la-card" tabIndex={-1}>
            <div className="la-row between">
              <div><b title={r.code}>{reqTitle(r)}</b> {(data.programs || []).length > 1 && <small className="la-chip">{data.programs.find((x) => x.id === r.program_id)?.name}</small>} <small className="la-muted">المطلوب حضور {r.config?.sessions_required || SESSION_DEFAULTS.sessions_required} · {VERIFY_AR[r.config?.verify || 'qr']}</small></div>
              {canWrite && <button className="btn-sm primary ws-add" onClick={() => setForm({ title: 'موعد جديد', fields: sessionFields(cohorts, null, { capacity, trainersOf, mail: {} }), values: { active: true, mode: 'in_person', invite: true, cohort_id: cohorts.length === 1 ? cohorts[0].id : '' }, onSave: save({ requirement_id: r.id }), confirmSave: mailConfirm })}>+ موعد</button>}
            </div>
            {list.length ? (
              <table className="la-table" style={{ marginTop: 10 }}>
                <thead><tr><th>الجلسة</th><th>الموعد</th><th>الطريقة</th><th>الحضور</th><th /></tr></thead>
                <tbody>{list.map((s) => (
                  <tr key={s.id} className={s.active ? '' : 'off'}>
                    <td>{s.title_ar}{s.cohort_id && <small className="la-chip">{cohortName(s.cohort_id)}</small>}{s.trainer && <small className="la-muted"> · مع {s.trainer}</small>}{!s.active && <small className="la-muted"> · موقوفة</small>}</td>
                    <td>{isUndated(s) ? <span className="la-chip warn">{SESSION_TBD_AR}</span> : when(s.starts_at)}
                      {/* خارج نافذة مرحلته في دفعة مؤرخة (4.2 د): من علامة الخط نفسه على الخادم، تنبيه لا منع */}
                      {(s.outside || []).map((x) => <small key={x.cohort_id} className="ws-out" role="note">{outsideAr(x, !s.cohort_id || s.outside.length > 1)}</small>)}</td>
                    <td>{MODE_AR[s.mode || 'in_person']}{s.mode === 'online' ? (s.join_url ? '' : ' · الرابط لاحقًا') : s.location_ar ? ` · ${s.location_ar}` : ''}{capacity && s.capacity ? <small className="la-muted"> · السعة {s.capacity}</small> : null}</td>
                    <td><button className="la-link" onClick={() => setAtt(s.id)}>{s.attended} حاضر</button></td>
                    <td className="la-row">
                      {/* بطريقة الجلسة الفعلية (تخصيص دفعتها يغلب البرنامج، overview في activities.ts) */}
                      {(s.verify || r.config?.verify || 'qr') === 'qr' && <button className="btn-sm primary" onClick={() => setQr(s.id)}>اعرض رمز الحضور</button>}
                      {s.verify && s.verify !== (r.config?.verify || 'qr') && <small className="la-chip" title="تخصيص الدفعة يغلب طريقة البرنامج">{VERIFY_AR[s.verify] || s.verify} لهذه الدفعة</small>}
                      {canWrite && s.cohort_id && isUndated(s) && <small className="la-muted" title="الدعوة وملف التقويم والتذكير تحتاج موعدًا">الدعوة بعد تحديد الموعد</small>}
                      {canWrite && s.cohort_id && !isUndated(s) && new Date(s.ends_at) > new Date() && (
                        <button className="la-link" title="بريد بالموعد والمكان وملف تقويم لأعضاء الدفعة. التذكير قبل يوم وقبل ساعة يُرسل آليًا." onClick={() => invite(s)}>{s.invited_at ? 'أُرسلت الدعوة' : 'أرسل الدعوة'}</button>
                      )}
                      {canWrite && <button className="la-link" onClick={() => setForm({ title: 'تحرير موعد', fields: sessionFields(cohorts, s.cohort_id, { capacity, trainersOf, mail: { original: s } }), values: { ...s, notify_change: true }, onSave: save({ id: s.id }), confirmSave: mailConfirm, onDelete: s.attended ? undefined : () => L('admin.workshop-delete', { id: s.id }) })}>تحرير</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="la-muted" style={{ marginTop: 8 }}>لا مواعيد بعد. أضف المواعيد بطريقتها (حضوري أو عن بعد) لتظهر للمشاركين.</p>}
          </section>
        );
      })}
      {form && <Form {...form} onClose={(done) => { setForm(null); if (done) { toast(savedAr('تم الحفظ', saved.current)); saved.current = null; reload(); } }} />}
      {qr && <QrScreen id={qr} onClose={() => { setQr(null); reload(); }} onSheet={canWrite ? () => { setAtt(qr); setQr(null); } : null} />}
      {att && <Attendance id={att} canWrite={canWrite} onClose={() => { setAtt(null); reload(); }} />}
    </>
  );
}

function Coaching({ data, reload, canWrite }) {
  const { toast, prompt } = useUI();
  const [form, setForm] = useState(null);
  const [people, setPeople] = useState(null);
  const reqs = data.requirements.filter((r) => r.kind === 'coaching');
  const now = Date.now();
  const mark = async (s, status) => {
    let note = null;
    if (status === 'no_show') { note = await prompt('ملاحظة (اختيارية)', ''); if (note === null) return; }
    const r = await L('admin.coaching-mark', { id: s.id, status, note });
    if (!r.success) toast(r.message); else reload();
  };
  const avail = async (r, minutes) => {
    const res = await L('admin.coach-available', { requirement_id: r.id, minutes });
    if (!res.success) toast(res.message); else { toast(minutes ? `متاح للاتصال الفوري ${minutes} دقيقة` : 'أُغلق الاتصال الفوري'); reload(); }
  };
  const addManual = async (r) => {
    const [list, ex] = await Promise.all([people || L('admin.participants', {}).then((x) => x.participants || []), L('admin.experts')]);
    setPeople(list);
    // الخبراء النشطون بدور الموجّه: الجلسة تُنسب للمختار، وفارغ = حسابك إن كان لك ملف خبير بالبريد نفسه
    const coaches = (ex.experts || []).filter((e) => e.status === 'active' && e.roles.includes('coach'));
    setForm({
      title: `جلسة يدوية: ${reqTitle(r)}`,
      fields: [
        { name: 'participant_id', label: 'المشارك', type: 'select', options: Object.fromEntries(list.map((p) => [p.id, `${p.full_name} · ${p.email}`])) },
        ...(coaches.length ? [{ name: 'expert_id', label: 'الموجّه', type: 'select', empty: 'أنا (بريد حسابي)', options: Object.fromEntries(coaches.map((e) => [e.id, e.full_name])) }] : []),
        { name: 'starts_at', label: 'الموعد', type: 'datetime' },
        { name: 'status', label: 'الحالة', type: 'select', options: { attended: `${COACH_STATUS_ADMIN.attended} (منعقدة)`, booked: `${COACH_STATUS_ADMIN.booked} (قادمة)` } },
        { name: 'join_url', label: 'رابط الاجتماع (اختياري)', dir: 'ltr' },
        { name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2 },
      ],
      values: { status: 'attended', starts_at: new Date().toISOString() },
      onSave: (v) => L('admin.coaching-add', { ...v, requirement_id: r.id, minutes: r.config?.minutes }),
    });
  };
  if (!reqs.length) return <p className="la-muted">لا متطلب من نوع «جلسات فردية بحجز». أضفه في أي مرحلة من «الرحلة والمتطلبات».</p>;
  return (
    <>
      {reqs.map((r) => {
        const list = data.coaching.filter((s) => s.requirement_id === r.id && s.status !== 'cancelled');
        const pending = list.filter((s) => ['booked', 'requested'].includes(s.status) && (!s.ends_at || new Date(s.ends_at).getTime() < now));
        const upcoming = list.filter((s) => s.status === 'booked' && s.ends_at && new Date(s.ends_at).getTime() >= now);
        const done = list.filter((s) => ['attended', 'no_show'].includes(s.status)).reverse().slice(0, 15);
        const c = r.config || {};
        return (
          <section key={r.id} className="la-card">
            <div className="la-row between">
              <div><b title={r.code}>{reqTitle(r)}</b> <small className="la-muted">{sessionsAr(c.sessions_required || SESSION_DEFAULTS.sessions_required)} · {minutesAr(c.minutes || SESSION_DEFAULTS.minutes)} · {MODE_AR[c.mode || 'online']}{c.location_ar ? ` · ${c.location_ar}` : ''}</small></div>
              <div className="la-row">
                {c.booking_url ? <span className="la-chip ok">الحجز عبر {c.provider === 'calendly' ? 'Calendly' : 'Cal.com'}</span> : <span className="la-chip warn">بلا رابط حجز</span>}
                {canWrite && c.instant_url && c.mode !== 'in_person' && (r.instant_open
                  ? <button className="btn-sm ghost" onClick={() => avail(r, 0)}>● متاح الآن، أغلق</button>
                  : <button className="btn-sm primary" onClick={() => avail(r, 60)}>أنا متاح لاتصال فوري (ساعة)</button>)}
                {canWrite && <button className="la-link" onClick={() => addManual(r)}>+ جلسة يدوية</button>}
              </div>
            </div>
            {pending.length > 0 && <>
              <h4 className="la-phase">بانتظار تأكيدك ({pending.length})</h4>
              <ul className="la-queue">{pending.map((s) => (
                <li key={s.id}>
                  <b>{s.participants?.full_name}</b> <span className={`la-chip ${COACH_ST[s.status][1]}`}>{COACH_ST[s.status][0]}</span>
                  <small>{when(s.starts_at)}</small>
                  {canWrite && <>
                    <button className="btn-sm primary" onClick={() => mark(s, 'attended')}>حضر</button>
                    <button className="btn-sm ghost" onClick={() => mark(s, 'no_show')}>لم يحضر</button>
                    <button className="la-link" onClick={() => mark(s, 'cancelled')}>أُلغيت</button>
                  </>}
                </li>
              ))}</ul>
            </>}
            {upcoming.length > 0 && <>
              <h4 className="la-phase">القادمة ({upcoming.length})</h4>
              <ul className="la-queue">{upcoming.map((s) => (
                <li key={s.id}>
                  <b>{s.participants?.full_name}</b>{s.experts?.full_name && <small> · مع {s.experts.full_name}</small>}
                  {s.join_url && <a className="la-link" href={s.join_url} target="_blank" rel="noopener noreferrer">رابط الجلسة</a>}
                  <small>{when(s.starts_at)}</small>
                </li>
              ))}</ul>
            </>}
            {done.length > 0 && <>
              <h4 className="la-phase">آخر الجلسات</h4>
              <ul className="la-queue">{done.map((s) => (
                <li key={s.id}>
                  {s.participants?.full_name}{s.experts?.full_name && <small> · مع {s.experts.full_name}</small>} <span className={`la-chip ${COACH_ST[s.status][1]}`}>{COACH_ST[s.status][0]}</span>
                  <small>{when(s.starts_at)}{s.confirmed_by ? ` · ${s.confirmed_by}` : ''}</small>
                  {canWrite && <button className="la-link" onClick={() => mark(s, 'booked')}>تراجع</button>}
                </li>
              ))}</ul>
            </>}
            {!list.length && <p className="la-muted" style={{ marginTop: 8 }}>لا جلسات بعد. تظهر هنا حجوزات المشاركين فور تأكيدها من منصة المواعيد.</p>}
          </section>
        );
      })}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); reload(); } }} />}
    </>
  );
}

export default function Activities({ canWrite }) {
  const [data, setData] = useState(null);
  const [sub, setSub] = useState('workshops');
  const load = useCallback(async () => setData(await L('admin.activities')), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Spinner />;
  if (!data.success) return <div className="la-err" role="alert">{data.message}</div>;
  const waiting = data.coaching.filter((s) => ['booked', 'requested'].includes(s.status) && (!s.ends_at || new Date(s.ends_at) < new Date())).length;
  return (
    <>
      <p className="la-muted">الحضور هنا دليل إنجاز المشارك، فلا يكتمل بند الجلسة بنقرة منه. أي مرحلة يمكن أن تضم جلسات جماعية أو فردية، حضورية أو عن بعد؛ تضيف المتطلب ونوعه وطريقة توثيقه من «الرحلة والمتطلبات»، ثم مواعيده هنا.</p>
      <nav className="la-subtabs" style={{ margin: '12px 0' }}>
        <button className={sub === 'workshops' ? 'on' : ''} onClick={() => setSub('workshops')}>الجلسات الجماعية</button>
        <button className={sub === 'coaching' ? 'on' : ''} onClick={() => setSub('coaching')}>الجلسات الفردية {waiting > 0 && <small>({waiting} بانتظار التأكيد)</small>}</button>
      </nav>
      {sub === 'workshops' ? <Workshops data={data} reload={load} canWrite={canWrite} /> : <Coaching data={data} reload={load} canWrite={canWrite} />}
    </>
  );
}

// ── ملخص النشاط في صفحة المشارك ──
const READ_AR = Object.fromEntries(Object.entries({ read: 'ok', skimmed: 'warn', partial: '', unread: '' }).map(([k, tone]) => [k, [READ_STATUS_ADMIN[k], tone]]));
export function ActivitySummary({ a }) {
  const [open, setOpen] = useState(false);
  if (!a) return null;
  if (a.type === 'reading') {
    const skim = a.chapters.filter((c) => c.state === 'skimmed').length;
    return (
      <div className="la-act">
        <button className="la-link" onClick={() => setOpen(!open)}>قرأ {a.count} من {a.total}{skim ? ` · ${skim} تصفّح سريع` : ''}</button>
        {open && <ul>{a.chapters.map((c) => (
          <li key={c.id}>{c.title} <span className={`la-chip ${READ_AR[c.state][1]}`}>{READ_AR[c.state][0]}</span>
            <small className="la-muted"> {Math.round((c.seconds || 0) / 60)} د من {Math.round((c.expected || 0) / 60)} متوقعة{a.quiz ? (c.quiz ? ' · اختبر' : ' · بلا اختبار') : ''}</small></li>
        ))}</ul>}
      </div>
    );
  }
  if (a.type === 'video') return <div className="la-act la-muted">شاهد {a.pct}% (المطلوب {a.min_pct}%)</div>;
  if (a.type === 'workshop') return <div className="la-act la-muted">حضر {a.count} من {a.total}{a.sessions.length ? `: ${a.sessions.filter((s) => s.attended).map((s) => s.title).join('، ') || 'لا شيء بعد'}` : ''}</div>;
  if (a.type === 'coaching') return <div className="la-act la-muted">جلسات مؤكدة {a.count} من {a.total}{a.sessions.some((s) => s.awaiting) ? ' · بانتظار تأكيد' : ''}</div>;
  return null;
}
