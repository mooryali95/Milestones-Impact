// ════════════════════════════════════════════════════════════════
// تقرير 360 للتطوير: مكوّن عرض واحد للمشارك (بعد التسليم) والمستشار (قبل الجلسة) والإدارة (للدعم الفني)
// ════════════════════════════════════════════════════════════════
// (تصور 2026-11-11، اعتمده المالك) البيانات من feedbackReport في feedback360.js وحدها، عبر f360.report
// أو xp.f360-report أو admin.f360-report، فالأرقام والإخفاء محسوبان هناك. هنا العرض وحده: الذات مقابل كل
// مجموعة بلغت الحد، والقوة الخفية والنقطة العمياء، والأعلى والأدنى، والملاحظات حرفية بلا نسبة. لا ترتيب بين المشاركين.
// النافذة (Report360Panel) للمستشار والإدارة؛ سلوكها (التركيز وحبسه وEsc) من غلاف كل تطبيق كما في AnswersPanel.
import React from 'react';
import { createPortal } from 'react-dom';
import { DIM_AR, FEEDBACK_OPEN_AR } from '../../supabase/functions/leaders-api/labels.js';
import { SPREAD_AR } from '../../supabase/functions/leaders-api/feedback360.js';
import './answers-panel.css';
import './report360.css';

const WAVE_AR = { t1: 'الموجة الأولى', t2: 'الموجة الثانية' };
const fmt = (v) => (v == null ? '—' : Number(v).toFixed(1));

function Cell({ c }) {
  return c ? <td>{fmt(c.avg)}</td> : <td className="r3-hid" title="دون حد الإخفاء">—</td>;
}

function Lines({ title, hint, list, mark }) {
  if (!list?.length) return null;
  return (
    <section className="r3-sec" aria-label={title}>
      <h3>{mark} {title}</h3>
      <p className="r3-muted">{hint}</p>
      <ul>
        {list.map((x) => (
          <li key={x.id}><span>{x.text}</span> <b className="r3-num">{x.self == null ? '' : `أنت ${fmt(x.self)} · `}الآخرون {fmt(x.others)}</b>{x.spread ? <small className="r3-muted"> · {SPREAD_AR[x.spread.key]}</small> : null}</li>
        ))}
      </ul>
    </section>
  );
}

export default function Report360({ data, audience = 'participant' }) {
  const r = data?.report;
  if (!r) return null;
  const head = (
    <p className="r3-muted">{WAVE_AR[data.cycle?.wave] || ''}{data.participant && audience !== 'participant' ? ` · ${data.participant}` : ''} · دُعي {r.response.invited} وأرسل {r.response.submitted}</p>
  );
  if (!r.releasable) {
    return (
      <div className="r3">
        {head}
        <p className="r3-note" role="status">لم يصل عدد كافٍ من التقديرات من غير المدير المباشر لإصدار تقرير يحفظ إخفاء المقيّمين (ينقص {r.need}). لا تقرير لهذه الموجة.</p>
      </div>
    );
  }
  const cols = r.columns;
  return (
    <div className="r3">
      {head}
      <p className="r3-muted">{cols.filter((c) => c.key !== 'all').map((c) => `${c.label_ar} ${c.n}`).join(' · ')}{cols.some((c) => c.merged) ? ` · ضُمّ «${cols.flatMap((c) => c.merged || []).join('، ')}» لأنه دون حد الإخفاء` : ''}</p>
      <section className="r3-sec" aria-label="الأطر الثلاثة">
        <h3>الأطر الثلاثة</h3>
        <div className="r3-scroll">
          <table className="r3-table">
            <thead><tr><th scope="col">الإطار</th><th scope="col">{audience === 'participant' ? 'أنت' : 'الذات'}</th>{cols.map((c) => <th scope="col" key={c.key}>{c.label_ar}</th>)}</tr></thead>
            <tbody>
              {r.dims.map((d) => (
                <tr key={d.dimension}>
                  <th scope="row">{DIM_AR[d.dimension] || d.dimension}{d.prev ? <small className="r3-muted"> (الأولى: {fmt(d.prev.self)} · {fmt(d.prev.all)})</small> : null}</th>
                  <td>{fmt(d.self)}</td>
                  {cols.map((c) => <Cell key={c.key} c={d.cells[c.key]} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="r3-muted small">1 = {r.scale[0]} … 5 = {r.scale[4]}. لا ترتيب بينك وبين غيرك، والفرق بين المجموعات معلومة لا خطأ: كل مجموعة ترى جانبًا من عملك.</p>
      </section>
      <Lines mark="◆" title="قوة قد لا تراها" hint={`الآخرون أعلى من تقديرك بـ${r.gap_points} فأكثر`} list={r.strengths} />
      <Lines mark="▲" title="نقطة عمياء محتملة" hint={`تقديرك أعلى من الآخرين بـ${r.gap_points} فأكثر`} list={r.blind} />
      <div className="r3-two">
        <Lines mark="↑" title="الأعلى عند الآخرين" hint="أعلى ثلاث عبارات عند كل المقيّمين" list={r.top} />
        <Lines mark="↓" title="الأدنى عند الآخرين" hint="أدنى ثلاث عبارات عند كل المقيّمين" list={r.bottom} />
      </div>
      <details className="r3-sec">
        <summary>كل العبارات</summary>
        <div className="r3-scroll">
          <table className="r3-table">
            <thead><tr><th scope="col">العبارة</th><th scope="col">{audience === 'participant' ? 'أنت' : 'الذات'}</th>{cols.map((c) => <th scope="col" key={c.key}>{c.label_ar}</th>)}<th scope="col">لا أستطيع الحكم</th></tr></thead>
            <tbody>
              {r.items.map((it) => (
                <tr key={it.id}><th scope="row">{it.text}</th><td>{fmt(it.self)}</td>{cols.map((c) => <Cell key={c.key} c={it.cells[c.key]} />)}<td>{it.na || ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <section className="r3-sec" aria-label="ما قالوه">
        <h3>ما قالوه</h3>
        <p className="r3-muted">حرفيًا، بترتيب ثابت لا يتبع الإرسال، وبلا نسبة إلى أحد.</p>
        {Object.entries(FEEDBACK_OPEN_AR).map(([k, q]) => (
          <div key={k}>
            <h4>{q}</h4>
            {r.comments[k]?.length ? <ul className="r3-quotes">{r.comments[k].map((t, i) => <li key={i}>«{t}»</li>)}</ul> : <p className="r3-muted">لا ملاحظات.</p>}
          </div>
        ))}
      </section>
      <p className="r3-muted small">للتطوير وحده: لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عن الفرد.</p>
    </div>
  );
}

// نافذة جانبية للمستشار والإدارة: الرأس والإغلاق والجسم، وأزرار الغلاف (التسليم أو الحجب) في children
export function Report360Panel({ boxRef, title, data, error, onClose, children }) {
  return createPortal(
    <div className="ap-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={boxRef} className="ap" role="dialog" aria-modal="true" aria-labelledby="r3-title" tabIndex={-1}>
        <header className="ap-head">
          <h2 id="r3-title">{title}</h2>
          <button type="button" className="ap-x" aria-label="إغلاق" onClick={onClose}>✕</button>
        </header>
        <div className="ap-body">
          {error ? <p className="ap-err" role="alert">{error}</p> : !data ? <p className="ap-muted" role="status">جارٍ التحميل…</p> : <Report360 data={data} audience="advisor" />}
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
