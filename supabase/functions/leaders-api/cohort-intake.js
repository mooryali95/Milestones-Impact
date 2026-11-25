// ════════════════════════════════════════════════════════════════
// الدفعة هي الوحدة الوحيدة (ترحيل 20261128160000): منطق خالص مشترك بين الخادم (cohort-intake.ts) ولوحة الإدارة
// ════════════════════════════════════════════════════════════════
// لكل جهة دفعة استقبال واحدة (cohorts.is_intake)، ولمن لا جهة له «المنصة العامة» وهي الدفعة المفتوحة القائمة (is_default).
// الإلحاق نفسه ذري في القاعدة (place_participant)، وهنا ما يُحسب بلا قاعدة: مصدر الإلحاق، ومن لا دفعة له وإلى أين يُلحق
// (معاينة أداة الإلحاق)، وبصمة الخطة، وقائمة انتظار الجهة.

export const PLACEMENT_SOURCES = ['link', 'code', 'platform', 'manual'];
export const PLACEMENT_SOURCE_AR = { link: 'رابط الجهة', code: 'رمز رعاية', platform: 'المنصة العامة', manual: 'الإدارة' };
export const INTAKE_SUFFIX_AR = 'الاستقبال';
export const PLATFORM_NAME_AR = 'المنصة العامة';

/** مصدر الإلحاق عند التسجيل أو الربط: رمز رعاية، أو جهة بلا رمز (رابطها أو نطاق بريدها)، أو المنصة العامة */
export function placementSource({ organization_id = null, sponsor_code = null } = {}) {
  if (!organization_id) return 'platform';
  return sponsor_code ? 'code' : 'link';
}

const active = (e) => e && e.status !== 'withdrawn';

/** المعرّفات التي لها إلحاق قائم (غير منسحب) @param {{ participant_id: string, status?: string }[]} enrollments */
export function enrolledIds(enrollments = []) {
  return new Set((enrollments || []).filter(active).map((e) => e.participant_id));
}

/**
 * خطة إلحاق من لا دفعة له: لكل مشارك حقيقي بلا إلحاق قائم دفعته المستهدفة، استقبال جهته أو المنصة العامة.
 * target_id null: الدفعة تُنشأ عند التطبيق (لا استقبال للجهة بعد، أو لا منصة عامة)، ويُسمّى ما سيُنشأ.
 * @param {{ participants?: any[], enrollments?: any[], cohorts?: any[], orgs?: any[] }} world
 */
export function cohortlessPlan({ participants = [], enrollments = [], cohorts = [], orgs = [] } = {}) {
  const has = enrolledIds(enrollments);
  const intake = new Map((cohorts || []).filter((c) => c.is_intake && c.organization_id).map((c) => [c.organization_id, c]));
  const platform = (cohorts || []).find((c) => c.is_default) || null;
  const orgName = new Map((orgs || []).map((o) => [o.id, o.name || '']));
  return (participants || [])
    .filter((p) => p && !p.is_demo && !has.has(p.id))
    .map((p) => {
      if (p.organization_id) {
        const c = intake.get(p.organization_id);
        const name = orgName.get(p.organization_id) || '';
        return { participant_id: p.id, full_name: p.full_name || '', organization_id: p.organization_id, organization: name,
          kind: 'intake', target_id: c?.id || null, target: c?.name || `${name} · ${INTAKE_SUFFIX_AR}`, creates: !c };
      }
      return { participant_id: p.id, full_name: p.full_name || '', organization_id: null, organization: '',
        kind: 'platform', target_id: platform?.id || null, target: platform?.name || PLATFORM_NAME_AR, creates: !platform };
    })
    .sort((a, b) => String(a.participant_id).localeCompare(String(b.participant_id)));
}

/** نص البصمة: سطر لكل مشارك بدفعته المستهدفة، بترتيب ثابت، فأي تغيّر في من لا دفعة له أو في وجهته يغيّرها */
export const planHashInput = (rows = []) => (rows || [])
  .map((r) => `${r.participant_id}:${r.kind}:${r.target_id || `new:${r.organization_id || 'platform'}`}`)
  .sort().join('\n');

/** ملخص الخطة لكل دفعة مستهدفة */
export function planSummary(rows = []) {
  const by = new Map();
  for (const r of rows || []) {
    const k = r.target_id || `new:${r.organization_id || 'platform'}`;
    if (!by.has(k)) by.set(k, { target_id: r.target_id, target: r.target, kind: r.kind, creates: r.creates, organization: r.organization, count: 0 });
    by.get(k).count += 1;
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

/**
 * قائمة انتظار الجهة: أعضاؤها الذين إلحاقهم القائم في دفعة ليست للجهة (بقوا في المنصة العامة لأن دفعتها امتلأت أو أُغلقت،
 * أو سجّلوا بلا رمز ثم ربطتهم جهتهم، فلا يُنقلون آليًا). النقل منها بـ«نقل إلى دفعة» في ملف المشارك.
 * @param {{ members?: any[], enrollments?: any[], cohorts?: any[] }} world @param {string} orgId
 */
export function waitingList({ members = [], enrollments = [], cohorts = [] } = {}, orgId) {
  const byId = new Map((cohorts || []).map((c) => [c.id, c]));
  const current = new Map();
  for (const e of [...(enrollments || [])].filter(active).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))) {
    if (!current.has(e.participant_id)) current.set(e.participant_id, e);
  }
  return (members || []).filter((p) => p && !p.is_demo && p.organization_id === orgId).map((p) => {
    const e = current.get(p.id);
    const c = e ? byId.get(e.cohort_id) : null;
    return { p, c, e };
  }).filter(({ c }) => c && c.organization_id !== orgId)
    .map(({ p, c, e }) => ({ participant_id: p.id, full_name: p.full_name || '', email: p.email || '', cohort_id: c.id, cohort: c.name || '', since: e.created_at || null }));
}
