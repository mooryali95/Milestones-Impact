// ════════════════════════════════════════════════════════════════
// البرامج والدفعات
// ════════════════════════════════════════════════════════════════
// البرنامج: ماذا يمر به القائد (المراحل والمتطلبات)، يُبنى مرة ويُحفظ بنسخ.
// الدفعة: الجهة والبرنامج ونسخته والتواريخ وطريقة تنفيذ كل نشاط.
// المشارك يتبع دفعة جهته الجارية تلقائيًا، ومن ليس له جهة يتبع الدفعة المفتوحة.
import React, { useCallback, useEffect, useState } from 'react';
import { date, dateOnly, L, LVL, STATUS } from '../leaders.js';
import { COHORT_STATUS, cohortFields, cohortToForm, formToCohort } from '../methodology.js';
import Form from '../Form.jsx';
import { CertOverride } from '../cert.jsx';
import { Empty, Spinner, useCopy, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { CohortSchedule } from './Milestones.jsx';
import CohortTeam from './CohortTeam.jsx';
import CohortVisibility from './CohortVisibility.jsx';
import CohortWizard from './CohortWizard.jsx';
import { FinalConfig } from './FinalEval.jsx';
import { cohortHub, hubSummary, KIND_AR } from '../cohort-hub.js';
import { navigate, readQuery, useRoute, writeQuery } from '../route.js';


function DiffList({ diff }) {
  const rows = [['أُضيف', diff.added], ['حُذف', diff.removed], ['تغيّر', diff.changed]].filter(([, l]) => l.length);
  if (!rows.length) return <p className="la-muted">لا فرق في المتطلبات.</p>;
  return (
    <ul className="la-diff">
      {rows.map(([t, l]) => <li key={t}><b>{t}:</b> {l.map((x) => `${x.code} ${x.title || ''}`.trim()).join('، ')}</li>)}
    </ul>
  );
}

// ملف الدفعة برابطه (#/leaders/programs/<id>): المكان الواحد لكل ما يخص الدفعة. نوعها وكيف يدخلها المشاركون،
// وجاهزيتها بندًا بندًا مع زر الضبط لكل بند (cohort-hub.js)، ثم كل إعداداتها في لوحة واحدة. النوافذ نفسها التي في
// الجدول وفي صفحة الجهة، فلا مدخل ثانٍ لأي إعداد.
const ACTION_LABEL = {
  edit: 'تحرير الدفعة', schedule: 'الجدول', team: 'الفريق والمجموعات', participants: 'المشاركون', approve: 'اعتمدهم',
  org: 'افتح الجهة', other: 'افتح الدفعة الأحدث', journey: 'حرّر الرحلة', upgrade: 'رقِّ النسخة', activities: 'أضف جلسة',
};
function CohortPage({ c, hub, canWrite, orgName, progName, version, onBack, on }) {
  const copy = useCopy();
  const { items, missing, link, kind } = hub;
  const people = `#/leaders/participants?cohort=${encodeURIComponent(c.id)}`;
  // كل إعدادات الدفعة وما تتبعه في مكان واحد: ما يُضبط للدفعة نفسها، وما يُضبط في برنامجها أو جهتها ويسري عليها
  const tiles = [
    ['الأساسيات', 'الاسم والجهة والبرنامج ونسخته والمدة والحالة والمقاعد، وصيغة كل نشاط (حضوري أو عن بعد)، والبنود المخفية', on.edit, true],
    ['الجدول', 'موعد كل مرحلة، ويوزَّع تلقائيًا على مدة الدفعة', on.schedule, true],
    ['الفريق والمجموعات', 'المستشار الأساسي وفريق الخبراء ومجموعات المشاركين', on.team, true],
    ['الرؤية', 'ما يراه المشارك ومسؤول الجهة من هذه الدفعة', on.vis, true],
    ['رحلة البرنامج', `مراحل «${progName(c.program_id)}» ومتطلباته. تسري على كل دفعاته`, on.journey, false],
    ['الشهادة', 'شهادة البرنامج، وتضيف الجهة شعارها فوقها', on.cert, true],
    ['التقييم الختامي', 'معايير الحكم على المشروع والاجتياز في البرنامج', on.final, true],
    ...(kind === 'org' ? [['الجهة', `بيانات «${orgName(c.organization_id)}» ورابطها ومنسقها وعقدها`, on.org, false]] : []),
    ['الجلسات والحضور', 'الورش والجلسات المجدولة وإثبات الحضور', on.activities, false],
  ];
  return (
    <>
      <button className="la-link" onClick={onBack}>→ كل البرامج والدفعات</button>
      <section className="la-card cohort-page">
        <div className="la-row between">
          <div>
            <div className="la-muted">ملف الدفعة</div>
            <h2>{c.name}{c.is_default && <> <small className="la-chip">المفتوحة</small></>}</h2>
            <p className="la-muted">{c.is_default ? 'من ليس له جهة' : orgName(c.organization_id) || 'أفراد'} · {progName(c.program_id)} · {version ? `النسخة ${version.number}` : 'آخر تعديل'} · {COHORT_STATUS[c.status]}
              {(c.starts_on || c.ends_on) && <> · {[dateOnly(c.starts_on), dateOnly(c.ends_on)].filter(Boolean).join(' إلى ')}</>}</p>
            <p className="cohort-kind">{KIND_AR[kind]}</p>
          </div>
          {canWrite && <button className="btn-sm primary" onClick={on.edit}>تحرير الدفعة</button>}
        </div>

        {link && (
          <div className="cohort-link">
            <div><b>رابط التسجيل</b><span>من يسجّل به يدخل هذه الدفعة تلقائيًا. لا حاجة لإلحاقه يدويًا.</span></div>
            <code dir="ltr">{link}</code>
            <button className="btn-sm ghost" onClick={() => copy(link, 'نُسخ رابط التسجيل')}>نسخ</button>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">الأعضاء</div><div className="stat-value">{c.members ?? 0}</div><div className="stat-sub">{c.enrolled ? `${c.enrolled} بإلحاق يدوي، والباقي تلقائيًا` : kind === 'individuals' ? 'بالإلحاق اليدوي' : 'كلهم تلقائيًا'}</div></div>
          <div className="stat-card"><div className="stat-label">{STATUS.pending_approval}</div><div className={`stat-value ${c.pending_approval ? 's-new' : ''}`}>{c.pending_approval || 0}</div><div className="stat-sub">{c.pending_approval ? <a href={`${people}&status=pending_approval`}>اعتمدهم</a> : 'لا أحد'}</div></div>
          <div className="stat-card"><div className="stat-label">فريق الخبراء</div><div className="stat-value">{(c.team_expert_ids || []).length + (c.advisor_expert_id ? 1 : 0)}</div><div className="stat-sub">{c.advisor_name || (c.advisor_expert_id ? 'بمستشار أساسي' : 'بلا مستشار أساسي')}</div></div>
          <div className="stat-card"><div className="stat-label">الجاهزية</div><div className={`stat-value ${missing ? 's-new' : 's-replied'}`}>{items.length - missing}<small> / {items.length}</small></div><div className="stat-sub">{hubSummary(hub)}</div></div>
        </div>

        <h3 className="la-phase">الجاهزية</h3>
        <ol className="cohort-setup">
          {items.map((x, i) => (
            <li key={x.key} className={x.ok ? 'ok' : 'no'}>
              <span className="cs-n" aria-hidden="true">{x.ok ? '✓' : i + 1}</span>
              <b>{x.title}</b><span>{x.detail}</span>
              {x.action && on[x.action] && (canWrite || ['participants', 'approve', 'org', 'other', 'journey', 'activities'].includes(x.action)) &&
                <button className={`btn-sm ${x.ok ? 'ghost' : 'primary'}`} onClick={() => on[x.action](x)}>{ACTION_LABEL[x.action]}</button>}
            </li>
          ))}
        </ol>

        <h3 className="la-phase">كل ما يخص الدفعة</h3>
        <div className="cohort-tiles">
          {tiles.filter(([, , fn, write]) => fn && (canWrite || !write)).map(([t, d, fn]) => (
            <button key={t} type="button" className="cohort-tile" onClick={fn}><b>{t}</b><span>{d}</span></button>
          ))}
          <a className="cohort-tile" href={people}><b>المشاركون ({c.members ?? 0})</b><span>قائمة أعضاء الدفعة وحالاتهم، ومنها الاعتماد والنقل</span></a>
          <a className="cohort-tile" href="#/leaders/insight"><b>أين توقفوا</b><span>الرؤية الشاملة لتقدم المشاركين</span></a>
        </div>
      </section>
    </>
  );
}

export default function Programs({ canWrite, onEditJourney, cohortId = null, onCohort = () => {} }) {
  const { toast, confirm, prompt } = useUI();
  const [d, setD] = useState(null);
  const [wizard, setWizard] = useState(null);
  const onWizard = (preset) => setWizard(preset);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [compare, setCompare] = useState(null);
  const [cert, setCert] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [groups, setGroups] = useState(null);
  const [vis, setVis] = useState(null);
  const [finalCfg, setFinalCfg] = useState(null);

  const load = useCallback(async () => setD(await L('admin.programs')), []);
  useEffect(() => { load(); }, [load]);
  // «دفعة جديدة لهذه الجهة» من صفحة الجهة يصل برابط ‎#/leaders/programs?new=<الجهة>‎ فيفتح المعالج عليها مرة واحدة
  // يُقرأ عند كل تغيّر في العنوان لا عند الفتح وحده: قد يصل الرابط والشاشة مفتوحة
  const route = useRoute();
  useEffect(() => {
    const org = new URLSearchParams(readQuery()).get('new');
    if (org == null || !canWrite) return;
    writeQuery('');
    setWizard(org ? { organization_id: org } : {});
  }, [route, canWrite]);
  // نافذتا «قارن» والشهادة تُغلقان بـEsc كغيرهما، والشهادة تسأل قبل أن يضيع تعديلها
  const closeCert = useGuardedClose(!!cert && JSON.stringify(cert.value) !== JSON.stringify(cert.p.cert || {}), () => setCert(null));
  useEscape(() => setCompare(null), !!compare);
  useEscape(closeCert, !!cert);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err" role="alert">{d.message}</div>;

  const programs = d.programs;
  const progName = (id) => programs.find((p) => p.id === id)?.name || '';
  const orgName = (id) => d.organizations.find((o) => o.id === id)?.name || '';
  const versionOf = (c) => programs.find((p) => p.id === c.program_id)?.versions.find((v) => v.id === c.program_version_id);
  const latestOf = (pid) => programs.find((p) => p.id === pid)?.versions[0];

  const act = async (action, body, ok) => {
    const r = await L(action, body);
    if (!r.success) { toast(r.message); return null; }
    if (ok) toast(ok);
    load();
    return r;
  };
  const newProgram = async (from, from_version) => {
    const name = await prompt('اسم البرنامج الجديد', from ? `${progName(from)} (نسخة)` : '');
    if (name) act('admin.program-save', { name, from, from_version }, 'أُنشئ البرنامج بنسخة من المراحل والمتطلبات');
  };
  const saveVersion = async (p) => {
    const label = await prompt('اسم النسخة (مثل: بعد مراجعة أكتوبر)', `النسخة ${(p.versions[0]?.number || 0) + 1}`);
    if (label) act('admin.program-version', { id: p.id, label }, 'حُفظت النسخة');
  };
  const restore = async (v) => {
    if (!(await confirm(`استرجاع «${v.label}»؟ يُحفظ الوضع الحالي نسخةً أولًا، ولا يُحذف شيء من تقدم المشاركين.`))) return;
    const r = await act('admin.program-restore', { version_id: v.id });
    if (r) toast(`استُرجعت النسخة ${r.restored}، وحُفظ ما قبلها باسم النسخة ${r.backup.number}`);
  };
  const showCompare = async (v) => setCompare({ v, r: await L('admin.program-compare', { version_id: v.id }) });
  const archive = async (p) => {
    if (!(await confirm(p.archived_at ? `إعادة «${p.name}» للبرامج الفعالة؟` : `أرشفة «${p.name}»؟ تبقى نسخه محفوظة.`))) return;
    act('admin.program-archive', { id: p.id, archive: !p.archived_at }, 'تم');
  };
  const upgrade = async (c) => {
    const r = await L('admin.cohort-upgrade', { id: c.id });
    if (!r.success) return toast(r.message);
    if (r.unchanged) return toast('الدفعة على أحدث نسخة');
    setCompare({ cohort: c, r: { success: true, version: r.to, diff: r.diff } });
  };
  const editCert = async (p) => {
    const g = await L('admin.cert-settings');
    setCert({ p, value: p.cert || {}, base: g.success ? g.settings : {} });
  };
  const saveCert = async () => {
    const r = await act('admin.program-save', { id: cert.p.id, cert: cert.value }, 'حُفظت شهادة البرنامج. تسري على ما يصدر من الآن.');
    if (r) setCert(null);
  };
  // لمن يسري البرنامج: الدفعة المفتوحة (الجميع بلا جهة)، وجهات دفعاته غير المغلقة
  const reach = (p) => {
    const live = d.cohorts.filter((c) => c.program_id === p.id && c.status !== 'closed');
    const general = live.some((c) => c.is_default);
    const orgs = [...new Set(live.filter((c) => c.organization_id).map((c) => orgName(c.organization_id)))];
    const indiv = live.filter((c) => !c.is_default && !c.organization_id).length;
    const parts = [general && 'الجميع (الدفعة المفتوحة)', orgs.length && `الجهات: ${orgs.join('، ')}`, indiv && `${indiv} دفعة أفراد`].filter(Boolean);
    return parts.length ? { on: true, text: `يسري على: ${parts.join(' · ')}` } : { on: false, text: 'لا توجد دفعة على هذا البرنامج بعد، فلا يسري على أي مشارك. أنشئ له دفعة لجهة أو لأفراد متى احتجته.' };
  };
  const editCohort = (c = {}) => {
    const pid = c.program_id || programs.find((p) => p.is_default)?.id;
    const p = programs.find((x) => x.id === pid);
    L('admin.program', { id: pid }).then((pr) => setForm({
      title: c.id ? `دفعة: ${c.name}` : 'دفعة جديدة',
      fields: cohortFields({ orgs: d.organizations, programs, versions: p?.versions || [], reqs: pr.success ? pr.requirements : [], isDefault: !!c.is_default }),
      values: cohortToForm(c.id ? c : { program_id: pid, status: 'planned', program_version_id: p?.versions[0]?.id || '' }),
      onSave: (v) => L('admin.cohort-save', { ...(c.id ? { id: c.id } : {}), ...formToCohort(v) }),
    }));
  };

  const shown = cohortId ? d.cohorts.find((c) => c.id === cohortId) : null;
  // النوافذ واحدة للجدول ولصفحة الدفعة
  const dialogs = (
    <>
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); load(); } }} />}
      {finalCfg && <FinalConfig program={finalCfg} onClose={(saved) => { setFinalCfg(null); if (saved) load(); }} />}
      {groups && <CohortTeam cohort={groups} canWrite={canWrite} onClose={(changed) => { setGroups(null); if (changed) load(); }} />}
      {vis && <CohortVisibility cohort={vis} canWrite={canWrite} onClose={() => setVis(null)} />}
      {schedule && <CohortSchedule cohort={schedule} onClose={(saved) => { setSchedule(null); if (saved) load(); }} />}
      {/* الخطوة الرابعة من المعالج: بعد الإنشاء يفتح ملف الدفعة ومعه نافذة الفريق، والرابط ظاهر في رأس الملف */}
      {wizard && <CohortWizard preset={wizard} data={d} onClose={async (created) => { setWizard(null); if (created) { await load(); onCohort(created.id); setGroups(created); } }} />}
      {compare && (
        <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && setCompare(null)}>
          <div className="la-form mi-form" role="dialog" aria-modal="true" aria-label="الفرق">
            {!compare.r.success ? <div className="la-err">{compare.r.message}</div> : <>
              <h3>{compare.cohort ? `ترقية «${compare.cohort.name}» إلى النسخة ${compare.r.version.number}` : `النسخة ${compare.r.version.number} مقارنة بالبرنامج الحالي`}</h3>
              <p className="la-muted">{compare.cohort ? 'ما سيتغير على مشاركي الدفعة. تقدمهم فيما بقي من متطلبات محفوظ.' : 'ما تغيّر في البرنامج منذ هذه النسخة.'}</p>
              <DiffList diff={compare.r.diff} />
            </>}
            <div className="la-row">
              {compare.cohort && <button className="btn-sm primary" onClick={async () => { const c = compare.cohort; setCompare(null); await act('admin.cohort-upgrade', { id: c.id, confirm: true }, 'رُقّيت الدفعة'); }}>رقِّ الدفعة</button>}
              <button className="btn-sm ghost" onClick={() => setCompare(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
      {cert && (
        <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && closeCert()}>
          <div className="la-form mi-form" role="dialog" aria-modal="true" aria-label={`شهادة ${cert.p.name}`}>
            <h3>شهادة «{cert.p.name}»</h3>
            <CertOverride cert={cert.value} onChange={(value) => setCert({ ...cert, value })} base={cert.base} what="البرنامج"
              hint="تُبنى الشهادة مرة في الإعداد العام. اكتب هنا ما يختلف في هذا البرنامج فقط، وتضيف كل جهة شعارها وتخصيصها فوقه."
              preview={{ program_id: cert.p.id, program_cert: cert.value }} />
            <div className="la-row">
              <button className="btn-sm primary" onClick={saveCert}>حفظ</button>
              <button className="btn-sm ghost" onClick={closeCert}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  if (cohortId && !shown) return <><button className="la-link" onClick={() => onCohort(null)}>→ كل البرامج والدفعات</button><Empty title="الدفعة غير موجودة" hint="ربما حُذفت أو تغيّر رابطها." /></>;
  if (shown) {
    const prog = programs.find((p) => p.id === shown.program_id);
    const people = `#/leaders/participants?cohort=${encodeURIComponent(shown.id)}`;
    const on = {
      edit: () => editCohort(shown), schedule: () => setSchedule(shown), team: () => setGroups(shown), vis: () => setVis(shown),
      journey: () => onEditJourney(shown.program_id), upgrade: () => upgrade(shown),
      cert: prog && (() => editCert(prog)), final: prog && (() => setFinalCfg(prog)),
      org: shown.organization_id && (() => navigate({ ctx: 'leaders', tab: 'orgs', id: shown.organization_id })),
      other: (x) => onCohort(x.other), activities: () => navigate({ ctx: 'leaders', tab: 'activities' }),
      participants: () => { window.location.hash = people; }, approve: () => { window.location.hash = `${people}&status=pending_approval`; },
    };
    return (
      <>
        <CohortPage c={shown} hub={cohortHub({ cohort: shown, cohorts: d.cohorts, orgs: d.organizations, programs })} canWrite={canWrite}
          orgName={orgName} progName={progName} version={versionOf(shown)} onBack={() => onCohort(null)} on={on} />
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="la-card how-it-works" aria-label="كيف تعمل المنظومة">
        <ol>
          <li><b>البرنامج</b><span>ماذا يمر به القائد: المراحل والمتطلبات. يُبنى مرة ويُستعمل لأكثر من دفعة.</span></li>
          <li><b>الدفعة</b><span>لمن ومتى وكيف: الجهة، والمدة، والجدول، والمستشار والفريق. لكل دفعة ملف واحد فيه كل إعداداتها.</span></li>
          <li><b>المشاركون</b><span>يدخلون الدفعة <b>تلقائيًا</b>: من سجّل برابط جهة يدخل دفعتها المفتوحة أو الجارية، ومن سجّل بلا جهة يدخل الدفعة المفتوحة. الإلحاق اليدوي للاستثناءات فقط.</span></li>
        </ol>
      </div>

      <div className="la-row between"><h3 className="la-phase">البرامج</h3>{canWrite && <button className="btn-sm ghost" onClick={() => newProgram()}>+ برنامج جديد</button>}</div>
      {programs.map((p) => (
        <section key={p.id} className={`la-card${p.archived_at ? ' off' : ''}`}>
          <div className="la-row between">
            <div>
              <b>{p.name}</b> {p.is_default && <small className="la-chip">الافتراضي</small>} {p.archived_at && <small className="la-chip">مؤرشف</small>}
              <div className="la-muted">
                {p.requirements} متطلب · {p.versions[0] ? `آخر نسخة محفوظة: ${p.versions[0].number}، ${p.versions[0].label}، ${date(p.versions[0].created_at)}` : 'لم تُحفظ له نسخة بعد'}
              </div>
              <div className={`la-reach${reach(p).on ? '' : ' none'}`}>{reach(p).text}</div>
              {p.description_ar && <p className="la-muted">{p.description_ar}</p>}
            </div>
            <div className="la-row">
              <button className="btn-sm ghost" onClick={() => onEditJourney(p.id)}>حرّر الرحلة</button>
              {canWrite && <button className="btn-sm primary" onClick={() => saveVersion(p)}>احفظ نسخة</button>}
              {canWrite && !p.archived_at && <button className="la-link" onClick={() => onWizard({ program_id: p.id })}>أنشئ له دفعة</button>}
              {canWrite && <button className="la-link" onClick={() => setFinalCfg(p)}>التقييم الختامي</button>}
              <button className="la-link" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>النسخ ({p.versions.length})</button>
              {canWrite && <button className="la-link" onClick={() => editCert(p)}>الشهادة{p.cert && Object.keys(p.cert).length ? ' (مخصصة)' : ''}</button>}
              {canWrite && <button className="la-link" onClick={() => newProgram(p.id)}>تكرار</button>}
              {canWrite && !p.is_default && <button className="la-link" onClick={() => archive(p)}>{p.archived_at ? 'إعادة' : 'أرشفة'}</button>}
            </div>
          </div>
          {open === p.id && (
            p.versions.length ? (
              <ul className="la-reqs">
                {p.versions.map((v) => (
                  <li key={v.id}>
                    <span><b>{v.number}.</b> {v.label} <small className="la-muted">{date(v.created_at)}{v.created_by ? ` · ${v.created_by}` : ''}</small></span>
                    <span className="la-row">
                      <button className="la-link" onClick={() => showCompare(v)}>قارن بالحالي</button>
                      {canWrite && <button className="la-link" onClick={() => restore(v)}>استرجع</button>}
                      {canWrite && <button className="la-link" onClick={() => newProgram(p.id, v.id)}>برنامج جديد منها</button>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="la-muted">احفظ نسخة لتثبيت الدفعات عليها واسترجاعها متى شئت.</p>
          )}
        </section>
      ))}

      <div className="la-row between"><h3 className="la-phase">الدفعات</h3>{canWrite && <button className="btn-sm primary" onClick={() => onWizard({})}>+ دفعة جديدة</button>}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>الدفعة</th><th>الجهة</th><th>البرنامج</th><th>النسخة</th><th>المدة</th><th>الحالة</th><th>الأعضاء</th><th>الجاهزية</th><th /></tr></thead>
          <tbody>
            {!d.cohorts.length && <tr><td colSpan={9}><Empty compact title="لا دفعات بعد" hint="الدفعة تجمع مشاركي جهة في برنامج بمواعيده ومستشاره. بلا دفعة لا قاعة حية ولا جلسات.">{canWrite && <button className="btn-sm primary" type="button" onClick={() => onWizard({})}>+ دفعة جديدة</button>}</Empty></td></tr>}
            {d.cohorts.map((c) => {
              const v = versionOf(c), latest = latestOf(c.program_id);
              return (
                <tr key={c.id}>
                  <td><button className="la-link" onClick={() => onCohort(c.id)}><b>{c.name}</b></button>{c.is_default && <> <small className="la-chip">المفتوحة</small></>}{c.level_mode === 'uniform' && <> <small className="la-chip">متجانس · {LVL[c.content_level]}</small></>}{c.project_mode === 'group' && <> <small className="la-chip">مشروع جماعي</small></>}</td>
                  <td>{c.is_default ? 'من ليس له جهة' : orgName(c.organization_id) || 'أفراد'}</td>
                  <td>{progName(c.program_id)}</td>
                  <td>{v ? `النسخة ${v.number}` : 'آخر تعديل'}{v && latest && latest.id !== v.id && canWrite && <> <button className="la-link" onClick={() => upgrade(c)}>رقِّ إلى {latest.number}</button></>}</td>
                  <td>{[dateOnly(c.starts_on), dateOnly(c.ends_on)].filter(Boolean).join(' إلى ')}</td>
                  <td>{COHORT_STATUS[c.status]}</td>
                  <td title="من يتبع الدفعة فعلًا: المسجّل فيها صراحة ومن انضم بجهتها. هو العدد نفسه في المجموعات والقاعة.">{c.members ?? c.enrolled ?? 0}{c.enrolled > 0 && c.enrolled !== c.members && <> <small className="la-muted">({c.enrolled} بتسجيل صريح)</small></>}</td>
                  <td>{(() => { const h = cohortHub({ cohort: c, cohorts: d.cohorts, orgs: d.organizations, programs }); return <span className={`la-chip ${h.missing ? 'warn' : 'ok'}`}>{hubSummary(h)}</span>; })()}</td>
                  <td><button className="btn-sm ghost" onClick={() => onCohort(c.id)}>افتح ملف الدفعة</button>{canWrite && <> <button className="la-link" onClick={() => editCohort(c)}>تحرير</button> <button className="la-link" onClick={() => setSchedule(c)}>الجدول{Object.keys(c.schedule || {}).length ? '' : ' (فارغ)'}</button> <button className="la-link" onClick={() => setGroups(c)}>الفريق والمجموعات</button> <button className="la-link" onClick={() => setVis(c)}>الرؤية</button></>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialogs}
    </>
  );
}
