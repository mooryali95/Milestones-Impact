// ════════════════════════════════════════════════════════════════
// الخبراء: الشبكة بفلاترها، وطلبات الانضمام، وملف الخبير بأدواره وحالته
// ════════════════════════════════════════════════════════════════
// المرحلة الأولى من نظام الخبراء: الملف والأدوار والاعتماد. الإسناد والجلسات
// والساعات والتقييم تُبنى فوقه في المراحل التالية. سعر الساعة للإدارة وحدها.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { date, L } from '../leaders.js';
import { Empty, LoadError, Meter, Missing, NoMatch, Spinner, StatusChip, useUI } from '../ui.jsx';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts, recallState, sortRows } from '../filters.js';
import { attentionCount, RequestsBoard, requestView } from './ExpertMatch.jsx';
import { readQuery } from '../route.js';
import { COACH_STATUS_ADMIN as COACH_AR, COMMITTEE_STATE, COMMITTEE_STATE_TONE, DIM_AR, EXPERT_ROLE_AR, EXPERT_STATUS, EXPERT_STATUS_TONE, LEVEL_AR, RATE_TO_EXPERT } from '../../../supabase/functions/leaders-api/labels.js';
import { COMMITTEE_AR, committeeApplication, committeeApplicationAr, CONTENT_TRACK_AR, contentOnly, expertService } from '../../../supabase/functions/leaders-api/committees.js';
import { MIN_RATINGS } from '../../../supabase/functions/leaders-api/logic.js';
import { cohortStateAr } from '../methodology.js';
import { periodAr, scopeText } from '../team.js';
import EmailInput from '../../../shared/ui/EmailInput.jsx';

// الحالة بشارة StatusChip وحدها، والنبرة من EXPERT_STATUS_TONE في labels (المرحلة 16)
const ExpertChip = ({ status }) => <StatusChip status={status} labels={EXPERT_STATUS} tones={EXPERT_STATUS_TONE} />;
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
const EMPTY = { full_name: '', email: '', phone: '', title: '', bio: '', linkedin_url: '', roles: [], dimensions: [], levels: [], sectors: '', languages: ['ar'], weekly_hours: '', years_experience: '', hourly_rate: '', admin_note: '', committees: [] };

const Chips = ({ list, labels }) => (list?.length ? <span className="ex-chips">{list.map((k) => <span key={k} className="la-chip">{labels[k] || k}</span>)}</span> : <Missing reason="لم يُحدَّد" />);

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

// حقول المطابقة: للرحلة وحدها، فلا تُطلب ممن يخدم في اللجان وحدها ولا تُعرض في ملفه (تقليل البيانات)
const MATCH_EMPTY = { roles: [], levels: [], sectors: '', weekly_hours: '', hourly_rate: '' };
// نموذج الملف: الإضافة والتعديل بالحقول نفسها. خدمتاه من سجله الواحد (expertService): الرحلة بأدوارها، واللجان بعضويتها
function ExpertForm({ initial, isNew, canWrite, onSaved, onCancel }) {
  const { toast, confirm } = useUI();
  const [v, setV] = useState(() => ({ ...EMPTY, ...initial, sectors: (initial?.sectors || []).join('، '), hourly_rate: initial?.hourly_rate ?? '', weekly_hours: initial?.weekly_hours ?? '', years_experience: initial?.years_experience ?? '' }));
  // خدمة الرحلة ظاهرة للجديد ولمن له دور، ومخفية لعضو اللجنة بلا دور حتى تُختار
  const [journey, setJourney] = useState(() => (isNew ? true : !contentOnly(initial)));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  // رفع خدمة الرحلة عن خبير له أدوار يمسح حقول المطابقة عند الحفظ ويُخرجه من ترشيحاتها وتكليفاتها، فيُسأل قبله
  const toggleJourney = async (on) => {
    if (!on && !isNew && (initial?.roles || []).length
      && !(await confirm('رفع خدمة الرحلة يمسح أدواره ومستوياته وقطاعاته وساعاته وسعره عند الحفظ، ويُخرجه من ترشيحات الرحلة وتكليفاتها. متابعة؟', { danger: true, ok: 'رفع خدمة الرحلة' }))) return;
    setJourney(on);
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await L('admin.expert-save', { ...v, ...(journey ? {} : MATCH_EMPTY), ...(isNew ? {} : { id: initial.id }) });
    setBusy(false);
    toast(r.success ? (isNew ? (r.invited ? 'أُضيف الخبير وأُرسلت دعوته' : 'أُضيف الخبير') : r.committees_ready === false ? 'حُفظ الملف. عضوية اللجنة تُحفظ بعد تطبيق ترحيلها' : 'حُفظ الملف') : r.message);
    if (r.success) onSaved(r.expert);
  };
  return (
    <form className="la-card ex-form" onSubmit={save}>
      <fieldset disabled={!canWrite || busy}>
        <h4>الهوية</h4>
        <div className="ex-grid">
          <label className="of-field"><span className="of-label">الاسم *</span><input required value={v.full_name} onChange={set('full_name')} maxLength={120} /></label>
          <label className="of-field"><span className="of-label">البريد {isNew ? '*' : ''}</span><EmailInput dir="ltr" type="email" required={isNew} disabled={!isNew} value={v.email} onChange={set('email')} /></label>
          <label className="of-field"><span className="of-label">المسمى المهني</span><input value={v.title || ''} onChange={set('title')} maxLength={160} placeholder="مثل: مستشار إدارة محافظ، PMP" /></label>
          <label className="of-field"><span className="of-label">الجوال</span><input dir="ltr" value={v.phone || ''} onChange={set('phone')} /></label>
          <label className="of-field"><span className="of-label">LinkedIn</span><input dir="ltr" value={v.linkedin_url || ''} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…" /></label>
          <label className="of-field"><span className="of-label">سنوات الخبرة</span><input inputMode="numeric" value={v.years_experience} onChange={set('years_experience')} /></label>
        </div>
        <label className="of-field"><span className="of-label">نبذة عن الخبرة</span><textarea rows={4} value={v.bio || ''} onChange={set('bio')} maxLength={3000} /></label>

        <h4>الخدمة <small className="la-muted">· الأدوار للرحلة، والعضوية للكتاب الأم. يُعتمد بأحدهما أو بهما</small></h4>
        <label className="ex-tg-line"><input type="checkbox" checked={journey} onChange={(e) => toggleJourney(e.target.checked)} /> يخدم في رحلة المشاركين <small className="la-muted">(يُرشَّح ويُكلَّف بأدواره، ويُطلب منه سطر الموافقة D18)</small></label>
        <span className="of-label">لجان الحوكمة <small className="la-muted">· من يراجع المحتوى والقياس ويعتمده. المصدر الوحيد لعضوية اللجنتين، ويقرأ أعضاؤهما الكتاب الأم</small></span>
        <Toggles value={v.committees || []} options={Object.entries(COMMITTEE_AR)} onChange={(committees) => setV({ ...v, committees })} />

        <h4>{journey ? 'الأدوار والتخصص' : 'التخصص'}</h4>
        {journey && <>
          <span className="of-label">الأدوار</span>
          <Toggles value={v.roles} options={ROLES.map(([k, [l]]) => [k, l])} onChange={(roles) => setV({ ...v, roles })} />
        </>}
        <div className="ex-grid">
          <div><span className="of-label">{journey ? 'الأبعاد' : 'الإطار الذي يراجعه'}</span><Toggles value={v.dimensions} options={Object.entries(DIM_AR)} onChange={(dimensions) => setV({ ...v, dimensions })} />
            {(v.committees || []).includes('content') && <small className="la-muted">مقعده في لجنة المحتوى يُقرأ من هنا، فلا يُكتب مرتين. ويلزم إطار واحد على الأقل قبل الاعتماد.</small>}</div>
          {journey && <div><span className="of-label">المستويات التي يخدمها</span><Toggles value={v.levels} options={Object.entries(LEVEL_AR)} onChange={(levels) => setV({ ...v, levels })} /></div>}
          <div><span className="of-label">اللغات</span><Toggles value={v.languages} options={Object.entries(LANG)} onChange={(languages) => setV({ ...v, languages })} /></div>
          {journey && <label className="of-field"><span className="of-label">القطاعات</span><input value={v.sectors} onChange={set('sectors')} placeholder="حكومي، طاقة، صحة" /><small className="la-muted">افصل بينها بفاصلة</small></label>}
        </div>

        {journey && <>
          <h4>الطاقة والتكلفة <small className="la-muted">· للإدارة وحدها، لا تظهر للخبير ولا للمشارك</small></h4>
          <div className="ex-grid">
            <label className="of-field"><span className="of-label">الساعات المتاحة أسبوعيًا</span><input inputMode="numeric" value={v.weekly_hours} onChange={set('weekly_hours')} /></label>
            <label className="of-field"><span className="of-label">سعر الساعة (ريال)</span><input inputMode="decimal" value={v.hourly_rate} onChange={set('hourly_rate')} placeholder="0 للمتطوع" /><small className="la-muted">يُحسب منه تكلفة كل خدمة ولو كان متطوعًا</small></label>
          </div>
        </>}
        <label className="of-field"><span className="of-label">ملاحظة داخلية</span><textarea rows={2} value={v.admin_note || ''} onChange={set('admin_note')} maxLength={2000} /></label>
      </fieldset>
      {canWrite && <div className="la-row"><button className="btn-sm primary" disabled={busy}>{busy ? 'لحظة…' : isNew ? 'إضافة وإرسال الدعوة' : 'حفظ الملف'}</button>
        {onCancel && <button type="button" className="btn-sm ghost" onClick={onCancel}>إلغاء</button>}</div>}
    </form>
  );
}

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
        <span><b>{reviews}</b>مراجعة{reviews ? <small> · {r.models || 0} نموذج · {r.capstones || 0} وثيقة مبادرة · {r.requirements || 0} متطلب</small> : null}</span>
        <span className="ex-cost"><b>{s.cost != null ? money(s.cost) : <Missing reason={rate == null ? 'لم يُحدَّد سعر الساعة' : 'لم تُحسب التكلفة'} />}</b>التكلفة المحسوبة{rate == null ? <small> · حدّد سعر الساعة</small> : <small> · {money(rate)}/ساعة</small>}</span>
      </div>
      {s.recent?.length ? (
        <ul className="la-log">{s.recent.map((x) => <li key={x.id}><small>{date(x.starts_at)}</small> {x.participants?.full_name || 'مشارك'} <span className="la-chip">{COACH_AR[x.status] || x.status}</span></li>)}</ul>
      ) : <p className="la-muted">لا جلسات مرتبطة به بعد. تُربط تلقائيًا حين يطابق اسم المدرب في الحجز بريده أو اسمه، أو حين تختاره عند تسجيل جلسة يدوية.</p>}
    </section>
  );
}

// تقييم المشاركين للخبير: للإدارة كاملًا وحيًّا، والمشارك لا يراه، والخبير يرى ملخصه بعد MIN_RATINGS
// بنافذة دورية (r.own، expertOwnRating)، وتنبيه حين يهبط متوسط آخر التقييمات (r.drop، ratingDrop)
function Ratings({ r }) {
  if (!r) return null;
  const s = r.summary;
  return (
    <section className="la-card ex-ratings">
      <div className="la-row between"><h4>تقييم المشاركين</h4>
        <small className="la-muted">{s.count} تقييم · لا يراه المشارك{r.own?.visible ? ` · يرى الخبير ملخص ${r.own.count} منها` : ` · يُعرض للخبير بعد ${MIN_RATINGS}`}{r.given ? ` · قيّم هو ${r.given} مشارك` : ''}</small></div>
      {r.drop && <p className="la-err" role="status">هبط متوسط آخر {r.drop.last} تقييمات إلى {r.drop.avg} من 5. راجع ملاحظاتها مع الخبير.</p>}
      {!s.count ? <p className="la-muted">لا تقييمات بعد. يُطلب من المشارك تقييم كل جلسة منعقدة وكل خدمة مكتملة.</p> : <>
        <div className="ex-kpis">
          <span className="ex-cost"><b>{s.avg} / 5</b>المتوسط العام</span>
          {Object.entries(RATE_TO_EXPERT).map(([k, l]) => <span key={k}><b>{r.criteria[k] ?? <Missing reason="لم يُقيَّم" />}</b>{l}</span>)}
        </div>
        {r.comments.length > 0 && <ul className="la-log">{r.comments.map((c, i) => <li key={i}><small>{date(c.created_at)} · {c.overall}/5</small> «{c.comment}»</li>)}</ul>}
      </>}
    </section>
  );
}

// تكليفاته من المصادر الثلاثة (مستشار دفعة، خبير مجموعة، عضو فريق): قراءة فقط، والتحرير من «الفريق والمجموعات» في الدفعة
function Assignments({ list, stale = false }) {
  if (!list) return null;
  return (
    <section className="la-card ex-assign" aria-labelledby="ex-assign-h">
      <h4 id="ex-assign-h">تكليفاته</h4>
      {stale && <p className="la-muted">لا يخدم في الرحلة الآن، فهذه التكليفات معطّلة: لا يراها مشاركوها مستشارًا ولا يصل إليهم. أزلها من «الفريق والمجموعات» في الدفعة.</p>}
      {!list.length ? <p className="la-muted">لا تكليف له في أي دفعة. يُكلَّف من «الفريق والمجموعات» في الدفعة، أو من صفحة الجهة.</p> : (
        <ul className="la-log">{list.map((a) => (
          <li key={a.cohort_id}><b>{a.org ? `${a.org} · ` : ''}{a.cohort}</b> <span>{scopeText(a)}</span>
            {' '}<small className="la-muted">{[cohortStateAr(a), periodAr(a)].filter(Boolean).join(' · ')}</small></li>
        ))}</ul>
      )}
    </section>
  );
}

// خدمتاه بجملة: مشتقة من أدواره وعضويته، لا تُخزَّن
const serviceAr = (e) => {
  const s = expertService(e);
  const cs = (e.committees || []).map((k) => COMMITTEE_AR[k]).filter(Boolean).join(' و');
  if (s.journey && s.content) return `يخدم في الرحلة وفي ${cs}`;
  if (s.content) return `عضو ${cs}، يقرأ الكتاب الأم ولا يخدم في الرحلة`;
  if (s.journey) return 'يخدم في رحلة المشاركين';
  return 'لم تُحدَّد خدمته بعد';
};
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
          <small className="la-muted">{e.source === 'admin' ? 'أضافته الإدارة' : committeeApplication(e) ? CONTENT_TRACK_AR : 'طلب انضمام'} · {date(e.created_at)}{e.approved_at ? ` · اعتُمد ${date(e.approved_at)}` : ''}</small>
          {/* طلب عضوية لجنة من «انضم كخبير محتوى»: اللجنة والإطار في سطر، والاعتماد يرسل دعوة بوابة الكتاب بتعهد السرية */}
          {committeeApplication(e) && <p className="ex-app"><span className="la-chip warn">{CONTENT_TRACK_AR}</span> {committeeApplicationAr(e)}</p>}
        </div>
        <div className="ex-side">
          <ExpertChip status={e.status} />
          <span className="la-chip">{serviceAr(e)}</span>
          {canWrite && <div className="la-row">{(NEXT[e.status] || []).map(([to, l, tone]) => <button key={to} className={`btn-sm ${tone}`} onClick={() => move(to, l)}>{l}</button>)}
            {['applied', 'invited', 'active', 'paused'].includes(e.status) && <button className="btn-sm ghost" onClick={async () => { const r = await L('admin.expert-invite', { id: e.id }); toast(r.success ? 'أُرسلت الدعوة' : r.message); if (r.success) load(); }}>إرسال دعوة</button>}</div>}
        </div>
      </section>
      {/* عضو اللجنة بلا دور: لا تكليف ولا خدمات ولا تقييم ولا تكلفة في ملفه، فهي للرحلة. وتكليف بقي له من قبل يظهر لتُزيله الإدارة */}
      {contentOnly(e) && (d.assignments || []).length > 0 && <Assignments list={d.assignments} stale />}
      {!contentOnly(e) && <>
        <Assignments list={d.assignments} />
        <Service s={d.service} rate={e.hourly_rate} />
        <Ratings r={d.ratings} />
      </>}
      <ExpertForm key={e.updated_at} initial={e} canWrite={canWrite} onSaved={load} />
      <section className="la-card"><h4>السجل</h4>
        <ul className="la-log">{d.activity.length ? d.activity.map((x, i) => <li key={i}><small>{date(x.created_at)}</small> {ACT[x.action.replace('expert.', '')] || x.action} <small className="la-muted">{x.actor}</small></li>) : <li className="la-muted">لا شيء</li>}</ul>
      </section>
    </div>
  );
}

// أعمدة الفرز: القيمة التي يُرتَّب بها كل عمود
const SORTS = { name: (e) => e.full_name, hours: (e) => e.weekly_hours, given: (e) => e.stats?.hours || null, status: (e) => EXPERT_STATUS[e.status] };
const roleLabels = Object.fromEntries(ROLES.map(([k, [l]]) => [k, l]));
const EXPERT_COLS = [
  // البريد والجوال غير مختارين افتراضيًا (sensitive)، كالمشاركين: يُصدَّران إن اختارهما المدير صراحة
  { key: 'name', label: 'الخبير', width: 26, get: (e) => e.full_name }, { key: 'email', label: 'البريد', width: 30, sensitive: true, get: (e) => e.email },
  { key: 'phone', label: 'الجوال', width: 18, sensitive: true, get: (e) => e.phone },
  { key: 'title', label: 'المسمى', width: 26, get: (e) => e.title }, { key: 'roles', label: 'الأدوار', width: 24, get: (e) => (e.roles || []).map((k) => roleLabels[k] || k) },
  { key: 'dims', label: 'الأبعاد', width: 24, get: (e) => (e.dimensions || []).map((k) => DIM_AR[k] || k) },
  { key: 'levels', label: 'المستويات', width: 20, get: (e) => (e.levels || []).map((k) => LEVEL_AR[k] || k) },
  { key: 'committees', label: 'اللجان', width: 20, get: (e) => (e.committees || []).map((k) => COMMITTEE_AR[k] || k) },
  { key: 'sectors', label: 'القطاعات', width: 24, get: (e) => e.sectors || [] },
  { key: 'hours', label: 'ساعات أسبوعيًا', width: 14, get: (e) => e.weekly_hours },
  { key: 'given', label: 'ساعات قدّمها', width: 14, get: (e) => e.stats?.hours || 0 }, { key: 'served', label: 'مشاركون خدمهم', width: 14, get: (e) => e.stats?.participants || 0 },
  { key: 'status', label: 'الحالة', width: 14, get: (e) => EXPERT_STATUS[e.status] }, { key: 'joined', label: 'أُضيف', width: 16, get: (e) => date(e.created_at) },
];

// الشبكة بعد رابط لعرض اللوحة: عرض اللوحة يُرفع منها، وتعود فلاتر الجلسة التي تركها المدير (وعرضها إن كان للشبكة)
export function gridAfterBoardLink(state, kept) {
  const k = kept || {};
  const back = Object.fromEntries(Object.keys(state).filter((key) => k[key] != null).map((key) => [key, String(k[key])]));
  return { ...state, ...back, view: PRESETS.some((p) => p.key === k.view) ? k.view : '' };
}

// تبويبا الشاشة (المرحلة 16): الطلبات والشبكة، والتبويب في الرابط ?tab=requests|network
export const EXPERT_TABS = ['requests', 'network'];
// التبويب الظاهر: الصريح في الرابط، ثم رابط «ينتظرني» (?view=attention) يفتح الطلبات، ثم الطلبات إن كان فيها ما يحتاج
// تدخلًا وإلا الشبكة. null ما دامت الطلبات لم تُحمَّل ولا صريح (لا قفز قبل معرفة الرقم). الافتراضي لا يُكتب في الرابط
// تعذّر تحميل الطلبات (failed) يفتح الطلبات لتظهر رسالة الخطأ، لا الشبكة كأن لا شيء يحتاج تدخلًا
export function expertTab({ tab = '', reqView = '', attention = null, failed = false } = {}) {
  if (EXPERT_TABS.includes(tab)) return tab;
  if (reqView || failed) return 'requests';
  if (attention == null) return null;
  return attention > 0 ? 'requests' : 'network';
}
// الطاقة غير المحددة: حقل مخفي في شريط الشبكة يبلغه رابط «لم تُحدد ساعات متاحة»
const noCapacity = (e) => e.weekly_hours == null || e.weekly_hours === '';
const CAP_FIELD = { key: 'cap', label: 'الطاقة', hidden: true, get: (e) => (noCapacity(e) ? 'none' : 'set'), options: [['none', 'لم تُحدد طاقته']] };

// شريط اللجان (المرحلة 16): اسم اللجنة وعدد أعضائها وشارة اكتمالها ونص فجواتها. لجنة بلا أعضاء تظهر بـEmpty وفعل واحد
// لمن يكتب يفتح نموذج الخبير ولجنتها محددة، فيبقى committees في ملف الخبير المصدر الواحد للعضوية
function Committees({ list, canWrite, onAdd, onShow }) {
  if (!list?.length) return null;
  return (
    <section className="ex-committees" aria-label="اللجان">
      <h3 className="ex-committees-h">اللجان</h3>
      <ul className="ex-committees-list">{list.map((c) => (
        <li key={c.key} className="la-card ex-committee">
          <div className="la-row between"><b>{c.title}</b><StatusChip status={c.ready ? 'ready' : 'gaps'} labels={COMMITTEE_STATE} tones={COMMITTEE_STATE_TONE} /></div>
          {c.members.length ? (
            <button type="button" className="la-link" onClick={() => onShow(c.key)}>{countAr(c.members.length)}</button>
          ) : (
            <Empty compact title={c.gaps?.[0] || 'لا أعضاء بعد'}>{canWrite && <button type="button" className="btn-sm primary" onClick={() => onAdd(c.key)}>أضف عضوًا</button>}</Empty>
          )}
          {c.members.length > 0 && !c.ready && c.gaps?.length > 0 && <small className="la-muted ex-gaps">{c.gaps.join('، ')}</small>}
        </li>
      ))}</ul>
    </section>
  );
}
const countAr = (n) => (n === 1 ? 'عضو واحد' : n === 2 ? 'عضوان' : n <= 10 ? `${n} أعضاء` : `${n} عضوًا`);

export default function Experts({ canWrite, expertId, onOpen, onPerson }) {
  const [d, setD] = useState(null);
  const [reqs, setReqs] = useState(null);
  const [adding, setAdding] = useState(null);
  // رابط «ينتظرني» (?view=attention) يفتح لوحة طلبات الإسناد على عرضه. يُقرأ قبل شريط الشبكة الذي يقرأ العنوان نفسه
  // وما تركه المدير في شبكة الخبراء يُحفظ قبل أن يكتب الشريط حالة الرابط فوقه، فيعود إليها
  const [entry] = useState(() => { const view = requestView(readQuery()); return { view, kept: view ? recallState('experts') : null }; });
  const reqView = entry.view;
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'role', 'dim', 'level', 'source', 'committee', 'cap', 'sort', 'tab'], {}, { scope: 'experts' });
  // عرض اللوحة ليس عرضًا للشبكة: لا يبقى في شريطها ولا في عنوانها، والتبويب المتروك لا يغلب رابط «ينتظرني»
  useEffect(() => { if (f.view && !PRESETS.some((p) => p.key === f.view)) replaceF((s) => ({ ...gridAfterBoardLink(s, entry.kept), tab: '' })); }, []); // eslint-disable-line
  const load = useCallback(async () => setD(await L('admin.experts')), []);
  const loadReqs = useCallback(async () => setReqs(await L('admin.expert-requests')), []);
  useEffect(() => { if (!expertId) { load(); loadReqs(); } }, [load, loadReqs, expertId]);
  const all = d?.experts || [];
  const fields = useMemo(() => [
    { key: 'role', label: 'الأدوار', get: (e) => e.roles, options: ROLES.map(([k, [l]]) => [k, l]) },
    { key: 'dim', label: 'الأبعاد', get: (e) => e.dimensions, options: Object.entries(DIM_AR) },
    { key: 'level', label: 'المستويات', get: (e) => e.levels, options: Object.entries(LEVEL_AR) },
    { key: 'source', label: 'المصادر', get: (e) => e.source, options: [['application', 'طلب انضمام'], ['admin', 'أضافته الإدارة']] },
    { key: 'committee', label: 'اللجان', get: (e) => e.committees || [], options: Object.entries(COMMITTEE_AR) },
    CAP_FIELD,
  ], []);
  // التبويب ليس فلترًا: لا يدخل التصفية ولا «امسح الكل»
  const filt = useMemo(() => ({ ...f, tab: '' }), [f]);
  const rows = useMemo(() => sortRows(applyFilters(all, { fields, presets: PRESETS, text: (e) => [e.full_name, e.email, e.title, ...(e.sectors || [])].join(' ') }, filt), SORTS, f.sort), [all, filt, fields, f.sort]);
  const counts = useMemo(() => presetCounts(all, PRESETS), [all]);
  const attention = reqs?.success ? attentionCount(reqs.requests) : null;
  const tab = expertTab({ tab: f.tab, reqView, attention, failed: !!reqs && !reqs.success });

  if (expertId) return <Profile id={expertId} canWrite={canWrite} onBack={() => onOpen(null)} />;
  const active = all.filter((e) => e.status === 'active');
  // خبراء الرحلة وحدهم في العدّ، وأعضاء اللجان بلا دور سطرٌ تحته
  const journeyActive = active.filter((e) => (e.roles || []).length);
  const hours = active.reduce((a, e) => a + (Number(e.weekly_hours) || 0), 0);
  const given = Math.round(all.reduce((a, e) => a + (e.stats?.hours || 0), 0) * 10) / 10;
  const pickTab = (t) => setF({ tab: t });
  const tabKey = (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const i = EXPERT_TABS.indexOf(tab);
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? EXPERT_TABS.length - 1 : (i + (ev.key === 'ArrowLeft' ? 1 : -1) + EXPERT_TABS.length) % EXPERT_TABS.length;
    pickTab(EXPERT_TABS[next]);
    ev.currentTarget.querySelector(`#ex-tab-${EXPERT_TABS[next]}`)?.focus();
  };
  const toNetwork = (patch) => { setF({ ...patch, tab: 'network' }); };
  const clearNet = () => { const t = f.tab; clearF(); if (t) setF({ tab: t }); };
  const v = (x) => (d ? x : <Missing state="loading" />);
  const TAB_TEXT = {
    requests: `طلبات الإسناد${attention != null ? ` (${attention} يحتاج تدخلًا)` : ''}`,
    network: `شبكة الخبراء${d?.success ? ` (${all.length})` : ''}`,
  };
  return (
    <div className="ex">
      {/* صف الأرقام (المرحلة 16): أربع بطاقات بالبطاقة الموحدة، واللجنتان خرجتا إلى شريطهما لأنهما قائمتا أسماء */}
      <div className="stats-grid ex-stats">
        <div className="stat-card"><div className="stat-label">خبراء نشطون</div><div className="stat-value s-replied">{v(journeyActive.length)}</div>
          {d && <div className="stat-sub">من {all.length} في الشبكة{active.length > journeyActive.length ? ` · أعضاء لجان بلا دور: ${active.length - journeyActive.length}` : ''}</div>}</div>
        <div className="stat-card"><div className="stat-label">طلبات بانتظارك</div><div className="stat-value s-new">{v(counts.applied)}</div><div className="stat-sub">طلب انضمام</div></div>
        <div className="stat-card"><div className="stat-label">ساعات مقدّمة</div>
          {!d ? <div className="stat-value"><Missing state="loading" /></div> : hours > 0 ? (
            <><div className="stat-value">{given}</div><div className="stat-sub"><Meter value={given} max={hours} label="ساعات مقدّمة من المتاحة أسبوعيًا" unit="ساعة" /></div></>
          ) : (
            <><div className="stat-value">{given}</div><div className="stat-sub">لم تُحدد ساعات متاحة · <button type="button" className="la-link" onClick={() => toNetwork({ cap: 'none' })}>اعرض من لم تُحدد طاقته</button></div></>
          )}</div>
        <div className="stat-card ex-cover"><div className="stat-label">التغطية بالأدوار</div>
          {d ? <div className="ex-cover-list">{ROLES.map(([k, [l]]) => <span key={k}><b>{active.filter((e) => (e.roles || []).includes(k)).length}</b>{l}</span>)}</div> : <Missing state="loading" />}</div>
      </div>
      {/* لجنتا المحتوى والقياس من سجل الخبراء نفسه (committees.js): العدد والاكتمال وما ينقص */}
      <Committees list={d?.committees} canWrite={canWrite} onShow={(k) => toNetwork({ committee: k })}
        onAdd={(k) => { setAdding({ committees: [k] }); setF({ tab: 'network' }); }} />

      <div className="la-subtabs ex-tabs" role="tablist" aria-label="أقسام الخبراء" aria-busy={!tab} onKeyDown={tabKey}>
        {EXPERT_TABS.map((t) => (
          <button key={t} id={`ex-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls={`ex-panel-${t}`} tabIndex={tab === t ? 0 : -1}
            className={tab === t ? 'on' : ''} onClick={() => pickTab(t)}>{TAB_TEXT[t]}</button>
        ))}
      </div>
      {!tab && <div role="status" aria-live="polite"><Spinner /></div>}
      <div id="ex-panel-requests" role="tabpanel" aria-labelledby="ex-tab-requests" hidden={tab !== 'requests'}>
        {tab === 'requests' && <RequestsBoard canWrite={canWrite} onPerson={onPerson} view={reqView} data={reqs} onReload={loadReqs} />}
      </div>
      <div id="ex-panel-network" role="tabpanel" aria-labelledby="ex-tab-network" hidden={tab !== 'network'}>
        {tab === 'network' && (<>
          {adding && <ExpertForm isNew initial={adding} canWrite={canWrite} onCancel={() => setAdding(null)} onSaved={(e) => { setAdding(null); onOpen(e.id); }} />}
          <section className="la-card">
            <div className="la-row between"><h3>شبكة الخبراء</h3>{canWrite && !adding && <button className="btn-sm primary" onClick={() => setAdding({})}>+ خبير</button>}</div>
            <><p className="la-muted">ينضم الخبير بدعوة أو بطلب، ولا يُسند إليه شيء قبل اعتماده.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>ينضم الخبير بدعوة منك أو بطلب من صفحة «انضم كخبير» بمساريها: خبير الرحلة، وخبير المحتوى (طلب عضوية لجنة). لا يُسند إليه شيء ولا يُفتح له الكتاب قبل اعتماده.</p></details></>
            {!d ? <Spinner /> : !d.success ? <LoadError message={d.message} onRetry={load} /> : <>
              <FilterBar scope="experts" state={filt} set={setF} clear={clearNet} replace={(n) => replaceF(typeof n === 'function' ? (s) => ({ ...n(s), tab: s.tab }) : { ...n, tab: f.tab })} fields={fields} presets={PRESETS} counts={counts}
                shown={rows.length} total={all.length} noun="خبير" placeholder="ابحث بالاسم أو البريد أو المسمى أو القطاع"
                capped={d.capped ? { limit: d.limit } : null}
                actions={<ExportButton scope="experts" meta={{ kind: 'EXP', title: 'شبكة الخبراء', sheet: 'الخبراء', file: 'Experts' }} columns={EXPERT_COLS} all={all} filtered={rows} noun="خبير" />} />
              {!all.length ? <Empty title="لا خبراء بعد" hint="أضف أول خبير، أو شارك رابط «انضم كخبير»." /> : (
                <div className="table-wrap"><table className="data-table la-cards ex-table t24">
                  <thead><tr><SortTh k="name" state={f} set={setF}>الخبير</SortTh><th>الأدوار</th><th>الأبعاد</th><SortTh k="hours" state={f} set={setF}>الطاقة</SortTh><SortTh k="given" state={f} set={setF}>ما قدّمه</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh></tr></thead>
                  <tbody>{rows.length ? rows.map((e) => (
                    <tr key={e.id} className="la-click" tabIndex={0} onClick={() => onOpen(e.id)} onKeyDown={(k) => { if (k.key === 'Enter') onOpen(e.id); }}>
                      <td data-label="الخبير"><b>{e.full_name}</b><br /><small className="la-muted">{e.title || e.email}</small>
                        {e.status === 'applied' && committeeApplication(e) && <><br /><span className="la-chip warn" title={committeeApplicationAr(e)}>{CONTENT_TRACK_AR}</span> <small className="la-muted">{committeeApplicationAr(e)}</small></>}</td>
                      <td data-label="الأدوار">{contentOnly(e) ? <span className="la-chip">عضو لجنة، لا يخدم في الرحلة</span> : <Chips list={e.roles} labels={Object.fromEntries(ROLES.map(([k, [l]]) => [k, l]))} />}
                        {expertService(e).journey && expertService(e).content && <><br /><span className="la-chip ok">يخدم أيضًا في {(e.committees || []).map((k) => COMMITTEE_AR[k]).filter(Boolean).join(' و')}</span></>}
                        {e.committees?.length > 0 && <><br /><Chips list={e.committees} labels={COMMITTEE_AR} /></>}</td>
                      <td data-label="الأبعاد"><Chips list={e.dimensions} labels={DIM_AR} /></td>
                      <td data-label="الطاقة">{!noCapacity(e) ? `${e.weekly_hours} س/أسبوع` : <Missing reason="لم تُحدد طاقته" />}</td>
                      <td data-label="ما قدّمه">{e.stats?.attended ? `${e.stats.hours} ساعة · ${e.stats.participants} مشارك` : <Missing state="later" text="لم يقدّم بعد" />}</td>
                      <td data-label="الحالة"><ExpertChip status={e.status} /></td>
                    </tr>
                  )) : <tr><td colSpan={6}><NoMatch what="خبراء" /></td></tr>}</tbody>
                </table></div>
              )}
            </>}
          </section>
        </>)}
      </div>
    </div>
  );
}
