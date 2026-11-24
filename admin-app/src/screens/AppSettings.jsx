// ════════════════════════════════════════════════════════════════
// الإعدادات العامة: القيم التي يضبطها المالك (تقييم 360، وزمن الإجابة في مراجعة القياس)
// ════════════════════════════════════════════════════════════════
// المحرر يُرسم من التعريف نفسه الذي يتحقق به الخادم (SETTINGS في settings.js)، فلا قائمة حقول ثانية هنا.
// الحفظ للمدير ذي الكتابة، ويُسجَّل في السجل بالقيمة قبل وبعد (settings.ts).
import React, { useEffect, useMemo, useState } from 'react';
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
  if (f.type === 'text') {
    return (
      <label className="of-field"><span className="of-label">{f.label_ar}</span>
        <textarea rows={5} maxLength={f.max} value={value ?? ''} disabled={disabled}
          aria-describedby={hint ? `${id}-h` : undefined} aria-invalid={error ? 'true' : undefined} onChange={(e) => onChange(e.target.value)} />
        {hint}{err}
      </label>
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

// البحث في الإعدادات (المرحلة 3 من تدقيق اللوحة): يطابق اسم الحقل وشرحه، أو عنوان المجموعة ووصفها فتظهر كاملة
const norm = (t) => String(t || '').toLowerCase().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const hits = (q, ...texts) => { const n = norm(q).trim(); return !n || texts.some((t) => norm(t).includes(n)); };
/** ما يظهر من مجموعة عند البحث: null إن لم يطابق شيء، وإلا مفاتيح الحقول الظاهرة */
export function groupMatch(group, q) {
  const def = SETTINGS[group];
  const keys = Object.keys(def.fields).filter((k) => !IN_FEATURES[group]?.has(k));
  if (hits(q, def.title_ar, def.note_ar)) return keys;
  const some = keys.filter((k) => hits(q, def.fields[k].label_ar, def.fields[k].hint_ar));
  return some.length ? some : null;
}
// مجموعة كثيرة المفاتيح تُطوى (الرؤية: مفتاح لكل ما يُعرض)، وتنفتح بنفسها حين يطابقها البحث
const FOLDED = new Set(['visibility']);

function Group({ group, values, updated, canWrite, onSaved, show, q }) {
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
  const fields = (
    <div className="of-grid">
      {Object.entries(def.fields).filter(([k]) => !IN_FEATURES[group]?.has(k)).map(([k, f]) => (
        // الحقل المحجوب بالبحث يبقى في النموذج (hidden) فلا تضيع قيمته المحرَّرة ولا يتغير ما يُحفظ
        <div key={k} hidden={!!show && !show.includes(k)} data-setting={`${group}.${k}`}>
          <Field id={`st-${group}-${k}`} f={f} value={v[k]} error={errors[k]} disabled={!canWrite}
            onChange={(x) => setV((cur) => ({ ...cur, [k]: x }))} />
        </div>
      ))}
    </div>
  );
  return (
    <form className="la-card st-group" onSubmit={save} aria-labelledby={`st-${group}`} hidden={!show} data-group={group}>
      <h3 id={`st-${group}`} tabIndex={-1}>{def.title_ar}</h3>
      <p className="la-muted">{def.note_ar}</p>
      {def.super && !canWrite && <p className="la-muted small">التعديل للمدير الأعلى والمالك وحدهما.</p>}
      {updated && <p className="la-muted small">آخر تعديل: {updated.by} · {date(updated.at)}</p>}
      {FOLDED.has(group)
        ? <details className="st-fold" open={q ? true : undefined}><summary>{`المفاتيح (${Object.keys(def.fields).length})`}</summary>{fields}</details>
        : fields}
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
      <button type="button" className="link" onClick={() => navigate({ ctx: 'leaders', tab: 'ai', id: 'guidance' })}>افتح «التوجيه والإرشاد»</button>
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
export default function AppSettings({ canWrite, onSettings, isSuper = false, focus = null }) {
  const [d, setRaw] = useState(null);
  const setD = (r) => { setRaw(r); if (r?.success) onSettings?.(r); };
  useEffect(() => { L('admin.settings').then(setD); }, []);
  // رابط مباشر لمجموعة (#/leaders/settings/<group>)، كرابط سقف التوجيه من شاشة المساعد
  useEffect(() => { if (d?.success && focus) document.getElementById(`st-${focus}`)?.scrollIntoView?.({ block: 'start' }); }, [d, focus]);
  const [q, setQ] = useState('');
  // مجموعة لها لوحتها (panel: توجيه الإشعارات في مركز البريد) لا تُرسم هنا
  const groups = useMemo(() => Object.keys(SETTINGS).filter((g) => g !== 'features' && !SETTINGS[g].panel), []);
  const featuresHit = hits(q, SETTINGS.features.title_ar, SETTINGS.features.note_ar, ...FEATURE_SWITCHES.flatMap((x) => [x.title, SETTINGS[x.group].fields[x.field]?.hint_ar]));
  const shown = Object.fromEntries(groups.map((g) => [g, groupMatch(g, q)]));
  const index = [['st-features', SETTINGS.features.title_ar, featuresHit], ...groups.map((g) => [`st-${g}`, SETTINGS[g].title_ar, !!shown[g]])];
  const jump = (id) => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } };
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  const none = !featuresHit && !groups.some((g) => shown[g]);
  return (
    <div className="st-layout">
      {/* فهرس ملتصق وبحث (المرحلة 3 من تدقيق اللوحة): الحفظ يبقى لكل مجموعة بزرها */}
      <nav className="st-index" aria-label="فهرس الإعدادات">
        <label className="st-search"><span className="sr-only">ابحث في الإعدادات</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في الإعدادات…" aria-label="ابحث في الإعدادات" /></label>
        <ul>
          {index.map(([id, label, on]) => <li key={id} hidden={!on}><button type="button" className="la-link" onClick={() => jump(id)}>{label}</button></li>)}
        </ul>
      </nav>
      <div className="stack st-main">
        {!d.ready && <div className="la-card la-muted" role="status">مخزن الإعدادات لم يُرحَّل بعد، فتعمل القيم الافتراضية ولا يُحفظ تعديل حتى يُطبَّق ترحيله.</div>}
        {none && <p className="la-card la-muted" role="status">لا إعداد يطابق «{q}».</p>}
        <div hidden={!featuresHit}><FeatureSwitches d={d} canWrite={canWrite} onSaved={setD} /></div>
        {groups.map((g) => (
          <Group key={g} group={g} q={q} show={shown[g]} values={d.values[g]} updated={d.updated?.[g]} canWrite={canWrite && d.ready && (!SETTINGS[g].super || isSuper)} onSaved={setD} />
        ))}
      </div>
    </div>
  );
}
