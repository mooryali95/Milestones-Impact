// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» في لوحة الإدارة (H1، قرار المالك 2026-11-16): تبويبان للمدير الأعلى والمالك
// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد»: الحالة والتحكم (التشغيل والإيقاف وما يمنع الفتح)، والإنفاق، والاستعمال موزعًا على الجهات والدفعات،
// والدقة (التقييم قبل الإطلاق). «الإتاحة» تحت «المساعد الذكي»: الجهات بمفتاحها القائم والدفعات التجريبية.
// أعداد وكلفة بلا نص محادثة، وسجل المحادثات (H3) للمالك وللمدير الأعلى بمنحه، وكل فتح يُسجَّل.
import React, { useEffect, useState } from 'react';
import { date, dayMonth, L } from '../leaders.js';
import { Empty, useUI } from '../ui.jsx';
import { navigate } from '../route.js';
import { aiLoad } from '../ai-hub-data.js';
import { AiSkeleton, dollars, dollarsOf, guideWord, Kpis, Switch, TabIntro } from '../ai-ui.jsx';
import '../agent-admin.css';
import { GuideConversations, TranscriptGrants, transcriptAccess, WeeklyReview } from '../GuideTranscripts.jsx';

const usd = dollars;

function Section({ id, title, summary, level = 'green', children }) {
  return (
    <section className={`la-card ag-sec ag-${level}`} aria-labelledby={`${id}-h`} id={id}>
      <h3 id={`${id}-h`} className="ag-sec-h"><span className="ag-sec-title">{title}</span></h3>
      {summary && <p className="ag-sum">{summary}</p>}
      <div className="ag-sec-b">{children}</div>
    </section>
  );
}

// G4a: تقييم دقة «التوجيه والإرشاد» والدفعة التجريبية (للمدير الأعلى والمالك). البوابة لا تفتح إلا بمجموعة اعتمدتها لجنة
// المحتوى وآخر تشغيل كامل ناجح بنسبة لا تقل عن 99٪ لبصمة اليوم (النموذج والقواعد والمجموعة والمصحح ومرجع البرنامج)، ثم للدفعات
// المفعّلة وحدها. إصلاح 2026-11-18: الشرطان معًا، والراسب أولًا بما كان متوقعًا منه، وتشغيل تشخيصي لا يُحسب للبوابة
const RUN_AR = { running: 'يعمل', passed: 'ناجح', failed: 'دون الحد', stopped: 'متوقف', error: 'تعذّر' };
const STOP_AR = { stale: 'تغيرت البصمة', max_cost: 'بلغ حد التكلفة', key: 'لا مفتاح' };
const KIND_AR = { answer: 'يجيب', unsure: 'لا يتأكد', refuse_model: 'يرفض', refuse_route: 'يرفضه الموجّه' };
const VERDICT_AR = { answered: 'أجاب', unsure: 'غير متأكد', refused: 'رفض', route: 'رفض الموجّه', error: 'تعذّر' };
// الأسباب المحفوظة قبل إصلاح المصحح بالإنجليزية: تُعرض بالعربية كذلك
const reasonAr = (t) => String(t || '').replace(/\b(answered|unsure|refused)\b/g, (w) => `«${VERDICT_AR[w]}»`);
const pct = (r) => Math.round((r.passed_cases / r.total_cases) * 1000) / 10;

// نص لاتيني (رقم النسخة) داخل جملة عربية في نص خام (تأكيد، تنبيه): يُعزل بـ FSI/PDI فلا يقلبه الاتجاه
const iso = (t) => `\u2068${t}\u2069`;

function ResultItem({ x, onEdit, canWrite = false }) {
  const body = (
    <div className="gd-res-grid">
      <div><span className="gd-res-k">الرد</span>{x.reply ? <p className="small gd-pre">{x.reply}</p> : <p className="la-muted small">بلا رد</p>}</div>
      <div><span className="gd-res-k">المتوقع</span>
        {x.reference_ar && <p className="small gd-pre">{x.reference_ar}</p>}
        {x.must_include?.length > 0 && <p className="small">يجب أن يرد: {x.must_include.map((p) => <code key={p} dir="auto">{p}</code>)}</p>}
        {x.must_not_include?.length > 0 && <p className="small">يُمنع: {x.must_not_include.map((p) => <code key={p} dir="auto">{p}</code>)}</p>}
      </div>
    </div>
  );
  return (
    <li data-ok={x.ok ? 'ok' : 'fail'} className="gd-res">
      <div className="gd-res-head">
        <b>{x.case_id}</b> <span role="img" aria-label={x.ok ? 'ناجحة' : 'راسبة'}>{x.ok ? '✓' : '✕'}</span>
        <span className="la-chip">المتوقع: {KIND_AR[x.kind] || x.kind || '؟'}</span>
        <span className="la-chip">الحكم: {VERDICT_AR[x.verdict] || x.verdict || 'بلا وسم'}</span>
        {x.failed_before && <span className="la-chip bad">فشلت في التشغيلين</span>}
        {onEdit && <button type="button" className="la-link" onClick={() => onEdit(x.case_id)}>{canWrite ? 'عدّل الحالة' : 'اعرض الحالة'}</button>}
      </div>
      <p className="gd-res-q">{x.question}</p>
      {x.from_current && <small className="la-muted">السؤال من المجموعة الحالية (التشغيل أقدم من حفظ الحالة مع نتيجتها).</small>}
      {!x.ok && <ul className="gd-res-why la-err small">{(x.reasons || []).map((r) => <li key={r}>{reasonAr(r)}</li>)}</ul>}
      {x.ok ? <details><summary className="la-muted small">الرد والمتوقع</summary>{body}</details> : body}
    </li>
  );
}

function GuidanceEval({ canWrite = false, onEdit }) {
  const { toast } = useUI();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const [results, setResults] = useState(null);
  const [allRuns, setAllRuns] = useState(false);
  const load = () => L('admin.guide-eval').then(setS);
  useEffect(() => { load(); }, []);
  if (!s?.success || !s.ready) return null;
  const run = async (mode) => {
    setBusy(mode || 'full');
    const r = await L('admin.guide-eval-start', mode ? { mode } : {});
    if (!r.success) { setBusy(false); toast(r.message); return; }
    if (r.resumed) toast('يُستأنف التشغيل القائم من حيث توقف');
    // الدفعات من اللوحة حتى ينتهي التشغيل: كل طلب بضع حالات، فلا يتجاوز حد زمن الدالة
    for (let i = 0; i < 200; i++) {
      const st = await L('admin.guide-eval-step', { run_id: r.run_id });
      if (!st.success) { toast(st.message); break; }
      setLive(st.run);
      if (st.done) break;
    }
    setBusy(false);
    setLive(null);
    load();
    if (mode) showResults(r.run_id);
  };
  const showResults = async (id) => setResults({ id, ...(await L('admin.guide-eval-results', { run_id: id })) });
  const set = s.set;
  const ck = s.checks || null;
  const hasFailed = (s.runs || []).some((r) => !r.diagnostic && ['passed', 'failed'].includes(r.status) && r.passed_cases < r.done_cases);
  const failedCount = results?.success ? results.results.filter((x) => !x.ok).length : 0;
  return (
    <section className="ag-guide-eval stack" aria-labelledby="ag-geval-h">
      <h4 id="ag-geval-h">تقييم دقة «التوجيه والإرشاد» قبل الإطلاق</h4>
      <p className={s.gate.ok ? 'ops-flag on' : 'ops-flag off'} role="status">{s.gate.ok ? `✓ اجتاز التقييم (${s.threshold * 100}٪ فأكثر) على النسخة الحالية` : '✕ البوابة مغلقة حتى يتحقق الشرطان'}</p>
      {ck && (
        <ul className="gd-checks" aria-label="شرطا فتح البوابة">
          <li data-ok={ck.approved ? 'ok' : 'no'}><span aria-hidden="true">{ck.approved ? '✓' : '✕'}</span> المجموعة <bdi dir="ltr">{set.version}</bdi> {ck.approved ? <>معتمدة (<bdi dir="ltr">{set.approved_by}</bdi>)</> : 'غير معتمدة بعد'}</li>
          <li data-ok={ck.run_ok ? 'ok' : 'no'}><span aria-hidden="true">{ck.run_ok ? '✓' : '✕'}</span> آخر تشغيل كامل على النسخة الحالية:{' '}
            {ck.run ? <b>{ck.run.passed}/{ck.run.total}</b> : 'لم يُشغَّل بعد'} (المطلوب {ck.need}/{ck.total})</li>
        </ul>
      )}
      <p className="la-muted small">{set.total} حالة · {set.approved_by ? `معتمدة ${date(set.approved_at)}` : 'مسودة بانتظار اعتمادك'}</p>
      <details className="gd-more">
        <summary>تفاصيل</summary>
        <p className="la-muted small gd-order">الترتيب: أصلح سبب الرسوب، ثم اعتمد المجموعة، ثم شغّل تقييمًا كاملًا واحدًا. التشغيل التشخيصي يختبر الإصلاح ولا يفتح البوابة.</p>
        <p className="la-muted small">
          {Object.entries(set.kinds).map(([k, n]) => `${KIND_AR[k] || k} ${n}`).join('، ')}.{' '}
          {set.approved_by && <>اعتمدها <bdi dir="ltr">{set.approved_by}</bdi>.</>}
          {' '}النموذج <code dir="ltr">{s.model}</code>.
          {s.brief_chars != null && (s.brief_chars > 0 ? ' مرجع البرنامج من الكتاب مرفق للأسئلة من خارج الأبواب.' : ' مرجع البرنامج غير متاح (أقسامه غير موجودة في أبواب الكتاب).')}
        </p>
      </details>
      {set.errors.length > 0 && <div className="la-err" role="alert">أخطاء في المجموعة: {set.errors.slice(0, 5).join('؛ ')}</div>}
      {canWrite && <div className="la-row">
        <button type="button" className="btn-sm primary" disabled={!!busy || set.errors.length > 0} onClick={() => run()}>{busy === 'full' ? 'يعمل…' : 'شغّل التقييم'}</button>
        {hasFailed && <button type="button" className="btn-sm ghost" disabled={!!busy || set.errors.length > 0} onClick={() => run('failed')}>{busy === 'failed' ? 'يعمل…' : 'أعد الحالات الفاشلة فقط'}</button>}
        {live && <span className="la-muted small" role="status">{live.done_cases} من {live.total_cases} · ناجح {live.passed_cases} · {usd(Number(live.cost_micros) / 1e6)}</span>}</div>}
      {s.runs.length > 0 && (<>
        <div className="ag-scroll">
          <table className="la-table">
            <thead><tr><th>التشغيل</th><th>النوع</th><th>الحال</th><th>النجاح</th><th className="gd-opt">التكلفة</th><th className="gd-opt">النسخة</th></tr></thead>
            <tbody>{(allRuns ? s.runs : s.runs.slice(0, 3)).map((r) => (
              <tr key={r.id} data-diag={r.diagnostic ? 'yes' : 'no'}>
                {/* الدخول إلى النتائج في الخلية الأولى، فيبقى ظاهرًا على الهاتف بلا تمرير */}
                <td><div className="gd-run-cell"><button type="button" className="la-link" onClick={() => showResults(r.id)}>النتائج</button><small className="gd-nowrap" title={date(r.started_at)}>{dayMonth(r.started_at)}</small></div></td>
                <td>{r.diagnostic ? <span className="la-chip warn" title="يعيد الحالات الراسبة وحدها، ولا يُحسب للبوابة">تشخيصي، لا يُحسب</span> : 'كامل'}</td>
                <td>{RUN_AR[r.status] || r.status}{r.stop_reason ? ` (${STOP_AR[r.stop_reason] || r.stop_reason})` : ''}</td>
                <td>{r.passed_cases}/{r.total_cases}{r.done_cases ? ` (${pct(r)}٪)` : ''}</td>
                <td className="gd-opt">{usd(Number(r.cost_micros) / 1e6)}</td><td className="gd-opt">{r.current ? 'الحالية' : 'أقدم'}</td></tr>
            ))}</tbody>
          </table>
        </div>
          {s.runs.length > 3 && <button type="button" className="la-link" onClick={() => setAllRuns((v) => !v)}>{allRuns ? 'إخفاء الأقدم' : `عرض الأقدم (${s.runs.length - 3})`}</button>}
      </>)}
      {results?.success && (
        <div className="stack gd-results" aria-label="نتائج التشغيل">
          <div className="la-row between"><b>النتائج ({failedCount} راسبة{results.diagnostic ? '، تشغيل تشخيصي لا يُحسب للبوابة' : ''})</b><button type="button" className="la-link" onClick={() => setResults(null)}>إغلاق</button></div>
          <ul className="gd-res-list">{results.results.map((x) => <ResultItem key={x.case_id} x={x} onEdit={onEdit} canWrite={canWrite} />)}</ul>
        </div>
      )}
    </section>
  );
}


// H2: مراجعة مجموعة التقييم وتعديلها واعتمادها (قرار المالك v8). تعديل نسخة معتمدة يبدأ مسودة جديدة، والاعتماد للمالك وحده
const FIELD_KIND = Object.entries(KIND_AR);
const DIMS = [['milestone', 'المعلم'], ['impact', 'الأثر'], ['leadership', 'القيادة']];
const CHAPTERS = [['intro', 'المقدمة'], ['ch1', 'الفصل 1'], ['ch2', 'الفصل 2'], ['ch3', 'الفصل 3'], ['ch4', 'الفصل 4'], ['ch5', 'الفصل 5'], ['ch6', 'الفصل 6'], ['labs', 'المختبرات'], ['close', 'الخاتمة']];
const LEVELS = [['', 'افتراضي (متوسط)'], ['beginner', 'مبتدئ'], ['intermediate', 'متوسط'], ['advanced', 'متقدم']];
const fieldsOf = (c) => ({ kind: c.kind, question: c.question, context: c.context === 'handbook' ? 'handbook' : 'program', dimension: c.dimension || '', chapter_key: c.chapter_key || '',
  level: c.level || '', reference_ar: c.reference_ar || '', must_include: (c.must_include || []).join('\n'), must_not_include: (c.must_not_include || []).join('\n') });
function CaseEditor({ c, canWrite, onSaved }) {
  const { toast } = useUI();
  const [init] = useState(() => fieldsOf(c));
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    // ما تغيّر وحده: حقل لم يُلمس لا يُكتب، فلا يتغير محتوى الحالة (وبصمتها) بلا تعديل
    const patch = {};
    for (const k of Object.keys(v)) if (v[k] !== init[k]) patch[k] = k.startsWith('must_') ? v[k].split('\n') : v[k];
    if (v.context === 'handbook' && (patch.context || patch.dimension || patch.chapter_key)) { patch.dimension = v.dimension; patch.chapter_key = v.chapter_key; }
    if (!Object.keys(patch).length) { toast('لا تغيير لحفظه'); return; }
    setBusy(true);
    const r = await L('admin.guide-eval-case', { case_id: c.id, patch });
    setBusy(false);
    if (!r.success) { toast(r.message); return; }
    toast(r.new_draft ? `حُفظت في مسودة جديدة ${r.version}، والمعتمدة باقية كما هي` : 'حُفظت الحالة');
    onSaved();
  };
  const hb = v.context === 'handbook';
  return (
    <form className="stack gd-case-form" onSubmit={save}>
      <div className="gd-case-row">
        <label className="of-field"><span className="of-label">النوع المتوقع</span>
          <select value={v.kind} disabled={!canWrite} onChange={set('kind')}>{FIELD_KIND.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label className="of-field"><span className="of-label">السياق</span>
          <select value={v.context} disabled={!canWrite} onChange={set('context')}><option value="program">البرنامج (من الرحلة)</option><option value="handbook">باب من الكتاب</option></select></label>
        {hb && <label className="of-field"><span className="of-label">الإطار</span>
          <select value={v.dimension} disabled={!canWrite} onChange={set('dimension')}><option value="">اختر</option>{DIMS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>}
        {hb && <label className="of-field"><span className="of-label">الباب</span>
          <select value={v.chapter_key} disabled={!canWrite} onChange={set('chapter_key')}><option value="">اختر</option>{CHAPTERS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>}
        <label className="of-field"><span className="of-label">المستوى</span>
          <select value={v.level} disabled={!canWrite} onChange={set('level')}>{LEVELS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      </div>
      <label className="of-field"><span className="of-label">السؤال</span>
        <textarea rows={2} value={v.question} disabled={!canWrite} onChange={set('question')} /></label>
      <label className="of-field"><span className="of-label">الإجابة المرجعية</span>
        <textarea rows={4} value={v.reference_ar} disabled={!canWrite} onChange={set('reference_ar')} /></label>
      <label className="of-field"><span className="of-label">ما يجب أن يرد في الإجابة (نمط في كل سطر، و | تعني «أو»)</span>
        <textarea dir="auto" rows={3} value={v.must_include} disabled={!canWrite} onChange={set('must_include')} /></label>
      <label className="of-field"><span className="of-label">ما يُمنع أن يرد</span>
        <textarea dir="auto" rows={2} value={v.must_not_include} disabled={!canWrite} onChange={set('must_not_include')} /></label>
      {c.source && <small className="la-muted">المصدر: {c.source}</small>}
      {canWrite && <div className="la-row"><button className="btn-sm primary" disabled={busy}>{busy ? 'لحظة…' : 'احفظ الحالة'}</button></div>}
    </form>
  );
}

function SetReview({ canWrite, onChanged, focus }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [kind, setKind] = useState('all');
  const load = () => L('admin.guide-eval-cases').then(setD);
  useEffect(() => { load(); }, []);
  // «عدّل الحالة» من النتائج: تُزال التصفية أولًا، ثم تُفتح الحالة وتُعرض بعد أن تظهر في القائمة
  const [pending, setPending] = useState(null);
  useEffect(() => { if (focus?.id) { setKind('all'); setPending(focus); } }, [focus]);
  useEffect(() => {
    if (!pending || !d?.success || kind !== 'all') return;
    setPending(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(`gd-case-${pending.id}`);
      if (!el) { toast('الحالة لم تعد في المجموعة الحالية'); return; }
      el.open = true;
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      el.querySelector('summary')?.focus();
    });
  }, [pending, d, kind]);
  // ردّ بلا مجموعة (ترحيل لم يُطبَّق أو خادم أقدم) لا يكسر الشاشة
  if (!d?.success || !Array.isArray(d.set?.cases)) return null;
  const set = d.set;
  const changed = () => { load(); onChanged?.(); };
  const approve = async () => {
    if (!(await confirm(`اعتماد المجموعة ${iso(set.version)} (${set.cases.length} حالة) باسمك؟ بعد الاعتماد لا تتغير، وأي تعديل يبدأ مسودة جديدة ويلزمه تقييم جديد.`))) return;
    const r = await L('admin.guide-eval-approve', { version: set.version, hash: set.hash });
    if (!r.success) { toast(r.message); if (r.code === 'stale' || /تغيرت/.test(String(r.message || ''))) load(); return; }
    toast(`اعتُمدت المجموعة ${iso(set.version)}`);
    changed();
  };
  // المرحلة أ: الحالات المقترحة في المستودع تُضاف بزر إلى مسودة، ثم يراجعها المالك ويعتمدها، ثم يُشغَّل تقييم جديد
  const importProposed = async () => {
    if (!(await confirm(`إضافة ${d.proposed} حالة مقترحة إلى ${set.status === 'approved' ? 'مسودة جديدة' : 'المسودة الحالية'}؟ تُغلق بوابة المساعد حتى تراجع المجموعة وتعتمدها ثم ينجح تقييم كامل عليها.`))) return;
    const r = await L('admin.guide-eval-import', {});
    if (!r.success) { toast(r.message); return; }
    toast(r.added ? `أُضيفت ${r.added} حالة إلى المسودة ${iso(r.version)}. راجعها ثم اعتمدها.` : 'لا حالات مقترحة جديدة');
    changed();
  };
  const shown = set.cases.filter((c) => kind === 'all' || c.kind === kind);
  return (
    <section className="stack gd-set" aria-labelledby="gd-set-h">
      <div className="gd-set-head">
        <h4 id="gd-set-h">مراجعة المجموعة واعتمادها</h4>
        <span className={`la-chip ${set.status === 'approved' ? 'ok' : 'warn'}`}>{set.status === 'approved' ? <>معتمدة: <bdi dir="ltr">{set.approved_by}</bdi> في {date(set.approved_at)}</> : 'مسودة'}</span>
      </div>
      <p className="la-muted small">النسخة <bdi dir="ltr">{set.version}</bdi>{set.updated_by && set.updated_by !== 'seed' ? <>، آخر تعديل <bdi dir="ltr">{set.updated_by}</bdi> في {date(set.updated_at)}</> : ''}. {set.source === 'file' ? 'جدول المجموعة لم يُرحَّل بعد، فلا تعديل ولا اعتماد حتى يُطبَّق ترحيله.' : 'كل تعديل يُسجَّل، ويُسقط نجاح التقييم السابق حتى يُشغَّل من جديد.'}</p>
      {d.proposed > 0 && d.can_edit && (
        <div className="la-note gd-proposed" role="note">
          <span>{d.proposed} حالة مقترحة جاهزة لتوسيع المجموعة (كل أبواب الكتاب ومستوياته، وأسئلة صعبة ومحاولات تلاعب).</span>
          {canWrite ? <button type="button" className="btn-sm" onClick={importProposed}>أضفها إلى مسودة للمراجعة</button> : <small className="la-muted">فعّل الكتابة لإضافتها.</small>}
        </div>
      )}
      {set.errors.length > 0 && <div className="la-err" role="alert">أخطاء تمنع الاعتماد: {set.errors.slice(0, 5).join('؛ ')}</div>}
      <div className="la-row gd-filter" role="group" aria-label="تصفية بالنوع">
        {[['all', `الكل ${set.cases.length}`], ...FIELD_KIND.map(([k, t]) => [k, `${t} ${set.cases.filter((c) => c.kind === k).length}`])].map(([k, t]) => (
          <button key={k} type="button" className={`btn-sm ${kind === k ? 'primary' : 'ghost'}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{t}</button>
        ))}
      </div>
      <ol className="gd-cases">{shown.map((c) => (
        <li key={`${set.version}-${set.hash || ''}-${c.id}`}>
          <details id={`gd-case-${c.id}`}>
            <summary><b>{c.id}</b> · {KIND_AR[c.kind] || c.kind} · {c.question}</summary>
            <CaseEditor c={c} canWrite={canWrite && d.can_edit} onSaved={changed} />
          </details>
        </li>
      ))}</ol>
      {d.can_approve && canWrite && set.status !== 'approved' && (
        <div className="la-row"><button type="button" className="btn-sm primary" disabled={set.errors.length > 0} onClick={approve}>اعتمد المجموعة باسمك</button></div>
      )}
      {d.can_approve && !canWrite && set.status !== 'approved' && <p className="la-muted small">فعّل الكتابة لتعتمد المجموعة.</p>}
      {!d.can_approve && set.status !== 'approved' && <p className="la-muted small">الاعتماد للمالك وحده.</p>}
    </section>
  );
}

function StatusPart({ d, reload, setD }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const open = d.blockers.length === 0;
  const flip = async (on) => {
    // يظهر التغيير فورًا، ويعود بإعادة التحميل إن رفضه الخادم
    setD((x) => ({ ...x, settings: { ...x.settings, enabled: on } }));
    setBusy(true);
    const r = await L('admin.guide-toggle', { on });
    setBusy(false);
    if (!r.success) { toast(r.message); reload(); return; }
    toast(on ? 'شُغّل المساعد (يعمل حين تكتمل بقية الشروط)' : 'أُوقف المساعد لكل المشاركين');
    reload();
  };
  return (
    <>
      <p className={open ? 'ops-flag on' : 'ops-flag off'} role="status">{open ? '✓ مفتوح لأعضاء الدفعات التجريبية' : '✕ مغلق لكل المشاركين'}</p>
      {!open && <ul className="la-muted small gd-blockers" aria-label="ما يمنع الفتح">{d.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <Switch id="gd-enable" label="التوجيه والإرشاد للمشاركين" checked={!!d.settings.enabled} on="مشغّل من اللوحة" off="متوقف من اللوحة"
        disabled={busy || !d.can_write} onChange={flip} />
      <dl className="ag-grid">
        <div className="ops-row"><dt>النموذج</dt><dd><code dir="ltr">{d.model}</code></dd></div>
        <div className="ops-row"><dt>نسخة السياسة</dt><dd>{d.policy_version || 'لم تُنشر بعد (G4b)'}</dd></div>
        <div className="ops-row"><dt>تقييم الدقة</dt><dd>{d.gate.eval_ok ? '✓ ناجح' : '✕ لم ينجح بعد'}</dd></div>
        <div className="ops-row"><dt>الدفعات التجريبية</dt><dd>{d.gate.pilots} <button type="button" className="la-link" onClick={() => navigate({ ctx: 'leaders', tab: 'ai', id: 'access' })}>الإتاحة</button></dd></div>
        <div className="ops-row ag-wide"><dt>السقوف</dt><dd>{usd(d.settings.cap_usd)} يوميًا، و{d.settings.monthly} سؤالًا شهريًا و{d.settings.daily} يوميًا لكل مشارك، والحفظ {d.settings.retention_days} يومًا{' '}
          <button type="button" className="la-link" onClick={() => navigate({ ctx: 'leaders', tab: 'settings', id: 'guidance' })}>عدّلها</button></dd></div>
      </dl>
    </>
  );
}

function SpendPart({ d }) {
  const spend = [...(d.report?.spend || [])].reverse();
  const max = Math.max(d.settings.cap_usd, ...spend.map((x) => x.usd), 0.01);
  const pct = Math.round((d.today.usd / Math.max(d.settings.cap_usd, 0.01)) * 100);
  return (
    <>
      <p><b>اليوم {usd(d.today.usd)}</b> من سقف {usd(d.settings.cap_usd)} ({pct}٪)</p>
      {spend.length > 0 ? (
        <ol className="gd-bars" aria-label="الإنفاق اليومي آخر 30 يومًا">
          {spend.map((x) => <li key={x.day} title={`${x.day}: ${usd(x.usd)} · ${x.calls} استدعاء`}><span style={{ height: `${Math.max(2, (x.usd / max) * 100)}%` }} /><small>{x.day.slice(5)}</small></li>)}
        </ol>
      ) : <p className="la-muted small">لا إنفاق بعد.</p>}
      {(d.report?.windows || []).map((w) => <p key={w.days} className="la-muted small">آخر {w.days} يومًا: {usd(w.usd)}{w.asked ? `، بمتوسط ${usd(w.usd / w.asked)} للسؤال` : ''}.</p>)}
    </>
  );
}

function Breakdown({ title, rows }) {
  if (!rows?.length) return null;
  return (
    <table className="la-table" aria-label={title}>
      <thead><tr><th>{title}</th><th>أسئلة</th><th>مشاركون</th><th>لم يتأكد</th><th>«أريد التأكد»</th><th>تعذّر</th><th>التكلفة</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id || r.name}><td>{r.name}</td><td>{r.asked}</td><td>{r.participants}</td><td>{r.unsure}</td><td>{r.confirmed}</td><td>{r.errors}</td><td>{usd(r.usd)}</td></tr>)}</tbody>
    </table>
  );
}

function UsagePart({ d }) {
  const w = d.report?.windows || [];
  if (!w.length) return <p className="la-muted small">لا استعمال بعد.</p>;
  return (
    <>
      <table className="la-table" aria-label="الاستعمال">
        <thead><tr><th>المدة</th><th>أسئلة</th><th>مشاركون</th><th>أجاب</th><th>لم يتأكد</th><th>خارج النطاق</th><th>تعذّر</th><th>«أريد التأكد»</th></tr></thead>
        <tbody>{w.map((x) => <tr key={x.days}><td>آخر {x.days} يومًا</td><td>{x.asked}</td><td>{x.participants}</td><td>{x.answered}</td><td>{x.unsure}</td><td>{x.refused}</td><td>{x.errors}</td><td>{x.confirmed}{x.confirm_rate != null ? ` (${x.confirm_rate}٪)` : ''}</td></tr>)}</tbody>
      </table>
      <p className="la-muted small">نسبة «أريد التأكد» مؤشر الدقة في التجربة: إن تجاوزت 10٪ يُراجع السبب قبل التوسيع.</p>
      <Breakdown title="الجهة" rows={d.breakdown?.orgs} />
      <Breakdown title="الدفعة" rows={d.breakdown?.cohorts} />
    </>
  );
}

// H4: توجيهات المالك للمساعد، تُضاف إلى قواعده الثابتة ولا تلغيها. كل حفظ يغيّر بصمة التقييم فيُسقط نجاحه
function RulesEditor({ d, canWrite, onSaved, draft }) {
  const { toast } = useUI();
  const [text, setText] = useState(d.settings.extra_rules || '');
  // سطر مقترح من «مراجعة الأسبوع» يُلحق بالنص ولا يُحفظ حتى يحفظه المالك
  useEffect(() => {
    if (!draft?.line) return;
    setText((t) => (t.includes(draft.line) ? t : `${t.trim() ? `${t.trimEnd()}\n` : ''}${draft.line}`));
    document.getElementById('gd-rules-h')?.scrollIntoView({ block: 'center' });
  }, [draft]);
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== (d.settings.extra_rules || '').trim();
  const save = async () => {
    setBusy(true);
    const r = await L('admin.guide-rules', { extra_rules: text });
    setBusy(false);
    if (!r.success) { toast(r.message); return; }
    toast('حُفظت التوجيهات. شغّل تقييم الدقة من جديد قبل الإطلاق');
    onSaved();
  };
  return (
    <section className="gd-rules" aria-labelledby="gd-rules-h">
      <h4 id="gd-rules-h">توجيهات إضافية للمساعد</h4>
      <p className="la-muted small">تُضاف إلى قواعده الثابتة ولا تلغيها: مصطلح يلتزمه، أو خطأ تكرر في «سجل المحادثات». كل تعديل يُسقط نجاح تقييم الدقة حتى يُشغَّل من جديد.</p>
      <textarea rows={5} maxLength={3000} value={text} disabled={!canWrite} aria-labelledby="gd-rules-h" onChange={(e) => setText(e.target.value)} />
      {canWrite && <div className="la-row"><button type="button" className="btn-sm primary" disabled={busy || !dirty} onClick={save}>احفظ التوجيهات</button><span className="la-muted small">{text.length} / 3000</span></div>}
    </section>
  );
}

export default function GuidanceAdmin() {
  const [d, setD] = useState(null);
  const [evalKey, setEvalKey] = useState(0);
  const [focus, setFocus] = useState(null);
  const [ruleDraft, setRuleDraft] = useState(null);
  // القراءة الأولى تنضم إلى طلب رأس القسم (ai-hub-data.js)، وإعادة التحميل بعد التشغيل أو الإيقاف طلب جديد
  const load = (first) => aiLoad('admin.guide-dashboard', { reuse: first === true }).then(setD);
  useEffect(() => { load(true); }, []);
  if (!d) return <AiSkeleton cards={3} />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  const open = d.blockers.length === 0;
  const m30 = (d.report?.windows || []).find((w) => w.days === 30);
  const cap = Math.max(Number(d.settings.cap_usd) || 0, 0.01);
  const ratio = Number(d.today?.usd || 0) / cap;
  return (
    <div className="ag">
      <TabIntro text="مساعد التوجيه داخل رحلة المشارك: الحالة والإنفاق والاستعمال والدقة." readOnly={!d.can_write} />
      <Kpis label="مؤشرات التوجيه والإرشاد" items={[
        { label: 'الحال', value: guideWord(open), sub: open ? null : `${d.blockers.length} ${d.blockers.length === 1 ? 'شرط' : 'شروط'} قبل الفتح`, tone: open ? 'green' : 'amber' },
        d.today && { label: 'إنفاق اليوم', value: usd(d.today.usd), sub: `من ${usd(d.settings.cap_usd)} (${Math.round(ratio * 100)}٪)`, tone: ratio >= 1 ? 'red' : ratio >= 0.8 ? 'amber' : 'green' },
        m30 && { label: 'الأسئلة', value: m30.asked, sub: `في 30 يومًا من ${m30.participants} مشاركًا` },
        m30 && m30.confirm_rate != null && { label: '«أريد التأكد»', value: `${m30.confirm_rate}٪`, sub: 'مؤشر الدقة، والحد 10٪', tone: m30.confirm_rate > 10 ? 'amber' : 'green' },
      ]} />
      <Section id="gd-state" title="الحالة والتحكم" level={open ? 'green' : 'amber'}><StatusPart d={d} reload={load} setD={setD} /></Section>
      <Section id="gd-spend" title="الإنفاق" summary={`اليوم ${dollarsOf(d.today.usd, d.settings.cap_usd)}`}><SpendPart d={d} /></Section>
      <Section id="gd-usage" title="الاستعمال" summary={d.report?.windows?.[1] ? `${d.report.windows[1].asked} سؤالًا في 30 يومًا` : 'لا استعمال بعد'}><UsagePart d={d} /></Section>
      <Section id="gd-accuracy" title="الدقة"><GuidanceEval key={evalKey} canWrite={d.can_write} onEdit={(id) => setFocus({ id, n: Date.now() })} /><SetReview canWrite={d.can_write} focus={focus} onChanged={() => setEvalKey((k) => k + 1)} /><RulesEditor d={d} canWrite={d.can_write} draft={ruleDraft} onSaved={() => { load(); setEvalKey((k) => k + 1); }} /></Section>
      <Section id="gd-review" title="مراجعة الأسبوع" summary="ما تعثر فيه المساعد هذا الأسبوع، مجمّعًا بالموضع. كل حالة تضيفها تصير اختبارًا يمر به قبل كل إطلاق."><WeeklyReview onSuggest={d.can_write ? (line) => setRuleDraft({ line, n: Date.now() }) : null} /></Section>
      <Section id="gd-transcripts" title="سجل المحادثات" summary="محادثة كل مشارك كاملة لتتبع أي مشكلة، بحكم كل رد ونموذجه وكلفته. للمالك، وللمدير الأعلى بصلاحية يمنحها المالك، وكل فتح يُسجَّل."><GuideConversations /></Section>
    </div>
  );
}

// ── «الإتاحة» تحت «المساعد الذكي»: الجهات (مفتاحها القائم) والدفعات التجريبية ──
export function GuidanceAccess() {
  const { toast } = useUI();
  const [orgs, setOrgs] = useState(null);
  const [pilots, setPilots] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [owner, setOwner] = useState(false);
  const [dash, setDash] = useState(null);
  const takeDash = (r) => { setCanWrite(!!r?.can_write); setDash(r); };
  // ما يمنع فتح التوجيه يتبع الجهات والدفعات (guide-admin.ts)، فكل تغيير ناجح هنا يقرأ لوحته من جديد: يتحدث صف المؤشرات
  // والرأس، ولا يأخذ تبويب «التوجيه والإرشاد» ردًا قديمًا
  const refreshDash = () => aiLoad('admin.guide-dashboard').then(takeDash, () => {});
  useEffect(() => {
    transcriptAccess().then((r) => setOwner(!!r?.owner));
    L('admin.guide-orgs').then(setOrgs);
    L('admin.guide-pilots').then(setPilots);
    aiLoad('admin.guide-dashboard', { reuse: true }).then(takeDash);
  }, []);
  if (!orgs || !pilots) return <AiSkeleton cards={2} />;
  const flipOrg = async (o, on) => {
    setOrgs((x) => ({ ...x, orgs: x.orgs.map((y) => (y.id === o.id ? { ...y, allowed: on } : y)) }));
    const r = await L('admin.guide-org-set', { org_id: o.id, on });
    if (!r.success) { toast(r.message); L('admin.guide-orgs').then(setOrgs); return; }
    toast(on ? `فُتح المساعد لمشاركي «${o.name}»` : `أُغلق المساعد لمشاركي «${o.name}»`);
    refreshDash();
  };
  const flipPilot = async (c, on) => {
    setPilots((x) => ({ ...x, cohorts: x.cohorts.map((y) => (y.id === c.id ? { ...y, pilot: on } : y)) }));
    const r = await L('admin.guide-pilot-set', { cohort_id: c.id, on });
    if (!r.success) { toast(r.message); L('admin.guide-pilots').then(setPilots); return; }
    toast(on ? `«${c.name}» دفعة تجريبية للمساعد` : `أُوقف المساعد لـ«${c.name}»`);
    refreshDash();
  };
  const orgList = orgs.ready ? orgs.orgs || [] : null;
  const cohList = pilots.ready ? pilots.cohorts || [] : null;
  const gOpen = dash?.success && Array.isArray(dash.blockers) ? dash.blockers.length === 0 : null;
  return (
    <div className="ag">
      <TabIntro text="لمن يعمل التوجيه والإرشاد: الجهة تسمح به، والدفعة مفعّلة تجريبيًا. يلزم الشرطان معًا، وكل تغيير يُسجَّل." readOnly={!canWrite} />
      <Kpis label="مؤشرات الإتاحة" items={[
        orgList && { label: 'الجهات المسموح لها', value: `${orgList.filter((o) => o.allowed).length} من ${orgList.length}`, tone: orgList.some((o) => o.allowed) ? 'green' : 'amber' },
        cohList && { label: 'الدفعات التجريبية', value: cohList.filter((c) => c.pilot).length, sub: `من ${cohList.length} دفعة`, tone: cohList.some((c) => c.pilot) ? 'green' : 'amber' },
        gOpen != null && { label: 'حال التوجيه', value: guideWord(gOpen), sub: gOpen ? null : 'شروط الفتح في «التوجيه والإرشاد»', tone: gOpen ? 'green' : 'amber' },
      ]} />
      <Section id="gd-orgs" title="الجهات" summary="الجهة المغلقة لا يعمل المساعد لأي من مشاركيها، أيًا كانت دفعته. الأفراد بلا جهة تحكمهم الدفعة وحدها.">
        {!orgs.ready ? <p className="la-muted small">مفتاح الجهات لم يُرحَّل بعد.</p> : !orgList.length ? <Empty compact title="لا جهات بعد" hint="تظهر هنا كل جهة تُضاف من «الجهات»." /> : (
          <ul className="gd-toggles">{orgList.map((o) => (
            <li key={o.id}><Switch id={`gd-org-${o.id}`} label={o.name} checked={!!o.allowed} on="مسموح" off="مغلق" disabled={!canWrite} onChange={(on) => flipOrg(o, on)} /></li>
          ))}</ul>
        )}
      </Section>
      <Section id="gd-pilots" title="الدفعات التجريبية" summary="المساعد لا يعمل إلا لأعضاء دفعة مفعّلة هنا، وبعد اجتياز التقييم ونسخة السياسة.">
        {!pilots.ready ? <p className="la-muted small">عمود الدفعة التجريبية لم يُرحَّل بعد.</p> : !cohList.length ? <Empty compact title="لا دفعات بعد" hint="تظهر هنا كل دفعة تُنشأ من «البرامج والدفعات»." /> : (
          <ul className="gd-toggles">{cohList.map((c) => (
            <li key={c.id}><Switch id={`gd-coh-${c.id}`} label={`${c.name}${c.is_default ? ' (المفتوحة)' : ''}`} checked={!!c.pilot} on="مفعّل" off="متوقف" disabled={!canWrite} onChange={(on) => flipPilot(c, on)} /></li>
          ))}</ul>
        )}
      </Section>
      {owner && (
        <Section id="gd-transcript-grants" title="الاطلاع على المحادثات" summary="أنت تطّلع دائمًا. امنح مديرًا أعلى الاطلاع على نص المحادثات أو اسحبه، ويسري فورًا. كل فتح يُسجَّل باسم صاحبه.">
          <TranscriptGrants />
        </Section>
      )}
    </div>
  );
}
