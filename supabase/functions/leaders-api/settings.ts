// ════════════════════════════════════════════════════════════════
// الإعدادات العامة: قراءة المخزن الواحد (leaders.app_settings) وتحريره من اللوحة
// ════════════════════════════════════════════════════════════════
// التعريف والتحقق والقيم الافتراضية في settings.js (يُختبر في vitest)، وهنا القراءة والكتابة والسجل.
// قبل ترحيل 20261111130100 يتعذر الجدول، فتعمل الدالة بالقيم الافتراضية ويرفض الحفظ بسبب واضح.
import { audit, db, Fail } from './core.ts';
import { requireWrite, type Admin } from './admin.ts';
import { cleanGroup, DEFAULTS, resolveSettings, SETTINGS } from './settings.js';

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

// كل القيم بعد دمج المحرَّر فوق الافتراضي. المصدر الواحد لكل وحدة على الخادم
export async function appSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await readRows().catch((e) => { console.error('app_settings read', e); return null; });
  const value = resolveSettings(rows || []) as Settings;
  cache = { at: Date.now(), value, rows: rows || [] };
  return value;
}
export const resetSettingsCache = () => { cache = null; };

// اللوحة: التعريف (لترسم المحرر منه) والقيم ومن حرر كل مجموعة ومتى
export async function adminGet() {
  const rows = await readRows();
  return {
    success: true, schema: SETTINGS, defaults: DEFAULTS, values: resolveSettings(rows || []),
    ready: rows !== null,
    updated: Object.fromEntries((rows || []).map((r: any) => [r.key, { by: r.updated_by, at: r.updated_at }])),
  };
}

export async function adminSave(a: Admin, b: Body) {
  requireWrite(a);
  const group = String(b.group || '');
  if (!(group in SETTINGS)) throw new Fail('مجموعة إعدادات غير معروفة', 400, 'unknown_group');
  const rows = await readRows();
  if (rows === null) throw new Fail('مخزن الإعدادات لم يُرحَّل بعد (20261111130100)، فتعمل القيم الافتراضية', 409, 'not_migrated');
  const before = rows.find((r: any) => r.key === group)?.value || null;
  const c = cleanGroup(group, b.values, before);
  if (!c.ok) throw new Fail(Object.values(c.errors || {})[0] || 'قيمة غير صالحة', 400, 'invalid', { errors: c.errors });
  const { error } = await db.from('app_settings').upsert({ key: group, value: c.value, updated_by: a.email, updated_at: new Date().toISOString() });
  if (error) throw new Fail('تعذّر حفظ الإعدادات', 500, 'save_failed');
  await audit('admin', a.email, 'admin.settings-save', 'app_settings', group, { key: group, value: before }, { key: group, value: c.value });
  resetSettingsCache();
  return adminGet();
}
