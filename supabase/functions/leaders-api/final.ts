// ════════════════════════════════════════════════════════════════
// التقييم الختامي على الخادم: يجمع المصادر، ويحفظ التعديل والقرار، ويدير الاعتماد
// ════════════════════════════════════════════════════════════════
import { audit, db, Fail, must } from './core.ts';
import { approvalState, cleanAdjust, cleanFinalConfig, computeFinal, finalComponents, finalConfig, voteBlock } from './final.js';
import { DEFAULT_MODEL } from './logic.js';
import { mePayload } from './participant.ts';
import { compareFor } from './impact.ts';
import type { Actor } from './admin.ts';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));
const mean = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// المصادر الأربعة من جداولها، وإعداد برنامج المشارك، وسياق الحساب (هل انتهت الدفعة؟)
async function sources(p: any) {
  const state: any = await mePayload(p, 'admin');
  const programId = state.program.id;
  const [prog, cap, post, rec, cmp] = await Promise.all([
    db.from('programs').select('id, name, final_eval').eq('id', programId).single(),
    db.from('capstones').select('score, status').eq('participant_id', p.id).maybeSingle(),
    db.from('assessments').select('id, submitted_at, instruments!inner(kind), assessment_results(composite_pct, knowledge_pct, skill_pct)')
      .eq('participant_id', p.id).eq('status', 'submitted').eq('instruments.kind', 'post').order('submitted_at', { ascending: false }).limit(1),
    db.from('final_evaluations').select('*').eq('participant_id', p.id).eq('program_id', programId).maybeSingle(),
    // المكسب الموثوق (اتجاه RCI الكلي) والاختبار الموضوعي قبل وبعد، من تقرير الأثر نفسه
    compareFor([p.id]).catch(() => ({ rows: {} as Record<string, any> })),
  ]);
  const last = (post.data || [])[0];
  const results: any[] = last?.assessment_results || [];
  const row = (cmp as any).rows?.[p.id];
  const dims: any[] = row?.dimensions || [];
  // الاختبار الموضوعي (معرفة ومواقف بلا تقدير ذاتي) بعد البرنامج من نتائج البعدي حين لا زوج مقارن
  const wk = Number(DEFAULT_MODEL.w_knowledge), ws = Number(DEFAULT_MODEL.w_skill);
  const objective = mean(results.map((r: any) => (r.knowledge_pct != null && r.skill_pct != null ? (Number(r.knowledge_pct) * wk + Number(r.skill_pct) * ws) / (wk + ws) : null)));
  const components = finalComponents({
    continuous: state.continuous,
    milestones: state.milestone_summary,
    capstone: cap.data || null,
    post: last ? {
      pct: mean(results.map((r: any) => Number(r.composite_pct))), submitted_at: last.submitted_at,
      test_pre: mean(dims.map((d: any) => d.test_pre)), test_post: mean(dims.map((d: any) => d.test_post)) ?? objective,
      direction: row?.overall?.direction ?? null,
    } : null,
  }, (prog.data as any)?.final_eval);
  const ends = state.program?.cohort?.ends_on;
  const ended = !!ends && new Date().toISOString().slice(0, 10) > String(ends);
  return { program: must(prog) as any, components, record: rec.data || null, ctx: { ended, config: (prog.data as any)?.final_eval || null } };
}

// بعد الرفع تُعرض لقطة الحساب كما رُفعت (بإصدار معادلتها)، لا حسابًا حيًا بإعداد قد تغيّر
export async function get(b: Body, a?: { email: string }) {
  const p = must(await db.from('participants').select('*').eq('id', String(b.participant_id || '')).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const { program, components, record, ctx } = await sources(p);
  const frozen = !!record && ['pending', 'approved'].includes(record.status) && !!record.snapshot;
  const live = frozen ? record.snapshot : computeFinal(components, program.final_eval, record?.adjust || {}, ctx);
  return {
    success: true, program: { id: program.id, name: program.name }, live, record, frozen,
    current_version: finalConfig(program.final_eval).version,
    approval: approvalState(record?.votes || [], program.final_eval, { largeAdjust: !!live.large_adjust }),
    vote_block: a && record?.status === 'pending' ? voteBlock(a.email, record, program.final_eval) : null,
  };
}

// حفظ التعديلات، أو رفعها للاعتماد (submit). أي تعديل بعد الرفع يعيدها مسودة ويُسقط الأصوات.
export async function save(a: Actor, b: Body) {
  const p = must(await db.from('participants').select('*').eq('id', String(b.participant_id || '')).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const { program, components, record, ctx } = await sources(p);
  if (record?.status === 'approved') throw new Fail('التقييم معتمد؛ أعد فتحه أولًا لتعديله', 409);
  let adjust;
  try { adjust = cleanAdjust(b.adjust || {}, components, ctx); } catch (err) { throw new Fail((err as Error).message); }
  const live = computeFinal(components, program.final_eval, adjust, ctx);
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
  await audit(a.actor || 'admin', a.email, submit ? 'final.submit' : 'final.save', 'participants', p.id, null, { score: live.score, decision: live.decision, adjust, config_version: live.config_version, large_adjust: live.large_adjust });
  return { success: true, live, status: row.status };
}

// صوت الاعتماد أو الإعادة. يكتمل الاعتماد بحسب طريقة البرنامج (خبير، أو لجنة بالأغلبية أو الإجماع)،
// ولا يعتمد المُعدِّل تقييمه، ولا يصوّت غير أعضاء اللجنة المسمّين، والتعديل الكبير يحتاج توقيعين.
export async function vote(a: Actor, b: Body) {
  const pid = String(b.participant_id || '');
  if (!isUuid(pid)) throw new Fail('بيانات ناقصة');
  const p = must(await db.from('participants').select('*').eq('id', pid).maybeSingle());
  const { program, record } = await sources(p);
  if (!record || record.status !== 'pending') throw new Fail('لا تقييم بانتظار الاعتماد', 409);
  const block = voteBlock(a.email, record, program.final_eval);
  if (block) throw new Fail(block, 403, 'vote_blocked');
  const v = b.vote === 'approve' ? 'approve' : b.vote === 'return' ? 'return' : null;
  if (!v) throw new Fail('اختر: اعتماد أو إعادة');
  const note = String(b.note || '').trim().slice(0, 1000);
  if (v === 'return' && note.length < 10) throw new Fail('اكتب سبب الإعادة');
  const votes = [...(record.votes || []).filter((x: any) => x.by !== a.email), { by: a.email, vote: v, note: note || null, at: new Date().toISOString() }];
  const st = approvalState(votes, program.final_eval, { largeAdjust: !!record.snapshot?.large_adjust });
  const patch: any = { votes, updated_at: new Date().toISOString() };
  if (st.done) { patch.status = 'approved'; patch.decided_at = patch.updated_at; }
  else if (st.returned) patch.status = 'returned';
  must(await db.from('final_evaluations').update(patch).eq('participant_id', pid).eq('program_id', program.id));
  await audit(a.actor || 'admin', a.email, `final.${v}`, 'participants', pid, null, { note: note || null, status: patch.status || 'pending' });
  return { success: true, status: patch.status || 'pending', approval: st };
}

// إعادة فتح تقييم معتمد للتعديل (بسبب مكتوب)
export async function reopen(a: Actor, b: Body) {
  const pid = String(b.participant_id || '');
  const note = String(b.note || '').trim();
  if (note.length < 10) throw new Fail('اكتب سبب إعادة الفتح');
  const p = must(await db.from('participants').select('*').eq('id', pid).maybeSingle());
  const { program, record } = await sources(p);
  if (!record) throw new Fail('لا تقييم', 404);
  must(await db.from('final_evaluations').update({ status: 'draft', votes: [], decided_at: null, updated_at: new Date().toISOString() }).eq('participant_id', pid).eq('program_id', program.id));
  await audit(a.actor || 'admin', a.email, 'final.reopen', 'participants', pid, null, { note });
  return { success: true };
}

// حفظ الإعداد يرفع إصدار المعادلة؛ التقييمات المرفوعة تبقى بلقطة إصدارها
export async function config(a: Actor, b: Body) {
  if (!isUuid(b.program_id)) throw new Fail('اختر البرنامج');
  const prev = (await db.from('programs').select('final_eval').eq('id', b.program_id).maybeSingle()).data?.final_eval;
  let cfg;
  try { cfg = cleanFinalConfig(b.config, prev); } catch (err) { throw new Fail((err as Error).message); }
  must(await db.from('programs').update({ final_eval: cfg, updated_at: new Date().toISOString() }).eq('id', b.program_id));
  await audit('admin', a.email, 'program.final-eval', 'programs', String(b.program_id), prev || null, cfg);
  return { success: true, config: cfg };
}
