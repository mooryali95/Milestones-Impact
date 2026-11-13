// ════════════════════════════════════════════════════════════════
// المدفوعات: الإيرادات والتحويل والعمليات والاستحقاقات والإعدادات، دون الرجوع إلى لوحة Creem
// ════════════════════════════════════════════════════════════════
// المصدر: admin.payments (payments + entitlements + payment_events). الحق لا يُكتب إلا من إشعار Creem
// الموقّع أو منحة إدارية مسجّلة، والمطابقة تستعلم Creem مباشرة لدفعة فات إشعارها.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { date, dateTime, L } from '../leaders.js';
import { Empty, NoMatch, Spinner, useUI } from '../ui.jsx';
import ExportButton from '../ExportButton.jsx';
import FilterBar, { SortTh, useFilters } from '../FilterBar.jsx';
import { applyFilters, sortRows } from '../filters.js';

const money = (c, cur = 'USD') => `${cur === 'USD' ? '$' : ''}${((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}${cur === 'USD' ? '' : ` ${cur}`}`;
const ITEM = { assessment: 'القياس المبدئي', program: 'إكمال البرنامج' };
const PAY_ST = { paid: ['مدفوع', 'ok'], pending: ['معلّق', 'warn'], refunded: ['مسترد', 'bad'], failed: ['تعذّر', 'bad'], expired: ['انتهى', ''] };
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

function SettingsCard({ d, canWrite, reload }) {
  const { toast, confirm } = useUI();
  const s = d.settings;
  const [v, setV] = useState({ assessment_product: s.assessment_product || '', program_product: s.program_product || '', assessment: (s.assessment_cents / 100).toString(), program: (s.program_cents / 100).toString() });
  const [busy, setBusy] = useState(false);
  const save = async (enabled) => {
    if (enabled && !s.enabled && !(await confirm('تفعيل الدفع يجعل القياس والبرنامج مدفوعين لكل مشارك جديد غير مرعي من جهة. المشاركون الحاليون معفون. تفعّل؟'))) return;
    setBusy(true);
    const r = await L('admin.payment-settings', { enabled, assessment_product: v.assessment_product, program_product: v.program_product,
      assessment_cents: Math.round(Number(v.assessment) * 100), program_cents: Math.round(Number(v.program) * 100) });
    setBusy(false);
    toast(r.success ? (enabled ? (r.grandfathered ? `الدفع مفعّل، وأُعفي ${r.grandfathered} مشاركًا قائمًا` : 'الدفع مفعّل') : 'حُفظت الإعدادات') : r.message);
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
        <label>معرّف منتج البرنامج<input dir="ltr" value={v.program_product} disabled={!canWrite} onChange={(e) => setV({ ...v, program_product: e.target.value })} /></label>
        <label>سعر البرنامج (USD)<input dir="ltr" inputMode="decimal" value={v.program} disabled={!canWrite} onChange={(e) => setV({ ...v, program: e.target.value })} /></label>
      </div>
      <p className="la-muted small">المبلغ الفعلي يأخذه Creem من المنتج نفسه، والسعر هنا حد أدنى: دفعة أقل منه أو بعملة غير الدولار تُعلَّق ولا تمنح وصولًا. اجعلهما متطابقين.</p>
      {canWrite && (
        <div className="la-row">
          <button className="btn-sm ghost" disabled={busy} onClick={() => save(s.enabled)}>احفظ</button>
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
  { key: 'order', label: 'رقم الطلب', width: 24, get: (p) => p.order_id }, { key: 'checkout', label: 'صفحة الدفع', width: 24, get: (p) => p.checkout_id },
];
const ENT_COLS = [
  { key: 'who', label: 'المشارك', width: 26, get: (e) => e.participants?.full_name }, { key: 'email', label: 'البريد', width: 30, get: (e) => e.participants?.email },
  { key: 'item', label: 'البند', width: 18, get: (e) => ITEM[e.item] }, { key: 'source', label: 'المصدر', width: 16, get: (e) => SRC[e.source] || e.source },
  { key: 'by', label: 'منحه', width: 22, get: (e) => e.granted_by }, { key: 'at', label: 'التاريخ', width: 16, get: (e) => date(e.created_at) },
  { key: 'state', label: 'الحالة', width: 10, get: (e) => (e.revoked_at ? 'مسحوب' : 'ساري') },
];

export default function Payments({ canWrite, onPerson }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('payments');
  // شريطان (العمليات والاستحقاقات) داخل تبويبات الشاشة، فلا يكتبان في العنوان. العمليات تبدأ بالإنتاج
  const [f, setF, clearF, replaceF] = useFilters(['q', 'status', 'mode', 'item', 'sort'], {}, { scope: 'payments', defaults: { mode: 'live' }, url: false });
  const [ef, setEf, clearEf, replaceEf] = useFilters(['q', 'item', 'source', 'state', 'sort'], {}, { scope: 'entitlements', url: false });
  const load = useCallback(async () => setD(await L('admin.payments')), []);
  useEffect(() => { load(); }, [load]);

  const allPay = (d?.success && d.payments) || [];
  const allEnt = (d?.success && d.entitlements) || [];
  const rows = useMemo(() => sortRows(applyFilters(allPay, { fields: PAY_FIELDS, text: (p) => [p.email, p.participants?.full_name, p.order_id, p.checkout_id].join(' ') }, f), PAY_SORTS, f.sort), [allPay, f]);
  const ents = useMemo(() => sortRows(applyFilters(allEnt, { fields: ENT_FIELDS, text: (e) => [e.participants?.full_name, e.participants?.email].join(' ') }, ef), ENT_SORTS, ef.sort), [allEnt, ef]);

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
        <FilterBar scope="payments" state={f} set={setF} clear={clearF} replace={replaceF} fields={PAY_FIELDS}
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
                  <td>{when(p.paid_at || p.created_at)}</td>
                  <td>{p.participant_id ? <button className="la-link" onClick={() => onPerson?.(p.participant_id)}>{p.participants?.full_name || p.email}</button> : p.email}<br /><small className="la-muted" dir="ltr">{p.email}</small></td>
                  <td>{ITEM[p.item]}{p.mode === 'test' && <small className="la-chip">اختبار</small>}</td>
                  <td dir="ltr">{money(p.amount_cents, p.currency || 'USD')}</td>
                  <td><span className={`la-chip ${PAY_ST[p.status]?.[1] || ''}`}>{PAY_ST[p.status]?.[0] || p.status}</span>{p.note && <small className="la-muted"> {p.note}</small>}</td>
                  <td><small className="la-muted" dir="ltr">{p.order_id || p.checkout_id || '·'}</small></td>
                  <td>{p.status === 'pending' && canWrite && <button className="btn-sm ghost" onClick={() => reconcile(p)}>تحقق من Creem</button>}</td>
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
