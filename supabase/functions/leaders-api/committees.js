// ════════════════════════════════════════════════════════════════
// لجنتا المحتوى والقياس: العضوية من سجل الخبير، والتغطية مشتقة منه (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// لا قائمة أسماء ثانية: experts.committees يحمل العضوية، وexperts.dimensions يحمل الأطر، ومنهما تُقرأ المقاعد.
// قواعد التشكيل من docs/content/لجنة-المحتوى-والقياس-التشكيل-v2.md: لجنة المحتوى بعضو لكل إطار، ولجنة القياس بثلاثة.
import { DIMENSIONS } from './logic.js';
import { DIM_AR } from './labels.js';

export const COMMITTEES = ['content', 'measurement'];
export const COMMITTEE_AR = { content: 'لجنة المحتوى', measurement: 'لجنة القياس' };
export const MEASUREMENT_SEATS = 3;
export const cleanCommittees = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => COMMITTEES.includes(x)))];

// ── خدمتا الخبير من سجله الواحد (تصور فصل خدمة الرحلة عن لجان الكتاب، المرحلة 1، اعتمده المالك 2026-11-15) ──
// لا حقل نوع مخزَّن: الأدوار (roles) للرحلة، والعضوية (committees) للكتاب، والاثنان معًا ممكن. للعرض والتفريع وحدهما
export const hasCommittee = (e) => cleanCommittees(e?.committees).length > 0;
export const hasJourneyRole = (e) => (e?.roles || []).length > 0;
/** عضو لجنة بلا دور في الرحلة: يُعتمد ويقرأ الكتاب، ولا يظهر في الرحلة ولا يُطلب منه ما يخصها */
export const contentOnly = (e) => hasCommittee(e) && !hasJourneyRole(e);
export const expertService = (e) => ({ journey: hasJourneyRole(e), content: hasCommittee(e) });
// شرط الاعتماد: دور في الرحلة أو عضوية في لجنة. وعضو لجنة المحتوى يحتاج إطارًا لأن مقعده يُشتق من dimensions،
// ولجنة القياس لا تشترط شيئًا. الحالتان suspended وrejected تغلقان الخدمتين معًا كما هما (MOVES في experts.ts)
export const APPROVAL_NEEDS_AR = 'حدّد دورًا في الرحلة أو عضوية في لجنة قبل الاعتماد';
export const CONTENT_NEEDS_DIM_AR = 'عضو لجنة المحتوى يحتاج إطارًا واحدًا على الأقل من «الأبعاد» قبل الاعتماد';
/** @returns {string | null} سبب منع الاعتماد، أو null */
export function approvalBlock(e) {
  if (!hasJourneyRole(e) && !hasCommittee(e)) return APPROVAL_NEEDS_AR;
  if (cleanCommittees(e?.committees).includes('content') && !(e?.dimensions || []).length) return CONTENT_NEEDS_DIM_AR;
  return null;
}

/** تغطية اللجنتين من قائمة الخبراء: الأعضاء الفاعلون، وما ينقص كل لجنة بجملة تُقرأ */
export function committeeCoverage(experts) {
  const active = (experts || []).filter((e) => e.status === 'active');
  const of = (k) => active.filter((e) => (e.committees || []).includes(k));
  const content = of('content'), measurement = of('measurement');
  const uncovered = DIMENSIONS.filter((d) => !content.some((e) => (e.dimensions || []).includes(d)));
  const gaps = { content: [], measurement: [] };
  if (!content.length) gaps.content.push('لا أعضاء بعد');
  else if (uncovered.length) gaps.content.push(`لا عضو لإطار ${uncovered.map((d) => DIM_AR[d]).join(' ولا ')}`);
  if (measurement.length < MEASUREMENT_SEATS) gaps.measurement.push(measurement.length ? `${measurement.length} من ${MEASUREMENT_SEATS} مقاعد` : 'لا أعضاء بعد');
  const row = (k, list) => ({ key: k, title: COMMITTEE_AR[k], members: list.map((e) => ({ id: e.id, name: e.full_name, dimensions: e.dimensions || [] })), gaps: gaps[k], ready: gaps[k].length === 0 });
  return [row('content', content), row('measurement', measurement)];
}

// ── «انضم كخبير محتوى» (تصور أجزاء الكتاب وخبير المحتوى، المرحلة 3، اعتمده المالك 2026-11-16) ──
// مسار مستقل عن خبير الرحلة في الطلب العام نفسه (experts.apply بـ track: 'content'): الاسم والبريد والمسمى، واللجنة، والإطار،
// ونبذة عن الخبرة في المحتوى، ورابط اختياري. لا أدوار ولا مستويات ولا ساعات ولا قطاعات. اللجان تُحفظ في committees نفسه
// والطلب «بانتظار المراجعة»، فلا يفتح شيئًا قبل الاعتماد (bookAccess يشترط الفاعل)، ويطبق approvalBlock عند الاعتماد كما هو
export const APPLY_TRACKS = ['journey', 'content'];
export const CONTENT_TRACK_AR = 'طلب عضوية لجنة';
export const JOURNEY_FIELDS_AR = 'طلب عضوية اللجنة لا يسأل عن الأدوار ولا المستويات ولا الساعات ولا القطاعات';
export const COMMITTEE_NEEDED_AR = 'اختر اللجنة التي تطلب عضويتها';
export const CONTENT_DIM_AR = 'اختر الإطار الذي تراجعه في لجنة المحتوى';
export const WORK_URL_AR = 'رابط أعمالك أو سيرتك غير صحيح، انسخه كاملًا مثل https://…';
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');
/** @returns {'journey' | 'content' | null} المسار، والغائب مسار الرحلة كما كان الطلب قبل المرحلة 3، وnull لقيمة غير معروفة */
export const applyTrack = (b) => (b?.track == null || b.track === '' ? 'journey' : APPLY_TRACKS.includes(b.track) ? b.track : null);
/** رابط الأعمال أو السيرة: https وحده (http يُرفع إليه)، 300 حرف على الأكثر، أو null */
export function workUrl(v) {
  const s = String(v ?? '').trim().replace(/^http:\/\//i, 'https://');
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  try { const u = new URL(/^https:\/\//i.test(s) ? s : `https://${s}`); return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : null; } catch { return null; }
}
/** سبب رفض طلب خبير المحتوى قبل أي أثر، أو null. b كما وصل من الصفحة */
export function contentApplyError(b) {
  if (['roles', 'levels', 'sectors', 'weekly_hours'].some((k) => filled(b?.[k]))) return JOURNEY_FIELDS_AR;
  const cs = cleanCommittees(b?.committees);
  if (!cs.length) return COMMITTEE_NEEDED_AR;
  const dims = (Array.isArray(b?.dimensions) ? b.dimensions : []).filter((d) => DIMENSIONS.includes(d));
  if (cs.includes('content') && !dims.length) return CONTENT_DIM_AR;
  if (filled(b?.work_url) && !workUrl(b.work_url)) return WORK_URL_AR;
  return null;
}
/** طلب عضوية لجنة: جاء من الصفحة العامة، بلا دور في الرحلة، وفيه لجنة. للوسم في اللوحة وحده */
export const committeeApplication = (e) => e?.source === 'application' && contentOnly(e);
/** وصف الطلب في سطر: «لجنة المحتوى · إطار تمكين القائد» */
export function committeeApplicationAr(e) {
  const cs = cleanCommittees(e?.committees).map((k) => COMMITTEE_AR[k]);
  const dims = (e?.dimensions || []).map((d) => DIM_AR[d]).filter(Boolean);
  return [cs.join(' و'), dims.length ? `${['إطار', 'إطارا', 'الأطر'][dims.length - 1] || 'الأطر'} ${dims.join(' و')}` : null].filter(Boolean).join(' · ');
}
