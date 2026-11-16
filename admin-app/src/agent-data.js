// ════════════════════════════════════════════════════════════════
// شاشة المساعد الآلي: توحيد ردود admin.agent-* عند الحد، في موضع واحد
// ════════════════════════════════════════════════════════════════
// كل رد يصل الشاشة يمر من هنا قبل أن يُرسم، فتقرأ الشاشة شكلًا واحدًا مضمونًا: الأعداد أعداد، والنصوص نصوص، والقوائم
// قوائم، والكائنات المتداخلة موجودة دائمًا. فلا تحتاج الشاشة تحققًا متفرقًا من كل حقل، ولا يكسرها صف قديم أو ناقص من
// الإنتاج (تشغيل قديم بلا تكرار، تشغيل جارٍ بلا نهاية، أسباب فارغة، اسم غائب، رد غير JSON، كائن مكان نص).
// الرد الفاشل يبقى فاشلًا برسالته ورمزه، ورد بلا success صريح يُعامل فشلًا.

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
const list = (x) => (Array.isArray(x) ? x : []);
// عدد منتهٍ أو بديل (0 افتراضًا): «غير مقروء» تصوغه دوال العرض من null
export const num = (x, fallback = 0) => (x === null || x === undefined || x === '' || typeof x === 'boolean' || !Number.isFinite(Number(x)) ? fallback : Number(x));
const numOrNull = (x) => num(x, null);
// نص للعرض: الكائن لا يُرسم بنفسه في React (يرمي)، فيُكتب نصًا
export const text = (x) => {
  if (x === null || x === undefined) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  try { return JSON.stringify(x); } catch { return ''; }
};
const textOrNull = (x) => (x === null || x === undefined || x === '' ? null : text(x));

// الفشل بشكله: success:false ورسالة نصية ورمز
function failed(r) {
  const o = obj(r);
  return { success: false, code: textOrNull(o.code), message: textOrNull(o.message) || 'تعذّرت القراءة', run_id: textOrNull(o.run_id) };
}
const ok = (r) => isObj(r) && r.success === true;

export function normKey(k) {
  const o = obj(k);
  return {
    source: textOrNull(o.source), last4: textOrNull(o.last4), set_at: textOrNull(o.set_at), set_by: textOrNull(o.set_by),
    ok_at: textOrNull(o.ok_at), error_at: textOrNull(o.error_at), error: textOrNull(o.error), env_present: !!o.env_present, env_last4: textOrNull(o.env_last4),
  };
}

// تشغيل تقييم: القديم بلا repeats مرة واحدة، والجاري بلا finished_at، والأعداد الغائبة صفر
export function normRun(r) {
  if (!isObj(r)) return null;
  return {
    id: text(r.id), status: text(r.status) || 'error', stop_reason: textOrNull(r.stop_reason), model: text(r.model), knowledge_version: text(r.knowledge_version),
    fingerprint: text(r.fingerprint), total_cases: num(r.total_cases), done_cases: num(r.done_cases), eval_pass: num(r.eval_pass), eval_total: num(r.eval_total),
    redteam_pass: num(r.redteam_pass), redteam_total: num(r.redteam_total), cost_micros: num(r.cost_micros), max_micros: num(r.max_micros),
    repeats: Math.max(1, Math.round(num(r.repeats, 1))), started_by: text(r.started_by), started_at: textOrNull(r.started_at), finished_at: textOrNull(r.finished_at),
  };
}

export function normState(r) {
  if (!ok(r)) return failed(r);
  const v = obj(r.versions);
  const g = obj(r.gate);
  return {
    success: true, ready: r.ready === true, env_mode: text(r.env_mode), enabled: !!r.enabled, effective: !!r.effective, reason: textOrNull(r.reason),
    enabled_by: text(r.enabled_by), enabled_at: textOrNull(r.enabled_at), model: text(r.model), known_model: !!r.known_model, cap_cents: num(r.cap_cents),
    key: normKey(r.key),
    versions: { model: text(v.model), knowledge_version: text(v.knowledge_version), prompt_version: text(v.prompt_version), cases_version: text(v.cases_version), fingerprint: text(v.fingerprint) },
    total_cases: num(r.total_cases), latest_run: normRun(r.latest_run),
    gate: { ok: !!g.ok, run_id: textOrNull(g.run_id), reason: textOrNull(g.reason), run: normRun(g.run) },
    companion_off: numOrNull(r.companion_off), can_write: !!r.can_write,
  };
}

export function normUsage(r) {
  if (!ok(r)) return failed(r);
  const t = obj(r.today);
  const c = obj(r.cache);
  return {
    success: true,
    today: { day: text(t.day), spent_micros: num(t.spent_micros), cap_micros: num(t.cap_micros), calls: num(t.calls) },
    series: list(r.series).filter(isObj).map((d, i) => ({ day: text(d.day) || String(i), micros: num(d.micros), calls: num(d.calls), eval_micros: num(d.eval_micros) })),
    conversations: numOrNull(r.conversations), handoffs: numOrNull(r.handoffs), avg_cost_micros: numOrNull(r.avg_cost_micros),
    cache: { read_tokens: numOrNull(c.read_tokens), saved_micros: numOrNull(c.saved_micros), hit_ratio: numOrNull(c.hit_ratio) },
    canned_share: numOrNull(r.canned_share), eval_micros: numOrNull(r.eval_micros),
  };
}

// صف محادثة: من طلب التواصل باسمه وبريده (وقد يغيبان)، والزائر بوسمه ومعرّفه القصير
export function normConversations(r) {
  if (!ok(r)) return failed(r);
  const rows = list(r.rows).filter(isObj).map((x, i) => {
    const id = text(x.id) || `row-${i}`;
    return {
      id, short_id: text(x.short_id) || id.slice(0, 8), created_at: textOrNull(x.created_at), product: text(x.product), locale: text(x.locale), status: text(x.status),
      rating: numOrNull(x.rating), visitor_messages: num(x.visitor_messages), model_calls: num(x.model_calls), cost_micros: num(x.cost_micros), contact: !!x.contact,
      name: text(x.name) || 'بلا اسم', email: text(x.email), label: text(x.label) || 'زائر',
    };
  });
  return { success: true, page: Math.max(1, num(r.page, 1)), per_page: Math.max(1, num(r.per_page, 25)), total: num(r.total, rows.length), rows };
}

export function normTranscript(r) {
  if (!ok(r)) return failed(r);
  const c = obj(r.conversation);
  return {
    success: true,
    conversation: { id: text(c.id), short_id: text(c.short_id), contact: !!c.contact },
    messages: list(r.messages).filter(isObj).map((m) => {
      const t = isObj(m.tokens) ? m.tokens : null;
      return {
        role: text(m.role), body: text(m.body), model: text(m.model), cost_micros: numOrNull(m.cost_micros),
        tokens: t && { input: num(t.input), cache_read: num(t.cache_read), cache_write: num(t.cache_write), output: num(t.output) },
      };
    }),
  };
}

export function normRuns(r) {
  if (!ok(r)) return failed(r);
  return { success: true, runs: list(r.runs).map(normRun).filter(Boolean) };
}

// نتائج التشغيل: الحالة المحذوفة من المجموعة بلا رسالة، والأسباب قائمة نصوص دائمًا
export function normRunDetail(r) {
  if (!ok(r)) return failed(r);
  return {
    success: true, run: normRun(r.run),
    results: list(r.results).filter(isObj).map((x) => ({
      case_id: text(x.case_id), set: text(x.set), pass: !!x.pass, reasons: list(x.reasons).map(text).filter(Boolean),
      reply: text(x.reply), message: text(x.message), cost_micros: numOrNull(x.cost_micros),
    })),
  };
}

// دفعة التقييم (admin.agent-eval-step) وبدء التشغيل: التقدم بأعداد
export function normStep(r) {
  if (!ok(r)) return failed(r);
  return {
    ...r, success: true, run_id: text(r.run_id), done: !!r.done, status: text(r.status), done_cases: num(r.done_cases), total: num(r.total), cost_micros: num(r.cost_micros),
  };
}

export function normKeySet(r) {
  if (!ok(r)) return failed(r);
  return { success: true, key: normKey(r.key), model_ok: r.model_ok === false ? false : r.model_ok === true ? true : null };
}

// إجراء بلا بيانات تُرسم (التفعيل، والإيقاف، ومسح المفتاح): النجاح ورسالة الفشل
export const normAction = (r) => (ok(r) ? { ...r, success: true } : failed(r));
