// حراس الحزمة 4 (D15 وD14): عداد واحد لكل بريد في الدوال الأربع بنصف محجوز لرموز الدخول، وطابور
// للجماعي، وتنبيه بقناة غير البريد، وتهريب كل القيم في القوالب، وإشعار المصفوفة من الخادم بدل Lambda.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { ALERT_AT, CODE_RESERVE, crossesAlert, domainOf, mailDecision, simulateCodes } from '../../supabase/functions/_shared/mail-budget.js';
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
  it('لا مرسل احتياطي من نطاق آخر، والرفض ينبّه عبر الرابط', () => {
    expect(mail).not.toMatch(/MAIL_FROM_FALLBACK|basserh\.com/);
    expect(mail).toMatch(/if \(!r\.ok && r\.rejected\) await alertWebhook\('mail_rejected'/);
    expect(mail).toMatch(/crossesAlert\(counts\.sent, cap\)\) await alertWebhook\('mail_quota_70'/);
    expect(mail).toMatch(/Deno\.env\.get\('LEADERS_ALERT_WEBHOOK'\)/);
  });
  it('تعذّر العداد لا يرفع السقف: الرموز والتنبيه وحدها تمر، وما سواها محجوب والجماعي للطابور، والمالك يُنبَّه', () => {
    expect(mail).not.toMatch(/لا عداد بعد|: Promise\.resolve\(\)/);
    expect(mail).toMatch(/await alertWebhook\('mail_counter_unavailable', \{ source, kind \}\)/);
    expect(mail).toMatch(/if \(!PRIORITY_KINDS\.has\(kind\)\) \{ await log\('blocked'\); return \{ ok: false, reason: 'mail_cap' \}; \}/);
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
    expect(core).toMatch(/alertMail\(kind, detail\), \[\], \{ kind: 'alert' \}/);
    expect(core).toContain("if ((kind === 'bulk' || kind === 'notify') && !attachments.length && await enqueueMail(");
    expect(read('supabase/functions/leaders-api/admin.ts')).toMatch(/reminderMail\(p\.full_name, open\), \[\], \{ kind: 'bulk'/);
    expect(read('supabase/functions/leaders-api/coordinator.ts')).toMatch(/coordinatorWeeklyMail\([^)]*\), \[\], \{ kind: 'bulk'/);
    expect(read('supabase/functions/leaders-api/tracking.ts')).toMatch(/\{ kind: 'bulk', ref: `participant:/);
    expect(read('supabase/functions/admin-api/index.ts')).toMatch(/otpHtml\(code\), "code"\)/);
  });
  it('المهمة الساعية تفرغ الطابور بعد سر المجدول، وتكتب العلامة بعد نجاح الإرسال وحده', () => {
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toMatch(/'cron\.expert-offers': async \(b\) => \(\{ \.\.\.\(await E\.sweepOffers\(b\)\)[\s\S]*mail_queue: await drainMailQueue\(\)/);
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(core).toMatch(/if \(r\.ok\) \{ await db\.from\('mail_queue'\)\.update\(\{ sent_at:/);
    expect(core).toMatch(/if \(r\.reason === 'mail_cap' \|\| r\.reason === 'mail_share'\) break;/);
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
  it('أسماء المشاركين والرعاة والجهات والدفعات والخبراء تمر بـ esc في متن الرسائل', () => {
    const bad = [];
    for (const f of ['advisor', 'sponsor', 'peer', 'experts']) {
      const s = read(`supabase/functions/leaders-api/${f}.ts`);
      for (const m of s.matchAll(/mail(?:Text|Note)\(`([^`]*)`/g)) {
        for (const v of m[1].matchAll(/\$\{([^}]+)\}/g)) if (/full_name|typed|org\.name|cohort\.name|p\.email|\bwhat\b/.test(v[1]) && !/^esc\(/.test(v[1].trim())) bad.push(`${f}: ${v[1]}`);
      }
    }
    expect(bad).toEqual([]);
    expect(read('supabase/functions/leaders-api/sponsor.ts')).toContain('`: ${esc(reason)}`');
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
