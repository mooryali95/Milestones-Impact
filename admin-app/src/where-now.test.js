// «أين هو الآن» (المرحلة 2): دالة واحدة للملف وعمود «بانتظار» في القائمة
import { describe, expect, it } from 'vitest';
import { IDLE_WARN_DAYS, waitingCounts, weekOf, whereNow } from '../../supabase/functions/leaders-api/now.js';

const NOW = Date.parse('2026-11-24T10:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString();
const journey = [
  { key: 's1', title_ar: 'التأسيس', status: 'done' },
  { key: 's2', title_ar: 'البناء', status: 'active' },
  { key: 's3', title_ar: 'الأثر', status: 'locked' },
];

describe('waitingCounts', () => {
  it('يفصل ما ينتظر الإدارة عما أُعيد للمشارك، والفصول في المبادرة', () => {
    const w = waitingCounts({
      status: 'enrolled',
      requirements: [{ status: 'submitted' }, { status: 'returned' }],
      models: [{ status: 'submitted', learning_models: { capstone_sort: null } }, { status: 'submitted', learning_models: { capstone_sort: 2 } }, { status: 'returned', learning_models: { capstone_sort: 3 } }],
      capstone: { status: 'submitted' },
    });
    expect(w.admin).toEqual({ decision: 0, journey: 1, learning: 1, initiative: 2 });
    expect(w.participant).toEqual({ journey: 1, learning: 0, initiative: 1 });
  });
});

describe('weekOf', () => {
  it('الأسبوع من عدد أسابيع الدفعة', () => {
    expect(weekOf({ starts_on: '2026-11-01', ends_on: '2027-01-23' }, NOW)).toEqual({ week: 4, of: 12 });
  });
  it('لا أسبوع للدفعة المفتوحة ولا قبل البدء', () => {
    expect(weekOf({ starts_on: '2026-11-01', is_default: true }, NOW)).toBeNull();
    expect(weekOf({ starts_on: '2027-01-01' }, NOW)).toBeNull();
    expect(weekOf(null, NOW)).toBeNull();
  });
});

describe('whereNow', () => {
  const base = { participant: { status: 'enrolled', last_active_at: daysAgo(2) }, journey, cohort: { starts_on: '2026-11-01', ends_on: '2027-01-23' } };
  it('المرحلة والأسبوع، وبانتظار الإدارة مقدَّم على المشارك', () => {
    const r = whereNow({ ...base, waiting: waitingCounts({ status: 'enrolled', requirements: [{ status: 'submitted' }, { status: 'submitted' }, { status: 'returned' }] }) }, NOW);
    expect(r.stage).toEqual({ text: 'البناء', week: 4, of: 12, tab: 'journey' });
    expect(r.waiting_on).toMatchObject({ who: 'admin', n: 2, tab: 'journey' });
    expect(r.waiting_on.text).toContain('بندان');
  });
  it('ما أُعيد للمشارك حين لا شيء عند الإدارة', () => {
    const r = whereNow({ ...base, waiting: waitingCounts({ models: [{ status: 'returned', learning_models: { capstone_sort: 1 } }] }) }, NOW);
    expect(r.waiting_on).toMatchObject({ who: 'participant', n: 1, tab: 'initiative' });
  });
  it('لا شيء معلق', () => {
    expect(whereNow({ ...base, waiting: waitingCounts({}) }, NOW).waiting_on).toEqual({ who: null, n: 0, text: 'لا شيء معلق', tab: null });
  });
  it(`آخر نشاط بنبرة تحذير بعد ${IDLE_WARN_DAYS} أيام، ولمن لم يدخل`, () => {
    expect(whereNow({ ...base, waiting: waitingCounts({}) }, NOW).last_activity).toMatchObject({ days: 2, tone: null, text: 'قبل يومين' });
    expect(whereNow({ ...base, participant: { status: 'enrolled', last_active_at: daysAgo(11) }, waiting: waitingCounts({}) }, NOW).last_activity.tone).toBe('warn');
    expect(whereNow({ ...base, participant: { status: 'enrolled', last_active_at: daysAgo(10) }, waiting: waitingCounts({}) }, NOW).last_activity.tone).toBeNull();
    expect(whereNow({ ...base, participant: { status: 'enrolled' }, waiting: waitingCounts({}) }, NOW).last_activity).toMatchObject({ at: null, tone: 'warn', text: 'لم يدخل بعد' });
    expect(whereNow({ ...base, participant: { status: 'withdrawn', last_active_at: daysAgo(40) }, waiting: waitingCounts({}) }, NOW).last_activity.tone).toBeNull();
  });
  it('التالي: أقرب جلسة محجوزة، وإلا أقرب معلم لم يتم', () => {
    const sessions = [{ status: 'booked', starts_at: daysAgo(-5), expert: 'سارة' }, { status: 'booked', starts_at: daysAgo(-2), expert: 'خالد' }, { status: 'attended', starts_at: daysAgo(-1) }];
    expect(whereNow({ ...base, sessions, waiting: waitingCounts({}) }, NOW).next).toMatchObject({ text: 'جلسة توجيه مع خالد', tab: 'initiative' });
    const milestones = [{ title_ar: 'ميثاق المبادرة', due: '2026-12-01', done: null }, { title_ar: 'سابق', due: '2026-11-01', done: { at: 'x' } }];
    expect(whereNow({ ...base, milestones, waiting: waitingCounts({}) }, NOW).next).toMatchObject({ text: 'ميثاق المبادرة', at: '2026-12-01', tab: 'journey' });
    expect(whereNow({ ...base, waiting: waitingCounts({}) }, NOW).next).toEqual({ text: 'لا موعد قادم', at: null, tab: null });
  });
  it('قبل الاعتماد: المرحلة قرار الإدارة', () => {
    const r = whereNow({ participant: { status: 'pending_approval' }, waiting: waitingCounts({ status: 'pending_approval' }) }, NOW);
    expect(r.stage).toMatchObject({ text: 'بانتظار اعتماد المسار', tab: 'decision' });
    expect(r.waiting_on).toMatchObject({ who: 'admin', tab: 'decision', text: 'قرارك: اعتماد المسار' });
  });
});
