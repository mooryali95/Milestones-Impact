// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» H3: سجل المحادثات لتتبع أي مشكلة (قرار المالك v8)
// ════════════════════════════════════════════════════════════════
// القراءة للمالك دائمًا وللمدير الأعلى بمنح المالك، والخادم يفحص ذلك حيًا في كل طلب ويسجّل كل فتح (guide-transcripts.ts).
// هنا: القائمة في تبويب «التوجيه والإرشاد»، وزر المحادثة في ملف المشارك، ومنح المالك في «الإتاحة» تحت «المساعد الذكي».
import React, { useEffect, useState } from 'react';
import { dateTime as date, L } from './leaders.js';
import { Spinner, useUI } from './ui.jsx';
import { dollars, Switch } from './ai-ui.jsx';
import { countAr } from '../../supabase/functions/leaders-api/labels.js';
import './agent-admin.css';

const VERDICT_AR = { answered: 'أجاب', unsure: 'لم يتأكد', refused: 'رفض', error: 'تعذّر' };
const CONTEXT_AR = { program: 'الرحلة', handbook: 'الكتاب', capstone: 'المبادرة' };
const usd = (n) => (n == null ? '' : dollars(n));

// حالة الصلاحية مرة لكل تحميل للوحة: الخادم يفحصها حية على كل حال، وهذا لإظهار الزر أو إخفائه فقط
let accessOnce = null;
export const transcriptAccess = () => (accessOnce ||= L('admin.guide-transcript-access').then((r) => (r?.success ? r : { can_read: false })).catch(() => ({ can_read: false })));
export const resetTranscriptAccess = () => { accessOnce = null; };

export function TranscriptView({ pid }) {
  const [t, setT] = useState(null);
  useEffect(() => { L('admin.guide-transcript', { participant_id: pid }).then(setT); }, [pid]);
  if (!t) return <Spinner />;
  if (!t.success) return <p className="la-err">{t.message}</p>;
  if (!t.messages.length) return <p className="la-muted small">لا محادثة في آخر {t.retention_days} يومًا.</p>;
  const cost = t.messages.reduce((s, m) => s + (m.usd || 0), 0);
  return (
    <div className="gd-transcript" data-transcript={pid}>
      <p className="la-muted small">
        {t.messages.length} رسالة في آخر {t.retention_days} يومًا، وكلفتها {usd(cost)}. فتحك لها مسجَّل باسمك.
        {t.truncated ? ' تُعرض أول ألف رسالة.' : ''}
      </p>
      <ol className="gd-msgs">
        {t.messages.map((m) => (
          <li key={m.id} className={`gd-msg gd-${m.role}${m.hidden_at ? ' gd-hidden' : ''}`} data-msg-role={m.role}>
            <div className="gd-msg-meta">
              <b>{m.role === 'user' ? 'المشارك' : 'المساعد'}</b>
              <span>{date(m.created_at)}</span>
              <span>{CONTEXT_AR[m.context] || m.context}{m.chapter_id ? ` · باب ${m.chapter_id}` : ''}</span>
              {m.verdict && <span className="la-chip">{VERDICT_AR[m.verdict] || m.verdict}</span>}
              {m.confirmed_at && <span className="la-chip">طلب التأكد من خبير</span>}
              {m.hidden_at && <span className="la-chip" data-hidden>أخفاها المشارك {date(m.hidden_at)}</span>}
            </div>
            <p className="gd-msg-body">{m.body}</p>
            {m.role === 'assistant' && <FlagReply m={m} question={questionBefore(t.messages, m)} />}
            {m.role === 'assistant' && (m.model || m.cost_micros != null) && (
              <p className="gd-msg-tech">
                {m.model && <bdi dir="ltr">{m.model}</bdi>}{m.input_tokens != null ? ` · دخل ${m.input_tokens}` : ''}{m.cache_read_tokens ? ` (مخزّن ${m.cache_read_tokens})` : ''}
                {m.output_tokens != null ? ` · خرج ${m.output_tokens}` : ''}{m.usd != null ? ` · ${usd(m.usd)}` : ''}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// السؤال الذي سبق الرد في المحادثة نفسها
const questionBefore = (list, m) => [...list.slice(0, list.indexOf(m))].reverse().find((x) => x.role === 'user')?.body || '';

// H4: «رد غير دقيق» يصير حالة في مسودة مجموعة التقييم. السؤال قابل للتعديل لإزالة ما يدل على صاحبه قبل الحفظ،
// والخادم يحجب البريد والرقم والرابط والهوية مرة أخرى، ولا يحفظ معرّف المشارك ولا اسمه في المجموعة
const FLAG_KINDS = [['answer', 'كان يجب أن يجيب'], ['unsure', 'كان يجب أن يقول «لست متأكدًا»'], ['refuse_model', 'كان يجب أن يعتذر']];
function FlagReply({ m, question, label = 'رد غير دقيق' }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ question, kind: 'answer', reference_ar: '', must_include: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  if (done) return <p className="la-muted small" data-flagged>أُضيفت الحالة {done} إلى مسودة مجموعة التقييم. راجعها واعتمدها من «الدقة».</p>;
  if (!open) return <button type="button" className="btn-sm ghost" onClick={() => setOpen(true)} data-flag-open>{label}</button>;
  const save = async () => {
    setBusy(true);
    const r = await L('admin.guide-flag', { message_id: m.id, ...f, must_include: f.must_include.split('\n') });
    setBusy(false);
    if (!r.success) { toast(r.message); return; }
    setDone(r.case_id);
    toast(r.new_draft ? `أُضيفت الحالة ${r.case_id} في مسودة جديدة ${r.version}` : `أُضيفت الحالة ${r.case_id}`);
  };
  return (
    <div className="gd-flag" role="group" aria-label="حالة تقييم من هذا الرد">
      <p className="la-muted small">يصير هذا الرد حالة في مجموعة التقييم، فيُختبر المساعد عليها قبل كل إطلاق. احذف من السؤال أي ما يدل على المشارك.</p>
      <label className="of-field"><span className="of-label">السؤال</span>
        <textarea rows={3} maxLength={600} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></label>
      <label className="of-field"><span className="of-label">ما كان يجب أن يفعله</span>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{FLAG_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="of-field"><span className="of-label">الإجابة الصحيحة المرجعية</span>
        <textarea rows={3} maxLength={2000} value={f.reference_ar} onChange={(e) => setF({ ...f, reference_ar: e.target.value })} /></label>
      <label className="of-field"><span className="of-label">ما يجب أن يرد في الإجابة (سطر لكل عبارة)</span>
        <textarea rows={2} value={f.must_include} onChange={(e) => setF({ ...f, must_include: e.target.value })} /></label>
      <div className="la-row">
        <button type="button" className="btn-sm primary" disabled={busy || !f.question.trim()} onClick={save}>أضفها إلى مجموعة التقييم</button>
        <button type="button" className="btn-sm ghost" onClick={() => setOpen(false)}>إلغاء</button>
      </div>
    </div>
  );
}

// زر في ملف المشارك: يظهر لمن يملك القراءة وحده، والمحادثة تُحمَّل عند الفتح فقط
export function GuideTranscriptButton({ pid }) {
  const [acc, setAcc] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { transcriptAccess().then(setAcc); }, []);
  if (!acc?.can_read) return null;
  return (
    <div className="gd-file-transcript">
      <button type="button" className="btn-sm ghost" aria-expanded={open} onClick={() => setOpen((x) => !x)} data-open-transcript>
        {open ? 'أغلق المحادثة' : 'اعرض محادثته مع المساعد'}
      </button>
      {open && <TranscriptView pid={pid} />}
    </div>
  );
}

// القائمة في تبويب «التوجيه والإرشاد»
export function GuideConversations() {
  const [acc, setAcc] = useState(null);
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { transcriptAccess().then((a) => { setAcc(a); if (a.can_read) L('admin.guide-transcripts').then(setList); }); }, []);
  if (!acc) return <Spinner />;
  if (!acc.can_read) return <p className="la-muted small" data-transcripts-locked>{acc.message || 'سجل المحادثات للمالك، وللمدير الأعلى بصلاحية يمنحها المالك.'}</p>;
  if (!list) return <Spinner />;
  if (!list.success) return <p className="la-err">{list.message}</p>;
  if (!list.conversations.length) return <p className="la-muted small">لا محادثات في آخر {list.retention_days} يومًا.</p>;
  const needle = q.trim().toLowerCase();
  const rows = needle ? list.conversations.filter((c) => [c.name, c.email, c.org].some((x) => String(x || '').toLowerCase().includes(needle))) : list.conversations;
  return (
    <div data-conversations>
      <label className="of-field"><span className="of-label">بحث بالاسم أو البريد أو الجهة</span><input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="gd-table-wrap">
        <table className="la-table">
          <thead><tr><th scope="col">المشارك</th><th scope="col">الجهة</th><th scope="col">أسئلة</th><th scope="col">لم يتأكد</th><th scope="col">تعذّر</th><th scope="col">الكلفة</th><th scope="col">آخر رسالة</th><th scope="col">المحادثة</th></tr></thead>
          <tbody>{rows.map((c) => (
            <React.Fragment key={c.participant_id}>
              <tr>
                <td>{c.name || c.email || '—'}{c.hidden ? <span className="la-chip" title="أخفى المشارك محادثته، والنسخة باقية حتى نهاية مدة الحفظ"> أخفاها</span> : null}</td>
                <td>{c.org || '—'}</td><td>{c.asked}</td><td>{c.unsure}</td><td>{c.errors}</td><td>{usd(c.usd)}</td><td>{date(c.last_at)}</td>
                <td><button type="button" className="btn-sm ghost" aria-expanded={openId === c.participant_id} onClick={() => setOpenId(openId === c.participant_id ? null : c.participant_id)}>{openId === c.participant_id ? 'أغلق' : 'افتح'}</button></td>
              </tr>
              {openId === c.participant_id && <tr><td colSpan={8}><TranscriptView pid={c.participant_id} /></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// منح المالك في «الإتاحة» تحت «المساعد الذكي»: المديرون الأعلون، وآخر من قرأ محادثة من
export function TranscriptGrants() {
  const { toast } = useUI();
  const [g, setG] = useState(null);
  const load = () => L('admin.guide-transcript-grants').then(setG);
  useEffect(() => { load(); }, []);
  if (!g) return <Spinner />;
  if (!g.success) return null; // لغير المالك: القسم لا يظهر أصلًا
  if (!g.ready) return <p className="la-muted small">سجل المحادثات لم يُرحَّل بعد.</p>;
  const flip = async (x, on) => {
    setG((s) => ({ ...s, admins: s.admins.map((y) => (y.id === x.id ? { ...y, granted: on } : y)) }));
    const r = await L('admin.guide-transcript-grant', { admin_id: x.id, on });
    if (!r.success) { toast(r.message); load(); return; }
    toast(on ? `يطّلع ${x.email} على المحادثات الآن` : `سُحب اطلاع ${x.email} على المحادثات`);
    load();
  };
  return (
    <div data-transcript-grants>
      {!g.admins.length ? <p className="la-muted small">لا مدير أعلى غيرك.</p> : (
        <ul className="gd-toggles">{g.admins.map((x) => (
          <li key={x.id}><Switch id={`gd-grant-${x.id}`} label={x.email} checked={!!x.granted} on="يطّلع" off="لا يطّلع" onChange={(on) => flip(x, on)}
            describedBy={x.granted && x.granted_at ? `gd-grant-${x.id}-d` : undefined}
            hint={x.granted && x.granted_at ? <small id={`gd-grant-${x.id}-d`} className="la-muted">منذ {date(x.granted_at)}</small> : null} /></li>
        ))}</ul>
      )}
      <h4 className="gd-sub">آخر من اطّلع</h4>
      {!g.reads.length ? <p className="la-muted small">لم يفتح أحد محادثة بعد.</p> : (
        <ul className="gd-reads">{g.reads.map((r, i) => (
          <li key={i}><b>{r.by}</b> فتح محادثة {r.name || 'مشارك محذوف'}{r.messages != null ? ` (${r.messages} رسالة)` : ''} <span className="la-muted small">{date(r.at)}</span></li>
        ))}</ul>
      )}
    </div>
  );
}

// المرحلة د: مراجعة الأسبوع للتعلم. ما لم يتأكد منه المساعد أو اعتذر عنه أو أوقفه الحارس أو طلب فيه المشارك خبيرًا،
// مجمّعًا بالموضع، ولكل حالة «رد غير دقيق» نفسه فتصير حالة تقييم بقرار المراجع. لا يتغير شيء آليًا
const REVIEW_REASON_AR = { guard: 'أوقفه الحارس', unsure: 'لم يتأكد', refused: 'اعتذر', confirmed: 'طلب خبيرًا' };
const pctAr = (x) => (x == null ? '—' : `${x}٪`);
function Delta({ now, prev, good = 'up' }) {
  if (now == null || prev == null || now === prev) return null;
  const up = now > prev;
  return <small className={(up === (good === 'up')) ? 'gd-delta ok' : 'gd-delta bad'}> ({up ? '+' : ''}{Math.round((now - prev) * 10) / 10} عن الأسبوع السابق)</small>;
}
export function WeeklyReview() {
  const [acc, setAcc] = useState(null);
  const [r, setR] = useState(null);
  const [openKey, setOpenKey] = useState(null);
  useEffect(() => { transcriptAccess().then(setAcc); }, []);
  if (!acc) return <Spinner />;
  if (!acc.can_read) return <p className="la-muted small" data-review-locked>{acc.message || 'مراجعة الأسبوع للمالك، وللمدير الأعلى بصلاحية يمنحها المالك.'}</p>;
  if (!r) return <button type="button" className="btn-sm primary" onClick={() => L('admin.guide-week').then(setR)} data-review-open>افتح مراجعة الأسبوع</button>;
  if (!r.success) return <p className="la-err">{r.message}</p>;
  const w = r.rates.week, p = r.rates.prev;
  return (
    <div className="stack" data-weekly-review>
      <p className="small">
        آخر {r.days} أيام: {countAr(w.replies, 'رد واحد', 'ردّان', 'ردود', 'ردًا')}، أجاب {pctAr(w.answered_pct)}<Delta now={w.answered_pct} prev={p.answered_pct} />،
        لم يتأكد {pctAr(w.unsure_pct)}<Delta now={w.unsure_pct} prev={p.unsure_pct} good="down" />،
        أوقفه الحارس {pctAr(w.guard_pct)}<Delta now={w.guard_pct} prev={p.guard_pct} good="down" />.
      </p>
      {!r.total ? <p className="la-muted small">لا حالة تستحق المراجعة هذا الأسبوع.</p> : <>
        <p className="la-muted small">
          {countAr(r.total, 'حالة واحدة', 'حالتان', 'حالات', 'حالة')}: {Object.entries(r.reasons).filter(([, n]) => n).map(([k, n]) => `${REVIEW_REASON_AR[k]} ${n}`).join('، ')}.
          {r.repeated ? ` ${countAr(r.repeated, 'سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالًا')} تكرر ثلاث مرات فأكثر، فهو أولى بالإضافة.` : ''} فتحك مسجَّل باسمك.
        </p>
        {r.groups.map((g) => (
          <details key={g.key} className="gd-review-group" open={openKey === g.key} onToggle={(e) => e.currentTarget.open && setOpenKey(g.key)}>
            <summary><b>{g.label}</b> <span className="la-chip">{g.cases.length}</span></summary>
            <ul className="gd-review-list">{g.cases.map((it) => (
              <li key={it.message_id} data-review-item={it.message_id}>
                <p className="gd-msg-body">{it.question || <span className="la-muted">(بلا سؤال في المحادثة)</span>}</p>
                <p className="la-muted small">
                  <span className="la-chip">{REVIEW_REASON_AR[it.reason]}</span>
                  {it.repeats > 1 && <span className="la-chip warn">تكرر {countAr(it.repeats, 'مرة', 'مرتين', 'مرات', 'مرة')}</span>} {date(it.at)}
                </p>
                <FlagReply m={{ id: it.message_id }} question={it.question} label="أضفها حالة تقييم" />
              </li>
            ))}</ul>
          </details>
        ))}
      </>}
    </div>
  );
}
