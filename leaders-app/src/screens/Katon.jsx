// ════════════════════════════════════════════════════════════════
// «كاتون»: موضوع بست جمل، ولكل جملة ثمانية خيارات، والمفتاح بعد إتمام الموضوع
// ════════════════════════════════════════════════════════════════
// اليقين يُكافأ إن صدق ويُعاقَب إن خاب، فيتعلّم المشارك أن يقول «تحتاج بحث» حين لا يعرف.
// بعد الإجابة عن جمل الموضوع كلها يُكشف المفتاح والشرح والنقاط، وتُقفل الإجابات.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { KATON_QUESTION_AR as Q_AR } from '../../../supabase/functions/leaders-api/katon.js';

const KEY_AR = { true: 'صحيحة', false: 'خاطئة', opinion: 'رأي بلا مفتاح' };
const FAM_AR = { certainty: 'دقة التحليل', curiosity: 'الفضول البحثي', initiative: 'المبادرة', openness: 'الانفتاح الفكري' };

function Sentence({ s, n, options, revealed, onAnswer, busy }) {
  const [note, setNote] = useState(s.mine?.note || '');
  const pick = s.mine?.choice;
  const opt = (k) => options.find((o) => o.key === k);
  return (
    <li className={`kt-sent${pick ? ' done' : ''}`}>
      <div className="kt-head">
        <span className="kt-num">{n}</span>
        <span className="chip">{Q_AR[s.question]}</span>
        {revealed && <span className={`chip ${s.key === 'opinion' ? '' : 'gold'}`}>المفتاح: {KEY_AR[s.key]}</span>}
        {revealed && s.points != null && <b className={`kt-pts ${s.points < 0 ? 'neg' : ''}`}>{s.points > 0 ? '+' : ''}{s.points}</b>}
      </div>
      <p className="kt-text">{s.text_ar}</p>
      <div className="kt-opts" role="radiogroup" aria-label={`خيارك في الجملة ${n}`}>
        {options.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={pick === o.key} disabled={revealed || busy}
            className={`kt-opt${pick === o.key ? ' on' : ''}`} onClick={() => onAnswer(s.id, o.key, note)} title={`${o.ar} · ${o.key === 'true' || o.key === 'false' ? `±${o.points}` : `+${o.points}`}`}>
            <i aria-hidden="true">{o.glyph}</i><span>{o.ar}</span>
          </button>
        ))}
      </div>
      {!revealed && pick && (pick === 'question' || pick === 'research' || pick === 'idea' || pick === 'can') && (
        <label className="field kt-note"><span>{opt(pick).ar}: اكتبها ليراها خبيرك وفريقك</span>
          <textarea className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (s.mine?.note || '') && onAnswer(s.id, pick, note)} /></label>
      )}
      {revealed && s.explain_ar && <p className="small muted">{s.explain_ar}</p>}
      {Object.keys(s.tasks || {}).length > 0 && (
        <details className="kt-tasks"><summary className="small muted">مهام الفرق في هذه الجملة</summary>
          <ul className="small">{Object.entries(s.tasks).map(([k, t]) => <li key={k}><b>{({ support: 'الدعم', lead: 'القيادة', guide: 'التوجيه', eval: 'التقييم' })[k]}:</b> {t}</li>)}</ul></details>
      )}
    </li>
  );
}

export default function Katon({ onBack }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('katon.mine').then(setD); }, []);
  if (!d) return <div className="page"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  if (!d.success) return <div className="page"><div className="alert err">{d.message}</div></div>;

  const answer = async (sentence_id, choice, note) => {
    setBusy(true); setErr('');
    const r = await call('katon.answer', { sentence_id, choice, note });
    setBusy(false);
    if (r.success) setD(r); else setErr(r.message);
  };
  const t = d.topics.find((x) => x.id === open);
  const sm = d.summary;

  return (
    <div className="page wide stack">
      <div className="row between">
        <div><p className="eyebrow">نموذج «كاتون»</p><h1>دقة التحليل</h1></div>
        <button className="btn ghost sm" onClick={t ? () => setOpen(null) : onBack}>{t ? 'كل المواضيع' : 'رحلتي'}</button>
      </div>

      {!t && (
        <>
          <section className="card stack">
            <p className="muted">لكل جملة اختر ما يصف موقفك منها بصدق. اليقين (صحيحة 100% أو خاطئة 100%) يكسب نقاطه إن أصاب ويخسرها إن أخطأ، فإن لم تكن متأكدًا فاختر «تحتاج بحث» أو «لدي سؤال». يُكشف المفتاح حين تتم جمل الموضوع.</p>
            <div className="kt-legend">{d.options.map((o) => <span key={o.key}><i>{o.glyph}</i>{o.ar} <small className="muted">{o.key === 'true' || o.key === 'false' ? `±${o.points}` : `+${o.points}`}</small></span>)}</div>
          </section>
          {sm.answered > 0 && (
            <section className="card kt-sum">
              <div><b className="kt-big">{sm.total > 0 ? '+' : ''}{sm.total}</b><small className="muted">نقاطك في المواضيع المكشوفة</small></div>
              <div><b className="kt-big">{sm.accuracy != null ? `${sm.accuracy}٪` : '—'}</b><small className="muted">دقة اليقين{sm.sure ? ` (${sm.sure - sm.sure_wrong} من ${sm.sure})` : ''}</small></div>
              {Object.entries(sm.families).map(([k, v]) => <div key={k}><b>{v}٪</b><small className="muted">{FAM_AR[k]}</small></div>)}
            </section>
          )}
          {d.topics.length ? (
            <ul className="kt-topics">{d.topics.map((x) => (
              <li key={x.id}><button className="card kt-topic" onClick={() => { setOpen(x.id); window.scrollTo({ top: 0 }); }}>
                <b>{x.title_ar}</b>
                <small className="muted">{x.revealed ? 'كُشف المفتاح' : `${x.answered} من ${x.total}`}</small>
                <div className="ms-bar"><i style={{ width: `${x.total ? (x.answered / x.total) * 100 : 0}%` }} /></div>
              </button></li>
            ))}</ul>
          ) : <p className="muted">لم تُنشر مواضيع بعد.</p>}
        </>
      )}

      {t && (
        <section className="stack">
          <div className="card stack">
            <h2>{t.title_ar}</h2>
            {(t.layers?.competencies?.length > 0 || t.layers?.principles?.length > 0) && (
              <div className="kt-layers">
                {t.layers.competencies?.length > 0 && <span><small className="muted">الجدارات</small> {t.layers.competencies.join('، ')}</span>}
                {t.layers.principles?.length > 0 && <span><small className="muted">المبدأ</small> {t.layers.principles.join('، ')}</span>}
              </div>
            )}
            {t.revealed ? <div className="banner"><span className="ico">✓</span><div className="grow">أتممت الموضوع: هذا المفتاح ونقاط كل جملة.</div></div>
              : <p className="small muted">أجبت عن {t.answered} من {t.total}. يُكشف المفتاح بعد آخر جملة، ولا تُعدَّل الإجابات بعده.</p>}
          </div>
          {err && <div className="alert err">{err}</div>}
          <ol className="kt-list">{t.sentences.map((s, i) => <Sentence key={s.id} s={s} n={i + 1} options={d.options} revealed={t.revealed} onAnswer={answer} busy={busy} />)}</ol>
        </section>
      )}
    </div>
  );
}
