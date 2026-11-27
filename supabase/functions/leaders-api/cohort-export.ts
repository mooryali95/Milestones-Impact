// ════════════════════════════════════════════════════════════════
// admin.cohort-export وcoord.cohort-export: خطة تصدير مبادرات الدفعة (تصور 2026-11-27، المرحلة 1)
// ════════════════════════════════════════════════════════════════
// يعيد مبادرات الدفعة المعتمدة بحقول الملخص، بلا بيانات تواصل، والتقسيم إلى مجلدات. المدير بكل أدوار اللوحة يرى الدفعة كلها،
// ومنسق الجهة يرى مشاركي جهته وحدهم ويُحصر من الخادم. كل طلب سطر cohort_export واحد في audit_log (اطلاع مسجَّل).
import { allFor, audit, db, Fail } from './core.ts';
import { cohortMemberIds } from './programs.ts';
import { CHARTER_KEY } from './capstone.js';
import { requireVisible, visibilityOfOrg } from './visibility.ts';
import { exportRows, volumesOf, withoutContact } from './cohort-export.js';
import type { Admin } from './admin.ts';

type Body = Record<string, any>;
type Actor = { kind: 'admin' | 'coordinator'; actor: string | null; orgId?: string | null };
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

async function load(ids: string[]) {
  if (!ids.length) return { people: [], capstones: [], charters: [] };
  const [people, capstones, charters] = await Promise.all([
    // counting-exempt: معرّفات أعضاء الدفعة من cohortMemberIds (listed) فالعد مطبق قبلها
    allFor(ids, () => db.from('participants').select('id, full_name, organization_id, organization_name').order('id'), 'id'),
    allFor(ids, () => db.from('capstones').select('participant_id, status, readiness, score, approved_at, sponsor_name').eq('status', 'approved').order('participant_id')),
    allFor(ids, () => db.from('model_submissions').select('participant_id, answers, learning_models!inner(key)').eq('learning_models.key', CHARTER_KEY).order('participant_id')),
  ]);
  return { people, capstones, charters } as any;
}

const DEPS = { members: cohortMemberIds, load, audit };

export async function cohortExport(who: Actor, b: Body, deps: any = DEPS) {
  if (!isUuid(b.cohort_id)) throw new Fail('حدد الدفعة', 400);
  if (who.kind === 'coordinator' && !who.orgId) throw new Fail('حسابك غير مرتبط بجهة', 403);
  const m = await deps.members(String(b.cohort_id));
  if (!m) throw new Fail('الدفعة غير موجودة', 404);
  const orgId = who.kind === 'coordinator' ? String(who.orgId) : null;
  const rows = withoutContact(exportRows({ ...(await deps.load(m.ids)), orgId }));
  const volumes = volumesOf(rows);
  await deps.audit(who.kind, who.actor, 'cohort_export', 'cohorts', m.cohort.id, null, {
    count: rows.length, scope: orgId ? 'organization' : 'cohort', organization_id: orgId, volumes: volumes.length, version: 'institutional', include: 'approved',
  });
  return { success: true, cohort: { id: m.cohort.id, name: m.cohort.name || null }, rows, volumes };
}

export function adminExport(a: Admin, b: Body) {
  return cohortExport({ kind: 'admin', actor: a.email }, b);
}

export async function coordExport(c: any, b: Body) {
  requireVisible(await visibilityOfOrg(c.organization_id), 'coord_initiatives');
  return cohortExport({ kind: 'coordinator', actor: c.email || null, orgId: c.organization_id || null }, b);
}
