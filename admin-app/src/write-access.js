// ════════════════════════════════════════════════════════════════
// صلاحية الكتابة في اللوحة: من حكم الخادم («me» في admin-api، writeAccess في step_up.ts) لا من الدور وحده
// ════════════════════════════════════════════════════════════════
// المرحلة 2 من تصور لوحة الإدارة (الصدق في الجلسة). قبل وصول الرد تُقرأ طريقة الدخول المحفوظة مع الجلسة،
// وإن غابت (جلسة قديمة) أو تعذّر الرد فالحكم القديم بالدور: لا تُحجب الكتابة عن مدير خطأً، والخادم يحرس على أي حال.
import { hasSecondFactor } from '../../supabase/functions/_shared/second_factor.js';

export function writeState(user, me) {
  const role = user?.role_id || user?.role;
  const writer = role === 'admin' || role === 'super_admin';
  // حكم الخادم لطريقة غير طريقة الجلسة المحفوظة قديم (جلسة سابقة، أو قبل «فعّل الكتابة»): يُترك حتى يصل رد الجلسة الحالية
  const stale = !!(me?.method && user?.method && me.method !== user.method);
  if (me?.success && typeof me.can_write === 'boolean' && !stale) {
    return { canWrite: me.can_write, readOnly: !me.can_write && !!me.can_elevate, source: 'server' };
  }
  const method = user?.method;
  if (method) return { canWrite: writer && hasSecondFactor(method), readOnly: writer && !hasSecondFactor(method), source: 'session' };
  return { canWrite: role !== 'viewer', readOnly: false, source: 'role' };
}
