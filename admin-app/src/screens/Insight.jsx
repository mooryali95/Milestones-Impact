// ════════════════════════════════════════════════════════════════
// الرؤية الشاملة: أين توقف المشاركون (بالجهة وبالدفعة)، ومقارنة الدفعات، وحِمل الخبراء، وماذا تغيّر
// ════════════════════════════════════════════════════════════════
// قراءة فقط. الحساب كله في الخادم (insight.js): لا تعريف هنا لمرحلة ولا لحِمل ولا لنص حدث.
// كل رقم في الجدول رابط إلى قائمة المشاركين بالفلتر نفسه، فالرقم وما وراءه مصدر واحد.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { dateTime, L } from '../leaders.js';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, encodeState, sortRows } from '../filters.js';
import { Empty, NoMatch, Spinner } from '../ui.jsx';
import { ACTOR_AR, CHANGE_AREAS, LOAD_AR, LOAD_TONE, PIPELINE, PIPELINE_AR, stageFilter, STUCK_STAGES, WAITING_STAGES } from '../../../supabase/functions/leaders-api/insight.js';
import { EXPERT_ROLE_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { COHORT_STATUS as COHORT_STATUS_AR } from '../methodology.js';

const VIEWS = [['org', 'بالجهة'], ['cohort', 'بالدفعة'], ['experts', 'حِمل الخبراء'], ['changes', 'ماذا تغيّر']];
const tone = (stage) => (STUCK_STAGES.includes(stage) ? 'stuck' : WAITING_STAGES.includes(stage) ? 'wait' : stage === 'out' ? 'out' : 'ok');
const listHref = (group, key, stage) => `#/leaders/participants?${encodeState({ ...(key === 'all' ? {} : { [group]: key }), ...(stage ? stageFilter(stage) : {}) })}`;

// جدول المراحل: صف لكل جهة أو دفعة، وعمود لكل مرحلة، والخانة رابط إلى أصحابها
function Pipeline({ data, group, noun, extra }) {
  const [f, setF] = useFilters(['sort'], {}, { scope: `insight-${group}`, url: false });
  const sorts = useMemo(() => ({ name: (g) => g.name, total: (g) => g.total, stuck: (g) => g.stuck, waiting: (g) => g.waiting, approved: (g) => g.approved_pct, active: (g) => g.active_pct, ...Object.fromEntries(PIPELINE.map((k) => [k, (g) => g.stages[k]])) }), []);
  const rows = sortRows(data.groups, sorts, f.sort);
  const cols = [
    { key: 'name', label: noun, width: 28, get: (g) => g.name }, { key: 'total', label: 'المشاركون', width: 12, get: (g) => g.total },
    ...PIPELINE.map((k) => ({ key: k, label: PIPELINE_AR[k], width: 16, get: (g) => g.stages[k] })),
    { key: 'approved', label: 'اعتُمد مسارهم %', width: 14, get: (g) => g.approved_pct }, { key: 'completed', label: 'أتمّوا %', width: 10, get: (g) => g.completed_pct },
    { key: 'active', label: 'نشطون هذا الأسبوع %', width: 16, get: (g) => g.active_pct },
    ...(extra || []),
  ];
  if (!data.total.total) return <Empty title="لا مشاركين بعد" hint="يظهر هنا توزيعهم على مراحل الرحلة حين يسجّل أولهم." />;
  const cell = (g, k) => (g.stages[k]
    ? <a className={`ins-n ${tone(k)}`} href={listHref(group, g.key, k)} title={`${g.stages[k]} · ${PIPELINE_AR[k]} · ${g.name}`}>{g.stages[k]}</a>
    : <span className="la-muted">·</span>);
  return (
    <>
      <div className="la-row between ins-bar">
        <p className="la-muted">كل رقم يفتح أصحابه في قائمة المشاركين. <span className="ins-key stuck">ينتظر المشارك</span> <span className="ins-key wait">ينتظر الإدارة</span></p>
        <ExportButton scope={`insight-${group}`} className="btn-sm ghost" meta={{ kind: 'INS', title: `أين توقف المشاركون ${group === 'org' ? 'بالجهة' : 'بالدفعة'}`, sheet: 'المراحل', file: group === 'org' ? 'Pipeline-Orgs' : 'Pipeline-Cohorts' }} columns={cols} all={data.groups} noun={noun} />
      </div>
      <div className="table-wrap"><table className="data-table ins-table">
        <thead><tr>
          <SortTh k="name" state={f} set={setF}>{noun}</SortTh><SortTh k="total" state={f} set={setF}>المشاركون</SortTh>
          {PIPELINE.map((k) => <SortTh key={k} k={k} state={f} set={setF} className={`ins-h ${tone(k)}`}>{PIPELINE_AR[k]}</SortTh>)}
          <SortTh k="approved" state={f} set={setF}>اعتُمد مسارهم</SortTh><SortTh k="active" state={f} set={setF}>نشطون هذا الأسبوع</SortTh>
        </tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td><a className="la-link" href={listHref(group, g.key)}><b>{g.name}</b></a>{g.status && <><br /><small className="la-muted">{COHORT_STATUS_AR[g.status] || g.status}{g.org ? ` · ${g.org}` : ''}</small></>}</td>
              <td>{g.total}</td>
              {PIPELINE.map((k) => <td key={k}>{cell(g, k)}</td>)}
              <td>{g.approved_pct}%</td><td>{g.active_pct}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <th scope="row">{data.total.name}</th><td><b>{data.total.total}</b></td>
          {PIPELINE.map((k) => <td key={k}>{data.total.stages[k] ? <a className={`ins-n ${tone(k)}`} href={listHref(group, 'all', k)}>{data.total.stages[k]}</a> : <span className="la-muted">·</span>}</td>)}
          <td><b>{data.total.approved_pct}%</b></td><td><b>{data.total.active_pct}%</b></td>
        </tr></tfoot>
      </table></div>
    </>
  );
}

const roleAr = (r) => EXPERT_ROLE_AR[r]?.[0] || r;
const LOAD_FIELDS = [{ key: 'state', label: 'الأحمال', aria: 'الحِمل', get: (e) => e.state, options: Object.entries(LOAD_AR) }, { key: 'role', label: 'الأدوار', aria: 'الدور', get: (e) => e.roles, options: Object.entries(EXPERT_ROLE_AR).map(([k, [l]]) => [k, l]) }];
const LOAD_SORTS = { name: (e) => e.name, hours: (e) => e.hours, requests: (e) => e.requests, upcoming: (e) => e.upcoming, people: (e) => e.people, share: (e) => e.share };
const LOAD_COLS = [
  { key: 'name', label: 'الخبير', width: 26, get: (e) => e.name }, { key: 'title', label: 'المسمى', width: 26, get: (e) => e.title }, { key: 'roles', label: 'الأدوار', width: 24, get: (e) => e.roles.map(roleAr) },
  { key: 'hours', label: 'ساعات أسبوعيًا', width: 14, get: (e) => e.hours }, { key: 'requests', label: 'طلبات قائمة', width: 12, get: (e) => e.requests },
  { key: 'upcoming', label: 'جلسات قادمة', width: 12, get: (e) => e.upcoming }, { key: 'people', label: 'مشاركون يخدمهم', width: 14, get: (e) => e.people },
  { key: 'share', label: 'الحِمل %', width: 10, get: (e) => e.share }, { key: 'state', label: 'الحالة', width: 16, get: (e) => LOAD_AR[e.state] },
];
function Load({ experts, onExpert }) {
  const [f, setF, clearF, replaceF] = useFilters(['q', 'state', 'role', 'sort'], {}, { scope: 'insight-load', url: false });
  const rows = sortRows(applyFilters(experts, { fields: LOAD_FIELDS, text: (e) => [e.name, e.title].join(' ') }, f), LOAD_SORTS, f.sort);
  if (!experts.length) return <Empty title="لا خبراء نشطون" hint="يظهر هنا حِمل كل خبير معتمد: طلباته القائمة وجلساته القادمة مقابل ساعاته الأسبوعية." />;
  return (
    <>
      <p className="la-muted">الحِمل = الطلبات القائمة + الجلسات القادمة مقابل الساعات الأسبوعية، وهو العدّ نفسه الذي يرتّب به ترشيح الخبير عند الإسناد.</p>
      <FilterBar scope="insight-load" state={f} set={setF} clear={clearF} replace={replaceF} fields={LOAD_FIELDS} shown={rows.length} total={experts.length} noun="خبير" placeholder="ابحث بالاسم أو المسمى"
        actions={<ExportButton scope="insight-load" meta={{ kind: 'LOD', title: 'حِمل الخبراء', sheet: 'الحِمل', file: 'Expert-Load' }} columns={LOAD_COLS} all={experts} filtered={rows} noun="خبير" />} />
      <div className="table-wrap"><table className="data-table la-cards">
        <thead><tr><SortTh k="name" state={f} set={setF}>الخبير</SortTh><th>الأدوار</th><SortTh k="hours" state={f} set={setF}>ساعات أسبوعيًا</SortTh><SortTh k="requests" state={f} set={setF}>طلبات قائمة</SortTh><SortTh k="upcoming" state={f} set={setF}>جلسات قادمة</SortTh><SortTh k="people" state={f} set={setF}>يخدمهم</SortTh><SortTh k="share" state={f} set={setF}>الحِمل</SortTh></tr></thead>
        <tbody>{rows.length ? rows.map((e) => (
          <tr key={e.id}>
            <td data-label="الخبير"><button className="link" onClick={() => onExpert(e.id)}><b>{e.name}</b></button>{e.title && <><br /><small className="la-muted">{e.title}</small></>}</td>
            <td data-label="الأدوار">{e.roles.map(roleAr).join('، ') || '·'}</td>
            <td data-label="ساعات أسبوعيًا">{e.hours ?? '·'}</td><td data-label="طلبات قائمة">{e.requests}</td><td data-label="جلسات قادمة">{e.upcoming}</td><td data-label="يخدمهم">{e.people}</td>
            <td data-label="الحِمل">{e.share != null && <><progress className="la-mini" max={100} value={Math.min(100, e.share)} aria-label={`الحِمل ${e.share}%`} /> {e.share}% </>}<span className={`la-chip ${LOAD_TONE[e.state]}`}>{LOAD_AR[e.state]}</span></td>
          </tr>
        )) : <tr><td colSpan={7}><NoMatch what="خبراء" /></td></tr>}</tbody>
      </table></div>
    </>
  );
}

const CHANGE_COLS = [
  { key: 'at', label: 'الوقت', width: 22, get: (c) => dateTime(c.at) }, { key: 'area', label: 'المجال', width: 16, get: (c) => c.area_ar }, { key: 'text', label: 'ما حدث', width: 36, get: (c) => c.text },
  { key: 'who', label: 'المشارك', width: 26, get: (c) => c.who }, { key: 'by', label: 'من', width: 28, get: (c) => c.by }, { key: 'detail', label: 'تفصيل', width: 40, get: (c) => c.detail },
];
// سجل التدقيق كله: الفلترة على الخادم (المجال والفاعل والمدة) لأن السجل أكبر من أن يُحمَّل كله، والبحث في ما حُمّل
function Changes({ onPerson }) {
  const [f, setF, clearF, replaceF] = useFilters(['q', 'area', 'actor', 'days'], {}, { scope: 'insight-changes', url: false, defaults: { days: '7' } });
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const query = useCallback((before) => L('admin.changes', { area: f.area || undefined, actor_type: f.actor || undefined, days: f.days ? Number(f.days) : undefined, ...(before ? { before } : {}) }), [f.area, f.actor, f.days]);
  useEffect(() => { let on = true; setD(null); query().then((r) => { if (on) setD(r); }); return () => { on = false; }; }, [query]);
  const more = async () => { setBusy(true); const r = await query(d.next); setBusy(false); if (r.success) setD({ ...r, changes: [...d.changes, ...r.changes] }); };
  const fields = useMemo(() => [
    { key: 'area', label: 'المجالات', aria: 'المجال', get: (c) => c.area, options: Object.entries(CHANGE_AREAS) },
    { key: 'actor', label: 'الفاعلين', aria: 'الفاعل', all: 'كل الفاعلين', get: (c) => c.actor_type, options: Object.entries(ACTOR_AR) },
    { key: 'days', label: 'المدة', all: 'كل المدة', get: () => f.days, options: [['1', 'آخر يوم'], ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يومًا'], ['90', 'آخر 90 يومًا']] },
  ], [f.days]);
  const all = (d?.success && d.changes) || [];
  const rows = applyFilters(all, { fields: [], text: (c) => [c.text, c.who, c.by, c.detail, c.area_ar].join(' ') }, { q: f.q });
  return (
    <>
      <FilterBar scope="insight-changes" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} shown={rows.length} total={all.length} noun="حدث" placeholder="ابحث في ما حُمّل: بالمشارك أو الفاعل أو الحدث"
        actions={<ExportButton scope="insight-changes" meta={{ kind: 'LOG', title: 'سجل التغييرات', sheet: 'السجل', file: 'Changes' }} columns={CHANGE_COLS} all={all} filtered={rows} noun="حدث" />} />
      {!d ? <Spinner /> : !d.success ? <div className="la-err" role="alert">{d.message}</div> : !rows.length ? <Empty compact title={all.length ? 'لا أحداث لهذا البحث' : 'لا أحداث في هذه المدة'} hint="وسّع المدة أو غيّر المجال." /> : (
        <ol className="ins-log">
          {rows.map((c) => (
            <li key={c.id}>
              <time dateTime={c.at}>{dateTime(c.at)}</time>
              <span className="la-chip">{c.area_ar}</span>
              <span className="ins-log-t">{c.known ? c.text : <code dir="ltr">{c.text}</code>}{c.participant_id && <> · <button className="link" onClick={() => onPerson(c.participant_id)}>{c.who || 'ملف المشارك'}</button></>}{c.detail && <small className="la-muted"> · {c.detail}</small>}</span>
              <small className="la-muted" dir="auto">{c.by}</small>
            </li>
          ))}
        </ol>
      )}
      {d?.success && d.more && <button className="btn-sm ghost" type="button" disabled={busy} onClick={more}>{busy ? 'جارٍ التحميل…' : 'حمّل الأقدم'}</button>}
    </>
  );
}

export default function Insight({ onPerson, onExpert }) {
  const [view, setView] = useState(() => { try { return sessionStorage.getItem('mi_admin_insight_view') || 'org'; } catch { return 'org'; } });
  const [d, setD] = useState(null);
  const load = useCallback(async () => { setD(null); setD(await L('admin.insight', {})); }, []);
  useEffect(() => { load(); }, [load]);
  const pick = (v) => { setView(v); try { sessionStorage.setItem('mi_admin_insight_view', v); } catch { /* اختياري */ } };
  const t = d?.success ? d.by_org.total : null;
  return (
    <div className="ins">
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">المشاركون</div><div className="stat-value">{t ? t.total : '·'}</div><div className="stat-sub">{t ? `${t.active_pct}% نشطون هذا الأسبوع` : ''}</div></div>
        <div className="stat-card"><div className="stat-label">ينتظرون أنفسهم</div><div className="stat-value s-new">{t ? t.stuck : '·'}</div><div className="stat-sub">لم يكملوا الملف أو القياس</div></div>
        <div className="stat-card"><div className="stat-label">ينتظرون الإدارة</div><div className="stat-value s-new">{t ? t.waiting : '·'}</div><div className="stat-sub">اعتماد المستوى أو بدء البرنامج</div></div>
        <div className="stat-card"><div className="stat-label">اعتُمد مسارهم</div><div className="stat-value s-replied">{t ? `${t.approved_pct}%` : '·'}</div><div className="stat-sub">من القائمين (بلا المنسحبين)</div></div>
      </div>
      <section className="la-card">
        <div className="la-subtabs" role="tablist" aria-label="أقسام الرؤية الشاملة">
          {VIEWS.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}
        </div>
        {view === 'changes' ? <Changes onPerson={onPerson} />
          : !d ? <Spinner />
            : !d.success ? <div className="la-err" role="alert">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div>
              : view === 'org' ? <Pipeline data={d.by_org} group="org" noun="الجهة" />
                : view === 'cohort' ? <Pipeline data={d.by_cohort} group="cohort" noun="الدفعة" />
                  : <Load experts={d.experts} onExpert={onExpert} />}
      </section>
    </div>
  );
}
