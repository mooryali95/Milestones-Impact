// ════════════════════════════════════════════════════════════════
// الإعدادات العامة: القيم التي يضبطها المالك (تقييم 360، وزمن الإجابة في مراجعة القياس)
// ════════════════════════════════════════════════════════════════
// المحرر يُرسم من التعريف نفسه الذي يتحقق به الخادم (SETTINGS في settings.js)، فلا قائمة حقول ثانية هنا.
// الحفظ للمدير ذي الكتابة، ويُسجَّل في السجل بالقيمة قبل وبعد (settings.ts).
import React, { useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { navigate } from '../route.js';
import { cleanGroup, SETTINGS } from '../../../supabase/functions/leaders-api/settings.js';
import { featureFlags } from '../../../supabase/functions/leaders-api/features.js';

// الميزات قيد البناء (مفاتيح الميزات P2): ثلاثة مفاتيح متجاورة، لكل ميزة مفتاح واحد في المخزن. القاعة وكاتون في مجموعة
// features، و360 هو feedback360.enabled نفسه (الخيار أ)، فلا يُعرض مرة ثانية في مجموعة 360. كل نقرة تحفظ فورًا وتُسجَّل في السجل
export const FEATURE_SWITCHES = [
  // حال كل مفتاح بجنس اسمه كما في عنوان حقله (settings.js): القاعة ظاهرة، وكاتون و360 ظاهر
  { key: 'hall', group: 'features', field: 'hall', title: 'القاعة الحية', on_ar: 'ظاهرة للمستخدمين', off_ar: 'مخفية عن المستخدمين' },
  { key: 'katon', group: 'features', field: 'katon', title: 'كاتون', on_ar: 'ظاهر للمستخدمين', off_ar: 'مخفي عن المستخدمين' },
  { key: 'f360', group: 'feedback360', field: 'enabled', title: 'تقييم 360', on_ar: 'ظاهر للمستخدمين', off_ar: 'مخفي عن المستخدمين' },
];
// حقول تُرسم في «الميزات قيد البناء» وحدها، فلا تُعرض مرتين
const IN_FEATURES = { feedback360: new Set(['enabled']) };

// أيام التذكير تُعرض مفصولة بفاصلة وتُحرَّر نصًا، ويحولها التحقق نفسه (cleanField) إلى قائمة
const asText = (v) => (Array.isArray(v) ? v.join('، ') : v ?? '');

function Field({ id, f, value, error, onChange, disabled }) {
  const hint = f.hint_ar ? <small className="la-muted" id={`${id}-h`}>{f.hint_ar}</small> : null;
  const err = error ? <small className="la-err" role="alert">{error}</small> : null;
  if (f.type === 'bool') {
    return (
      <div className="of-field">
        <label className="row"><input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined} /> <span className="of-label">{f.label_ar}</span></label>
        {hint}{err}
      </div>
    );
  }
  if (f.type === 'labels') {
    return (
      <fieldset className="of-field">
        <legend className="of-label">{f.label_ar}</legend>
        {value.map((x, i) => (
          <label key={i} className="row"><span>{i + 1}</span>
            <input value={x} disabled={disabled} maxLength={60} aria-label={`${f.label_ar}: ${i + 1}`} onChange={(e) => onChange(value.map((y, j) => (j === i ? e.target.value : y)))} /></label>
        ))}
        {hint}{err}
      </fieldset>
    );
  }
  return (
    <label className="of-field"><span className="of-label">{f.label_ar}</span>
      <input dir="ltr" inputMode={f.type === 'int' ? 'numeric' : 'decimal'} value={asText(value)} disabled={disabled}
        aria-describedby={hint ? `${id}-h` : undefined} aria-invalid={error ? 'true' : undefined}
        onChange={(e) => onChange(e.target.value)} />
      {hint}{err}
    </label>
  );
}

function Group({ group, values, updated, canWrite, onSaved }) {
  const { toast } = useUI();
  const def = SETTINGS[group];
  const [v, setV] = useState(values);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(values); setErrors({}); }, [values]);
  const dirty = JSON.stringify(v) !== JSON.stringify(values);
  const save = async (e) => {
    e.preventDefault();
    // التحقق نفسه الذي يجريه الخادم، قبل الإرسال، فيظهر الخطأ بجوار حقله
    const c = cleanGroup(group, v);
    if (!c.ok) { setErrors(c.errors); return; }
    setBusy(true);
    const r = await L('admin.settings-save', { group, values: c.value });
    setBusy(false);
    if (!r.success) { setErrors(r.errors || { _: r.message }); toast(r.message); return; }
    setErrors({});
    toast('حُفظت الإعدادات');
    onSaved(r);
  };
  return (
    <form className="la-card" onSubmit={save} aria-labelledby={`st-${group}`}>
      <h3 id={`st-${group}`}>{def.title_ar}</h3>
      <p className="la-muted">{def.note_ar}</p>
      {def.super && !canWrite && <p className="la-muted small">التعديل للمدير الأعلى والمالك وحدهما.</p>}
      {updated && <p className="la-muted small">آخر تعديل: {updated.by} · {date(updated.at)}</p>}
      <div className="of-grid">
        {Object.entries(def.fields).filter(([k]) => !IN_FEATURES[group]?.has(k)).map(([k, f]) => (
          <Field key={k} id={`st-${group}-${k}`} f={f} value={v[k]} error={errors[k]} disabled={!canWrite}
            onChange={(x) => setV((cur) => ({ ...cur, [k]: x }))} />
        ))}
      </div>
      {errors._ && <div className="la-err" role="alert">{errors._}</div>}
      {canWrite && (
        <div className="la-row">
          <button className="btn-sm primary" disabled={busy || !dirty}>{busy ? 'لحظة…' : 'حفظ'}</button>
          <button type="button" className="btn-sm ghost" disabled={busy || !dirty} onClick={() => { setV(values); setErrors({}); }}>تراجع</button>
        </div>
      )}
    </form>
  );
}

// التوجيه والإرشاد داخل الرحلة: سقفه منفصل عن سقف هذا المساعد، ومصدره الإعدادات العامة وحدها (settings.js)
export function GuidanceCap() {
  const [g, setG] = useState(null);
  useEffect(() => { L('admin.settings').then((r) => setG(r?.success ? r.values?.guidance || null : null)); }, []);
  if (!g) return null;
  return (
    <p className="la-muted small ag-guidance">
      سقف «التوجيه والإرشاد» داخل الرحلة منفصل: {Number(g.daily_spend_usd).toFixed(2)} دولار يوميًا، و{g.monthly_questions} سؤالًا شهريًا و{g.daily_questions} يوميًا لكل مشارك.{' '}
      <button type="button" className="link" onClick={() => navigate({ ctx: 'leaders', tab: 'settings', id: 'guidance' })}>عدّله من الإعدادات</button>
    </p>
  );
}

function FeatureSwitches({ d, canWrite, onSaved }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState('');
  const flags = featureFlags(d.values);
  const def = SETTINGS.features;
  const flip = async (s, on) => {
    setBusy(s.key);
    const r = await L('admin.settings-save', { group: s.group, values: { [s.field]: on } });
    setBusy('');
    if (!r.success) { toast(r.message); return; }
    toast(`${s.title}: ${on ? s.on_ar : s.off_ar}`);
    onSaved(r);
  };
  return (
    <section className="la-card ft-panel" aria-labelledby="st-features">
      <h3 id="st-features">{def.title_ar}</h3>
      <p className="la-muted">{def.note_ar}</p>
      <div className="ft-grid">
        {FEATURE_SWITCHES.map((s) => {
          const on = flags[s.key];
          const f = SETTINGS[s.group].fields[s.field];
          const upd = d.updated?.[s.group];
          return (
            <div key={s.key} className={`ft-switch ${on ? 'on' : 'off'}`} data-feature={s.key}>
              <label className="of-switch">
                <input type="checkbox" role="switch" checked={on} disabled={!canWrite || !d.ready || busy === s.key}
                  aria-describedby={`ft-${s.key}-h`} onChange={(e) => flip(s, e.target.checked)} />
                <span><b>{s.title}</b><br /><span className={`la-chip ${on ? 'ok' : 'warn'}`}>{on ? s.on_ar : s.off_ar}</span></span>
              </label>
              <small className="la-muted" id={`ft-${s.key}-h`}>{f.hint_ar}</small>
              {upd && <small className="la-muted">آخر تعديل: {upd.by} · {date(upd.at)}</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// onSettings: يُبلَّغ به قسم القادة بعد كل حفظ، فتتحدث شارات «مخفي عن المستخدمين» على الأقسام فورًا
// تقرير «التوجيه والإرشاد» (G3): أعداد وإنفاق بلا نص ولا أسماء، للمدير الأعلى والمالك. نسبة «أريد التأكد» مؤشر الدقة في التجربة
export function GuidanceReport() {
  const [r, setR] = useState(null);
  useEffect(() => { L('admin.guide-report').then(setR); }, []);
  if (!r?.success || !r.ready) return null;
  return (
    <section className="ag-guide-report stack" aria-labelledby="ag-greport-h">
      <h4 id="ag-greport-h">«التوجيه والإرشاد» داخل الرحلة {r.open ? <span className="ops-flag on">مفتوح</span> : <span className="ops-flag off">مغلق للمشاركين</span>}</h4>
      <table className="la-table">
        <thead><tr><th>المدة</th><th>أسئلة</th><th>مشاركون</th><th>أجاب</th><th>لم يتأكد</th><th>خارج النطاق</th><th>تعذّر</th><th>«أريد التأكد»</th><th>الكلفة</th></tr></thead>
        <tbody>{r.windows.map((w) => (
          <tr key={w.days}><td>آخر {w.days} يومًا</td><td>{w.asked}</td><td>{w.participants}</td><td>{w.answered}</td><td>{w.unsure}</td><td>{w.refused}</td><td>{w.errors}</td>
            <td>{w.confirmed}{w.confirm_rate != null ? ` (${w.confirm_rate}٪)` : ''}</td><td dir="ltr">${w.usd.toFixed(2)}</td></tr>
        ))}</tbody>
      </table>
      {r.spend.length > 0 && <p className="la-muted small">أعلى يوم: ${Math.max(...r.spend.map((x) => x.usd)).toFixed(2)} من سقف ${Number(r.cap_usd).toFixed(2)}.</p>}
      <p className="la-muted small">أعداد وحدها: نصوص المحادثات خاصة بأصحابها ولا تُعرض في أي شاشة.</p>
    </section>
  );
}

// G4a: تقييم دقة «التوجيه والإرشاد» والدفعة التجريبية (للمدير الأعلى والمالك). البوابة لا تفتح إلا بمجموعة اعتمدتها لجنة
// المحتوى وآخر تشغيل ناجح بنسبة لا تقل عن 99٪ لبصمة اليوم (النموذج والقواعد والمجموعة)، ثم للدفعات المفعّلة وحدها
const RUN_AR = { running: 'يعمل', passed: 'ناجح', failed: 'دون الحد', stopped: 'متوقف', error: 'تعذّر' };
const KIND_AR = { answer: 'يجيب', unsure: 'لا يتأكد', refuse_model: 'يرفض', refuse_route: 'يرفضه الموجّه' };
export function GuidanceEval({ canWrite = false }) {
  const { toast } = useUI();
  const [s, setS] = useState(null);
  const [pilots, setPilots] = useState(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const [results, setResults] = useState(null);
  const load = () => Promise.all([L('admin.guide-eval').then(setS), L('admin.guide-pilots').then(setPilots)]);
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
  const flip = async (c, on) => {
    // يظهر التغيير فورًا، ويعود إن رفضه الخادم
    setPilots((x) => ({ ...x, cohorts: x.cohorts.map((y) => (y.id === c.id ? { ...y, pilot: on } : y)) }));
    const r = await L('admin.guide-pilot-set', { cohort_id: c.id, on });
    if (!r.success) { toast(r.message); L('admin.guide-pilots').then(setPilots); return; }
    toast(on ? `«${c.name}» دفعة تجريبية للمساعد` : `أُوقف المساعد لـ«${c.name}»`);
    L('admin.guide-pilots').then(setPilots);
  };
  const showResults = async (id) => setResults(await L('admin.guide-eval-results', { run_id: id }));
  const set = s.set;
  return (
    <section className="ag-guide-eval stack" aria-labelledby="ag-geval-h">
      <h4 id="ag-geval-h">تقييم دقة «التوجيه والإرشاد» قبل الإطلاق</h4>
      <p className={s.gate.ok ? 'ops-flag on' : 'ops-flag off'} role="status">{s.gate.ok ? `✓ اجتاز التقييم (${s.threshold * 100}٪ فأكثر) على النسخة الحالية` : `✕ ${s.gate.message}`}</p>
      <p className="la-muted small">
        المجموعة {set.version}: {set.total} حالة ({Object.entries(set.kinds).map(([k, n]) => `${KIND_AR[k] || k} ${n}`).join('، ')}).{' '}
        {set.approved_by ? `اعتمدتها لجنة المحتوى (${set.approved_by}، ${date(set.approved_at)}).` : 'مسودة بانتظار اعتماد لجنة المحتوى للإجابات المرجعية.'}
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
      {pilots?.ready && (
        <fieldset className="stack">
          <legend>الدفعات التجريبية</legend>
          <p className="la-muted small">المساعد لا يعمل إلا لأعضاء دفعة مفعّلة هنا، وبعد اجتياز التقييم ونسخة السياسة. كل تغيير يُسجَّل.</p>
          {pilots.cohorts.map((c) => (
            <label key={c.id} className="row"><input type="checkbox" checked={c.pilot} disabled={!canWrite} onChange={(e) => flip(c, e.target.checked)} /> <span>{c.name}{c.is_default ? ' (المفتوحة)' : ''}</span></label>
          ))}
        </fieldset>
      )}
    </section>
  );
}

export default function AppSettings({ canWrite, onSettings, isSuper = false, focus = null }) {
  const [d, setRaw] = useState(null);
  const setD = (r) => { setRaw(r); if (r?.success) onSettings?.(r); };
  useEffect(() => { L('admin.settings').then(setD); }, []);
  // رابط مباشر لمجموعة (#/leaders/settings/<group>)، كرابط سقف التوجيه من شاشة المساعد
  useEffect(() => { if (d?.success && focus) document.getElementById(`st-${focus}`)?.scrollIntoView?.({ block: 'start' }); }, [d, focus]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  return (
    <div className="stack">
      {!d.ready && <div className="la-card la-muted" role="status">مخزن الإعدادات لم يُرحَّل بعد، فتعمل القيم الافتراضية ولا يُحفظ تعديل حتى يُطبَّق ترحيله.</div>}
      <FeatureSwitches d={d} canWrite={canWrite} onSaved={setD} />
      {Object.keys(SETTINGS).filter((g) => g !== 'features').map((g) => (
        <Group key={g} group={g} values={d.values[g]} updated={d.updated?.[g]} canWrite={canWrite && d.ready && (!SETTINGS[g].super || isSuper)} onSaved={setD} />
      ))}
    </div>
  );
}
