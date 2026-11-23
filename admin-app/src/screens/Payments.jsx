// ════════════════════════════════════════════════════════════════
// المدفوعات: الإيرادات والتحويل والعمليات والاستحقاقات والإعدادات، دون الرجوع إلى لوحة Creem
// ════════════════════════════════════════════════════════════════
// المصدر: admin.payments (payments + entitlements + payment_events). الحق لا يُكتب إلا من إشعار Creem
// الموقّع أو منحة إدارية مسجّلة، والمطابقة تستعلم Creem مباشرة لدفعة فات إشعارها.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { date, dateTime, L } from '../leaders.js';
import { Empty, NoMatch, Spinner, useUI } from '../ui.jsx';
import ExportButton from '../ExportButton.jsx';
import PaymentFile, { PAY_ST } from './PaymentFile.jsx';
import { creemOrderUrl, isAbandoned, NOTIFY, overpaidOf } from '../../../supabase/functions/leaders-api/payments-ledger.js';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { PRODUCT_WARN } from '../../../supabase/functions/_shared/creem-product.js';
import { applyFilters, presetCounts, sortRows } from '../filters.js';

const money = (c, cur = 'USD') => `${cur === 'USD' ? '$' : ''}${((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}${cur === 'USD' ? '' : ` ${cur}`}`;
const ITEM = { assessment: 'القياس المبدئي', program: 'إكمال البرنامج' };
const SRC = { paid: 'دفع', admin: 'منحة إدارية', grandfathered: 'إعفاء سابق', sponsor: 'رعاية جهة' };
const when = (d) => dateTime(d) || '·';

function Sparkbars({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.cents));
  return (
    <div className="pay-spark" role="img" aria-label="الإيراد اليومي لآخر 30 يومًا">
      {daily.map((d) => <i key={d.day} title={`${d.day}: ${money(d.cents)}`} style={{ height: `${Math.max(4, (d.cents / max) * 100)}%` }} className={d.cents ? 'on' : ''} />)}
    </div>
  );
}

// ما يقوله Creem عن المنتج (آخر فحص في creem_check): الفوترة والعملة والضريبة والوضع، وتحذيرات صريحة.
// سعر المنتج في Creem معلومة فقط: السعر المعتمد هو سعر الإعداد (custom_price)
const MODE_AR = { test: 'اختبار', live: 'حي' };
const unreachable = (c) => c?.state === 'unreachable';
function CreemLine({ c, id }) {
  if (!id) return null;
  if (!c || c.id !== id) return <p className="pay-creem la-muted small" data-creem="unknown">لم يُتحقق من هذا المنتج في Creem بعد.</p>;
  if (unreachable(c)) return <p className="pay-creem small" data-creem="unreachable"><span className="la-chip warn">تعذّر التحقق من Creem الآن</span> يُحفظ السعر كما هو، وأعد التحقق بعد قليل.</p>;
  const warns = c.warnings || [];
  return (
    <div className={`pay-creem small ${warns.length ? 'bad' : 'ok'}`} data-creem={warns.length ? 'warn' : 'ok'}>
      {c.state === 'ok' && (
        <p>
          <span>{c.billing === 'recurring' ? 'اشتراك متكرر' : c.billing === 'onetime' ? 'دفعة واحدة' : 'نوع الفوترة غير معروف'}</span>
          {' · '}<bdi dir="ltr">{c.currency || '?'}</bdi>
          {' · '}<span>{c.tax_mode === 'inclusive' ? 'شامل الضريبة' : c.tax_mode === 'exclusive' ? 'يُضاف عليه الضريبة' : 'نمط الضريبة غير معروف'}</span>
          {' · '}<span>{MODE_AR[c.mode] ? `وضع ${MODE_AR[c.mode]}` : 'الوضع غير معروف'}</span>
        </p>
      )}
      {warns.map((w) => <p key={w} className="pay-creem-warn" role="alert" data-warn={w}>✗ {PRODUCT_WARN[w] || w}</p>)}
      {c.state === 'ok' && c.price_cents != null && <p className="la-muted" data-creem-price>سعر المنتج في Creem لم يعد مستعملًا، وهو <bdi dir="ltr">{money(c.price_cents, c.currency || 'USD')}</bdi></p>}
    </div>
  );
}

function SettingsCard({ d, canWrite, reload }) {
  const { toast, confirm } = useUI();
  const s = d.settings;
  const [v, setV] = useState({ assessment_product: s.assessment_product || '', program_product: s.program_product || '', assessment: (s.assessment_cents / 100).toString(), program: (s.program_cents / 100).toString() });
  const [notify, setNotify] = useState(() => ({ ...(s.notify || {}) }));
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState(s.creem_check || null);
  const anyUnreachable = (c) => unreachable(c?.assessment) || unreachable(c?.program);
  const verify = async () => {
    setBusy(true);
    const r = await L('admin.payment-settings', { verify_only: true });
    setBusy(false);
    if (r.success) setCheck(r.creem_check || null);
    toast(r.success ? (anyUnreachable(r.creem_check) ? 'تعذّر التحقق من Creem الآن' : 'تحققنا من Creem') : r.message);
  };
  const save = async (enabled) => {
    if (enabled && !s.enabled && !(await confirm('تفعيل الدفع يجعل القياس والبرنامج مدفوعين لكل مشارك جديد غير مرعي من جهة. المشاركون الحاليون معفون. تفعّل؟'))) return;
    setBusy(true);
    const r = await L('admin.payment-settings', { enabled, assessment_product: v.assessment_product, program_product: v.program_product,
      assessment_cents: Math.round(Number(v.assessment) * 100), program_cents: Math.round(Number(v.program) * 100), notify });
    setBusy(false);
    if (r.success && r.creem_check) setCheck(r.creem_check);
    const note = r.success && anyUnreachable(r.creem_check) ? '. تعذّر التحقق من Creem الآن' : '';
    toast(r.success ? (enabled ? (r.grandfathered ? `الدفع مفعّل، وأُعفي ${r.grandfathered} مشاركًا قائمًا` : 'الدفع مفعّل') : 'حُفظت الإعدادات') + note : r.message);
    if (r.success) reload();
  };
  const h = d.health;
  const row = (ok, label, hint) => <li className={ok ? 'ok' : 'bad'}><b>{ok ? '✓' : '✗'}</b><span>{label}</span>{hint && <small className="la-muted">{hint}</small>}</li>;
  return (
    <section className="la-card">
      <h3>الإعداد والجاهزية</h3>
      <ul className="pay-health">
        {row(h.api_key, 'مفتاح Creem', h.api_key ? (h.mode === 'test' ? 'وضع الاختبار' : 'وضع الإنتاج') : 'أضف CREEM_API_KEY في أسرار الدالة')}
        {s.enabled && h.mode === 'test' && row(false, 'المفتاح تجريبي والدفع مفعّل', 'الدفعات التجريبية تمنح وصولًا حقيقيًا بلا تحصيل. بدّل المفتاح وسرّ الإشعارات إلى الحيّين قبل استقبال مشاركين')}
        {row(h.webhook_secret, 'سرّ الإشعارات', h.webhook_secret ? 'موجود' : 'أضف CREEM_WEBHOOK_SECRET')}
        {row(!!h.last_event, 'آخر إشعار', h.last_event ? `${h.last_event.type} · ${when(h.last_event.received_at)}` : 'لم يصل إشعار بعد')}
        {row(!h.failed_events, 'معالجة الإشعارات', h.failed_events ? `${h.failed_events} إشعار تعذّرت معالجته من آخر 20` : 'سليمة')}
      </ul>
      <p className="la-muted small">رابط الإشعارات في Creem: <code dir="ltr">{h.webhook_url}</code></p>
      <div className="pay-form">
        <label>معرّف منتج القياس<input dir="ltr" value={v.assessment_product} disabled={!canWrite} onChange={(e) => setV({ ...v, assessment_product: e.target.value })} /></label>
        <label>سعر القياس (USD)<input dir="ltr" inputMode="decimal" value={v.assessment} disabled={!canWrite} onChange={(e) => setV({ ...v, assessment: e.target.value })} /></label>
        <div className="pay-creem-cell" data-product="assessment"><CreemLine c={check?.assessment} id={s.assessment_product} /></div>
        <label>معرّف منتج البرنامج<input dir="ltr" value={v.program_product} disabled={!canWrite} onChange={(e) => setV({ ...v, program_product: e.target.value })} /></label>
        <label>سعر البرنامج (USD)<input dir="ltr" inputMode="decimal" value={v.program} disabled={!canWrite} onChange={(e) => setV({ ...v, program: e.target.value })} /></label>
        <div className="pay-creem-cell" data-product="program"><CreemLine c={check?.program} id={s.program_product} /></div>
      </div>
      <p className="la-muted small" data-price-help>هذا هو السعر الذي يراه المتدرب، وهو ما يخصمه Creem قبل الضريبة. لا يُستعمل سعر المنتج في Creem.</p>
      <h3>بريد الدفع</h3>
      <><p className="la-muted small">كل بريد مغلق حتى تفتحه، والمفتوح يُرسل آليًا.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>كل بريد مغلق حتى تفتحه. المفتوح يُرسل آليًّا ويُحسب من سقف البريد اليومي. تذكير من لم يكمل الدفع فعل يدوي من صفحة العملية ولا مفتاح له.</p></details></>
      <div className="pay-notify">
        {/* تنبيه الإدارة عند كل دفعة انتقل إلى «التوجيه» في مركز البريد (صفا الدفعة والاسترداد). يبقى مخزنه كما هو
            ويُرسل مع الحفظ بلا تغيير، فالقراءة الاحتياطية له لا تتبدل بحفظ هذه الشاشة */}
        {Object.entries(NOTIFY).filter(([k]) => k !== 'owner').map(([k, n]) => (
          <label key={k} className="la-check"><input type="checkbox" checked={!!notify[k]} disabled={!canWrite} onChange={(e) => setNotify({ ...notify, [k]: e.target.checked })} /> <span><b>{n.label}</b><br /><small className="la-muted">{n.hint}</small></span></label>
        ))}
      </div>
      <p className="la-muted small" data-moved="owner">إشعار الإدارة بكل دفعة واسترداد في «التوجيه» بمركز البريد: سطر فوري في Slack ويدخل الملخص اليومي.{s.notify?.owner ? ' والمفتاح القديم مفتوح، فيصل معه بريد حتى يُحفظ صفاهما هناك.' : ''}</p>
      {canWrite && (
        <div className="la-row">
          <button className="btn-sm ghost" disabled={busy} onClick={() => save(s.enabled)}>احفظ</button>
          <button className="btn-sm ghost" disabled={busy} onClick={verify} data-verify-creem>تحقق من Creem</button>
          {s.enabled
            ? <button className="btn-sm ghost" disabled={busy} onClick={() => save(false)}>أوقف الدفع (يمر الجميع مجانًا)</button>
            : <button className="btn-sm primary" disabled={busy} onClick={() => save(true)}>فعّل الدفع</button>}
        </div>
      )}
    </section>
  );
}

// حقول الفلترة وأعمدة الفرز لشريط الفلترة الموحد
const PAY_FIELDS = [
  { key: 'status', label: 'الحالات', aria: 'الحالة', get: (p) => p.status, options: Object.entries(PAY_ST).map(([k, [l]]) => [k, l]) },
  { key: 'mode', label: 'الأوضاع', aria: 'الوضع', all: 'الإنتاج والاختبار', get: (p) => p.mode, options: [['live', 'الإنتاج'], ['test', 'الاختبار']] },
  { key: 'item', label: 'البنود', aria: 'البند', get: (p) => p.item, options: Object.entries(ITEM) },
];
// عروض سريعة: من فتح صفحة الدفع ولم يكمل (isAbandoned من payments-ledger.js)، وما عُلّق للمراجعة
const PAY_PRESETS = [
  { key: 'abandoned', label: 'لم يكملوا الدفع', test: (p, now) => isAbandoned(p, now) },
  { key: 'held', label: 'معلّقة للمراجعة', test: (p) => p.status === 'pending' && String(p.note || '').startsWith('held') },
  // دفع أعلى من المطلوب: مُنح الحق، والمطلوب في note (overpaidOf في payments-ledger.js)
  { key: 'overpaid', label: 'أعلى من المطلوب', test: (p) => !!overpaidOf(p) },
  { key: 'refunded', label: 'مستردة', test: (p) => p.status === 'refunded' },
  // الاسترداد الجزئي يُبقي الدفعة مدفوعة وحقها قائمًا (payments.ts)، والمسترد في refund_cents
  { key: 'partial', label: 'مستردة جزئيًا', test: (p) => p.status === 'paid' && p.refund_cents > 0 },
];
const PAY_SORTS = { at: (p) => p.paid_at || p.created_at, who: (p) => p.participants?.full_name || p.email, item: (p) => ITEM[p.item], amount: (p) => p.amount_cents || 0, status: (p) => PAY_ST[p.status]?.[0] || p.status };
const ENT_FIELDS = [
  { key: 'item', label: 'البنود', aria: 'البند', get: (e) => e.item, options: Object.entries(ITEM) },
  { key: 'source', label: 'المصادر', aria: 'المصدر', get: (e) => e.source, options: Object.entries(SRC) },
  { key: 'state', label: 'الحالات', aria: 'الحالة', get: (e) => (e.revoked_at ? 'revoked' : 'live'), options: [['live', 'ساري'], ['revoked', 'مسحوب']] },
];
const ENT_SORTS = { who: (e) => e.participants?.full_name, item: (e) => ITEM[e.item], source: (e) => SRC[e.source] || e.source, at: (e) => e.created_at, state: (e) => (e.revoked_at ? 1 : 0) };
const PAY_COLS = [
  { key: 'at', label: 'التاريخ', width: 20, get: (p) => dateTime(p.paid_at || p.created_at) }, { key: 'who', label: 'المشارك', width: 26, get: (p) => p.participants?.full_name },
  { key: 'email', label: 'البريد', width: 30, get: (p) => p.email }, { key: 'item', label: 'البند', width: 18, get: (p) => ITEM[p.item] },
  { key: 'amount', label: 'المبلغ', width: 12, get: (p) => (p.amount_cents || 0) / 100 }, { key: 'currency', label: 'العملة', width: 10, get: (p) => p.currency },
  { key: 'status', label: 'الحالة', width: 12, get: (p) => PAY_ST[p.status]?.[0] || p.status }, { key: 'mode', label: 'الوضع', width: 10, get: (p) => (p.mode === 'test' ? 'اختبار' : 'إنتاج') },
  { key: 'subtotal', label: 'قبل الضريبة', width: 12, get: (p) => (p.subtotal_cents == null ? '' : p.subtotal_cents / 100) }, { key: 'tax', label: 'الضريبة', width: 10, get: (p) => (p.tax_cents == null ? '' : p.tax_cents / 100) },
  { key: 'refund', label: 'المسترد', width: 10, get: (p) => (p.refund_cents == null ? '' : p.refund_cents / 100) }, { key: 'country', label: 'بلد الدفع', width: 10, get: (p) => p.country },
  { key: 'customer', label: 'الاسم كما دفع', width: 24, get: (p) => p.customer_name }, { key: 'phone', label: 'الجوال', width: 16, get: (p) => p.participants?.phone },
  { key: 'txn', label: 'رقم المعاملة', width: 24, get: (p) => p.transaction_id }, { key: 'expected', label: 'المطلوب إن زاد المدفوع', width: 14, get: (p) => (overpaidOf(p) ? overpaidOf(p).expected / 100 : '') }, { key: 'admin_note', label: 'ملاحظة الإدارة', width: 40, get: (p) => p.admin_note },
  { key: 'order', label: 'رقم الطلب', width: 24, get: (p) => p.order_id }, { key: 'checkout', label: 'صفحة الدفع', width: 24, get: (p) => p.checkout_id },
];
const ENT_COLS = [
  { key: 'who', label: 'المشارك', width: 26, get: (e) => e.participants?.full_name }, { key: 'email', label: 'البريد', width: 30, get: (e) => e.participants?.email },
  { key: 'item', label: 'البند', width: 18, get: (e) => ITEM[e.item] }, { key: 'source', label: 'المصدر', width: 16, get: (e) => SRC[e.source] || e.source },
  { key: 'by', label: 'منحه', width: 22, get: (e) => e.granted_by }, { key: 'at', label: 'التاريخ', width: 16, get: (e) => date(e.created_at) },
  { key: 'state', label: 'الحالة', width: 10, get: (e) => (e.revoked_at ? 'مسحوب' : 'ساري') },
];

export default function Payments({ canWrite, onPerson, payId = null, onOpen = () => {} }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('payments');
  // شريطان (العمليات والاستحقاقات) داخل تبويبات الشاشة، فلا يكتبان في العنوان. العمليات تبدأ بالإنتاج
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'status', 'mode', 'item', 'sort'], {}, { scope: 'payments', defaults: { mode: 'live' }, url: false });
  const [ef, setEf, clearEf, replaceEf] = useFilters(['q', 'item', 'source', 'state', 'sort'], {}, { scope: 'entitlements', url: false });
  const load = useCallback(async () => setD(await L('admin.payments')), []);
  useEffect(() => { load(); }, [load]);

  const allPay = (d?.success && d.payments) || [];
  const allEnt = (d?.success && d.entitlements) || [];
  const rows = useMemo(() => sortRows(applyFilters(allPay, { fields: PAY_FIELDS, presets: PAY_PRESETS, text: (p) => [p.email, p.participants?.full_name, p.order_id, p.checkout_id].join(' ') }, f), PAY_SORTS, f.sort), [allPay, f]);
  const ents = useMemo(() => sortRows(applyFilters(allEnt, { fields: ENT_FIELDS, text: (e) => [e.participants?.full_name, e.participants?.email].join(' ') }, ef), ENT_SORTS, ef.sort), [allEnt, ef]);

  if (payId) return <PaymentFile id={payId} canWrite={canWrite} onBack={() => onOpen(null)} onPerson={onPerson} />;
  if (!d) return <Spinner />;
  if (!d.success) return <p className="la-err">{d.message}</p>;
  const k = d.kpis;

  const reconcile = async (p) => {
    const r = await L('admin.payment-reconcile', { id: p.id });
    toast(r.success ? `حالة Creem: ${r.status || 'غير معروفة'}` : r.message);
    if (r.success) load();
  };
  const revoke = async (e) => {
    if (!(await confirm(`سحب «${ITEM[e.item]}» من ${e.participants?.full_name || 'المشارك'}؟ لا يُسترد المبلغ من هنا.`))) return;
    const r = await L('admin.payment-grant', { participant_id: e.participant_id, item: e.item, revoke: true });
    toast(r.success ? 'سُحب الحق' : r.message); if (r.success) load();
  };

  return (
    <div className="pay-admin">
      <div className="pay-hero">
        <div>
          <p className="pay-eyebrow">الإيراد · <span dir="ltr">Creem</span></p>
          <b className="pay-total" dir="ltr">{money(k.revenue_cents)}</b>
          <span className="la-muted">إيراد الإنتاج المؤكد{k.refunds_cents ? ` · مسترد ${money(k.refunds_cents)}` : ''}</span>
          <span className={`la-chip ${d.settings.enabled ? 'ok' : 'warn'}`}>{d.settings.enabled ? 'الدفع مفعّل' : 'الدفع مطفأ: يمر الجميع مجانًا'}</span>
        </div>
        <Sparkbars daily={d.daily} />
      </div>
      <div className="pay-kpis">
        <span><b>{k.assessment_paid}</b>دفعوا القياس</span>
        <span><b>{k.program_paid}</b>دفعوا البرنامج</span>
        <span><b>{k.conversion == null ? '·' : `${k.conversion}%`}</b>من القياس إلى البرنامج</span>
        <span><b>{k.pending}</b>دفعات معلّقة</span>
        <span><b>{k.grants}</b>منح إدارية</span>
      </div>

      <div className="la-subtabs">
        {[['payments', 'العمليات'], ['requests', 'طلبات الرعاية'], ['entitlements', 'الاستحقاقات'], ['sponsors', 'رعاية الجهات'], ['settings', 'الإعداد']].map(([key, l]) => <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{l}</button>)}
      </div>

      {tab === 'payments' && (
        <FilterBar scope="payments" state={f} set={setF} clear={clearF} replace={replaceF} fields={PAY_FIELDS} presets={PAY_PRESETS} counts={presetCounts(allPay, PAY_PRESETS)}
          shown={rows.length} total={allPay.length} noun="عملية" placeholder="بحث بالاسم أو البريد أو رقم الطلب"
          actions={<ExportButton scope="payments" meta={{ kind: 'PAY', title: 'عمليات الدفع', sheet: 'العمليات', file: 'Payments' }} columns={PAY_COLS} all={allPay} filtered={rows} noun="عملية" />} />
      )}
      {tab === 'entitlements' && (
        <FilterBar scope="entitlements" state={ef} set={setEf} clear={clearEf} replace={replaceEf} fields={ENT_FIELDS}
          shown={ents.length} total={allEnt.length} noun="استحقاق" placeholder="بحث بالاسم أو البريد"
          actions={<ExportButton scope="entitlements" meta={{ kind: 'ENT', title: 'الاستحقاقات', sheet: 'الاستحقاقات', file: 'Entitlements' }} columns={ENT_COLS} all={allEnt} filtered={ents} noun="استحقاق" />} />
      )}

      {tab === 'payments' && (
        <section className="la-card">
          {rows.length ? (
            <table className="la-table">
              <thead><tr><SortTh k="at" state={f} set={setF}>التاريخ</SortTh><SortTh k="who" state={f} set={setF}>المشارك</SortTh><SortTh k="item" state={f} set={setF}>البند</SortTh><SortTh k="amount" state={f} set={setF}>المبلغ</SortTh><SortTh k="status" state={f} set={setF}>الحالة</SortTh><th>المرجع</th><th /></tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id}>
                  <td><button className="la-link" onClick={() => onOpen(p.id)} title="افتح العملية">{when(p.paid_at || p.created_at)}</button></td>
                  <td>{p.participant_id ? <button className="la-link" onClick={() => onPerson?.(p.participant_id)}>{p.participants?.full_name || p.email}</button> : p.email}<br /><small className="la-muted" dir="ltr">{p.email}</small></td>
                  <td>{ITEM[p.item]}{p.mode === 'test' && <small className="la-chip">اختبار</small>}</td>
                  <td dir="ltr">{money(p.amount_cents, p.currency || 'USD')}</td>
                  <td><span className={`la-chip ${PAY_ST[p.status]?.[1] || ''}`}>{PAY_ST[p.status]?.[0] || p.status}</span>{p.status === 'paid' && p.refund_cents > 0 && <span className="la-chip warn">استُرد منها {money(p.refund_cents, p.currency)}</span>}{overpaidOf(p) ? <span data-overpaid title="مُنح الحق، واسترداد الفرق من لوحة Creem"><span className="la-chip warn">أعلى من المطلوب</span><br /><small className="la-muted">دفع <bdi dir="ltr">{money(overpaidOf(p).paid, p.currency)}</bdi> والمطلوب <bdi dir="ltr">{money(overpaidOf(p).expected, p.currency)}</bdi></small></span> : p.note && <small className="la-muted"> {p.note}</small>}</td>
                  <td><small className="la-muted" dir="ltr">{p.order_id || p.checkout_id || '·'}</small></td>
                  <td className="la-row">{p.status === 'pending' && canWrite && <button className="btn-sm ghost" onClick={() => reconcile(p)}>تحقق من Creem</button>}
                    {creemOrderUrl(p) && <a className="btn-sm ghost" href={creemOrderUrl(p)} target="_blank" rel="noopener noreferrer" title={p.status === 'paid' ? 'الاسترداد والإيصال من لوحة Creem' : 'افتح الطلب في Creem'}>Creem ↗</a>}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (allPay.length ? <NoMatch what="عمليات" /> : <Empty compact title="لا عمليات دفع بعد" hint="تظهر هنا كل عملية لحظة بدئها، وتتأكد بإشعار Creem." />)}
        </section>
      )}

      {tab === 'payments' && d.review?.length > 0 && (
        <section className="la-card pay-review">
          <h3>للمراجعة: دفعوا ثم ارتبطوا بجهة راعية <span className="la-chip warn">{d.review.length}</span></h3>
          <p className="la-muted small">رعاية الجهة تغطي هذه الرسوم. الاسترداد قرارك ويتم من Creem، ويظهر هنا «مسترد» حين يصل إشعاره.</p>
          <table className="la-table"><tbody>{d.review.map((p) => (
            <tr key={p.id}><td><button className="la-link" onClick={() => onPerson?.(p.participant_id)}>{p.participants?.full_name || p.email}</button></td>
              <td>{ITEM[p.item]}</td><td dir="ltr">{money(p.amount_cents, p.currency || 'USD')}</td><td>{when(p.paid_at)}</td></tr>
          ))}</tbody></table>
        </section>
      )}

      {tab === 'sponsors' && (
        <section className="la-card">
          <p className="la-muted small">قيمة الرسوم التي غطّتها كل جهة لمشاركيها، بأسعار اليوم. تفيد في الفوترة وتقارير الجهات.</p>
          {d.sponsors?.length ? (
            <table className="la-table">
              <thead><tr><th>الجهة</th><th>مشاركون مرعيون</th><th>قيمة المغطّى</th></tr></thead>
              <tbody>{d.sponsors.map((g) => <tr key={g.id}><td>{g.name}</td><td>{g.participants}</td><td dir="ltr">{money(g.cents)}</td></tr>)}</tbody>
            </table>
          ) : <Empty compact title="لا مشاركين مرعيين بعد" hint="تظهر هنا كل جهة ترعى مشاركيها وقيمة ما غطّته." />}
        </section>
      )}

      {tab === 'entitlements' && (
        <section className="la-card">
          <p className="la-muted small">رعاية الجهة تُثبَّت هنا لحظة سريانها فلا تسقط إن أُوقفت الجهة لاحقًا. للمنح اليدوي افتح ملف المشارك.</p>
          <table className="la-table">
            <thead><tr><SortTh k="who" state={ef} set={setEf}>المشارك</SortTh><SortTh k="item" state={ef} set={setEf}>البند</SortTh><SortTh k="source" state={ef} set={setEf}>المصدر</SortTh><SortTh k="at" state={ef} set={setEf}>التاريخ</SortTh><SortTh k="state" state={ef} set={setEf}>الحالة</SortTh><th /></tr></thead>
            <tbody>{!ents.length && <tr><td colSpan={6}>{allEnt.length ? <NoMatch what="استحقاقات" /> : <Empty compact title="لا حقوق مثبتة بعد" hint="يظهر هنا حق كل مشارك في البرنامج: من دفعه، أو من رعاية جهته، أو من منحة يدوية." />}</td></tr>}{ents.slice(0, 500).map((e) => (
              <tr key={e.id} className={e.revoked_at ? 'off' : ''}>
                <td><button className="la-link" onClick={() => onPerson?.(e.participant_id)}>{e.participants?.full_name || '·'}</button><br /><small className="la-muted" dir="ltr">{e.participants?.email}</small></td>
                <td>{ITEM[e.item]}</td>
                <td>{SRC[e.source] || e.source}{e.granted_by && e.source === 'admin' && <small className="la-muted"> · {e.granted_by}</small>}</td>
                <td>{date(e.created_at)}</td>
                <td>{e.revoked_at ? <span className="la-chip bad">مسحوب</span> : <span className="la-chip ok">ساري</span>}</td>
                <td>{!e.revoked_at && canWrite && <button className="btn-sm ghost" onClick={() => revoke(e)}>اسحب</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {tab === 'requests' && <SponsorRequests canWrite={canWrite} onPerson={onPerson} onChange={load} />}
      {tab === 'settings' && <SettingsCard d={d} canWrite={canWrite} reload={load} />}
    </div>
  );
}

// طلبات الرعاية: من كتب اسم جهة دون رمز. الاقتراحات للإدارة وحدها، والقرار يصل المشارك ببريد
const REQ_ST = { pending: ['قيد المراجعة', 'warn'], approved: ['رُبط بجهته', 'ok'], rejected: ['مرفوض', 'bad'], cancelled: ['ألغاه المشارك', ''] };
function SponsorRequests({ canWrite, onPerson, onChange }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [pick, setPick] = useState({});
  const [all, setAll] = useState(false);
  const load = useCallback(async () => setD(await L('admin.sponsor-requests')), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <p className="la-err">{d.message}</p>;
  const list = d.requests.filter((x) => all || x.status === 'pending');
  const decide = async (x, approve) => {
    const held = x.kind === 'seats' || x.kind === 'contract';
    const orgId = held ? x.organization_id : pick[x.id] || x.suggestions[0]?.id;
    let reason = '';
    if (approve && x.kind === 'seats') {
      // D20: القبول مقعد يُضاف إلى عقد الجهة، بتعليل مكتوب يُحفظ في السجل
      reason = window.prompt(`اكتملت مقاعد «${x.typed_name}». سبب إضافة مقعد إلى العقد لـ ${x.participants?.full_name}:`) ?? null;
      if (reason === null) return;
    } else if (approve) {
      const org = d.orgs.find((o) => o.id === orgId);
      if (!org || !(await confirm(`ربط ${x.participants?.full_name} برعاية «${org.name}» وإعفاؤه من الرسوم؟`))) return;
    } else {
      reason = window.prompt('سبب الرفض (يصل المشارك، اختياري)') ?? null;
      if (reason === null) return;
    }
    const r = await L('admin.sponsor-decide', { id: x.id, approve, organization_id: orgId, reason });
    toast(r.success ? (approve ? 'رُبط بجهته وأُعفي' : 'رُفض الطلب') : r.message);
    if (r.success) { load(); onChange?.(); }
  };
  return (
    <section className="la-card">
      <div className="la-row between"><p className="la-muted small">لا يرى المشارك قائمة الجهات: الاقتراحات أدناه لك وحدك، مرتبة بقرب الاسم ونطاق بريده.</p>
        <label className="small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> اعرض المنتهية</label></div>
      {list.length ? (
        <table className="la-table">
          <thead><tr><th>المشارك</th><th>الجهة كما كتبها</th><th>أقرب الجهات المسجلة</th><th>الحالة</th><th /></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.id}>
              <td><button className="la-link" onClick={() => onPerson?.(x.participant_id)}>{x.participants?.full_name}</button><br /><small className="la-muted" dir="ltr">{x.participants?.email}</small></td>
              <td><b>{x.typed_name}</b>{x.contact_email && <><br /><small className="la-muted" dir="ltr">منسق: {x.contact_email}</small></>}<br /><small className="la-muted">{when(x.created_at)}</small></td>
              <td>{x.kind === 'seats' || x.kind === 'contract' ? <span className="la-chip warn">{x.kind === 'seats' ? 'اكتملت مقاعد العقد' : 'خارج مدة العقد'}</span> : x.status === 'pending' ? (
                <select value={pick[x.id] || x.suggestions[0]?.id || ''} disabled={!canWrite} onChange={(e) => setPick({ ...pick, [x.id]: e.target.value })}>
                  <option value="">اختر جهة…</option>
                  {x.suggestions.length > 0 && <optgroup label="الأقرب">{x.suggestions.map((g) => <option key={g.id} value={g.id}>{g.name} · {Math.round(g.score * 100)}%</option>)}</optgroup>}
                  <optgroup label="كل الجهات">{d.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>
                </select>
              ) : x.reason || ''}</td>
              <td><span className={`la-chip ${REQ_ST[x.status]?.[1] || ''}`}>{REQ_ST[x.status]?.[0]}</span></td>
              <td>{x.status === 'pending' && canWrite && <div className="la-row">
                <button className="btn-sm primary" onClick={() => decide(x, true)}>{x.kind === 'seats' ? 'أضف مقعدًا وأعفِ' : x.kind === 'contract' ? 'اعتمد بعد تعديل العقد' : 'اربط وأعفِ'}</button>
                <button className="btn-sm ghost" onClick={() => decide(x, false)}>{x.kind === 'seats' || x.kind === 'contract' ? 'دفع فردي' : 'ارفض'}</button></div>}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <Empty compact title={all ? 'لا طلبات رعاية' : 'لا طلبات رعاية قيد المراجعة'} hint="يظهر هنا من كتب جهة راعية عند التسجيل ولم تُطابق جهة مسجلة." />}
    </section>
  );
}

// بطاقة في ملف المشارك: حقوقه ومنحها أو سحبها
export function PersonAccess({ participantId, canWrite }) {
  const { toast } = useUI();
  const [d, setD] = useState(null);
  // حقوق هذا المشارك وحده (admin-core-12)، لا لوحة المدفوعات كلها
  const load = useCallback(async () => setD(await L('admin.payments', { participant_id: participantId })), [participantId]);
  useEffect(() => { load(); }, [load]);
  if (!d?.success) return null;
  const mine = d.entitlements.filter((e) => e.participant_id === participantId && !e.revoked_at);
  const has = (i) => mine.find((e) => e.item === i);
  const grant = async (item) => {
    const r = await L('admin.payment-grant', { participant_id: participantId, item, note: 'منحة من ملف المشارك' });
    toast(r.success ? 'مُنح الحق' : r.message); if (r.success) load();
  };
  return (
    <div className="pay-person">
      {Object.entries(ITEM).map(([i, l]) => (
        <span key={i}>{l}: {has(i) ? <b>{SRC[has(i).source]}</b> : <>
          <span className="la-muted">غير مدفوع</span>{canWrite && <button className="btn-sm ghost" onClick={() => grant(i)}>امنح</button>}</>}</span>
      ))}
    </div>
  );
}
