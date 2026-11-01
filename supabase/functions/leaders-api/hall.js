// ════════════════════════════════════════════════════════════════
// القاعة الحية: الفرق، والتقسيم، وتدوير القيادة، وما يراه كل طرف
// ════════════════════════════════════════════════════════════════
// منطق بلا قاعدة بيانات. الخادم يحفظ الحالة، وهذا يقرر من يرى ماذا ومتى:
// الاختيارات لا تظهر للزملاء قبل الكشف (حتى لا يتأثر أحد بغيره)، وبعده تظهر بنقاطها.
import { autoGroups } from './groups.js';
import { katonScore, sentenceDistribution } from './katon.js';

export const HALL_TEAMS = ['support', 'lead', 'guide', 'eval'];
export const HALL_TEAM_AR = { support: 'فريق الدعم', lead: 'فريق القيادة', guide: 'فريق التوجيه', eval: 'فريق التقييم' };
export const HALL_TEAM_TASK_AR = {
  support: 'يشرح الجملة لزملائه ويبني معهم نماذج شبيهة',
  lead: 'يقود الجولة ويضبط العلاقة بين الفرق بالتشاور مع المدرّب',
  guide: 'يفكّر في تطبيق الجملة داخل المنظمة ويجيب طلبات التوجيه',
  eval: 'يقيّم الأداء داخل القاعة ويجهّز أسئلة الجولة',
};
export const HALL_STAGE_AR = { enter: 'الدخول', train: 'التدريب', split: 'التقسيم', round: 'الجولة', reveal: 'الكشف', closed: 'أُغلقت' };
export const HALL_SPLIT_AR = { mixed: 'آلي متنوع المستويات', level: 'آلي متقارب المستوى', choose: 'يختار كل مشارك فريقه', manual: 'يدوي من الخبير' };
export const HALL_PRESENT_SECONDS = 25;

// تقسيم على الفرق الأربع: القيادة أصغرها (ربع حجم غيرها تقريبًا، ولا تقل عن واحد)
export function splitTeams(members, method = 'mixed') {
  const list = members || [];
  if (!list.length) return {};
  const nLead = Math.max(1, Math.round(list.length / 8));
  const groups = autoGroups(list, 4, method === 'level' ? 'level' : 'mixed');
  // أصغر المجموعات للقيادة، ثم ينقل الفائض منها لغيرها حتى تبلغ حجمها
  const order = groups.map((g, i) => ({ g, i })).sort((a, b) => a.g.length - b.g.length);
  const lead = [...order[0].g];
  const rest = order.slice(1).map((x) => [...x.g]);
  while (lead.length > nLead) rest.sort((a, b) => a.length - b.length)[0].push(lead.pop());
  const out = {};
  lead.forEach((id) => { out[id] = 'lead'; });
  ['support', 'guide', 'eval'].forEach((t, i) => rest[i].forEach((id) => { out[id] = t; }));
  return out;
}

// قائد الجولة التالي: من فريق القيادة بالتناوب، ثم من الجميع إن لم يكن في القيادة أحد
/** @param {Record<string,string>} roles @param {string|null} current @param {Set<string>|null} [presentIds] */
export function nextLeader(roles, current, presentIds = null) {
  const pool = Object.entries(roles || {}).filter(([id, t]) => t === 'lead' && (!presentIds || presentIds.has(id))).map(([id]) => id).sort();
  const all = pool.length ? pool : Object.keys(roles || {}).filter((id) => !presentIds || presentIds.has(id)).sort();
  if (!all.length) return null;
  const i = all.indexOf(current);
  return all[(i + 1) % all.length];
}

// الاسم المختصر للعرض العام: الاسم الأول فقط
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

// حالة القاعة كما يراها طرف: viewer = { kind: 'participant'|'admin', id }
/** @param {any} args */
export function hallView({ session, sentence, members, roles, presence, answers, points, viewer, now = Date.now() }) {
  const revealed = !!(sentence && (session.revealed || []).includes(sentence.id));
  const isAdmin = viewer?.kind === 'admin';
  const present = new Map((presence || []).map((p) => [p.participant_id, p]));
  const ansBy = new Map((answers || []).filter((a) => sentence && a.sentence_id === sentence.id).map((a) => [a.participant_id, a]));
  const people = (members || []).map((m) => {
    const pr = present.get(m.id);
    const a = ansBy.get(m.id);
    const showChoice = revealed || isAdmin || m.id === viewer?.id;
    return {
      id: m.id, name: isAdmin ? m.name : firstName(m.name), level: m.level || null, title: m.title || null, org: m.org || null,
      team: roles?.[m.id] || null,
      present: !!pr && now - new Date(pr.last_seen).getTime() < HALL_PRESENT_SECONDS * 1000,
      joined: !!pr, hand: !!pr?.hand,
      leader: session.leader_id === m.id, persona: session.persona_id === m.id,
      answered: !!a, choice: a && showChoice ? a.choice : null,
      points: a && revealed ? katonScore(a.choice, sentence.key, points) : null,
      ...(isAdmin && a?.note ? { note: a.note } : {}),
    };
  });
  const answered = people.filter((p) => p.answered).length;
  const teams = Object.fromEntries(HALL_TEAMS.map((t) => {
    const ps = people.filter((p) => p.team === t);
    return [t, { count: ps.length, present: ps.filter((p) => p.present).length, score: revealed ? ps.reduce((s, p) => s + (p.points || 0), 0) : null }];
  }));
  return {
    session: {
      id: session.id, mode: session.mode, stage: session.stage, round: session.round, version: session.version,
      split_method: session.split_method, persona_ar: session.persona_ar, code: isAdmin ? session.code : undefined,
    },
    sentence: sentence ? {
      id: sentence.id, sort: sentence.sort, question: sentence.question, text_ar: sentence.text_ar, tasks: sentence.tasks || {},
      ...(revealed ? { key: sentence.key, explain_ar: sentence.explain_ar } : {}),
    } : null,
    revealed,
    people, teams,
    answered, total: people.length,
    // التوزيع للخبير دائمًا، وللجميع بعد الكشف فقط
    distribution: isAdmin || revealed ? sentenceDistribution([...ansBy.values()]) : null,
  };
}
