// ════════════════════════════════════════════════════════════════
// صفحة العملية في سجل المدفوعات (#/leaders/payments/<id>): ما جرى لها بترتيبه، وعميلها، والتواصل معه
// ════════════════════════════════════════════════════════════════
// قراءة من admin.payment. السجل هو جدول payments نفسه، والتفاصيل من إشعار Creem المحفوظ (payments-ledger.js).
// ما لا يرسله Creem (رسومه والصافي، وسيلة الدفع، الإيصال) يُفتح من لوحته برابط الطلب.
import React, { useCallback, useEffect, useState } from 'react';
import { date, dateTime, L, STATUS } from '../leaders.js';
import { Empty, Spinner, useUI } from '../ui.jsx';
import { money } from '../../../supabase/functions/leaders-api/payments-ledger.js';

export const PAY_ST = { paid: ['مدفوع', 'ok'], pending: ['معلّق', 'warn'], refunded: ['مسترد', 'bad'], failed: ['تعذّر', 'bad'], expired: ['انتهى', ''] };

export default function PaymentFile({ id, canWrite, onBack, onPerson }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await L('admin.payment', { id }); setD(r); if (r.success) setNote(r.payment.admin_note || ''); }, [id]);
  useEffect(() => { setD(null); load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <><button className="la-link" onClick={onBack}>→ كل العمليات</button><div className="la-err" role="alert">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></>;
  const p = d.payment;
  const who = d.participant;
  const [st, tone] = PAY_ST[p.status] || [p.status, ''];
  const cur = p.currency || 'USD';
  const act = async (action, body, ok) => {
    setBusy(true);
    const r = await L(action, { id, ...body });
    setBusy(false);
    toast(r.success ? ok : r.message);
    if (r.success) load();
  };
  const remind = async () => {
    if (!(await confirm(`إرسال بريد إلى ${who?.full_name || p.email} يذكّره بأن دفعه لم يكتمل؟`))) return;
    act('admin.payment-remind', {}, 'أُرسل التذكير');
  };
  const reconcile = async () => {
    setBusy(true);
    const r = await L('admin.payment-reconcile', { id });
    setBusy(false);
    toast(r.success ? `حالة Creem: ${r.status || 'غير معروفة'}` : r.message);
    if (r.success) load();
  };
  const row = (k, v, ltr) => (v == null || v === '' ? null : <div className="pf-kv"><span>{k}</span><b dir={ltr ? 'ltr' : undefined}>{v}</b></div>);
  return (
    <div className="payf">
      <button className="la-link" onClick={onBack}>→ كل العمليات</button>
      <section className="la-card">
        <div className="la-row between">
          <div>
            <small className="la-muted">{d.item_ar}{p.mode === 'test' ? ' · وضع الاختبار' : ''}</small>
            <h2><span dir="ltr">{money(p.amount_cents, cur)}</span> <span className={`la-chip ${tone}`}>{st}</span></h2>
            <small className="la-muted">{who?.full_name || p.customer_name || p.email} · {dateTime(p.paid_at || p.created_at)}</small>
          </div>
          <div className="la-row">
            {d.creem_url && <a className="btn-sm ghost" href={d.creem_url} target="_blank" rel="noopener noreferrer">{p.status === 'paid' ? 'استردّها من Creem ↗' : 'افتحها في Creem ↗'}</a>}
            {p.order_id && <button className="btn-sm ghost" onClick={() => navigator.clipboard?.writeText(p.order_id).then(() => toast('نُسخ رقم الطلب'), () => toast('تعذّر النسخ'))}>انسخ رقم الطلب</button>}
            {canWrite && p.status === 'pending' && <button className="btn-sm ghost" disabled={busy} onClick={reconcile}>تحقق من Creem</button>}
            {canWrite && p.status === 'pending' && <button className="btn-sm primary" disabled={busy} onClick={remind}>ذكّره بإكمال الدفع</button>}
          </div>
        </div>
        {p.note && <p className="la-chip warn">{p.note}</p>}
      </section>

      <div className="la-grid2">
        <section className="la-card">
          <h3>تفاصيل العملية</h3>
          {row('المبلغ المدفوع', money(p.amount_cents, cur), true)}
          {row('قبل الضريبة', p.subtotal_cents != null ? money(p.subtotal_cents, cur) : null, true)}
          {row('الضريبة', p.tax_cents != null ? money(p.tax_cents, cur) : null, true)}
          {row('المسترد', p.refund_cents != null ? money(p.refund_cents, cur) : null, true)}
          {row('سبب الاسترداد', p.refund_reason)}
          {row('رقم الطلب', p.order_id, true)}
          {row('رقم المعاملة', p.transaction_id, true)}
          {row('رقم العميل في Creem', p.customer_id, true)}
          {row('صفحة الدفع', p.checkout_id, true)}
          {row('فُتحت', dateTime(p.created_at))}
          {row('دُفعت', dateTime(p.paid_at))}
          {row('استُردّت', dateTime(p.refunded_at))}
          <p className="la-muted small">رسوم Creem والصافي ووسيلة الدفع والإيصال لا تصلنا في الإشعار؛ تجدها في لوحة Creem من الزر أعلاه.</p>
        </section>
        <section className="la-card">
          <h3>العميل</h3>
          {who ? <>
            {row('الاسم', who.full_name)}
            {row('الاسم كما دفع', p.customer_name && p.customer_name !== who.full_name ? p.customer_name : null)}
            {row('البريد', who.email, true)}
            {row('الجوال', who.phone, true)}
            {row('المسمى', who.job_title)}
            {row('جهة العمل', who.organization_name)}
            {row('بلد الدفع', p.country, true)}
            {row('حالته في البرنامج', STATUS[who.status] || who.status)}
            {row('سجّل', date(who.created_at))}
            <div className="la-row payf-contact">
              <a className="btn-sm ghost" href={`mailto:${who.email}`}>راسله بالبريد</a>
              {d.whatsapp && <a className="btn-sm ghost" href={d.whatsapp} target="_blank" rel="noopener noreferrer">واتساب</a>}
              <button className="btn-sm ghost" onClick={() => onPerson(who.id)}>ملفه الكامل</button>
            </div>
          </> : <>
            {row('البريد', p.email, true)}
            {row('الاسم كما دفع', p.customer_name)}
            <Empty compact title="لا حساب مرتبط" hint="حُذف حساب صاحب العملية، وبقي سجلها." />
          </>}
        </section>
      </div>

      <section className="la-card">
        <h3>ما جرى بترتيبه</h3>
        <ol className="payf-line">
          {d.timeline.map((t, i) => (
            <li key={i} className={t.tone}><time dateTime={t.at}>{dateTime(t.at)}</time><span>{t.text}{t.detail && <small className="la-muted"> · {t.detail}</small>}</span></li>
          ))}
        </ol>
      </section>

      <section className="la-card">
        <h3>ملاحظة الإدارة</h3>
        <textarea rows={3} aria-label="ملاحظة الإدارة على العملية" value={note} disabled={!canWrite} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="ما اتُّفق عليه مع العميل، أو سبب استرداد، أو متابعة…" />
        {canWrite && <div className="la-row"><button className="btn-sm primary" disabled={busy || note === (p.admin_note || '')} onClick={() => act('admin.payment-note', { note }, 'حُفظت الملاحظة')}>احفظ الملاحظة</button></div>}
      </section>
    </div>
  );
}
