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
import { approvedLevels, award, pointsOf } from './participant.ts';
import { seededShuffle } from './logic.js';
import type { Admin } from './admin.ts';
import { AUDIENCES, gradeStep, grantLive, labAward, labVisible, MASTERY, meterState, nextIndex, practicePct, publicSpec } from './lab.js';

type Body = Record<string, any>;

const STARTS_PER_DAY = 40;
const ANSWER_MAX = 20000;

const ITEM_COLS = 'id, key, kind, dimension, chapter_key, min_level, sort, title_ar, summary_ar, minutes, points, active, audience, spec';

// أدوات المختبر التي يراها المشارك الآن
async function visibleItems(p: any) {
  const levels = await approvedLevels(p).catch(() => null);
  const or = [`participant_id.eq.${p.id}`, ...(p.organization_id ? [`organization_id.eq.${p.organization_id}`] : [])].join(',');
  const [items, grants] = await Promise.all([
    db.from('lab_items').select(ITEM_COLS),
    db.from('lab_grants').select('organization_id, participant_id, item_id, expires_at').or(or),
  ]);
  return labVisible(must(items) ?? [], { levels, participantId: p.id, organizationId: p.organization_id, grants: must(grants) ?? [] });
}

async function myItem(p: any, id: unknown) {
  const it = (await visibleItems(p)).find((x: any) => x.id === String(id || ''));
  if (!it) throw new Fail('هذه الأداة غير متاحة لك', 404);
  return it;
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

// حالة المحاولة كما يراها المشارك: ما أجاب عنه بنتائجه، والخطوة الحالية، والمؤشرات
function attemptView(it: any, a: any) {
  const results = a.results || {};
  return {
    id: a.id, current: a.current, path: a.path || [], answers: a.answers || {}, done: !!a.finished_at, pct: a.pct,
    results: Object.fromEntries((a.path || []).filter((i: number) => results[i]).map((i: number) => [i, results[i]])),
    meters: meterState(it.spec, (a.path || []).map((i: number) => results[i]?.effects)),
  };
}

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
    a = must(await db.from('lab_attempts').insert({ participant_id: p.id, item_id: it.id }).select('*').single());
  }
  return {
    success: true,
    item: meta(it),
    spec: publicSpec(it.spec, (list: any[], salt: string) => seededShuffle(list, `${a.id}${salt}`)),
    attempt: attemptView(it, a),
  };
}

export async function answer(p: any, b: Body) {
  const a = must(await db.from('lab_attempts').select('*').eq('id', String(b.attempt || '')).eq('participant_id', p.id).maybeSingle());
  if (!a) throw new Fail('المحاولة غير موجودة', 404);
  if (a.finished_at) throw new Fail('انتهت هذه المحاولة، ابدأ محاولة جديدة', 409, 'finished');
  const it = await myItem(p, a.item_id);
  const steps = it.spec?.steps || [];
  const i = Number(b.step);
  if (i !== a.current || !steps[i]) throw new Fail('هذه ليست الخطوة الحالية، أعد فتح الأداة', 409, 'step');
  if (JSON.stringify(b.answer ?? null).length > ANSWER_MAX) throw new Fail('الإجابة أطول من المسموح');
  const result = gradeStep(steps[i], b.answer);
  const next = nextIndex(it.spec, i, b.answer);
  const path = [...(a.path || []), i];
  const results = { ...(a.results || {}), [i]: result };
  const answers = { ...(a.answers || {}), [i]: b.answer ?? null };
  const row: Body = { path, results, answers, current: next, updated_at: new Date().toISOString() };
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
    finish = { pct, first: count === 1, gained, closing_ar: it.spec?.closing_ar || '' };
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
