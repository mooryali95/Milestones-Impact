// ════════════════════════════════════════════════════════════════
// طلبات الأقران وتأكيد الخبير على الخادم (المرحلة 8)
// ════════════════════════════════════════════════════════════════
// المشارك يرفع طلب توجيه فيراه فريقه في دفعته فيجيب، ويؤكّد مستشار الدفعة الإجابة أو يصحّحها أو
// يخفيها من بوابته. نمط الإشراف من الدفعة (cohorts.supervision). المنطق النقي في peer.js.
// الخبير يُسجَّل في audit_log فاعلًا system ببريده (لا admin)، حفاظًا على فصل الأدوار.
import { audit, db, Fail, must, sendMail } from './core.ts';
import { esc, mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { answerBlock, authorNameFor, cleanPeerRequest, cleanPeerText, cleanSupervision, PEER_ANSWER_STATUS_AR, PEER_SOURCE_AR, PEER_STATUS_AR, requestStatusFor, SUPERVISION_AR } from './peer.js';
import { firstName, HALL_TEAM_AR } from './hall.js';
import { cohortOf } from './programs.ts';
import { advisorCohorts, advisorOf } from './advisor.ts';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));
const MAX_OPEN = 10;

async function cohortCtx(p: any) {
  const { cohort } = await cohortOf(p);
  if (!cohort) throw new Fail('لست في دفعة بعد؛ تُفتح طلبات التوجيه مع دفعتك', 409, 'no_cohort');
  return cohort as any;
}
async function teamOf(cohortId: string, participantId: string) {
  const { data } = await db.from('cohort_roles').select('team').eq('cohort_id', cohortId).eq('participant_id', participantId).maybeSingle();
  return (data?.team as string) || null;
}
async function answersFor(requestIds: string[]) {
  if (!requestIds.length) return [] as any[];
  const { data } = await db.from('peer_answers').select('*, participants(full_name), experts(full_name)').in('request_id', requestIds).order('created_at');
  return data || [];
}
const answerView = (a: any, viewerId: string | null) => ({
  id: a.id, text: a.text, status: a.status, status_ar: (PEER_ANSWER_STATUS_AR as Record<string, string>)[a.status], expert_note: a.expert_note || null,
  at: a.created_at, confirmed_at: a.confirmed_at,
  author: a.expert_id ? `${a.experts?.full_name || 'الخبير'} (الخبير)` : authorNameFor(a, a.participants?.full_name),
  by_expert: !!a.expert_id, mine: !!viewerId && a.author_id === viewerId,
});
const requestView = (r: any, answers: any[], viewerId: string | null) => ({
  id: r.id, text: r.text, source: r.source, source_ar: (PEER_SOURCE_AR as Record<string, string>)[r.source], ref_id: r.ref_id,
  target_team: r.target_team, target_team_ar: r.target_team ? (HALL_TEAM_AR as Record<string, string>)[r.target_team] : 'الجميع',
  status: r.status, status_ar: (PEER_STATUS_AR as Record<string, string>)[r.status], at: r.created_at,
  participant_id: r.participant_id, author: r.participants?.full_name || '', mine: !!viewerId && r.participant_id === viewerId,
  answers: answers.map((a) => answerView(a, viewerId)),
});

async function mailAsker(requestId: string, subject: string, text: string) {
  const { data: r } = await db.from('peer_requests').select('participants(email, full_name)').eq('id', requestId).maybeSingle();
  const p = (r as any)?.participants;
  if (!p?.email) return;
  await sendMail(p.email, subject, mailShell(`أهلًا ${firstName(p.full_name)}`, mailText(text) + mailButton(SITES.leaders, 'افتح رحلتك'))).catch(() => {});
}

// ── للمشارك ──
// ما يراه: طلباته، وما وُجّه إلى فريقه أو إلى الجميع، وما أكّده الخبير في دفعته (سجل النشاط)
export async function list(p: any) {
  const cohort = await cohortCtx(p);
  const supervision = cleanSupervision(cohort.supervision);
  const [team, adv, { data: reqs }] = await Promise.all([
    teamOf(cohort.id, p.id), advisorOf(p),
    db.from('peer_requests').select('*, participants(full_name)').eq('cohort_id', cohort.id).order('created_at', { ascending: false }).limit(100),
  ]);
  const visible = (reqs || []).filter((r: any) => r.participant_id === p.id || r.status === 'confirmed' || (supervision !== 'expert_only' && (!r.target_team || r.target_team === team)));
  const answers = await answersFor(visible.map((r: any) => r.id));
  const items = visible.map((r: any) => {
    const mine = answers.filter((a: any) => a.request_id === r.id && (a.status !== 'hidden' || a.author_id === p.id));
    const v = requestView(r, mine, p.id);
    const block = v.mine ? 'لا تجيب عن طلبك' : answerBlock(r, { id: p.id, team }, supervision);
    return { ...v, can_answer: !block && !mine.some((a: any) => a.author_id === p.id), answer_block: block };
  });
  return {
    success: true, supervision, supervision_ar: (SUPERVISION_AR as Record<string, string>)[supervision],
    team, team_ar: team ? (HALL_TEAM_AR as Record<string, string>)[team] : null, teams: HALL_TEAM_AR,
    advisor: adv ? firstName(adv.full_name) : null, items,
    mine_open: items.filter((x) => x.mine && x.status !== 'closed').length,
  };
}

export async function ask(p: any, b: Body) {
  const cohort = await cohortCtx(p);
  const supervision = cleanSupervision(cohort.supervision);
  let r;
  try { r = cleanPeerRequest(b, supervision); } catch (err) { throw new Fail((err as Error).message); }
  const { count } = await db.from('peer_requests').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).in('status', ['open', 'answered']);
  if ((count || 0) >= MAX_OPEN) throw new Fail(`لديك ${MAX_OPEN} طلبات مفتوحة؛ أغلق ما أُجيب عنه أولًا`, 409);
  const row = must(await db.from('peer_requests').insert({ participant_id: p.id, cohort_id: cohort.id, ...r }).select('id').single()) as any;
  await audit('participant', p.email, 'peer.ask', 'peer_requests', row.id, null, { source: r.source, target_team: r.target_team, supervision });
  // الخبير وحده يجيب: يصله بريد فورًا؛ وفي النمطين الآخرين يراه فريقه في التطبيق ويراه الخبير في بوابته
  if (supervision === 'expert_only') {
    const adv = await advisorOf(p);
    if (adv) await sendMail(adv.email, `طلب توجيه من ${p.full_name}`, mailShell(`أهلًا ${firstName(adv.full_name)}`,
      mailText(`رفع ${esc(p.full_name)} طلب توجيه في دفعتك «${esc(cohort.name)}»، وهو بانتظار إجابتك بصفتك مستشارها.`) + mailButton(`${SITES.leaders}/x`, 'افتح لوحة الخبير'))).catch(() => {});
  }
  return list(p);
}

export async function answer(p: any, b: Body) {
  const cohort = await cohortCtx(p);
  const supervision = cleanSupervision(cohort.supervision);
  const r = must(await db.from('peer_requests').select('*').eq('id', String(b.request_id || '')).eq('cohort_id', cohort.id).maybeSingle()) as any;
  if (!r) throw new Fail('الطلب غير موجود', 404);
  const team = await teamOf(cohort.id, p.id);
  const block = answerBlock(r, { id: p.id, team }, supervision);
  if (block) throw new Fail(block, 403);
  const { count } = await db.from('peer_answers').select('id', { count: 'exact', head: true }).eq('request_id', r.id).eq('author_id', p.id);
  if (count) throw new Fail('أجبت عن هذا الطلب من قبل', 409);
  let text;
  try { text = cleanPeerText(b.text, 'الإجابة'); } catch (err) { throw new Fail((err as Error).message); }
  const a = must(await db.from('peer_answers').insert({ request_id: r.id, author_id: p.id, text }).select('id').single()) as any;
  const all = await answersFor([r.id]);
  must(await db.from('peer_requests').update({ status: requestStatusFor(all, r.status), updated_at: new Date().toISOString() }).eq('id', r.id));
  await audit('participant', p.email, 'peer.answer', 'peer_answers', a.id, null, { request_id: r.id });
  return list(p);
}

export async function close(p: any, b: Body) {
  const r = must(await db.from('peer_requests').select('id, status').eq('id', String(b.request_id || '')).eq('participant_id', p.id).maybeSingle()) as any;
  if (!r) throw new Fail('الطلب غير موجود', 404);
  if (r.status !== 'closed') must(await db.from('peer_requests').update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: p.email, updated_at: new Date().toISOString() }).eq('id', r.id));
  await audit('participant', p.email, 'peer.close', 'peer_requests', r.id);
  return list(p);
}

// ── للخبير من بوابته (مستشار الدفعة) ──
async function cohortsOf(e: any) {
  const cohorts = await advisorCohorts(e.id);
  return { cohorts, ids: new Set(cohorts.map((c: any) => c.id)) };
}
async function requestFor(e: any, requestId: unknown) {
  const { ids } = await cohortsOf(e);
  const r = must(await db.from('peer_requests').select('*').eq('id', String(requestId || '')).maybeSingle()) as any;
  if (!r || !ids.has(r.cohort_id)) throw new Fail('هذا الطلب ليس من دفعاتك', 403);
  return r;
}

export async function expertList(e: any) {
  const { cohorts, ids } = await cohortsOf(e);
  if (!ids.size) return { success: true, advisor: false, cohorts: [], items: [] };
  const { data: reqs } = await db.from('peer_requests').select('*, participants(full_name)').in('cohort_id', [...ids]).neq('status', 'closed').order('created_at', { ascending: false }).limit(200);
  const answers = await answersFor((reqs || []).map((r: any) => r.id));
  const items = (reqs || []).map((r: any) => ({
    ...requestView(r, answers.filter((a: any) => a.request_id === r.id), null),
    cohort: cohorts.find((c: any) => c.id === r.cohort_id)?.name || '',
    pending: answers.filter((a: any) => a.request_id === r.id && a.status === 'pending').length,
  }));
  return {
    success: true, advisor: true,
    cohorts: cohorts.map((c: any) => ({ id: c.id, name: c.name, supervision: cleanSupervision(c.supervision), supervision_ar: (SUPERVISION_AR as Record<string, string>)[cleanSupervision(c.supervision)] })),
    items, pending: items.reduce((n: number, x: any) => n + x.pending, 0),
  };
}

// إجابة الخبير نفسه: مؤكَّدة فور كتابتها
export async function expertAnswer(e: any, b: Body) {
  const r = await requestFor(e, b.request_id);
  if (r.status === 'closed') throw new Fail('الطلب مغلق', 409);
  let text;
  try { text = cleanPeerText(b.text, 'الإجابة'); } catch (err) { throw new Fail((err as Error).message); }
  const now = new Date().toISOString();
  const a = must(await db.from('peer_answers').insert({ request_id: r.id, expert_id: e.id, text, status: 'confirmed', confirmed_by: e.email, confirmed_at: now }).select('id').single()) as any;
  must(await db.from('peer_requests').update({ status: 'confirmed', updated_at: now }).eq('id', r.id));
  await audit('system', e.email, 'peer.expert-answer', 'peer_answers', a.id, null, { request_id: r.id });
  await mailAsker(r.id, 'أجاب خبيرك عن طلب توجيهك', `أجاب ${e.full_name} عن طلب التوجيه الذي رفعته. تجد الإجابة في رحلتك تحت «طلبات التوجيه».`);
  return expertList(e);
}

// تأكيد إجابة زميل أو تصحيحها (بملاحظة) أو إخفاؤها
export async function expertReview(e: any, b: Body) {
  const a = must(await db.from('peer_answers').select('*').eq('id', String(b.answer_id || '')).maybeSingle()) as any;
  if (!a) throw new Fail('الإجابة غير موجودة', 404);
  const r = await requestFor(e, a.request_id);
  const status = ['confirmed', 'corrected', 'hidden'].includes(b.status) ? b.status : null;
  if (!status) throw new Fail('اختر: تأكيد أو تصحيح أو إخفاء');
  const note = String(b.note || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (status === 'corrected' && note.length < 10) throw new Fail('التصحيح يلزمه ملاحظة تشرح الصواب');
  const now = new Date().toISOString();
  must(await db.from('peer_answers').update({ status, expert_note: note || null, confirmed_by: e.email, confirmed_at: status === 'hidden' ? null : now, updated_at: now }).eq('id', a.id));
  const all = await answersFor([r.id]);
  must(await db.from('peer_requests').update({ status: requestStatusFor(all, r.status), updated_at: now }).eq('id', r.id));
  await audit('system', e.email, `peer.${status}`, 'peer_answers', a.id, { status: a.status }, { status, note: note || null });
  if (status !== 'hidden') await mailAsker(r.id, 'أكّد خبيرك إجابة عن طلب توجيهك', status === 'corrected' ? 'راجع خبيرك إجابة زميلك عن طلبك وصحّحها بملاحظة. تجدها في رحلتك تحت «طلبات التوجيه».' : 'أكّد خبيرك إجابة زميلك عن طلبك. تجدها في رحلتك تحت «طلبات التوجيه».');
  return expertList(e);
}

export async function expertClose(e: any, b: Body) {
  const r = await requestFor(e, b.request_id);
  const now = new Date().toISOString();
  must(await db.from('peer_requests').update({ status: 'closed', closed_at: now, closed_by: e.email, updated_at: now }).eq('id', r.id));
  await audit('system', e.email, 'peer.close', 'peer_requests', r.id);
  return expertList(e);
}

// ── للإدارة: قراءة طلبات دفعة ──
export async function adminList(b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('اختر الدفعة');
  const { data: reqs } = await db.from('peer_requests').select('*, participants(full_name)').eq('cohort_id', String(b.cohort_id)).order('created_at', { ascending: false }).limit(200);
  const answers = await answersFor((reqs || []).map((r: any) => r.id));
  return { success: true, items: (reqs || []).map((r: any) => requestView(r, answers.filter((a: any) => a.request_id === r.id), null)) };
}

// ── للملف (المرحلة 9): طلبات المشارك وإجابات زملائه التي تنتظر الخبير ──
export async function forParticipant(participantId: string) {
  const { data: reqs } = await db.from('peer_requests').select('*, participants(full_name)').eq('participant_id', participantId).order('created_at', { ascending: false }).limit(50);
  const answers = await answersFor((reqs || []).map((r: any) => r.id));
  const { data: given } = await db.from('peer_answers').select('id, status, created_at, confirmed_at').eq('author_id', participantId).order('created_at', { ascending: false }).limit(50);
  return {
    requests: (reqs || []).map((r: any) => requestView(r, answers.filter((a: any) => a.request_id === r.id), null)),
    pending_answers: answers.filter((a: any) => a.status === 'pending').map((a: any) => answerView(a, null)),
    given: (given || []).map((a: any) => ({ id: a.id, status: a.status, status_ar: (PEER_ANSWER_STATUS_AR as Record<string, string>)[a.status], at: a.created_at })),
  };
}
