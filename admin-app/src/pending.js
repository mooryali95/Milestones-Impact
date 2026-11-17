// ════════════════════════════════════════════════════════════════
// ما ينتظر قرار الإدارة: أعداد تظهر على السياقات والتبويبات («العدّ الواحد»)
// ════════════════════════════════════════════════════════════════
// مصدر واحد للأعداد: صندوق «ينتظرني» (admin.inbox) نفسه، فلا يختلف عدّاد التبويب عن الصندوق. عدّاد كل تبويب مجموع
// أنواعه بتبويبها في INBOX_KINDS، ويحمرّ إن تأخر منها بند عن مهلة نوعه. طلبات التواصل وحدها من list-contacts (ليست
// في الصندوق). طلب واحد يتشاركه العدّاد وشاشة الصندوق (المخزن أدناه)، ويُحدَّث كل دقيقتين ما دامت الصفحة ظاهرة،
// وفور ظهورها، وفور أي حفظ يطلق «mi:pending».
// لا صفر كاذب: تعذّر الصندوق كله يبقي آخر عدد معروف، والنوع المتعذر (skipped) يُسقط عدّاد تبويبه بدل أن يُنقصه،
// ويُعلَّم المجموع بأنه أقل من الحقيقة («12+»). خادم أقدم بلا by_tab ولا counts: لا عدّادات، بلا عطل.
import { useCallback, useEffect, useState } from 'react';
import { call } from './api.js';
import { L } from './leaders.js';
import { INBOX_KINDS, byTabOf, tabsOfKinds } from '../../supabase/functions/leaders-api/inbox.js';

export const POLL_MS = 120000;

export const newContacts = (rows) => (rows || []).filter((c) => (c.status || 'new') === 'new').length;

/**
 * عدّادات التبويبات من رد admin.inbox.
 * @returns {{ tabs: Record<string, {n:number, late:number}>, total: number, late: number, partial: boolean } | null}
 * null: رد لا يُبنى عليه (فشل، أو خادم أقدم بلا أعداد)
 */
export function badgesOf(d) {
  if (!d?.success) return null;
  let tabs = d.by_tab;
  if (!tabs) {
    // خادم بلا by_tab: من counts بتبويب كل نوع، والمتأخر من البنود إن وُجدت
    if (!d.counts) return null;
    const late = byTabOf(d.items);
    tabs = {};
    for (const [k, n] of Object.entries(d.counts)) {
      const tab = INBOX_KINDS[k]?.tab;
      if (!tab || !n) continue;
      (tabs[tab] ||= { n: 0, late: late[tab]?.late || 0 }).n += n;
    }
  }
  const off = new Set(tabsOfKinds(d.skipped));
  const out = {};
  for (const [tab, t] of Object.entries(tabs)) if (!off.has(tab) && t?.n > 0) out[tab] = { n: t.n, late: t.late || 0 };
  const sum = (f) => Object.values(out).reduce((s, t) => s + f(t), 0);
  return { tabs: out, total: sum((t) => t.n), late: sum((t) => t.late), partial: off.size > 0 };
}

// نص العدّاد: «99+» فوق التسعة والتسعين، و«+» على مجموع ناقص
export const badgeText = (n, partial = false) => (n > 99 ? '99+' : `${n}${partial ? '+' : ''}`);
// الوصف المسموع: «5 بانتظارك، منها 2 متأخر»
export const badgeLabel = (n, late = 0, partial = false) =>
  `${n}${partial ? ' أو أكثر' : ''} بانتظارك${late > 0 ? `، منها ${late} متأخر` : ''}`;

// مجموع ما ينتظر في تطبيق القادة (عدّاد السياق ومجموعات التبويبات المطوية)
export const leadersTotal = (p) => p?.badges?.total || 0;
export const tabBadge = (p, tab) => p?.badges?.tabs?.[tab] || null;
export function groupBadge(p, keys) {
  const ts = keys.map((k) => tabBadge(p, k)).filter(Boolean);
  return ts.length ? { n: ts.reduce((s, t) => s + t.n, 0), late: ts.reduce((s, t) => s + t.late, 0) } : null;
}

// يطلبها أي مكوّن بعد حفظ يغيّر ما ينتظر القرار
export const refreshPending = () => window.dispatchEvent(new Event('mi:pending'));

// شاشة طلبات التواصل تعلن عدد الجديد مما حمّلته، فلا يُطلب القائمة مرتين
export const announceContacts = (rows) => window.dispatchEvent(new CustomEvent('mi:contacts', { detail: newContacts(rows) }));

// ── مخزن الصندوق: طلب واحد لـ admin.inbox يتشاركه العدّاد وشاشة «ينتظرني» ──
// last: آخر رد كما هو (تعرضه الشاشة، نجاحًا أو خطأ). badges: آخر عدّادات صالحة، لا تُمحى برد فاشل.
// الطلب الجاري يُتشارك، فطالبان في اللحظة نفسها طلب واحد.
const store = { last: null, badges: null, inflight: null, subs: new Set() };
const emit = () => store.subs.forEach((f) => f(store));
export function loadInbox() {
  if (store.inflight) return store.inflight;
  store.inflight = L('admin.inbox').catch((e) => ({ success: false, message: e?.message || 'تعذّر الاتصال بالخادم' })).then((d) => {
    store.inflight = null;
    store.last = d;
    const b = badgesOf(d);
    if (b) store.badges = b;
    else if (d?.success) store.badges = null;   // خادم أقدم بلا أعداد: لا عدّادات
    emit();
    return d;
  });
  return store.inflight;
}
export const inboxState = () => store;
export function subscribeInbox(f) { store.subs.add(f); return () => store.subs.delete(f); }
// للاختبارات وتبديل الجلسة: مخزن فارغ
export function resetInbox() { store.last = null; store.badges = null; store.inflight = null; }

// شاشة «ينتظرني»: آخر رد في المخزن، وتطلبه إن لم يُطلب بعد
export function useInbox() {
  const [d, setD] = useState(store.last);
  useEffect(() => {
    const off = subscribeInbox((s) => setD(s.last));
    if (!store.last && !store.inflight) loadInbox(); else if (store.last) setD(store.last);
    return off;
  }, []);
  return [d, loadInbox];
}

/**
 * تشغيل دوري ما دامت الصفحة ظاهرة: يتوقف حين تُخفى، ويعمل فورًا ثم يستأنف حين تظهر.
 * @returns {() => void} إيقاف
 */
export function visiblePoll(fn, ms = POLL_MS, doc = typeof document !== 'undefined' ? document : null) {
  let t = null;
  const start = () => { if (t == null) t = setInterval(fn, ms); };
  const stop = () => { if (t != null) { clearInterval(t); t = null; } };
  const onVis = () => { if (doc.visibilityState === 'hidden') stop(); else { fn(); start(); } };
  if (!doc || doc.visibilityState !== 'hidden') start();
  doc?.addEventListener('visibilitychange', onVis);
  return () => { stop(); doc?.removeEventListener('visibilitychange', onVis); };
}

// في سياق طلبات التواصل يأتي عددها من الشاشة نفسها، وفي غيره يُطلب هنا
export function usePending(ctx) {
  const [p, setP] = useState(() => (store.badges ? { contacts: 0, badges: store.badges } : null));
  const load = useCallback(async () => {
    const [contacts] = await Promise.all([ctx === 'contacts' ? null : call('list-contacts').catch(() => null), loadInbox()]);
    setP((old) => ({ contacts: contacts?.contacts ? newContacts(contacts.contacts) : old?.contacts ?? 0, badges: store.badges }));
  }, [ctx]);
  useEffect(() => {
    load();
    const off = subscribeInbox((s) => setP((old) => ({ contacts: old?.contacts ?? 0, badges: s.badges })));
    const stop = visiblePoll(load);
    const onContacts = (e) => setP((old) => ({ badges: store.badges, ...old, contacts: e.detail }));
    window.addEventListener('mi:pending', load);
    window.addEventListener('mi:contacts', onContacts);
    return () => { off(); stop(); window.removeEventListener('mi:pending', load); window.removeEventListener('mi:contacts', onContacts); };
  }, [load]);
  return p;
}
