// ════════════════════════════════════════════════════════════════
// شاشة المساعد الآلي: منطق بلا شبكة ولا واجهة (صياغة المال والنسب، وحكم الحلقة، وخلاصة كل قسم، وحلقة التقييم)
// ════════════════════════════════════════════════════════════════
// الحقائق من admin.agent-*، والحكم هنا وحده فيُختبر بلا متصفح (agent-admin.test.js).

// المال بالميكرو دولار (جزء من مليون): بأربعة أرقام دون الدولار الواحد، وبرقمين فوقه
export function usd(micros) {
  if (micros == null || !Number.isFinite(Number(micros))) return 'غير مقروء';
  const v = Number(micros) / 1e6;
  return `${v.toFixed(Math.abs(v) < 1 && v !== 0 ? 4 : 2)} دولار`;
}
export const usd2 = (micros) => `${(Number(micros || 0) / 1e6).toFixed(2)}`;
export const pct = (x) => (x == null || !Number.isFinite(Number(x)) ? 'غير مقروء' : `${Math.round(Number(x) * 1000) / 10}٪`);
// عدد مقروء أو «غير مقروء»، لا فراغ ولا صفر
export const count = (n) => (n == null || !Number.isFinite(Number(n)) ? 'غير مقروء' : String(n));
// العدد مع المعدود بالمطابقة العربية: واحد، ومثنى، وجمع من 3 إلى 10، ومفرد منصوب فوقها
export function countAr(n, [one, two, few, many]) {
  const v = Number(n);
  if (v === 1) return one;
  if (v === 2) return two;
  if (v >= 3 && v <= 10) return `${v} ${few}`;
  return `${v} ${many}`;
}
export const SET_AR = { eval: 'أسئلة الجودة', redteam: 'اختبار الحماية' };
export const short = (id) => String(id || '').slice(0, 8);

// حلقة اليوم مقابل السقف: أخضر دون 80%، وكهرماني من 80%، وأحمر عند السقف. الرمز والكلمة مع اللون دائمًا
export function ringLevel(spent, cap) {
  if (!cap) return { level: 'red', icon: '✕', word: 'بلا سقف', ratio: 1 };
  const ratio = Math.max(0, Number(spent || 0) / cap);
  if (ratio >= 1) return { level: 'red', icon: '✕', word: 'بلغ السقف', ratio: 1 };
  if (ratio >= 0.8) return { level: 'amber', icon: '!', word: 'قريب من السقف', ratio };
  return { level: 'green', icon: '✓', word: 'ضمن السقف', ratio };
}

// خريطة أخطاء المفتاح (agent_settings.key_error) بكلمة عربية
export const KEY_ERROR_AR = {
  http_400: 'رفضت الواجهة الطلب', http_401: 'رفضت Anthropic المفتاح', http_403: 'المفتاح بلا صلاحية', http_404: 'النموذج غير موجود',
  http_429: 'تجاوز حد الطلبات', http_5xx: 'عطل مؤقت عند Anthropic', network: 'تعذر الاتصال', timeout: 'انتهت المهلة',
};
// رسائل رموز الخادم عند حفظ المفتاح أو التحقق
export const KEY_CODE_AR = {
  step_up_required: 'أكّد بالبصمة أو برمز تطبيق المصادقة ثم أعد الحفظ.',
  key_rejected: 'رفضت Anthropic المفتاح، ولم يُحفظ شيء. تأكد من نسخه كاملًا.',
  key_forbidden: 'المفتاح بلا صلاحية على الواجهة، ولم يُحفظ شيء.',
  key_unverified: 'تعذّر التحقق من المفتاح الآن، ولم يُحفظ شيء. حاول بعد قليل.',
  rate: 'محاولات كثيرة لتغيير المفتاح في الساعة الأخيرة. حاول لاحقًا.',
  invalid_key: 'صيغة المفتاح غير صحيحة: يبدأ بـ sk-ant- ثم 20 حرفًا على الأقل.',
  replay: 'استُعمل هذا الرمز للتو. انتظر الرمز التالي في التطبيق.',
  bad_code: 'الرمز غير صحيح. أدخل الرمز الحالي من تطبيق المصادقة.',
  no_env_key: 'لا سر ANTHROPIC_API_KEY في الخادم، فالرجوع يطفئ المساعد.',
  vault_unavailable: 'Vault غير مفعّل في القاعدة، فلم يُحفظ المفتاح.',
};
export const keyMessage = (r) => KEY_CODE_AR[r?.code] || r?.message || 'تعذّر الحفظ';
export const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;
export const keyLooksValid = (k) => KEY_RE.test(String(k || '').trim());

const REASON_AR = {
  env_off: 'مطفأ بمفتاح الطوارئ في الخادم',
  db_off: 'مطفأ من اللوحة',
  stale: 'مطفأ: تغير الإعداد بعد آخر تقييم',
};
const STOP_AR = { max_cost: 'بلغ حد التشغيل', daily_cap: 'امتلأ سقف اليوم', ledger: 'تعذر سجل الإنفاق', key: 'رُفض المفتاح', cancelled: 'أوقفه مدير', stale: 'تغير الإعداد أثناءه', model: 'النموذج غير متاح مؤقتًا' };
export const RUN_STATUS_AR = { running: 'جارٍ', passed: 'ناجح', failed: 'راسب', stopped: 'متوقف', error: 'تعذّر' };
export const stopAr = (r) => (r ? STOP_AR[r] || r : '');

// خلاصة قسم الحالة: الجملة ومستواها
export function stateSummary(s) {
  if (!s) return { level: 'amber', text: 'غير مقروء' };
  if (s.effective) return { level: 'green', text: 'مفعّل ويرد الآن' };
  return { level: s.reason === 'env_off' || s.reason === 'stale' ? 'red' : 'amber', text: REASON_AR[s.reason] || 'مطفأ' };
}
export function gateText(s, ago = (x) => x) {
  const g = s?.gate;
  if (g?.ok && g.run) {
    const r = g.run;
    return { ok: true, text: `آخر تقييم ناجح لهذا الإعداد: ${SET_AR.eval} ${pct(r.eval_total ? r.eval_pass / r.eval_total : 0)} و${SET_AR.redteam} ${pct(r.redteam_total ? r.redteam_pass / r.redteam_total : 0)}، ${ago(r.finished_at)}` };
  }
  if (g?.reason === 'failed') return { ok: false, text: 'آخر تقييم لهذا الإعداد راسب: راجع الراسب ثم أعد التقييم' };
  if (g?.reason === 'stale') return { ok: false, text: 'نجح تقييم سابق لإعداد آخر: شغّل التقييم لهذا الإعداد' };
  return { ok: false, text: 'لا تقييم ناجح لهذا الإعداد: شغّل التقييم أولًا' };
}
// لماذا التفعيل معطل الآن (أو null إن كان ممكنًا)
export function enableBlock(s) {
  if (!s) return 'غير مقروء';
  if (!s.can_write) return 'للمدير الأعلى بجلسة مفتاح مرور أو تطبيق مصادقة';
  if (s.env_mode === 'off') return 'مفتاح الطوارئ LEADERS_AGENT_ENABLED=off في الخادم يغلب اللوحة';
  if (!s.known_model) return `النموذج ${s.model} غير موجود في جدول الأسعار`;
  if (!s.key?.source) return 'لا مفتاح: اضبطه من قسم «المفتاح»';
  if (!s.gate?.ok) return 'شغّل التقييم أولًا';
  return null;
}
export function keySummary(k) {
  if (!k?.source) return { level: 'red', text: 'لا مفتاح' };
  const err = k.error_at && (!k.ok_at || k.error_at > k.ok_at);
  const src = k.source === 'db' ? `من اللوحة (••••${k.last4})` : `سر الخادم ANTHROPIC_API_KEY${k.env_last4 ? ` (••••${k.env_last4})` : ''}`;
  return { level: err ? 'amber' : 'green', text: err ? `${src}، وآخر استدعاء: ${KEY_ERROR_AR[k.error] || k.error}` : src };
}
export function spendSummary(u) {
  if (!u?.today) return { level: 'amber', text: 'غير مقروء' };
  const r = ringLevel(u.today.spent_micros, u.today.cap_micros);
  return { level: r.level, text: `اليوم ${usd2(u.today.spent_micros)} من ${usd2(u.today.cap_micros)} دولار (${Math.round(r.ratio * 100)}٪)` };
}
export function convSummary(c) {
  if (!c) return { level: 'green', text: 'افتح القسم لعرض المحادثات' };
  const total = c.total ? `${countAr(c.total, ['محادثة واحدة', 'محادثتان', 'محادثات', 'محادثة'])} في المدة` : 'لا محادثات في المدة';
  return { level: 'green', text: `${total}${c.total && c.contacts != null ? `، وعدد من طلب التواصل منها: ${c.contacts}` : ''}` };
}
export function runSummary(run) {
  if (!run) return { level: 'amber', text: 'لم يُشغَّل التقييم بعد' };
  const ev = run.eval_total ? `${SET_AR.eval} ${pct(run.eval_pass / run.eval_total)} (${run.eval_pass}/${run.eval_total})` : `${SET_AR.eval} بلا نتيجة`;
  const rt = run.redteam_total ? `${SET_AR.redteam} ${pct(run.redteam_pass / run.redteam_total)} (${run.redteam_pass}/${run.redteam_total})` : `${SET_AR.redteam} بلا نتيجة`;
  const level = run.status === 'passed' ? 'green' : run.status === 'running' ? 'amber' : 'red';
  const tail = run.stop_reason ? ` (${stopAr(run.stop_reason)})` : '';
  return { level, text: `آخر تشغيل: ${RUN_STATUS_AR[run.status] || run.status}${tail}، ${ev} و${rt}، ${usd2(run.cost_micros)} دولار` };
}
export const LEVEL_ICON = { green: '✓', amber: '!', red: '✕' };
// خلاصة مرافق الجهات بالمطابقة العربية
export const orgsSummary = (n) => (n == null ? { level: 'amber', text: 'غير مقروء' } : n ? { level: 'green', text: `${countAr(n, ['جهة واحدة أوقفت', 'جهتان أوقفتا', 'جهات أوقفت', 'جهة أوقفت'])} المرافق` } : { level: 'green', text: 'كل الجهات تسمح بالمرافق' });
// سطور النظام في نص المحادثة (handler.ts) بكلمة عربية، لا النص الخام
const HANDOFF_AR = { request: 'طلب الزائر', agent: 'اقتراح المساعد', capped: 'السقف اليومي', conv_cap: 'حد المحادثة', refusal: 'امتناع النموذج', error: 'تعذر الرد' };
export function systemLine(body) {
  const b = String(body || '');
  if (b === 'capped') return 'بلغ سقف اليوم، فعُرض على الزائر ترك رسالته';
  const m = b.match(/^handoff: (\w+)$/);
  if (m) return `حُوّلت المحادثة إلى الفريق (${HANDOFF_AR[m[1]] || 'سبب آخر'})`;
  return 'حدث في المحادثة';
}
// أعلى يوم في السلسلة للوصف
export function peakDay(series) {
  let best = null;
  for (const d of series || []) if (!best || Number(d.micros) > Number(best.micros)) best = d;
  return best && Number(best.micros) > 0 ? best : null;
}

// سلسلة 30 يومًا: أعلى قيمة للمقياس (لا تقل عن السقف فيظهر خطه)
export function seriesScale(series, cap) {
  const max = Math.max(cap || 0, ...(series || []).map((d) => Number(d.micros || 0)));
  return max || 1;
}

// حلقة التقييم من المتصفح: دفعة بعد دفعة حتى done، وتنتظر وتعيد بعد busy، وتتوقف عند الإيقاف أو الخطأ أو حد الطلبات
export async function runEvalLoop(call, runId, onProgress = () => {}, signal = null, { maxRequests = 40, wait = (ms) => new Promise((r) => setTimeout(r, ms)), busyMs = 2000 } = {}) {
  let last = null;
  for (let i = 0; i < maxRequests; i++) {
    if (signal?.aborted) return { stopped: true, last };
    const r = await call('admin.agent-eval-step', { run_id: runId });
    if (signal?.aborted) return { stopped: true, last: r?.success ? r : last };
    if (!r?.success) {
      if (r?.code === 'busy') { await wait(busyMs); continue; }
      return { error: r?.message || 'تعذّر تشغيل الدفعة', code: r?.code, last };
    }
    last = r;
    onProgress(r);
    if (r.done) return { done: true, last: r };
  }
  return { error: 'بلغت الحلقة حدها من الطلبات، أعد الفتح لتكمل', code: 'max_requests', last };
}

// تقدير تكلفة التشغيل للزر (أقل من 0.10 دولار بأسعار Haiku)
export const EVAL_ESTIMATE_MICROS = 100_000;
