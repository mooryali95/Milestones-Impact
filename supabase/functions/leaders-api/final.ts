// ════════════════════════════════════════════════════════════════
// التقييم الختامي على الخادم: يجمع المصادر، ويحفظ التعديل والقرار، ويدير الاعتماد
// ════════════════════════════════════════════════════════════════
import { audit, db, Fail, must } from './core.ts';
import { approvalState, cleanAdjust, cleanFinalConfig, computeFinal, finalComponents } from './final.js';
import { mePayload } from './participant.ts';
import type { Admin } from './admin.ts';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));

// المصادر الأربعة من جداولها، وإعداد برنامج المشارك
async function sources(p: any) {
  const state: any = await mePayload(p, 'admin');
  const programId = state.program.id;
  const [prog, cap, post, rec] = await Promise.all([
    db.from('programs').select('id, name, final_eval').eq('id', programId).single(),
    db.from('capstones').select('score, status').eq('participant_id', p.id).maybeSingle(),
    db.from('assessments').select('id, submitted_at, instruments!inner(kind), assessment_results(composite_pct)')
      .eq('participant_id', p.id).eq('status', 'submitted').eq('instruments.kind', 'post').order('submitted_at', { ascending: false }).limit(1),
    db.from('final_evaluations').select('*').eq('participant_id', p.id).eq('program_id', programId).maybeSingle(),
  ]);
  const last = (post.data || [])[0];
  const pcts = (last?.assessment_results || []).map((r: any) => Number(r.composite_pct)).filter((n: number) => Number.isFinite(n));
  const components = finalComponents({
    continuous: state.continuous,
    milestones: state.milestone_summary,
    capstone: cap.data || null,
    post: pcts.length ? { pct: pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length, submitted_at: last.submitted_at } : null,
  });
  return { program: must(prog) as any, components, record: rec.data || null };
}

export async function get(b: Body) {
  const p = must(await db.from('participants').select('*').eq('id', String(b.participant_id || '')).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const { program, components, record } = await sources(p);
  const live = computeFinal(components, program.final_eval, record?.adjust || {});
  return {
    success: true, program: { id: program.id, name: program.name }, live, record,
    approval: approvalState(record?.votes || [], program.final_eval),
  };
}

// حفظ التعديلات، أو رفعها للاعتماد (submit). أي تعديل بعد الرفع يعيدها مسودة ويُسقط الأصوات.
export async function save(a: Admin, b: Body) {
  const p = must(await db.from('participants').select('*').eq('id', String(b.participant_id || '')).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const { program, components, record } = await sources(p);
  if (record?.status === 'approved') throw new Fail('التقييم معتمد؛ أعد فتحه أولًا لتعديله', 409);
  let adjust;
  try { adjust = cleanAdjust(b.adjust || {}, components); } catch (err) { throw new Fail((err as Error).message); }
  const live = computeFinal(components, program.final_eval, adjust);
  const submit = b.submit === true;
  if (submit && !live.decision) throw new Fail(`لا يُقترح قرار والتغطية ${live.coverage}٪ دون الحد ${live.config.min_coverage}٪. اكتمل: ${live.missing.join('، ') || '—'}، أو حدد القرار بنفسك بتعليل`);
  const now = new Date().toISOString();
  const row: Record<string, any> = {
    participant_id: p.id, program_id: program.id, adjust, updated_at: now,
    score: live.score, decision: live.decision,
    status: submit ? 'pending' : 'draft', votes: [],
    ...(submit ? { snapshot: live, submitted_by: a.email, submitted_at: now } : { snapshot: null, submitted_by: null, submitted_at: null }),
  };
  must(await db.from('final_evaluations').upsert(row));
  await audit('admin', a.email, submit ? 'final.submit' : 'final.save', 'participants', p.id, null, { score: live.score, decision: live.decision, adjust });
  return { success: true, live, status: row.status };
}

// صوت الاعتماد أو الإعادة. يكتمل الاعتماد بحسب طريقة البرنامج (خبير، أو لجنة بالأغلبية أو الإجماع).
export async function vote(a: Admin, b: Body) {
  const pid = String(b.participant_id || '');
  if (!isUuid(pid)) throw new Fail('بيانات ناقصة');
  const p = must(await db.from('participants').select('*').eq('id', pid).maybeSingle());
  const { program, record } = await sources(p);
  if (!record || record.status !== 'pending') throw new Fail('لا تقييم بانتظار الاعتماد', 409);
  const v = b.vote === 'approve' ? 'approve' : b.vote === 'return' ? 'return' : null;
  if (!v) throw new Fail('اختر: اعتماد أو إعادة');
  const note = String(b.note || '').trim().slice(0, 1000);
  if (v === 'return' && note.length < 10) throw new Fail('اكتب سبب الإعادة');
  const votes = [...(record.votes || []).filter((x: any) => x.by !== a.email), { by: a.email, vote: v, note: note || null, at: new Date().toISOString() }];
  const st = approvalState(votes, program.final_eval);
  const patch: any = { votes, updated_at: new Date().toISOString() };
  if (st.done) { patch.status = 'approved'; patch.decided_at = patch.updated_at; }
  else if (st.returned) patch.status = 'returned';
  must(await db.from('final_evaluations').update(patch).eq('participant_id', pid).eq('program_id', program.id));
  await audit('admin', a.email, `final.${v}`, 'participants', pid, null, { note: note || null, status: patch.status || 'pending' });
  return { success: true, status: patch.status || 'pending', approval: st };
}

// إعادة فتح تقييم معتمد للتعديل (بسبب مكتوب)
export async function reopen(a: Admin, b: Body) {
  const pid = String(b.participant_id || '');
  const note = String(b.note || '').trim();
  if (note.length < 10) throw new Fail('اكتب سبب إعادة الفتح');
  const p = must(await db.from('participants').select('*').eq('id', pid).maybeSingle());
  const { program, record } = await sources(p);
  if (!record) throw new Fail('لا تقييم', 404);
  must(await db.from('final_evaluations').update({ status: 'draft', votes: [], decided_at: null, updated_at: new Date().toISOString() }).eq('participant_id', pid).eq('program_id', program.id));
  await audit('admin', a.email, 'final.reopen', 'participants', pid, null, { note });
  return { success: true };
}

export async function config(a: Admin, b: Body) {
  if (!isUuid(b.program_id)) throw new Fail('اختر البرنامج');
  let cfg;
  try { cfg = cleanFinalConfig(b.config); } catch (err) { throw new Fail((err as Error).message); }
  must(await db.from('programs').update({ final_eval: cfg, updated_at: new Date().toISOString() }).eq('id', b.program_id));
  await audit('admin', a.email, 'program.final-eval', 'programs', String(b.program_id), null, cfg);
  return { success: true, config: cfg };
}
