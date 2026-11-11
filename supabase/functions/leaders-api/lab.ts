// ════════════════════════════════════════════════════════════════
// مختبر القائد: أدوات العمل ومواقف المحاكاة للمشارك
// ════════════════════════════════════════════════════════════════
// المحاولة تمضي خطوة خطوة: الخادم يعرف الخطوة الحالية، فيصحح إجابتها
// ويحدد التالية (قد تتفرع بحسب القرار)، ولا تُرسل الإجابات الصحيحة قبل
// الإجابة. أول محاولة مكتملة قياس ابتدائي، وأفضل محاولة تُعتمد للنقاط:
// نقاط الأداة عند الإتقان (70%) ومكافأة عند التميز (90%)، مرة واحدة لكل منهما.
// المختبر قسم مستقل: يراه من فتحته له الإدارة أو لجهته (lab_grants)، ومن
// اعتُمد مستواه إن كانت الأداة مفتوحة للجميع (labVisible في lab.js).
import { all, audit, db, Fail, must } from './core.ts';
import { journeyDefinition, releaseOf } from './programs.ts';
import { approvedLevels, award, pointsOf } from './participant.ts';
import { requirementApplies, seededShuffle } from './logic.js';
import type { Admin } from './admin.ts';
import {
  AUDIENCES, BOARD_FEEDBACK, boardCheck, boardScaffold, gradeStep, grantLive, HINT_MAX, hintCount, hintFor, hintsView, labAward, labLevelOf, labVisible, MASTERY,
  meterState, nextIndex, practicePct, publicSpec, revealedOf, boardCardStats, LEVELS,
} from './lab.js';

type Body = Record<string, any>;

const STARTS_PER_DAY = 40;
const ANSWER_MAX = 20000;

const ITEM_COLS = 'id, key, kind, dimension, chapter_key, min_level, sort, title_ar, summary_ar, minutes, points, active, audience, spec';

// أدوات المختبر التي يراها المشارك الآن
// أدوات المختبر المطلوبة في رحلة المشارك (متطلب «أداة من المختبر» يخصه): تُفتح له بلا منح
async function requiredLabKeys(p: any, levels: Record<string, string> | null) {
  const def = await journeyDefinition(p).catch(() => null);
  return (def?.requirements || []).filter((r: any) => r.kind === 'lab' && requirementApplies(r, levels || {}))
    .map((r: any) => String(r.config?.lab_key || '')).filter(Boolean);
}

async function visible(p: any) {
  const levels = await approvedLevels(p).catch(() => null);
  const or = [`participant_id.eq.${p.id}`, ...(p.organization_id ? [`organization_id.eq.${p.organization_id}`] : [])].join(',');
  const [items, grants, required] = await Promise.all([
    db.from('lab_items').select(ITEM_COLS),
    db.from('lab_grants').select('organization_id, participant_id, item_id, expires_at').or(or),
    requiredLabKeys(p, levels),
  ]);
  return { levels, items: labVisible(must(items) ?? [], { levels, participantId: p.id, organizationId: p.organization_id, grants: must(grants) ?? [], required }) };
}
const visibleItems = async (p: any) => (await visible(p)).items;

// الأداة ومستوى المشارك في إطارها: به تُحسم سقالة اللوحة والخطوات الخاصة بمستويات (labLevelOf)
async function myItem(p: any, id: unknown) {
  const { items, levels } = await visible(p);
  const it = items.find((x: any) => x.id === String(id || ''));
  if (!it) throw new Fail('هذه الأداة غير متاحة لك', 404);
  return { ...it, level: labLevelOf(levels, it.dimension) };
}

// ملخص محاولات المشارك لكل أداة: الأولى (القياس الابتدائي)، والأفضل، والعدد، والمفتوحة
function summarize(rows: any[]) {
  const by: Record<string, any> = {};
  for (const r of rows.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))) {
    const s = by[r.item_id] ||= { attempts: 0, first: null, best: null, open: null, last_at: null };
    if (r.finished_at) {
      s.attempts += 1;
      if (s.first === null) s.first = r.pct;
      s.best = Math.max(s.best ?? 0, r.pct);
      s.last_at = r.finished_at;
    } else s.open = r.id;
  }
  return by;
}

const meta = (it: any) => ({
  id: it.id, key: it.key, kind: it.kind, dimension: it.dimension, chapter_key: it.chapter_key, min_level: it.min_level,
  title: it.title_ar, summary: it.summary_ar || '', minutes: it.minutes, points: it.points, steps: (it.spec?.steps || []).length,
});

// قسم المختبر، وبطاقات "طبّق ما قرأت" تحت كل باب في الكتاب
export async function list(p: any) {
  const [items, att, pts] = await Promise.all([
    visibleItems(p),
    db.from('lab_attempts').select('id, item_id, pct, started_at, finished_at').eq('participant_id', p.id),
    pointsOf(p.id),
  ]);
  const sum = summarize(att.data || []);
  const empty = { attempts: 0, first: null, best: null, open: null, last_at: null };
  return { success: true, items: items.map((it: any) => ({ ...meta(it), progress: sum[it.id] || empty })), points: { total: pts.total, rank: pts.rank } };
}

// حالة المحاولة كما يراها المشارك: ما أجاب عنه بنتائجه، والخطوة الحالية، والمؤشرات،
// ومسودة الخطوة الجارية وتلميحاتها وفحوصها (للوحة) ليستأنف من حيث توقف
function attemptView(it: any, a: any) {
  const results = a.results || {};
  const cur = it.spec?.steps?.[a.current];
  return {
    id: a.id, current: a.current, path: a.path || [], answers: a.answers || {}, done: !!a.finished_at, pct: a.pct,
    results: Object.fromEntries((a.path || []).filter((i: number) => results[i]).map((i: number) => [i, results[i]])),
    meters: meterState(it.spec, (a.path || []).map((i: number) => results[i]?.effects)),
    draft: a.draft?.[a.current] ?? null,
    hints: cur?.type === 'board' ? hintsView(cur, a.hints?.[a.current]) : {},
    checks_used: Number(a.checks?.[a.current]) || 0,
    hint_count: hintCount(a.hints),
  };
}

// مستوى المحاولة: المثبّت عند بدئها، وإلا مستوى المشارك الآن (محاولة قبل ترحيل 20261111120200)
const levelOfAttempt = (it: any, a: any) => (a?.level && ['beginner', 'intermediate', 'advanced'].includes(a.level) ? a.level : it.level);

export async function start(p: any, b: Body) {
  const it = await myItem(p, b.id);
  let a = must(await db.from('lab_attempts').select('*').eq('participant_id', p.id).eq('item_id', it.id).is('finished_at', null)
    .order('started_at', { ascending: false }).limit(1).maybeSingle());
  if (a && b.fresh) {
    await db.from('lab_attempts').delete().eq('id', a.id);
    a = null;
  }
  if (!a) {
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const { count } = await db.from('lab_attempts').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).gte('started_at', dayAgo);
    if ((count ?? 0) >= STARTS_PER_DAY) throw new Fail('بدأت محاولات كثيرة اليوم، تابع غدًا', 429, 'rate');
    // D02: إصدار محتوى الدفعة مع كل محاولة، إلزامي: null لدفعة بلا إصدار وحدها، وخطأ القراءة أو الحفظ يرمي
    const release = (await releaseOf(p))?.id ?? null;
    const row = { participant_id: p.id, item_id: it.id, content_release: release };
    // المستوى يُثبَّت مع المحاولة؛ وقبل ترحيل 20261111120200 تُنشأ بلا عمود المستوى (deploy-gate: tolerant)
    const first = await db.from('lab_attempts').insert({ ...row, level: it.level }).select('*').single();
    a = first.error ? must(await db.from('lab_attempts').insert(row).select('*').single()) : first.data;
  }
  const level = levelOfAttempt(it, a);
  return {
    success: true,
    item: { ...meta(it), level },
    spec: publicSpec(it.spec, (list: any[], salt: string) => seededShuffle(list, `${a.id}${salt}`), level),
    attempt: attemptView(it, a),
  };
}

// المحاولة الجارية للمشارك عند خطوتها الحالية، لأفعال ما قبل الإرسال (المسودة والتلميح والفحص)
async function openStep(p: any, b: Body) {
  const a = must(await db.from('lab_attempts').select('*').eq('id', String(b.attempt || '')).eq('participant_id', p.id).maybeSingle());
  if (!a) throw new Fail('المحاولة غير موجودة', 404);
  if (a.finished_at) throw new Fail('انتهت هذه المحاولة، ابدأ محاولة جديدة', 409, 'finished');
  const it = await myItem(p, a.item_id);
  const i = Number(b.step);
  const step = it.spec?.steps?.[i];
  if (i !== a.current || !step) throw new Fail('هذه ليست الخطوة الحالية، أعد فتح الأداة', 409, 'step');
  return { a, it, i, step, level: levelOfAttempt(it, a) };
}
// تحديث حقل من حالة المحاولة الجارية مشروطًا بالخطوة، فلا يكتب على خطوة أُرسلت. null: العمود غير موجود بعد
async function patchOpen(a: any, i: number, patch: Body) {
  const res = await db.from('lab_attempts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', a.id).eq('current', i).is('finished_at', null).select('id');
  if (res.error) return null;
  if (!res.data?.length) throw new Fail('هذه ليست الخطوة الحالية، أعد فتح الأداة', 409, 'step');
  return true;
}

// الحفظ التلقائي: مسودة الخطوة الجارية، لا تُصحَّح. saved: false قبل ترحيل الحالة فيعرف المشارك أنها لم تُحفظ
export async function draft(p: any, b: Body) {
  const { a, i } = await openStep(p, b);
  if (JSON.stringify(b.answer ?? null).length > ANSWER_MAX) throw new Fail('الإجابة أطول من المسموح');
  const ok = await patchOpen(a, i, { draft: { [i]: b.answer ?? null } });
  return { success: true, saved: !!ok, at: new Date().toISOString() };
}

// تلميح لبطاقة في اللوحة: الدرجة التالية في السلّم، ويُسجَّل قبل أن يُعاد
export async function hint(p: any, b: Body) {
  const { a, i, step, level } = await openStep(p, b);
  if (step.type !== 'board') throw new Fail('التلميحات للوحة فقط');
  const card = (step.cards || []).find((c: any) => c.id === String(b.card || ''));
  if (!card || boardScaffold(step, level).solved_rows.includes(card.row)) throw new Fail('البطاقة غير موجودة');
  if (!('hints' in a)) throw new Fail('التلميحات غير متاحة بعد، أكمل بلا تلميح', 503, 'unavailable');
  const mine = { ...(a.hints?.[i] || {}) };
  const degree = Math.min(HINT_MAX, (Number(mine[card.id]) || 0) + 1);
  mine[card.id] = degree;
  const ok = await patchOpen(a, i, { hints: { ...(a.hints || {}), [i]: mine } });
  if (!ok) throw new Fail('التلميحات غير متاحة بعد، أكمل بلا تلميح', 503, 'unavailable');
  return { success: true, hint: hintFor(step, card.id, degree), hint_count: hintCount({ ...(a.hints || {}), [i]: mine }) };
}

// فحص اللوحة قبل الإرسال بسقالة المستوى: بطاقة عند وضعها للتأسيسي، وعدد الخطأ مرتين للمتوسط
export async function check(p: any, b: Body) {
  const { a, i, step, level } = await openStep(p, b);
  if (step.type !== 'board') throw new Fail('الفحص للوحة فقط');
  if (JSON.stringify(b.answer ?? null).length > ANSWER_MAX) throw new Fail('الإجابة أطول من المسموح');
  const sc = boardScaffold(step, level);
  if (sc.feedback === 'check2') {
    if (!('checks' in a)) throw new Fail('الفحص غير متاح بعد، أكمل وأرسل', 503, 'unavailable');
    const used = Number(a.checks?.[i]) || 0;
    if (used >= BOARD_FEEDBACK.check2) throw new Fail('استعملت مرتي الفحص في هذه الخطوة', 409, 'checks');
    const r: any = boardCheck(step, b.answer, level);
    if (r.error) throw new Fail(r.error);
    const ok = await patchOpen(a, i, { checks: { ...(a.checks || {}), [i]: used + 1 }, draft: { [i]: b.answer ?? null } });
    if (!ok) throw new Fail('الفحص غير متاح بعد، أكمل وأرسل', 503, 'unavailable');
    return { success: true, ...r, checks_left: BOARD_FEEDBACK.check2 - used - 1 };
  }
  const r: any = boardCheck(step, b.answer, level, String(b.card || ''));
  if (r.error) throw new Fail(r.error);
  return { success: true, ...r };
}

export async function answer(p: any, b: Body) {
  const a = must(await db.from('lab_attempts').select('*').eq('id', String(b.attempt || '')).eq('participant_id', p.id).maybeSingle());
  if (!a) throw new Fail('المحاولة غير موجودة', 404);
  if (a.finished_at) throw new Fail('انتهت هذه المحاولة، ابدأ محاولة جديدة', 409, 'finished');
  const it = await myItem(p, a.item_id);
  const level = levelOfAttempt(it, a);
  const steps = it.spec?.steps || [];
  const i = Number(b.step);
  if (i !== a.current || !steps[i]) throw new Fail('هذه ليست الخطوة الحالية، أعد فتح الأداة', 409, 'step');
  if (JSON.stringify(b.answer ?? null).length > ANSWER_MAX) throw new Fail('الإجابة أطول من المسموح');
  // البطاقة المكشوفة بالتلميح الأخير تُوضع في خانتها ودرجتها صفر
  const result = gradeStep(steps[i], b.answer, { level, revealed: revealedOf(a.hints?.[i]) });
  if (steps[i].type === 'board') result.hints = Object.values(a.hints?.[i] || {}).reduce((n: number, d: any) => n + (Number(d) || 0), 0);
  const next = nextIndex(it.spec, i, b.answer, level);
  const path = [...(a.path || []), i];
  const results = { ...(a.results || {}), [i]: result };
  const answers = { ...(a.answers || {}), [i]: b.answer ?? null };
  const row: Body = { path, results, answers, current: next, updated_at: new Date().toISOString() };
  // المسودة تُمحى بالإرسال (إن وُجد عمودها)
  if ('draft' in a) row.draft = {};
  const pct = next < 0 ? practicePct(it.spec, results, path) : null;
  if (next < 0) Object.assign(row, { pct, finished_at: new Date().toISOString() });
  // التحديث مشروط بالخطوة الحالية، فإرسال الإجابة مرتين لا يُحتسب مرتين
  const saved = must(await db.from('lab_attempts').update(row).eq('id', a.id).eq('current', i).is('finished_at', null).select('id'));
  if (!saved?.length) throw new Fail('سُجلت إجابة هذه الخطوة من قبل، أعد فتح الأداة', 409, 'step');
  let finish: any = null;
  if (next < 0) {
    const { count } = await db.from('lab_attempts').select('id', { count: 'exact', head: true })
      .eq('participant_id', p.id).eq('item_id', it.id).not('finished_at', 'is', null);
    const prize = labAward(it.points, pct);
    // award يمنح مرة واحدة لكل مصدر ومرجع، فالإعادة بعد الإتقان لا تضاعف النقاط
    const gained = (await award(p.id, 'lab', it.id, prize.mastery, it.title_ar)) + (await award(p.id, 'lab_bonus', it.id, prize.excellence, `تميّز: ${it.title_ar}`));
    finish = { pct, first: count === 1, gained, closing_ar: it.spec?.closing_ar || '', hints: hintCount(a.hints) };
  }
  const meters = meterState(it.spec, path.map((k: number) => results[k]?.effects));
  if (finish) {
    const pts = await pointsOf(p.id);
    finish.points = { total: pts.total, rank: pts.rank };
  }
  return { success: true, step: i, result, next, meters, finish };
}

// ════════════════════════════════════════════════════════════════
// الإدارة: من يرى المختبر، وكيف يؤدي المشاركون فيه
// ════════════════════════════════════════════════════════════════
const uuid = (v: unknown) => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null);

export async function adminOverview() {
  const [items, grants, att, orgs] = await Promise.all([
    db.from('lab_items').select('id, key, kind, dimension, chapter_key, min_level, sort, title_ar, minutes, points, active, audience').order('sort'),
    db.from('lab_grants').select('id, organization_id, participant_id, item_id, expires_at, created_by, created_at, participants(full_name, email, organization_id)').order('created_at', { ascending: false }),
    all((f, t) => db.from('lab_attempts').select('item_id, participant_id, pct').not('finished_at', 'is', null).order('id').range(f, t)),
    db.from('organizations').select('id, name, short_name, status').order('name'),
  ]);
  // لكل أداة: من جرّبها، وكم محاولة، ومتوسط أفضل نتيجة، ومن أتقن
  const best: Record<string, Record<string, number>> = {};
  const tries: Record<string, number> = {};
  for (const a of att) {
    tries[a.item_id] = (tries[a.item_id] || 0) + 1;
    const m = best[a.item_id] ||= {};
    m[a.participant_id] = Math.max(m[a.participant_id] ?? 0, a.pct ?? 0);
  }
  const now = Date.now();
  return {
    success: true,
    audiences: AUDIENCES,
    mastery: MASTERY,
    items: (must(items) ?? []).map((it: any) => {
      const b = Object.values(best[it.id] || {});
      return { ...it, stats: { people: b.length, attempts: tries[it.id] || 0, avg_best: b.length ? Math.round(b.reduce((x, y) => x + y, 0) / b.length) : null, mastered: b.filter((x) => x >= MASTERY).length } };
    }),
    grants: (must(grants) ?? []).map((g: any) => ({ ...g, live: grantLive(g, now) })),
    orgs: must(orgs) ?? [],
  };
}

// تفعيل الأداة أو إيقافها، ولمن تظهر
export async function adminItem(a: Admin, b: Body) {
  const id = uuid(b.id);
  if (!id) throw new Fail('الأداة غير محددة');
  const patch: Body = { updated_at: new Date().toISOString() };
  if ('active' in b) patch.active = !!b.active;
  if ('audience' in b) {
    if (!(b.audience in AUDIENCES)) throw new Fail('الجمهور غير صحيح');
    patch.audience = b.audience;
  }
  const r = must(await db.from('lab_items').update(patch).eq('id', id).select('id'));
  if (!r?.length) throw new Fail('الأداة غير موجودة', 404);
  await audit('admin', a.email, 'lab.item', 'lab_items', id, null, patch);
  return { success: true };
}

// فتح المختبر لجهة أو لشخص (بالبريد)، كله أو أداة منه، ولمدة اختيارية.
// تكرار المنح نفسه يجدد مدته بدل أن يضيف سطرًا ثانيًا.
export async function adminGrant(a: Admin, b: Body) {
  let organization_id = uuid(b.organization_id);
  let participant_id: string | null = null;
  if (!organization_id) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!email) throw new Fail('اختر جهة أو اكتب بريد المشارك');
    const p = must(await db.from('participants').select('id').eq('email', email).maybeSingle());
    if (!p) throw new Fail('لا مشارك بهذا البريد');
    participant_id = p.id;
  }
  const item_id = b.item_id ? uuid(b.item_id) : null;
  if (b.item_id && !item_id) throw new Fail('الأداة غير محددة');
  let expires_at: string | null = null;
  if (b.expires_at) {
    // تاريخ بلا وقت: ينتهي المنح بنهاية ذلك اليوم بتوقيت الرياض
    const raw = String(b.expires_at);
    const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59+03:00` : raw);
    if (Number.isNaN(t) || t < Date.now()) throw new Fail('تاريخ الانتهاء يجب أن يكون في المستقبل');
    expires_at = new Date(t).toISOString();
  }
  let q = db.from('lab_grants').select('id');
  q = organization_id ? q.eq('organization_id', organization_id) : q.eq('participant_id', participant_id);
  q = item_id ? q.eq('item_id', item_id) : q.is('item_id', null);
  const old = must(await q.maybeSingle());
  if (organization_id && !must(await db.from('organizations').select('id').eq('id', organization_id).maybeSingle())) throw new Fail('الجهة غير موجودة', 404);
  if (old) must(await db.from('lab_grants').update({ expires_at, created_by: a.email, created_at: new Date().toISOString() }).eq('id', old.id));
  else must(await db.from('lab_grants').insert({ organization_id, participant_id, item_id, expires_at, created_by: a.email }));
  await audit('admin', a.email, 'lab.grant', 'lab_grants', old?.id ?? null, null, { organization_id, participant_id, item_id, expires_at });
  return { success: true, renewed: !!old };
}

export async function adminRevoke(a: Admin, b: Body) {
  const id = uuid(b.id);
  if (!id) throw new Fail('المنح غير محدد');
  const gone = must(await db.from('lab_grants').delete().eq('id', id).select('organization_id, participant_id, item_id, expires_at'));
  if (gone?.length) await audit('admin', a.email, 'lab.revoke', 'lab_grants', id, gone[0], null);
  return { success: true };
}

// معاينة الأداة كما يراها مشارك بمستوى تختاره الإدارة: السقالة والخطوات بلا حلول، ولا محاولة تُنشأ
export async function adminPreview(b: Body) {
  const id = uuid(b.id);
  if (!id) throw new Fail('الأداة غير محددة');
  const level = LEVELS.includes(String(b.level)) ? String(b.level) : 'beginner';
  const it = must(await db.from('lab_items').select(ITEM_COLS).eq('id', id).maybeSingle());
  if (!it) throw new Fail('الأداة غير موجودة', 404);
  return { success: true, item: { ...meta(it), level }, spec: publicSpec(it.spec, (list: any[]) => list, level) };
}

// تحليل البطاقات: لكل لوحة في الأداة، نسبة صواب كل بطاقة وأكثر خانة خاطئة ومتوسط درجة التلميح، من المحاولات
// التي أُجيبت فيها اللوحة، بلا حساب العرض وحسابات الاختبار (forStats)
export async function adminCards(b: Body) {
  const id = uuid(b.id);
  if (!id) throw new Fail('الأداة غير محددة');
  const it = must(await db.from('lab_items').select(ITEM_COLS).eq('id', id).maybeSingle());
  if (!it) throw new Fail('الأداة غير موجودة', 404);
  const boards = (it.spec?.steps || []).map((st: any, i: number) => ({ st, i })).filter((x: any) => x.st.type === 'board');
  if (!boards.length) return { success: true, boards: [] };
  // بـ* لتحمل عمود التلميحات قبل ترحيل 20261111120200 وبعده
  const rows = await all((f, t) => db.from('lab_attempts').select('*, participants!inner(is_demo, is_test)').eq('item_id', id)
    .eq('participants.is_demo', false).eq('participants.is_test', false).order('id').range(f, t));
  return {
    success: true,
    boards: boards.map(({ st, i }: any) => ({
      step: i, title: st.title_ar || '', rows: st.rows, cols: st.cols,
      attempts: rows.filter((a: any) => a.answers && i in a.answers).length,
      cards: boardCardStats(st, i, rows),
    })),
  };
}
