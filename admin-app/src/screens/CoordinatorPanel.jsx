// ════════════════════════════════════════════════════════════════
// منسق الجهة في لوحة الجهة: الحالة، الصلاحيات، الجلسات، السجل، والمعاينة
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { date, L, STATUS } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { VIEWER_PERM_AR, VIEWER_TEMPLATE_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { COORD_TEMPLATES } from '../../../supabase/functions/leaders-api/logic.js';

const ST = { invited: ['دُعي ولم يدخل بعد', 'warn'], active: ['فعّال', 'ok'], suspended: ['موقوف', 'bad'] };
const PERMS = Object.entries(VIEWER_PERM_AR).map(([k, [l, h]]) => [k, l, h]);
const TEMPLATE_HINT = {
  executive: 'أرقام مجمّعة ومحفظة المبادرات المعتمدة، بلا أسماء',
  program: 'قائمة المشاركين وتقدّمهم ونشاطهم',
  hr: 'قائمة المشاركين والتواصل معهم',
};
const dayInput = (iso) => (iso ? String(iso).slice(0, 10) : '');
const ACT = {
  'coordinator.create': 'أُنشئ الحساب', 'coordinator.update': 'عُدّلت البيانات', 'coordinator.invite': 'أُرسلت الدعوة',
  'coordinator.suspend': 'أُوقف الحساب', 'coordinator.resume': 'أُعيد تفعيله', 'coordinator.revoke-sessions': 'أُنهيت الجلسات',
  'coordinator.login': 'دخل', 'coordinator.view': 'فتح لوحة الجهة', 'coordinator.weekly-report': 'أُرسل الملخص الأسبوعي',
};
const ua = (s) => (/iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Mac/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : 'متصفح');

function Preview({ orgId, id, onClose }) {
  const [d, setD] = useState(null);
  useEscape(onClose);
  useEffect(() => { L('admin.coordinator-preview', { organization_id: orgId, id }).then(setD); }, [orgId, id]);
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
              {d.permissions.list === false ? <p className="la-muted">بلا صلاحية «قائمة المشاركين»: لا يرى صفًا فرديًا ولا اسمًا، والمبادرات بلا أسماء أصحابها.</p> : <div className="table-wrap"><table className="data-table">
                <thead><tr><th>الاسم</th><th>المسمى</th>{d.permissions.scores && <th>المسار</th>}<th>المرحلة</th><th>الإنجاز</th>{d.permissions.contact && <th>التواصل</th>}{d.permissions.scores && <th>المستويات</th>}</tr></thead>
                <tbody>{d.participants.map((p) => (
                  <tr key={p.id}><td>{p.full_name}</td><td>{p.job_title}</td>{d.permissions.scores && <td>{p.track_title || '·'}</td>}<td>{STATUS[p.status] || p.status}</td><td>{p.progress}%</td>
                    {d.permissions.contact && <td dir="ltr">{p.email}</td>}
                    {d.permissions.scores && <td>{p.levels ? Object.values(p.levels).length : 0}/3</td>}</tr>
                ))}</tbody>
              </table></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// إضافة مطّلع: الاسم والبريد والقالب ومدة الاطلاع، وتُرسل الدعوة عند الحفظ
function AddViewer({ orgId, onDone, onCancel }) {
  const { toast } = useUI();
  const [v, setV] = useState({ full_name: '', email: '', template: 'program', expires_at: '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await L('admin.coordinator-save', { organization_id: orgId, new: true, ...v, expires_at: v.expires_at || null });
    setBusy(false);
    toast(r.success ? (r.invited ? 'أُضيف المطّلع وأُرسلت دعوته' : 'أُضيف المطّلع') : r.message);
    if (r.success) onDone(r.coordinator.id);
  };
  return (
    <form className="cp-add" onSubmit={save}>
      <h4>مطّلع جديد</h4>
      <div className="cp-add-grid">
        <label className="of-field"><span className="of-label">الاسم</span><input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} maxLength={120} /></label>
        <label className="of-field"><span className="of-label">البريد *</span><input dir="ltr" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></label>
        <label className="of-field"><span className="of-label">القالب</span>
          <select value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })}>
            {Object.keys(COORD_TEMPLATES).map((k) => <option key={k} value={k}>{VIEWER_TEMPLATE_AR[k]}</option>)}
          </select><small className="la-muted">{TEMPLATE_HINT[v.template]}</small></label>
        <label className="of-field"><span className="of-label">ينتهي الاطلاع في</span><input type="date" value={v.expires_at} onChange={(e) => setV({ ...v, expires_at: e.target.value })} /><small className="la-muted">فارغ = حتى يُوقف</small></label>
      </div>
      <div className="la-row"><button className="btn-sm primary" disabled={busy}>{busy ? 'لحظة…' : 'إضافة وإرسال الدعوة'}</button><button type="button" className="btn-sm ghost" onClick={onCancel}>إلغاء</button></div>
    </form>
  );
}

export default function CoordinatorPanel({ org, canWrite, onEdit }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [pick, setPick] = useState(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => setD(await L('admin.coordinator', { organization_id: org.id, ...(pick ? { id: pick } : {}) })), [org.id, pick]);
  useEffect(() => { load(); }, [load]);

  const act = async (action, body, ok) => {
    const r = await L(action, { organization_id: org.id, id: d?.coordinator?.id, ...body });
    toast(r.success ? ok : r.message);
    if (r.success) load();
  };
  const head = (n) => (
    <div className="la-row between"><h3>المطّلعون من الجهة {n ? <small className="la-muted">· {n}</small> : null}</h3>
      {canWrite && !adding && <button className="btn-sm primary" onClick={() => setAdding(true)}>+ مطّلع</button>}</div>
  );

  if (!d) return <section className="la-card"><h3>المطّلعون من الجهة</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card"><h3>المطّلعون من الجهة</h3><div className="la-err">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></section>;
  const c = d.coordinator;
  const list = d.coordinators || [];
  const addForm = adding && <AddViewer orgId={org.id} onCancel={() => setAdding(false)} onDone={(id) => { setAdding(false); setPick(id); }} />;
  if (!c) {
    return (
      <section className="la-card cp">
        {head(0)}
        <p className="la-muted">أنشئ حساب اطلاع لمن يتابع البرنامج من الجهة: راعٍ تنفيذي يرى الأرقام فقط، أو منسّق يرى المشاركين، أو موارد بشرية. يدخل برمز بريد بلا كلمة مرور، ويرى المشارك في ملفه ما يُتاح لجهته.</p>
        {addForm}
      </section>
    );
  }
  const [stLabel, stTone] = ST[c.status] || [c.status, ''];
  const expired = c.expires_at && Date.parse(c.expires_at) < Date.now();
  const live = (d.sessions || []).filter((s) => s.active);
  const base = { email: c.email, full_name: c.full_name, phone: c.phone, weekly_report: c.weekly_report };
  const setPerm = (k, val) => act('admin.coordinator-save', { ...base, permissions: { ...c.permissions, [k]: val } }, 'حُفظت الصلاحية');

  return (
    <section className="la-card cp">
      {head(list.length)}
      {list.length > 1 && (
        <div className="cp-viewers" role="tablist" aria-label="المطّلعون">
          {list.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === c.id} className={`cp-viewer${x.id === c.id ? ' on' : ''}${x.live ? '' : ' off'}`} onClick={() => setPick(x.id)}>
              <b>{x.full_name || x.email}</b><small>{VIEWER_TEMPLATE_AR[x.template] || VIEWER_TEMPLATE_AR.custom}{x.live ? '' : ' · غير نافذ'}</small>
            </button>
          ))}
        </div>
      )}
      {addForm}
      <div className="la-row between cp-who"><span className="la-chip">{VIEWER_TEMPLATE_AR[c.template] || VIEWER_TEMPLATE_AR.custom}</span>
        <span className={`la-chip ${expired ? 'bad' : stTone}`}>{expired ? 'انتهت مدة الاطلاع' : stLabel}</span></div>
      <div className="cp-grid">
        <div className="cp-id">
          <b>{c.full_name || 'بلا اسم'}</b>
          <span dir="ltr">{c.email}</span>
          {c.phone && <span dir="ltr">{c.phone}</span>}
          <small className="la-muted">آخر دخول: {c.last_login_at ? date(c.last_login_at) : 'لم يدخل بعد'} · الدعوة: {c.invited_at ? date(c.invited_at) : '·'}{c.last_report_at ? ` · آخر ملخص: ${date(c.last_report_at)}` : ''}</small>
          <div className="la-row cp-acts">
            <button className="btn-sm ghost" onClick={() => setPreview(true)}>شاهد كما يراها</button>
            {canWrite && <>
              {c.id === list[0]?.id && <button className="btn-sm ghost" onClick={onEdit} title="أول مطّلع هو جهة التواصل في بطاقة الجهة">تعديل البيانات</button>}
              {c.id !== list[0]?.id && <button className="btn-sm ghost" onClick={async () => { if (await confirm(`حذف المطّلع ${c.full_name || c.email}؟ تُنهى جلساته فورًا.`, { danger: true, ok: 'حذف' })) { await act('admin.coordinator-remove', {}, 'حُذف المطّلع'); setPick(null); } }}>حذف المطّلع</button>}
              {c.status !== 'suspended' && <button className="btn-sm ghost" onClick={() => act('admin.coordinator-invite', {}, 'أُرسلت الدعوة')}>إعادة إرسال الدعوة</button>}
              {live.length > 0 && <button className="btn-sm ghost" onClick={async () => { if (await confirm(`إنهاء ${live.length} جلسة مفتوحة للمنسق؟ سيحتاج للدخول من جديد.`, { danger: true })) act('admin.coordinator-revoke', {}, 'أُنهيت الجلسات'); }}>إنهاء الجلسات</button>}
              {c.status === 'suspended'
                ? <button className="btn-sm primary" onClick={() => act('admin.coordinator-status', { suspended: false }, 'أُعيد تفعيل الحساب')}>إعادة التفعيل</button>
                : <button className="btn-sm danger" onClick={async () => { if (await confirm('إيقاف حساب المنسق؟ تُنهى جلساته فورًا ويتوقف ملخصه الأسبوعي.', { danger: true, ok: 'إيقاف' })) act('admin.coordinator-status', { suspended: true }, 'أُوقف الحساب'); }}>إيقاف الحساب</button>}
            </>}
          </div>
        </div>

        <div className="cp-perms">
          <h4>ما يراه</h4>
          <p className="la-muted">دائمًا: الأرقام المجمّعة لجهته فقط (والمقارنة لخمسة مشاركين فأكثر)، والمبادرات المعتمدة. ما يزيد على ذلك بالصلاحيات أدناه، ويراه المشارك في ملفه.</p>
          {canWrite && (
            <div className="cp-tpl">
              <label className="of-field"><span className="of-label">القالب</span>
                <select value={c.template} onChange={(e) => e.target.value !== 'custom' && act('admin.coordinator-save', { ...base, template: e.target.value, permissions: COORD_TEMPLATES[e.target.value] }, 'طُبّق القالب')}>
                  {Object.keys(COORD_TEMPLATES).map((k) => <option key={k} value={k}>{VIEWER_TEMPLATE_AR[k]}</option>)}
                  {c.template === 'custom' && <option value="custom">{VIEWER_TEMPLATE_AR.custom}</option>}
                </select></label>
              <label className="of-field"><span className="of-label">ينتهي الاطلاع في</span>
                <input type="date" defaultValue={dayInput(c.expires_at)} key={c.id + (c.expires_at || '')}
                  onBlur={(e) => e.target.value !== dayInput(c.expires_at) && act('admin.coordinator-save', { ...base, permissions: c.permissions, expires_at: e.target.value || null }, e.target.value ? 'حُدّدت مدة الاطلاع' : 'أُلغيت مدة الاطلاع')} /></label>
            </div>
          )}
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
      {preview && <Preview orgId={org.id} id={c.id} onClose={() => setPreview(false)} />}
    </section>
  );
}
