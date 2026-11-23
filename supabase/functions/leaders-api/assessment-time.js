// ════════════════════════════════════════════════════════════════
// زمن القياس المعلن للمشارك: يُحسب ولا يُكتب يدويًا (قرار المالك 2026-11-23)
// ════════════════════════════════════════════════════════════════
// المصدر الأول ما استغرقه المشاركون فعلًا (الوسيط، بعد عدد كافٍ)، وقبله تقدير من نص الأسئلة نفسها بسرعة قراءة
// عربية متأنية وزمن قرار لكل نوع. الرقم المكتوب في الأداة (est_minutes) لم يعد مصدرًا، فلا يتعارض رقمان.
export const READ_WPM = 130;               // كلمة في الدقيقة: قراءة متأنية لسؤال يُجاب عنه بعناية
export const DECIDE_SEC = { likert: 3, choice: 8 };
export const MEASURED_MIN_N = 10;          // أقل عدد قياسات مسلَّمة يُعتمد وسيطها
export const MEASURED_RANGE = [1, 90];     // دقائق: ما خرج عنها جلسة متروكة أو خلل، لا يدخل الوسيط

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const optionText = (o) => (typeof o === 'string' ? o : o?.text_ar ?? o?.text ?? o?.label ?? '');

/** تقدير من الأسئلة المقدَّمة نفسها (بعد الصيغة): ثوانٍ القراءة وزمن القرار، مقربة لأعلى دقيقة */
export function estimateMinutes(questions) {
  const qs = questions || [];
  if (!qs.length) return null;
  let sec = 0;
  for (const q of qs) {
    const w = words(q.text_ar ?? q.text) + words(q.help_ar ?? q.help) + (Array.isArray(q.options) ? q.options.reduce((s, o) => s + words(optionText(o)), 0) : 0);
    sec += (w / READ_WPM) * 60 + (q.kind === 'likert' ? DECIDE_SEC.likert : DECIDE_SEC.choice);
  }
  return Math.max(1, Math.ceil(sec / 60));
}

/** وسيط الدقائق الفعلية لقياسات مسلَّمة [{ started_at, submitted_at }]، أو null قبل العدد الكافي */
export function measuredMinutes(rows) {
  const d = (rows || []).map((r) => (Date.parse(r.submitted_at) - Date.parse(r.started_at)) / 6e4)
    .filter((m) => Number.isFinite(m) && m >= MEASURED_RANGE[0] && m <= MEASURED_RANGE[1]).sort((a, b) => a - b);
  if (d.length < MEASURED_MIN_N) return null;
  const mid = d.length >> 1;
  return Math.ceil(d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2);
}
