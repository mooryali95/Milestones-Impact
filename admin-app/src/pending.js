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
import { badgeTabOf, byTabOf, tabsOfKinds } from '../../supabase/functions/leaders-api/inbox.js';

export const POLL_MS = 120000;

export const newContacts = (rows) => (rows || []).filter((c) => (c.status || 'new') === 'new').length;

/**
 * عدّادات التبويبات من رد admin.inbox.
 * @returns {{ tabs: Record<string, {n:number, late:number}>, off: string[], total: number, late: number, partial: boolean } | null}
 * off: تبويبات أسقط عدّادها نوع متعذر، فكل مجموع يضمها يُعلَّم ناقصًا
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
      const tab = badgeTabOf(k);
      if (!tab || !n) continue;
      (tabs[tab] ||= { n: 0, late: late[tab]?.late || 0 }).n += n;
    }
  }
  const off = new Set(tabsOfKinds(d.skipped));
  const out = {};
  for (const [tab, t] of Object.entries(tabs)) if (!off.has(tab) && t?.n > 0) out[tab] = { n: t.n, late: t.late || 0 };
  const sum = (f) => Object.values(out).reduce((s, t) => s + f(t), 0);
  return { tabs: out, off: [...off], total: sum((t) => t.n), late: sum((t) => t.late), partial: off.size > 0 };
}

// نص العدّاد: «99+» فوق التسعة والتسعين، و«+» على مجموع ناقص
export const badgeText = (n, partial = false) => (n > 99 ? '99+' : `${n}${partial ? '+' : ''}`);
// الوصف المسموع: «5 بانتظارك، منها 2 متأخر»
export const badgeLabel = (n, late = 0, partial = false) =>
  `${n}${partial ? ' أو أكثر' : ''} بانتظارك${late > 0 ? `، منها ${late} متأخر` : ''}`;

// مجموع ما ينتظر في تطبيق القادة (عدّاد السياق ومجموعات التبويبات المطوية)
export const leadersTotal = (p) => p?.badges?.total || 0;
export const tabBadge = (p, tab) => p?.badges?.tabs?.[tab] || null;
// المجموعة المطوية مجموع تبويباتها، وناقصة («12+») إن كان فيها تبويب أسقط نوعٌ متعذر عدّاده، فلا يظهر رقم أقل بلا علامة.
// لا تبويب بعدد معروف فيها: لا عدّاد، لا «0+»
export function groupBadge(p, keys) {
  const ts = keys.map((k) => tabBadge(p, k)).filter(Boolean);
  if (!ts.length) return null;
  const off = p?.badges?.off || [];
  return { n: ts.reduce((s, t) => s + t.n, 0), late: ts.reduce((s, t) => s + t.late, 0), partial: keys.some((k) => off.includes(k)) };
}

// يطلبها أي مكوّن بعد حفظ يغيّر ما ينتظر القرار
export const refreshPending = () => window.dispatchEvent(new Event('mi:pending'));

// شاشة طلبات التواصل تعلن عدد الجديد مما حمّلته، فلا يُطلب القائمة مرتين
export const announceContacts = (rows) => window.dispatchEvent(new CustomEvent('mi:contacts', { detail: newContacts(rows) }));

// ── مخزن الصندوق: طلب واحد لـ admin.inbox يتشاركه العدّاد وشاشة «ينتظرني» ──
// last: آخر رد كما هو (تعرضه الشاشة، نجاحًا أو خطأ). badges: آخر عدّادات صالحة، لا تُمحى برد فاشل.
// الطلب الجاري يُتشارك، فطالبان في اللحظة نفسها طلب واحد. لكن التحديث بعد حفظ (force) لا يكتفي بطلب بدأ قبل الحفظ:
// يُطلب مرة أخرى حين ينتهي الجاري (again)، وتتشارك التحديثات المتزامنة هذه المرة الواحدة.
// gen: جيل الجلسة. resetInbox يرفعه، فرد طلب بدأ قبل الخروج أو تبديل الحساب يُهمل ولا يكتب في مخزن الجلسة الجديدة.
// at: وقت آخر رد، لتعرف شاشة الصندوق أهو حديث أم تطلب غيره حين تُفتح.
const store = { last: null, badges: null, inflight: null, again: null, at: 0, gen: 0, subs: new Set() };
const emit = () => store.subs.forEach((f) => f(store));
export function loadInbox(force = false) {
  if (store.inflight) {
    if (!force) return store.inflight;
    if (!store.again) {
      const gen = store.gen;
      const again = store.inflight.then(() => {
        if (store.again === again) store.again = null;
        return gen === store.gen ? loadInbox() : store.last;
      });
      store.again = again;
    }
    return store.again;
  }
  const gen = store.gen;
  const p = L('admin.inbox').catch((e) => ({ success: false, message: e?.message || 'تعذّر الاتصال بالخادم' })).then((d) => {
    if (gen !== store.gen) return d;   // جلسة سابقة: لا يمس المخزن
    if (store.inflight === p) store.inflight = null;
    store.last = d;
    store.at = Date.now();
    const b = badgesOf(d);
    if (b) store.badges = b;
    else if (d?.success) store.badges = null;   // خادم أقدم بلا أعداد: لا عدّادات
    emit();
    return d;
  });
  store.inflight = p;
  return p;
}
export const inboxState = () => store;
export function subscribeInbox(f) { store.subs.add(f); return () => store.subs.delete(f); }
// للاختبارات وتبديل الجلسة: مخزن فارغ بجيل جديد، ويُبلَّغ المشتركون فلا يبقى على الشاشة عدّاد الجلسة السابقة
export function resetInbox() {
  store.gen += 1;
  store.last = null; store.badges = null; store.inflight = null; store.again = null; store.at = 0;
  emit();
}

// رد أحدث من هذا يكفي شاشة الصندوق حين تُفتح: هو رد العدّادات نفسه في تحميل النظرة العامة، فلا يُطلب مرتين
export const FRESH_MS = 10000;
// شاشة «ينتظرني»: تعرض آخر رد في المخزن فورًا بلا انتظار، وتطلب أحدث منه حين تُفتح كما كانت تفعل،
// إلا أن يكون حديثًا (أو طلب جار تتشاركه). رد خطأ يُعاد طلبه دائمًا
export function useInbox() {
  const [d, setD] = useState(store.last);
  useEffect(() => {
    const off = subscribeInbox((s) => setD(s.last));
    setD(store.last);
    const fresh = store.last?.success && Date.now() - store.at < FRESH_MS;
    if (!fresh) loadInbox();
    return off;
  }, []);
  return [d, () => loadInbox(true)];
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
  // force: بعد حفظ («mi:pending») لا يكفي طلب بدأ قبله
  const load = useCallback(async (force = false) => {
    const [contacts] = await Promise.all([ctx === 'contacts' ? null : call('list-contacts').catch(() => null), loadInbox(force)]);
    setP((old) => ({ contacts: contacts?.contacts ? newContacts(contacts.contacts) : old?.contacts ?? 0, badges: store.badges }));
  }, [ctx]);
  useEffect(() => {
    load();
    const onPending = () => load(true);
    const off = subscribeInbox((s) => setP((old) => ({ contacts: old?.contacts ?? 0, badges: s.badges })));
    const stop = visiblePoll(() => load());
    const onContacts = (e) => setP((old) => ({ badges: store.badges, ...old, contacts: e.detail }));
    window.addEventListener('mi:pending', onPending);
    window.addEventListener('mi:contacts', onContacts);
    return () => { off(); stop(); window.removeEventListener('mi:pending', onPending); window.removeEventListener('mi:contacts', onContacts); };
  }, [load]);
  return p;
}
