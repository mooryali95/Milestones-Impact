// ════════════════════════════════════════════════════════════════
// فريق الدفعة والجهة: نقطة واحدة للمستشار والفريق وخبراء المجموعات
// ════════════════════════════════════════════════════════════════
// تصور ربط الخبراء والمجموعات بالجهة v1، الخيار ج، باعتماد المالك 2026-11-11 (المرحلتان 1 و2، بلا ترحيل).
// الدفعة نقطة الربط الوحيدة. لا جدول جديد ولا مصدر رابع: يُقرأ ويُكتب في المصادر القائمة نفسها
//   cohorts.advisor_expert_id        المستشار الأساسي (مصدر الصلاحية: advisor.ts)
//   cohort_experts                   فريق الدفعة (يُعرض على مشاركيها أولًا، بلا صلاحية تقييم)
//   cohort_groups.advisor_expert_id  خبير المجموعة (الأخص يغلب)
// «فريق الجهة» عرض مجمّع لفرق دفعاتها، لا تكليف على مستوى الجهة.
// الحمل تنبيه لا منع (قرار المالك): capacityOf نفسه الذي يُخرج الممتلئ من الترشيح الآلي.
// دور التكليف وتواريخه وقبول الخبير في المرحلة 3 بترحيلها؛ هنا الدور من أدوار ملفه، والمدة مدة الدفعة.
import { type AssignmentMail, audit, db, Fail, must, sendMail, teamAssignedMail } from './core.ts';
import { cohortMembers } from './programs.ts';
import { adminSave as expertCreate } from './experts.ts';
import { firstName } from './hall.js';
import { assignmentScopeAr, capacityOf, cohortPeriodAr, expertAssignments, servedBy, TEAM_MAX, TEAM_SCOPES, teamCoverage, teamRows } from './logic.js';
import { EXPERT_ROLE_AR } from './labels.js';

type Body = Record<string, any>;
type Admin = import('./admin.ts').Admin;

const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));
const APPROVED = ['active', 'paused'];
const roleAr = (r: string) => (EXPERT_ROLE_AR as Record<string, string[]>)[r]?.[0] || r;
const EXPERT_COLS = 'id, full_name, title, status, roles, dimensions, levels, weekly_hours';

// حمل كل خبير: ساعاته (طلبات قائمة وجلسات قادمة، بالقاعدة نفسها في الترشيح)، وعدد الدفعات غير المغلقة التي يحمل فيها تكليفًا
async function loads() {
  const now = new Date().toISOString();
  const [reqs, upcoming, open, team, groups] = await Promise.all([
    db.from('expert_requests').select('expert_id').in('status', ['offered', 'accepted']).not('expert_id', 'is', null),
    db.from('coaching_sessions').select('expert_id').eq('status', 'booked').gte('starts_at', now).not('expert_id', 'is', null),
    db.from('cohorts').select('id, advisor_expert_id').neq('status', 'closed'),
    db.from('cohort_experts').select('cohort_id, expert_id'),
    db.from('cohort_groups').select('cohort_id, advisor_expert_id').not('advisor_expert_id', 'is', null),
  ]);
  const msg = 'تعذّر قراءة حمل الخبراء الآن، حاول بعد قليل';
  const tally = (rows: any[]) => { const m: Record<string, number> = {}; for (const x of rows || []) m[x.expert_id] = (m[x.expert_id] || 0) + 1; return m; };
  const r = tally(must(reqs, msg) as any[]), u = tally(must(upcoming, msg) as any[]);
  const live = new Set(((must(open, msg) as any[]) || []).map((c) => c.id));
  const cohortsOf: Record<string, Set<string>> = {};
  const add = (e: string | null, c: string) => { if (e && live.has(c)) (cohortsOf[e] ||= new Set()).add(c); };
  for (const c of (must(open, msg) as any[]) || []) add(c.advisor_expert_id, c.id);
  for (const t of (must(team, msg) as any[]) || []) add(t.expert_id, t.cohort_id);
  for (const g of (must(groups, msg) as any[]) || []) add(g.advisor_expert_id, g.cohort_id);
  return (e: any) => {
    const cap = capacityOf({ weekly_hours: e.weekly_hours, load: { requests: r[e.id] || 0, upcoming: u[e.id] || 0 } });
    return { ...cap, cohorts: cohortsOf[e.id]?.size || 0 };
  };
}

async function cohortById(id: unknown) {
  const c = must(await db.from('cohorts').select('*').eq('id', String(id || '')).maybeSingle(), 'تعذّر قراءة الدفعة الآن');
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  return c as any;
}

// كل ما يلزم لفريق دفعة واحدة، مقروءًا مرة: أعضاؤها بمجموعاتهم، والمجموعات، وصفوف الفريق
async function cohortState(c: any) {
  const msg = 'تعذّر قراءة فريق الدفعة الآن، حاول بعد قليل';
  const [members, groups, links, team] = await Promise.all([
    cohortMembers(c),
    db.from('cohort_groups').select('*').eq('cohort_id', c.id).order('sort').then((r: any) => must(r, msg) as any[]),
    db.from('cohort_group_members').select('participant_id, group_id').eq('cohort_id', c.id).then((r: any) => must(r, msg) as any[]),
    db.from('cohort_experts').select('expert_id, added_by, created_at').eq('cohort_id', c.id).then((r: any) => must(r, msg) as any[]),
  ]);
  const gOf = new Map((links || []).map((l: any) => [l.participant_id, l.group_id]));
  return { members: members.map((m: any) => ({ ...m, group_id: gOf.get(m.id) || null })), groups: groups || [], team: team || [] };
}

// ── الإدارة: تبويب «الفريق» في الدفعة ──
export async function cohortTeam(b: Body) {
  const c = await cohortById(b.cohort_id);
  const [st, experts, loadOf, org] = await Promise.all([
    cohortState(c),
    db.from('experts').select(EXPERT_COLS).order('full_name').then((r: any) => must(r, 'تعذّر قراءة الخبراء الآن') as any[]),
    loads(),
    c.organization_id ? db.from('organizations').select('name').eq('id', c.organization_id).maybeSingle().then((r: any) => r.data) : Promise.resolve(null),
  ]);
  const byId = new Map((experts || []).map((e: any) => [e.id, e]));
  const approved = (experts || []).filter((e: any) => APPROVED.includes(e.status)).map((e: any) => e.id);
  const served = servedBy(c, st.members, st.groups, approved);
  const rows = teamRows(c, st.team, st.groups).filter((r) => byId.has(r.expert_id));
  const inTeam = new Set(rows.map((r) => r.expert_id));
  const view = (e: any) => ({ id: e.id, full_name: e.full_name, title: e.title || null, status: e.status, roles: e.roles || [], dimensions: e.dimensions || [], levels: e.levels || [], load: loadOf(e) });
  return {
    success: true, team_max: TEAM_MAX,
    cohort: { id: c.id, name: c.name, status: c.status, starts_on: c.starts_on || null, ends_on: c.ends_on || null, organization_id: c.organization_id || null, org_name: org?.name || null,
      advisor_expert_id: c.advisor_expert_id || null, is_default: !!c.is_default },
    rows: rows.map((r) => ({ ...r, expert: view(byId.get(r.expert_id)), serves_here: served[r.expert_id] || 0 })),
    groups: st.groups.map((g: any) => ({ id: g.id, name: g.name, advisor_expert_id: g.advisor_expert_id || null, count: st.members.filter((m: any) => m.group_id === g.id).length })),
    coverage: teamCoverage(c, st.members, st.groups, approved),
    // للبحث في «أضف إلى الفريق»: المعتمدون، ومن في الفريق معلَّم
    experts: (experts || []).filter((e: any) => APPROVED.includes(e.status)).map((e: any) => ({ ...view(e), in_team: inTeam.has(e.id) })),
  };
}

// ── الإدارة: قسم «الفريق والمجموعات» في صفحة الجهة: ملخص لكل دفعة من دفعاتها ──
export async function orgTeam(b: Body) {
  if (!isUuid(b.organization_id)) throw new Fail('الجهة غير معروفة', 400);
  const msg = 'تعذّر قراءة فريق الجهة الآن، حاول بعد قليل';
  const cohorts = must(await db.from('cohorts').select('*').eq('organization_id', b.organization_id).order('created_at', { ascending: false }), msg) as any[];
  if (!cohorts?.length) return { success: true, cohorts: [] };
  const experts = must(await db.from('experts').select(EXPERT_COLS), msg) as any[];
  const byId = new Map((experts || []).map((e: any) => [e.id, e]));
  const approved = (experts || []).filter((e: any) => APPROVED.includes(e.status)).map((e: any) => e.id);
  const out = [];
  for (const c of cohorts) {
    const st = await cohortState(c);
    const rows = teamRows(c, st.team, st.groups).filter((r) => byId.has(r.expert_id));
    const roles: Record<string, number> = {};
    for (const r of rows) for (const k of byId.get(r.expert_id).roles || []) roles[k] = (roles[k] || 0) + 1;
    const adv = c.advisor_expert_id ? byId.get(c.advisor_expert_id) : null;
    out.push({
      id: c.id, name: c.name, status: c.status, starts_on: c.starts_on || null, ends_on: c.ends_on || null,
      advisor: adv ? { id: adv.id, full_name: adv.full_name, status: adv.status } : null,
      team: rows.length, roles, not_approved: rows.filter((r) => !APPROVED.includes(byId.get(r.expert_id).status)).length,
      coverage: teamCoverage(c, st.members, st.groups, approved),
    });
  }
  return { success: true, cohorts: out };
}

// ── الإدارة: «أضف إلى الفريق»: خبير معتمد بالبحث، أو شخص جديد يُدعى ويُضاف في خطوة واحدة ──
// النطاق: الفريق، أو خبير مجموعة بعينها، أو المستشار الأساسي. والعضوية في الفريق تُضمن في الحالات الثلاث
export async function teamAdd(a: Admin, b: Body) {
  const c = await cohortById(b.cohort_id);
  if (c.is_default) throw new Fail('الدفعة المفتوحة بلا فريق خاص؛ يُرشَّح لمشاركيها من الشبكة كلها');
  const role = String(b.role || '');
  if (!(EXPERT_ROLE_AR as Record<string, unknown>)[role]) throw new Fail('اختر دور الخبير في هذه الدفعة');
  const scope = TEAM_SCOPES.includes(b.scope) ? String(b.scope) : 'cohort';
  let group: any = null;
  if (scope === 'group') {
    if (!isUuid(b.group_id)) throw new Fail('اختر المجموعة');
    group = must(await db.from('cohort_groups').select('id, name, advisor_expert_id').eq('id', b.group_id).eq('cohort_id', c.id).maybeSingle());
    if (!group) throw new Fail('المجموعة لا تخص هذه الدفعة');
  }
  const current = (must(await db.from('cohort_experts').select('expert_id').eq('cohort_id', c.id)) as any[]) || [];
  const invite = b.invite && typeof b.invite === 'object' ? b.invite : null;
  let e: any;
  if (invite) {
    // المدعو لم يُعتمد بعد، فلا يحمل صلاحية: يدخل الفريق، ويُعيَّن مستشارًا أو خبير مجموعة بعد اعتماد ملفه
    if (scope !== 'cohort') throw new Fail('المدعو الجديد يُضاف إلى الفريق أولًا، ويُعيَّن مستشارًا أو خبير مجموعة بعد اعتماد ملفه');
    if (current.length >= TEAM_MAX) throw new Fail(`فريق الدفعة ${TEAM_MAX} خبيرًا على الأكثر`);
    const extra = Array.isArray(invite.roles) ? invite.roles.map(String) : [];
    // دوره في الدفعة أول أدوار ملفه، والدعوة رسالة واحدة تجمع الدعوة والتكليف
    const r: any = await expertCreate(a, { full_name: invite.full_name, email: invite.email, title: invite.title, roles: [...new Set([role, ...extra])], send_invite: true },
      { assignment: await mailOf(c, role, { advisor: false, groups: [] }) });
    e = r.expert;
  } else {
    if (!isUuid(b.expert_id)) throw new Fail('اختر الخبير، أو ادعُ شخصًا جديدًا ببريده');
    e = must(await db.from('experts').select(EXPERT_COLS + ', email').eq('id', b.expert_id).maybeSingle());
    if (!e) throw new Fail('الخبير غير موجود', 404);
    if (!APPROVED.includes(e.status)) throw new Fail(`${e.full_name} لم يُعتمد بعد. اعتمد ملفه من «الخبراء» ثم أضفه`);
    if (!(e.roles || []).includes(role)) throw new Fail(`ليس في ملف ${e.full_name} دور «${roleAr(role)}». اختر من أدواره، أو أضف الدور إلى ملفه من «الخبراء»`);
    if (!current.some((x) => x.expert_id === e.id) && current.length >= TEAM_MAX) throw new Fail(`فريق الدفعة ${TEAM_MAX} خبيرًا على الأكثر`);
  }
  must(await db.from('cohort_experts').upsert({ cohort_id: c.id, expert_id: e.id, added_by: a.email }, { onConflict: 'cohort_id,expert_id', ignoreDuplicates: true }), 'تعذّر الإضافة إلى الفريق');
  const now = new Date().toISOString();
  if (scope === 'advisor') must(await db.from('cohorts').update({ advisor_expert_id: e.id, updated_at: now }).eq('id', c.id), 'تعذّر تعيين المستشار');
  if (scope === 'group') must(await db.from('cohort_groups').update({ advisor_expert_id: e.id }).eq('id', group.id).eq('cohort_id', c.id), 'تعذّر تعيين خبير المجموعة');
  await audit('admin', a.email, 'team.add', 'cohorts', c.id, scope === 'advisor' ? { advisor_expert_id: c.advisor_expert_id || null } : scope === 'group' ? { group: group.id, advisor_expert_id: group.advisor_expert_id || null } : null,
    { expert_id: e.id, role, scope, group: group?.id || null, invited: !!invite });
  // إعلام الخبير القائم بتكليف جديد عليه (المرحلة 2)، مرة لكل تغيير فعلي: إعادة الإضافة بالنطاق نفسه لا ترسل شيئًا.
  // تعذّر البريد لا يُسقط التكليف المحفوظ، ويُقال للمدير
  let notified: boolean | null = null;   // null: لا تكليف جديد فلا بريد
  const isNew = scope === 'cohort' ? !current.some((x) => x.expert_id === e.id) : scope === 'advisor' ? c.advisor_expert_id !== e.id : group.advisor_expert_id !== e.id;
  if (!invite && isNew) {
    const m = await mailOf(c, role, { advisor: scope === 'advisor', groups: group ? [group] : [] });
    notified = await sendMail(e.email, `كُلّفت في فريق ${c.name}`, teamAssignedMail(firstName(e.full_name), m), [], { ref: `cohort:${c.id}` })
      .then(() => true, (err) => { console.error('team.add mail', err); return false; });
  }
  const load = invite ? null : (await loads())(e);
  return { success: true, expert_id: e.id, invited: !!invite, notified, load, over: !!load?.full };
}

async function orgName(id: string | null) {
  if (!id) return null;
  return (await db.from('organizations').select('name').eq('id', id).maybeSingle()).data?.name || null;
}
// سطور التكليف في البريد: الدفعة وجهتها، والدور من أدوار ملفه، وما يحمله فيها، ومدتها
async function mailOf(c: any, role: string, scope: { advisor: boolean; groups: { name: string }[] }): Promise<AssignmentMail> {
  return { cohort: c.name, org: await orgName(c.organization_id), role: roleAr(role), scope: assignmentScopeAr(scope), period: cohortPeriodAr(c) };
}

// إزالة خبير من فريق الدفعة: ومعها ما يحمله فيها (المستشار الأساسي، خبير مجموعاتها)، فيعود المشاركون للمستوى الأعم ثم للإدارة
export async function teamRemove(a: Admin, b: Body) {
  const c = await cohortById(b.cohort_id);
  if (!isUuid(b.expert_id)) throw new Fail('اختر الخبير');
  const id = String(b.expert_id);
  const groups = (must(await db.from('cohort_groups').select('id').eq('cohort_id', c.id).eq('advisor_expert_id', id)) as any[]) || [];
  must(await db.from('cohort_experts').delete().eq('cohort_id', c.id).eq('expert_id', id), 'تعذّرت الإزالة من الفريق');
  if (c.advisor_expert_id === id) must(await db.from('cohorts').update({ advisor_expert_id: null, updated_at: new Date().toISOString() }).eq('id', c.id), 'تعذّرت إزالة المستشار');
  if (groups.length) must(await db.from('cohort_groups').update({ advisor_expert_id: null }).in('id', groups.map((g) => g.id)), 'تعذّرت إزالة خبير المجموعة');
  await audit('admin', a.email, 'team.remove', 'cohorts', c.id, { expert_id: id, advisor: c.advisor_expert_id === id, groups: groups.map((g) => g.id) }, null);
  return { success: true, cleared: { advisor: c.advisor_expert_id === id, groups: groups.length } };
}

// ── تكليفات خبير: للإدارة في ملفه، وللخبير في «تكليفاتي» ──
// withCounts: عدد مشاركي كل دفعة غير مغلقة، ومن يخدمهم هو بصفته مستشارهم الفعلي. أعداد لا أسماء:
// أسماء مشاركيه في «مشاركوك» من مصدر صلاحيتها (myParticipantIds) كما هي
export async function assignmentsOf(expertId: string, { withCounts = false } = {}) {
  const msg = 'تعذّر قراءة التكليفات الآن، حاول بعد قليل';
  const [adv, team, groups] = await Promise.all([
    db.from('cohorts').select('id').eq('advisor_expert_id', expertId).then((r: any) => must(r, msg) as any[]),
    db.from('cohort_experts').select('cohort_id, expert_id').eq('expert_id', expertId).then((r: any) => must(r, msg) as any[]),
    db.from('cohort_groups').select('id, cohort_id, name, advisor_expert_id').eq('advisor_expert_id', expertId).then((r: any) => must(r, msg) as any[]),
  ]);
  const ids = [...new Set([...(adv || []).map((x) => x.id), ...(team || []).map((x) => x.cohort_id), ...(groups || []).map((x) => x.cohort_id)])];
  if (!ids.length) return [];
  const cohorts = must(await db.from('cohorts').select('*').in('id', ids), msg) as any[];
  const orgIds = [...new Set((cohorts || []).map((c) => c.organization_id).filter(Boolean))];
  const orgs = orgIds.length ? (must(await db.from('organizations').select('id, name').in('id', orgIds), msg) as any[]) : [];
  const orgOf = new Map((orgs || []).map((o) => [o.id, o.name]));
  const list = expertAssignments(expertId, cohorts, team, groups).map((x: any) => ({ ...x, org: orgOf.get(x.organization_id) || null }));
  if (!withCounts) return list;
  const byId = new Map((cohorts || []).map((c) => [c.id, c]));
  const out = [];
  for (const x of list) {
    if (x.status === 'closed') { out.push(x); continue; }
    const c = byId.get(x.cohort_id);
    const st = await cohortState(c);
    const ids2 = [...new Set([c.advisor_expert_id, ...st.groups.map((g: any) => g.advisor_expert_id)].filter(Boolean))];
    const ok = ids2.length ? ((must(await db.from('experts').select('id, status').in('id', ids2), msg) as any[]) || []).filter((e) => APPROVED.includes(e.status)).map((e) => e.id) : [];
    out.push({ ...x, participants: st.members.length, serves: servedBy(c, st.members, st.groups, ok)[expertId] || 0,
      groups: x.groups.map((g: any) => ({ ...g, count: st.members.filter((m: any) => m.group_id === g.id).length })) });
  }
  return out;
}
