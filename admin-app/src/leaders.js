// ════════════════════════════════════════════════════════════════
// تطبيق القادة: الاتصال بـ leaders-api والمسميات والحسابات المشتركة
// ════════════════════════════════════════════════════════════════
// توكن جلسة الإدارة نفسه يُرسل إلى leaders-api، فتتحقق منه في api_sessions.
import { SUPABASE_URL } from '../../src/lib/api.js';
import { post, session } from './api.js';

const API = `${SUPABASE_URL}/functions/v1/leaders-api`;

let onExpired = () => {};
export const setLeadersExpired = (fn) => { onExpired = fn; };

export async function L(action, body = {}) {
  const d = await post(API, { action, token: session.load()?.token, ...body }, 'تعذّر الاتصال بالخادم');
  if (!d.success && d.code === 'session') { session.clear(); onExpired(); }
  return d;
}

export const DIM = { milestone: 'إدارة المشروعات', impact: 'تحويل المشروع إلى أثر', leadership: 'تمكين القائد' };
export const DIM_EN = { milestone: 'Milestone', impact: 'Impact', leadership: 'Leadership' };
export const LVL = { beginner: 'تأسيسي', intermediate: 'متوسط', advanced: 'احترافي' };
export const STATUS = {
  registered: 'مسجّل', profiled: 'أكمل الملف', assessing: 'يجيب على القياس', pending_approval: 'بانتظار الاعتماد',
  placed: 'معتمد المستوى', enrolled: 'في البرنامج', completed: 'أنهى البرنامج', withdrawn: 'منسحب', suspended: 'موقوف',
};
export const REQ = { pending: 'لم يُنجز', submitted: 'بانتظار المراجعة', done: 'منجز', returned: 'أُعيد' };
export const VIA = { link: 'رابط الجهة', domain: 'موقع الجهة', admin: 'نقل يدوي', none: 'غير محدد' };
export const SUB_ST = { submitted: ['بانتظار تقييمك', 'warn'], reviewed: ['قُيّم', 'ok'], returned: ['أُعيد للتطوير', ''], draft: ['مسودة', ''] };
export const FUNNEL = [['registered', 'سجّل'], ['profiled', 'أكمل الملف'], ['assessed', 'أنهى القياس'], ['approved', 'اعتُمد مساره'], ['completed', 'أنهى البرنامج']];
export const DIMS = Object.keys(DIM);
const LVLS = Object.keys(LVL);

// رمز المسار من الأطر الثلاثة: M1I1L2 = تأسيسي، تأسيسي، متوسط (27 مسارًا)
export function trackOf(levels) {
  const n = DIMS.map((d) => LVLS.indexOf(levels?.[d]) + 1);
  return n.every((x) => x > 0) ? `M${n[0]}I${n[1]}L${n[2]}` : null;
}
export const trackOfPlacements = (pl) => trackOf(Object.fromEntries((pl || []).map((x) => [x.dimension, x.level])));

export const date = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

export const APP_URL = 'https://leaders.sunkvalue.com';
export const inviteUrl = (o, c) => `${APP_URL}/j/${encodeURIComponent(o.invite_code || '')}${c ? `/${encodeURIComponent(c)}` : ''}`;
export const validCampaign = (c) => /^[a-z0-9_-]{1,40}$/.test(c);
export const orgColor = (o) => o?.color || '#A97A2E';
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
