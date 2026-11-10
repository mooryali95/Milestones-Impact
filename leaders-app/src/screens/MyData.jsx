// ════════════════════════════════════════════════════════════════
// بياناتي: نسخة من بيانات المشارك، وطلب حذفها (خدمة ذاتية)
// ════════════════════════════════════════════════════════════════
// تُعرض تحت الملف الشخصي بعد إكماله. الحذف طلب ينفذه المدير العام خلال المهلة، ويُسحب من هنا قبل تنفيذه.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';

const day = (iso) => new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });

function saveJson(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MyData({ me }) {
  const email = me.participant.email;
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { call('me.privacy').then((r) => { if (r.success && typeof r.exports_left === 'number') setSt(r); }); }, []);
  if (!st || me.participant.is_demo) return null;

  const run = async (action, body, done) => {
    setBusy(true); setMsg(null);
    const r = await call(action, body);
    setBusy(false);
    if (!r.success) { setMsg({ err: true, text: r.message || 'تعذّر تنفيذ الطلب، حاول بعد قليل' }); return; }
    done(r);
  };
  const download = () => run('me.export', {}, (r) => {
    saveJson(`milestone-impact-my-data-${new Date().toISOString().slice(0, 10)}.json`, r.export);
    setSt((s) => ({ ...s, exports_left: Math.max(0, s.exports_left - 1) }));
    setMsg({ text: 'نزّلنا نسخة بياناتك على جهازك. احفظها في مكان آمن، ففيها بياناتك الشخصية.' });
  });
  const request = (e) => { e.preventDefault(); run('me.erase-request', { confirm_email: typed, reason }, (r) => {
    setSt((s) => ({ ...s, erase: r.erase })); setAsking(false); setTyped(''); setReason('');
    setMsg({ text: 'سجّلنا طلبك، ووصلك تأكيد على بريدك.' });
  }); };
  const cancel = () => run('me.erase-request', { cancel: true }, () => { setSt((s) => ({ ...s, erase: null })); setMsg({ text: 'سحبنا طلب الحذف، وحسابك باقٍ كما هو.' }); });

  return (
    <section className="card stack my-data" aria-labelledby="my-data-title">
      <h2 id="my-data-title">بياناتي</h2>
      <p className="small muted">بياناتك ملكك: نزّل نسخة منها متى شئت، أو اطلب حذفها.</p>
      {msg && <div className={`alert small ${msg.err ? 'err' : 'ok'}`} role={msg.err ? 'alert' : 'status'}>{msg.text}</div>}

      <div className="row between" style={{ gap: '.75rem', flexWrap: 'wrap' }}>
        <div><b>نسخة من بياناتي</b>
          <br /><small className="muted">ملف واحد فيه ملفك وقياسك وتقدمك وكل ما سجّلته المنصة عنك. {st.exports_left > 0 ? `بقي لك اليوم ${st.exports_left}.` : 'بلغت حد اليوم، وتتاح نسخة جديدة غدًا.'}</small></div>
        <button type="button" className="btn ghost sm" disabled={busy || st.exports_left <= 0} onClick={download}>نزّل النسخة</button>
      </div>

      {st.erase ? (
        <div className="alert small" role="status">
          <b>طلب حذف قائم</b> منذ {day(st.erase.created_at)}. ننفذه في موعد أقصاه {day(st.erase.due_at)}، ويصلك تأكيد على بريدك.
          <br /><button type="button" className="link small" disabled={busy} onClick={cancel}>اسحب الطلب وأبقِ حسابي</button>
        </div>
      ) : !st.erase_ready ? (
        <p className="small muted">لحذف حسابك وبياناتك راسلنا على <span className="ltr">{st.contact}</span> وننفذ طلبك خلال {st.reply_days} يومًا.</p>
      ) : !asking ? (
        <div className="row between" style={{ gap: '.75rem', flexWrap: 'wrap' }}>
          <div><b>حذف حسابي وبياناتي</b>
            <br /><small className="muted">ننفذه خلال {st.reply_days} يومًا، ولك سحب الطلب قبل تنفيذه. بعد التنفيذ لا تُسترد البيانات.</small></div>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setAsking(true); setMsg(null); }}>اطلب الحذف</button>
        </div>
      ) : (
        <form className="stack" onSubmit={request}>
          <p className="small"><b>ما الذي يُحذف؟</b> ملفك وقياسك وتقدمك ومبادرتك وشهادتك إن صدرت. يبقى ما يُلزمنا النظام بحفظه (سجلات الدفع) للمدة النظامية وحدها.</p>
          <label className="field"><span>سبب الطلب <em>(اختياري)</em></span>
            <input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <label className="field"><span>للتأكيد اكتب بريدك: <span className="ltr">{email}</span></span>
            <input className="input ltr" type="email" required autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          <div className="row" style={{ gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn sm" disabled={busy || typed.trim().toLowerCase() !== String(email).toLowerCase()}>أرسل طلب الحذف</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setAsking(false); setTyped(''); }}>تراجع</button>
          </div>
        </form>
      )}
    </section>
  );
}
