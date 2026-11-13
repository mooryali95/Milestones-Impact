// ════════════════════════════════════════════════════════════════
// المشاركون: القائمة بفلاترها وتصديرها والنقل الجماعي، وملف المشارك
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ImportParticipants from './ImportParticipants.jsx';
import { PersonAccess } from './Payments.jsx';
import Form from '../Form.jsx';
import {
  date, DIM, DIM_EN, DIMS, L, LVL, REQ, STATUS, SUB_ST, trackOfPlacements,
} from '../leaders.js';
import { Spinner, useUI, Empty } from '../ui.jsx';
import FilterBar, { useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts } from '../filters.js';
import { Submission } from './Handbook.jsx';
import { ActivitySummary } from './Activities.jsx';
import { ExpertAssign } from './ExpertMatch.jsx';
import { ContinuousCard, ParticipantMilestones } from './Milestones.jsx';
import { FinalEvalCard } from './FinalEval.jsx';
import { stars } from '../handbook.js';
import { approveBlocker } from '../placement-card.js';
import LevelCard from './LevelCard.jsx';
import AssessmentAnswers from './AssessmentAnswers.jsx';
import { readQuery, writeQuery } from '../route.js';
import { STAGE_STATUS_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { MASTERY as LAB_MASTERY } from '../../../supabase/functions/leaders-api/lab.js';
import { ONBOARDING_AR } from '../../../supabase/functions/leaders-api/onboarding.js';

const SCOPE = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };

const DAY = 864e5;
const ACTIVE = ['placed', 'enrolled'];
// عروض سريعة: الحالات التي يتدخل فيها المدير عادة، وعدد كل منها ظاهر على رقاقتها
const PRESETS = [
  { key: 'approval', label: 'بانتظار الاعتماد', test: (p) => p.status === 'pending_approval' },
  // متعثر قبل الاعتماد: لم يكمل ملفه، أو لم يبدأ القياس، أو بدأه ولم يسلّمه (onboarding من الخادم، onboarding.js)
  { key: 'stuck', label: 'لم يكمل التسجيل', test: (p) => STUCK.includes(p.onboarding?.step) },
  { key: 'tentative', label: 'مستوى مبدئي', test: (p) => (p.placements || []).some((x) => !x.approved_at) },
  { key: 'idle', label: 'متوقف 14 يومًا', test: (p, now) => ACTIVE.includes(p.status) && (!p.last_login_at || now - Date.parse(p.last_login_at) > 14 * DAY) },
  { key: 'new', label: 'جدد هذا الأسبوع', test: (p, now) => now - Date.parse(p.created_at) <= 7 * DAY },
  { key: 'orphan', label: 'بلا جهة', test: (p) => !p.organization_id },
];
const STUCK = ['profile', 'assessment_todo', 'assessment_doing'];
const KEYS = ['q', 'view', 'status', 'step', 'org', 'track', 'joined', 'seen'];

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

function List({ orgs, canWrite, onOpen, initialStatus }) {
  const { toast, confirm } = useUI();
  const [f, setF, clearF, replaceF] = useFilters(KEYS, initialStatus ? { status: initialStatus } : {});
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [moveTo, setMoveTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  // القائمة كاملة مرة واحدة (حتى 500)، والفلترة كلها في المتصفح فتستجيب فورًا
  const load = useCallback(async () => {
    setList(null); setError('');
    const r = await L('admin.participants', {});
    if (!r.success) { setList([]); return setError(r.message); }
    setList(r.participants || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  // طلبات حذف البيانات القائمة من المشاركين أنفسهم: تُنفَّذ من صفحة المشارك بمسار الحذف القائم
  const [erasures, setErasures] = useState([]);
  // بعد كل تحميل للقائمة مرة واحدة: list تبدأ null ثم تُملأ، فكان يُطلب مرتين عند الفتح
  useEffect(() => { if (list) L('admin.erasures', {}).then((r) => setErasures(r.success ? r.items || [] : [])); }, [list]);

  const all = list || [];
  const tracks = useMemo(() => [...new Set(all.map((p) => trackOfPlacements(p.placements)).filter(Boolean))].sort(), [all]);
  const orgOf = (p) => orgs.find((o) => o.id === p.organization_id);
  const fields = useMemo(() => [
    { key: 'status', label: 'الحالات', get: (p) => p.status, options: Object.entries(STATUS) },
    { key: 'org', label: 'الجهات', get: (p) => p.organization_id || 'none', options: [...orgs.map((o) => [o.id, o.name]), ['none', 'بدون جهة']] },
    { key: 'track', label: 'المسارات', get: (p) => trackOfPlacements(p.placements) || p.track, options: tracks.map((k) => [k, k]) },
    // بعد الثلاثة الظاهرة (الباقي خلف «+ فلاتر»)، والعرض السريع «لم يكمل التسجيل» يغني عنه في الغالب
    { key: 'step', label: 'أين توقف', get: (p) => p.onboarding?.step, options: Object.entries(ONBOARDING_AR) },
    { key: 'joined', label: 'التسجيل', all: 'أي تاريخ تسجيل', type: 'period', get: (p) => p.created_at },
    { key: 'seen', label: 'آخر دخول', all: 'أي آخر دخول', type: 'period', get: (p) => p.last_login_at },
  ], [orgs, tracks]);
  const spec = { fields, presets: PRESETS, text: (p) => [p.full_name, p.email, p.phone, p.job_title, orgOf(p)?.name || p.organization_name, trackOfPlacements(p.placements)].join(' ') };
  const shown = useMemo(() => applyFilters(all, spec, f), [all, f, fields]);
  const counts = useMemo(() => presetCounts(all, PRESETS), [all]);

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
  const exportCsv = async () => {
    const { exportWorkbook } = await import('../../../src/lib/brand/xlsx.js');
    const head = [['الاسم', 26], ['البريد', 30], ['الجوال', 16], ['المسمى', 22], ['الجهة', 24], ...DIMS.map((d) => [DIM_EN[d], 12]), ['المسار', 10], ['الحالة', 18], ['أين توقف', 18], ['المتبقي', 40], ['التسجيل', 16], ['آخر دخول', 16]];
    const lv = (p, d) => LVL[(p.placements || []).find((x) => x.dimension === d)?.level] || '';
    await exportWorkbook(
      { kind: 'PPL', title: 'مشاركو برنامج القادة', subtitle: shown.length === all.length ? 'كل المشاركين' : `${shown.length} من ${all.length} حسب الفلاتر`, sheet: 'المشاركون', file: 'Participants' },
      head.map(([label, width]) => ({ label, width })),
      shown.map((p) => [p.full_name, p.email, p.phone, p.job_title, orgOf(p)?.name || p.organization_name,
        ...DIMS.map((d) => lv(p, d)), trackOfPlacements(p.placements), STATUS[p.status] || p.status, p.onboarding?.label || '', p.onboarding?.remaining || '', date(p.created_at), date(p.last_login_at)]),
    );
    toast(`صُدّر ${shown.length} مشارك`);
  };

  return (
    <>
      <FilterBar scope="participants" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={PRESETS} counts={counts}
        shown={shown.length} total={all.length} noun="مشارك" placeholder="ابحث بالاسم أو البريد أو الجوال أو الجهة"
        actions={<>
          <button className="refresh-btn" type="button" onClick={exportCsv} disabled={!shown.length}>تصدير Excel{shown.length !== all.length ? ` (${shown.length})` : ''}</button>
          {canWrite && <button className="refresh-btn" type="button" onClick={() => setAdding(true)}>+ مشارك</button>}
          {canWrite && <button className="refresh-btn" type="button" onClick={() => setImporting(true)}>استيراد</button>}
        </>} />
      {erasures.length > 0 && (
        <div className="la-bulk" role="status">
          <span><b>{erasures.length}</b> طلب حذف بيانات قائم، ومهلة كل طلب 30 يومًا:</span>
          {erasures.map((e) => (
            <button key={e.id} className="btn-sm ghost" type="button" onClick={() => onOpen(e.participant_id)}>
              {e.name || e.email} · قبل {new Date(e.due_at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' })}
            </button>
          ))}
        </div>
      )}
      {canWrite && picked.size > 0 && (
        <div className="la-bulk">
          <span><b>{picked.size}</b> محدد</span>
          <OrgSelect orgs={orgs} value={moveTo} onChange={setMoveTo} all="نقل إلى جهة…" label="نقل إلى جهة" />
          <button className="btn-sm primary" onClick={move}>نقل</button>
          <button className="btn-sm ghost" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
        </div>
      )}
      <div className="table-wrap"><table className="data-table la-cards">
        <thead><tr>
          {canWrite && <th><input type="checkbox" aria-label="تحديد الكل" checked={allOn} onChange={toggleAll} /></th>}
          <th>الاسم</th><th>الجهة</th>{DIMS.map((d) => <th key={d}>{DIM_EN[d]}</th>)}<th>المسار</th><th>الحالة</th><th>أين توقف</th><th>التسجيل</th>
        </tr></thead>
        <tbody>
          {!list ? <tr className="loading-row"><td colSpan={10}><Spinner /></td></tr>
            : error ? <tr><td colSpan={10}><div className="la-err">{error} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></td></tr>
              : !shown.length ? <tr><td colSpan={10}>{all.length ? <Empty compact title="لا نتائج لهذه الفلاتر" hint="جرّب مسحها أو تغيير البحث." /> : <Empty title="لا مشاركين بعد" hint="يظهر هنا كل من يسجل من رابط جهته، ومن تضيفه أنت.">{canWrite && <><button className="btn-sm primary" type="button" onClick={() => setImporting(true)}>أضف مشاركين من قائمة</button><button className="btn-sm ghost" type="button" onClick={() => setAdding(true)}>أضف مشاركًا واحدًا</button></>}</Empty>}</td></tr>
                : shown.map((p) => {
                  const og = orgOf(p);
                  const tk = trackOfPlacements(p.placements);
                  return (
                    <tr key={p.id} tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.id); }}>
                      {canWrite && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`تحديد ${p.full_name}`} checked={picked.has(p.id)} onChange={() => toggle(p.id)} /></td>}
                      <td data-label="الاسم"><b>{p.full_name}</b>{p.is_test && <> <span className="la-chip" title="حساب اختبار داخلي: خارج الإحصاءات">اختبار</span></>}<br /><small className="la-muted" dir="ltr">{p.email}</small></td>
                      <td data-label="الجهة">{og && <><span className="la-orgtag" title="الجهة الراعية" style={{ '--org': og.color || 'var(--brand-gold)' }}>{og.short_name || og.name}</span><br /></>}{p.organization_name}<br /><small className="la-muted">{p.job_title}</small></td>
                      {DIMS.map((d) => <td key={d} data-label={DIM[d]}><Lvl p={p} d={d} /></td>)}
                      <td data-label="المسار">{tk ? <code className="la-code">{tk}</code> : <span className="la-muted">·</span>}</td>
                      <td data-label="الحالة"><span className={`la-chip ${p.status === 'pending_approval' ? 'warn' : ''}`}>{STATUS[p.status] || p.status}</span></td>
                      <td data-label="أين توقف"><Where o={p.onboarding} /></td>
                      <td data-label="التسجيل">{date(p.created_at)}</td>
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

// أزرار التدخل بحسب حالة المرحلة: لا يُعرض إلا ما له أثر
function StageOverride({ s, onPick }) {
  if (s.override) return <div className="la-stage-ov"><small className="la-chip">{{ open: 'فُتحت له يدويًا', complete: 'اعتُمدت يدويًا', skip: 'أُعفي منها' }[s.override]}</small><button className="la-link" onClick={() => onPick('')}>إلغاء التدخل</button></div>;
  if (s.status === 'done') return null;
  return (
    <div className="la-stage-ov">
      {s.status === 'locked' && <button className="la-link" onClick={() => onPick('open')}>افتحها له</button>}
      <button className="la-link" onClick={() => onPick('complete')}>اعتمد اكتمالها</button>
      <button className="la-link" onClick={() => onPick('skip')}>أعفه منها</button>
    </div>
  );
}

// حذف مشارك بأثر: ما سيُمحى معه، وما يمنعه (شهادة سارية أو دفع مؤكد)؛ للمدير الأعلى بكتابة البريد
function PersonDanger({ p, onDeleted }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open && !impact) L('admin.participant-impact', { participant_id: p.id }).then(setImpact); }, [open, impact, p.id]);
  const remove = async () => {
    const r = await L('admin.participant-delete', { participant_id: p.id, confirm_email: typed });
    if (r.success) { toast('حُذف المشارك'); onDeleted(); } else toast(r.message);
  };
  const c = impact?.counts || {};
  return (
    <section className="la-card of-danger">
      <div className="of-danger-head">
        <div><b>منطقة الخطر</b><small>الإيقاف (تغيير الحالة) يحفظ البيانات. الحذف نهائي ويمحو ملفاته المرفوعة، وهو للمدير الأعلى.</small></div>
        <button type="button" className="btn-sm danger" aria-expanded={open} onClick={() => setOpen(!open)}>حذف المشارك…</button>
      </div>
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

function Person({ id, canWrite, onBack }) {
  const { toast, confirm, prompt } = useUI();
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
  const blocker = approveBlocker(DIMS, { levels, notes, currentLevel, dimName: (d) => DIM_EN[d] });
  const approve = async () => {
    if (blocker) return toast(blocker.text);
    if (!(await confirm('اعتماد المسار وإبلاغ المشارك بالبريد؟'))) return;
    act('admin.approve', { participant_id: p.id, levels, notes }, 'اعتُمد المسار وأُبلغ المشارك');
  };
  const reset = async () => {
    if (!(await confirm('يُلغى القياس الحالي ويعيده المشارك من البداية. المستوى المعتمد يبقى حتى تعتمد غيره. متابعة؟', { danger: true }))) return;
    act('admin.reset-assessment', { participant_id: p.id }, 'أُعيد فتح القياس');
  };
  const review = async (req, st) => {
    let note = null;
    if (st === 'returned') { note = await prompt('ملاحظة للمشارك: ما المطلوب تعديله؟'); if (note === null) return; }
    act('admin.review', { participant_id: p.id, requirement_id: req, status: st, note }, st === 'returned' ? 'أُعيد مع الملاحظة' : 'تم');
  };
  // تدخل في مرحلة لهذا المشارك وحده، بسبب مكتوب يُحفظ في السجل
  const stageAct = async (s, action) => {
    const msg = { open: `فتح «${s.title_ar}» له الآن؟`, complete: `اعتماد اكتمال «${s.title_ar}»؟`, skip: `إعفاؤه من «${s.title_ar}»؟`, '': `إلغاء التدخل في «${s.title_ar}» وإعادتها لقواعد البرنامج؟` }[action];
    const note = await prompt(`${msg}\nالسبب (يُحفظ في السجل):`, '');
    if (note === null) return;
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
      withdrawn: ' يخرج من البرنامج، وإن لم يفتح أي باب من الكتيب بعدُ أُلغي إعفاء رعاية جهته ورُدّ مقعده إليها، ولا تعيده إعادة الحالة لاحقًا.',
      suspended: ' يخرج من البرنامج ولا يستطيع الدخول إلى حسابه حتى تعيد حالته.',
    }[status] || '';
    if (!(await confirm(to + effect, { danger: !!effect, ok: 'تغيير الحالة' }))) return;
    act('admin.status', { participant_id: p.id, status }, 'تم التحديث');
  };
  // التسجيل الصريح في دفعة (كان يتطلب تعديل القاعدة يدويًا): يُسحب من أي دفعة أخرى سُجّل فيها صراحةً
  const enroll = async () => {
    const c = (cohorts || []).find((x) => x.id === cohortTo);
    if (!(await confirm(`تسجيل ${p.full_name} صراحةً في دفعة «${c?.name}»؟ يُسحب من أي دفعة أخرى سُجّل فيها صراحةً.`))) return;
    const d = await act('admin.cohort-enroll', { cohort_id: cohortTo, participant_ids: [p.id] }, 'سُجّل في الدفعة');
    if (d.success) setCohortTo('');
  };

  const pts = r.points || { total: 0, rank: { title: 'مستكشف' } };
  const book = r.book || [];
  const sc = book.reduce((a, b) => [a[0] + (b.quiz_score || 0), a[1] + (b.quiz_total || 0)], [0, 0]);

  return (
    <>
      <button className="la-link" onClick={onBack}>→ كل المشاركين</button>
      <div className="la-person">
        <section className="la-card">
          <div className="la-row between"><h3>{p.full_name}</h3><span className="la-row">{p.is_test && <span className="la-chip warn" title="خارج النظرة العامة وأعداد الجهات ولوحتها والمالية وتقرير الأثر، وحساب عادي في كل ما سواها">حساب اختبار</span>}<span className="la-chip">{STATUS[p.status] || p.status}</span></span></div>
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
            <dt>آخر دخول</dt><dd>{date(p.last_login_at)}</dd>
            <dt>الدفعة</dt><dd>
              {r.program?.cohort && !r.program.cohort.is_default ? r.program.cohort.name : 'الدفعة المفتوحة'}{r.team_ar ? ` · ${r.team_ar}` : ''}{r.program?.cohort?.content_release ? ` · إصدار المحتوى ${r.program.cohort.content_release}` : ''}
              {canWrite && cohorts?.length > 0 && (
                <span className="la-row">
                  <select aria-label="تسجيل صريح في دفعة" value={cohortTo} onChange={(e) => setCohortTo(e.target.value)}>
                    <option value="">تسجيل صريح في دفعة…</option>
                    {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button className="btn-sm ghost" disabled={!cohortTo} onClick={enroll}>سجّله</button>
                </span>
              )}
            </dd>
            {/* D05: لا إصدار يدويًا؛ تصدر من اعتماد التقييم الختامي بقرار اجتاز أو اجتاز بملاحظات */}
            <dt>الشهادة</dt><dd>تصدر آليًا عند اعتماد التقييم الختامي بقرار «اجتاز» أو «اجتاز بملاحظات»</dd>
            <dt>الدفع</dt><dd><PersonAccess participantId={p.id} canWrite={canWrite} /></dd>
          </dl>
          {p.bio && <p className="la-bio">{p.bio}</p>}
          {STUCK.includes(r.onboarding?.step) && (
            <p className="la-where" role="status">
              <b>أين توقف:</b> {r.onboarding.label}. {r.onboarding.remaining}.
              {r.onboarding.started_at && <> بدأ القياس {date(r.onboarding.started_at)}.</>}
              {r.onboarding.last_answer_at && <> آخر إجابة {date(r.onboarding.last_answer_at)}.</>}
              {!p.last_login_at ? ' لم يدخل بعد التسجيل.' : <> آخر دخول {date(p.last_login_at)}.</>}
            </p>
          )}
          {r.needs?.length > 0 && <p className="la-muted">المطلوب الآن: {r.needs.map((n) => n.text).join(' · ')}</p>}
          {canWrite && (
            <div className="la-row">
              <select aria-label="الحالة" value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="btn-sm ghost" disabled={status === p.status} onClick={changeStatus}>تغيير الحالة</button>
              <button className="btn-sm ghost" onClick={reset}>إعادة القياس</button>
              <button className="btn-sm ghost" onClick={() => setEditing(true)}>تعديل البيانات</button>
              {/* حساب اختبار داخلي: خارج الإحصاءات وحدها، ويبقى حسابًا عاديًا (قرار المالك 2026-11-11) */}
              <button className="btn-sm ghost" title="يُستبعد من النظرة العامة وأعداد الجهات ولوحتها والمالية وتقرير الأثر"
                onClick={() => act('admin.participant-save', { participant_id: p.id, fields: { is_test: !p.is_test } }, p.is_test ? 'عاد محسوبًا في الإحصاءات' : 'صار حساب اختبار، خارج الإحصاءات')}>
                {p.is_test ? 'إلغاء علامة الاختبار' : 'حساب اختبار'}</button>
            </div>
          )}
          {editing && (
            <Form title={`تعديل بيانات ${p.full_name}`} fields={EDIT_FIELDS}
              values={{ full_name: p.full_name, email: p.email, phone: p.phone || '', job_title: p.job_title || '', organization_name: p.organization_name || '' }}
              onSave={(fields) => L('admin.participant-save', { participant_id: p.id, fields })}
              onClose={(saved) => { setEditing(false); if (saved) { toast('حُفظت البيانات'); load(); } }} />
          )}
        </section>

        <LevelCard prof={prof} latest={latest} model={r.placement_model} effort={r.effort} canWrite={canWrite} levels={levels} setLevels={setLevels}
          notes={notes} setNotes={setNotes} currentLevel={currentLevel} blocker={blocker} onApprove={approve} onAnswers={canWrite ? openAnswers : null} />
        {answers && latest && <AssessmentAnswers participant={p} dim={answers} onClose={closeAnswers} />}
      </div>

      {r.group && <p className="la-muted">المجموعة في دفعته: <b>{r.group.name}</b> ({r.group.members} أعضاء)</p>}
      <ContinuousCard c={r.continuous} />
      <FinalEvalCard participantId={p.id} canWrite={canWrite} />
      <ParticipantMilestones p={p} list={r.milestones} summary={r.milestone_summary} canWrite={canWrite} onDone={load} />

      <section className="la-card">
        <div className="la-row between"><h3>الرحلة</h3><span className="la-muted">{r.progress}% · {r.journey.filter((s) => s.status === 'done').length}/{r.journey.length} مراحل</span></div>
        <div className="la-journey">{r.journey.map((s) => (
          <div key={s.key} className={`la-stage ${s.status}`}>
            <div className="la-row between"><b>{s.title_ar}</b><span className={`la-chip ${s.status === 'done' ? 'ok' : s.status === 'active' ? 'warn' : ''}`}>{s.skipped ? 'أُعفي منها' : STAGE_STATUS_AR[s.status]}</span></div>
            {s.lock_reason && <small className="la-muted">{s.lock_reason}</small>}
            {canWrite && <StageOverride s={s} onPick={(action) => stageAct(s, action)} />}
            <ul>{s.items.length ? s.items.map((it) => (
              <li key={it.id} className={it.status}>
                <span>{it.status === 'done' ? '✓' : it.status === 'submitted' ? '●' : '○'} {it.title_ar} <small className="la-muted">{REQ[it.status]}</small>
                  <ActivitySummary a={it.activity} /></span>
                <span className="la-row">
                  {it.evidence_path && (canWrite
                    ? <button className="la-link" onClick={() => evidence(it.evidence_path)}>الملف</button>
                    : <small className="la-muted">ملف مرفق</small>)}
                  {canWrite && !it.auto && s.status !== 'locked' && <>
                    {it.status !== 'done' && <button className="btn-sm primary" onClick={() => review(it.id, 'done')}>اعتماد</button>}
                    {it.status === 'submitted' && <button className="btn-sm ghost" onClick={() => review(it.id, 'returned')}>إعادة مع ملاحظة</button>}
                    {it.status === 'done' && <button className="btn-sm ghost" onClick={() => review(it.id, 'pending')}>إلغاء</button>}
                  </>}
                </span>
              </li>
            )) : <li className="la-muted">لا متطلبات</li>}</ul>
          </div>
        ))}</div>
      </section>

      <section className="la-card la-book-card">
        <div className="la-row between"><h3>كتاب القائد والنماذج</h3><span className="rank-chip">{pts.rank.title} · {pts.total} نقطة</span></div>
        <div className="la-book-kpis">
          <span><b>{book.length}</b>باب أتمّه</span>
          <span><b>{sc[1] ? Math.round((sc[0] / sc[1]) * 100) : 0}%</b>دقة الاختبارات</span>
          <span><b>{(r.models || []).filter((x) => x.status !== 'draft').length}</b>نموذج سلّمه</span>
        </div>
        {(r.models || []).length > 0 && (
          <ul className="la-reqs">{r.models.map((x) => (
            <li key={x.id}><span>{x.learning_models?.title_ar} <span className={`la-chip ${SUB_ST[x.status]?.[1] || ''}`}>{SUB_ST[x.status]?.[0]}</span>{x.rating ? <span className="stars-c"> {stars(x.rating)}</span> : null}</span>
              {x.status !== 'draft' && <button className="la-link" onClick={() => setSub(x.id)}>{x.status === 'submitted' ? 'قيّم' : 'عرض'}</button>}</li>
          ))}</ul>
        )}
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

      <ExpertAssign participantId={id} canWrite={canWrite} />

      <section className="la-card"><h3>السجل</h3><ul className="la-log">
        {(r.history || []).length ? r.history.map((h, i) => <li key={i}><small>{date(h.created_at)}</small> {h.action} <small className="la-muted">{h.actor}</small></li>) : <li className="la-muted">لا شيء</li>}
      </ul></section>

      {canWrite && <PersonDanger p={p} onDeleted={onBack} />}
    </>
  );
}

export default function Participants({ orgs, canWrite, personId, onOpen, initialStatus }) {
  return personId
    ? <Person id={personId} canWrite={canWrite} onBack={() => onOpen(null)} />
    : <List orgs={orgs} canWrite={canWrite} onOpen={onOpen} initialStatus={initialStatus} />;
}
