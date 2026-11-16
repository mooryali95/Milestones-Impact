// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» في لوحة الإدارة (H1، قرار المالك 2026-11-16): تبويبان للمدير الأعلى والمالك
// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد»: الحالة والتحكم (التشغيل والإيقاف وما يمنع الفتح)، والإنفاق، والاستعمال موزعًا على الجهات والدفعات،
// والدقة (التقييم قبل الإطلاق). «إتاحة التوجيه»: الجهات بمفتاحها القائم والدفعات التجريبية.
// أعداد وكلفة بلا نص محادثة، وسجل المحادثات (H3) للمالك وللمدير الأعلى بمنحه، وكل فتح يُسجَّل.
import React, { useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { navigate } from '../route.js';
import '../agent-admin.css';
import { GuideConversations, TranscriptGrants, transcriptAccess } from '../GuideTranscripts.jsx';

const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

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
// المحتوى وآخر تشغيل ناجح بنسبة لا تقل عن 99٪ لبصمة اليوم (النموذج والقواعد والمجموعة)، ثم للدفعات المفعّلة وحدها
const RUN_AR = { running: 'يعمل', passed: 'ناجح', failed: 'دون الحد', stopped: 'متوقف', error: 'تعذّر' };
const KIND_AR = { answer: 'يجيب', unsure: 'لا يتأكد', refuse_model: 'يرفض', refuse_route: 'يرفضه الموجّه' };
function GuidanceEval({ canWrite = false }) {
  const { toast } = useUI();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const [results, setResults] = useState(null);
  const load = () => L('admin.guide-eval').then(setS);
  useEffect(() => { load(); }, []);
  if (!s?.success || !s.ready) return null;
  const run = async () => {
    setBusy(true);
    const r = await L('admin.guide-eval-start', {});
    if (!r.success) { setBusy(false); toast(r.message); return; }
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
  };
  const showResults = async (id) => setResults(await L('admin.guide-eval-results', { run_id: id }));
  const set = s.set;
  return (
    <section className="ag-guide-eval stack" aria-labelledby="ag-geval-h">
      <h4 id="ag-geval-h">تقييم دقة «التوجيه والإرشاد» قبل الإطلاق</h4>
      <p className={s.gate.ok ? 'ops-flag on' : 'ops-flag off'} role="status">{s.gate.ok ? `✓ اجتاز التقييم (${s.threshold * 100}٪ فأكثر) على النسخة الحالية` : `✕ ${s.gate.message}`}</p>
      <p className="la-muted small">
        المجموعة {set.version}: {set.total} حالة ({Object.entries(set.kinds).map(([k, n]) => `${KIND_AR[k] || k} ${n}`).join('، ')}).{' '}
        {set.approved_by ? `اعتمدها ${set.approved_by} في ${date(set.approved_at)}.` : 'مسودة بانتظار اعتماد المالك للإجابات المرجعية.'}
        {' '}النموذج <code dir="ltr">{s.model}</code>.
      </p>
      {set.errors.length > 0 && <div className="la-err" role="alert">أخطاء في المجموعة: {set.errors.slice(0, 5).join('؛ ')}</div>}
      {canWrite && <div className="la-row"><button type="button" className="btn-sm primary" disabled={busy || set.errors.length > 0} onClick={run}>{busy ? 'يعمل…' : 'شغّل التقييم'}</button>
        {live && <span className="la-muted small" role="status">{live.done_cases} من {live.total_cases} · ناجح {live.passed_cases} · ${(Number(live.cost_micros) / 1e6).toFixed(2)}</span>}</div>}
      {s.runs.length > 0 && (
        <table className="la-table">
          <thead><tr><th>البدء</th><th>الحال</th><th>النجاح</th><th>الكلفة</th><th>النسخة</th><th></th></tr></thead>
          <tbody>{s.runs.map((r) => (
            <tr key={r.id}><td>{date(r.started_at)}</td><td>{RUN_AR[r.status] || r.status}{r.stop_reason ? ` (${r.stop_reason})` : ''}</td>
              <td>{r.passed_cases}/{r.total_cases}{r.done_cases ? ` (${Math.round((r.passed_cases / r.total_cases) * 1000) / 10}٪)` : ''}</td>
              <td dir="ltr">${(Number(r.cost_micros) / 1e6).toFixed(2)}</td><td>{r.current ? 'الحالية' : 'أقدم'}</td>
              <td><button type="button" className="la-link" onClick={() => showResults(r.id)}>النتائج</button></td></tr>
          ))}</tbody>
        </table>
      )}
      {results?.success && (
        <div className="stack" aria-label="نتائج التشغيل">
          <div className="la-row between"><b>النتائج ({results.results.filter((x) => !x.ok).length} راسبة)</b><button type="button" className="la-link" onClick={() => setResults(null)}>إغلاق</button></div>
          <ul className="la-reqs">{results.results.map((x) => (
            <li key={x.case_id} data-ok={x.ok ? 'ok' : 'fail'}><span><b>{x.case_id}</b> {x.ok ? '✓' : '✕'} {KIND_AR[x.kind] || x.kind} · {x.question}</span>
              {!x.ok && <small className="la-err">{(x.reasons || []).join('؛ ')}</small>}
              {x.reply && <details><summary className="la-muted small">الرد</summary><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{x.reply}</p></details>}</li>
          ))}</ul>
        </div>
      )}
    </section>
  );
}


// H2: مراجعة مجموعة التقييم وتعديلها واعتمادها (قرار المالك v8). تعديل نسخة معتمدة يبدأ مسودة جديدة، والاعتماد للمالك وحده
const FIELD_KIND = Object.entries(KIND_AR);
function CaseEditor({ c, canWrite, onSaved }) {
  const { toast } = useUI();
  const [v, setV] = useState(() => ({ kind: c.kind, question: c.question, reference_ar: c.reference_ar || '', must_include: (c.must_include || []).join('\n'), must_not_include: (c.must_not_include || []).join('\n') }));
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await L('admin.guide-eval-case', { case_id: c.id, patch: { ...v, must_include: v.must_include.split('\n'), must_not_include: v.must_not_include.split('\n') } });
    setBusy(false);
    if (!r.success) { toast(r.message); return; }
    toast(r.new_draft ? `حُفظت في مسودة جديدة ${r.version}، والمعتمدة باقية كما هي` : 'حُفظت الحالة');
    onSaved();
  };
  return (
    <form className="stack gd-case-form" onSubmit={save}>
      <label className="of-field"><span className="of-label">النوع المتوقع</span>
        <select value={v.kind} disabled={!canWrite} onChange={(e) => setV({ ...v, kind: e.target.value })}>{FIELD_KIND.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <label className="of-field"><span className="of-label">السؤال</span>
        <textarea rows={2} value={v.question} disabled={!canWrite} onChange={(e) => setV({ ...v, question: e.target.value })} /></label>
      <label className="of-field"><span className="of-label">الإجابة المرجعية</span>
        <textarea rows={4} value={v.reference_ar} disabled={!canWrite} onChange={(e) => setV({ ...v, reference_ar: e.target.value })} /></label>
      <label className="of-field"><span className="of-label">ما يجب أن يرد في الإجابة (نمط في كل سطر، و | تعني «أو»)</span>
        <textarea dir="auto" rows={3} value={v.must_include} disabled={!canWrite} onChange={(e) => setV({ ...v, must_include: e.target.value })} /></label>
      <label className="of-field"><span className="of-label">ما يُمنع أن يرد</span>
        <textarea dir="auto" rows={2} value={v.must_not_include} disabled={!canWrite} onChange={(e) => setV({ ...v, must_not_include: e.target.value })} /></label>
      {c.source && <small className="la-muted">المصدر: {c.source}</small>}
      {canWrite && <div className="la-row"><button className="btn-sm primary" disabled={busy}>{busy ? 'لحظة…' : 'احفظ الحالة'}</button></div>}
    </form>
  );
}

function SetReview({ canWrite, onChanged }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [kind, setKind] = useState('all');
  const load = () => L('admin.guide-eval-cases').then(setD);
  useEffect(() => { load(); }, []);
  if (!d?.success) return null;
  const set = d.set;
  const changed = () => { load(); onChanged?.(); };
  const approve = async () => {
    if (!(await confirm(`اعتماد المجموعة ${set.version} (${set.cases.length} حالة) باسمك؟ بعد الاعتماد لا تتغير، وأي تعديل يبدأ مسودة جديدة ويلزمه تقييم جديد.`))) return;
    const r = await L('admin.guide-eval-approve', { version: set.version });
    if (!r.success) { toast(r.message); return; }
    toast(`اعتُمدت المجموعة ${set.version}`);
    changed();
  };
  const shown = set.cases.filter((c) => kind === 'all' || c.kind === kind);
  return (
    <section className="stack gd-set" aria-labelledby="gd-set-h">
      <div className="la-row between">
        <h4 id="gd-set-h">مراجعة المجموعة واعتمادها</h4>
        <span className={`la-chip ${set.status === 'approved' ? 'ok' : 'warn'}`}>{set.status === 'approved' ? `معتمدة: ${set.approved_by} في ${date(set.approved_at)}` : 'مسودة'}</span>
      </div>
      <p className="la-muted small">النسخة {set.version}{set.updated_by && set.updated_by !== 'seed' ? `، آخر تعديل ${set.updated_by} في ${date(set.updated_at)}` : ''}. {set.source === 'file' ? 'جدول المجموعة لم يُرحَّل بعد، فلا تعديل ولا اعتماد حتى يُطبَّق ترحيله.' : 'كل تعديل يُسجَّل، ويُسقط نجاح التقييم السابق حتى يُشغَّل من جديد.'}</p>
      {set.errors.length > 0 && <div className="la-err" role="alert">أخطاء تمنع الاعتماد: {set.errors.slice(0, 5).join('؛ ')}</div>}
      <div className="la-row" role="group" aria-label="تصفية بالنوع">
        {[['all', `الكل ${set.cases.length}`], ...FIELD_KIND.map(([k, t]) => [k, `${t} ${set.cases.filter((c) => c.kind === k).length}`])].map(([k, t]) => (
          <button key={k} type="button" className={`btn-sm ${kind === k ? 'primary' : 'ghost'}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{t}</button>
        ))}
      </div>
      <ol className="gd-cases">{shown.map((c) => (
        <li key={`${set.version}-${c.id}`}>
          <details>
            <summary><b>{c.id}</b> · {KIND_AR[c.kind] || c.kind} · {c.question}</summary>
            <CaseEditor c={c} canWrite={canWrite && d.can_edit} onSaved={changed} />
          </details>
        </li>
      ))}</ol>
      {d.can_approve && set.status !== 'approved' && (
        <div className="la-row"><button type="button" className="btn-sm primary" disabled={set.errors.length > 0} onClick={approve}>اعتمد المجموعة باسمك</button></div>
      )}
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
      {!open && <ul className="la-muted small" aria-label="ما يمنع الفتح">{d.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <label className="of-switch">
        <input type="checkbox" role="switch" checked={d.settings.enabled} disabled={busy || !d.can_write} onChange={(e) => flip(e.target.checked)} />
        <span>{d.settings.enabled ? 'مشغّل من اللوحة' : 'متوقف من اللوحة'}</span>
      </label>
      <dl className="ag-grid">
        <div><dt>النموذج</dt><dd><code dir="ltr">{d.model}</code></dd></div>
        <div><dt>نسخة السياسة</dt><dd>{d.policy_version || 'لم تُنشر بعد (G4b)'}</dd></div>
        <div><dt>تقييم الدقة</dt><dd>{d.gate.eval_ok ? '✓ ناجح' : '✕ لم ينجح بعد'}</dd></div>
        <div><dt>الدفعات التجريبية</dt><dd>{d.gate.pilots} <button type="button" className="la-link" onClick={() => navigate({ ctx: 'leaders', tab: 'guidance-access' })}>إتاحة التوجيه</button></dd></div>
        <div><dt>السقوف</dt><dd>{usd(d.settings.cap_usd)} يوميًا، و{d.settings.monthly} سؤالًا شهريًا و{d.settings.daily} يوميًا لكل مشارك، والحفظ {d.settings.retention_days} يومًا{' '}
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
      <thead><tr><th>{title}</th><th>أسئلة</th><th>مشاركون</th><th>لم يتأكد</th><th>«أريد التأكد»</th><th>تعذّر</th><th>الكلفة</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id || r.name}><td>{r.name}</td><td>{r.asked}</td><td>{r.participants}</td><td>{r.unsure}</td><td>{r.confirmed}</td><td>{r.errors}</td><td dir="ltr">{usd(r.usd)}</td></tr>)}</tbody>
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

export default function GuidanceAdmin() {
  const [d, setD] = useState(null);
  const [evalKey, setEvalKey] = useState(0);
  const load = () => L('admin.guide-dashboard').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  const open = d.blockers.length === 0;
  return (
    <div className="ag">
      <div className="la-row between ag-head">
        <div><h2>التوجيه والإرشاد</h2><p className="la-muted">المساعد الذكي داخل رحلة المشارك: الحالة والإنفاق والاستعمال والدقة.</p></div>
        {!d.can_write && <span className="la-chip">عرض فقط</span>}
      </div>
      <Section id="gd-state" title="الحالة والتحكم" level={open ? 'green' : 'amber'} summary={open ? 'مفتوح للدفعات التجريبية' : `مغلق: ${d.blockers.length} ${d.blockers.length === 1 ? 'شرط' : 'شروط'} قبل الفتح`}><StatusPart d={d} reload={load} setD={setD} /></Section>
      <Section id="gd-spend" title="الإنفاق" summary={`اليوم ${usd(d.today.usd)} من ${usd(d.settings.cap_usd)}`}><SpendPart d={d} /></Section>
      <Section id="gd-usage" title="الاستعمال" summary={d.report?.windows?.[1] ? `${d.report.windows[1].asked} سؤالًا في 30 يومًا` : 'لا استعمال بعد'}><UsagePart d={d} /></Section>
      <Section id="gd-accuracy" title="الدقة"><GuidanceEval key={evalKey} canWrite={d.can_write} /><SetReview canWrite={d.can_write} onChanged={() => setEvalKey((k) => k + 1)} /></Section>
      <Section id="gd-transcripts" title="سجل المحادثات" summary="محادثة كل مشارك كاملة لتتبع أي مشكلة، بحكم كل رد ونموذجه وكلفته. للمالك، وللمدير الأعلى بصلاحية يمنحها المالك، وكل فتح يُسجَّل."><GuideConversations /></Section>
    </div>
  );
}

// ── «إتاحة التوجيه»: الجهات (مفتاحها القائم) والدفعات التجريبية ──
export function GuidanceAccess() {
  const { toast } = useUI();
  const [orgs, setOrgs] = useState(null);
  const [pilots, setPilots] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    transcriptAccess().then((r) => setOwner(!!r?.owner));
    L('admin.guide-orgs').then(setOrgs);
    L('admin.guide-pilots').then(setPilots);
    L('admin.guide-dashboard').then((r) => setCanWrite(!!r?.can_write));
  }, []);
  if (!orgs || !pilots) return <Spinner />;
  const flipOrg = async (o, on) => {
    setOrgs((x) => ({ ...x, orgs: x.orgs.map((y) => (y.id === o.id ? { ...y, allowed: on } : y)) }));
    const r = await L('admin.guide-org-set', { org_id: o.id, on });
    if (!r.success) { toast(r.message); L('admin.guide-orgs').then(setOrgs); return; }
    toast(on ? `فُتح المساعد لمشاركي «${o.name}»` : `أُغلق المساعد لمشاركي «${o.name}»`);
  };
  const flipPilot = async (c, on) => {
    setPilots((x) => ({ ...x, cohorts: x.cohorts.map((y) => (y.id === c.id ? { ...y, pilot: on } : y)) }));
    const r = await L('admin.guide-pilot-set', { cohort_id: c.id, on });
    if (!r.success) { toast(r.message); L('admin.guide-pilots').then(setPilots); return; }
    toast(on ? `«${c.name}» دفعة تجريبية للمساعد` : `أُوقف المساعد لـ«${c.name}»`);
  };
  return (
    <div className="ag">
      <div className="la-row between ag-head">
        <div><h2>إتاحة التوجيه</h2><p className="la-muted">لمن يعمل المساعد الذكي: الجهة تسمح به، والدفعة مفعّلة تجريبيًا. يلزم الشرطان معًا، وكل تغيير يُسجَّل.</p></div>
        {!canWrite && <span className="la-chip">عرض فقط</span>}
      </div>
      <Section id="gd-orgs" title="الجهات" summary="الجهة المغلقة لا يعمل المساعد لأي من مشاركيها، أيًا كانت دفعته. الأفراد بلا جهة تحكمهم الدفعة وحدها.">
        {!orgs.ready ? <p className="la-muted small">مفتاح الجهات لم يُرحَّل بعد.</p> : (
          <ul className="gd-toggles">{orgs.orgs.map((o) => (
            <li key={o.id}><label className="row"><input type="checkbox" checked={o.allowed} disabled={!canWrite} onChange={(e) => flipOrg(o, e.target.checked)} /> <span>{o.name}</span></label></li>
          ))}</ul>
        )}
      </Section>
      <Section id="gd-pilots" title="الدفعات التجريبية" summary="المساعد لا يعمل إلا لأعضاء دفعة مفعّلة هنا، وبعد اجتياز التقييم ونسخة السياسة.">
        {!pilots.ready ? <p className="la-muted small">عمود الدفعة التجريبية لم يُرحَّل بعد.</p> : (
          <ul className="gd-toggles">{pilots.cohorts.map((c) => (
            <li key={c.id}><label className="row"><input type="checkbox" checked={c.pilot} disabled={!canWrite} onChange={(e) => flipPilot(c, e.target.checked)} /> <span>{c.name}{c.is_default ? ' (المفتوحة)' : ''}</span></label></li>
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
