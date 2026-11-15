// مخزن في الذاكرة بسلوك المخزن الحقيقي نفسه (الحجز الذري، والسقف، والتحويل مرة واحدة): للاختبارات وللتقييم وحدهما.
import type { Turn } from './model.ts';
import { type Conversation, type MessageRow, type Price, type Store, Unavailable } from './store.ts';

export type MemConv = Conversation & { public_token_hash: string; ip: string | null; rating?: number; handoff_at?: string | null; handoff_reason?: string | null; last_visitor_at?: string };
export type Mem = {
  convs: MemConv[]; msgs: (MessageRow & { id: string })[]; spend: Map<string, number>; alerts: Set<string>;
  contacts: Record<string, unknown>[]; price: Price | null; missing?: boolean;
  // محاكاة أعطال السجل
  reserveError?: boolean; settleError?: boolean;
};

export const emptyMem = (over: Partial<Mem> = {}): Mem => ({ convs: [], msgs: [], spend: new Map(), alerts: new Set(), contacts: [], price: null, ...over });

export function memStore(m: Mem): Store {
  const guard = () => { if (m.missing) throw new Unavailable('conversations'); };
  let seq = 0;
  let broken: string | null = null;
  return {
    client: () => null,
    countConversations: async (since, ip) => { guard(); return m.convs.filter((c) => c.created_at >= since && (!ip || c.ip === ip)).length; },
    countModelCalls: async () => m.msgs.filter((x) => x.role === 'agent').length,
    countHandoffs: async (since, ip) => m.convs.filter((c) => c.handoff_at && c.handoff_at >= since && (!ip || c.ip === ip)).length,
    createConversation: async (row) => { guard(); const id = crypto.randomUUID(); m.convs.push({ id, status: 'bot', visitor_messages: 0, contact_request_id: null, created_at: new Date().toISOString(), ...row }); return id; },
    findConversation: async (h) => { guard(); const c = m.convs.find((x) => x.public_token_hash === h); return c ? { ...c } : null; },
    history: async (id) => m.msgs.filter((x) => x.conversation_id === id && x.role !== 'system' && x.body !== '').map((x) => ({ role: x.role as Turn['role'], body: x.body })),
    addMessage: async (row) => { const id = String(++seq); m.msgs.push({ ...row, id }); return id; },
    updateMessage: async (id, patch) => { Object.assign(m.msgs.find((x) => x.id === id)!, patch); },
    updateConversation: async (id, patch) => { Object.assign(m.convs.find((c) => c.id === id)!, patch); },
    claimMessage: async (id, max, at) => {
      const c = m.convs.find((x) => x.id === id);
      if (!c || c.status !== 'bot' || c.visitor_messages >= max) return null;
      c.visitor_messages += 1; c.last_visitor_at = at;
      return c.visitor_messages;
    },
    claimHandoff: async (id, reason, at) => {
      const c = m.convs.find((x) => x.id === id);
      if (!c || c.status !== 'bot' || c.contact_request_id) return false;
      Object.assign(c, { status: 'waiting', handoff_reason: reason, handoff_at: at });
      return true;
    },
    spentToday: async (day) => m.spend.get(day) ?? 0,
    reserveSpend: async (day, micros, cap) => {
      if (m.reserveError || broken === day) return { ok: false, reason: 'error' };
      const cur = m.spend.get(day) ?? 0;
      if (cur + Math.max(micros, 0) > cap) return { ok: false, reason: 'refused' };
      m.spend.set(day, cur + Math.max(micros, 0));
      return { ok: true, total: m.spend.get(day)! };
    },
    settleSpend: async (day, delta) => {
      if (m.settleError) { if (delta > 0) broken = day; return null; }
      m.spend.set(day, Math.max((m.spend.get(day) ?? 0) + delta, 0));
      return m.spend.get(day)!;
    },
    markAlert: async (day, level) => { const k = `${day}|${level}`; if (m.alerts.has(k)) return false; m.alerts.add(k); return true; },
    leadersPrice: async () => m.price,
    insertContact: async (row) => { const data = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }; m.contacts.push(data); return { data, error: null }; },
    purgeExpired: async () => {},
  };
}
