// ════════════════════════════════════════════════════════════════
// قسم «التوجيه» في مركز البريد (مركز الإشعارات، المرحلة 4، التصور 6.2)
// ════════════════════════════════════════════════════════════════
// قراءة وحدها: الإعداد المحفوظ (leaders.app_settings، المفتاح notifications)، ومفتاح دفعة المالك القديم لقراءته الاحتياطية،
// وعدد كل حدث في آخر 7 أيام لمعاينة الأثر، وما وصل فعلًا إلى بريد التنبيه في المدة نفسها. الحفظ عبر admin.settings-save
// (settings.ts): للمالك وحده، ويرفض إطفاء صف مقفل، ويكتب السجل ويرسل البريد الأمني للملاك.
// العدّ بلا أسماء ولا عناوين: مفتاح الحدث من سجل التدقيق، وبصمة بريد التنبيه في سجل البريد.
import { CONFIG, db, publicDb } from './core.ts';
import type { Admin } from './admin.ts';
import { addressHash } from '../_shared/mail.ts';
import { eventOf, EVENT_INDEX, normalizeSettings } from '../_shared/notify-routing.js';
import { NOTICE_ACTION } from './notify.ts';

const DAYS = 7;
// سقف القراءة لكل مصدر: أسبوع مزدحم لا يقرأ السجل كله، وما بلغه يُذكر «أكثر من»
const READ_LIMIT = 5000;

// عدّ مصادر السجل بمفتاح الحدث. المصدر الذي تعذّر يُذكر باسمه، فلا تُعرض معاينة ناقصة كأنها كاملة
export async function weekCounts(now = Date.now()) {
  const since = new Date(now - DAYS * 864e5).toISOString();
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  let capped = false;
  const add = (k: string) => {
    const key = eventOf(k).key;
    if (!Object.hasOwn(EVENT_INDEX, key)) return;
    counts[key] = (counts[key] ?? 0) + 1;
  };
  const read = async (name: string, q: PromiseLike<{ data: any[] | null; error: any }>, keyOf: (r: any) => string) => {
    const { data, error } = await q;
    if (error) { errors.push(name); return; }
    if ((data || []).length >= READ_LIMIT) capped = true;
    for (const r of data || []) add(keyOf(r));
  };
  await Promise.all([
    read('alert', db.from('audit_log').select('entity_id').eq('action', 'system.alert').gte('created_at', since).limit(READ_LIMIT), (r) => String(r.entity_id || '')),
    read('notify', db.from('audit_log').select('entity_id').eq('action', NOTICE_ACTION).gte('created_at', since).limit(READ_LIMIT), (r) => String(r.entity_id || '')),
    // دخول المالك بجهازه (المرحلة 2): meta.device على سطر الدخول للمالك وحده
    read('login', publicDb.from('admin_audit_log').select('meta').eq('action', 'login').not('meta->>device', 'is', null).gte('created_at', since).limit(READ_LIMIT),
      (r) => (r.meta?.device === 'known' ? 'owner_login_known_device' : 'owner_login_new_device')),
  ]);
  return { since, counts, errors, capped };
}

// ما وصل فعلًا إلى بريد التنبيه في 7 أيام (mail_events ببصمة العنوان)، وnull إن لم يُقرأ أو لم يُضبط البريد
async function alertMailWeek(since: string): Promise<number | null> {
  if (!CONFIG.alertEmail) return null;
  const { count, error } = await db.from('mail_events').select('id', { count: 'exact', head: true })
    .eq('to_hash', await addressHash(CONFIG.alertEmail)).eq('status', 'sent').gte('created_at', since);
  return error ? null : (count ?? 0);
}

export async function routingState(a: Admin) {
  const [stored, pay, week] = await Promise.all([
    db.from('app_settings').select('value, updated_by, updated_at').eq('key', 'notifications').maybeSingle(),
    db.from('payment_settings').select('notify').eq('id', true).maybeSingle(),
    weekCounts(),
  ]);
  const mailed = await alertMailWeek(week.since).catch(() => null);
  return {
    success: true,
    // المخزن قبل ترحيله (20261111130100) أو تعذّره: يعمل «متوازن» ولا يُحفظ
    ready: !stored.error,
    settings: normalizeSettings(stored.error ? null : stored.data?.value),
    saved: !!(!stored.error && stored.data),
    updated: !stored.error && stored.data ? { by: stored.data.updated_by, at: stored.data.updated_at } : null,
    legacy_payment_owner: !pay.error && pay.data?.notify?.owner === true,
    owner: !!a.owner,
    days: DAYS,
    counts: week.counts,
    count_errors: week.errors,
    capped: week.capped,
    alert_mail_week: mailed,
    alert_email: !!CONFIG.alertEmail,
  };
}
