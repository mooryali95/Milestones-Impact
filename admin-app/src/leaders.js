// ════════════════════════════════════════════════════════════════
// تطبيق القادة: الاتصال بـ leaders-api والمسميات والحسابات المشتركة
// ════════════════════════════════════════════════════════════════
// توكن جلسة الإدارة نفسه يُرسل إلى leaders-api، فتتحقق منه في api_sessions.
import { fnUrl } from '../../src/lib/api.js';
import { BRAND } from '../../shared/js/brand.js';
import { post, session } from './api.js';

const API = fnUrl('leaders-api');

let onExpired = () => {};
export const setLeadersExpired = (fn) => { onExpired = fn; };

// الأوامر التي تغيّر ما ينتظر قرار الإدارة: بعد نجاحها تُحدَّث الأعداد على التبويبات
const CHANGES_PENDING = new Set(['admin.approve', 'admin.review', 'admin.review-submission', 'admin.status', 'admin.reset-assessment']);

// اسم الإجراء والتوكن آخر الجسم، فلا يكتب فوقهما حقل بالاسم نفسه في body (تدقيق الجاهزية، admin-core-1:
// كان فعل المرحلة action يحل محل admin.stage-override فيرد الخادم «إجراء غير معروف»)
export async function L(action, body = {}) {
  const d = await post(API, { ...body, action, token: session.load()?.token }, 'تعذّر الاتصال بالخادم');
  if (!d.success && d.code === 'session') { session.clear(); onExpired(); }
  if (d.success && CHANGES_PENDING.has(action) && typeof window !== 'undefined') window.dispatchEvent(new Event('mi:pending'));
  return d;
}

import { DIM_AR as DIM, DIM_SHORT as DIM_EN, FUNNEL, LEVEL_AR as LVL, PARTICIPANT_STATUS as STATUS, REQ_STATUS as REQ, SUBMISSION_STATUS_ADMIN } from '../../supabase/functions/leaders-api/labels.js';
import { SITES } from '../../supabase/functions/_shared/sites.js';

export { DIM, DIM_EN, FUNNEL, LVL, STATUS, REQ };
export const VIA = { link: 'رابط الجهة', domain: 'نطاق الجهة (موقعها أو بريدها)', admin: 'نقل يدوي', none: 'غير محدد' };
export const SUB_ST = Object.fromEntries(Object.entries({ submitted: 'warn', reviewed: 'ok', returned: '', draft: '' }).map(([k, tone]) => [k, [SUBMISSION_STATUS_ADMIN[k], tone]]));
export const DIMS = Object.keys(DIM);
const LVLS = Object.keys(LVL);

// رمز المسار من الأطر الثلاثة: M1I1L2 = تأسيسي، تأسيسي، متوسط (27 مسارًا)
export function trackOf(levels) {
  const n = DIMS.map((d) => LVLS.indexOf(levels?.[d]) + 1);
  return n.every((x) => x > 0) ? `M${n[0]}I${n[1]}L${n[2]}` : null;
}
export const trackOfPlacements = (pl) => trackOf(Object.fromEntries((pl || []).map((x) => [x.dimension, x.level])));

export const date = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

export const APP_URL = SITES.leaders;
export const inviteUrl = (o, c) => `${APP_URL}/j/${encodeURIComponent(o.invite_code || '')}${c ? `/${encodeURIComponent(c)}` : ''}`;
export const validCampaign = (c) => /^[a-z0-9_-]{1,40}$/.test(c);
export const orgColor = (o) => o?.color || BRAND.gold;
export const domainsOf = (o) => (Array.isArray(o?.domains) ? o.domains : []);

// تصدير CSV بترميز يفتحه Excel بالعربية
export function csvText(head, rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
export const csvBlob = (head, rows) => new Blob([csvText(head, rows)], { type: 'text/csv;charset=utf-8' });
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function filterPeople(list, { q = '', track = '' }) {
  const s = q.trim().toLowerCase();
  return list.filter((p) => (!track || trackOfPlacements(p.placements) === track || p.track === track)
    && (!s || [p.full_name, p.email, p.job_title, p.organization_name, trackOfPlacements(p.placements) || p.track].join(' ').toLowerCase().includes(s)));
}

// ── ما يُقفل أثناء دفعة جارية (D07 وD06): معيار التسكين وإعداداته، وإعداد التقييم الختامي ──
// يقبله الخادم من المدير العام وحده بتعليل مكتوب يُحفظ في السجل (cohort_running). كانت الرسالة تَعِد بالاستثناء
// ولا مكان في اللوحة لكتابة التعليل (التدقيق 2026-11-11، admin-program-2).
export const RUNNING_REASON_MIN = 10;
export const isSuperAdmin = () => { const u = session.load()?.user; return (u?.role_id || u?.role) === 'super_admin'; };
export const placementLockAr = (cohort) => `دفعة «${cohort}» جارية، فمعيار التسكين وإعدادات الحكم بالتغير مقفلة أثناءها: لا يعدّلها إلا المدير العام بتعليل مكتوب يُحفظ في السجل.`;
// send(extra) يرسل الطلب. عند cohort_running يُسأل المدير العام عن التعليل ويُعاد الإرسال به؛ ولغيره تبقى رسالة الخادم.
// الإلغاء يعيد { cancelled: true } فلا يُعرض خطأ.
export async function withRunningReason(send, ask, superAdmin = isSuperAdmin()) {
  const r = await send({});
  if (r.success || r.code !== 'cohort_running' || !superAdmin) return r;
  let short = '';
  for (;;) {
    const reason = await ask(`${r.message}.${short} بصفتك المدير العام اكتب تعليل التعديل (${RUNNING_REASON_MIN} أحرف على الأقل)، ويُحفظ في السجل:`, '', { ok: 'احفظ بالتعليل' });
    if (reason === null) return { success: false, cancelled: true };
    if (reason.trim().length >= RUNNING_REASON_MIN) return send({ reason: reason.trim() });
    short = ' التعليل أقصر من المطلوب.';
  }
}
