// ════════════════════════════════════════════════════════════════
// الدفعة هي الوحدة الوحيدة (ترحيل 20261128160000): الإلحاق الآلي، ودفعة استقبال الجهة، وأداة إلحاق من لا دفعة له
// ════════════════════════════════════════════════════════════════
// الإلحاق ذري في القاعدة (place_participant): يقفل صف المشارك ثم صف الدفعة، فلا يُلحق أحد بدفعتين، ومن له دفعة لا يُنقل آليًا،
// والسعة تُحترم مع التزامن. الدفعة الممتلئة أو المغلقة تُبقي المشارك في المنصة العامة (الدفعة المفتوحة is_default) وتظهره في
// قائمة انتظار جهته. لا يرى المشارك خطأً أبدًا: تعذّر الإلحاق يُسجَّل ولا يمنع تسجيلًا ولا ربطًا. لا بريد ترحيب (قرار المالك لاحقًا).
// قبل الترحيل: الدالة غائبة فيُقرأ «لا إلحاق» ويبقى كل شيء كما كان.
import { all, allFor, audit, db, Fail, must, sha256Hex } from './core.ts';
import { missingColumn, missingTable } from './missing-column.ts';
import { listed } from './counting.ts';
import type { Admin } from './admin.ts';
import { cohortlessPlan, planHashInput, planSummary, waitingList } from './cohort-intake.js';

type Body = Record<string, any>;
type Source = 'link' | 'code' | 'platform' | 'manual';
const missingFn = (e: any) => !!e && ['PGRST202', '42883'].includes(String(e.code));
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));
const NOT_MIGRATED = () => new Fail('دفعات الاستقبال غير مفعّلة بعد: يلزم تطبيق ترحيل القاعدة', 409, 'not_migrated');

/** الإلحاق الذري. يعيد { cohort_id, outcome } (placed | overflow | already | demo | none)، أو null قبل الترحيل */
export async function placeParticipant(participantId: string, source: Source, wanted: string | null = null, actor: string | null = null) {
  const { data, error } = await db.rpc('place_participant', { p_participant: participantId, p_source: source, p_wanted: wanted, p_actor: actor });
  if (error) { if (missingFn(error)) return null; throw error; }
  const r = Array.isArray(data) ? data[0] : data;
  return r ? { cohort_id: (r.cohort_id || null) as string | null, outcome: String(r.outcome || 'none') } : null;
}

/** للتسجيل والربط: لا يرمي أبدًا (المشارك لا يرى خطأ الإلحاق)، وتعذّره سطر في السجل تلتقطه أداة الإلحاق لاحقًا */
export async function placeQuietly(participantId: string, source: Source, wanted: string | null = null) {
  try {
    return await placeParticipant(participantId, source, wanted);
  } catch (e) {
    console.error('place participant:', e);
    await audit('system', participantId, 'cohort.place-failed', 'participants', participantId, null, { source, wanted, error: String((e as Error)?.message || e) }).catch(() => {});
    return null;
  }
}

// ── الإدارة: دفعة استقبال الجهة وقائمة انتظارها ──
export async function adminOrgIntake(b: Body) {
  const orgId = String(b.org_id || b.organization_id || '').trim();
  if (!isUuid(orgId)) throw new Fail('اختر الجهة');
  const { data: cohorts, error } = await db.from('cohorts').select('*').eq('organization_id', orgId);
  if (error) throw error;
  const own = (cohorts || []) as any[];
  const ready = await intakeReady();
  const intake = own.find((c) => c.is_intake) || null;
  const members = (await all((f, t) => listed(db.from('participants').select('id, full_name, email, organization_id, is_demo')).eq('organization_id', orgId).order('id').range(f, t))) as any[];
  const ids = members.map((m) => m.id);
  const enrollments = ids.length ? await allFor(ids, () => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('id')) : [];
  const otherIds = [...new Set(enrollments.map((e: any) => e.cohort_id))].filter((id) => !own.some((c) => c.id === id));
  const others = otherIds.length ? must(await db.from('cohorts').select('id, name, organization_id, is_default').in('id', otherIds)) as any[] : [];
  // سبب البقاء في المنصة العامة من سجل الإلحاق (لا جدول قبل الترحيل: بلا سبب)
  let placements: any[] = [];
  if (ids.length) {
    const pr = await db.from('cohort_placements').select('participant_id, reason, created_at').eq('organization_id', orgId).eq('outcome', 'overflow').order('created_at');
    if (pr.error && !missingTable(pr.error) && !missingColumn(pr.error)) must(pr);
    placements = (pr.data || []) as any[];
  }
  const waiting = waitingList({ members, enrollments, cohorts: [...own, ...others], placements }, orgId);
  const members_in = intake ? enrollments.filter((e: any) => e.cohort_id === intake.id && e.status !== 'withdrawn').length : 0;
  return {
    success: true, ready,
    intake: intake ? { id: intake.id, name: intake.name, status: intake.status, capacity: intake.capacity ?? null, program_version_id: intake.program_version_id || null, members: members_in } : null,
    cohorts: own.filter((c) => c.status !== 'closed').map((c) => ({ id: c.id, name: c.name, status: c.status, capacity: c.capacity ?? null, is_intake: !!c.is_intake })),
    waiting,
  };
}

// العمود موجود ولو لم تكن للجهة دفعة بعد: سؤال صغير على cohorts
async function intakeReady() {
  const r = await db.from('cohorts').select('is_intake').limit(1);
  if (r.error && (missingColumn(r.error) || missingTable(r.error))) return false;
  must(r);
  return true;
}

// ── أداة إلحاق من لا دفعة له (معاينة ثم تطبيق ببصمة الخطة) ──
// المعاينة لا تكتب شيئًا. التطبيق يعيد حساب الخطة ويرفض إن تغيّرت بصمتها عما عاينه المدير (stale)، ثم يلحق كل مشارك
// بالدالة الذرية نفسها (المصدر manual)، فمن صار له دفعة في الأثناء لا يُنقل
async function planNow() {
  const [participants, enrollments, cohorts, orgs] = await Promise.all([
    all((f, t) => listed(db.from('participants').select('id, full_name, organization_id, is_demo')).order('id').range(f, t)),
    all((f, t) => db.from('enrollments').select('participant_id, status').order('id').range(f, t)),
    all((f, t) => db.from('cohorts').select('*').order('id').range(f, t)),
    all((f, t) => db.from('organizations').select('id, name').order('id').range(f, t)),
  ]);
  const rows = cohortlessPlan({ participants, enrollments, cohorts, orgs });
  return { rows, hash: await sha256Hex(planHashInput(rows)) };
}

export async function cohortlessPlanView(_a: Admin, _b: Body) {
  if (!(await intakeReady())) throw NOT_MIGRATED();
  const { rows, hash } = await planNow();
  return { success: true, plan_hash: hash, count: rows.length, summary: planSummary(rows), rows: rows.slice(0, 500) };
}

export async function cohortlessApply(a: Admin, b: Body) {
  if (!(await intakeReady())) throw NOT_MIGRATED();
  const { rows, hash } = await planNow();
  if (!b.plan_hash || String(b.plan_hash) !== hash) {
    throw new Fail('تغيّر من لا دفعة له منذ المعاينة. أعد المعاينة ثم طبّق.', 409, 'stale', { plan_hash: hash, count: rows.length });
  }
  const outcomes: Record<string, number> = {};
  for (const r of rows) {
    const got = await placeParticipant(r.participant_id, 'manual', null, a.email);
    const k = got?.outcome || 'none';
    outcomes[k] = (outcomes[k] || 0) + 1;
  }
  await audit('admin', a.email, 'cohort.cohortless-apply', 'cohorts', null, null, { plan_hash: hash, count: rows.length, outcomes });
  return { success: true, count: rows.length, outcomes };
}
