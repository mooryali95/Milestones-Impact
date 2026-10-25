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
      <p className="la-muted small">الصعوبة متوسط الدرجة من أعلاها. التمييز ارتباط السؤال ببقية أسئلة إطاره، والمقبول 0.2 فأعلى. الثبات ألفا كرونباخ، والجيد 0.7 فأعلى.</p>
    </section>
  );
}
