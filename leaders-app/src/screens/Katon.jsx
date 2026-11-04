// ════════════════════════════════════════════════════════════════
// «كاتون»: موضوع بست جمل، حكم بثقة مدرَّجة على كل جملة، ووسوم موقف، والمفتاح بعد إتمام الموضوع
// ════════════════════════════════════════════════════════════════
// الإفصاح الصادق عن الثقة هو ما يكسب: «متيقن» يكسب أكثر إن أصاب ويخسر أكثر إن أخطأ، و«أرجّح» لا يخسر.
// بعد الإجابة عن جمل الموضوع كلها يُكشف المفتاح والشرح والنقاط، وتُقفل الإجابات.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import KatonAnswer from '../KatonAnswer.jsx';
import { KATON_CONFIDENCE, KATON_FAMILY_AR, KATON_KEY_AR, KATON_QUESTION_AR as Q_AR, KATON_STANCES } from '../../../supabase/functions/leaders-api/katon.js';
import PeerRequests from './PeerRequests.jsx';

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

function Sentence({ s, n, points, revealed, onAnswer, onAsk, busy }) {
  const mine = s.mine;
  return (
    <li className={`kt-sent${mine ? ' done' : ''}`}>
      <div className="kt-head">
        <span className="kt-num">{n}</span>
        <span className="chip">{Q_AR[s.question]}</span>
        {revealed && <span className={`chip ${s.key === 'opinion' ? '' : 'gold'}`}>المفتاح: {KEY_AR[s.key]}</span>}
        {revealed && s.points != null && <b className={`kt-pts ${s.points < 0 ? 'neg' : ''}`}>{sign(s.points)}</b>}
      </div>
      <p className="kt-text">{s.text_ar}</p>
      {revealed ? (
        <p className="small muted">
          {mine?.verdict ? `حكمك: ${KEY_AR[mine.verdict]} (${KATON_CONFIDENCE[mine.confidence].ar})` : 'لم تحكم على الجملة'}
          {mine?.stances?.length ? ` · موقفك: ${mine.stances.map((k) => KATON_STANCES.find((x) => x.key === k)?.ar).join('، ')}` : ''}
          {s.key === 'opinion' ? ' · جملة رأي: لا تُسجَّل عليها نقاط' : ''}
        </p>
      ) : <KatonAnswer mine={mine} points={points} disabled={busy} onAnswer={(a) => onAnswer(s.id, a)} onAsk={(text) => onAsk(s, text)} />}
      {revealed && s.explain_ar && <p className="small muted">{s.explain_ar}</p>}
      {Object.keys(s.tasks || {}).length > 0 && (
        <details className="kt-tasks"><summary className="small muted">مهام الفرق في هذه الجملة</summary>
          <ul className="small">{Object.entries(s.tasks).map(([k, t]) => <li key={k}><b>{({ support: 'الدعم', lead: 'القيادة', guide: 'التوجيه', eval: 'التقييم' })[k]}:</b> {t}</li>)}</ul></details>
      )}
    </li>
  );
}
const KEY_AR = KATON_KEY_AR;

export default function Katon({ onBack }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(null);   // ملاحظة على جملة تُرفع طلب توجيه (المرحلة 8)
  useEffect(() => { call('katon.mine').then(setD); }, []);
  if (!d) return <div className="page"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  if (!d.success) return <div className="page"><div className="alert err">{d.message}</div></div>;

  const answer = async (sentence_id, a) => {
    setBusy(true); setErr('');
    const r = await call('katon.answer', { sentence_id, ...a });
    setBusy(false);
    if (r.success) setD(r); else setErr(r.message);
  };
  const t = d.topics.find((x) => x.id === open);
  const sm = d.summary;
  const pts = d.points;

  return (
    <div className="page wide stack">
      <div className="row between">
        <div><p className="eyebrow">نموذج «كاتون»</p><h1>دقة التحليل والمعايرة</h1></div>
        <button className="btn ghost sm" onClick={t ? () => setOpen(null) : onBack}>{t ? 'كل المواضيع' : 'رحلتي'}</button>
      </div>

      {!t && (
        <>
          <section className="card stack">
            <p className="muted">احكم على كل جملة (صحيحة أو خاطئة) بدرجة ثقتك الحقيقية: «أرجّح» لا يخسر، و«واثق» و«متيقن» يكسبان أكثر إن أصبت ويخسران أكثر إن أخطأت، فالصدق عن ثقتك هو ما يربح على المدى. موقفك من الجملة (سؤال، بحث، فكرة…) يُرى ولا يُحسب بالنقاط. يُكشف المفتاح حين تتم جمل الموضوع.</p>
            <div className="kt-legend">
              {[1, 2, 3].map((c) => <span key={c}><b>{KATON_CONFIDENCE[c].ar}</b> <small className="muted">{KATON_CONFIDENCE[c].band}: {sign(pts.right[c])} / {sign(pts.wrong[c])}</small></span>)}
            </div>
          </section>
          {sm.judged > 0 && (
            <section className="card kt-sum">
              <div><b className="kt-big">{sign(sm.total)}</b><small className="muted">نقاطك في المواضيع المكشوفة</small></div>
              <div><b className="kt-big">{sm.accuracy != null ? `${sm.accuracy}٪` : '—'}</b><small className="muted">الدقة ({sm.judged - sm.wrong} من {sm.judged} حكمًا)</small></div>
              <div><b className="kt-big">{sm.calibration != null ? `${sm.calibration}٪` : '—'}</b><small className="muted">المعايرة (1 − Brier)</small></div>
              <div><b className="kt-big">{sm.overconfidence != null ? sign(sm.overconfidence) : '—'}</b><small className="muted">{sm.overconfidence > 5 ? 'ثقتك أعلى من دقتك' : sm.overconfidence < -5 ? 'ثقتك أقل من دقتك' : 'ثقتك تطابق دقتك'}</small></div>
              <div><b className="kt-big">{sm.abstention != null ? `${sm.abstention}٪` : '—'}</b><small className="muted">امتناع عن الحكم</small></div>
              {Object.entries(sm.stances.families).map(([k, v]) => <div key={k}><b>{v}٪</b><small className="muted">{KATON_FAMILY_AR[k]}</small></div>)}
            </section>
          )}
          {sm.judged > 0 && (
            <section className="card stack">
              <h3>منحنى معايرتك</h3>
              <ul className="ca-list">{[1, 2, 3].map((c) => (
                <li key={c}><span>{KATON_CONFIDENCE[c].ar} <small className="muted">(المتوقع {sm.curve[c].expected}٪)</small></span>
                  <small className="muted">{sm.curve[c].n ? `أصبت ${sm.curve[c].accuracy}٪ من ${sm.curve[c].n}` : 'لم تستعملها بعد'}</small></li>
              ))}</ul>
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
          {ask && <PeerRequests preset={ask} onDone={() => setAsk(null)} />}
          <ol className="kt-list">{t.sentences.map((s, i) => <Sentence key={s.id} s={s} n={i + 1} points={pts} revealed={t.revealed} onAnswer={answer} onAsk={(sent, text) => { setAsk({ source: 'sentence', ref_id: sent.id, text, label: `جملة «${Q_AR[sent.question]}» في «${t.title_ar}»` }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} busy={busy} />)}</ol>
        </section>
      )}
    </div>
  );
}
