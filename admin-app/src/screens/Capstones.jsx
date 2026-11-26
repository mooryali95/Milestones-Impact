// ════════════════════════════════════════════════════════════════
// المبادرات: مراجعة وثائق المبادرات واعتمادها
// ════════════════════════════════════════════════════════════════
// قائمة واحدة لكل الوثائق بحالتها، وصفحة لكل وثيقة: تقرأها بالقالب
// نفسه الذي يراه المشارك والراعي، وتقيّمها بالمعيار السداسي، ثم تعيدها
// للتحسين مرة أو تقبلها فيُطلب تأييد راعيها. الفصول نفسها نماذج تعليمية،
// فتقييم كل فصل منفردًا يبقى في «كتاب القائد ← التقييم».
import { EXAMPLES } from '../../../supabase/content/initiative-guide/v1/examples.js';
import { copiedFromExamples } from '../../../supabase/functions/leaders-api/example-check.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DIM, L, date } from '../leaders.js';
import { CHAPTER_STANDING_AR, PRIORITY_WEIGHT, SPONSOR_STATE_AR, STATUS_TITLES_ADMIN } from '../../../supabase/functions/leaders-api/capstone.js';
import { DOC_QR_AR, LEVEL_AR, RUBRIC_LEVEL_AR, SUBMISSION_STATUS, SUBMISSION_STATUS_ADMIN } from '../../../supabase/functions/leaders-api/labels.js';
import { ADMIN_QR_CHOICES, REASON_MAX } from '../../../supabase/functions/leaders-api/doc-options.js';
// حالة الفصل في صفحة الوثيقة: الفصول يقرؤها المستشار في كتاب القائد لا المالك، فالتقديم والقراءة بلسانه،
// و«أُعيد» بفعل الوثيقة نفسه (STATUS_TITLES_ADMIN.returned) فلا يختلف الفعلان في الصفحة الواحدة
export const SECTION_STATUS_AR = { ...SUBMISSION_STATUS_ADMIN, submitted: SUBMISSION_STATUS.submitted, reviewed: SUBMISSION_STATUS.reviewed, returned: STATUS_TITLES_ADMIN.returned };
import { DocLevelMeter, Empty, Spinner, useUI } from '../ui.jsx';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, isFiltered, presetCounts, sortRows } from '../filters.js';
import { HEALTH_CHIP, TrackingPanel } from './Outcomes.jsx';
import { CHECK_CHAPTERS } from '../../../supabase/functions/leaders-api/stuck.js';
import { changedSinceRead, chapterState, checksOn, hasOpenNote, STATE_AR, unitsFor } from '../../../supabase/content/initiative-guide/v1/spine.js';

// خط الوثيقة عند الخبير («الوثيقة الحية»، 2026-11-25): الوحدات نفسها التي يراها المشارك، و«جديد» على ما تغيّر بعد قراءته،
// وملاحظة لكل فصل في مكانه. الملاحظة لا تقفل الفصل ولا تعيده (admin.ts reviewSubmissionBy)، ويراها المشارك سطرًا في أعلى فصله
export function ExpertSpine({ sections, checks, canWrite, onSaved }) {
  const { toast } = useUI();
  const [edit, setEdit] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fresh = sections.filter(changedSinceRead).length;
  const save = async (x) => {
    setBusy(true);
    const r = await L('admin.review-submission', { id: x.sub_id, status: 'reviewed', feedback: text });
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast(text.trim() ? 'حُفظت ملاحظتك على الفصل' : 'عُلّم الفصل مقروءًا');
    setEdit(null); onSaved();
  };
  return (
    <div className="xsp" data-expert-spine>
      <p className="la-muted">{fresh ? `${fresh} من الفصول تغيّرت منذ قراءتك الأخيرة.` : 'لا جديد منذ قراءتك الأخيرة.'} ملاحظتك على الفصل لا تقفله، ويرى المشارك «قرأه خبيرك» حين تقرؤه.</p>
      {unitsFor(sections).map((u) => (
        <div key={u.key} className="xsp-unit" data-unit={u.key}>
          {u.items.length > 1 && <b className="xsp-unit-t">{u.title}</b>}
          <ol className="cps-secs" style={{ listStyle: 'none', paddingInlineStart: 0 }}>{u.items.map((x) => {
            const st = chapterState(x);
            const warn = checksOn(checks, x.key, CHECK_CHAPTERS);
            return (
              <li key={x.id} className={st === 'done' ? 'ok' : ''} data-chapter={x.key} data-state={st} data-standing={x.standing || undefined}>
                <span>{x.n}. {x.title}<ChapterLevel s={x} />{changedSinceRead(x) && <span className="la-chip warn"> جديد</span>}{warn.length > 0 && <span className="la-chip bad" title={warn.map((w) => w.title).join('، ')}> فحص</span>}</span>
                <small>{x.optional ? 'اختياري' : STATE_AR[st]}{!x.complete && !x.optional ? ` · ${x.missing} حقول ناقصة` : ''}</small>
                {hasOpenNote(x) && edit !== x.id && <small className="xsp-note">ملاحظتك: {x.note}</small>}
                {canWrite && x.sub_id && x.status && x.status !== 'draft' && edit !== x.id && <button type="button" className="la-link" onClick={() => { setEdit(x.id); setText(x.note || ''); }}>{x.note ? 'عدّل الملاحظة' : 'ملاحظة أو قرأته'}</button>}
                {edit === x.id && (
                  <div className="xsp-edit">
                    <textarea className="la-input" rows={3} maxLength={4000} placeholder="ملاحظتك للمشارك على هذا الفصل (اختيارية)" value={text} onChange={(e) => setText(e.target.value)} />
                    <div className="la-row"><button type="button" className="btn-sm" disabled={busy} onClick={() => save(x)}>{text.trim() ? 'احفظ الملاحظة' : 'قرأته'}</button><button type="button" className="btn-sm ghost" onClick={() => setEdit(null)}>إلغاء</button></div>
                  </div>
                )}
              </li>
            );
          })}</ol>
        </div>
      ))}
    </div>
  );
}

const STATUS = STATUS_TITLES_ADMIN;
const CHIP = { submitted: 'warn', accepted: 'warn', approved: 'ok' };
const SCOPE = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };
// حالة الراعي من الخادم (sponsor_state): «انتهت مهلة الرابط» مشتقة هناك من sponsor_expires_at (تصور المرحلة 2، 2.2)
const SPONSOR = SPONSOR_STATE_AR;
const SPONSOR_EXPIRED_AR = 'انتهت مهلة الراعي';
// طابور المراجعة أولًا، ثم ما قيد البناء، ثم «الكل» للمحفظة كاملة (تحليل لوحة الإدارة 2026-11-15)
const FILTERS = ['submitted', 'accepted', 'returned', 'approved', 'draft'].map((k) => [k, STATUS[k]]);

// kind: 'working' ملف العمل الكامل، و'institutional' الوثيقة المؤسسية (تُحجب حتى تكتمل الأسئلة العشرة).
// شاشات الإدارة مراجع: ملحق المراجع بخيار صريح (annex، المرحلة 21) لا بمجرد وصول الحقل
export async function openDoc(doc, toast, kind = 'working', onBlocked = null, options = { annex: true }) {
  const win = window.open('', '_blank');
  const [{ writeDocument }, { renderInitiative }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/institutional.js')]);
  const r = renderInitiative(doc, kind, options);
  if (r.blocked) { win?.close(); return onBlocked ? onBlocked(r.missing) : toast(r.message); }
  if (!writeDocument(win, r.meta, r.body)) toast('اسمح بالنوافذ المنبثقة لعرض الوثيقة');
}

// تحميل الوثيقة النهائية PDF (المرحلة 21): زر أساسي ولوح صغير. «نسخة للإرسال» (الافتراض) بلا ملحق المراجع ولا صفحة القرار ولا ملحق
// ما ينقص، أو «نسخة كاملة»، ومفاتيح ثلاثة للتعديل اليدوي. الخيارات لكل تنزيل ولا تُحفظ. الوثيقة من الخادم لحظة الطلب مع تذكرة
// مربوطة ببصمتها، ويُسجَّل التنزيل admin.docExport. الملف عبر downloadBest فيطابق ما يُرى، وبلا نسبة الجاهزية
const EXPORT_SWITCHES = [['decision', 'صفحة القرار'], ['annex', 'ملحق المراجع'], ['appendix', 'ملحق ما ينقص'], ['qr', 'رمز التحقق']];
// qrOk: قرار الرمز الفعلي (المرحلة 33، effectiveQr). المحجوب لا يُطبع رمزه في أي نسخة، فالمفتاح معطل بسببه
export function FinalDocExport({ participantId, approved = false, qrOk = true }) {
  const canQr = approved && qrOk;
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState('send');
  const [opts, setOpts] = useState(null);
  const [mod, setMod] = useState(null);
  const [busy, setBusy] = useState('');
  const trigger = useRef(null);
  const wrap = useRef(null);
  const panel = useRef(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => { if (open) panel.current?.querySelector('input[type=radio]:checked')?.focus(); }, [open]);
  useEffect(() => {
    if (!open || busy) return undefined;
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [open, busy]);
  useEffect(() => { if (open && !mod) import('../../../src/lib/brand/institutional.js').then(setMod); }, [open, mod]);
  const base = mod?.EXPORT_PRESETS[preset];
  const options = base ? { ...base, ...(opts || {}), ...(canQr ? {} : { qr: false }) } : null;
  const pick = (p) => { setPreset(p); setOpts(null); };
  const download = async () => {
    if (!options) return;
    setBusy('لحظة…');
    try {
      const r = await L('admin.doc-export', { participant_id: participantId, preset, options });
      if (!r.success) { setBusy(''); return toast(r.message); }
      const [{ finalDocument }, { downloadBest }] = await Promise.all([import('../../../src/lib/brand/institutional.js'), import('../../../src/lib/brand/pdf.js')]);
      const out = finalDocument(r.doc, options);
      await downloadBest(out.meta, out.body, { server: r.pdf, onProgress: setBusy });
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast('تعذّر بناء الملف في هذا المتصفح. افتح الوثيقة واختر «طباعة» ثم «حفظ PDF».');
    }
    setBusy('');
  };
  return (
    <span className="cps-export" ref={wrap}>
      <button type="button" ref={trigger} className="btn-sm primary" aria-expanded={open} onClick={() => setOpen((x) => !x)}>تحميل الوثيقة النهائية PDF</button>
      {open && (
        <div ref={panel} className="la-card cps-export-panel" role="group" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(); } }} aria-label="خيارات الوثيقة النهائية">
          <div className="la-row" role="radiogroup" aria-label="النسخة">
            {[['send', 'نسخة للإرسال'], ['full', 'نسخة كاملة']].map(([k, t]) => (
              <label key={k} className="row"><input type="radio" name={`cps-export-${participantId}`} checked={preset === k} onChange={() => pick(k)} /> {t}</label>
            ))}
          </div>
          <div className="la-row">
            {EXPORT_SWITCHES.map(([k, t]) => (
              <label key={k} className="row" title={k === 'qr' && !canQr ? (approved ? DOC_QR_AR.admin_now(false) : 'رمز التحقق للوثيقة المعتمدة فقط') : undefined}><input type="checkbox" role="switch" disabled={!options || (k === 'qr' && !canQr)} checked={k === 'qr' ? canQr && !!options?.qr : !!options?.[k]} onChange={(e) => setOpts((o) => ({ ...(o || {}), [k]: e.target.checked }))} /> {t}</label>
            ))}
          </div>
          {options && approved && !qrOk && <p className="la-muted small">{DOC_QR_AR.admin_now(false)}</p>}
          {options && <p className="la-muted small" aria-live="polite">{mod.exportSummary(options, { approved })}</p>}
          <div className="la-row">
            <button type="button" className="btn-sm primary" disabled={!options || !!busy} onClick={download}>{busy || 'تحميل'}</button>
            <button type="button" className="btn-sm ghost" disabled={!!busy} onClick={close}>إلغاء</button>
          </div>
        </div>
      )}
    </span>
  );
}

// موقع الفصل من مستوى الوثيقة (المرحلة 4): مستوى القائد في إطار الفصل، ومطلوب أو اختياري أو باقٍ بقاعدة «لا فقد»،
// ومعيار المستوى في تلميح. كله من الخادم (capstone.js chapterLevel)، فلا قاعدة هنا. يقرؤه ملف المشارك أيضًا (PersonFile)
export function ChapterLevel({ s }) {
  if (!s?.standing) return null;
  const crit = (s.criteria || []).map((r) => `${r.title}: ${r.anchor}`).join('\n');
  return (
    <span className="cps-lvl">
      {LEVEL_AR[s.level] && <span className="la-chip" title={crit ? `معيار المستوى (الدرجة العليا)\n${crit}` : undefined}>{LEVEL_AR[s.level]}</span>}
      <span className={`la-chip ${s.standing === 'kept' ? 'warn' : ''}`}>{CHAPTER_STANDING_AR[s.standing]}</span>
      {s.kept_fields > 0 && <span className="la-chip warn">{s.kept_fields === 1 ? 'حقل باقٍ مما كتبه' : `${s.kept_fields} حقول باقية مما كتبه`}</span>}
      {crit && <small className="la-muted cps-crit-line">{(s.criteria || []).map((r) => r.anchor).join(' · ')}</small>}
    </span>
  );
}

function Review({ d, canWrite, onSaved, onFailed }) {
  const { toast, confirm } = useUI();
  const c = d.capstone;
  const [scores, setScores] = useState(() => c.scores || {});
  const [notes, setNotes] = useState(() => c.notes || {});
  const [note, setNote] = useState(c.review_note || '');
  const [waive, setWaive] = useState('');
  const [busy, setBusy] = useState('');
  const canReturn = (c.revisions || 0) < d.max_revisions;
  // بلا بريد صحيح للراعي لا يُطلب تأييد: المبادرة قد تكون افتراضية والراعي توضيح لا شرط (قرار المالك 2026-11-14)،
  // فالقبول اعتماد مباشر يسجّل الخادم سببه الثابت، ولا يُطلب من المستشار سبب لكل وثيقة
  const noSponsor = !d.sponsor_email;
  // سبب الاعتماد دون تأييد راعٍ له بريد، بحد الخادم نفسه (عشرة أحرف، capstone.ts)؛ وكان وجود أي سبب يلغي التأكيد فيُعتمد نهائيًا بنقرة
  const why = noSponsor ? '' : waive.trim();
  const waiveShort = !!why && why.length < 10;
  const send = async (decision) => {
    if (decision === 'return' && !(await confirm('تُعاد الوثيقة للمشارك ليحسّنها، وهذا التحسين الوحيد المتاح له. متابعة؟'))) return;
    if (decision === 'accept' && !(await confirm(noSponsor
      ? 'تُعتمد الوثيقة نهائيًا بقبولك، فلا راعٍ فعلي لها: تُمنح نقاط الاعتماد ويُبلَّغ المشارك بالبريد، ولا يُتراجع عن ذلك. متابعة؟'
      : why
      ? 'تُعتمد الوثيقة نهائيًا دون تأييد الراعي: تُمنح نقاط الاعتماد ويُبلَّغ المشارك بالبريد، ولا يُتراجع عن ذلك. متابعة؟'
      : 'تُقبل الوثيقة ويُرسل طلب التأييد إلى راعيها. متابعة؟'))) return;
    setBusy(decision);
    const r = await L('admin.capstone-review', { participant_id: d.participant_id, decision, scores, notes, note, waive_sponsor: decision === 'accept' ? why : '' });
    setBusy('');
    // أي خطأ يعيد تحميل الوثيقة، فلا تبقى الشاشة على حالة تغيّرت على الخادم
    if (!r.success) { toast(r.message); onFailed(); return; }
    toast(r.warning || (decision === 'return' ? 'أُعيدت للمشارك' : why || noSponsor ? 'اعتُمدت الوثيقة' : 'قُبلت وأُرسل طلب التأييد'));
    onSaved(r);   // تحديث العدّادات من L نفسه (CHANGES_PENDING)
  };
  return (
    <section className="la-card cps-review">
      <h3>تقييمك بالمعيار <small className="la-muted">{d.priority ? <>· أبعاد {DIM[d.priority]} وزنها ×{PRIORITY_WEIGHT}</> : '· المستويات الثلاثة متساوية، فكل الأبعاد بوزن واحد'}</small></h3>
      {d.sponsor_self && <p className="la-warn" role="note">بريد الراعي في بطاقة المبادرة هو بريد المشارك نفسه، فلا يُرسل له طلب تأييد. القبول يعتمدها دون تأييد، أو أعدها له ليكتب بريد راعيها.</p>}
      {!!d.sponsor_warnings?.length && <p className="la-muted small" role="note">تنبيه عن بريد الراعي (لا يمنع القبول): {d.sponsor_warnings.join('، ')}. تأكد أنه صاحب قرار يعرف المبادرة قبل أن يُدعى.</p>}
      <fieldset disabled={!canWrite || !!busy}>
        {d.rubric.map((r) => (
          <div key={r.key} className="cps-crit">
            <div className="la-row between"><b>{r.title}</b><span className="la-row">{r.level && <span className="la-chip" title="مراسي هذا البعد مكتوبة لمستوى المشارك في إطاره، فالدرجة تُقرأ نسبةً إلى مستواه">مراسي مستوى {LEVEL_AR[r.level]}</span>}{r.dimension === d.priority && <span className="la-chip warn">الوزن ×{PRIORITY_WEIGHT}</span>}</span></div>
            <div className="cps-anchors" role="radiogroup" aria-label={r.title}>
              {r.anchors.map((a, i) => (
                <button key={i} type="button" role="radio" aria-checked={scores[r.key] === i + 1} className={scores[r.key] === i + 1 ? 'on' : ''}
                  onClick={() => setScores({ ...scores, [r.key]: i + 1 })}><b>{i + 1}. {RUBRIC_LEVEL_AR[i + 1]}</b><span>{a}</span></button>
              ))}
            </div>
            <textarea rows={2} placeholder="ملاحظتك على هذا البعد (تصل المشارك)" value={notes[r.key] || ''} onChange={(e) => setNotes({ ...notes, [r.key]: e.target.value })} />
          </div>
        ))}
        <label className="cps-note">خلاصتك للمشارك<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {noSponsor && <p className="la-muted" role="note">لا راعٍ فعلي في بطاقة المبادرة (الراعي توضيح لدوره، والمبادرة قد تكون افتراضية)، فقبولك يعتمد الوثيقة مباشرة.</p>}
        {!noSponsor && <label className="cps-note">اعتماد دون تأييد الراعي (اختياري، بسبب مكتوب)<input value={waive} placeholder="مثال: الراعي في إجازة طويلة، والجهة أكدت الرعاية بخطاب" onChange={(e) => setWaive(e.target.value)} /></label>}
        <div className="la-row">
          <button className="btn-sm primary" disabled={waiveShort} title={waiveShort ? 'اكتب سبب الاعتماد دون تأييد (عشرة أحرف على الأقل)' : undefined} onClick={() => send('accept')}>{busy === 'accept' ? 'لحظة…' : noSponsor ? 'قبول واعتماد دون راعٍ' : why ? 'قبول واعتماد' : 'قبول وطلب تأييد الراعي'}</button>
          {canReturn && <button className="btn-sm ghost" onClick={() => send('return')}>{busy === 'return' ? 'لحظة…' : 'إعادة للتحسين'}</button>}
          {!canReturn && <small className="la-muted">استُنفد التحسين المتاح، فالقرار قبول بالمعيار.</small>}
        </div>
      </fieldset>
    </section>
  );
}

// قرار رمز التحقق (المرحلة 33): يتبع صاحبها (الافتراض) أو إظهار أو منع، ومن قرر ومتى وسبب اختياري. قرار الأدمن يعلو
// تفضيل القائد، والقيمة الفعلية من الخادم (effectiveQr) وتُقرأ حيًا في كل نسخة وفي التحقق
export function QrDecision({ id, q, canWrite, onSaved }) {
  const { toast } = useUI();
  const [choice, setChoice] = useState(q.choice || 'follow');
  const [reason, setReason] = useState(q.admin?.reason || '');
  const [busy, setBusy] = useState(false);
  const dirty = choice !== (q.choice || 'follow') || (choice !== 'follow' && reason.trim() !== (q.admin?.reason || ''));
  const save = async () => {
    setBusy(true);
    const r = await L('admin.capstone-options', { participant_id: id, qr: choice, reason: reason.trim() });
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast(DOC_QR_AR.saved);
    onSaved();
  };
  const off = !canWrite || !q.available || busy;
  return (
    <section className="la-card cps-qr" data-qr={q.qr ? 'on' : 'off'}>
      <h3>{DOC_QR_AR.admin_title}</h3>
      <p className="la-muted small">{DOC_QR_AR.admin_now(q.qr)} · {DOC_QR_AR.owner_pref(q.owner)}{q.admin ? ` · ${DOC_QR_AR.admin_by(q.admin.by, q.admin.at ? date(q.admin.at) : '')}` : ''}</p>
      {!q.available && <p className="la-muted small">{DOC_QR_AR.admin_unavailable}</p>}
      <div className="la-row" role="radiogroup" aria-label={DOC_QR_AR.admin_title}>
        {ADMIN_QR_CHOICES.map((k) => (
          <label key={k} className="row"><input type="radio" name={`cps-qr-${id}`} disabled={off} checked={choice === k} onChange={() => setChoice(k)} /> {DOC_QR_AR.admin_choices[k]}</label>
        ))}
      </div>
      {choice !== 'follow' && (
        <div className="la-row">
          <input aria-label={DOC_QR_AR.admin_reason} placeholder={DOC_QR_AR.admin_reason} maxLength={REASON_MAX} disabled={off} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      {canWrite && <div className="la-row"><button type="button" className="btn-sm primary" disabled={off || !dirty} onClick={save}>{busy ? 'لحظة…' : 'حفظ'}</button></div>}
    </section>
  );
}

function Sponsor({ d, canWrite, onSaved }) {
  const { toast } = useUI();
  const c = d.capstone;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const act = async (kind) => {
    setBusy(kind);
    const r = await L('admin.capstone-sponsor', kind === 'waive' ? { participant_id: d.participant_id, waive: reason } : { participant_id: d.participant_id });
    setBusy('');
    if (!r.success) return toast(r.message);
    toast(kind === 'waive' ? 'اعتُمدت الوثيقة' : 'أُعيد إرسال الدعوة');
    onSaved(r);
  };
  return (
    <section className="la-card">
      <h3>تأييد الراعي</h3>
      <p>{c.sponsor_name || 'الراعي'} {c.sponsor_email && <span className="la-muted" dir="ltr">{c.sponsor_email}</span>} · {c.sponsor_state ? <span className={`la-chip ${c.sponsor_state === 'expired' ? 'bad' : ''}`}>{SPONSOR[c.sponsor_state]}</span> : 'لم يُدعَ'}{c.sponsor_invited_at ? ` · دُعي ${date(c.sponsor_invited_at)}` : ''}</p>
      {canWrite && (
        <div className="la-row">
          <button className="btn-sm ghost" disabled={!!busy} onClick={() => act('invite')}>{busy === 'invite' ? 'لحظة…' : 'أعد الدعوة'}</button>
          <input aria-label="سبب الاعتماد دون تأييد" placeholder="سبب الاعتماد دون تأييد الراعي" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-sm primary" disabled={!!busy || reason.trim().length < 10} onClick={() => act('waive')}>اعتمد دون تأييد</button>
        </div>
      )}
    </section>
  );
}

function Detail({ id, canWrite, onBack, onPerson }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const [blocked, setBlocked] = useState(null);   // ما ينقص لإصدار الوثيقة المؤسسية: قائمة لا تنبيه طويل
  const load = useCallback(() => L('admin.capstone', { participant_id: id }).then((r) => setD(r.success ? { ...r, participant_id: id } : r)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err" role="alert">{d.message}</div>;
  const m = d.doc.meta;
  const c = d.capstone;
  const lead = d.leader;
  return (
    <div className="cps">
      <button className="la-link" onClick={onBack}>→ كل المشاريع</button>
      <section className="la-card cps-head">
        <div>
          <small className="la-muted">{m.participant?.name} · {m.org?.name || 'بلا جهة'} · {m.scope_title || 'نطاق غير محدد'} · {m.track?.title || ''}</small>
          <h2>{m.initiative || 'بلا اسم بعد'}</h2>
          <div className="la-row">
            <span className={`la-chip ${CHIP[c.status] || ''}`}>{STATUS[c.status] || c.status}</span>
            <span className="la-chip">الجاهزية {d.readiness}%</span>
            {c.revisions > 0 && <span className="la-chip">تحسين {c.revisions}</span>}
            {c.score != null && <span className="la-chip ok">المعيار {c.score} من 100</span>}
          </div>
        </div>
        <div className="la-row">
          <FinalDocExport participantId={id} approved={c.status === 'approved'} qrOk={d.qr_state?.qr !== false} />
          <button className="btn-sm ghost" onClick={() => openDoc(d.doc, toast)}>ملف العمل الكامل</button>
          <button className="btn-sm ghost" onClick={() => openDoc(d.doc, toast, 'institutional', setBlocked)}>الوثيقة المؤسسية</button>
          <button className="btn-sm ghost" onClick={() => onPerson(id)}>ملف المشارك</button>
        </div>
      </section>
      {blocked && (
        <section className="la-card" role="alert">
          <div className="la-row"><b>لا تُصدر الوثيقة المؤسسية بعد: تنقصها إجابات عن</b><button className="btn-sm ghost" onClick={() => setBlocked(null)}>إغلاق</button></div>
          <ol>{blocked.map((x) => <li key={x.n}><b>{x.title}</b>{x.add ? ` ${x.add}` : ''}</li>)}</ol>
          <p className="la-muted">ما ينقص بالتفصيل في ملحق «ملف العمل الكامل».</p>
        </section>
      )}

      {/* حقول قريبة جدًا من المثال المحلول: تنبيه للمستشار لا يمنع (مرافق بناء المبادرة 4ب، example-check.js) */}
      {(() => {
        const near = copiedFromExamples(d.doc, EXAMPLES);
        return near.length ? (
          <section className="la-card" role="note">
            <h3>قريبة من المثال المحلول</h3>
            <p className="la-muted">هذه الحقول تطابق جواب المثال المحلول في أغلب كلماتها. اسأل المشارك عن واقع مبادرته فيها قبل التقييم.</p>
            <ul>{near.map((x) => <li key={`${x.chapter}-${x.field}`}><b>{x.chapter}:</b> {x.field} <span className="la-muted">(مثال {x.sector})</span></li>)}</ul>
          </section>
        ) : null;
      })()}

      <div className="la-grid2">
        <section className="la-card">
          <h3>الفصول <DocLevelMeter level={d.doc?.review_levels?.level} /></h3>
          <ExpertSpine sections={d.sections} checks={d.checks} canWrite={canWrite} onSaved={load} />
          <h3>فحوص الاتساق</h3>
          <ul className="cps-checks">{d.checks.map((x) => <li key={x.key} className={x.ok ? 'ok' : 'no'}>{x.title}{x.detail && <small>{x.detail}</small>}</li>)}</ul>
        </section>
        <section className="la-card">
          {/* D05: مصدر واحد هو التقييم الختامي (معادلة البرنامج نفسها)، لا نتيجة موازية */}
          <h3>التقييم الختامي</h3>
          <p className="la-muted">{lead?.frozen ? 'اللقطة المرفوعة للاعتماد' : 'الحساب الحي بمعادلة البرنامج'}{lead?.config_version != null ? ` · الإصدار ${lead.config_version}` : ''}. منه قرار الشهادة.</p>
          <p className="cps-big">{lead?.score ?? '·'}<small> من 100</small></p>
          <table className="la-table"><tbody>
            {(lead?.components || []).map((x) => <tr key={x.key}><td>{x.label}</td><td>{x.weight}%</td><td>{x.value ?? 'لم يُقس'}</td></tr>)}
          </tbody></table>
          {c.review_note && <><h3>خلاصتك</h3><p>{c.review_note}</p></>}
          {c.sponsor_note && <><h3>ملاحظة الراعي</h3><p>{c.sponsor_note}</p></>}
          {c.sponsor_waived && <p className="la-muted">اعتُمدت دون تأييد الراعي: {c.sponsor_waived}</p>}
        </section>
      </div>

      {c.status === 'submitted' && <Review d={d} canWrite={canWrite} onSaved={(r) => setD({ ...r, participant_id: id })} onFailed={load} />}
      {c.status === 'approved' && d.qr_state && <QrDecision id={id} q={d.qr_state} canWrite={canWrite} onSaved={load} />}
      {c.status === 'approved' && <TrackingPanel t={d.doc.tracking} />}
      {c.status === 'accepted' && <Sponsor d={d} canWrite={canWrite} onSaved={(r) => setD({ ...r, participant_id: id })} />}
    </div>
  );
}

// الوثائق كلها مرة واحدة والفلترة في المتصفح (شريط الفلترة الموحد)، وتبدأ بما ينتظر القرار
// بعد «بانتظار الراعي» مرشح من انتهت مهلة راعيه، ليعيد المدير الدعوة أو يعتمد دون تأييد (تصور المرحلة 2، 2.2)
const EXPIRED_PRESET = { key: 'sponsor_expired', label: SPONSOR_EXPIRED_AR, test: (x) => x.sponsor_state === 'expired' };
export const CAP_PRESETS = [...FILTERS.map(([k, l]) => ({ key: k, label: l, test: (x) => x.status === k })), { key: 'all', label: 'الكل', test: () => true }];
CAP_PRESETS.splice(CAP_PRESETS.findIndex((p) => p.key === 'accepted') + 1, 0, EXPIRED_PRESET);
// رسالة القائمة الفارغة بحسب سببها: لا وثائق أصلًا، أو لا وثيقة في هذه الحالة، أو فلاتر أخرى تحجبها
export function capEmpty(state, total) {
  if (!total) return { title: 'لا وثائق بعد', hint: 'تظهر هنا وثيقة كل قائد حين يبدأ بناءها.' };
  const status = state.view === EXPIRED_PRESET.key ? EXPIRED_PRESET.label : STATUS[state.view];
  if (status && !isFiltered({ ...state, view: '' })) return { title: `لا وثائق في «${status}» الآن`, hint: 'اختر حالة أخرى من الأعلى، أو «الكل» لترى الوثائق بكل حالاتها.' };
  return { title: 'لا وثائق لهذه الفلاتر', hint: 'امسح البحث أو الفلاتر، أو اختر «الكل» لترى الوثائق بكل حالاتها.' };
}
const CAP_COLS = [
  { key: 'name', label: 'المبادرة', width: 34, get: (x) => x.initiative }, { key: 'lead', label: 'القائد', width: 26, get: (x) => x.full_name },
  { key: 'org', label: 'الجهة', width: 24, get: (x) => x.organization }, { key: 'scope', label: 'النوع', width: 10, get: (x) => SCOPE[x.scope] },
  { key: 'status', label: 'الحالة', width: 18, get: (x) => STATUS[x.status] }, { key: 'sponsor', label: 'الراعي', width: 16, get: (x) => SPONSOR[x.sponsor_state] },
  { key: 'ready', label: 'الجاهزية %', width: 12, get: (x) => x.readiness }, { key: 'score', label: 'المعيار', width: 10, get: (x) => x.score },
  { key: 'health', label: 'صحة التنفيذ', width: 16, get: (x) => x.tracking?.health_title }, { key: 'at', label: 'قُدّمت', width: 16, get: (x) => date(x.submitted_at) },
];
const CAP_SORTS = {
  name: (x) => x.initiative, lead: (x) => x.full_name, org: (x) => x.organization, scope: (x) => SCOPE[x.scope],
  status: (x) => STATUS[x.status], ready: (x) => x.readiness, score: (x) => x.score, at: (x) => x.submitted_at,
};

export default function Capstones({ canWrite, capId, onOpen, onPerson }) {
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'org', 'scope', 'sort'], {}, { scope: 'capstones', defaults: { view: 'submitted' } });
  const [list, setList] = useState(null);
  useEffect(() => { if (!capId) L('admin.capstones', {}).then(setList); }, [capId]);
  const all = (list?.success && list.capstones) || [];
  const fields = useMemo(() => [
    { key: 'org', label: 'الجهات', get: (x) => x.organization || '', options: [...new Set(all.map((x) => x.organization).filter(Boolean))].sort().map((o) => [o, o]) },
    { key: 'scope', label: 'الأنواع', get: (x) => x.scope, options: Object.entries(SCOPE) },
  ], [all]);
  const rows = useMemo(() => sortRows(applyFilters(all, { fields, presets: CAP_PRESETS, text: (x) => [x.initiative, x.full_name, x.organization].join(' ') }, f), CAP_SORTS, f.sort), [all, f, fields]);
  if (capId) return <Detail id={capId} canWrite={canWrite} onBack={() => onOpen(null)} onPerson={onPerson} />;
  return (
    <section className="la-card">
      <h3>وثائق المبادرات</h3>
      <p className="la-muted">فصول كل وثيقة نماذج تعليمية يقرؤها المستشار ويكتب ملاحظاته عليها في «كتاب القائد». هنا قرار الوثيقة كاملة: إعادة للتحسين مرة، أو قبول بالمعيار ثم تأييد الراعي.</p>
      {list?.success && <FilterBar scope="capstones" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={CAP_PRESETS} counts={presetCounts(all, CAP_PRESETS)}
        shown={rows.length} total={all.length} noun="وثيقة" placeholder="ابحث بالمبادرة أو القائد أو الجهة"
        actions={<ExportButton scope="capstones" meta={{ kind: 'CAP', title: 'وثائق المبادرات', sheet: 'المبادرات', file: 'Capstones' }} columns={CAP_COLS} all={all} filtered={rows} noun="وثيقة" />} />}
      {!list ? <Spinner /> : !list.success ? <div className="la-err">{list.message}</div> : !rows.length ? <Empty compact {...capEmpty(f, all.length)} /> : (
        <table className="la-table">
          <thead><tr><SortTh k="name" state={f} set={setF}>المبادرة</SortTh><SortTh k="lead" state={f} set={setF}>القائد</SortTh><SortTh k="org" state={f} set={setF}>الجهة</SortTh><SortTh k="scope" state={f} set={setF}>النوع</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh><SortTh k="ready" state={f} set={setF}>الجاهزية</SortTh><SortTh k="score" state={f} set={setF}>المعيار</SortTh><SortTh k="at" state={f} set={setF}>سُلّمت</SortTh></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.participant_id}>
              <td><button className="la-link" onClick={() => onOpen(x.participant_id)}>{x.initiative || 'بلا اسم'}</button></td>
              <td>{x.full_name}</td><td>{x.organization || '·'}</td><td>{SCOPE[x.scope] || '·'}</td>
              <td><span className={`la-chip ${CHIP[x.status] || ''}`}>{STATUS[x.status]}</span>{x.sponsor_state && x.status === 'accepted' ? (x.sponsor_state === 'expired' ? <> <span className={`la-chip ${x.sponsor_state === 'expired' ? 'bad' : ''}`}>{SPONSOR[x.sponsor_state]}</span></> : <small className="la-muted"> · {SPONSOR[x.sponsor_state]}</small>) : null}{x.tracking && <> <span className={`la-chip ${HEALTH_CHIP[x.tracking.health] || ''}`}>{x.tracking.health_title}</span></>}</td>
              <td>{x.readiness != null ? `${x.readiness}%` : '·'}</td><td>{x.score ?? '·'}</td><td>{date(x.submitted_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Rejected />
    </section>
  );
}

// «قيم رُفضت للمراجعة»: ما ترفضه قواعد جودة الوثيقة (doc-quality.js) في الإجابات الحالية، لضبط القواعد ببيانات حقيقية.
// يُحسب عند الطلب على الخادم (admin.capstone-quality)، بلا أسماء ولا نصوص: القاعدة والفصل والحقل والعدد وعينة مقنّعة
function Rejected() {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { setBusy(true); setR(await L('admin.capstone-quality', {})); setBusy(false); };
  return (
    <details className="cps-rejected" onToggle={(e) => { if (e.currentTarget.open && !r && !busy) load(); }}>
      <summary><b>قيم رُفضت للمراجعة</b> <small className="la-muted">ما ترفضه قواعد الجودة في إجابات الفصول الآن، لضبطها ببيانات حقيقية</small></summary>
      {busy ? <Spinner /> : !r ? null : !r.success ? <div className="la-err">{r.message}</div> : !r.rows.length ? <p className="la-muted">لا قيم مرفوضة في {r.submissions} تسليمًا.</p> : (
        <>
          <p className="la-muted">{r.rules.map((x) => `${x.rule_ar}: ${x.count}`).join(' · ')} · من {r.submissions} تسليمًا{r.truncated ? ` · عيّنة من أحدث ${r.cap} من ${r.total}` : ''}</p>
          <table className="la-table">
            <thead><tr><th>القاعدة</th><th>الفصل</th><th>الحقل</th><th>العدد</th><th>عينة مقنّعة</th></tr></thead>
            <tbody>{r.rows.map((x) => (
              <tr key={`${x.rule}|${x.chapter_key}|${x.field_key}`}><td>{x.rule_ar}</td><td dir="ltr">{x.chapter_key}</td><td dir="ltr">{x.field_key}</td><td>{x.count}</td><td>{x.sample}</td></tr>
            ))}</tbody>
          </table>
          <button className="btn-sm ghost" onClick={load}>أعد الحساب</button>
        </>
      )}
    </details>
  );
}
