// ════════════════════════════════════════════════════════════════
// القاعة الحية على الخادم: الجلسة، والحضور، والتقسيم، والجولات، والكشف
// ════════════════════════════════════════════════════════════════
// التزامن بالسؤال الخفيف: كل تغيير يرفع version، والجهاز يرسل رقمه فيُرد عليه
// «لا جديد» بقراءة واحدة، أو بالحالة كاملة حين تتغير. الحضور يتجدد مع كل سؤال.
import { audit, db, Fail, must } from './core.ts';
import { HALL_TEAMS, hallView, nextLeader, splitTeams, HALL_PRESENT_SECONDS } from './hall.js';
import { katonPoints } from './katon.js';
import { overallLevel } from './logic.js';
import { cohortMembers, cohortOf } from './programs.ts';
import type { Actor } from './admin.ts';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));
const SESSION_COLS = '*';

async function openSession(cohortId: string) {
  return (await db.from('hall_sessions').select(SESSION_COLS).eq('cohort_id', cohortId).neq('stage', 'closed').maybeSingle()).data as any;
}
// رفع الإصدار ذري: الكتابة مشروطة بالرقم المقروء، فتغييران متزامنان لا يأخذان الرقم نفسه (كان الثاني يكتب الرقم
// نفسه فيبقى جهاز سأل بينهما على حالة قديمة يظنها الأحدث). من سُبق يعيد القراءة ويحاول، كما يكشفه hall-load.mjs
const BUMP_TRIES = 12;
async function bump(id: string, patch: Body = {}) {
  for (let i = 0; i < BUMP_TRIES; i += 1) {
    const cur = must(await db.from('hall_sessions').select('version').eq('id', id).single()) as any;
    const rows = must(await db.from('hall_sessions').update({ ...patch, version: cur.version + 1 }).eq('id', id).eq('version', cur.version).select(SESSION_COLS)) as any[];
    if (rows?.length) return rows[0];
    await new Promise((r) => setTimeout(r, 5 + Math.random() * 20 * (i + 1)));
  }
  throw new Fail('القاعة مزدحمة الآن، أعد المحاولة', 409, 'hall_busy');
}

// الحالة الكاملة لطرف
async function buildState(session: any, viewer: { kind: 'participant' | 'admin'; id?: string }) {
  const cohort = must(await db.from('cohorts').select('*').eq('id', session.cohort_id).single()) as any;
  const [members, roles, presence, sentence, prog] = await Promise.all([
    cohortMembers(cohort),
    db.from('cohort_roles').select('participant_id, team').eq('cohort_id', cohort.id),
    db.from('hall_presence').select('participant_id, last_seen, hand').eq('session_id', session.id),
    session.sentence_id ? db.from('katon_sentences').select('*').eq('id', session.sentence_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('programs').select('katon_points').eq('id', cohort.program_id).maybeSingle(),
  ]);
  const answers = session.sentence_id
    ? ((await db.from('katon_answers').select('participant_id, sentence_id, choice, verdict, confidence, stances, note').eq('sentence_id', session.sentence_id)).data || [])
    : [];
  const topic = session.topic_id ? (await db.from('katon_topics').select('id, title_ar').eq('id', session.topic_id).maybeSingle()).data : null;
  const sentences = session.topic_id ? ((await db.from('katon_sentences').select('id, sort, question').eq('topic_id', session.topic_id).order('sort')).data || []) : [];
  const view = hallView({
    session, sentence: (sentence as any).data, presence: presence.data || [], answers,
    members: members.map((m: any) => ({ ...m, level: overallLevel(m.levels) })),
    roles: Object.fromEntries((roles.data || []).map((r: any) => [r.participant_id, r.team])),
    points: katonPoints((prog as any).data?.katon_points), viewer,
  });
  return { success: true, ...view, cohort: { id: cohort.id, name: cohort.name }, topic, sentences };
}

// ── للمشارك ──
export async function state(p: any, b: Body) {
  const { cohort } = await cohortOf(p);
  if (!cohort) return { success: true, session: null };
  const s = await openSession(cohort.id);
  if (!s) return { success: true, session: null };
  // الحضور: يتجدد مع كل سؤال إن كان المشارك داخل القاعة
  const { data: pr } = await db.from('hall_presence').select('last_seen').eq('session_id', s.id).eq('participant_id', p.id).maybeSingle();
  if (pr && Date.now() - new Date(pr.last_seen).getTime() > (HALL_PRESENT_SECONDS * 1000) / 3) {
    await db.from('hall_presence').update({ last_seen: new Date().toISOString() }).eq('session_id', s.id).eq('participant_id', p.id);
  }
  if (Number(b.since) === s.version && pr) return { success: true, unchanged: true, version: s.version };
  return { ...(await buildState(s, { kind: 'participant', id: p.id })), me: p.id, inside: !!pr };
}

export async function join(p: any) {
  const { cohort } = await cohortOf(p);
  const s = cohort ? await openSession(cohort.id) : null;
  if (!s) throw new Fail('لا قاعة مفتوحة لدفعتك الآن', 404);
  must(await db.from('hall_presence').upsert({ session_id: s.id, participant_id: p.id, last_seen: new Date().toISOString() }));
  await bump(s.id);
  return state(p, {});
}

export async function hand(p: any, b: Body) {
  const { cohort } = await cohortOf(p);
  const s = cohort ? await openSession(cohort.id) : null;
  if (!s) throw new Fail('لا قاعة مفتوحة', 404);
  must(await db.from('hall_presence').update({ hand: b.raised === true }).eq('session_id', s.id).eq('participant_id', p.id));
  await bump(s.id);
  return state(p, {});
}

// اختيار المشارك فريقه حين يختار الخبير طريقة «ارفع يدك»
export async function pick(p: any, b: Body) {
  const { cohort } = await cohortOf(p);
  const s = cohort ? await openSession(cohort.id) : null;
  if (!s || s.stage !== 'split' || s.split_method !== 'choose') throw new Fail('اختيار الفريق غير متاح الآن', 409);
  if (!HALL_TEAMS.includes(b.team)) throw new Fail('اختر أحد الفرق الأربعة');
  must(await db.from('cohort_roles').upsert({ cohort_id: cohort.id, participant_id: p.id, team: b.team, updated_at: new Date().toISOString() }));
  await bump(s.id);
  return state(p, {});
}

// هل الجملة مفتوحة للإجابة في قاعة المشارك؟ (يستعملها katon.answer)
export async function hallGate(p: any, sentenceId: string) {
  const { cohort } = await cohortOf(p);
  const s = cohort ? await openSession(cohort.id) : null;
  if (!s) return { inHall: false, sessionId: null };
  const inTopic = !!s.topic_id && !!(await db.from('katon_sentences').select('id').eq('id', sentenceId).eq('topic_id', s.topic_id).maybeSingle()).data;
  if (!inTopic) return { inHall: false, sessionId: null };
  if ((s.revealed || []).includes(sentenceId)) throw new Fail('كُشف مفتاح هذه الجملة في القاعة؛ لا تُعدَّل الإجابة بعده', 409, 'revealed');
  if (s.mode === 'live' && s.sentence_id !== sentenceId) throw new Fail('أجب عن الجملة المعروضة الآن في القاعة', 409, 'not_current');
  // الإصدار يُرفع بعد حفظ الإجابة (hallAnswered) لا قبله: من سأل بين الرفع والحفظ كان يأخذ الرقم الجديد بلا الإجابة
  return { inHall: true, sessionId: s.id as string };
}
export const hallAnswered = (sessionId: string) => bump(sessionId);

// ── للمدير من اللوحة ولمستشار الدفعة من بوابته (التقييد بالدفعة في file.ts) ──
export async function adminState(b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('اختر الدفعة');
  const s = await openSession(String(b.cohort_id));
  if (!s) {
    // D17: القاعة على المنشور من الموضوعات وحده
    const { data: topics } = await db.from('katon_topics').select('id, title_ar, status').eq('status', 'published').order('sort');
    return { success: true, session: null, topics: topics || [] };
  }
  if (Number(b.since) === s.version) return { success: true, unchanged: true, version: s.version };
  return buildState(s, { kind: 'admin' });
}

// D17: لا موضوع غير منشور في القاعة، فتحًا ولا تبديلًا (كانت القائمة والفتح يقبلان المسودة)
async function requirePublished(topicId: string) {
  const { data } = await db.from('katon_topics').select('status').eq('id', topicId).maybeSingle();
  if (data?.status !== 'published') throw new Fail('القاعة على الموضوعات المنشورة وحدها. انشر الموضوع أولًا', 409, 'topic_unpublished');
}

export async function open(a: Actor, b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('اختر الدفعة');
  if (await openSession(String(b.cohort_id))) throw new Fail('للدفعة قاعة مفتوحة؛ أغلقها أولًا', 409);
  const mode = b.mode === 'self' ? 'self' : 'live';
  if (isUuid(b.topic_id)) await requirePublished(String(b.topic_id));
  // رمز الدخول ستة أرقام عشوائية؛ تصادمه مع قاعة مفتوحة أخرى نادر ويُعاد السحب بدل الفشل
  for (let tries = 0; ; tries += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await db.from('hall_sessions').insert({
      cohort_id: b.cohort_id, topic_id: isUuid(b.topic_id) ? b.topic_id : null, mode, code,
      stage: mode === 'self' ? 'round' : 'enter', created_by: a.email,
    }).select(SESSION_COLS).single();
    if (!error) break;
    if (error.code !== '23505' || tries >= 4) { console.error(error); throw new Fail('تعذّر فتح القاعة', 500, 'db_error'); }
  }
  await audit(a.actor || 'admin', a.email, 'hall.open', 'cohorts', String(b.cohort_id), null, { mode, topic: b.topic_id || null });
  return adminState({ cohort_id: b.cohort_id });
}

export async function adminSession(b: Body) {
  const s = must(await db.from('hall_sessions').select(SESSION_COLS).eq('id', String(b.session_id || '')).maybeSingle()) as any;
  if (!s || s.stage === 'closed') throw new Fail('القاعة غير مفتوحة', 404);
  return s;
}

// الانتقال بين المراحل، واختيار الجملة المعروضة، والكشف
export async function step(a: Actor, b: Body) {
  const s = await adminSession(b);
  const patch: Body = {};
  if (b.stage) {
    if (!['enter', 'train', 'split', 'round', 'reveal'].includes(b.stage)) throw new Fail('مرحلة غير معروفة');
    patch.stage = b.stage;
  }
  if ('topic_id' in b) {
    if (isUuid(b.topic_id)) await requirePublished(String(b.topic_id));
    patch.topic_id = isUuid(b.topic_id) ? b.topic_id : null; patch.sentence_id = null;
  }
  if (isUuid(b.sentence_id)) patch.sentence_id = b.sentence_id;
  if (patch.stage === 'round' && !patch.sentence_id && !s.sentence_id && (patch.topic_id || s.topic_id)) {
    const { data } = await db.from('katon_sentences').select('id').eq('topic_id', patch.topic_id || s.topic_id).order('sort').limit(1);
    patch.sentence_id = data?.[0]?.id || null;
  }
  if (patch.stage === 'reveal') {
    const sid = patch.sentence_id || s.sentence_id;
    if (!sid) throw new Fail('لا جملة معروضة لكشفها');
    patch.revealed = [...new Set([...(s.revealed || []), sid])];
  }
  // جولة جديدة: الجملة التالية، وقائد جديد
  if (b.next === true) {
    const { data: list } = await db.from('katon_sentences').select('id').eq('topic_id', s.topic_id).order('sort');
    const i = (list || []).findIndex((x: any) => x.id === s.sentence_id);
    const nxt = (list || [])[i + 1];
    if (!nxt) throw new Fail('هذه آخر جملة في الموضوع');
    patch.sentence_id = nxt.id; patch.stage = 'round'; patch.round = s.round + 1;
    const roles = Object.fromEntries(((await db.from('cohort_roles').select('participant_id, team').eq('cohort_id', s.cohort_id)).data || []).map((r: any) => [r.participant_id, r.team]));
    const { data: pres } = await db.from('hall_presence').select('participant_id').eq('session_id', s.id);
    patch.leader_id = nextLeader(roles, s.leader_id, new Set((pres || []).map((x: any) => x.participant_id)));
  }
  const row = await bump(s.id, patch);
  await audit(a.actor || 'admin', a.email, 'hall.step', 'cohorts', s.cohort_id, null, { stage: row.stage, sentence: row.sentence_id, round: row.round });
  return adminState({ cohort_id: s.cohort_id });
}

// التقسيم: آلي (متنوع أو متقارب) على الحاضرين، أو فتح الاختيار للمشاركين، أو يدوي
export async function split(a: Actor, b: Body) {
  const s = await adminSession(b);
  const method = ['mixed', 'level', 'choose', 'manual'].includes(b.method) ? b.method : 'mixed';
  if (method === 'mixed' || method === 'level') {
    const cohort = must(await db.from('cohorts').select('*').eq('id', s.cohort_id).single());
    const { data: pres } = await db.from('hall_presence').select('participant_id').eq('session_id', s.id);
    const ids = new Set((pres || []).map((x: any) => x.participant_id));
    const members = (await cohortMembers(cohort)).filter((m: any) => !ids.size || ids.has(m.id));
    const roles = splitTeams(members, method);
    const now = new Date().toISOString();
    if (Object.keys(roles).length) must(await db.from('cohort_roles').upsert(Object.entries(roles).map(([participant_id, team]) => ({ cohort_id: s.cohort_id, participant_id, team, updated_at: now }))));
    const leader = Object.entries(roles).find(([, t]) => t === 'lead')?.[0] || null;
    await bump(s.id, { stage: 'split', split_method: method, leader_id: leader });
  } else {
    await bump(s.id, { stage: 'split', split_method: method });
  }
  await audit(a.actor || 'admin', a.email, 'hall.split', 'cohorts', s.cohort_id, null, { method });
  return adminState({ cohort_id: s.cohort_id });
}

export async function assign(a: Actor, b: Body) {
  const s = await adminSession(b);
  if (!isUuid(b.participant_id)) throw new Fail('اختر المشارك');
  if (b.team) {
    if (!HALL_TEAMS.includes(b.team)) throw new Fail('فريق غير معروف');
    must(await db.from('cohort_roles').upsert({ cohort_id: s.cohort_id, participant_id: b.participant_id, team: b.team, updated_at: new Date().toISOString() }));
  }
  const patch: Body = {};
  if (b.leader === true) patch.leader_id = b.participant_id;
  if (b.persona === true) { patch.persona_id = b.participant_id; if ('persona_ar' in b) patch.persona_ar = String(b.persona_ar || '').trim().slice(0, 200) || null; }
  if (b.persona === false && s.persona_id === b.participant_id) patch.persona_id = null;
  await bump(s.id, patch);
  await audit(a.actor || 'admin', a.email, 'hall.assign', 'participants', String(b.participant_id), null, { team: b.team || null, leader: !!b.leader, persona: b.persona ?? null });
  return adminState({ cohort_id: s.cohort_id });
}

export async function close(a: Actor, b: Body) {
  const s = await adminSession(b);
  await bump(s.id, { stage: 'closed', closed_at: new Date().toISOString() });
  await audit(a.actor || 'admin', a.email, 'hall.close', 'cohorts', s.cohort_id);
  return adminState({ cohort_id: s.cohort_id });
}
