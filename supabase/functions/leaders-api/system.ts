// ════════════════════════════════════════════════════════════════
// حالة النظام وزيارات الموقع (للإدارة)
// ════════════════════════════════════════════════════════════════
// الترحيلات تُشغَّل يدويًا، فلا سجل لما طُبّق منها. الفحص هنا يسأل القاعدة
// عن أثر كل ترحيل (جدول أو عمود أنشأه)، فيظهر في اللوحة ما لم يُشغَّل بعد،
// ومعه الأسرار الناقصة واستهلاك البريد اليوم.
import { all, audit, CONFIG, db, Fail, healthMail, MAIL_GALLERY, publicDb, sendMail } from './core.ts';
import { requireWrite } from './admin.ts';
import { itemAnalysis, weeklySeries } from './logic.js';
import { PARTICIPANT_STATUS } from './labels.js';

// [ملف الترحيل، الجدول في مخطط leaders، عمود يدل عليه]
const MARKERS: [string, string, string][] = [
  ['20261023090000_leaders_reminders', 'participants', 'reminded_at'],
  ['20261023120000_org_coordinators', 'org_coordinators', 'id'],
  ['20261023150000_certificates', 'certificates', 'id'],
  ['20261023170000_org_certificates', 'organizations', 'cert'],
  ['20261023190000_handbook_exports', 'handbook_exports', 'id'],
  ['20261024120000_leaders_item_bank_v3', 'questions', 'chapter_key'],
  ['20261024150000_leaders_post_assessment', 'raters', 'id'],
  ['20261024150000_leaders_verified_activities', 'video_progress', 'participant_id'],
  ['20261024170000_leaders_activity_modes', 'workshop_sessions', 'join_url'],
  ['20261024190000_leaders_programs', 'programs', 'id'],
  ['20261024200000_leaders_content_bank', 'content_items', 'id'],
  ['20261025100000_leaders_program_certificate', 'organizations', 'has_logo'],
  ['20261026090000_leaders_assessment_v4', 'raters', 'phase'],
  ['20261029120000_leaders_capstone', 'capstones', 'participant_id'],
  ['20261031140000_leaders_capstone_tracking', 'capstone_updates', 'id'],
  ['20261031150000_leaders_level_fit', 'backup_20261031_level_fit', 'kind'],
];

async function present(table: string, column: string, schema: any = db) {
  const { error } = await schema.from(table).select(column, { head: true, count: 'exact' }).limit(1);
  return !error;
}

export async function health() {
  const checks = await Promise.all(MARKERS.map(async ([file, t, c]) => ({ file, ok: await present(t, c) })));
  const analytics = await present('page_views', 'id', publicDb);
  const migrations = [...checks, { file: '20261025200000_site_analytics', ok: analytics }];
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  let mail = 0;
  for (const t of ['email_challenges', 'coordinator_challenges']) {
    const { count } = await db.from(t).select('id', { count: 'exact', head: true }).gte('created_at', dayAgo);
    mail += count ?? 0;
  }
  const secrets = {
    RESEND_API_KEY: !!CONFIG.resendKey,
    LEADERS_TOKEN_PEPPER: !!CONFIG.pepper,
    LEADERS_CRON_SECRET: !!CONFIG.cronSecret,
    LEADERS_ALERT_EMAIL: !!CONFIG.alertEmail,
    LEADERS_TURNSTILE_SECRET: !!CONFIG.turnstileSecret && !!CONFIG.turnstileSite,
  };
  return {
    success: true,
    readiness: await readiness().catch(() => []),
    missing_migrations: migrations.filter((m) => !m.ok).map((m) => m.file),
    missing_secrets: Object.entries(secrets).filter(([, ok]) => !ok).map(([k]) => k),
    mail: { today: mail, cap: CONFIG.mailDailyCap },
  };
}

// جاهزية الإطلاق: إعدادات تُضبط من اللوحة قبل أول دفعة، كل بند بمكان ضبطه
async function readiness() {
  const [{ data: ins }, { data: cert }, { count: programs }] = await Promise.all([
    db.from('instruments').select('key, kind, active, version, created_at'),
    db.from('certificate_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('programs').select('id', { count: 'exact', head: true }).eq('is_default', true),
  ]);
  const list = (ins || []) as any[];
  const newest = (kind: string) => list.filter((x) => x.kind === kind).sort((a, b) => (b.version ?? 0) - (a.version ?? 0) || String(b.created_at).localeCompare(String(a.created_at)))[0];
  const active = (kind: string) => list.find((x) => x.kind === kind && x.active);
  const base = active('baseline'), latest = newest('baseline');
  const c: any = cert || {};
  return [
    { key: 'baseline', ok: !!base && base.key === latest?.key, where: 'assessment',
      label: base ? (base.key === latest?.key ? `القياس القبلي المفعّل ${base.key}` : `المفعّل ${base.key} وأحدث نسخة ${latest.key}`) : 'لا قياس قبلي مفعّل' },
    { key: 'post', ok: !!active('post'), where: 'assessment',
      label: active('post') ? `القياس البعدي المفعّل ${active('post').key}` : 'القياس البعدي غير مفعّل، فلا يُقاس الأثر في نهاية البرنامج' },
    { key: 'program', ok: (programs ?? 0) > 0, where: 'programs', label: programs ? 'برنامج افتراضي محدد' : 'لا برنامج افتراضي، فالدفعات الجديدة بلا قالب' },
    { key: 'certificate', ok: c.enabled !== false && !!c.signatory?.name && !!c.hours, where: 'certs',
      label: c.enabled === false ? 'الشهادات معطلة' : !c.signatory?.name ? 'الشهادة بلا موقّع' : !c.hours ? 'الشهادة بلا عدد ساعات' : 'الشهادة مكتملة الإعداد' },
  ];
}

// زيارات الموقع: آخر days يومًا (7 إلى 90)، وموقع واحد أو الكل
export async function visits(b: Record<string, any> = {}) {
  const days = Math.min(90, Math.max(7, Number(b.days) || 30));
  const site = typeof b.site === 'string' && /^[a-z0-9-]{2,40}$/.test(b.site) ? b.site : null;
  const to = new Date(Date.now() + 864e5);
  const from = new Date(Date.now() - days * 864e5);
  const args = { p_from: from.toISOString(), p_to: to.toISOString(), p_site: site };
  const [daily, pages, sources] = await Promise.all([
    publicDb.rpc('analytics_daily', args),
    publicDb.rpc('analytics_pages', { ...args, p_limit: 15 }),
    publicDb.rpc('analytics_sources', args),
  ]);
  if (daily.error) return { success: false, code: 'not_ready', message: 'جدول الزيارات غير موجود بعد. شغّل ترحيل 20261025200000_site_analytics.sql' };
  const src = (sources.data || []) as any[];
  return {
    success: true, days, site,
    daily: daily.data || [],
    pages: pages.data || [],
    referrers: src.filter((x) => x.kind === 'referrer').slice(0, 10),
    devices: src.filter((x) => x.kind === 'device'),
  };
}

// جودة أسئلة أداة قياس من إجابات القياسات المرسلة (للإدارة)
export async function itemReport(b: Record<string, any>) {
  const id = String(b.instrument_id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Fail('أداة القياس غير محددة');
  const { data: questions } = await db.from('questions').select('id, code, dimension, tier, kind, text_ar, options, active, form').eq('instrument_id', id).eq('active', true);
  const sessions = await all((f, t) => db.from('assessments').select('id, form').eq('instrument_id', id).eq('status', 'submitted').range(f, t));
  const ids = sessions.map((x: any) => x.id);
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    rows.push(...await all((f, t) => db.from('assessment_answers').select('assessment_id, question_id, score, value').in('assessment_id', part).range(f, t)));
  }
  const forms = Object.fromEntries(sessions.map((x: any) => [x.id, x.form]));
  const r = itemAnalysis(questions || [], rows.map((x) => ({ assessment_id: x.assessment_id, question_id: x.question_id, score: x.score, k: x.value?.k })), { forms });
  return { success: true, instrument_id: id, ...r };
}

// اتجاه البرنامج للمالك: 12 أسبوعًا من التسجيل والقياس والاعتماد والنشاط
export async function trends() {
  const since = new Date(Date.now() - 12 * 7 * 864e5).toISOString();
  const [joined, assessed, placed, logins] = await Promise.all([
    all((f, t) => db.from('participants').select('created_at').gte('created_at', since).range(f, t)),
    all((f, t) => db.from('assessments').select('submitted_at').eq('status', 'submitted').gte('submitted_at', since).range(f, t)),
    all((f, t) => db.from('placements').select('participant_id, approved_at').gte('approved_at', since).range(f, t)),
    all((f, t) => db.from('auth_sessions').select('participant_id, created_at, last_seen_at').gte('created_at', since).range(f, t)),
  ]);
  // الاعتماد يشمل الأبعاد الثلاثة، فيُعد المشارك مرة عند آخر اعتماد له
  const last = new Map<string, string>();
  for (const x of placed as any[]) if (x.approved_at > (last.get(x.participant_id) || '')) last.set(x.participant_id, x.approved_at);
  const weeks = weeklySeries({
    joined: joined.map((x: any) => x.created_at),
    assessed: assessed.map((x: any) => x.submitted_at),
    approved: [...last.values()],
    active: (logins as any[]).flatMap((x) => [[x.created_at, x.participant_id], ...(x.last_seen_at ? [[x.last_seen_at, x.participant_id]] : [])]),
  });
  return { success: true, weeks };
}

// تقرير الصحة الأسبوعي للمالك: يُرسل من تشغيلة cron.reminders نفسها
export async function weeklyHealth() {
  if (!CONFIG.alertEmail) return { sent: false, reason: 'no LEADERS_ALERT_EMAIL' };
  const h = await health();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const count = async (q: any) => (await q).count ?? 0;
  const [joined, active, pending, submitted] = await Promise.all([
    count(db.from('participants').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo)),
    count(db.from('participants').select('id', { count: 'exact', head: true }).gte('last_login_at', weekAgo)),
    count(db.from('participants').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval')),
    count(db.from('participant_requirements').select('participant_id', { count: 'exact', head: true }).eq('status', 'submitted')),
  ]);
  const issues = [
    ...h.missing_migrations.map((f) => `ترحيل لم يُشغَّل: ${f}.sql`),
    ...h.missing_secrets.map((k) => `سر ناقص في leaders-api: ${k}`),
    ...(h.mail.today >= h.mail.cap * 0.8 ? [`رسائل الرموز في آخر 24 ساعة ${h.mail.today} من ${h.mail.cap}`] : []),
    ...(pending ? [`${pending} مشاركًا ينتظرون اعتماد مستواهم`] : []),
  ];
  await sendMail(CONFIG.alertEmail, issues.length ? `تقرير الأسبوع: ${issues.length} يحتاج تدخلك` : 'تقرير الأسبوع: كل شيء على ما يرام', healthMail([
    ['مسجلون جدد هذا الأسبوع', String(joined)], ['نشطون هذا الأسبوع', String(active)],
    [PARTICIPANT_STATUS.pending_approval, String(pending)], ['متطلبات للمراجعة', String(submitted)],
    ['رسائل الرموز آخر 24 ساعة', `${h.mail.today} من ${h.mail.cap}`],
  ], issues));
  return { sent: true, issues: issues.length };
}

// ── معرض رسائل البريد: كل قالب كما يصل، من الدوال نفسها التي تُرسل، ببيانات تجريبية ──
export function mailGallery() {
  return { success: true, mails: MAIL_GALLERY.map((m) => ({ key: m.key, family: m.family, label: m.label, subject: m.subject, html: m.html() })) };
}
// نسخة تجريبية إلى بريد المدير نفسه فقط، بعنوان يوضح أنها تجربة
export async function mailSendTest(a: import('./admin.ts').Admin, b: Record<string, any>) {
  requireWrite(a);
  const m = MAIL_GALLERY.find((x) => x.key === b.key);
  if (!m) throw new Fail('قالب غير معروف', 404);
  if (!a.email) throw new Fail('لا بريد لحسابك', 400);
  await sendMail(a.email, `[تجربة] ${m.subject}`, m.html());
  await audit('admin', a.email, 'mail.test', 'mail', m.key);
  return { success: true, to: a.email };
}
