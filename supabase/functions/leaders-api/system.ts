// ════════════════════════════════════════════════════════════════
// حالة النظام وزيارات الموقع (للإدارة)
// ════════════════════════════════════════════════════════════════
// ما طُبّق من الترحيلات في سجل leaders.schema_migrations (تُطبَّق بسير migrate.yml)، فيظهر في اللوحة
// ما لم يُطبَّق بعد مقارنًا بمجلد الترحيلات، ومعه الأسرار الناقصة واستهلاك البريد اليوم.
import { all, audit, CONFIG, db, Fail, healthMail, MAIL_GALLERY, mailUsage, publicDb, sendMail } from './core.ts';
import { requireWrite } from './admin.ts';
import { itemAnalysis, TIERS, weeklySeries } from './logic.js';
import { PARTICIPANT_STATUS } from './labels.js';
import { MIGRATION_GATES, MIGRATIONS } from './migrations.js';
import { launchReadiness, pendingMigrations, setupReadiness } from './readiness.js';
import { certKeys } from './certificates.ts';
import { RETENTION_DAYS as MAIL_RETENTION_DAYS } from '../_shared/mail-budget.js';

// ── تنظيف دوري (مع التذكير الأسبوعي) ──
// بيانات تشغيلية بعناوين IP ومعرّفات أجهزة لا حاجة لها بعد 90 يومًا: رموز الدخول، الجلسات
// المنتهية أو الملغاة، سجلات التحقق العام من الشهادات، وعناوين مشاهدات الكتيب (يبقى عدّها).
const RETENTION_DAYS = 90;
export async function purge() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString();
  const out: Record<string, number | string> = {};
  const run = async (key: string, q: any) => {
    const { data, error } = await q.select('id');
    out[key] = error ? `error: ${error.message}` : (data || []).length;
  };
  for (const t of ['email_challenges', 'coordinator_challenges', 'expert_challenges', 'webauthn_challenges']) await run(t, db.from(t).delete().lt('created_at', cutoff));
  for (const t of ['auth_sessions', 'coordinator_sessions', 'expert_sessions']) await run(t, db.from(t).delete().lt('expires_at', cutoff));
  await run('certificate_checks', db.from('certificate_checks').delete().lt('created_at', cutoff));
  await run('handbook_views', db.from('handbook_views').update({ ip: null, user_agent: null }).lt('viewed_at', cutoff).not('ip', 'is', null));
  // سجل الإرسال 180 يومًا (D15، نسب استجابة المقيّمين عبر الدفعة)، والطابور بعد إرساله أو تركه 30 يومًا
  await run('mail_events', db.from('mail_events').delete().lt('created_at', new Date(Date.now() - MAIL_RETENTION_DAYS * 864e5).toISOString()));
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  await run('mail_queue', db.from('mail_queue').delete().or(`sent_at.lt.${monthAgo},gave_up_at.lt.${monthAgo}`));
  return out;
}

// مسبار خارجي: طلب حقيقي يمر بالقاعدة، للمراقبة ولفحص ما بعد النشر
// (فحص OPTIONS وحده كان ينجح والدالة معطلة)
export async function ping() {
  const t0 = Date.now();
  const { error } = await db.from('programs').select('id', { head: true, count: 'exact' }).limit(1);
  if (error) throw new Fail('القاعدة لا تجيب', 503, 'db_down');
  return { success: true, db_ms: Date.now() - t0, mail: !!CONFIG.resendKey, at: new Date().toISOString() };
}

// ما لم يُطبَّق من الترحيلات: من سجل leaders.schema_migrations مقارنًا بقائمة المجلد (migrations.js المولَّد)، بوسم بوابة
// النشر (readiness.js، كما تقرؤه بوابات المراحل): الحاجب والمتسامح يُطبَّقان، والمؤجل بقرار لا يُطلب تطبيقه.
// تعذّر قراءة السجل لا يُقرأ «لا شيء ناقص»: ledger false، وتعرضه النظرة العامة وتقرير الأسبوع
async function missingMigrations() {
  const { data, error } = await db.from('schema_migrations').select('name');
  if (error) { console.error('schema_migrations:', error.message); return { ledger: false, pending: [] as { name: string; gate: string; note: string }[] }; }
  return { ledger: true, pending: pendingMigrations(MIGRATIONS, (data || []).map((r: any) => r.name), MIGRATION_GATES) };
}

export async function health() {
  const mig = await missingMigrations();
  const mail = await mailUsage();   // الرقم نفسه الذي يحكم به حارس البريد
  const secrets = {
    RESEND_API_KEY: !!CONFIG.resendKey,
    LEADERS_TOKEN_PEPPER: !!CONFIG.pepper,
    LEADERS_CRON_SECRET: !!CONFIG.cronSecret,
    LEADERS_ALERT_EMAIL: !!CONFIG.alertEmail,
    LEADERS_TURNSTILE_SECRET: !!CONFIG.turnstileSecret && !!CONFIG.turnstileSite,
    // D05: بلا مفتاح التوقيع المستقل لا تصدر شهادة
    LEADERS_CERT_SIGNING_KEY: certKeys().key.length >= 32,
    // قناة التنبيه الفوري (alertWebhook)؛ بوابة المراحل تشترطها مع مفتاح التوقيع (REQUIRED_SECRETS في readiness.js)
    LEADERS_ALERT_WEBHOOK: !!Deno.env.get('LEADERS_ALERT_WEBHOOK'),
  };
  return {
    success: true,
    readiness: await readiness().catch(() => []),
    // missing_migrations: ما يُطبَّق (الحاجب والمتسامح) كما تقرؤه لوحة قبل هذا الحقل؛ pending_migrations: الكل بوسمه
    missing_migrations: mig.pending.filter((m) => m.gate !== 'deferred').map((m) => m.name), pending_migrations: mig.pending, migrations_ledger: mig.ledger,
    missing_secrets: Object.entries(secrets).filter(([, ok]) => !ok).map(([k]) => k),
    mail: { today: mail, cap: CONFIG.mailDailyCap },
  };
}

// جاهزية الإطلاق: إعدادات اللوحة قبل أول دفعة، وبنود الإطلاق التجريبي (م2) للجهات ودفعاتها، كل بند بمكان ضبطه.
// الأحكام والنصوص في readiness.js، وبوابات المراحل تحكم بها على الصفوف نفسها
async function readiness() {
  const [ins, cert, programs, orgs, cohorts, sessions, prog] = await Promise.all([
    db.from('instruments').select('key, kind, active, version, created_at'),
    db.from('certificate_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('programs').select('id', { count: 'exact', head: true }).eq('is_default', true),
    db.from('organizations').select('id, name, status').eq('status', 'active'),
    db.from('cohorts').select('*'),
    db.from('workshop_sessions').select('cohort_id, active, starts_at, ends_at').eq('active', true),
    db.from('programs').select('final_eval').eq('is_default', true).maybeSingle(),
  ]);
  const setup = setupReadiness({ instruments: ins.data || [], certificate: cert.data, defaultPrograms: programs.count ?? 0 });
  // بنود م2 تحتاج قراءاتها كلها: قراءة تعذّرت لا تُعرض «لا دفعة» ولا «لم يُحفظ»
  if ([orgs, cohorts, sessions, prog].some((r) => r.error)) return setup;
  return [...setup, ...launchReadiness({ organizations: orgs.data || [], cohorts: cohorts.data || [], sessions: sessions.data || [], finalEval: (prog.data as any)?.final_eval ?? null })];
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
  if (daily.error) { console.error('analytics_daily:', daily.error.message); return { success: false, code: 'db_error', message: 'تعذّرت قراءة الزيارات الآن، حاول بعد قليل' }; }
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
  // بنود انتقال التعلم (transfer) بلا درجة ولا بُعد حقيقي، فلا تدخل في ألفا
  // ولا تمييز بُعد القيادة الذي تحمله شكليًا
  const scored = (questions || []).filter((q: any) => TIERS.includes(q.tier));
  const r = itemAnalysis(scored, rows.map((x) => ({ assessment_id: x.assessment_id, question_id: x.question_id, score: x.score, k: x.value?.k })), { forms });
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
    ...(h.migrations_ledger ? [] : ['تعذّرت قراءة سجل الترحيلات، فلا يُعرف ما لم يُطبَّق']),
    // المؤجل بقرار لا يحتاج تدخلًا: يُذكر في حالة النظام في اللوحة وحدها
    ...h.pending_migrations.filter((m) => m.gate === 'blocking').map((m) => `ترحيل حاجب لم يُطبَّق: ${m.name}.sql`),
    ...h.pending_migrations.filter((m) => m.gate === 'tolerant').map((m) => `ترحيل لم يُطبَّق تعمل الدوال قبله وبعده: ${m.name}.sql`),
    ...h.missing_secrets.map((k) => `سر ناقص في leaders-api: ${k}`),
    ...(h.mail.today == null ? ['تعذّرت قراءة عداد البريد، فلا يخرج إلا الرموز والتنبيه'] : h.mail.today >= h.mail.cap * 0.8 ? [`رسائل الرموز في آخر 24 ساعة ${h.mail.today} من ${h.mail.cap}`] : []),
    ...(pending ? [`${pending} مشاركًا ينتظرون اعتماد مستواهم`] : []),
  ];
  await sendMail(CONFIG.alertEmail, issues.length ? `تقرير الأسبوع: ${issues.length} يحتاج تدخلك` : 'تقرير الأسبوع: كل شيء على ما يرام', healthMail([
    ['مسجلون جدد هذا الأسبوع', String(joined)], ['نشطون هذا الأسبوع', String(active)],
    [PARTICIPANT_STATUS.pending_approval, String(pending)], ['متطلبات للمراجعة', String(submitted)],
    ['رسائل الرموز آخر 24 ساعة', h.mail.today == null ? 'غير مقروءة' : `${h.mail.today} من ${h.mail.cap}`],
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
