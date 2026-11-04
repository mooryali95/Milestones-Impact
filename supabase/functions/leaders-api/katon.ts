// ════════════════════════════════════════════════════════════════
// «كاتون» على الخادم: المشارك يجيب ويرى المفتاح بعد إتمام الموضوع، والأدمن يبني البنك
// ════════════════════════════════════════════════════════════════
// المفتاح والشرح لا يُرسلان للمشارك قبل أن يجيب عن جمل الموضوع كلها، وبعدها تُقفل إجاباته
// فلا يُعدّل بعد رؤية المفتاح. النقاط من إعداد برنامجه (programs.katon_points).
import { audit, db, Fail, must } from './core.ts';
import { cleanSentence, katonPoints, katonScore, katonSummary, KATON_OPTIONS, sentenceDistribution } from './katon.js';
import { defaultProgramId, journeyDefinition } from './programs.ts';
import { hallGate } from './hall.ts';
import type { Admin } from './admin.ts';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));

async function approved(p: any) {
  const { data } = await db.from('placements').select('approved_at').eq('participant_id', p.id);
  if (!data || data.length < 3 || data.some((x: any) => !x.approved_at)) throw new Fail('تُفتح «كاتون» بعد اعتماد مسارك', 403, 'locked');
}
async function pointsFor(p: any) {
  const def = await journeyDefinition(p);
  const { data } = await db.from('programs').select('katon_points').eq('id', def.program_id).maybeSingle();
  return katonPoints(data?.katon_points);
}

// ── للمشارك ──
export async function mine(p: any) {
  await approved(p);
  const [tp, ss, ans, pts] = await Promise.all([
    db.from('katon_topics').select('id, key, title_ar, dimension, layers, sort').eq('status', 'published').order('sort'),
    db.from('katon_sentences').select('id, topic_id, sort, question, text_ar, key, explain_ar, tasks').order('sort'),
    db.from('katon_answers').select('sentence_id, choice, note, updated_at').eq('participant_id', p.id),
    pointsFor(p),
  ]);
  const mineBy = new Map((ans.data || []).map((a: any) => [a.sentence_id, a]));
  const topics = (tp.data || []).map((t: any) => {
    const sents = (ss.data || []).filter((s: any) => s.topic_id === t.id);
    const done = sents.length > 0 && sents.every((s: any) => mineBy.has(s.id));
    return {
      ...t, revealed: done, answered: sents.filter((s: any) => mineBy.has(s.id)).length, total: sents.length,
      sentences: sents.map((s: any) => {
        const a: any = mineBy.get(s.id) || null;
        return {
          id: s.id, sort: s.sort, question: s.question, text_ar: s.text_ar, tasks: s.tasks,
          mine: a ? { choice: a.choice, note: a.note } : null,
          ...(done ? { key: s.key, explain_ar: s.explain_ar, points: a ? katonScore(a.choice, s.key, pts) : null } : {}),
        };
      }),
    };
  });
  const published = new Set(topics.map((t: any) => t.id));
  const revealedSents = (ss.data || []).filter((s: any) => published.has(s.topic_id) && topics.find((t: any) => t.id === s.topic_id)?.revealed);
  return { success: true, options: KATON_OPTIONS.map((o) => ({ ...o, points: pts[o.key] })), topics, summary: katonSummary(ans.data || [], revealedSents, pts) };
}

export async function answer(p: any, b: Body) {
  await approved(p);
  const s = must(await db.from('katon_sentences').select('id, topic_id, katon_topics!inner(status)').eq('id', String(b.sentence_id || '')).maybeSingle()) as any;
  if (!s) throw new Fail('الجملة غير متاحة', 404);
  // في القاعة يفتح الخبير موضوع الجلسة ولو لم يُنشر بعد، ويقفل ما كشف مفتاحه
  const gate = await hallGate(p, s.id);
  if (!gate.inHall && s.katon_topics?.status !== 'published') throw new Fail('الجملة غير متاحة', 404);
  if (!KATON_OPTIONS.some((o) => o.key === b.choice)) throw new Fail('اختر أحد الخيارات الثمانية');
  // بعد كشف المفتاح لا تعديل
  const [{ data: sents }, { data: mineAns }] = await Promise.all([
    db.from('katon_sentences').select('id').eq('topic_id', s.topic_id),
    db.from('katon_answers').select('sentence_id').eq('participant_id', p.id),
  ]);
  const have = new Set((mineAns || []).map((a: any) => a.sentence_id));
  if ((sents || []).every((x: any) => have.has(x.id))) throw new Fail('أتممت هذا الموضوع وكُشف مفتاحه؛ لا تُعدَّل الإجابات بعده', 409, 'revealed');
  const now = new Date().toISOString();
  must(await db.from('katon_answers').upsert({
    participant_id: p.id, sentence_id: s.id, choice: b.choice,
    note: b.note ? String(b.note).trim().slice(0, 1000) || null : null, updated_at: now,
  }));
  return mine(p);
}

// ── للأدمن ──
export async function adminList(b: Body) {
  // جدول النقاط لكل برنامج: المطلوب أو الافتراضي، ويعود معرّفه كي تحفظ اللوحة عليه
  const programId = isUuid(b.program_id) ? String(b.program_id) : await defaultProgramId();
  const [tp, ss, ans, prog] = await Promise.all([
    db.from('katon_topics').select('*').order('sort'),
    db.from('katon_sentences').select('*').order('sort'),
    db.from('katon_answers').select('sentence_id, choice'),
    programId ? db.from('programs').select('id, name, katon_points').eq('id', programId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const bySent = new Map<string, any[]>();
  for (const a of ans.data || []) { if (!bySent.has(a.sentence_id)) bySent.set(a.sentence_id, []); bySent.get(a.sentence_id)!.push(a); }
  return {
    success: true,
    options: KATON_OPTIONS,
    program_id: programId, program_name: (prog.data as any)?.name || null,
    points: katonPoints((prog.data as any)?.katon_points),
    topics: (tp.data || []).map((t: any) => ({
      ...t,
      sentences: (ss.data || []).filter((s: any) => s.topic_id === t.id).map((s: any) => {
        const list = bySent.get(s.id) || [];
        return { ...s, answers: list.length, distribution: sentenceDistribution(list) };
      }),
    })),
  };
}

export async function topicSave(a: Admin, b: Body) {
  const r = b.row || {};
  const title_ar = String(r.title_ar || '').trim().slice(0, 160);
  if (title_ar.length < 2) throw new Fail('عنوان الموضوع مطلوب');
  const list = (v: unknown) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
  const row: Body = {
    title_ar,
    dimension: ['milestone', 'impact', 'leadership'].includes(r.dimension) ? r.dimension : null,
    layers: { principles: list(r.principles), competencies: list(r.competencies), assumptions: list(r.assumptions), logic: String(r.logic || '').trim().slice(0, 1000) },
    status: ['draft', 'published', 'archived'].includes(r.status) ? r.status : 'draft',
    updated_at: new Date().toISOString(),
  };
  if (row.status === 'published') {
    const id = isUuid(r.id) ? r.id : null;
    const n = id ? ((await db.from('katon_sentences').select('id', { count: 'exact', head: true }).eq('topic_id', id)).count || 0) : 0;
    if (n < 2) throw new Fail('لا يُنشر موضوع بأقل من جملتين');
  }
  let saved;
  if (isUuid(r.id)) saved = must(await db.from('katon_topics').update(row).eq('id', r.id).select('*').single());
  else {
    const { data: last } = await db.from('katon_topics').select('sort').order('sort', { ascending: false }).limit(1);
    saved = must(await db.from('katon_topics').insert({ ...row, key: `t-${Date.now().toString(36)}`, sort: (last?.[0]?.sort || 0) + 1, status: 'draft' }).select('*').single());
  }
  await audit('admin', a.email, 'katon.topic', 'katon_topics', saved.id, null, { title_ar, status: saved.status });
  return { success: true, row: saved };
}

export async function sentenceSave(a: Admin, b: Body) {
  const r = b.row || {};
  let row;
  try { row = cleanSentence(r); } catch (err) { throw new Fail((err as Error).message); }
  let saved;
  if (isUuid(r.id)) {
    // مفتاح جملة أُجيب عنها يغيّر نقاط من أجاب؛ يُسمح ويُعلَن في السجل
    saved = must(await db.from('katon_sentences').update({ ...row, updated_at: new Date().toISOString() }).eq('id', r.id).select('*').single());
  } else {
    if (!isUuid(r.topic_id)) throw new Fail('اختر الموضوع');
    const { data: last } = await db.from('katon_sentences').select('sort').eq('topic_id', r.topic_id).order('sort', { ascending: false }).limit(1);
    saved = must(await db.from('katon_sentences').insert({ ...row, topic_id: r.topic_id, sort: (last?.[0]?.sort || 0) + 1 }).select('*').single());
  }
  await audit('admin', a.email, 'katon.sentence', 'katon_sentences', saved.id, null, { key: row.key, question: row.question });
  return { success: true, row: saved };
}

export async function sentenceDelete(a: Admin, b: Body) {
  const id = String(b.id || '');
  const { count } = await db.from('katon_answers').select('sentence_id', { count: 'exact', head: true }).eq('sentence_id', id);
  if (count) throw new Fail(`لهذه الجملة ${count} إجابة؛ عدّلها بدل حذفها حتى لا تضيع نقاط من أجاب`, 409);
  must(await db.from('katon_sentences').delete().eq('id', id));
  await audit('admin', a.email, 'katon.sentence-delete', 'katon_sentences', id);
  return { success: true };
}

export async function pointsSave(a: Admin, b: Body) {
  if (!isUuid(b.program_id)) throw new Fail('اختر البرنامج');
  const pts = katonPoints(b.points);
  must(await db.from('programs').update({ katon_points: pts, updated_at: new Date().toISOString() }).eq('id', b.program_id));
  await audit('admin', a.email, 'katon.points', 'programs', String(b.program_id), null, pts);
  return { success: true, points: pts };
}

// للتقييم المستمر: دقة اليقين في كل موضوع كُشف مفتاحه
export async function continuousEvents(participantId: string) {
  const { data: ans } = await db.from('katon_answers').select('sentence_id, choice, updated_at').eq('participant_id', participantId);
  if (!ans?.length) return [];
  const { data: ss } = await db.from('katon_sentences').select('id, topic_id, key, katon_topics(title_ar)').in('id', ans.map((a: any) => a.sentence_id));
  const { data: all } = await db.from('katon_sentences').select('id, topic_id').in('topic_id', [...new Set((ss || []).map((s: any) => s.topic_id))]);
  const have = new Set(ans.map((a: any) => a.sentence_id));
  const out: any[] = [];
  for (const tid of new Set((ss || []).map((s: any) => s.topic_id))) {
    if (!(all || []).filter((x: any) => x.topic_id === tid).every((x: any) => have.has(x.id))) continue;
    const mineS = (ss || []).filter((s: any) => s.topic_id === tid);
    const sum = katonSummary(ans, mineS, null);
    if (sum.accuracy == null) continue;
    const at = ans.filter((a: any) => mineS.some((s: any) => s.id === a.sentence_id)).map((a: any) => a.updated_at).sort().pop();
    out.push({ title: (mineS[0] as any).katon_topics?.title_ar || 'موضوع «كاتون»', pct: sum.accuracy, at });
  }
  return out;
}
