// ════════════════════════════════════════════════════════════════
// تحديد المستوى: سؤال واحد في الشاشة، ثلاثة أقسام، حفظ تلقائي
// ════════════════════════════════════════════════════════════════
// مبادئ EAST في التصميم:
//   سهل:      نقرة واحدة تحفظ وتنتقل، لا زر "التالي"، أرقام لوحة المفاتيح
//   جذاب:     فواصل احتفاء بين الأقسام، لغة مخاطبة لا لغة امتحان
//   اجتماعي:  "لا إجابة خاطئة في الممارسة" يخفض قلق التقييم
//   في وقته:  يُستأنف من آخر سؤال، والتقدم يبدأ من خطوة منجزة لا من الصفر
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import { DIMENSIONS, dimOf, TIERS } from '../labels.js';

const ADVANCE_MS = 280;
const BREAK_LINES = {
  milestone: { title: 'أنهيت ثلث الطريق', next: 'القسم التالي عن تحويل مشروعاتك إلى أثر يُقاس.' },
  impact: { title: 'بقي قسم واحد فقط', next: 'الأخير عن قيادتك للتنفيذ وفريقك. هو الأقرب ليومك.' },
};

export default function Assessment({ me, onSubmitted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState('intro');   // intro | q | break | review
  const [saving, setSaving] = useState(0);
  const [failed, setFailed] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    (async () => {
      const res = await call('assessment.get');
      if (!res.success) return setError(res.message);
      setData(res);
      setAnswers(res.answers || {});
      const first = res.questions.findIndex((q) => res.answers?.[q.id] == null);
      setIdx(first === -1 ? res.questions.length - 1 : first);
    })();
    return () => clearTimeout(timer.current);
  }, []);

  const qs = data?.questions || [];
  const q = qs[idx];
  const answered = qs.filter((x) => answers[x.id] != null).length;
  const resumed = answered > 0;

  const save = useCallback(async (question, k) => {
    setSaving((n) => n + 1);
    const res = await call('assessment.answer', { assessment_id: data.assessment.id, question_id: question.id, k });
    setSaving((n) => n - 1);
    if (!res.success) setFailed({ question, k, message: res.message });
  }, [data]);

  const goNext = useCallback((from) => {
    const next = from + 1;
    if (next >= qs.length) return setMode('review');
    if (qs[next].dimension !== qs[from].dimension) { setIdx(next); return setMode('break'); }
    setIdx(next);
  }, [qs]);

  const choose = useCallback((k) => {
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.id]: k }));
    setFailed(null);
    save(q, k);
    clearTimeout(timer.current);
    const at = idx;
    timer.current = setTimeout(() => goNext(at), ADVANCE_MS);
  }, [q, idx, save, goNext]);

  useEffect(() => {
    if (mode !== 'q' || !q) return undefined;
    const onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) choose(q.options[n - 1].k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, q, choose]);

  const submit = async () => {
    setBusy(true); setError('');
    const res = await call('assessment.submit', { assessment_id: data.assessment.id });
    setBusy(false);
    if (res.success) onSubmitted(res);
    else setError(res.message);
  };

  if (error && !data) return <div className="page narrow"><div className="alert err">{error}</div></div>;
  if (!data) return <div className="center-load"><div className="spinner" /></div>;

  const pct = 20 + Math.round((answered / qs.length) * 80);
  const dimIndex = q ? DIMENSIONS.findIndex((d) => d.key === q.dimension) : 2;
  const sectionState = (i) => {
    const inDim = qs.filter((x) => x.dimension === DIMENSIONS[i].key);
    if (inDim.every((x) => answers[x.id] != null) && (mode === 'review' || i < dimIndex)) return 'done';
    return i === dimIndex && mode !== 'review' ? 'on' : '';
  };
  const header = (
    <>
      <div className="quiz-head">
        <span className="small muted">المرحلة 2 من 3 في القبول</span>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <span className="small"><b>{answered}</b>/{qs.length}</span>
      </div>
      <div className="sections">
        {DIMENSIONS.map((d, i) => <div key={d.key} className={sectionState(i)}>{d.short}</div>)}
      </div>
    </>
  );

  if (mode === 'intro') {
    return (
      <div className="page quiz">
        <div className="card stack">
          <p className="eyebrow">تحديد المستوى</p>
          <h1 style={{ fontSize: 24 }}>{resumed ? 'نكمل من حيث توقفت' : 'لنحدد نقطة انطلاقك'}</h1>
          <p>{data.assessment.intro || 'أسئلة قصيرة في ثلاثة أبعاد. نتيجتها تحدد مسارك في كل بُعد على حدة، فتبدأ من حيث أنت فعلًا.'}</p>
          <div className="grid2 small">
            <div className="alert info">⏱ حوالي {data.assessment.est_minutes || 12} دقيقة، {qs.length} سؤالًا</div>
            <div className="alert info">💾 كل إجابة تُحفظ فورًا، ويمكنك العودة لاحقًا</div>
          </div>
          <p className="muted small">في أسئلة الممارسة لا توجد إجابة صحيحة: اختر ما تفعله فعلًا لا ما ينبغي فعله، فهذا ما يجعل مسارك مناسبًا لك.</p>
          {resumed && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
          <button className="btn gold" onClick={() => setMode('q')}>{resumed ? `تابع (${answered} من ${qs.length})` : 'ابدأ'}</button>
        </div>
      </div>
    );
  }

  if (mode === 'break') {
    const prev = qs[idx - 1]?.dimension;
    const line = BREAK_LINES[prev] || { title: 'أحسنت', next: '' };
    return (
      <div className="page quiz">
        {header}
        <div className="card milestone-card stack">
          <div className="badge"><span>✓</span></div>
          <h2>{line.title}</h2>
          <p className="muted">أكملت قسم {dimOf(prev).title}. {line.next}</p>
          <button className="btn gold" onClick={() => setMode('q')}>واصل إلى {dimOf(q.dimension).title}</button>
        </div>
      </div>
    );
  }

  if (mode === 'review') {
    const missing = qs.filter((x) => answers[x.id] == null);
    return (
      <div className="page quiz">
        {header}
        <div className="card milestone-card stack">
          <div className="badge"><span>★</span></div>
          <h2>{missing.length ? `بقي ${missing.length} من الأسئلة` : 'أنهيت الأسئلة كلها'}</h2>
          <p className="muted">{missing.length
            ? 'أجب عنها لتظهر نتيجتك.'
            : 'أرسل إجاباتك لتظهر نتيجتك المبدئية في الأبعاد الثلاثة فورًا، ثم يراجعها المستشار ويعتمد مسارك.'}</p>
          {error && <div className="alert err">{error}</div>}
          {saving > 0 && <p className="saving">جارٍ حفظ آخر إجابة…</p>}
          <div className="row" style={{ justifyContent: 'center' }}>
            {missing.length
              ? <button className="btn gold" onClick={() => { setIdx(qs.indexOf(missing[0])); setMode('q'); }}>أكمل الناقص</button>
              : <button className="btn gold" disabled={busy || saving > 0} onClick={submit}>{busy ? 'جارٍ الإرسال…' : 'أرسل واعرض نتيجتي'}</button>}
            <button className="btn ghost" onClick={() => { setIdx(qs.length - 1); setMode('q'); }}>مراجعة</button>
          </div>
        </div>
      </div>
    );
  }

  const likert = q.kind === 'likert';
  return (
    <div className="page quiz">
      {header}
      <div className="card" key={q.id}>
        <div className="row small">
          <span className="chip dark">{dimOf(q.dimension).title}</span>
          <span className="chip gold">{TIERS[q.tier] || ''}</span>
        </div>
        <p className="q-text">{q.text}</p>
        {q.help && <p className="q-help">{q.help}</p>}
        {!q.help && <div style={{ height: 12 }} />}
        <div className={`options${likert ? ' likert' : ''}`} role="radiogroup" aria-label={q.text}>
          {q.options.map((o, i) => (
            <button key={o.k} className={`opt${answers[q.id] === o.k ? ' on' : ''}`} role="radio"
              aria-checked={answers[q.id] === o.k} onClick={() => choose(o.k)}>
              <span className="key">{i + 1}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
        {failed && (
          <div className="alert err" style={{ marginTop: 14 }}>
            {failed.message} <button className="link" onClick={() => { const f = failed; setFailed(null); save(f.question, f.k); }}>أعد المحاولة</button>
          </div>
        )}
        <div className="quiz-nav">
          <button className="link small" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>السابق</button>
          <span className="saving">{saving > 0 ? 'جارٍ الحفظ…' : answered ? 'محفوظ ✓' : ''}</span>
          {answers[q.id] != null
            ? <button className="link small" onClick={() => goNext(idx)}>التالي</button>
            : <span />}
        </div>
      </div>
    </div>
  );
}
