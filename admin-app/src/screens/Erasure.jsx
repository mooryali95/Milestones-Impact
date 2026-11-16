// ════════════════════════════════════════════════════════════════
// طلب حذف البيانات في الإدارة: الشريط أعلى القائمة، والبطاقة أعلى ملف المشارك، وورقة القرار (تصور 2026-11-16)
// ════════════════════════════════════════════════════════════════
// الورقة الموضع الواحد للقرار: من طلب، ومتى، وكم بقي، ولماذا، والخيارات الثلاثة وأثر كل منها. القرار للمدير الأعلى،
// وغيره يقرأ ويراسل. نصوص ما يُحذف وما يبقى والأسباب من erasure.js، المصدر الواحد مع بريد المشارك.
import React, { useState } from 'react';
import { L } from '../leaders.js';
import { date, dateTime } from '../dates.js';
import { deleteFollowUp } from '../erase-follow.js';
import { useEscape, useGuardedClose, useUI } from '../ui.jsx';
import {
  bannerAr, ERASE_DELETED, ERASE_GROUNDS, ERASE_KEPT, ERASE_NOTE_MIN, ERASE_STATUS_AR, leftAr, nameMatches, WITHDRAW_NOTE_MIN, WITHDRAW_VIA,
} from '../../../supabase/functions/leaders-api/erasure.js';

// طلب فتح الورقة عند الوصول إلى الملف من الشريط (المسار يُبدَّل قبل أن يُركَّب الملف)
const OPEN_KEY = 'mi_erasure_open';
export function askOpen(id) { try { sessionStorage.setItem(OPEN_KEY, id); } catch { /* تخزين محجوب: يفتح الملف وتبقى البطاقة */ } }
export function takeOpen(id) {
  try { if (sessionStorage.getItem(OPEN_KEY) !== id) return false; sessionStorage.removeItem(OPEN_KEY); return true; } catch { return false; }
}

/** الشريط أعلى قائمة المشاركين: يقول ماذا تفعل، وزر لكل طلب يفتح ورقته */
export function ErasureBanner({ data, isSuper, onOpen }) {
  if (!data) return null;
  if (data.ready === false) {
    return isSuper ? <div className="er-banner off" role="status">سجل طلبات الحذف غير مفعّل، فطلبات المشاركين تصلك بالبريد ولا تُتتبع هنا. فعّله بسير الترحيلات.</div> : null;
  }
  const items = data.items || [];
  const b = bannerAr(items, { decide: !!isSuper });
  if (!b) return null;
  const go = (id) => { askOpen(id); onOpen(id); };
  return (
    // منطقة معنونة لا role=alert: الشريط يُركَّب من جديد مع كل تحميل للقائمة، فالتنبيه كان يقاطع قارئ الشاشة في كل بحث
    <section className={`er-banner ${b.tone}`} aria-label="طلبات حذف البيانات">
      <p>{b.text}</p>
      {items.length === 1 ? (
        <button type="button" className="btn-sm primary" onClick={() => go(items[0].participant_id)}>افتح الطلب</button>
      ) : (
        <ul>{[...items].sort((x, y) => x.days_left - y.days_left).map((e) => (
          <li key={e.id}><b>{e.name || e.email}</b><small>{leftAr(e.days_left)}</small>
            <button type="button" className="btn-sm ghost" onClick={() => go(e.participant_id)}>افتح الطلب</button></li>
        ))}</ul>
      )}
    </section>
  );
}

/** البطاقة الثابتة أعلى ملف المشارك ما دام الطلب قائمًا، في كل تبويب */
export function ErasureCard({ e, onOpen }) {
  const r = e?.request;
  if (!r) return null;
  return (
    <section className={`la-card er-card ${r.urgency}`} aria-labelledby="er-card-h">
      <div className="er-card-head">
        <h3 id="er-card-h">طلب حذف بيانات</h3>
        <span className={`la-chip ${r.urgency === 'late' ? 'bad' : 'warn'}`}>{r.urgency === 'late' ? 'متأخر' : e.can_decide ? 'ينتظر قرارك' : 'ينتظر قرار المدير الأعلى'}</span>
      </div>
      <dl className="er-facts">
        <div><dt>استُلم</dt><dd>{date(r.created_at)}</dd></div>
        <div><dt>المهلة</dt><dd>{date(r.due_at)}</dd></div>
        <div className="er-left"><dt>المتبقي</dt><dd>{leftAr(r.days_left)}</dd></div>
        <div><dt>السبب</dt><dd>{r.reason || 'لم يذكر سببًا'}</dd></div>
      </dl>
      <button type="button" className="btn-sm primary" onClick={onOpen}>{e.can_decide ? 'افتح الطلب واتخذ القرار' : 'افتح الطلب'}</button>
    </section>
  );
}

/** سطر في تبويب «السجل» بعد إغلاق الطلب */
export function ErasureLogLine({ last }) {
  if (!last) return null;
  const why = last.status === 'rejected' && last.ground ? ` (${ERASE_GROUNDS[last.ground]?.ar || last.ground})` : last.status === 'cancelled' && last.withdrawn_via ? ` (أبلغ ${WITHDRAW_VIA[last.withdrawn_via]})` : '';
  return <p className="la-muted er-log">طلب حذف بيانات استُلم {date(last.created_at)}، {ERASE_STATUS_AR[last.status] || last.status}{last.decided_at ? ` في ${date(last.decided_at)}` : ''}{why}.</p>;
}

const countLine = (c) => [
  c.assessments && `${c.assessments} قياس`, c.submissions && `${c.submissions} نموذج`, c.capstones && `${c.capstones} وثيقة مبادرة`,
  c.requirements && `${c.requirements} متطلب`, c.sessions && `${c.sessions} جلسة دخول`, c.certificates && `${c.certificates} شهادة`,
].filter(Boolean).join('، ');

/** ورقة الطلب: من، والتوقيت، والسبب، والخط الزمني، وثلاثة إجراءات كل منها بأثره */
export function ErasureSheet({ e, onClose, onDecided, onDeleted }) {
  const { toast, confirm } = useUI();
  const [mode, setMode] = useState(null);   // execute | decline | withdrawn
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [ground, setGround] = useState('');
  const [note, setNote] = useState('');
  const [via, setVia] = useState('');
  // ما كُتب (توضيح الرفض، ما قاله المشارك، الاسم للتأكيد) لا يضيع بنقرة خارج الورقة أو Esc دون سؤال
  const dirty = !!(typed.trim() || note.trim());
  const close = useGuardedClose(dirty, onClose);
  useEscape(() => !busy && close(), true);
  const r = e.request;
  const p = e.participant || {};
  const c = e.counts || {};
  const can = !!e.can_decide && !(e.blockers || []).length;
  const pct = Math.min(100, Math.max(0, Math.round(((30 - Math.max(r.days_left, 0)) / 30) * 100)));
  const pick = (m) => { setMode(m); setTyped(''); setNote(''); setGround(''); setVia(''); };

  const run = async (action, body, done) => {
    setBusy(true);
    const x = await L(action, { request_id: r.id, ...body });
    setBusy(false);
    if (!x.success) return toast(x.message);
    await done(x);
  };
  const execute = () => run('admin.erasure-execute', { confirm_name: typed }, async (x) => {
    const follow = deleteFollowUp(x);
    if (follow) await confirm(follow, { ok: 'فهمت' }); else toast('نُفّذ الطلب وأُبلغ المشارك');
    onDeleted();
  });
  const unsent = (x, ok) => (x.mailed ? toast(ok) : confirm(`حُفظ القرار، ولم تصله الرسالة. أرسلها بنفسك إلى ${x.email}.`, { ok: 'فهمت' }));
  const decline = () => run('admin.erasure-decline', { ground, note }, async (x) => { await unsent(x, 'رُفض الطلب وأُبلغ المشارك بالسبب'); onDecided(); });
  const withdrawn = () => run('admin.erasure-withdrawn', { via, note }, async (x) => { await unsent(x, 'أُغلق الطلب ووصله تأكيد السحب'); onDecided(); });
  // الطول بعد ضم المسافات كما يحسبه الخادم (cleanNote)، فلا يُفعَّل الزر ثم يرفضه الخادم
  const len = note.replace(/\s+/g, ' ').trim().length;
  const noteMin = ground === 'other' ? ERASE_NOTE_MIN : 0;
  const noteOk = len >= noteMin;
  const withdrawOk = len >= WITHDRAW_NOTE_MIN;

  return (
    <div className="mid-ov" onMouseDown={(ev) => ev.target === ev.currentTarget && !busy && close()}>
      <div className="la-form mi-form bulk-approve er-sheet" role="dialog" aria-modal="true" aria-labelledby="er-sheet-h">
        <h3 id="er-sheet-h">طلب حذف بيانات: {p.full_name}</h3>
        <div className="ba-body">
          <section aria-label="من">
            <p><b>{p.full_name}</b> · <span dir="ltr">{p.email}</span>{' '}
              <button type="button" className="la-link" onClick={() => navigator.clipboard?.writeText(p.email).then(() => toast('نُسخ البريد'), () => {})}>انسخ البريد</button></p>
          </section>
          <section aria-label="التوقيت" className="er-time">
            <p>استُلم {date(r.created_at)}، والمهلة النظامية {date(r.due_at)}. <b>{leftAr(r.days_left)}</b>.</p>
            <div className={`er-bar ${r.urgency}`} role="progressbar" aria-label="ما مضى من المهلة" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ inlineSize: `${pct}%` }} /></div>
          </section>
          <section aria-label="السبب"><p><b>سببه:</b> {r.reason || 'لم يذكر سببًا'}</p></section>
          <details className="er-tl">
            <summary>الخط الزمني ({(e.timeline || []).length})</summary>
            <ol>{(e.timeline || []).map((t, i) => <li key={i}><small>{dateTime(t.at)}</small> {t.text}{t.by ? ` (${t.by})` : ''}</li>)}</ol>
          </details>

          {(e.blockers || []).length > 0 && <p className="la-err" role="alert">{e.blockers.join('، ')}</p>}
          {!e.can_decide && (
            <p className="la-where" role="note">القرار للمدير الأعلى بمفتاح المرور أو تطبيق المصادقة. لك أن تقرأ الطلب وتراسل المشارك.{' '}
              <a className="la-link" href={`mailto:${p.email}`}>راسل المشارك</a></p>
          )}

          {!mode && (
            <div className="er-actions" role="group" aria-label="القرار">
              <button type="button" className="er-act danger" disabled={!can} onClick={() => pick('execute')}>
                <b>نفّذ الحذف</b><small>يُمحى حسابه وملفاته وشهادته، ويُبلَّغ بالبريد.</small></button>
              <button type="button" className="er-act" disabled={!e.can_decide} onClick={() => pick('decline')}>
                <b>ارفض مع السبب</b><small>يبقى حسابه، ويصله السبب وحقه في الشكوى.</small></button>
              <button type="button" className="er-act" disabled={!e.can_decide} onClick={() => pick('withdrawn')}>
                <b>تواصلت معه وسحب الطلب</b><small>استعمله إذا طلب منك المشارك بنفسه إلغاء طلبه. يبقى حسابه ويصله تأكيد.</small></button>
            </div>
          )}

          {mode === 'execute' && (
            <section className="er-step" aria-label="تنفيذ الحذف">
              <h4>ما يُحذف</h4>
              <ul>{ERASE_DELETED.map((x) => <li key={x}>{x}</li>)}</ul>
              {countLine(c) && <p className="la-muted">منها في ملفه الآن: {countLine(c)}.</p>}
              <h4>ما يبقى نظامًا</h4>
              <ul>{ERASE_KEPT.map((k) => <li key={k.key}><b>{k.title}:</b> {k.text}{k.key === 'payments' && c.payments ? ` (${c.payments} في ملفه)` : ''}</li>)}</ul>
              <label className="field"><span>للتأكيد اكتب اسم المشارك كما يظهر في ملفه: <b>{p.full_name}</b></span>
                <input aria-label="اكتب اسم المشارك للتأكيد" value={typed} onChange={(ev) => setTyped(ev.target.value)} autoComplete="off" /></label>
            </section>
          )}

          {mode === 'decline' && (
            <section className="er-step" aria-label="رفض الطلب">
              <p className="la-where" role="note">الأصل تنفيذ الطلب مع الاحتفاظ بما يوجبه النظام. الرفض الكلي استثناء.</p>
              <fieldset><legend>سبب الرفض</legend>
                {Object.entries(ERASE_GROUNDS).map(([k, g]) => (
                  <label key={k} className="er-radio"><input type="radio" name="er-ground" value={k} checked={ground === k} onChange={() => setGround(k)} />
                    <span>{g.ar}{g.basis && <small>{g.basis}</small>}</span></label>
                ))}
              </fieldset>
              <label className="field"><span>توضيح يصل المشارك {ground === 'other' ? `(إلزامي، ${ERASE_NOTE_MIN} أحرف على الأقل)` : '(اختياري)'}</span>
                <textarea rows={3} maxLength={1000} value={note} onChange={(ev) => setNote(ev.target.value)} aria-describedby={noteMin ? 'er-note-hint' : undefined} /></label>
              {noteMin > 0 && <p id="er-note-hint" className={`la-muted er-hint${len && !noteOk ? ' short' : ''}`} aria-live="polite">{noteOk ? 'يكفي.' : `كتبت ${len} من ${noteMin} أحرف على الأقل.`}</p>}
              <p className="la-muted">يصله بريد «ردنا على طلب حذف بياناتك» فيه السبب وأساسه وتوضيحك، وأن له إعادة الطلب متى زال السبب، وحقه في الشكوى إلى سدايا.</p>
            </section>
          )}

          {mode === 'withdrawn' && (
            <section className="er-step" aria-label="إغلاق بسحب المشارك">
              <fieldset><legend>كيف أبلغك بسحب طلبه؟</legend>
                {Object.entries(WITHDRAW_VIA).map(([k, l]) => (
                  <label key={k} className="er-radio"><input type="radio" name="er-via" value={k} checked={via === k} onChange={() => setVia(k)} /><span>{l}</span></label>
                ))}
              </fieldset>
              <label className="field"><span>ما قاله باختصار (إلزامي، {WITHDRAW_NOTE_MIN} أحرف على الأقل)</span>
                <textarea rows={2} maxLength={1000} value={note} onChange={(ev) => setNote(ev.target.value)} aria-describedby="er-withdraw-hint" /></label>
              <p id="er-withdraw-hint" className={`la-muted er-hint${len && !withdrawOk ? ' short' : ''}`} aria-live="polite">{withdrawOk ? 'يكفي.' : `كتبت ${len} من ${WITHDRAW_NOTE_MIN} أحرف على الأقل.`}</p>
              <p className="la-muted">يصله بريد «أُغلق طلب حذف بياناتك بناءً على طلبك» مع رابط ملفه إن أراد إعادته.</p>
            </section>
          )}
        </div>
        <div className="la-row between ba-foot">
          <button type="button" className="btn-sm ghost" disabled={busy} onClick={() => (mode ? setMode(null) : close())}>{mode ? 'رجوع' : 'إغلاق'}</button>
          {mode === 'execute' && <button type="button" className="btn-sm danger" disabled={busy || !nameMatches(typed, p.full_name)} onClick={execute}>{busy ? 'يُنفَّذ…' : 'نفّذ الحذف نهائيًا'}</button>}
          {mode === 'decline' && <button type="button" className="btn-sm primary" disabled={busy || !ground || !noteOk} onClick={decline}>{busy ? 'يُرسل…' : 'ارفض وأبلغه'}</button>}
          {mode === 'withdrawn' && <button type="button" className="btn-sm primary" disabled={busy || !via || !withdrawOk} onClick={withdrawn}>{busy ? 'يُرسل…' : 'أغلق الطلب وأبلغه'}</button>}
        </div>
      </div>
    </div>
  );
}
