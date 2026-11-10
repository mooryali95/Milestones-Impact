// ════════════════════════════════════════════════════════════════
// ملف التعريف: هوية المسار كما يراها المشارك وجهته وشهادته
// ════════════════════════════════════════════════════════════════
// المسارات الـ27 (M{m}I{i}L{l}) تبقى مفتاحًا داخليًا يشتق الأبواب والنماذج
// والأوزان. ما يُعرض هو ملف التعريف: محور الأولوية بمستواه فيه (9 ملفات في
// leaders.track_profiles، ونصوصها في supabase/content/tracks/v2). خطأ القراءة يرمي،
// فلا يُعرض عنوان المسار الداخلي مكان ملف التعريف بصمت.
import { db, must } from './core.ts';
import { profileKey, trackLevels } from './logic.js';

const COLS = 'key, priority_dimension, level, title_ar, title_en, summary_ar, journey_ar';

export async function profileFor(levels: Record<string, string>, priority: string | null) {
  const key = profileKey(levels, priority);
  if (!key) return null;
  return (must(await db.from('track_profiles').select(COLS).eq('key', key).maybeSingle()) as any) || null;
}

// عنوان العرض لكل مسار: عنوان ملف تعريفه، وإلا عنوان المسار
export async function displayTitles(): Promise<Record<string, { ar: string | null; en: string | null }>> {
  const [tracks, profiles] = await Promise.all([
    db.from('tracks').select('key, title_ar, title_en, priority_dimension'),
    db.from('track_profiles').select('key, title_ar, title_en'),
  ]);
  const byKey = Object.fromEntries(((must(profiles) as any[]) || []).map((p: any) => [p.key, p]));
  return Object.fromEntries(((must(tracks) as any[]) || []).map((t: any) => {
    const p = byKey[profileKey(trackLevels(t.key) || {}, t.priority_dimension) || ''];
    return [t.key, { ar: p?.title_ar || t.title_ar || null, en: p?.title_en || t.title_en || null }];
  }));
}
