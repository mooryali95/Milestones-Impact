// ════════════════════════════════════════════════════════════════
// بوابتا الخبير والمنسق: سطر الموافقة عند أول دخول (D18)، والمقيّمون بانتظار التأكيد (D19)
// ════════════════════════════════════════════════════════════════
// الموافقة تُسجَّل في السجل التاريخي بالنسخة وبصمة النص، وتُطلب مجددًا عند كل نسخة جوهرية.
// المقيّم المنتظر بريده عام أو من نطاق آخر أو مشاركه فردي: يؤكده المستشار أو المنسق فتُرسل دعوته، أو لا يعتمده بسبب يصل المشارك.
import React, { useState } from 'react';
import { LEGAL_PATH, POLICY_VERSION } from '../../supabase/functions/leaders-api/labels.js';

const TEXT = {
  expert: 'تطّلع في هذه البوابة على بيانات مشاركين (ملفاتهم ونماذجهم وتقييماتهم ومقيّميهم) لتؤدي دورك في البرنامج وحده. لا تنسخها خارج البوابة ولا تشاركها، وتحذف ما نزّلته منها حين ينتهي دورك.',
  coordinator: 'تطّلع على ما تسمح به صلاحيتك من بيانات مشاركي جهتك لمتابعة رحلتهم وحده. لا تنسخها خارج البوابة ولا تشاركها إلا لغرض البرنامج داخل جهتك.',
};

export default function PortalConsent({ role, onAccept }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    const r = await onAccept();
    setBusy(false);
    if (!r?.success) setErr(r?.message || 'تعذّر الحفظ، حاول مرة أخرى');
  };
  return (
    <div className="page narrow">
      <div className="card stack">
        <p className="eyebrow">قبل أن تتابع</p>
        <h1>بيانات المشاركين أمانة</h1>
        <p>{TEXT[role]}</p>
        <p className="small muted">وتُعالَج بياناتك أنت (اسمك وبريدك وسجل عملك في البوابة) بموجب <a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> (النسخة {POLICY_VERSION}).</p>
        {err && <div className="alert err" role="alert">{err}</div>}
        <button className="btn block" disabled={busy} onClick={go}>{busy ? 'لحظة…' : 'أوافق وأتابع'}</button>
      </div>
    </div>
  );
}

export function RatersAwaiting({ items, onDecide }) {
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // بعد القرار في آخر مقيّم منتظر تبقى رسالة نتيجته ظاهرة وحدها (org-5)، فلا يُطوى القسم قبل أن يقرأها
  if (!items?.length) return msg ? <div className="alert" role="status">{msg}</div> : null;
  const decide = async (x, decision) => {
    setBusy(true); setMsg('');
    const r = await onDecide({ id: x.id, decision, reason });
    setBusy(false);
    setMsg(r.success ? (decision === 'confirm' ? `أُرسلت الدعوة إلى ${x.full_name || x.email}.` : 'سُجّل عدم الاعتماد، وأُبلغ المشارك بسببه.') : r.message);
    if (r.success) { setOpen(null); setReason(''); }
  };
  return (
    <section className="card stack raters-awaiting" aria-labelledby="ra-h">
      <h2 className="as-h3" id="ra-h" tabIndex={-1}>مقيّمون بانتظار تأكيدك <small className="muted">· {items.length}</small></h2>
      <p className="small muted">بريد المقيّم عام أو من غير نطاق الجهة، أو المشارك فردي. تأكد أنه يعمل معه فعلًا: تقديره يدخل حكم «تغير مؤكد» وتقرير الأثر للجهة.</p>
      {msg && <div className="alert" role="status">{msg}</div>}
      {items.map((x) => (
        <div key={x.id} className="xpp-person">
          <div className="row between"><b>{x.participant}</b><small className="muted">{x.relation_ar}{x.phase === 'pre' ? ' · قبل البرنامج' : ''}</small></div>
          <small><span className="ltr">{x.email}</span>{x.full_name ? ` · ${x.full_name}` : ''} · {x.flags_ar.join('، ')}</small>
          {open === x.id ? (
            <div className="stack" style={{ gap: 6 }}>
              <label className="field"><span>سبب عدم الاعتماد (يصل المشارك)</span><textarea className="input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <div className="row"><button className="btn sm" disabled={busy || reason.trim().length < 5} onClick={() => decide(x, 'reject')}>لا أعتمده</button><button className="link small" onClick={() => setOpen(null)}>إلغاء</button></div>
            </div>
          ) : (
            <div className="row"><button className="btn sm" disabled={busy} onClick={() => decide(x, 'confirm')}>أكّد وأرسل الدعوة</button><button className="link small" disabled={busy} onClick={() => { setOpen(x.id); setReason(''); }}>لا أعتمده</button></div>
          )}
        </div>
      ))}
    </section>
  );
}
