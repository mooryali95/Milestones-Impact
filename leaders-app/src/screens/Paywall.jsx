// ════════════════════════════════════════════════════════════════
// بوابة الدفع: القياس المبدئي ثم إكمال البرنامج، عبر صفحة دفع Creem باسم المشارك
// ════════════════════════════════════════════════════════════════
// الحق لا يُمنح من هنا: يمنحه الخادم من إشعار Creem الموقّع. بعد العودة من الدفع ننتظر التأكيد
// ونعيد قراءة الحساب حتى يظهر الحق، ومن رعته جهة لا يرى هذه الشاشة أصلًا.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { levelOf } from '../labels.js';
import { stepTitle } from '../Onboarding.jsx';
import { LEGAL_PATH } from '../../../supabase/functions/leaders-api/labels.js';
import { flagsOf, programPackageAr } from '../features.js';
import { planSpanDays } from '../../../supabase/functions/leaders-api/stage-windows.js';
import { taxNote } from '../../../supabase/functions/_shared/creem-product.js';
import EmailInput from '../../../shared/ui/EmailInput.jsx';

const money = (cents, cur = 'USD') => `${cur === 'USD' ? '$' : ''}${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}${cur === 'USD' ? '' : ` ${cur}`}`;

const COPY = {
  assessment: {
    eyebrow: stepTitle('assessment'),   // اسم الخطوة من معالج البداية؛ العدّاد في الرأس فوق الشاشة
    title: 'القياس المبدئي',
    lead: 'قياس معاير في المعالم والأثر والقيادة، يحدد مستواك في كل بُعد ويبني عليه مسارك من بين مسارات البرنامج.',
    // D04: يُفصح قبل القياس أن نتيجته تحدد المسار لا السعر
    points: ['نتيجة فورية بمستواك في الأبعاد الثلاثة', 'ملف تعريف يشرح نقاط قوتك وأولويتك', 'رسم رمزي يؤكد جدّية التسجيل', 'نتيجتك تحدد مسارك لا سعرك: رسم البرنامج واحد لكل المسارات، ويُدفع بعد اعتماد مسارك'],
    cta: 'ادفع وابدأ القياس',
  },
  program: {
    eyebrow: 'نتيجتك جاهزة',
    title: 'أكمل رحلتك في البرنامج',
    // نص الباقة من مفاتيح الميزات في me.features (D04 وD17): لا وعد بما لم يُظهَر، فيُبنى عند العرض (lead دالة)
    lead: (ft) => `اعتُمد مسارك بعد مراجعة المستشار. أكمل البرنامج لتفتح رحلتك كاملة: ${programPackageAr(ft)}.`,
    points: ['رحلة تأهيل على مقاس مستواك', 'مشروع حقيقي من جهتك بمعالم وتقييم خبير', 'تقييم ختامي وشهادة موثقة'],
    cta: 'ادفع وأكمل البرنامج',
  },
};

export default function Paywall({ item, me, onUpdate }) {
  const c = COPY[item];
  const price = me.access?.prices?.[item] ?? 0;
  const cur = me.access?.prices?.currency || 'USD';
  // نمط ضريبة منتج Creem من آخر فحص للإدارة (creem-product.js)؛ إن لم يُعرف تبقى الجملة العامة وحدها
  const tax = taxNote(me.access?.prices?.tax?.[item]);
  // انشغال وخطأ لكل نموذج وحده: الدفع لا يعطّل الرمز ولا طلب الرعاية، وكل رسالة تحت نموذجها
  const [busy, setBusy] = useState(false);          // زر الدفع
  const [err, setErr] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeErr, setCodeErr] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimErr, setClaimErr] = useState('');
  // الرجوع من صفحة الدفع بزر المتصفح يعيد الصفحة من ذاكرته بحالتها «نفتح صفحة الدفع…»، فيعلق الزر:
  // تُعاد حالته عند كل ظهور للصفحة، وبعد مهلة إن لم يغادر المتصفح الصفحة أصلًا
  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  const [confirming, setConfirming] = useState(() => new URLSearchParams(location.search).get('paid') === item);
  const [code, setCode] = useState('');
  const [claim, setClaim] = useState(null);   // { typed_name, contact_email } حين يفتح «رشّحتني جهة ولا أملك رمزًا»
  const req = me.access?.request;
  const reload = async () => { const m = await call('me'); if (m.success) onUpdate(m); };
  const sendClaim = async (e) => {
    e.preventDefault(); setClaimBusy(true); setClaimErr('');
    const r = await call('sponsor.request', claim);
    setClaimBusy(false);
    if (r.success) { setClaim(null); reload(); } else setClaimErr(r.message || 'تعذّر إرسال الطلب، حاول بعد قليل');
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
    if (r.success && r.url) { setTimeout(() => setBusy(false), 8000); location.href = r.url; return; }
    setBusy(false);
    if (r.success && r.entitled) { const m = await call('me'); if (m.success) onUpdate(m); return; }
    setErr(r.message);
  };
  const sponsor = async (e) => {
    e.preventDefault(); setCodeBusy(true); setCodeErr('');
    const r = await call('me.sponsor-code', { sponsor_code: code.trim() });
    setCodeBusy(false);
    if (r.success) onUpdate(r); else setCodeErr(r.message || 'تعذّر التحقق من الرمز، حاول بعد قليل');
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
        {item === 'program' && <PathSummary journey={me.journey} />}
        <p className="muted">{typeof c.lead === 'function' ? c.lead(flagsOf(me)) : c.lead}</p>
        <ul className="pay-points">{c.points.map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="pay-price"><b dir="ltr">{money(price, cur)}</b><span>دفعة واحدة · بطاقة أو Apple Pay</span>{tax && <span className="pay-tax" data-tax>{tax}</span>}</div>
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
              <input className="input ltr grow" maxLength={40} autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="رمز الجهة" aria-label="رمز الجهة الراعية" aria-invalid={!!codeErr} />
              <button className="btn ghost sm" disabled={codeBusy || code.trim().length < 4}>{codeBusy ? 'نتحقق…' : 'تحقق'}</button>
            </div>
            {codeErr && <div className="alert err small" role="alert">{codeErr}</div>}
            {!claim && <button type="button" className="link small" onClick={() => setClaim({ typed_name: me.participant.organization_name || '', contact_email: '' })}>رشّحتني جهة ولا أملك رمزًا</button>}
          </form>
        )}
        {claim && (
          <form className="pay-sponsor" onSubmit={sendClaim}>
            <span className="small">اكتب اسم الجهة التي رشّحتك، ونتحقق من رعايتها لك.</span>
            <input className="input" required minLength={2} maxLength={200} value={claim.typed_name} onChange={(e) => setClaim({ ...claim, typed_name: e.target.value })} placeholder="اسم الجهة الراعية" aria-label="اسم الجهة الراعية" />
            <EmailInput className="input ltr" type="email" maxLength={254} value={claim.contact_email} onChange={(e) => setClaim({ ...claim, contact_email: e.target.value })} placeholder="بريد منسق الجهة (اختياري)" aria-label="بريد منسق الجهة" />
            {claimErr && <div className="alert err small" role="alert">{claimErr}</div>}
            <div className="row"><button className="btn ghost sm" disabled={claimBusy || claim.typed_name.trim().length < 2}>{claimBusy ? 'نرسل…' : 'أرسل طلب التحقق'}</button>
              <button type="button" className="link small" onClick={() => setClaim(null)}>إلغاء</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

// المسار المعتمد من مصدره (D04): مراحل الرحلة وأبوابها ونماذجها ومدتها كما يبنيها الخادم لمستوى المشارك.
// المدة من خطة الرحلة (planSpanDays، R3b): المراحل التي تسير معًا تأخذ أطولها بإزاحتها لا مجموعها
export function pathOf(journey = []) {
  const items = journey.flatMap((s) => s.items || []);
  const days = planSpanDays(journey);
  // المسار المستمر (T1) يسير بجانب المراحل: لا يُعد في عددها، ولا يطيل المدة (planSpanDays يستبعده)
  // والخدمة (T2) لمن يريد: لا تُعد في المراحل
  const seq = journey.filter((s) => s.lane !== 'track' && s.lane !== 'service');
  return {
    stages: seq.length,
    readings: items.filter((i) => i.kind === 'reading').length,
    models: items.filter((i) => i.kind === 'model').length,
    weeks: days ? Math.max(1, Math.round(days / 7)) : null,
    titles: seq.map((s) => s.title_ar).filter(Boolean),
  };
}

function PathSummary({ journey }) {
  const p = pathOf(journey);
  if (!p.stages) return null;
  return (
    <div className="pay-path">
      <span className="small muted">مسارك المعتمد</span>
      <ul className="pay-points">
        <li>{p.stages} مراحل: {p.titles.join('، ')}</li>
        {p.readings > 0 && <li>{p.readings} من أنشطة القراءة في الكتاب بمستواك</li>}
        {p.models > 0 && <li>{p.models} من النماذج التطبيقية يراجعها مستشارك</li>}
        {p.weeks && <li>نحو {weeksAr(p.weeks)} من بداية دفعتك</li>}
      </ul>
    </div>
  );
}

// بانتظار اعتماد المسار (D04): حالة مؤرخة بموعد معلن، ولا بوابة دفع قبل الاعتماد
export function AwaitingApproval({ me }) {
  const at = me.baseline_submitted_at ? new Date(me.baseline_submitted_at) : null;
  const due = at ? businessDays(at, 2) : null;
  const fmt = (d) => d.toLocaleDateString('ar-SA-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="page narrow">
      <div className="card stack pay-card" role="status">
        <p className="eyebrow">نتيجتك جاهزة</p>
        <h1>مسارك قيد الاعتماد</h1>
        {me.profile && <div className="pay-result"><span className="small muted">مستواك العام المبدئي</span><b>{levelOf(me.profile.level).title}</b></div>}
        <p className="muted">يراجع المستشار نتيجتك ويعتمد مسارك خلال يومي عمل{due ? `، أي قبل نهاية ${fmt(due)}` : ''}. يصلك بريد حين يُعتمد، فيه مسارك المعتمد بأبوابه ونماذجه، ومعه خطوة إكمال التسجيل إن لم ترعك جهة.</p>
        {at && <p className="small muted">أنهيت القياس في {fmt(at)}.</p>}
      </div>
    </div>
  );
}

export const weeksAr = (n) => (n === 1 ? 'أسبوع' : n === 2 ? 'أسبوعين' : n <= 10 ? `${n} أسابيع` : `${n} أسبوعًا`);

// يوما عمل في السعودية: الجمعة والسبت عطلة
export function businessDays(from, n) {
  const d = new Date(from);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (![5, 6].includes(d.getDay())) left -= 1; }
  return d;
}

// رعاية بانتظار الاعتماد (D20): سجّل برعاية جهته بعد امتلاء مقاعد العقد أو خارج مدته. لا بوابة دفع،
// ولا ما يكشف بيانات الجهة، وملفه وقياسه محفوظان حتى يُحسم القرار خلال يومي عمل.
export const seatHold = (me) => me?.access?.request?.status === 'pending' && ['seats', 'contract'].includes(me.access.request.kind);
export function SponsorshipPending() {
  return (
    <div className="page narrow">
      <div className="card stack pay-card" role="status">
        <p className="eyebrow">الرعاية</p>
        <h1>رعايتك بانتظار الاعتماد</h1>
        <p className="muted">سجّلت برعاية جهتك، ونستكمل اعتماد رعايتك مع منسقها خلال يومي عمل، ونراسلك بالنتيجة. ملفك وقياسك محفوظان، ولا يُطلب منك دفع في هذه الأثناء.</p>
      </div>
    </div>
  );
}
