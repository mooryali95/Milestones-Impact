// ════════════════════════════════════════════════════════════════
// اكتشاف المبادرة: من فكرة إلى مسودة بطاقة في ثلاث خطوات (مرافق بناء المبادرة 4ج)
// ════════════════════════════════════════════════════════════════
// يظهر قبل البطاقة وحدها، حين لا اسم للمبادرة بعد. أفكار حتى ثلاث، ثم مفاضلة بمعايير بوابة البطاقة نفسها، ثم صياغة
// المختارة بأسئلة تناسب مستوى المشارك (guide.js). الناتج يُحفظ مسودةً في «بطاقة المبادرة» ولا يكتب فوق ما فيها.
import React, { useState } from 'react';
import { call } from '../api.js';
import { charterFromDiscovery, DISCOVERY_CRITERIA, discoveryQuestions, discoveryScore } from '../guide.js';

const STEPS = ['أفكارك', 'اختر الأنسب', 'اصغها'];

export default function Discovery({ level, charterId, onDone, onSkip }) {
  const [step, setStep] = useState(0);
  const [ideas, setIdeas] = useState(['', '', '']);
  const [checks, setChecks] = useState([{}, {}, {}]);
  const [pick, setPick] = useState(null);
  const [title, setTitle] = useState('');
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const filled = ideas.map((t, i) => ({ t: t.trim(), i })).filter((x) => x.t);
  const qs = discoveryQuestions(level);
  // الأعلى درجة يُقترح، والمشارك يختار
  const best = filled.length ? filled.reduce((a, b) => (discoveryScore(checks[b.i]) > discoveryScore(checks[a.i]) ? b : a)) : null;

  const finish = async () => {
    setBusy(true); setErr('');
    const cur = await call('models.get', { id: charterId });
    if (!cur.success) { setBusy(false); setErr(cur.message); return; }
    const answersOut = charterFromDiscovery(level, { idea: ideas[pick], title, answers }, cur.submission?.answers || {});
    const r = await call('models.save', { id: charterId, answers: answersOut, submit: false });
    setBusy(false);
    if (!r.success) { setErr(r.message); return; }
    onDone();
  };

  return (
    <section className="card disc" aria-labelledby="disc-h">
      <div className="row between">
        <h2 id="disc-h" className="as-h3">ابدأ من فكرة</h2>
        <button type="button" className="link small" onClick={onSkip}>لدي مبادرة، اكتب البطاقة مباشرة</button>
      </div>
      <p className="muted small">ثلاث خطوات قصيرة تخرج منها بمسودة بطاقة مبادرتك: من واقع عملك، حقيقية أو افتراضية واقعية تستطيع تنفيذها.</p>
      <ol className="mstepper">
        {STEPS.map((t, i) => <li key={t} className={i < step ? 'past' : i === step ? 'now' : ''}><span>{i < step ? '✓' : i + 1}</span>{t}</li>)}
      </ol>

      {step === 0 && (
        <div className="stack">
          <p className="small">اكتب حتى ثلاث مشكلات أو فرص تراها في عملك. جملة لكل منها تكفي.</p>
          {ideas.map((v, i) => (
            <label key={i} className="disc-idea">فكرة {i + 1}{i ? ' (اختيارية)' : ''}
              <input className="input" value={v} maxLength={200} placeholder={i === 0 && level === 'beginner' ? 'مثال: تجديد الترخيص يأخذ أسبوعين ويحتاج زيارة' : ''}
                onChange={(e) => setIdeas(ideas.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
          <div className="row"><button type="button" className="btn gold sm" disabled={!filled.length} onClick={() => setStep(1)}>التالي</button></div>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <p className="small">ضع علامة على ما ينطبق على كل فكرة. هذه معايير المستشار نفسها حين يعتمد بطاقتك.</p>
          {filled.map(({ t, i }) => (
            <fieldset key={i} className={`disc-opt${pick === i ? ' on' : ''}`}>
              <legend>
                <label><input type="radio" name="disc-pick" checked={pick === i} onChange={() => setPick(i)} /> {t}</label>
                <span className="chip">{discoveryScore(checks[i])} من {DISCOVERY_CRITERIA.length}</span>
                {best?.i === i && filled.length > 1 && discoveryScore(checks[i]) > 0 && <span className="chip ok">الأنسب</span>}
              </legend>
              {DISCOVERY_CRITERIA.map(([k, label]) => (
                <label key={k} className="disc-c"><input type="checkbox" checked={!!checks[i][k]} onChange={(e) => setChecks(checks.map((c, j) => (j === i ? { ...c, [k]: e.target.checked } : c)))} /> {label}</label>
              ))}
            </fieldset>
          ))}
          {pick != null && discoveryScore(checks[pick]) < 3 && <p className="alert warn small" role="status">الفكرة المختارة تحقق أقل من ثلاثة معايير، فقد يعيدها المستشار. يمكنك المتابعة، أو اختيار فكرة أخرى.</p>}
          <div className="row">
            <button type="button" className="btn ghost sm" onClick={() => setStep(0)}>السابق</button>
            <button type="button" className="btn gold sm" disabled={pick == null} onClick={() => { setTitle((x) => x || ideas[pick].trim().slice(0, 120)); setStep(2); }}>التالي</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <label>اسم مقترح للمبادرة
            <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {qs.map((q) => (
            <label key={q.key}>{q.label}
              <textarea className="input" rows={2} value={answers[q.key] || ''} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
              {q.hint && <small className="muted">{q.hint}</small>}
            </label>
          ))}
          {err && <div className="alert err">{err}</div>}
          <div className="row">
            <button type="button" className="btn ghost sm" onClick={() => setStep(1)}>السابق</button>
            <button type="button" className="btn gold sm" disabled={busy || !title.trim()} onClick={finish}>{busy ? 'لحظة…' : 'أنشئ مسودة البطاقة'}</button>
          </div>
          <small className="muted">لا يُكتب فوق ما في بطاقتك من قبل: تُملأ الحقول الفارغة وحدها، وتكمل البقية هناك.</small>
        </div>
      )}
    </section>
  );
}
