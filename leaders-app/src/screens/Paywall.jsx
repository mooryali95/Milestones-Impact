// ════════════════════════════════════════════════════════════════
// بوابة الدفع: القياس المبدئي ثم إكمال البرنامج، عبر صفحة دفع Creem باسم المشارك
// ════════════════════════════════════════════════════════════════
// الحق لا يُمنح من هنا: يمنحه الخادم من إشعار Creem الموقّع. بعد العودة من الدفع ننتظر التأكيد
// ونعيد قراءة الحساب حتى يظهر الحق، ومن رعته جهة لا يرى هذه الشاشة أصلًا.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { levelOf } from '../labels.js';
import { LEGAL_PATH } from '../../../supabase/functions/leaders-api/labels.js';

const money = (cents, cur = 'USD') => `${cur === 'USD' ? '$' : ''}${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}${cur === 'USD' ? '' : ` ${cur}`}`;

const COPY = {
  assessment: {
    eyebrow: 'الخطوة 2 من 3 في القبول',
    title: 'القياس المبدئي',
    lead: 'قياس معاير في المعالم والأثر والقيادة، يحدد مستواك في كل بُعد ويبني عليه مسارك من بين مسارات البرنامج.',
    points: ['نتيجة فورية بمستواك في الأبعاد الثلاثة', 'ملف تعريف يشرح نقاط قوتك وأولويتك', 'رسم رمزي يؤكد جدّية التسجيل'],
    cta: 'ادفع وابدأ القياس',
  },
  program: {
    eyebrow: 'نتيجتك جاهزة',
    title: 'أكمل رحلتك في البرنامج',
    lead: 'مسارك مبني على نتيجتك. أكمل البرنامج لتفتح رحلتك كاملة: الكتيب و«كاتون» والقاعة والمبادرة والتقييم والشهادة.',
    points: ['رحلة تأهيل على مقاس مستواك', 'مشروع حقيقي من جهتك بمعالم وتقييم خبير', 'تقييم ختامي وشهادة موثقة'],
    cta: 'ادفع وأكمل البرنامج',
  },
};

export default function Paywall({ item, me, onUpdate }) {
  const c = COPY[item];
  const price = me.access?.prices?.[item] ?? 0;
  const cur = me.access?.prices?.currency || 'USD';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(() => new URLSearchParams(location.search).get('paid') === item);
  const [code, setCode] = useState('');
  const [claim, setClaim] = useState(null);   // { typed_name, contact_email } حين يفتح «رشّحتني جهة ولا أملك رمزًا»
  const req = me.access?.request;
  const reload = async () => { const m = await call('me'); if (m.success) onUpdate(m); };
  const sendClaim = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await call('sponsor.request', claim);
    setBusy(false);
    if (r.success) { setClaim(null); reload(); } else setErr(r.message);
  };

  // بعد العودة من Creem: ننتظر إشعار الدفع حتى 45 ثانية
  useEffect(() => {
    if (!confirming) return undefined;
    history.replaceState(null, '', location.pathname);
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      const r = await call('me');
      if (r.success && r.access?.[item]) { clearInterval(t); onUpdate(r); }
      else if (n >= 18) { clearInterval(t); setConfirming(false); setErr('لم يصلنا تأكيد الدفع بعد. إن خُصم المبلغ فسيُفعَّل حقك خلال دقائق تلقائيًا، أو تواصل معنا.'); }
    }, 2500);
    return () => clearInterval(t);
  }, [confirming, item, onUpdate]);

  const pay = async () => {
    setBusy(true); setErr('');
    const r = await call('pay.checkout', { item });
    if (r.success && r.url) { location.href = r.url; return; }
    setBusy(false);
    if (r.success && r.entitled) { const m = await call('me'); if (m.success) onUpdate(m); return; }
    setErr(r.message);
  };
  const sponsor = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await call('me.sponsor-code', { sponsor_code: code.trim() });
    setBusy(false);
    if (r.success) onUpdate(r); else setErr(r.message);
  };

  if (confirming) {
    return (
      <div className="page narrow"><div className="card stack pay-card" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <h2>نؤكد دفعتك…</h2>
        <p className="muted">تصلنا موافقة بوابة الدفع خلال ثوانٍ، ثم تُفتح {item === 'assessment' ? 'القياس' : 'رحلتك'} تلقائيًا.</p>
      </div></div>
    );
  }
  return (
    <div className="page narrow">
      <div className="card stack pay-card">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1>{c.title}</h1>
        {item === 'program' && me.profile && (
          <div className="pay-result">
            <span className="small muted">مستواك العام</span><b>{levelOf(me.profile.level).title}</b>
            {me.profile.track?.title && <><span className="small muted">مسارك</span><b>{me.profile.track.title}</b></>}
          </div>
        )}
        <p className="muted">{c.lead}</p>
        <ul className="pay-points">{c.points.map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="pay-price"><b dir="ltr">{money(price, cur)}</b><span>دفعة واحدة · بطاقة أو Apple Pay</span></div>
        {err && <div className="alert err" role="alert">{err}</div>}
        <button className="btn gold block" disabled={busy} onClick={pay}>{busy ? 'نفتح صفحة الدفع…' : c.cta}</button>
        <p className="small muted">الدفع عبر Creem بصفحة آمنة باسمك وبريدك، ويصلك الإيصال على {me.participant.email}.</p>
        {/* إفصاح السعر والضريبة والشروط قبل الدفع (نظام التجارة الإلكترونية) */}
        <p className="small muted">السعر بالدولار الأمريكي. تُحصَّل الضرائب المطبقة (ومنها ضريبة القيمة المضافة في السعودية) عند الدفع عبر Creem بوصفه البائع الرسمي وتظهر في الإيصال. بالدفع توافق على <a className="link" href={LEGAL_PATH.terms} target="_blank" rel="noopener noreferrer">الشروط</a> و<a className="link" href={LEGAL_PATH.refund} target="_blank" rel="noopener noreferrer">سياسة الاسترداد</a>.</p>
        {req?.status === 'pending' && (
          <div className="pay-claim-note" role="status">
            <b>طلب رعاية «{req.typed_name}» قيد المراجعة</b>
            <span>نتحقق منه خلال يومي عمل ونراسلك. يمكنك الانتظار، أو البدء الآن بالدفع؛ وإن تأكدت رعايتك يُعفى إكمال البرنامج تلقائيًا.</span>
            <button type="button" className="link small" onClick={async () => { await call('sponsor.cancel'); reload(); }}>ألغِ الطلب</button>
          </div>
        )}
        {req?.status === 'rejected' && <p className="small muted">لم نتمكن من تأكيد رعاية «{req.typed_name}»{req.reason ? `: ${req.reason}` : ''}.</p>}
        {!me.participant.organization_linked && req?.status !== 'pending' && (
          <form className="pay-sponsor" onSubmit={sponsor}>
            <span className="small">رشّحتك جهة؟ رمزها يعفيك من الرسوم</span>
            <div className="row">
              <input className="input ltr grow" maxLength={40} autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC-2026" aria-label="رمز الجهة الراعية" />
              <button className="btn ghost sm" disabled={busy || code.trim().length < 4}>تحقق</button>
            </div>
            {!claim && <button type="button" className="link small" onClick={() => setClaim({ typed_name: me.participant.organization_name || '', contact_email: '' })}>رشّحتني جهة ولا أملك رمزًا</button>}
          </form>
        )}
        {claim && (
          <form className="pay-sponsor" onSubmit={sendClaim}>
            <span className="small">اكتب اسم الجهة التي رشّحتك، ونتحقق من رعايتها لك.</span>
            <input className="input" required minLength={2} maxLength={200} value={claim.typed_name} onChange={(e) => setClaim({ ...claim, typed_name: e.target.value })} placeholder="اسم الجهة الراعية" aria-label="اسم الجهة الراعية" />
            <input className="input ltr" type="email" maxLength={254} value={claim.contact_email} onChange={(e) => setClaim({ ...claim, contact_email: e.target.value })} placeholder="بريد منسق الجهة (اختياري)" aria-label="بريد منسق الجهة" />
            <div className="row"><button className="btn ghost sm" disabled={busy || claim.typed_name.trim().length < 2}>أرسل طلب التحقق</button>
              <button type="button" className="link small" onClick={() => setClaim(null)}>إلغاء</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
