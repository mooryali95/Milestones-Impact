// الأنشطة الموثقة: القراءة والفيديو والحضور والتوجيه وwebhook الحجز
import { describe, expect, it } from 'vitest';
import {
  applyReadingPing, applyVideoPing, bookingUrl, buildJourney, checkinOpen, cleanConfig, coachingStatus, mergeRanges,
  parseBooking, parseRef, qrToken, qrWindow, readingStatus, readingVerdict, verifyQrToken, verifyWebhook, videoSource,
  videoStatus, workshopStatus, READ_SLICES,
} from '../../supabase/functions/leaders-api/logic.js';

const full = (n) => Array.from({ length: READ_SLICES }, () => n);

describe('قراءة الكتاب', () => {
  // 1000 كلمة = 300 ثانية متوقعة
  it('القراءة الفعلية: وقت كافٍ وتغطية لأغلب الباب', () => {
    expect(readingVerdict({ words: 1000, active_seconds: 200, slices: full(10) }).state).toBe('read');
  });
  it('المرور السريع على الباب كله تصفح لا قراءة', () => {
    const v = readingVerdict({ words: 1000, active_seconds: 40, slices: full(2) });
    expect(v.state).toBe('skimmed');
    expect(v.pct).toBeLessThan(100);
  });
  it('وقت طويل على أول الباب فقط قراءة جزئية', () => {
    const slices = full(0); slices[0] = 400;
    expect(readingVerdict({ words: 1000, active_seconds: 400, slices }).state).toBe('partial');
  });
  it('لا سجل = لم يقرأ', () => expect(readingVerdict(null).state).toBe('unread'));

  it('النبضة لا تضيف أكثر من الزمن الفعلي منذ السابقة', () => {
    const now = Date.now();
    const row = { active_seconds: 100, slices: full(5), last_ping_at: new Date(now - 10_000).toISOString() };
    const r = applyReadingPing(row, { slices: full(30) }, now);
    expect(r.added).toBe(12);
    expect(r.active_seconds).toBe(112);
  });

  it('متطلب القراءة يشترط القراءة الفعلية واختبار الباب', () => {
    const chapters = [
      { id: 'a', dimension: 'milestone', title_ar: 'أ' }, { id: 'b', dimension: 'milestone', title_ar: 'ب' },
      { id: 'c', dimension: 'impact', title_ar: 'ج' },
    ];
    const read = { words: 1000, active_seconds: 200, slices: full(10) };
    const reading = { a: read, c: read };
    expect(readingStatus({ scope: 'first' }, chapters, reading, { a: true }).done).toBe(false);
    expect(readingStatus({ scope: 'first' }, chapters, reading, { a: true, c: true }).done).toBe(true);
    expect(readingStatus({ scope: 'first', quiz: false }, chapters, reading, {}).done).toBe(true);
    expect(readingStatus({ scope: 'all' }, chapters, reading, { a: true, c: true }).total).toBe(3);
  });
});

describe('الفيديو', () => {
  it('يدمج المقاطع المتداخلة', () => {
    expect(mergeRanges([[10, 20], [0, 5], [15, 30], [31, 40]], 100)).toEqual([[0, 5], [10, 40]]);
  });
  it('التقديم السريع لا يُحتسب مشاهدة', () => {
    const now = Date.now();
    const row = { duration: 600, ranges: [[0, 10]], last_ping_at: new Date(now - 10_000).toISOString() };
    const r = applyVideoPing(row, { duration: 600, ranges: [[10, 600]] }, now);
    expect(r.watched_seconds).toBeLessThanOrEqual(10 + 24);
  });
  it('يكتمل عند النسبة المحددة', () => {
    expect(videoStatus({ min_pct: 90 }, { duration: 100, watched_seconds: 91 }).done).toBe(true);
    expect(videoStatus({ min_pct: 90 }, { duration: 100, watched_seconds: 80 }).done).toBe(false);
  });
  it('يتعرف على يوتيوب والملفات', () => {
    expect(videoSource('https://youtu.be/dQw4w9WgXcQ')).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(videoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toEqual({ type: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(videoSource('https://cdn.x.com/a.mp4').type).toBe('file');
    expect(videoSource('http://x.com/a.mp4')).toBeNull();
  });
});

describe('الحضور برمز QR', () => {
  const id = '0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f';
  it('يقبل الرمز الحالي والسابق فقط', async () => {
    const now = Date.now();
    const t = await qrToken(id, 'sec', qrWindow(now));
    expect(await verifyQrToken(t, 'sec', now)).toBe(true);
    expect(await verifyQrToken(t, 'sec', now + 30_000)).toBe(true);
    expect(await verifyQrToken(t, 'sec', now + 61_000)).toBe(false);
    expect(await verifyQrToken(t, 'other', now)).toBe(false);
  });
  it('نافذة التسجيل حول وقت الجلسة', () => {
    const s = { starts_at: '2026-11-01T09:00:00Z', ends_at: '2026-11-01T15:00:00Z' };
    expect(checkinOpen(s, Date.parse('2026-11-01T08:30:00Z'))).toBe(true);
    expect(checkinOpen(s, Date.parse('2026-11-01T07:00:00Z'))).toBe(false);
    expect(checkinOpen({ ...s, active: false }, Date.parse('2026-11-01T10:00:00Z'))).toBe(false);
  });
  it('يكتمل بعدد الأيام المطلوبة', () => {
    const sessions = [1, 2, 3, 4].map((i) => ({ id: `s${i}`, title_ar: `يوم ${i}`, starts_at: `2026-11-0${i}T09:00:00Z` }));
    expect(workshopStatus({ sessions_required: 4 }, sessions, new Set(['s1', 's2', 's3'])).done).toBe(false);
    expect(workshopStatus({ sessions_required: 4 }, sessions, new Set(['s1', 's2', 's3', 's4'])).done).toBe(true);
  });
});

describe('جلسات التوجيه', () => {
  it('لا تُحتسب إلا الجلسات المؤكدة', () => {
    const now = Date.parse('2026-11-10T00:00:00Z');
    const st = coachingStatus({ sessions_required: 2 }, [
      { id: 1, status: 'attended', starts_at: '2026-11-01T09:00:00Z', ends_at: '2026-11-01T10:00:00Z' },
      { id: 2, status: 'booked', starts_at: '2026-11-05T09:00:00Z', ends_at: '2026-11-05T10:00:00Z' },
      { id: 3, status: 'cancelled', starts_at: '2026-11-06T09:00:00Z' },
    ], now);
    expect(st.done).toBe(false);
    expect(st.count).toBe(1);
    expect(st.sessions).toHaveLength(2);
    expect(st.sessions[1].awaiting).toBe(true);
    expect(st.can_book).toBe(false);
  });
  it('رابط الحجز يحمل الاسم والبريد والمرجع', () => {
    const cal = new URL(bookingUrl({ booking_url: 'https://cal.com/mi/coaching' }, { name: 'سارة', email: 's@x.com', ref: 'P.R' }));
    expect(cal.searchParams.get('metadata[ref]')).toBe('P.R');
    expect(cal.searchParams.get('email')).toBe('s@x.com');
    const cy = new URL(bookingUrl({ booking_url: 'https://calendly.com/mi/60min' }, { name: 'سارة', email: 's@x.com', ref: 'P.R' }));
    expect(cy.searchParams.get('utm_content')).toBe('P.R');
    expect(bookingUrl({ booking_url: 'http://cal.com/x' }, {})).toBeNull();
  });
  it('يقرأ حدث Cal.com وCalendly بصيغة واحدة', () => {
    const c = parseBooking('calcom', { triggerEvent: 'BOOKING_CREATED', payload: {
      uid: 'u1', startTime: '2026-11-01T09:00:00Z', endTime: '2026-11-01T10:00:00Z',
      attendees: [{ email: 'S@X.com' }], metadata: { ref: 'a.b', videoCallUrl: 'https://meet.google.com/x' } } });
    expect(c).toMatchObject({ event: 'created', external_id: 'calcom:u1', ref: 'a.b', email: 's@x.com', join_url: 'https://meet.google.com/x' });
    const y = parseBooking('calendly', { event: 'invitee.canceled', payload: { uri: 'https://api.calendly.com/i/1', email: 'a@b.co', tracking: { utm_content: 'a.b' }, scheduled_event: {} } });
    expect(y).toMatchObject({ event: 'cancelled', external_id: 'calendly:https://api.calendly.com/i/1' });
    expect(parseBooking('calcom', { triggerEvent: 'PING' })).toBeNull();
  });
  it('مرجع الحجز: مشارك.متطلب', () => {
    const a = '0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f', b = '1b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f';
    expect(parseRef(`${a}.${b}`)).toEqual({ participant_id: a, requirement_id: b });
    expect(parseRef('x.y')).toBeNull();
  });
  it('يتحقق من توقيع webhook', async () => {
    const raw = '{"a":1}';
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', 'k').update(raw).digest('hex');
    expect(await verifyWebhook('calcom', 'k', raw, { 'x-cal-signature-256': sig })).toBe(true);
    expect(await verifyWebhook('calcom', 'k', raw + ' ', { 'x-cal-signature-256': sig })).toBe(false);
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'k').update(`${t}.${raw}`).digest('hex');
    expect(await verifyWebhook('calendly', 'k', raw, { 'calendly-webhook-signature': `t=${t},v1=${v1}` })).toBe(true);
    expect(await verifyWebhook('calendly', '', raw, { 'calendly-webhook-signature': `t=${t},v1=${v1}` })).toBe(false);
  });
});

describe('إعداد النشاط', () => {
  it('يضبط الحقول بحسب النوع', () => {
    expect(cleanConfig('coaching', { sessions_required: '4', booking_url: 'https://cal.com/mi/x', junk: 1 }, { instant_until: 'T' }))
      .toEqual({ sessions_required: 4, minutes: 60, booking_url: 'https://cal.com/mi/x', provider: 'calcom', instant_until: 'T' });
    expect(() => cleanConfig('video', { url: 'ftp://x' })).toThrow();
    expect(cleanConfig('reading', { scope: 'bad' })).toEqual({ scope: 'all', quiz: true });
    expect(cleanConfig('check', { a: 1 })).toEqual({});
  });
});

describe('الرحلة مع الأنشطة الموثقة', () => {
  const stages = [{ key: 'training', sort: 1 }, { key: 'ojt', sort: 2 }];
  const reqs = [{ id: 'r1', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', required: true, sort: 1 }];
  it('النشاط يكتمل بدليله لا بالتأشير', () => {
    const progress = {};
    const j1 = buildJourney({ stages, requirements: reqs, progress, levels: {}, state: {}, activity: { r1: { done: false } } });
    expect(j1[0].status).toBe('active');
    const j2 = buildJourney({ stages, requirements: reqs, progress, levels: {}, state: {}, activity: { r1: { done: true } } });
    expect(j2[0].status).toBe('done');
    expect(j2[0].items[0].activity.done).toBe(true);
  });
  it('اعتماد المستشار اليدوي يتجاوز الدليل', () => {
    const j = buildJourney({ stages, requirements: reqs, progress: { r1: { status: 'done' } }, levels: {}, state: {}, activity: { r1: { done: false } } });
    expect(j[0].status).toBe('done');
  });
});
