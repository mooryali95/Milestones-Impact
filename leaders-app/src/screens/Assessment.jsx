// ════════════════════════════════════════════════════════════════
// تحديد المستوى: سؤال واحد في الشاشة، ثلاثة أقسام، حفظ تلقائي
// ════════════════════════════════════════════════════════════════
// مبادئ EAST في التصميم:
//   سهل:      نقرة واحدة تحفظ وتنتقل، لا زر "التالي"، أرقام لوحة المفاتيح
//   جذاب:     فواصل احتفاء بين الأقسام، لغة مخاطبة لا لغة امتحان
//   اجتماعي:  "لا إجابة خاطئة في الممارسة" يخفض قلق التقييم
//   في وقته:  يُستأنف من آخر سؤال، والتقدم يبدأ من خطوة منجزة لا من الصفر
// القياس البعدي (kind="post") بالشاشة نفسها، مع تقديرين لعبارات الممارسة
// (الآن وقبل البرنامج) وقسم أخير عن انتقال التعلم.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import { DIMENSIONS, dimOf, TIERS } from '../labels.js';

const ADVANCE_MS = 280;
const BREAK_LINES = {
  milestone: { title: 'أنهيت ثلث الطريق', next: 'القسم التالي عن تحويل مشروعاتك إلى أثر يُقاس.' },
  impact: { title: 'بقي قسم واحد فقط', next: 'الأخير عن قيادتك للتنفيذ وفريقك. هو الأقرب ليومك.' },
};
const POST_BREAK_LINES = {
  ...BREAK_LINES,
  impact: { title: 'بقي إطار واحد', next: 'الأخير عن قيادتك للتنفيذ وفريقك.' },
  leadership: { title: 'أنهيت الأطر الثلاثة', next: 'بقيت عبارات قصيرة عن تجربتك في البرنامج وبيئة عملك.' },
};
const TRANSFER = { key: 'transfer', short: 'التجربة', title: 'تجربتك في البرنامج' };
// القسم الذي يظهر فيه السؤال: إطاره، أو قسم انتقال التعلم في القياس البعدي
const secOf = (q) => (q?.tier === 'transfer' ? 'transfer' : q?.dimension);
const secTitle = (k) => (k === 'transfer' ? TRANSFER.title : dimOf(k).title);

export default function Assessment({ kind = 'baseline', onSubmitted, onBack }) {
  const post = kind === 'post';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [before, setBefore] = useState({});
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState('intro');   // intro | q | break | review
  const [saving, setSaving] = useState(0);
  const [failed, setFailed] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    (async () => {
      const res = await call('assessment.get', { kind });
      if (!res.success) return setError(res.message);
      setData(res);
      setAnswers(res.answers || {});
      setBefore(res.before || {});
      const first = res.questions.findIndex((q) => !isComplete(q, res.answers || {}, res.before || {}));
      setIdx(first === -1 ? res.questions.length - 1 : first);
    })();
    return () => clearTimeout(timer.current);
  }, [kind]);

  const qs = data?.questions || [];
  const q = qs[idx];
  const answered = qs.filter((x) => isComplete(x, answers, before)).length;
  const resumed = answered > 0;

  const save = useCallback(async (question, k, b = null) => {
    setSaving((n) => n + 1);
    const res = await call('assessment.answer', { assessment_id: data.assessment.id, question_id: question.id, k, ...(question.retro ? { before: b } : {}) });
    setSaving((n) => n - 1);
    if (!res.success) setFailed({ question, k, b, message: res.message });
  }, [data]);

  const goNext = useCallback((from) => {
    const next = from + 1;
    if (next >= qs.length) return setMode('review');
    if (secOf(qs[next]) !== secOf(qs[from])) { setIdx(next); return setMode('break'); }
    setIdx(next);
  }, [qs]);

  // يتقدم تلقائيًا حين يكتمل السؤال: تقدير واحد، أو تقديران في القياس الرجعي
  const record = useCallback((k, b) => {
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.id]: k }));
    if (q.retro) setBefore((x) => ({ ...x, [q.id]: b }));
    setFailed(null);
    if (k == null) return;
    save(q, k, b);
    clearTimeout(timer.current);
    if (!isComplete(q, { [q.id]: k }, { [q.id]: b })) return;
    const at = idx;
    timer.current = setTimeout(() => goNext(at), ADVANCE_MS);
  }, [q, idx, save, goNext]);
  const choose = useCallback((k) => record(k, q?.retro ? before[q.id] ?? null : null), [record, q, before]);
  const chooseBefore = useCallback((b) => record(answers[q.id] ?? null, b), [record, q, answers]);

  useEffect(() => {
    if (mode !== 'q' || !q) return undefined;
    const onKey = (e) => {
      const n = Number(e.key);
      if (!(n >= 1 && n <= q.options.length)) return;
      if (q.retro && answers[q.id] != null && !isNa(q, answers[q.id])) {
        const opts = q.options.filter((o) => !o.na);
        if (n <= opts.length) chooseBefore(opts[n - 1].k);
      } else choose(q.options[n - 1].k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, q, choose, chooseBefore, answers]);

  const submit = async () => {
    setBusy(true); setError('');
    const res = await call('assessment.submit', { assessment_id: data.assessment.id });
    setBusy(false);
    if (res.success) onSubmitted(res);
    else setError(res.message);
  };

  if (error && !data) {
    return (
      <div className="page narrow stack">
        <div className="alert err">{error}</div>
        {onBack && <div className="row"><button className="btn ghost" onClick={onBack}>عودة إلى رحلتي</button></div>}
      </div>
    );
  }
  if (!data) return <div className="center-load"><div className="spinner" /></div>;

  const pct = 20 + Math.round((answered / qs.length) * 80);
  const SECTIONS = qs.some((x) => x.tier === 'transfer') ? [...DIMENSIONS, TRANSFER] : DIMENSIONS;
  const secIndex = q ? SECTIONS.findIndex((d) => d.key === secOf(q)) : SECTIONS.length - 1;
  const sectionState = (i) => {
    const inSec = qs.filter((x) => secOf(x) === SECTIONS[i].key);
    if (inSec.every((x) => isComplete(x, answers, before)) && (mode === 'review' || i < secIndex)) return 'done';
    return i === secIndex && mode !== 'review' ? 'on' : '';
  };
  const header = (
    <>
      <div className="quiz-head">
        <span className="small muted">{post ? 'القياس البعدي' : 'المرحلة 2 من 3 في القبول'}</span>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <span className="small"><b>{answered}</b>/{qs.length}</span>
      </div>
      <div className="sections">
        {SECTIONS.map((d, i) => <div key={d.key} className={sectionState(i)}>{d.short}</div>)}
      </div>
    </>
  );

  if (mode === 'intro') {
    return (
      <div className="page quiz">
        <div className="card stack">
          <p className="eyebrow">{post ? 'القياس البعدي' : 'تحديد المستوى'}</p>
          <h1 style={{ fontSize: 24 }}>{resumed ? 'نكمل من حيث توقفت' : post ? 'لنرَ ما تغيّر فعلًا' : 'لنحدد نقطة انطلاقك'}</h1>
          <p>{data.assessment.intro || 'أسئلة قصيرة في ثلاثة أبعاد. نتيجتها تحدد مسارك في كل بُعد على حدة، فتبدأ من حيث أنت فعلًا.'}</p>
          <div className="grid2 small">
            <div className="alert info">⏱ حوالي {data.assessment.est_minutes || 12} دقيقة، {qs.length} سؤالًا</div>
            <div className="alert info">💾 كل إجابة تُحفظ فورًا، ويمكنك العودة لاحقًا</div>
          </div>
          <p className="muted small">في أسئلة الممارسة لا توجد إجابة صحيحة: اختر ما تفعله فعلًا لا ما ينبغي فعله، فهذا ما يجعل مسارك مناسبًا لك.</p>
          {resumed && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
          <div className="row">
            <button className="btn gold" onClick={() => setMode('q')}>{resumed ? `تابع (${answered} من ${qs.length})` : 'ابدأ'}</button>
            {onBack && <button className="btn ghost" onClick={onBack}>لاحقًا</button>}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'break') {
    const prev = secOf(qs[idx - 1]);
    const line = (post ? POST_BREAK_LINES : BREAK_LINES)[prev] || { title: 'أحسنت', next: '' };
    return (
      <div className="page quiz">
        {header}
        <div className="card milestone-card stack">
          <div className="badge"><span>✓</span></div>
          <h2>{line.title}</h2>
          <p className="muted">أكملت قسم {secTitle(prev)}. {line.next}</p>
          <button className="btn gold" onClick={() => setMode('q')}>واصل إلى {secTitle(secOf(q))}</button>
        </div>
      </div>
    );
  }

  if (mode === 'review') {
    const missing = qs.filter((x) => !isComplete(x, answers, before));
    return (
      <div className="page quiz">
        {header}
        <div className="card milestone-card stack">
          <div className="badge"><span>★</span></div>
          <h2>{missing.length ? `بقي ${missing.length} من الأسئلة` : 'أنهيت الأسئلة كلها'}</h2>
          <p className="muted">{missing.length
            ? 'أجب عنها لتظهر نتيجتك.'
            : post ? 'أرسل إجاباتك لترى ما تغيّر بين بداية رحلتك ونهايتها، ثم ادعُ مديرك ليقدّر التغير من موقعه.'
              : 'أرسل إجاباتك لتظهر نتيجتك المبدئية في الأبعاد الثلاثة فورًا، ثم يراجعها المستشار ويعتمد مسارك.'}</p>
          {error && <div className="alert err">{error}</div>}
          {saving > 0 && <p className="saving">جارٍ حفظ آخر إجابة…</p>}
          <div className="row" style={{ justifyContent: 'center' }}>
            {missing.length
              ? <button className="btn gold" onClick={() => { setIdx(qs.indexOf(missing[0])); setMode('q'); }}>أكمل الناقص</button>
              : <button className="btn gold" disabled={busy || saving > 0} onClick={submit}>{busy ? 'جارٍ الإرسال…' : post ? 'أرسل واعرض ما تغيّر' : 'أرسل واعرض نتيجتي'}</button>}
            <button className="btn ghost" onClick={() => { setIdx(qs.length - 1); setMode('q'); }}>مراجعة</button>
          </div>
        </div>
      </div>
    );
  }

  const likert = q.kind === 'likert';
  const retroOpen = q.retro && answers[q.id] != null && !isNa(q, answers[q.id]);
  return (
    <div className="page quiz">
      {header}
      <div className="card" key={q.id}>
        <div className="row small">
          <span className="chip dark">{secTitle(secOf(q))}</span>
          {q.tier !== 'transfer' && <span className="chip gold">{TIERS[q.tier] || ''}</span>}
        </div>
        <p className="q-text">{q.text}</p>
        {q.help && <p className="q-help">{q.help}</p>}
        {!q.help && <div style={{ height: 12 }} />}
        {q.retro && <p className="retro-label">الآن، في الأشهر الثلاثة الأخيرة</p>}
        <div className={`options${likert ? ' likert' : ''}`} role="radiogroup" aria-label={q.retro ? `${q.text}: الآن` : q.text}>
          {q.options.map((o, i) => (
            <button key={o.k} className={`opt${answers[q.id] === o.k ? ' on' : ''}`} role="radio"
              aria-checked={answers[q.id] === o.k} onClick={() => choose(o.k)}>
              <span className="key">{i + 1}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
        {retroOpen && (
          <>
            <p className="retro-label">قبل بدء البرنامج، كما تراه اليوم</p>
            <div className="options likert retro" role="radiogroup" aria-label={`${q.text}: قبل البرنامج`}>
              {q.options.filter((o) => !o.na).map((o, i) => (
                <button key={o.k} className={`opt${before[q.id] === o.k ? ' on' : ''}`} role="radio"
                  aria-checked={before[q.id] === o.k} onClick={() => chooseBefore(o.k)}>
                  <span className="key">{i + 1}</span>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {failed && (
          <div className="alert err" style={{ marginTop: 14 }}>
            {failed.message} <button className="link" onClick={() => { const f = failed; setFailed(null); save(f.question, f.k, f.b); }}>أعد المحاولة</button>
          </div>
        )}
        <div className="quiz-nav">
          <button className="link small" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>السابق</button>
          <span className="saving">{saving > 0 ? 'جارٍ الحفظ…' : answered ? 'محفوظ ✓' : ''}</span>
          {isComplete(q, answers, before)
            ? <button className="link small" onClick={() => goNext(idx)}>التالي</button>
            : <span />}
        </div>
      </div>
    </div>
  );
}

// "لا ينطبق" في الآن يُغني عن تقدير ما قبل البرنامج
const isNa = (q, k) => !!q.options.find((o) => o.k === k)?.na;
function isComplete(q, answers, before) {
  if (answers[q.id] == null) return false;
  if (!q.retro || isNa(q, answers[q.id])) return true;
  return before[q.id] != null;
}
