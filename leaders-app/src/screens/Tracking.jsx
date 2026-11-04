// ════════════════════════════════════════════════════════════════
// متابعة تنفيذ المبادرة وأثرها بعد اعتماد وثيقتها
// ════════════════════════════════════════════════════════════════
// المعالم والمنافع من الوثيقة المعتمدة نفسها، فلا تُكتب مرة ثانية. القائد
// يحدّث كل شهر حالة المعالم وما تحرك من المؤشرات، وعند اليوم 90 و180
// يقيس كل المنافع ويؤكدها راعي المبادرة. الملخص من الخادم وحده.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { useUnsavedGuard } from '../unsaved.js';
import ChooseExpert from './ChooseExpert.jsx';

const HEALTH_CHIP = { green: 'ok', amber: 'warn', red: 'bad', stale: 'warn', pending: '', closed: 'ok' };
const CP_STATUS = { upcoming: 'لم يحن موعدها', due: 'حان موعدها', missed: 'فاتت', submitted: 'أُرسلت', verified: 'أكّدها الراعي', disputed: 'اعترض الراعي' };
const pct = (v) => (v == null ? '·' : `${v}%`);
const monthName = (p) => (p ? new Date(`${p}-01T00:00:00Z`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' }) : '');

function draftFrom(t, current) {
  const s = t.state;
  const src = current || {};
  return {
    milestones: Object.fromEntries(s.milestones.map((m) => [m.key, { status: src.milestones?.[m.key]?.status || m.status || '', date: src.milestones?.[m.key]?.date || m.actual || '', note: src.milestones?.[m.key]?.note || '' }])),
    benefits: Object.fromEntries(s.benefits.map((b) => [b.key, { value: src.benefits?.[b.key]?.value ?? '', note: src.benefits?.[b.key]?.note || '', evidence: src.benefits?.[b.key]?.evidence || '' }])),
    narrative: src.narrative || '', blockers: src.blockers || '', support: src.support || '',
  };
}

export default function Tracking() {
  const [d, setD] = useState(null);
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);
  const apply = (r) => { setD(r); if (r.success) setV(draftFrom(r.tracking, r.current)); };
  useEffect(() => { call('tracking.get').then(apply); }, []);
  // التحديث الشهري يُحفظ بزر واحد؛ إغلاق الصفحة والنموذج مفتوح يحذّر
  useUnsavedGuard(open);

  if (!d) return <section className="card"><div className="spinner" /></section>;
  if (!d.success) return null;
  const t = d.tracking;
  const s = t.summary;
  const checkpoint = s.due.checkpoint ? t.checkpoints.find((c) => c.key === s.due.checkpoint) : null;
  const verifying = d.current?.verify && ['pending', 'confirmed'].includes(d.current.verify.status);
  const editable = s.can_update && !verifying;
  const setM = (k, patch) => setV({ ...v, milestones: { ...v.milestones, [k]: { ...v.milestones[k], ...patch } } });
  const setB = (k, patch) => setV({ ...v, benefits: { ...v.benefits, [k]: { ...v.benefits[k], ...patch } } });

  const save = async () => {
    if (checkpoint && !window.confirm(`تُرسل «${checkpoint.title}» إلى راعي المبادرة ليؤكد الأرقام، ولا تُعدَّل حتى يرد. متابعة؟`)) return;
    setBusy(true); setMsg(null);
    const r = await call('tracking.save', { ...v, checkpoint: !!checkpoint });
    setBusy(false);
    if (!r.success) return setMsg({ err: r.message });
    apply(r);
    setOpen(false);
    setMsg({ ok: r.invited ? 'أُرسلت المراجعة، ووصل الراعي رابط تأكيد الأرقام.' : 'حُفظ تحديث هذا الشهر.' });
  };

  return (
    <section className="card tr">
      <div className="tr-head">
        <div>
          <span className="mg-cap">بعد الاعتماد</span>
          <h2>متابعة التنفيذ والأثر</h2>
          <p className="muted small">الخطة من وثيقتك المعتمدة. حدّث كل شهر حالة المعالم وقيم المؤشرات. في اليوم 90 و180 تقيس كل المنافع ويؤكدها راعي المبادرة.</p>
        </div>
        <span className={`chip ${HEALTH_CHIP[s.health] || ''}`}>{s.health_title}</span>
      </div>

      <div className="tr-kpis">
        <div><b>{s.day}</b><small>يومًا منذ الاعتماد</small></div>
        <div><b>{pct(s.milestones.on_time)}</b><small>معالم في موعدها · {s.milestones.done} من {s.milestones.total} تحققت</small></div>
        <div><b>{pct(s.benefits.realization)}</b><small>تحقق المنافع · {s.benefits.measured} من {s.benefits.total} مقيسة</small></div>
        <div><b>{s.updates}</b><small>تحديث شهري</small></div>
      </div>

      <ol className="tr-cps">{s.checkpoints.map((c) => <li key={c.key} className={c.status}><b>{c.title}</b><small>{c.verify_title || CP_STATUS[c.status]}</small></li>)}</ol>
      {d.current?.verify?.status === 'disputed' && <div className="alert err">اعترض الراعي على الأرقام: «{d.current.verify.note}». صحّحها ثم أرسل المراجعة من جديد.</div>}
      {msg?.ok && <div className="alert ok">{msg.ok}</div>}

      {editable && !open && (
        <button className={`btn ${checkpoint || s.due.update ? 'gold' : 'ghost'}`} onClick={() => setOpen(true)}>
          {checkpoint ? `ابدأ ${checkpoint.title}` : d.current ? `عدّل تحديث ${monthName(s.current)}` : `حدّث متابعة ${monthName(s.current)}`}
        </button>
      )}
      {verifying && <p className="muted small">{d.current.verify.title}: بانتظار تأكيد الراعي.</p>}

      {open && v && (
        <div className="tr-form">
          {checkpoint && <div className="alert info">{checkpoint.title}: اكتب القيمة الحالية لكل منفعة، وما تغيّر فعلًا في الجهة ودليله. يصل الراعي رابطًا يؤكد به الأرقام.</div>}
          <h3>المعالم</h3>
          {t.state.milestones.map((m) => (
            <div key={m.key} className="tr-row">
              <div className="tr-t"><b>{m.title}</b><small>{m.due ? `المستهدف ${m.due}` : ''}{m.criterion ? ` · ${m.criterion}` : ''}</small></div>
              <select className="input" aria-label={`حالة ${m.title}`} value={v.milestones[m.key].status} onChange={(e) => setM(m.key, { status: e.target.value })}>
                <option value="">لم يتغير</option>{Object.entries(t.statuses).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {v.milestones[m.key].status === 'done' && <input className="input" type="date" aria-label={`تاريخ تحقق ${m.title}`} value={v.milestones[m.key].date} onChange={(e) => setM(m.key, { date: e.target.value })} />}
              {['at_risk', 'late', 'dropped'].includes(v.milestones[m.key].status) && <input className="input" aria-label={`ملاحظة ${m.title}`} placeholder={v.milestones[m.key].status === 'dropped' ? 'سبب الإلغاء ومن قرّره' : 'السبب وما تفعله'} value={v.milestones[m.key].note} onChange={(e) => setM(m.key, { note: e.target.value })} />}
            </div>
          ))}
          {!t.state.milestones.length && <p className="muted small">لا معالم في الوثيقة المعتمدة.</p>}

          <h3>المنافع</h3>
          {t.state.benefits.map((b) => (
            <div key={b.key} className="tr-row">
              <div className="tr-t"><b>{b.title}</b><small>{b.indicator || ''} · خط الأساس {b.baseline || '·'} · المستهدف {b.target || '·'}{b.realization != null ? ` · آخر تحقق ${Math.round(b.realization * 100)}%` : ''}</small></div>
              <input className="input" aria-label={`القيمة الحالية لـ${b.title}`} placeholder="القيمة الحالية" inputMode={b.numeric ? 'decimal' : undefined} value={v.benefits[b.key].value} onChange={(e) => setB(b.key, { value: e.target.value })} />
              <input className="input" dir="ltr" aria-label={`رابط دليل ${b.title}`} placeholder="رابط الدليل (اختياري)" value={v.benefits[b.key].evidence} onChange={(e) => setB(b.key, { evidence: e.target.value })} />
            </div>
          ))}

          <label className="field"><span>{checkpoint ? 'ما الذي تغيّر فعلًا في الجهة، وما دليله' : 'ما جرى هذا الشهر'}</span>
            <textarea className="input" rows={4} maxLength={2000} value={v.narrative} onChange={(e) => setV({ ...v, narrative: e.target.value })} /></label>
          <div className="tr-two">
            <label className="field"><span>ما يعيقك</span><textarea className="input" rows={2} maxLength={1000} value={v.blockers} onChange={(e) => setV({ ...v, blockers: e.target.value })} /></label>
            <label className="field"><span>ما تحتاجه من جهتك أو مستشارك</span><textarea className="input" rows={2} maxLength={1000} value={v.support} onChange={(e) => setV({ ...v, support: e.target.value })} /></label>
          </div>
          {msg?.err && <div className="alert err">{msg.err}</div>}
          <div className="row">
            <button className="btn gold" disabled={busy} onClick={save}>{busy ? 'لحظة…' : checkpoint ? 'أرسل المراجعة للراعي' : 'احفظ التحديث'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => { setOpen(false); setV(draftFrom(t, d.current)); setMsg(null); }}>إلغاء</button>
          </div>
        </div>
      )}

      {t.updates.length > 0 && (
        <details className="tr-log">
          <summary>سجل التحديثات ({t.updates.length})</summary>
          <ul>{t.updates.map((u) => (
            <li key={u.id}><b>{monthName(u.period)}</b>{u.checkpoint_title && <span className="chip gold">{u.checkpoint_title}</span>}{u.verify && <small> · {u.verify.title}</small>}
              {u.narrative && <p>{u.narrative}</p>}</li>
          ))}</ul>
        </details>
      )}
      {/* ما يحتاجه القائد في تحديثه يصير طلب استشارة بنقرة، لا ملاحظة تُقرأ فقط */}
      <ChooseExpert context="tracking" title={d.current?.support ? 'اطلب خبيرًا لما تحتاجه' : 'استشارة أثناء التنفيذ'} note={d.current?.support || ''} />
    </section>
  );
}
