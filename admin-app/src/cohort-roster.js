// ════════════════════════════════════════════════════════════════
// تبويب «المتابعة» في ملف الدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 1): نموذج العرض، بلا واجهة ليُختبر وحده
// ════════════════════════════════════════════════════════════════
// صف لكل عضو يقول أين هو ولماذا وعلى من الدور. الصفوف من الخادم (admin.cohort-journey: roster) محسوبة في الحلقة نفسها
// التي تعدّ خريطة الرحلة، فعدد «هنا الآن» في كل مرحلة هو عدد الصفوف المفلترة بها دائمًا. لا حساب للمرحلة ولا للتأخر ولا
// للدور هنا: هذا الملف يعرّف الفلاتر والعروض السريعة والفرز وأعمدة التصدير فوق ما وصل، بأدوات اللوحة القائمة (filters.js وexports.js).
// البحث بالاسم والبريد والجوال بتوحيد search-text.js (عبر applyFilters)، وللإدارة وحدها.
import { TURN_AR, TURNS } from '../../supabase/functions/leaders-api/journey-map.js';
import { PARTICIPANT_STATUS } from '../../supabase/functions/leaders-api/labels.js';
import { daysAr } from '../../supabase/functions/leaders-api/journey.js';
import { IDLE_DAYS } from '../../supabase/functions/leaders-api/cohort-changes.js';

const DAY = 864e5;
export const ROSTER_KEYS = ['q', 'view', 'stage', 'state', 'turn', 'needs', 'group', 'seen', 'sort'];
// الحالة من الخادم (journeyMap): خارج البرنامج، أتم، متأخر (تعريف الخريطة نفسه)، قبل الاعتماد، وإلا على الموعد
export const STATE_AR = Object.freeze({ ontime: 'على الموعد', late: 'متأخر', onboarding: 'لم يكمل التسجيل', finished: 'أتم الرحلة', out: 'خارج البرنامج' });
export { TURN_AR };
// مدة «لم يدخلوا» هي نفسها مدة سطر «توقفوا» في «منذ آخر زيارة» (cohort-changes.js)
export { IDLE_DAYS };

const seenAt = (m) => m.last_active_at || m.last_login_at || null;
const inside = (m) => m.state !== 'out';
// عروض سريعة: ما يسأل عنه المدير عادة، وعدد كل منها ظاهر على رقاقته
export const ROSTER_PRESETS = [
  { key: 'late', label: 'متأخرون', test: (m) => m.state === 'late' },
  { key: 'mine', label: 'ينتظرونني', test: (m) => (m.turns || []).includes('admin') },
  { key: 'idle', label: `لم يدخلوا ${IDLE_DAYS} أيام`, test: (m, now) => inside(m) && m.state !== 'finished' && (!seenAt(m) || now - Date.parse(seenAt(m)) > IDLE_DAYS * DAY) },
  { key: 'missed', label: 'لم يحضروا آخر ورشة', test: (m) => !!m.missed_last },
];

/** مراحل الفلتر بترتيب الخريطة: ما يقف عنده أحد أو يسير فيه (مرحلة أو مسار مستمر). الخدمة مؤشر استخدام لا موضع، والموقوفة بلا أحد */
export const stageOptions = (map) => (map?.stages || []).filter((s) => !s.service && !s.off).map((s) => [s.key, s.title]);

/** أسباب التوقف القائمة في الصفوف، أكثرها أولًا: نص «ما ينقصه» كما في الخريطة */
export function needsOptions(rows) {
  const n = new Map();
  for (const m of rows || []) for (const x of m.stuck || []) if (x.needs) n.set(x.needs, (n.get(x.needs) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')).map(([t, c]) => [t, `${t} (${c})`]);
}

/** حقول شريط الفلترة. المرحلة تطابق مراحله الجارية ومساراته المستمرة معًا، كما تعدّه الخريطة «هنا» */
export function rosterFields(map, rows) {
  const groups = [...new Set((rows || []).map((m) => m.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const turns = TURNS.filter((t) => (rows || []).some((m) => (m.turns || []).includes(t)));
  return [
    { key: 'stage', label: 'المراحل', get: (m) => [...(m.stage_keys || []), ...(m.track_keys || [])], options: stageOptions(map) },
    { key: 'state', label: 'الحالات', get: (m) => m.state, options: Object.entries(STATE_AR) },
    { key: 'turn', label: 'الدور', aria: 'على من الدور', all: 'الدور على أي أحد', get: (m) => m.turns || [], options: (turns.length ? turns : TURNS).map((t) => [t, TURN_AR[t]]) },
    { key: 'needs', label: 'سبب التوقف', all: 'أي سبب توقف', get: (m) => (m.stuck || []).map((x) => x.needs).filter(Boolean), options: needsOptions(rows) },
    ...(groups.length ? [{ key: 'group', label: 'المجموعات', get: (m) => m.group || 'none', options: [...groups.map((g) => [g, g]), ['none', 'بلا مجموعة']] }] : []),
    { key: 'seen', label: 'آخر نشاط', all: 'أي آخر نشاط', type: 'period', get: seenAt },
  ];
}

/** ما يُبحث فيه: الاسم والبريد والجوال والمسمى والجهة والمجموعة. الجوال يُطابق أيضًا بأي صيغة عبر phone */
export const rosterText = (m) => [m.name, m.email, m.phone, m.job_title, m.organization_name, m.group].filter(Boolean).join(' ');
export const rosterSpec = (map, rows) => ({ fields: rosterFields(map, rows), presets: ROSTER_PRESETS, text: rosterText, phone: (m) => m.phone });

// ── النصوص المعروضة ──
export const stayAr = (m) => (m.days == null ? '' : m.days === 0 ? 'اليوم' : daysAr(m.days));
export const attendanceAr = (m) => (!m.attendance ? '' : m.attendance.total ? `حضر ${m.attendance.count} من ${m.attendance.total}` : 'لا جلسات بعد');
export const consultAr = (m) => (!m.consult ? '' : `استفاد ${m.consult.used} من ${m.consult.max}`);
/** المرحلة كما تُعرض في الصف: مرحلته (أو مرحلتاه معًا)، ولمن لا مرحلة له حالته */
export const stageAr = (m) => m.stage || (m.state === 'out' ? PARTICIPANT_STATUS[m.status] || STATE_AR.out : m.state === 'finished' ? STATE_AR.finished : '');
/** الدور بكلمته، وسببه إن عُرف («عليك: تسليم ينتظر المراجعة») */
export const turnAr = (x) => (!x?.turn ? '' : x.why ? `${TURN_AR[x.turn]}: ${x.why}` : TURN_AR[x.turn]);

// ── الترتيب ──
/** الترتيب الأول: بترتيب مراحل الخريطة، والمتأخر ثم الأطول مكوثًا أولًا داخل المرحلة، ثم من أتم، ثم من خرج */
export function rosterOrder(map, rows) {
  const keys = (map?.stages || []).map((s) => s.key);
  const at = (m) => (m.state === 'out' ? keys.length + 2 : m.state === 'finished' ? keys.length + 1 : Math.max(0, keys.indexOf((m.stage_keys || [])[0])));
  return [...(rows || [])].sort((a, b) => at(a) - at(b) || Number(b.late) - Number(a.late) || (b.days || 0) - (a.days || 0) || String(a.name).localeCompare(String(b.name), 'ar'));
}
/** أعمدة الفرز (sortRows): الأرقام أرقامًا، والمرحلة بترتيبها في الرحلة لا بحروفها */
export function rosterSorts(map) {
  const keys = (map?.stages || []).map((s) => s.key);
  return {
    name: (m) => m.name,
    stage: (m) => (m.state === 'out' ? null : m.state === 'finished' ? keys.length : keys.indexOf((m.stage_keys || [])[0])),
    days: (m) => m.days,
    turn: (m) => (m.turn && inside(m) && m.state !== 'finished' ? TURNS.indexOf(m.turn) : null),
    progress: (m) => m.progress,
    attendance: (m) => (m.attendance?.total ? m.attendance.count / m.attendance.total : null),
    seen: seenAt,
  };
}
// الفرز من قائمة (للجوال حيث لا رؤوس أعمدة)
export const ROSTER_SORTS = [
  ['', 'ترتيب الرحلة'], ['name', 'الاسم'], ['-days', 'الأطول مكوثًا'], ['-progress', 'الأكثر تقدمًا'], ['progress', 'الأقل تقدمًا'], ['seen', 'الأقدم نشاطًا'], ['-seen', 'الأحدث نشاطًا'],
];

// ── التصدير: تعريف واحد للأعمدة، والزر الموحد يسأل ماذا يُصدَّر ──
/** @param {{ date: (d: any) => string }} fmt */
export function rosterExportCols({ date }) {
  return [
    { key: 'name', label: 'الاسم', width: 26, get: (m) => m.name }, { key: 'email', label: 'البريد', width: 30, get: (m) => m.email },
    { key: 'phone', label: 'الجوال', width: 16, get: (m) => m.phone }, { key: 'title', label: 'المسمى', width: 22, get: (m) => m.job_title },
    { key: 'org', label: 'الجهة', width: 24, get: (m) => m.organization_name }, { key: 'group', label: 'المجموعة', width: 18, get: (m) => m.group },
    { key: 'status', label: 'حالة الحساب', width: 18, get: (m) => PARTICIPANT_STATUS[m.status] || m.status },
    { key: 'stage', label: 'المرحلة الحالية', width: 28, get: stageAr }, { key: 'tracks', label: 'المسار المستمر', width: 22, get: (m) => m.tracks || [] },
    { key: 'state', label: 'الحالة', width: 16, get: (m) => STATE_AR[m.state] || '' },
    { key: 'days', label: 'أيام في المرحلة', width: 14, get: (m) => m.days }, { key: 'late', label: 'متأخر', width: 10, get: (m) => !!m.late },
    { key: 'needs', label: 'سبب التوقف', width: 40, get: (m) => (m.stuck || []).map((x) => x.needs).filter(Boolean) },
    { key: 'turn', label: 'على من الدور', width: 30, get: (m) => (inside(m) && m.state !== 'finished' ? [...new Set((m.stuck || []).map(turnAr))] : []) },
    { key: 'where', label: 'أين توقف قبل الاعتماد', width: 30, get: (m) => (m.onboarding ? `${m.onboarding.label}: ${m.onboarding.remaining}` : '') },
    { key: 'progress', label: 'التقدم %', width: 10, get: (m) => m.progress },
    { key: 'attendance', label: 'الحضور', width: 16, get: attendanceAr }, { key: 'consult', label: 'الاستشارة', width: 16, get: consultAr },
    { key: 'seen', label: 'آخر نشاط', width: 16, get: (m) => date(seenAt(m)) },
  ];
}

// «سجّل حضورهم في جلسة» (تصور تشغيل الدفعة 2026-11-19، 4.2، المرحلة 2): جلسات هذه الدفعة المنعقدة، أي المؤرخة القائمة التي بدأت،
// من قراءة «الحضور والجلسات» نفسها (admin.activities): جلسات الدفعة، والعامة من متطلبات برنامجها. الأحدث أولًا، بحد 30.
// لا قائمة جلسات ثانية في التبويب: هذه خانة اختيار تفتح ورقة الحضور القائمة
export const HELD_MAX = 30;
export function heldSessions(activities, cohort, now = Date.now()) {
  const own = new Set((activities?.requirements || []).filter((r) => r.kind === 'workshop' && r.program_id === cohort?.program_id).map((r) => r.id));
  return (activities?.workshops || [])
    .filter((s) => s.active !== false && s.starts_at && Date.parse(s.starts_at) <= now && (s.cohort_id ? s.cohort_id === cohort?.id : own.has(s.requirement_id)))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)).slice(0, HELD_MAX)
    .map((s) => ({ id: s.id, title: s.title_ar, starts_at: s.starts_at, general: !s.cohort_id, attended: Number(s.attended) || 0 }));
}
