// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة: الجلسات الجماعية والفردية، حضورية أو عن بعد
// ════════════════════════════════════════════════════════════════
// الجلسات الجماعية: مواعيد حضورية أو عن بعد، وحضور يُوثَّق بالطريقة المختارة
// للمتطلب (رمز QR يتجدد كل 30 ثانية، أو الانضمام من التطبيق، أو يدويًا).
// الجلسات الفردية: حجوزات منصة المواعيد، وتوفر
// الاتصال الفوري، وتأكيد الموجّه لكل جلسة (حضر أو لم يحضر).
// إعداد كل نشاط (الرابط، العدد المطلوب) في «الرحلة والمتطلبات».
import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { L } from '../leaders.js';
import Form from '../Form.jsx';
import { Spinner, useEscape, useUI } from '../ui.jsx';

import { SESSION_MODE_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { minutesAr, QR_WINDOW, SESSION_DEFAULTS, sessionsAr } from '../../../supabase/functions/leaders-api/logic.js';

const when = (d) => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const SESSION_FIELDS = [
  { name: 'title_ar', label: 'عنوان الجلسة (مثل: اليوم الأول، Milestone)' },
  { name: 'mode', label: 'الطريقة', type: 'select', options: { in_person: SESSION_MODE_AR.in_person, online: SESSION_MODE_AR.online } },
  { name: 'location_ar', label: 'المكان (القاعة والمدينة)', show: (v) => v.mode !== 'online' },
  { name: 'join_url', label: 'رابط الاجتماع (Zoom أو Teams أو Google Meet)', dir: 'ltr', show: (v) => v.mode === 'online',
    help: 'يظهر للمشارك قبل الجلسة بساعة فقط.' },
  { name: 'starts_at', label: 'تبدأ', type: 'datetime' },
  { name: 'ends_at', label: 'تنتهي', type: 'datetime' },
  { name: 'active', label: 'مفعّلة', type: 'check' },
];
// الجلسة لدفعة بعينها، أو لكل الدفعات التي تتبع برنامج المتطلب
const sessionFields = (cohorts) => cohorts.length < 2 ? SESSION_FIELDS : [
  { name: 'cohort_id', label: 'الدفعة', type: 'select', empty: 'كل الدفعات', options: Object.fromEntries(cohorts.map((c) => [c.id, c.name])),
    help: 'لكل دفعة مواعيدها وقاعاتها. الجلسة العامة تظهر لكل الدفعات.' },
  ...SESSION_FIELDS,
];
const VERIFY_AR = { qr: 'التوثيق برمز QR', join: 'التوثيق بالانضمام من التطبيق', manual: 'التوثيق يدويًا' };
const MODE_AR = SESSION_MODE_AR;
const COACH_ST = { booked: ['محجوزة', ''], requested: ['اتصال فوري', 'warn'], attended: ['حضر', 'ok'], no_show: ['لم يحضر', 'bad'], cancelled: ['أُلغيت', ''] };

// ── شاشة رمز الحضور للقاعة ──
function QrScreen({ id, onClose }) {
  const [d, setD] = useState(null);
  const [img, setImg] = useState('');
  useEscape(onClose);
  useEffect(() => {
    let t = 0, alive = true;
    const load = async () => {
      const r = await L('admin.workshop-qr', { id });
      if (!alive) return;
      setD(r);
      if (r.success) setImg(await QRCode.toDataURL(r.url, { width: 640, margin: 1, color: { dark: '#061318', light: '#FFFFFF' } }));
      t = setTimeout(load, ((r.refresh_in || 10) + 0.5) * 1000);
    };
    load();
    return () => { alive = false; clearTimeout(t); };
  }, [id]);
  return (
    <div className="la-qr" role="dialog" aria-modal="true" aria-label="رمز الحضور">
      <button className="la-qr-x" onClick={onClose} aria-label="إغلاق">✕</button>
      {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : <>
        <h2>{d.session.title}</h2>
        <p>{d.session.location} · {when(d.session.starts_at)}</p>
        {d.open ? <img src={img} alt="رمز الحضور" /> : <div className="la-err">تسجيل الحضور لهذه الجلسة غير متاح الآن (يُفتح قبل البدء بساعة).</div>}
        <p className="la-qr-hint">امسح الرمز بكاميرا جوالك لتسجيل حضورك. يتجدد الرمز كل {QR_WINDOW} ثانية.</p>
        <b className="la-qr-count">{d.attended} حاضر</b>
      </>}
    </div>
  );
}

// ── قائمة الحضور للتسجيل اليدوي ──
function Attendance({ id, canWrite, onClose }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const load = useCallback(async () => setD(await L('admin.workshop-attendance', { id })), [id]);
  useEffect(() => { load(); }, [load]);
  useEscape(onClose);
  const mark = async (pid, present) => {
    const r = await L('admin.workshop-mark', { session_id: id, participant_id: pid, present });
    if (!r.success) toast(r.message);
    load();
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form" role="dialog" aria-modal="true" aria-label="الحضور" style={{ maxWidth: 720 }}>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : <>
          <h3>{d.session.title_ar} · {d.people.filter((p) => p.attendance).length} من {d.people.length}</h3>
          <p className="la-muted">{d.requirement.title_ar} · {when(d.session.starts_at)}</p>
          <table className="la-table">
            <thead><tr><th>المشارك</th><th>الجهة</th><th>الحضور</th><th /></tr></thead>
            <tbody>{d.people.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name}<br /><small className="la-muted" dir="ltr">{p.email}</small></td>
                <td>{p.organization_name || ''}</td>
                <td>{p.attendance ? <span className="la-chip ok">{p.attendance.method === 'qr' ? 'QR' : 'يدوي'} · {when(p.attendance.checked_in_at)}</span> : <span className="la-chip">غائب</span>}</td>
                <td>{canWrite && (p.attendance
                  ? <button className="la-link" onClick={() => mark(p.id, false)}>إلغاء</button>
                  : <button className="btn-sm ghost" onClick={() => mark(p.id, true)}>تسجيل حضور</button>)}</td>
              </tr>
            ))}</tbody>
          </table>
        </>}
        <div className="la-row"><button className="btn-sm ghost" onClick={onClose}>إغلاق</button></div>
      </div>
    </div>
  );
}

function Workshops({ data, reload, canWrite }) {
  const { toast } = useUI();
  const [form, setForm] = useState(null);
  const [qr, setQr] = useState(null);
  const [att, setAtt] = useState(null);
  const reqs = data.requirements.filter((r) => r.kind === 'workshop');
  const save = (base) => async (row) => L('admin.workshop-save', { row: { ...base, ...row } });
  if (!reqs.length) return <p className="la-muted">لا متطلب من نوع «جلسات جماعية بمواعيد». أضفه في أي مرحلة من «الرحلة والمتطلبات».</p>;
  return (
    <>
      {reqs.map((r) => {
        const list = data.workshops.filter((s) => s.requirement_id === r.id);
        const cohorts = (data.cohorts || []).filter((c) => c.program_id === r.program_id);
        const fields = sessionFields(cohorts);
        const cohortName = (id) => cohorts.find((c) => c.id === id)?.name;
        return (
          <section key={r.id} className="la-card">
            <div className="la-row between">
              <div><b>{r.title_ar}</b> {(data.programs || []).length > 1 && <small className="la-chip">{data.programs.find((x) => x.id === r.program_id)?.name}</small>} <small className="la-muted"><code>{r.code}</code> · المطلوب حضور {r.config?.sessions_required || SESSION_DEFAULTS.sessions_required} · {VERIFY_AR[r.config?.verify || 'qr']}</small></div>
              {canWrite && <button className="btn-sm primary" onClick={() => setForm({ title: 'موعد جديد', fields, values: { active: true, mode: 'in_person' }, onSave: save({ requirement_id: r.id }) })}>+ موعد</button>}
            </div>
            {list.length ? (
              <table className="la-table" style={{ marginTop: 10 }}>
                <thead><tr><th>الجلسة</th><th>الموعد</th><th>الطريقة</th><th>الحضور</th><th /></tr></thead>
                <tbody>{list.map((s) => (
                  <tr key={s.id} className={s.active ? '' : 'off'}>
                    <td>{s.title_ar}{s.cohort_id && <small className="la-chip">{cohortName(s.cohort_id)}</small>}{!s.active && <small className="la-muted"> · موقوفة</small>}</td>
                    <td>{when(s.starts_at)}</td>
                    <td>{MODE_AR[s.mode || 'in_person']}{s.mode === 'online' ? '' : s.location_ar ? ` · ${s.location_ar}` : ''}</td>
                    <td><button className="la-link" onClick={() => setAtt(s.id)}>{s.attended} حاضر</button></td>
                    <td className="la-row">
                      {(r.config?.verify || 'qr') === 'qr' && <button className="btn-sm primary" onClick={() => setQr(s.id)}>اعرض رمز الحضور</button>}
                      {canWrite && <button className="la-link" onClick={() => setForm({ title: 'تحرير موعد', fields, values: s, onSave: save({ id: s.id }), onDelete: s.attended ? undefined : () => L('admin.workshop-delete', { id: s.id }) })}>تحرير</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="la-muted" style={{ marginTop: 8 }}>لا مواعيد بعد. أضف المواعيد بطريقتها (حضوري أو عن بعد) لتظهر للمشاركين.</p>}
          </section>
        );
      })}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); reload(); } }} />}
      {qr && <QrScreen id={qr} onClose={() => { setQr(null); reload(); }} />}
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
    const list = people || (await L('admin.participants', {})).participants || [];
    setPeople(list);
    setForm({
      title: `جلسة يدوية: ${r.title_ar}`,
      fields: [
        { name: 'participant_id', label: 'المشارك', type: 'select', options: Object.fromEntries(list.map((p) => [p.id, `${p.full_name} · ${p.email}`])) },
        { name: 'starts_at', label: 'الموعد', type: 'datetime' },
        { name: 'status', label: 'الحالة', type: 'select', options: { attended: 'حضر (منعقدة)', booked: 'محجوزة (قادمة)' } },
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
              <div><b>{r.title_ar}</b> <small className="la-muted"><code>{r.code}</code> · {sessionsAr(c.sessions_required || SESSION_DEFAULTS.sessions_required)} · {minutesAr(c.minutes || SESSION_DEFAULTS.minutes)} · {MODE_AR[c.mode || 'online']}{c.location_ar ? ` · ${c.location_ar}` : ''}</small></div>
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
                  <b>{s.participants?.full_name}</b>
                  {s.join_url && <a className="la-link" href={s.join_url} target="_blank" rel="noopener noreferrer">رابط الجلسة</a>}
                  <small>{when(s.starts_at)}</small>
                </li>
              ))}</ul>
            </>}
            {done.length > 0 && <>
              <h4 className="la-phase">آخر الجلسات</h4>
              <ul className="la-queue">{done.map((s) => (
                <li key={s.id}>
                  {s.participants?.full_name} <span className={`la-chip ${COACH_ST[s.status][1]}`}>{COACH_ST[s.status][0]}</span>
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
const READ_AR = { read: ['قرأ', 'ok'], skimmed: ['تصفّح سريعًا', 'warn'], partial: ['قراءة جزئية', ''], unread: ['لم يقرأ', ''] };
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
