// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة: قراءة الكتاب، الفيديو، الورش الحضورية، جلسات التوجيه
// ════════════════════════════════════════════════════════════════
// الدليل يجمعه الخادم: نبضات القراءة والمشاهدة بسقف زمني، ورمز QR متغير
// للحضور، وwebhook موقّع من منصة الحجز. الإكمال يُحسب في logic.js.
import { features } from './features.ts';
import { attendNoteMethod } from './features.js';
import { alertOps, allFor, audit, auditMany, type AuditRow, CONFIG, db, Fail, hash, isDemoMail, mailButton, must, randomToken, sendMail, sessionReminderMail, WORKSHOP_CANCEL_MAIL, WORKSHOP_CHANGE_MAIL, WORKSHOP_MAIL, WORKSHOP_TRAINER_MAIL, WORKSHOP_UNDATE_MAIL, workshopCancelMail, workshopChangeMail, workshopMail, workshopTrainerMail, workshopUndateMail } from './core.ts';
import { missingColumn, missingTable } from './missing-column.ts';
import { counted, listed, simulated } from './counting.ts';
import * as OB from './observations.ts';
import { RULES } from './notice-rules.js';
import { cohortMemberIds, cohortMembers, contentLevelsFor, defOf, extraWorkshopReq, journeyDefinition, releaseOf, requirementFor } from './programs.ts';
import { journeyFor, participantPriority } from './participant.ts';
import { bdi, icsEvent, mailShell, mailText } from '../_shared/mail.ts';
import {
  activityFor, applyReadingPing, applyVideoPing, bookingUrl, checkinOpen, filterHandbookMd, handbookModulesFor,
  contentApplies, contentState, inProgram, instantAvailable, parseBooking, parseQrToken, pickCohort, parseRef, qrToken, qrWindow, QR_WINDOW, readingVerdict, requirementApplies,
  verifyQrToken, verifyWebhook, VERIFIED_KINDS, videoSource, videoStatus, wordCount, modelsFor, answeredModels, approvalOf, journeyApproved,
  bySessionTime, isUndated, SESSION_TBD_AR, workshopSchedule, applyDelivery, bookingOverMax, sessionsMax, coachingStatus,
  parseScanReceipt, scanReceipt, scanReceiptExpiry, verifyScanReceipt, latinDigits, matchQrCode, qrCode, QR_CODE_DIGITS, cohortDefinitionView,
} from './logic.js';
import { journeyTimeline, outsideSessions } from './journey-timeline.js';
import { MARK_REASON_MAX, SESSION_MODE_AR } from './labels.js';
import { COUNTING, COUNTING_AR, countingOf, countsItem, eachWorkshop, optionalSession } from './optional.js';
import { optionalReady, sessionCols } from './workshop-optional.ts';
import { journeyProgress } from './logic.js';
import { withBridges } from './track-manifest.js';
import { adminList as coachingGroupsList, decorateGroupRows, groupCols } from './coaching-groups.ts';

type Body = Record<string, any>;
type Ctx = { ip: string | null; ua: string | null };

// ── جمع الأدلة لرحلة المشارك ──
// يعيد حالة كل متطلب موثق يخصه: { [requirement_id]: activity }
// cohortId: دفعة المشارك؛ يرى جلسات دفعته والجلسات العامة لكل الدفعات.

// الخبير صاحب الجلسة: يُختار صراحة، أو يُطابق نص المدرب (من الحجز أو المسجّل) ببريد خبير أو اسمه
// وإلا فكوتش المشارك المسند إليه بطلب مقبول (expert_requests): مصدر واحد لـ«من كوتشه».
// الجلسة خدمة رحلة، فلا تُربط إلا بخبير يخدم فيها (journeyApproved): لا بعضو لجنة بلا دور ولا بموقوف يطابق اسمه
async function expertFor(id: unknown, coach: unknown, participantId?: string): Promise<string | null> {
  if (id) {
    const { data } = await db.from('experts').select('id, status, roles').eq('id', String(id)).maybeSingle();
    if (data && journeyApproved(data)) return data.id;
  }
  const c = String(coach || '').trim();
  if (c) {
    const { data } = await db.from('experts').select('id, status, roles').or(`email.eq.${c.toLowerCase().replace(/[,()]/g, '')},full_name.eq.${c.replace(/[,()]/g, '')}`).limit(5);
    const hit = (data || []).find(journeyApproved);
    if (hit) return hit.id;
  }
  if (!participantId) return null;
  const { data: req } = await db.from('expert_requests').select('expert_id').eq('participant_id', participantId).eq('role', 'coach').eq('status', 'accepted').maybeSingle();
  return req?.expert_id || null;
}
// جلسات الورش لرحلة المشارك، ومع كل جلسة اسم مدربها إن سُمّي («مع فلان»). والاسم وحده يخرج للمشارك، لا معرّف الخبير ولا بريده
const JOURNEY_SESSION_COLS = 'id, requirement_id, cohort_id, title_ar, location_ar, starts_at, ends_at, active, mode, join_url, expert_id';
async function journeySessions(ids: string[]): Promise<{ data: any[] }> {
  // ومعها وسم الورشة الاختيارية حين يوجد عموده (sessionCols)، فيقرؤه workshopStatus ويخرج بها من العد
  const res = await db.from('workshop_sessions').select(await sessionCols(JOURNEY_SESSION_COLS)).in('requirement_id', ids);
  const rows = (res.data || []) as any[];
  const names = await trainerNames(rows.map((s) => s.expert_id));
  return { data: rows.map(({ expert_id, ...s }) => (expert_id && names[expert_id] ? { ...s, trainer: names[expert_id] } : s)) };
}
// patch: معاينة أثر تغيير وسم ورشة (countingImpact): جلسات المشارك كما ستكون بعد التغيير، بلا كتابة. لا يمر به إلا المعاينة
export async function evidenceFor(p: any, reqs: any[], levels: Record<string, string>, approved: boolean, cohortId: string | null = null, patch: ((rows: any[]) => any[]) | null = null) {
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
    kinds.has('workshop') ? journeySessions(ids) : none,
    kinds.has('workshop') ? db.from('workshop_attendance').select('session_id').eq('participant_id', p.id) : none,
    kinds.has('coaching') ? db.from('coaching_sessions').select('*').eq('participant_id', p.id).in('requirement_id', ids) : none,
    // منهج المسار يُفتح مع الكتاب بعد اعتماد المستويات
    kinds.has('curriculum') && approved ? db.from('content_items').select(CONTENT_COLS).eq('active', true) : none,
    kinds.has('curriculum') ? db.from('content_progress').select('*').eq('participant_id', p.id) : none,
    // متطلب «نموذج»: حالة تسليم النموذج نفسه في مكتبة النماذج، لا ملف مرفوع
    needModels && approved ? db.from('learning_models').select('id, key, dimension, sort, min_level, active, scopes, title_ar') : none,
    needModels && approved ? db.from('model_submissions').select('model_id, status, answers').eq('participant_id', p.id) : none,
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
    // محور أولوية المسار لنطاق القراءة track (تصور المرحلة 3، 3.4). تعذّر قراءته يُبقي الإلزام كاملًا
    priority: kinds.has('reading') && approved ? await participantPriority(p.id, levels).catch(() => null) : null,
    quizzes: Object.fromEntries((quiz.data || []).map((r: any) => [r.module_id, true])),
    video: Object.fromEntries((video.data || []).map((r: any) => [r.requirement_id, r])),
    workshops: (patch || ((x: any[]) => x))((ws.data || []).filter((s: any) => !s.cohort_id || s.cohort_id === cohortId)),
    attended: new Set((att.data || []).map((a: any) => a.session_id)),
    // صفوف الجلسة الجماعية (المرحلة 5) تحمل عنوانها ومستشارها ومكانها، بلا أسماء بقية المدعوين
    coaching: await decorateGroupRows(coach.data || []),
    levels,
    curriculumLocked: !approved,
    content: content.data || [],
    contentProgress: Object.fromEntries((contentProgress.data || []).map((r: any) => [r.item_id, r])),
    modelsLocked: !approved,
    // قاعدة «لا فقد»: فصل كتب فيه المشارك يبقى في رحلته وإن رُفع مستواه بعده
    models: Object.fromEntries(modelsFor(lm.data || [], levels, p.work_scope, answeredModels(subs.data || []))
      .map((m: any) => [m.key, { model_id: m.id, title: m.title_ar, status: subBy[m.id] || null }])),
    capstone: cap.data?.[0] || null,
    labs,
  };
  return Object.fromEntries(mine.map((r) => [r.id, activityFor(r, ev)]));
}

// ما يراه المشارك من إعداد النشاط: بلا بريد الموجّه، ورابط الاتصال الفوري
// فقط حين يكون متاحًا، ورابط الحجز معبأ باسمه ومرجعه.
// open: مرحلة البند غير مقفلة. الحجز والاتصال الفوري لمن تفتح له مرحلته داخل البرنامج وحده، بقاعدة coaching.instant (P1-04)
export function participantItem(it: any, p: any, open = true) {
  if (!VERIFIED_KINDS.includes(it.kind)) return it;
  const c = it.config || {};
  const act = it.activity ? { ...it.activity } : null;
  if (act && it.kind === 'coaching') {
    // حساب العرض لا يحجز موجّهًا حقيقيًا ولا يتصل به (coaching.instant في DEMO_BLOCKED)، فلا رابط حجز ولا زر له
    act.can_book = !!act.can_book && open && inProgram(p.status) && !p.is_demo;
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

// متطلب الجلسة عن بعد والتوجيه يُستعمل ما دامت مرحلته في رحلة المشارك نفسها غير مقفلة (P1-04)، كما يقفل requirement.update
// مرحلته وكما تعرضه الرحلة: ما فتحته قاعدة الفتح أو الأدمن قبل الاعتماد مفتوح
const STAGE_LOCKED = 'هذه المرحلة لم تُفتح بعد';
async function stageOpen(p: any, requirementId: string) {
  const { journey } = await journeyFor(p, { lite: true });
  const st = journey.find((s: any) => s.items.some((i: any) => i.id === requirementId));
  return !!st && st.status !== 'locked';
}
// رابط الجلسة وغرفة الموجّه والحجز على الخادم وفي البريد: المتطلب في رحلة المشارك نفسها (يخص مساره ودفعته)، ثم المعتمد
// مساره داخل البرنامج يصلها كما كان قبل P1-04 ولو قفل مرحلتها متطلب سابق ناقص، فلا يُحجب مشارك دفع أو رعته جهته عن
// جلسة حية برابط بريده. وغير المعتمد حين تفتح مرحلتها في رحلته بقاعدة الفتح أو بفتح الأدمن، والمنسحب والموقوف لا.
// وأزرار الرحلة في التطبيق تتبع حال المرحلة كما هي في main (participantItem)، فلا يتغير ما يراه أحد
async function sessionOpen(p: any, requirementId: string) {
  if (!inProgram(p.status)) return false;
  const { journey, approved } = await journeyFor(p, { lite: true });
  const st = journey.find((s: any) => s.items.some((i: any) => i.id === requirementId));
  return !!st && (approved || st.status !== 'locked');
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
    const m = must(await db.from('handbook_modules').select('id, dimension, chapter_key, min_level, body_md').eq('id', id).maybeSingle());
    if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
    words = wordCount(filterHandbookMd(withBridges(m), levels[m.dimension], p.work_scope, levels));
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
// برمز QR الحالي (t) لمن مسح وهو داخل، أو بإيصال المسح (r) لمن مسح قبل دخوله (workshopScan). والإيصال يُستهلك
// بعد كل الفحوص، فمن ليس من دفعة الجلسة لا يحرق إيصالًا، ومن استهلكه لا يعطيه لغيره
const RECEIPT_INVALID = 'إيصال المسح غير صالح، امسح الرمز المعروض الآن';
export async function workshopCheckin(p: any, b: Body, ctx: Ctx) {
  // الأرقام الستة (W2) بديل الكاميرا: مسارها في codeCheckin، ثم الكتابة نفسها (recordAttendance)
  if (b.code != null && b.code !== '') return codeCheckin(p, b, ctx);
  const viaReceipt = b.r != null && b.r !== '';
  const receipt = viaReceipt ? parseScanReceipt(b.r) : null;
  const parsed = viaReceipt ? null : parseQrToken(String(b.t || ''));
  if (viaReceipt ? !receipt : !parsed) throw new Fail(viaReceipt ? RECEIPT_INVALID : 'رمز الحضور غير صالح', 400, viaReceipt ? 'receipt_invalid' : 'qr_invalid');
  const s = must(await db.from('workshop_sessions').select('*').eq('id', viaReceipt ? receipt!.sessionId : parsed!.sessionId).maybeSingle());
  if (!s) throw new Fail(viaReceipt ? RECEIPT_INVALID : 'رمز الحضور غير صالح', 400, viaReceipt ? 'receipt_invalid' : 'qr_invalid');
  let expired = false;
  if (viaReceipt) {
    const v = await verifyScanReceipt(String(b.r), s.secret);
    expired = v.expired;
    if (!v.valid) throw new Fail(RECEIPT_INVALID, 400, 'receipt_invalid');
  } else if (!(await verifyQrToken(String(b.t), s.secret))) throw new Fail('انتهت صلاحية الرمز، امسح الرمز المعروض الآن', 400, 'qr_expired');
  if (isUndated(s)) throw new Fail('موعد هذه الجلسة لم يُحدد بعد، فلا يُسجل حضورها الآن', 400, 'undated');
  if (!checkinOpen(s)) throw new Fail('تسجيل الحضور لهذه الجلسة غير متاح الآن', 400, 'closed');
  // انتهاء الإيصال بعد فحص النافذة: من مسح قبل الإغلاق بدقائق ودخل بعده يُقال له إن النافذة أُغلقت، لا إن ربع ساعة مضت
  if (expired) throw new Fail('مضت أكثر من ربع ساعة على المسح، امسح الرمز المعروض الآن', 400, 'receipt_expired');
  const r = await myRequirement(p, s.requirement_id, 'workshop', s);
  if ((r.config?.verify || 'qr') !== 'qr') throw new Fail('حضور هذه الجلسة يُوثَّق بطريقة أخرى', 400, 'method');
  // حساب العرض: كل الفحوص جرت كما تجري لغيره، ثم محاكاة. لا يُستهلك إيصال ولا يُكتب حضور (recordAttendance)
  if (viaReceipt && !simulated(p)) await consumeReceipt(receipt!.id, s.id, p.id);
  return recordAttendance(p, s, r, ctx, 'qr', viaReceipt ? { via: 'receipt' } : null);
}
// كتابة الحضور الواحدة للرمز والإيصال والأرقام: مرة لكل مشارك وجلسة، ومن سُجّل يُرد «مسجل مسبقًا» بلا أثر.
// الطريقة code قبل الترحيل 20261118120000 يرفضها القيد (23514)، فيُكتب الحضور qr ويبقى السجل يقول {via:'code'}.
// وتسجيلان متزامنان (المسح والأرقام معًا، أو نقرتان) يقرآن «لا صف» كلاهما، فيرد المفتاح (session_id, participant_id)
// الثاني بـ23505: يُعامل «مسجل مسبقًا» لا خطأ قاعدة، ويُكتب السجل مرة واحدة للذي أدرج
const DUP = (e: any) => String(e?.code) === '23505';
async function recordAttendance(p: any, s: any, r: any, ctx: Ctx, method: 'qr' | 'code', after: Body | null) {
  // حساب العرض يُحاكى حضوره (تصور الحساب التجريبي 2026-11-19، المرحلة 0): يرى شاشة «سُجّل حضورك» نفسها، ولا يُكتب صف
  // حضور ولا سطر سجل، فلا يدخل «حضر» في شاشة القاعة ولا نظرة الأنشطة ولا بطاقة الدفعة، ولو مسح رمز جلسة حقيقية
  if (simulated(p)) return { success: true, already: false, method, simulated: true, session: { id: s.id, title: s.title_ar, location: s.location_ar, requirement: r.title_ar }, at: new Date().toISOString() };
  const { data: prev } = await db.from('workshop_attendance').select('checked_in_at').eq('session_id', s.id).eq('participant_id', p.id).maybeSingle();
  let already = !!prev;
  if (!prev) {
    const row = { session_id: s.id, participant_id: p.id, method, ip: ctx.ip, user_agent: ctx.ua };
    let res = await db.from('workshop_attendance').insert(row);
    if (res.error && method === 'code' && String(res.error.code) === '23514') res = await db.from('workshop_attendance').insert({ ...row, method: 'qr' });
    if (DUP(res.error)) already = true;
    else {
      must(res);
      await audit('participant', p.email, 'workshop.checkin', 'workshop_sessions', s.id, null, after);
    }
  }
  return { success: true, already, method, session: { id: s.id, title: s.title_ar, location: s.location_ar, requirement: r.title_ar }, at: prev?.checked_in_at || new Date().toISOString() };
}

// ── تسجيل الحضور بالأرقام الستة (W2، تصور الحضور 2026-11-18 ب5.5 البند 4) ──
// الأرقام لا تحمل معرّف الجلسة، فتُطابَق بالجلسات المفتوحة لهذا المشارك وحدها: حضورية، في نافذة الحضور، تُوثَّق بالرمز
// بطريقتها الفعلية (بتخصيص الدفعة)، ومن دفعته أو عامة، وبندها يخص مساره (myRequirement كما في المسح). فأرقام جلسة دفعة
// أخرى أو نافذة مغلقة لا تطابق شيئًا. المطابقة بالنافذتين كما الرمز وبمقارنة ثابتة الزمن (matchQrCode).
// حد المحاولات الخاطئة لكل مشارك (والأرقام بلا جلسة، فالحد يشمل جلساته كلها، وهو أضيق من حد لكل جلسة): كل محاولة تُكتب
// في السجل قبل التحقق ثم تُعدّ، فالمحاولات المتزامنة لا تتجاوز الحد. الخاطئة = المحاولات ناقص الناجحة في 10 دقائق.
// و«الناجحة» (code-hit) تُكتب فقط حين يُدرج حضور جديد فعلًا، فلا تُسترد محاولة بإعادة أرقام جلسة سُجّل حضورها (وهو
// ما كان يفتح تخمينًا بلا حد لجلسة ثانية مفتوحة معها)، ولكل جلسة استرداد واحد على الأكثر. ومن بلغ الحد يُرد قبل الكتابة
// بعدّ مسبق، فحلقة طلبات لا تضيف صفوفًا إلى السجل بلا حد.
// ستة أرقام مليون احتمال، ويُقبل منها رقمان في كل نافذة، فخمس محاولات في عشر دقائق تجعل التخمين بلا جدوى
export const CODE_LIMITS = Object.freeze({ wrongPer10Min: 5 });
const CODE_TRY = 'workshop.code-try', CODE_HIT = 'workshop.code-hit';
async function codeCandidates(p: any) {
  const rows = (must(await db.from('workshop_sessions').select('*').eq('active', true).eq('mode', 'in_person')
    .lte('starts_at', new Date(Date.now() + 3600e3).toISOString()).gte('ends_at', new Date(Date.now() - 1800e3).toISOString())) ?? []) as any[];
  const out: { s: any; r: any }[] = [];
  for (const s of rows) {
    if (s.mode !== 'in_person' || isUndated(s) || !checkinOpen(s)) continue;
    try {
      const r = await myRequirement(p, s.requirement_id, 'workshop', s);
      if ((r.config?.verify || 'qr') === 'qr') out.push({ s, r });
    } catch (e) {
      // ليست له: بند لا يخص مساره، أو جلسة دفعة أخرى، أو بند خارج برنامجه. وما سواه خطأ حقيقي يُرفع
      if (!(e instanceof Fail)) throw e;
    }
  }
  return out;
}
async function codeCount(p: any, action: string, since: string) {
  const { count, error } = await db.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('entity', 'participants').eq('entity_id', p.id).eq('action', action).gte('created_at', since);
  if (error) must({ data: null, error });
  return count ?? 0;
}
async function codeCheckin(p: any, b: Body, ctx: Ctx) {
  // الأرقام كما يكتبها الإنسان: عربية أو لاتينية، بمسافة أو شرطة بينها. وأكثر أو أقل من ستة مرفوض بلا عدّ
  const code = latinDigits(b.code).replace(/\D/g, '');
  if (code.length !== QR_CODE_DIGITS) throw new Fail('اكتب الأرقام الستة كما تظهر تحت الرمز', 400, 'code_invalid');
  const open = await codeCandidates(p);
  // لا جلسة مفتوحة له تُوثَّق بالرمز: لا معنى للمطابقة ولا تُحسب محاولة
  if (!open.length) throw new Fail('لا جلسة حضورية مفتوحة لك الآن تُسجَّل بالرمز', 400, 'no_session');
  const since = new Date(Date.now() - 6e5).toISOString();
  const tooMany = () => new Fail('محاولات خاطئة كثيرة. امسح الرمز بالكاميرا، أو اطلب من المدرب تسجيل حضورك، أو أعد المحاولة بعد عشر دقائق', 429, 'code_rate');
  // عدّ مسبق بلا كتابة: من بلغ الحد لا يُكتب له صف. والناجحة لا تنقص، فعدّها المسبق يكفي للعدّ الثاني (أشد لا أرخى)
  const [triesBefore, hits] = await Promise.all([codeCount(p, CODE_TRY, since), codeCount(p, CODE_HIT, since)]);
  if (triesBefore - hits >= CODE_LIMITS.wrongPer10Min) throw tooMany();
  await audit('participant', p.email, CODE_TRY, 'participants', p.id);
  const wrongBefore = (await codeCount(p, CODE_TRY, since)) - 1 - hits;
  if (wrongBefore >= CODE_LIMITS.wrongPer10Min) throw tooMany();
  let hit: { s: any; r: any } | null = null;
  for (const c of open) if ((await matchQrCode(code, c.s.id, c.s.secret)) != null && !hit) hit = c;
  if (!hit) {
    const left = CODE_LIMITS.wrongPer10Min - wrongBefore - 1;
    throw new Fail(left > 0 ? `الأرقام غير صحيحة أو تغيّرت. اكتب الأرقام الظاهرة الآن (${left === 1 ? 'بقيت محاولة واحدة' : left === 2 ? 'بقيت محاولتان' : `بقيت ${left} محاولات`})` : 'الأرقام غير صحيحة، وانتهت محاولاتك لعشر دقائق. امسح الرمز بالكاميرا أو اطلب من المدرب تسجيل حضورك',
      400, 'code_wrong', { left });
  }
  const done: any = await recordAttendance(p, hit.s, hit.r, ctx, 'code', { via: 'code' });
  if (!done.already && !done.simulated) await audit('participant', p.email, CODE_HIT, 'participants', p.id, null, { session_id: hit.s.id });
  return done;
}
// الاستهلاك ذري: يكتب المشارك على الصف غير المستهلك وحده. وصاحبه يعيده بلا أثر (إعادة المحاولة بعد انقطاع)
async function consumeReceipt(id: string, sessionId: string, participantId: string) {
  const { data, error } = await db.from('workshop_scan_receipts').update({ participant_id: participantId, consumed_at: new Date().toISOString() })
    .eq('id', id).eq('session_id', sessionId).is('consumed_at', null).select('id');
  // خطأ القاعدة (مهلة، انقطاع) خطأ خادم يُعاد معه، لا رفض نهائي يضيّع إيصالًا صالحًا
  if (error) must({ data, error });
  if (data?.length) return;
  const row = must(await db.from('workshop_scan_receipts').select('participant_id').eq('id', id).eq('session_id', sessionId).maybeSingle()) as any;
  if (!row) throw new Fail(RECEIPT_INVALID, 400, 'receipt_invalid');
  if (row.participant_id !== participantId) throw new Fail('سُجّل بهذا المسح حضور مشارك آخر، امسح الرمز المعروض الآن من جوالك', 409, 'receipt_used');
}

// ── إيصال المسح بلا دخول (workshop.scan، مفتوح) ──
// يتحقق من الرمز لحظة المسح كما يتحقق workshop.checkin (التوقيع والنافذة والموعد وطريقة التوثيق بتخصيص الدفعة)، ويعطي
// إيصالًا موقّعًا مربوطًا بالجلسة. حد المعدل بعدّ الصفوف كبقية الأفعال المفتوحة (share.ts): القاعة شبكة واحدة غالبًا، فحد
// الشبكة واسع، والجلسة حد ثانٍ. قبل الترحيل 20261118110000 يرد not_migrated فيحفظ التطبيق الرمز كما كان
export const SCAN_LIMITS = Object.freeze({ perIp10Min: 300, perSession10Min: 600 });
export async function workshopScan(b: Body, ctx: Ctx) {
  const t = String(b.t || '');
  const parsed = parseQrToken(t);
  if (!parsed) throw new Fail('رمز الحضور غير صالح', 400, 'qr_invalid');
  const s = must(await db.from('workshop_sessions').select('*').eq('id', parsed.sessionId).maybeSingle());
  if (!s) throw new Fail('رمز الحضور غير صالح', 400, 'qr_invalid');
  if (!(await verifyQrToken(t, s.secret))) throw new Fail('انتهت صلاحية الرمز، امسح الرمز المعروض الآن', 400, 'qr_expired');
  if (isUndated(s)) throw new Fail('موعد هذه الجلسة لم يُحدد بعد، فلا يُسجل حضورها الآن', 400, 'undated');
  if (!checkinOpen(s)) throw new Fail('تسجيل الحضور لهذه الجلسة غير متاح الآن', 400, 'closed');
  if ((await workshopVerify(s)) !== 'qr') throw new Fail('حضور هذه الجلسة يُوثَّق بطريقة أخرى', 400, 'method');
  const notMigrated = () => new Fail('إيصال المسح غير متاح بعد', 503, 'not_migrated');
  const ipHash = ctx.ip ? await hash(`workshop-scan:${ctx.ip}`) : null;
  const since = new Date(Date.now() - 6e5).toISOString();
  const [byIp, bySession] = await Promise.all([
    ipHash ? db.from('workshop_scan_receipts').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since) : Promise.resolve({ count: 0, error: null }),
    db.from('workshop_scan_receipts').select('id', { count: 'exact', head: true }).eq('session_id', s.id).gte('created_at', since),
  ]) as any[];
  for (const res of [byIp, bySession]) if (res.error) { if (missingTable(res.error)) throw notMigrated(); must(res); }
  if ((byIp.count ?? 0) >= SCAN_LIMITS.perIp10Min || (bySession.count ?? 0) >= SCAN_LIMITS.perSession10Min) throw new Fail('مسحات كثيرة في وقت قصير، حاول بعد دقيقة', 429, 'rate');
  const id = crypto.randomUUID();
  const exp = scanReceiptExpiry(s);
  const ins = await db.from('workshop_scan_receipts').insert({ id, session_id: s.id, ip_hash: ipHash, expires_at: new Date(exp * 1000).toISOString() });
  if (ins.error) { if (missingTable(ins.error)) throw notMigrated(); must(ins); }
  return { success: true, receipt: await scanReceipt(s.id, id, exp, s.secret), expires_at: new Date(exp * 1000).toISOString(), session: { title: s.title_ar } };
}

// ── الانضمام إلى جلسة جماعية عن بعد ──
// يعيد رابط الاجتماع في نافذة الجلسة فقط. إن كان التوثيق بالانضمام يُسجَّل الحضور.
export async function workshopJoin(p: any, b: Body, ctx: Ctx) {
  const s = must(await db.from('workshop_sessions').select('*').eq('id', String(b.session_id || '')).maybeSingle());
  if (!s || s.mode !== 'online') throw new Fail('الجلسة غير موجودة', 404);
  if (!s.join_url) throw new Fail('رابط الجلسة لم يُضف بعد، ويصلك قبل موعدها', 400, 'link_later');
  if (isUndated(s)) throw new Fail('موعد هذه الجلسة لم يُحدد بعد', 400, 'undated');
  if (!checkinOpen(s)) throw new Fail('رابط الجلسة يُفتح قبل موعدها بساعة', 400, 'closed');
  const r = await myRequirement(p, s.requirement_id, 'workshop', s);
  if (!(await sessionOpen(p, r.id))) throw new Fail(STAGE_LOCKED, 403, 'locked');
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
  if (!(await sessionOpen(p, r.id))) throw new Fail(STAGE_LOCKED, 403, 'locked');
  const c = r.config || {};
  if (!instantAvailable(c)) throw new Fail('الموجّه غير متاح للاتصال الفوري الآن، احجز موعدًا', 400, 'unavailable');
  const since = new Date(Date.now() - 2 * 36e5).toISOString();
  const { data: recent } = await db.from('coaching_sessions').select('*').eq('participant_id', p.id).eq('requirement_id', r.id)
    .eq('kind', 'instant').eq('status', 'requested').gte('created_at', since).limit(1);
  if (recent?.length) return { success: true, join_url: recent[0].join_url };
  // حد الجلسات (T2): الاتصال الفوري على خادمنا نفسه، فيُرفض عند الحد بقاعدة زر الحجز (coachingStatus) لا يُنبَّه عليه بعده
  if (sessionsMax(c) != null) {
    const mine = must(await db.from('coaching_sessions').select('*').eq('participant_id', p.id).eq('requirement_id', r.id)) || [];
    if ((coachingStatus(c, mine) as any).at_max) throw new Fail('حجزت كل جلساتك المتاحة في هذا البند، فلا اتصال جديد', 400, 'at_max');
  }
  const now = new Date();
  must(await db.from('coaching_sessions').insert({
    participant_id: p.id, requirement_id: r.id, kind: 'instant', provider: 'instant', status: 'requested',
    starts_at: now.toISOString(), ends_at: new Date(now.getTime() + (Number(c.minutes) || 30) * 6e4).toISOString(), join_url: c.instant_url,
  }));
  if (c.coach_email) {
    sendMail(c.coach_email, `اتصال فوري: ${p.full_name}`, mailShell('مشارك ينضم إليك الآن',
      mailText(`${bdi(p.full_name)} طلب اتصالًا فوريًا في «${bdi(r.title_ar)}» وهو في طريقه إلى غرفتك الآن.`) + mailButton(c.instant_url, 'افتح الغرفة'),
      { family: 'sessions', preheader: `${p.full_name} في طريقه إلى غرفتك`, footnote: '' }), [], { category: 'expert_work', expiresAt: new Date(now.getTime() + (Number(c.minutes) || 30) * 6e4).toISOString() }).catch((e) => console.error(e));
  }
  await audit('participant', p.email, 'coaching.instant', 'stage_requirements', r.id);
  return { success: true, join_url: c.instant_url };
}

// موعد لا يُسجَّل باقٍ على تقويم الموجّه ومنصة الحجز: تنبيه للتشغيل ليُلغى منها، بمعرّف الحجز ومتطلبه وسببه ومعرّف المشارك
// وحده. والأثر لكل حجز (coaching.ignored)، فإعادة جدولة حجز نُبّه عنه لا تنبّه ثانية، وتنبيه كل حجز مستقل عن غيره
async function bookingIgnored(provider: string, e: any, requirementId: string, participantId: string, why: string) {
  console.error('booking not eligible', participantId, requirementId, why);
  const seen = e.previous_id
    ? (await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'coaching.ignored').eq('entity_id', String(e.previous_id))).count
    : 0;
  await audit('system', provider, 'coaching.ignored', 'coaching_sessions', String(e.external_id), null, { previous: e.previous_id || null, requirement: requirementId, participant: participantId, reason: why })
    .catch((x) => console.error('booking ignored audit:', x));
  if (seen) return;
  await alertOps(`booking_not_eligible:${e.external_id}`, {
    provider, event: e.event, booking: e.external_id, previous: e.previous_id || null, starts_at: e.starts_at || null, requirement: requirementId, participant: participantId, reason: why,
    action: 'ألغِ هذا الموعد من منصة الحجز وتقويم الموجّه: لم يُسجَّل في البرنامج',
  });
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
  const { data: r } = await db.from('stage_requirements').select('id, kind, config').eq('id', target.requirement_id).maybeSingle();
  const { data: p } = await db.from('participants').select('*').eq('id', target.participant_id).maybeSingle();
  if (!r || r.kind !== 'coaching' || !p) return { success: true, ignored: 'unknown_ref' };
  // إعادة الجدولة تلغي الموعد القديم أولًا أيًّا كانت أهلية الجديد: كان التجاهل قبلها يبقي القديم «محجوزًا» بموعده ورابطه،
  // فيصل تذكيره («جلستك غدًا») بموعد لم يعد قائمًا ولا يُسجَّل الحضور إلا عليه
  if (e.previous_id) {
    await db.from('coaching_sessions').update({ status: 'cancelled', updated_at: now }).eq('external_id', e.previous_id).eq('status', 'booked');
  }
  // رابط الحجز بقاعدة coaching.instant نفسها (P1-04): رابط التُقط قبل الخروج من البرنامج أو لمرحلة مقفلة لا يفتح غرفة موجّه
  const why = p.is_demo ? 'demo' : !inProgram(p.status) ? 'out_of_program' : !(await sessionOpen(p, r.id)) ? 'stage_locked' : null;
  if (why) {
    await bookingIgnored(provider, e, r.id, p.id, why);
    return { success: true, ignored: 'not_eligible' };
  }
  must(await db.from('coaching_sessions').upsert({
    participant_id: p.id, requirement_id: r.id, kind: 'booked', provider, external_id: e.external_id,
    starts_at: e.starts_at, ends_at: e.ends_at, join_url: e.join_url, coach: e.coach, expert_id: await expertFor(null, e.coach, p.id), status: 'booked', updated_at: now,
  }, { onConflict: 'external_id' }));
  await audit('system', provider, 'coaching.booked', 'participants', p.id, null, { starts_at: e.starts_at });
  // حد الحجز (T2، ب5.2): الحجز عبر Cal.com أو Calendly يصل بعد وقوعه، فما زاد على max_sessions يُسجَّل ويُنبَّه عليه ولا يُرفض
  const over = await overMaxCheck(r, p.id);
  if (over) {
    await audit('system', provider, 'coaching.over_max', 'coaching_sessions', String(e.external_id), null, { requirement: r.id, participant: p.id, count: over.count, max: over.max })
      .catch((x) => console.error('over max audit:', x));
    // إعادة جدولة حجز نُبّه عن زيادته لا تنبّه ثانية: العدد نفسه والقرار نفسه، كما في bookingIgnored
    const seen = e.previous_id
      ? (await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'coaching.over_max').eq('entity_id', String(e.previous_id))).count
      : 0;
    if (!seen) await alertOps(`booking_over_max:${e.external_id}`, {
      provider, booking: e.external_id, starts_at: e.starts_at || null, requirement: r.id, participant: p.id, count: over.count, max: over.max,
      action: 'حجز زاد على حد الجلسات للمشارك: سُجّل كما هو، فقرر إبقاءه أو إلغاءه من منصة الحجز',
    });
    return { success: true, over_max: true };
  }
  return { success: true };
}

// عدد جلسات المشارك غير الملغاة في البند بعد الحجز، والحد. null إن لم يُضبط حد أو لم يُتجاوز
async function overMaxCheck(r: any, participantId: string) {
  if (sessionsMax(r?.config) == null) return null;
  // بـ* ليُقرأ off_allowance حين يوجد (جلسة جماعية خارج الرصيد لا تدخل العدّ)، ويعمل قبل ترحيله
  const { data } = await db.from('coaching_sessions').select('*').eq('participant_id', participantId).eq('requirement_id', r.id);
  const x = bookingOverMax(r.config, data || []);
  return x.over ? x : null;
}

// ════════════════════════════════════════════════════════════════
// الإدارة
// ════════════════════════════════════════════════════════════════

// نظرة عامة: الأنشطة الموثقة، والورش وحضورها، وجلسات التوجيه
export async function overview() {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [reqs, ws, att, coach, programs, cohorts] = await Promise.all([
    db.from('stage_requirements').select('id, program_id, code, title_ar, stage_key, kind, config, dimension, level, active, required').in('kind', VERIFIED_KINDS).order('sort'),
    // بـ* لتحمل invited_at بعد الترحيل 20261110140000 وتعمل قبله؛ والسر لا يخرج إلى اللوحة (يُحذف أدناه)
    db.from('workshop_sessions').select('*').order('starts_at', { nullsFirst: false }),
    listed(db.from('workshop_attendance').select('session_id, participant_id, participants!inner(is_demo)'), 'participants'),
    // group-once-exempt: قائمة عرض للجلسات الفردية لا جمع لخبير، وصفوف الجلسات الجماعية تُحذف منها أدناه وتُعرض بكيانها
    db.from('coaching_sessions').select('*, participants(full_name, email), experts(full_name)').or(`starts_at.gte.${since},status.in.(booked,requested)`)
      .order('starts_at', { ascending: true }).limit(500),
    db.from('programs').select('id, name').is('archived_at', null),
    db.from('cohorts').select('*').neq('status', 'closed').order('created_at', { ascending: false }),
  ]);
  // البرامج المؤرشفة بأسمائها، لتجميع «الحضور والجلسات» وإخفاء متطلباتها ما لم تُطلب (attendance-groups.js)
  const archived_programs = ((await db.from('programs').select('id, name').not('archived_at', 'is', null)).data || []) as any[];
  const capacity_ready = await capacityReady();
  // الجلسات الجماعية مع المستشار (المرحلة 5). قبل ترحيلها ready=false وقائمة فارغة، وتعذّر قراءتها لا يسقط الشاشة
  const groups: any = await coachingGroupsList({}).catch((e) => { console.error('activities groups', e); return { ready: true, groups: [], failed: true }; });
  // مدرب الجلسة (المرحلة 4): خبراء كل دفعة لقائمة النموذج، واسم مدرب كل جلسة. تعذّر قراءة الخبراء لا يسقط الشاشة: القائمة فارغة
  const cohort_trainers = await cohortTrainers((cohorts.data || []).map((c: any) => c.id)).catch((e) => { console.error('activities trainers', e); return {}; });
  const trainerOf = await trainerNames((ws.data || []).map((s: any) => s.expert_id));
  const outside = await outsideByCohort((cohorts.data || []) as any[], (ws.data || []) as any[]).catch((e) => { console.error('activities outside', e); return {}; });
  const counts: Record<string, number> = {};
  for (const a of att.data || []) counts[a.session_id] = (counts[a.session_id] || 0) + 1;
  // طريقة التوثيق الفعلية لكل جلسة (W1): من متطلبها وتخصيص دفعتها، كما يحكم بها workshop.checkin والبريد (workshopVerify).
  // زر «اعرض رمز الحضور» يتبعها، فلا يُعرض رمز لجلسة تُوثَّق دفعتها بالانضمام، ولا يغيب عن دفعة خصّصتها بالرمز
  const cohortIds = [...new Set((ws.data || []).map((s: any) => s.cohort_id).filter(Boolean))];
  const delivery = cohortIds.length ? ((await db.from('cohorts').select('id, delivery').in('id', cohortIds)).data || []) as any[] : [];
  const deliveryOf = Object.fromEntries(delivery.map((c: any) => [c.id, c.delivery || {}]));
  const reqOf = Object.fromEntries((reqs.data || []).map((r: any) => [r.id, r]));
  // المتوقع لكل جلسة (المرحلة 12، «سجّل الحضور (0 من n)»): بـattendancePeople نفسها التي تعدّ بها ورقة الحضور. تعذّرها لا يسقط الشاشة: الزر بالعدد وحده
  const attOf: Record<string, any[]> = {};
  for (const a of att.data || []) (attOf[a.session_id] ||= []).push(a);
  const expectedOf: Record<string, number> = await attendanceWorld(true).then((w) => Object.fromEntries((ws.data || []).filter((s: any) => reqOf[s.requirement_id])
    .map((s: any) => [s.id, attendancePeople(reqOf[s.requirement_id], w, s.cohort_id || null, attOf[s.id] || []).length]))).catch((e) => { console.error('activities expected', e); return {}; });
  const verifyOf = (s: any) => sessionVerify(reqOf[s.requirement_id], deliveryOf[s.cohort_id]);
  return {
    success: true,
    requirements: (reqs.data || []).map((r: any) => ({ ...r, instant_open: instantAvailable(r.config) })),
    workshops: (ws.data || []).sort(bySessionTime).map((s: any) => { const row: any = { ...s, attended: counts[s.id] || 0, ...(s.id in expectedOf ? { expected: expectedOf[s.id] } : {}), verify: verifyOf(s), outside: (outside as any)[s.id] || [], trainer: (s.expert_id && trainerOf[s.expert_id]) || null }; delete row.secret; return row; }),
    // صفوف الجلسات الجماعية تُعرض بكيانها في coaching_groups لا صفًّا صفًّا بين الفردية
    coaching: (coach.data || []).filter((x: any) => !x.group_id),
    coaching_groups: groups.groups || [], groups_ready: groups.ready !== false, ...(groups.failed ? { groups_failed: true } : {}),
    programs: programs.data || [], archived_programs, cohorts: (cohorts.data || []).map((c: any) => ({ id: c.id, name: c.name, program_id: c.program_id, status: c.status })), capacity_ready, trainer_ready: true /* COMPAT_UNTIL_2026_12_04 */, cohort_trainers, optional_ready: await optionalReady(),
  };
}

// «خارج نافذة المرحلة» في «الحضور والجلسات» (تصور محرر رحلة الدفعة 4.2 د): لكل جلسة مؤرخة الدفعات التي يقع يومها فيها خارج
// نافذة مرحلتها، من علامة الخط نفسه (journeyTimeline ثم outsideSessions) بتعريف كل دفعة وخطتها كما يرسمها تبويب «الرحلة»، فلا
// حساب تاريخ ثانٍ. الجلسة العامة تُفحص في كل دفعة مؤرخة من برنامج متطلبها. تنبيه لا منع: الحضور يُحسب في أي يوم
export async function outsideByCohort(cohorts: any[], sessions: any[]) {
  const out: Record<string, { cohort_id: string; cohort: string; stage: string; window_ar: string; text: string }[]> = {};
  const defs = new Map<string, any>();
  for (const c of cohorts.filter((x) => x.starts_on && !x.is_default && x.status !== 'closed')) {
    const mine = sessions.filter((s) => s.active !== false && !isUndated(s) && (!s.cohort_id || s.cohort_id === c.id));
    if (!mine.length) continue;
    const k = `${c.program_version_id || ''}|${c.program_id}`;
    if (!defs.has(k)) defs.set(k, await defOf(c.program_version_id, c.program_id));
    const view = cohortDefinitionView({ live: defs.get(k), version: null, cohort: c });
    const ids = new Set(view.requirements.filter((r: any) => r.kind === 'workshop' && r.id).map((r: any) => r.id));
    const own = mine.filter((s) => ids.has(s.requirement_id));
    if (!own.length) continue;
    const model = journeyTimeline({ stages: view.stages, requirements: view.requirements }, { cohort: c, sessions: own });
    for (const x of outsideSessions(model)) (out[x.session] ||= []).push({ cohort_id: c.id, cohort: c.name, stage: x.stage_title, window_ar: x.window_ar, text: x.text });
  }
  return out;
}

// ── سعة يوم الورشة (W3، الترحيل 20261118130000) ──
// عرض وتنبيه فقط لا حجز مقاعد (أ8): فارغ = بلا سعة، وإلا عدد صحيح من 1 إلى CAPACITY_MAX كقيد القاعدة
export const CAPACITY_MAX = 10000;
export function cleanCapacity(v: unknown): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(latinDigits(String(v).trim()));
  if (!Number.isInteger(n) || n < 1 || n > CAPACITY_MAX) throw new Fail(`السعة عدد صحيح من 1 إلى ${CAPACITY_MAX}، أو اتركها فارغة`);
  return n;
}
// قبل الترحيل لا عمود: اللوحة تخفي الحقل، والحفظ يعيد المحاولة بلاه (missingColumn). وتعذّر القراءة لسبب آخر يخفيه
// أيضًا فلا تسقط الشاشة به، والتحرير بلا الحقل يبقي السعة المحفوظة
export async function capacityReady(): Promise<boolean> {
  // optional-exempt: سؤال هل عمود السعة موجود، لا قراءة جلسات
  const { error } = await db.from('workshop_sessions').select('capacity').limit(1);
  if (error && !missingColumn(error)) console.error('workshop capacity', error.message);
  return !error;
}

// ── مدرب الجلسة (تصور تشغيل الدفعة 2026-11-19، المرحلة 4، الترحيل 20261119130000) ──
// اختياري، ومن خبراء دفعة الجلسة وحدهم: مستشار الدفعة (cohorts.advisor_expert_id) أو عضو فريقها (cohort_experts)، وهو الربط
// نفسه الذي يكلف المدرب بدفعته (expertCohortIds)، وممن يخدمون في الرحلة (journeyApproved). فالمدرب المسمى مكلف بدفعة جلسته
// دائمًا، وصلاحية ورقة الحضور تبقى بالتكليف لا بالاسم: من أُزيل من فريق الدفعة لا يسجل حضورها ولو بقي اسمه على جلسة.
/** خبراء كل دفعة ممن يُسمَّون مدربين لجلساتها: { معرّف الدفعة: [{ id, full_name }] } */
export async function cohortTrainers(cohortIds: unknown[]): Promise<Record<string, { id: string; full_name: string }[]>> {
  const ids = [...new Set(cohortIds.map((x) => String(x || '')).filter((x) => UUID_RE.test(x)))];
  if (!ids.length) return {};
  const [cs, team] = await Promise.all([
    db.from('cohorts').select('id, advisor_expert_id').in('id', ids),
    db.from('cohort_experts').select('cohort_id, expert_id').in('cohort_id', ids),
  ]);
  const by = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const c of (must(cs) ?? []) as any[]) if (c.advisor_expert_id) by.get(c.id)?.add(c.advisor_expert_id);
  for (const x of (must(team) ?? []) as any[]) if (x.expert_id) by.get(x.cohort_id)?.add(x.expert_id);
  const all = [...new Set([...by.values()].flatMap((x) => [...x]))];
  const experts = all.length ? ((must(await db.from('experts').select('id, full_name, status, roles').in('id', all)) ?? []) as any[]) : [];
  const ok = new Map<string, string>(experts.filter(journeyApproved).map((e: any) => [e.id, e.full_name]));
  return Object.fromEntries(ids.map((id) => [id, [...(by.get(id) || [])].filter((x) => ok.has(x)).map((x) => ({ id: x, full_name: ok.get(x)! }))
    .sort((x, y) => x.full_name.localeCompare(y.full_name, 'ar'))]));
}
/** أسماء المدربين بمعرّفاتهم، لمن يخدم في الرحلة وحده (journeyApproved): مدرب أُوقف بعد تسميته لا يُعرض اسمه للمشارك ولا في
 * الدعوة. تعذّر القراءة يعيد فارغًا: الجلسة تُعرض بلا مدرب ولا تسقط به */
async function trainerNames(ids: unknown[]): Promise<Record<string, string>> {
  const want = [...new Set(ids.map((x) => String(x || '')).filter(Boolean))];
  if (!want.length) return {};
  const { data, error } = await db.from('experts').select('id, full_name, status, roles').in('id', want);
  if (error) { console.error('trainer names', error.message); return {}; }
  return Object.fromEntries(((data || []) as any[]).filter(journeyApproved).map((e) => [e.id, e.full_name]));
}
// المدرب المرسل يُفحص حين يتغير وحده: تحرير جلسة بمدربها القائم (عنوان أو مكان) لا يتعطل إن أُوقف المدرب بعد تسميته.
// ونقل الجلسة إلى دفعة أخرى بلا مدرب مرسل يفرغ المدرب إن لم يكن من خبراء الدفعة الجديدة
async function checkTrainer(row: Body, out: Body, prev: any) {
  const cohortId = 'cohort_id' in out ? out.cohort_id : prev?.cohort_id ?? null;
  if ('expert_id' in row) {
    out.expert_id = UUID_RE.test(String(row.expert_id || '')) ? String(row.expert_id) : null;
    const same = !!prev && (prev.expert_id || null) === out.expert_id && (prev.cohort_id || null) === (cohortId || null);
    if (!out.expert_id || same) return;
    if (!cohortId) throw new Fail('المدرب يُسمى لجلسة دفعة بعينها. اختر الدفعة أولًا، أو اترك المدرب فارغًا', 400, 'trainer_needs_cohort');
    if (!(await cohortTrainers([cohortId]))[cohortId]?.some((e) => e.id === out.expert_id)) throw new Fail('المدرب ليس من خبراء هذه الدفعة. اختره من مستشارها أو فريقها', 400, 'trainer_not_in_cohort');
    return;
  }
  if (!prev?.expert_id || !('cohort_id' in out) || (prev.cohort_id || null) === (out.cohort_id || null)) return;
  if (!out.cohort_id || !(await cohortTrainers([out.cohort_id]))[out.cohort_id]?.some((e) => e.id === prev.expert_id)) out.expert_id = null;
}

// ── وسم الورشة: إلزامية أو اختيارية (قرار المالك 2026-11-21، القاعدة في optional.js) ──
// الأثر يُحسب من رحلة كل عضو كما يراها هو (journeyFor)، مرتين: كما هي، وكما ستكون بجلسات معدّلة (patch)، بلا كتابة. فلا حساب
// ثانٍ للتقدم ولا للاكتمال. ولمرحلة لم يُنشأ نشاط ورشها بعد (المسار الموجّه أول مرة) يُحسب من الرحلة الحالية وحدها.
// حفظ الاكتمال: من كان التغيير سيسحب منه اكتمال نشاط أو مرحلة يُكتب له صف تقدم «done» على النشاط بملاحظته وسجله، فيبقى مكتملًا.
// لا يُسحب اكتمال من أحد بصمت، ولا تُمس شهادة (الشهادة صف صادر لا يُعاد حسابه من الرحلة).
export const COUNTING_MEMBERS_MAX = 600;
export const PRESERVE_NOTE = 'أتم ما يخصه قبل تغيير وسم ورشة، فحُفظ اكتماله';
type Impact = { members: number; preserved: number; required_of: number; completes: number; progress_up: number; progress_down: number };
async function countingPeople(cohortId: string) {
  const m = await cohortMemberIds(cohortId);
  if (!m) throw new Fail('الدفعة غير موجودة', 404);
  if (m.ids.length > COUNTING_MEMBERS_MAX) throw new Fail(`الدفعة أكبر من أن يُحسب أثر الوسم على أعضائها هنا (${m.ids.length} عضوًا، والحد ${COUNTING_MEMBERS_MAX})`, 413, 'cohort_too_large');
  // counting-exempt: معرّفات أعضاء الدفعة من cohortMemberIds (listed)، فلا يدخل الأثر حساب العرض ولا حساب الاختبار
  const rows = (m.ids.length ? await allFor(m.ids, () => db.from('participants').select('*').order('id'), 'id') : []) as any[];
  return rows.filter((p) => inProgram(p.status));
}
async function eachMember<T>(rows: any[], fn: (p: any) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  const queue = [...rows];
  await Promise.all(Array.from({ length: 6 }, async () => { for (let p = queue.shift(); p; p = queue.shift()) out.push(await fn(p)); }));
  return out;
}
const tally = (rows: { lose: boolean; before: number; after: number; completes: boolean; asked: boolean; id: string }[]) => {
  const impact: Impact = { members: rows.length, preserved: 0, required_of: 0, completes: 0, progress_up: 0, progress_down: 0 };
  const preserve: string[] = [];
  for (const r of rows) {
    // من حُفظ اكتماله لا يتغير له شيء، فلا يُعد في غيره
    if (r.lose) { impact.preserved += 1; preserve.push(r.id); continue; }
    if (r.completes) impact.completes += 1;
    if (r.asked) impact.required_of += 1;
    if (r.after > r.before) impact.progress_up += 1; else if (r.after < r.before) impact.progress_down += 1;
  }
  return { impact, preserve };
};
/** أثر تغيير في جلسات نشاط قائم في رحلة الدفعة: patch يعيد جلسات المشارك كما ستكون */
async function countingImpact(cohortId: string, requirementId: string, patch: (rows: any[]) => any[]) {
  const people = await countingPeople(cohortId);
  const rows = (await eachMember(people, async (p) => {
    const [b, a] = [await journeyFor(p, { lite: true }), await journeyFor(p, { lite: true, sessions: patch })];
    const at = (j: any) => { const st = (j.journey || []).find((s: any) => (s.items || []).some((i: any) => i.id === requirementId)); return { st, it: st?.items.find((i: any) => i.id === requirementId) }; };
    const [x, y] = [at(b), at(a)];
    if (!x.it || !y.it) return null;
    const lose = (x.it.status === 'done' && y.it.status !== 'done') || (x.st.status === 'done' && y.st.status !== 'done');
    return { id: p.id as string, lose, before: b.progress, after: a.progress, completes: x.it.status !== 'done' && y.it.status === 'done',
      asked: countsItem(y.it) && y.it.status !== 'done' && !countsItem(x.it) };
  })).filter(Boolean) as any[];
  return tally(rows);
}
/** أثر أول ورشة إلزامية في مرحلة لم يُنشأ نشاط ورشها بعد: بند جديد يُعد في مرحلتها. من أتمها يُحفظ له، والباقون تصير مطلوبة منهم */
async function newActivityImpact(cohortId: string, stageKey: string) {
  const people = await countingPeople(cohortId);
  const rows = (await eachMember(people, async (p) => {
    const b = await journeyFor(p, { lite: true });
    const st = (b.journey || []).find((s: any) => s.key === stageKey);
    if (!st) return null;
    const lose = st.status === 'done';
    const after = lose ? b.progress : journeyProgress(b.journey.map((s: any) => (s.key === stageKey ? { ...s, total: (Number(s.total) || 0) + 1 } : s)));
    return { id: p.id as string, lose, before: b.progress, after, completes: false, asked: !lose };
  })).filter(Boolean) as any[];
  return tally(rows);
}
/** يكتب حفظ الاكتمال: صف تقدم «done» على النشاط لمن لا صف مكتمل له. بلا completed_at: ليس إنجازًا جديدًا في «ماذا تغيّر» */
async function preserveCompletion(a: any, requirementId: string, ids: string[]) {
  if (!ids.length) return 0;
  const have = new Set(((must(await db.from('participant_requirements').select('participant_id, status').eq('requirement_id', requirementId).in('participant_id', ids)) ?? []) as any[])
    .filter((r) => r.status === 'done').map((r) => r.participant_id));
  const rows = ids.filter((id) => !have.has(id)).map((id) => ({ participant_id: id, requirement_id: requirementId, status: 'done', note: PRESERVE_NOTE, reviewed_by: a.email, reviewed_at: new Date().toISOString(), completed_at: null }));
  if (rows.length) must(await db.from('participant_requirements').upsert(rows), 'تعذّر حفظ اكتمال من أتم قبل التغيير');
  return rows.length;
}
export const OPTIONAL_NOT_READY_FAIL = 'الورشة الاختيارية غير مفعّلة بعد: تحتاج تحديث قاعدة البيانات. احفظها إلزامية، أو أعد المحاولة بعد التحديث';

// الحفظ الواحد للجلسة (القرار 23): من «الحضور والجلسات» وبطاقة المرحلة والنقرة على الخط الزمني (المرحلة 4). ومعه اختياران
// صريحان من النموذج لا يُرسل بريد بغيرهما: invite (أرسل الدعوة عند الحفظ) وnotify_change (أبلغ المدعوين بتغيّر الموعد أو المكان)
export async function workshopSave(a: any, b: Body) {
  const row = b.row || {};
  const mode = row.mode === 'online' ? 'online' : 'in_person';
  // الموعد والرابط اختياريان (J1): فارغان يعنيان «يُحدد لاحقًا»، والجزئي والمقلوب يُرفضان برسالته (workshopSchedule)
  const when = workshopSchedule({ ...row, mode });
  const out: Body = {
    title_ar: String(row.title_ar || '').trim().slice(0, 200),
    mode,
    location_ar: mode === 'in_person' ? String(row.location_ar || '').trim().slice(0, 300) || null : null,
    join_url: when.join_url ?? null,
    starts_at: when.starts_at ?? null, ends_at: when.ends_at ?? null, active: row.active !== false,
  };
  // فارغ صراحة: الجلسة لكل الدفعات. وغياب الحقل في التحرير يُبقي ربطها القائم؛ كان يكتب null فيفك
  // ربط الجلسة بدفعتها بصمت فتسقط دعوتها وتذكيرها (التدقيق 2026-11-11، admin-program-3)
  if ('cohort_id' in row || !row.id) out.cohort_id = /^[0-9a-f-]{36}$/.test(String(row.cohort_id || '')) ? row.cohort_id : null;
  if (!out.title_ar) throw new Fail('عنوان الجلسة مطلوب');
  if (when.error) throw new Fail(when.error);
  // الوسم (optional.js): اللوحة تفرض اختيارًا صريحًا بلا قيمة مسبقة. وغيابه في طلب (لوحة أقدم مفتوحة لحظة النشر، أو تحرير لا
  // يمسه) يعني في الإنشاء «إلزامية» كما كانت كل ورشة قبل القرار، وفي التحرير بقاء الوسم القائم
  const counting: 'mandatory' | 'optional' | null = COUNTING.includes(row.counting) ? row.counting : null;
  const preview = b.preview === true;
  if (counting === 'optional' && !(await optionalReady())) throw new Fail(OPTIONAL_NOT_READY_FAIL, 409, 'optional_not_ready');
  let effect: { impact: Impact; preserve: string[] } | null = null;
  let countingFrom: string | null = null;
  // السعة (W3): تُكتب حين يرسلها النموذج وحده، فغيابها في التحرير يُبقي القائمة
  if ('capacity' in row) out.capacity = cleanCapacity(row.capacity);
  // قبل الترحيل 20261116060000 يرفض القيد الموعد الفارغ (23502 أو 23514): رسالة تقول السبب بدل «تعذّر الحفظ»
  const undatedBlocked = (res: any) => {
    if (res.error && !out.starts_at && ['23502', '23514'].includes(String(res.error.code))) throw new Fail('الجلسة بلا موعد تحتاج تحديث قاعدة البيانات أولًا؛ حدد موعدها الآن أو أعد المحاولة بعد التحديث');
    return res;
  };
  // قبل الترحيل 20261118130000 لا عمود للسعة: يُعاد الحفظ بلاها، ويُقال للوحة إنها لم تُحفظ إن كانت لها قيمة
  let capacitySkipped = false;
  const tolerant = async (write: (x: Body) => PromiseLike<any>) => {
    let res = await write(out);
    if (res.error && missingColumn(res.error) && 'capacity' in out) {
      capacitySkipped = out.capacity != null;
      delete out.capacity;
      res = await write(out);
    }
    return res;
  };
  let saved: any, prev: any = null;
  let left: Leave | null = null, claimed = false, swapped = false;
  if (row.id) {
    // تغيّر الموعد يُسقط أختام الدعوة والتذكير: الموعد الجديد يُذكَّر به وتُرسل دعوته من جديد (كان يبقى «أُرسلت الدعوة» ويسقط التذكير)
    // بـ* وبما يحمله الصف فقط: الأعمدة من ترحيلات لاحقة، فلا يُكتب عمود غير موجود قبلها
    // نسخة مما قبل الحفظ: يُقارن بها ما بعده (إشعار التغيير)، فلا تتبع صفًا يتغير بالحفظ نفسه
    const read = must(await db.from('workshop_sessions').select('*').eq('id', row.id).maybeSingle()) as any;
    prev = read ? { ...read } : null;
    await checkTrainer(row, out, prev);
    // تغيير الوسم لاحقًا: بمعاينة أثره بالأرقام ثم تأكيد صريح (counting_confirm)، وسجل بالأرقام نفسها
    if (prev && counting && counting !== countingOf(prev)) {
      const cohortId = 'cohort_id' in out ? out.cohort_id : prev.cohort_id;
      if (!cohortId || cohortId !== prev.cohort_id) throw new Fail('وسم ورشة تعمّ الدفعات أو تُنقل إلى دفعة أخرى لا يتغير في الحفظ نفسه. حدد دفعتها واحفظ، ثم غيّر الوسم', 400, 'counting_general');
      const to = counting === 'optional';
      effect = await countingImpact(cohortId, prev.requirement_id, (rows) => rows.map((s) => (s.id === prev.id ? { ...s, optional: to } : s)));
      countingFrom = countingOf(prev);
      out.optional = to;
      if (!preview && b.counting_confirm !== true) throw new Fail('تغيير وسم الورشة يحتاج تأكيدًا بعد معاينة أثره', 409, 'counting_confirm', { impact: effect.impact });
    }
    const flipped = !!effect;
    // خروج الجلسة من جمهورها أو عودتها إليه (قرار المالك 2026-11-22): إلغاء، أو نقل عن دفعتها، أو إعادة ملغاة، أو سحب موعدها
    const leave = prev ? leaveOf(prev, out) : null;
    // استبدال المدرب المسمى (أو تسميته أو إزالته) في هذا الحفظ: للسابق بريد يزيل الموعد من تقويمه، وللجديد الدعوة
    const swap = !!prev && 'expert_id' in out && 'expert_id' in prev && (prev.expert_id || null) !== (out.expert_id || null);
    // إعادة ورشة إلزامية ملغاة في نشاط «ورش إضافية» ترفع المطلوب كإضافتها: يُحفظ اكتمال من أتم قبلها، بلا سؤال (لا يُسحب شيء)
    if (prev && !effect && prev.active === false && out.active !== false && prev.cohort_id && !optionalSession(prev)) {
      const rq = (await db.from('stage_requirements').select('id, kind, config').eq('id', prev.requirement_id).maybeSingle()).data as any;
      if (eachWorkshop(rq)) effect = await countingImpact(prev.cohort_id, prev.requirement_id, (rows) => rows.map((s) => (s.id === prev.id ? { ...s, active: true } : s)));
    }
    if (preview) return { success: true, preview: true, counting: counting || (prev ? countingOf(prev) : 'mandatory'), changed: flipped, impact: effect?.impact || null, leave: leave ? await leavePreview(prev, out, leave) : null };
    const at = (v: any) => (v ? Date.parse(v) : null);
    // والنقل إلى دفعة أخرى وإعادة الملغاة كذلك: الدفعة الجديدة لم تُدعَ، والمعادة تُدعى من جديد أو تبقى بلا دعوة
    if (prev && (at(prev.starts_at) !== at(out.starts_at) || leave === 'move' || leave === 'restore')) {
      for (const k of STAMPS) if (k in prev) out[k] = null;
    }
    // الكتابة بشرط الحالة التي قُرئت: طلبان معًا أو طلب معاد لا يلغي إلا أحدهما (claimed)، فلا بريد إلغاء ولا دعوة مرتين
    // وسحب الموعد بشرط أن لها موعدًا، واستبدال المدرب بشرط أنه ما زال المدرب الذي قُرئ
    const claim: ((q: any) => any) | null = leave === 'cancel' ? (q) => q.eq('active', true) : leave === 'restore' ? (q) => q.eq('active', false) : leave === 'move' ? (q) => q.eq('cohort_id', prev.cohort_id)
      : leave === 'undate' ? (q) => q.not('starts_at', 'is', null) : swap ? (q) => (prev.expert_id ? q.eq('expert_id', prev.expert_id) : q.is('expert_id', null)) : null;
    if (claim) {
      saved = must(undatedBlocked(await tolerant((x) => claim(db.from('workshop_sessions').update(x).eq('id', row.id)).select('id').maybeSingle())), 'تعذّر الحفظ');
      if (leave) claimed = !!saved;
      swapped = swap && !!saved;
    }
    if (!saved) saved = must(undatedBlocked(await tolerant((x) => db.from('workshop_sessions').update(x).eq('id', row.id).select('id').single())), 'تعذّر الحفظ');
    left = leave;
  } else {
    const want = counting || 'mandatory';
    // المسار الموجّه: مرحلة بلا نشاط حضور. يُنشأ فيها نشاط «ورش إضافية» في برنامج الدفعة بنسخة وترقية (extraWorkshopReq)،
    // والمعاينة لا تنشئ شيئًا
    const guided = !row.requirement_id && !!row.stage_key;
    let r: any;
    let created: Body | null = null;
    if (guided) {
      if (!out.cohort_id) throw new Fail('الورشة في مرحلة بلا نشاط حضور تُضاف لدفعة بعينها', 400, 'guided_needs_cohort');
      const g = await extraWorkshopReq(a, out.cohort_id, String(row.stage_key), { create: !preview });
      r = g.req;
      created = g.created || null;
      if (want === 'mandatory') effect = r ? await countingImpact(out.cohort_id, r.id, (rows) => [...rows, { id: 'new', requirement_id: r.id, cohort_id: out.cohort_id, active: true, title_ar: out.title_ar, starts_at: out.starts_at, ends_at: out.ends_at, mode }])
        : await newActivityImpact(out.cohort_id, String(row.stage_key));
    } else {
      r = must(await db.from('stage_requirements').select('id, kind, config').eq('id', String(row.requirement_id || '')).maybeSingle());
      if (!r || r.kind !== 'workshop') throw new Fail('اختر متطلب ورشة');
      // نشاط «ورش إضافية» ورشه لدفعة بعينها: ورشة عامة إلزامية فيه كانت سترفع المطلوب في كل دفعات البرنامج بلا معاينة
      if (eachWorkshop(r) && !out.cohort_id) throw new Fail('ورش هذا النشاط تُضاف لدفعة بعينها. اختر الدفعة', 400, 'each_needs_cohort');
      // في نشاط «ورش إضافية» كل ورشة إلزامية مطلوبة بعينها، فإضافتها ترفع المطلوب: يُحسب أثرها ويُحفظ اكتمال من أتم
      if (want === 'mandatory' && eachWorkshop(r) && out.cohort_id && out.active !== false) {
        effect = await countingImpact(out.cohort_id, r.id, (rows) => [...rows, { id: 'new', requirement_id: r.id, cohort_id: out.cohort_id, active: true, title_ar: out.title_ar, starts_at: out.starts_at, ends_at: out.ends_at, mode }]);
      }
    }
    if (preview) return { success: true, preview: true, counting: want, changed: false, impact: effect?.impact || null, guided };
    await checkTrainer(row, out, null);
    // العمود يُكتب بعد ترحيله وحده: قبله كل ورشة إلزامية كما كانت، و«اختيارية» رُفضت أعلاه برسالتها
    if (await optionalReady()) out.optional = want === 'optional';
    const secret = randomToken(32);
    saved = must(undatedBlocked(await tolerant((x) => db.from('workshop_sessions').insert({ ...x, requirement_id: r.id, secret }).select('id').single())), 'تعذّر الحفظ');
    if (created) (saved as any).version_created = created;
    prev = null;
    (saved as any).requirement_id = r.id;
  }
  await audit('admin', a.email, row.id ? 'workshop.update' : 'workshop.create', 'workshop_sessions', saved.id, null, out);
  // حفظ اكتمال من كان التغيير سيسحبه منه، ثم سطر السجل بالأرقام
  let preserved = 0;
  if (effect) {
    const reqId = row.id ? prev.requirement_id : (saved as any).requirement_id;
    preserved = await preserveCompletion(a, reqId, effect.preserve);
    await audit('admin', a.email, 'workshop.counting', 'workshop_sessions', saved.id, countingFrom ? { counting: countingFrom } : null,
      { counting: countingFrom ? counting : 'mandatory', ...effect.impact, preserved_written: preserved, preserved_ids: effect.preserve.slice(0, 200), requirement_id: reqId });
  }
  // البريد بعد الحفظ وباختيار صريح وحده. تعذّره لا يُسقط الحفظ (فلا تُنشأ الجلسة مرتين بإعادة المحاولة): يُرد بنتيجته
  // بريد الإلغاء أولًا (لمن دُعي في دفعتها قبل الحفظ)، ثم ما يطلبه الحفظ من دعوة أو إشعار
  // وسحب الموعد (undate) كإلغاء لموعد التقويم وحده: الجلسة باقية، وردّه بمفتاحه
  const gone = left === 'cancel' || left === 'move' || left === 'undate'
    ? { [left === 'undate' ? 'undate' : 'cancel']: await cancelNotice(a, prev, left, { notify: b.notify_cancel !== false, claimed, trainer: trainerLeaves(prev, out, left) }).catch((e) => { console.error('workshop cancel mail', saved.id, (e as Error).message); return { error: true }; }) }
    : {};
  // المدرب السابق عند الاستبدال: ما ينتظر له في الطابور يُترك، ويصله بريد واحد يزيل الموعد من تقويمه. والخارج مع الجلسة بريده من cancelNotice
  if (swapped) await dropQueued(saved.id, TRAINER_LIVE_SUBJECTS);
  const released = swapped && !left && prev.expert_id ? await releaseTrainer(a, prev).catch((e) => { console.error('workshop trainer release', saved.id, (e as Error).message); return 'failed' as TrainerSent; }) : 'none';
  const mail = await saveMail(a, saved.id, prev, b, left, claimed, swapped).catch((e) => { console.error('workshop save mail', saved.id, (e as Error).message); return { mail_error: true }; });
  return { success: true, id: saved.id, ...(capacitySkipped ? { capacity_skipped: true } : {}), ...gone, ...mail, ...(released !== 'none' ? { released } : {}),
    ...(effect ? { impact: effect.impact } : {}), ...((saved as any).version_created ? { version_created: (saved as any).version_created } : {}) };
}

// ── البريد عند الحفظ (المرحلة 4): «أرسل الدعوة عند الحفظ» و«أبلغ المدعوين بالتغيير» ──
// الدعوة: الدعوة القائمة نفسها (workshopSend) لجلسة دفعة مؤرخة قائمة لم تنتهِ ولم تُدعَ. الختم invited_at يُحجز قبل الإرسال
// بشرط أنه فارغ، فطلبان معًا أو طلب معاد لا يرسلان مرتين، ويُحرر إن لم تخرج رسالة.
// التغيير: لجلسة دُعي أعضاؤها ثم تغيّر موعدها أو مكانها في هذا الحفظ نفسه. يُقارن الصف قبل الحفظ بما بعده، فالحفظ المعاد
// بالقيم نفسها لا يجد تغيّرًا ولا يرسل. بعده تبقى الجلسة «مدعوة» (الإشعار يحمل الموعد الجديد وملف تقويمه)، والتذكيران
// يُعادان للموعد الجديد كما كان. وبلا الاختيار يبقى السلوك السابق: تغيّر الموعد يعيد فتح الدعوة.
type MailSkip = 'general' | 'undated' | 'ended' | 'inactive' | 'invited';
const mailSkip = (s: any): MailSkip | null => (!s.cohort_id ? 'general' : s.active === false ? 'inactive' : isUndated(s) ? 'undated' : Date.parse(s.ends_at) < Date.now() ? 'ended' : null);
const whenOf = (s: any) => `${s?.starts_at ? Date.parse(s.starts_at) : ''}|${s?.ends_at ? Date.parse(s.ends_at) : ''}`;
const placeOf = (s: any) => (s?.mode === 'online' ? `online|${s.join_url || ''}` : `in_person|${s?.location_ar || ''}`);
// إعادة جلسة ملغاة (leave «restore»): إن كانت أُعلنت قبل إلغائها واختار المدير «ادعُهم من جديد» (reinvite) خرجت الدعوة القائمة
// نفسها برقم تسلسل أعلى من ملف الإلغاء، فيعود الموعد إلى التقاويم، وللمدرب بريد بعودتها. وبلا الاختيار تبقى بلا دعوة وزرها «أرسل الدعوة».
// والملغاة (leave «cancel») لا بريد لها هنا: بريدها cancelNotice
async function saveMail(a: any, id: string, prev: any, b: Body, leave: Leave | null = null, claimed = false, swapped = false): Promise<Body> {
  if (leave === 'cancel' || leave === 'undate') return {};
  const restored = leave === 'restore' && b.reinvite === true && !!prev?.invited_at;
  const wantInvite = b.invite === true || restored, wantChange = b.notify_change === true && !leave;
  if (leave === 'restore') await dropQueued(id, [WORKSHOP_CANCEL_MAIL.subject, WORKSHOP_TRAINER_MAIL.cancel.subject]);
  // مدرب سُمّي في هذا الحفظ لجلسة قائمة: تصله الدعوة لا التحديث، ولو لم يُطلب بريد للمشاركين
  const named = swapped && !leave;
  if (!wantInvite && !wantChange && !named) return {};
  const s = must(await db.from('workshop_sessions').select('*').eq('id', id).maybeSingle()) as any;
  if (!s) return {};
  const skip = mailSkip(s);
  const changed = { when: !!prev && whenOf(prev) !== whenOf(s), where: !!prev && placeOf(prev) !== placeOf(s) };
  // رقم التسلسل أعلى من آخر ما خرج لهذه الجلسة (ختمها)، والختم يُكتب بوقته
  const seq = nextSeq(prev?.invited_at);
  if (wantChange && prev?.invited_at && (changed.when || changed.where)) {
    if (skip) return { change: { skipped: skip } };
    const r = await workshopSend(s, 'change', changed, seq);
    // تبقى مدعوة بعد الإشعار. قبل الترحيل 20261110140000 لا عمود للختم: يُرسل الإشعار ولا يُحفظ وقته
    if (r.sent) await db.from('workshop_sessions').update({ invited_at: seqIso(seq) }).eq('id', s.id);
    // والمدرب يصله التحديث نفسه بملفه، بريد واحد
    const trainer = r.sent || r.queued ? await trainerMail(named ? 'invite' : 'change', s, seq, r.total, { changed }) : 'none';
    const told = trainer !== 'none' ? { trainer } : {};
    await audit('admin', a.email, 'workshop.change-notice', 'workshop_sessions', s.id, null, { ...r, ...changed, ...told });
    return { change: { ...r, ...told } };
  }
  if (!wantInvite) {
    // لا بريد للمشاركين في هذا الحفظ. المدرب الجديد لجلسة معلنة بموعدها القائم تصله دعوتها الآن، ولغير المعلنة مع دعوتها حين تُرسل
    if (!named || !s.expert_id || skip || !s.invited_at) return {};
    const at = nextSeq(s.invited_at);
    const trainer = await trainerMail('invite', s, at, (await workshopRecipients(s, true)).length);
    if (trainer === 'none') return {};
    // الختم يُقدَّم إلى رقم ملفه، فيعلوه أي إلغاء أو تحديث بعده
    if (trainer !== 'failed') await db.from('workshop_sessions').update({ invited_at: seqIso(at) }).eq('id', s.id).not('invited_at', 'is', null);
    await audit('admin', a.email, 'workshop.trainer-notice', 'workshop_sessions', s.id, null, { kind: 'invite', trainer, expert_id: s.expert_id });
    return { trainer };
  }
  if (skip) return { invite: { skipped: skip } };
  if (s.invited_at) return { invite: { skipped: 'invited' } };
  // إعادة لم تكتبها هذه الكتابة (طلب معاد أو طلبان معًا): صاحبة الكتابة هي التي تدعو
  if (restored && b.invite !== true && !claimed) return { invite: { skipped: 'invited' } };
  const stamp = await db.from('workshop_sessions').update({ invited_at: seqIso(seq) }).eq('id', s.id).is('invited_at', null).select('id');
  // قبل ترحيل الختم لا عمود: تُرسل الدعوة بلا حجز كما يفعل زر «أرسل الدعوة»
  const stamped = !stamp.error;
  if (stamp.error && !missingColumn(stamp.error)) must(stamp);
  if (stamped && !(stamp.data || []).length) return { invite: { skipped: 'invited' } };
  // بريد سحب موعد سابق ما زال ينتظر لا يخرج بعد دعوة الموعد الجديد
  await dropQueued(s.id, UNDATE_SUBJECTS);
  const r = await workshopSend(s, 'invite', undefined, seq);
  if (stamped && !r.sent) await db.from('workshop_sessions').update({ invited_at: null }).eq('id', s.id);
  // المدرب المسمى تصله الدعوة مع المدعوين (وبعد الإعادة بريد عودتها)، برقم التسلسل نفسه
  const trainer = r.sent || r.queued ? await trainerMail(restored ? 'restore' : 'invite', s, seq, r.total) : undefined;
  const told = trainer && trainer !== 'none' ? { trainer } : {};
  await audit('admin', a.email, 'workshop.invite', 'workshop_sessions', s.id, null, { ...r, on_save: true, ...(restored ? { restored: true, trainer } : told) });
  return { invite: { ...r, ...(restored ? { restored: true } : {}), ...told } };
}

// ── بريد الإلغاء (قرار المالك 2026-11-22) ──
// كل مسار يخرج به الجلسة من جمهورها يبلّغ من دُعي إليها مرة واحدة، ومعه ملف إلغاء التقويم:
//   الإلغاء (active من true إلى false، من «ألغِ اليوم» أو من مربع «مفعّلة» في النموذج)، والحذف، ونقلها إلى دفعة أخرى أو جعلها عامة
//   (لأعضاء دفعتها الأولى). وتغيير الوسم إلزامية أو اختيارية لا يلغي شيئًا فلا بريد له.
// وسحب موعد جلسة أُعلنت (المتابعة 2): إلغاء لموعد تقويمها وحده بقالبه، والجلسة باقية.
// من يُبلَّغ: المصدر نفسه الذي تُرسل به الدعوة وإشعار التغيير (workshopRecipients بـrealOnly)، فلا تعريف ثانٍ لـ«المدعو»،
// ولا يصل حساب العرض ولا حساب اختبار. والمدرب المسمى بريد واحد.
// لا بريد لجلسة عامة، أو ملغاة أصلًا، أو ليس في يد مدعويها موعد لها لم ينتهِ (toldOf). والمدير يرى العدد قبل التأكيد
// (leavePreview، من القراءة نفسها) وله ألا يبلّغ (notify_cancel: false) لجلسة أُنشئت بالخطأ.
// بلا ترحيل: رقم تسلسل الملف من ختم الدعوة (invited_at) والساعة، والختم يُقدَّم إلى وقت ملف الإلغاء فتعلوه دعوة الإعادة.
type Leave = 'cancel' | 'move' | 'restore' | 'undate';
type CancelSkip = MailSkip | 'unannounced' | 'opted_out' | 'already';
type TrainerSent = 'sent' | 'queued' | 'failed' | 'none';
const STAMPS = ['invited_at', 'reminded_day_at', 'reminded_hour_at'];
// سحب الموعد (undate، المتابعة 2): جلسة مؤرخة قائمة يُفرغ المدير موعدها. تبقى في الرحلة «يُحدد لاحقًا»، وموعد تقويمها يُلغى
// لمن دُعي كما يُلغى بالإلغاء. والإلغاء والنقل يغلبانه إن اجتمعا معه في حفظ واحد (بريدهما يزيل الموعد نفسه)
function leaveOf(prev: any, out: Body): Leave | null {
  if (prev.active === false) return out.active !== false ? 'restore' : null;
  if (out.active === false) return 'cancel';
  if ('cohort_id' in out && !!prev.cohort_id && (out.cohort_id || null) !== prev.cohort_id) return 'move';
  return !isUndated(prev) && !out.starts_at ? 'undate' : null;
}
// المدرب يخرج مع الجلسة الملغاة والمحذوفة والمسحوب موعدها، ومع المنقولة إن لم يبقَ مدربها في دفعتها الجديدة (checkTrainer)
const trainerLeaves = (prev: any, out: Body, leave: Leave | 'delete') => !!prev.expert_id && (leave !== 'move' || ('expert_id' in out && out.expert_id !== prev.expert_id));

// ── «هل دُعي أحد، وإلى أي موعد؟» (المتابعة 3، 2026-11-22) ──
// الختم invited_at يُفرَّغ حين يتغير الموعد بلا إبلاغ، فكان إلغاء جلسة غُيّر موعدها بصمت يعاملها «لم تُعلن»: لا بريد، والموعد القديم
// يبقى في التقاويم. الاختبار الآن «هل في يد المدعوين موعد لهذه الجلسة؟»:
//   ختم قائم لجلسة مؤرخة: نعم، والموعد المخزَّن هو ما أُبلغوا به (كل تغيير موعد يفرّغ الختم، وإشعار التغيير يعيده).
//   بلا ختم: من سجل العمليات (audit_log)، آخر بريد خرج لمدعويها. دعوة أو إشعار تغيير وصل أحدًا (sent، كشرط الختم نفسه): في يدهم
//   موعد. وإلغاء أو سحب موعد: لا شيء في يدهم. والموعد الذي أُبلغوا به هو ما حمله آخر حفظ (workshop.create أو workshop.update)
//   قبل ذلك البريد، ودعوة خرجت والجلسة في دفعة أخرى لا تُحسب لأعضاء دفعتها الحالية.
// لماذا السجل لا سجل البريد ولا ترحيل: السجل إلزامي (audit يرمي فلا تكتمل العملية بلاه)، ولا يُعدَّل ولا يُحذف (الزناد
// audit_log_frozen)، ومرقم بمعرّف متصاعد فترتيبه قاطع، ويحمل الجلسة والموعد معًا. وسجل البريد (mail_events) عدّاد للحصة بلا موعد
// ولا نوع، وعمود جديد لا يعرف ما دُعي إليه قبل ترحيله. تعذّرت القراءة: كأن لا دعوة (السلوك السابق، لا بريد بلا يقين)
// seq: أدنى رقم تسلسل لملف يلي ما في يدهم. بلا ختم يؤخذ من وقت سطر السجل (الملف خرج قبله)، فالإلغاء يعلو الدعوة ولو تتابعا في ثانية
type Told = { starts_at: string; ends_at: string; stale: boolean; seq: number };
const TOLD_NOTICES = ['workshop.invite', 'workshop.change-notice', 'workshop.cancel-notice'];
const TOLD_SAVES = ['workshop.create', 'workshop.update'];
const TOLD_SCAN = 300;
async function toldOf(s: any): Promise<Told | null> {
  if (!s?.id || !s.cohort_id) return null;
  if (s.invited_at && !isUndated(s)) return { starts_at: s.starts_at, ends_at: s.ends_at, stale: false, seq: 0 };
  const { data, error } = await db.from('audit_log').select('id, action, after, created_at').eq('entity', 'workshop_sessions').eq('entity_id', s.id)
    .in('action', [...TOLD_NOTICES, ...TOLD_SAVES]).order('id', { ascending: false }).limit(TOLD_SCAN);
  if (error) { console.error('workshop told', s.id, error.message); return null; }
  const rows = (data || []) as any[];
  const reached = (r: any) => TOLD_NOTICES.includes(r.action) && (Number(r.after?.sent) > 0 || (r.action === 'workshop.cancel-notice' && Number(r.after?.queued) > 0));
  const at = rows.findIndex(reached);
  if (at < 0 || rows[at].action === 'workshop.cancel-notice') return null;
  const before = rows.slice(at + 1).filter((r) => TOLD_SAVES.includes(r.action) && r.after);
  const cohortThen = before.find((r) => 'cohort_id' in r.after);
  if (cohortThen && (cohortThen.after.cohort_id || null) !== s.cohort_id) return null;
  // الموعد يومها: من آخر حفظ قبل البريد. وإن لم يبلغه المسح (سجل أطول من حده) فالمخزَّن إن كان لها موعد
  const then = before.find((r) => 'starts_at' in r.after)?.after;
  const day = then?.starts_at && then?.ends_at ? then : isUndated(s) ? null : s;
  if (!day) return null;
  return { starts_at: day.starts_at, ends_at: day.ends_at, stale: whenOf(day) !== whenOf(s), seq: (Math.floor(Date.parse(String(rows[at].created_at || '')) / 1000) || 0) + 1 };
}
// لا بريد إلغاء لجلسة عامة أو ملغاة أصلًا، ولا لمن ليس في يدهم موعد لها (لم تُعلن، أو بلا موعد، أو انتهت)، ولا لموعد أُبلغوا به وانتهى
const cancelSkip = (s: any, told: Told | null): CancelSkip | null => (!s.cohort_id ? 'general' : s.active === false ? 'inactive'
  : told ? (Date.parse(told.ends_at) < Date.now() ? 'ended' : null) : mailSkip(s) || 'unannounced');
// رقم تسلسل ملف التقويم التالي: الساعة بالثواني، ولا يقل عما بعد آخر ما خرج (الختم)، فالترتيب دعوة ثم تغيير ثم إلغاء ثم دعوة
// إعادة يثبت ولو تتابعت في ثانية واحدة
const nextSeq = (last: unknown) => Math.max(Math.floor(Date.now() / 1000), (Math.floor(Date.parse(String(last || '')) / 1000) || 0) + 1);
const seqIso = (seq: number) => new Date(seq * 1000).toISOString();
// journey-guard: بريد مدرب الجلسة بمعرّفه ليُبلَّغ بدعوتها وتغيّرها وإلغائها وعودتها، ولو أُوقف بعد تسميته (الأهلية تُفحص عند التسمية: cohortTrainers)
// ولا يصل هوية عرض أو اختبار: مدرب بريده بريد حساب عرض أو حساب اختبار بين المشاركين لا يُراسَل، وكذلك بريد على نطاق حساب العرض
async function trainerContact(id: unknown): Promise<{ full_name: string; email: string } | null> {
  if (!id) return null;
  const e = (await db.from('experts').select('id, full_name, email').eq('id', String(id)).maybeSingle()).data as any;
  if (!e?.email || isDemoMail(e.email)) return null;
  const twins = ((await db.from('participants').select('id, is_demo, is_test').eq('email', String(e.email).trim().toLowerCase())).data || []) as any[];
  return twins.some((p) => p.is_demo || p.is_test) ? null : e;
}
/** ما ينتظر في طابور البريد لهذه الجلسة بهذه العناوين يُترك: دعوة لم تخرج بعد لا تصل بعد إلغاء جلستها، ولا إلغاء بعد إعادتها */
async function dropQueued(sessionId: string, subjects: string[]) {
  const { error } = await db.from('mail_queue').update({ gave_up_at: new Date().toISOString(), last_error: 'superseded' }).eq('ref', sessionId).in('subject', subjects).is('sent_at', null).is('gave_up_at', null);
  if (error) console.error('workshop queue drop', sessionId, error.message);
}
// ما يحمل موعدًا قائمًا للمدرب (دعوته وتحديثه وعودة جلسته): يُترك من الطابور حين يُستبدل، ومع دعوة المدعوين حين تُلغى الجلسة
const TRAINER_LIVE_SUBJECTS = [WORKSHOP_TRAINER_MAIL.invite.subject, WORKSHOP_TRAINER_MAIL.change.subject, WORKSHOP_TRAINER_MAIL.restore.subject];
const INVITE_SUBJECTS = [WORKSHOP_MAIL.invite.subject, WORKSHOP_MAIL.day.subject, WORKSHOP_MAIL.hour.subject, WORKSHOP_CHANGE_MAIL.subject, ...TRAINER_LIVE_SUBJECTS];
const UNDATE_SUBJECTS = [WORKSHOP_UNDATE_MAIL.subject, WORKSHOP_TRAINER_MAIL.undate.subject];
/** من سحب الإلغاء أو النقل اكتماله: نشاطه أو مرحلته مكتملان الآن ولا يبقيان بعده. من الحساب القائم نفسه (countingImpact)، بلا كتابة
 * ولا حفظ اكتمال: السلوك كما كان، والمدير يراه رقمًا قبل التأكيد. null إن تعذّر الحساب (دفعة أكبر من حده) */
async function uncompleted(prev: any, leave: 'cancel' | 'move'): Promise<number | null> {
  if (!prev.cohort_id || optionalSession(prev)) return 0;
  // counting-exempt: هل للجلسة حضور أصلًا؟ بوابة للحساب لا عدّ يُعرض: بلا حضور لا يسحب إلغاؤها اكتمالًا من أحد
  const { count } = await db.from('workshop_attendance').select('session_id', { count: 'exact', head: true }).eq('session_id', prev.id);
  if (!count) return 0;
  try {
    return (await countingImpact(prev.cohort_id, prev.requirement_id, (rows) => (leave === 'move' ? rows.filter((s) => s.id !== prev.id) : rows.map((s) => (s.id === prev.id ? { ...s, active: false } : s))))).impact.preserved;
  } catch (e) { console.error('workshop uncomplete count', prev.id, (e as Error).message); return null; }
}
/** المعاينة قبل التأكيد: من يُبلَّغ (العدد من قراءة الإرسال نفسها) والمدرب، أو سبب ألا بريد، ومن يُسحب اكتماله.
 * told_at: الموعد الذي في يد المدعوين إن خالف المخزَّن (تغيّر بلا إبلاغ)، ليقول السؤال أي موعد يُلغى */
async function leavePreview(prev: any, out: Body, leave: Leave | 'delete') {
  if (leave === 'restore') {
    const s = { ...prev, ...out };
    const skip: CancelSkip | null = !prev.invited_at ? 'unannounced' : mailSkip(s);
    if (skip) return { kind: leave, notify: null, skipped: skip };
    return { kind: leave, notify: { members: (await workshopRecipients(s, true)).length, trainer: (await trainerContact(s.expert_id))?.full_name || null }, skipped: null };
  }
  const told = await toldOf(prev);
  const skip = cancelSkip(prev, told);
  const dropped = trainerLeaves(prev, out, leave);
  const notify = skip ? null : { members: (await workshopRecipients(prev, true)).length, trainer: dropped ? (await trainerContact(prev.expert_id))?.full_name || null : null };
  // سحب الموعد لا يسحب اكتمالًا: الحضور المسجل محفوظ والجلسة قائمة
  return { kind: leave, notify, skipped: skip, uncomplete: leave === 'delete' || leave === 'undate' ? 0 : await uncompleted(prev, leave), ...(notify && told?.stale ? { told_at: told.starts_at } : {}) };
}
// بريد المدرب المسمى (s.expert_id): بريد واحد لكل حدث، جماعي بحصة البريد وطابوره وينتهي بموعد الجلسة، وملفه بمعرّف دعوة
// المدعوين ورقم تسلسلها، فإلغاء لاحق يزيل ما أضافته دعوته. لا شيء فيه عن مشارك بعينه: العدد وحده
async function trainerMail(kind: keyof typeof WORKSHOP_TRAINER_MAIL, s: any, seq: number, count: number, { changed }: { changed?: { when: boolean; where: boolean } } = {}): Promise<TrainerSent> {
  if (isUndated(s)) return 'none';
  const e = await trainerContact(s.expert_id);
  if (!e) return 'none';
  const cohort = s.cohort_id ? ((await db.from('cohorts').select('name').eq('id', s.cohort_id).maybeSingle()).data as any)?.name || null : null;
  const off = kind === 'cancel' || kind === 'undate' || kind === 'release';
  const online = s.mode === 'online';
  const link = online && !off ? s.join_url || null : null;
  const file = [icsEvent({ uid: s.id, start: s.starts_at, end: s.ends_at, title: `${s.title_ar} · برنامج القادة`, description: s.location_ar || 'Milestone Impact · Leaders Program', sequence: seq, ...(off ? { method: 'CANCEL' as const } : { url: link || '' }) })];
  try {
    const res = await sendMail(e.email, WORKSHOP_TRAINER_MAIL[kind].subject, workshopTrainerMail(kind, e.full_name, { title: s.title_ar, when: workshopWhen(s.starts_at), where: online ? SESSION_MODE_AR.online : s.location_ar || null, cohort, count, joinUrl: link, changed }), file, { category: 'expert_work', kind: 'bulk', ref: s.id, recipient: { kind: 'expert', id: s.expert_id }, expiresAt: s.starts_at });
    return res === 'queued' ? 'queued' : 'sent';
  } catch (err) { console.error('workshop trainer mail', kind, s.id, (err as Error).message); return 'failed'; }
}
/** المدرب السابق بعد استبداله في جلسة قائمة في يد مدعويها موعد لها لم ينتهِ: بريد واحد بملف يزيل الموعد من تقويمه */
async function releaseTrainer(a: any, prev: any): Promise<TrainerSent> {
  if (prev.active === false) return 'none';
  const told = await toldOf(prev);
  if (!told || Date.parse(told.ends_at) < Date.now()) return 'none';
  const trainer = await trainerMail('release', { ...prev, starts_at: told.starts_at, ends_at: told.ends_at }, Math.max(nextSeq(prev.invited_at), told.seq), 0);
  if (trainer !== 'none') await audit('admin', a.email, 'workshop.trainer-notice', 'workshop_sessions', prev.id, null, { kind: 'release', trainer, expert_id: prev.expert_id });
  return trainer;
}
/** بريد الإلغاء (أو سحب الموعد) لمن دُعي إلى الجلسة كما كانت قبل الحفظ (s)، مرة واحدة: claimed أن هذه الكتابة هي التي أخرجتها.
 * الموعد في البريد وملفه هو الذي في يد المدعوين (toldOf): إن خالف المخزَّن قال البريد ذلك بصراحته (stale) */
async function cancelNotice(a: any, stored: any, reason: Exclude<Leave, 'restore'> | 'delete', { notify, claimed, trainer }: { notify: boolean; claimed: boolean; trainer: boolean }): Promise<Body> {
  const told = await toldOf(stored);
  const skip: CancelSkip | null = cancelSkip(stored, told) || (!claimed ? 'already' : !notify ? 'opted_out' : null);
  // ما لم يخرج بعد من دعوتها وتذكيرها لا يخرج بعد الآن، أُبلغ أحد أم لا
  if (claimed) await dropQueued(stored.id, INVITE_SUBJECTS);
  if (skip || !told) {
    if (skip === 'opted_out') await audit('admin', a.email, 'workshop.cancel-notice', 'workshop_sessions', stored.id, null, { reason, skipped: skip });
    return { skipped: skip };
  }
  // s: الجلسة كما يعرفها المدعوون، بالموعد الذي أُبلغوا به. منه نص البريد وملف الإلغاء وموعد انتهاء الرسالة المنتظرة
  const s = { ...stored, starts_at: told.starts_at, ends_at: told.ends_at };
  const undate = reason === 'undate';
  const seq = Math.max(nextSeq(stored.invited_at), told.seq);
  const people = await workshopRecipients(s, true);
  const title = optionalSession(s) ? `${s.title_ar} (${COUNTING_AR.optional})` : s.title_ar;
  const when = workshopWhen(s.starts_at);
  const named = s.expert_id ? (await trainerNames([s.expert_id]))[s.expert_id] || null : null;
  const file = [icsEvent({ uid: s.id, start: s.starts_at, end: s.ends_at, title: `${s.title_ar} · برنامج القادة`, sequence: seq, method: 'CANCEL' })];
  const subject = undate ? WORKSHOP_UNDATE_MAIL.subject : WORKSHOP_CANCEL_MAIL.subject;
  let sent = 0, failed = 0, queued = 0;
  // جماعي بحصة البريد وطابوره كالدعوة، ومؤرخ بالموعد الذي أُبلغوا به: إن انتظر حتى بدأ تُرك
  for (const m of people) {
    try {
      const html = undate ? workshopUndateMail(m.name, title, when, s.location_ar || null, named) : workshopCancelMail(m.name, title, when, s.location_ar || null, named, told.stale);
      const res = await sendMail(m.email, subject, html, file, { category: 'sessions', kind: 'bulk', ref: s.id, expiresAt: s.starts_at });
      if (res === 'queued') queued += 1; else sent += 1;
    } catch (e) { failed += 1; console.error('workshop mail', reason, s.id, (e as Error).message); }
  }
  const said = trainer ? await trainerMail(undate ? 'undate' : 'cancel', s, seq, people.length) : 'none';
  // الختم يُقدَّم إلى وقت ملف الإلغاء: دعوة الإعادة تأخذ رقمًا أعلى منه. والمنقولة والمحذوفة والمسحوب موعدها لا ختم لها بعد
  if (reason === 'cancel' && (sent || queued)) await db.from('workshop_sessions').update({ invited_at: seqIso(seq) }).eq('id', s.id);
  const r = { sent, failed, total: people.length, ...(queued ? { queued } : {}), ...(said !== 'none' ? { trainer: said } : {}), ...(told.stale ? { stale: true } : {}) };
  await audit('admin', a.email, 'workshop.cancel-notice', 'workshop_sessions', s.id, null, { ...r, reason, starts_at: s.starts_at });
  return r;
}

export async function workshopDelete(a: any, b: Body) {
  const id = String(b.id || '');
  // counting-exempt: حارس الحذف لا عدّ: أي صف حضور مهما كان صاحبه يمنع حذف الجلسة
  const { count } = await db.from('workshop_attendance').select('session_id', { count: 'exact', head: true }).eq('session_id', id);
  if (count) throw new Fail('للجلسة حضور مسجل؛ أوقفها بدل حذفها');
  // الحذف يخرج الجلسة من جمهورها كالإلغاء: من دُعي يُبلَّغ بملف إلغاء التقويم، والمدير يرى العدد قبل التأكيد (preview)
  const s = must(await db.from('workshop_sessions').select('*').eq('id', id).maybeSingle()) as any;
  if (b.preview === true) {
    if (!s) throw new Fail('الجلسة غير موجودة', 404);
    return { success: true, preview: true, leave: await leavePreview(s, s, 'delete') };
  }
  // الصف المحذوف يعود من الحذف نفسه: طلبان معًا يحذف أحدهما وحده، فلا بريد إلغاء مرتين
  const gone = (must(await db.from('workshop_sessions').delete().eq('id', id).select('id')) ?? []) as any[];
  await audit('admin', a.email, 'workshop.delete', 'workshop_sessions', id);
  if (!s) return { success: true };
  const cancel = await cancelNotice(a, s, 'delete', { notify: b.notify_cancel !== false, claimed: gone.length > 0, trainer: true }).catch((e) => { console.error('workshop cancel mail', id, (e as Error).message); return { error: true }; });
  return { success: true, cancel };
}

// رمز الحضور الحالي لعرضه على شاشة القاعة. يتجدد كل 30 ثانية.
export async function workshopQr(b: Body) {
  const s = must(await db.from('workshop_sessions').select('id, secret, title_ar, location_ar, starts_at, ends_at, active, mode').eq('id', String(b.id || '')).maybeSingle());
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  // الرمز والأرقام الستة من التوقيع نفسه والنافذة نفسها (W2): يتغيران معًا كل 30 ثانية
  const w = qrWindow();
  const [t, code] = await Promise.all([qrToken(s.id, s.secret, w), qrCode(s.id, s.secret, w)]);
  const { count } = await listed(db.from('workshop_attendance').select('session_id, participants!inner(is_demo)', { count: 'exact', head: true }).eq('session_id', s.id), 'participants');
  const left = QR_WINDOW - (Math.floor(Date.now() / 1000) % QR_WINDOW);
  return {
    success: true, url: `${CONFIG.appUrl}/?checkin=${encodeURIComponent(t)}`, code, refresh_in: left, open: checkinOpen(s), attended: count || 0,
    session: { id: s.id, title: s.title_ar, mode: s.mode, location: s.location_ar, starts_at: s.starts_at, ends_at: s.ends_at },
  };
}

// من يُتوقع حضوره (من ينطبق عليهم المتطلب بعد اعتماد مسارهم): المصدر الواحد لقائمة الحضور وشاشة الرمز وأيام بطاقة المرحلة
async function attendanceWorld(withCohorts: boolean) {
  const none = Promise.resolve({ data: [] as any[] });
  const [{ data: pl }, { data: enr }, { data: cohorts }] = await Promise.all([
    // حساب العرض معتمد آليًا وفي الدفعة المفتوحة، فكان يظهر في متوقعي الجلسات العامة: خارج المتوقعين والحاضرين (listed)
    listed(db.from('placements').select('participant_id, dimension, level, approved_at, participants!inner(full_name, email, organization_name, organization_id, status, is_demo)'), 'participants'),
    withCohorts ? db.from('enrollments').select('participant_id, cohort_id, status, created_at') : none,
    withCohorts ? db.from('cohorts').select('id, organization_id, status, is_default, starts_on, created_at') : none,
  ]);
  const by: Record<string, any> = {};
  for (const x of pl || []) {
    const e = (by[x.participant_id] ||= { id: x.participant_id, ...x.participants, levels: {}, approved: 0 });
    e.levels[x.dimension] = x.level;
    if (x.approved_at) e.approved++;
  }
  const memo = new Map<string, string | null>();
  // دفعة المشارك الفعلية (pickCohort) مرة واحدة لكل مشارك
  const cohortOf = (e: any) => {
    if (!memo.has(e.id)) memo.set(e.id, pickCohort({ enrollments: (enr || []).filter((x: any) => x.participant_id === e.id), cohorts: cohorts || [], organizationId: e.organization_id || null }).cohort?.id || null);
    return memo.get(e.id);
  };
  return { people: Object.values(by), cohortOf };
}
// cohortId: جلسة دفعة بعينها، فالمتوقع مشاركو تلك الدفعة فقط. strict: الحاضر يُعد أيضًا من الدفعة وحدها (جلسة عامة في بطاقة دفعة)
function attendancePeople(r: any, w: Awaited<ReturnType<typeof attendanceWorld>>, cohortId: string | null, att: any[], strict = false) {
  const inCohort = (e: any) => !cohortId || w.cohortOf(e) === cohortId;
  const present = Object.fromEntries((att || []).map((a: any) => [a.participant_id, a]));
  return w.people
    .filter((e: any) => (e.approved === 3 && inProgram(e.status) && requirementApplies(r, e.levels) && inCohort(e)) || (present[e.id] && (!strict || inCohort(e))))
    .map((e: any) => ({ id: e.id, full_name: e.full_name, email: e.email, organization_name: e.organization_name, attendance: present[e.id] || null }))
    .sort((x: any, y: any) => String(x.full_name).localeCompare(String(y.full_name), 'ar'));
}

// صفوف حضور الجلسة بسببها (note)
async function attendanceRows(sid: string): Promise<any[]> {
  // counting-exempt: صفوف الحضور لا تُعدّ وحدها: attendancePeople يعرض منها من في attendanceWorld وحدهم (listed)
  return (must(await db.from('workshop_attendance').select('participant_id, checked_in_at, method, recorded_by, note').eq('session_id', sid), 'تعذّرت قراءة الحضور') ?? []) as any[];
}

// الحضور ومن يُتوقع حضوره
export async function workshopAttendance(b: Body) {
  const s = must(await db.from('workshop_sessions').select('id, requirement_id, cohort_id, title_ar, location_ar, starts_at, ends_at, active, mode').eq('id', String(b.id || '')).maybeSingle());
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  // cohort_id: الجلسة العامة من بطاقة دفعة تُقرأ بأعضاء تلك الدفعة وحاضريها وحدهم، كما تعدّها البطاقة (cohortWorkshops).
  // جلسة الدفعة لا يغيّرها هذا: متوقعها دفعتها هي دائمًا
  const view = b.cohort_id ? String(b.cohort_id) : null;
  const [{ data: r }, att, w] = await Promise.all([
    db.from('stage_requirements').select('*').eq('id', s.requirement_id).single(),
    attendanceRows(s.id),
    attendanceWorld(!!(s.cohort_id || view)),
  ]);
  const people = attendancePeople(r, w, s.cohort_id || view, att, !s.cohort_id && !!view);
  return { success: true, session: s, requirement: { id: r.id, title_ar: r.title_ar }, people };
}

// أيام الورشة في بطاقة المرحلة (W3، تصور 2026-11-18 ب5.4): جلسات متطلبات الحضور لهذه الدفعة والجلسات العامة، ولكل جلسة
// طريقتها الفعلية (sessionVerify: تخصيص الدفعة لجلساتها وحدها، والعامة بطريقة البرنامج كما يفرضها التسجيل في workshopVerify) والمتوقع والحاضر من attendancePeople نفسها التي تعدّ بها شاشة الرمز، والسعة إن رُحّلت.
// قراءة فقط: الإضافة والتحرير والإلغاء بـadmin.workshop-save نفسه، فلا مسار كتابة ثانٍ
export async function cohortWorkshops(b: Body) {
  const c = must(await db.from('cohorts').select('id, program_id, delivery').eq('id', String(b.cohort_id || '')).maybeSingle()) as any;
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const ids = [...new Set((Array.isArray(b.requirement_ids) ? b.requirement_ids : []).map(String))].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 50);
  const capacity_ready = await capacityReady();
  // خبراء هذه الدفعة لحقل «المدرب» في نموذج اليوم (المرحلة 4)
  const trainers = (await cohortTrainers([c.id]).catch((e) => { console.error('cohort trainers', e); return {} as Record<string, any[]>; }))[c.id] || [];
  // توافق مع نسخة اللوحة المنشورة قبل هذا التنظيف (تحديث بلا أثر): لوحة مفتوحة لحظة النشر تقرأ هذه الإشارة، فتبقى ثابتة إصدارًا واحدًا وتُحذف بعد 2026-12-04
  const base = { success: true, capacity_ready, trainer_ready: true /* COMPAT_UNTIL_2026_12_04 */, trainers, optional_ready: await optionalReady() };
  if (!ids.length) return { ...base, sessions: [] };
  // متطلبات برنامج الدفعة وحدها، فلا تُقرأ جلسات برنامج آخر برقم متطلب مرسل
  const reqs = (must(await db.from('stage_requirements').select('*').in('id', ids).eq('program_id', c.program_id).eq('kind', 'workshop')) || []) as any[];
  if (!reqs.length) return { ...base, sessions: [] };
  const reqOf = Object.fromEntries(reqs.map((r: any) => [r.id, r]));
  const rows = ((must(await db.from('workshop_sessions').select('*').in('requirement_id', reqs.map((r: any) => r.id))) || []) as any[])
    .filter((s: any) => !s.cohort_id || s.cohort_id === c.id).sort(bySessionTime);
  const [att, w] = await Promise.all([
    // counting-exempt: كالسابق، العدّ في attendancePeople على attendanceWorld وحده (listed)
    rows.length ? db.from('workshop_attendance').select('session_id, participant_id').in('session_id', rows.map((s: any) => s.id)) : Promise.resolve({ data: [] as any[] }),
    attendanceWorld(true),
  ]);
  const attOf: Record<string, any[]> = {};
  for (const a of (att as any).data || []) (attOf[a.session_id] ||= []).push(a);
  const trainerOf = await trainerNames(rows.map((s: any) => s.expert_id));
  // المتوقع لهذه الدفعة: جلستها كما تعدّها شاشة الرمز، والعامة بأعضاء هذه الدفعة وحاضريها وحدهم
  const sessions = rows.map((s: any) => {
    const people = attendancePeople(reqOf[s.requirement_id], w, c.id, attOf[s.id] || [], !s.cohort_id);
    const row: Body = { ...s, verify: sessionVerify(reqOf[s.requirement_id], s.cohort_id ? c.delivery : null), expected: people.length, attended: people.filter((p: any) => p.attendance).length,
      trainer: (s.expert_id && trainerOf[s.expert_id]) || null };
    delete row.secret;
    if (!capacity_ready) delete row.capacity;
    return row;
  });
  return { ...base, sessions };
}

// ── التسجيل اليدوي للحضور: كاتب واحد للفردي والجماعي وللمدرب (تصور تشغيل الدفعة 2026-11-19، المرحلتان 0 و2) ──
// 1. الحضور لمن يُتوقع حضوره وحده، بالقاعدة نفسها التي تبني القائمة (attendancePeople)، فلا يُكتب حضور لغير أهل الجلسة.
// 2. لا يكتب فوق حضور قائم: من سجّل نفسه يبقى بطريقته ووقته.
// 3. إلغاء حضور سجّله المشارك بنفسه (أي طريقة غير «يدوي») للمدير الكاتب وحده وبسبب مكتوب، وإلغاء اليدوي بنقرة.
// 4. حساب العرض لا يُكتب له حضور، والجلسة الملغاة لا يُسجَّل فيها حضور جديد.
// السبب يُحفظ مع صف الحضور (note) وفي سجل التدقيق دائمًا، ومعه الحالة قبل الحذف.
// markBatch يحكم لكل مشارك وحده ويعيد نتيجته: مقبول يُكتب، ومسجل أصلًا يُتخطى، ومرفوض بسببه. طلب معاد لا يكتب مرتين: من سُجّل
// في المرة الأولى «مسجل أصلًا» في الثانية بلا صف ولا سطر سجل، ومفتاح منع التكرار (idempotency.ts) يعيد الرد الأول نفسه.
export { MARK_REASON_MAX };
export const MARK_BULK_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARK_REFUSAL: Record<string, string> = {
  demo: 'الحساب التجريبي لا يُسجَّل له حضور',
  not_expected: 'ليس ممن يُتوقع حضورهم في هذه الجلسة',
  reason_required: 'اكتب سبب إلغاء حضور سجّله المشارك بنفسه',
  admin_only: 'سجّل حضوره بنفسه، وإلغاؤه للإدارة وحدها',
  not_yours: 'سجّله غيرك، وإلغاؤه لمن سجّله أو للإدارة',
};
// expert: المدرب المكلف بدفعة الجلسة. يُكتب في السجل «system» ببريده (كما تُكتب أفعال الخبير الأخرى: قيد actor_type بلا «expert»)
type Marker = { email: string; expert?: boolean };
type MarkRow = { id: string; result: 'marked' | 'unmarked' | 'already' | 'refused'; code?: string };
const cleanMarkReason = (v: unknown) => String(v || '').trim().slice(0, MARK_REASON_MAX);
const markIds = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x || '')).filter(Boolean))];

async function markBatch(by: Marker, sid: string, input: { present: string[]; absent: string[]; reason: string; unmarkReason: string }) {
  const { present, absent, reason, unmarkReason } = input;
  if (present.length + absent.length > MARK_BULK_MAX) throw new Fail(`الحد ${MARK_BULK_MAX} مشارك في الحفظ الواحد`, 400, 'too_many');
  if (present.some((id) => absent.includes(id))) throw new Fail('مشارك واحد لا يُسجَّل ويُلغى في الطلب نفسه', 400, 'conflict');
  const s = must(await db.from('workshop_sessions').select('id, requirement_id, cohort_id, active').eq('id', sid).maybeSingle()) as any;
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  const prior = new Map<string, any>((await attendanceRows(sid)).map((x) => [x.participant_id, x]));
  const out: MarkRow[] = [];
  const logs: AuditRow[] = [];
  const actorType = by.expert ? 'system' : 'admin';
  const tag = by.expert ? { by: 'expert' } : {};

  // ── التسجيل ──
  const want = present.filter((id) => !prior.has(id));
  for (const id of present) if (prior.has(id)) out.push({ id, result: 'already' });
  if (want.length) {
    if (s.active === false) throw new Fail('هذه الجلسة ملغاة، فلا يُسجَّل فيها حضور. أعدها أولًا', 409, 'inactive');
    const valid = want.filter((id) => UUID_RE.test(id));
    const [demo, { data: r }, w] = await Promise.all([
      valid.length ? db.from('participants').select('id').in('id', valid).eq('is_demo', true) : Promise.resolve({ data: [] as any[], error: null }),
      db.from('stage_requirements').select('*').eq('id', s.requirement_id).maybeSingle(),
      attendanceWorld(!!s.cohort_id),
    ]);
    const demos = new Set(((must(demo as any) ?? []) as any[]).map((x) => x.id));
    const expected = new Set(r ? attendancePeople(r, w, s.cohort_id || null, []).map((e: any) => e.id) : []);
    const ok: string[] = [];
    for (const id of want) {
      // للمدرب لا يُميَّز حساب العرض عن غيره ممن ليسوا في قائمته: لا يُعرف معرّفه بتجربة المعرّفات
      if (demos.has(id)) out.push({ id, result: 'refused', code: by.expert ? 'not_expected' : 'demo' });
      else if (!expected.has(id)) out.push({ id, result: 'refused', code: 'not_expected' });
      else ok.push(id);
    }
    if (ok.length) {
      const rows = ok.map((id) => ({ session_id: sid, participant_id: id, method: 'manual', recorded_by: by.email, ...(reason ? { note: reason } : {}) }));
      const res = await db.from('workshop_attendance').upsert(rows, { onConflict: 'session_id,participant_id', ignoreDuplicates: true }).select('participant_id');
      // ما كُتب فعلًا وحده يُسجَّل: من سبق إليه تسجيل آخر في اللحظة نفسها يبقى بطريقته، و«مسجل أصلًا» هنا
      const done = new Set(((must(res, 'تعذّر تسجيل الحضور') ?? []) as any[]).map((x) => x.participant_id));
      for (const id of ok) {
        if (!done.has(id)) { out.push({ id, result: 'already' }); continue; }
        out.push({ id, result: 'marked' });
        logs.push({ actorType, actor: by.email, action: 'workshop.mark', entity: 'participants', entityId: id, after: { session_id: sid, ...(reason ? { reason } : {}), ...tag } });
      }
    }
  }

  // ── الإلغاء ──
  const manual: string[] = [], self: string[] = [];
  for (const id of absent) {
    const row = prior.get(id);
    if (!row) { out.push({ id, result: 'already' }); continue; }
    const own = row.method !== 'manual';
    if (by.expert && own) out.push({ id, result: 'refused', code: 'admin_only' });
    else if (by.expert && row.recorded_by !== by.email) out.push({ id, result: 'refused', code: 'not_yours' });
    else if (own && !unmarkReason) out.push({ id, result: 'refused', code: 'reason_required' });
    else (own ? self : manual).push(id);
  }
  // الحذف مشروط بما حُكم عليه: صف تغيّر بين القراءة والحذف (أُلغي ثم سجّل المشارك نفسه) لا يُحذف بحكم صف آخر
  const removed = new Set<string>();
  if (manual.length) {
    let q = db.from('workshop_attendance').delete().eq('session_id', sid).in('participant_id', manual).eq('method', 'manual');
    if (by.expert) q = q.eq('recorded_by', by.email);
    for (const x of (must(await q.select('participant_id'), 'تعذّر إلغاء الحضور') ?? []) as any[]) removed.add(x.participant_id);
  }
  if (self.length) {
    const q = db.from('workshop_attendance').delete().eq('session_id', sid).in('participant_id', self).neq('method', 'manual');
    for (const x of (must(await q.select('participant_id'), 'تعذّر إلغاء الحضور') ?? []) as any[]) removed.add(x.participant_id);
  }
  for (const id of [...manual, ...self]) {
    if (!removed.has(id)) { out.push({ id, result: 'already' }); continue; }
    const row = prior.get(id);
    out.push({ id, result: 'unmarked' });
    logs.push({ actorType, actor: by.email, action: 'workshop.unmark', entity: 'participants', entityId: id,
      before: { session_id: sid, method: row.method, checked_in_at: row.checked_in_at || null, recorded_by: row.recorded_by || null, ...(row.note ? { note: row.note } : {}) },
      after: { session_id: sid, ...(unmarkReason ? { reason: unmarkReason } : {}), ...tag } });
  }
  await auditMany(logs);
  return out;
}

// الفردي (admin.workshop-mark): الحكم نفسه لمشارك واحد، والرفض يُرمى برمزه كما كان
export async function workshopMark(a: any, b: Body) {
  const sid = String(b.session_id || ''), pid = String(b.participant_id || '');
  const reason = cleanMarkReason(b.reason);
  // حساب العرض لا يُكتب له حضور من أي مسار، ولو أُرسل معرّفه باليد: يُرد أولًا، قبل قراءة الجلسة والحضور السابق، فلا يغيّر
  // الرد جلسة غير موجودة ولا صف قديم له. وإلغاء صف قديم له يبقى متاحًا (حذف لا كتابة)
  if (b.present) {
    const { data: who } = await db.from('participants').select('is_demo').eq('id', pid).maybeSingle();
    if (simulated(who)) throw new Fail(MARK_REFUSAL.demo, 400, 'demo');
  }
  const [x] = await markBatch({ email: a.email }, sid, { present: b.present ? [pid] : [], absent: b.present ? [] : [pid], reason, unmarkReason: reason });
  if (x.result === 'refused') {
    if (x.code === 'not_expected') throw new Fail('هذا المشارك ليس ممن يُتوقع حضورهم في هذه الجلسة', 409, 'not_expected');
    throw new Fail(MARK_REFUSAL[x.code!], 400, x.code);
  }
  return x.result === 'already' ? { success: true, already: true } : { success: true };
}

// ورقة الحضور (admin.workshop-mark-bulk): من يُسجَّل ومن يُلغى في حفظ واحد، بسبب واحد للتسجيل وسبب للإلغاء.
// الرد لكل مشارك بنتيجته: سُجّل، أُلغي، مسجل أصلًا (تُخطي)، أو رُفض بسببه. لا اسم ولا بيان في الرد: المعرّف وحده كما أُرسل
function markReply(rows: MarkRow[]) {
  const n = (k: MarkRow['result']) => rows.filter((x) => x.result === k).length;
  return {
    success: true, marked: n('marked'), unmarked: n('unmarked'), already: n('already'),
    refused: rows.filter((x) => x.result === 'refused').map((x) => ({ id: x.id, code: x.code, message: MARK_REFUSAL[x.code!] })),
  };
}
const markInput = (b: Body) => ({ present: markIds(b.present), absent: markIds(b.absent), reason: cleanMarkReason(b.reason), unmarkReason: cleanMarkReason(b.unmark_reason) });
export async function workshopMarkBulk(a: any, b: Body) {
  const input = markInput(b);
  if (!input.present.length && !input.absent.length) throw new Fail('لا تغيير للحفظ', 400, 'empty');
  return markReply(await markBatch({ email: a.email }, String(b.session_id || ''), input));
}

// تأكيد الموجّه: حضر، لم يحضر، أُلغيت، أو إعادتها محجوزة
export async function coachingMark(a: any, b: Body) {
  const status = String(b.status || '');
  if (!['attended', 'no_show', 'cancelled', 'booked'].includes(status)) throw new Fail('حالة غير صالحة');
  const now = new Date().toISOString();
  // صف جلسة جماعية يُؤكَّد من ورقتها وحدها (coaching-groups.ts)، فلا تنفصل حالة مدعو عن جلسته بنقرة هنا
  const cur = (await db.from('coaching_sessions').select('*').eq('id', String(b.id || '')).maybeSingle()).data as any;
  if (cur?.group_id) throw new Fail('هذه من جلسة جماعية. سجّل حضورها من ورقة حضور الجلسة', 409, 'group_session');
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

export const GROUP_PLACE_TBD_AR = 'حضورية، ويصلك مكانها من فريق البرنامج';
// ── تذكير الجلسات (من المهمة الساعية) ──
// الجلسات المحجوزة التي تبدأ بين 23 و25 ساعة من الآن، ولم يُرسل تذكيرها: مرة واحدة لكل جلسة
export async function sessionReminders() {
  const now = Date.now();
  // group-once-exempt: تذكير لكل مشارك بصفه، لا جمع لخبير
  const { data } = await db.from('coaching_sessions').select(await groupCols('id, starts_at, ends_at, join_url, participants(full_name, email, is_test), experts(full_name)'))
    .eq('status', 'booked').is('reminded_at', null)
    .gte('starts_at', new Date(now + 23 * 36e5).toISOString()).lte('starts_at', new Date(now + 25 * 36e5).toISOString()).limit(200);
  let sent = 0;
  // صفوف الجلسة الجماعية تحمل طريقتها ومكانها (decorateGroupRows)، كما يراها المشارك في رحلته
  await decorateGroupRows((data || []) as any[]);
  for (const s of (data || []) as any[]) {
    const { data: mark } = await db.from('coaching_sessions').update({ reminded_at: new Date().toISOString() }).eq('id', s.id).is('reminded_at', null).select('id');
    if (!mark?.length || !s.participants?.email) continue;
    // مدعو الجلسة الجماعية من حسابات الاختبار لا يصله بريدها (كدعوتها)، والفردية كما كانت
    if (s.group_id && s.participants.is_test) continue;
    const when = new Date(s.starts_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
    // ومعه دعوة تقويم تُضاف بنقرة، بتنبيه قبل الجلسة بنصف ساعة
    // الجلسة الجماعية الحضورية (المرحلة 5): التذكير يذكر مكانها، ولا رابط لها. مكان لم يُكتب بعد يُقال بصراحته
    const place = s.group?.mode === 'in_person' ? s.group.location || GROUP_PLACE_TBD_AR : null;
    const joinUrl = place ? null : s.join_url || null;
    const ics = icsEvent({ uid: s.id, start: s.starts_at, end: s.ends_at || new Date(Date.parse(s.starts_at) + 36e5).toISOString(),
      title: `جلسة توجيه${s.experts?.full_name ? ` مع ${s.experts.full_name}` : ''} · برنامج القادة`, description: place && s.group?.location ? s.group.location : 'Milestone Impact · Leaders Program', url: joinUrl || '' });
    await sendMail(s.participants.email, 'جلستك غدًا', sessionReminderMail(s.participants.full_name, when, s.experts?.full_name || null, joinUrl, place), [ics], { category: 'sessions' }).catch((e) => console.error('session reminder', s.id, e));
    sent += 1;
  }
  return sent;
}

// ── دعوة الجلسة التدريبية وتذكيراها ──
// المصدر جلسة الورشة نفسها (workshop_sessions): موعدها ومكانها ودفعتها. الدعوة بيد المشرف مرة واحدة ومعها ملف تقويم،
// والتذكيران من المهمة الساعية: قبل يوم (23 إلى 25 ساعة) وقبل ساعة (30 إلى 90 دقيقة). كلٌّ مرة واحدة لكل جلسة.
// جلسة بلا دفعة (لكل الدفعات) لا يُعرف مدعووها، فلا تُرسل دعوتها ولا تذكيرها آليًا.
const workshopWhen = (iso: string | null) => (!iso ? SESSION_TBD_AR : new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }));
// realOnly (الدعوة وإشعار التغيير): بلا حسابات الاختبار أيضًا (counted)، فبريد يطلبه المدير بنقرة لا يصل حساب العرض ولا
// حساب اختبار. والتذكيران الآليان كما كانا: لأعضاء الدفعة كلهم (cohortMembers يستبعد حساب العرض بـlisted)
async function workshopRecipients(s: any, realOnly = false) {
  if (!s.cohort_id) return [];
  const cohort = (await db.from('cohorts').select('*').eq('id', s.cohort_id).maybeSingle()).data as any;
  if (!cohort) return [];
  // المنسحب والموقوف خارج البرنامج (inProgram مصدر واحد): لا دعوة ولا تذكير (كان الموقوف يُدعى)
  const people = ((await cohortMembers(cohort)) as any[]).filter((m) => m.email && inProgram(m.status));
  if (!realOnly || !people.length) return people;
  const real = new Set((((must(await counted(db.from('participants').select('id').in('id', people.map((m) => m.id)))) ?? []) as any[])).map((x) => x.id));
  return people.filter((m) => real.has(m.id));
}
// رابط الجلسة عن بعد في البريد بقاعدة workshop.join نفسها (sessionOpen): البريد والخادم مصدر واحد. فمن فتح الأدمن مرحلته
// قبل اعتماده يأخذه، والمعتمد يأخذه كما كان. تعذّر الحساب لأحدهم يحجب الرابط عنه وحده، ويبقى زر الانضمام في رحلته حكمه
async function openStageFor(ids: string[], requirementId: string) {
  const open = new Set<string>();
  if (!ids.length) return open;
  // counting-exempt: معرّفات أعضاء الدفعة من cohortMembers (listed)، فلا يعود منها حساب العرض
  const rows = (must(await db.from('participants').select('*').in('id', ids)) ?? []) as any[];
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(rows.slice(i, i + 5).map(async (p) => {
      try { if (await sessionOpen(p, requirementId)) open.add(p.id); } catch (e) { console.error('workshop stage', p.id, (e as Error).message); }
    }));
  }
  return open;
}
// طريقة توثيق حضور الجلسة: من متطلبها، وتخصيص دفعتها يغلبه (applyDelivery). تعذّرها يرمي فيُكتب البريد بملاحظة عامة
async function workshopVerify(s: any): Promise<string> {
  const req = must(await db.from('stage_requirements').select('code, kind, config').eq('id', s.requirement_id).maybeSingle()) as any;
  if (!req) throw new Error('requirement');
  const cohort = s.cohort_id ? (must(await db.from('cohorts').select('delivery').eq('id', s.cohort_id).maybeSingle()) as any) : null;
  return sessionVerify(req, cohort?.delivery);
}
// المصدر الواحد للحساب: المتطلب بتخصيص الدفعة (applyDelivery)، وبلا متطلب مقروء «qr» كما كان
export function sessionVerify(req: any, delivery: any): string {
  if (!req) return 'qr';
  return applyDelivery(req, delivery?.[req.code])?.config?.verify || 'qr';
}
// change (المرحلة 4): إشعار قصير بالموعد أو المكان الجديد لمن دُعي، ومعه ملف تقويم بالمعرّف نفسه ورقم تسلسل أحدث فيحدّث
// الموعد في تقويم المدعو بدل أن يضيف ثانيًا
// seq: رقم تسلسل ملف التقويم. كل دعوة وإشعار يحملانه (nextSeq)، فدعوة تُعاد بعد تغيير أو إلغاء تعلو ما سبقها ولا يتجاهلها التقويم
async function workshopSend(s: any, kind: 'invite' | 'day' | 'hour' | 'change', changed: { when: boolean; where: boolean } = { when: true, where: false }, seq: number = nextSeq(s.invited_at)) {
  // غير المؤرخة لا دعوة لها ولا تذكير ولا ملف تقويم (الدعوة تمنعها، وفلتر التذكير يتجاهلها، وهذا حارس ثالث)
  if (isUndated(s)) return { sent: 0, failed: 0, total: 0 };
  const byAdmin = kind === 'invite' || kind === 'change';
  const people = await workshopRecipients(s, byAdmin);
  // المدرب المسمى في الدعوة وإشعار التغيير («مع فلان»)، والتذكيران كما كانا
  const trainer = byAdmin && s.expert_id ? (await trainerNames([s.expert_id]))[s.expert_id] || null : null;
  const when = workshopWhen(s.starts_at);
  // الورشة الاختيارية تُدعى وتُذكَّر كغيرها، وعنوانها في البريد يقول إنها اختيارية
  const title = optionalSession(s) ? `${s.title_ar} (${COUNTING_AR.optional})` : s.title_ar;
  // ومن لا تفتح له مرحلتها يُدعى بموعدها، ونص البريد له أن الرابط في رحلته حين تُفتح، لا تعليمات القاعة
  const online = s.mode === 'online' && !!s.join_url;
  // عن بعد بلا رابط بعد: البريد يقول إن الرابط يصل قبل الجلسة، لا تعليمات القاعة
  const linkLater = s.mode === 'online' && !s.join_url;
  const open = online ? await openStageFor(people.map((m: any) => m.id), s.requirement_id) : new Set<string>();
  // القاعة المخفية (features.hall) لا تُذكر في البريد، وتعذّر القراءة يعامَل مطفأً. والملاحظة حينها بطريقة توثيق حضور
  // الجلسة نفسها (config.verify بتخصيص الدفعة كما في workshop.checkin)، فلا يُقال لمن ينضم عن بعد «امسح رمز QR»
  const hall = await features().then((f) => f.hall).catch(() => false);
  const verify = hall ? null : await workshopVerify(s).catch(() => null);
  const ics = (url: string) => (byAdmin ? [icsEvent({ uid: s.id, start: s.starts_at, end: s.ends_at, title: `${s.title_ar} · برنامج القادة`, description: s.location_ar || 'Milestone Impact · Leaders Program', url, sequence: seq })] : []);
  const [withLink, noLink] = [ics(s.join_url || ''), ics('')];
  // queued: لم تتسع لها حصة اليوم فدخلت صندوق «لم يُرسل» وتخرج آليًّا (أو يرسلها المدير منه). ليست متعذرة ولا مُرسلة بعد
  let sent = 0, failed = 0, queued = 0;
  // التذكير والدعوة وإشعار التغيير مؤرخة بموعد الجلسة: إن انتظرت في الطابور حتى بدأت تُترك ولا تخرج بعدها (expiresAt).
  // دعوة التقويم المرفقة تُحفظ مع الرسالة المنتظرة (QUEUE_ATTACH_MAX في core.ts)، فمن لم تتسع له حصة اليوم تصله كاملة لاحقًا
  for (const m of people) {
    const link = online && open.has(m.id) ? s.join_url : null;
    const staged = online && !link ? 'staged' : linkLater ? 'later' : false;
    const html = kind === 'change' ? workshopChangeMail(m.name, title, when, s.location_ar || null, link, staged, changed, trainer)
      : workshopMail(kind, m.name, title, when, s.location_ar || null, link, staged, hall, verify === null ? 'other' : attendNoteMethod(verify, !!link), trainer);
    try {
      const out = await sendMail(m.email, kind === 'change' ? WORKSHOP_CHANGE_MAIL.subject : WORKSHOP_MAIL[kind].subject, html, link ? withLink : noLink, { category: 'sessions', kind: 'bulk', ref: s.id, expiresAt: s.starts_at });
      if (out === 'queued') queued += 1; else sent += 1;
    }
    catch (e) { failed += 1; console.error('workshop mail', kind, s.id, (e as Error).message); }
  }
  return { sent, failed, total: people.length, ...(queued ? { queued } : {}) };
}

export async function workshopInvite(a: any, b: Body) {
  const s = must(await db.from('workshop_sessions').select('*').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  if (!s.cohort_id) throw new Fail('هذه الجلسة لكل الدفعات؛ حدّد دفعتها لتُرسل الدعوة إلى أعضائها');
  if (isUndated(s)) throw new Fail('حدد موعد الجلسة أولًا لتُرسل دعوتها، ثم أرسلها من هنا', 400, 'undated');
  if (new Date(s.ends_at).getTime() < Date.now()) throw new Fail('انتهت هذه الجلسة');
  if (s.invited_at && b.again !== true) throw new Fail('أُرسلت دعوة هذه الجلسة من قبل', 409, 'invited');
  if (s.active === false) throw new Fail('هذه الجلسة ملغاة. أعدها أولًا لتُرسل دعوتها', 409, 'inactive');
  const seq = nextSeq(s.invited_at);
  // بريد سحب موعد سابق ما زال ينتظر لا يخرج بعد دعوة الموعد الجديد
  await dropQueued(s.id, UNDATE_SUBJECTS);
  const r = await workshopSend(s, 'invite', undefined, seq);
  // قبل الترحيل 20261110140000 لا عمود للوسم: تُرسل الدعوة ولا يُحفظ وقتها
  if (r.sent) await db.from('workshop_sessions').update({ invited_at: seqIso(seq) }).eq('id', s.id);
  // المدرب المسمى تصله الدعوة مع المدعوين، بملف التقويم ورقم التسلسل نفسيهما
  const trainer = r.sent || r.queued ? await trainerMail('invite', s, seq, r.total) : 'none';
  const told = trainer !== 'none' ? { trainer } : {};
  await audit('admin', a.email, 'workshop.invite', 'workshop_sessions', s.id, null, { ...r, ...told });
  return { success: true, ...r, ...told };
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

// ── شاشة رمز الحضور من بوابة الخبير (W2، تصور الحضور 2026-11-18 ب5.5 البند 5، والافتراض «يعرض الرمز الخبير المكلف بدفعة الجلسة») ──
// المكلف بلا ترحيل: مستشار الدفعة (cohorts.advisor_expert_id) أو عضو فريقها (cohort_experts). والجلسة العامة (بلا دفعة)
// لا مكلف بها، فتبقى للإدارة. الرمز والأرقام من workshopQr نفسها، والمتوقع ومن لم يحضر من workshopAttendance نفسها،
// والخبير يأخذ منها الاسم والحضور وحدهما: لا بريد ولا جهة على شاشة تُعرض في القاعة
const NOT_ASSIGNED = 'هذه الجلسة ليست من دفعاتك';
async function expertCohortIds(expertId: string) {
  const [adv, team] = await Promise.all([
    db.from('cohorts').select('id').eq('advisor_expert_id', expertId).neq('status', 'closed'),
    db.from('cohort_experts').select('cohort_id').eq('expert_id', expertId),
  ]);
  must(adv); must(team);
  return new Set<string>([...(adv.data || []).map((c: any) => c.id), ...(team.data || []).map((x: any) => x.cohort_id)].filter(Boolean));
}
async function assignedSession(e: any, id: unknown) {
  const s = must(await db.from('workshop_sessions').select('id, cohort_id, starts_at, ends_at, active').eq('id', String(id || '')).maybeSingle()) as any;
  if (!s) throw new Fail('الجلسة غير موجودة', 404);
  if (!s.cohort_id || !(await expertCohortIds(e.id)).has(s.cohort_id)) throw new Fail(NOT_ASSIGNED, 403, 'not_assigned');
  return s;
}
// ورقة الحضور للمدرب (تصور تشغيل الدفعة 2026-11-19، المرحلة 2، القرار 3): جلسات دفعاته المؤرخة القائمة، من قبل بدئها بساعة
// (كما يُفتح تسجيل الحضور) إلى أسبوع بعد نهايتها. ما قبل ذلك وما بعده للإدارة
export const TRAINER_SHEET_DAYS = 7;
export const trainerSheetOpen = (s: any, now = Date.now()) => s.active !== false && !isUndated(s)
  && Date.parse(s.starts_at) - 36e5 <= now && now <= Date.parse(s.ends_at) + TRAINER_SHEET_DAYS * 864e5;
// جلسات دفعاته: ما يُعرض رمزه (حضورية تُوثَّق بالرمز بطريقتها الفعلية، من الجارية إلى أسبوعين قادمين: qr)، وما تُفتح ورقة
// حضوره (sheet). الجلسة تظهر بأي منهما، فالتي تُوثَّق يدويًا أو عن بعد تظهر بورقتها وحدها
export async function expertWorkshops(e: any) {
  const ids = [...(await expertCohortIds(e.id))];
  if (!ids.length) return { success: true, sessions: [] };
  const now = Date.now();
  // الأعمدة التي يُبنى منها الرد وحدها، فلا يُقرأ سر الجلسة هنا أصلًا
  const rows = (must(await db.from('workshop_sessions').select(await sessionCols('id, requirement_id, cohort_id, title_ar, location_ar, starts_at, ends_at, active, mode, created_at, expert_id')).in('cohort_id', ids)
    .eq('active', true)) ?? []) as any[];
  const dated = rows.filter((s) => !isUndated(s));
  const soon = (s: any) => s.mode === 'in_person' && Date.parse(s.ends_at) + 1800e3 >= now && Date.parse(s.starts_at) <= now + 14 * 864e5;
  const live = dated.filter((s) => soon(s) || trainerSheetOpen(s, now));
  if (!live.length) return { success: true, sessions: [] };
  const [reqs, cohorts] = await Promise.all([
    db.from('stage_requirements').select('id, code, kind, config').in('id', [...new Set(live.map((s) => s.requirement_id))]),
    db.from('cohorts').select('id, name, delivery').in('id', [...new Set(live.map((s) => s.cohort_id))]),
  ]);
  const reqOf = Object.fromEntries(((must(reqs) ?? []) as any[]).map((r: any) => [r.id, r]));
  const cohortOf = Object.fromEntries(((must(cohorts) ?? []) as any[]).map((c: any) => [c.id, c]));
  const qr = (s: any) => soon(s) && sessionVerify(reqOf[s.requirement_id], cohortOf[s.cohort_id]?.delivery) === 'qr';
  const shown = live.filter((s) => qr(s) || trainerSheetOpen(s, now)).sort(bySessionTime).slice(0, 20);
  // المدرب المسمى للجلسة (المرحلة 4): mine لجلسته هو («أنت مدربها»)، واسم غيره من زملاء الدفعة. الصلاحية لا تتبع الاسم
  const trainerOf = await trainerNames(shown.map((s) => s.expert_id).filter((x) => x && x !== e.id));
  const sessions = shown
    .map((s) => ({ id: s.id, title: s.title_ar, location: s.location_ar, starts_at: s.starts_at, ends_at: s.ends_at, cohort: cohortOf[s.cohort_id]?.name || '', open: checkinOpen(s, now), qr: qr(s), sheet: trainerSheetOpen(s, now), ...(optionalSession(s) ? { optional: true } : {}),
      ...(s.expert_id === e.id ? { mine: true } : s.expert_id && trainerOf[s.expert_id] ? { trainer: trainerOf[s.expert_id] } : {}) }));
  return { success: true, sessions };
}
export async function expertWorkshopQr(e: any, b: Body) {
  await assignedSession(e, b.id);
  return workshopQr({ id: b.id });
}
// الاسم والحضور وحدهما: لا بريد ولا جهة ولا من سجّل ولا سببه. mine: سجّله هذا المدرب بيده، فيلغيه إن أخطأ
export async function expertWorkshopAttendance(e: any, b: Body) {
  const s = await assignedSession(e, b.id);
  const r = await workshopAttendance({ id: b.id });
  return { success: true, sheet: trainerSheetOpen(s), people: r.people.map((x: any) => ({ id: x.id, full_name: x.full_name, attendance: x.attendance ? { method: x.attendance.method, ...(x.attendance.method === 'manual' && x.attendance.recorded_by === e.email ? { mine: true } : {}) } : null })) };
}
// تسجيل المدرب (xp.workshop-mark-bulk): لجلسات دفعاته المكلف بها وحدها وفي نافذتها، وبسبب مكتوب، بالكاتب نفسه (markBatch).
// لا يلغي حضورًا سجّله المشارك بنفسه ولا ما سجّله غيره: يُرفضان في markBatch لكل مشارك
export async function expertWorkshopMarkBulk(e: any, b: Body) {
  const s = await assignedSession(e, b.session_id);
  if (!trainerSheetOpen(s)) throw new Fail(`ورقة الحضور تُفتح قبل الجلسة بساعة وتبقى ${TRAINER_SHEET_DAYS} أيام بعدها. بعد ذلك يسجّل الحضور فريق الإدارة`, 403, 'sheet_closed');
  const input = markInput(b);
  if (!input.present.length && !input.absent.length) throw new Fail('لا تغيير للحفظ', 400, 'empty');
  if (input.present.length && !input.reason) throw new Fail('اكتب سبب التسجيل اليدوي', 400, 'reason_required');
  return markReply(await markBatch({ email: e.email, expert: true }, s.id, { ...input, unmarkReason: '' }));
}
