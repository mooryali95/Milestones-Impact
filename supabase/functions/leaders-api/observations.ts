// ════════════════════════════════════════════════════════════════
// ملاحظات المشارك: القراءة والكتابة والتبليغ (الجدول participant_observations)
// ════════════════════════════════════════════════════════════════
// record(): مدخل النظام الواحد لكل تنبيه آلي، بمفتاح القاعدة ومرجع الواقعة فلا تُكتب مرتين.
// adminAdd وadvisorAdd: الملاحظة اليدوية. المرئية للمشارك تظهر له بطاقة في الموقع ويصله بريد بالنص نفسه.
import { audit, db, Fail, must, observationMail, sendMail } from './core.ts';
import { requireWrite } from './admin.ts';
import type { Admin } from './admin.ts';
import { cleanObservation, OBS_KIND_AR } from './observations.js';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const COLS = 'id, kind, source, code, title, body, visible, author, created_at, acknowledged_at';
const missing = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205');

/** ملاحظات مشارك، الأحدث أولًا. الجدول قبل ترحيله يعيد قائمة فارغة */
export async function listFor(participantId: string, opts: { visibleOnly?: boolean } = {}) {
  let q = db.from('participant_observations').select(COLS).eq('participant_id', participantId).order('created_at', { ascending: false }).limit(200);
  if (opts.visibleOnly) q = q.eq('visible', true);
  const { data, error } = await q;
  if (error) { if (!missing(error)) console.error('observations:', error.message); return []; }
  return data || [];
}

// ما يراه المشارك في الموقع: المرئي الذي لم يطّلع عليه بعد
export async function noticesFor(participantId: string) {
  const { data, error } = await db.from('participant_observations').select('id, kind, title, body, created_at')
    .eq('participant_id', participantId).eq('visible', true).is('acknowledged_at', null).order('created_at', { ascending: false }).limit(5);
  return error ? [] : (data || []).map((o: any) => ({ ...o, kind_ar: (OBS_KIND_AR as Record<string, string>)[o.kind] || o.kind }));
}

async function notify(participantId: string, o: { kind: string; title: string | null; body: string }) {
  const { data: p } = await db.from('participants').select('full_name, email, is_demo').eq('id', participantId).maybeSingle();
  if (!p?.email || p.is_demo) return;
  const heading = o.title || (OBS_KIND_AR as Record<string, string>)[o.kind] || 'ملاحظة';
  await sendMail(p.email, `${(OBS_KIND_AR as Record<string, string>)[o.kind]} في رحلتك: ${heading}`.slice(0, 120), observationMail(p.full_name, heading, o.body), [], { kind: 'bulk', ref: `participant:${participantId}` })
    .catch((e) => console.error('observation mail:', e));
}

async function insert(participantId: string, row: Record<string, unknown>) {
  const { data, error } = await db.from('participant_observations').insert({ participant_id: participantId, ...row }).select(COLS).single();
  if (error) {
    if (error.code === '23505') return null;   // واقعة النظام نفسها كُتبت من قبل
    if (missing(error)) throw new Fail('ملاحظات المشارك غير متاحة قبل تطبيق ترحيلها', 503, 'not_ready');
    throw new Fail('تعذّر حفظ الملاحظة', 500, 'db_error');
  }
  return data;
}

/** تنبيه النظام لواقعة: يُكتب مرة واحدة لكل (code, ref)، ويُبلَّغ المشارك إن كان مرئيًا. لا يُسقط ما استدعاه إن تعذّر */
export async function record(participantId: string, o: { code: string; ref: string; kind?: string; title: string; body: string; visible?: boolean }) {
  try {
    const saved = await insert(participantId, { kind: o.kind || 'warning', source: 'system', code: o.code, ref: String(o.ref), title: o.title, body: o.body, visible: o.visible !== false, author: 'النظام' });
    if (saved && saved.visible) await notify(participantId, saved);
    return saved;
  } catch (e) { console.error('observation record:', o.code, e); return null; }
}

async function addManual(participantId: string, b: Body, source: 'admin' | 'advisor', author: string) {
  if (!isUuid(participantId)) throw new Fail('بيانات ناقصة');
  const clean: any = cleanObservation(b);
  if (clean.error) throw new Fail(clean.error);
  const saved: any = await insert(participantId, { ...clean, source, author });
  await audit(source === 'admin' ? 'admin' : 'system', author, 'observation.add', 'participants', participantId, null, { id: saved.id, kind: saved.kind, visible: saved.visible });
  if (saved.visible) await notify(participantId, saved);
  return { success: true, observation: saved };
}
export async function adminAdd(a: Admin, b: Body) { requireWrite(a); return addManual(String(b.participant_id || ''), b, 'admin', a.email); }
export const advisorAdd = (e: { email: string }, b: Body) => addManual(String(b.participant_id || ''), b, 'advisor', e.email);

// الحذف للإدارة وحدها، ولا تُحذف ملاحظات النظام: واقعتها حدثت
export async function adminRemove(a: Admin, b: Body) {
  requireWrite(a);
  const row = must(await db.from('participant_observations').select('id, participant_id, source, kind, body').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!row) throw new Fail('الملاحظة غير موجودة', 404);
  if (row.source === 'system') throw new Fail('ملاحظات النظام لا تُحذف: تسجّل واقعة حدثت', 409);
  must(await db.from('participant_observations').delete().eq('id', row.id));
  await audit('admin', a.email, 'observation.remove', 'participants', row.participant_id, { kind: row.kind, body: row.body }, null);
  return { success: true };
}

// المشارك يطّلع على تنبيه: يختفي من بطاقته ويبقى في ملفه
export async function ack(p: { id: string }, b: Body) {
  const { data } = await db.from('participant_observations').update({ acknowledged_at: new Date().toISOString() })
    .eq('id', String(b.id || '')).eq('participant_id', p.id).eq('visible', true).is('acknowledged_at', null).select('id');
  if (data?.length) await audit('participant', p.id, 'observation.ack', 'participants', p.id, null, { id: data[0].id });
  return { success: true, notices: await noticesFor(p.id) };
}
