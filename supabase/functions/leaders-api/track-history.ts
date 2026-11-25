// ════════════════════════════════════════════════════════════════
// سجل المسار و«جديد في مستواك» على القاعدة (ترحيل 20261129120000، بطاقة المسار المرحلة 3)
// ════════════════════════════════════════════════════════════════
// الكتابة عند اعتماد المستشار مستويات تغيّر المسار (admin.ts approveOne)، والقراءة للرحلة والوثيقة والكتاب وملف المستشار.
// غياب الجدولين قبل الترحيل لا يُسقط شيئًا: الكتابة تُسجَّل خطأً، والقراءة تعيد قوائم فارغة.
import { db, sendMail } from './core.ts';
import { trackKey } from './logic.js';
import { trackManifest } from './track-manifest.js';
import { diffSummary, evolutionLine, newItemRows, upgradeDiff, upgradeMessage } from './track-upgrade.js';

// deno-lint-ignore no-explicit-any
type Row = any;
type Levels = Record<string, string>;

/** يسجل تغيّر المسار وما أضافه، ويُعلم المشارك في مركز رسائله. لا يرمي: الاعتماد قائم وإن تعذّر التسجيل */
export async function recordTrackChange(p: Row, from: Levels | null, to: Levels, actor: string | null, priority: { from?: string | null; to?: string | null } = {}) {
  const fromKey = from ? trackKey(from) : null;
  const toKey = trackKey(to);
  if (!toKey || fromKey === toKey) return null;
  try {
    let diff = { handbook: [] as string[], chapters: [] as string[], fields: [] as string[] };
    let line: string | null = null;
    // أول اعتماد: لا «جديد» (كل شيء جديد)، والسجل يبدأ بالمسار الأول
    if (fromKey) {
      const [mods, models] = await Promise.all([
        db.from('handbook_modules').select('id, dimension, sort, min_level, body_md'),
        db.from('learning_models').select('id, key, dimension, min_level, active, scopes, capstone_sort, fields'),
      ]);
      diff = upgradeDiff({ from, to, modules: mods.data || [], models: models.data || [], scope: p.work_scope || null, priorityFrom: priority.from ?? null, priorityTo: priority.to ?? null });
      line = evolutionLine(from, to);
    }
    const sum = diffSummary(diff);
    const ins = await db.from('participant_track_history').insert({
      participant_id: p.id, from_track: fromKey, to_track: toKey, profile_key: trackManifest(toKey, priority.to ?? null).profile, line, added: sum, decided_by: actor,
    });
    if (ins.error) { console.error('participant_track_history insert:', ins.error); return null; }
    const rows = newItemRows(p.id, toKey, diff);
    if (rows.length) {
      const r = await db.from('participant_new_items').upsert(rows, { onConflict: 'participant_id,kind,key', ignoreDuplicates: true });
      if (r.error) console.error('participant_new_items upsert:', r.error);
    }
    // الإشعار في مركز الرسائل (فئة تحديثات الرحلة): sendMail يسجله ويرسله بالبريد ما لم يكتمه المشارك
    if (line && p.email) {
      const m = upgradeMessage(p.full_name, line, sum);
      await sendMail(p.email, m.subject, m.html, [], { category: 'journey', ref: `track:${p.id}:${toKey}` }).catch((e) => console.error(e));
    }
    return { line, added: sum };
  } catch (e) {
    console.error('recordTrackChange:', e);
    return null;
  }
}

/** سجل المسار للمشارك والمستشار، الأحدث أولًا */
export async function trackHistory(participantId: string) {
  const { data, error } = await db.from('participant_track_history').select('from_track, to_track, profile_key, line, added, created_at').eq('participant_id', participantId).order('created_at', { ascending: false }).limit(20);
  if (error) return [];
  return (data || []).map((r: Row) => ({ ...r, title: trackManifest(r.to_track).card?.identity.title || null }));
}

/** «جديد في مستواك» الذي لم يره المشارك بعد، بنوعه: { handbook: [], chapter: [], field: [] } */
export async function unseenNew(participantId: string) {
  const out: Record<string, string[]> = { handbook: [], chapter: [], field: [] };
  const { data, error } = await db.from('participant_new_items').select('kind, key').eq('participant_id', participantId).is('seen_at', null);
  if (error) return out;
  for (const r of data || []) (out[r.kind] ||= []).push(r.key);
  return out;
}

/** المشارك رأى ما فتحه: باب أو فصل (ومعه حقوله) */
export async function markSeen(p: Row, b: Row = {}) {
  const kind = ['handbook', 'chapter'].includes(String(b.kind)) ? String(b.kind) : null;
  const keys = (Array.isArray(b.keys) ? b.keys : []).map(String).filter((k: string) => k && k.length <= 200).slice(0, 50);
  if (!kind || !keys.length) return { success: true };
  const now = new Date().toISOString();
  await db.from('participant_new_items').update({ seen_at: now }).eq('participant_id', p.id).eq('kind', kind).in('key', keys).is('seen_at', null);
  // فتح الفصل يرى حقوله الجديدة معه
  if (kind === 'chapter') for (const k of keys) await db.from('participant_new_items').update({ seen_at: now }).eq('participant_id', p.id).eq('kind', 'field').like('key', `${k}.%`).is('seen_at', null);
  return { success: true };
}
