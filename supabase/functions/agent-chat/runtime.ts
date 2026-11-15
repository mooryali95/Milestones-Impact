// ════════════════════════════════════════════════════════════════
// حالة المساعد الفعلية والمفتاح: من صف الإعداد في القاعدة (اللوحة)، ومفتاح الطوارئ في البيئة فوقها
// ════════════════════════════════════════════════════════════════
// الفعلي = البيئة ليست off، والقاعدة مفعّلة، وبصمة التقييم الذي فُعّل عليه تساوي البصمة المنشورة الآن.
// LEADERS_AGENT_ENABLED مفتاح طوارئ فقط: off أو 0 أو false أو أي قيمة غريبة تطفئ كل شيء، وغير المضبوط أو on/1/true
// يترك الحكم للقاعدة (والافتراضي فيها مطفأ). المفتاح من القاعدة (Vault) أولًا ثم ANTHROPIC_API_KEY احتياطًا.
// يُخزن 60 ثانية للقراءة الناجحة و15 للفاشلة في كل نسخة، فالإطفاء والتدوير من اللوحة يسريان خلال دقيقة.
// الفشل مغلق: تعذر القراءة أو غياب الجدول = مطفأ.

export type RuntimeReason = 'env_off' | 'db_off' | 'stale' | 'unavailable' | null;
export type Runtime = { enabled: boolean; reason: RuntimeReason; apiKey: string; keySource: 'db' | 'env' | null };
export type RuntimeRow = { enabled?: boolean | null; enabled_fingerprint?: string | null; api_key?: string | null };
export type RuntimeRpc = () => PromiseLike<{ data: RuntimeRow[] | RuntimeRow | null; error: unknown }>;

export const RUNTIME_TTL_MS = 60_000;
export const RUNTIME_FAIL_TTL_MS = 15_000;

export function envMode(v: string | undefined | null): 'off' | 'allow' {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '' || s === '1' || s === 'on' || s === 'true' ? 'allow' : 'off';
}

// نقي: الحكم من الصف والبيئة والبصمة
export function decide(row: RuntimeRow | null, env: { mode: 'off' | 'allow'; envKey: string }, fingerprint: string, readable: boolean): Runtime {
  const dbKey = String(row?.api_key || '');
  const apiKey = dbKey || env.envKey || '';
  const keySource = dbKey ? 'db' : env.envKey ? 'env' : null;
  const base = { apiKey, keySource } as const;
  if (env.mode === 'off') return { ...base, enabled: false, reason: 'env_off' };
  if (!readable || !row) return { ...base, enabled: false, reason: 'unavailable' };
  if (!row.enabled) return { ...base, enabled: false, reason: 'db_off' };
  if (row.enabled_fingerprint !== fingerprint) return { ...base, enabled: false, reason: 'stale' };
  return { ...base, enabled: true, reason: null };
}

let cache: { until: number; value: Runtime } | null = null;
export const resetRuntime = () => { cache = null; };

export async function readRuntime(rpc: RuntimeRpc, env: { mode: string | undefined; envKey: string; fingerprint: () => Promise<string> }, now = Date.now()): Promise<Runtime> {
  if (cache && cache.until > now) return cache.value;
  const mode = envMode(env.mode);
  const fingerprint = await env.fingerprint();
  let row: RuntimeRow | null = null;
  let readable = false;
  try {
    const { data, error } = await rpc();
    if (!error) {
      row = Array.isArray(data) ? (data[0] ?? null) : data;
      readable = !!row;
    } else {
      // لا يُطبع نص الخطأ: رسالة PostgREST قد تقتبس ما لا يلزم
      console.error('agent runtime: read failed', (error as { code?: string })?.code ?? 'error');
    }
  } catch (e) {
    console.error('agent runtime: read threw', (e as Error)?.name);
  }
  const value = decide(row, { mode, envKey: env.envKey }, fingerprint, readable);
  cache = { until: now + (readable ? RUNTIME_TTL_MS : RUNTIME_FAIL_TTL_MS), value };
  return value;
}

// تصنيف خطأ الاستدعاء إلى رمز مقيد (القيد نفسه في agent_settings.key_error): لا نص حر
export function keyErrorCode(e: unknown): string {
  const st = (e as { status?: unknown })?.status;
  if (typeof st === 'number') {
    if ([400, 401, 403, 404, 429].includes(st)) return `http_${st}`;
    if (st >= 500) return 'http_5xx';
  }
  const name = String((e as Error)?.name || '');
  if (/timeout|abort/i.test(name)) return 'timeout';
  return 'network';
}
