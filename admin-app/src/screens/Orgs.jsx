// ════════════════════════════════════════════════════════════════
// الجهات: البطاقات، ولوحة الجهة بمصادرها ومشاركيها وتقريرها
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import OrgFinance from './OrgFinance.jsx';
import {
  date, domainsOf, FUNNEL, inviteUrl, L, orgColor, STATUS, validCampaign, VIA,
} from '../leaders.js';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts, sortRows } from '../filters.js';
import { Empty, NoMatch, SectionIndex, Spinner, useUI } from '../ui.jsx';
import { OrgSelect } from './Participants.jsx';
import OrgForm from './OrgForm.jsx';
import CoordinatorPanel from './CoordinatorPanel.jsx';
import OrgTeam from './OrgTeam.jsx';
import OrgJourney from './OrgJourney.jsx';


export function Funnel({ f, big }) {
  const top = Math.max(1, f.registered || 0);
  return (
    <div className={`la-funnel${big ? ' big' : ''}`}>{FUNNEL.map(([k, l]) => (
      <div key={k} className="la-fn"><span className="la-fn-l">{l}</span><span className="la-fn-bar"><i style={{ width: `${(((f[k] || 0) / top) * 100).toFixed(1)}%` }} /></span><b>{f[k] || 0}</b></div>
    ))}</div>
  );
}
function Seats({ n, seats }) {
  return (
    <div className="la-seats">
      <div className="la-row between"><span>{seats ? 'المقاعد' : 'المشاركون'}</span><b>{n}{seats ? <small> / {seats}</small> : null}</b></div>
      {seats ? <span className="la-fn-bar"><i style={{ width: `${Math.min(100, (n / seats) * 100).toFixed(1)}%` }} /></span> : null}
    </div>
  );
}

function useCopy() {
  const { toast, prompt } = useUI();
  return async (text, ok) => {
    try { await navigator.clipboard.writeText(text); toast(ok); } catch { await prompt('انسخ الرابط:', text); }
  };
}

const ORG_PRESETS = [
  { key: 'waiting', label: 'لديها ما ينتظر اعتمادك', test: (o) => o.stats.pending_approval > 0 },
  { key: 'quiet', label: 'بلا نشاط هذا الأسبوع', test: (o) => o.stats.total > 0 && !o.stats.active_week },
  { key: 'full', label: 'اكتملت مقاعدها', test: (o) => o.seats && o.stats.total >= o.seats },
  { key: 'empty', label: 'بلا مشاركين', test: (o) => !o.stats.total },
  { key: 'off', label: 'موقوفة', test: (o) => o.status === 'inactive' },
  { key: 'no-coord', label: 'منسقها لم يدخل بعد', test: (o) => o.status !== 'inactive' && ['none', 'contact', 'invited', 'lapsed'].includes(o.access?.state) },
];

// حالة منسق الجهة على بطاقتها (orgAccessState في الخادم): ما لم يدخل المنسق، تظهر الحالة وما يُفعل
const ACCESS = {
  none: ['warn', 'بلا منسق'],
  contact: ['warn', 'المنسق بلا حساب: لم تصله دعوة'],
  invited: ['warn', 'دُعي المنسق ولم يدخل بعد'],
  lapsed: ['', 'حساب المنسق موقوف أو منتهٍ'],
};
function AccessLine({ o, canWrite, onEdit, toast }) {
  const a = o.access;
  if (!a || a.state === 'active' || o.status === 'inactive') return null;
  const [tone, label] = ACCESS[a.state] || ['', ''];
  const resend = async () => {
    const r = await L('admin.coordinator-invite', { organization_id: o.id, id: a.id });
    toast(r.success ? `أُعيدت الدعوة إلى ${a.email}` : r.message);
  };
  return (
    <div className="la-row la-org-access">
      <span className={`la-chip ${tone}`}>{label}{a.state === 'invited' && a.invited_at ? ` · ${date(a.invited_at)}` : ''}</span>
      {canWrite && (a.state === 'invited'
        ? <button className="la-link" onClick={resend}>أعد الدعوة</button>
        : <button className="la-link" onClick={() => onEdit(o)}>{a.state === 'contact' ? 'فعّل الحساب وأرسل الدعوة' : 'أضف المنسق'}</button>)}
    </div>
  );
}

// الجهات بطاقات لا جدول، فالترتيب من قائمة في الشريط
const ORG_SORTS = { name: (o) => o.name, total: (o) => o.stats?.total || 0, pending: (o) => o.stats?.pending_approval || 0, active: (o) => o.stats?.active_week || 0 };

function OrgCards({ data, canWrite, onOpen, onEdit, onAdd, reload }) {
  const { toast, confirm } = useUI();
  const copy = useCopy();
  const list = data.orgs || [];
  const un = data.unassigned || {};
  const [typedTo, setTypedTo] = useState({});
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'sector', 'state', 'sort'], {}, { scope: 'orgs' });
  const fields = useMemo(() => [
    { key: 'sector', label: 'القطاعات', get: (o) => o.sector || '', options: [...new Set(list.map((o) => o.sector).filter(Boolean))].sort().map((x) => [x, x]) },
    { key: 'state', label: 'الحالات', get: (o) => (o.status === 'inactive' ? 'inactive' : 'active'), options: [['active', 'نشطة'], ['inactive', 'موقوفة']] },
  ], [list]);
  const shown = useMemo(() => sortRows(applyFilters(list, { fields, presets: ORG_PRESETS, text: (o) => [o.name, o.short_name, o.sector, o.contact_name, o.contact_email, ...domainsOf(o)].join(' ') }, f), ORG_SORTS, f.sort), [list, f, fields]);
  const counts = useMemo(() => presetCounts(list, ORG_PRESETS), [list]);
  const total = list.reduce((a, o) => a + o.stats.total, 0) + (un.total || 0);
  const seats = list.reduce((a, o) => a + (o.seats || 0), 0);
  const filled = list.reduce((a, o) => a + (o.seats ? o.stats.total : 0), 0);

  // الجهة يختارها المدير صراحةً (لا أول جهة في القائمة)، ويؤكد الربط باسمها وعدد من يُنقلون
  const linkTyped = async (t) => {
    const org = list.find((o) => o.id === typedTo[t.name]);
    if (!org) return toast('اختر الجهة');
    if (!(await confirm(`ربط ${t.n} مشارك كتبوا «${t.name}» بجهة «${org.name}»؟ يُنسبون إليها، ويُثبَّت لهم إعفاء رعايتها إن كانت ترعى مشاركيها.`))) return;
    const r = await L('admin.assign-org', { typed_name: t.name, organization_id: org.id });
    toast(r.success ? `رُبط ${r.moved} مشارك` : r.message);
    if (r.success) reload();
  };

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">الجهات</div><div className="stat-value">{list.length}</div><div className="stat-sub">{list.filter((o) => o.status !== 'inactive').length} نشطة</div></div>
        <div className="stat-card"><div className="stat-label">المشاركون</div><div className="stat-value">{total}</div><div className="stat-sub">من كل الجهات</div></div>
        <div className="stat-card"><div className="stat-label">المقاعد المشغولة</div><div className="stat-value s-replied">{filled}<small> / {seats || '·'}</small></div><div className="stat-sub">من المتعاقد عليه</div></div>
        <div className="stat-card"><div className="stat-label">بدون جهة</div><div className="stat-value s-new">{un.total || 0}</div><div className="stat-sub">اربطهم بجهاتهم</div></div>
      </div>
      <div className="la-row between la-tracks-bar">
        <p className="la-muted">يُنسب المشارك لجهته تلقائيًا إن جاء برابطها أو من موقعها، ويبقى الانتساب محفوظًا 30 يومًا حتى يسجّل.</p>
        {canWrite && <button className="btn-sm primary" onClick={onAdd}>+ جهة جديدة</button>}
      </div>
      <FilterBar scope="orgs" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={ORG_PRESETS} counts={counts}
        shown={shown.length} total={list.length} noun="جهة" placeholder="ابحث باسم الجهة أو القطاع أو النطاق أو جهة التواصل"
        sorts={[['', 'الترتيب: الأحدث'], ['name', 'بالاسم'], ['-total', 'الأكثر مشاركين'], ['-pending', 'الأكثر انتظارًا لاعتمادك'], ['-active', 'الأنشط هذا الأسبوع']]} />
      {!shown.length && (list.length
        ? <NoMatch what="جهات" />
        : <Empty title="لا جهات بعد" hint="الجهة ترعى مشاركيها: لها رابط دعوة ومقاعد ومنسق يتابعهم.">{canWrite && <button className="btn-sm primary" type="button" onClick={onAdd}>+ جهة جديدة</button>}</Empty>)}
      <div className="la-orgs">
        {shown.map((o) => (
          <article key={o.id} className={`la-org${o.status === 'inactive' ? ' off' : ''}`} style={{ '--org': orgColor(o) }}>
            <header onClick={() => onOpen(o.id)} style={{ cursor: 'pointer' }}>
              <span className="la-org-mark">{(o.short_name || o.name).slice(0, 2)}</span>
              <div><b>{o.name}</b><small>{o.sector}{o.status === 'inactive' ? ' · موقوفة' : ''}</small></div>
            </header>
            {domainsOf(o).length > 0 && <div className="la-domains">{domainsOf(o).map((d) => <span key={d} dir="ltr">{d}</span>)}</div>}
            <Seats n={o.stats.total} seats={o.seats} />
            <Funnel f={o.stats} />
            <AccessLine o={o} canWrite={canWrite} onEdit={onEdit} toast={toast} />
            <div className="la-org-foot">
              {o.stats.pending_approval ? <span className="la-chip warn">{o.stats.pending_approval} بانتظار اعتمادك</span> : <span className="la-chip ok">لا شيء ينتظرك</span>}
              <span className="la-muted">{o.stats.active_week} نشط هذا الأسبوع</span>
            </div>
            <div className="la-row la-org-acts">
              <button className="btn-sm primary" onClick={() => onOpen(o.id)}>لوحة الجهة</button>
              <button className="btn-sm ghost" onClick={() => copy(inviteUrl(o), 'نُسخ رابط الدعوة')}>نسخ رابط الدعوة</button>
              {canWrite && <button className="la-link" onClick={() => onEdit(o)}>تحرير</button>}
            </div>
          </article>
        ))}
        <article className="la-org none" style={{ '--org': 'var(--brand-muted-faint)' }}>
          <header onClick={() => onOpen('none')} style={{ cursor: 'pointer' }}><span className="la-org-mark">؟</span><div><b>بدون جهة</b><small>سجّلوا دون رابط جهة</small></div></header>
          <Seats n={un.total || 0} />
          {(un.typed || []).length ? (
            <div className="la-typed"><small className="la-muted">ما كتبوه في خانة الجهة، اربطه بنقرة:</small>
              {un.typed.map((t) => (
                <div key={t.name} className="la-row between"><span>{t.name} <small className="la-muted">{t.n}</small></span>
                  {canWrite && list.length > 0 && (
                    <span className="la-row">
                      <select aria-label={`جهة ${t.name}`} value={typedTo[t.name] || ''} onChange={(e) => setTypedTo({ ...typedTo, [t.name]: e.target.value })}>
                        <option value="">اختر جهة…</option>
                        {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <button className="la-link" disabled={!typedTo[t.name]} onClick={() => linkTyped(t)}>ربط</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="la-muted">كل المشاركين مربوطون بجهاتهم.</p>}
          <div className="la-row la-org-acts"><button className="btn-sm ghost" onClick={() => onOpen('none')}>عرض القائمة</button></div>
        </article>
      </div>
    </>
  );
}

function Sources({ d, total }) {
  const Bars = ({ obj, label = (k) => k, ltr }) => {
    const list = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!list.length) return <p className="la-muted">لا بيانات بعد.</p>;
    return <div className="la-funnel">{list.map(([k, n]) => (
      <div key={k} className="la-fn"><span className="la-fn-l" dir={ltr ? 'ltr' : undefined}>{label(k)}</span>
        <span className="la-fn-bar"><i style={{ width: `${((n / Math.max(1, total)) * 100).toFixed(1)}%` }} /></span><b>{n}</b></div>
    ))}</div>;
  };
  return (
    <section className="la-card"><h3>مصادر الانضمام</h3><div className="la-sources">
      <div><h4>طريقة الانتساب</h4><Bars obj={d.by_via} label={(k) => VIA[k] || k} /></div>
      <div><h4>الحملات</h4><Bars obj={d.by_campaign} ltr /></div>
      <div><h4>المواقع المُحيلة</h4><Bars obj={d.by_site} ltr /></div>
    </div></section>
  );
}

// فهرس صفحة الجهة: ما ليس للجهة (كصفحة «بدون جهة») يُخفى من الفهرس تلقائيًا
const ORG_SECTIONS = [['org-journey', 'الرحلة والدفعة'], ['org-team', 'الفريق'], ['org-coordinator', 'منسق الجهة'], ['org-sources', 'مصادر الانتساب'], ['org-finance', 'الرعاية والتكلفة'], ['org-tracks', 'المسارات'], ['org-members', 'المشاركون']];
const MEMBER_SORTS = { name: (p) => p.full_name, title: (p) => p.job_title, track: (p) => p.track, status: (p) => STATUS[p.status] || p.status, seen: (p) => p.last_login_at, joined: (p) => p.created_at };

function OrgView({ id, orgs, canWrite, onBack, onPerson, onEdit }) {
  const { toast, confirm } = useUI();
  const copy = useCopy();
  const [d, setD] = useState(null);
  // قائمة داخل صفحة الجهة ولها عنوانها، فلا يكتب شريطها في العنوان
  const [f, setF, clearF, replaceF] = useFilters(['q', 'status', 'track', 'sort'], {}, { scope: 'org-members', url: false });
  const [campaign, setCampaign] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [moveTo, setMoveTo] = useState('');

  const load = useCallback(async () => { setD(null); setD(await L('admin.org', { id })); }, [id]);
  useEffect(() => { load(); }, [load]);

  const all = d?.participants || [];
  const memberFields = useMemo(() => [
    { key: 'status', label: 'الحالات', aria: 'الحالة', get: (p) => p.status, options: Object.entries(STATUS) },
    { key: 'track', label: 'المسارات', aria: 'المسار', get: (p) => p.track, options: [...new Set(all.map((p) => p.track).filter(Boolean))].sort().map((k) => [k, k]) },
  ], [all]);
  const rows = useMemo(() => sortRows(applyFilters(all, { fields: memberFields, text: (p) => [p.full_name, p.email, p.job_title].join(' ') }, f), MEMBER_SORTS, f.sort), [all, f, memberFields]);

  if (!d) return <div className="la-load"><Spinner /></div>;
  if (!d.success) return <><button className="la-link" onClick={onBack}>→ كل الجهات</button><div className="la-err">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></>;

  const { org: o, funnel: fn, by_track: bt } = d;
  const isNone = o.id === 'none';
  const tracks = Object.entries(bt).sort((a, b) => b[1] - a[1]);
  const titleOf = (k) => all.find((p) => p.track === k)?.track_title || '';
  const allOn = rows.length > 0 && rows.every((p) => picked.has(p.id));

  const memberCols = [
    { key: 'name', label: 'الاسم', width: 26, get: (p) => p.full_name }, { key: 'email', label: 'البريد', width: 30, get: (p) => p.email },
    { key: 'phone', label: 'الجوال', width: 16, get: (p) => p.phone }, { key: 'title', label: 'المسمى', width: 22, get: (p) => p.job_title },
    { key: 'status', label: 'الحالة', width: 18, get: (p) => STATUS[p.status] || p.status }, { key: 'track', label: 'المسار', width: 10, get: (p) => p.track },
    { key: 'track_title', label: 'اسم المسار', width: 28, get: (p) => p.track_title }, { key: 'approved', label: 'معتمد', width: 8, get: (p) => (p.approved ? 'نعم' : 'لا') },
    { key: 'seen', label: 'آخر دخول', width: 16, get: (p) => date(p.last_login_at) }, { key: 'joined', label: 'التسجيل', width: 16, get: (p) => date(p.created_at) },
    { key: 'via', label: 'طريقة الانتساب', width: 16, get: (p) => VIA[p.org_via || 'none'] }, { key: 'campaign', label: 'الحملة', width: 14, get: (p) => p.campaign },
    { key: 'referrer', label: 'الموقع المُحيل', width: 22, get: (p) => p.referrer_host },
  ];
  const printReport = async () => {
    const win = window.open('', '_blank');
    const [{ writeDocument }, { orgReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/reports.js')]);
    const { meta, body } = orgReport(d, 'admin');
    if (!writeDocument(win, meta, body)) toast('اسمح بالنوافذ المنبثقة لعرض التقرير');
  };
  const copyCampaign = () => {
    const c = campaign.trim().toLowerCase();
    if (!validCampaign(c)) return toast('اسم الحملة: أحرف إنجليزية صغيرة وأرقام و _ أو -');
    copy(inviteUrl(o, c), 'نُسخ رابط الحملة');
  };
  const move = async () => {
    if (!moveTo) return toast('اختر الجهة');
    if (!(await confirm(`نقل ${picked.size} مشارك إلى الجهة المختارة؟`))) return;
    const r = await L('admin.assign-org', { participant_ids: [...picked], organization_id: moveTo === 'none' ? null : moveTo });
    toast(r.success ? `نُقل ${r.moved} مشارك` : r.message);
    if (r.success) { setPicked(new Set()); load(); }
  };

  return (
    <>
      <button className="la-link" onClick={onBack}>→ كل الجهات</button>
      <section className="la-org-hero" style={{ '--org': orgColor(o) }}>
        <div className="la-row between">
          <div className="la-row"><span className="la-org-mark lg">{(o.short_name || o.name).slice(0, 2)}</span>
            <div><h2>{o.name}</h2><small>{[o.sector, o.contact_name, o.contact_email].filter(Boolean).join(' · ')}</small></div></div>
          <div className="la-row">
            {!isNone && <button className="btn-sm ghost" onClick={() => copy(inviteUrl(o), 'نُسخ رابط الدعوة')}>نسخ رابط الدعوة</button>}
            <ExportButton scope="org-members" className="btn-sm ghost" meta={{ kind: 'ORG', title: `مشاركو ${o.name}`, subtitle: 'برنامج القادة', for: o.name, sheet: 'المشاركون', file: 'Organization', code: o.invite_code }}
              columns={memberCols} all={all} filtered={rows} selected={all.filter((p) => picked.has(p.id))} noun="مشارك" />
            <button className="btn-sm ghost" onClick={printReport}>تقرير الجهة</button>
            {canWrite && !isNone && <button className="btn-sm ghost" onClick={() => onEdit(orgs.find((x) => x.id === o.id) || o)}>تحرير</button>}
          </div>
        </div>
        {!isNone && (
          <div className="la-linkbar">
            <code className="la-invite" dir="ltr">{inviteUrl(o)}</code>
            {domainsOf(o).length ? <span className="la-domains">{domainsOf(o).map((x) => <span key={x} dir="ltr">{x}</span>)}</span>
              : <small>لا مواقع مرتبطة{canWrite ? '؛ أضف موقع الجهة من «تحرير» ليُنسب زوارها تلقائيًا' : ''}</small>}
            <span className="la-row la-campaign">
              <input dir="ltr" aria-label="اسم الحملة" placeholder="اسم الحملة: whatsapp, email…" maxLength={40} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
              <button className="btn-sm ghost" onClick={copyCampaign}>نسخ رابط الحملة</button>
            </span>
          </div>
        )}
        <div className="la-org-hero-grid">
          <div><Seats n={all.length} seats={o.seats} /><div className="la-org-kpis">
            <span><b>{fn.pending_approval}</b>{STATUS.pending_approval}</span><span><b>{fn.approved}</b>اعتُمد مسارهم</span>
            <span><b>{fn.completed}</b>أنهوا</span><span><b>{fn.withdrawn}</b>منسحب أو موقوف</span></div></div>
          <div><Funnel f={fn} big /></div>
        </div>
      </section>

      <SectionIndex label="أقسام صفحة الجهة" sections={ORG_SECTIONS} />
      {!isNone && <div id="org-journey"><OrgJourney key={`journey-${o.id}`} orgId={o.id} /></div>}
      {!isNone && <div id="org-team"><OrgTeam key={`team-${o.id}`} orgId={o.id} canWrite={canWrite} /></div>}
      {!isNone && <div id="org-coordinator"><CoordinatorPanel key={o.id} org={o} canWrite={canWrite} onEdit={() => onEdit(orgs.find((x) => x.id === o.id) || o)} /></div>}

      <div id="org-sources"><Sources d={d} total={all.length} /></div>
      {!isNone && <div id="org-finance"><OrgFinance id={o.id} onPerson={onPerson} /></div>}

      <section className="la-card" id="org-tracks">
        <h3>توزيع المشاركين على المسارات</h3>
        {tracks.length ? <div className="la-pills">{tracks.map(([k, n]) => (
          <button key={k} className={`la-pill${f.track === k ? ' on' : ''}`} aria-pressed={f.track === k} title={titleOf(k)} onClick={() => setF({ track: f.track === k ? '' : k })}>
            <code>{k}</code> {titleOf(k)} <b>{n}</b></button>
        ))}</div> : <p className="la-muted">لم يُسكَّن أحد من هذه الجهة بعد.</p>}
      </section>

      <section className="la-card" id="org-members">
        <FilterBar scope="org-members" state={f} set={setF} clear={clearF} replace={replaceF} fields={memberFields}
          shown={rows.length} total={all.length} noun="مشارك" placeholder="بحث بالاسم أو البريد أو المسمى…" />
        {canWrite && picked.size > 0 && (
          <div className="la-bulk"><span><b>{picked.size}</b> محدد</span>
            <OrgSelect orgs={orgs} value={moveTo} onChange={setMoveTo} all="نقل إلى جهة…" label="نقل إلى جهة" />
            <button className="btn-sm primary" onClick={move}>نقل</button></div>
        )}
        <div className="table-wrap"><table className="data-table">
          <thead><tr>
            {canWrite && <th><input type="checkbox" aria-label="تحديد الكل" checked={allOn} onChange={() => setPicked((s) => { const n = new Set(s); rows.forEach((p) => (allOn ? n.delete(p.id) : n.add(p.id))); return n; })} /></th>}
            <SortTh k="name" state={f} set={setF}>الاسم</SortTh><SortTh k="title" state={f} set={setF}>المسمى</SortTh><SortTh k="track" state={f} set={setF}>المسار</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh><SortTh k="seen" state={f} set={setF}>آخر دخول</SortTh><SortTh k="joined" state={f} set={setF}>التسجيل</SortTh>
          </tr></thead>
          <tbody>{rows.length ? rows.map((p) => (
            <tr key={p.id}>
              {canWrite && <td><input type="checkbox" aria-label={`تحديد ${p.full_name}`} checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /></td>}
              <td><button className="la-link" onClick={() => onPerson(p.id)}><b>{p.full_name}</b></button><br /><small className="la-muted" dir="ltr">{p.email}</small></td>
              <td>{p.job_title}</td>
              <td>{p.track ? <><code className="la-code">{p.track}</code> {!p.approved && <small className="la-muted">مبدئي</small>}</> : <span className="la-muted">·</span>}</td>
              <td><span className={`la-chip ${p.status === 'pending_approval' ? 'warn' : p.status === 'completed' ? 'ok' : ''}`}>{STATUS[p.status] || p.status}</span></td>
              <td>{date(p.last_login_at)}</td>
              <td>{date(p.created_at)}{p.org_via && <><br /><small className="la-muted">{VIA[p.org_via]}{p.campaign && <> · <span dir="ltr">{p.campaign}</span></>}</small></>}</td>
            </tr>
          )) : <tr><td colSpan={7}>{all.length ? <NoMatch what="مشاركين" /> : <Empty compact title="لا مشاركين في هذه الجهة بعد" hint="يظهرون هنا حين يسجّلون برابط دعوتها أو تنقلهم إليها." />}</td></tr>}</tbody>
        </table></div>
      </section>
    </>
  );
}

export default function Orgs({ data, reload, canWrite, orgId, onOpen, onPerson }) {
  const [form, setForm] = useState(null);   // null | { org?, coordinator? }
  const [ver, setVer] = useState(0);        // يعيد تحميل لوحة الجهة بعد الحفظ
  const orgs = data?.orgs || [];
  const edit = async (o) => {
    const c = o ? await L('admin.coordinator', { organization_id: o.id }) : null;
    setForm({ org: o, coordinator: c?.coordinator || null });
  };
  // saved: true بعد الحفظ، و'deleted' بعد الحذف فنعود لقائمة الجهات
  const close = (saved) => {
    setForm(null);
    if (!saved) return;
    if (saved === 'deleted') onOpen(null);
    reload(); setVer((n) => n + 1);
  };

  if (!data) return <div className="la-load"><Spinner /></div>;
  return (
    <>
      {orgId
        ? <OrgView key={`${orgId}-${ver}`} id={orgId} orgs={orgs} canWrite={canWrite} onBack={() => onOpen(null)} onPerson={onPerson} onEdit={edit} />
        : <OrgCards data={data} canWrite={canWrite} onOpen={onOpen} reload={reload} onAdd={() => edit(null)} onEdit={edit} />}
      {form && <OrgForm org={form.org} coordinator={form.coordinator} onClose={close} />}
    </>
  );
}
