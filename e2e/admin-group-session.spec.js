// الجلسة الجماعية مع المستشار في لوحة الإدارة (تصور تشغيل الدفعة 2026-11-19، المرحلة 5): من «المتابعة» تحدد المشاركين ثم «جلسة مع
// مستشار»، فتظهر المعاينة بحكم الخادم لكل مختار (يُدعى، استنفد رصيده، لم تُفتح له الخدمة، لا يُضاف)، وتحفظ. ثم من «الحضور والجلسات»
// ورقة حضورها بحفظ واحد، وتعديلها وإزالة مدعو وإلغاؤها. وقبل ترحيل الميزة «غير مفعّل بعد». الخلفية مُحاكاة بقواعد الخادم
// (coaching-groups.ts). GROUP_SHOTS: مجلد اللقطات (1440 و390). اليوم 20 نوفمبر 2026.
// المتابعات (2026-11-22): «أضف مدعوين» إلى جلسة قائمة بالمعاينة نفسها، وسطر بريد الدعوة تحت كل مدعو وإعادة إرسالها بمهلتها.
import { test, expect } from '@playwright/test';
import { journeyMap, mapLanes } from '../supabase/functions/leaders-api/journey-map.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.GROUP_SHOTS || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'Asia/Riyadh' });
const TODAY = new Date('2026-11-20T09:00:00Z');
const R = 'aaaaaaaa-0000-4000-8000-00000000c001';

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 2, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 20, active: true },
  { key: 'advice', title_ar: 'الاستشارة', phase: 'qualification', sort: 3, duration_days: 0, active: true, rules: { lane: 'service' } },
];
const item = (title_ar, status, more = {}) => ({ title_ar, status, required: true, kind: 'upload', completed_at: status === 'done' ? '2026-11-04T09:00:00Z' : null, ...more });
const coaching = (used) => item('جلسة استشارة', 'pending', { kind: 'coaching', required: false, activity: { type: 'coaching', done: false, count: 0, total: 1, can_book: used < 2, max: 2, used, sessions: [] } });
const journey = (used, at = 'training') => [
  { key: 'profile', title_ar: 'الملف الشخصي', stage_mode: 'required', status: at === 'profile' ? 'active' : 'done', items: [item('أكمل ملفك', at === 'profile' ? 'pending' : 'done')] },
  { key: 'training', title_ar: 'التدريب', stage_mode: 'required', status: at === 'profile' ? 'locked' : 'active', items: [item('ارفع واجب التدريب', 'pending')] },
  { key: 'advice', title_ar: 'الاستشارة', stage_mode: 'on_demand', rules: { lane: 'service' }, lane: 'service', status: at === 'profile' ? 'locked' : 'available', items: [coaching(used)] },
];
const P = (id, name, used, more = {}) => ({ id, name, status: 'enrolled', created_at: '2026-10-25T08:00:00Z', journey: journey(used, more.at), milestones: [], dates: [], progress: 40, ...more });
// سارة وأسامة وريم يُدعون، هدى استنفدت رصيدها، فهد لم يُعتمد مساره، ماجد منسحب
const people = [P('p-sara', 'سارة العتيبي', 1), P('p-osama', 'أسامة الحربي', 0), P('p-reem', 'ريم الدوسري', 0, { is_test: true }), P('p-huda', 'هدى المطيري', 2),
  P('p-fahd', 'فهد القحطاني', 0, { status: 'pending_approval', at: 'profile' }), P('p-majed', 'ماجد الشهري', 0, { status: 'withdrawn' })];
const cohortRow = { id: 'c1', name: 'دفعة نوفمبر', starts_on: '2026-11-01', is_default: false };
const built = journeyMap({ stages, people, cohort: cohortRow, program: { name: 'برنامج القادة' }, today: TODAY, list: true, activity: true, roster: true });
const { members, ...map } = built;
map.lanes = mapLanes(stages);
const roster = members.map((m) => ({ ...m, email: `${m.id.slice(2)}@example.sa`, phone: null, job_title: null, organization_name: 'هيئة المثال', group: null, last_active_at: '2026-11-19T08:00:00Z', last_login_at: '2026-11-19T08:00:00Z', onboarding: null }));
const nameOf = Object.fromEntries(people.map((p) => [p.id, p.name]));

const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 3, versions: [{ id: 'v1', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-01', ends_on: '2027-01-15', delivery: {}, members: 6, schedule: {} }];
const EXPERTS = [{ id: 'x-mona', full_name: 'د. منى القحطاني', upcoming: 2 }, { id: 'x-khalid', full_name: 'أ. خالد العتيبي', upcoming: 0 }];
const REQS = [{ id: R, title: 'جلسات الاستشارة', stage: 'الاستشارة', minutes: 90, max: 2, mode: 'online', location: '' }];
const VERDICT = {
  'p-sara': { category: 'ok', code: 'ok', reason: '', used: 1, max: 2 }, 'p-osama': { category: 'ok', code: 'ok', reason: '', used: 0, max: 2 }, 'p-reem': { category: 'ok', code: 'ok', reason: '', used: 0, max: 2, test: true },
  'p-huda': { category: 'at_max', code: 'at_max', reason: 'استنفد رصيده (2 من 2)', used: 2, max: 2 },
  'p-fahd': { category: 'locked', code: 'locked', reason: 'الخدمة لم تُفتح له بعد (لم يُعتمد مساره)', used: 0, max: 2 },
  'p-majed': { category: 'ineligible', code: 'out', reason: 'خارج البرنامج (منسحب أو موقوف)' },
};
// بريد دعوة خرج الآن: ممسوك ساعة
const sentNow = () => ({ state: 'sent', at: TODAY.toISOString(), resend_at: new Date(TODAY.getTime() + 36e5).toISOString() });
const REFUSAL = { too_early: 'يُسجَّل الحضور من قبل الموعد بساعة، لا قبلها', not_member: 'ليس من مدعوي هذه الجلسة' };

// «الخادم»: حالة الجلسات الجماعية تكتبها الأفعال بقواعد coaching-groups.ts وتقرؤها القائمة
function server({ ready = true, groups = [], conflictAt = null } = {}) {
  const view = (g) => {
    const ms = g.members.filter((m) => m.state !== 'removed');
    const n = (s) => ms.filter((m) => m.state === s).length;
    const ended = Date.parse(g.ends_at) < TODAY.getTime();
    const upcoming = g.status === 'scheduled' && Date.parse(g.starts_at) > TODAY.getTime();
    return { can_add: g.status === 'scheduled' && !ended && n('attended') + n('no_show') === 0, can_resend: upcoming, ...(upcoming ? { resend_minutes: 60, mail_known: true } : {}), id: g.id, cohort_id: 'c1', cohort: 'دفعة نوفمبر', requirement_id: R, requirement: 'جلسات الاستشارة', expert_id: g.expert_id, expert: EXPERTS.find((e) => e.id === g.expert_id)?.full_name || null, title: g.title, starts_at: g.starts_at, ends_at: g.ends_at,
      mode: g.mode, location: g.location || null, join_url: g.join_url || null, counts: g.counts !== false, status: g.status, count: ms.length, attended: n('attended'), no_show: n('no_show'), excused: n('excused'), pending: n('booked'), ended,
      awaiting: g.status === 'scheduled' && ended && n('booked') > 0, members: ms.map((m) => ({ id: m.id, full_name: nameOf[m.id], email: `${m.id.slice(2)}@example.sa`, state: m.state, note: m.note || null, off: g.counts === false, ...(m.id === 'p-reem' ? { test: true } : {}), ...(upcoming && m.state === 'booked' && m.mail ? { mail: m.mail } : {}) })) };
  };
  const conflicts = (b) => (conflictAt && b.expert_id === 'x-mona' && b.starts_at === conflictAt ? [{ kind: 'session', starts_at: conflictAt, ends_at: conflictAt }] : []);
  return (b) => {
    if (b.action === 'admin.activities') return { success: true, capacity_ready: false, trainer_ready: true, requirements: [{ id: R, code: 'C-MEET', kind: 'coaching', title_ar: 'جلسات الاستشارة', program_id: 'pa', config: { sessions_required: 1, minutes: 90, max_sessions: 2 } }],
      workshops: [], coaching: [], coaching_groups: ready ? groups.map(view) : [], groups_ready: ready, programs: [{ id: 'pa', name: 'برنامج القادة' }], cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa' }], cohort_trainers: { c1: EXPERTS.map(({ id, full_name }) => ({ id, full_name })) } };
    if (b.action === 'admin.coaching-groups') return { success: true, ready, groups: groups.filter((g) => !b.id || g.id === b.id).map(view) };
    if (b.action === 'admin.coaching-group-preview') {
      if (!ready) return { success: true, ready: false, message: 'الجلسة الجماعية غير مفعّلة بعد' };
      const members = (b.participant_ids || []).map((id) => { const v = VERDICT[id]; return { id, name: nameOf[id], ...(b.counts === false && v.category === 'at_max' ? { ...v, category: 'ok', code: 'ok', reason: '' } : v) }; });
      return { success: true, ready: true, cohort: { id: 'c1', name: 'دفعة نوفمبر' }, requirements: REQS, experts: EXPERTS, max_members: 50, requirement_id: R, members, conflicts: conflicts(b) };
    }
    if (b.action === 'admin.coaching-group-save') {
      if (b.id) {
        const g = groups.find((x) => x.id === b.id);
        const before = JSON.stringify([g.starts_at, g.mode, g.location, g.join_url, g.expert_id]);
        Object.assign(g, { title: b.title_ar ?? g.title, ...(b.starts_at ? { starts_at: b.starts_at, ends_at: new Date(Date.parse(b.starts_at) + (b.minutes || 90) * 6e4).toISOString() } : {}), ...(b.mode ? { mode: b.mode, location: b.location_ar, join_url: b.join_url } : {}), ...(b.expert_id ? { expert_id: b.expert_id } : {}) });
        const changed = before !== JSON.stringify([g.starts_at, g.mode, g.location, g.join_url, g.expert_id]);
        return { success: true, id: g.id, changed: ['x'], mail: { sent: changed ? g.members.filter((m) => m.state === 'booked').length : 0, queued: 0, failed: 0, skipped: 0 }, expert_mail: changed ? 'sent' : 'none' };
      }
      if (conflicts(b).length && !b.confirm_conflict) return { success: false, code: 'expert_conflict', message: 'للمستشار موعد آخر في هذا الوقت. راجع الموعد، أو أكّد الحفظ معه' };
      const ex = new Set(b.exceptions || []);
      const picked = b.participant_ids.filter((id) => { const c = b.counts === false && VERDICT[id].category === 'at_max' ? 'ok' : VERDICT[id].category; return c === 'ok' || ((c === 'at_max' || c === 'locked') && ex.has(id)); });
      const g = { id: `g${groups.length + 1}`, title: b.title_ar || 'جلسة جماعية: جلسات الاستشارة', expert_id: b.expert_id, starts_at: b.starts_at, ends_at: new Date(Date.parse(b.starts_at) + b.minutes * 6e4).toISOString(), mode: b.mode, location: b.location_ar, join_url: b.join_url,
        counts: b.counts, status: 'scheduled', members: picked.map((id) => ({ id, state: 'booked' })) };
      groups.push(g);
      const real = picked.filter((id) => id !== 'p-reem').length;
      return { success: true, id: g.id, added: picked.length, exceptions: picked.filter((id) => VERDICT[id].category !== 'ok' && b.counts !== false).length,
        skipped: b.participant_ids.filter((id) => !picked.includes(id)).map((id) => ({ id, name: nameOf[id], code: VERDICT[id].code, reason: VERDICT[id].reason })), mail: { sent: real, queued: 0, failed: 0, skipped: picked.length - real }, expert_mail: 'sent', past: false };
    }
    if (b.action === 'admin.coaching-group-mark') {
      const g = groups.find((x) => x.id === b.id);
      const started = Date.parse(g.starts_at) - 36e5 <= TODAY.getTime();
      const out = { success: true, marked: 0, already: 0, pending: 0, refused: [] };
      for (const m of b.marks) {
        const row = g.members.find((x) => x.id === m.id && x.state !== 'removed');
        if (!row) out.refused.push({ id: m.id, code: 'not_member', message: REFUSAL.not_member });
        else if (row.state === m.state) out.already += 1;
        else if (['attended', 'no_show'].includes(m.state) && !started) out.refused.push({ id: m.id, code: 'too_early', message: REFUSAL.too_early });
        else { row.state = m.state; row.note = m.state === 'booked' ? null : b.note || null; out.marked += 1; }
      }
      out.pending = g.members.filter((m) => m.state === 'booked').length;
      return out;
    }
    // المتابعات بقواعد الخادم: المرشحون أعضاء الدفعة ممن في البرنامج وليسوا مدعوين، والحكم حكم المعاينة، والإعادة بمهلتها
    if (b.action === 'admin.coaching-group-candidates') {
      const g = groups.find((x) => x.id === b.id);
      const inGroup = new Set(g.members.filter((m) => m.state === 'booked').map((m) => m.id));
      const was = Object.fromEntries(g.members.filter((m) => m.state !== 'booked').map((m) => [m.id, m.state]));
      const candidates = people.filter((p) => VERDICT[p.id].code !== 'out' && !inGroup.has(p.id)).map((p) => ({ id: p.id, name: p.name, ...(was[p.id] ? { was: was[p.id] } : {}) }));
      const members = (b.participant_ids || []).map((id) => ({ id, name: nameOf[id], ...(inGroup.has(id) ? { category: 'ineligible', code: 'already', reason: 'مدعو إلى هذه الجلسة أصلًا' } : VERDICT[id]) }));
      return { success: true, ready: true, session: { id: g.id, title: g.title, starts_at: g.starts_at, ends_at: g.ends_at, counts: g.counts !== false, past: Date.parse(g.starts_at) <= TODAY.getTime() }, blocked: null, candidates, members, room: 50 - g.members.filter((m) => m.state !== 'removed').length, max_members: 50 };
    }
    if (b.action === 'admin.coaching-group-add') {
      const g = groups.find((x) => x.id === b.id);
      const ex = new Set(b.exceptions || []);
      const inGroup = new Set(g.members.filter((m) => m.state === 'booked').map((m) => m.id));
      const picked = b.participant_ids.filter((id) => !inGroup.has(id) && (VERDICT[id].category === 'ok' || (['at_max', 'locked'].includes(VERDICT[id].category) && ex.has(id))));
      let readded = 0;
      for (const id of picked) {
        const old = g.members.find((m) => m.id === id);
        const mail = id === 'p-reem' ? {} : { mail: sentNow() };
        if (old) { Object.assign(old, { state: 'booked', ...mail }); readded += 1; } else g.members.push({ id, state: 'booked', ...mail });
      }
      const real = picked.filter((id) => id !== 'p-reem').length;
      return { success: true, id: g.id, added: picked.length, exceptions: picked.filter((id) => VERDICT[id].category !== 'ok').length, readded,
        skipped: b.participant_ids.filter((id) => !picked.includes(id)).map((id) => ({ id, name: nameOf[id], code: inGroup.has(id) ? 'already' : VERDICT[id].code, reason: inGroup.has(id) ? 'مدعو إلى هذه الجلسة أصلًا' : VERDICT[id].reason })),
        mail: { sent: real, queued: 0, failed: 0, skipped: picked.length - real }, past: false };
    }
    if (b.action === 'admin.coaching-group-resend') {
      const g = groups.find((x) => x.id === b.id);
      const held = (m) => m.mail?.state === 'waiting' || (m.mail?.resend_at && Date.parse(m.mail.resend_at) > TODAY.getTime());
      const pending = g.members.filter((m) => m.state === 'booked' && (!b.participant_id || m.id === b.participant_id));
      const real = pending.filter((m) => m.id !== 'p-reem');
      const go = real.filter((m) => !held(m));
      if (b.participant_id && !go.length) return { success: false, code: 'throttled', message: 'أُرسلت له قبل قليل. تُعاد بعد 60 دقيقة من آخر إرسال' };
      for (const m of go) m.mail = sentNow();
      return { success: true, mail: { sent: go.length, queued: 0, failed: 0, skipped: pending.length - real.length }, throttled: real.length - go.length, minutes: 60 };
    }
    if (b.action === 'admin.coaching-group-remove') { groups.find((x) => x.id === b.id).members.find((m) => m.id === b.participant_id).state = 'removed'; return { success: true, removed: true, mail: { sent: 1, queued: 0, failed: 0, skipped: 0 } }; }
    if (b.action === 'admin.coaching-group-cancel') { const g = groups.find((x) => x.id === b.id); g.status = 'cancelled'; return { success: true, cancelled: g.members.length, mail: { sent: 2, queued: 0, failed: 0, skipped: 0 }, expert_mail: 'sent' }; }
    return undefined;
  };
}

async function setup(page, { width = 1440, role = 'admin', srv = server(), to = 'follow' } = {}) {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(TODAY);
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.cohort-definition': { success: true, program_id: 'pa', version: { id: 'v1', number: 1, label: 'الإطلاق' }, stages, hidden: [], sessions: [], requirements: [], cohort_plan: { schedule: {}, starts_on: '2026-11-01', is_default: false, status: 'running', program_version_id: 'v1', updated_at: 'u0' } },
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.cohort-journey': { success: true, journey_map: map, roster },
      'admin.inbox': { success: true, items: [], counts: {}, by_tab: {}, total: 0, late: 0, soon: 0, skipped: [], capped: [] },
    };
    await route.fulfill({ json: srv(b) ?? replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'مدير', email: 'a@x.sa', role_id: r, totp_enabled: true }, ts: Date.now() })), role);
  if (to === 'activities') await page.evaluate(() => { window.location.hash = '#/leaders/activities?sub=groups'; });
  await page.reload();
  if (to === 'follow') {
    await page.getByRole('button', { name: 'تطبيق القادة' }).click();
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
    await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'دفعة نوفمبر', exact: true }).click();
    await page.getByRole('tablist', { name: 'أقسام ملف الدفعة' }).getByRole('tab', { name: 'المتابعة' }).click();
  }
  return calls;
}
const shot = async (page, name) => { if (SHOTS) { await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); } };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const of = (calls, action) => calls.filter((c) => c.action === action);
const pick = async (page, names) => {
  const box = page.getByTestId('cohort-roster');
  await expect(box.locator('tbody tr')).toHaveCount(6);
  for (const n of names) await box.getByRole('checkbox', { name: `تحديد ${n}` }).check();
  await box.getByTestId('cr-bulk').getByRole('button', { name: 'جلسة مع مستشار…' }).click();
  return page.getByTestId('group-create');
};
const ALL = ['سارة العتيبي', 'أسامة الحربي', 'ريم الدوسري', 'هدى المطيري', 'فهد القحطاني', 'ماجد الشهري'];
// جلسة انتهت قبل ثلاثة أيام بلا تأكيد، وأخرى قادمة
const ended = () => ({ id: 'g-old', title: 'جلسة جماعية: التفاوض', expert_id: 'x-mona', starts_at: '2026-11-17T07:00:00Z', ends_at: '2026-11-17T08:30:00Z', mode: 'in_person', location: 'قاعة الاجتماعات، الدور الثالث', counts: true, status: 'scheduled',
  members: [{ id: 'p-sara', state: 'booked' }, { id: 'p-osama', state: 'booked' }, { id: 'p-reem', state: 'booked' }, { id: 'p-huda', state: 'booked' }] });
const coming = () => ({ id: 'g-new', title: 'جلسة جماعية: جلسات الاستشارة', expert_id: 'x-khalid', starts_at: '2026-11-24T07:00:00Z', ends_at: '2026-11-24T08:30:00Z', mode: 'online', join_url: 'https://meet.example.sa/group', counts: true, status: 'scheduled',
  members: [{ id: 'p-sara', state: 'booked' }, { id: 'p-osama', state: 'booked' }] });

for (const width of [1440, 390]) {
  test(`من «المتابعة»: جلسة مع مستشار بمعاينة لكل مختار، واستثناء مسجل، وحفظ يدعوهم (${width})`, async ({ page }) => {
    const groups = [];
    const calls = await setup(page, { width, srv: server({ groups }) });
    const form = await pick(page, ALL);
    await expect(form.getByRole('heading', { level: 3 })).toHaveText('جلسة مع مستشار: 6 محددين من دفعة نوفمبر');
    const preview = form.getByTestId('gs-preview');
    // المعاينة بحكم الخادم: من يُدعى، ومن يُتخطى بسببه، ومن لا يُضاف
    await expect(preview.locator('.gs-line')).toHaveText('المعاينة: 3 سيُدعون. 1 استنفد رصيده ويُتخطى. 1 لم تُفتح له الخدمة ويُتخطى. 1 لا يُضاف.');
    await expect(preview.locator('.gs-group')).toHaveCount(4);
    await expect(preview.locator('.gs-group.ok li')).toHaveCount(3);
    await expect(preview.locator('.gs-group.ok')).toContainText('حساب اختبار: يُدعى ولا يصله بريد');
    await expect(preview.locator('.gs-group', { hasText: 'استنفدوا رصيدهم' })).toContainText('استنفد رصيده (2 من 2)');
    await expect(preview.locator('.gs-group', { hasText: 'لا يُضافون' })).toContainText('خارج البرنامج (منسحب أو موقوف)');
    // خبراء الدفعة بحِملهم، والمدة من إعداد النشاط
    await expect(form.getByLabel('المستشار').locator('option')).toHaveText(['اختر من خبراء الدفعة', 'د. منى القحطاني · 2 جلسات قادمة', 'أ. خالد العتيبي · لا جلسات قادمة']);
    await expect(form.getByLabel('المدة بالدقائق')).toHaveValue('90');
    // لا حفظ بلا مستشار وموعد
    await form.getByRole('button', { name: /^احفظ وادعُ/ }).click();
    await expect(form.getByRole('alert')).toHaveText('اختر المستشار');
    await form.getByLabel('المستشار').selectOption('x-khalid');
    await form.getByLabel('الموعد').fill('2026-11-24T10:00');
    await form.getByLabel('رابط الجلسة (اختياري)').fill('https://meet.example.sa/group');
    // هدى استثناءً: تدخل المدعوين وتُحسب في جملة المعاينة
    await preview.locator('li', { hasText: 'هدى المطيري' }).getByRole('checkbox', { name: 'أضفه استثناءً' }).check();
    await expect(preview.locator('.gs-line')).toHaveText('المعاينة: 4 سيُدعون (منهم 1 استثناءً). 1 لم تُفتح له الخدمة ويُتخطى. 1 لا يُضاف.');
    await expect(form.getByRole('button', { name: 'احفظ وادعُ المدعوين (4)' })).toBeEnabled();
    expect(await noOverflow(page)).toBe(true);
    await form.evaluate((el) => el.scrollTo(0, 0));
    await shot(page, 'admin-picker-preview');
    await preview.scrollIntoViewIfNeeded();
    await shot(page, 'admin-preview-detail');

    await form.getByRole('button', { name: 'احفظ وادعُ المدعوين (4)' }).click();
    const saved = form.getByTestId('gs-saved');
    await expect(saved).toHaveText('حُفظت الجلسة ودُعي 4 مشاركين (1 استثناءً). أُرسلت 3 دعوات، 1 بلا بريد (حساب اختبار)، وأُبلغ المستشار.');
    await expect(form).toContainText('فهد القحطاني: لم يُضف، الخدمة لم تُفتح له بعد (لم يُعتمد مساره)');
    const [sent] = of(calls, 'admin.coaching-group-save');
    expect(sent).toMatchObject({ cohort_id: 'c1', requirement_id: R, expert_id: 'x-khalid', starts_at: '2026-11-24T07:00:00.000Z', minutes: 90, mode: 'online', join_url: 'https://meet.example.sa/group', counts: true, exceptions: ['p-huda'] });
    expect(sent.participant_ids).toHaveLength(6);
    expect(of(calls, 'admin.coaching-group-save')).toHaveLength(1);
    await shot(page, 'admin-saved');
    // من النتيجة إلى «الحضور والجلسات»: الجلسة بكيانها في قسم «جلسات جماعية»
    await form.getByRole('link', { name: 'افتح «الحضور والجلسات»' }).click();
    const section = page.getByTestId('group-sessions');
    await expect(section.getByTestId('group-card')).toHaveCount(1);
    await expect(section.getByTestId('group-card')).toContainText('مع أ. خالد العتيبي');
    await expect(section.getByTestId('group-card')).toContainText('4 مدعوين');
    expect(await noOverflow(page)).toBe(true);
    await section.scrollIntoViewIfNeeded();
    await shot(page, 'admin-group-list');
  });

  test(`ورقة حضور الجلسة الجماعية: «الكل حضر» ثم تستثني، وحفظ واحد بنتيجة الخادم (${width})`, async ({ page }) => {
    const groups = [ended(), coming()];
    const calls = await setup(page, { width, srv: server({ groups }), to: 'activities' });
    const section = page.getByTestId('group-sessions');
    await expect(section.getByRole('heading', { name: 'تنتظر تأكيد الحضور (1)' })).toBeVisible();
    await expect(section.getByRole('heading', { name: 'القادمة (1)' })).toBeVisible();
    const card = section.getByTestId('group-card').filter({ hasText: 'التفاوض' });
    await expect(card).toContainText('تنتظر تأكيد الحضور');
    await expect(card).toContainText('4 مدعوين · لم يُؤكَّد 4');
    await card.getByRole('button', { name: 'ورقة الحضور' }).click();
    const sheet = page.getByRole('dialog', { name: 'ورقة حضور الجلسة الجماعية' });
    await expect(sheet.getByRole('heading', { name: 'جلسة جماعية: التفاوض' })).toBeVisible();
    await expect(sheet.locator('.ats-count')).toContainText('حضر 0 من 4 · لم يُؤكَّد 4');
    await expect(sheet.getByRole('radiogroup')).toHaveCount(4);
    await expect(sheet.getByRole('button', { name: 'لا تغيير للحفظ' })).toBeDisabled();
    await sheet.getByRole('button', { name: 'الكل حضر' }).click();
    // ثم تستثني: ريم لم تحضر، وهدى اعتذرت
    await sheet.getByRole('radiogroup', { name: 'حضور ريم الدوسري' }).getByRole('radio', { name: 'لم يحضر' }).check();
    // بلوحة المفاتيح: الخانات خانات اختيار حقيقية، فالسهم ينقل بينها
    await sheet.getByRole('radiogroup', { name: 'حضور هدى المطيري' }).getByRole('radio', { name: 'حضر', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(sheet.getByRole('radiogroup', { name: 'حضور هدى المطيري' }).getByRole('radio', { name: 'اعتذر' })).toBeChecked();
    await expect(sheet.locator('.ats-count')).toContainText('حضر 2 من 4 · لم يحضر 1 · اعتذر 1');
    await expect(sheet.locator('.ats-draft')).toContainText('لم يُحفظ بعد');
    await sheet.getByLabel(/ملاحظة للورقة/).fill('انعقدت في القاعة');
    expect(await noOverflow(page)).toBe(true);
    await expect(sheet.locator('.ats-foot')).toBeInViewport();
    await shot(page, 'admin-sheet');
    await sheet.getByRole('button', { name: /^احفظ: / }).click();
    await expect(sheet.getByTestId('gss-result')).toContainText('حُفظ: سُجّل 4');
    const marks = of(calls, 'admin.coaching-group-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ id: 'g-old', note: 'انعقدت في القاعة' });
    expect(Object.fromEntries(marks[0].marks.map((m) => [m.id, m.state]))).toEqual({ 'p-sara': 'attended', 'p-osama': 'attended', 'p-reem': 'no_show', 'p-huda': 'excused' });
    // بعد الحفظ: الحالات محفوظة، والتراجع عن واحد يعيده «لم يُؤكَّد»
    await expect(sheet.getByRole('radiogroup', { name: 'حضور ريم الدوسري' }).getByRole('radio', { name: 'لم يحضر' })).toBeChecked();
    await sheet.getByRole('button', { name: 'تراجع عن تسجيل ريم الدوسري' }).click();
    await sheet.getByRole('button', { name: 'احفظ: تراجع 1' }).click();
    await expect(sheet.getByTestId('gss-result')).toContainText('حُفظ: سُجّل 1');
    await expect(sheet.getByRole('button', { name: 'لا تغيير للحفظ' })).toBeDisabled();
    await shot(page, 'admin-sheet-saved');
    // Esc يغلق، والبطاقة تتحدث من الخادم
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(card).toContainText('4 مدعوين · حضر 2 · اعتذر 1 · لم يُؤكَّد 1');
    // قبل موعد الجلسة القادمة: الحضور يُرفض بسببه لكل مدعو، والاعتذار يُسجَّل
    const next = section.getByTestId('group-card').filter({ hasText: 'جلسات الاستشارة' });
    await next.getByRole('button', { name: 'ورقة الحضور' }).click();
    const s2 = page.getByRole('dialog', { name: 'ورقة حضور الجلسة الجماعية' });
    await s2.getByRole('radiogroup', { name: 'حضور سارة العتيبي' }).getByRole('radio', { name: 'حضر', exact: true }).check();
    await s2.getByRole('radiogroup', { name: 'حضور أسامة الحربي' }).getByRole('radio', { name: 'اعتذر' }).check();
    await s2.getByRole('button', { name: 'احفظ: حضر 1، اعتذر 1' }).click();
    await expect(s2.getByTestId('gss-result')).toContainText('سُجّل 1، لم يُسجَّل 1');
    await expect(s2.getByTestId('gss-result')).toContainText('سارة العتيبي: يُسجَّل الحضور من قبل الموعد بساعة، لا قبلها');
  });
}

test('تعارض موعد المستشار تنبيه يُؤكَّد قبل الحفظ، وخانة «لا تُحسب من الرصيد» تغيّر المعاينة', async ({ page }) => {
  const groups = [];
  const calls = await setup(page, { srv: server({ groups, conflictAt: '2026-11-24T07:00:00.000Z' }) });
  const form = await pick(page, ['سارة العتيبي', 'هدى المطيري']);
  const preview = form.getByTestId('gs-preview');
  await expect(preview.locator('.gs-line')).toHaveText('المعاينة: واحد سيُدعى. 1 استنفد رصيده ويُتخطى.');
  // خارج الرصيد: من استنفد رصيده يُدعى كغيره
  await form.getByRole('checkbox', { name: /لا تُحسب من الرصيد/ }).check();
  await expect(preview.locator('.gs-line')).toHaveText('المعاينة: 2 سيُدعون.');
  await form.getByLabel('المستشار').selectOption('x-mona');
  await form.getByLabel('الموعد').fill('2026-11-24T10:00');
  const warn = form.getByTestId('gs-conflict');
  await expect(warn).toContainText('للمستشار موعد آخر في هذا الوقت: جلسة فردية');
  await form.getByRole('button', { name: 'احفظ وادعُ المدعوين (2)' }).click();
  await expect(form.locator('p.la-err')).toHaveText('للمستشار موعد آخر في هذا الوقت. غيّر الموعد، أو علّم «احفظ مع التعارض»');
  expect(of(calls, 'admin.coaching-group-save')).toHaveLength(0);
  await warn.getByRole('checkbox', { name: 'احفظ مع التعارض' }).check();
  await form.getByRole('button', { name: 'احفظ وادعُ المدعوين (2)' }).click();
  await expect(form.getByTestId('gs-saved')).toContainText('حُفظت الجلسة ودُعي مشاركان');
  expect(of(calls, 'admin.coaching-group-save')[0]).toMatchObject({ counts: false, confirm_conflict: true, expert_id: 'x-mona' });
  // حضوري: المكان مطلوب قبل الإرسال
  await form.getByRole('button', { name: 'إغلاق' }).click();
  await expect(page.getByTestId('group-create')).toHaveCount(0);
});

test('تعديل الجلسة وإزالة مدعو وإلغاؤها من «الحضور والجلسات»، بتأكيد يقول الأثر', async ({ page }) => {
  const groups = [coming()];
  groups[0].members.push({ id: 'p-reem', state: 'booked' });
  const calls = await setup(page, { srv: server({ groups }), to: 'activities' });
  const card = page.getByTestId('group-card');
  await expect(card).toContainText('3 مدعوين');
  // التعديل: الموعد والمكان، ويُقال إن المدعوين يُبلَّغون
  await card.getByRole('button', { name: 'عدّل' }).click();
  const form = page.getByRole('dialog').filter({ hasText: 'تعديل: جلسة جماعية' });
  await expect(form).toContainText('تغيير الموعد أو المكان أو المستشار يبلّغ المدعوين والمستشار بالبريد');
  await form.getByLabel('طريقة الجلسة').selectOption('in_person');
  await form.getByLabel('المكان').fill('قاعة الاجتماعات');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(card).toContainText('قاعة الاجتماعات');
  expect(of(calls, 'admin.coaching-group-save')[0]).toMatchObject({ id: 'g-new', mode: 'in_person', location_ar: 'قاعة الاجتماعات' });
  // إزالة مدعو: يُقال إن رصيده يعود وإن بريدًا يصله
  await card.getByRole('button', { name: 'المدعوون (3)' }).click();
  await card.getByRole('button', { name: 'أزل ريم الدوسري من الجلسة' }).click();
  const ask = page.getByRole('alertdialog').or(page.locator('.mid-box')).first();
  await expect(ask).toContainText('يُزال ريم الدوسري من «جلسة جماعية: جلسات الاستشارة» ويعود ما أُخذ من رصيده. يصله بريد بذلك.');
  await ask.getByRole('button', { name: 'أزله' }).click();
  await expect(card).toContainText('مدعوان');
  expect(of(calls, 'admin.coaching-group-remove')[0]).toMatchObject({ id: 'g-new', participant_id: 'p-reem' });
  // الإلغاء: الجلسة كلها
  await card.getByRole('button', { name: 'ألغِ الجلسة' }).click();
  await expect(page.locator('.mid-box').first()).toContainText('تُلغى «جلسة جماعية: جلسات الاستشارة» لكل مدعويها (2)، ويعود ما أُخذ من رصيدهم. يصلهم ويصل المستشار بريد بالإلغاء.');
  await page.locator('.mid-box').first().getByRole('button', { name: 'ألغِ الجلسة' }).click();
  await expect(page.getByRole('heading', { name: 'الملغاة (1)' })).toBeVisible();
  await expect(page.getByTestId('group-card').getByRole('button', { name: 'ورقة الحضور' })).toHaveCount(0);
  expect(of(calls, 'admin.coaching-group-cancel')).toHaveLength(1);
});

test('قبل ترحيل الميزة: النافذة والقسم يقولان «غير مفعّلة بعد»، ولا نموذج ولا كتابة', async ({ page }) => {
  const calls = await setup(page, { width: 390, srv: server({ ready: false }) });
  const form = await pick(page, ['سارة العتيبي']);
  await expect(form.getByTestId('gs-not-ready')).toHaveText('الجلسة الجماعية مع المستشار غير مفعّلة بعد. تعمل بعد تحديث قاعدة البيانات القادم.');
  await expect(form.getByLabel('المستشار')).toHaveCount(0);
  await shot(page, 'admin-not-ready');
  await form.getByRole('button', { name: 'إغلاق' }).click();
  await page.evaluate(() => { window.location.hash = '#/leaders/activities?sub=groups'; });
  await expect(page.getByTestId('group-sessions').getByTestId('gs-not-ready')).toBeVisible();
  expect(calls.filter((c) => /coaching-group-(save|mark|cancel|remove)/.test(c.action))).toHaveLength(0);
});

test('من يقرأ فقط: لا زر «جلسة مع مستشار»، وورقة الجلسة للقراءة', async ({ page }) => {
  await setup(page, { role: 'viewer', srv: server({ groups: [ended()] }), to: 'activities' });
  const card = page.getByTestId('group-card');
  await expect(card.getByRole('button', { name: 'عدّل' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'ألغِ الجلسة' })).toHaveCount(0);
  await card.getByRole('button', { name: 'ورقة الحضور' }).click();
  const sheet = page.getByRole('dialog', { name: 'ورقة حضور الجلسة الجماعية' });
  await expect(sheet.locator('.gss-row')).toHaveCount(4);
  await expect(sheet.getByRole('radio')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'الكل حضر' })).toHaveCount(0);
});

// ── المتابعات: إضافة مدعوين إلى جلسة قائمة، وإعادة إرسال الدعوة ──
// سارة دعوتها خرجت أمس، وأسامة قبل عشرين دقيقة (ممسوكة)، والجلسة قادمة
const invitedGroup = () => { const g = coming(); g.members[0].mail = { state: 'sent', at: '2026-11-19T07:10:00Z' }; g.members[1].mail = { state: 'sent', at: '2026-11-20T08:40:00Z', resend_at: '2026-11-20T09:40:00Z' }; return g; };
for (const width of [1440, 390]) {
  test(`«أضف مدعوين» إلى جلسة قائمة: الاختيار من أعضاء الدفعة، والمعاينة نفسها، والدعوة للجدد وحدهم (${width})`, async ({ page }) => {
    const groups = [invitedGroup()];
    const calls = await setup(page, { width, srv: server({ groups }), to: 'activities' });
    const card = page.getByTestId('group-card');
    await expect(card).toContainText('مدعوان');
    await card.getByRole('button', { name: 'أضف مدعوين' }).click();
    const form = page.getByTestId('group-add');
    await expect(form.getByRole('heading', { level: 3 })).toHaveText('أضف مدعوين إلى «جلسة جماعية: جلسات الاستشارة»');
    // المرشحون: أعضاء الدفعة غير المدعوين ممن في البرنامج. لا المدعوان ولا المنسحب
    await expect(form.locator('.gs-pick li')).toHaveText([/ريم الدوسري/, /هدى المطيري/, /فهد القحطاني/]);
    await expect(form.getByTestId('gs-preview')).toContainText('اختر من القائمة لتظهر المعاينة.');
    for (const n of ['ريم الدوسري', 'هدى المطيري', 'فهد القحطاني']) await form.getByRole('checkbox', { name: n }).check();
    // المعاينة بحكم الخادم كما في الإنشاء
    const pv = form.getByTestId('gs-preview');
    await expect(pv).toContainText('واحد سيُدعى. 1 استنفد رصيده ويُتخطى. 1 لم تُفتح له الخدمة ويُتخطى.');
    await expect(pv.locator('.gs-group.ok')).toContainText('حساب اختبار: يُدعى ولا يصله بريد');
    await pv.locator('.gs-group.warn', { hasText: 'استنفدوا رصيدهم' }).getByRole('checkbox', { name: 'أضفه استثناءً' }).check();
    await expect(pv).toContainText('2 سيُدعون (منهم 1 استثناءً). 1 لم تُفتح له الخدمة ويُتخطى.');
    await expect(form).toContainText('المدعوون السابقون والمستشار لا يصلهم بريد');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'add-preview');
    await form.getByRole('button', { name: 'أضف وادعُ المدعوين (2)' }).click();
    await expect(form.getByTestId('gs-added')).toHaveText('أُضيف مشاركان (1 استثناءً). أُرسلت دعوة واحدة، 1 بلا بريد (حساب اختبار). المدعوون السابقون لم يصلهم شيء.');
    await expect(form.locator('.la-form-notes li')).toHaveText(['فهد القحطاني: لم يُضف، الخدمة لم تُفتح له بعد (لم يُعتمد مساره)']);
    expect(of(calls, 'admin.coaching-group-add')).toEqual([expect.objectContaining({ id: 'g-new', participant_ids: ['p-reem', 'p-huda', 'p-fahd'], exceptions: ['p-huda'] })]);
    await shot(page, 'add-saved');
    await form.getByRole('button', { name: 'إغلاق' }).click();
    // القائمة بعد الإضافة: أربعة مدعوين، والجديدة دعوتها خرجت للتو
    await expect(card).toContainText('4 مدعوين');
    await card.getByRole('button', { name: 'المدعوون (4)' }).click();
    await expect(card.locator('.gs-members li')).toHaveCount(4);
    await expect(card.locator('.gs-members li', { hasText: 'هدى المطيري' }).getByTestId('gs-mail-line')).toContainText('آخر دعوة:');
    await expect(card.locator('.gs-members li', { hasText: 'ريم الدوسري' }).getByTestId('gs-mail-line')).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'add-after');
    // الطلب نفسه ثانية: لا مرشح مدعو يُعرض، ومن أُضيف خرج من القائمة
    await card.getByRole('button', { name: 'أضف مدعوين' }).click();
    await expect(page.getByTestId('group-add').locator('.gs-pick li')).toHaveText([/فهد القحطاني/]);
  });

  test(`إعادة إرسال الدعوة: سطر آخر دعوة تحت كل مدعو، وزر لكل واحد وللكل، والممسوكة بمهلتها (${width})`, async ({ page }) => {
    const groups = [invitedGroup()];
    groups[0].members.push({ id: 'p-reem', state: 'booked' }, { id: 'p-huda', state: 'booked', mail: { state: 'failed', at: '2026-11-19T07:10:00Z' } }, { id: 'p-fahd', state: 'booked', mail: { state: 'waiting', at: '2026-11-20T08:00:00Z' } });
    const calls = await setup(page, { width, srv: server({ groups }), to: 'activities' });
    const card = page.getByTestId('group-card');
    await card.getByRole('button', { name: 'المدعوون (5)' }).click();
    const row = (name) => card.locator('.gs-members li', { hasText: name });
    // السطر من سجل البريد: خرجت، ممسوكة، لم تخرج، تنتظر. وحساب الاختبار بلا سطر ولا زر
    await expect(row('سارة العتيبي').getByTestId('gs-mail-line')).toContainText('آخر دعوة:');
    await expect(row('أسامة الحربي').getByTestId('gs-held')).toContainText('أُرسلت قبل قليل، تُعاد بعد');
    await expect(row('أسامة الحربي').getByRole('button', { name: /أعد الدعوة/ })).toHaveCount(0);
    await expect(row('هدى المطيري').getByTestId('gs-mail-line')).toContainText('لم تخرج دعوته');
    await expect(row('فهد القحطاني').getByTestId('gs-mail-line')).toHaveText('دعوته تنتظر في صندوق «لم يُرسل»');
    await expect(row('فهد القحطاني').getByRole('button', { name: /أعد الدعوة/ })).toHaveCount(0);
    await expect(row('ريم الدوسري').getByRole('button', { name: /أعد الدعوة/ })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'أعد الدعوة لمن لم يُسجَّل حضوره (2)' })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'resend-list');
    // لمدعو واحد: تخرج، ثم تصير ممسوكة بمهلتها
    await row('سارة العتيبي').getByRole('button', { name: 'أعد الدعوة إلى سارة العتيبي' }).click();
    await expect(page.getByText('أُرسلت دعوة واحدة.', { exact: true })).toBeVisible();
    await expect(row('سارة العتيبي').getByTestId('gs-held')).toBeVisible();
    expect(of(calls, 'admin.coaching-group-resend')[0]).toMatchObject({ id: 'g-new', participant_id: 'p-sara' });
    await shot(page, 'resend-one-held');
    // للكل: تأكيد يقول المهلة، ثم نتيجة الخادم بما خرج وما لم يُعد
    await card.getByRole('button', { name: 'أعد الدعوة لمن لم يُسجَّل حضوره (1)' }).click();
    const ask = page.locator('.mid-box').first();
    await expect(ask).toContainText('تُعاد الدعوة بموعدها وملف تقويمها إلى مدعو واحد لم يُسجَّل حضوره. من أُرسلت له قبل أقل من 60 دقيقة لا تُعاد له.');
    await ask.getByRole('button', { name: 'أعد الدعوة' }).click();
    await expect(page.getByText('أُرسلت دعوة واحدة، 1 بلا بريد (حساب اختبار). 3 لم تُعد دعوتهم: أُرسلت قبل أقل من 60 دقيقة أو تنتظر في الطابور.', { exact: true })).toBeVisible();
    expect(of(calls, 'admin.coaching-group-resend')[1].participant_id).toBeUndefined();
    // لم يبق من تُعاد له: زر «للكل» يختفي
    await expect(card.getByRole('button', { name: /أعد الدعوة لمن لم يُسجَّل حضوره/ })).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'resend-all-done');
  });
}

test('جلسة انتهت أو أُلغيت: لا «أضف مدعوين» ولا إعادة دعوة، ومن يقرأ فقط لا يرى زرًّا منهما', async ({ page }) => {
  const off = invitedGroup();
  Object.assign(off, { id: 'g-off', status: 'cancelled' });
  await setup(page, { srv: server({ groups: [ended(), off] }), to: 'activities' });
  const cards = page.getByTestId('group-card');
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'أضف مدعوين' })).toHaveCount(0);
  await cards.first().getByRole('button', { name: 'المدعوون (4)' }).click();
  await expect(page.getByRole('button', { name: /أعد الدعوة/ })).toHaveCount(0);
  await expect(page.getByTestId('gs-mail-line')).toHaveCount(0);
});
test('من يقرأ فقط يرى سطر بريد الدعوة، ولا يضيف ولا يعيد الإرسال', async ({ page }) => {
  await setup(page, { role: 'viewer', srv: server({ groups: [invitedGroup()] }), to: 'activities' });
  const card = page.getByTestId('group-card');
  await card.getByRole('button', { name: 'المدعوون (2)' }).click();
  await expect(card.getByTestId('gs-mail-line').first()).toContainText('آخر دعوة:');
  await expect(card.getByRole('button', { name: 'أضف مدعوين' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /أعد الدعوة/ })).toHaveCount(0);
  await expect(card.getByTestId('gs-held')).toHaveCount(0);
});
