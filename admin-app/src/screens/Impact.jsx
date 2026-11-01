// ════════════════════════════════════════════════════════════════
// قياس الأثر: القياس المبدئي مقابل البعدي للدفعة أو للجهة
// ════════════════════════════════════════════════════════════════
// الحساب كله على الخادم (impact.ts وlogic.js). هنا العرض: حجم الأثر
// للدفعة، ومن تغيّر تغيرًا موثوقًا، وتثليث المصادر لكل مشارك، وإعدادات
// الحكم. لا يُعرض فرق خام دون هامش خطأ القياس.
import React, { useCallback, useEffect, useState } from 'react';
import { DIM, DIM_EN, DIMS, L, LVL } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { OrgSelect } from './Participants.jsx';
import Outcomes from './Outcomes.jsx';

const VERDICT = {
  confirmed: ['تغير مؤكد', 'ok'], emerging: ['مؤشرات أولية', 'warn'], none: ['لا دليل كافٍ', ''], decline: ['تراجع يحتاج مراجعة', 'bad'],
};
const SOURCE = { test: 'الاختبار', self: 'الذاتي', rater: 'المدير', evidence: 'دليل المشروع' };
const sign = (x) => (x == null ? '·' : x > 0 ? `+${x}` : `${x}`);
const SETTINGS = [
  ['rci_reliability', 'الثبات الافتراضي (0 إلى 1)', 0.01],
  ['rci_sd', 'الانحراف المعياري الافتراضي للمؤشر', 0.1],
  ['impact_min_n', 'أقل عدد لاعتماد قيم الدفعة الفعلية', 1],
  ['rater_threshold', 'أقل فرق يُعد تغيرًا في تقدير المدير والذاتي (نقاط)', 0.5],
  ['min_behavior_items', 'أقل عدد لعبارات الممارسة المجابة', 1],
  ['rci_practice', 'أثر تكرار الأسئلة على المواقف (نقاط، يُقدَّر من البيانات حين تكفي)', 0.5],
];

function Settings({ model, onSaved, canWrite }) {
  const { toast } = useUI();
  const [f, setF] = useState(() => Object.fromEntries(SETTINGS.map(([k]) => [k, model?.[k] ?? ''])));
  const save = async () => {
    const r = await L('admin.save', { entity: 'placement_model', row: { id: 1, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)])) } });
    toast(r.success ? 'حُفظت الإعدادات' : r.message); if (r.success) onSaved();
  };
  return (
    <section className="la-card">
      <h3>إعدادات الحكم بالتغير</h3>
      <p className="la-muted">التغير الموثوق = الفرق مقسومًا على خطأ الفرق المعياري (Jacobson و Truax)، ولا يُعدّ حقيقيًا قبل 1.96 بعد خصم أثر التكرار (Chelune). حين تبلغ الدفعة العدد الأدنى يحل ثبات الأداة الفعلي (ألفا كرونباخ) وانحرافها المعياري محل القيم الافتراضية تلقائيًا.</p>
      <div className="la-model-grid">
        {SETTINGS.map(([k, label, step]) => (
          <label key={k} className="la-mf"><span>{label}</span>
            <input type="number" step={step} value={f[k]} disabled={!canWrite} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
      </div>
      {canWrite && <div className="la-row"><button className="btn-sm primary" onClick={save}>حفظ</button></div>}
    </section>
  );
}

function Cohort({ r }) {
  return (
    <section className="la-card">
      <h3>الدفعة: قبل وبعد لكل إطار</h3>
      {r.caution && <div className="la-note">{r.caution}</div>}
      <table className="la-table" tabIndex={0} aria-label="قبل وبعد لكل إطار">
        <thead><tr><th>الإطار</th><th>العدد</th><th>قبل</th><th>بعد</th><th>الفرق</th><th>حجم الأثر dz</th><th>تحسن موثوق</th><th>تراجع موثوق</th><th>ارتقى مستوى</th><th>تقدير المدير قبل ← بعد</th></tr></thead>
        <tbody>{DIMS.map((d) => {
          const c = r.cohort[d];
          return (
            <tr key={d}>
              <td><b>{DIM_EN[d]}</b><br /><small className="la-muted">{DIM[d]}</small></td>
              <td>{c.n}</td><td>{c.pre ?? '·'}</td><td>{c.post ?? '·'}</td><td><b>{sign(c.diff)}</b></td>
              <td>{c.dz ?? '·'}{c.effect && <small className="la-muted"> ({c.effect})</small>}</td>
              <td>{c.reliable_up}</td><td>{c.reliable_down}</td><td>{c.level_up}</td>
              <td>{c.rater.n ? `${c.rater.pre} ← ${c.rater.post} (${c.rater.n})` : '·'}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="la-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {DIMS.map((d) => (
          <span key={d} className="la-muted">{DIM_EN[d]}: {Object.entries(VERDICT).map(([k, [l]]) => `${l} ${r.cohort[d].verdicts[k] || 0}`).join(' · ')}
            {r.cohort[d].response_shift != null && ` · انزياح الاستجابة ${sign(r.cohort[d].response_shift)}`}</span>
        ))}
      </div>
      <p className="la-muted">المقارنة بالجوانب المشتركة بين النموذجين فقط وبأوزان نموذج التسكين. انزياح الاستجابة الموجب يعني أن المشاركين قدّروا ممارستهم في البداية أعلى مما يرونها اليوم، وهو سبب الاعتماد على القياس الرجعي وتقدير المدير لا على الفرق الذاتي.</p>
      <p className="la-muted">الثبات المستعمل (ألفا الطبقية): {DIMS.map((d) => {
        const s = r.config.source?.[d] || {};
        return `${DIM_EN[d]} ${s.from_data ? `α ${s.alpha} من ${s.n}` : `افتراضي ${r.config.rci_reliability} (لدينا ${s.n || 0})`}`;
      }).join(' · ')}{(() => {
        const o = r.config.source?.overall;
        return o ? ` · الكلي ${o.from_data ? `α ${o.alpha} من ${o.n}` : 'افتراضي بمعادلة Spearman و Brown'}` : '';
      })()}</p>
    </section>
  );
}

function Overall({ o }) {
  if (!o?.n) return null;
  return (
    <section className="la-card">
      <h3>المؤشر الكلي: الحكم الفردي الرسمي</h3>
      <table className="la-table" tabIndex={0} aria-label="المؤشر الكلي للدفعة">
        <thead><tr><th>العدد</th><th>قبل</th><th>بعد</th><th>الفرق</th><th>حجم الأثر dz</th><th>تحسن موثوق</th><th>تراجع موثوق</th><th>الأحكام</th></tr></thead>
        <tbody><tr>
          <td>{o.n}</td><td>{o.pre ?? '·'}</td><td>{o.post ?? '·'}</td><td><b>{sign(o.diff)}</b></td>
          <td>{o.dz ?? '·'}{o.effect && <small className="la-muted"> ({o.effect})</small>}</td>
          <td>{o.reliable_up}</td><td>{o.reliable_down}</td>
          <td><small>{Object.entries(VERDICT).map(([k, [l]]) => `${l} ${o.verdicts[k] || 0}`).join(' · ')}</small></td>
        </tr></tbody>
      </table>
      <p className="la-muted">متوسط الأطر الثلاثة بأسئلتها كلها، فخطأ قياسه أصغر بكثير من خطأ الإطار المنفرد. لذلك يُحكم على الفرد بالمؤشر الكلي، وتبقى الأطر منفردة وصفًا للفرد وحكمًا إحصائيًا للدفعة.</p>
    </section>
  );
}

function Transfer({ rows }) {
  if (!rows.length) return null;
  return (
    <section className="la-card">
      <h3>انتقال التعلم إلى العمل</h3>
      <table className="la-table" tabIndex={0} aria-label="انتقال التعلم إلى العمل">
        <thead><tr><th>البند</th><th>العدد</th><th>موافقون</th><th>المتوسط من 4</th></tr></thead>
        <tbody>{rows.map((t) => <tr key={t.code}><td>{t.text}</td><td>{t.n}</td><td>{t.agree_pct}%</td><td>{t.mean}</td></tr>)}</tbody>
      </table>
      <p className="la-muted">بيئة التطبيق (Kirkpatrick المستوى 3): ضعف الدعم أو الفرص يفسّر غياب الأثر أحيانًا أكثر من جودة التدريب.</p>
    </section>
  );
}

function People({ list, onPerson }) {
  const rows = list.filter((p) => p.baseline_at);
  if (!rows.length) return null;
  return (
    <section className="la-card">
      <h3>المشاركون</h3>
      <table className="la-table" tabIndex={0} aria-label="أثر كل مشارك">
        <thead><tr><th>المشارك</th><th>الكلي</th>{DIMS.map((d) => <th key={d}>{DIM_EN[d]}</th>)}<th>المقيّمون</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} className="la-click" onClick={() => onPerson(p.id)}>
            <td><b>{p.full_name}</b><br /><small className="la-muted">{p.organization || ''}{p.forms?.[0] && ` · نموذج ${p.forms[0]}${p.forms[1] ? ` ← ${p.forms[1]}` : ''}`}</small></td>
            <td>{p.overall ? (() => {
              const [vl, vc] = VERDICT[p.overall.verdict.key];
              return <><b>{p.overall.composite_pre} ← {p.overall.composite_post}</b> <small>{sign(p.overall.change)}</small>
                <br /><span className={`la-chip ${vc}`}>{vl}</span>
                <br /><small className="la-muted">{p.overall.verdict.sources.map((s) => SOURCE[s]).join('، ') || 'لا مصدر'} · RCI {p.overall.rci}</small></>;
            })() : <small className="la-muted">·</small>}</td>
            {DIMS.map((d) => {
              const x = p.dimensions?.find((y) => y.dimension === d);
              // زوج أداتاه غير متطابقتين: لا أرقام، وسبب واحد في خلية الإطار الأول
              if (p.comparable === false) return <td key={d}>{d === DIMS[0] ? <><span className="la-chip">غير قابل للمقارنة</span><br /><small className="la-muted">{p.reason}{p.baseline_key && p.post_key ? ` (${p.baseline_key} ← ${p.post_key})` : ''}</small></> : <small className="la-muted">·</small>}</td>;
              if (!x) return <td key={d}><small className="la-muted">{p.post_at ? '·' : 'لم يُجرِ البعدي'}</small></td>;
              const [vl, vc] = VERDICT[x.verdict.key];
              return (
                <td key={d}>
                  <b>{x.composite_pre ?? '·'} ← {x.composite_post ?? '·'}</b> <small>{sign(x.change)}</small>
                  {x.pre.level && x.post.level && x.pre.level !== x.post.level && <><br /><small>{LVL[x.pre.level]} ← {LVL[x.post.level]}</small></>}
                  <br /><span className={`la-chip ${vc}`}>{vl}</span>
                  <br /><small className="la-muted">{x.verdict.sources.map((s) => SOURCE[s]).join('، ') || 'لا مصدر'}{x.rci != null && ` · RCI ${x.rci}`}</small>
                </td>
              );
            })}
            <td>{p.raters_done}/{p.raters_invited}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="la-muted">الحكم بالتثليث: «تغير مؤكد» يتطلب مصدرين على الأقل أحدهما خارجي غير مبني على التذكر: الاختبار بتغير موثوق، أو دليل المشروع المعتمد، أو تقدير المدير نفسه قبل البرنامج وبعده. تقدير المدير بأثر رجعي وحده يرفع الحكم إلى «مؤشرات أولية» فقط.</p>
    </section>
  );
}

export default function Impact({ orgs, onPerson, onCapstone, catalog, reload, canWrite }) {
  const { toast } = useUI();
  const [org, setOrg] = useState('');
  const [r, setR] = useState(null);
  const load = useCallback(() => { setR(null); L('admin.impact', org ? { organization_id: org } : {}).then(setR); }, [org]);
  useEffect(() => { load(); }, [load]);
  const post = (catalog?.instruments || []).filter((i) => i.kind === 'post');

  // تقرير الأثر النهائي بالهوية، يُحفظ PDF من نافذة الطباعة
  const printReport = async () => {
    const win = window.open('', '_blank');
    const [{ writeDocument }, { impactReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/reports.js')]);
    const { meta, body } = impactReport(r, { org: org ? orgs.find((o) => o.id === org)?.name || null : null });
    if (!writeDocument(win, meta, body)) toast('اسمح بالنوافذ المنبثقة لعرض التقرير');
  };

  if (!r) return <Spinner />;
  if (!r.success) return <div className="la-err" role="alert">{r.message}</div>;
  return (
    <>
      <div className="la-row between la-ov-bar">
        <span className="la-muted">{org ? 'جهة واحدة' : 'كل الجهات'}</span>
        <div className="la-row">
          <button className="btn-sm" onClick={printReport}>تقرير الأثر PDF</button>
          <OrgSelect orgs={orgs} value={org} onChange={setOrg} />
        </div>
      </div>
      {catalog?.success && !post.some((i) => i.active) && (
        <div className="la-note">القياس البعدي غير مفعّل بعد: {post.map((i) => i.key).join('، ') || 'لا أداة'}. راجع أسئلته في «أسئلة القياس» ثم فعّله، فيظهر للمشاركين حين يصلون إلى مرحلة التقييم.</div>
      )}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">المشاركون</div><div className="stat-value">{r.counts.participants}</div></div>
        <div className="stat-card"><div className="stat-label">أجروا المبدئي</div><div className="stat-value">{r.counts.baseline}</div></div>
        <div className="stat-card"><div className="stat-label">أجروا البعدي</div><div className="stat-value">{r.counts.post}</div></div>
        <div className="stat-card"><div className="stat-label">أزواج للمقارنة</div><div className="stat-value s-replied">{r.counts.paired}</div></div>
      </div>
      {r.counts.paired > 0 ? <Cohort r={r} /> : <section className="la-card"><p className="la-muted">لا أزواج بعد: تظهر المقارنة حين يُتم مشارك القياسين.</p></section>}
      {r.counts.paired > 0 && <Overall o={r.overall} />}
      <Transfer rows={r.transfer} />
      <Outcomes org={org} onOpen={onCapstone} />
      <People list={r.participants} onPerson={onPerson} />
      {catalog?.success && <Settings model={catalog.placement_model?.[0]} canWrite={canWrite} onSaved={() => { reload(); load(); }} />}
    </>
  );
}
