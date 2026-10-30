// ════════════════════════════════════════════════════════════════
// مختبر القائد: أدوات عمل ومواقف محاكاة تُصحح على الخادم
// ════════════════════════════════════════════════════════════════
// كل أداة أو موقف مواصفة (JSON) من خطوات بأنواع محدودة، فإضافة أداة
// جديدة كتابة محتوى لا برمجة:
//   order     ترتيب عناصر
//   classify  تصنيف عناصر في خانات
//   match     مطابقة كل عنصر بخيار
//   choice    قرار، ولكل خيار درجة وأثر على مؤشرات الموقف وخطوة تالية
//   allocate  توزيع ميزانية أو جهد على بنود
//   schedule  جدول زمني تُبنى فيه الاعتماديات (FS SS FF SF) مع الإزاحة
//   plot      وضع عناصر على مصفوفة بمحورين (النفوذ والاهتمام مثلًا)
//   matrix    مصفوفة صفوف وأعمدة بقيم محددة (RACI مثلًا)
// المشارك يرى الخطوة بلا حلها، والتصحيح هنا فقط. منطق خالص بلا قاعدة
// بيانات، يستورده الخادم والواجهة والاختبارات.

export const STEP_TYPES = ['order', 'classify', 'match', 'choice', 'allocate', 'schedule', 'plot', 'matrix'];
export const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];
export const LINK_LABEL = { FS: 'انتهاء ← بدء', SS: 'بدء ← بدء', FF: 'انتهاء ← انتهاء', SF: 'بدء ← انتهاء' };
export const KINDS = { tool: 'أداة عمل', scenario: 'موقف محاكاة' };
// عتبة الإتقان التي تُمنح عندها نقاط الأداة، والمكافأة الإضافية عند التميز
export const MASTERY = 70;
export const EXCELLENCE = 90;
export const EXCELLENCE_SHARE = 0.25;

// ── من يرى المختبر ──
// المختبر قسم مستقل تفتحه الإدارة لجهة أو لشخص، للمختبر كله أو لأداة بعينها،
// ولمدة مفتوحة أو حتى تاريخ. الأداة "للجميع" تظهر أيضًا لكل من اعتُمد مستواه
// في إطارها إن بلغ حدها الأدنى. المنح يتجاوز شرط المستوى واعتماد المسار.
export const AUDIENCES = { granted: 'لمن تُفتح لهم فقط', all: 'لكل المعتمدين بحسب المستوى' };
const LEVEL_RANK = { beginner: 1, intermediate: 2, advanced: 3 };
const DIM_ORDER = ['milestone', 'impact', 'leadership'];

export const grantLive = (g, now = Date.now()) => !g.expires_at || Date.parse(g.expires_at) > now;

/** @param {any[]} items @param {{ levels?: Record<string, string> | null, participantId?: string, organizationId?: string | null, grants?: any[], now?: number }} who */
export function labVisible(items, { levels = null, participantId, organizationId = null, grants = [], now = Date.now() }) {
  const mine = grants.filter((g) => grantLive(g, now)
    && ((g.participant_id && g.participant_id === participantId) || (g.organization_id && g.organization_id === organizationId)));
  const whole = mine.some((g) => !g.item_id);
  const ids = new Set(mine.map((g) => g.item_id).filter(Boolean));
  const byLevel = (it) => it.audience === 'all' && !!levels?.[it.dimension] && LEVEL_RANK[levels[it.dimension]] >= LEVEL_RANK[it.min_level || 'beginner'];
  return items
    .filter((it) => it.active !== false && (whole || ids.has(it.id) || byLevel(it)))
    .sort((a, b) => DIM_ORDER.indexOf(a.dimension) - DIM_ORDER.indexOf(b.dimension) || (a.sort || 0) - (b.sort || 0));
}

const str = (v, n = 2000) => String(v ?? '').trim().slice(0, n);
const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ── الجدول الزمني: المسار الحرج بالاعتماديات الأربع والإزاحة ──
// يعيد البدء والانتهاء المبكرين والمتأخرين والفائض لكل نشاط، ومدة المشروع.
// الإزاحة قد تكون سالبة (تداخل). الحلقة في الاعتماديات تعيد { cycle: true }.
export function computeSchedule(tasks, links) {
  const ids = (tasks || []).map((t) => t.id);
  const dur = Object.fromEntries((tasks || []).map((t) => [t.id, Math.max(0, Number(t.dur) || 0)]));
  const ok = (l) => l && l.from in dur && l.to in dur && l.from !== l.to && LINK_TYPES.includes(l.type);
  const ls = (links || []).filter(ok).map((l) => ({ ...l, lag: Number(l.lag) || 0 }));
  const indeg = Object.fromEntries(ids.map((id) => [id, 0]));
  ls.forEach((l) => { indeg[l.to] += 1; });
  const order = [];
  const q = ids.filter((id) => !indeg[id]);
  while (q.length) {
    const id = q.shift();
    order.push(id);
    ls.filter((l) => l.from === id).forEach((l) => { if (--indeg[l.to] === 0) q.push(l.to); });
  }
  if (order.length < ids.length) return { cycle: true };
  const es = {}; const ef = {};
  for (const id of order) {
    let s = 0;
    for (const l of ls.filter((x) => x.to === id)) {
      const p = l.from;
      s = Math.max(s, l.type === 'FS' ? ef[p] + l.lag : l.type === 'SS' ? es[p] + l.lag
        : l.type === 'FF' ? ef[p] + l.lag - dur[id] : es[p] + l.lag - dur[id]);
    }
    es[id] = s; ef[id] = s + dur[id];
  }
  const duration = Math.max(0, ...ids.map((id) => ef[id]));
  const lf = {}; const lsT = {};
  for (const id of [...order].reverse()) {
    let f = duration;
    for (const l of ls.filter((x) => x.from === id)) {
      const n = l.to;
      f = Math.min(f, l.type === 'FS' ? lsT[n] - l.lag : l.type === 'SS' ? lsT[n] - l.lag + dur[id]
        : l.type === 'FF' ? lf[n] - l.lag : lf[n] - l.lag + dur[id]);
    }
    lf[id] = f; lsT[id] = f - dur[id];
  }
  const rows = Object.fromEntries(ids.map((id) => [id, { es: es[id], ef: ef[id], ls: lsT[id], lf: lf[id], float: lsT[id] - es[id] }]));
  return { cycle: false, duration, rows, critical: ids.filter((id) => rows[id].float === 0) };
}

const sameLink = (a, b) => a.from === b.from && a.to === b.to && a.type === b.type && (Number(a.lag) || 0) === (Number(b.lag) || 0);
const sameEnds = (a, b) => a.from === b.from && a.to === b.to;

// ── تصحيح خطوة واحدة: { score من 0 إلى 1، ok، why، solution، ... } ──
export function gradeStep(step, answer) {
  const why = step.why_ar || '';
  if (step.type === 'order') {
    const key = step.answer || [];
    const got = Array.isArray(answer) ? answer.filter((x) => key.includes(x)) : [];
    if (got.length !== key.length || new Set(got).size !== key.length) return { score: 0, ok: false, why, solution: key };
    // نسبة الأزواج المرتبة ترتيبًا صحيحًا: ترتيب قريب يأخذ أغلب الدرجة
    let good = 0; let all = 0;
    for (let i = 0; i < got.length; i++) for (let j = i + 1; j < got.length; j++) { all++; if (key.indexOf(got[i]) < key.indexOf(got[j])) good++; }
    const score = all ? good / all : 1;
    return { score, ok: score === 1, why, solution: key };
  }
  if (step.type === 'classify') {
    const a = answer && typeof answer === 'object' ? answer : {};
    const items = step.items || [];
    const right = items.filter((it) => a[it.id] === it.bin).length;
    const score = items.length ? right / items.length : 0;
    return { score, ok: score === 1, why, solution: Object.fromEntries(items.map((it) => [it.id, it.bin])), notes: notesFor(items, a, (it) => a[it.id] === it.bin) };
  }
  if (step.type === 'match') {
    const a = answer && typeof answer === 'object' ? answer : {};
    const left = step.left || [];
    const right = left.filter((it) => a[it.id] === it.match).length;
    const score = left.length ? right / left.length : 0;
    return { score, ok: score === 1, why, solution: Object.fromEntries(left.map((it) => [it.id, it.match])), notes: notesFor(left, a, (it) => a[it.id] === it.match) };
  }
  if (step.type === 'choice') {
    const opts = step.options || [];
    const o = opts.find((x) => x.id === answer);
    const best = Math.max(1, ...opts.map((x) => Number(x.score) || 0));
    const top = opts.filter((x) => (Number(x.score) || 0) === best).map((x) => x.id);
    if (!o) return { score: 0, ok: false, why, solution: top };
    const score = clamp01((Number(o.score) || 0) / best);
    return { score, ok: score === 1, why, feedback_ar: o.feedback_ar || '', then_ar: o.then_ar || '', effects: o.effects || {}, solution: top };
  }
  if (step.type === 'allocate') {
    const a = answer && typeof answer === 'object' ? answer : {};
    const items = step.items || [];
    const total = Number(step.total) || 100;
    const vals = Object.fromEntries(items.map((it) => [it.id, Math.max(0, Number(a[it.id]) || 0)]));
    const sum = Object.values(vals).reduce((x, y) => x + y, 0);
    const ideal = step.ideal || {};
    if (Math.abs(sum - total) > 0.001) return { score: 0, ok: false, why, solution: ideal, sum };
    const off = items.reduce((x, it) => x + Math.abs(vals[it.id] - (Number(ideal[it.id]) || 0)), 0);
    const score = clamp01(1 - off / (2 * total));
    const tol = Number(step.tol) || 0;
    return { score, ok: items.every((it) => Math.abs(vals[it.id] - (Number(ideal[it.id]) || 0)) <= tol), why, solution: ideal };
  }
  if (step.type === 'schedule') {
    const given = (Array.isArray(answer?.links) ? answer.links : []).slice(0, 200)
      .map((l) => ({ from: str(l.from, 40), to: str(l.to, 40), type: str(l.type, 2), lag: Number(l.lag) || 0 }));
    const expected = step.expected || [];
    // الاعتمادية الصحيحة بنوعها وإزاحتها درجة كاملة، وبالطرفين الصحيحين ونوع أو إزاحة مختلفين نصف درجة
    let got = 0;
    for (const e of expected) got += given.some((g) => sameLink(g, e)) ? 1 : given.some((g) => sameEnds(g, e)) ? 0.5 : 0;
    const extra = given.filter((g) => !expected.some((e) => sameEnds(g, e))).length;
    const score = expected.length ? got / (expected.length + extra) : 0;
    const plan = computeSchedule(step.tasks, expected);
    const mine = computeSchedule(step.tasks, given);
    return {
      score, ok: score === 1, why, solution: expected, right: expected.filter((e) => given.some((g) => sameLink(g, e))).length, expected_n: expected.length, extra,
      duration: plan.duration, critical: plan.critical, floats: Object.fromEntries(Object.entries(plan.rows).map(([k, r]) => [k, r.float])),
      mine: mine.cycle ? { cycle: true } : { duration: mine.duration, critical: mine.critical },
    };
  }
  if (step.type === 'plot') {
    const a = answer && typeof answer === 'object' ? answer : {};
    const items = step.items || [];
    const size = Number(step.size) || 2;
    // الخانة الصحيحة درجة كاملة، والمجاورة لها نصف درجة في المصفوفة الثلاثية فقط
    let got = 0;
    const notes = [];
    for (const it of items) {
      const p = Array.isArray(a[it.id]) ? a[it.id].map(Number) : null;
      const d = p ? Math.max(Math.abs(p[0] - it.x), Math.abs(p[1] - it.y)) : 9;
      got += d === 0 ? 1 : d === 1 && size > 2 ? 0.5 : 0;
      if (d !== 0 && it.note_ar) notes.push({ id: it.id, note_ar: it.note_ar });
    }
    const score = items.length ? got / items.length : 0;
    return { score, ok: score === 1, why, solution: Object.fromEntries(items.map((it) => [it.id, [it.x, it.y]])), notes };
  }
  if (step.type === 'matrix') {
    const a = answer && typeof answer === 'object' ? answer : {};
    const rows = step.rows || [];
    const cols = step.cols || [];
    const exp = step.expected || {};
    let right = 0;
    for (const r of rows) for (const c of cols) if ((a[r.id]?.[c.id] || '') === (exp[r.id]?.[c.id] || '')) right++;
    const cells = rows.length * cols.length;
    const score = cells ? right / cells : 0;
    // قواعد المصفوفة: قيمة يجب أن تظهر مرة واحدة بالضبط في كل صف (A في RACI مثلًا)
    const broken = [];
    for (const v of step.once_per_row || []) {
      for (const r of rows) {
        const n = cols.filter((c) => a[r.id]?.[c.id] === v).length;
        if (n !== 1) broken.push({ row: r.id, value: v, count: n });
      }
    }
    return { score, ok: score === 1, why, solution: exp, broken };
  }
  return { score: 0, ok: false, why };
}

function notesFor(items, a, isRight) {
  return items.filter((it) => it.note_ar && !isRight(it)).map((it) => ({ id: it.id, note_ar: it.note_ar }));
}

// ── مسار الموقف: الخطوة التالية بعد الإجابة ──
// الخيار في خطوة القرار قد يحدد خطوة تالية بمعرّفها، أو "end" لإنهاء الموقف.
// وإلا فالتالية هي التي بعدها، أو next المكتوبة على الخطوة نفسها.
export function nextIndex(spec, i, answer) {
  const steps = spec?.steps || [];
  const st = steps[i];
  if (!st) return -1;
  let target = st.next || null;
  if (st.type === 'choice') {
    const o = (st.options || []).find((x) => x.id === answer);
    if (o?.next) target = o.next;
  }
  if (target === 'end') return -1;
  if (target) {
    const j = steps.findIndex((s) => s.id === target);
    if (j > i) return j;
  }
  return i + 1 < steps.length ? i + 1 : -1;
}

// مؤشرات الموقف بعد سلسلة من القرارات: البداية زائد أثر كل قرار، بين 0 و100
export function meterState(spec, effectsList) {
  const meters = spec?.meters || [];
  const v = Object.fromEntries(meters.map((m) => [m.id, Number(m.start) || 50]));
  for (const eff of effectsList || []) {
    for (const [k, d] of Object.entries(eff || {})) if (k in v) v[k] = clamp(v[k] + (Number(d) || 0), 0, 100);
  }
  return v;
}

// ── ما يراه المشارك قبل الإجابة: الخطوة بلا حلها ولا شرحها ──
export function publicStep(step) {
  const base = { type: step.type, prompt_ar: step.prompt_ar || '', title_ar: step.title_ar || '', context_ar: step.context_ar || '' };
  if (step.type === 'order') return { ...base, items: step.items || [] };
  if (step.type === 'classify') return { ...base, bins: step.bins || [], items: (step.items || []).map(({ id, label }) => ({ id, label })) };
  if (step.type === 'match') return { ...base, left: (step.left || []).map(({ id, label }) => ({ id, label })), right: step.right || [] };
  if (step.type === 'choice') return { ...base, options: (step.options || []).map(({ id, label }) => ({ id, label })) };
  if (step.type === 'allocate') return { ...base, total: Number(step.total) || 100, unit_ar: step.unit_ar || '', items: step.items || [] };
  if (step.type === 'schedule') return { ...base, tasks: step.tasks || [], rules_ar: step.rules_ar || [] };
  if (step.type === 'plot') return { ...base, size: Number(step.size) || 2, x_ar: step.x_ar || [], y_ar: step.y_ar || [], cells_ar: step.cells_ar || null, items: (step.items || []).map(({ id, label }) => ({ id, label })) };
  if (step.type === 'matrix') return { ...base, rows: step.rows || [], cols: step.cols || [], values: step.values || [], once_per_row: step.once_per_row || [] };
  return base;
}

// ترتيب العرض يُخلط بالبذرة (معرّف المحاولة) فلا يحفظ المشارك موضع الإجابة
/** @param {any} spec @param {(list: any[], salt: string) => any[]} [shuffle] */
export function publicSpec(spec, shuffle = (list) => list) {
  const s = spec || {};
  return {
    story_ar: s.story_ar || '', role_ar: s.role_ar || '', closing_ar: s.closing_ar || '',
    meters: (s.meters || []).map(({ id, label, start }) => ({ id, label, start: Number(start) || 50 })),
    steps: (s.steps || []).map((st, i) => {
      const p = publicStep(st);
      const mix = (k) => { if (Array.isArray(p[k])) p[k] = shuffle(p[k], `${i}${k}`); };
      if (['order', 'classify', 'plot'].includes(st.type)) mix('items');
      if (st.type === 'match') { mix('left'); mix('right'); }
      return p;
    }),
  };
}

// نتيجة المحاولة من خطوات مسارها: نسبة مئوية موزونة بوزن كل خطوة
export function practicePct(spec, results, path) {
  const steps = spec?.steps || [];
  const visited = Array.isArray(path) && path.length ? path : steps.map((_, i) => i);
  let got = 0; let max = 0;
  visited.forEach((i) => { const st = steps[i]; if (!st) return; const w = Number(st.weight) || 1; max += w; got += w * clamp01(results?.[i]?.score); });
  return max ? Math.round((100 * got) / max) : 0;
}

// نقاط الأداة: كاملة عند الإتقان، ومعها مكافأة عند التميز، مرة واحدة لكل منهما
export function labAward(points, pct) {
  const p = Number(points) || 0;
  return { mastery: pct >= MASTERY ? p : 0, excellence: pct >= EXCELLENCE ? Math.round(p * EXCELLENCE_SHARE) : 0 };
}

// ── تحقق المحتوى قبل الحفظ: يعيد المواصفة منظفة أو يرمي رسالة عربية ──
const ID_RE = /^[a-z0-9_-]{1,40}$/i;
function ids(list, what, needLabel = true) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((x, i) => {
    const id = str(x?.id, 40);
    if (!ID_RE.test(id)) throw new Error(`${what} ${i + 1}: معرّف غير صالح (حروف إنجليزية وأرقام)`);
    if (seen.has(id)) throw new Error(`${what}: المعرّف ${id} مكرر`);
    seen.add(id);
    const label = str(x?.label, 400);
    if (needLabel && !label) throw new Error(`${what} ${id}: بلا نص`);
    return { ...x, id, label };
  });
}
const notes = (x) => (str(x.note_ar) ? { note_ar: str(x.note_ar) } : {});

export function validateLab(input) {
  const spec = typeof input === 'string' ? JSON.parse(input) : input;
  if (!spec || typeof spec !== 'object') throw new Error('المواصفة ليست كائن JSON');
  const steps = Array.isArray(spec.steps) ? spec.steps : [];
  if (!steps.length) throw new Error('أضف خطوة واحدة على الأقل');
  if (steps.length > 20) throw new Error('عشرون خطوة حدًا أقصى');
  const meters = ids(spec.meters, 'مؤشر').map((m) => ({ id: m.id, label: m.label, start: clamp(Number(m.start) || 50, 0, 100) }));
  const stepIds = steps.map((s) => str(s?.id, 40)).filter(Boolean);
  if (new Set(stepIds).size !== stepIds.length) throw new Error('معرّفات الخطوات مكررة');
  const jump = (t, at) => {
    const v = str(t, 40);
    if (!v) return undefined;
    if (v !== 'end' && !stepIds.includes(v)) throw new Error(`${at}: الخطوة التالية ${v} غير موجودة`);
    return v;
  };
  const out = steps.map((st, n) => {
    const at = `الخطوة ${n + 1}`;
    if (!STEP_TYPES.includes(st?.type)) throw new Error(`${at}: نوع غير معروف`);
    const base = {
      type: st.type, title_ar: str(st.title_ar, 200), prompt_ar: str(st.prompt_ar), context_ar: str(st.context_ar, 4000), why_ar: str(st.why_ar),
      weight: Math.max(1, Math.min(5, Number(st.weight) || 1)),
      ...(str(st.id, 40) ? { id: str(st.id, 40) } : {}), ...(jump(st.next, at) ? { next: jump(st.next, at) } : {}),
    };
    if (!base.prompt_ar) throw new Error(`${at}: بلا سؤال`);
    if (st.type === 'order') {
      const items = ids(st.items, `${at} عنصر`);
      const answer = Array.isArray(st.answer) ? st.answer.map(String) : [];
      if (items.length < 2 || answer.length !== items.length || !items.every((x) => answer.includes(x.id))) throw new Error(`${at}: الترتيب الصحيح يجب أن يشمل كل العناصر`);
      return { ...base, items: items.map(({ id, label }) => ({ id, label })), answer };
    }
    if (st.type === 'classify') {
      const bins = ids(st.bins, `${at} خانة`);
      const items = ids(st.items, `${at} عنصر`);
      if (bins.length < 2 || !items.length) throw new Error(`${at}: خانتان وعنصر على الأقل`);
      items.forEach((x) => { if (!bins.some((b) => b.id === x.bin)) throw new Error(`${at}: العنصر ${x.id} بلا خانة صحيحة`); });
      return { ...base, bins: bins.map(({ id, label }) => ({ id, label })), items: items.map((x) => ({ id: x.id, label: x.label, bin: x.bin, ...notes(x) })) };
    }
    if (st.type === 'match') {
      const right = ids(st.right, `${at} خيار`);
      const left = ids(st.left, `${at} عنصر`);
      if (!left.length) throw new Error(`${at}: بلا عناصر`);
      left.forEach((x) => { if (!right.some((r) => r.id === x.match)) throw new Error(`${at}: العنصر ${x.id} بلا مطابقة صحيحة`); });
      return { ...base, left: left.map((x) => ({ id: x.id, label: x.label, match: x.match, ...notes(x) })), right: right.map(({ id, label }) => ({ id, label })) };
    }
    if (st.type === 'choice') {
      const options = ids(st.options, `${at} خيار`).map((o) => {
        const effects = Object.fromEntries(Object.entries(o.effects || {}).filter(([k]) => meters.some((m) => m.id === k)).map(([k, d]) => [k, clamp(Number(d) || 0, -50, 50)]));
        return {
          id: o.id, label: o.label, score: Math.max(0, Math.min(4, Number(o.score) || 0)), feedback_ar: str(o.feedback_ar), then_ar: str(o.then_ar),
          ...(Object.keys(effects).length ? { effects } : {}), ...(jump(o.next, `${at} خيار ${o.id}`) ? { next: jump(o.next, at) } : {}),
        };
      });
      if (options.length < 2 || !options.some((o) => o.score > 0)) throw new Error(`${at}: خياران على الأقل، وأحدهما بدرجة`);
      return { ...base, options };
    }
    if (st.type === 'allocate') {
      const items = ids(st.items, `${at} بند`).map(({ id, label }) => ({ id, label }));
      const total = Number(st.total) || 100;
      const ideal = Object.fromEntries(items.map((x) => [x.id, Number(st.ideal?.[x.id]) || 0]));
      if (Math.abs(Object.values(ideal).reduce((a, b) => a + b, 0) - total) > 0.001) throw new Error(`${at}: التوزيع المثالي لا يساوي ${total}`);
      return { ...base, items, total, unit_ar: str(st.unit_ar, 40), ideal, tol: Math.max(0, Number(st.tol) || 0) };
    }
    if (st.type === 'plot') {
      const size = Number(st.size) === 3 ? 3 : 2;
      const items = ids(st.items, `${at} عنصر`).map((x) => {
        const p = { id: x.id, label: x.label, x: Number(x.x), y: Number(x.y), ...notes(x) };
        if (![p.x, p.y].every((v) => Number.isInteger(v) && v >= 0 && v < size)) throw new Error(`${at}: موضع العنصر ${x.id} خارج المصفوفة`);
        return p;
      });
      const axis = (v) => (Array.isArray(v) ? v.map((s) => str(s, 80)) : []);
      if (!items.length) throw new Error(`${at}: بلا عناصر`);
      if (axis(st.x_ar).length < 1 || axis(st.y_ar).length < 1) throw new Error(`${at}: اكتب اسمي المحورين`);
      const cells = Array.isArray(st.cells_ar) ? st.cells_ar.map((row) => (Array.isArray(row) ? row.map((c) => str(c, 80)) : [])) : null;
      return { ...base, size, x_ar: axis(st.x_ar), y_ar: axis(st.y_ar), ...(cells ? { cells_ar: cells } : {}), items };
    }
    if (st.type === 'matrix') {
      const rows = ids(st.rows, `${at} صف`).map(({ id, label }) => ({ id, label }));
      const cols = ids(st.cols, `${at} عمود`).map(({ id, label }) => ({ id, label }));
      const values = ids(st.values, `${at} قيمة`).map(({ id, label }) => ({ id, label }));
      if (!rows.length || !cols.length || values.length < 2) throw new Error(`${at}: صف وعمود وقيمتان على الأقل`);
      const expected = {};
      for (const r of rows) {
        expected[r.id] = {};
        for (const c of cols) {
          const v = str(st.expected?.[r.id]?.[c.id], 40);
          if (v && !values.some((x) => x.id === v)) throw new Error(`${at}: قيمة غير معروفة ${v}`);
          if (v) expected[r.id][c.id] = v;
        }
      }
      const once = (Array.isArray(st.once_per_row) ? st.once_per_row : []).map((v) => str(v, 40)).filter((v) => values.some((x) => x.id === v));
      return { ...base, rows, cols, values, expected, once_per_row: once };
    }
    const tasks = ids(st.tasks, `${at} نشاط`).map(({ id, label, dur }) => ({ id, label, dur: Math.max(0, Math.min(999, Number(dur) || 0)) }));
    const expected = (Array.isArray(st.expected) ? st.expected : []).map((l) => ({ from: str(l.from, 40), to: str(l.to, 40), type: str(l.type, 2), lag: Number(l.lag) || 0 }));
    if (tasks.length < 2 || !expected.length) throw new Error(`${at}: نشاطان واعتمادية على الأقل`);
    expected.forEach((l) => {
      if (!tasks.some((t) => t.id === l.from) || !tasks.some((t) => t.id === l.to) || !LINK_TYPES.includes(l.type)) throw new Error(`${at}: اعتمادية غير صالحة ${l.from} ← ${l.to}`);
    });
    if (computeSchedule(tasks, expected).cycle) throw new Error(`${at}: في الاعتماديات حلقة مغلقة`);
    return { ...base, tasks, expected, rules_ar: (Array.isArray(st.rules_ar) ? st.rules_ar : []).map((r) => str(r, 400)).filter(Boolean) };
  });
  return { story_ar: str(spec.story_ar, 4000), role_ar: str(spec.role_ar, 400), closing_ar: str(spec.closing_ar, 2000), meters, steps: out };
}
