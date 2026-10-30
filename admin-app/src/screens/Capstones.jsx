// ════════════════════════════════════════════════════════════════
// مشاريع التخرج: مراجعة وثائق المبادرات واعتمادها
// ════════════════════════════════════════════════════════════════
// قائمة واحدة لكل الوثائق بحالتها، وصفحة لكل وثيقة: تقرأها بالقالب
// نفسه الذي يراه المشارك والراعي، وتقيّمها بالمعيار السداسي، ثم تعيدها
// للتحسين مرة أو تقبلها فيُطلب تأييد راعيها. الفصول نفسها نماذج تعليمية،
// فتقييم كل فصل منفردًا يبقى في «كتيب القائد ← التقييم».
import React, { useCallback, useEffect, useState } from 'react';
import { DIM, L, date } from '../leaders.js';
import { PRIORITY_WEIGHT } from '../../../supabase/functions/leaders-api/capstone.js';
import { useUI, Spinner } from '../ui.jsx';
import { refreshPending } from '../pending.js';

const STATUS = { draft: 'قيد البناء', submitted: 'بانتظار مراجعتك', returned: 'أُعيد للتحسين', accepted: 'بانتظار الراعي', approved: 'معتمد' };
const CHIP = { submitted: 'warn', accepted: 'warn', approved: 'ok' };
const SCOPE = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };
const SPONSOR = { pending: 'دُعي ولم يرد', endorsed: 'أيّد', declined: 'طلب تعديلًا' };
const FILTERS = [['submitted', 'بانتظار مراجعتك'], ['accepted', 'بانتظار الراعي'], ['returned', 'أُعيدت'], ['approved', 'معتمدة'], ['', 'الكل']];
const PART = { quizzes: 'اختبارات الأبواب', lab: 'أدوات المختبر', capstone: 'مشروع التخرج', participation: 'المشاركة في الرحلة' };

async function openDoc(doc, toast) {
  const win = window.open('', '_blank');
  const [{ writeDocument }, { capstoneReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/capstone.js')]);
  const { meta, body } = capstoneReport(doc);
  if (!writeDocument(win, meta, body)) toast('اسمح بالنوافذ المنبثقة لعرض الوثيقة');
}

function Review({ d, canWrite, onSaved }) {
  const { toast, confirm } = useUI();
  const c = d.capstone;
  const [scores, setScores] = useState(() => c.scores || {});
  const [notes, setNotes] = useState(() => c.notes || {});
  const [note, setNote] = useState(c.review_note || '');
  const [waive, setWaive] = useState('');
  const [busy, setBusy] = useState('');
  const canReturn = (c.revisions || 0) < d.max_revisions;
  const send = async (decision) => {
    if (decision === 'return' && !(await confirm('تُعاد الوثيقة للمشارك ليحسّنها، وهذا التحسين الوحيد المتاح له. متابعة؟'))) return;
    if (decision === 'accept' && !waive && !(await confirm('تُقبل الوثيقة ويُرسل طلب التأييد إلى راعيها في الجهة. متابعة؟'))) return;
    setBusy(decision);
    const r = await L('admin.capstone-review', { participant_id: d.participant_id, decision, scores, notes, note, waive_sponsor: decision === 'accept' ? waive : '' });
    setBusy('');
    if (!r.success) return toast(r.message);
    toast(decision === 'return' ? 'أُعيدت للمشارك' : waive ? 'اعتُمدت الوثيقة' : 'قُبلت وأُرسل طلب التأييد');
    refreshPending();
    onSaved(r);
  };
  return (
    <section className="la-card cps-review">
      <h3>تقييمك بالمعيار <small className="la-muted">· أبعاد {DIM[d.priority] || 'الإطار الأولوي'} وزنها ×{PRIORITY_WEIGHT}</small></h3>
      <fieldset disabled={!canWrite || !!busy}>
        {d.rubric.map((r) => (
          <div key={r.key} className="cps-crit">
            <div className="la-row between"><b>{r.title}</b>{r.dimension === d.priority && <span className="la-chip warn">الوزن ×{PRIORITY_WEIGHT}</span>}</div>
            <div className="cps-anchors" role="radiogroup" aria-label={r.title}>
              {r.anchors.map((a, i) => (
                <button key={i} type="button" role="radio" aria-checked={scores[r.key] === i + 1} className={scores[r.key] === i + 1 ? 'on' : ''}
                  onClick={() => setScores({ ...scores, [r.key]: i + 1 })}><b>{i + 1}</b><span>{a}</span></button>
              ))}
            </div>
            <textarea rows={2} placeholder="ملاحظتك على هذا البعد (تصل المشارك)" value={notes[r.key] || ''} onChange={(e) => setNotes({ ...notes, [r.key]: e.target.value })} />
          </div>
        ))}
        <label className="cps-note">خلاصتك للمشارك<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <label className="cps-note">اعتماد دون تأييد الراعي (اختياري، بسبب مكتوب)<input value={waive} placeholder="مثال: الراعي في إجازة طويلة، والجهة أكدت الرعاية بخطاب" onChange={(e) => setWaive(e.target.value)} /></label>
        <div className="la-row">
          <button className="btn-sm primary" onClick={() => send('accept')}>{busy === 'accept' ? 'لحظة…' : waive ? 'قبول واعتماد' : 'قبول وطلب تأييد الراعي'}</button>
          {canReturn && <button className="btn-sm ghost" onClick={() => send('return')}>{busy === 'return' ? 'لحظة…' : 'إعادة للتحسين'}</button>}
          {!canReturn && <small className="la-muted">استُنفد التحسين المتاح، فالقرار قبول بالمعيار.</small>}
        </div>
      </fieldset>
    </section>
  );
}

function Sponsor({ d, canWrite, onSaved }) {
  const { toast } = useUI();
  const c = d.capstone;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const act = async (kind) => {
    setBusy(kind);
    const r = await L('admin.capstone-sponsor', kind === 'waive' ? { participant_id: d.participant_id, waive: reason } : { participant_id: d.participant_id });
    setBusy('');
    if (!r.success) return toast(r.message);
    toast(kind === 'waive' ? 'اعتُمدت الوثيقة' : 'أُعيد إرسال الدعوة');
    onSaved(r);
  };
  return (
    <section className="la-card">
      <h3>تأييد الراعي</h3>
      <p>{c.sponsor_name || 'الراعي'} {c.sponsor_email && <span className="la-muted" dir="ltr">{c.sponsor_email}</span>} · {SPONSOR[c.sponsor_status] || 'لم يُدعَ'}{c.sponsor_invited_at ? ` · دُعي ${date(c.sponsor_invited_at)}` : ''}</p>
      {canWrite && (
        <div className="la-row">
          <button className="btn-sm ghost" disabled={!!busy} onClick={() => act('invite')}>{busy === 'invite' ? 'لحظة…' : 'أعد إرسال الدعوة'}</button>
          <input aria-label="سبب الاعتماد دون تأييد" placeholder="سبب الاعتماد دون تأييد الراعي" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-sm primary" disabled={!!busy || reason.trim().length < 10} onClick={() => act('waive')}>اعتماد دون تأييد</button>
        </div>
      )}
    </section>
  );
}

function Detail({ id, canWrite, onBack, onPerson }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  const load = useCallback(() => L('admin.capstone', { participant_id: id }).then((r) => setD(r.success ? { ...r, participant_id: id } : r)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err" role="alert">{d.message}</div>;
  const m = d.doc.meta;
  const c = d.capstone;
  const lead = d.leader;
  return (
    <div className="cps">
      <button className="la-link" onClick={onBack}>→ كل المشاريع</button>
      <section className="la-card cps-head">
        <div>
          <small className="la-muted">{m.participant?.name} · {m.org?.name || 'بلا جهة'} · {m.scope_title || 'نطاق غير محدد'} · {m.track?.title || ''}</small>
          <h2>{m.initiative || 'بلا اسم بعد'}</h2>
          <div className="la-row">
            <span className={`la-chip ${CHIP[c.status] || ''}`}>{STATUS[c.status] || c.status}</span>
            <span className="la-chip">الجاهزية {d.readiness}%</span>
            {c.revisions > 0 && <span className="la-chip">تحسين {c.revisions}</span>}
            {c.score != null && <span className="la-chip ok">المعيار {c.score} من 100</span>}
          </div>
        </div>
        <div className="la-row">
          <button className="btn-sm primary" onClick={() => openDoc(d.doc, toast)}>اقرأ الوثيقة</button>
          <button className="btn-sm ghost" onClick={() => onPerson(id)}>ملف المشارك</button>
        </div>
      </section>

      <div className="la-grid2">
        <section className="la-card">
          <h3>الفصول</h3>
          <ol className="cps-secs">{d.sections.map((s) => (
            <li key={s.id} className={s.complete ? 'ok' : ''}><span>{s.title}</span><small>{s.complete ? 'مكتمل' : `${s.missing} حقول ناقصة`}{s.status ? ` · ${s.status === 'reviewed' ? 'قيّمته' : s.status === 'submitted' ? 'مسلّم' : s.status === 'returned' ? 'أُعيد' : 'مسودة'}` : ''}</small></li>
          ))}</ol>
          <h3>فحوص الاتساق</h3>
          <ul className="cps-checks">{d.checks.map((x) => <li key={x.key} className={x.ok ? 'ok' : 'no'}>{x.title}{x.detail && <small>{x.detail}</small>}</li>)}</ul>
        </section>
        <section className="la-card">
          <h3>نتيجة القائد في تقريره</h3>
          <p className="la-muted">بالأوزان المعتمدة. الجزء الغائب يُعاد توزيع وزنه، ولا تظهر النتيجة في الشهادة.</p>
          <p className="cps-big">{lead?.score ?? '·'}<small> من 100</small></p>
          <table className="la-table"><tbody>
            {Object.entries(lead?.weights || {}).map(([k, w]) => <tr key={k}><td>{PART[k]}</td><td>{w}%</td><td>{lead.parts[k] ?? 'لم يُقس'}</td></tr>)}
          </tbody></table>
          {c.review_note && <><h3>خلاصتك</h3><p>{c.review_note}</p></>}
          {c.sponsor_note && <><h3>ملاحظة الراعي</h3><p>{c.sponsor_note}</p></>}
          {c.sponsor_waived && <p className="la-muted">اعتُمدت دون تأييد الراعي: {c.sponsor_waived}</p>}
        </section>
      </div>

      {c.status === 'submitted' && <Review d={d} canWrite={canWrite} onSaved={(r) => setD({ ...r, participant_id: id })} />}
      {c.status === 'accepted' && <Sponsor d={d} canWrite={canWrite} onSaved={(r) => setD({ ...r, participant_id: id })} />}
    </div>
  );
}

export default function Capstones({ canWrite, capId, onOpen, onPerson }) {
  const [status, setStatus] = useState('submitted');
  const [list, setList] = useState(null);
  useEffect(() => { if (!capId) L('admin.capstones', status ? { status } : {}).then(setList); }, [status, capId]);
  if (capId) return <Detail id={capId} canWrite={canWrite} onBack={() => onOpen(null)} onPerson={onPerson} />;
  return (
    <section className="la-card">
      <div className="la-row between">
        <h3>مشاريع التخرج: وثائق المبادرات</h3>
        <div className="la-row cps-filter">{FILTERS.map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => { setList(null); setStatus(k); }}>{l}</button>)}</div>
      </div>
      <p className="la-muted">فصول كل وثيقة نماذج تعليمية يقيّمها المستشار منفردة في «كتيب القائد». هنا قرار الوثيقة كاملة: إعادة للتحسين مرة، أو قبول بالمعيار ثم تأييد الراعي.</p>
      {!list ? <Spinner /> : !list.success ? <div className="la-err">{list.message}</div> : !list.capstones.length ? <p className="la-muted">لا وثائق في هذه الحالة.</p> : (
        <table className="la-table">
          <thead><tr><th>المبادرة</th><th>القائد</th><th>الجهة</th><th>النوع</th><th>الحالة</th><th>الجاهزية</th><th>المعيار</th><th>سُلّمت</th></tr></thead>
          <tbody>{list.capstones.map((x) => (
            <tr key={x.participant_id}>
              <td><button className="la-link" onClick={() => onOpen(x.participant_id)}>{x.initiative || 'بلا اسم'}</button></td>
              <td>{x.full_name}</td><td>{x.organization || '·'}</td><td>{SCOPE[x.scope] || '·'}</td>
              <td><span className={`la-chip ${CHIP[x.status] || ''}`}>{STATUS[x.status]}</span>{x.sponsor_status && x.status === 'accepted' ? <small className="la-muted"> · {SPONSOR[x.sponsor_status]}</small> : null}</td>
              <td>{x.readiness != null ? `${x.readiness}%` : '·'}</td><td>{x.score ?? '·'}</td><td>{date(x.submitted_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
