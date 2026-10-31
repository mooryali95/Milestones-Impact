// ════════════════════════════════════════════════════════════════
// الخبراء: الشبكة بفلاترها، وطلبات الانضمام، وملف الخبير بأدواره وحالته
// ════════════════════════════════════════════════════════════════
// المرحلة الأولى من نظام الخبراء: الملف والأدوار والاعتماد. الإسناد والجلسات
// والساعات والتقييم تُبنى فوقه في المراحل التالية. سعر الساعة للإدارة وحدها.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import FilterBar, { useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts } from '../filters.js';
import { RequestsBoard } from './ExpertMatch.jsx';
import { DIM_AR, EXPERT_ROLE_AR, EXPERT_STATUS, LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';

const TONE = { applied: 'warn', invited: '', active: 'ok', paused: '', suspended: 'bad', rejected: '' };
const ROLES = Object.entries(EXPERT_ROLE_AR);
const LANG = { ar: 'العربية', en: 'English' };
const ACT = { apply: 'قدّم طلب الانضمام', create: 'أُضيف', update: 'عُدّل الملف', invite: 'أُرسلت الدعوة', active: 'اعتُمد', paused: 'أُوقف مؤقتًا', suspended: 'أُوقف', rejected: 'لم يُقبل' };
// الحالات التالية المسموحة من كل حالة، بنص الزر (يطابق MOVES في experts.ts)
const NEXT = {
  applied: [['active', 'اعتماد', 'primary'], ['rejected', 'عدم القبول', 'ghost']],
  invited: [['active', 'اعتماد', 'primary'], ['rejected', 'إلغاء الدعوة', 'ghost']],
  active: [['paused', 'إيقاف مؤقت', 'ghost'], ['suspended', 'إيقاف', 'danger']],
  paused: [['active', 'إعادة التفعيل', 'primary'], ['suspended', 'إيقاف', 'danger']],
  suspended: [['active', 'إعادة التفعيل', 'primary']],
  rejected: [['active', 'اعتماد', 'primary']],
};
const PRESETS = [
  { key: 'applied', label: 'طلبات بانتظار المراجعة', test: (e) => e.status === 'applied' },
  { key: 'active', label: 'نشطون', test: (e) => e.status === 'active' },
  { key: 'invited', label: 'مدعوون', test: (e) => e.status === 'invited' },
  { key: 'off', label: 'متوقفون', test: (e) => ['paused', 'suspended'].includes(e.status) },
];
const EMPTY = { full_name: '', email: '', phone: '', title: '', bio: '', linkedin_url: '', roles: [], dimensions: [], levels: [], sectors: '', languages: ['ar'], weekly_hours: '', years_experience: '', hourly_rate: '', admin_note: '' };

const Chips = ({ list, labels }) => (list?.length ? <span className="ex-chips">{list.map((k) => <span key={k} className="la-chip">{labels[k] || k}</span>)}</span> : <span className="la-muted">·</span>);

function Toggles({ value, options, onChange, disabled }) {
  const on = new Set(value || []);
  return (
    <div className="ex-toggles">{options.map(([k, l]) => (
      <label key={k} className={`ex-tg${on.has(k) ? ' on' : ''}`}>
        <input type="checkbox" checked={on.has(k)} disabled={disabled} onChange={() => { const n = new Set(on); if (n.has(k)) n.delete(k); else n.add(k); onChange([...n]); }} />{l}
      </label>
    ))}</div>
  );
}

// نموذج الملف: الإضافة والتعديل بالحقول نفسها
function ExpertForm({ initial, isNew, canWrite, onSaved, onCancel }) {
  const { toast } = useUI();
  const [v, setV] = useState(() => ({ ...EMPTY, ...initial, sectors: (initial?.sectors || []).join('، '), hourly_rate: initial?.hourly_rate ?? '', weekly_hours: initial?.weekly_hours ?? '', years_experience: initial?.years_experience ?? '' }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await L('admin.expert-save', { ...v, ...(isNew ? {} : { id: initial.id }) });
    setBusy(false);
    toast(r.success ? (isNew ? (r.invited ? 'أُضيف الخبير وأُرسلت دعوته' : 'أُضيف الخبير') : 'حُفظ الملف') : r.message);
    if (r.success) onSaved(r.expert);
  };
  return (
    <form className="la-card ex-form" onSubmit={save}>
      <fieldset disabled={!canWrite || busy}>
        <h4>الهوية</h4>
        <div className="ex-grid">
          <label className="of-field"><span className="of-label">الاسم *</span><input required value={v.full_name} onChange={set('full_name')} maxLength={120} /></label>
          <label className="of-field"><span className="of-label">البريد {isNew ? '*' : ''}</span><input dir="ltr" type="email" required={isNew} disabled={!isNew} value={v.email} onChange={set('email')} /></label>
          <label className="of-field"><span className="of-label">المسمى المهني</span><input value={v.title || ''} onChange={set('title')} maxLength={160} placeholder="مثل: مستشار إدارة محافظ، PMP" /></label>
          <label className="of-field"><span className="of-label">الجوال</span><input dir="ltr" value={v.phone || ''} onChange={set('phone')} /></label>
          <label className="of-field"><span className="of-label">LinkedIn</span><input dir="ltr" value={v.linkedin_url || ''} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…" /></label>
          <label className="of-field"><span className="of-label">سنوات الخبرة</span><input inputMode="numeric" value={v.years_experience} onChange={set('years_experience')} /></label>
        </div>
        <label className="of-field"><span className="of-label">نبذة عن الخبرة</span><textarea rows={4} value={v.bio || ''} onChange={set('bio')} maxLength={3000} /></label>

        <h4>الأدوار والتخصص</h4>
        <span className="of-label">الأدوار</span>
        <Toggles value={v.roles} options={ROLES.map(([k, [l]]) => [k, l])} onChange={(roles) => setV({ ...v, roles })} />
        <div className="ex-grid">
          <div><span className="of-label">الأبعاد</span><Toggles value={v.dimensions} options={Object.entries(DIM_AR)} onChange={(dimensions) => setV({ ...v, dimensions })} /></div>
          <div><span className="of-label">المستويات التي يخدمها</span><Toggles value={v.levels} options={Object.entries(LEVEL_AR)} onChange={(levels) => setV({ ...v, levels })} /></div>
          <div><span className="of-label">اللغات</span><Toggles value={v.languages} options={Object.entries(LANG)} onChange={(languages) => setV({ ...v, languages })} /></div>
          <label className="of-field"><span className="of-label">القطاعات</span><input value={v.sectors} onChange={set('sectors')} placeholder="حكومي، طاقة، صحة" /><small className="la-muted">افصل بينها بفاصلة</small></label>
        </div>

        <h4>الطاقة والتكلفة <small className="la-muted">· للإدارة وحدها، لا تظهر للخبير ولا للمشارك</small></h4>
        <div className="ex-grid">
          <label className="of-field"><span className="of-label">الساعات المتاحة أسبوعيًا</span><input inputMode="numeric" value={v.weekly_hours} onChange={set('weekly_hours')} /></label>
          <label className="of-field"><span className="of-label">سعر الساعة (ريال)</span><input inputMode="decimal" value={v.hourly_rate} onChange={set('hourly_rate')} placeholder="0 للمتطوع" /><small className="la-muted">يُحسب منه تكلفة كل خدمة ولو كان متطوعًا</small></label>
        </div>
        <label className="of-field"><span className="of-label">ملاحظة داخلية</span><textarea rows={2} value={v.admin_note || ''} onChange={set('admin_note')} maxLength={2000} /></label>
      </fieldset>
      {canWrite && <div className="la-row"><button className="btn-sm primary" disabled={busy}>{busy ? 'لحظة…' : isNew ? 'إضافة وإرسال الدعوة' : 'حفظ الملف'}</button>
        {onCancel && <button type="button" className="btn-sm ghost" onClick={onCancel}>إلغاء</button>}</div>}
    </form>
  );
}

const COACH_AR = { booked: 'محجوزة', requested: 'اتصال فوري', attended: 'منعقدة', no_show: 'لم يحضر المشارك', cancelled: 'أُلغيت' };
const money = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ريال`;

// سجل الخدمات: من الجلسات المرتبطة بالخبير، ومراجعاته من حسابه في لوحة الإدارة بالبريد نفسه
function Service({ s, rate }) {
  if (!s) return null;
  const r = s.reviews || {};
  const reviews = (r.requirements || 0) + (r.models || 0) + (r.capstones || 0);
  return (
    <section className="la-card ex-service">
      <h4>سجل الخدمات</h4>
      <div className="ex-kpis">
        <span><b>{s.hours}</b>ساعة قدّمها</span>
        <span><b>{s.participants}</b>مشارك خدمه</span>
        <span><b>{s.attended}</b>جلسة منعقدة{s.no_show ? <small> · {s.no_show} غياب</small> : null}</span>
        <span><b>{s.upcoming}</b>جلسة قادمة</span>
        <span><b>{reviews}</b>مراجعة{reviews ? <small> · {r.models || 0} نموذج · {r.capstones || 0} مشروع تخرج · {r.requirements || 0} متطلب</small> : null}</span>
        <span className="ex-cost"><b>{s.cost != null ? money(s.cost) : '·'}</b>التكلفة المحسوبة{rate == null ? <small> · حدّد سعر الساعة</small> : <small> · {money(rate)}/ساعة</small>}</span>
      </div>
      {s.recent?.length ? (
        <ul className="la-log">{s.recent.map((x) => <li key={x.id}><small>{date(x.starts_at)}</small> {x.participants?.full_name || 'مشارك'} <span className="la-chip">{COACH_AR[x.status] || x.status}</span></li>)}</ul>
      ) : <p className="la-muted">لا جلسات مرتبطة به بعد. تُربط تلقائيًا حين يطابق اسم المدرب في الحجز بريده أو اسمه، أو حين تختاره عند تسجيل جلسة يدوية.</p>}
    </section>
  );
}

function Profile({ id, canWrite, onBack }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const load = useCallback(async () => setD(await L('admin.expert', { id })), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message} <button className="btn-sm ghost" onClick={onBack}>رجوع</button></div>;
  const e = d.expert;
  const move = async (to, label) => {
    if (['suspended', 'rejected'].includes(to) && !(await confirm(`${label}: ${e.full_name}؟`, { danger: true, ok: label }))) return;
    const r = await L('admin.expert-set-status', { id: e.id, status: to });
    toast(r.success ? `${EXPERT_STATUS[to]}` : r.message);
    if (r.success) load();
  };
  return (
    <div className="ex-profile">
      <button className="la-link" onClick={onBack}>→ كل الخبراء</button>
      <section className="la-card ex-head">
        <div>
          <h3>{e.full_name}</h3>
          <p className="la-muted">{[e.title, e.years_experience != null ? `${e.years_experience} سنة خبرة` : null].filter(Boolean).join(' · ')}</p>
          <p className="la-muted" dir="ltr">{e.email}{e.phone ? ` · ${e.phone}` : ''}</p>
          <small className="la-muted">{e.source === 'admin' ? 'أضافته الإدارة' : 'طلب انضمام'} · {date(e.created_at)}{e.approved_at ? ` · اعتُمد ${date(e.approved_at)}` : ''}</small>
        </div>
        <div className="ex-side">
          <span className={`la-chip ${TONE[e.status]}`}>{EXPERT_STATUS[e.status]}</span>
          {canWrite && <div className="la-row">{(NEXT[e.status] || []).map(([to, l, tone]) => <button key={to} className={`btn-sm ${tone}`} onClick={() => move(to, l)}>{l}</button>)}
            {['applied', 'invited', 'active', 'paused'].includes(e.status) && <button className="btn-sm ghost" onClick={async () => { const r = await L('admin.expert-invite', { id: e.id }); toast(r.success ? 'أُرسلت الدعوة' : r.message); if (r.success) load(); }}>إرسال دعوة</button>}</div>}
        </div>
      </section>
      <Service s={d.service} rate={e.hourly_rate} />
      <ExpertForm key={e.updated_at} initial={e} canWrite={canWrite} onSaved={load} />
      <section className="la-card"><h4>السجل</h4>
        <ul className="la-log">{d.activity.length ? d.activity.map((x, i) => <li key={i}><small>{date(x.created_at)}</small> {ACT[x.action.replace('expert.', '')] || x.action} <small className="la-muted">{x.actor}</small></li>) : <li className="la-muted">لا شيء</li>}</ul>
      </section>
    </div>
  );
}

export default function Experts({ canWrite, expertId, onOpen, onPerson }) {
  const [d, setD] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'role', 'dim', 'level', 'source']);
  const load = useCallback(async () => setD(await L('admin.experts')), []);
  useEffect(() => { if (!expertId) load(); }, [load, expertId]);
  const all = d?.experts || [];
  const fields = useMemo(() => [
    { key: 'role', label: 'الأدوار', get: (e) => e.roles, options: ROLES.map(([k, [l]]) => [k, l]) },
    { key: 'dim', label: 'الأبعاد', get: (e) => e.dimensions, options: Object.entries(DIM_AR) },
    { key: 'level', label: 'المستويات', get: (e) => e.levels, options: Object.entries(LEVEL_AR) },
    { key: 'source', label: 'المصادر', get: (e) => e.source, options: [['application', 'طلب انضمام'], ['admin', 'أضافته الإدارة']] },
  ], []);
  const rows = useMemo(() => applyFilters(all, { fields, presets: PRESETS, text: (e) => [e.full_name, e.email, e.title, ...(e.sectors || [])].join(' ') }, f), [all, f, fields]);
  const counts = useMemo(() => presetCounts(all, PRESETS), [all]);

  if (expertId) return <Profile id={expertId} canWrite={canWrite} onBack={() => onOpen(null)} />;
  const active = all.filter((e) => e.status === 'active');
  const hours = active.reduce((a, e) => a + (e.weekly_hours || 0), 0);
  return (
    <div className="ex">
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">خبراء نشطون</div><div className="stat-value s-replied">{d ? active.length : '·'}</div><div className="stat-sub">من {all.length} في الشبكة</div></div>
        <div className="stat-card"><div className="stat-label">طلبات بانتظارك</div><div className="stat-value s-new">{d ? counts.applied : '·'}</div><div className="stat-sub">طلب انضمام</div></div>
        <div className="stat-card"><div className="stat-label">ساعات مقدّمة</div><div className="stat-value">{d ? Math.round(all.reduce((a, e) => a + (e.stats?.hours || 0), 0) * 10) / 10 : '·'}</div><div className="stat-sub">من {hours} ساعة متاحة أسبوعيًا</div></div>
        <div className="stat-card ex-cover"><div className="stat-label">التغطية بالأدوار</div>
          <div className="ex-cover-list">{ROLES.map(([k, [l]]) => <span key={k}><b>{active.filter((e) => e.roles.includes(k)).length}</b>{l}</span>)}</div></div>
      </div>
      <RequestsBoard canWrite={canWrite} onPerson={onPerson} />
      {adding && <ExpertForm isNew canWrite={canWrite} onCancel={() => setAdding(false)} onSaved={(e) => { setAdding(false); onOpen(e.id); }} />}
      <section className="la-card">
        <div className="la-row between"><h3>شبكة الخبراء</h3>{canWrite && !adding && <button className="btn-sm primary" onClick={() => setAdding(true)}>+ خبير</button>}</div>
        <p className="la-muted">ينضم الخبير بدعوة منك أو بطلب من صفحة «انضم كخبير»، ولا يُسند إليه شيء قبل اعتماده.</p>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : <>
          <FilterBar scope="experts" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={PRESETS} counts={counts}
            shown={rows.length} total={all.length} noun="خبير" placeholder="ابحث بالاسم أو البريد أو المسمى أو القطاع" />
          {!all.length ? <p className="la-muted ce-empty">لا خبراء بعد. أضف أول خبير، أو شارك رابط «انضم كخبير».</p> : (
            <div className="table-wrap"><table className="data-table la-cards ex-table">
              <thead><tr><th>الخبير</th><th>الأدوار</th><th>الأبعاد</th><th>الطاقة</th><th>ما قدّمه</th><th>الحالة</th></tr></thead>
              <tbody>{rows.length ? rows.map((e) => (
                <tr key={e.id} className="la-click" onClick={() => onOpen(e.id)}>
                  <td data-label="الخبير"><b>{e.full_name}</b><br /><small className="la-muted">{e.title || e.email}</small></td>
                  <td data-label="الأدوار"><Chips list={e.roles} labels={Object.fromEntries(ROLES.map(([k, [l]]) => [k, l]))} /></td>
                  <td data-label="الأبعاد"><Chips list={e.dimensions} labels={DIM_AR} /></td>
                  <td data-label="الطاقة">{e.weekly_hours != null ? `${e.weekly_hours} س/أسبوع` : '·'}</td>
                  <td data-label="ما قدّمه">{e.stats?.attended ? `${e.stats.hours} ساعة · ${e.stats.participants} مشارك` : <span className="la-muted">·</span>}</td>
                  <td data-label="الحالة"><span className={`la-chip ${TONE[e.status]}`}>{EXPERT_STATUS[e.status]}</span></td>
                </tr>
              )) : <tr><td colSpan={6} className="la-empty">لا نتائج لهذه الفلاتر.</td></tr>}</tbody>
            </table></div>
          )}
        </>}
      </section>
    </div>
  );
}
