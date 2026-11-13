// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة: قراءة الكتاب، الفيديو، الورش الحضورية، جلسات التوجيه
// ════════════════════════════════════════════════════════════════
// الدليل يجمعه الخادم: نبضات القراءة والمشاهدة بسقف زمني، ورمز QR متغير
// للحضور، وwebhook موقّع من منصة الحجز. الإكمال يُحسب في logic.js.
import { audit, CONFIG, db, Fail, mailButton, must, randomToken, sendMail, sessionReminderMail, WORKSHOP_MAIL, workshopMail } from './core.ts';
import * as OB from './observations.ts';
import { RULES } from './notice-rules.js';
import { cohortMembers, contentLevelsFor, releaseOf, requirementFor } from './programs.ts';
import { esc, icsEvent, mailShell, mailText } from '../_shared/mail.ts';
import {
  activityFor, applyReadingPing, applyVideoPing, bookingUrl, checkinOpen, filterHandbookMd, handbookModulesFor,
  contentApplies, contentState, inProgram, instantAvailable, parseBooking, parseQrToken, pickCohort, parseRef, qrToken, QR_WINDOW, readingVerdict, requirementApplies,
  verifyQrToken, verifyWebhook, VERIFIED_KINDS, videoSource, videoStatus, wordCount, modelsFor, approvalOf,
} from './logic.js';

type Body = Record<string, any>;
type Ctx = { ip: string | null; ua: string | null };

// ── جمع الأدلة لرحلة المشارك ──
// يعيد حالة كل متطلب موثق يخصه: { [requirement_id]: activity }
// cohortId: دفعة المشارك؛ يرى جلسات دفعته والجلسات العامة لكل الدفعات.

// الخبير صاحب الجلسة: يُختار صراحة، أو يُطابق نص المدرب (من الحجز أو المسجّل) ببريد خبير أو اسمه
// وإلا فكوتش المشارك المسند إليه بطلب مقبول (expert_requests): مصدر واحد لـ«من كوتشه»
async function expertFor(id: unknown, coach: unknown, participantId?: string): Promise<string | null> {
  if (id) {
    const { data } = await db.from('experts').select('id').eq('id', String(id)).maybeSingle();
    if (data) return data.id;
  }
  const c = String(coach || '').trim();
  if (c) {
    const { data } = await db.from('experts').select('id').or(`email.eq.${c.toLowerCase().replace(/[,()]/g, '')},full_name.eq.${c.replace(/[,()]/g, '')}`).limit(1);
    if (data?.[0]) return data[0].id;
  }
  if (!participantId) return null;
  const { data: req } = await db.from('expert_requests').select('expert_id').eq('participant_id', participantId).eq('role', 'coach').eq('status', 'accepted').maybeSingle();
  return req?.expert_id || null;
}
export async function evidenceFor(p: any, reqs: any[], levels: Record<string, string>, approved: boolean, cohortId: string | null = null) {
  const mine = reqs.filter((r) => VERIFIED_KINDS.includes(r.kind) && r.active !== false && requirementApplies(r, levels));
  if (!mine.length) return {};
  const kinds = new Set(mine.map((r) => r.kind));
  // فصول وثيقة المبادرة في متطلب «capstone» بفصول بعينها تُقرأ من حالة النماذج نفسها
  const needModels = kinds.has('model') || mine.some((r) => r.kind === 'capstone' && r.config?.sections?.length);
  const ids = mine.map((r) => r.id);
  const none = Promise.resolve({ data: [] as any[] });
  // متطلب «أداة من المختبر»: محاولات المشارك في الأداة نفسها، بمفتاحها
  const labKeys = [...new Set(mine.filter((r) => r.kind === 'lab').map((r) => String(r.config?.lab_key || '')).filter(Boolean))];
  const [mods, reading, quiz, video, ws, att, coach, content, contentProgress, lm, subs, cap, labItems, labTries] = await Promise.all([
    kinds.has('reading') && approved
      ? db.from('handbook_modules').select('id, dimension, sort, min_level, title_ar').not('body_md', 'is', null).neq('body_md', '') : none,
    kinds.has('reading') ? db.from('reading_progress').select('module_id, words, active_seconds, slices').eq('participant_id', p.id) : none,
    kinds.has('reading') ? db.from('handbook_progress').select('module_id').eq('participant_id', p.id) : none,
    kinds.has('video') ? db.from('video_progress').select('*').eq('participant_id', p.id).in('requirement_id', ids) : none,
    kinds.has('workshop') ? db.from('workshop_sessions').select('id, requirement_id, cohort_id, title_ar, location_ar, starts_at, ends_at, active, mode, join_url').in('requirement_id', ids) : none,
    kinds.has('workshop') ? db.from('workshop_attendance').select('session_id').eq('participant_id', p.id) : none,
    kinds.has('coaching') ? db.from('coaching_sessions').select('*').eq('participant_id', p.id).in('requirement_id', ids) : none,
    // منهج المسار يُفتح مع الكتيب بعد اعتماد المستويات
    kinds.has('curriculum') && approved ? db.from('content_items').select(CONTENT_COLS).eq('active', true) : none,
    kinds.has('curriculum') ? db.from('content_progress').select('*').eq('participant_id', p.id) : none,
    // متطلب «نموذج»: حالة تسليم النموذج نفسه في مكتبة النماذج، لا ملف مرفوع
    needModels && approved ? db.from('learning_models').select('id, key, dimension, sort, min_level, active, scopes, title_ar') : none,
    needModels && approved ? db.from('model_submissions').select('model_id, status').eq('participant_id', p.id) : none,
    kinds.has('capstone') ? db.from('capstones').select('status, readiness').eq('participant_id', p.id).maybeSingle().then((r: any) => ({ data: r.data ? [r.data] : [] })) : none,
    labKeys.length ? db.from('lab_items').select('id, key, title_ar, active').in('key', labKeys) : none,
    labKeys.length ? db.from('lab_attempts').select('item_id, pct, finished_at').eq('participant_id', p.id).not('finished_at', 'is', null) : none,
  ]);
  // تعذر قراءة الأداة أو المحاولات لا يُعدّ «أداة غائبة» فيكتمل المتطلب بخطأ عابر: labs = null فيبقى غير مكتمل (labStatus)
  const labsFailed = !!((labItems as any).error || (labTries as any).error);
  if (labsFailed) console.error('lab evidence', (labItems as any).error || (labTries as any).error);
  const labs = labsFailed ? null : Object.fromEntries((labItems.data || []).map((it: any) => {
    const tries = (labTries.data || []).filter((a: any) => a.item_id === it.id).sort((a: any, b: any) => String(a.finished_at).localeCompare(String(b.finished_at)));
    return [it.key, {
      item_id: it.id, title: it.title_ar, active: it.active !== false, attempts: tries.length,
      best: tries.length ? Math.max(...tries.map((a: any) => Number(a.pct) || 0)) : null, first_at: tries[0]?.finished_at || null, last_at: tries.at(-1)?.finished_at || null,
    }];
  }));
  const subBy = Object.fromEntries((subs.data || []).map((s: any) => [s.model_id, s.status]));
  const rel = kinds.has('reading') ? await releaseOf(p).catch(() => null) : null;
  const inRelease = rel?.modules?.length ? new Set(rel.modules) : null;
  const ev = {
    // body_md لا يُجلب هنا؛ الأبواب المصفاة غير فارغة أصلًا
    // D02: بند القراءة على أبواب إصدار الدفعة، فلا يتغير مطلوبها بباب يُضاف أثناءها
    chapters: handbookModulesFor((mods.data || []).filter((m: any) => !inRelease || inRelease.has(m.id)).map((m: any) => ({ ...m, body_md: '1' })), levels),
    reading: Object.fromEntries((reading.data || []).map((r: any) => [r.module_id, r])),
    quizzes: Object.fromEntries((quiz.data || []).map((r: any) => [r.module_id, true])),
    video: Object.fromEntries((video.data || []).map((r: any) => [r.requirement_id, r])),
    workshops: (ws.data || []).filter((s: any) => !s.cohort_id || s.cohort_id === cohortId),
    attended: new Set((att.data || []).map((a: any) => a.session_id)),
    coaching: coach.data || [],
    levels,
    curriculumLocked: !approved,
    content: content.data || [],
    contentProgress: Object.fromEntries((contentProgress.data || []).map((r: any) => [r.item_id, r])),
    modelsLocked: !approved,
    models: Object.fromEntries(modelsFor(lm.data || [], levels, p.work_scope)
      .map((m: any) => [m.key, { model_id: m.id, title: m.title_ar, status: subBy[m.id] || null }])),
    capstone: cap.data?.[0] || null,
    labs,
  };
  return Object.fromEntries(mine.map((r) => [r.id, activityFor(r, ev)]));
}

// ما يراه المشارك من إعداد النشاط: بلا بريد الموجّه، ورابط الاتصال الفوري
// فقط حين يكون متاحًا، ورابط الحجز معبأ باسمه ومرجعه.
export function participantItem(it: any, p: any) {
  if (!VERIFIED_KINDS.includes(it.kind)) return it;
  const c = it.config || {};
  const act = it.activity ? { ...it.activity } : null;
  if (act && it.kind === 'coaching') {
    act.book_url = c.booking_url && act.can_book
      ? bookingUrl(c, { name: p.full_name, email: p.email, ref: `${p.id}.${it.id}` }) : null;
    act.provider = c.booking_url ? c.provider || null : null;
    act.instant = instantAvailable(c) && act.can_book;
    act.mode = c.mode || 'online';
    act.location = c.location_ar || null;
  }
  if (act && it.kind === 'video') { act.source = videoSource(c.url); act.title = c.title || null; }
  if (act && it.kind === 'curriculum') act.items = act.items.map((x: any) => (x.kind === 'video' ? { ...x, url: null, source: videoSource(x.url) } : x));
  const { config: _c, ...rest } = it;
  return { ...rest, activity: act };
}

// المتطلب كما يسري على المشارك: من برنامج دفعته وبتخصيصها
async function myRequirement(p: any, id: unknown, kind: string, session?: { cohort_id?: string | null }) {
  const { r, def } = await requirementFor(p, id, kind);
  const levels = await contentLevelsFor(p, await levelsOf(p.id));
  if (!requirementApplies(r, levels)) throw new Fail('هذا النشاط لا يخص مسارك', 403);
  if (session?.cohort_id && session.cohort_id !== def.cohort?.id) throw new Fail('هذه الجلسة لدفعة أخرى', 403, 'cohort');
  return r;
}

async function levelsOf(participantId: string, approvedOnly = false) {
  const pl = must(await db.from('placements').select('dimension, level, approved_at').eq('participant_id', participantId)) ?? [];
  const a = approvalOf(pl);
  if (approvedOnly && !a.approved) throw new Fail('يُفتح هذا بعد اعتماد مسارك', 403, 'locked');
  return a.levels as Record<string, string>;
}

// ── نبضة القراءة ──
// يرسلها القارئ كل 15 ثانية تقريبًا: ثوانٍ نشطة لكل شريحة من الباب.
export async function readingPing(p: any, b: Body) {
  const levels = await contentLevelsFor(p, await levelsOf(p.id, true));
  const id = String(b.id || '');
  const { data: row } = await db.from('reading_progress').select('*').eq('participant_id', p.id).eq('module_id', id).maybeSingle();
  let words = row?.words || 0;
  if (!row) {
    const m = must(await db.from('handbook_modules').select('id, dimension, min_level, body_md').eq('id', id).maybeSingle());
    if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
    words = wordCount(filterHandbookMd(m.body_md, levels[m.dimension], p.work_scope));
  }
  const now = new Date();
  const next = applyReadingPing(row, b, now.getTime());
  const out = { participant_id: p.id, module_id: id, words, active_seconds: next.active_seconds, slices: next.slices, last_ping_at: now.toISOString() };
  must(await db.from('reading_progress').upsert(out));
  return { success: true, reading: readingVerdict(out) };
}

// ── منهج المسار ──
const CONTENT_COLS = 'id, kind, title_ar, description_ar, url, minutes, dimension, min_level, only_level, track_keys, exclude_tracks, required, min_pct, sort, active';
async function myContent(p: any, id: unknown) {
  const levels = await contentLevelsFor(p, await levelsOf(p.id, true));
  const item = must(await db.from('content_items').select(CONTENT_COLS).eq('id', String(id || '')).maybeSingle());
  if (!item || !contentApplies(item, levels)) throw new Fail('هذه المادة لا تخص مسارك', 404);
  return item;
}

// نبضة مشاهدة مقطع من المنهج، بقواعد نبضة الفيديو نفسها
export async function contentPing(p: any, b: Body) {
  const item = await myContent(p, b.item_id);
  if (item.kind !== 'video') throw new Fail('هذه المادة ليست مقطعًا');
  const { data: row } = await db.from('content_progress').select('*').eq('participant_id', p.id).eq('item_id', item.id).maybeSingle();
  const now = new Date();
  const next = applyVideoPing(row, b, now.getTime());
  const st = contentState(item, next);
  must(await db.from('content_progress').upsert({
    participant_id: p.id, item_id: item.id, ...next, last_ping_at: now.toISOString(),
    completed_at: row?.completed_at || (st.done ? now.toISOString() : null),
  }));
  return { success: true, item: { id: item.id, ...st } };
}

// فتح ملف أو رابط من المنهج: يُسجَّل ويعيد الرابط
export async function contentOpen(p: any, b: Body) {
  const item = await myContent(p, b.item_id);
  if (item.kind === 'video') throw new Fail('المقطع يُشاهد داخل التطبيق');
  const now = new Date().toISOString();
  const { data: row } = await db.from('content_progress').select('opened_at').eq('participant_id', p.id).eq('item_id', item.id).maybeSingle();
  if (!row?.opened_at) {
    must(await db.from('content_progress').upsert({ participant_id: p.id, item_id: item.id, opened_at: now, completed_at: now, last_ping_at: now }));
  }
  return { success: true, url: item.url };
}

// ── نبضة الفيديو ──
export async function videoPing(p: any, b: Body) {
  const r = await myRequirement(p, b.requirement_id, 'video');
  const { data: row } = await db.from('video_progress').select('*').eq('participant_id', p.id).eq('requirement_id', r.id).maybeSingle();
  const now = new Date();
  const next = applyVideoPing(row, b, now.getTime());
  const st = videoStatus(r.config, next);
  must(await db.from('video_progress').upsert({
    participant_id: p.id, requirement_id: r.id, ...next, last_ping_at: now.toISOString(),
    completed_at: row?.completed_at || (st.done ? now.toISOString() : null),
  }));
  return { success: true, video: st };
}

// ── تسجيل الحضور بمسح رمز QR ──
export async function workshopCheckin(p: any, b: Body, ctx: Ctx) {
  const t = String(b.t || '');
  const parsed = parseQrToken(t);
  if (!parsed) throw new Fail('رمز الحضور غير صالح', 400, 'qr_invalid');
  const s = must(await db.from('workshop_sessions').select('*').eq('id', parsed.sessionId).maybeSingle());
  if (!s) throw new Fail('رمز الحضور غير صالح', 400, 'qr_invalid');
  if (!(await verifyQrToken(t, s.secret))) throw new Fail('انتهت صلاحية الرمز، امسح الرمز المعروض الآن', 400, 'qr_expired');
  if (!checkinOpen(s)) throw new Fail('تسجيل الحضور لهذه الجلسة غير متاح الآن', 400, 'closed');
  const r = await myRequirement(p, s.requirement_id, 'workshop', s);
  if ((r.config?.verify || 'qr') !== 'qr') throw new Fail('حضور هذه الجلسة يُوثَّق بطريقة أخرى', 400, 'method');
  const { data: prev } = await db.from('workshop_attendance').select('checked_in_at').eq('session_id', s.id).eq('participant_id', p.id).maybeSingle();
  if (!prev) {
    must(await db.from('workshop_attendance').insert({ session_id: s.id, participant_id: p.id, method: 'qr', ip: ctx.ip, user_agent: ctx.ua }));
    await audit('participant', p.email, 'workshop.checkin', 'workshop_sessions', s.id);
  }
  return { success: true, already: !!prev, session: { title: s.title_ar, location: s.location_ar, requirement: r.title_ar }, at: prev?.checked_in_at || new Date().toISOString() };
}

// ── الانضمام إلى جلسة جماعية عن بعد ──
// يعيد رابط الاجتماع في نافذة الجلسة فقط. إن كان التوثيق بالانضمام يُسجَّل الحضور.
export async function workshopJoin(p: any, b: Body, ctx: Ctx) {
  const s = must(await db.from('workshop_sessions').select('*').eq('id', String(b.session_id || '')).maybeSingle());
  if (!s || s.mode !== 'online' || !s.join_url) throw new Fail('الجلسة غير موجودة', 404);
  if (!checkinOpen(s)) throw new Fail('رابط الجلسة يُفتح قبل موعدها بساعة', 400, 'closed');
  const r = await myRequirement(p, s.requirement_id, 'workshop', s);
  if (r.config?.verify === 'join') {
    must(await db.from('workshop_attendance').upsert(
      { session_id: s.id, participant_id: p.id, method: 'join', ip: ctx.ip, user_agent: ctx.ua },
      { onConflict: 'session_id,participant_id', ignoreDuplicates: true },
    ));
  }
  await audit('participant', p.email, 'workshop.join', 'workshop_sessions', s.id);
  return { success: true, join_url: s.join_url, recorded: r.config?.verify === 'join' };
}

// ── الاتصال الفوري ──
// متاح حين يعلن الموجّه توفره. يُسجَّل الطلب ويُبلَّغ الموجّه، ويدخل المشارك الغرفة مباشرة.
export async function coachingInstant(p: any, b: Body) {
  const r = await myRequirement(p, b.requirement_id, 'coaching');
  const c = r.config || {};
  if (!instantAvailable(c)) throw new Fail('الموجّه غير متاح للاتصال الفوري الآن، احجز موعدًا', 400, 'unavailable');
  const since = new Date(Date.now() - 2 * 36e5).toISOString();
  const { data: recent } = await db.from('coaching_sessions').select('*').eq('participant_id', p.id).eq('requirement_id', r.id)
    .eq('kind', 'instant').eq('status', 'requested').gte('created_at', since).limit(1);
  if (recent?.length) return { success: true, join_url: recent[0].join_url };
  const now = new Date();
  must(await db.from('coaching_sessions').insert({
    participant_id: p.id, requirement_id: r.id, kind: 'instant', provider: 'instant', status: 'requested',
    starts_at: now.toISOString(), ends_at: new Date(now.getTime() + (Number(c.minutes) || 30) * 6e4).toISOString(), join_url: c.instant_url,
  }));
  if (c.coach_email) {
    sendMail(c.coach_email, `اتصال فوري: ${p.full_name}`, mailShell('مشارك ينضم إليك الآن',
      mailText(`${esc(p.full_name)} طلب اتصالًا فوريًا في «${esc(r.title_ar)}» وهو في طريقه إلى غرفتك الآن.`) + mailButton(c.instant_url, 'افتح الغرفة'),
      { family: 'sessions', preheader: `${p.full_name} في طريقه إلى غرفتك`, footnote: '' })).catch((e) => console.error(e));
  }
  await audit('participant', p.email, 'coaching.instant', 'stage_requirements', r.id);
  return { success: true, join_url: c.instant_url };
}

// ── webhook منصة الحجز ──
// يُستدعى من دالة leaders-hooks (بلا JWT، والتوقيع هو الحماية).
export async function bookingWebhook(provider: string, raw: string, headers: Headers) {
  const secret = provider === 'calcom' ? CONFIG.calcomSecret : provider === 'calendly' ? CONFIG.calendlyKey : '';
  if (!(await verifyWebhook(provider, secret, raw, headers))) throw new Fail('توقيع غير صالح', 401, 'signature');
  let body: any;
  try { body = JSON.parse(raw); } catch { throw new Fail('جسم غير صالح'); }
  const e = parseBooking(provider, body);
  if (!e) return { success: true, ignored: 'event' };
  const now = new Date().toISOString();

  if (e.event === 'cancelled') {
    await db.from('coaching_sessions').update({ status: 'cancelled', updated_at: now })
      .eq('external_id', e.external_id).in('status', ['booked', 'requested']);
    return { success: true };
  }
  const ref = parseRef(e.ref);
  const { data: known } = await db.from('coaching_sessions').select('participant_id, requirement_id').eq('external_id', e.previous_id || e.external_id).maybeSingle();
  const target = ref || known;
  if (!target) return { success: true, ignored: 'no_ref' };
  const { data: r } = await db.from('stage_requirements').select('id, kind').eq('id', target.requirement_id).maybeSingle();
  const { data: p } = await db.from('participants').select('id').eq('id', target.participant_id).maybeSingle();
  if (!r || r.kind !== 'coaching' || !p) return { success: true, ignored: 'unknown_ref' };

  if (e.previous_id) {
    await db.from('coaching_sessions').update({ status: 'cancelled', updated_at: now }).eq('external_id', e.previous_id).eq('status', 'booked');
  }
  must(await db.from('coaching_sessions').upsert({
    participant_id: p.id, requirement_id: r.id, kind: 'booked', provider, external_id: e.external_id,
    starts_at: e.starts_at, ends_at: e.ends_at, join_url: e.join_url, coach: e.coach, expert_id: await expertFor(null, e.coach, p.id), status: 'booked', updated_at: now,
  }, { onConflict: 'external_id' }));
  await audit('system', provider, 'coaching.booked', 'participants', p.id, null, { starts_at: e.starts_at });
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
// الإدارة
// ════════════════════════════════════════════════════════════════

// نظرة عامة: الأنشطة الموثقة، والورش وحضورها، وجلسات التوجيه
export async function overview() {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [reqs, ws, att, coach, programs, cohorts] = await Promise.all([
    db.from('stage_requirements').select('id, program_id, code, title_ar, stage_key, kind, config, dimension, level, active').in('kind', VERIFIED_KINDS).order('sort'),
    // بـ* لتحمل invited_at بعد الترحيل 20261110140000 وتعمل قبله؛ والسر لا يخرج إلى اللوحة (يُحذف أدناه)
    db.from('workshop_sessions').select('*').order('starts_at'),
    db.from('workshop_attendance').select('session_id'),
    db.from('coaching_sessions').select('*, participants(full_name, email), experts(full_name)').or(`starts_at.gte.${since},status.in.(booked,requested)`)
      .order('starts_at', { ascending: true }).limit(500),
    db.from('programs').select('id, name').is('archived_at', null),
    db.from('cohorts').select('id, name, program_id, status').neq('status', 'closed').order('created_at', { ascending: false }),
  ]);
  const counts: Record<string, number> = {};
  for (const a of att.data || []) counts[a.session_id] = (counts[a.session_id] || 0) + 1;
  return {
    success: true,
    requirements: (reqs.data || []).map((r: any) => ({ ...r, instant_open: instantAvailable(r.config) })),
    workshops: (ws.data || []).map((s: any) => { const row = { ...s, attended: counts[s.id] || 0 }; delete row.secret; return row; }),
    coaching: coach.data || [],
    programs: programs.data || [], cohorts: cohorts.data || [],
  };
}

export async function workshopSave(a: any, b: Body) {
  const row = b.row || {};
  const mode = row.mode === 'online' ? 'online' : 'in_person';
  const out: Body = {
    title_ar: String(row.title_ar || '').trim().slice(0, 200),
    mode,
    location_ar: mode === 'in_person' ? String(row.location_ar || '').trim().slice(0, 300) || null : null,
    join_url: mode === 'online' ? String(row.join_url || '').trim().slice(0, 500) || null : null,
    starts_at: row.starts_at, ends_at: row.ends_at, active: row.active !== false,
  };
  // فارغ صراحة: الجلسة لكل الدفعات. وغياب الحقل في التحرير يُبقي ربطها القائم؛ كان يكتب null فيفك
  // ربط الجلسة بدفعتها بصمت فتسقط دعوتها وتذكيرها (التدقيق 2026-11-11، admin-program-3)
  if ('cohort_id' in row || !row.id) out.cohort_id = /^[0-9a-f-]{36}$/.test(String(row.cohort_id || '')) ? row.cohort_id : null;
  if (!out.title_ar) throw new Fail('عنوان الجلسة مطلوب');
  if (mode === 'online' && !/^https:\/\/\S+$/.test(out.join_url || '')) throw new Fail('الجلسة عن بعد تحتاج رابط اجتماع يبدأ بـ https');
  if (!(new Date(out.ends_at) > new Date(out.starts_at))) throw new Fail('وقت الانتهاء بعد وقت البدء');
  let saved: any;
  if (row.id) {
    saved = must(await db.from('workshop_sessions').update(out).eq('id', row.id).select('id').single(), 'تعذّر الحفظ');
  } else {
    const r = must(await db.from('stage_requirements').select('id, kind').eq('id', String(row.requirement_id || '')).maybeSingle());
    if (!r || r.kind !== 'workshop') throw new Fail('اختر متطلب ورشة');
    saved = must(await db.from('workshop_sessions').insert({ ...out, requirement_id: r.id, secret: randomToken(32) }).select('id').single(), 'تعذّر الحفظ');
  }
  await audit('admin', a.email, row.id ? 'workshop.update' : 'workshop.create', 'workshop_sessions', saved.id, null, out);
  return { success: true, id: saved.id };
}

export async function workshopDelete(a: any, b: Body) {
  const id = String(b.id || '');
  const { count } = await db.from('workshop_attendance').select('session_id', { count: 'exact', head: true }).eq('session_id', id);
  if (count) throw new Fail('للجلسة حضور مسجل؛ أوقفها بدل حذفها');
  must(await db.from('workshop_sessions').delete().eq('id', id));
  await audit('admin', a.email, 'workshop.delete', 'workshop_sessions', id);
  return { success: true };
}

// رمز الحضور الحالي لعرضه على شاشة القاعة. يتجدد كل 30 ثانية.
export async function workshopQr(b: Body) {
  const s = must(await db.from('workshop_sessions').select('id, secret, title_ar, location_ar, starts_at, ends_at, active, mode').eq('id', String(b.id || '')).maybeSingle());
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  const t = await qrToken(s.id, s.secret);
  const { count } = await db.from('workshop_attendance').select('session_id', { count: 'exact', head: true }).eq('session_id', s.id);
  const left = QR_WINDOW - (Math.floor(Date.now() / 1000) % QR_WINDOW);
  return {
    success: true, url: `${CONFIG.appUrl}/?checkin=${encodeURIComponent(t)}`, refresh_in: left, open: checkinOpen(s), attended: count || 0,
    session: { id: s.id, title: s.title_ar, mode: s.mode, location: s.location_ar, starts_at: s.starts_at, ends_at: s.ends_at },
  };
}

// الحضور ومن يُتوقع حضوره (من ينطبق عليهم المتطلب بعد اعتماد مسارهم)
export async function workshopAttendance(b: Body) {
  const s = must(await db.from('workshop_sessions').select('id, requirement_id, cohort_id, title_ar, location_ar, starts_at, ends_at, active, mode').eq('id', String(b.id || '')).maybeSingle());
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  const none = Promise.resolve({ data: [] as any[] });
  const [{ data: r }, { data: att }, { data: pl }, { data: enr }, { data: cohorts }] = await Promise.all([
    db.from('stage_requirements').select('*').eq('id', s.requirement_id).single(),
    db.from('workshop_attendance').select('participant_id, checked_in_at, method, recorded_by').eq('session_id', s.id),
    db.from('placements').select('participant_id, dimension, level, approved_at, participants(full_name, email, organization_name, organization_id, status)'),
    s.cohort_id ? db.from('enrollments').select('participant_id, cohort_id, status, created_at') : none,
    s.cohort_id ? db.from('cohorts').select('id, organization_id, status, is_default, starts_on, created_at') : none,
  ]);
  // جلسة دفعة بعينها: المتوقع حضورهم مشاركو تلك الدفعة فقط
  const inCohort = (e: any) => !s.cohort_id || pickCohort({
    enrollments: (enr || []).filter((x: any) => x.participant_id === e.id), cohorts: cohorts || [], organizationId: e.organization_id || null,
  }).cohort?.id === s.cohort_id;
  const by: Record<string, any> = {};
  for (const x of pl || []) {
    const e = (by[x.participant_id] ||= { id: x.participant_id, ...x.participants, levels: {}, approved: 0 });
    e.levels[x.dimension] = x.level;
    if (x.approved_at) e.approved++;
  }
  const present = Object.fromEntries((att || []).map((a: any) => [a.participant_id, a]));
  const people = Object.values(by)
    .filter((e: any) => (e.approved === 3 && inProgram(e.status) && requirementApplies(r, e.levels) && inCohort(e)) || present[e.id])
    .map((e: any) => ({ id: e.id, full_name: e.full_name, email: e.email, organization_name: e.organization_name, attendance: present[e.id] || null }))
    .sort((x: any, y: any) => String(x.full_name).localeCompare(String(y.full_name), 'ar'));
  return { success: true, session: s, requirement: { id: r.id, title_ar: r.title_ar }, people };
}

export async function workshopMark(a: any, b: Body) {
  const sid = String(b.session_id || ''), pid = String(b.participant_id || '');
  if (b.present) {
    must(await db.from('workshop_attendance').upsert({ session_id: sid, participant_id: pid, method: 'manual', recorded_by: a.email }, { onConflict: 'session_id,participant_id', ignoreDuplicates: true }));
  } else {
    must(await db.from('workshop_attendance').delete().eq('session_id', sid).eq('participant_id', pid));
  }
  await audit('admin', a.email, b.present ? 'workshop.mark' : 'workshop.unmark', 'participants', pid, null, { session_id: sid });
  return { success: true };
}

// تأكيد الموجّه: حضر، لم يحضر، أُلغيت، أو إعادتها محجوزة
export async function coachingMark(a: any, b: Body) {
  const status = String(b.status || '');
  if (!['attended', 'no_show', 'cancelled', 'booked'].includes(status)) throw new Fail('حالة غير صالحة');
  const now = new Date().toISOString();
  must(await db.from('coaching_sessions').update({
    status, note: b.note ? String(b.note).slice(0, 2000) : null, updated_at: now,
    confirmed_by: status === 'booked' ? null : a.email, confirmed_at: status === 'booked' ? null : now,
  }).eq('id', String(b.id || '')));
  await audit('admin', a.email, `coaching.${status}`, 'coaching_sessions', String(b.id));
  // الغياب يُكتب في ملف المشارك ويُبلَّغ به مرة واحدة للجلسة (notice-rules.js)
  if (status === 'no_show') {
    const { data: s } = await db.from('coaching_sessions').select('id, participant_id, starts_at').eq('id', String(b.id || '')).maybeSingle();
    if (s?.participant_id) await OB.record(s.participant_id, { code: 'coaching_no_show', ref: s.id, ...RULES.coaching_no_show(s) });
  }
  return { success: true };
}

// جلسة يسجلها المستشار يدويًا (موعد رُتّب خارج المنصة)
export async function coachingAdd(a: any, b: Body) {
  const r = must(await db.from('stage_requirements').select('id, kind').eq('id', String(b.requirement_id || '')).maybeSingle());
  if (!r || r.kind !== 'coaching') throw new Fail('اختر متطلب توجيه');
  const starts = b.starts_at ? new Date(b.starts_at) : new Date();
  if (isNaN(starts.getTime())) throw new Fail('الموعد غير صحيح');
  const status = b.status === 'booked' ? 'booked' : 'attended';
  const now = new Date().toISOString();
  must(await db.from('coaching_sessions').insert({
    participant_id: String(b.participant_id), requirement_id: r.id, kind: 'manual', provider: 'manual', status,
    starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + (Number(b.minutes) || 60) * 6e4).toISOString(),
    join_url: b.join_url ? String(b.join_url).slice(0, 500) : null, note: b.note ? String(b.note).slice(0, 2000) : null,
    coach: a.email, expert_id: await expertFor(b.expert_id, a.email, String(b.participant_id)), confirmed_by: status === 'attended' ? a.email : null, confirmed_at: status === 'attended' ? now : null,
  }));
  await audit('admin', a.email, 'coaching.add', 'participants', String(b.participant_id), null, { requirement_id: r.id, status });
  return { success: true };
}

// الموجّه يعلن توفره للاتصال الفوري لعدد من الدقائق، أو يغلقه (0)
export async function coachAvailable(a: any, b: Body) {
  const r = must(await db.from('stage_requirements').select('id, kind, config').eq('id', String(b.requirement_id || '')).maybeSingle());
  if (!r || r.kind !== 'coaching') throw new Fail('اختر متطلب توجيه');
  if (!r.config?.instant_url) throw new Fail('أضف رابط غرفة الاتصال الفوري في إعداد المتطلب أولًا');
  const minutes = Math.min(480, Math.max(0, Number(b.minutes) || 0));
  const config = { ...r.config, instant_until: minutes ? new Date(Date.now() + minutes * 6e4).toISOString() : null };
  must(await db.from('stage_requirements').update({ config }).eq('id', r.id));
  await audit('admin', a.email, minutes ? 'coaching.available' : 'coaching.unavailable', 'stage_requirements', r.id, null, { minutes });
  return { success: true, instant_until: config.instant_until };
}

// ── تذكير الجلسات (من المهمة الساعية) ──
// الجلسات المحجوزة التي تبدأ بين 23 و25 ساعة من الآن، ولم يُرسل تذكيرها: مرة واحدة لكل جلسة
export async function sessionReminders() {
  const now = Date.now();
  const { data } = await db.from('coaching_sessions').select('id, starts_at, ends_at, join_url, participants(full_name, email), experts(full_name)')
    .eq('status', 'booked').is('reminded_at', null)
    .gte('starts_at', new Date(now + 23 * 36e5).toISOString()).lte('starts_at', new Date(now + 25 * 36e5).toISOString()).limit(200);
  let sent = 0;
  for (const s of (data || []) as any[]) {
    const { data: mark } = await db.from('coaching_sessions').update({ reminded_at: new Date().toISOString() }).eq('id', s.id).is('reminded_at', null).select('id');
    if (!mark?.length || !s.participants?.email) continue;
    const when = new Date(s.starts_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
    // ومعه دعوة تقويم تُضاف بنقرة، بتنبيه قبل الجلسة بنصف ساعة
    const ics = icsEvent({ uid: s.id, start: s.starts_at, end: s.ends_at || new Date(Date.parse(s.starts_at) + 36e5).toISOString(),
      title: `جلسة توجيه${s.experts?.full_name ? ` مع ${s.experts.full_name}` : ''} · برنامج القادة`, description: 'Milestone Impact · Leaders Program', url: s.join_url || '' });
    await sendMail(s.participants.email, 'جلستك غدًا', sessionReminderMail(s.participants.full_name, when, s.experts?.full_name || null, s.join_url || null), [ics]).catch((e) => console.error('session reminder', s.id, e));
    sent += 1;
  }
  return sent;
}

// ── دعوة الجلسة التدريبية وتذكيراها ──
// المصدر جلسة الورشة نفسها (workshop_sessions): موعدها ومكانها ودفعتها. الدعوة بيد المشرف مرة واحدة ومعها ملف تقويم،
// والتذكيران من المهمة الساعية: قبل يوم (23 إلى 25 ساعة) وقبل ساعة (30 إلى 90 دقيقة). كلٌّ مرة واحدة لكل جلسة.
// جلسة بلا دفعة (لكل الدفعات) لا يُعرف مدعووها، فلا تُرسل دعوتها ولا تذكيرها آليًا.
const workshopWhen = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
async function workshopRecipients(s: any) {
  if (!s.cohort_id) return [];
  const cohort = (await db.from('cohorts').select('*').eq('id', s.cohort_id).maybeSingle()).data as any;
  if (!cohort) return [];
  // المنسحب والموقوف خارج البرنامج (inProgram مصدر واحد): لا دعوة ولا تذكير (كان الموقوف يُدعى)
  return ((await cohortMembers(cohort)) as any[]).filter((m) => m.email && inProgram(m.status));
}
async function workshopSend(s: any, kind: 'invite' | 'day' | 'hour') {
  const people = await workshopRecipients(s);
  const when = workshopWhen(s.starts_at);
  const ics = kind === 'invite' ? [icsEvent({ uid: s.id, start: s.starts_at, end: s.ends_at, title: `${s.title_ar} · برنامج القادة`, description: s.location_ar || 'Milestone Impact · Leaders Program', url: s.join_url || '' })] : [];
  let sent = 0, failed = 0;
  for (const m of people) {
    try { await sendMail(m.email, WORKSHOP_MAIL[kind].subject, workshopMail(kind, m.name, s.title_ar, when, s.location_ar || null, s.mode === 'online' ? s.join_url || null : null), ics, { kind: 'bulk', ref: s.id }); sent += 1; }
    catch (e) { failed += 1; console.error('workshop mail', kind, s.id, (e as Error).message); }
  }
  return { sent, failed, total: people.length };
}

export async function workshopInvite(a: any, b: Body) {
  const s = must(await db.from('workshop_sessions').select('*').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  if (!s.cohort_id) throw new Fail('هذه الجلسة لكل الدفعات؛ حدّد دفعتها لتُرسل الدعوة إلى أعضائها');
  if (new Date(s.ends_at).getTime() < Date.now()) throw new Fail('انتهت هذه الجلسة');
  if (s.invited_at && b.again !== true) throw new Fail('أُرسلت دعوة هذه الجلسة من قبل', 409, 'invited');
  const r = await workshopSend(s, 'invite');
  // قبل الترحيل 20261110140000 لا عمود للوسم: تُرسل الدعوة ولا يُحفظ وقتها
  if (r.sent) await db.from('workshop_sessions').update({ invited_at: new Date().toISOString() }).eq('id', s.id);
  await audit('admin', a.email, 'workshop.invite', 'workshop_sessions', s.id, null, r);
  return { success: true, ...r };
}

export async function workshopReminders() {
  const now = Date.now();
  const out = { day: 0, hour: 0 };
  const windows: ['day' | 'hour', 'reminded_day_at' | 'reminded_hour_at', number, number][] = [['day', 'reminded_day_at', 23 * 36e5, 25 * 36e5], ['hour', 'reminded_hour_at', 30 * 6e4, 90 * 6e4]];
  for (const [kind, col, from, to] of windows) {
    // قبل الترحيل لا عمود للوسم: الاستعلام يفشل فلا يُرسل تذكير (ولا يتكرر كل ساعة بلا وسم)
    const { data, error } = await db.from('workshop_sessions').select('*').eq('active', true).not('cohort_id', 'is', null).is(col, null)
      .gte('starts_at', new Date(now + from).toISOString()).lte('starts_at', new Date(now + to).toISOString()).limit(20);
    if (error) continue;
    for (const s of (data || []) as any[]) {
      const { data: mark } = await db.from('workshop_sessions').update({ [col]: new Date().toISOString() }).eq('id', s.id).is(col, null).select('id');
      if (!mark?.length) continue;
      out[kind] += (await workshopSend(s, kind)).sent;
    }
  }
  return out;
}
