// ════════════════════════════════════════════════════════════════
// مشاريع التخرج: مراجعة وثائق المبادرات واعتمادها
// ════════════════════════════════════════════════════════════════
// قائمة واحدة لكل الوثائق بحالتها، وصفحة لكل وثيقة: تقرأها بالقالب
// نفسه الذي يراه المشارك والراعي، وتقيّمها بالمعيار السداسي، ثم تعيدها
// للتحسين مرة أو تقبلها فيُطلب تأييد راعيها. الفصول نفسها نماذج تعليمية،
// فتقييم كل فصل منفردًا يبقى في «كتيب القائد ← التقييم».
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DIM, L, date } from '../leaders.js';
import { PRIORITY_WEIGHT, STATUS_TITLES_ADMIN } from '../../../supabase/functions/leaders-api/capstone.js';
import { LEVEL_AR, RUBRIC_LEVEL_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { Empty, Spinner, useUI } from '../ui.jsx';
import { refreshPending } from '../pending.js';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts, sortRows } from '../filters.js';
import { HEALTH_CHIP, TrackingPanel } from './Outcomes.jsx';

const STATUS = STATUS_TITLES_ADMIN;
const CHIP = { submitted: 'warn', accepted: 'warn', approved: 'ok' };
const SCOPE = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };
const SPONSOR = { pending: 'دُعي ولم يرد', endorsed: 'أيّد', declined: 'طلب تعديلًا' };
const FILTERS = ['submitted', 'accepted', 'returned', 'approved'].map((k) => [k, STATUS[k]]);

async function openDoc(doc, toast) {
  const win = window.open('', '_blank');
  const [{ writeDocument }, { capstoneReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/capstone.js')]);
  const { meta, body } = capstoneReport(doc);
  if (!writeDocument(win, meta, body)) toast('اسمح بالنوافذ المنبثقة لعرض الوثيقة');
}

function Review({ d, canWrite, onSaved, onFailed }) {
  const { toast, confirm } = useUI();
  const c = d.capstone;
  const [scores, setScores] = useState(() => c.scores || {});
  const [notes, setNotes] = useState(() => c.notes || {});
  const [note, setNote] = useState(c.review_note || '');
  const [waive, setWaive] = useState('');
  const [busy, setBusy] = useState('');
  const canReturn = (c.revisions || 0) < d.max_revisions;
  // بلا بريد صحيح للراعي لا يُطلب تأييد: القبول اعتماد دون تأييد بسبب مكتوب (الراعي اختياري)
  const noSponsor = !d.sponsor_email;
  // سبب الاعتماد دون تأييد بحد الخادم نفسه (عشرة أحرف، capstone.ts)؛ وكان وجود أي سبب يلغي التأكيد فيُعتمد نهائيًا بنقرة
  const why = waive.trim();
  const waiveShort = (noSponsor || !!why) && why.length < 10;
  const send = async (decision) => {
    if (decision === 'return' && !(await confirm('تُعاد الوثيقة للمشارك ليحسّنها، وهذا التحسين الوحيد المتاح له. متابعة؟'))) return;
    if (decision === 'accept' && !(await confirm(why
      ? 'تُعتمد الوثيقة نهائيًا دون تأييد الراعي: تُمنح نقاط الاعتماد ويُبلَّغ المشارك بالبريد، ولا يُتراجع عن ذلك. متابعة؟'
      : 'تُقبل الوثيقة ويُرسل طلب التأييد إلى راعيها في الجهة. متابعة؟'))) return;
    setBusy(decision);
    const r = await L('admin.capstone-review', { participant_id: d.participant_id, decision, scores, notes, note, waive_sponsor: decision === 'accept' ? why : '' });
    setBusy('');
    // أي خطأ يعيد تحميل الوثيقة، فلا تبقى الشاشة على حالة تغيّرت على الخادم
    if (!r.success) { toast(r.message); onFailed(); return; }
    toast(r.warning || (decision === 'return' ? 'أُعيدت للمشارك' : why ? 'اعتُمدت الوثيقة' : 'قُبلت وأُرسل طلب التأييد'));
    refreshPending();
    onSaved(r);
  };
  return (
    <section className="la-card cps-review">
      <h3>تقييمك بالمعيار <small className="la-muted">{d.priority ? <>· أبعاد {DIM[d.priority]} وزنها ×{PRIORITY_WEIGHT}</> : '· المستويات الثلاثة متساوية، فكل الأبعاد بوزن واحد'}</small></h3>
      <fieldset disabled={!canWrite || !!busy}>
        {d.rubric.map((r) => (
          <div key={r.key} className="cps-crit">
            <div className="la-row between"><b>{r.title}</b><span className="la-row">{r.level && <span className="la-chip" title="مراسي هذا البعد مكتوبة لمستوى المشارك في إطاره، فالدرجة تُقرأ نسبةً إلى مستواه">مراسي مستوى {LEVEL_AR[r.level]}</span>}{r.dimension === d.priority && <span className="la-chip warn">الوزن ×{PRIORITY_WEIGHT}</span>}</span></div>
            <div className="cps-anchors" role="radiogroup" aria-label={r.title}>
              {r.anchors.map((a, i) => (
                <button key={i} type="button" role="radio" aria-checked={scores[r.key] === i + 1} className={scores[r.key] === i + 1 ? 'on' : ''}
                  onClick={() => setScores({ ...scores, [r.key]: i + 1 })}><b>{i + 1}. {RUBRIC_LEVEL_AR[i + 1]}</b><span>{a}</span></button>
              ))}
            </div>
            <textarea rows={2} placeholder="ملاحظتك على هذا البعد (تصل المشارك)" value={notes[r.key] || ''} onChange={(e) => setNotes({ ...notes, [r.key]: e.target.value })} />
          </div>
        ))}
        <label className="cps-note">خلاصتك للمشارك<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {noSponsor && <p className="la-muted" role="note">لا بريد صحيح للراعي في بطاقة المبادرة، فلا يُطلب تأييده. اكتب سبب الاعتماد دون تأييد{canReturn ? '، أو أعدها للمشارك ليضيف بريد الراعي' : ''}.</p>}
        <label className="cps-note">اعتماد دون تأييد الراعي ({noSponsor ? 'إلزامي' : 'اختياري'}، بسبب مكتوب)<input value={waive} placeholder="مثال: الراعي في إجازة طويلة، والجهة أكدت الرعاية بخطاب" onChange={(e) => setWaive(e.target.value)} /></label>
        <div className="la-row">
          <button className="btn-sm primary" disabled={waiveShort} title={waiveShort ? 'سبب الاعتماد دون تأييد عشرة أحرف على الأقل' : undefined} onClick={() => send('accept')}>{busy === 'accept' ? 'لحظة…' : noSponsor ? 'قبول واعتماد دون راعٍ' : why ? 'قبول واعتماد' : 'قبول وطلب تأييد الراعي'}</button>
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
          {/* D05: مصدر واحد هو التقييم الختامي (معادلة البرنامج نفسها)، لا نتيجة موازية */}
          <h3>التقييم الختامي</h3>
          <p className="la-muted">{lead?.frozen ? 'اللقطة المرفوعة للاعتماد' : 'الحساب الحي بمعادلة البرنامج'}{lead?.config_version != null ? ` · الإصدار ${lead.config_version}` : ''}. منه قرار الشهادة.</p>
          <p className="cps-big">{lead?.score ?? '·'}<small> من 100</small></p>
          <table className="la-table"><tbody>
            {(lead?.components || []).map((x) => <tr key={x.key}><td>{x.label}</td><td>{x.weight}%</td><td>{x.value ?? 'لم يُقس'}</td></tr>)}
          </tbody></table>
          {c.review_note && <><h3>خلاصتك</h3><p>{c.review_note}</p></>}
          {c.sponsor_note && <><h3>ملاحظة الراعي</h3><p>{c.sponsor_note}</p></>}
          {c.sponsor_waived && <p className="la-muted">اعتُمدت دون تأييد الراعي: {c.sponsor_waived}</p>}
        </section>
      </div>

      {c.status === 'submitted' && <Review d={d} canWrite={canWrite} onSaved={(r) => setD({ ...r, participant_id: id })} onFailed={load} />}
      {c.status === 'approved' && <TrackingPanel t={d.doc.tracking} />}
      {c.status === 'accepted' && <Sponsor d={d} canWrite={canWrite} onSaved={(r) => setD({ ...r, participant_id: id })} />}
    </div>
  );
}

// الوثائق كلها مرة واحدة والفلترة في المتصفح (شريط الفلترة الموحد)، وتبدأ بما ينتظر القرار
const CAP_PRESETS = FILTERS.map(([k, l]) => ({ key: k, label: l, test: (x) => x.status === k }));
const CAP_COLS = [
  { key: 'name', label: 'المبادرة', width: 34, get: (x) => x.initiative }, { key: 'lead', label: 'القائد', width: 26, get: (x) => x.full_name },
  { key: 'org', label: 'الجهة', width: 24, get: (x) => x.organization }, { key: 'scope', label: 'النوع', width: 10, get: (x) => SCOPE[x.scope] },
  { key: 'status', label: 'الحالة', width: 18, get: (x) => STATUS[x.status] }, { key: 'sponsor', label: 'الراعي', width: 16, get: (x) => SPONSOR[x.sponsor_status] },
  { key: 'ready', label: 'الجاهزية %', width: 12, get: (x) => x.readiness }, { key: 'score', label: 'المعيار', width: 10, get: (x) => x.score },
  { key: 'health', label: 'صحة التنفيذ', width: 16, get: (x) => x.tracking?.health_title }, { key: 'at', label: 'سُلّمت', width: 16, get: (x) => date(x.submitted_at) },
];
const CAP_SORTS = {
  name: (x) => x.initiative, lead: (x) => x.full_name, org: (x) => x.organization, scope: (x) => SCOPE[x.scope],
  status: (x) => STATUS[x.status], ready: (x) => x.readiness, score: (x) => x.score, at: (x) => x.submitted_at,
};

export default function Capstones({ canWrite, capId, onOpen, onPerson }) {
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'org', 'scope', 'sort'], {}, { scope: 'capstones', defaults: { view: 'submitted' } });
  const [list, setList] = useState(null);
  useEffect(() => { if (!capId) L('admin.capstones', {}).then(setList); }, [capId]);
  const all = (list?.success && list.capstones) || [];
  const fields = useMemo(() => [
    { key: 'org', label: 'الجهات', get: (x) => x.organization || '', options: [...new Set(all.map((x) => x.organization).filter(Boolean))].sort().map((o) => [o, o]) },
    { key: 'scope', label: 'الأنواع', get: (x) => x.scope, options: Object.entries(SCOPE) },
  ], [all]);
  const rows = useMemo(() => sortRows(applyFilters(all, { fields, presets: CAP_PRESETS, text: (x) => [x.initiative, x.full_name, x.organization].join(' ') }, f), CAP_SORTS, f.sort), [all, f, fields]);
  if (capId) return <Detail id={capId} canWrite={canWrite} onBack={() => onOpen(null)} onPerson={onPerson} />;
  return (
    <section className="la-card">
      <h3>مشاريع التخرج: وثائق المبادرات</h3>
      <p className="la-muted">فصول كل وثيقة نماذج تعليمية يقيّمها المستشار منفردة في «كتيب القائد». هنا قرار الوثيقة كاملة: إعادة للتحسين مرة، أو قبول بالمعيار ثم تأييد الراعي.</p>
      {list?.success && <FilterBar scope="capstones" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={CAP_PRESETS} counts={presetCounts(all, CAP_PRESETS)}
        shown={rows.length} total={all.length} noun="وثيقة" placeholder="ابحث بالمبادرة أو القائد أو الجهة"
        actions={<ExportButton scope="capstones" meta={{ kind: 'CAP', title: 'مشاريع التخرج', sheet: 'المبادرات', file: 'Capstones' }} columns={CAP_COLS} all={all} filtered={rows} noun="وثيقة" />} />}
      {!list ? <Spinner /> : !list.success ? <div className="la-err">{list.message}</div> : !rows.length ? <Empty compact title={all.length ? 'لا وثائق لهذه الفلاتر' : 'لا وثائق بعد'} hint={all.length ? 'غيّر الحالة من الأعلى لترى ما هو قيد البناء أو المعتمد.' : 'تظهر هنا وثيقة كل قائد حين يبدأ بناءها.'} /> : (
        <table className="la-table">
          <thead><tr><SortTh k="name" state={f} set={setF}>المبادرة</SortTh><SortTh k="lead" state={f} set={setF}>القائد</SortTh><SortTh k="org" state={f} set={setF}>الجهة</SortTh><SortTh k="scope" state={f} set={setF}>النوع</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh><SortTh k="ready" state={f} set={setF}>الجاهزية</SortTh><SortTh k="score" state={f} set={setF}>المعيار</SortTh><SortTh k="at" state={f} set={setF}>سُلّمت</SortTh></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.participant_id}>
              <td><button className="la-link" onClick={() => onOpen(x.participant_id)}>{x.initiative || 'بلا اسم'}</button></td>
              <td>{x.full_name}</td><td>{x.organization || '·'}</td><td>{SCOPE[x.scope] || '·'}</td>
              <td><span className={`la-chip ${CHIP[x.status] || ''}`}>{STATUS[x.status]}</span>{x.sponsor_status && x.status === 'accepted' ? <small className="la-muted"> · {SPONSOR[x.sponsor_status]}</small> : null}{x.tracking && <> <span className={`la-chip ${HEALTH_CHIP[x.tracking.health] || ''}`}>{x.tracking.health_title}</span></>}</td>
              <td>{x.readiness != null ? `${x.readiness}%` : '·'}</td><td>{x.score ?? '·'}</td><td>{date(x.submitted_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
