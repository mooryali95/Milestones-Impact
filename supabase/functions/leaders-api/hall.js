// ════════════════════════════════════════════════════════════════
// القاعة الحية: الفرق، والتقسيم، وتدوير القيادة، وما يراه كل طرف
// ════════════════════════════════════════════════════════════════
// منطق بلا قاعدة بيانات. الخادم يحفظ الحالة، وهذا يقرر من يرى ماذا ومتى:
// الاختيارات لا تظهر للزملاء قبل الكشف (حتى لا يتأثر أحد بغيره)، وبعده تظهر بنقاطها.
import { autoGroups } from './groups.js';
import { katonScore, normalizeAnswer, sentenceDistribution } from './katon.js';

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

// الطاولات: داخل كل فريق طاولات مرقّمة من HALL_TABLE_SIZE إلى HALL_TABLE_MAX (التعلم القائم على الفرق: مجموعة نقاش لا تزيد على سبعة).
// stored = { participant_id: رقم طاولته المحفوظ }. المحفوظ يبقى ما دام صاحبه في فريق طاولته؛ ومن لا طاولة له
// (متأخر، أو نُقل إلى فريق آخر) يُلحق بأصغر طاولات فريقه ولو بلغت ثمانية (مقعد زائد خير من طاولة بفرد واحد)،
// وتُفتح طاولة جديدة حين تتجاوز كلها الحد.
// order: ترتيب المعرّفات عند التوزيع الأول (متنوع المستويات مثلًا)، وإلا أبجديًا فيثبت الناتج.
export const HALL_TABLE_SIZE = 6;
export const HALL_TABLE_MAX = 7;
/** @param {Record<string,string>} roles @param {Record<string,number>} [stored] @param {string[]|null} [order] */
export function assignTables(roles, stored = {}, order = null) {
  const out = {};
  const tables = new Map();
  const known = Object.keys(roles || {}).sort();
  const rank = new Map((order || []).map((id, i) => [id, i]));
  const ids = order ? [...known].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || (a < b ? -1 : 1)) : known;
  // فريق الطاولة المحفوظة فريق أغلب الجالسين عليها؛ فمن نُقل وحده إلى فريق آخر هو من يتركها لا زملاؤه
  const votes = new Map();
  const seatOf = (id) => { const no = Number((stored || {})[id]); return Number.isInteger(no) && no >= 1 ? no : null; };
  for (const id of known) { const no = seatOf(id); if (!no) continue; const v = votes.get(no) || {}; v[roles[id]] = (v[roles[id]] || 0) + 1; votes.set(no, v); }
  for (const [no, v] of votes) tables.set(no, { team: Object.keys(v).sort((x, y) => v[y] - v[x] || (x < y ? -1 : 1))[0], ids: [] });
  for (const id of known) { const no = seatOf(id); if (no && tables.get(no).team === roles[id]) { tables.get(no).ids.push(id); out[id] = no; } }
  let next = Math.max(0, ...tables.keys()) + 1;
  for (const team of ['lead', 'support', 'guide', 'eval']) {
    const pending = ids.filter((id) => roles[id] === team && !out[id]);
    if (!pending.length) continue;
    const mine = [...tables.entries()].filter(([, t]) => t.team === team).sort((a, b) => a[0] - b[0]);
    if (!mine.length) {
      let k = Math.max(1, Math.round(pending.length / HALL_TABLE_SIZE));
      while (pending.length / k > HALL_TABLE_MAX) k++;
      for (let i = 0; i < k; i++) { const t = { team, ids: [] }; tables.set(next, t); mine.push([next, t]); next++; }
      pending.forEach((id, i) => { const [no, t] = mine[i % k]; t.ids.push(id); out[id] = no; });
      continue;
    }
    for (const id of pending) {
      let [no, t] = [...mine].sort((a, b) => a[1].ids.length - b[1].ids.length || a[0] - b[0])[0];
      if (t.ids.length > HALL_TABLE_MAX) { t = { team, ids: [] }; no = next++; tables.set(no, t); mine.push([no, t]); }
      t.ids.push(id); out[id] = no;
    }
  }
  return out;
}

// ما يُعرض على الشاشة الكبيرة: حالة الخبير بلا ما يُحجب عن المشاركين قبل الكشف (أحكام الأفراد وتوزيعها وملاحظاتهم)
export function publicView(view) {
  if (!view || view.revealed) return view;
  return {
    ...view, distribution: null,
    people: (view.people || []).map((p) => { const q = { ...p, choice: null, confidence: null, stances: [] }; delete q.note; return q; }),
  };
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
// الاسم الأول للتحية والعرض العام، بعد تخطّي الألقاب (م، د، أ، المهندس، الدكتور…)
const TITLES = new Set(['م', 'م.', 'د', 'د.', 'أ', 'أ.', 'ا', 'أ.د', 'أ.د.', 'م/', 'د/', 'أ/', 'المهندس', 'مهندس', 'الدكتور', 'دكتور', 'الأستاذ', 'أستاذ', 'الاستاذ', 'استاذ', 'Dr', 'Dr.', 'Eng', 'Eng.', 'Mr', 'Mr.', 'Ms', 'Ms.', 'Prof', 'Prof.']);
export const firstName = (n) => String(n || '').trim().split(/\s+/).find((w) => w && !TITLES.has(w)) || String(n || '').trim().split(/\s+/)[0] || '';

// حالة القاعة كما يراها طرف: viewer = { kind: 'participant'|'admin', id }
/** @param {any} args */
export function hallView({ session, sentence, members, roles, tables = {}, presence, answers, points, viewer, now = Date.now() }) {
  const seat = assignTables(roles || {}, tables);
  const revealed = !!(sentence && (session.revealed || []).includes(sentence.id));
  const isAdmin = viewer?.kind === 'admin';
  const present = new Map((presence || []).map((p) => [p.participant_id, p]));
  const ansBy = new Map((answers || []).filter((a) => sentence && a.sentence_id === sentence.id).map((a) => [a.participant_id, a]));
  const people = (members || []).map((m) => {
    const pr = present.get(m.id);
    const a = ansBy.get(m.id);
    const na = a ? normalizeAnswer(a) : null;
    const showChoice = revealed || isAdmin || m.id === viewer?.id;
    return {
      id: m.id, name: isAdmin ? m.name : firstName(m.name), level: m.level || null, title: m.title || null, org: m.org || null,
      team: roles?.[m.id] || null, table: (roles?.[m.id] && seat[m.id]) || null,
      present: !!pr && now - new Date(pr.last_seen).getTime() < HALL_PRESENT_SECONDS * 1000,
      joined: !!pr, hand: !!pr?.hand,
      leader: session.leader_id === m.id, persona: session.persona_id === m.id,
      // الحكم (صحيحة/خاطئة) بدرجة ثقته ووسوم الموقف؛ لا تظهر للزملاء قبل الكشف
      answered: !!a, choice: na && showChoice ? na.verdict : null, confidence: na && showChoice ? na.confidence : null, stances: na && showChoice ? na.stances : [],
      points: a && revealed ? katonScore(na, sentence.key, points) : null,
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
    tables: [...new Set(people.map((p) => p.table).filter(Boolean))].sort((x, y) => x - y).map((no) => {
      const ps = people.filter((p) => p.table === no);
      return { no, team: ps[0].team, count: ps.length };
    }),
    answered, total: people.length,
    // التوزيع للخبير دائمًا، وللجميع بعد الكشف فقط
    distribution: isAdmin || revealed ? sentenceDistribution([...ansBy.values()]) : null,
  };
}
