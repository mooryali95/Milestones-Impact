// ── حلقة الالتزام بعد الورشة (تصور المرحلة 3 §5.2): السؤال بعد الحضور، والمراجعة بعد أسبوعين، والنقرة إلى الوثيقة ──
// المصدر الواحد على الخادم (commitments.ts). لا يحبس مرحلة ولا يدخل التقدم، فالبطاقة تظهر وحدها حين يلزمها شيء
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { POINTS } from '../../../supabase/functions/leaders-api/logic.js';
import { COMMITMENT_OUTCOMES, COMMITMENT_REVIEW_DAYS } from '../../../supabase/functions/leaders-api/commitments.js';

const inTwoWeeks = () => new Date(Date.now() + COMMITMENT_REVIEW_DAYS * 864e5).toISOString().slice(0, 10);

// بعد تسجيل الحضور: الفعل والموعد. يختفي إن أُطفئ من الإعدادات أو كُتب من قبل لهذه الجلسة
export function CommitmentAsk({ sessionId }) {
  const [state, setState] = useState(null);
  const [action, setAction] = useState('');
  const [due, setDue] = useState(inTwoWeeks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  useEffect(() => { if (sessionId) call('commitment.mine').then((r) => setState(r.success ? r : null)); }, [sessionId]);
  if (!sessionId || !state?.enabled) return null;
  const prev = state.items.find((x) => x.session_id === sessionId);
  if (saved || prev) return <p className="small muted" role="status">التزامك: «{(saved || prev).action}». سنسألك عنه بعد أسبوعين.</p>;
  const submit = async () => {
    setBusy(true); setError('');
    const r = await call('commitment.save', { session_id: sessionId, action, due_on: due });
    setBusy(false);
    if (!r.success) return setError(r.message);
    setSaved(r.item || { action });
  };
  return (
    <div className="commit-ask">
      <label className="reflect">
        <span className="reflect-q"><b>{state.question}</b></span>
        <input className="input" value={action} maxLength={500} onChange={(e) => setAction(e.target.value)} placeholder="الفعل: ماذا ستفعل؟" />
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="الموعد" />
        <small className="muted">يمنحك {POINTS.commitment} نقاط الآن و{POINTS.commitmentReview} عند مراجعته بأي نتيجة.</small>
      </label>
      {error && <p className="small bad" role="alert">{error}</p>}
      <button type="button" className="btn" disabled={busy || !action.trim()} onClick={submit}>احفظ التزامي</button>
    </div>
  );
}

// في الرحلة: ما حان مراجعته، وما طُبّق ولم يُضف إلى الوثيقة بعد
export function CommitmentCard() {
  const [state, setState] = useState(null);
  const load = () => call('commitment.mine').then((r) => setState(r.success ? r : null));
  useEffect(() => { load(); }, []);
  if (!state?.enabled) return null;
  const due = state.items.filter((x) => x.review_open && Date.now() - Date.parse(x.created_at) >= COMMITMENT_REVIEW_DAYS * 864e5);
  const toAdd = state.items.filter((x) => !x.review_open && ['yes', 'partial'].includes(x.outcome) && !x.added_at);
  if (!due.length && !toAdd.length) return null;
  return (
    <section className="card commit-card">
      <p className="eyebrow">التزاماتك بعد الورش</p>
      {due.map((x) => <CommitmentReview key={x.id} item={x} texts={state} onDone={load} />)}
      {toAdd.map((x) => <CommitmentAdd key={x.id} item={x} onDone={load} />)}
    </section>
  );
}

function CommitmentReview({ item, texts, onDone }) {
  const [outcome, setOutcome] = useState('');
  const [learned, setLearned] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError('');
    const r = await call('commitment.review', { id: item.id, outcome, learned });
    setBusy(false);
    if (!r.success) return setError(r.message);
    onDone();
  };
  return (
    <div className="commit-review">
      <p>«{item.action}»{item.session ? <span className="small muted"> · {item.session}</span> : null}</p>
      <p><b>{texts.review_question}</b></p>
      <div className="quiz-opts">
        {COMMITMENT_OUTCOMES.map((o) => (
          <button key={o} type="button" className={`quiz-opt${outcome === o ? ' on' : ''}`} onClick={() => setOutcome(o)}>{texts.outcomes[o]}</button>
        ))}
      </div>
      <input className="input" value={learned} maxLength={1000} onChange={(e) => setLearned(e.target.value)} placeholder={texts.learned} />
      {error && <p className="small bad" role="alert">{error}</p>}
      <button type="button" className="btn" disabled={busy || !outcome} onClick={submit}>سجّل</button>
    </div>
  );
}

function CommitmentAdd({ item, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true); setError('');
    const r = await call('commitment.to-initiative', { id: item.id });
    setBusy(false);
    if (!r.success) return setError(r.message);
    onDone();
  };
  return (
    <div className="commit-add">
      <p>طبّقت «{item.action}». أضفه خطوةً في جدول أنشطة مبادرتك؟</p>
      {error && <p className="small bad" role="alert">{error}</p>}
      <button type="button" className="btn ghost" disabled={busy} onClick={add}>أضفه إلى وثيقة مبادرتي</button>
    </div>
  );
}
