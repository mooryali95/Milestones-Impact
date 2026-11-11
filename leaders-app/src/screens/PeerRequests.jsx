// ════════════════════════════════════════════════════════════════
// طلبات التوجيه (المرحلة 8): يرفع المشارك سؤاله أو جزءًا من مشروعه، فيجيب فريقه ويؤكّد الخبير
// ════════════════════════════════════════════════════════════════
// مسار واحد بخيارين: طلب توجيه لفريقك وخبيرك (هنا)، أو استشارة خبير (بطاقة «اطلب استشارة»).
// نمط الإشراف من الدفعة: الأقران ويؤكّد الخبير، أو الخبير وحده، أو معًا. الإجابة غير المؤكدة
// تُعلَّم «بانتظار تأكيد الخبير»، والاسم يظهر على الإسهام.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';

const when = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' });
const CHIP = { open: '', answered: 'warn', confirmed: 'ok', closed: 'dark' };
const A_CHIP = { pending: 'warn', confirmed: 'ok', corrected: 'gold', hidden: 'dark' };

// compact: في رئيسية المشارك تُطوى القوائم على الشاشات الضيقة، فيبقى العنوان وزر الطلب وعدد ما ينتظر
export default function PeerRequests({ preset = null, onDone, compact = false }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(!!preset);
  const [text, setText] = useState(preset?.text || '');
  const [team, setTeam] = useState('');
  const [reply, setReply] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = () => call('peer.list').then(setD);
  useEffect(() => { load(); }, []);
  // الجولة الحيّة تطرح سؤالًا تجريبيًا من لوحتها، فتعيد القائمة التحميل عند إشارتها
  useEffect(() => { const on = () => load(); window.addEventListener('mi-tour-refresh', on); return () => window.removeEventListener('mi-tour-refresh', on); }, []);
  useEffect(() => { if (preset) { setOpen(true); setText(preset.text || ''); } }, [preset]);
  // رد غير متوقع (أو خلفية لا تعرف الإجراء بعد): لا بطاقة، لا تعطيل للصفحة
  if (!d?.success || !Array.isArray(d.items) || !d.teams) return null;

  const run = async (action, body, ok) => {
    setBusy(true); setMsg(null);
    const r = await call(action, body);
    setBusy(false);
    if (!r.success) { setMsg({ err: r.message }); return false; }
    setD(r); setMsg({ ok });
    return true;
  };
  const ask = async () => {
    if (await run('peer.ask', { text, source: preset?.source || 'free', ref_id: preset?.ref_id || null, target_team: team || null }, d.supervision === 'expert_only' ? `وصل طلبك إلى ${d.advisor || 'خبيرك'}.` : 'وصل طلبك إلى فريقك، ويؤكّد خبيرك ما يُجاب.')) { setText(''); setOpen(false); onDone?.(); }
  };
  const answer = async (r) => { if (await run('peer.answer', { request_id: r.id, text: reply[r.id] }, 'شكرًا لإسهامك؛ يُعرض على خبيرك للتأكيد ويُحسب لك بعده.')) setReply({ ...reply, [r.id]: '' }); };
  const mine = d.items.filter((x) => x.mine);
  const forMe = d.items.filter((x) => !x.mine && x.status !== 'closed');

  return (
    <section className="card stack pr" data-tour="peer" aria-labelledby="pr-h">
      <div className="row between">
        <h3 id="pr-h">طلبات التوجيه</h3>
        {!open && <button className="btn ghost sm" onClick={() => setOpen(true)}>اطلب توجيهًا</button>}
      </div>
      <p className="small muted">{d.supervision_ar}{d.team_ar ? ` · أنت في ${d.team_ar}` : ''}{d.advisor ? ` · مستشارك: ${d.advisor}` : ''}. ما يؤكّده الخبير من إسهامك لزملائك يُحسب لك في التقييم المستمر.</p>
      {msg?.ok && <div className="banner"><span className="ico">✓</span><div className="grow">{msg.ok}</div></div>}
      {msg?.err && <div className="alert err" role="alert">{msg.err}</div>}
      {open && (
        <div className="stack" style={{ gap: 8 }}>
          {preset?.label && <p className="small muted">بشأن: {preset.label}</p>}
          <label className="field"><span>سؤالك أو الجزء الذي تريد توجيهًا فيه</span>
            <textarea className="input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب ما يكفي ليفهم زميلك أو خبيرك ما تحتاجه" /></label>
          {d.supervision !== 'expert_only' && (
            <label className="field"><span>لمن</span>
              <select className="input" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">كل فرق دفعتي</option>
                {Object.entries(d.teams).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select></label>
          )}
          <div className="row"><button className="btn sm" disabled={busy || text.trim().length < 10} onClick={ask}>أرسل الطلب</button><button className="link small" onClick={() => { setOpen(false); onDone?.(); }}>إلغاء</button></div>
        </div>
      )}

      <ListFold on={compact && (mine.length + forMe.length) > 0} label={[mine.length && `طلباتي ${mine.length}`, forMe.length && `طلبات زملائي ${forMe.length}`].filter(Boolean).join(' · ')}>
      {mine.length > 0 && <ul className="pr-list" aria-label="طلباتي">{mine.map((r) => (
        <li key={r.id}>
          <div className="row between"><span><b>{r.source_ar}</b> ← {r.target_team_ar} <small className="muted">· {when(r.at)}</small></span><span className={`chip ${CHIP[r.status]}`}>{r.status_ar}</span></div>
          <p className="small">«{r.text}»</p>
          {r.answers.map((a) => <div key={a.id} className="pr-answer"><b>{a.author}</b>: {a.text} <span className={`chip ${A_CHIP[a.status]}`}>{a.status_ar}</span>{a.expert_note && <p className="small muted">ملاحظة الخبير: {a.expert_note}</p>}</div>)}
          {r.status !== 'closed' && <button className="link small" disabled={busy} onClick={() => window.confirm('يُغلق الطلب فلا يراه زملاؤك ولا تصله إجابات جديدة، ولا يُعاد فتحه. متابعة؟') && run('peer.close', { request_id: r.id }, 'أُغلق الطلب.')}>أغلق الطلب</button>}
        </li>
      ))}</ul>}

      {forMe.length > 0 && (
        <>
          <h4 className="small">طلبات زملائك</h4>
          <ul className="pr-list" aria-label="طلبات زملائي">{forMe.map((r) => (
            <li key={r.id}>
              <div className="row between"><span><b>{r.author}</b> <small className="muted">· {r.source_ar} ← {r.target_team_ar} · {when(r.at)}</small></span><span className={`chip ${CHIP[r.status]}`}>{r.status_ar}</span></div>
              <p className="small">«{r.text}»</p>
              {r.answers.map((a) => <div key={a.id} className="pr-answer"><b>{a.author}</b>: {a.text} <span className={`chip ${A_CHIP[a.status]}`}>{a.status_ar}</span>{a.expert_note && <p className="small muted">ملاحظة الخبير: {a.expert_note}</p>}</div>)}
              {r.can_answer && (
                <div className="row">
                  <textarea className="input" rows={2} maxLength={2000} aria-label={`إجابتك عن طلب ${r.author}`} placeholder="إجابتك أو تصورك" value={reply[r.id] || ''} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} />
                  <button className="btn ghost sm" disabled={busy || (reply[r.id] || '').trim().length < 10} onClick={() => answer(r)}>أجب</button>
                </div>
              )}
              {!r.can_answer && r.answer_block && r.status !== 'confirmed' && <small className="muted">{r.answer_block}</small>}
            </li>
          ))}</ul>
        </>
      )}
      </ListFold>
      {!mine.length && !forMe.length && !open && <p className="muted small">لا طلبات بعد. حين تحتاج توجيهًا في سؤال أو جزء من مشروعك، ارفعه هنا فيراه فريقك ويؤكّد خبيرك ما يُجاب.</p>}
    </section>
  );
}

// القوائم تحت عنوان يُفتح على الشاشات الضيقة، وظاهرة كما هي على الحاسب
function ListFold({ on, label, children }) {
  const [wide] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1119px)').matches));
  if (!on || wide) return children;
  return <details className="pr-more"><summary>{label}</summary>{children}</details>;
}
