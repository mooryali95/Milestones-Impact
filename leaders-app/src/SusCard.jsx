// ════════════════════════════════════════════════════════════════
// بطاقة استبيان سهولة الاستخدام SUS: تظهر بعد أسبوع من أول استعمال، مرة واحدة لكل شخص في دوره
// ════════════════════════════════════════════════════════════════
// الخادم يقرر الاستحقاق (sus.js). إن لم تُنشر الدالة أو لم يُطبق ترحيلها فالبطاقة لا تظهر ولا يفشل شيء.
import React, { useEffect, useState } from 'react';
import { SUS_ITEMS, SUS_SCALE, susValid } from '../../supabase/functions/leaders-api/sus.js';

// initial: حالة الاستبيان إن جاءت مع طلب اللوحة المجمّع (لوحة الخبير)، فلا يُطلب الخادم مرة ثانية
export default function SusCard({ call, stateAction = 'sus.state', submitAction = 'sus.submit', initial }) {
  const [due, setDue] = useState(!!(initial?.success && initial.due));
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState(() => SUS_ITEMS.map(() => 0));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (initial) return undefined;
    let alive = true;
    call(stateAction).then((r) => { if (alive && r?.success && r.due) setDue(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (done) return <div className="banner" role="status"><div className="grow">شكرًا لك. رأيك يدخل في قياس سهولة المنصة وتحسينها.</div></div>;
  if (!due) return null;

  const later = async () => { setDue(false); await call(submitAction, { snooze: true }); };
  const send = async () => {
    setBusy(true); setMsg(null);
    const r = await call(submitAction, { answers, comment });
    setBusy(false);
    if (r.success) setDone(true); else setMsg(r.message || 'تعذّر الإرسال، حاول مرة أخرى');
  };
  const left = answers.filter((x) => !x).length;

  return (
    <section className="card stack sus" aria-labelledby="sus-h">
      <div className="row between">
        <h2 id="sus-h" className="as-h3">رأيك في سهولة المنصة</h2>
        <span className="small muted">عشر عبارات · نحو دقيقتين</span>
      </div>
      {!open ? (
        <>
          <p className="small muted">مضى أسبوع على استعمالك. إجابتك لا تؤثر في تقييمك، وتُقرأ نتائجها مجمّعة.</p>
          <div className="row"><button className="btn sm" onClick={() => setOpen(true)}>ابدأ</button><button className="btn ghost sm" onClick={later}>لاحقًا</button></div>
        </>
      ) : (
        <>
          <p className="small muted sus-legend">1 = {SUS_SCALE[0]} · 5 = {SUS_SCALE[4]}</p>
          <ol className="sus-list">
            {SUS_ITEMS.map((text, i) => (
              <li key={text}>
                <p id={`sus-q${i}`}>{text}</p>
                <div className="sus-scale" role="radiogroup" aria-labelledby={`sus-q${i}`}>
                  {SUS_SCALE.map((label, k) => (
                    <button key={label} type="button" role="radio" aria-checked={answers[i] === k + 1} aria-label={label} title={label}
                      className={answers[i] === k + 1 ? 'on' : ''} onClick={() => setAnswers(answers.map((x, j) => (j === i ? k + 1 : x)))}>{k + 1}</button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <label className="field"><span>ملاحظة إن أردت (اختياري)</span>
            <textarea className="input" rows={2} maxLength={600} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          {msg && <div className="alert err" role="alert">{msg}</div>}
          <div className="row">
            <button className="btn sm" disabled={busy || !susValid(answers)} onClick={send}>{left ? `بقي ${left}` : 'أرسل'}</button>
            <button className="btn ghost sm" disabled={busy} onClick={later}>لاحقًا</button>
          </div>
        </>
      )}
    </section>
  );
}
