// ════════════════════════════════════════════════════════════════
// الإعدادات العامة: قراءة المخزن الواحد (leaders.app_settings) وتحريره من اللوحة
// ════════════════════════════════════════════════════════════════
// التعريف والتحقق والقيم الافتراضية في settings.js (يُختبر في vitest)، وهنا القراءة والكتابة والسجل.
// قبل ترحيل 20261111130100 يتعذر الجدول، فتعمل الدالة بالقيم الافتراضية ويرفض الحفظ بسبب واضح.
import { audit, db, Fail, publicDb, routingMail, ROUTING_MAIL_SUBJECT, sendMail } from './core.ts';
import { requireWrite, type Admin } from './admin.ts';
import { cleanGroup, DEFAULTS, resolveSettings, SETTINGS } from './settings.js';
import { lockedOff, routingChanges } from '../_shared/notify-routing.js';
import { resetNotifySettings } from '../_shared/notify-settings.ts';

type Body = Record<string, any>;
type Settings = typeof DEFAULTS;
const missingTable = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /app_settings/.test(String(e.message || '')));

// دقيقة واحدة في ذاكرة النسخة: تحرير الإدارة يمسحها فورًا في النسخة التي حفظت، والنسخ الأخرى تلحق خلال دقيقة
let cache: { at: number; value: Settings; rows: any[] } | null = null;
const TTL = 60e3;

async function readRows(): Promise<any[] | null> {
  const { data, error } = await db.from('app_settings').select('key, value, updated_by, updated_at');
  if (error) {
    if (missingTable(error)) return null;
    throw error;
  }
  return data || [];
}

// تعذّر القراءة العابر (لا غياب الجدول): تبقى آخر قيم قُرئت بنجاح ويُعاد الطلب بعد ثوانٍ، فلا يطفئ خطأ لحظي ميزة
// ظاهرة عن الجميع دقيقة كاملة (مفاتيح الميزات مطفأة افتراضيًا). وبلا قراءة سابقة في هذه النسخة: الافتراضي لثوانٍ فقط
const RETRY = 5e3;

// كل القيم بعد دمج المحرَّر فوق الافتراضي. المصدر الواحد لكل وحدة على الخادم
export async function appSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  let rows: any[] | null;
  try {
    rows = await readRows();
  } catch (e) {
    console.error('app_settings read', e);
    const value = cache?.value ?? (resolveSettings([]) as Settings);
    cache = { at: Date.now() - TTL + RETRY, value, rows: cache?.rows ?? [] };
    return value;
  }
  const value = resolveSettings(rows || []) as Settings;
  cache = { at: Date.now(), value, rows: rows || [] };
  return value;
}
export const resetSettingsCache = () => { cache = null; };
// للاختبار: تنتهي مدة الذاكرة الآن فتُقرأ القيم في النداء التالي، وتبقى آخر قيم ناجحة
export const expireSettingsCache = () => { if (cache) cache.at = 0; };

// اللوحة: التعريف (لترسم المحرر منه) والقيم ومن حرر كل مجموعة ومتى
export async function adminGet() {
  const rows = await readRows();
  return {
    success: true, schema: SETTINGS, defaults: DEFAULTS, values: resolveSettings(rows || []),
    ready: rows !== null,
    updated: Object.fromEntries((rows || []).map((r: any) => [r.key, { by: r.updated_by, at: r.updated_at }])),
  };
}

// ما يُحقن في الاختبار: الملاك (public.admin_users) وبريدهم الأمني
export const ST = {
  owners: async (): Promise<string[]> => {
    const { data, error } = await publicDb.from('admin_users').select('email').eq('is_owner', true).eq('is_active', true);
    if (error) throw error;
    return (data || []).map((r: any) => String(r.email || '')).filter(Boolean);
  },
  mail: (to: string, subject: string, html: string) => sendMail(to, subject, html, [], { kind: 'alert', ref: 'notifications' }),
};

// توجيه الإشعارات (مركز الإشعارات، المرحلة 4): كل حفظ يغير شيئًا يصل الملاك جميعًا ببريد أمني مقفل بما تغير، حتى لا
// يُسكت حساب مخترق التنبيهات بصمت. تعذّر البريد لا يرجع الحفظ (السجل كُتب)، ويُذكر في الرد
async function routingNotice(a: Admin, before: unknown, after: unknown) {
  const changes = routingChanges(before, after);
  if (!changes.length) return { mailed: 0, changes: 0 };
  const rows: [string, string][] = [['من حفظ', a.email], ['الوقت', new Date().toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh' })], ...changes.slice(0, 40) as [string, string][]];
  const owners = await ST.owners().catch((e) => { console.error('routing owners:', e); return [] as string[]; });
  let mailed = 0;
  for (const to of owners) await ST.mail(to, ROUTING_MAIL_SUBJECT, routingMail(rows)).then(() => { mailed++; }, (e) => console.error('routing mail:', e));
  return { mailed, changes: changes.length, owners: owners.length };
}

export async function adminSave(a: Admin, b: Body) {
  requireWrite(a);
  const group = String(b.group || '');
  if (!(group in SETTINGS)) throw new Fail('مجموعة إعدادات غير معروفة', 400, 'unknown_group');
  const def = (SETTINGS as any)[group];
  // مجموعة ضابط مالي (super في التعريف): للمدير الأعلى والمالك وحدهما
  if (def.super && a.role !== 'super_admin' && !a.owner) throw new Fail('هذه الإعدادات للمدير الأعلى والمالك وحدهما', 403, 'super_required');
  // مجموعة المالك (owner في التعريف، توجيه الإشعارات): للمالك وحده، ولا يكفي دور المدير الأعلى
  if (def.owner && !a.owner) throw new Fail('توجيه الإشعارات يحفظه المالك وحده', 403, 'owner_required');
  // صف مقفل لا يُطفأ بريده: رفض صريح قبل أي قراءة، ولو أرسله عميل غير اللوحة
  if (group === 'notifications') {
    const off = lockedOff(b.values?.rows);
    if (off.length) throw new Fail('صف مقفل لا يُطفأ بريده: رسائل الأمان والمال والحذف تصل بالبريد دائمًا', 400, 'locked_row', { rows: off });
  }
  const rows = await readRows();
  if (rows === null) throw new Fail('مخزن الإعدادات لم يُرحَّل بعد (20261111130100)، فتعمل القيم الافتراضية', 409, 'not_migrated');
  const before = rows.find((r: any) => r.key === group)?.value || null;
  const c = cleanGroup(group, b.values, before);
  if (!c.ok) throw new Fail(Object.values(c.errors || {})[0] || 'قيمة غير صالحة', 400, 'invalid', { errors: c.errors });
  const { error } = await db.from('app_settings').upsert({ key: group, value: c.value, updated_by: a.email, updated_at: new Date().toISOString() });
  if (error) throw new Fail('تعذّر حفظ الإعدادات', 500, 'save_failed');
  await audit('admin', a.email, 'admin.settings-save', 'app_settings', group, { key: group, value: before }, { key: group, value: c.value });
  resetSettingsCache();
  if (group === 'notifications') {
    resetNotifySettings();
    const notice = await routingNotice(a, before, c.value);
    return { ...(await adminGet()), notice };
  }
  // إظهار 360 بعد إخفائه يستأنف الدورات المجمدة من حيث توقفت: تُمد نوافذها بقدر مدة الإخفاء (feedback360.ts)
  if (group === 'feedback360' && before?.enabled !== true && (c.value as any)?.enabled === true) {
    const FB = await import('./feedback360.ts');
    // علامة بداية إخفاء مقيّمي الأثر إن لم تكتبها المهمة الساعية بعد: بلاها يُعد إطفاء أقدم من النشر بداية لإخفائهم
    await FB.markImpactPause();
    await FB.resumeFrozen(a.email);
  }
  return adminGet();
}
