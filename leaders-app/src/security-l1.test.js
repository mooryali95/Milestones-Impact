// المرحلة ل1 (الصلابة الأمنية): حراس الدخول والملفات الخاصة كما تُختبر منطقًا خالصًا (guards.js)،
// وحراس المصدر التي تمنع رجوع الثغرات السبع (خارطة الطريق §3ب، الملحقان 1 و4، والملحق 7 R14).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_CODE_ATTEMPTS, PASS_MINUTES, passOk, privateFile, reserveAttempt, signPass } from '../../supabase/functions/leaders-api/guards.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 4));

// صف تحدٍّ وهمي ذري: cas تنجح فقط إن كانت القيمة ما زالت n، كما يفعل UPDATE ... WHERE attempts = n تحت قفل الصف
function challenge(start = 0) {
  const row = { attempts: start, consumed: false };
  const store = {
    cas: async (n) => { await tick(); if (row.consumed || row.attempts !== n) return false; row.attempts = n + 1; return true; },
    read: async () => { await tick(); return { ...row }; },
  };
  return { row, store };
}

describe('محاولات الرمز ذرية في البوابات الثلاث (M2)', () => {
  it('عشرون طلبًا متزامنًا قرأت كلها 0: يُحجز خمس فقط، ويتوقف العداد عند خمس', async () => {
    const { row, store } = challenge();
    const r = await Promise.all(Array.from({ length: 20 }, () => reserveAttempt(store, 0)));
    expect(r.filter((x) => x.ok)).toHaveLength(MAX_CODE_ATTEMPTS);
    expect(r.filter((x) => !x.ok).every((x) => x.reason === 'attempts')).toBe(true);
    expect(row.attempts).toBe(MAX_CODE_ATTEMPTS);
  });
  it('النمط القديم (قراءة ثم كتابة) كان يمرر العشرين كلها: هذا ما يغلقه الحجز', async () => {
    const row = { attempts: 0 };
    const naive = async (seen) => { await tick(); if (seen >= 5) return false; row.attempts = seen + 1; return true; };
    const r = await Promise.all(Array.from({ length: 20 }, () => naive(0)));
    expect(r.filter(Boolean).length).toBe(20);
  });
  it('بعد خمس متتابعة تُرفض السادسة دون أن يمس العداد', async () => {
    const { row, store } = challenge(5);
    expect(await reserveAttempt(store, 5)).toEqual({ ok: false, reason: 'attempts' });
    expect(row.attempts).toBe(5);
  });
  it('التحدي المستهلك في طلب موازٍ لا يُحجز له شيء', async () => {
    const { row, store } = challenge(1);
    row.consumed = true;
    expect(await reserveAttempt(store, 1)).toEqual({ ok: false, reason: 'gone' });
  });
});

describe('تصريح التحقق البشري لخطوة الاسم (M1)', () => {
  const key = 'pepper-for-tests';
  it('صالح لبريده خلال ربع ساعة، ولا يصلح لبريد آخر', async () => {
    const now = Date.now();
    const pass = await signPass(key, 'sara@x.sa', now);
    expect(pass).toMatch(/^\d{13}\.[0-9a-f]{64}$/);
    expect(await passOk(key, pass, 'sara@x.sa', now + 60e3)).toBe(true);
    expect(await passOk(key, pass, 'other@x.sa', now + 60e3)).toBe(false);
  });
  it('يُرفض بعد انتهائه، وبمفتاح آخر، وبعد العبث به، وبصيغة غريبة', async () => {
    const now = Date.now();
    const pass = await signPass(key, 'sara@x.sa', now);
    expect(await passOk(key, pass, 'sara@x.sa', now + PASS_MINUTES * 60e3 + 1)).toBe(false);
    expect(await passOk('another-key', pass, 'sara@x.sa', now)).toBe(false);
    const [exp, sig] = pass.split('.');
    expect(await passOk(key, `${Number(exp) + 60e3}.${sig}`, 'sara@x.sa', now)).toBe(false);
    expect(await passOk(key, `${exp}.${sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`, 'sara@x.sa', now)).toBe(false);
    for (const bad of ['', 'x', null, 42, `${exp}.${sig}.x`, 'a'.repeat(200)]) expect(await passOk(key, bad, 'sara@x.sa', now)).toBe(false);
    expect(await passOk('', pass, 'sara@x.sa', now)).toBe(false);
  });
  it('لا يُقبل تصريح تمتد صلاحيته أبعد من ربع ساعة (لا يُصنع تصريح طويل الأجل)', async () => {
    const now = Date.now();
    const far = await signPass(key, 'sara@x.sa', now + 3600e3);
    expect(await passOk(key, far, 'sara@x.sa', now)).toBe(false);
  });
});

describe('الملفات الخاصة: مسار المشارك المطلوب وحده (R7)', () => {
  const pid = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
  const other = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const file = '11111111-2222-4333-8444-555555555555';
  it('يقبل السيرة والدليل على شكل مسارات الرفع', () => {
    expect(privateFile(`${pid}/cv/${file}.pdf`, pid)).toEqual({ path: `${pid}/cv/${file}.pdf`, participantId: pid, kind: 'cv' });
    expect(privateFile(`${pid}/evidence/${file}.jpeg`, pid)?.kind).toBe('evidence');
  });
  it('يرفض ملف مشارك آخر، والتسلق بين المجلدات، والمجلدات الأخرى، والامتدادات غير المرفوعة', () => {
    for (const bad of [
      `${other}/cv/${file}.pdf`,
      `${pid}/../${other}/cv/${file}.pdf`,
      `${pid}/cv/../../${other}/cv/${file}.pdf`,
      `${pid}/capstone/${file}.pdf`,
      `${pid}/cv/${file}.exe`,
      `${pid}/cv/${file}.pdf/x`,
      `/${pid}/cv/${file}.pdf`,
      `${pid}/cv/notes.pdf`,
      '',
    ]) expect(privateFile(bad, pid), bad).toBeNull();
    expect(privateFile(`${pid}/cv/${file}.pdf`, ''), 'بلا معرّف مشارك').toBeNull();
  });
  it('الامتدادات المقبولة هي نفسها التي يقبلها الرفع (مصدر واحد للشكل)', () => {
    const upload = read('supabase/functions/leaders-api/participant.ts');
    expect(upload).toMatch(/\['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg'\]\.includes\(ext\)/);
    expect(upload).toContain('`${p.id}/${purpose}/${crypto.randomUUID()}.${ext}`');
  });
});

describe('حراس المصدر: لا ترجع ثغرات ل1', () => {
  const core = read('supabase/functions/leaders-api/core.ts');
  const index = read('supabase/functions/leaders-api/index.ts');
  it('التحقق البشري يفشل مغلقًا في leaders-api ونموذج التواصل، ويُبلَّغ المالك (H2)', () => {
    expect(core).toMatch(/if \(!CONFIG\.turnstileSecret \|\| !CONFIG\.turnstileSite\)[\s\S]{0,300}503, 'captcha_unconfigured'/);
    expect(core).not.toMatch(/if \(CONFIG\.turnstileSecret &&/);
    const otp = read('supabase/functions/send-otp/index.ts');
    expect(otp).toMatch(/if \(!TURNSTILE_SECRET \|\| !TURNSTILE_SITE\)[\s\S]{0,300}captcha_unconfigured/);
    expect(otp).not.toMatch(/if \(TURNSTILE_SECRET &&/);
    expect(index).toMatch(/'captcha_unconfigured', 'audit_failed'\]\.includes\(e\.code\)/);
  });
  it('needs_name بعد حدود الشبكة والتحقق البشري، لا قبلهما (M1)', () => {
    const p = read('supabase/functions/leaders-api/participant.ts');
    const at = (s) => { const i = p.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    expect(at('await networkGuard(ctx);')).toBeLessThan(at('needs_name: true'));
    expect(at('await humanGate(b, ctx, email);')).toBeLessThan(at("const { data: existing } = await db.from('participants')"));
    expect(p).toContain("needs_name: true, pass: await issuePass(email)");
  });
  it('البوابات الثلاث تحجز المحاولة ذريًا ولا تكتب attempts + 1 بعد القراءة (M2)', () => {
    for (const [file, table] of [['participant', 'email_challenges'], ['coordinator', 'coordinator_challenges'], ['experts', 'expert_challenges']]) {
      const src = read(`supabase/functions/leaders-api/${file}.ts`);
      expect(src, file).toContain(`await reserveCodeAttempt('${table}', ch);`);
      expect(src, file).not.toMatch(/attempts: ch\.attempts \+ 1/);
    }
    expect(core).toMatch(/\.eq\('attempts', n\)\.is\('consumed_at', null\)/);
  });
  it('حد التسجيل لكل شبكة من متغير بيئة موثّق (لا 60 ثابتة)', () => {
    expect(core).toContain("registerPerIpDay: Number(env('LEADERS_REGISTER_PER_IP_DAY', '60')) || 60");
    expect(core).not.toMatch(/REGISTER_PER_IP_DAY = 60/);
    expect(read('docs/SECRETS.md')).toContain('`LEADERS_REGISTER_PER_IP_DAY`');
  });
  it('audit() يُفشل العملية إن تعذّر الأثر، وما يعدّه ثانويًا يلتقطه صراحةً (R6)', () => {
    expect(core).toMatch(/const \{ error \} = await db\.from\('audit_log'\)\.insert\([\s\S]{0,300}throw new Fail\([^)]*500, 'audit_failed'/);
    expect(core).toMatch(/await audit\('system', 'alert'[^;]*\.catch\(/);
    expect(read('supabase/functions/leaders-api/participant.ts')).toMatch(/'points\.award-failed'[^;]*\.catch\(\(\) => \{\}\)/);
  });
  it('الملفات الخاصة: للمدير، بمسار المشارك، ويُسجَّل كل فتح؛ ولا توقيع مسبق للسيرة (R7)', () => {
    const admin = read('supabase/functions/leaders-api/admin.ts');
    expect(index).toContain("'admin.evidence-url': (a, b) => A.evidenceUrl(a, b),");
    expect(admin).toMatch(/export async function evidenceUrl\(a: Admin, b: Body\) \{\s*if \(!canWrite\(a\)\) throw/);
    expect(admin).toContain('privateFile(b.path, pid)');
    expect(admin).toMatch(/await audit\('admin', a\.email, 'admin\.file-open', 'participants', pid/);
    expect(admin).not.toMatch(/createSignedUrl\(p\.cv_path/);
    for (const f of ['admin-app/src/screens/Participants.jsx', 'admin-app/src/screens/ReqQueue.jsx']) {
      expect(read(f), f).toMatch(/L\('admin\.evidence-url', \{ participant_id: /);
    }
  });
  it('التطبيقان لا يُفهرسان: robots.txt وX-Robots-Tag في المصدر وفي البناء (R14)', () => {
    const leadersRobots = read('leaders-app/public/robots.txt');
    expect(leadersRobots).toMatch(/^User-agent: \*\nDisallow:\n?$/m);
    expect(leadersRobots).not.toMatch(/^Disallow: \/$/m);   // الزحف مسموح ليرى المحرك noindex
    expect(read('admin-app/public/robots.txt')).toMatch(/^User-agent: \*\nDisallow: \/$/m);
    for (const app of ['leaders-app', 'admin-app']) expect(read(`${app}/public/_headers`), app).toMatch(/^\/\*\n {2}X-Robots-Tag: noindex, nofollow$/m);
    for (const out of ['leaders', 'admin']) {
      expect(existsSync(join(root, out, 'robots.txt')), out).toBe(true);
      expect(read(`${out}/_headers`), out).toContain('X-Robots-Tag: noindex, nofollow');
    }
  });
  it('بوابة النشر ترفض نشر الدوال بلا أسرار الدخول، والمسار الذهبي يمر بالتحقق البشري الوهمي', () => {
    const ci = read('.github/workflows/ci.yml');
    const gate = ci.indexOf('node scripts/ops/function-secrets.mjs --require=signin');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(ci.indexOf('- name: Deploy edge functions'));
    expect(read('scripts/ops/function-secrets.mjs')).toMatch(/signin: \['LEADERS_TOKEN_PEPPER', 'RESEND_API_KEY', 'LEADERS_TURNSTILE_SECRET', 'LEADERS_TURNSTILE_SITE_KEY'\]/);
    const env = read('supabase/functions/ci.env');
    expect(env).toContain('LEADERS_TURNSTILE_SECRET=1x0000000000000000000000000000000AA');
    expect(env).toContain('LEADERS_TURNSTILE_SITE_KEY=1x00000000000000000000AA');
    const golden = read('scripts/integration/golden.mjs');
    expect(golden).toContain("const HUMAN = 'XXXX.DUMMY.TOKEN.XXXX';");
    expect(golden).toMatch(/judged === 5 && refused === 15 && tries === 5/);
  });
  it('الواجهات الثلاث تعرض أداة التحقق، والتسجيل يحمل التصريح إلى خطوة الاسم', () => {
    for (const f of ['SignIn', 'OrgPortal', 'ExpertPortal']) expect(read(`leaders-app/src/screens/${f}.jsx`), f).toMatch(/<Captcha siteKey=\{captchaKey\}/);
    const signin = read('leaders-app/src/screens/SignIn.jsx');
    expect(signin).toContain("...(asNew && pass ? { pass } : {})");
    expect(signin).toContain("setPass(res.pass || '')");
  });
});
