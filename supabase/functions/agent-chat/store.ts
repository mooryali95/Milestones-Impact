// ════════════════════════════════════════════════════════════════
// تخزين المحادثات وسجل الإنفاق: واجهة صغيرة فوق Supabase (واختبارها بذاكرة)
// ════════════════════════════════════════════════════════════════
// كل جدول هنا في مخطط leaders ولا يقرؤه إلا دور الخدمة. غياب الجداول (قبل الترحيل) يرمي Unavailable،
// فترد الدالة agent_unavailable وتعرض النافذة «اترك رسالتك» عبر النموذج، ولا يتعطل شيء آخر.
import type { Turn } from './model.ts';

// deno-lint-ignore no-explicit-any
type SB = any;
export class Unavailable extends Error {}

export type Conversation = { id: string; product: string; source_url: string | null; locale: string | null; status: 'bot' | 'waiting' | 'closed'; ip?: string | null; visitor_messages: number; contact_request_id: string | null; created_at: string };
export type MessageRow = {
  conversation_id: string; role: 'visitor' | 'agent' | 'canned' | 'system'; body: string; lang?: string | null; model?: string | null; stop_reason?: string | null;
  input_tokens?: number | null; cache_read_tokens?: number | null; cache_write_tokens?: number | null; output_tokens?: number | null; cost_micros?: number | null;
};
export type Reserve = { ok: true; total: number } | { ok: false; reason: 'refused' | 'error' };
export type Price = { enabled: boolean; currency: string; assessment_cents: number; program_cents: number };

// ip في العدادات: undefined للجميع، وnull للطلبات بلا عنوان معروف (دلو واحد مشترك بحده، لا إعفاء)، وإلا فالعنوان
export interface Store {
  countConversations(sinceIso: string, ip?: string | null): Promise<number | null>;
  countModelCalls(sinceIso: string): Promise<number | null>;
  // استدعاءات النموذج من محادثات هذه الشبكة منذ الوقت المعطى
  countIpModelCalls(sinceIso: string, ip: string | null): Promise<number | null>;
  countHandoffs(sinceIso: string, ip?: string | null): Promise<number | null>;
  createConversation(row: { public_token_hash: string; product: string; source_url: string; locale: string; ip: string | null }): Promise<string>;
  findConversation(tokenHash: string): Promise<Conversation | null>;
  history(conversationId: string): Promise<Turn[]>;
  addMessage(row: MessageRow): Promise<string>;
  updateMessage(id: string, patch: Partial<MessageRow>): Promise<void>;
  updateConversation(id: string, patch: Record<string, unknown>): Promise<void>;
  // رسالة الزائر ذريًا: العدد بعدها، أو null إن بلغت المحادثة حدها أو لم تعد مع المساعد
  claimMessage(id: string, max: number, atIso: string): Promise<number | null>;
  // التحويل ذريًا: true لطلب واحد فقط (المحادثة مع المساعد وبلا طلب تواصل)
  claimHandoff(id: string, reason: string, atIso: string): Promise<boolean>;
  spentToday(day: string): Promise<number | null>;
  // حجز أسوأ تكلفة قبل الاستدعاء (ذري ومقيد بالسقف)، ثم تسويته بالفعلية بعده
  reserveSpend(day: string, micros: number, capMicros: number): Promise<Reserve>;
  settleSpend(day: string, deltaMicros: number): Promise<number | null>;
  markAlert(day: string, level: 80 | 100 | 1): Promise<boolean>;
  leadersPrice(): Promise<Price | null>;
  insertContact(row: Record<string, unknown>, ip: string | null): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  purgeExpired(): Promise<void>;
  client(): SB;
}

// deno-lint-ignore no-explicit-any
const byIp = (q: any, ip: string | null | undefined) => (ip === undefined ? q : ip === null ? q.is('ip', null) : q.eq('ip', ip));
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202');
function check(error: { code?: string; message?: string } | null, what: string) {
  if (!error) return;
  if (missing(error)) throw new Unavailable(what);
  throw new Error(`${what}: ${error.message || error.code}`);
}

export function supabaseStore(base: SB, insertContactRequest: (sb: SB, row: Record<string, unknown>, ip: string | null) => Promise<{ data: Record<string, unknown> | null; error: unknown }>): Store {
  const lead = () => base.schema('leaders');
  let ledgerBroken: string | null = null;
  return {
    client: () => base,
    async countConversations(since, ip) {
      const q = byIp(lead().from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', since), ip);
      const { count, error } = await q;
      if (missing(error)) throw new Unavailable('conversations');
      return error ? null : (count ?? 0);
    },
    async countModelCalls(since) {
      const { count, error } = await lead().from('conversation_messages').select('id', { count: 'exact', head: true }).eq('role', 'agent').gte('created_at', since);
      if (missing(error)) throw new Unavailable('conversation_messages');
      return error ? null : (count ?? 0);
    },
    async countIpModelCalls(since, ip) {
      const { data, error } = await lead().rpc('agent_ip_calls', { p_ip: ip, p_since: since });
      if (missing(error)) throw new Unavailable('agent_ip_calls');
      if (error) { console.error('agent ip calls:', error.message); return null; }
      return Number(data ?? 0);
    },
    async countHandoffs(since, ip) {
      const q = byIp(lead().from('conversations').select('id', { count: 'exact', head: true }).gte('handoff_at', since), ip);
      const { count, error } = await q;
      if (missing(error)) throw new Unavailable('conversations');
      return error ? null : (count ?? 0);
    },
    async createConversation(row) {
      const { data, error } = await lead().from('conversations').insert(row).select('id').single();
      check(error, 'conversation insert');
      return String(data.id);
    },
    async findConversation(hash) {
      const { data, error } = await lead().from('conversations')
        .select('id, product, source_url, locale, status, ip, visitor_messages, contact_request_id, created_at, expires_at')
        .eq('public_token_hash', hash).maybeSingle();
      check(error, 'conversation read');
      if (!data || Date.parse(data.expires_at) < Date.now()) return null;
      return data as Conversation;
    },
    async history(id) {
      const { data, error } = await lead().from('conversation_messages').select('role, body').eq('conversation_id', id)
        .in('role', ['visitor', 'agent', 'canned']).neq('body', '').order('id', { ascending: true }).limit(200);
      check(error, 'history read');
      return (data ?? []) as Turn[];
    },
    async addMessage(row) {
      const { data, error } = await lead().from('conversation_messages').insert(row).select('id').single();
      check(error, 'message insert');
      return String(data.id);
    },
    async updateMessage(id, patch) {
      const { error } = await lead().from('conversation_messages').update(patch).eq('id', id);
      check(error, 'message update');
    },
    async updateConversation(id, patch) {
      const { error } = await lead().from('conversations').update(patch).eq('id', id);
      check(error, 'conversation update');
    },
    async claimMessage(id, max, at) {
      const { data, error } = await lead().rpc('agent_claim_message', { p_id: id, p_max: max, p_at: at });
      check(error, 'message claim');
      return data === null || data === undefined ? null : Number(data);
    },
    async claimHandoff(id, reason, at) {
      const { data, error } = await lead().from('conversations').update({ status: 'waiting', handoff_reason: reason, handoff_at: at })
        .eq('id', id).eq('status', 'bot').is('contact_request_id', null).select('id');
      check(error, 'handoff claim');
      return Array.isArray(data) && data.length === 1;
    },
    async spentToday(day) {
      const { data, error } = await lead().from('agent_spend_daily').select('micros').eq('day', day).maybeSingle();
      if (missing(error)) throw new Unavailable('agent_spend_daily');
      if (error) { console.error('agent spend read:', error.message); return null; }
      return Number(data?.micros ?? 0);
    },
    // السجل يفشل مغلقًا: خطأ في الحجز = لا استدعاء، وخطأ في التسوية يوقف الاستدعاءات في هذه النسخة بقية اليوم
    // (المحجوز يبقى محسوبًا، فلا يضيع ما فوتره Anthropic إلا زيادة الفعلية على الأسوأ).
    async reserveSpend(day, micros, cap) {
      if (ledgerBroken === day) return { ok: false, reason: 'error' };
      const { data, error } = await lead().rpc('agent_spend_reserve', { p_day: day, p_micros: micros, p_cap: cap });
      if (error) { console.error('agent spend reserve:', error.code, error.message); return { ok: false, reason: 'error' }; }
      if (data === null || data === undefined) return { ok: false, reason: 'refused' };
      return { ok: true, total: Number(data) };
    },
    async settleSpend(day, delta) {
      const { data, error } = await lead().rpc('agent_spend_settle', { p_day: day, p_delta: delta });
      if (error || data === null || data === undefined) {
        console.error('agent spend settle:', error?.code, error?.message);
        if (delta > 0) ledgerBroken = day;
        return null;
      }
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
      // غير المحولة بعد مدتها (90 يومًا): الدالة نفسها التي تشغلها المهمة المجدولة اليومية في القاعدة
      const { error } = await lead().rpc('agent_purge_expired');
      if (error) console.error('agent purge:', error.message);
    },
  };
}
