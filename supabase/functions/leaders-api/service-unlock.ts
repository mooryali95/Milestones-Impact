// ════════════════════════════════════════════════════════════════
// «الاستشارة خدمة» (تصور البرامج والرحلة 2026-11-24، المرحلة 2، §4.3)
// ════════════════════════════════════════════════════════════════
// الخدمة بشرط 'any' تُتاح حين يبدأ المشارك القراءة أو ينهي التدريب. القاعدة في journey.js (resolveStages)، وهنا إشاراتها
// من مصادرها القائمة، وتسجيل لحظة الفتح مرة في audit_log (service.unlocked) ومعها بريد واحد.
// الفتح لا رجعة فيه: صف في service_unlocks (مفتاحه participant_id + stage_key) يُقرأ إشارةً (unlocked) فلا تنغلق الخدمة ولو
// حُذف تقدم القراءة لاحقًا. والصف هو مفتاح عدم التكرار: insert ... on conflict do nothing returning، ولا سطر سجل ولا بريد إلا
// لمن عاد له صف، فطلبان متزامنان لا يرسلان بريدين.
// الفتح اليدوي الاستثنائي هو تدخل الأدمن القائم (participant_stage_overrides بـ open، مسجل في السجل)، ويُسجَّل فتحه هنا أيضًا.
// برنامج بلا خدمة بشرط 'any' (كل النسخ القديمة) لا يُقرأ له شيء ولا يُكتب: الرحلة كما كانت.
import { audit, db, sendMail, SERVICE_UNLOCK_SUBJECT, serviceUnlockMail } from './core.ts';
import { readingStarted, stageRules } from './journey.js';

export const SERVICE_UNLOCKED = 'service.unlocked';
const anyServices = (stages: any[]) => (stages || []).filter((s: any) => s && s.active !== false && stageRules(s).lane === 'service' && stageRules(s).unlock === 'any');

/** إشارات الفتح لمشارك: هل بدأ القراءة، وأي خدمات فُتحت له من قبل. null لبرنامج بلا خدمة بشرط 'any' */
export async function serviceSignals(p: any, stages: any[]) {
  if (!anyServices(stages).length) return null;
  const [reading, opened] = await Promise.all([
    db.from('reading_progress').select('active_seconds, words').eq('participant_id', p.id),
    db.from('service_unlocks').select('stage_key').eq('participant_id', p.id),
  ]);
  if (reading.error) console.error('service signals: reading', reading.error.message);
  if (opened.error) console.error('service signals: unlocked', opened.error.message);
  return {
    readingStarted: (reading.data || []).some(readingStarted),
    unlocked: new Set<string>((opened.data || []).map((r: any) => r.stage_key).filter(Boolean)),
  };
}

/** لماذا فُتحت: يدويًا، أو بالقراءة، أو بإنهاء مرحلة */
function viaOf(st: any, signals: any, journey: any[]) {
  if (st.override === 'open') return 'manual';
  const any = stageRules(st).any || [];
  if (any.some((c: any) => c.type === 'reading_started') && signals?.readingStarted) return 'reading';
  const c = any.find((x: any) => x.type === 'stage_done' && journey.some((s: any) => s.key === x.stage && s.status === 'done'));
  return c ? `stage:${c.stage}` : 'other';
}

/** يسجل الخدمات التي فُتحت للتو (مرة لكل مشارك وخدمة) ويرسل بريدها الواحد. لا يرمي: الرحلة تُعرض ولو تعذّر التسجيل */
export async function recordServiceUnlocks(p: any, journey: any[], signals: any, programId: string | null) {
  if (!signals) return [];
  const fresh = (journey || []).filter((s: any) => s.lane === 'service' && stageRules(s).unlock === 'any' && s.status !== 'locked' && !signals.unlocked.has(s.key));
  const out: string[] = [];
  for (const st of fresh) {
    try {
      const via = viaOf(st, signals, journey);
      // on conflict do nothing returning: صف يعود لمن سجّل الفتح أولًا وحده، ورفض المفتاح (23505) مثله «سبق»
      const ins = await db.from('service_unlocks').upsert({ participant_id: p.id, stage_key: st.key, program_id: programId, via }, { onConflict: 'participant_id,stage_key', ignoreDuplicates: true }).select('stage_key');
      signals.unlocked.add(st.key);
      if (ins.error && ins.error.code !== '23505') throw ins.error;
      if (ins.error || !(ins.data || []).length) continue;
      await audit('system', null, SERVICE_UNLOCKED, 'participant', p.id, null, { stage: st.key, program_id: programId, via });
      out.push(st.key);
      if (p.email && !p.is_demo) {
        await sendMail(p.email, SERVICE_UNLOCK_SUBJECT(st.title_ar), serviceUnlockMail(p.full_name, st.title_ar), [], { ref: `service:${p.id}:${st.key}` })
          .catch((e: any) => console.error('service unlock mail', p.id, st.key, e?.message || e));
      }
    } catch (e: any) {
      console.error('service unlock record', p.id, st.key, e?.message || e);
    }
  }
  return out;
}
