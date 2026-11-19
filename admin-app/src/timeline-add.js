// ════════════════════════════════════════════════════════════════
// ورشة من الخط الزمني (تصور تشغيل الدفعة 2026-11-19، المرحلة 4): من النقرة إلى قيم النموذج
// ════════════════════════════════════════════════════════════════
// نقي بلا واجهة: يحوّل موضع المؤشر على المحور الزمني الكامل (خطي) أو لوحة الرحلة (مقياسها الهجين، scaleDay) إلى يوم من أيام
// الدفعة بتوقيت الرياض، ويقترح موعد الجلسة في ذلك اليوم. لا يحفظ شيئًا: النموذج نفسه (sessionFields) والحفظ بـadmin.workshop-save.
// اليوم رقم من بداية الخط (0 أول يوم)، وتاريخه من بداية الدفعة نفسها التي يرسم بها الخط (model.scale.start)، فلا مصدر ثانٍ لتاريخ.
import { scaleDay, scalePos } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { addDays, daysBetween } from '../../supabase/functions/leaders-api/milestones.js';
import { riyadhDay, weekDay } from './dates.js';

export { riyadhDay };

// الرياض بلا توقيت صيفي: +03:00 ثابتة. الموعد المقترح 9 صباحًا بتوقيتها أيًّا كانت منطقة متصفح المدير
export const RIYADH_OFFSET = '+03:00';
export const ADD_START_TIME = '09:00';
export const ADD_MINUTES = 180;

const dayLabel = weekDay;

/** موعد جلسة في يوم بتوقيت الرياض: { starts_at, ends_at } بصيغة ISO
 * @param {string} date YYYY-MM-DD @param {number} [minutes] @param {string} [time] HH:MM */
export function sessionTimes(date, minutes = ADD_MINUTES, time = ADD_START_TIME) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { starts_at: null, ends_at: null };
  const start = Date.parse(`${date}T${time}:00${RIYADH_OFFSET}`);
  if (Number.isNaN(start)) return { starts_at: null, ends_at: null };
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(start + Math.max(30, Number(minutes) || ADD_MINUTES) * 6e4).toISOString() };
}

/** نموذج الإضافة من خط دفعة: null إن لم يكن للخط مقياس (فارغ). dated: للدفعة تاريخ بداية فتُقترح تواريخ، وإلا المرحلة وحدها
 * @param {any} model نموذج journeyTimeline (بمقياسه scale) @param {any} axis نموذج timelineAxis */
export function addScale(model, axis) {
  const sc = model?.scale;
  if (!sc || model.empty) return null;
  const total = Math.max(1, axis?.days || sc.end || 1);
  const clamp = (d, lo = 0, hi = total - 1) => Math.min(Math.max(Math.floor(Number(d) || 0), lo), Math.max(lo, hi));
  const info = (d, at) => {
    const day = clamp(d);
    const date = sc.dated ? addDays(sc.start, day) : null;
    return { day, date, at, label: date ? dayLabel(date) : `اليوم ${day + 1} من الرحلة` };
  };
  // مدى المرحلة بالأيام [أولها، آخرها]، من نوافذ الخط نفسها
  const range = (key) => {
    const [f, e] = sc.windows?.[key] || [0, total];
    const lo = clamp(f);
    return [lo, clamp(Math.max(f, e - 1), lo)];
  };
  // المحور خطي: كل يوم بالعرض نفسه، والعلامة في وسط يومه
  const axisAt = (d) => Math.round(((clamp(d) + 0.5) / total) * 10000) / 100;
  // اللوحة: مقياسها الهجين، واليوم داخل مدى شريطه (النقرة على شريط مرحلة تقترح يومًا من أيامها)
  const boardAt = (d) => scalePos(sc.slots, clamp(d) + 0.5);
  return {
    dated: !!sc.dated, total,
    axis: {
      dayAt: (pct) => info((Math.min(Math.max(pct, 0), 99.999) / 100) * total, axisAt((Math.min(Math.max(pct, 0), 99.999) / 100) * total)),
      day: (d) => info(d, axisAt(d)),
    },
    board: {
      dayAt: (pct, key) => { const [lo, hi] = range(key); const d = clamp(scaleDay(sc.slots, pct), lo, hi); return info(d, boardAt(d)); },
      day: (d, key) => { const [lo, hi] = key ? range(key) : [0, total - 1]; const x = clamp(d, lo, hi); return info(x, boardAt(x)); },
    },
    range,
    /** اليوم الذي تبدأ منه لوحة المفاتيح في مرحلة: اليوم إن وقع فيها، وإلا أولها إن لم تبدأ، وآخرها إن انتهت */
    startDay: (key) => {
      const [lo, hi] = range(key);
      const t = sc.today;
      return t == null ? lo : t < lo ? lo : t > hi ? hi : t;
    },
  };
}

/** هل يقع موعد الجلسة خارج نافذة مرحلته في خط الدفعة؟ بيوم الرياض، كما يحسبه الخط للنقطة بعد الحفظ
 * @param {any} model @param {string} key @param {string | number | null} startsAt */
export function outsideWindow(model, key, startsAt) {
  const sc = model?.scale;
  const win = sc?.windows?.[key];
  if (!sc?.dated || !win || !startsAt) return false;
  const t = typeof startsAt === 'number' ? startsAt : Date.parse(startsAt);
  if (Number.isNaN(t)) return false;
  const d = daysBetween(sc.start, riyadhDay(t));
  return d < win[0] || d >= Math.max(win[1], win[0] + 1);
}
