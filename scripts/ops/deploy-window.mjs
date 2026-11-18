#!/usr/bin/env node
// نافذة النشر والتجميد (ش13، تصور تحديث المنصة، المرحلة 2): هل تُنشر الدوال وتُرقّى الواجهة الآن؟
// منطق نقي يختبره scripts/ops/release-safety.test.js، وتستدعيه وظيفة deploy في ci.yml قبل أي نشر.
//
//   DEPLOY_WINDOW='23:00-05:00' node scripts/ops/deploy-window.mjs     يطبع القرار ويكتب allowed= في $GITHUB_OUTPUT
//   node scripts/ops/deploy-window.mjs --validate                       يتحقق من صيغة تقويم التجميد وحده
//
// المصدران:
// - النافذة: متغير المستودع DEPLOY_WINDOW (Settings، Secrets and variables، Actions، Variables) بتوقيت الرياض،
//   مثل «23:00-05:00» أو عدة نوافذ بفاصلة «23:00-05:00,13:00-14:00». النافذة التي تعبر منتصف الليل مقبولة.
//   بلا المتغير لا نافذة: النشر في أي وقت كما كان قبل ش13، فلا يتغير شيء قبل أن يختار المالك.
// - التقويم: docs/ops/deploy-freeze.json يحرره المالك. يوم الورشة يجمّد يومه واليوم السابق كاملًا (24 ساعة قبله)،
//   وفترة from/to تجمّد أيامها كلها شاملة الطرفين. تقويم فارغ لا يجمّد شيئًا.
// خارج النافذة أو في يوم تجميد تنجح الفحوص ولا يحدث نشر، ويُنشر لاحقًا بتشغيل يدوي أو بالجدولة (RUNBOOK.md §2).
// الإصلاح العاجل يتجاوزهما بتشغيل CI يدويًا على main مع urgent (قرار المالك وحده).
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RIYADH_OFFSET_MIN = 180;   // الرياض UTC+3 طوال السنة، بلا توقيت صيفي
export const CALENDAR = join(dirname(fileURLToPath(import.meta.url)), '../../docs/ops/deploy-freeze.json');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const t = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s;
};
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// اليوم والدقيقة بتوقيت الرياض
export function riyadh(now) {
  const t = new Date(now.getTime() + RIYADH_OFFSET_MIN * 6e4);
  return { date: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes(), hhmm: t.toISOString().slice(11, 16) };
}

// «HH:MM-HH:MM[,HH:MM-HH:MM]» إلى [[بداية، نهاية]] بالدقائق، أو null بلا نافذة. صيغة خاطئة ترمي خطأ يسمّيها
export function parseWindow(spec) {
  const s = String(spec ?? '').trim();
  if (!s) return null;
  const toMin = (x) => {
    const m = x.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) throw new Error(`DEPLOY_WINDOW: «${x}» ليس وقتًا بصيغة HH:MM`);
    return Number(m[1]) * 60 + Number(m[2]);
  };
  return s.split(',').map((part) => {
    const [a, b, extra] = part.trim().split('-');
    if (b === undefined || extra !== undefined) throw new Error(`DEPLOY_WINDOW: «${part.trim()}» ليست بصيغة HH:MM-HH:MM`);
    const range = [toMin(a.trim()), toMin(b.trim())];
    if (range[0] === range[1]) throw new Error(`DEPLOY_WINDOW: «${part.trim()}» نافذة بلا طول`);
    return range;
  });
}

export function inWindow(ranges, minute) {
  if (!ranges) return true;
  return ranges.some(([a, b]) => (a < b ? minute >= a && minute < b : minute >= a || minute < b));
}

// التقويم: يتحقق ويعيد فترات التجميد [من، إلى] أيامًا شاملة بتوقيت الرياض، مع ملاحظة كل منها
export function parseCalendar(cal) {
  if (!cal || typeof cal !== 'object' || Array.isArray(cal)) throw new Error('تقويم التجميد: يجب أن يكون كائن JSON');
  const out = [];
  const list = (k) => {
    if (cal[k] === undefined) return [];
    if (!Array.isArray(cal[k])) throw new Error(`تقويم التجميد: «${k}» يجب أن تكون قائمة`);
    return cal[k];
  };
  list('workshops').forEach((w, i) => {
    if (!validDate(w?.date)) throw new Error(`تقويم التجميد: workshops[${i}].date يجب أن يكون تاريخًا YYYY-MM-DD`);
    out.push({ from: addDays(w.date, -1), to: w.date, note: `ورشة ${w.date}${w.note ? `: ${w.note}` : ''}` });
  });
  list('freezes').forEach((f, i) => {
    if (!validDate(f?.from) || !validDate(f?.to)) throw new Error(`تقويم التجميد: freezes[${i}] يحتاج from وto بصيغة YYYY-MM-DD`);
    if (f.to < f.from) throw new Error(`تقويم التجميد: freezes[${i}] نهايته قبل بدايته`);
    out.push({ from: f.from, to: f.to, note: `تجميد ${f.from} إلى ${f.to}${f.note ? `: ${f.note}` : ''}` });
  });
  return out;
}

export function frozenBy(periods, date) {
  return periods.find((p) => date >= p.from && date <= p.to) || null;
}

// القرار: { deploy, code, reason }. code واحد من open وurgent وfrozen وoutside_window
export function evaluate({ window = '', calendar = {}, now = new Date(), urgent = false } = {}) {
  const ranges = parseWindow(window);
  const periods = parseCalendar(calendar);
  const r = riyadh(now);
  if (urgent) return { deploy: true, code: 'urgent', reason: `إصلاح عاجل بقرار المالك: تُتجاوز النافذة والتجميد (الرياض ${r.date} ${r.hhmm})` };
  const freeze = frozenBy(periods, r.date);
  if (freeze) return { deploy: false, code: 'frozen', reason: `يوم تجميد (${freeze.note}). الرياض ${r.date} ${r.hhmm}` };
  if (!inWindow(ranges, r.minute)) return { deploy: false, code: 'outside_window', reason: `خارج نافذة النشر ${window} بتوقيت الرياض (الآن ${r.hhmm})` };
  return { deploy: true, code: 'open', reason: ranges ? `داخل نافذة النشر ${window} بتوقيت الرياض (الآن ${r.hhmm})` : 'لا نافذة مضبوطة (DEPLOY_WINDOW فارغ): النشر في أي وقت' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let calendar;
  try {
    calendar = JSON.parse(readFileSync(CALENDAR, 'utf8'));
    parseCalendar(calendar);
  } catch (e) {
    console.log(`::error::docs/ops/deploy-freeze.json غير صالح: ${e.message}`);
    process.exit(1);
  }
  if (process.argv.includes('--validate')) { console.log('تقويم التجميد صالح'); process.exit(0); }
  let d;
  try {
    d = evaluate({ window: process.env.DEPLOY_WINDOW || '', calendar, urgent: process.env.URGENT === 'true' });
  } catch (e) {
    // صيغة نافذة خاطئة لا تُفسَّر صامتة بفتح أو إغلاق: تُفشل الوظيفة باسم الخطأ، فيصححها المالك
    console.log(`::error::${e.message}`);
    process.exit(1);
  }
  console.log(`${d.deploy ? '::notice::' : '::warning::'}${d.reason}${d.deploy ? '' : '. نجحت الفحوص ولم يُنشر شيء: يُنشر لاحقًا بتشغيل CI يدويًا على main أو بالجدولة داخل النافذة (RUNBOOK.md §2).'}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${d.deploy}\ncode=${d.code}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### نافذة النشر\n\n${d.reason}\n\n`);
}
