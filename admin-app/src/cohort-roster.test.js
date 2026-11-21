// تبويب «المتابعة» في ملف الدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 1): استنتاج «على من الدور» لكل نوع نشاط،
// والفلاتر والعروض السريعة والبحث بالاسم والبريد والجوال، والفرز والتصدير، ورابط التبويب، وخصوصية نص البحث الرقمي.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TURN_AR, TURNS, turnOf } from '../../supabase/functions/leaders-api/journey-map.js';
import { applyFilters, encodeState, presetCounts, shareable, sortRows } from './filters.js';
import { tableOf } from './exports.js';
import { COHORT_TABS, cohortTab, followShow, followStage, tabQuery } from './cohort-journey.js';
import {
  attendanceAr, consultAr, HELD_MAX, heldSessions, needsOptions, ROSTER_KEYS, ROSTER_PRESETS, rosterExportCols, rosterFields, rosterOrder, rosterSorts, rosterSpec, stageAr, stageOptions, stayAr, turnAr,
} from './cohort-roster.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const NOW = new Date('2026-11-20T10:00:00Z');
const active = (item, more = {}) => ({ status: 'active', items: [{ title_ar: 'بند', required: true, status: 'pending', ...item }], ...more });
const T = (item, more) => turnOf(active(item, more), NOW);

describe('على من الدور: يُستنتج من حالة البند نفسها، وما لا يُستنتج «غير محدد»', () => {
  it('البنود الآلية برمزها: الملف والقياس والمبادرة عليه، واعتماد المسار عليك', () => {
    for (const code of ['P-INFO', 'P-CV', 'A-DONE', 'E-POST', 'P-PROJECT']) expect(T({ kind: 'auto', code }).turn, code).toBe('participant');
    expect(T({ kind: 'auto', code: 'AP-OK' })).toEqual({ turn: 'admin', why: 'اعتماد المسار' });
  });
  it('تقدير المدير والزملاء والتقرير النهائي وأي رمز آلي آخر: غير محدد، لا تخمين', () => {
    for (const code of ['T-360', 'E-360', 'R-ISSUE', 'X-NEW']) expect(T({ kind: 'auto', code }), code).toEqual({ turn: 'none', why: null });
  });
  it('ما يكمله المشارك بنفسه عليه، وما سلّمه وينتظر المراجعة عليك', () => {
    for (const kind of ['reading', 'video', 'curriculum', 'lab', 'survey', 'upload', 'form', 'check']) expect(T({ kind, activity: ['reading', 'video', 'curriculum', 'lab'].includes(kind) ? { done: false } : undefined }).turn, kind).toBe('participant');
    expect(T({ kind: 'upload', status: 'submitted' })).toEqual({ turn: 'admin', why: 'تسليم ينتظر المراجعة' });
    expect(T({ kind: 'form', status: 'submitted' }).turn).toBe('admin');
  });
  it('محتوى مقفل قبل اعتماد المسار (منهج، نموذج، فصول الوثيقة): غير محدد', () => {
    expect(T({ kind: 'curriculum', activity: { locked: true } }).turn).toBe('none');
    expect(T({ kind: 'model', activity: { locked: true } }).turn).toBe('none');
    expect(T({ kind: 'capstone', activity: { locked: true, sections: [] } }).turn).toBe('none');
  });
  it('الحضور: جلسة قادمة على موعد، وبلا جلسة قادمة عليك (تؤرَّخ أو تُضاف)', () => {
    const s = (o) => ({ id: 'x', starts_at: '2026-11-25T06:00:00Z', ends_at: '2026-11-25T10:00:00Z', attended: false, undated: false, ...o });
    expect(T({ kind: 'workshop', activity: { sessions: [s({})] } })).toEqual({ turn: 'schedule', why: 'جلسة قادمة' });
    // جلسة تُعقد الآن ولم يُسجَّل حضوره بعد: ما زالت موعدًا قائمًا
    expect(T({ kind: 'workshop', activity: { sessions: [s({ starts_at: '2026-11-20T08:00:00Z', ends_at: '2026-11-20T12:00:00Z' })] } }).turn).toBe('schedule');
    expect(T({ kind: 'workshop', activity: { sessions: [s({ starts_at: '2026-11-10T06:00:00Z', ends_at: '2026-11-10T10:00:00Z' })] } })).toEqual({ turn: 'admin', why: 'لا جلسة قادمة له' });
    expect(T({ kind: 'workshop', activity: { sessions: [s({ starts_at: null, ends_at: null, undated: true })] } }).turn).toBe('admin');
    expect(T({ kind: 'workshop', activity: { sessions: [] } }).turn).toBe('admin');
    // بلا دليل مقروء لا يُحكم
    expect(T({ kind: 'workshop' }).turn).toBe('none');
  });
  it('استبانة تنتظر أول حضور: دورها دور بند الحضور في مرحلتها', () => {
    // بند الحضور إلزامي: الاختياري لا يحبس الاستبانة أصلًا (قاعدة «الاختياري لا يُحسب» 2026-11-21)، فلا يُنسب إليه دورها
    const attend = { title_ar: 'الحضور', kind: 'workshop', required: true, status: 'pending', activity: { sessions: [{ id: 'x', starts_at: '2026-11-25T06:00:00Z', ends_at: '2026-11-25T10:00:00Z', attended: false }] } };
    const stage = { status: 'active', items: [{ title_ar: 'رأيك', kind: 'survey', required: true, status: 'pending', waits: 'تُفتح بعد حضورك' }, attend] };
    expect(turnOf(stage, NOW).turn).toBe('schedule');
    expect(turnOf({ status: 'active', items: [stage.items[0]] }, NOW).turn).toBe('none');
    expect(turnOf({ status: 'active', items: [stage.items[0], { ...attend, required: false }] }, NOW).turn).toBe('none');
  });
  it('التوجيه: جلسة انتهت بلا تأكيد عليك، ومحجوزة قادمة على موعد، ولم يحجز عليه، وبلغ الحد غير محدد', () => {
    const c = (sessions, can_book = true) => T({ kind: 'coaching', activity: { sessions, can_book } });
    expect(c([{ status: 'booked', awaiting: true }])).toEqual({ turn: 'admin', why: 'جلسة تنتظر تأكيد الحضور' });
    expect(c([{ status: 'booked', awaiting: false }])).toEqual({ turn: 'schedule', why: 'جلسة محجوزة' });
    expect(c([])).toEqual({ turn: 'participant', why: 'لم يحجز جلسته' });
    expect(c([{ status: 'no_show', awaiting: false }]).turn).toBe('participant');
    expect(c([{ status: 'attended' }], false).turn).toBe('none');
  });
  it('اللقاء يسجله المستشار: على الخبير. والنموذج والوثيقة: عليه حتى يسلّم، ثم عليك', () => {
    expect(T({ kind: 'meeting' })).toEqual({ turn: 'expert', why: 'لقاء يسجله المستشار' });
    expect(T({ kind: 'model', activity: { status: null } }).turn).toBe('participant');
    expect(T({ kind: 'model', activity: { status: 'submitted' } }).turn).toBe('admin');
    expect(T({ kind: 'capstone', activity: { status: 'draft' } }).turn).toBe('participant');
    expect(T({ kind: 'capstone', activity: { status: 'returned' } }).turn).toBe('participant');
    expect(T({ kind: 'capstone', activity: { status: 'submitted' } }).turn).toBe('admin');
    expect(T({ kind: 'capstone', activity: { sections: [{ key: 'a', saved: false }] } }).turn).toBe('participant');
    // حالة لا نعرفها لا تُفسَّر
    expect(T({ kind: 'capstone', activity: { status: 'in_committee' } }).turn).toBe('none');
  });
  it('المرحلة المقفلة: يفتحها الفريق عليك، وبتاريخ على موعد، وبانتظار غيرها غير محدد. والتي تكتمل بالاعتماد عليك حين تكتمل بنودها', () => {
    expect(turnOf({ status: 'locked', rules: { unlock: 'approval' }, items: [] })).toEqual({ turn: 'admin', why: 'مرحلة يفتحها الفريق' });
    expect(turnOf({ status: 'locked', rules: { unlock: 'day', day: 10 }, items: [] }).turn).toBe('schedule');
    expect(turnOf({ status: 'locked', rules: { unlock: 'with', with: 'x' }, items: [] }).turn).toBe('none');
    expect(turnOf({ status: 'locked', items: [] }).turn).toBe('none');
    const done = { title_ar: 'بند', required: true, status: 'done', kind: 'upload' };
    expect(turnOf({ status: 'active', rules: { complete: 'approval' }, items: [done, { title_ar: 'اختياري', required: false, status: 'pending', kind: 'upload' }] })).toEqual({ turn: 'admin', why: 'اعتماد اكتمال المرحلة' });
    expect(turnOf({ status: 'active', rules: { complete: 'approval' }, items: [{ ...done, status: 'pending' }] }).turn).toBe('participant');
    expect(turnOf({ status: 'active', items: [done] }).turn).toBe('none');
  });
  it('القيم مسماة كلها، ولا قيمة للجهة ما دامت الرحلة لا تدل عليها', () => {
    expect(TURNS).toEqual(['participant', 'admin', 'expert', 'schedule', 'none']);
    expect(TURNS.every((t) => TURN_AR[t])).toBe(true);
    expect(TURN_AR.none).toBe('غير محدد');
  });
});

// ── صفوف كما تصل من الخادم ──
const MAP = { stages: [
  { key: 'profile', title: 'الملف الشخصي', here: 1 }, { key: 'training', title: 'التدريب', here: 2 }, { key: 'apply', title: 'التطبيق', here: 1 },
  { key: 'habit', title: 'العادة اليومية', here: 1 }, { key: 'advice', title: 'الاستشارة', service: true }, { key: 'visit', title: 'الزيارة', off: true }, { key: 'report', title: 'التقرير', here: 0 },
] };
const row = (id, name, o = {}) => ({ id, name, status: 'enrolled', state: 'ontime', stage_keys: [], track_keys: [], late_keys: [], tracks: [], stage: null, days: 0, late: false, turn: 'none', turns: [], stuck: [],
  progress: 0, attendance: null, consult: null, missed_last: false, email: `${id}@example.sa`, phone: null, last_active_at: '2026-11-19T08:00:00Z', ...o });
const ROWS = [
  row('sara', 'سارة العتيبي', { state: 'late', late: true, late_keys: ['training'], stage_keys: ['training', 'apply'], track_keys: ['habit'], tracks: ['العادة اليومية'], stage: 'التدريب والتطبيق معًا', days: 12,
    turn: 'admin', why: 'تسليم ينتظر المراجعة', turns: ['admin', 'participant'], phone: '+966551112233', group: 'أ', progress: 55, attendance: { count: 1, total: 2 }, consult: { used: 1, max: 2 }, missed_last: true,
    stuck: [{ key: 'training', title: 'التدريب', needs: 'ارفع واجب التدريب', turn: 'admin', why: 'تسليم ينتظر المراجعة' }, { key: 'apply', title: 'التطبيق', needs: 'نموذج التطبيق', turn: 'participant', why: null }] }),
  row('osama', 'أسامة الحربي', { stage_keys: ['training'], stage: 'التدريب', days: 3, turn: 'participant', turns: ['participant'], phone: '+966559998877', progress: 30, attendance: { count: 2, total: 2 },
    last_active_at: '2026-11-01T08:00:00Z', stuck: [{ key: 'training', title: 'التدريب', needs: 'ارفع واجب التدريب', turn: 'participant', why: null }] }),
  row('noura', 'نورة', { state: 'onboarding', stage_keys: ['profile'], stage: 'الملف الشخصي', days: 1, turn: 'participant', turns: ['participant'], last_active_at: null, last_login_at: null,
    stuck: [{ key: 'profile', title: 'الملف الشخصي', needs: 'أكمل ملفك', turn: 'participant', why: null }], onboarding: { step: 'profile', label: 'لم يكمل الملف', remaining: 'ينقص الملف: الجوال' } }),
  row('fahd', 'فهد', { state: 'finished', days: null, progress: 100 }),
  row('majed', 'ماجد', { state: 'out', status: 'withdrawn', days: null, progress: 20 }),
];
const SPEC = rosterSpec(MAP, ROWS);
const ids = (state) => applyFilters(ROWS, SPEC, { ...Object.fromEntries(ROSTER_KEYS.map((k) => [k, ''])), ...state }, NOW.getTime()).map((m) => m.id);

describe('البحث: بالاسم والبريد والجوال بتوحيد search-text.js', () => {
  it('الاسم بتوحيد الحروف العربية، والبريد، والمجموعة', () => {
    expect(ids({ q: 'اسامه' })).toEqual(['osama']);
    expect(ids({ q: 'sara@example' })).toEqual(['sara']);
    expect(ids({ q: 'العتيبي' })).toEqual(['sara']);
  });
  it('الجوال بأي صيغة يُكتب بها: 05 و5 و966 و+966 والأرقام العربية والمسافات', () => {
    for (const q of ['0551112233', '551112233', '966551112233', '+966 55 111 2233', '٠٥٥١١١٢٢٣٣', '055-111-2233']) expect(ids({ q }), q).toEqual(['sara']);
    expect(ids({ q: '0559998877' })).toEqual(['osama']);
    expect(ids({ q: '0500000000' })).toEqual([]);
  });
  it('الخصوصية: نص يشبه رقمًا لا يُكتب في العنوان ولا يُحفظ، والتبويب نفسه لا يكتب فلاتره في العنوان أصلًا', () => {
    expect(encodeState({ q: '0551112233', stage: 'training' })).toBe('stage=training');
    expect(shareable({ q: '٠٥٥١١١٢٢٣٣', view: 'late' })).toEqual({ q: '', view: 'late' });
    expect(shareable({ q: 'سارة', view: '' }).q).toBe('سارة');
    const src = read('admin-app/src/screens/CohortRoster.jsx');
    expect(src).toMatch(/useFilters\(ROSTER_KEYS, [^\n]*url: false \}\)/);
    // ما يُكتب في العنوان من ملف الدفعة: التبويب ومرحلة الخريطة وحدهما، ولا نص بحث
    expect(tabQuery('follow', 'training')).toBe('view=follow&stage=training');
    expect(read('admin-app/src/screens/Programs.jsx')).toContain('writeQuery(tabQuery(k, st));');
  });
});

describe('الفلاتر والعروض السريعة', () => {
  it('المرحلة تطابق مراحله الجارية ومساره المستمر، فعدد الصفوف هو «هنا الآن» في الخريطة', () => {
    for (const s of MAP.stages.filter((x) => x.here != null)) expect(ids({ stage: s.key }).length, s.key).toBe(s.here);
    expect(ids({ stage: 'apply' })).toEqual(['sara']);
    // الخدمة والموقوفة ليستا موضعًا، فلا خيار لهما
    expect(stageOptions(MAP).map(([k]) => k)).toEqual(['profile', 'training', 'apply', 'habit', 'report']);
  });
  it('الحالة والدور وسبب التوقف والمجموعة وآخر نشاط', () => {
    expect(ids({ state: 'late' })).toEqual(['sara']);
    expect(ids({ state: 'out' })).toEqual(['majed']);
    expect(ids({ state: 'finished' })).toEqual(['fahd']);
    expect(ids({ state: 'onboarding' })).toEqual(['noura']);
    expect(ids({ turn: 'admin' })).toEqual(['sara']);
    // من يسير في مرحلتين يطابق دور كل منهما
    expect(ids({ turn: 'participant' })).toEqual(['sara', 'osama', 'noura']);
    expect(ids({ needs: 'ارفع واجب التدريب' })).toEqual(['sara', 'osama']);
    expect(ids({ needs: 'نموذج التطبيق' })).toEqual(['sara']);
    expect(ids({ group: 'أ' })).toEqual(['sara']);
    expect(ids({ group: 'none' }).includes('sara')).toBe(false);
    expect(ids({ seen: 'never' })).toEqual(['noura']);
    expect(ids({ stage: 'training', turn: 'participant', q: 'اسامه' })).toEqual(['osama']);
  });
  it('خيارات الفلاتر من الصفوف نفسها: الأسباب بأعدادها، والأدوار القائمة وحدها، والمجموعة إن وُجدت', () => {
    expect(needsOptions(ROWS)[0]).toEqual(['ارفع واجب التدريب', 'ارفع واجب التدريب (2)']);
    const f = Object.fromEntries(rosterFields(MAP, ROWS).map((x) => [x.key, x]));
    expect(f.turn.options).toEqual([['participant', 'عليه'], ['admin', 'عليك']]);
    expect(f.group.options).toEqual([['أ', 'أ'], ['none', 'بلا مجموعة']]);
    expect(rosterFields(MAP, ROWS.map((m) => ({ ...m, group: null }))).some((x) => x.key === 'group')).toBe(false);
  });
  it('العروض السريعة بأعدادها: متأخرون، ينتظرونني، لم يدخلوا 7 أيام، لم يحضروا آخر ورشة', () => {
    expect(presetCounts(ROWS, ROSTER_PRESETS, NOW.getTime())).toEqual({ late: 1, mine: 1, idle: 2, missed: 1 });
    expect(ids({ view: 'idle' })).toEqual(['osama', 'noura']);
    expect(ids({ view: 'mine' })).toEqual(['sara']);
  });
});

describe('الترتيب والنصوص والتصدير', () => {
  it('الترتيب الأول بمراحل الرحلة: المتأخر والأطول مكوثًا أولًا، ثم من أتم، ثم من خرج', () => {
    expect(rosterOrder(MAP, [...ROWS].reverse()).map((m) => m.id)).toEqual(['noura', 'sara', 'osama', 'fahd', 'majed']);
  });
  it('الفرز بالأعمدة: المرحلة بترتيبها، والأرقام أرقامًا، والفارغ آخرًا', () => {
    const s = rosterSorts(MAP);
    expect(sortRows(ROWS, s, '-days').map((m) => m.id).slice(0, 3)).toEqual(['sara', 'osama', 'noura']);
    expect(sortRows(ROWS, s, 'progress').map((m) => m.id)).toEqual(['noura', 'majed', 'osama', 'sara', 'fahd']);
    expect(sortRows(ROWS, s, 'stage').map((m) => m.id)).toEqual(['noura', 'sara', 'osama', 'fahd', 'majed']);
    expect(sortRows(ROWS, s, 'name')[0].id).toBe('osama');
  });
  it('نصوص الصف: المكوث والحضور والاستشارة والمرحلة والدور', () => {
    const [sara, , , fahd, majed] = ROWS;
    expect([stayAr(sara), stayAr({ days: 0 }), stayAr(fahd)]).toEqual(['12 يومًا', 'اليوم', '']);
    expect([attendanceAr(sara), attendanceAr({ attendance: { count: 0, total: 0 } }), attendanceAr(fahd)]).toEqual(['حضر 1 من 2', 'لا جلسات بعد', '']);
    expect([consultAr(sara), consultAr(fahd)]).toEqual(['استفاد 1 من 2', '']);
    expect([stageAr(sara), stageAr(fahd), stageAr(majed)]).toEqual(['التدريب والتطبيق معًا', 'أتم الرحلة', 'منسحب']);
    expect([turnAr(sara.stuck[0]), turnAr(sara.stuck[1]), turnAr({ turn: 'none' })]).toEqual(['عليك: تسليم ينتظر المراجعة', 'عليه', 'غير محدد']);
  });
  it('التصدير بالأداة القائمة: الأعمدة معرّفة مرة، والمرحلتان والدوران في خانتيهما', () => {
    const cols = rosterExportCols({ date: (d) => (d ? String(d).slice(0, 10) : '') });
    const { head, body } = tableOf(ROWS, cols);
    const at = (label) => head.findIndex((h) => h.label === label);
    expect(body[0][at('الاسم')]).toBe('سارة العتيبي');
    expect(body[0][at('الجوال')]).toBe('+966551112233');
    expect(body[0][at('المرحلة الحالية')]).toBe('التدريب والتطبيق معًا');
    expect(body[0][at('المسار المستمر')]).toBe('العادة اليومية');
    expect(body[0][at('سبب التوقف')]).toBe('ارفع واجب التدريب، نموذج التطبيق');
    expect(body[0][at('على من الدور')]).toBe('عليك: تسليم ينتظر المراجعة، عليه');
    expect(body[0][at('متأخر')]).toBe('نعم');
    expect(body[0][at('الحضور')]).toBe('حضر 1 من 2');
    expect(body[2][at('أين توقف قبل الاعتماد')]).toBe('لم يكمل الملف: ينقص الملف: الجوال');
    expect(body[4][at('المرحلة الحالية')]).toBe('منسحب');
    expect(body[4][at('على من الدور')]).toBe('');
  });
});

describe('التبويب الثالث ورابطه', () => {
  it('«المتابعة» بعد «الملف» و«الرحلة»، ورابطها ?view=follow وقد يحمل مرحلة الخريطة', () => {
    expect(COHORT_TABS.map(([k, l]) => `${k}:${l}`)).toEqual(['overview:الملف', 'journey:الرحلة', 'follow:المتابعة']);
    expect(cohortTab('view=follow')).toBe('follow');
    expect(cohortTab('view=follow&stage=training')).toBe('follow');
    expect(followStage('view=follow&stage=training')).toBe('training');
    expect(followStage('view=journey&stage=training')).toBe('');
    // رابط تنبيه المتأخرين في «نظرة عامة» (المرحلة 3): يفتح «المتابعة» على عرض «متأخرون»، ولا عرض غيره من الرابط
    expect([followShow('view=follow&show=late'), followShow('view=follow&show=mine'), followShow('view=journey&show=late'), followShow('')]).toEqual(['late', '', '', '']);
    expect([tabQuery('overview'), tabQuery('journey'), tabQuery('follow'), tabQuery('journey', 'x')]).toEqual(['', 'view=journey', 'view=follow', 'view=journey']);
  });
  it('الصفوف من admin.cohort-journey نفسها: الخادم يطلبها من حلقة الخريطة، والواجهة لا تحسب مرحلة', () => {
    const c = read('supabase/functions/leaders-api/coordinator.ts');
    expect(c).toContain('roster: true,');
    // المرحلة 3: الرد يحمل لحظة القراءة ووقت آخر زيارة مع الخريطة والصفوف
    expect(c).toContain('return { success: true, journey_map: r.journey_map, roster: r.roster, at: r.at, visit };');
    const ui = read('admin-app/src/screens/CohortRoster.jsx');
    expect(ui).toContain("L('admin.cohort-journey', { cohort_id: c.id })");
    expect(ui).not.toMatch(/currentStages|positionOf|journeyFor/);
    // زر الخريطة يفتح «المتابعة» بمرحلته
    expect(read('admin-app/src/screens/CohortJourney.jsx')).toContain('<JourneyMap map={jm} embedded onPeople={on.follow} />');
  });
});

describe('«سجّل حضورهم في جلسة»: جلسات الدفعة المنعقدة من قراءة «الحضور والجلسات» نفسها', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const cohort = { id: 'c1', program_id: 'pa' };
  const w = (id, starts_at, more = {}) => ({ id, requirement_id: 'r1', cohort_id: 'c1', title_ar: `يوم ${id}`, starts_at, ends_at: starts_at, active: true, attended: 3, ...more });
  const acts = {
    requirements: [{ id: 'r1', kind: 'workshop', program_id: 'pa' }, { id: 'r9', kind: 'workshop', program_id: 'pb' }, { id: 'rc', kind: 'coaching', program_id: 'pa' }],
    workshops: [
      w('past', '2026-11-18T06:00:00Z'), w('older', '2026-11-10T06:00:00Z'), w('running', '2026-11-20T09:00:00Z'),
      w('future', '2026-11-25T06:00:00Z'), w('undated', null), w('off', '2026-11-17T06:00:00Z', { active: false }),
      w('other-cohort', '2026-11-18T06:00:00Z', { cohort_id: 'c2' }),
      w('general', '2026-11-15T06:00:00Z', { cohort_id: null }), w('general-other-program', '2026-11-15T06:00:00Z', { cohort_id: null, requirement_id: 'r9' }),
    ],
  };
  it('المؤرخة القائمة التي بدأت وحدها، لهذه الدفعة والعامة من برنامجها، الأحدث أولًا', () => {
    expect(heldSessions(acts, cohort, now).map((s) => [s.id, s.general])).toEqual([['running', false], ['past', false], ['general', true], ['older', false]]);
    expect(heldSessions(acts, cohort, now)[1]).toEqual({ id: 'past', title: 'يوم past', starts_at: '2026-11-18T06:00:00Z', general: false, attended: 3 });
  });
  it('لا جلسات، وقراءة ناقصة، والحد', () => {
    expect(heldSessions({}, cohort, now)).toEqual([]);
    expect(heldSessions(null, cohort, now)).toEqual([]);
    const many = { requirements: acts.requirements, workshops: Array.from({ length: HELD_MAX + 5 }, (_, i) => w(`s${i}`, new Date(now - (i + 1) * 864e5).toISOString())) };
    expect(heldSessions(many, cohort, now)).toHaveLength(HELD_MAX);
  });
});

describe('شريط «منذ آخر زيارة» في التبويب (المرحلة 3)', () => {
  const ui = read('admin-app/src/screens/CohortRoster.jsx');
  const strip = read('admin-app/src/screens/CohortSince.jsx');
  it('فوق الفلاتر، من صفوف «المتابعة» نفسها، والضغط على سطر يصفّي الجدول بأصحابه', () => {
    expect(ui.indexOf('<CohortSince')).toBeGreaterThan(0);
    expect(ui.indexOf('<CohortSince')).toBeLessThan(ui.indexOf('<FilterBar'));
    expect(ui).toContain('rows={all} map={map} at={r.at} visit={r.visit}');
    expect(ui).toContain('only ? rows.filter((m) => only.ids.has(m.id)) : rows');
    // السطور من الدالة المشتركة مع الخادم، ولا حساب للمرحلة ولا للتأخر في الواجهة
    expect(strip).toContain("from '../../../supabase/functions/leaders-api/cohort-changes.js'");
    expect(strip).not.toMatch(/currentStages|positionOf|journeyFor|localStorage|sessionStorage/);
  });
  it('وقت آخر زيارة لا يتقدم بفتح التبويب: يُرسل بعد العرض والصفحة ظاهرة، مرة لكل قراءة', () => {
    expect(strip).toContain("if (document.visibilityState !== 'visible' || sent.current === at) return;");
    expect(strip).toContain("L('admin.cohort-visit', { cohort_id: cohortId, at, op: 'seen' })");
    expect(strip).toContain("L('admin.cohort-visit', { cohort_id: cohortId, at, op: 'read' })");
    expect(strip).toContain('if (!stored || !at) return undefined;');
  });
  it('من رابط التنبيه يُفتح على عرض «متأخرون»', () => {
    expect(ui).toContain("show ? { view: show } : stage ? { stage } : {}");
    expect(read('admin-app/src/screens/Programs.jsx')).toContain('show={show}');
  });
});
