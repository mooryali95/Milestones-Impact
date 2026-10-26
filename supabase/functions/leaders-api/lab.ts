// ════════════════════════════════════════════════════════════════
// مختبر القائد: أدوات العمل ومواقف المحاكاة للمشارك
// ════════════════════════════════════════════════════════════════
// المحاولة تمضي خطوة خطوة: الخادم يعرف الخطوة الحالية، فيصحح إجابتها
// ويحدد التالية (قد تتفرع بحسب القرار)، ولا تُرسل الإجابات الصحيحة قبل
// الإجابة. أول محاولة مكتملة قياس ابتدائي، وأفضل محاولة تُعتمد للنقاط:
// نقاط الأداة عند الإتقان (70%) ومكافأة عند التميز (90%)، مرة واحدة لكل منهما.
import { db, Fail, must } from './core.ts';
import { approvedLevels, award, pointsOf } from './participant.ts';
import { modelsFor, seededShuffle } from './logic.js';
import { gradeStep, labAward, meterState, nextIndex, practicePct, publicSpec } from './lab.js';

type Body = Record<string, any>;

const STARTS_PER_DAY = 40;
const ANSWER_MAX = 20000;

async function myItem(p: any, id: unknown) {
  const levels = await approvedLevels(p);
  const it = must(await db.from('lab_items').select('*').eq('id', String(id || '')).maybeSingle());
  if (!it || !modelsFor([it], levels).length) throw new Fail('هذه الأداة لا تخص مسارك', 404);
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

// بطاقات المختبر لمسار المشارك، وتُستعمل أيضًا تحت كل باب في الكتاب
export async function itemsFor(p: any, levels: Record<string, string>, where: { dimension?: string; chapter_key?: string } = {}) {
  let q = db.from('lab_items').select('id, key, kind, dimension, chapter_key, min_level, sort, title_ar, summary_ar, minutes, points, active, spec');
  if (where.dimension) q = q.eq('dimension', where.dimension);
  if (where.chapter_key) q = q.eq('chapter_key', where.chapter_key);
  const [items, att] = await Promise.all([
    q,
    db.from('lab_attempts').select('id, item_id, pct, started_at, finished_at').eq('participant_id', p.id),
  ]);
  const mine = modelsFor(must(items) ?? [], levels);
  const sum = summarize(att.data || []);
  return mine.map((it: any) => ({ ...meta(it), progress: sum[it.id] || { attempts: 0, first: null, best: null, open: null, last_at: null } }));
}

export async function list(p: any) {
  const levels = await approvedLevels(p);
  const [items, pts] = await Promise.all([itemsFor(p, levels), pointsOf(p.id)]);
  return { success: true, items, points: { total: pts.total, rank: pts.rank } };
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
