// ════════════════════════════════════════════════════════════════
// تقييم 360 للتطوير: المشارك يقدّر نفسه، ويرشح مقيّميه بالمجموعات، ويتابع الأعداد، ثم يستلم تقريره من مستشاره
// ════════════════════════════════════════════════════════════════
// (تصور 2026-11-11، اعتمده المالك) للتطوير وحده: لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عنه.
// الحدود والسقوف والنافذة ومراسي السلم من الإعدادات العامة على الخادم (f360.mine يرسلها)، فلا رقم منها هنا.
// بعد فتح النافذة يرى أعدادًا لكل مجموعة لا من أرسل ومن لم يرسل (حماية المقيّم).
import React, { useCallback, useEffect, useState } from 'react';
import { call } from '../api.js';
import { dimOf } from '../labels.js';
import { ErrorBox } from '../ui.jsx';
import { CYCLE_STATUS_AR, nominationCheck } from '../../../supabase/functions/leaders-api/feedback360.js';
import { FEEDBACK_GROUP_AR } from '../../../supabase/functions/leaders-api/labels.js';

const WAVE_AR = { t1: 'الموجة الأولى', t2: 'الموجة الثانية' };
const day = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
const GROUP_HINT = {
  manager: 'يظهر تقديره باسم دوره، ويُعلَم بذلك.',
  peer: 'من يعمل معك في المستوى نفسه، ومنهم من يختلف معك.',
  report: 'من يعملون تحت إشرافك مباشرة.',
  stakeholder: 'جهة مستفيدة أو راعٍ أو عميل داخلي يرى أثر عملك.',
};

function SelfForm({ items, initial, cycle, onSaved }) {
  const [a, setA] = useState(initial || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const left = items.filter((q) => a[q.id] == null).length;
  const save = async () => {
    setBusy(true); setError('');
    const r = await call('f360.self', { cycle_id: cycle.id, answers: a });
    setBusy(false);
    if (r.success) onSaved(r); else setError(r.message);
  };
  return (
    <section className="card stack" aria-labelledby="f360-self">
      <h2 className="as-h3" id="f360-self">١. تقديرك لنفسك</h2>
      <p className="small muted">العبارات نفسها التي يقدّرها مقيّموك، كما تمارسها في الأشهر الثلاثة الأخيرة. التقرير يضع تقديرك بجوار تقديرهم.</p>
      {items.map((q, i) => (
        <div key={q.id} className="stack" style={{ gap: 6 }}>
          <div className="row small"><span className="chip dark">{dimOf(q.dimension).title}</span><span className="muted">{i + 1} من {items.length}</span></div>
          <p className="q-text" id={`f360-q-${i}`}>{q.text}</p>
          <div className="options likert" role="radiogroup" aria-labelledby={`f360-q-${i}`}>
            {q.options.map((o) => (
              <button key={o.k} type="button" role="radio" aria-checked={a[q.id] === o.k} className={`opt${a[q.id] === o.k ? ' on' : ''}`} onClick={() => setA({ ...a, [q.id]: o.k })}><span>{o.label}</span></button>
            ))}
          </div>
        </div>
      ))}
      {error && <div className="alert err" role="alert">{error}</div>}
      <div className="row"><button className="btn gold sm" disabled={busy || left > 0} onClick={save}>{busy ? 'جارٍ الحفظ…' : left ? `بقي ${left}` : cycle.self_done ? 'حدّث تقديري' : 'احفظ تقديري'}</button></div>
    </section>
  );
}

function Nominees({ data, cycle, onChange }) {
  const s = data.settings;
  const [f, setF] = useState({ email: '', full_name: '', relation: 'peer' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = cycle.status === 'nominating';
  const check = nominationCheck(cycle.nominees, s, { selfDone: cycle.self_done });
  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await call('f360.nominate', { cycle_id: cycle.id, ...f });
    setBusy(false);
    if (r.success) { onChange(r); setF({ ...f, email: '', full_name: '' }); } else setError(r.message);
  };
  const remove = async (n) => {
    setError('');
    const r = await call('f360.remove', { id: n.id });
    if (r.success) onChange(r); else setError(r.message);
  };
  const submit = async () => {
    setBusy(true); setError('');
    const r = await call('f360.submit', { cycle_id: cycle.id });
    setBusy(false);
    if (r.success) onChange(r); else setError(r.message);
  };
  return (
    <section className="card stack" aria-labelledby="f360-nom">
      <h2 className="as-h3" id="f360-nom">٢. من يقيّمك</h2>
      <p className="small muted">رشّح من رأى عملك في الأشهر الثلاثة الأخيرة، ومنهم من يختلف معك. يعتمد مستشارك القائمة قبل أن تصلهم الدعوة. لا يصدر التقرير بأقل من {s.min_others} من غير مديرك، ولا تظهر مجموعة وحدها بأقل من {s.min_group}.</p>
      {cycle.return_note && <div className="alert" role="status">أعاد مستشارك القائمة بملاحظة: {cycle.return_note}</div>}
      {Object.entries(data.groups).map(([g, title]) => {
        const list = cycle.nominees.filter((n) => n.relation === g);
        return (
          <div key={g} className="stack" style={{ gap: 4 }}>
            <div className="row between small"><b>{title}</b><span className="muted">{list.length} من {s.caps[g]}</span></div>
            <small className="muted">{GROUP_HINT[g]}</small>
            {list.length > 0 && (
              <ul className="rater-list">
                {list.map((n) => (
                  <li key={n.id} className="row between">
                    <span><b>{n.full_name || n.email}</b> <span className="small muted ltr">{n.full_name ? n.email : ''}</span>{n.verification_ar ? <span className="small muted"> · {n.verification_ar}</span> : null}</span>
                    {editable && <button className="link small" onClick={() => remove(n)} aria-label={`احذف ${n.full_name || n.email}`}>حذف</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {editable && (
        <form className="stack" onSubmit={add}>
          <div className="grid2">
            <label className="field"><span>البريد</span>
              <input className="input ltr" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="field"><span>الاسم <em>(اختياري)</em></span>
              <input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
            <label className="field"><span>صلته بك</span>
              <select className="input" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
                {Object.entries(data.groups).map(([g, t]) => <option key={g} value={g}>{t}</option>)}
              </select></label>
          </div>
          <div className="row"><button className="btn sm" disabled={busy}>أضف إلى القائمة</button></div>
        </form>
      )}
      {error && <div className="alert err" role="alert">{error}</div>}
      {editable && (
        <div className="stack" style={{ gap: 6 }}>
          {!check.ok && <p className="small muted" role="status">{check.reason === 'too_few' ? `أضف ${check.need} على الأقل من غير مديرك.` : check.reason === 'self' ? 'أكمل تقديرك الذاتي أولًا.' : 'تجاوزت حد إحدى المجموعات.'}</p>}
          <div className="row"><button className="btn gold sm" disabled={busy || !check.ok} onClick={submit}>أرسل القائمة إلى مستشاري</button></div>
        </div>
      )}
      {cycle.status === 'approval' && <p className="small muted" role="status">أرسلت القائمة، وهي بانتظار اعتماد مستشارك. تصل الدعوات بعد اعتماده.</p>}
    </section>
  );
}

// بعد فتح النافذة: أعداد لكل مجموعة، لا أسماء
function Counts({ data, cycle }) {
  return (
    <section className="card stack" aria-labelledby="f360-counts">
      <h2 className="as-h3" id="f360-counts">التقديرات حتى الآن</h2>
      <ul className="stack small">
        {Object.entries(data.groups).filter(([g]) => cycle.counts[g].invited > 0).map(([g, t]) => (
          <li key={g} className="row between"><span>{t}</span><b>{g === 'manager' ? (cycle.counts[g].submitted ? 'أرسل ✓' : 'لم يرسل بعد') : `${cycle.counts[g].submitted} من ${cycle.counts[g].invited}`}</b></li>
        ))}
      </ul>
      {cycle.status === 'open' && <p className="small muted">تُغلق النافذة {day(cycle.closes_at)}، ويصل التذكير من لم يرسل دون أن نخبرك من هو.</p>}
    </section>
  );
}

export default function Feedback360({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError('');
    const r = await call('f360.mine');
    if (r.success) setData(r); else setError(r.message);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <div className="page narrow"><ErrorBox message={error} onRetry={load} /></div>;
  if (!data) return <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  const cycles = data.cycles || [];
  const cycle = cycles.filter((c) => c.status !== 'cancelled').at(-1) || null;
  const start = async () => {
    setBusy(true); setError('');
    const r = await call('f360.start');
    setBusy(false);
    if (r.success) setData(r); else setError(r.message);
  };
  return (
    <div className="page narrow stack">
      <div className="row"><button className="link small" onClick={onBack}>→ ملفي</button></div>
      <div className="card stack">
        <p className="eyebrow">تقييم 360 للتطوير{cycle ? ` · ${WAVE_AR[cycle.wave]}` : ''}</p>
        <h1 style={{ fontSize: 22 }}>كيف يراك من يعمل معك؟</h1>
        <p className="small muted">مرآة لممارستك من مديرك وزملائك وفريقك وأصحاب المصلحة، مقارنة بتقديرك لنفسك. يقرؤه معك مستشارك في جلسة توجيه، ثم تختار سلوكين أو ثلاثة تعمل عليها. للتطوير وحده: لا يدخل تقييمك الختامي ولا شهادتك، ولا تراه جهتك.</p>
        {cycle && <p className="small"><span className="chip">{CYCLE_STATUS_AR[cycle.status]}</span></p>}
      </div>
      {!data.enabled && !cycle && <div className="card"><p className="muted">تقييم 360 غير متاح بعد في برنامجك.</p></div>}
      {data.enabled && (!cycle || ['closed', 'released'].includes(cycle.status)) && data.next?.ok && (
        <div className="card stack">
          <p className="small muted">{data.next.wave === 't2' ? 'حان وقت الموجة الثانية: المقيّمون أنفسهم مرشحون سلفًا، فتقيس التغير.' : 'ابدأ بتقديرك لنفسك، ثم رشّح مقيّميك.'}</p>
          <div className="row"><button className="btn gold sm" disabled={busy} onClick={start}>{data.next.wave === 't2' ? 'ابدأ الموجة الثانية' : 'ابدأ تقييم 360'}</button></div>
        </div>
      )}
      {cycle && ['nominating', 'approval'].includes(cycle.status) && (
        <>
          {cycle.status === 'nominating' && <SelfForm items={data.self_items} initial={data.self_answers} cycle={cycle} onSaved={setData} />}
          <Nominees data={data} cycle={cycle} onChange={setData} />
        </>
      )}
      {cycle && ['open', 'closed'].includes(cycle.status) && <Counts data={data} cycle={cycle} />}
      {cycle?.status === 'closed' && <div className="card"><p className="small muted" role="status">أُغلقت النافذة. يسلّمك مستشارك تقريرك في جلسة توجيه، فتقرؤه معه أول مرة.</p></div>}
      {cycle?.status === 'released' && <div className="card"><p className="small muted" role="status">سلّمك مستشارك تقريرك في جلسة التوجيه.</p></div>}
    </div>
  );
}


// مدخل «ملفي»: يظهر حين يكون التقييم مفعّلًا أو للمشارك دورة، ولا يظهر غير ذلك
export function Feedback360Entry({ onOpen }) {
  const [d, setD] = useState(null);
  useEffect(() => { call('f360.mine').then((r) => setD(r?.success ? r : null)); }, []);
  if (!d || (!d.enabled && !d.cycles?.length)) return null;
  const c = (d.cycles || []).filter((x) => x.status !== 'cancelled').at(-1);
  return (
    <div className="page narrow" style={{ paddingTop: 0 }}>
      <section className="card stack" aria-labelledby="f360-entry">
        <h2 className="as-h3" id="f360-entry">تقييم 360 للتطوير</h2>
        <p className="small muted">كيف يراك مديرك وزملاؤك وفريقك، مقارنة بتقديرك لنفسك. للتطوير وحده، ويسلّمك مستشارك تقريره في جلسة توجيه.</p>
        {c && <p className="small"><span className="chip">{CYCLE_STATUS_AR[c.status]}</span></p>}
        <div className="row"><button className="btn sm" onClick={onOpen}>{c ? 'افتح تقييم 360' : 'ابدأ تقييم 360'}</button></div>
      </section>
    </div>
  );
}
