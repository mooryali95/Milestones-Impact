// حراس الحزمة 4 (D15 وD14): عداد واحد لكل بريد في الدوال الأربع بنصف محجوز لرموز الدخول، وطابور
// للجماعي، وتنبيه بقناة غير البريد، وتهريب كل القيم في القوالب، وإشعار المصفوفة من الخادم بدل Lambda.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { ALERT_AT, ALERT_OVER_CAP, CODE_RESERVE, crossesAlert, domainOf, FLUSH_FROM_UTC_HOUR, FLUSH_KEEP, inFlush, mailDayStart, mailDecision, nextMailDay, simulateCodes } from '../../supabase/functions/_shared/mail-budget.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('سياسة الحصة', () => {
  it('الرموز والتنبيه لهما السقف كاملًا، وما سواهما لا يتجاوز نصفه', () => {
    expect(CODE_RESERVE).toBe(0.5);
    expect(mailDecision('code', { sent: 99, nonCode: 50 }, 100)).toEqual({ ok: true });
    expect(mailDecision('code', { sent: 100, nonCode: 0 }, 100)).toEqual({ ok: false, reason: 'mail_cap' });
    expect(mailDecision('alert', { sent: 60, nonCode: 50 }, 100).ok).toBe(true);
    for (const k of ['notify', 'bulk', 'contact']) {
      expect(mailDecision(k, { sent: 49, nonCode: 49 }, 100).ok, k).toBe(true);
      expect(mailDecision(k, { sent: 50, nonCode: 50 }, 100), k).toEqual({ ok: false, reason: 'mail_share' });
    }
    expect(mailDecision('marketing', { sent: 0, nonCode: 0 }, 100).reason).toBe('mail_kind');
  });
  it('التنبيه يمر عند السقف باحتياط خمس رسائل فوقه ويُحجب بعدها، والرموز تُحجب عند السقف ونصفها المحجوز كما هو (P1-12)', () => {
    expect(ALERT_OVER_CAP).toBe(5);
    for (const cap of [80, 100, 200]) {
      expect(mailDecision('alert', { sent: cap, nonCode: Math.floor(cap / 2) }, cap), `cap ${cap}`).toEqual({ ok: true });
      expect(mailDecision('alert', { sent: cap + 4, nonCode: 0 }, cap).ok, `cap ${cap}`).toBe(true);
      expect(mailDecision('alert', { sent: cap + 5, nonCode: 0 }, cap), `cap ${cap}`).toEqual({ ok: false, reason: 'mail_cap' });
      // الرمز لا يأخذ من الاحتياط: يُحجب عند السقف نفسه، ولا تحجبه حصة غير الرموز
      expect(mailDecision('code', { sent: cap, nonCode: 0 }, cap), `cap ${cap}`).toEqual({ ok: false, reason: 'mail_cap' });
      expect(mailDecision('code', { sent: cap - 1, nonCode: Math.floor(cap / 2) }, cap), `cap ${cap}`).toEqual({ ok: true });
      for (const k of ['notify', 'bulk', 'contact']) {
        expect(mailDecision(k, { sent: Math.floor(cap / 2), nonCode: Math.floor(cap / 2) }, cap).reason, k).toBe('mail_share');
        expect(mailDecision(k, { sent: cap, nonCode: 0 }, cap).reason, k).toBe('mail_cap');
      }
    }
    // النصف المحجوز للرموز كما كان: صباح الورشة لم يتغير
    expect(simulateCodes(100, 200, { sent: 100, nonCode: 100 })).toBe(100);
    expect(simulateCodes(10, 80, { sent: 75, nonCode: 40 })).toBe(5);
  });
  it('العد بيوم المزوّد (00:00 UTC، أي 03:00 بالرياض) لا 24 ساعة متحركة', () => {
    expect(mailDayStart(Date.parse('2026-11-16T23:59:59Z'))).toBe('2026-11-16T00:00:00.000Z');
    expect(mailDayStart(Date.parse('2026-11-17T00:00:00Z'))).toBe('2026-11-17T00:00:00.000Z');
    expect(new Date(nextMailDay(Date.parse('2026-11-16T05:27:00Z'))).toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect([FLUSH_FROM_UTC_HOUR, FLUSH_KEEP]).toEqual([19, 10]);
    // تفريغ المساء من 22:00 بالرياض حتى التصفير
    expect(['2026-11-16T18:59:59Z', '2026-11-16T19:00:00Z', '2026-11-16T23:59:00Z', '2026-11-17T00:00:00Z'].map((t) => inFlush(Date.parse(t)))).toEqual([false, true, true, false]);
  });
  it('تفريغ المساء: غير الرموز إلى السقف إلا عشرة، والرموز والتنبيه والسقف الكلي كما هي، وبلا flush لا يتغير شيء', () => {
    const flush = { flush: true };
    for (const k of ['notify', 'bulk', 'contact']) {
      expect(mailDecision(k, { sent: 50, nonCode: 40 }, 80).reason, k).toBe('mail_share');
      expect(mailDecision(k, { sent: 50, nonCode: 40 }, 80, flush), k).toEqual({ ok: true });
      expect(mailDecision(k, { sent: 69, nonCode: 59 }, 80, flush), k).toEqual({ ok: true });
      expect(mailDecision(k, { sent: 70, nonCode: 60 }, 80, flush), k).toEqual({ ok: false, reason: 'mail_share' });
      // يوسّع ولا يضيّق: ما يمر بنصيب النهار يمر في المساء
      expect(mailDecision(k, { sent: 75, nonCode: 20 }, 80, flush), k).toEqual({ ok: true });
      expect(mailDecision(k, { sent: 80, nonCode: 20 }, 80, flush), k).toEqual({ ok: false, reason: 'mail_cap' });
    }
    // العشرة الباقية لرموز الدخول ليلًا
    expect(simulateCodes(20, 80, { sent: 70, nonCode: 60 })).toBe(FLUSH_KEEP);
    expect(mailDecision('code', { sent: 79, nonCode: 69 }, 80, flush)).toEqual({ ok: true });
    expect(mailDecision('code', { sent: 80, nonCode: 0 }, 80, flush).reason).toBe('mail_cap');
    expect(mailDecision('alert', { sent: 84, nonCode: 0 }, 80, flush).ok).toBe(true);
    expect(mailDecision('alert', { sent: 85, nonCode: 0 }, 80, flush).reason).toBe('mail_cap');
  });
  it('التنبيه مرة واحدة عند عبور 70%، والنطاق وحده يُحفظ لا العنوان', () => {
    expect(ALERT_AT).toBe(0.7);
    expect([68, 69, 70].map((n) => crossesAlert(n, 100))).toEqual([false, true, false]);
    expect(domainOf(' Sara@Gov.SA ')).toBe('gov.sa');
  });
  it('صباح الورشة: مئة رمز في ثلاثين دقيقة تمر بسقف 200 ولو استُهلك نصيب الإشعارات كله، ولا تمر بالسقف الافتراضي 80', () => {
    expect(simulateCodes(100, 200, { sent: 100, nonCode: 100 })).toBe(100);
    expect(simulateCodes(100, 80)).toBe(80);
    // ولا تحجبها الإشعارات: نصيبها مسدود عند نصف السقف
    expect(mailDecision('notify', { sent: 100, nonCode: 100 }, 200).reason).toBe('mail_share');
  });
  it('حدود الشبكة في الدالة تتسع لقاعة: 150 في الساعة و300 في اليوم لكل شبكة، والتسجيل بـ LEADERS_REGISTER_PER_IP_DAY', () => {
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(core).toMatch(/challengeCount\(hourAgo, ctx\.ip\) >= 150/);
    expect(core).toMatch(/challengeCount\(dayAgo, ctx\.ip\) >= 300/);
    expect(core).toMatch(/registerPerIpDay: Number\(env\('LEADERS_REGISTER_PER_IP_DAY', '60'\)\)/);
    expect(read('RUNBOOK.md')).toContain('صباح الورشة');
  });
});

describe('العداد الموحد في الدوال الأربع', () => {
  const mail = read('supabase/functions/_shared/mail.ts');
  it('لا مرسل احتياطي من نطاق آخر، والرفض والسقف و70% تنبّه عبر قناة المرسل (alertOps في leaders-api، والرابط في غيرها)', () => {
    expect(mail).not.toMatch(/MAIL_FROM_FALLBACK|basserh\.com/);
    expect(mail).toMatch(/if \(!r\.ok && r\.rejected\) await raise\('mail_rejected'/);
    expect(mail).toMatch(/crossesAlert\(counts\.sent, cap\)\) await raise\('mail_quota_70'/);
    expect(mail).toMatch(/if \(d\.reason === 'mail_cap' && kind !== 'alert'\) await raise\('mail_cap'/);
    // رسالة التنبيه نفسها تنبّه بالرابط وحده (لا حلقة)، ومن لا يمرر قناة يبقى على الرابط
    expect(mail).toContain("const via: MailAlert = kind === 'alert' || !alert ? alertWebhook : alert;");
    expect(mail).toMatch(/Deno\.env\.get\('LEADERS_ALERT_WEBHOOK'\)/);
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(core.match(/sendCounted\(db,[^\n]*alert: alertOps(, queued: true, flush: inFlush\(\)[^\n]*)? \}\)/g)?.length).toBe(2);   // sendMail والتفريغ الساعي
    // التفريغ الساعي يعيد رسالة في الطابور: حجبها بالحصة لا يُنشر في سلاك كل ساعة
    expect(core).toMatch(/sendCounted\(db, m\.to_email,[^\n]*alert: alertOps, queued: true, flush: inFlush\(\)[^\n]* \}\)/);
    // تفريغ المساء للطابور وحده: الإرسال المباشر لا يمرر flush
    expect(core.match(/flush: inFlush\(\)/g)?.length).toBe(1);
    expect(core.match(/sendCounted\([^\n]*flush/g)?.length).toBe(1);
    expect(read('supabase/functions/leaders-api/mail-center.ts')).toMatch(/force: true, alert: alertOps[^\n]* \}/);
  });
  it('تعذّر العداد لا يرفع السقف: الرموز والتنبيه وحدها تمر، وما سواها محجوب والجماعي للطابور، والمالك يُنبَّه', () => {
    expect(mail).not.toMatch(/لا عداد بعد|: Promise\.resolve\(\)/);
    expect(mail).toMatch(/await raise\('mail_counter_unavailable', \{ source, kind \}\)/);
    expect(mail).toMatch(/if \(!PRIORITY_KINDS\.has\(kind\)\) \{ await log\('blocked'\); if \(!queued\) report\('blocked', 'mail_counter_unavailable'\); return \{ ok: false, reason: 'mail_cap' \}; \}/);
    expect(read('supabase/functions/leaders-api/core.ts')).not.toMatch(/contactMailCount|الصيغة القديمة/);
  });
  it('حدود الشبكة تفشل مغلقة، ولا إعادة بلا عمود الشبكة', () => {
    for (const f of ['user-api/index.ts', 'send-otp/index.ts']) {
      const s = read(`supabase/functions/${f}`);
      expect(s, f).not.toMatch(/PGRST204|42703|قبله لا حد/);
      expect(s, f).toContain('تعذّر التحقق من حد الطلبات الآن');
    }
  });
  it('كل دالة ترسل بـ sendCounted بمصدرها، ولا تستدعي deliver مباشرة', () => {
    for (const [f, src] of [['leaders-api/core.ts', 'leaders-api'], ['user-api/index.ts', 'user-api'], ['admin-api/index.ts', 'admin-api'], ['send-otp/index.ts', 'send-otp']]) {
      const s = read(`supabase/functions/${f}`);
      expect(s, f).toMatch(new RegExp(`sendCounted\\([^)]*source: ['"]${src}['"]`, 's'));
      expect(s.replace(/deliverResult/g, ''), f).not.toMatch(/\bdeliver\(/);
    }
  });
  it('الرموز code، والتنبيه alert، والتذكيرات والملخصات bulk تدخل الطابور ولا تفشل', () => {
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(core).toMatch(/sendOrDiscard[\s\S]{0,200}kind: 'code'/);
    expect(core).toMatch(/alertMail\(kind, detail, windowMs\), \[\], \{ kind: 'alert' \}/);
    // المرفق الصغير (دعوة التقويم) يدخل الطابور مع رسالته (ترحيل 20261120100000)، والكبير لا يُخزَّن
    expect(core).toContain("if (queue && (kind === 'bulk' || kind === 'notify') && queueableAttachments(attachments) && await enqueueMail(");
    // كل تذكير (الأسبوعي والإدارة والمرشد والجهة) من المحرك الموحد في nudges.ts
    expect(read('supabase/functions/leaders-api/nudges.ts')).toMatch(/nudgeMail\([^)]*\), \[\], \{ kind: 'bulk'/);
    expect(read('supabase/functions/leaders-api/coordinator.ts')).toMatch(/coordinatorWeeklyMail\([^)]*\), \[\], \{ kind: 'bulk'/);
    expect(read('supabase/functions/leaders-api/tracking.ts')).toMatch(/\{ kind: 'bulk', ref: `participant:/);
    expect(read('supabase/functions/admin-api/index.ts')).toMatch(/otpHtml\(code\), "code"\)/);
  });
  it('المهمة الساعية تفرغ الطابور بعد سر المجدول وقبل ما يولّده المسح من بريد، وتكتب العلامة بعد نجاح الإرسال وحده', () => {
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toMatch(/'cron\.expert-offers': async \(b\) => \{\s*if \(!secretEquals\(b\.secret, CONFIG\.cronSecret\)\) throw[\s\S]*await drainMailQueue\(40, hold, rewrite\)[\s\S]*await E\.sweepOffers\(b\)[\s\S]*await Y\.payReminders\(\)[\s\S]*await FB\.sweep\(\)/);
    const core = read('supabase/functions/leaders-api/core.ts');
    // المطالبة بالرسالة قبل الإرسال (sent_at بشرط الانتظار)، وتعذّر الإرسال يعيدها إلى الانتظار
    expect(core).toMatch(/update\(\{ sent_at: new Date\(\)\.toISOString\(\) \}\)\.eq\('id', id\)\.is\('sent_at', null\)\.is\('gave_up_at', null\)/);
    expect(core).toMatch(/if \(!\(await claimQueued\(m\.id\)\)\) continue;[\s\S]*sendCounted\(db, m\.to_email/);
    expect(core).toMatch(/if \(r\.reason === 'mail_cap' \|\| r\.reason === 'mail_share'\) \{ await releaseQueued\(m\.id\); break; \}/);
  });
  it('دعوة المقيّم تحمل معرّفه فتُحسب نسب الاستجابة، ولا عنوان كامل في السجل', () => {
    expect(read('supabase/functions/leaders-api/impact.ts')).toMatch(/\{ ref: `rater:\$\{saved\.id\}` \}/);
    expect(read('supabase/migrations/20261107120000_leaders_mail_events.sql')).not.toMatch(/\bto_email\b[^\n]*mail_events|mail_events[^;]*\bemail text/);
  });
});

describe('ترحيل 20261107120000_leaders_mail_events', () => {
  const SQL = read('supabase/migrations/20261107120000_leaders_mail_events.sql');
  it('حاجب بعد تطبيقه، والجدولان لدور الخدمة وحده، وعمود الشبكة لرموز المصفوفة', async () => {
    expect(gateOf(SQL, '20261107120000_leaders_mail_events').gate).toBe('blocking');   // مطبّق على الإنتاج: الوسم في ملفه منتهٍ ولا يُمس الملف
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table public.email_otps (id serial primary key, email text, otp_code text, created_at timestamptz default now());
      grant all on all tables in schema leaders to anon, authenticated; alter default privileges in schema leaders grant all on tables to anon, authenticated;`);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows: [r] } = await db.query(`select has_table_privilege('anon', 'leaders.mail_events', 'select') a, has_table_privilege('authenticated', 'leaders.mail_queue', 'insert') q,
      (select relrowsecurity from pg_class where oid = 'leaders.mail_events'::regclass) rls,
      exists (select 1 from information_schema.columns where table_name = 'email_otps' and column_name = 'ip') ip`);
    expect(r).toEqual({ a: false, q: false, rls: true, ip: true });
    await expect(db.exec("insert into leaders.mail_events (kind, source, status) values ('spam', 'x', 'sent')")).rejects.toThrow();
  });
});

describe('تهريب القيم في القوالب', () => {
  // bdi() ترمّز بـesc() ثم تعزل الاتجاه (P1-13)، فهي ترميز مثلها
  it('أسماء المشاركين والرعاة والجهات والدفعات والخبراء تمر بـ esc أو bdi في متن الرسائل', () => {
    const bad = [];
    for (const f of ['advisor', 'sponsor', 'peer', 'experts']) {
      const s = read(`supabase/functions/leaders-api/${f}.ts`);
      for (const m of s.matchAll(/mail(?:Text|Note)\(`([^`]*)`/g)) {
        for (const v of m[1].matchAll(/\$\{([^}]+)\}/g)) if (/full_name|typed|org\.name|cohort\.name|p\.email|\bwhat\b/.test(v[1]) && !/^(esc|bdi)\(/.test(v[1].trim())) bad.push(`${f}: ${v[1]}`);
      }
    }
    expect(bad).toEqual([]);
    expect(read('supabase/functions/leaders-api/sponsor.ts')).toContain('`: ${bdi(reason)}`');
  });
});

describe('مصفوفة التأثير (D14 وD15)', () => {
  const app = read('src/App.jsx');
  const api = read('supabase/functions/user-api/index.ts');
  it('لا استدعاء لـ Lambda ولا عنوانها في الشيفرة ولا في CSP، والإشعار من الخادم عند أول تقديم بلا جوال', () => {
    expect(app).not.toMatch(/API_URL|\/notify/);
    expect(read('src/config/constants.js')).not.toMatch(/amazonaws|API_URL/);
    expect(read('public/_headers')).not.toMatch(/amazonaws/);
    expect(api).toMatch(/if \(updates\.submitted === true && before\?\.\[0\] && !before\[0\]\.submitted\)/);
    const notify = api.slice(api.indexOf('async function notifyPlanSubmitted'), api.indexOf('async function notifyPlanSubmitted') + 900);
    expect(notify).toMatch(/\["الاسم", reg\.name\], \["البريد", reg\.email, true\]/);
    expect(notify).not.toMatch(/phone/);
    expect(app).toContain('ويُخطَر المستشار باسمك وبريدك');
  });
  it('register-send وresume-send بحد شبكة وتحقق بشري قبل أي إرسال، وبنصيب خُمس السقف', () => {
    for (const a of ['register-send', 'resume-send']) {
      const body = api.slice(api.indexOf(`action === "${a}"`), api.indexOf(`action === "${a}"`) + 1500);
      expect(body, a).toMatch(/const blocked = await networkLimit\(sb, ip\) \|\| await humanCheck\(body, ip\);\n\s+if \(blocked\) return blocked;/);
      expect(body.indexOf('humanCheck'), a).toBeLessThan(body.indexOf('issueOtp'));
    }
    expect(api).toMatch(/sourceShare: USER_MAIL_SHARE/);
    expect(api).toMatch(/const USER_MAIL_SHARE = 0\.2;/);
    expect(api).toMatch(/code: "captcha_unconfigured"/);
  });
  it('الواجهة تعرض التحدي حين يطلبه الخادم وتعيد الطلب برمزه، وCSP يسمح بـ Turnstile', () => {
    expect(app).toMatch(/if \(res\?\.code !== "captcha" \|\| !res\.site_key\) return res;/);
    expect((app.match(/withHuman\(\(c\) => UserAPI\.(registerSend|resumeSend)\(/g) || []).length).toBe(4);
    expect(read('src/lib/api.js')).toMatch(/registerSend: \(name, phone, email, captcha\)/);
    const csp = read('public/_headers');
    expect(csp).toMatch(/script-src 'self' https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
    expect(read('src/components/Captcha.jsx')).toContain("turnstile/v0/api.js?render=explicit");
  });
});
