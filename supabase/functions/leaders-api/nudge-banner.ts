// ════════════════════════════════════════════════════════════════
// لافتة التذكير في رحلة المشارك (المرحلة P4، اعتمدها المالك 2026-11-16): القناة الثانية بعد البريد
// ════════════════════════════════════════════════════════════════
// آخر تذكير لم يره من السجل الواحد (leaders.nudges)، بنصه نفسه الذي في البريد ومرسله، خلال NUDGE_BANNER_DAYS.
// يضغط «حسنًا» فيُكتب seen_at، فيظهر في ملفه عند الإدارة «رآه في الموقع». وحدة صغيرة بلا رحلة ولا محرك
// فيستدعيها mePayload دون حلقة استيراد مع nudges.ts.
import { audit, db } from './core.ts';
import { NUDGE_BANNER_DAYS, NUDGE_SENDER_AR } from './nudge.js';

/** آخر تذكير لم يره، أو null. تعذّر القراءة (قبل الترحيل) لا يُفشل الرحلة */
export async function bannerFor(participantId: string) {
  const since = new Date(Date.now() - NUDGE_BANNER_DAYS * 864e5).toISOString();
  const { data, error } = await db.from('nudges').select('id, sender, sender_label, stage_title, body, created_at')
    .eq('participant_id', participantId).is('seen_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  const n: any = data[0];
  // الإدارة تظهر للمشارك «فريق البرنامج» لا ببداية بريد المدير (تلك للزملاء في اللوحة)
  const by = n.sender === 'admin' ? 'فريق البرنامج' : n.sender === 'auto' ? null : n.sender_label || (NUDGE_SENDER_AR as Record<string, string>)[n.sender];
  return { id: n.id, stage: n.stage_title, body: n.body, by, at: n.created_at };
}

/** «حسنًا»: يُكتب الاطلاع على هذا التذكير وما قبله مما لم يره، فلا تعود لافتة أقدم بعده */
export async function seen(p: { id: string }, b: Record<string, any>) {
  const id = String(b.id || '');
  const { data: row } = await db.from('nudges').select('created_at').eq('id', id).eq('participant_id', p.id).maybeSingle();
  if (row) {
    await db.from('nudges').update({ seen_at: new Date().toISOString() }).eq('participant_id', p.id).is('seen_at', null).lte('created_at', row.created_at);
    await audit('participant', p.id, 'nudge.seen', 'participants', p.id, null, { id });
  }
  return { success: true, nudge: await bannerFor(p.id) };
}
