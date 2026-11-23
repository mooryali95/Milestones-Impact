// ════════════════════════════════════════════════════════════════
// تقوية المساعد، المرحلة ج (قرار المالك 2026-11-22): إيقاف آلي عند الانحراف
// ════════════════════════════════════════════════════════════════
// يستدعيه المجدول كل ساعة (cron.expert-offers). يعدّ ردود المساعد في آخر 24 ساعة بلا نصها، ويحكم watchVerdict (guide.js).
// الانحراف يطفئ guidance.enabled في الإعدادات نفسها (مصدر واحد)، ويُسجَّل، ويصل المالك تنبيه بالسبب. لا يعيد التشغيل آليًا أبدًا.
import { audit, db } from './core.ts';
import { appSettings, resetSettingsCache } from './settings.ts';
import { ownerNoticeLater } from './notify.ts';
import { watchVerdict, WATCH_REASON_AR } from './guide.js';
import { reviewReason, weekLine, weekRates } from './guide-review.js';

export const WATCH = { now: () => Date.now() };

export async function guideWatch() {
  const cfg: any = (await appSettings()).guidance || {};
  if (!cfg.enabled) return { checked: false, reason: 'off' };
  const since = new Date(WATCH.now() - 864e5).toISOString();
  // العدّ من guide.ts وحده (حارس G3: لا يقرأ جدول المحادثات غيره)، بأعمدة بلا نص ولا معرّف مشارك
  const { data, error } = await (await import('./guide.ts')).guideReplyVerdicts(since);
  if (error) {
    // عمود guard قبل ترحيله: لا حكم بلا عدّ كامل
    console.error('guide watch read', error.code || 'error');
    return { checked: false, reason: 'read' };
  }
  const rows = (data || []) as any[];
  const counts = {
    total: rows.length,
    unsure: rows.filter((r) => r.verdict === 'unsure').length,
    guard: rows.filter((r) => r.guard && r.guard !== 'verify_error').length,
  };
  const v = watchVerdict(counts, cfg);
  if (!v.pause) return { checked: true, paused: false, ...counts, unsure_pct: v.unsure_pct, guard_pct: v.guard_pct };
  const { data: row } = await db.from('app_settings').select('value').eq('key', 'guidance').maybeSingle();
  const before = (row as any)?.value || {};
  const after = { ...before, enabled: false };
  // تحديث الصف القائم بمفتاحه: المساعد مفعّل فصفه موجود (enabled لا يكون true من القيم الافتراضية)
  const { error: we } = await db.from('app_settings').update({ value: after, updated_by: 'system:guide-watch', updated_at: new Date().toISOString() }).eq('key', 'guidance');
  if (we) { console.error('guide watch pause', we.code || 'error'); return { checked: true, paused: false, error: 'save' }; }
  resetSettingsCache();
  await audit('system', 'guide-watch', 'guide.auto-paused', 'app_settings', 'guidance', { enabled: true }, { enabled: false, reason: v.reason, ...counts, unsure_pct: v.unsure_pct, guard_pct: v.guard_pct });
  ownerNoticeLater('guide_auto_paused', {
    line: `⏸️ أُوقف المساعد الذكي آليًا: ${WATCH_REASON_AR[v.reason as 'unsure' | 'guard']} (${counts.total} ردًا في 24 ساعة، «لم أتأكد» ${v.unsure_pct}٪، محجوب ${v.guard_pct}٪). راجع الردود ثم أعد تشغيله من الإعدادات.`,
    ref: `guide_auto_paused:${new Date(WATCH.now()).toISOString().slice(0, 13)}`,
  });
  return { checked: true, paused: true, reason: v.reason, ...counts };
}

// ── المرحلة د3: ملخص الأسبوع في Slack، أعداد ونسب بلا نص سؤال ولا اسم. يوم الأحد في التاسعة بتوقيت الرياض (06 UTC)،
// مرة واحدة في الأسبوع: يُسجَّل في audit_log بمفتاح الأسبوع فلا تكرره المهمة الساعية ولا إعادة تشغيلها
export const WEEKLY_AT = { day: 0, hourUtc: 6 };
export async function guideWeekly() {
  const now = new Date(WATCH.now());
  if (now.getUTCDay() !== WEEKLY_AT.day || now.getUTCHours() !== WEEKLY_AT.hourUtc) return { sent: false, reason: 'not_due' };
  const key = now.toISOString().slice(0, 10);
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'guide.weekly-sent').eq('entity_id', key);
  if (count) return { sent: false, reason: 'already' };
  const since = new Date(now.getTime() - 7 * 864e5).toISOString();
  const { data, error } = await (await import('./guide.ts')).guideWeekVerdicts(new Date(now.getTime() - 14 * 864e5).toISOString());
  if (error) { console.error('guide weekly read', error.code || 'error'); return { sent: false, reason: 'read' }; }
  const rows = (data || []) as any[];
  const week = rows.filter((r) => r.created_at >= since);
  if (!week.length) return { sent: false, reason: 'empty' };
  const toReview = week.filter((r) => reviewReason(r)).length;
  await audit('system', 'guide-weekly', 'guide.weekly-sent', 'app_settings', key, null, { replies: week.length, to_review: toReview });
  ownerNoticeLater('guide_weekly', { line: weekLine(weekRates(week), weekRates(rows.filter((r) => r.created_at < since)), toReview), ref: `guide_weekly:${key}` });
  return { sent: true, replies: week.length, to_review: toReview };
}
