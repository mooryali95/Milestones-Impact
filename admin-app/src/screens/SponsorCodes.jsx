// ════════════════════════════════════════════════════════════════
// صفحة الجهة: «رموز الرعاية» يولّدها المدير لكل جهة (sponsor-codes.ts)
// ════════════════════════════════════════════════════════════════
// المشارك يكتب الرمز في شاشة الرسوم «رشّحتك جهة؟» كرمز رابط الجهة. لكل رمز عدد مستخدمين وتاريخ انتهاء اختياريان،
// وإيقافه أو إيقاف الجهة يوقفه فورًا. المقاعد يحكمها حد الجهة نفسه لا الرمز.
// الدفعة هي الوحدة الوحيدة (ترحيل 20261128160000): رابط الجهة والرمز بلا دفعة يُلحقان بدفعة استقبال الجهة (تُنشأ عند أول انضمام)،
// والرمز بدفعة يُلحق بها. ومن امتلأت دفعته أو أُغلقت يبقى في المنصة العامة ويظهر في «قائمة الانتظار» هنا (admin.org-intake).
import React, { useCallback, useEffect, useState } from 'react';
import { APP_URL, date, inviteUrl, L } from '../leaders.js';
import { Empty, Spinner, useCopy, useUI } from '../ui.jsx';
import { CODE_STATE_AR, participantMessage, usageAr } from '../../../supabase/functions/leaders-api/sponsor-codes.js';

const CHIP = { active: 'ok', stopped: '', expired: 'warn', exhausted: 'warn' };
const BLANK = { code: '', max_uses: '', expires_at: '', note: '', cohort_id: '' };

export default function SponsorCodes({ org, canWrite }) {
  const { toast } = useUI();
  const copy = useCopy();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [intake, setIntake] = useState(null);
  const load = useCallback(async () => {
    const [codes, ik] = await Promise.all([L('admin.sponsor-codes', { org_id: org.id }), L('admin.org-intake', { org_id: org.id })]);
    setD(codes);
    setIntake(ik?.success ? ik : null);
  }, [org.id]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { cohort_id, ...rest } = form;
    const r = await L('admin.sponsor-code-create', { org_id: org.id, ...rest, ...(cohort_id ? { cohort_id } : {}) });
    setBusy(false);
    if (!r.success) return toast(r.message);
    setForm(BLANK);
    toast(`أُنشئ الرمز ${r.code.code.toUpperCase()}`);
    load();
  };
  const toggle = async (c) => {
    const r = await L('admin.sponsor-code-update', { id: c.id, active: !c.active });
    toast(r.success ? (c.active ? 'أُوقف الرمز' : 'فُعّل الرمز') : r.message);
    if (r.success) load();
  };

  const head = <h3 id="sc-h">رموز الرعاية</h3>;
  if (!d) return <section className="la-card" aria-labelledby="sc-h">{head}<Spinner /></section>;
  if (!d.success) return <section className="la-card" aria-labelledby="sc-h">{head}<div className="la-err" role="alert">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></section>;
  if (d.ready === false) return <section className="la-card" aria-labelledby="sc-h">{head}<p className="la-muted">غير مفعّل بعد: يلزم تطبيق ترحيل القاعدة.</p></section>;
  const codes = d.codes || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = !!intake?.ready;
  const cohortName = (id) => (intake?.cohorts || []).find((c) => c.id === id)?.name;
  return (
    <>
    {ready && <IntakeCard org={org} intake={intake} copy={copy} />}
    <section className="la-card" aria-labelledby="sc-h">
      {head}
      <p className="la-muted small">يكتبه المشارك في شاشة الرسوم «رشّحتك جهة؟» فيُربط بالجهة. لكل رمز عدد مستخدمين وتاريخ انتهاء اختياريان، وبلا تاريخ ينتهي بانتهاء عقد الجهة إن سُجّل. المقاعد يحكمها حد الجهة.</p>
      {codes.length ? (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>الرمز</th>{ready && <th>الدفعة</th>}<th>الاستخدام</th><th>الانتهاء</th><th>الحالة</th><th /></tr></thead>
          <tbody>{codes.map((c) => (
            <React.Fragment key={c.id}>
              <tr>
                <td><code className="la-code" dir="ltr">{c.code.toUpperCase()}</code>{c.note && <><br /><small className="la-muted">{c.note}</small></>}</td>
                {ready && <td>{c.cohort_id ? (cohortName(c.cohort_id) || <span className="la-muted">دفعة مغلقة</span>) : <span className="la-muted">دفعة الاستقبال</span>}</td>}
                <td>{c.users?.length ? <button className="la-link" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>{usageAr(c)}</button> : usageAr(c)}</td>
                <td>{c.expires_at ? date(c.expires_at) : <span className="la-muted">بلا انتهاء</span>}</td>
                <td><span className={`la-chip ${CHIP[c.state] || ''}`}>{CODE_STATE_AR[c.state] || c.state}</span></td>
                <td><span className="la-row">
                  <button className="btn-sm ghost" onClick={() => copy(c.code.toUpperCase(), `نُسخ الرمز ${c.code.toUpperCase()}`)}>نسخ الرمز</button>
                  <button className="btn-sm ghost" onClick={() => copy(participantMessage(c.code, APP_URL, org.name), 'نُسخت رسالة المشارك')}>نسخ رسالة للمشارك</button>
                  {canWrite && <button className="btn-sm ghost" onClick={() => toggle(c)}>{c.active ? 'إيقاف' : 'تفعيل'}</button>}
                </span></td>
              </tr>
              {open === c.id && (
                <tr><td colSpan={ready ? 6 : 5}><ul className="la-list">{c.users.map((u) => (
                  <li key={u.participant_id}><b>{u.full_name || '·'}</b> <small className="la-muted" dir="ltr">{u.email}</small> <small className="la-muted">· {date(u.used_at)}</small></li>
                ))}</ul></td></tr>
              )}
            </React.Fragment>
          ))}</tbody>
        </table></div>
      ) : <Empty compact title="لا رموز رعاية بعد" hint="أنشئ رمزًا وأرسله لمرشحي الجهة، أو استعمل رمز رابط الدعوة." />}
      {canWrite && (
        <form className="la-row sc-form" onSubmit={create} aria-label="أنشئ رمز رعاية">
          <input dir="ltr" aria-label="الرمز (اختياري)" placeholder="الرمز (اختياري، 8 أحرف فأكثر)" maxLength={40} value={form.code} onChange={set('code')} />
          <input type="number" min="1" aria-label="عدد المستخدمين (اختياري)" placeholder="عدد المستخدمين (بلا حد)" value={form.max_uses} onChange={set('max_uses')} />
          <input type="date" aria-label="تاريخ الانتهاء (اختياري)" value={form.expires_at} onChange={set('expires_at')} />
          <input aria-label="ملاحظة" placeholder="ملاحظة" maxLength={300} value={form.note} onChange={set('note')} />
          {ready && (
            <select aria-label="الدفعة التي يُلحق بها مستعمل الرمز" value={form.cohort_id} onChange={set('cohort_id')}>
              <option value="">دفعة الاستقبال</option>
              {(intake.cohorts || []).filter((c) => !c.is_intake).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn-sm primary" disabled={busy}>أنشئ رمزًا</button>
        </form>
      )}
    </section>
    </>
  );
}

// دفعة استقبال الجهة: من ينضم برابطها أو برمز بلا دفعة، وقائمة انتظار من بقي في المنصة العامة. النقل من ملف المشارك
function IntakeCard({ org, intake, copy }) {
  const ik = intake.intake;
  const link = org.invite_code && org.status !== 'inactive' ? inviteUrl(org) : null;
  const waiting = intake.waiting || [];
  return (
    <section className="la-card" aria-labelledby="ik-h">
      <h3 id="ik-h">دفعة الاستقبال</h3>
      <p className="la-muted small">من ينضم برابط الجهة أو برمز بلا دفعة يُلحق بها آليًا. من له دفعة لا يُنقل آليًا، ومن امتلأت دفعته أو أُغلقت يبقى في المنصة العامة ويظهر في قائمة الانتظار أدناه.</p>
      {ik ? (
        <p><b>{ik.name}</b> <small className="la-muted">· {ik.members} عضو · السعة {ik.capacity == null ? 'بلا حد' : ik.capacity}{ik.status === 'closed' ? ' · مغلقة: المنضمون إلى المنصة العامة' : ''}</small></p>
      ) : <p className="la-muted">لم تُنشأ بعد: تُنشأ باسم الجهة على برنامجها عند أول انضمام، مثبتة على أحدث نسخة منه.</p>}
      {link && (
        <p className="la-row"><span>رابط الجهة:</span> <code className="la-code" dir="ltr">{link}</code>
          <button className="btn-sm ghost" onClick={() => copy(link, 'نُسخ رابط الجهة')}>نسخ الرابط</button></p>
      )}
      <h4>قائمة الانتظار {waiting.length ? `(${waiting.length})` : ''}</h4>
      {waiting.length ? (
        <ul className="la-list">{waiting.map((w) => (
          <li key={w.participant_id}><b>{w.full_name || '·'}</b> <small className="la-muted" dir="ltr">{w.email}</small> <small className="la-muted">· في {w.cohort}{w.since ? ` منذ ${date(w.since)}` : ''}{w.reason_ar ? ` · ${w.reason_ar}` : ''}</small></li>
        ))}</ul>
      ) : <p className="la-muted small">لا أحد ينتظر.</p>}
      {waiting.length > 0 && <p className="la-muted small">انقل من تريد من ملف المشارك: «نقل إلى دفعة أخرى».</p>}
    </section>
  );
}
