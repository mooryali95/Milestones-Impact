// ════════════════════════════════════════════════════════════════
// البرامج والدفعات
// ════════════════════════════════════════════════════════════════
// البرنامج: ماذا يمر به القائد (المراحل والمتطلبات)، يُبنى مرة ويُحفظ بنسخ.
// الدفعة: الجهة والبرنامج ونسخته والتواريخ وطريقة تنفيذ كل نشاط.
// المشارك يتبع دفعة جهته الجارية تلقائيًا، ومن ليس له جهة يتبع الدفعة المفتوحة.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { date, dateOnly, L, LVL, STATUS } from '../leaders.js';
import { cohortStateAr } from '../methodology.js';
import { programReach } from '../program-reach.js';
import CohortEditor from './CohortEditor.jsx';
import { CertOverride } from '../cert.jsx';
import { Empty, Spinner, useCopy, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import CohortTeam from './CohortTeam.jsx';
import CohortVisibility from './CohortVisibility.jsx';
import CohortWizard from './CohortWizard.jsx';
import { FinalConfig } from './FinalEval.jsx';
import { cohortHub, hubSummary, KIND_AR } from '../cohort-hub.js';
import { navigate, readQuery, useRoute, writeQuery } from '../route.js';
import { countAr } from '../../../supabase/functions/leaders-api/labels.js';
import CohortJourney from './CohortJourney.jsx';
import CohortRoster from './CohortRoster.jsx';
import CohortDemo from './CohortDemo.jsx';
import { COHORT_TABS, cohortTab, followShow, followStage, tabQuery } from '../cohort-journey.js';

// العدد والمعدود بقاعدة countAr: «عضوان» و«3 أعضاء» و«11 عضوًا»، و«دفعتان» و«3 دفعات» و«12 دفعة»
const membersAr = (n) => countAr(n, 'عضو واحد', 'عضوان', 'أعضاء', 'عضوًا');
const cohortsAr = (n) => countAr(n, 'دفعة واحدة', 'دفعتان', 'دفعات', 'دفعة');


// الفرق في المتطلبات ثم في المراحل (programDiff)، والخادم قبل حقل المراحل يُقرأ بمتطلباته وحدها
function DiffList({ diff }) {
  const st = diff.stages || { added: [], removed: [], changed: [] };
  const rows = [['أُضيف', diff.added], ['حُذف', diff.removed], ['تغيّر', diff.changed],
    ['مراحل أُضيفت', st.added], ['مراحل حُذفت أو أُوقفت', st.removed], ['مراحل تغيّرت', st.changed]].filter(([, l]) => l?.length);
  if (!rows.length) return <p className="la-muted">لا فرق في المتطلبات ولا المراحل.</p>;
  return (
    <ul className="la-diff">
      {rows.map(([t, l]) => <li key={t}><b>{t}:</b> {l.map((x) => x.title || x.code || x.key).join('، ')}</li>)}
    </ul>
  );
}

// أثر الترقية على الدفعة (cohortUpgrade): من له تقدم فيما يختفي، وما يُسقط من إعدادها، وما يمنعها
function UpgradeImpact({ r }) {
  const d = r.dropped || {};
  const lines = [
    r.affected ? `${membersAr(r.affected)} ${r.affected === 1 ? 'له' : r.affected === 2 ? 'لهما' : 'لهم'} تقدم في متطلبات تختفي من الرحلة. يبقى ما أُنجز محفوظًا ويعود إن عادت.` : '',
    d.delivery?.length ? `يُلغى تخصيص التنفيذ لما ليس في النسخة: ${d.delivery.join('، ')}.` : '',
    d.schedule?.length ? `تُسقط من خطة الدفعة مراحل ليست في النسخة: ${d.schedule.join('، ')}.` : '',
    d.stage_modes?.length ? `يُسقط وضع العمل لمراحل ليست في النسخة: ${d.stage_modes.join('، ')}.` : '',
  ].filter(Boolean);
  return (
    <>
      {lines.length > 0 && <ul className="la-diff">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
      {r.blocked && <div className="la-err" role="alert">لا تُرقّى الدفعة: {r.blocked}</div>}
    </>
  );
}

// ملف الدفعة برابطه (#/leaders/programs/<id>): المكان الواحد لكل ما يخص الدفعة. نوعها وكيف يدخلها المشاركون،
// وجاهزيتها بندًا بندًا مع زر الضبط لكل بند (cohort-hub.js)، ثم كل إعداداتها في لوحة واحدة. النوافذ نفسها التي في
// الجدول وفي صفحة الجهة، فلا مدخل ثانٍ لأي إعداد.
const ACTION_LABEL = {
  edit: 'تحرير الدفعة', plan: 'افتح الرحلة', team: 'الفريق والمجموعات', participants: 'المشاركون', approve: 'اعتمدهم',
  org: 'افتح الجهة', other: 'افتح الدفعة الأحدث', journey: 'حرّر الرحلة', upgrade: 'رقِّ النسخة', pin: 'ثبّت على نسخة', activities: 'أضف جلسة',
};
function CohortPage({ c, hub, canWrite, orgName, progName, version, onBack, on: given }) {
  const copy = useCopy();
  // تبويبات الملف: «الملف» (الجاهزية والإعدادات) و«الرحلة» (R1) و«المتابعة» (صف لكل عضو)، والمختار في العنوان ?view= فيُفتح الرابط عليه
  const route = useRoute();
  const [tab, setTab] = useState(() => cohortTab(readQuery()));
  // مرحلة الخريطة التي ضُغطت: يُفتح «المتابعة» مفلترًا بها (من الرابط أو من زر الخريطة)، ونقرة التبويب نفسه تفتحه بفلاتره المحفوظة
  const [stage, setStage] = useState(() => followStage(readQuery()));
  // والعرض السريع الذي يحمله الرابط (?show=late من تنبيه المتأخرين): يُقرأ مرة عند الفتح، ونقرة أي تبويب تسقطه
  const [show, setShow] = useState(() => followShow(readQuery()));
  useEffect(() => { setTab(cohortTab(readQuery())); setStage(followStage(readQuery())); setShow(followShow(readQuery())); }, [route, c.id]);
  const tabsRef = useRef(null);
  const openTab = (k, focus = false, st = '') => {
    setTab(k); setStage(k === 'follow' ? st : ''); setShow('');
    writeQuery(tabQuery(k, st));
    if (focus) tabsRef.current?.querySelector(`#cohort-tab-${k}`)?.focus();
  };
  const tabKey = (e) => {
    const i = COHORT_TABS.findIndex(([k]) => k === tab);
    const to = { ArrowLeft: i + 1, ArrowRight: i - 1, Home: 0, End: COHORT_TABS.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    openTab(COHORT_TABS[(to + COHORT_TABS.length) % COHORT_TABS.length][0], true);
  };
  // خطة المراحل في تبويب «الرحلة» (القرار 23): بند الجاهزية وزر المواعيد يفتحانه، لا نافذة ثانية
  const on = { ...given, plan: () => openTab('journey', true), follow: (st) => { openTab('follow', true, st || ''); window.scrollTo({ top: 0 }); } };
  const { items, missing, link, kind } = hub;
  const people = `#/leaders/participants?cohort=${encodeURIComponent(c.id)}`;
  // كل إعدادات الدفعة وما تتبعه في مكان واحد: ما يُضبط للدفعة نفسها، وما يُضبط في برنامجها أو جهتها ويسري عليها
  const tiles = [
    ['الأساسيات', 'الاسم والجهة والبرنامج والمدة والحالة، والرحلة بندًا بندًا (الظاهر والمخفي)، وصيغة كل نشاط، والنسخة والمستويات', on.edit, true],
    ['الرحلة', 'المراحل بتواريخها ومددها في هذه الدفعة، وتعديل المدة بمعاينة أثرها، والخط الزمني، ومن في كل مرحلة', () => openTab('journey', true), false],
    ['المتابعة', 'صف لكل عضو: مرحلته الحالية وسبب توقفه وعلى من الدور، ببحث بالاسم أو الجوال وتصدير', () => openTab('follow', true), false],
    ['الفريق والمجموعات', 'المستشار الأساسي وفريق الخبراء ومجموعات المشاركين', on.team, true],
    ['الرؤية', 'ما يراه مستشار الدفعة والخبير المسند من مشاركيها', on.vis, true],
    ['رحلة البرنامج', `مراحل «${progName(c.program_id)}» ومتطلباته. ${c.program_version_id ? 'تعديلها مسودة لا يصل إلى هذه الدفعة حتى تُحفظ نسخة وتُرقّى إليها' : 'تعديلها يصل إلى هذه الدفعة فورًا لأنها غير مثبتة على نسخة'}`, on.journey, false],
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
            <p className="la-muted">{c.is_default ? 'من ليس له جهة' : orgName(c.organization_id) || 'أفراد'} · {progName(c.program_id)} · {version ? `النسخة ${version.number}` : <span className="la-chip warn">غير مثبتة</span>} · {cohortStateAr(c)}
              {(c.starts_on || c.ends_on) && <> · {[dateOnly(c.starts_on), dateOnly(c.ends_on)].filter(Boolean).join(' إلى ')}</>}</p>
            <p className="cohort-kind">{KIND_AR[kind]}</p>
          </div>
          {canWrite && <button className="btn-sm primary" onClick={on.edit}>تحرير الدفعة</button>}
        </div>

        <div ref={tabsRef} className="cohort-tabs" role="tablist" aria-label="أقسام ملف الدفعة" onKeyDown={tabKey}>
          {COHORT_TABS.map(([k, l]) => (
            <button key={k} id={`cohort-tab-${k}`} type="button" role="tab" aria-selected={tab === k} aria-controls={tab === k ? `cohort-panel-${k}` : undefined} tabIndex={tab === k ? 0 : -1}
              onClick={() => openTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'journey' ? (
          <div role="tabpanel" id="cohort-panel-journey" aria-labelledby="cohort-tab-journey">
            <CohortJourney c={c} canWrite={canWrite} on={on} onSaved={on.reload} />
          </div>
        ) : tab === 'follow' ? (
          <div role="tabpanel" id="cohort-panel-follow" aria-labelledby="cohort-tab-follow">
            <CohortRoster key={`${c.id}:${stage}:${show}`} c={c} canWrite={canWrite} stage={stage} show={show} onPerson={on.person} onJourney={() => openTab('journey', true)} />
          </div>
        ) : (
        <div role="tabpanel" id="cohort-panel-overview" aria-labelledby="cohort-tab-overview">
        {link && (
          <div className="cohort-link">
            <div><b>رابط التسجيل</b><span>من يسجّل به يدخل هذه الدفعة تلقائيًا. لا حاجة لإلحاقه يدويًا.</span></div>
            <code dir="ltr">{link}</code>
            <button className="btn-sm ghost" onClick={() => copy(link, 'نُسخ رابط التسجيل')}>نسخ</button>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">الأعضاء</div><div className="stat-value">{c.members ?? 0}{Number(c.capacity) > 0 && <small> / {c.capacity}</small>}</div><div className="stat-sub">{c.enrolled ? `${c.enrolled} بإلحاق يدوي، والباقي تلقائيًا` : kind === 'individuals' ? 'بالإلحاق اليدوي' : 'كلهم تلقائيًا'}</div></div>
          <div className="stat-card"><div className="stat-label">{STATUS.pending_approval}</div><div className={`stat-value ${c.pending_approval ? 's-new' : ''}`}>{c.pending_approval || 0}</div><div className="stat-sub">{c.pending_approval ? <a href={`${people}&status=pending_approval`}>اعتمدهم</a> : 'لا أحد'}</div></div>
          <div className="stat-card"><div className="stat-label">فريق الخبراء</div><div className="stat-value">{(c.team_expert_ids || []).length + (c.advisor_expert_id ? 1 : 0)}</div><div className="stat-sub">{c.advisor_name || (c.advisor_expert_id ? 'بمستشار أساسي' : 'بلا مستشار أساسي')}</div></div>
          <div className="stat-card"><div className="stat-label">الجاهزية</div><div className={`stat-value ${missing ? 's-new' : 's-replied'}`}>{items.length - missing}<small> من {items.length}</small></div><div className="stat-sub">{hubSummary(hub)}</div></div>
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
          <a className="cohort-tile" href={`#/leaders/insight?cohort=${encodeURIComponent(c.id)}`}><b>أين توقفوا</b><span>الرؤية الشاملة لتقدم المشاركين</span></a>
        </div>

        {canWrite && <><h3 className="la-phase">الحساب التجريبي</h3><CohortDemo key={c.id} c={c} canWrite={canWrite} /></>}
        </div>
        )}
      </section>
    </>
  );
}

export default function Programs({ canWrite, onEditJourney, cohortId = null, onCohort = () => {}, onPerson = null }) {
  const { toast, confirm, prompt } = useUI();
  const [d, setD] = useState(null);
  const [wizard, setWizard] = useState(null);
  const onWizard = (preset) => setWizard(preset);
  const [editor, setEditor] = useState(null);
  const [open, setOpen] = useState(null);
  const [compare, setCompare] = useState(null);
  const [cert, setCert] = useState(null);
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
  // «برنامج جديد من هذا» (قرار المالك 16): يسبقه سؤال «لجهة بعينها؟»، لأن تخصيص جهة مكانه دفعتها لا نسخة من البرنامج
  // (النسخة لا ترث تحسينات الأصل ولا يُنقل إليها تقدم)
  const newProgram = async (from, from_version) => {
    if (from && !(await confirm(`لجهة بعينها؟ خصّص دفعتها بدل النسخ: أنشئ لها دفعة على «${progName(from)}»، ثم من ملف الدفعة أخفِ ما لا يلزمها من البنود واضبط مدد مراحلها، فتصلها تحسينات البرنامج حين ترقّيها إلى نسخه الجديدة. أما البرنامج الجديد فمنهج مستقل لا يرث ما يُحسَّن في الأصل بعد اليوم.`, { ok: 'برنامج جديد من هذا' }))) return;
    const name = await prompt('اسم البرنامج الجديد', from ? `${progName(from)} (نسخة)` : '');
    if (name) act('admin.program-save', { name, from, from_version }, 'أُنشئ البرنامج بنسخة من المراحل والمتطلبات');
  };
  const saveVersion = async (p) => {
    const label = await prompt('اسم النسخة (مثل: بعد مراجعة أكتوبر)', `النسخة ${(p.versions[0]?.number || 0) + 1}`);
    if (!label) return;
    const r = await act('admin.program-version', { id: p.id, label });
    // حفظ النسخة لا يمس الدفعات: كل منها على نسختها حتى تُرقّى بنفسها
    if (r) toast(r.behind ? `حُفظت النسخة ${r.version.number}. ${cohortsAr(r.behind)} ${r.behind === 1 ? 'باقية' : r.behind === 2 ? 'باقيتان' : 'باقية'} على نسخة أقدم أو غير مثبتة؛ رقِّ كلًا منها بنفسك بعد مراجعة الفرق.` : `حُفظت النسخة ${r.version.number}`);
  };
  const restore = async (v) => {
    if (!(await confirm(`استرجاع «${v.label}» إلى مسودة البرنامج؟ يُحفظ الوضع الحالي نسخةً أولًا، ولا يُحذف شيء من تقدم المشاركين. الدفعات باقية على نسخها المثبتة.`))) return;
    const r = await act('admin.program-restore', { version_id: v.id });
    // المسترجع يُحفظ نسخة أحدث من الاحتياطية، فالدفعة الجديدة وزر الترقية يقرآن ما رجعت إليه لا ما تراجعت عنه
    if (r) toast(r.restored_as
      ? `استُرجعت النسخة ${r.restored} وحُفظت باسم النسخة ${r.restored_as.number}، وحُفظ ما قبلها باسم النسخة ${r.backup.number}. الدفعات الجديدة تُثبَّت على ${r.restored_as.number}، والقائمة باقية على نسخها حتى ترقّيها.`
      : `استُرجعت النسخة ${r.restored} إلى المسودة، وحُفظ ما قبلها باسم النسخة ${r.backup.number}. ${r.restored_note || ''} احفظ نسخة بعد إصلاحها، فأحدث نسخة الآن هي ${r.backup.number}.`);
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
    setCompare({ cohort: c, pin: !c.program_version_id, r: { ...r, version: r.to } });
  };
  const editCert = async (p) => {
    const g = await L('admin.cert-settings');
    setCert({ p, value: p.cert || {}, base: g.success ? g.settings : {} });
  };
  const saveCert = async () => {
    const r = await act('admin.program-save', { id: cert.p.id, cert: cert.value }, 'حُفظت شهادة البرنامج. تسري على ما يصدر من الآن.');
    if (r) setCert(null);
  };
  // لمن يسري البرنامج: أعضاء دفعاته غير المغلقة الفعليون من الخادم (program-reach.js، P9)، لا عدد الدفعات
  const reach = (p) => programReach(p, d.cohorts, orgName);
  // تحرير الدفعة بالأقسام (CohortEditor.jsx): الرحلة من تعريفها، والحفظ بالإجراء الواحد وحارس النقل
  const editCohort = (c = {}) => setEditor(c);

  const shown = cohortId ? d.cohorts.find((c) => c.id === cohortId) : null;
  // النوافذ واحدة للجدول ولصفحة الدفعة
  const dialogs = (
    <>
      {editor && <CohortEditor cohort={editor} data={d} canWrite={canWrite} onClose={(saved) => { setEditor(null); if (saved) { toast('تم الحفظ'); load(); } }}
        onOpen={(k, at = {}) => { const c = editor; if (k === 'team') setGroups(c); else if (k === 'vis') setVis(c); else if (k === 'journey') onEditJourney(at.program_id || c.program_id);
          else if (k === 'timeline') window.location.hash = `#/leaders/programs/${encodeURIComponent(c.id)}?view=journey`;
          else if (k === 'activities') window.location.hash = `#/leaders/activities${at.req ? `?req=${encodeURIComponent(at.req)}` : ''}`; }} />}
      {finalCfg && <FinalConfig program={finalCfg} onClose={(saved) => { setFinalCfg(null); if (saved) load(); }} />}
      {groups && <CohortTeam cohort={groups} canWrite={canWrite} onClose={(changed) => { setGroups(null); if (changed) load(); }} />}
      {vis && <CohortVisibility cohort={vis} canWrite={canWrite} onClose={() => setVis(null)} />}
      {/* الخطوة الرابعة من المعالج: بعد الإنشاء يفتح ملف الدفعة ومعه نافذة الفريق، والرابط ظاهر في رأس الملف */}
      {wizard && <CohortWizard preset={wizard} data={d} onClose={async (created) => { setWizard(null); if (created) { await load(); onCohort(created.id); setGroups(created); } }} />}
      {compare && (
        <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && setCompare(null)}>
          <div className="la-form mi-form" role="dialog" aria-modal="true" aria-label="الفرق">
            {!compare.r.success ? <div className="la-err">{compare.r.message}</div> : <>
              <h3>{compare.cohort ? `${compare.pin ? 'تثبيت' : 'ترقية'} «${compare.cohort.name}» ${compare.pin ? 'على' : 'إلى'} النسخة ${compare.r.version.number}` : `النسخة ${compare.r.version.number} مقارنة بالبرنامج الحالي`}</h3>
              <p className="la-muted">{compare.cohort ? (compare.pin ? 'الفرق بين ما تمر به الدفعة الآن (البرنامج كما هو) وهذه النسخة. بعد التثبيت لا يصل إليها تعديل على البرنامج حتى ترقّيها.' : 'ما سيتغير على مشاركي الدفعة. تقدمهم فيما بقي من متطلبات محفوظ.') : 'ما تغيّر في البرنامج منذ هذه النسخة.'}</p>
              <DiffList diff={compare.r.diff} />
              {compare.cohort && <UpgradeImpact r={compare.r} />}
            </>}
            <div className="la-row">
              {compare.cohort && !compare.r.blocked && <button className="btn-sm primary" onClick={async () => { const { cohort: c, pin } = compare; const to = compare.r.version.id; setCompare(null); await act('admin.cohort-upgrade', { id: c.id, confirm: true, ...(to ? { version_id: to } : {}) }, pin ? 'ثُبّتت الدفعة' : 'رُقّيت الدفعة'); }}>{compare.pin ? 'ثبّت الدفعة' : 'رقِّ الدفعة'}</button>}
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
      // خطة المراحل في تبويب «الرحلة» (القرار 23): بند الجاهزية وكل زر للمواعيد يفتحه، لا نافذة ثانية
      edit: () => editCohort(shown), reload: load,
      team: () => setGroups(shown), vis: () => setVis(shown),
      journey: () => onEditJourney(shown.program_id), upgrade: () => upgrade(shown), pin: () => upgrade(shown),
      cert: prog && (() => editCert(prog)), final: prog && (() => setFinalCfg(prog)),
      org: shown.organization_id && (() => navigate({ ctx: 'leaders', tab: 'orgs', id: shown.organization_id })),
      other: (x) => onCohort(x.other), activities: () => { window.location.hash = `#/leaders/activities?cohort=${encodeURIComponent(shown.id)}`; },
      participants: () => { window.location.hash = people; }, approve: () => { window.location.hash = `${people}&status=pending_approval`; },
      // صف في «المتابعة» يفتح ملف العضو
      person: (id) => (onPerson ? onPerson(id) : navigate({ ctx: 'leaders', tab: 'participants', id })),
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
                {!p.versions[0] && !p.archived_at && <> <small className="la-chip warn">{p.requirements ? 'بلا نسخة: تُحفظ مع أول دفعة' : 'بلا متطلبات: لا نسخة ولا دفعة حتى تُبنى رحلته'}</small></>}
                {p.draft_changed && <> <small className="la-chip" title="ما عدّلته في رحلة البرنامج لا يصل إلى أي دفعة حتى تحفظه نسخة وترقّي الدفعة إليها">في المسودة تعديلات لم تُحفظ نسخة</small></>}
                {p.unpinned_cohorts > 0 && <> <small className="la-chip warn">{p.unpinned_cohorts === 1 ? 'دفعة غير مثبتة' : `${cohortsAr(p.unpinned_cohorts)} غير مثبتة`}</small></>}
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
              {canWrite && <button className="la-link" onClick={() => newProgram(p.id)}>برنامج جديد من هذا</button>}
              {canWrite && !p.is_default && <button className="la-link" onClick={() => archive(p)}>{p.archived_at ? 'إعادة' : 'أرشفة'}</button>}
            </div>
          </div>
          {open === p.id && (
            p.versions.length ? (
              <ul className="la-reqs">
                {p.versions.map((v) => (
                  <li key={v.id}>
                    <span><b>{v.number}.</b> {v.label} <small className="la-muted">{date(v.created_at)}{v.created_by ? ` · ${v.created_by}` : ''}{v.cohorts ? ` · ${cohortsAr(v.cohorts)}` : ''}</small>
                      {v.live_cohorts > 0 && <> <small className="la-chip ok">قيد الاستعمال</small></>}</span>
                    <span className="la-row">
                      <button className="la-link" onClick={() => showCompare(v)}>قارن بالحالي</button>
                      {canWrite && <button className="la-link" onClick={() => restore(v)}>استرجع</button>}
                      {canWrite && <button className="la-link" onClick={() => newProgram(p.id, v.id)}>برنامج جديد منها</button>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="la-muted">{p.requirements ? 'لا نسخة بعد. تُحفظ النسخة 1 مع أول دفعة على البرنامج، أو احفظها الآن.' : 'لا نسخة بعد. ابنِ رحلة البرنامج أولًا، ثم تُحفظ نسخته الأولى مع أول دفعة أو بـ«احفظ نسخة».'}</p>
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
                  <td>{v ? `النسخة ${v.number}` : <small className="la-chip warn" title="تتبع البرنامج كما هو: كل تعديل على رحلته يصل إلى أعضائها فورًا">غير مثبتة</small>}
                    {latest && (!v || latest.id !== v.id) && canWrite && <> <button className="la-link" onClick={() => upgrade(c)}>{v ? 'رقِّ إلى' : 'ثبّت على'} {latest.number}</button></>}</td>
                  <td>{[dateOnly(c.starts_on), dateOnly(c.ends_on)].filter(Boolean).join(' إلى ')}</td>
                  <td>{cohortStateAr(c)}</td>
                  <td title="من يتبع الدفعة فعلًا: المسجّل فيها صراحة ومن انضم بجهتها. هو العدد نفسه في المجموعات والقاعة.">{c.members ?? c.enrolled ?? 0}{c.enrolled > 0 && c.enrolled !== c.members && <> <small className="la-muted">({c.enrolled} بتسجيل صريح)</small></>}</td>
                  <td>{(() => { const h = cohortHub({ cohort: c, cohorts: d.cohorts, orgs: d.organizations, programs }); return <span className={`la-chip ${h.missing ? 'warn' : 'ok'}`}>{hubSummary(h)}</span>; })()}</td>
                  <td><button className="btn-sm ghost" onClick={() => onCohort(c.id)}>افتح ملف الدفعة</button>{canWrite && <> <button className="la-link" onClick={() => editCohort(c)}>تحرير</button> <a className="la-link" href={`#/leaders/programs/${encodeURIComponent(c.id)}?view=journey`}>الرحلة والمدد</a> <button className="la-link" onClick={() => setGroups(c)}>الفريق والمجموعات</button> <button className="la-link" onClick={() => setVis(c)}>الرؤية</button></>}</td>
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
