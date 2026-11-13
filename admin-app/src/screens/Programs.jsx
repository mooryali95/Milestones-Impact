// ════════════════════════════════════════════════════════════════
// البرامج والدفعات
// ════════════════════════════════════════════════════════════════
// البرنامج: ماذا يمر به القائد (المراحل والمتطلبات)، يُبنى مرة ويُحفظ بنسخ.
// الدفعة: الجهة والبرنامج ونسخته والتواريخ وطريقة تنفيذ كل نشاط.
// المشارك يتبع دفعة جهته الجارية تلقائيًا، ومن ليس له جهة يتبع الدفعة المفتوحة.
import React, { useCallback, useEffect, useState } from 'react';
import { date, dateOnly, L, LVL } from '../leaders.js';
import { COHORT_STATUS, cohortFields, cohortToForm, formToCohort } from '../methodology.js';
import Form from '../Form.jsx';
import { CertOverride } from '../cert.jsx';
import { Empty, Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { CohortSchedule } from './Milestones.jsx';
import CohortTeam from './CohortTeam.jsx';
import CohortVisibility from './CohortVisibility.jsx';
import { FinalConfig } from './FinalEval.jsx';
import { cohortSetup, setupMissing } from '../../../supabase/functions/leaders-api/cohort-setup.js';


function DiffList({ diff }) {
  const rows = [['أُضيف', diff.added], ['حُذف', diff.removed], ['تغيّر', diff.changed]].filter(([, l]) => l.length);
  if (!rows.length) return <p className="la-muted">لا فرق في المتطلبات.</p>;
  return (
    <ul className="la-diff">
      {rows.map(([t, l]) => <li key={t}><b>{t}:</b> {l.map((x) => `${x.code} ${x.title || ''}`.trim()).join('، ')}</li>)}
    </ul>
  );
}

// صفحة الدفعة برابطها (#/leaders/programs/<id>): ما هي، وجاهزيتها بندًا بندًا (cohort-setup.js نفسه الذي في صفحة الجهة)،
// وأين يُضبط كل بند. النوافذ نفسها التي في الجدول، فلا مدخل ثانٍ لأي إعداد.
function CohortPage({ c, canWrite, orgName, progName, version, onBack, on }) {
  const setup = cohortSetup({ cohort: c, teamCount: (c.team_expert_ids || []).length, members: c.members || 0, upcomingSessions: c.upcoming_sessions ?? 0 }).filter((x) => x.key !== 'sessions' || c.upcoming_sessions != null);
  const missing = setupMissing(setup);
  const where = { team: ['الفريق والمجموعات', on.team], cohort: ['تحرير الدفعة', on.edit], schedule: ['الجدول', on.schedule] };
  return (
    <>
      <button className="la-link" onClick={onBack}>→ كل البرامج والدفعات</button>
      <section className="la-card cohort-page">
        <div className="la-row between">
          <div>
            <h2>{c.name}{c.is_default && <> <small className="la-chip">المفتوحة</small></>}</h2>
            <p className="la-muted">{c.is_default ? 'من ليس له جهة' : orgName(c.organization_id) || 'أفراد'} · {progName(c.program_id)} · {version ? `النسخة ${version.number}` : 'آخر تعديل'} · {COHORT_STATUS[c.status]}
              {(c.starts_on || c.ends_on) && <> · {[dateOnly(c.starts_on), dateOnly(c.ends_on)].filter(Boolean).join(' إلى ')}</>}</p>
          </div>
          {canWrite && <div className="la-row">
            <button className="btn-sm primary" onClick={on.edit}>تحرير</button>
            <button className="btn-sm ghost" onClick={on.schedule}>الجدول</button>
            <button className="btn-sm ghost" onClick={on.team}>الفريق والمجموعات</button>
            <button className="btn-sm ghost" onClick={on.vis}>الرؤية</button>
          </div>}
        </div>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">الأعضاء</div><div className="stat-value">{c.members ?? 0}</div><div className="stat-sub">{c.enrolled ? `${c.enrolled} بتسجيل صريح` : 'من انضم بجهتها'}</div></div>
          <div className="stat-card"><div className="stat-label">فريق الخبراء</div><div className="stat-value">{(c.team_expert_ids || []).length + (c.advisor_expert_id ? 1 : 0)}</div><div className="stat-sub">{c.advisor_expert_id ? 'بمستشار أساسي' : 'بلا مستشار أساسي'}</div></div>
          <div className="stat-card"><div className="stat-label">جاهزية الإعداد</div><div className={`stat-value ${missing ? 's-new' : 's-replied'}`}>{setup.length - missing}<small> / {setup.length}</small></div><div className="stat-sub">{missing ? `${missing} بند ينتظر الضبط` : 'مكتمل'}</div></div>
        </div>
        <ul className="cohort-setup">
          {setup.map((x) => (
            <li key={x.key} className={x.ok ? 'ok' : 'no'}>
              <b>{x.title}</b><span>{x.detail}</span>
              {!x.ok && canWrite && where[x.where] && <button className="btn-sm ghost" onClick={where[x.where][1]}>{where[x.where][0]}</button>}
            </li>
          ))}
        </ul>
        <div className="la-row">
          <a className="btn-sm ghost" href={`#/leaders/participants?cohort=${encodeURIComponent(c.id)}`}>مشاركو الدفعة ({c.members ?? 0})</a>
          <a className="btn-sm ghost" href="#/leaders/insight">أين توقفوا (الرؤية الشاملة)</a>
        </div>
      </section>
    </>
  );
}

export default function Programs({ canWrite, onEditJourney, cohortId = null, onCohort = () => {} }) {
  const { toast, confirm, prompt } = useUI();
  const [d, setD] = useState(null);
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
    return parts.length ? `يسري على: ${parts.join(' · ')}` : 'لا يسري على أحد بعد. اربطه بجهة بدفعة جديدة، أو اجعله لدفعة أفراد.';
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
    </>
  );
  if (cohortId && !shown) return <><button className="la-link" onClick={() => onCohort(null)}>→ كل البرامج والدفعات</button><Empty title="الدفعة غير موجودة" hint="ربما حُذفت أو تغيّر رابطها." /></>;
  if (shown) return (
    <>
      <CohortPage c={shown} canWrite={canWrite} orgName={orgName} progName={progName} version={versionOf(shown)} onBack={() => onCohort(null)}
        on={{ edit: () => editCohort(shown), schedule: () => setSchedule(shown), team: () => setGroups(shown), vis: () => setVis(shown) }} />
      {dialogs}
    </>
  );

  return (
    <>
      <p className="la-muted">
        البرنامج يحدد ماذا يمر به القائد، ويُبنى مرة. الدفعة تحدد لأي جهة ومتى وكيف: حضوري أو عن بعد، وطريقة إثبات الحضور.
        مشاركو الجهة يدخلون دفعتها الجارية تلقائيًا، ومن ليس له جهة يدخل الدفعة المفتوحة.
      </p>

      <div className="la-row between"><h3 className="la-phase">البرامج</h3>{canWrite && <button className="btn-sm ghost" onClick={() => newProgram()}>+ برنامج جديد</button>}</div>
      {programs.map((p) => (
        <section key={p.id} className={`la-card${p.archived_at ? ' off' : ''}`}>
          <div className="la-row between">
            <div>
              <b>{p.name}</b> {p.is_default && <small className="la-chip">الافتراضي</small>} {p.archived_at && <small className="la-chip">مؤرشف</small>}
              <div className="la-muted">
                {p.requirements} متطلب · {p.versions[0] ? `آخر نسخة محفوظة: ${p.versions[0].number}، ${p.versions[0].label}، ${date(p.versions[0].created_at)}` : 'لم تُحفظ له نسخة بعد'}
              </div>
              <div className="la-reach">{reach(p)}</div>
              {p.description_ar && <p className="la-muted">{p.description_ar}</p>}
            </div>
            <div className="la-row">
              <button className="btn-sm ghost" onClick={() => onEditJourney(p.id)}>حرّر الرحلة</button>
              {canWrite && <button className="btn-sm primary" onClick={() => saveVersion(p)}>احفظ نسخة</button>}
              {canWrite && !p.archived_at && <button className="la-link" onClick={() => editCohort({ program_id: p.id })}>اربطه بجهة أو دفعة</button>}
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

      <div className="la-row between"><h3 className="la-phase">الدفعات</h3>{canWrite && <button className="btn-sm ghost" onClick={() => editCohort()}>+ دفعة جديدة</button>}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>الدفعة</th><th>الجهة</th><th>البرنامج</th><th>النسخة</th><th>المدة</th><th>الحالة</th><th>الأعضاء</th><th /></tr></thead>
          <tbody>
            {!d.cohorts.length && <tr><td colSpan={8}><Empty compact title="لا دفعات بعد" hint="الدفعة تجمع مشاركي جهة في برنامج بمواعيده ومستشاره. بلا دفعة لا قاعة حية ولا جلسات.">{canWrite && <button className="btn-sm primary" type="button" onClick={() => editCohort()}>+ دفعة جديدة</button>}</Empty></td></tr>}
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
                  <td>{canWrite && <><button className="la-link" onClick={() => editCohort(c)}>تحرير</button> <button className="la-link" onClick={() => setSchedule(c)}>الجدول{Object.keys(c.schedule || {}).length ? '' : ' (فارغ)'}</button> <button className="la-link" onClick={() => setGroups(c)}>الفريق والمجموعات</button> <button className="la-link" onClick={() => setVis(c)}>الرؤية</button></>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
      {dialogs}
    </>
  );
}
