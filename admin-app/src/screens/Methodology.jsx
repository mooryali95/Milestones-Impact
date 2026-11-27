// ════════════════════════════════════════════════════════════════
// المنهجية: الرحلة والمتطلبات، وأسئلة القياس، والمستويات ومعيار التسكين
// ════════════════════════════════════════════════════════════════
// كلها تقرأ من admin.catalog وتكتب عبر admin.save / admin.delete / admin.reorder.
// ما يُحرَّر هنا يظهر للمشارك مباشرة، فكل حفظ يعيد تحميل الكتالوج.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DIM, DIMS, L, LVL, placementLockAr, withRunningReason } from '../leaders.js';
import { ASSESSMENT_MISSING_AR, completionSource, journeyCoherence, journeyCtx, renderJourneyText, stageRuleSummary, stageRules } from '../../../supabase/functions/leaders-api/logic.js';
import { READY_MIN } from '../../../supabase/functions/leaders-api/capstone.js';
import { ACTIVITY_AR, ACTIVITY_KIND_AR, COMPLETION_AR, JOURNEY_KEY_AR, JOURNEY_MODE_AR, PARALLEL_SERVICE_AR, PARALLEL_SERVICE_NOTE_AR, TRACK_ONLY_AR, JOURNEY_ISSUE_AR, JOURNEY_ISSUE_TONE, JOURNEY_SAFE_AR, journeyIssuesAr, PROGRAM_VERSION_STATE, PROGRAM_VERSION_STATE_TONE } from '../../../supabase/functions/leaders-api/labels.js';
import {
  CELL_FIELDS, foldMilestones, INST_FIELDS, journeyBoard, NO_AXIS_NOTE_AR, LVLS, lockReqCode, MODE, MODEL_DEFAULT, QUESTIONS_LOCK_AR, Q_SAFE, stageFields, stageToForm, formToStage, TIER,
  evaluate, formToReq, reorderIds, reqFields, reqToForm,
  durationNote, isSystemCode, journeyModeOf, KIND_DEFAULT_CONFIG, kindChoiceField, moveFields, movedAr, newStageFields, reqPanelFields, reqPanelGroups,
  stagePanelFields, stagePanelGroups, suggestCode, SYSTEM_CODE_AR, withMode,
} from '../methodology.js';
import { MoreMenu } from './PersonShell.jsx';
import Form from '../Form.jsx';
import ItemQuality from './ItemQuality.jsx';
import { ProgramMilestones } from './Milestones.jsx';
import { Missing, Move, moveKeys, StatusChip, useUI } from '../ui.jsx';
import { ScreenHead } from '../PageHeader.jsx';
import { publishLine, versionState } from '../program-state.js';
import { date as fmtDate } from '../dates.js';
import { keepSpot, saveQueue, takeSpot } from '../review-queue.js';
import { navigate, readQuery, writeQuery } from '../route.js';
import JourneyTimeline from '../../../shared/ui/JourneyTimeline.jsx';
// أيقونات أنواع النشاط من مجموعة تطبيق leaders نفسها: shared/ui/Ico.jsx
import Ico, { ACTIVITY_KIND_ICO } from '../../../shared/ui/Ico.jsx';
import { journeyAudience, journeyAudienceAr } from '../program-reach.js';
import { journeyTimeline } from '../../../supabase/functions/leaders-api/journey-timeline.js';

const save = (entity, base) => (row) => L('admin.save', { entity, row: { ...base, ...row } });
const del = (entity, id) => () => L('admin.delete', { entity, id });

// نافذة التحرير المشتركة: edit({ title, fields, values, onSave, onDelete? })
function useEditor(reload) {
  const { toast } = useUI();
  const [form, setForm] = useState(null);
  // saved: true يعيد التحميل، و'silent' يغلق بلا إعادة تحميل (النقل يحدّث مرحلتيه وحدهما)، و{ nextForm } يفتح النموذج التالي
  const node = form && (
    <Form key={form.title} {...form} onClose={(saved) => {
      if (saved?.nextForm) { setForm(saved.nextForm); return; }
      setForm(null);
      if (saved === true) { toast('تم الحفظ'); reload(); }
    }} />
  );
  return [setForm, node];
}

// النقل بمكون Move المشترك (ui.jsx، المرحلة 18): هدف 32px وtitle يسمي ما يُنقل، وإعلان الموضع الجديد، ولمن يملك canWrite فقط.
// Alt مع الأسهم على الصف (KeyRow وmoveKeys)، ويُحفظ الترتيب بـsaveQueue والموضع بـkeepSpot فلا يقفز التمرير بعد إعادة التحميل
export const SPOT_SCOPE = 'methodology';
let spotDir = 0;
function RowMove({ catalog, entity, id, name, reload, canWrite, keysRef }) {
  const { toast } = useUI();
  const ids0 = reorderIds(catalog[entity], entity, id, 0) || [];
  const i = ids0.indexOf(id);
  const onMove = async (dir) => {
    const ids = reorderIds(catalog[entity], entity, id, dir);
    if (!ids) return null;
    const r = await L('admin.reorder', { entity, ids, program_id: catalog.program_id });
    if (!r.success) { toast(r.message); return null; }
    saveQueue(ids, name);
    keepSpot(typeof window === 'undefined' ? 0 : window.scrollY, id, SPOT_SCOPE);
    spotDir = dir;
    reload();
    return ids.indexOf(id) + 1;
  };
  return <Move name={name} onMove={onMove} canWrite={canWrite} first={i === 0} last={i === ids0.length - 1} total={ids0.length} keysRef={keysRef} />;
}
// صف قابل للنقل بلوحة المفاتيح: يملك keysRef الذي يربطه Move، وdata-mt-row لاستعادة التركيز بعد إعادة التحميل
function KeyRow({ as: Tag = 'li', rowId, children, ...rest }) {
  const keys = useRef(null);
  return <Tag data-mt-row={rowId} onKeyDown={moveKeys(keys)} {...rest}>{children(keys)}</Tag>;
}
// بعد إعادة التحميل: يعود التمرير إلى موضعه، والتركيز إلى زر الاتجاه نفسه في صف ما نُقل
function useSpot(dep) {
  useEffect(() => {
    const s = takeSpot(SPOT_SCOPE);
    if (!s) return;
    window.scrollTo?.({ top: s.y });
    const row = s.id && [...document.querySelectorAll('[data-mt-row]')].find((e) => e.dataset.mtRow === s.id);
    if (row && !row.contains(document.activeElement)) {
      const btns = row.querySelectorAll(':scope .la-move-btn');
      // وضع البناء في الرحلة بلا أسهم ظاهرة: يعود التركيز إلى زر «⋯» في الصف نفسه
      if (!btns.length) { row.querySelector('.pf-more-btn')?.focus({ preventScroll: true }); spotDir = 0; return; }
      const btn = btns[spotDir > 0 ? 1 : 0];
      (btn && btn.getAttribute('aria-disabled') !== 'true' ? btn : btns[0])?.focus({ preventScroll: true });
    }
    spotDir = 0;
  }, [dep]);
}

// ══ الرحلة والمتطلبات ══
// برامج الرحلة: يختار المشرف أيها يحرر
function ProgramBar({ current, onProgram, programs }) {
  const list = programs ? programs.filter((p) => !p.archived_at || p.id === current) : null;
  if (!list || list.length < 2) return null;
  return (
    <label className="la-row">
      <span>البرنامج</span>
      <select value={current || ''} onChange={(e) => onProgram(e.target.value)} aria-label="البرنامج">
        {list.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (الافتراضي)' : ''}</option>)}
      </select>
    </label>
  );
}

// سطر الحالة الواحد في الترويسة (المرحلة 19): شارة النسخة من versionState (المرحلة 11)، ثم «لا تمس الدفعة الجارية»،
// ثم «التفاصيل» مطوية: من يصله التعديل (P9، من admin.programs نفسه عبر program-reach.js) وملاحظات الاتساق.
// لا تُقال العبارة حين يصل التعديل دفعة فورًا (غير مثبتة): يظهر تنبيهها مكانها خارج الطي، فلا يُخفى ما يمس مشاركين.
// والاتساق صامت بلا ملاحظات، وإلا عددها في السطر ومعه رابط لكل ملاحظة إلى مرحلتها أو متطلبها في القائمة
export function JourneyStatus({ pid, data, issues = [], onIssue }) {
  const ok = !!data?.success;
  const prog = ok ? (data.programs || []).find((p) => p.id === pid) : null;
  const lines = ok ? journeyAudienceAr(journeyAudience(pid, data.programs, data.cohorts)) : [];
  const warn = lines.filter((l) => l.tone === 'warn');
  const info = lines.filter((l) => l.tone !== 'warn');
  const errors = issues.some((x) => x.level === 'error');
  const lvl = errors ? 'error' : 'warn';
  const detailsRef = useRef(null);
  // تكميل البند 19 (المرحلة 23): جملة النشر وزر «إلى النشر» يفتح «البرامج والدفعات» على بطاقة البرنامج (data-program)
  const pub = prog ? publishLine(prog, data.cohorts, fmtDate) : null;
  const toPublish = () => {
    navigate({ ctx: 'leaders', tab: 'programs' });
    const spot = (n) => { const el = [...document.querySelectorAll("[data-program]")].find((x) => x.dataset.program === pid); if (el) { el.scrollIntoView({ block: 'start' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } else if (n) setTimeout(() => spot(n - 1), 150); };
    setTimeout(() => spot(20), 0);
  };
  return (
    <div className="j-status">
      <p className="j-status-line">
        {!data ? <Missing state="loading" /> : prog ? <StatusChip status={versionState(prog)} labels={PROGRAM_VERSION_STATE} tones={PROGRAM_VERSION_STATE_TONE} /> : null}
        {pub?.text && <span className="j-publish">{pub.text}</span>}
        {pub?.state === 'draft' && <button type="button" className="la-link j-to-publish" aria-label={`إلى النشر: «البرامج والدفعات» على برنامج «${prog.name}»`} onClick={toPublish}>إلى النشر</button>}
        {pub?.older > 0 && <span className="j-older">{pub.older_ar}</span>}
        {ok && !warn.length && <span className="j-safe">{JOURNEY_SAFE_AR}</span>}
        {issues.length > 0 && (
          <button type="button" className="la-link j-issues-btn" aria-label={`${journeyIssuesAr(issues.length)}، اعرضها`}
            onClick={() => { const d = detailsRef.current; if (!d) return; d.open = true; (d.querySelector('.j-issues button') || d.querySelector('summary'))?.focus(); }}>
            <StatusChip status={lvl} labels={{ [lvl]: journeyIssuesAr(issues.length) }} tones={JOURNEY_ISSUE_TONE} />
          </button>
        )}
      </p>
      <div className="j-audience" aria-label="من يصله التعديل">
        {warn.map((l, i) => <p key={i} className="la-note" role="note">{l.text}</p>)}
        <details className="j-details" ref={detailsRef}>
          <summary>التفاصيل</summary>
          {ok ? info.map((l, i) => <p key={i} className="la-muted">{l.text}</p>)
            : <p className="la-muted">ما تحرره هنا مسودة البرنامج، ولا يصل إلى الدفعات المثبتة على نسخة حتى تحفظه نسخة وترقّيها إليها من «البرامج والدفعات».</p>}
          {issues.length > 0 && (
            <ul className="la-reqs j-issues" aria-label="اتساق الرحلة">
              {issues.map((x, i) => (
                <li key={i}>
                  <StatusChip status={x.level === 'error' ? 'error' : 'warn'} labels={JOURNEY_ISSUE_AR} tones={JOURNEY_ISSUE_TONE} />{' '}
                  {onIssue && (x.req || x.stage) ? <button type="button" className="la-link" title={x.token || undefined} onClick={() => onIssue(x)}>{x.msg}</button> : <span title={x.token || undefined}>{x.msg}</span>}
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </div>
  );
}

// نص الرحلة كما يُعرض للمحرر: مدة القياس بلا قيمة تظهر شارة تنبيه لا رمزًا خامًا (الرمز يُرى في حقل التحرير وحده)
const MISSING_TOKEN = '{assessment_minutes}';
export function JourneyText({ text }) {
  if (typeof text !== 'string' || !text.includes(MISSING_TOKEN)) return text ?? null;
  return text.split(MISSING_TOKEN).flatMap((part, i) => (i ? [<span key={i} className="la-chip warn">{ASSESSMENT_MISSING_AR}</span>, part] : [part]));
}

// مفتاح الرموز الواحد (المرحلة 21، 4.2 البند 3 و4.3 البند 4): كل علامة بكلمتها بجانب شكلها، فلا يُعتمد على اللون أو الحد وحده
export function JourneyKey() {
  const k = JOURNEY_KEY_AR;
  return (
    <dl className="j-key" aria-label={k.title}>
      <dt className="sr-only">{k.title}</dt>
      <dd><span className="j-key-mark must" aria-hidden="true" />{k.required}</dd>
      <dd><span className="j-key-mark opt" aria-hidden="true" />{k.optional}</dd>
      <dd><span className="la-chip j-auto">{k.auto}</span></dd>
      <dd><span className="la-chip warn">{k.review}</span></dd>
      {Object.entries(ACTIVITY_KIND_ICO).map(([kind, ico]) => (
        <dd key={kind} className="j-key-kind" data-kind={kind}><Ico name={ico} />{ACTIVITY_KIND_AR[kind]}</dd>
      ))}
    </dl>
  );
}

// مفتاح «عرض» و«بناء» (المرحلة 22، 4.3): radiogroup بالأسهم، والوضع في الرابط (?mode=build). لا يظهر لمن لا يملك الكتابة
export function ModeSwitch({ mode, onMode }) {
  const keys = ['view', 'build'];
  const key = (e) => {
    const i = keys.indexOf(mode);
    const to = { ArrowLeft: i + 1, ArrowRight: i - 1, ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const k = keys[(to + keys.length) % keys.length];
    onMode(k);
    e.currentTarget.querySelector(`[data-mode="${k}"]`)?.focus();
  };
  return (
    <div className="j-mode" role="radiogroup" aria-label="وضع الصفحة" onKeyDown={key}>
      {keys.map((k) => (
        <button key={k} type="button" role="radio" data-mode={k} aria-checked={mode === k} tabIndex={mode === k ? 0 : -1}
          className={mode === k ? 'on' : ''} onClick={() => onMode(k)}>{JOURNEY_MODE_AR[k]}</button>
      ))}
    </div>
  );
}

// الشريط الزمني القصير (4.2 البند 1): أعمدة المراحل بطول مدتها وتداخلها، بلا أسماء أنشطة. من نموذج journeyTimeline نفسه
// (الخانة وموضع المرحلة فيها)، فلا حساب ثانٍ للمدد. النقر على مرحلة ينقل إلى بطاقتها
export function StageStrip({ model, onStage }) {
  if (!model || model.empty) return null;
  const slots = new Map((model.slots || []).map((x) => [x.key, x]));
  const stageLanes = Math.max(1, ...(model.stages || []).map((s) => (s.lane || 0) + 1));
  // مراحل lane=track لا تقع في model.stages بل في model.tracks على المقياس نفسه (at وwidth): لكل منها صف تحت المراحل بشارتها
  const tracks = model.tracks || [];
  const rows = stageLanes + tracks.length;
  // لا يقل ارتفاع العمود عن 24px (WCAG 2.5.8)؛ ويطول الشريط بعدد الصفوف بدل تقليص الأعمدة
  const rowPx = Math.max(24, 48 / rows);
  const bar = (key, cls, title, label, start, width, row, text) => (
    <button key={key} type="button" className={`j-strip-bar ${cls}`} title={`${title} · ${label}`}
      style={{ insetInlineStart: `${start}%`, inlineSize: `${width}%`, insetBlockStart: `${rowPx * row}px`, blockSize: `${rowPx}px` }}
      onClick={() => onStage?.(key)}>{text}</button>
  );
  return (
    <div className="j-strip-wrap" role="group" aria-labelledby="j-strip-h">
    <p className="la-muted j-strip-h" id="j-strip-h">المراحل على الزمن{model.total_label ? ` · ${model.total_label}` : ''}</p>
    <div className="j-strip" style={{ blockSize: `${rowPx * rows}px` }}>
      {(model.stages || []).map((s) => {
        const sl = slots.get(s.slot);
        if (!sl) return null;
        const start = sl.at + (sl.width * (s.lane_at || 0)) / 100;
        const width = Math.max(2, (sl.width * (s.lane_width || 100)) / 100);
        return bar(s.key, `ph-${s.phase}${s.optional ? ' opt' : ''}`, s.title, s.label, start, width, s.lane || 0, s.title);
      })}
      {tracks.map((t, i) => bar(t.key, `ph-${t.phase} track${t.optional ? ' opt' : ''}`, `${t.title} · ${TRACK_ONLY_AR}`, t.label, t.at, Math.max(2, t.width), stageLanes + i, `${t.title} · ${TRACK_ONLY_AR}`))}
    </div>
    </div>
  );
}

const NONE = Object.freeze([]);
export function Journey({ catalog, reload, canWrite, onProgram, onPatch }) {
  const [edit, editor] = useEditor(reload);
  const { toast, confirm } = useUI();
  const pid = catalog.program_id;
  // وضع العرض افتراضي، والبناء لصاحب الكتابة وحده (الخادم يبقى صاحب القرار: requireWrite على كل كتابة)
  const [mode, setModeRaw] = useState(() => journeyModeOf(readQuery(), canWrite));
  const build = canWrite && mode === 'build';
  const setMode = (m) => { setModeRaw(m); writeQuery(withMode(readQuery(), m)); };
  useEffect(() => { if (!canWrite && mode === 'build') setModeRaw('view'); }, [canWrite, mode]);
  // إعلان النقل والإخفاء (aria-live)
  const [said, setSaid] = useState('');
  const [pdata, setPdata] = useState(null);
  useEffect(() => { L('admin.programs').then(setPdata); }, [pid]);
  // تحصين (نقطة التحقق 2026-11-27): رد ناجح بلا journey_stages أو stage_requirements يُعرض رحلة فارغة بدل الانهيار
  const stagesIn = Array.isArray(catalog.journey_stages) ? catalog.journey_stages : NONE;
  const stages = useMemo(() => [...stagesIn].sort((a, b) => a.sort - b.sort), [stagesIn]);
  const reqs = Array.isArray(catalog.stage_requirements) ? catalog.stage_requirements : NONE;
  // المعالم المخالفة للافتراض: شارة على بطاقة مرحلتها (طي المعالم، 4.2 البند 2)
  const [msList, setMsList] = useState(NONE);
  const msOdd = useMemo(() => new Set(foldMilestones(msList, stages).shown.filter((m) => m.active !== false && m.stage_key).map((m) => m.stage_key)), [msList, stages]);
  const board = useMemo(() => journeyBoard(stagesIn), [stagesIn]);
  useSpot(catalog);
  // سياق واحد (journeyCtx): مدة القياس من رد admin.catalog (baselineMinutes على الخادم)، لا قيمة ثابتة هنا
  const ctxOf = (s) => journeyCtx({ reqs, readyMin: READY_MIN, assessmentMinutes: catalog.assessment_minutes }, s);
  const shown = (t, s) => <JourneyText text={renderJourneyText(t, ctxOf(s))} />;
  // الرحلة في لمحة (J1b): من الحمولة نفسها، فتتحدث فور الحفظ. النقر المزدوج أو «افتحه» ينقل إلى النشاط في القائمة تحتها
  const timeline = useMemo(() => journeyTimeline({ stages: stagesIn, requirements: reqs }, { title: 'رحلة البرنامج' }), [stagesIn, reqs]);
  const openReq = (a) => {
    const el = document.getElementById(`jreq-${a.requirement_id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (el.querySelector('button.la-link') || el).focus?.({ preventScroll: true });
  };
  // القدوم من «الحضور والجلسات» (attendance-groups.js): ‎?add=workshop‎ يفتح نموذج المتطلب نفسه بنوع الجلسات الجماعية،
  // و‎?req=<id>‎ ينقل إلى المتطلب في القائمة. يُحفظ بالمسار نفسه (stage_requirements في المسودة)، فلا نسخة ثانية للمتطلب
  // نشاط جديد (المرحلة 22، 4.4): النوع أولًا بأسمائه البشرية، ثم لوحة النشاط بالاسم وإلزامي أو اختياري، والرمز مقترح في «متقدم»
  const reqDetails = (stageKey, kind) => ({
    title: `${ACTIVITY_AR} جديد`, panel: true, groups: reqPanelGroups(),
    fields: reqPanelFields(reqFields(stages, catalog.learning_models || [], catalog.lab_links || [])),
    values: reqToForm({ stage_key: stageKey, kind, required: true, active: true, code: suggestCode(kind, reqs), config: { ...(KIND_DEFAULT_CONFIG[kind] || {}) } }),
    onSave: (v) => save('stage_requirements', { program_id: pid, sort: reqs.filter((x) => x.stage_key === v.stage_key).length + 1 })(formToReq(v)),
  });
  const newReq = (stageKey, kind = null) => edit(kind ? reqDetails(stageKey, kind) : {
    title: `نوع ${ACTIVITY_AR} الجديد`, panel: true, fields: [kindChoiceField()], values: {}, saveLabel: 'التالي',
    onSave: async (v) => ({ success: true, nextForm: reqDetails(stageKey, v.kind) }),
  });
  useEffect(() => {
    const q = new URLSearchParams(readQuery());
    const add = q.get('add'), req = q.get('req');
    if (!add && !req) return;
    writeQuery(withMode('', mode));
    if (req) { setTimeout(() => openReq({ requirement_id: req }), 0); return; }
    const first = stages.find((s) => s.active) || stages[0];
    if (add === 'workshop' && canWrite && first) { setMode('build'); newReq(first.key, 'workshop'); }
  }, [pid]);
  // الرحلة الفارغة: زر الخط الزمني ينقل إلى أول «+ مرحلة» (لمن يملك الكتابة)
  // ملاحظة الاتساق: الرابط ينقل إلى متطلبها (برمزه) أو إلى بطاقة مرحلتها في القائمة، ويضع التركيز فيها
  const issues = journeyCoherence(stages, reqs, { readyMin: READY_MIN, assessmentMinutes: catalog.assessment_minutes });
  const toIssue = (x) => {
    const r = x.req && reqs.find((q) => q.code === x.req);
    const el = r ? document.getElementById(`jreq-${r.id}`) : x.stage ? [...document.querySelectorAll('[data-mt-row]')].find((e) => e.dataset.mtRow === x.stage) : null;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (el.querySelector('button') || el).focus?.({ preventScroll: true });
  };
  const rowEl = (key) => [...document.querySelectorAll('[data-mt-row]')].find((e) => e.dataset.mtRow === key);
  const toStage = (key) => {
    const el = rowEl(key);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.focus?.({ preventScroll: true });
    // فتح من الملخص: في وضع البناء تُفتح لوحة المرحلة أيضًا
    const s = build && stages.find((x) => x.key === key);
    if (s) editStage(s);
  };
  // ── وضع البناء (المرحلة 22): اللوحات وقائمة «⋯» والنقل ──
  // البطاقة المحررة تبقى ظاهرة بجانب اللوحة
  const beside = (key) => rowEl(key)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  const editStage = (s) => {
    beside(s.key);
    edit({ title: `مرحلة: ${s.title_ar}`, panel: true, groups: stagePanelGroups(stageRuleSummary(s, stages)), notes: durationNote,
      fields: stagePanelFields(stageFields(reqs, stages, s.key, catalog.assessment_minutes)), values: stageToForm(s),
      onSave: (v) => save('journey_stages', { key: s.key, program_id: pid })(formToStage(v)) });
  };
  const editReq = (r) => {
    beside(r.id);
    const sys = isSystemCode(r.code);
    edit({ title: `تحرير ${ACTIVITY_AR}`, panel: true, groups: reqPanelGroups(), lead: sys ? `${SYSTEM_CODE_AR}: ${r.code}` : null,
      fields: reqPanelFields(lockReqCode(reqFields(stages, catalog.learning_models || [], catalog.lab_links || []))).map((f) => (sys && f.name === 'code' ? { ...f, label: `الرمز (${SYSTEM_CODE_AR})` } : f)),
      values: reqToForm(r), onSave: (v) => save('stage_requirements', { id: r.id })(formToReq(v)), onDelete: del('stage_requirements', r.id) });
  };
  const newStage = (ph) => edit({
    title: 'مرحلة جديدة', panel: true, fields: newStageFields(), values: { phase: ph, mode: 'required', duration_days: '' }, saveLabel: 'أضف المرحلة',
    onSave: async (v) => {
      const r = await L('admin.stage-create', { program_id: pid, title_ar: v.title_ar, phase: v.phase, mode: v.mode, duration_days: v.duration_days });
      if (r.success) {
        const after = r.next && stages.find((x) => x.key === r.next);
        toast(after ? `أُضيفت آخر محورها، وصارت «${after.title_ar}» بعدها` : 'أُضيفت المرحلة آخر محورها');
      }
      return r;
    },
  });
  // ما يعود من النقل: صفوف المرحلتين وحدهما تحل محل ما في الكتالوج، بلا إعادة تحميله كله
  const patchStages = (rows, keys) => {
    if (!onPatch) { reload(); return; }
    const touched = new Set(keys);
    onPatch((c) => ({ ...c, stage_requirements: [...(c.stage_requirements || []).filter((x) => !touched.has(x.stage_key)), ...rows] }));
  };
  const moveReqTo = async (r, stageKey, position, ok = false) => {
    const target = reqs.filter((x) => x.stage_key === stageKey && x.id !== r.id).sort((a, b) => a.sort - b.sort).map((x) => x.id);
    const source = reqs.filter((x) => x.stage_key === r.stage_key && x.id !== r.id).sort((a, b) => a.sort - b.sort).map((x) => x.id);
    let res = await L('admin.requirement-move', { id: r.id, program_id: pid, stage_key: stageKey, position, expect_stage: r.stage_key, expect_sort: r.sort, target_ids: target, source_ids: source, confirm: ok || undefined });
    if (!res.success && res.code === 'confirm') {
      if (!(await confirm(`${res.message} انقله؟`, { ok: 'انقله' }))) return { success: false, message: 'لم يُنقل شيء' };
      res = await L('admin.requirement-move', { id: r.id, program_id: pid, stage_key: stageKey, position, expect_stage: r.stage_key, expect_sort: r.sort, target_ids: target, source_ids: source, confirm: true });
    }
    if (!res.success) {
      // تعارض كتابة من مدير آخر: رسالة لا تُتجاهل ثم إعادة تحميل
      if (res.code === 'conflict') { await confirm(res.message, { ok: 'حدّث الصفحة' }); reload(); }
      return res;
    }
    patchStages(res.rows || [], [res.from, res.to]);
    setSaid(movedAr(res.position, res.stage_title));
    return { ...res, silent: true };
  };
  const moveReq = async (r, dir) => {
    const list = reqs.filter((x) => x.stage_key === r.stage_key).sort((a, b) => a.sort - b.sort);
    const i = list.findIndex((x) => x.id === r.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const res = await moveReqTo(r, r.stage_key, j + 1);
    if (!res.success && res.message) toast(res.message);
  };
  const moveStage = async (s, dir) => {
    const ids = reorderIds(stagesIn, 'journey_stages', s.key, dir);
    if (!ids) return;
    const r = await L('admin.reorder', { entity: 'journey_stages', ids, program_id: pid });
    if (!r.success) { toast(r.message); return; }
    setSaid(`«${s.title_ar}» صارت في الموضع ${ids.indexOf(s.key) + 1} من ${ids.length}`);
    keepSpot(typeof window === 'undefined' ? 0 : window.scrollY, s.key, SPOT_SCOPE);
    reload();
  };
  const moveTo = (r) => edit({
    title: `نقل ${ACTIVITY_AR} «${plain(r.title_ar)}»`, panel: true, fields: moveFields(stages), values: { stage_key: r.stage_key, position: '' }, saveLabel: 'انقل',
    onSave: (v) => moveReqTo(r, v.stage_key, v.position == null ? null : v.position),
  });
  // الإخفاء بدل الحذف: active=false عبر admin.save، فيبقى تقدم المشاركين والنسخ المحفوظة
  const toggle = async (entity, base, on, name) => {
    const r = await save(entity, base)({ active: on });
    if (!r.success) { toast(r.message); return; }
    setSaid(on ? `أُظهر ${name}` : `أُخفي ${name}، ويبقى تقدم المشاركين محفوظًا`);
    reload();
  };
  const stageMenu = (s) => {
    const sorted = stages;
    const i = sorted.findIndex((x) => x.key === s.key);
    return [
      { label: 'تحرير', run: () => editStage(s) },
      i > 0 && { label: 'أعلى', run: () => moveStage(s, -1) },
      i < sorted.length - 1 && { label: 'أسفل', run: () => moveStage(s, 1) },
      { label: s.active ? 'إخفاء' : 'إظهار', run: () => toggle('journey_stages', { key: s.key, program_id: pid }, !s.active, `المرحلة «${s.title_ar}»`) },
    ];
  };
  const reqMenu = (r, i, n) => [
    { label: 'تحرير', run: () => editReq(r) },
    i > 0 && { label: 'أعلى', run: () => moveReq(r, -1) },
    i < n - 1 && { label: 'أسفل', run: () => moveReq(r, 1) },
    { label: 'نقل إلى…', run: () => moveTo(r) },
    { label: r.active ? 'إخفاء' : 'إظهار', run: () => toggle('stage_requirements', { id: r.id }, !r.active, `${ACTIVITY_AR} «${plain(r.title_ar)}»`) },
  ];
  const plain = (t, s) => String(renderJourneyText(t, ctxOf(s)) ?? '');
  // بطاقة المرحلة: الرقم والاسم والمدة وطريقة التقديم، وجملة القاعدة، وأنشطتها صفوفًا بأسماء كاملة بلا قص (4.3 وضع العرض 1).
  // الرمز التقني (P-INFO) في title وحقل التحرير المتقدم وحدهما (4.1 البند 9)
  // وضع العرض بلا أزرار تحرير. وضع البناء: الاسم يفتح لوحته، وقائمة «⋯» في كل صف، وAlt مع الأسهم ينقل الصف
  const stageCard = (s) => {
    const list = reqs.filter((r) => r.stage_key === s.key).sort((a, b) => a.sort - b.sort);
    return (
      <KeyRow as="section" key={s.key} rowId={s.key} tabIndex={-1} aria-labelledby={`j-st-${s.key}`} className={`la-card la-stage-ed${s.active ? '' : ' off'}`}>{(skeys) => {
        if (build) skeys.current = (dir) => moveStage(s, dir);
        const name = <>{s.sort}. {shown(s.title_ar, s)}</>;
        return (<>
          <div className="la-row between">
            <div><b id={`j-st-${s.key}`}>{build ? <button type="button" className="la-link j-open" onClick={() => editStage(s)}>{name}</button> : name}</b> <small className="la-muted">{shown(s.duration_label, s)}{s.mode ? ` · ${MODE[s.mode]}` : ''}{s.active ? '' : ' · مخفية'}</small>
              {stageRules(s).lane === 'track' && <> <small className="la-chip">{TRACK_ONLY_AR}</small></>}
              {msOdd.has(s.key) && <> <small className="la-chip">معلم مخصص</small></>}</div>
            {build && <div className="la-row j-acts-menu"><MoreMenu label={`إجراءات المرحلة «${plain(s.title_ar, s)}»`} items={stageMenu(s)} /></div>}
          </div>
          <p className={`la-rule ${stageRules(s).mode}`}>{stageRuleSummary(s, stages)}</p>
          {s.description_ar && <p className="la-muted">{shown(s.description_ar, s)}</p>}
          <ul className="la-reqs j-acts">
            {list.map((r, i) => (
              <KeyRow key={r.id} rowId={r.id} id={`jreq-${r.id}`} tabIndex={-1} title={r.code} className={`${r.required ? 'req-must' : 'req-opt'}${r.active ? '' : ' off'}`}>{(rkeys) => {
                if (build) rkeys.current = (dir) => moveReq(r, dir);
                const title = shown(r.title_ar);
                return (<>
                  <span className="j-act">
                    {build ? <button type="button" className="la-link j-act-name" onClick={() => editReq(r)}>{title}</button> : <span className="j-act-name">{title}</span>}{' '}
                    <small className="la-chip" data-kind={r.kind}>{ACTIVITY_KIND_ICO[r.kind] && <Ico name={ACTIVITY_KIND_ICO[r.kind]} />}{ACTIVITY_KIND_AR[r.kind] || r.kind}</small>{' '}
                    <small className="la-chip j-word">{r.required ? JOURNEY_KEY_AR.required : JOURNEY_KEY_AR.optional}</small>{' '}
                    <small className={`la-chip ${completionSource(r) === 'manual' ? 'warn' : completionSource(r) === 'auto' ? 'j-auto' : ''}`} title="كيف يكتمل">{COMPLETION_AR[completionSource(r)]}</small>
                    {r.dimension && <> <small className="la-chip">{DIM[r.dimension]}{r.level ? ` · ${LVL[r.level]}` : ''}</small></>}
                    {r.needs_review && <> <small className="la-chip warn">{JOURNEY_KEY_AR.review}</small></>}
                    {!r.active && <> <small className="la-chip">مخفي</small></>}
                  </span>
                  {build && <span className="la-row j-acts-menu"><MoreMenu label={`إجراءات ${ACTIVITY_AR} «${plain(r.title_ar)}»`} items={reqMenu(r, i, list.length)} /></span>}
                </>);
              }}</KeyRow>
            ))}
          </ul>
          {build && <button className="la-link j-add" onClick={() => newReq(s.key)}>+ {ACTIVITY_AR}</button>}
        </>);
      }}</KeyRow>
    );
  };
  const toAddStage = () => {
    if (canWrite && !build) setMode('build');
    setTimeout(() => {
      const btn = document.querySelector('[data-add-stage]');
      if (!btn) return;
      btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      btn.focus({ preventScroll: true });
    }, 0);
  };
  return (
    <>
      {/* الترويسة الموحدة (المرحلة 7 و18) وسطر حالتها الواحد (المرحلة 19)، ومفتاح العرض والبناء لصاحب الكتابة (المرحلة 22) */}
      <ScreenHead title="الرحلة والمتطلبات" status={<JourneyStatus pid={pid} data={pdata} issues={issues} onIssue={toIssue} />}
        actions={<>{canWrite && <ModeSwitch mode={build ? 'build' : 'view'} onMode={setMode} />}{onProgram ? <ProgramBar current={pid} onProgram={onProgram} programs={pdata?.success ? pdata.programs : null} /> : null}</>} />
      <p className="sr-only" aria-live="polite" data-testid="j-said">{said}</p>
      {/* العرض الواحد (المرحلة 21): الشريط الزمني القصير مفتوحًا، وتفصيل الأنشطة الزمني مطويًا، ثم المحاور وبطاقاتها */}
      <StageStrip model={timeline} onStage={toStage} />
      <details className="j-tl-detail">
        <summary>التفصيل الزمني للأنشطة</summary>
        <JourneyTimeline key={pid} id="jt-program" model={timeline} onOpen={openReq} openLabel={() => 'افتحه في القائمة'} onEmpty={canWrite ? toAddStage : undefined} pop />
      </details>
      <JourneyKey />
      <div className={`j-board${build ? ' j-build' : ''}`}>
        {board.phases.map(({ key: ph, title: phl, stages: list, orphan }) => (
          <section key={ph} className="j-axis" aria-labelledby={`j-axis-${ph}`}>
            <h3 className="la-phase" id={`j-axis-${ph}`}>{phl}</h3>
            {orphan && <p className="la-hint warn" role="note">{NO_AXIS_NOTE_AR}</p>}
            <div className="j-cards">{list.map(stageCard)}</div>
            {build && !orphan && <button className="btn-sm ghost j-add" data-add-stage={ph} onClick={() => newStage(ph)}>+ مرحلة</button>}
          </section>
        ))}
      </div>
      {board.services.length > 0 && (
        <section className={`j-service${build ? ' j-build' : ''}`} aria-labelledby="j-service-h">
          <h3 className="la-phase" id="j-service-h">{PARALLEL_SERVICE_AR}</h3>
          <p className="la-muted">{PARALLEL_SERVICE_NOTE_AR}</p>
          <div className="j-cards">{board.services.map(stageCard)}</div>
        </section>
      )}
      <ProgramMilestones pid={pid} stages={stages} canWrite={build} onList={setMsList} />
      {editor}
    </>
  );
}

// ══ أسئلة القياس ══
// الأسئلة مجمعة بالجانب، والجانب الذي لا سؤال له في الأداة لا يظهر: «انتقال التعلم» للبعدي وحده، فكان عنوانه يظهر فارغًا في القبلي
export const tierGroups = (qs) => Object.entries(TIER).map(([t, title]) => ({ t, title, qs: qs.filter((q) => q.tier === t) })).filter((g) => g.qs.length);

export function Assessment({ catalog, reload, canWrite }) {
  const [edit, editor] = useEditor(reload);
  useSpot(catalog);
  const insts = [...catalog.instruments].sort((a, b) => (a.kind + b.version).localeCompare(b.kind + a.version));
  const [instId, setInstId] = useState(() => (insts.find((i) => i.active && i.kind === 'baseline') || insts[0])?.id);
  const [dim, setDim] = useState('milestone');
  const [quality, setQuality] = useState(false);
  const inst = insts.find((i) => i.id === instId) || insts[0];
  if (!inst) return <p className="la-muted">لا أدوات قياس.</p>;
  const locked = catalog.locked_instruments.includes(inst.id);
  const qs = catalog.questions.filter((q) => q.instrument_id === inst.id && q.dimension === dim).sort((a, b) => a.sort - b.sort);
  const count = (d) => catalog.questions.filter((q) => q.instrument_id === inst.id && q.dimension === d && q.active).length;


  return (
    <>
      <div className="la-row">
        <select value={inst.id} onChange={(e) => setInstId(e.target.value)} aria-label="أداة القياس">
          {insts.map((i) => <option key={i.id} value={i.id}>{i.title_ar} · {i.key}{i.active ? ' (فعّال)' : ''}</option>)}
        </select>
        {canWrite && <>
          <button className="btn-sm ghost" onClick={() => edit({ title: 'أداة القياس', fields: INST_FIELDS, values: inst, onSave: save('instruments', { id: inst.id }) })}>المقدمة والمدة</button>
        </>}
        <button className="btn-sm ghost" aria-pressed={quality} onClick={() => setQuality(!quality)}>جودة الأسئلة</button>
      </div>
      {quality && <ItemQuality instrumentId={inst.id} />}
      <div className="la-note" role="note">{QUESTIONS_LOCK_AR}{locked ? ' ولهذا الإصدار نتائج سابقة.' : ''}</div>
      <nav className="la-subtabs" aria-label="الأطر">
        {DIMS.map((d) => <button key={d} className={dim === d ? 'on' : ''} aria-current={dim === d ? 'true' : undefined} onClick={() => setDim(d)}>{DIM[d]} <small>{count(d)}</small></button>)}
      </nav>
      {!qs.length && <p className="la-muted">لا أسئلة لهذا الإطار في هذه الأداة.</p>}
      {tierGroups(qs).map(({ t, title, qs: list }) => (
        <React.Fragment key={t}>
          <h4 className="la-phase">{title}</h4>
          <ol className="la-qs">
            {list.map((q) => (
              <KeyRow key={q.id} rowId={q.id} className={q.active ? '' : 'off'}>{(qkeys) => (<>
                <div className="la-row between">
                  <span><code>{q.code}</code> {q.text_ar}</span>
                  <span className="la-row">
                    <RowMove catalog={catalog} reload={reload} canWrite={canWrite} entity="questions" id={q.id} name={`السؤال ${q.code}`} keysRef={qkeys} />
                    {canWrite && <button className="la-link" onClick={() => edit({
                      title: `سؤال ${q.code}`, fields: Q_SAFE, values: q,
                      onSave: save('questions', { id: q.id }), onDelete: null,
                    })}>تحرير</button>}
                  </span>
                </div>
                <div className="la-qopts">{(q.options || []).map((o, i) => <span key={i} className={Number(o.score) > 0 ? 'good' : ''}>{o.label} <b>{o.score}</b></span>)}</div>
              </>)}</KeyRow>
            ))}
          </ol>
        </React.Fragment>
      ))}
      {editor}
    </>
  );
}

// ══ معيار التسكين وحاسبته ══
function PlacementModel({ model, running, reload, canWrite }) {
  const { toast, prompt } = useUI();
  const [m, setM] = useState(() => ({ ...MODEL_DEFAULT, ...model }));
  const [p, setP] = useState({ knowledge: 75, skill: 25, behavior: 69 });
  const [out, setOut] = useState(null);
  const f = (k, label, hint) => (
    <label className="la-mf">
      <span>{label}</span>
      <input type="number" min="0" max="100" step="1" value={m[k]} disabled={!canWrite} onChange={(e) => setM({ ...m, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />
      <small>{hint}</small>
    </label>
  );
  const store = async () => {
    if (+m.min_advanced <= +m.min_intermediate) return toast('حد الاحترافي يجب أن يكون أعلى من حد المتوسط');
    const row = { id: 1, ...Object.fromEntries(Object.keys(MODEL_DEFAULT).map((k) => [k, Number(m[k])])) };
    const r = await withRunningReason((extra) => L('admin.save', { entity: 'placement_model', row, ...extra }), prompt);
    if (r.cancelled) return;
    toast(r.success ? 'حُفظ معيار التسكين. يسري على القياسات القادمة ويظهر مقترحه لكل مشارك' : r.message);
    if (r.success) reload();
  };
  const calc = () => setOut(evaluate(p, m) || 'bad');
  return (
    <section className="la-card la-model">
      <h3>معيار التسكين</h3>
      {running && <div className="la-note" role="note">{placementLockAr(running)}</div>}
      <><p className="la-muted">المستوى بالمؤشر المركّب، بشرط حد أدنى لكل جانب.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>لكل إطار مؤشر مركّب من 100 = متوسط موزون لجوانبه الثلاثة. يُمنح المستوى بالمؤشر، بشرط ألا يقل أي جانب عن حد أدنى، فلا تُخفي قوة جانب فجوة في آخر. والحالة الحدّية تظهر لك لتحسمها بحكمك. يسري التعديل على القياسات القادمة، ويظهر مقترحه فورًا في صفحة كل مشارك.</p></details></>
      <div className="la-model-grid">
        <div><h4>1. أوزان الجوانب</h4>{f('w_skill', 'المواقف', 'الأصدق تنبؤًا بالأداء')}{f('w_knowledge', 'المعرفة', 'الفهم والمفاهيم')}{f('w_behavior', 'الممارسة', 'تقدير ذاتي يميل للتضخم')}</div>
        <div><h4>2. حدود المستويات</h4>{f('min_intermediate', 'المؤشر للمتوسط من 100', 'الحد الأدنى')}{f('min_advanced', 'المؤشر للاحترافي من 100', 'الحد الأدنى')}{f('borderline', 'هامش الحالة الحدّية', 'نقاط تحت الحد')}</div>
        <div><h4>3. الحد الأدنى للمعرفة والمواقف</h4>{f('floor_intermediate', 'للمتوسط', 'فوق نسبة التخمين 25%')}{f('floor_advanced', 'للاحترافي', 'الممارسة الذاتية ليست بوابة، وتُعلَّم إن قلّت')}</div>
      </div>
      {canWrite && <button className="btn-sm primary" onClick={store}>حفظ المعيار</button>}
      <div className="la-calc">
        <h4>جرّب المعيار</h4>
        <div className="la-row">
          {[['knowledge', 'معرفة %'], ['skill', 'مواقف %'], ['behavior', 'ممارسة %']].map(([k, l]) => (
            <label key={k}>{l} <input type="number" min="0" max="100" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
          ))}
          <button className="btn-sm ghost" onClick={calc}>احسب</button>
        </div>
        <div className="la-muted" role="status">
          {!out ? 'أدخل نسبًا واضغط احسب. القيم الافتراضية مثال من مشارك حقيقي.'
            : out === 'bad' ? 'أدخل نسبًا صحيحة'
              : <>المؤشر المركّب <b>{out.composite}</b> · أضعف اختبار {out.low ?? '·'}% ·{(out.flags || []).map((f) => <span key={f.key}> <span className="la-chip warn">{f.reason_ar}</span></span>)} · المستوى: <span className={`la-lvl ${out.level}`}>{LVL[out.level]}</span></>}
        </div>
      </div>
    </section>
  );
}

// ══ المستويات ══
export function Levels({ catalog, reload, canWrite }) {
  const { toast } = useUI();
  const [edit, editor] = useEditor(reload);
  const cell = (d, l) => catalog.grid_cells.find((c) => c.dimension === d && c.level === l) || {};
  return (
    <>
      <section className="la-card">
        <h3>خلايا المصفوفة: مرجع الفريق لكل مستوى في كل إطار</h3>
        {/* لا تصل المشارك: mePayload يرسل الخلايا للإدارة والخبير وحدهما (التدقيق 2026-11-11، admin-program-7) */}
        <p className="la-muted">لا تظهر للمشارك: يرى مستواه العام وملف تعريف مساره. عنوان المسار في الخلية يراه الخبير في ملف المشارك، والوصف مرجع للفريق هنا.</p>
        <div className="la-cells">
          <div />
          {DIMS.map((d) => <div key={d} className="la-ch">{DIM[d]}</div>)}
          {LVLS.map((l) => (
            <React.Fragment key={l}>
              <div className="la-ch">{LVL[l]}</div>
              {DIMS.map((d) => {
                const c = cell(d, l);
                const body = <><b>{c.path_title_ar || 'بلا عنوان مسار'}</b><p>{c.description_ar || ''}</p></>;
                return canWrite
                  ? <button key={d} className="la-cell" onClick={() => edit({ title: `${DIM[d]} · ${LVL[l]}`, fields: CELL_FIELDS, values: c, onSave: save('grid_cells', { dimension: d, level: l }) })}>{body}</button>
                  : <div key={d} className="la-cell">{body}</div>;
              })}
            </React.Fragment>
          ))}
        </div>
      </section>
      {/* معيار التسكين المركّب وحده؛ قواعد level_rules القديمة أُزيلت (الترحيل 20261030140000) */}
      <PlacementModel model={catalog.placement_model?.[0] || { id: 1, ...MODEL_DEFAULT }} running={catalog.running_cohort} reload={reload} canWrite={canWrite} />
      {editor}
    </>
  );
}
