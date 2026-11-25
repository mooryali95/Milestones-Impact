// ════════════════════════════════════════════════════════════════
// المشاركون: القائمة بفلاترها وتصديرها والنقل الجماعي، وملف المشارك
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteFollowUp } from '../erase-follow.js';
import { ErasureBanner, ErasureCard, ErasureLogLine, ErasureSheet, takeOpen } from './Erasure.jsx';
import ImportParticipants from './ImportParticipants.jsx';
import { PersonAccess } from './Payments.jsx';
import Form from '../Form.jsx';
import {
  date, DIM, DIMS, isSuperAdmin, L, LVL, STATUS, SUB_ST, trackOfPlacements,
} from '../leaders.js';
import { Empty, NoMatch, Spinner, useUI } from '../ui.jsx';
import { enrollCohort } from '../cohort-guard.js';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts, sortRows } from '../filters.js';
import { phoneMatches } from '../../../supabase/functions/leaders-api/search-text.js';
import { Submission } from './Handbook.jsx';
import { ExpertAssign } from './ExpertMatch.jsx';
import PersonJourney from './PersonJourney.jsx';
import { stars } from '../handbook.js';
import { approveBlocker } from '../placement-card.js';
import LevelCard from './LevelCard.jsx';
import { GuideTranscriptButton } from '../GuideTranscripts.jsx';
import { PreviewAs } from './CohortVisibility.jsx';
import { STATUS_REASON_MIN, statusNeedsReason } from '../../../supabase/functions/leaders-api/notice-rules.js';

// حد الإجراء الجماعي وإجراءا الحالة والدفعة من BulkPeople.jsx: يستدعيهما تبويب «المتابعة» في ملف الدفعة أيضًا
import { BULK_MAX, BulkEnroll, BulkStatus, useBulkCohorts } from '../BulkPeople.jsx';
import { FileExtras, FullTimeline, InitiativePanel, Observations } from './PersonFile.jsx';
import { Glance, isChapter, NowStrip, keepTab, keptTab, MoreMenu, PersonHeader, primaryAction, seenAt, startTab } from './PersonShell.jsx';
import AssessmentAnswers from './AssessmentAnswers.jsx';
import { NudgeLog, NudgeReport, NudgeSheet } from './Nudges.jsx';
import BulkApprove from './BulkApprove.jsx';
import { readQuery, writeQuery } from '../route.js';
import { colsClass, OPTIONAL_COLS, readCols, writeCols } from '../pt-columns.js';
import { keepSpot, navKey, position, queueLabel, readQueue, saveQueue, takeSpot } from '../review-queue.js';
import { MASTERY as LAB_MASTERY } from '../../../supabase/functions/leaders-api/lab.js';
import { EFFORT_AR } from '../../../supabase/functions/leaders-api/answer-review.js';
import { ONBOARDING_AR, ONBOARDING_STEPS, STUCK_STEPS as STUCK } from '../../../supabase/functions/leaders-api/onboarding.js';

const SCOPE = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };

const DAY = 864e5;
const ACTIVE = ['placed', 'enrolled'];
// عروض سريعة: الحالات التي يتدخل فيها المدير عادة، وعدد كل منها ظاهر على رقاقتها
const PRESETS = [
  { key: 'approval', label: 'بانتظار الاعتماد', test: (p) => p.status === 'pending_approval' },
  // متعثر قبل الاعتماد: لم يكمل ملفه، أو لم يبدأ القياس، أو بدأه ولم يسلّمه (onboarding من الخادم، onboarding.js)
  { key: 'stuck', label: 'لم يكمل التسجيل', test: (p) => STUCK.includes(p.onboarding?.step) },
  // وسم المستعجل من مؤشر الجهد المحفوظ على القياس (assessments.effort)، وطلب الإعادة القائم من القياس الملغى نفسه
  { key: 'rushed', label: 'أجابوا باستعجال', test: (p) => p.effort?.level === 'low' },
  { key: 'retake', label: 'طُلبت منهم الإعادة', test: (p) => !!p.retake },
  { key: 'tentative', label: 'مستوى مبدئي', test: (p) => (p.placements || []).some((x) => !x.approved_at) },
  { key: 'idle', label: 'متوقف 14 يومًا', test: (p, now) => ACTIVE.includes(p.status) && (!seenAt(p) || now - Date.parse(seenAt(p)) > 14 * DAY) },
  { key: 'new', label: 'جدد هذا الأسبوع', test: (p, now) => now - Date.parse(p.created_at) <= 7 * DAY },
  { key: 'orphan', label: 'بلا جهة', test: (p) => !p.organization_id },
  { key: 'out', label: 'موقوف أو منسحب', test: (p) => p.status === 'suspended' || p.status === 'withdrawn' },
];
// كيف وصل المشارك إلى دفعته (pickCohort): تلقائيًا بجهته، أو بنقل يدوي، أو الدفعة المفتوحة لمن لا جهة له
const VIA_COHORT = { organization: 'تلقائيًا برابط جهته', enrollment: 'بنقل يدوي', default: 'تلقائيًا: بلا جهة' };
const KEYS = ['q', 'view', 'status', 'step', 'effort', 'org', 'cohort', 'track', 'joined', 'seen', 'sort'];

export function OrgSelect({ orgs, value, onChange, all = 'كل الجهات', label = 'الجهة' }) {
  return (
    <select className="filter-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      <option value="none">بدون جهة</option>
    </select>
  );
}

function Lvl({ p, d }) {
  const x = (p.placements || []).find((y) => y.dimension === d);
  if (!x) return <span className="la-muted">·</span>;
  return <span className={`la-lvl ${x.level}${x.approved_at ? '' : ' tentative'}`} title={x.approved_at ? 'معتمد' : 'مبدئي'}>{LVL[x.level]}</span>;
}

// أين توقف قبل الاعتماد وما بقي عليه: للمتعثرين فقط، ومن اعتُمد أو ينتظر الاعتماد تكفيه حالته
export function Where({ o }) {
  if (!o || !STUCK.includes(o.step)) return <span className="la-muted">·</span>;
  return (
    <>
      <span className="la-chip warn">{o.label}</span>
      {o.step === 'assessment_doing' && o.total > 0 && <progress className="la-mini" max={o.total} value={o.answered} aria-label={`أجاب ${o.answered} من ${o.total}`} />}
      <br /><small className="la-muted">{o.remaining}</small>
    </>
  );
}

// منتقي «الأعمدة»: الأعمدة الاختيارية وحدها (الدائمة لا تُخفى)، والاختيار محفوظ لهذا المدير
function ColumnPicker({ cols, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btn = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    // التركيز الأول على أول خانة، وEscape يغلق ويعيد التركيز إلى الزر
    ref.current?.querySelector('#pt-cols-menu input')?.focus();
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const n = OPTIONAL_COLS.filter(([k]) => cols[k]).length;
  return (
    <div className="pt-cols" ref={ref}>
      <button ref={btn} type="button" className="refresh-btn" aria-expanded={open} aria-controls="pt-cols-menu" onClick={() => setOpen((x) => !x)}>الأعمدة{n ? ` (+${n})` : ''}</button>
      {open && (
        <div id="pt-cols-menu" className="pt-cols-menu" role="group" aria-label="أعمدة اختيارية">
          {OPTIONAL_COLS.map(([k, l]) => (
            <label key={k}><input type="checkbox" checked={!!cols[k]} onChange={() => onChange({ ...cols, [k]: !cols[k] })} /> {l}</label>
          ))}
          <small className="la-muted">الجهة والمسار يظهران حين تتسع الشاشة، والاسم والحال وما ينتظر ظاهرة دائمًا.</small>
        </div>
      )}
    </div>
  );
}

function List({ orgs, canWrite, onOpen, initialStatus }) {
  const [cols, setColsState] = useState(readCols);
  const setCols = (v) => { setColsState(v); writeCols(v); };
  const { toast, confirm } = useUI();
  const [f, setF, clearF, replaceF] = useFilters(KEYS, initialStatus ? { status: initialStatus } : {}, { scope: 'participants' });
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [moveTo, setMoveTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  // القائمة كاملة مرة واحدة (حتى 500)، والفلترة كلها في المتصفح فتستجيب فورًا
  // capped: القائمة بلغت حد الخادم، فما بعده لا يُرى إلا ببحث على الخادم (search)
  const [cap, setCap] = useState(null);
  const [listCohorts, setListCohorts] = useState([]);
  const [serverQ, setServerQ] = useState('');
  const load = useCallback(async (search = '') => {
    setList(null); setError('');
    const r = await L('admin.participants', search ? { search } : {});
    if (!r.success) { setList([]); return setError(r.message); }
    setList(r.participants || []); setListCohorts(r.cohorts || []); setCap(r.capped ? r.limit : null); setServerQ(search);
  }, []);
  useEffect(() => { load(); }, [load]);
  // طلبات حذف البيانات القائمة من المشاركين أنفسهم: تُنفَّذ من صفحة المشارك بمسار الحذف القائم
  const [erasures, setErasures] = useState(null);   // رد admin.erasures كما هو: ready والطلبات بأيامها
  // بعد كل تحميل للقائمة مرة واحدة: list تبدأ null ثم تُملأ، فكان يُطلب مرتين عند الفتح
  useEffect(() => { if (list) L('admin.erasures', {}).then((r) => setErasures(r.success ? r : null)); }, [list]);

  const all = list || [];
  const tracks = useMemo(() => [...new Set(all.map((p) => trackOfPlacements(p.placements)).filter(Boolean))].sort(), [all]);
  const orgOf = (p) => orgs.find((o) => o.id === p.organization_id);
  const fields = useMemo(() => [
    { key: 'status', label: 'الحالات', get: (p) => p.status, options: Object.entries(STATUS) },
    { key: 'org', label: 'الجهات', get: (p) => p.organization_id || 'none', options: [...orgs.map((o) => [o.id, o.name]), ['none', 'بدون جهة']] },
    { key: 'track', label: 'المسارات', get: (p) => trackOfPlacements(p.placements) || p.track, options: tracks.map((k) => [k, k]) },
    // بعد الثلاثة الظاهرة (الباقي خلف «+ فلاتر»)، والعرض السريع «لم يكمل التسجيل» يغني عنه في الغالب
    { key: 'step', label: 'أين توقف', get: (p) => p.onboarding?.step, options: Object.entries(ONBOARDING_AR) },
    { key: 'effort', label: 'جدية الإجابة', get: (p) => p.effort?.level, options: Object.entries(EFFORT_AR) },
    // دفعة المشارك من الخادم بقاعدة pickCohort نفسها التي تحكم رحلته
    { key: 'cohort', label: 'الدفعات', get: (p) => p.cohort_id || 'none', options: [...listCohorts.map((c) => [c.id, c.name]), ['none', 'بلا دفعة']] },
    { key: 'joined', label: 'التسجيل', all: 'أي تاريخ تسجيل', type: 'period', get: (p) => p.created_at },
    { key: 'seen', label: 'آخر نشاط', all: 'أي آخر نشاط', type: 'period', get: seenAt },
  ], [orgs, tracks, listCohorts]);
  // phone: الجوال يُطابَق بأي صيغة يُكتب بها (filters.js)، وهو في النص أيضًا كما كان
  const spec = { fields, presets: PRESETS, phone: (p) => p.phone, text: (p) => [p.full_name, p.email, p.phone, p.job_title, orgOf(p)?.name || p.organization_name, trackOfPlacements(p.placements)].join(' ') };
  const SORTS = useMemo(() => ({
    name: (p) => p.full_name, org: (p) => orgOf(p)?.name || p.organization_name, track: (p) => trackOfPlacements(p.placements),
    status: (p) => STATUS[p.status] || p.status, step: (p) => ONBOARDING_STEPS.indexOf(p.onboarding?.step), joined: (p) => p.created_at,
    // ما ينتظر قرار الإدارة أولًا، ثم ما أُعيد للمشارك (waiting من whereNow في الخادم، now.js)
    waiting: (p) => (p.waiting?.who === 'admin' ? 2000 : p.waiting?.who === 'participant' ? 1000 : 0) + (p.waiting?.n || 0),
  }), [orgs]); // eslint-disable-line
  const shown = useMemo(() => sortRows(applyFilters(all, spec, f), SORTS, f.sort), [all, f, fields, SORTS]);
  const counts = useMemo(() => presetCounts(all, PRESETS), [all]);
  // فتح مشارك يحفظ ترتيب ما يظهر الآن، فيتنقل المدير في الملفات بالسابق والتالي (review-queue.js)
  const open = (id) => { saveQueue(shown.map((p) => p.id), queueLabel(PRESETS, f.view)); keepSpot(window.scrollY, id); onOpen(id); };
  // الرجوع من الملف: التمرير نفسه والتركيز على صف آخر ملف فُتح (review-queue.js)، بعد أن تُرسم القائمة
  const spot = useRef(undefined);
  if (spot.current === undefined) spot.current = takeSpot();
  useEffect(() => {
    const s = spot.current;
    if (!list || !s) return;
    spot.current = null;
    requestAnimationFrame(() => {
      window.scrollTo({ top: s.y });
      const row = s.id && document.querySelector(`tr[data-pid="${CSS.escape(s.id)}"]`);
      if (row) row.focus({ preventScroll: true });
    });
  }, [list]);

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((p) => picked.has(p.id));
  const toggleAll = () => setPicked((s) => { const n = new Set(s); shown.forEach((p) => (allOn ? n.delete(p.id) : n.add(p.id))); return n; });

  const move = async () => {
    if (!moveTo) return toast('اختر الجهة');
    // الهدف باسمه في التأكيد، فلا يُنقل أحد إلى جهة غير المقصودة
    const target = moveTo === 'none' ? 'فكّ ارتباطهم بأي جهة' : `«${orgs.find((o) => o.id === moveTo)?.name || 'الجهة المختارة'}»`;
    if (!(await confirm(moveTo === 'none' ? `${target} لـ${picked.size} مشارك؟` : `نقل ${picked.size} مشارك إلى ${target}؟`))) return;
    const r = await L('admin.assign-org', { participant_ids: [...picked], organization_id: moveTo === 'none' ? null : moveTo });
    toast(r.success ? `نُقل ${r.moved ?? picked.size} مشارك` : r.message);
    if (r.success) { setPicked(new Set()); setMoveTo(''); load(); }
  };
  // التذكير الموحد للمحددين في أي مرحلة (Nudges.jsx): معاينة مجمّعة بالمرحلة قبل الإرسال، والحد المشترك على الخادم
  const [nudging, setNudging] = useState(null);
  const [report, setReport] = useState(false);
  // طلب إعادة القياس للمحددين ممن سلّموا ولم يُعتمدوا (can_retake من الخادم): المدخل نفسه الذي في ملف المشارك
  const pickedRetake = all.filter((p) => picked.has(p.id) && p.can_retake).length;
  // الاعتماد الجماعي بالمستوى المحسوب (BulkApprove): للمحددين ممن ينتظرون الاعتماد، والحكم والاستبقاء على الخادم
  const [bulkApprove, setBulkApprove] = useState(null);
  const pickedPending = all.filter((p) => picked.has(p.id) && p.status === 'pending_approval').map((p) => p.id);
  const shownPending = shown.filter((p) => p.status === 'pending_approval').map((p) => p.id);
  const askRetake = async () => {
    if (!(await confirm(`طلب إعادة القياس من ${pickedRetake} مشارك؟ يُلغى قياسهم الحالي، وتظهر لكل منهم بطاقة في الموقع ويصله بريد يطلب الإعادة بتأنٍّ.`, { danger: true }))) return;
    const r = await L('admin.reset-assessment', { participant_ids: all.filter((p) => picked.has(p.id) && p.can_retake).map((p) => p.id) });
    if (!r.success) return toast(r.message);
    toast(`طُلبت الإعادة من ${r.done}${r.skipped ? `، وتُخطّي ${r.skipped}` : ''}`);
    setPicked(new Set()); load();
  };
  // أعمدة التصدير: تعريف واحد، والزر الموحد يسأل ماذا يُصدَّر وأي أعمدة
  const lv = (p, d) => LVL[(p.placements || []).find((x) => x.dimension === d)?.level] || '';
  // تغيير الحالة والإلحاق بدفعة للمحددين: الإجراءان نفساهما اللذان في ملف المشارك (admin.status و admin.cohort-enroll)، بطلب واحد (BulkPeople.jsx)
  const cohorts = useBulkCohorts(canWrite);
  const bulkDone = () => { setPicked(new Set()); load(serverQ); };
  const exportCols = [
    { key: 'name', label: 'الاسم', width: 26, get: (p) => p.full_name }, { key: 'email', label: 'البريد', width: 30, get: (p) => p.email },
    { key: 'phone', label: 'الجوال', width: 16, get: (p) => p.phone }, { key: 'title', label: 'المسمى', width: 22, get: (p) => p.job_title },
    { key: 'org', label: 'الجهة', width: 24, get: (p) => orgOf(p)?.name || p.organization_name },
    { key: 'years', label: 'سنوات الخبرة', width: 12, get: (p) => p.years_experience },
    ...DIMS.map((d) => ({ key: `lvl_${d}`, label: DIM[d], width: 12, get: (p) => lv(p, d) })),
    { key: 'cohort', label: 'الدفعة', width: 22, get: (p) => listCohorts.find((c) => c.id === p.cohort_id)?.name },
    { key: 'track', label: 'المسار', width: 10, get: (p) => trackOfPlacements(p.placements) },
    { key: 'status', label: 'الحالة', width: 18, get: (p) => STATUS[p.status] || p.status },
    { key: 'step', label: 'أين توقف', width: 18, get: (p) => p.onboarding?.label }, { key: 'remaining', label: 'المتبقي', width: 40, get: (p) => p.onboarding?.remaining },
    { key: 'effort', label: 'جدية الإجابة', width: 16, get: (p) => EFFORT_AR[p.effort?.level] },
    { key: 'retake', label: 'طلب الإعادة', width: 16, get: (p) => (p.retake ? date(p.retake.requested_at) : '') },
    { key: 'joined', label: 'التسجيل', width: 16, get: (p) => date(p.created_at) }, { key: 'seen', label: 'آخر نشاط', width: 16, get: (p) => date(seenAt(p)) }, { key: 'login', label: 'آخر دخول', width: 16, get: (p) => date(p.last_login_at) },
  ];

  return (
    <>
      <FilterBar scope="participants" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={PRESETS} counts={counts}
        shown={shown.length} total={all.length} noun="مشارك" placeholder="ابحث بالاسم أو البريد أو الجوال أو الجهة"
        capped={cap ? { limit: cap, onSearch: (q) => load(q) } : null}
        actions={<>
          <ExportButton scope="participants" meta={{ kind: 'PPL', title: 'مشاركو برنامج القادة', sheet: 'المشاركون', file: 'Participants' }} columns={exportCols}
            all={all} filtered={shown} selected={all.filter((p) => picked.has(p.id))} noun="مشارك" />
          <ColumnPicker cols={cols} onChange={setCols} />
          {canWrite && <button className="refresh-btn" type="button" onClick={() => setAdding(true)}>+ مشارك</button>}
          {/* فعل أساسي واحد ظاهر (+ مشارك) والثانوية في «المزيد» (تدقيق 2026-11-23، المرحلة 2) */}
          <MoreMenu label="المزيد من إجراءات المشاركين" items={[
            canWrite && { label: 'استيراد', run: () => setImporting(true) },
            { label: 'فاعلية التذكير', run: () => setReport(true) },
          ]} />
        </>} />
      {serverQ && <div className="flt-cap" role="status">نتائج البحث في كل المشاركين عن «{serverQ}». <button type="button" className="flt-link" onClick={() => load()}>عُد إلى القائمة</button></div>}
      <ErasureBanner data={erasures} isSuper={isSuperAdmin()} onOpen={onOpen} />
      {canWrite && !picked.size && f.view === 'approval' && shownPending.length > 0 && (
        <div className="la-bulk" role="note">
          <span>{shownPending.length} بانتظار الاعتماد في هذه القائمة. المتسق قياسه يُعتمد دفعة واحدة، ومن عليه إشارة يُستبقى لتراجعه.</span>
          <button className="btn-sm primary" onClick={() => setBulkApprove(shownPending.slice(0, 50))}>اعتمد المتسقين{shownPending.length > 50 ? ' (أول 50)' : ''}…</button>
        </div>
      )}
      {report && <NudgeReport onClose={() => setReport(false)} onOpen={(id) => { setReport(false); onOpen(id); }} />}
      {nudging && <NudgeSheet ids={nudging} onClose={(sent) => { setNudging(null); if (sent) setPicked(new Set()); }} />}
      {bulkApprove && <BulkApprove ids={bulkApprove} onPerson={onOpen} onClose={(changed) => { setBulkApprove(null); if (changed) { setPicked(new Set()); load(serverQ); } }} />}
      {canWrite && picked.size > 0 && (
        <div className="la-bulk">
          <span><b>{picked.size}</b> محدد</span>
          {pickedPending.length > 0 && <button className="btn-sm primary" onClick={() => setBulkApprove(pickedPending.slice(0, 50))} title="يُعتمد المتسق بمستواه المحسوب، ويُستبقى من عليه إشارة">اعتماد جماعي ({pickedPending.length})…</button>}
          <OrgSelect orgs={orgs} value={moveTo} onChange={setMoveTo} all="نقل إلى جهة…" label="نقل إلى جهة" />
          <button className="btn-sm primary" onClick={move}>نقل</button>
          <BulkStatus ids={[...picked]} onDone={bulkDone} />
          <BulkEnroll ids={[...picked]} cohorts={cohorts} onDone={bulkDone} />
          {pickedRetake > 0 && <button className="btn-sm ghost" onClick={askRetake} title="يُلغى قياسهم، وتظهر لكل منهم بطاقة في الموقع ويصله بريد يطلب الإعادة بتأنٍّ">اطلب إعادة القياس ({pickedRetake})</button>}
          <button className="btn-sm ghost" onClick={() => setNudging([...picked].slice(0, BULK_MAX))} title={picked.size > BULK_MAX ? `التذكير ${BULK_MAX} في كل مرة: يُذكَّر أول ${BULK_MAX} من المحددين، ثم حدّد الباقين` : 'بريد يسمّي لكل واحد مرحلته وخطوته التالية، بمعاينة قبل الإرسال'}>
            {picked.size > BULK_MAX ? `ذكّر أول ${BULK_MAX} من المحددين` : `ذكّر المحددين (${picked.size})`}</button>
          <button className="btn-sm ghost" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
        </div>
      )}
      <div className="table-wrap"><table className={`data-table la-cards t24 pt-table${canWrite ? ' has-pick' : ''} ${colsClass(cols)}`}>
        <thead><tr>
          {canWrite && <th className="col-pick"><input type="checkbox" aria-label="تحديد الكل" checked={allOn} onChange={toggleAll} /></th>}
          <SortTh k="name" state={f} set={setF} className="col-name">الاسم</SortTh><SortTh k="org" state={f} set={setF} className="col-wide col-org">الجهة</SortTh>{DIMS.map((d) => <th key={d} className="col-levels">{DIM[d]}</th>)}<SortTh k="track" state={f} set={setF} className="col-wide col-track">المسار</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh><SortTh k="step" state={f} set={setF}>أين توقف</SortTh><SortTh k="waiting" state={f} set={setF}>بانتظار</SortTh><SortTh k="joined" state={f} set={setF} className="col-joined">التسجيل</SortTh>
        </tr></thead>
        <tbody>
          {!list ? <tr className="loading-row"><td colSpan={11}><Spinner /></td></tr>
            : error ? <tr><td colSpan={11}><div className="la-err">{error} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></td></tr>
              : !shown.length ? <tr><td colSpan={11}>{all.length ? <NoMatch what="مشاركين" /> : <Empty title="لا مشاركين بعد" hint="يظهر هنا كل من يسجل من رابط جهته، ومن تضيفه أنت.">{canWrite && <><button className="btn-sm primary" type="button" onClick={() => setImporting(true)}>أضف مشاركين من قائمة</button><button className="btn-sm ghost" type="button" onClick={() => setAdding(true)}>أضف مشاركًا واحدًا</button></>}</Empty>}</td></tr>
                : shown.map((p) => {
                  const og = orgOf(p);
                  const tk = trackOfPlacements(p.placements);
                  return (
                    <tr key={p.id} data-pid={p.id} tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => open(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(p.id); }}>
                      {canWrite && <td className="col-pick" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`تحديد ${p.full_name}`} checked={picked.has(p.id)} onChange={() => toggle(p.id)} /></td>}
                      <td data-label="الاسم" className="col-name"><b>{p.full_name}</b>{p.is_test && <> <span className="la-chip" title="حساب اختبار داخلي: خارج الإحصاءات">اختبار</span></>}<br /><small className="la-muted" dir="ltr">{p.email}</small>
                        {/* وُجد برقمه: الرقم ظاهر تحت البريد، فيُعرف لماذا ظهر الصف */}
                        {phoneMatches(f.q, p.phone) && <><br /><small className="la-muted pt-phone" dir="ltr">{p.phone}</small></>}</td>
                      <td data-label="الجهة" className="col-wide col-org">{og && <><span className="la-orgtag" title="الجهة الراعية" style={{ '--org': og.color || 'var(--brand-gold)' }}>{og.short_name || og.name}</span><br /></>}{p.organization_name}<br /><small className="la-muted">{p.job_title}</small></td>
                      {DIMS.map((d) => <td key={d} data-label={DIM[d]} className="col-levels"><Lvl p={p} d={d} /></td>)}
                      <td data-label="المسار" className="col-wide col-track">{tk ? <code className="la-code">{tk}</code> : <span className="la-muted">·</span>}</td>
                      <td data-label="الحالة"><span className={`la-chip ${p.status === 'pending_approval' ? 'warn' : ''}`}>{STATUS[p.status] || p.status}</span>
                        {p.effort?.level === 'low' && <> <span className="la-chip bad" title={p.effort.note}>مستعجل</span></>}
                        {p.effort?.level === 'watch' && <> <span className="la-chip warn" title={p.effort.note}>يُراجع</span></>}
                        {p.retake && <> <span className="la-chip" title={`طُلبت الإعادة ${date(p.retake.requested_at)}، ولم يسلّم قياسًا جديدًا بعد`}>طُلبت الإعادة</span></>}</td>
                      <td data-label="أين توقف"><Where o={p.onboarding} /></td>
                      <td data-label="بانتظار"><Waiting w={p.waiting} /></td>
                      <td data-label="التسجيل" className="col-joined">{date(p.created_at)}</td>
                    </tr>
                  );
                })}
        </tbody>
      </table></div>
      {importing && <ImportParticipants orgs={orgs} onClose={(added) => { setImporting(false); if (added) { toast('أُضيف المشاركون'); load(); } }} />}
      {adding && (
        <Form title="إضافة مشارك"
          fields={[{ name: 'full_name', label: 'الاسم' }, { name: 'email', label: 'البريد', type: 'email', dir: 'ltr' }, { name: 'organization_name', label: 'الجهة' }, { name: 'job_title', label: 'المسمى' }]}
          onSave={(row) => L('admin.create-participant', row)}
          onClose={(saved) => { setAdding(false); if (saved) { toast('أُضيف المشارك'); load(); } }} />
      )}
    </>
  );
}

// حذف مشارك بأثر: ما سيُمحى معه، وما يمنعه (شهادة سارية أو دفع مؤكد)؛ للمدير الأعلى بكتابة البريد
function PersonDanger({ p, onDeleted, erasurePending = false }) {
  const { toast, confirm } = useUI();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open && !impact) L('admin.participant-impact', { participant_id: p.id }).then(setImpact); }, [open, impact, p.id]);
  const remove = async () => {
    const r = await L('admin.participant-delete', { participant_id: p.id, confirm_email: typed });
    if (!r.success) return toast(r.message);
    // ما بقي عليه في نافذة لا تختفي وحدها: فيها العنوان الوحيد الباقي لإرسال التأكيد يدويًّا
    const follow = deleteFollowUp(r);
    if (follow) await confirm(follow, { ok: 'فهمت' }); else toast('حُذف المشارك');
    onDeleted();
  };
  const c = impact?.counts || {};
  return (
    <section className="la-card of-danger">
      <div className="of-danger-head">
        <div><b>منطقة الخطر</b><small>الإيقاف (تغيير الحالة) يحفظ البيانات. الحذف نهائي ويمحو ملفاته المرفوعة، وهو للمدير الأعلى.</small></div>
        {!erasurePending && <button type="button" className="btn-sm danger" aria-expanded={open} onClick={() => setOpen(!open)}>حذف المشارك…</button>}
      </div>
      {/* للتنفيذ مسار واحد: من له طلب قائم يُنفَّذ طلبه من بطاقته فيُغلق ويُبلَّغ (التصور 4.9) */}
      {erasurePending && <p className="la-where" role="note">لهذا المشارك طلب حذف قائم. نفّذه من بطاقة الطلب أعلى الملف ليُغلق الطلب ويُبلَّغ.</p>}
      {open && (
        <div className="of-danger-body">
          {!impact ? <small>جارٍ حساب الأثر…</small> : !impact.success ? <p className="of-err">{impact.message}</p> : impact.blockers.length ? (
            <p className="of-err">لا يمكن حذفه الآن: {impact.blockers.join('، ')}.</p>
          ) : (
            <>
              <p>سيُمحى معه: {c.assessments} قياس، و{c.submissions} نموذج، و{c.capstones} وثيقة، و{c.requirements} متطلب، و{c.sessions} جلسة، وكل ملفاته المرفوعة. اكتب بريده للتأكيد:</p>
              <input dir="ltr" aria-label="اكتب بريد المشارك للتأكيد" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={p.email} />
              <button type="button" className="btn-sm danger" disabled={typed.trim().toLowerCase() !== p.email} onClick={remove}>حذف نهائي</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const EDIT_FIELDS = [
  { name: 'full_name', label: 'الاسم' },
  { name: 'email', label: 'البريد', type: 'email', dir: 'ltr', help: 'تغييره يُسقط توثيقه، فيوثّقه المشارك عند دخوله التالي' },
  { name: 'phone', label: 'الجوال', dir: 'ltr' },
  { name: 'job_title', label: 'المسمى' },
  { name: 'organization_name', label: 'جهة العمل (نص يكتبه المشارك)' },
];

function Person({ id, orgs, canWrite, onBack, onNav }) {
  const { toast, confirm, prompt } = useUI();
  const [picked, setTab] = useState(null); // التبويب الذي اختاره المدير في هذا الملف
  // موضعه في القائمة التي فُتح منها (لقطة الجلسة)، وإلا فلا شريط تنقل
  const pos = useMemo(() => position(readQueue(), id), [id]);
  useEffect(() => {
    if (!pos) return undefined;
    const k = (e) => { const to = navKey(e); const dest = to && pos[to]; if (dest) { e.preventDefault(); onNav(dest); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [pos, onNav]);
  const [previewAs, setPreviewAs] = useState(false);
  // طلب الحذف: بطاقته أعلى الملف، وورقته تُفتح من البطاقة أو الشريط أو رابط بريد المالك (?erasure=open)
  const [erasure, setErasure] = useState(null);
  const [erasureOpen, setErasureOpen] = useState(() => takeOpen(id) || /(^|&)erasure=open(&|$)/.test(readQuery()));
  const loadErasure = useCallback(() => L('admin.erasure-get', { participant_id: id }).then((x) => setErasure(x.success ? x : null)), [id]);
  useEffect(() => { loadErasure(); }, [loadErasure]);
  const closeErasure = () => { setErasureOpen(false); if (/erasure=open/.test(readQuery())) writeQuery(''); };
  const [r, setR] = useState(null);
  const [status, setStatus] = useState('');
  const [levels, setLevels] = useState({});
  const [notes, setNotes] = useState({});
  const [sub, setSub] = useState(null);
  const [editing, setEditing] = useState(false);
  const [cohorts, setCohorts] = useState(null);   // الدفعات المفتوحة للتسجيل الصريح
  const [cohortTo, setCohortTo] = useState('');
  // «إجابات القياس»: لوحة جانبية للمدير ذي الكتابة، وعنوانها قابل للنسخ (?answers=<البُعد> أو all)
  const [answers, setAnswers] = useState(() => (canWrite ? new URLSearchParams(readQuery()).get('answers') : null));
  const openAnswers = (d) => { const v = d || 'all'; setAnswers(v); writeQuery(`answers=${encodeURIComponent(v)}`); };
  const closeAnswers = () => { setAnswers(null); writeQuery(''); };
  useEffect(() => {
    if (!canWrite) return;
    L('admin.programs', {}).then((x) => setCohorts(x.success ? (x.cohorts || []).filter((c) => !c.is_default && c.status !== 'closed') : []));
  }, [canWrite]);

  const load = useCallback(async () => {
    const d = await L('admin.participant', { id });
    setR(d);
    if (!d.success) return;
    setStatus(d.participant.status);
    const latest = (d.assessments || []).find((a) => a.status === 'submitted');
    const lv = {}, nt = {};
    DIMS.forEach((dm) => {
      const x = d.profile?.dimensions.find((y) => y.dimension === dm);
      const ev = latest?.assessment_results?.find((y) => y.dimension === dm)?.evaluation;
      // قبل الاعتماد يُقترح مستوى المعيار؛ بعده يبقى ما اعتُمد
      lv[dm] = (!x?.approved && ev ? ev.level : x?.level) || '';
      nt[dm] = x?.note || '';
    });
    setLevels(lv); setNotes(nt);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!r) return <div className="la-load"><Spinner /></div>;
  if (!r.success) return <><button className="la-link" onClick={onBack}>→ كل المشاركين</button><div className="la-err">{r.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></>;

  const p = r.participant;
  const prof = r.profile;
  const latest = (r.assessments || []).find((a) => a.status === 'submitted');
  const res = (d) => latest?.assessment_results?.find((x) => x.dimension === d);
  // المستوى القائم في البُعد: المعتمد أو المسجل من القياس، وإلا المحسوب من آخر قياس
  const currentLevel = (d) => prof?.dimensions?.find((y) => y.dimension === d)?.level || res(d)?.evaluation?.level || null;
  const act = async (action, body, ok) => {
    const d = await L(action, body);
    toast(d.success ? ok : d.message);
    if (d.success) load();
    return d;
  };

  // ما يمنع الاعتماد ظاهر تحت الزر: مستوى ناقص، أو مخالفة المستوى القائم بلا تعليل (الخادم يرفض بدونه)
  const blocker = approveBlocker(DIMS, { levels, notes, currentLevel, dimName: (d) => DIM[d] });
  const approve = async (next = false) => {
    if (blocker) return toast(blocker.text);
    if (!(await confirm('اعتماد المسار وإبلاغ المشارك بالبريد؟'))) return;
    const d = await act('admin.approve', { participant_id: p.id, levels, notes }, 'اعتُمد المسار وأُبلغ المشارك');
    // «اعتمد وانتقل للتالي»: في مراجعة متتالية يفتح التالي في القائمة بعد نجاح الاعتماد
    if (d.success && next && pos?.next) onNav(pos.next);
  };
  const reset = async () => {
    if (!(await confirm('يُلغى القياس الحالي ويعيده المشارك من البداية، وتظهر له بطاقة في الموقع ويصله بريد يطلب الإعادة. المستوى المعتمد يبقى حتى تعتمد غيره. متابعة؟', { danger: true }))) return;
    act('admin.reset-assessment', { participant_id: p.id }, 'طُلبت الإعادة وأُبلغ المشارك');
  };
  // مراجعة بند: الإرجاع بملاحظة للمشارك، والتجاوز اليدوي لبند يحسمه دليله بسبب يأتي مكتوبًا (PersonJourney.jsx)
  const review = async (req, st, given = null, override = false) => {
    let note = given;
    if (st === 'returned' && note == null) { note = await prompt('ملاحظة للمشارك: ما المطلوب تعديله؟'); if (note === null) return; }
    act('admin.review', { participant_id: p.id, requirement_id: req, status: st, note, ...(override ? { override: true } : {}) }, st === 'returned' ? 'أُعيد مع الملاحظة' : override ? 'اعتُمد بتجاوز يدوي' : 'تم');
  };
  // تدخل في مرحلة لهذا المشارك وحده، بسبب مكتوب يُحفظ في السجل. lines: ما ينقص المرحلة تحت السؤال («أكمل هذه المرحلة»)
  const stageAct = async (s, action, lines = null) => {
    const msg = { open: `فتح «${s.title_ar}» له الآن؟`, complete: `اعتماد اكتمال «${s.title_ar}»؟`, skip: `إعفاؤه من «${s.title_ar}»؟`, '': `إلغاء التدخل في «${s.title_ar}» وإعادتها لقواعد البرنامج؟` }[action];
    const note = await prompt(`${msg}\nالسبب (يُحفظ في السجل):`, '', lines?.length ? { lines } : {});
    if (note === null) return;
    if (action && !String(note).trim()) return toast('اكتب السبب');
    act('admin.stage-override', { participant_id: p.id, stage_key: s.key, stage_action: action, note }, 'تم');
  };
  // الملفات الخاصة تُفتح بطلب صريح يُسجَّل في السجل، للمدير وحده (الخادم يرفض غيره)
  const evidence = async (path) => {
    const d = await L('admin.evidence-url', { participant_id: p.id, path });
    if (d.success) window.open(d.url, '_blank', 'noopener'); else toast(d.message);
  };
  // تغيير الحالة بتأكيد يسمي أثره (تدقيق الجاهزية admin-core-9): الانسحاب قبل فتح أول باب يرد مقعد الراعي
  // ولا تعيده إعادة الحالة (admin.ts setStatus)، والإيقاف يمنعه من الدخول (participant.ts)
  const changeStatus = async () => {
    const to = `تغيير حالة ${p.full_name} من «${STATUS[p.status] || p.status}» إلى «${STATUS[status] || status}»؟`;
    const effect = {
      withdrawn: ' يخرج من البرنامج، وإن لم يفتح أي باب من الكتاب بعدُ أُلغي إعفاء رعاية جهته ورُدّ مقعده إليها، ولا تعيده إعادة الحالة لاحقًا.',
      suspended: ' يخرج من البرنامج ولا يستطيع الدخول إلى حسابه حتى تعيد حالته.',
    }[status] || '';
    if (!(await confirm(to + effect, { danger: !!effect, ok: 'تغيير الحالة' }))) return;
    // الإيقاف والانسحاب بسبب مكتوب: يُحفظ في ملفه ويصله بالبريد (الخادم يرفض بدونه)
    let reason;
    if (statusNeedsReason(status)) {
      reason = await prompt('سبب الإيقاف أو الانسحاب (يُحفظ في ملف المشارك ويُبلَّغ به بالبريد):');
      if (reason === null) return;
      if (String(reason).trim().length < STATUS_REASON_MIN) return toast('اكتب السبب بوضوح');
    }
    act('admin.status', { participant_id: p.id, status, ...(reason ? { reason } : {}) }, 'تم التحديث');
  };
  // التسجيل الصريح في دفعة (كان يتطلب تعديل القاعدة يدويًا): يُسحب من أي دفعة أخرى سُجّل فيها صراحةً
  const enroll = async () => {
    const c = (cohorts || []).find((x) => x.id === cohortTo);
    // النقل اليدوي يتجاوز السعة عمدًا (cohortEnroll)، فيُنبَّه المدير حين تكون الدفعة ممتلئة
    const full = c?.capacity != null && Number(c.enrolled || 0) >= Number(c.capacity) ? ` تنبيه: الدفعة ممتلئة (${c.enrolled} من ${c.capacity})، والنقل اليدوي يتجاوز سعتها.` : '';
    if (!(await confirm(`نقل ${p.full_name} إلى دفعة «${c?.name}»؟ يبقى فيها مهما كانت جهته، ويُسحب من أي دفعة أخرى أُلحق بها يدويًا.${full}`))) return;
    const d = await enrollCohort({ cohort_id: cohortTo, participant_ids: [p.id] }, confirm);
    toast(d.success ? 'نُقل إلى الدفعة' : d.message);
    if (d.success) { setCohortTo(''); load(); }
  };

  const pts = r.points || { total: 0, rank: { title: 'مستكشف' } };
  // فصول وثيقة المبادرة في تبويب «المبادرة» وحده بحالتها الواحدة وفعل «قيّم» (المرحلة 1)، و«التعلم» يشير إليها
  const learnModels = (r.models || []).filter((x) => !isChapter(x));
  const chapters = (r.models || []).filter(isChapter);
  const book = r.book || [];
  const sc = book.reduce((a, b) => [a[0] + (b.quiz_score || 0), a[1] + (b.quiz_total || 0)], [0, 0]);

  const tab = picked || startTab(p, keptTab());
  const orgOf = (orgs || []).find((o) => o.id === p.organization_id);
  // التبويب الظاهر: المنتظر اعتماده يفتح على القرار، وغيره على آخر تبويب في الجلسة (PersonShell.jsx)
  const show = (t, focus) => {
    setTab(t); keepTab(t);
    if (focus) setTimeout(() => { const el = document.getElementById(focus); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } }, 0);
  };
  const primary = primaryAction(r, canWrite);
  const panel = (k, body) => tab === k && <div id={`pf-panel-${k}`} role="tabpanel" aria-labelledby={`pf-tab-${k}`} className="pf-panel">{body}</div>;
  const menu = canWrite && <MoreMenu items={[
    { label: 'تعديل البيانات', run: () => setEditing(true) },
    { label: 'إعادة القياس', run: reset },
    // ما يصل المستشار أو الخبير المسند عن هذا المشارك بمفاتيح الرؤية النافذة (visibility.js)
    { label: 'عاين بعين الخبير', run: () => setPreviewAs(true) },
    // حساب اختبار داخلي: خارج الإحصاءات وحدها، ويبقى حسابًا عاديًا (قرار المالك 2026-11-11)
    { label: p.is_test ? 'إلغاء علامة الاختبار' : 'اجعله حساب اختبار', title: 'يُستبعد من النظرة العامة وأعداد الجهات ولوحتها والمالية وتقرير الأثر',
      run: () => act('admin.participant-save', { participant_id: p.id, fields: { is_test: !p.is_test } }, p.is_test ? 'عاد محسوبًا في الإحصاءات' : 'صار حساب اختبار، خارج الإحصاءات') },
  ]} />;

  return (
    <>
      <PersonHeader r={r} org={orgOf} tab={tab} setTab={(t) => show(t)} primary={primary} onPrimary={() => show(primary.tab, primary.focus)} menu={menu}
        nav={<QueueNav pos={pos} onBack={onBack} onNav={onNav} />} />
      <NowStrip now={r.now} onTab={(t) => show(t)} />
      <ErasureCard e={erasure} onOpen={() => setErasureOpen(true)} />
      {erasureOpen && erasure?.request && (
        <ErasureSheet e={erasure} onClose={closeErasure}
          onDecided={() => { closeErasure(); loadErasure(); load(); }} onDeleted={() => { closeErasure(); onBack(); }} />
      )}
      {/* إجابات القياس نافذة فوق الملف لا داخل تبويب: رابطها المنسوخ (?answers=) يفتحها أيًا كان التبويب الافتتاحي */}
      {answers && latest && <AssessmentAnswers participant={p} dim={answers} onClose={closeAnswers} />}
      <div className="pf-body">
        <div className="pf-main">
          {panel('decision', <>
              {r.retake && <p className="la-where" role="status"><b>طُلبت إعادة القياس</b> {date(r.retake.requested_at)} ({r.retake.reason === 'effort' ? 'لاستعجال في الإجابة' : 'بقرار إداري'})، ولم يسلّم قياسًا جديدًا بعد.</p>}
              {STUCK.includes(r.onboarding?.step) && (
                <p className="la-where" role="status">
                  <b>أين توقف:</b> {r.onboarding.label}. {r.onboarding.remaining}.
                  {r.onboarding.started_at && <> بدأ القياس {date(r.onboarding.started_at)}.</>}
                  {r.onboarding.last_answer_at && <> آخر إجابة {date(r.onboarding.last_answer_at)}.</>}
                  {!seenAt(p) ? ' لم يدخل بعد التسجيل.' : <> آخر نشاط {date(seenAt(p))}.</>}
                </p>
              )}
              {r.needs?.length > 0 && <p className="la-muted">المطلوب الآن: {r.needs.map((n) => n.text).join(' · ')}</p>}
          <LevelCard prof={prof} latest={latest} model={r.placement_model} effort={r.effort} canWrite={canWrite} levels={levels} setLevels={setLevels}
            notes={notes} setNotes={setNotes} currentLevel={currentLevel} blocker={blocker} onApprove={() => approve(false)}
            onApproveNext={pos?.next ? () => approve(true) : null} onAnswers={canWrite ? openAnswers : null} />
          </>)}

          {panel('journey', <PersonJourney key={(r.journey || []).map((s) => s.status).join()} r={r} canWrite={canWrite} onDone={load}
            onReview={review} onStage={stageAct} onEvidence={evidence} />)}

          {panel('learning', <>
          <section className="la-card la-book-card">
            <div className="la-row between"><h3 id="pf-book-h">كتاب القائد والنماذج</h3><span className="rank-chip">{pts.rank.title} · {pts.total} نقطة</span></div>
            <div className="la-book-kpis">
              <span><b>{book.length}</b>باب أتمّه</span>
              <span><b>{sc[1] ? Math.round((sc[0] / sc[1]) * 100) : 0}%</b>دقة الاختبارات</span>
              <span><b>{learnModels.filter((x) => x.status !== 'draft').length}</b>نموذج سلّمه</span>
            </div>
            {/* «التوجيه والإرشاد» G3: أعداد بلا نص، والمحادثة خاصة بالمشارك */}
            {r.guidance?.asked > 0 && <p className="la-muted small" data-guidance-counts>المساعد الذكي في آخر {r.guidance.days} يومًا: {r.guidance.asked} سؤالًا، ولم يتأكد في {r.guidance.unsure}، وطلب التأكد من خبير {r.guidance.confirmed}.</p>}
            {r.guidance && <GuideTranscriptButton pid={r.participant.id} />}
            {chapters.length > 0 && (
              <p className="la-muted small" data-chapters-link>فصول وثيقة المبادرة ({chapters.length}{chapters.some((x) => x.status === 'submitted') ? `، منها ${chapters.filter((x) => x.status === 'submitted').length} للقراءة` : ''}) في تبويب <button type="button" className="la-link" onClick={() => show('initiative')}>المبادرة</button>.</p>
            )}
            {learnModels.length > 0 && (
              <ul className="la-reqs">{learnModels.map((x) => (
                <li key={x.id}><span>{x.learning_models?.title_ar} <span className={`la-chip ${SUB_ST[x.status]?.[1] || ''}`}>{SUB_ST[x.status]?.[0]}</span>{x.rating ? <span className="stars-c"> {stars(x.rating)}</span> : null}</span>
                  {x.status !== 'draft' && <button className="la-link" onClick={() => setSub(x.id)}>{x.status === 'submitted' ? 'قيّم' : 'عرض'}</button>}</li>
              ))}</ul>
            )}
            {!learnModels.length && <p className="pf-empty-next">لم يبدأ نموذجًا بعد. الخطوة التالية: أن يفتح أول باب في كتاب القائد ويسلّم نموذجه، فيظهر هنا للقراءة.</p>}
            {sub && <Submission id={sub} canWrite={canWrite} onClose={(saved) => { setSub(null); if (saved) load(); }} />}
            {(r.labs || []).length > 0 && (
              <>
                <h4 className="la-phase">المختبر</h4>
                <ul className="la-reqs la-labs">{r.labs.map((x) => (
                  <li key={x.item_id}>
                    <span>{x.title} <span className={`la-chip ${x.best >= LAB_MASTERY ? 'ok' : ''}`}>أفضل نتيجة {x.best}%</span></span>
                    <small className="la-muted">
                      {x.attempts === 1 ? 'محاولة واحدة' : x.attempts === 2 ? 'محاولتان' : `${x.attempts} محاولات`}{x.first != null && x.attempts > 1 ? ` (الأولى ${x.first}%)` : ''}
                      {x.hints ? ` · عدد التلميحات ${x.hints}` : ''}
                      {x.mix ? ` · أكثر خلط: من ${x.mix.expected_ar} إلى ${x.mix.chosen_ar} (${x.mix.n})` : ''}
                    </small>
                  </li>
                ))}</ul>
              </>
            )}
          </section>
          </>)}

          {panel('initiative', <>
          {r.group && <p className="la-muted">المجموعة في دفعته: <b>{r.group.name}</b> ({r.group.members} أعضاء)</p>}
            <InitiativePanel participantId={p.id} canWrite={canWrite} onChanged={load} />
            <ExpertAssign participantId={id} canWrite={canWrite} />
            <FileExtras r={r} />
          </>)}

          {panel('profile', <>
            <section className="la-card" aria-labelledby="pf-data-h">
              <h3 id="pf-data-h">البيانات والدفعة</h3>
              <dl className="la-dl">
                <dt>البريد</dt><dd dir="ltr">{p.email}</dd>
                <dt>الجوال</dt><dd dir="ltr">{p.phone}</dd>
                <dt>المسمى</dt><dd>{p.job_title}</dd>
                <dt>جهة العمل</dt><dd>{p.organization_name}</dd>
                <dt>القطاع</dt><dd>{p.sector}</dd>
                <dt>الخبرة</dt><dd>{p.years_experience != null ? `${p.years_experience} سنة` : ''}</dd>
                <dt>النطاق</dt><dd>{SCOPE[p.work_scope] || 'لم يحدد'}</dd>
                <dt>LinkedIn</dt><dd>{p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer">فتح</a>}</dd>
                <dt>السيرة</dt><dd>{!p.cv_path ? 'لم تُرفع' : canWrite
                  ? <button className="la-link" onClick={() => evidence(p.cv_path)}>فتح (رابط مؤقت، يُسجَّل الفتح)</button>
                  : <span className="la-muted">مرفوعة · فتحها للمدير</span>}</dd>
                <dt>آخر نشاط</dt><dd>{seenAt(p) ? date(seenAt(p)) : 'لم يدخل'}</dd>
                <dt>آخر دخول</dt><dd>{p.last_login_at ? date(p.last_login_at) : 'لم يدخل'}</dd>
                <dt>الدفعة</dt><dd>
                  {r.program?.cohort?.id ? <a href={`#/leaders/programs/${encodeURIComponent(r.program.cohort.id)}`}>{r.program.cohort.is_default ? 'الدفعة المفتوحة' : r.program.cohort.name}</a> : 'بلا دفعة'}
                  {VIA_COHORT[r.program?.via] && <small className="la-muted"> ({VIA_COHORT[r.program.via]})</small>}{r.team_ar ? ` · ${r.team_ar}` : ''}{r.program?.cohort?.content_release ? ` · إصدار المحتوى ${r.program.cohort.content_release}` : ''}
                  {canWrite && cohorts?.length > 0 && (
                    <span className="la-row">
                      <select aria-label="نقل إلى دفعة أخرى (استثناء)" value={cohortTo} onChange={(e) => setCohortTo(e.target.value)}>
                        <option value="">نقل إلى دفعة أخرى (استثناء)…</option>
                        {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button className="btn-sm ghost" disabled={!cohortTo} onClick={enroll}>انقله</button>
                    </span>
                  )}
                </dd>
                {/* D05: لا إصدار يدويًا؛ تصدر من اعتماد التقييم الختامي بقرار اجتاز أو اجتاز بملاحظات */}
                <dt>الشهادة</dt><dd>تصدر آليًا عند اعتماد التقييم الختامي بقرار «اجتاز» أو «اجتاز بملاحظات»</dd>
                <dt>الدفع</dt><dd><PersonAccess participantId={p.id} canWrite={canWrite} /></dd>
              </dl>
              {p.bio && <p className="la-bio">{p.bio}</p>}
            </section>
            {canWrite && (
              <section className="la-card" aria-labelledby="pf-status-h">
                <h3 id="pf-status-h">حالة المشاركة</h3>
                <div className="la-row">
                  <select aria-label="الحالة" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button className="btn-sm ghost" disabled={status === p.status} onClick={changeStatus}>تغيير الحالة</button>
                </div>
              </section>
            )}
            {canWrite && <PersonDanger p={p} onDeleted={onBack} erasurePending={!!erasure?.request} />}
          </>)}

          {panel('log', <>
            {!erasure?.request && <ErasureLogLine last={erasure?.last} />}
            <NudgeLog participantId={p.id} canWrite={canWrite} />
            <Observations participantId={p.id} list={r.observations} canWrite={canWrite} onChanged={load} />
            <FullTimeline participantId={p.id} />
          </>)}
        </div>
        <Glance r={r} />
      </div>
      {editing && (
        <Form title={`تعديل بيانات ${p.full_name}`} fields={EDIT_FIELDS}
          values={{ full_name: p.full_name, email: p.email, phone: p.phone || '', job_title: p.job_title || '', organization_name: p.organization_name || '' }}
          onSave={(fields) => L('admin.participant-save', { participant_id: p.id, fields })}
          onClose={(saved) => { setEditing(false); if (saved) { toast('حُفظت البيانات'); load(); } }} />
      )}
      {previewAs && <PreviewAs participantId={p.id} onClose={() => setPreviewAs(false)} />}
    </>
  );
}

// عمود «بانتظار»: من whereNow على الخادم (now.js) نفسه الذي يبني شريط «أين هو الآن» في الملف
function Waiting({ w }) {
  if (!w) return <span className="la-muted">—</span>;
  if (!w.who) return <span className="la-muted">لا شيء</span>;
  return <span className={`la-chip ${w.who === 'admin' ? 'warn' : ''}`} title={w.text}>{w.who === 'admin' ? `الإدارة · ${w.n}` : `المشارك · ${w.n}`}</span>;
}

// شريط أعلى الملف: العودة للقائمة (بفلاترها كما تُركت)، وموضعه فيها، والسابق والتالي
function QueueNav({ pos, onBack, onNav }) {
  if (!pos) return <button className="la-link" onClick={onBack}>→ كل المشاركين</button>;
  return (
    <nav className="la-qnav" aria-label="التنقل بين ملفات القائمة">
      <button className="la-link" onClick={onBack}>→ القائمة</button>
      <span className="la-qnav-at" aria-live="polite"><b>{pos.index}</b> من {pos.total}{pos.label ? ` · ${pos.label}` : ' في قائمتك'}</span>
      <span className="la-row">
        <button className="btn-sm ghost" disabled={!pos.prev} onClick={() => onNav(pos.prev)} title="السابق (→ أو K)">→ السابق</button>
        <button className="btn-sm ghost" disabled={!pos.next} onClick={() => onNav(pos.next)} title="التالي (← أو J)">التالي ←</button>
      </span>
    </nav>
  );
}

export default function Participants({ orgs, canWrite, personId, onOpen, initialStatus }) {
  // key: كل ملف يبدأ بحالة نظيفة (لا تبقى لوحة أو تعديل مفتوح من المشارك السابق عند التنقل)
  return personId
    ? <Person key={personId} id={personId} orgs={orgs} canWrite={canWrite} onBack={() => onOpen(null)} onNav={onOpen} />
    : <List orgs={orgs} canWrite={canWrite} onOpen={onOpen} initialStatus={initialStatus} />;
}
