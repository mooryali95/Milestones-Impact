// ════════════════════════════════════════════════════════════════
// الرؤية النافذة لمشارك أو دفعة: الإعداد العام ثم استثناء الدفعة (القراءة من القاعدة)
// ════════════════════════════════════════════════════════════════
// كل موضع يحجب أو يفتح شيئًا لمستشار أو خبير يسأل هنا، ولا يكتب شرطه بنفسه (visibility.js resolveVisibility).
import { audit, db, Fail } from './core.ts';
import type { Admin } from './admin.ts';
import { appSettings } from './settings.ts';
import { cohortOf } from './programs.ts';
import { cleanVisibility, resolveVisibility, VISIBILITY, VISIBILITY_KEYS, visibilityLabel, widened, AUDIENCE_AR } from './visibility.js';

export type Vis = Record<string, boolean>;

/** رؤية دفعة بمعرّفها. غياب العمود قبل ترحيله أو تعذّر القراءة يعيد الافتراضي العام، لا خطأ */
export async function visibilityOfCohort(cohortId: string | null | undefined): Promise<Vis> {
  const settings: any = (await appSettings().catch(() => null))?.visibility || null;
  if (!cohortId) return resolveVisibility(settings, null);
  const { data, error } = await db.from('cohorts').select('visibility').eq('id', cohortId).maybeSingle();
  return resolveVisibility(settings, error ? null : (data as any)?.visibility || null);
}

/** رؤية مشارك: من دفعته الفعلية (cohortOf نفسها التي تحكم رحلته) */
export async function visibilityOfParticipant(participantId: string): Promise<Vis> {
  const { data: p } = await db.from('participants').select('id, organization_id').eq('id', participantId).maybeSingle();
  const { cohort } = p ? await cohortOf(p).catch(() => ({ cohort: null })) as any : { cohort: null };
  return visibilityOfCohort(cohort?.id || null);
}

/** يرفض الفعل إن كان مفتاحه محجوبًا، برسالة تسمّيه */
export function requireVisible(vis: Vis, key: string) {
  if (vis[key] === false) throw new Fail(`هذه الصلاحية محجوبة بإعداد الرؤية: ${visibilityLabel(key)}`, 403, 'visibility');
}

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

// ── للإدارة: رؤية دفعة (العام، واستثناؤها، والنافذ)، وحفظ استثنائها ──
export async function adminCohortGet(_a: Admin, b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('بيانات ناقصة');
  const settings: any = (await appSettings().catch(() => null))?.visibility || null;
  const { data, error } = await db.from('cohorts').select('id, name, visibility').eq('id', String(b.cohort_id)).maybeSingle();
  // قبل ترحيل العمود: يُعرض الافتراضي العام، ويُقال إن الاستثناء غير متاح بعد
  const row: any = error ? (await db.from('cohorts').select('id, name').eq('id', String(b.cohort_id)).maybeSingle()).data : data;
  if (!row) throw new Fail('الدفعة غير موجودة', 404);
  const override = cleanVisibility(row.visibility) as Record<string, boolean>;
  const general: Record<string, boolean> = resolveVisibility(settings, null);
  const DEF = VISIBILITY as Record<string, { audience: string; label_ar: string; hint_ar: string }>;
  return {
    success: true, ready: !error, cohort: { id: row.id, name: row.name },
    keys: VISIBILITY_KEYS.map((k: string) => ({ key: k, audience: DEF[k].audience, audience_ar: (AUDIENCE_AR as Record<string, string>)[DEF[k].audience], label: DEF[k].label_ar, hint: DEF[k].hint_ar,
      general: general[k], override: k in override ? override[k] : null, effective: k in override ? override[k] : general[k] })),
  };
}

export async function adminCohortSave(a: Admin, b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('بيانات ناقصة');
  const next = cleanVisibility(b.visibility);
  const { data: before, error } = await db.from('cohorts').select('id, visibility').eq('id', String(b.cohort_id)).maybeSingle();
  if (error) throw new Fail('استثناءات الدفعة تُحفظ بعد تطبيق ترحيلها. الإعداد العام يعمل من «الإعدادات العامة»', 503, 'not_ready');
  if (!before) throw new Fail('الدفعة غير موجودة', 404);
  const settings: any = (await appSettings().catch(() => null))?.visibility || null;
  const was = resolveVisibility(settings, (before as any).visibility), now = resolveVisibility(settings, next);
  const up = await db.from('cohorts').update({ visibility: next, updated_at: new Date().toISOString() }).eq('id', before.id);
  if (up.error) throw new Fail('تعذّر حفظ استثناءات الرؤية', 500, 'db_error');
  // كل تغيير يُسجَّل بما كان وما صار، وما وُسّع يُسمّى صراحة
  await audit('admin', a.email, 'cohort.visibility', 'cohorts', before.id, cleanVisibility((before as any).visibility), { visibility: next, widened: widened(was, now) });
  return { success: true, widened: widened(was, now).map((k: string) => visibilityLabel(k)) };
}
