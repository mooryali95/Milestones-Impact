// ════════════════════════════════════════════════════════════════
// جودة أسئلة القياس: من الإجابات الحقيقية (admin.item-analysis)
// ════════════════════════════════════════════════════════════════
// الصعوبة والتمييز لكل سؤال، والثبات لكل إطار، وأعلام لما يحتاج مراجعة.
import React, { useEffect, useState } from 'react';
import { DIM_EN, L } from '../leaders.js';
import { Spinner } from '../ui.jsx';

const FLAG = {
  easy: ['سهل جدًا', 'يجيبه الجميع، فلا يفرّق بين المستويات'],
  hard: ['صعب جدًا', 'يخطئه الجميع تقريبًا: راجع الصياغة أو مفتاح الإجابة'],
  low_discrimination: ['تمييز ضعيف', 'لا يسير مع بقية أسئلة إطاره'],
  dead_option: ['خيار مهمل', 'خيار خاطئ لا يختاره أحد، فلا يعمل مشتِّتًا'],
};
const alphaNote = (a) => (a == null ? ['لم يُحسب', ''] : a >= 0.7 ? ['جيد', 'ok'] : a >= 0.6 ? ['مقبول', 'warn'] : ['ضعيف', 'bad']);
const pct = (x) => (x == null ? '·' : `${Math.round(x * 100)}%`);

// أدلة القياس: خطأ القياس ودقة التصنيف، ومخالفة المستشار، وتوزيع المسارات، وعدالة الفقرات.
// كلها استشارية، وما دون عتبته يُعرض «مؤشرًا أوليًا» أو لا يُعرض
function Evidence({ e }) {
  const early = !e.gates.first.met;
  const o = e.overrides, t = e.tracks, f = e.fairness;
  return (
    <div className="iq-sep">
      <h4>أدلة القياس {early && <span className="la-chip warn" title={`تستقر الأرقام من ${e.gates.first.need} قياسًا`}>مؤشر أولي</span>}</h4>
      <table className="la-table" aria-label="خطأ القياس ودقة التصنيف">
        <thead><tr><th>الإطار</th><th>الثبات</th><th>خطأ القياس (نقطة)</th><th>الهامش الحدّي: المضبوط / المقترح</th><th>دقة التصنيف المتوقعة</th></tr></thead>
        <tbody>{e.dimensions.map((x) => (
          <tr key={x.dimension}><td>{DIM_EN[x.dimension] || x.dimension}</td><td>{x.alpha ?? '·'}</td><td>{x.sem ?? '·'}</td>
            <td>{x.borderline_now} / {x.borderline_suggested ?? '·'}</td>
            <td>{x.accuracy == null ? '·' : <>{pct(x.accuracy)} {x.below_target && <span className="la-chip warn" title={`دون الهدف ${pct(e.accuracy_target)}: يُنظر في إطالة جانبي المعرفة والمواقف`}>دون الهدف</span>}</>}</td></tr>
        ))}</tbody>
      </table>
      <p className="la-muted small">
        دقة المسار كله (الأطر الثلاثة معًا): <b>{e.joint_accuracy == null ? 'لم تُحسب' : pct(e.joint_accuracy)}</b>.
        {' '}اعتماد المستشار: {o.n ? <>خالف المستوى الآلي في {o.overridden} من {o.n} ({pct(o.rate)})، رفع {o.up} وخفض {o.down}</> : 'لا تسكينات معتمدة بعد'}.
        {' '}المسارات: {t.total ? <>{t.used} مستعملة من {t.cells}، وأكثر ست خلايا تضم {pct(t.top6_share)} من {t.total} مشاركًا</> : 'لا مسارات معتمدة بعد'}.
      </p>
      <p className="la-muted small">
        عدالة الفقرات ({f?.split_ar}): {!f ? 'لم تُحسب' : !f.ready ? `تُحسب من ${f.need} قياسًا (الآن ${f.n_ref + f.n_focal})` : f.items.length ? `فقرات تُراجع: ${f.items.map((x) => `${x.code} (${x.cls}، Δ ${x.delta})`).join('، ')}` : 'لا فقرة تميل لفئة'}.
        {' '}تكافؤ الصيغتين يُحكم عليه من {e.gates.forms.need} قياسًا لكل صيغة. الأرقام استشارية ولا تدخل أي درجة.
      </p>
    </div>
  );
}

export default function ItemQuality({ instrumentId }) {
  const [d, setD] = useState(null);
  const [only, setOnly] = useState(true);
  useEffect(() => {
    let live = true;
    setD(null);
    L('admin.item-analysis', { instrument_id: instrumentId }).then((r) => live && setD(r));
    return () => { live = false; };
  }, [instrumentId]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err" role="alert">{d.message}</div>;
  const items = only ? d.items.filter((x) => x.flags.length) : d.items;
  return (
    <section className="la-card iq">
      <div className="la-row between">
        <h3>جودة الأسئلة من {d.respondents} قياسًا مرسلًا</h3>
        <label className="la-row"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> ما يحتاج مراجعة فقط</label>
      </div>
      {d.respondents < 30 && <div className="la-note">العدد أقل من 30، فالأرقام مؤشر أولي. تستقر بعد 30 إلى 50 مشاركًا في كل إطار.</div>}
      <div className="iq-dims">
        {d.dimensions.map((x) => {
          const [l, c] = alphaNote(x.alpha);
          return <div key={x.dimension} className="stat-card"><div className="stat-label">ثبات {DIM_EN[x.dimension] || x.dimension}</div><div className="stat-value">{x.alpha ?? '·'}</div><div className={`stat-sub iq-${c}`}>{l} · {x.complete} أجابوا كل أسئلته</div></div>;
        })}
      </div>
      {d.correlations?.length > 0 && (
        <div className="iq-sep">
          <h4>الفصل بين الأطر</h4>
          <table className="la-table" aria-label="الارتباط بين الأطر">
            <thead><tr><th>الإطاران</th><th>المشاركون</th><th>الارتباط</th><th>بعد تصحيح الثبات</th><th>الحكم</th></tr></thead>
            <tbody>{d.correlations.map((c) => (
              <tr key={c.a + c.b}><td>{DIM_EN[c.a] || c.a} و {DIM_EN[c.b] || c.b}</td><td>{c.n}</td><td>{c.r ?? '·'}</td><td>{c.corrected ?? '·'}</td>
                <td>{c.overlap ? <span className="la-chip warn" title="الإطاران يقيسان قدرة متقاربة، فلا تفرّق المسارات بينهما فعلًا">تداخل</span> : c.r == null ? '·' : 'منفصلان'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {d.evidence && <Evidence e={d.evidence} />}
      {items.length ? (
        <table className="la-table" tabIndex={0} aria-label="جودة الأسئلة">
          <thead><tr><th>السؤال</th><th>المجيبون</th><th>الصعوبة</th><th>التمييز</th><th>ما يُراجع</th></tr></thead>
          <tbody>{items.map((x) => (
            <tr key={x.id}>
              <td><small className="la-muted">{x.code || DIM_EN[x.dimension]}</small><br />{x.text}
                <div className="iq-opts">{x.options.map((o) => <span key={o.k} title={o.label}><i style={{ width: `${o.share * 100}%` }} />{o.score > 0 ? '✓ ' : ''}{pct(o.share)}</span>)}</div></td>
              <td>{x.n}</td><td>{pct(x.p)}</td><td>{x.discrimination ?? '·'}</td>
              <td>{x.flags.map((f) => <span key={f} className="la-chip warn" title={FLAG[f][1]}>{FLAG[f][0]}</span>)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="la-muted">{only ? 'لا أسئلة تحتاج مراجعة الآن.' : 'لا إجابات بعد.'}</p>}
      <p className="la-muted small">الصعوبة متوسط الدرجة من أعلاها. التمييز ارتباط السؤال ببقية أسئلة إطاره، والمقبول 0.2 فأعلى. الثبات ألفا كرونباخ، والجيد 0.7 فأعلى. والتداخل بين إطارين ارتباط 0.7 فأعلى، أو 0.85 فأعلى بعد تصحيح الثبات.</p>
    </section>
  );
}
