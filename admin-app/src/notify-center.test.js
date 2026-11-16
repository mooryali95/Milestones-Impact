// مركز الإشعارات، المرحلة 4: قسم «التوجيه» في مركز البريد (التصور 6.2 وخطة الاختبار 10.5).
// الدوال النقية التي يتحقق بها الخادم وترسم بها اللوحة: تحقق الصفوف، والمقفل، والصفوف الدنيا، وما تغير، ومعاينة الأثر،
// ونوع الحقل routing في settings.js، واستثناء المجموعة من الإعدادات العامة
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compactRows, EVENTS, EVENT_INDEX, impactOf, lockedOff, matrixOf, normalizeSettings, paymentFallback, route, routingChanges, rowError,
} from '../../supabase/functions/_shared/notify-routing.js';
import { cleanGroup, DEFAULTS, resolveSettings, SETTINGS } from '../../supabase/functions/leaders-api/settings.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const LOCKED = EVENTS.filter((e) => e.locked).map((e) => e.key);

describe('الصفوف المقفلة', () => {
  it('رسائل الأمان والمال والحذف وطلب التواصل وبريد تغيير التوجيه مقفلة', () => {
    for (const k of ['owner_login_new_device', 'admin_security_change', 'erase_request', 'payment_mismatch', 'creem-webhook', 'contact_request', 'notify_routing_changed', 'slack_down']) expect(LOCKED, k).toContain(k);
  });
  it('إطفاء بريد صف مقفل يُكشف ويُرفض، وإبقاؤه مع إضافة Slack مقبول', () => {
    expect(lockedOff({ erase_request: { email: false, slack: true } })).toEqual(['erase_request']);
    expect(lockedOff({ erase_request: { slack: true } })).toEqual(['erase_request']);
    expect(lockedOff({ erase_request: { email: true, slack: true }, sponsor_request: { email: false } })).toEqual([]);
    expect(rowError('erase_request', { email: false })).toMatch('صف مقفل');
    expect(rowError('erase_request', { email: true, slack: true })).toBeNull();
  });
  it('الصف المقفل يرسل البريد ولو كان المحفوظ مطفأ (القراءة لا تثق بالمخزن)', () => {
    for (const k of LOCKED) expect(route(k, { preset: 'quiet', rows: { [k]: { email: false, slack: false, digest: false } } }, 'ok').email, k).toBe(true);
  });
});

describe('تحقق الصف (rowError)', () => {
  it('حدث غير معروف، وقناة غير معروفة، وقيمة غير منطقية، وقناة لا يسمح بها الحدث', () => {
    expect(rowError('nope', { email: true })).toMatch('غير معروف');
    expect(rowError('sponsor_request', { sms: true })).toMatch('قناة غير معروفة');
    expect(rowError('sponsor_request', { email: 'yes' })).toMatch('نعم أو لا');
    expect(rowError('agent_key_changed', { email: true })).toMatch('لا يُرسل عبر');
    expect(rowError('sponsor_request', [])).toMatch('غير صالح');
    expect(rowError('sponsor_request', { email: true, slack: false, digest: true })).toBeNull();
  });
});

describe('نوع الحقل routing في settings.js', () => {
  it('المجموعة notifications للمالك وحده ولها لوحتها في مركز البريد', () => {
    expect(SETTINGS.notifications.owner).toBe(true);
    expect(SETTINGS.notifications.panel).toBe('mailcenter');
    expect(SETTINGS.notifications.fields.rows.type).toBe('routing');
    expect(DEFAULTS.notifications).toEqual({ preset: 'balanced', rows: {}, digest_hour: 9 });
  });
  it('cleanGroup يقبل صفًا صالحًا ويرفض المقفل المطفأ والإعداد الجاهز المجهول والساعة خارج اليوم', () => {
    const ok = cleanGroup('notifications', { preset: 'quiet', rows: { sponsor_request: { email: true, slack: true, digest: false } }, digest_hour: 7 });
    expect(ok).toEqual({ ok: true, value: { preset: 'quiet', rows: { sponsor_request: { email: true, slack: true, digest: false } }, digest_hour: 7 } });
    expect(cleanGroup('notifications', { rows: { erase_request: { email: false } } }).errors.rows).toMatch('صف مقفل');
    expect(cleanGroup('notifications', { preset: 'loud' }).ok).toBe(false);
    expect(cleanGroup('notifications', { digest_hour: 24 }).ok).toBe(false);
    expect(cleanGroup('notifications', { rows: 'x' }).ok).toBe(false);
  });
  it('مخزن تالف يعود إلى الافتراضي حقلًا حقلًا، والقراءة في الدوال تطابقه', () => {
    const v = resolveSettings([{ key: 'notifications', value: { preset: 'all', rows: { erase_request: { email: false } }, digest_hour: 'x' } }]).notifications;
    expect(v).toEqual({ preset: 'all', rows: {}, digest_hour: 9 });
    expect(normalizeSettings({ preset: 'all', digest_hour: 30 }).digest_hour).toBe(9);
    expect(normalizeSettings({ digest_hour: 7 }).digest_hour).toBe(7);
  });
});

describe('الصفوف الدنيا وما تغير', () => {
  it('compactRows يحفظ ما خالف الإعداد الجاهز وحده، ويبقي بريد المقفل', () => {
    const def = matrixOf({ preset: 'balanced' }).find((e) => e.key === 'sponsor_request').want;
    expect(compactRows('balanced', { sponsor_request: def })).toEqual({});
    expect(compactRows('balanced', { sponsor_request: { ...def, email: true } })).toEqual({ sponsor_request: { ...def, email: true } });
    expect(compactRows('balanced', { erase_request: { email: false, slack: true, digest: false }, nope: { email: true } })).toEqual({});
  });
  it('routingChanges بتسميات الفهرس: الإعداد الجاهز والساعة وكل صف تغير', () => {
    const c = routingChanges({ preset: 'balanced' }, { preset: 'quiet', digest_hour: 8 });
    expect(c[0]).toEqual(['الإعداد الجاهز', 'متوازن إلى هادئ']);
    expect(c.some(([k]) => k === 'موعد الملخص اليومي')).toBe(true);
    expect(c.some(([k]) => k === EVENT_INDEX.expert_profile_done.label)).toBe(true);
    expect(routingChanges({ preset: 'balanced' }, { preset: 'balanced', rows: {} })).toEqual([]);
    expect(c.flat().join(' ')).not.toMatch(/[\u2013\u2014]/);
  });
  it('مفتاح دفعة المالك القديم: صفا الدفعة والاسترداد بالبريد، وصف المركز يغلبه', () => {
    expect(route('payment_new', paymentFallback({}, true), 'ok').email).toBe(true);
    expect(route('payment_new', paymentFallback({}, false), 'ok').email).toBe(false);
    expect(route('payment_new', paymentFallback({ rows: { payment_new: { email: false, slack: true } } }, true), 'ok').email).toBe(false);
  });
});

describe('معاينة أثر آخر 7 أيام', () => {
  const counts = { mail_quota_70: 5, cert_key_missing: 1, sponsor_request: 3, expert_profile_done: 4 };
  it('«متوازن» وSlack يعمل: الحرج وحده بالبريد، والمعلوماتي ملخص', () => {
    // Slack: الحرج والمهم فورًا، وسطر ملخص لكل يوم فيه أحداث (7 أحداث في 7 أيام: 7 أسطر على الأكثر)
    expect(impactOf(counts, { preset: 'balanced' }, 'ok')).toEqual({ email: 1, slack: 1 + 5 + 3 + 7, digest: 3 + 4 });
  });
  it('«كل شيء» يضيف بريد المهم، وSlack غير مضبوط يحوّل المهم إلى البريد مع بريد ملخص واحد لكل يوم', () => {
    expect(impactOf(counts, { preset: 'all' }, 'ok').email).toBe(1 + 5 + 3);
    const off = impactOf(counts, { preset: 'balanced' }, 'unconfigured');
    expect(off.email).toBe(1 + 5 + 3 + 7);
    expect(off.slack).toBe(0);
  });
  it('لا أحداث: لا بريد', () => {
    expect(impactOf({}, { preset: 'all' }, 'unconfigured')).toEqual({ email: 0, slack: 0, digest: 0 });
  });
});

describe('اللوحة', () => {
  it('الإعدادات العامة لا ترسم مجموعة لها لوحتها، ومركز البريد يضم قسم «التوجيه»', () => {
    expect(read('admin-app/src/screens/AppSettings.jsx')).toMatch(/!SETTINGS\[g\]\.panel/);
    expect(read('admin-app/src/screens/MailCenter.jsx')).toMatch(/<NotifyRouting \/>/);
  });
  it('القسم يحفظ عبر admin.settings-save بمجموعة notifications، ويرسم الفهرس من الوحدة نفسها', () => {
    const src = read('admin-app/src/screens/NotifyRouting.jsx');
    expect(src).toMatch(/admin\.settings-save', \{ group: 'notifications'/);
    expect(src).toMatch(/_shared\/notify-routing\.js/);
    expect(src).not.toMatch(/[\u2013\u2014]/);
  });
  it('شاشة المدفوعات لا تعرض مفتاح دفعة المالك القديم وتحيل إلى «التوجيه»', () => {
    const src = read('admin-app/src/screens/Payments.jsx');
    expect(src).toMatch(/filter\(\(\[k\]\) => k !== 'owner'\)/);
    expect(src).toMatch(/«التوجيه» بمركز البريد/);
  });
});
