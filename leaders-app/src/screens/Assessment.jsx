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
import Ico from '../Ico.jsx';
import { call } from '../api.js';
import { ErrorBox } from '../ui.jsx';
import { DIMENSIONS, dimOf, TIERS } from '../labels.js';
import { countAr } from '../../../supabase/functions/leaders-api/labels.js';
import { BEHAVIOR_NA_MESSAGE, BEHAVIOR_NA_RULE, behaviorNaCounts, behaviorNaExcess, isBehaviorNa, MAX_BEHAVIOR_NA } from '../../../supabase/functions/leaders-api/logic.js';

const ADVANCE_MS = 280;
const BREAK_LINES = {
  milestone: { title: 'أنهيت ثلث الطريق', next: 'القسم التالي عن تحويل مشروعاتك إلى أثر يُقاس.' },
  impact: { title: 'بقي قسم واحد فقط', next: 'الأخير عن قيادتك للتنفيذ وفريقك.' },
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
  // إجابات لم يحفظها الخادم (فحص الجاهزية p-entry-4): تبقى حتى تُحفظ ولا تمحوها إجابة سؤال آخر، ولا تُعد في «أجبت»
  // ولا في المراجعة، فلا يُرسل القياس قبلها. تُعاد وحدها حين يعود الاتصال، وبعد كل حفظ ناجح، وعند بلوغ المراجعة
  const [pending, setPending] = useState({});
  const pendingRef = useRef({});
  pendingRef.current = pending;
  const seq = useRef({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  // التركيز ينتقل إلى نص السؤال الجديد (أو عنوان الفاصل والمراجعة)، فلا يضيع إلى أول الصفحة حين تُستبدل البطاقة
  const focusRef = useRef(null);
  // حد «لا ينطبق» في الممارسة يفرضه الخادم على المبدئي وحده (assessmentSubmit)، فتعرضه الشاشة قبل الإرسال لا بعده:
  // naBlock سؤال رُدّ فيه اختيار زائد، وreturnTo وجهة التقدم بعد تصحيح: المراجعة إن جاء منها، أو السؤال الذي أرسله إلى العبارة الأخرى
  const naLimit = !post;
  const [naBlock, setNaBlock] = useState(null);
  const [returnTo, setReturnTo] = useState(null);
  // مؤقت منقضٍ (بالدقائق) منذ بدء الإجابة في هذه الجلسة: يُعرض لا يُفرض
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (mode !== 'q') return undefined;
    const t0 = startedAt || Date.now();
    if (!startedAt) setStartedAt(t0);
    const tick = () => setElapsed(Math.floor((Date.now() - t0) / 60000));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [mode, startedAt]);

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
  }, [kind, attempt]);
  useEffect(() => { if (mode !== 'intro') focusRef.current?.focus(); }, [idx, mode]);

  const qs = data?.questions || [];
  const q = qs[idx];
  // المجاب ما حفظه الخادم: إجابة لم تُحفظ تُعرض مختارة ولا تُعد
  const saved = (x) => isComplete(x, answers, before) && !pending[x.id];
  const answered = qs.filter(saved).length;
  const resumed = answered > 0;

  // retry: إعادة إرسال ما لم يُحفظ، فلا تستدعي إعادة غيرها. ورد قديم لسؤال أُجيب بعده من جديد يُهمل (seq)
  const save = useCallback(async (question, k, b = null, retry = false) => {
    const n = (seq.current[question.id] || 0) + 1;
    seq.current[question.id] = n;
    setSaving((x) => x + 1);
    const res = await call('assessment.answer', { assessment_id: data.assessment.id, question_id: question.id, k, ...(question.retro ? { before: b } : {}) });
    setSaving((x) => x - 1);
    if (seq.current[question.id] !== n) return;
    if (!res.success) { setPending((p) => ({ ...p, [question.id]: { question, k, b, message: res.message } })); return; }
    setPending(({ [question.id]: _done, ...rest }) => rest);
    if (!retry) {
      for (const p of Object.values(pendingRef.current)) if (p.question.id !== question.id) save(p.question, p.k, p.b, true);
    }
  }, [data]);
  const retryAll = useCallback(() => {
    for (const p of Object.values(pendingRef.current)) save(p.question, p.k, p.b, true);
  }, [save]);
  useEffect(() => {
    window.addEventListener('online', retryAll);
    return () => window.removeEventListener('online', retryAll);
  }, [retryAll]);
  useEffect(() => { if (mode === 'review') retryAll(); }, [mode, retryAll]);

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
    setError('');
    if (k == null) return;
    // الإجابة الجديدة تحل محل ما لم يُحفظ لهذا السؤال وحده؛ وإن فشل حفظها عادت إلى القائمة
    setPending(({ [q.id]: _old, ...rest }) => rest);
    save(q, k, b);
    clearTimeout(timer.current);
    if (!isComplete(q, { [q.id]: k }, { [q.id]: b })) return;
    const at = idx;
    timer.current = setTimeout(() => {
      // عودة رقمية إلى سؤال آخر فقط؛ إن كانت إلى السؤال نفسه (تنقّل يدوي بعدها) فالتقدم الطبيعي (مراجعة الجولة أ)
      if (returnTo === 'review') setMode('review');
      else if (returnTo != null && returnTo !== at) { setReturnTo(null); setIdx(returnTo); }
      else { setReturnTo(null); goNext(at); }
    }, ADVANCE_MS);
  }, [q, idx, save, goNext, returnTo]);
  const choose = useCallback((k) => {
    // «لا ينطبق» زائد في القسم لا يُحفظ: يبقى السؤال وتحته القاعدة وطريق إلى العبارة الأخرى
    if (naLimit && isBehaviorNa(q, k) && behaviorNaCounts(qs, { ...answers, [q.id]: k })[q.dimension] > MAX_BEHAVIOR_NA) {
      clearTimeout(timer.current);
      return setNaBlock(q.id);
    }
    setNaBlock(null);
    record(k, q?.retro ? before[q.id] ?? null : null);
  }, [record, q, before, naLimit, qs, answers]);
  useEffect(() => { setNaBlock(null); if (mode === 'review') setReturnTo(null); }, [idx, mode]);
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
    if (res.success) { setBusy(false); return onSubmitted(res); }
    // تجاوز لم تره هذه الشاشة (من جلسة أخرى مثلًا): الإجابات من الخادم، ثم إلى أول عبارة سمّاها
    const at = res.code === 'too_many_na' ? qs.findIndex((x) => x.id === res.question_ids?.[0]) : -1;
    if (at >= 0) {
      const fresh = await call('assessment.get', { kind });
      if (fresh.success) { setAnswers(fresh.answers || {}); setBefore(fresh.before || {}); }
      setBusy(false); setIdx(at); setReturnTo('review'); return setMode('q');
    }
    // الخادم يرى سؤالًا بلا إجابة لا تراه الشاشة: الإجابات من الخادم، ثم إلى أول سؤال ناقص ورسالته فوقه
    if (res.code === 'incomplete') {
      const fresh = await call('assessment.get', { kind });
      if (fresh.success) {
        const a = fresh.answers || {};
        const bf = fresh.before || {};
        setAnswers(a); setBefore(bf); setPending({});
        const first = qs.findIndex((x) => !isComplete(x, a, bf));
        if (first >= 0) { setBusy(false); setError(res.message); setIdx(first); return setMode('q'); }
      }
    }
    setBusy(false);
    setError(res.message);
  };

  // فشل التحميل: إعادة المحاولة من الشاشة نفسها، فالتطبيق المثبت على الهاتف بلا زر تحديث (فحص الجاهزية p-entry-5)
  if (error && !data) {
    return (
      <div className="page narrow stack">
        <ErrorBox message={error} onRetry={() => { setError(''); setAttempt((n) => n + 1); }} />
        {onBack && <div className="row"><button className="btn ghost" onClick={onBack}>→ رحلتي</button></div>}
      </div>
    );
  }
  if (!data) return <div className="center-load"><div className="spinner" /></div>;

  const pct = 20 + Math.round((answered / qs.length) * 80);
  const SECTIONS = qs.some((x) => x.tier === 'transfer') ? [...DIMENSIONS, TRANSFER] : DIMENSIONS;
  const secIndex = q ? SECTIONS.findIndex((d) => d.key === secOf(q)) : SECTIONS.length - 1;
  const sectionState = (i) => {
    const inSec = qs.filter((x) => secOf(x) === SECTIONS[i].key);
    if (inSec.every(saved) && (mode === 'review' || i < secIndex)) return 'done';
    return i === secIndex && mode !== 'review' ? 'on' : '';
  };
  const sectionPct = (i) => {
    const inSec = qs.filter((x) => secOf(x) === SECTIONS[i].key);
    return inSec.length ? Math.round((inSec.filter(saved).length / inSec.length) * 100) : 0;
  };
  const unsaved = Object.values(pending);
  const unsavedAr = countAr(unsaved.length, 'إجابة واحدة', 'إجابتان', 'إجابات', 'إجابة');
  const header = (
    <>
      <div className="quiz-head">
        <span className="small muted">{post ? 'القياس البعدي' : 'القياس المبدئي'}</span>
        <span className="small quiz-count">أجبت <b>{answered}</b> من {qs.length}</span>
        {elapsed > 0 && <span className="small muted" aria-label="الوقت المنقضي في هذه الجلسة">· {elapsed} د</span>}
      </div>
      {/* مؤشر تقدم واحد: شريط الأقسام نفسه يمتلئ بنسبة ما أُجيب في كل قسم، فلا شريط ثانٍ فوقه */}
      <div className="sections" role="progressbar" aria-label="تقدمك في القياس" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={answered} aria-valuetext={`أجبت ${answered} من ${qs.length}`}>
        {SECTIONS.map((d, i) => <div key={d.key} className={sectionState(i)}><i style={{ width: `${sectionPct(i)}%` }} /><span>{d.short}</span></div>)}
      </div>
    </>
  );

  if (mode === 'intro') {
    return (
      <div className="page quiz">
        <div className="card stack" data-tour="assessment">
          <p className="eyebrow">{post ? 'القياس البعدي' : 'تحديد المستوى'}</p>
          <h1 style={{ fontSize: 24 }}>{resumed ? 'نكمل من حيث توقفت' : post ? 'لنرَ ما تغيّر فعلًا' : 'لنحدد نقطة انطلاقك'}</h1>
          <p>{data.assessment.intro || 'أسئلة قصيرة في الأطر الثلاثة. نتيجتها تحدد مسارك في كل إطار على حدة، فتبدأ من حيث أنت فعلًا.'}</p>
          {naLimit && qs.some((x) => x.tier === 'behavior' && x.options.some((o) => o.na)) && <p className="small">في عبارات الممارسة، {BEHAVIOR_NA_MESSAGE}، وأجب عن البقية بأقرب تكرار لما تفعله.</p>}
          {/* الزمن تقدير متوسط لا وعد: لا حد زمني، ويظهر الوقت المنقضي في الرأس أثناء الإجابة */}
          <div className="alert info small"><Ico name="clock" /> {data.assessment.est_minutes ? `نحو ${data.assessment.est_minutes} دقيقة في المتوسط بلا حد زمني، ` : ''}{countAr(qs.length, 'سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالًا')}. تُحفظ إجاباتك أولًا بأول.</div>
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
          <h2 ref={focusRef} tabIndex={-1}>{line.title}</h2>
          <p className="muted">أكملت قسم {secTitle(prev)}. {line.next}</p>
          <button className="btn gold" onClick={() => setMode('q')}>واصل إلى {secTitle(secOf(q))}</button>
        </div>
      </div>
    );
  }

  if (mode === 'review') {
    const missing = qs.filter((x) => !isComplete(x, answers, before));
    // تجاوز حد «لا ينطبق» يُعرض هنا بموضعه، لا رفضًا بعد «أرسل»
    const naOver = naLimit && !missing.length ? behaviorNaExcess(qs, answers) : [];
    const naSecs = [...new Set(naOver.map((id) => secTitle(secOf(qs.find((x) => x.id === id)))))];
    // ما لم يحفظه الخادم يُسمّى هنا ولا يُرسل القياس قبله: كانت المراجعة تقول «أنهيت» ويرد الخادم «بقي سؤال»
    const unsavedNow = !missing.length && unsaved.length > 0;
    return (
      <div className="page quiz">
        {header}
        <div className="card milestone-card stack">
          <div className="badge"><span>★</span></div>
          <h2 ref={focusRef} tabIndex={-1}>{missing.length ? `بقي ${missing.length} من الأسئلة` : unsavedNow ? `لم تُحفظ ${unsavedAr} بعد` : naOver.length ? 'راجع «لا ينطبق» قبل الإرسال' : 'أنهيت الأسئلة كلها'}</h2>
          <p className="muted">{missing.length
            ? 'أجب عنها لتظهر نتيجتك.'
            : unsavedNow ? 'تعذّر حفظها بسبب الاتصال، وتُعاد المحاولة حين يعود. يُفتح الإرسال بعد حفظها.'
            : naOver.length ? `${BEHAVIOR_NA_MESSAGE}، واخترته في أكثر من عبارة في قسم ${naSecs.join(' وقسم ')}. غيّر ما زاد إلى أقرب تكرار لما تفعله.`
            : post ? 'أرسل إجاباتك لترى ما تغيّر بين بداية رحلتك ونهايتها، ثم ادعُ مديرك ليقدّر التغير من موقعه.'
              : 'أرسل إجاباتك لتظهر نتيجتك المبدئية في الأطر الثلاثة فورًا، ثم يراجعها المستشار ويعتمد مسارك.'}</p>
          {error && <div className="alert err" role="alert">{error}</div>}
          {saving > 0 && <p className="saving">جارٍ حفظ آخر إجابة…</p>}
          <div className="row" style={{ justifyContent: 'center' }}>
            {missing.length
              ? <button className="btn gold" onClick={() => { setIdx(qs.indexOf(missing[0])); setMode('q'); }}>أكمل الناقص</button>
              : unsavedNow ? <button className="btn gold" disabled={saving > 0} onClick={retryAll}>{saving > 0 ? 'جارٍ الحفظ…' : 'أعد حفظها'}</button>
              : naOver.length ? <button className="btn gold" onClick={() => { setIdx(qs.findIndex((x) => x.id === naOver[0])); setReturnTo('review'); setMode('q'); }}>اذهب إلى العبارة</button>
              : <button className="btn gold" disabled={busy || saving > 0} onClick={submit}>{busy ? 'جارٍ الإرسال…' : post ? 'أرسل واعرض ما تغيّر' : 'أرسل واعرض نتيجتي'}</button>}
            <button className="btn ghost" onClick={() => { setIdx(qs.length - 1); setMode('q'); }}>راجع إجاباتي</button>
          </div>
        </div>
      </div>
    );
  }

  const likert = q.kind === 'likert';
  const retroOpen = q.retro && answers[q.id] != null && !isNa(q, answers[q.id]);
  // تنبيه الحد: اختيار زائد لم يُقبل، أو «لا ينطبق» محفوظ هنا وفي عبارة أخرى من القسم (قبل هذا الإصلاح أو من جلسة أخرى)
  const naNote = naLimit && q.tier === 'behavior' && (naBlock === q.id || (isBehaviorNa(q, answers[q.id]) && behaviorNaCounts(qs, answers)[q.dimension] > MAX_BEHAVIOR_NA));
  const naOther = naNote ? qs.findIndex((x) => x.id !== q.id && x.dimension === q.dimension && isBehaviorNa(x, answers[x.id])) : -1;
  return (
    <div className="page quiz">
      {header}
      <div className="card" key={q.id}>
        <div className="row small">
          <span className="chip dark">{secTitle(secOf(q))}</span>
          {q.tier !== 'transfer' && <span className="chip gold">{TIERS[q.tier] || ''}</span>}
        </div>
        <p className="q-text" ref={focusRef} tabIndex={-1}>{q.text}</p>
        {q.help && <p className="q-help">{q.help}</p>}
        {!q.help && <div style={{ height: 12 }} />}
        {q.tier === 'behavior' && qs[idx - 1]?.tier !== 'behavior' && <p className="q-help">لا إجابة صحيحة هنا: اختر ما تفعله فعلًا{naLimit ? `، و${BEHAVIOR_NA_RULE}` : ''}.</p>}
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
        {naNote && (
          <div className="alert info" role="alert" style={{ marginTop: 14 }}>
            {BEHAVIOR_NA_RULE}، وفي هذا القسم عبارة أخرى اخترته فيها. اختر هنا أقرب تكرار لما تفعله، أو غيّر إجابتك هناك.
            {naOther >= 0 && <> <button className="link" onClick={() => { setReturnTo((r) => (r === 'review' ? r : idx)); setIdx(naOther); }}>اذهب إليها</button></>}
          </div>
        )}
        {error && <div className="alert err" role="alert" style={{ marginTop: 14 }}>{error}</div>}
        {unsaved.length > 0 && (
          <div className="alert err" role="alert" style={{ marginTop: 14 }}>
            لم تُحفظ {unsavedAr} بعد. {unsaved[unsaved.length - 1].message}{' '}
            <button className="link" disabled={saving > 0} onClick={retryAll}>أعد المحاولة</button>
          </div>
        )}
        <div className="quiz-nav">
          <button className="link small" disabled={idx === 0} onClick={() => { setReturnTo((r) => (r === 'review' ? r : null)); setIdx(idx - 1); }}>السابق</button>
          <span className="saving">{saving > 0 ? 'جارٍ الحفظ…' : answered && !unsaved.length ? 'محفوظ ✓' : ''}</span>
          {isComplete(q, answers, before)
            ? <button className="link small" onClick={() => { setReturnTo((r) => (r === 'review' ? r : null)); goNext(idx); }}>التالي</button>
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
