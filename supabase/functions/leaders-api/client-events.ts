// ════════════════════════════════════════════════════════════════
// أحداث الإخفاق من جهة العميل: client.event (تصور التحديث بلا أثر، المرحلة 4، البنود 1 و3)
// ════════════════════════════════════════════════════════════════
// فعل مفتوح بلا جلسة: العطل الذي نرصده قد يكون الجلسة نفسها أو الإقلاع، والحدث يُرسل بعد عودة الاتصال من طابور الجهاز
// (leaders-app/src/telemetry.js). فله سقف حجم وعدد، وحد معدل لكل عنوان شبكة ببصمته لا بالعنوان نفسه، وحد عام.
// ما يُحفظ وحده: النوع والفعل وعدد المحاولات والبناء ووقت الجهاز، ونص قصير منقّى لأخطاء الصفحة، وبصمة الشبكة للحد.
// لا رمز ولا معرّف مستخدم ولا بريد ولا رابط باستعلام ولا جسم طلب: ما سوى هذه الحقول يُتجاهل، والنص يُنقّى ثانية هنا.
// يُحذف بعد 30 يومًا (pg_cron يوميًا في الترحيل، وpurge الأسبوعي في system.ts احتياطًا).
// التنبيه بالمعدل: أكثر من CLIENT_ALERT.bootDevices جهازًا مختلفًا أخفق فتحها (me) في 5 دقائق ← alertOps('client_boot_failures').
// قبل الترحيل 20261118150000 (الجدول غائب) يرد not_migrated، فيُسقط العميل طابوره بصمت.
import { alertOps, db, Fail, hash } from './core.ts';
import { missingTable } from './missing-column.ts';
import { cleanAct, cleanBuild, CLIENT_EVENT_BODY_CHARS, CLIENT_EVENT_KINDS, MESSAGE_KINDS } from '../_shared/client-events.js';

type Body = Record<string, any>;
export const CLIENT_EVENTS_TABLE = 'client_events';
export const CLIENT_EVENT_LIMITS = Object.freeze({ batch: 20, bodyChars: CLIENT_EVENT_BODY_CHARS, message: 160, perIp10Min: 120, global1Min: 2_000 });
export const CLIENT_ALERT = Object.freeze({ bootDevices: 10, windowMin: 5 });
export const CLIENT_EVENTS_RETENTION_DAYS = 30;

// النص بعد تنقية العميل يُنقّى ثانية: لا يُوثق بما يصل من جهاز
export function scrubMessage(m: unknown) {
  return String(m ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[id]')
    .replace(/\d{3,}/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CLIENT_EVENT_LIMITS.message);
}

// الحدث بالحقول المسموحة وحدها، أو null إن لم يكن نوعه معروفًا. وقت الجهاز يُقبل إن كان في اليومين الأخيرين، وإلا وقت الخادم
export function cleanEvent(e: any, now = Date.now()) {
  if (!e || typeof e !== 'object' || !CLIENT_EVENT_KINDS.includes(e.kind)) return null;
  const t = Date.parse(String(e.at || ''));
  const at = Number.isFinite(t) && t <= now + 5 * 60_000 && t >= now - 2 * 864e5 ? new Date(t).toISOString() : new Date(now).toISOString();
  const message = MESSAGE_KINDS.includes(e.kind) ? scrubMessage(e.message) : '';
  return {
    kind: e.kind as string,
    act: cleanAct(e.act),
    tries: Math.max(1, Math.min(50, Math.round(Number(e.tries) || 1))),
    build: cleanBuild(e.build) || null,
    message: message || null,
    at,
  };
}

export async function record(b: Body, ctx: { ip?: string | null; build?: string | null }) {
  const notMigrated = () => new Fail('الرصد غير متاح بعد', 503, 'not_migrated');
  if (JSON.stringify(b ?? {}).length > CLIENT_EVENT_LIMITS.bodyChars) throw new Fail('الطلب أكبر من المسموح', 413, 'too_large');
  const raw = Array.isArray(b?.events) ? b.events : [];
  if (!raw.length || raw.length > CLIENT_EVENT_LIMITS.batch) throw new Fail('عدد الأحداث غير مقبول', 400, 'bad_request');
  const now = Date.now();
  const events = raw.map((e: any) => cleanEvent(e, now)).filter(Boolean) as NonNullable<ReturnType<typeof cleanEvent>>[];
  if (!events.length) throw new Fail('لا حدث صالحًا', 400, 'bad_request');

  const ipHash = ctx.ip ? await hash(`client-event:${ctx.ip}`) : null;
  const since10 = new Date(now - 6e5).toISOString();
  const since1 = new Date(now - 6e4).toISOString();
  const counts = () => Promise.all([
    ipHash ? db.from(CLIENT_EVENTS_TABLE).select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since10) : Promise.resolve({ count: 0, error: null }),
    db.from(CLIENT_EVENTS_TABLE).select('id', { count: 'exact', head: true }).gte('created_at', since1),
  ]) as Promise<any[]>;
  const failed = (res: any) => { if (missingTable(res.error)) throw notMigrated(); throw new Fail('تعذّر الحفظ', 503, 'busy_store'); };
  // الفحص الأول يرد الفيضان الظاهر بلا كتابة
  const [byIp, all] = await counts();
  for (const res of [byIp, all]) if (res.error) failed(res);
  if ((byIp.count ?? 0) + events.length > CLIENT_EVENT_LIMITS.perIp10Min) throw new Fail('أحداث كثيرة في وقت قصير', 429, 'rate');
  // الحد العام: فيضان من شبكات كثيرة لا يملأ الجدول. يُقبل الطلب ويُسقط ما فيه، فلا يعيده العميل
  if ((all.count ?? 0) >= CLIENT_EVENT_LIMITS.global1Min) return { success: true, stored: 0, dropped: events.length };

  const build = cleanBuild(ctx.build) || null;
  const rows = events.map((e) => ({ ...e, build: e.build || build, ip_hash: ipHash }));
  const ins = await db.from(CLIENT_EVENTS_TABLE).insert(rows).select('id');
  if (ins.error) failed(ins);
  // الفحص الثاني بعد الكتابة: طلبات متزامنة قرأت العدّ نفسه قبل أن يكتب أحدها، فكل منها يعدّ الآن ما كتبه الجميع ويحذف ما
  // كتبه إن تجاوز العدّ الحد. فلا تتجاوز الشبكة الواحدة حدها ولا يتجاوز الجميع الحد العام مهما تزامنت الطلبات
  const ids = ((ins.data || []) as any[]).map((r) => r.id);
  const [byIpAfter, allAfter] = await counts();
  const overIp = !byIpAfter.error && (byIpAfter.count ?? 0) > CLIENT_EVENT_LIMITS.perIp10Min;
  const overAll = !allAfter.error && (allAfter.count ?? 0) > CLIENT_EVENT_LIMITS.global1Min;
  if (overIp || overAll) {
    if (ids.length) await db.from(CLIENT_EVENTS_TABLE).delete().in('id', ids);
    if (overIp) throw new Fail('أحداث كثيرة في وقت قصير', 429, 'rate');
    return { success: true, stored: 0, dropped: events.length };
  }
  if (rows.some((r) => r.act === 'me' && r.kind !== 'offline')) await bootAlert(now).catch((e) => console.error('client boot alert:', e));
  return { success: true, stored: rows.length };
}

// إخفاق الفتح عند أجهزة كثيرة معًا: عدد الأجهزة المختلفة (بصمات الشبكة) التي أخفق فيها me خلال 5 دقائق. التهدئة في raiseAlert
// (ساعة لهذا النوع، ALERT_COOLDOWN_MS). لا يُعد: offline (الجهاز نفسه بلا شبكة، كقاعة بلا اتصال تُرسل طوابيرها معًا حين يعود،
// والمنصة سليمة)، ولا حدث بلا بناء (لم يرسله تطبيق محمَّل)، ولا حدث وقته على الجهاز قبل النافذة (طابور قديم أُرسل بعد عودة)
export async function bootAlert(now = Date.now()) {
  const since = new Date(now - CLIENT_ALERT.windowMin * 6e4).toISOString();
  const { data, error } = await db.from(CLIENT_EVENTS_TABLE).select('ip_hash, kind, build').eq('act', 'me').neq('kind', 'offline')
    .not('build', 'is', null).gte('created_at', since).gte('at', since).limit(1000);
  if (error) return false;
  const rows = (data || []) as any[];
  const devices = new Set(rows.map((r) => r.ip_hash || 'none')).size;
  if (devices <= CLIENT_ALERT.bootDevices) return false;
  const kinds: Record<string, number> = {};
  for (const r of rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  const builds = [...new Set(rows.map((r) => r.build).filter(Boolean))].slice(0, 5).join(' ');
  await alertOps('client_boot_failures', { devices, events: rows.length, window_min: CLIENT_ALERT.windowMin, kinds: Object.entries(kinds).map(([k, n]) => `${k}:${n}`).join(' '), builds });
  return true;
}
