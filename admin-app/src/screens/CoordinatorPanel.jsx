// ════════════════════════════════════════════════════════════════
// منسق الجهة في لوحة الجهة: الحالة، الصلاحيات، الجلسات، السجل، والمعاينة
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { date, L, STATUS } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';

const ST = { invited: ['دُعي ولم يدخل بعد', 'warn'], active: ['فعّال', 'ok'], suspended: ['موقوف', 'bad'] };
const PERMS = [
  ['scores', 'مستويات المشاركين في الأبعاد الثلاثة', 'يرى تأسيسي أو متوسط أو احترافي لكل بُعد'],
  ['activity', 'نشاط المشاركين', 'آخر دخول لكل مشارك (العدد الأسبوعي المجمّع يظهر دائمًا)'],
  ['contact', 'بريد المشاركين وجوالاتهم', 'للتواصل المباشر معهم'],
  ['export', 'تصدير Excel وطباعة التقرير', 'من لوحة الجهة'],
];
const ACT = {
  'coordinator.create': 'أُنشئ الحساب', 'coordinator.update': 'عُدّلت البيانات', 'coordinator.invite': 'أُرسلت الدعوة',
  'coordinator.suspend': 'أُوقف الحساب', 'coordinator.resume': 'أُعيد تفعيله', 'coordinator.revoke-sessions': 'أُنهيت الجلسات',
  'coordinator.login': 'دخل', 'coordinator.view': 'فتح لوحة الجهة', 'coordinator.weekly-report': 'أُرسل الملخص الأسبوعي',
};
const ua = (s) => (/iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Mac/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : 'متصفح');

function Preview({ orgId, onClose }) {
  const [d, setD] = useState(null);
  useEscape(onClose);
  useEffect(() => { L('admin.coordinator-preview', { organization_id: orgId }).then(setD); }, [orgId]);
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="of cp-preview" role="dialog" aria-modal="true" aria-label="معاينة بعين المنسق">
        <header className="of-head"><div><small>معاينة بعين المنسق</small><h3>{d?.org?.name || '…'}</h3></div>
          <button className="modal-close" aria-label="إغلاق" onClick={onClose}>✕</button></header>
        <div className="of-body">
          {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : (
            <>
              <p className="la-muted">هذه البيانات نفسها التي يراها المنسق بصلاحياته الحالية، ولا شيء غيرها يصل إليه.</p>
              <div className="cp-kpis">{[['المشاركون', d.kpis.total], ['انضموا هذا الأسبوع', d.kpis.joined_week], ['نشطون هذا الأسبوع', d.kpis.active_week], ['متوسط الإنجاز', `${d.kpis.avg_progress}%`]].map(([l, n]) => <span key={l}><b>{n}</b>{l}</span>)}</div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>الاسم</th><th>المسمى</th><th>المسار</th><th>المرحلة</th><th>الإنجاز</th>{d.permissions.contact && <th>التواصل</th>}{d.permissions.scores && <th>المستويات</th>}</tr></thead>
                <tbody>{d.participants.map((p) => (
                  <tr key={p.id}><td>{p.full_name}</td><td>{p.job_title}</td><td>{p.track_title || p.track || '·'}</td><td>{STATUS[p.status] || p.status}</td><td>{p.progress}%</td>
                    {d.permissions.contact && <td dir="ltr">{p.email}</td>}
                    {d.permissions.scores && <td>{p.levels ? Object.values(p.levels).length : 0}/3</td>}</tr>
                ))}</tbody>
              </table></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CoordinatorPanel({ org, canWrite, onEdit }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => setD(await L('admin.coordinator', { organization_id: org.id })), [org.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (action, body, ok) => {
    const r = await L(action, { organization_id: org.id, ...body });
    toast(r.success ? ok : r.message);
    if (r.success) load();
  };

  if (!d) return <section className="la-card"><h3>منسق الجهة</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>منسق الجهة</h3><div className="la-err">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></section>;
  const c = d.coordinator;
  if (!c) {
    return (
      <section className="la-card cp">
        <div className="la-row between"><h3>منسق الجهة</h3><span className="la-chip">بلا حساب اطلاع</span></div>
        <p className="la-muted">أنشئ للمنسق حساب اطلاع يرى منه لوحة الجهة وتقاريرها، ويصله ملخص أسبوعي. يدخل برمز بريد بلا كلمة مرور.</p>
        {canWrite && <button className="btn-sm primary" onClick={onEdit}>إنشاء حساب للمنسق</button>}
      </section>
    );
  }
  const [stLabel, stTone] = ST[c.status] || [c.status, ''];
  const live = (d.sessions || []).filter((s) => s.active);
  const setPerm = (k, val) => act('admin.coordinator-save', { email: c.email, full_name: c.full_name, phone: c.phone, weekly_report: c.weekly_report, permissions: { ...c.permissions, [k]: val } }, 'حُفظت الصلاحية');

  return (
    <section className="la-card cp">
      <div className="la-row between">
        <h3>منسق الجهة</h3>
        <span className={`la-chip ${stTone}`}>{stLabel}</span>
      </div>
      <div className="cp-grid">
        <div className="cp-id">
          <b>{c.full_name || 'بلا اسم'}</b>
          <span dir="ltr">{c.email}</span>
          {c.phone && <span dir="ltr">{c.phone}</span>}
          <small className="la-muted">آخر دخول: {c.last_login_at ? date(c.last_login_at) : 'لم يدخل بعد'} · الدعوة: {c.invited_at ? date(c.invited_at) : '·'}{c.last_report_at ? ` · آخر ملخص: ${date(c.last_report_at)}` : ''}</small>
          <div className="la-row cp-acts">
            <button className="btn-sm ghost" onClick={() => setPreview(true)}>معاينة بعين المنسق</button>
            {canWrite && <>
              <button className="btn-sm ghost" onClick={onEdit}>تعديل البيانات</button>
              {c.status !== 'suspended' && <button className="btn-sm ghost" onClick={() => act('admin.coordinator-invite', {}, 'أُرسلت الدعوة')}>إعادة إرسال الدعوة</button>}
              {live.length > 0 && <button className="btn-sm ghost" onClick={async () => { if (await confirm(`إنهاء ${live.length} جلسة مفتوحة للمنسق؟ سيحتاج للدخول من جديد.`, { danger: true })) act('admin.coordinator-revoke', {}, 'أُنهيت الجلسات'); }}>إنهاء الجلسات</button>}
              {c.status === 'suspended'
                ? <button className="btn-sm primary" onClick={() => act('admin.coordinator-status', { suspended: false }, 'أُعيد تفعيل الحساب')}>إعادة التفعيل</button>
                : <button className="btn-sm danger" onClick={async () => { if (await confirm('إيقاف حساب المنسق؟ تُنهى جلساته فورًا ويتوقف ملخصه الأسبوعي.', { danger: true, ok: 'إيقاف' })) act('admin.coordinator-status', { suspended: true }, 'أُوقف الحساب'); }}>إيقاف الحساب</button>}
            </>}
          </div>
        </div>

        <div className="cp-perms">
          <h4>ما يراه المنسق</h4>
          <p className="la-muted">دائمًا: الأسماء والمسميات والمسارات والمراحل ونسب الإنجاز ومصادر الانضمام، لجهته فقط.</p>
          {PERMS.map(([k, l, h]) => (
            <label key={k} className="of-switch cp-perm">
              <input type="checkbox" checked={!!c.permissions[k]} disabled={!canWrite} onChange={(e) => setPerm(k, e.target.checked)} />
              <span><b>{l}</b><small>{h}</small></span>
            </label>
          ))}
          <label className="of-switch cp-perm">
            <input type="checkbox" checked={c.weekly_report} disabled={!canWrite}
              onChange={(e) => act('admin.coordinator-save', { email: c.email, full_name: c.full_name, phone: c.phone, permissions: c.permissions, weekly_report: e.target.checked }, e.target.checked ? 'فُعّل الملخص الأسبوعي' : 'أُوقف الملخص الأسبوعي')} />
            <span><b>الملخص الأسبوعي بالبريد</b><small>كل أحد صباحًا</small></span>
          </label>
        </div>
      </div>

      <details className="cp-more">
        <summary>الجلسات ({live.length} مفتوحة) والسجل</summary>
        <div className="cp-cols">
          <div>
            <h4>الجلسات</h4>
            <ul className="la-log">{(d.sessions || []).length ? d.sessions.map((s) => (
              <li key={s.id}><span className={`la-chip ${s.active ? 'ok' : ''}`}>{s.active ? 'مفتوحة' : 'منتهية'}</span> {ua(s.user_agent || '')} <small className="la-muted" dir="ltr">{s.ip}</small> <small>{date(s.created_at)}</small></li>
            )) : <li className="la-muted">لا جلسات بعد</li>}</ul>
          </div>
          <div>
            <h4>السجل</h4>
            <ul className="la-log">{(d.activity || []).length ? d.activity.map((x, i) => (
              <li key={i}><small>{date(x.created_at)}</small> {ACT[x.action] || x.action} <small className="la-muted">{x.actor_type === 'admin' ? x.actor : ''}</small></li>
            )) : <li className="la-muted">لا شيء</li>}</ul>
          </div>
        </div>
      </details>
      {preview && <Preview orgId={org.id} onClose={() => setPreview(false)} />}
    </section>
  );
}
