// ════════════════════════════════════════════════════════════════
// تخزين المحادثات وسجل الإنفاق: واجهة صغيرة فوق Supabase (واختبارها بذاكرة)
// ════════════════════════════════════════════════════════════════
// كل جدول هنا في مخطط leaders ولا يقرؤه إلا دور الخدمة. غياب الجداول (قبل الترحيل) يرمي Unavailable،
// فترد الدالة agent_unavailable وتعرض النافذة «اترك رسالتك» عبر النموذج، ولا يتعطل شيء آخر.
import type { Turn } from './model.ts';

// deno-lint-ignore no-explicit-any
type SB = any;
export class Unavailable extends Error {}

export type Conversation = { id: string; product: string; source_url: string | null; locale: string | null; status: 'bot' | 'waiting' | 'closed'; visitor_messages: number; contact_request_id: string | null; created_at: string };
export type MessageRow = {
  conversation_id: string; role: 'visitor' | 'agent' | 'canned' | 'system'; body: string; lang?: string | null; model?: string | null; stop_reason?: string | null;
  input_tokens?: number | null; cache_read_tokens?: number | null; cache_write_tokens?: number | null; output_tokens?: number | null; cost_micros?: number | null;
};
export type Price = { enabled: boolean; currency: string; assessment_cents: number; program_cents: number };

export interface Store {
  countConversations(sinceIso: string, ip?: string | null): Promise<number | null>;
  countModelCalls(sinceIso: string): Promise<number | null>;
  createConversation(row: { public_token_hash: string; product: string; source_url: string; locale: string; ip: string | null }): Promise<string>;
  findConversation(tokenHash: string): Promise<Conversation | null>;
  history(conversationId: string): Promise<Turn[]>;
  addMessage(row: MessageRow): Promise<void>;
  updateConversation(id: string, patch: Record<string, unknown>): Promise<void>;
  spentToday(day: string): Promise<number | null>;
  addSpend(day: string, micros: number): Promise<number | null>;
  markAlert(day: string, level: 80 | 100): Promise<boolean>;
  leadersPrice(): Promise<Price | null>;
  insertContact(row: Record<string, unknown>, ip: string | null): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  purgeExpired(): Promise<void>;
  client(): SB;
}

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202');
function check(error: { code?: string; message?: string } | null, what: string) {
  if (!error) return;
  if (missing(error)) throw new Unavailable(what);
  throw new Error(`${what}: ${error.message || error.code}`);
}

export function supabaseStore(base: SB, insertContactRequest: (sb: SB, row: Record<string, unknown>, ip: string | null) => Promise<{ data: Record<string, unknown> | null; error: unknown }>): Store {
  const lead = () => base.schema('leaders');
  return {
    client: () => base,
    async countConversations(since, ip) {
      let q = lead().from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', since);
      if (ip) q = q.eq('ip', ip);
      const { count, error } = await q;
      if (missing(error)) throw new Unavailable('conversations');
      return error ? null : (count ?? 0);
    },
    async countModelCalls(since) {
      const { count, error } = await lead().from('conversation_messages').select('id', { count: 'exact', head: true }).eq('role', 'agent').gte('created_at', since);
      if (missing(error)) throw new Unavailable('conversation_messages');
      return error ? null : (count ?? 0);
    },
    async createConversation(row) {
      const { data, error } = await lead().from('conversations').insert(row).select('id').single();
      check(error, 'conversation insert');
      return String(data.id);
    },
    async findConversation(hash) {
      const { data, error } = await lead().from('conversations')
        .select('id, product, source_url, locale, status, visitor_messages, contact_request_id, created_at, expires_at')
        .eq('public_token_hash', hash).maybeSingle();
      check(error, 'conversation read');
      if (!data || Date.parse(data.expires_at) < Date.now()) return null;
      return data as Conversation;
    },
    async history(id) {
      const { data, error } = await lead().from('conversation_messages').select('role, body').eq('conversation_id', id)
        .in('role', ['visitor', 'agent', 'canned']).order('id', { ascending: true }).limit(200);
      check(error, 'history read');
      return (data ?? []) as Turn[];
    },
    async addMessage(row) {
      const { error } = await lead().from('conversation_messages').insert(row);
      check(error, 'message insert');
    },
    async updateConversation(id, patch) {
      const { error } = await lead().from('conversations').update(patch).eq('id', id);
      check(error, 'conversation update');
    },
    async spentToday(day) {
      const { data, error } = await lead().from('agent_spend_daily').select('micros').eq('day', day).maybeSingle();
      if (missing(error)) throw new Unavailable('agent_spend_daily');
      if (error) { console.error('agent spend read:', error.message); return null; }
      return Number(data?.micros ?? 0);
    },
    async addSpend(day, micros) {
      const { data, error } = await lead().rpc('agent_spend_add', { p_day: day, p_micros: micros });
      if (error) { console.error('agent spend add:', error.message); return null; }
      return Number(data);
    },
    async markAlert(day, level) {
      const { data, error } = await lead().rpc('agent_spend_alert', { p_day: day, p_level: level });
      if (error) { console.error('agent spend alert:', error.message); return false; }
      return data === true;
    },
    async leadersPrice() {
      // إعداد الدفع وحده: لا جدول للجهات ولا العقود
      const { data, error } = await lead().from('payment_settings').select('enabled, currency, assessment_cents, program_cents').eq('id', true).maybeSingle();
      if (error || !data) return null;
      return data as Price;
    },
    insertContact: (row, ip) => insertContactRequest(base, row, ip),
    async purgeExpired() {
      // غير المحولة بعد مدتها (90 يومًا)، دفعة صغيرة في كل بدء محادثة
      const { data } = await lead().from('conversations').select('id').is('contact_request_id', null).lt('expires_at', new Date().toISOString()).limit(100);
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      if (ids.length) await lead().from('conversations').delete().in('id', ids);
    },
  };
}
