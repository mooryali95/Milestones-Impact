// ════════════════════════════════════════════════════════════════
// اللقطة اليومية للدفعات الجارية وما يُقرأ منها (تصور تشغيل الدفعة 2026-11-19، المرحلة 3، القراران 11 و13)
// ════════════════════════════════════════════════════════════════
// لماذا لقطة: حساب المتأخرين يمر برحلة كل عضو (journeyFor)، فحسابه لكل الدفعات عند كل فتح لـ«نظرة عامة» ثقيل. المهمة
// الساعية (cron.expert-offers) تحفظ مرة في اليوم لكل دفعة جارية أعدادها وحدها في leaders.cohort_snapshots: الأعضاء، من
// في كل مرحلة، المتأخرون، من صار متأخرًا منذ اللقطة السابقة، ما ينتظر القرار، النشطون، والأنشطة المكتملة منذ اللقطة
// السابقة. لا اسم ولا معرّف مشارك. تبويب «المتابعة» يبقى حسابًا حيًا، وتنبيه «نظرة عامة» وسطر الملخص اليومي والملخص
// الأسبوعي تقرأ من اللقطة وتذكر وقتها.
// اليوم يوم UTC (يبدأ 03:00 بالرياض) لأن «متأخر» يُحسب به (journeyMap): أول تشغيل بعده (نحو 03:17 بالرياض) يرى من صار
// متأخرًا اليوم، وملخص 9:17 يقرؤه. و«صار متأخرًا» يُحسب من لحظة بدء التأخر نفسها (late_since)، لا بمقارنة قائمتين، فلا
// تُحفظ معرّفات.
import { CONFIG, db, sendMail, cohortWeeklyMail, cohortWeeklySubject } from './core.ts';
import { mailCounts } from '../_shared/mail.ts';
import { CODE_RESERVE } from '../_shared/mail-budget.js';
import { route } from '../_shared/notify-routing.js';
import { notifySettings } from '../_shared/notify-settings.ts';
import { cohortRoster } from './coordinator.ts';
import { isRunning } from './cohort-running.js';
import { sessionCols } from './workshop-optional.ts';
import { nextSessionAt } from './today-desk.js';
import { digestLine, snapshotOf, weeklyBudgetOk, weeklyDue } from './cohort-changes.js';

const DAY = 864e5;
// حد الدفعة التي تُلتقط: الحد الذي يُرسم به تبويب «المتابعة» تلقائيًا (JOURNEY_AUTO_MAX في اللوحة). الأكبر (الدفعة المفتوحة غالبًا) بلا لقطة
export const SNAPSHOT_MAX = 300;
// مهلة التشغيلة الواحدة: ما لم يُلتقط فيها يُلتقط في الساعة التالية (اللقطة تُكتب مرة لكل دفعة ويوم)
export const SNAPSHOT_BUDGET_MS = 45e3;
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const COLS = 'cohort_id, day, taken_at, since_at, members, finished, late, late_new, waiting, active_week, done_items, done_people, entered, joined, stages, weekly_sent_at';

export type Snapshot = Record<string, any>;

async function runningCohorts(now: number) {
  const { data, error } = await db.from('cohorts').select('*');
  if (error) throw new Error(`cohorts: ${error.message || error}`);
  return ((data || []) as any[]).filter((c) => isRunning(c, now));
}

/** من المهمة الساعية: لقطة اليوم لكل دفعة جارية لم تُلتقط بعد. تُعاد بأمان: الصف مفتاحه الدفعة واليوم */
export async function cohortSnapshots(now = Date.now(), budgetMs = SNAPSHOT_BUDGET_MS) {
  const day = utcDay(now);
  const have = await db.from('cohort_snapshots').select('cohort_id, day, taken_at').gte('day', utcDay(now - 8 * DAY)).order('day', { ascending: false });
  if (have.error) return { taken: 0, error: String(have.error.message || have.error).slice(0, 200) };
  const rows = (have.data || []) as any[];
  const done = new Set(rows.filter((r) => String(r.day).slice(0, 10) === day).map((r) => r.cohort_id));
  const todo = (await runningCohorts(now)).filter((c) => !done.has(c.id));
  const started = Date.now();
  let taken = 0, skipped = 0, left = 0;
  for (const c of todo) {
    if (Date.now() - started > budgetMs) { left += 1; continue; }
    try {
      const r = await cohortRoster(c.id, { max: SNAPSHOT_MAX, now });
      if (!r || 'over' in r) { skipped += 1; continue; }
      // منذ اللقطة السابقة لهذه الدفعة (أمس في العادة)، وبلاها أربع وعشرون ساعة، وأسبوع على الأكثر
      const prev = rows.find((x) => x.cohort_id === c.id);
      const since = new Date(Math.max(prev?.taken_at ? Date.parse(prev.taken_at) : now - DAY, now - 7 * DAY)).toISOString();
      const snap = snapshotOf(r.roster, r.journey_map, { since, now });
      const ins = await db.from('cohort_snapshots').insert({ cohort_id: c.id, day, taken_at: new Date(now).toISOString(), since_at: since, ...snap });
      // 23505: تشغيلة أخرى سبقت إلى لقطة اليوم نفسها
      if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message || String(ins.error));
      if (!ins.error) taken += 1;
    } catch (e) { console.error('cohort snapshot', c.id, (e as Error)?.message || e); skipped += 1; }
  }
  return { taken, ...(skipped ? { skipped } : {}), ...(left ? { left } : {}) };
}

/** أحدث لقطة لكل دفعة منذ يوم (day). تعذّر القراءة يُرمى */
export async function snapshotsSince(day: string): Promise<Snapshot[]> {
  const { data, error } = await db.from('cohort_snapshots').select(COLS).gte('day', day).order('day', { ascending: false });
  if (error) throw new Error(`cohort_snapshots: ${error.message || error}`);
  return (data || []) as Snapshot[];
}

// ── تنبيه «نظرة عامة»: مصدر admin.today (today-desk.ts) ──
// أحدث لقطة لكل دفعة من اليومين الأخيرين
export async function latestSnapshots(now = Date.now()) {
  const rows = await snapshotsSince(utcDay(now - DAY));
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.cohort_id) ? false : (seen.add(r.cohort_id), true)))
    .map((r) => ({ cohort_id: r.cohort_id, taken_at: r.taken_at, since_at: r.since_at, late: r.late, late_new: r.late_new }));
}

// ── سطر الملخص اليومي: مجموع اللقطات التي التُقطت في نافذته ──
/** @returns سطر الأعداد، أو null حين لا شيء يُذكر. الخطأ يُرمى فيعيد الملخص المحاولة */
export async function cohortDigest(since: string, until: string) {
  const rows = await snapshotsSince(utcDay(Date.parse(since) - DAY));
  return digestLine(rows.filter((r) => Date.parse(r.taken_at) > Date.parse(since) && Date.parse(r.taken_at) <= Date.parse(until)));
}

// ── الملخص الأسبوعي لكل دفعة جارية ──
// من المهمة الساعية نفسها، يستحق الأحد 9:00 بالرياض ويبقى 48 ساعة (weeklyDue). بريد واحد لكل دفعة جارية إلى بريد
// الإدارة (LEADERS_ALERT_EMAIL)، بتوجيه مركز الإشعارات (cohort_weekly): يُطفأ من صفه هناك.
// لا يتكرر: المطالبة بكتابة weekly_sent_at على صف لقطة اليوم بشرط أنه فارغ (ذرّية)، قبل الإرسال. تعذّر الإرسال يرد المطالبة.
// ولا يزاحم بريد المشاركين: إن كان في الطابور منتظر، أو تجاوز به المستهلك نصف نصيب غير الرموز (weeklyBudgetOk)، أُجّل
// إلى الساعة التالية بلا مطالبة. ومن نوع bulk، فإن حُجب بعد ذلك دخل الطابور ولم يزاحم رموز الدخول
export async function cohortWeekly(now = Date.now()) {
  const due = weeklyDue(now);
  if (!due.due) return { due: false };
  if (!CONFIG.alertEmail) return { due: true, sent: 0, reason: 'no LEADERS_ALERT_EMAIL' };
  if (!route('cohort_weekly', await notifySettings(db)).email) return { due: true, sent: 0, off: true };
  // صفوف الأسبوع (لعلامة الإرسال) وسبعة أيام قبل اليوم (لمجموع الأنشطة المكتملة)
  const rows = await snapshotsSince(utcDay(Math.min(Date.parse(due.from), now - 7 * DAY)));
  const weekFrom = utcDay(Date.parse(due.from));
  const today = utcDay(now);
  const cohorts = await runningCohorts(now);
  const pending = cohorts.map((c) => {
    const mine = rows.filter((r) => r.cohort_id === c.id);
    const sent = mine.some((r) => r.weekly_sent_at && String(r.day).slice(0, 10) >= weekFrom);
    // لقطة اليوم وحدها: الأعداد حديثة، والمطالبة على صفها
    const snap = mine.find((r) => String(r.day).slice(0, 10) === today) || null;
    return { c, mine, sent, snap };
  }).filter((x) => !x.sent && x.snap);
  if (!pending.length) return { due: true, sent: 0 };
  const [usage, queue] = await Promise.all([
    mailCounts(db),
    db.from('mail_queue').select('id', { count: 'exact', head: true }).is('sent_at', null).is('gave_up_at', null),
  ]);
  if (!weeklyBudgetOk({ usage, waiting: queue.error ? null : queue.count ?? 0, cap: CONFIG.mailDailyCap, reserve: CODE_RESERVE, count: pending.length })) {
    return { due: true, sent: 0, deferred: pending.length };
  }
  const ws = await db.from('workshop_sessions').select(await sessionCols('cohort_id, active, starts_at, ends_at')).eq('active', true).gte('starts_at', new Date(now - DAY).toISOString()).order('starts_at').limit(2000);
  let sent = 0, failed = 0;
  for (const { c, mine, snap } of pending) {
    const claim = await db.from('cohort_snapshots').update({ weekly_sent_at: new Date(now).toISOString() }).eq('cohort_id', c.id).eq('day', snap!.day).is('weekly_sent_at', null).select('cohort_id');
    if (claim.error || !(claim.data || []).length) continue;
    const weekAgo = now - 7 * DAY;
    const k = {
      members: snap!.members, active_week: snap!.active_week, late: snap!.late, waiting: snap!.waiting, finished: snap!.finished,
      done_week: mine.filter((r) => Date.parse(r.taken_at) > weekAgo).reduce((n, r) => n + (Number(r.done_items) || 0), 0),
      stages: (snap!.stages || []).map((s: any) => ({ title: String(s.title || ''), here: Number(s.here) || 0 })),
      next_at: ws.error ? null : nextSessionAt(c, { workshops: ws.data || [], now }), taken_at: snap!.taken_at,
    };
    try {
      await sendMail(CONFIG.alertEmail, cohortWeeklySubject(c.name), cohortWeeklyMail(c, k), [], { category: 'staff', kind: 'bulk', ref: `cohort-weekly:${c.id}:${due.week}`, expiresAt: new Date(now + 3 * DAY).toISOString() });
      sent += 1;
    } catch (e) {
      console.error('cohort weekly', c.id, (e as Error)?.message || e);
      failed += 1;
      await db.from('cohort_snapshots').update({ weekly_sent_at: null }).eq('cohort_id', c.id).eq('day', snap!.day);
    }
  }
  return { due: true, sent, ...(failed ? { failed } : {}) };
}
