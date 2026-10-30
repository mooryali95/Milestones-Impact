// ════════════════════════════════════════════════════════════════
// ما ينتظر قرار الإدارة: أعداد تظهر على السياقات والتبويبات
// ════════════════════════════════════════════════════════════════
// مصدر واحد للأعداد: طلبات التواصل الجديدة، واعتماد المسارات، والمتطلبات
// المرسلة، والنماذج المسلّمة، ووثائق مشاريع التخرج. يُحدَّث كل دقيقتين، وفور أي حفظ يطلق «mi:pending».
import { useCallback, useEffect, useState } from 'react';
import { call } from './api.js';
import { L } from './leaders.js';

export function countPending({ contacts, reviews, submissions, capstones }) {
  const approvals = (reviews?.pending_approval || []).length;
  const requirements = (reviews?.submitted || []).length;
  return {
    contacts: (contacts?.contacts || []).filter((c) => (c.status || 'new') === 'new').length,
    approvals, requirements,
    participants: approvals + requirements,
    models: (submissions?.submissions || []).length,
    capstones: (capstones?.capstones || []).length,
  };
}
export const leadersTotal = (p) => (p ? p.participants + p.models + (p.capstones || 0) : 0);

// يطلبها أي مكوّن بعد حفظ يغيّر ما ينتظر القرار
export const refreshPending = () => window.dispatchEvent(new Event('mi:pending'));

// شاشة طلبات التواصل تعلن عدد الجديد مما حمّلته، فلا يُطلب القائمة مرتين
export const announceContacts = (rows) => window.dispatchEvent(new CustomEvent('mi:contacts', { detail: countPending({ contacts: { contacts: rows } }).contacts }));

// في سياق طلبات التواصل يأتي عددها من الشاشة نفسها، وفي غيره يُطلب هنا
export function usePending(ctx) {
  const [p, setP] = useState(null);
  const load = useCallback(async () => {
    const [contacts, reviews, submissions, capstones] = await Promise.all([
      ctx === 'contacts' ? null : call('list-contacts').catch(() => null),
      L('admin.reviews').catch(() => null),
      L('admin.submissions', { status: 'submitted' }).catch(() => null),
      L('admin.capstones', { status: 'submitted' }).catch(() => null),
    ]);
    const next = countPending({ contacts, reviews, submissions, capstones });
    setP((old) => ({ ...next, contacts: contacts ? next.contacts : old?.contacts ?? 0 }));
  }, [ctx]);
  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    const onContacts = (e) => setP((old) => ({ ...(old || countPending({})), contacts: e.detail }));
    window.addEventListener('mi:pending', load);
    window.addEventListener('mi:contacts', onContacts);
    return () => { clearInterval(t); window.removeEventListener('mi:pending', load); window.removeEventListener('mi:contacts', onContacts); };
  }, [load]);
  return p;
}
