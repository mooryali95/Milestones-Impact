// ════════════════════════════════════════════════════════════════
// صلاحية الكتابة في اللوحة: من حكم الخادم («me» في admin-api، writeAccess في step_up.ts) لا من الدور وحده
// ════════════════════════════════════════════════════════════════
// المرحلة 2 من تصور لوحة الإدارة (الصدق في الجلسة). قبل وصول الرد تُقرأ طريقة الدخول المحفوظة مع الجلسة،
// وإن غابت (جلسة قديمة) أو تعذّر الرد فالحكم القديم بالدور: لا تُحجب الكتابة عن مدير خطأً، والخادم يحرس على أي حال.
const SECOND = new Set(['passkey', 'totp']);

export function writeState(user, me) {
  const role = user?.role_id || user?.role;
  const writer = role === 'admin' || role === 'super_admin';
  if (me?.success && typeof me.can_write === 'boolean') {
    return { canWrite: me.can_write, readOnly: !me.can_write && !!me.can_elevate, source: 'server' };
  }
  const method = user?.method;
  if (method) return { canWrite: writer && SECOND.has(method), readOnly: writer && !SECOND.has(method), source: 'session' };
  return { canWrite: role !== 'viewer', readOnly: false, source: 'role' };
}
