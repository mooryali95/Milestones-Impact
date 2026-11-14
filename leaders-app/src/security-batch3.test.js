// دفعة الأمان الثالثة (تدقيق 2026-11-14): رمز الرابط خارج العنوان (F7)، وسقف دعوات المقيّمين (N5)،
// والعامل الثاني لفتح السير والإجابات (N10)، وجلسة حساب «مفتاح المرور وحده» (N12)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { linkToken } from './link-token.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

describe('F7: رمز الرابط يُزال من العنوان', () => {
  it('يُقرأ مرة، ويُزال من العنوان مع بقاء بقية المعاملات، ويبقى للتبويب عند إعادة التحميل', () => {
    const store = mem();
    const calls = [];
    const hist = { replaceState: (_s, _t, url) => calls.push(url) };
    expect(linkToken({ search: '?t=abc123&x=1', pathname: '/rate', hash: '' }, hist, store)).toBe('abc123');
    expect(calls).toEqual(['/rate?x=1']);
    // إعادة التحميل: العنوان بلا رمز، والرمز من التبويب
    expect(linkToken({ search: '?x=1', pathname: '/rate', hash: '' }, hist, store)).toBe('abc123');
    expect(calls.length).toBe(1);
    // مسار آخر لا يرى رمز غيره
    expect(linkToken({ search: '', pathname: '/sponsor', hash: '' }, hist, store)).toBe('');
  });
  it('التخزين المعطّل لا يكسر الشاشة', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(linkToken({ search: '?t=zz', pathname: '/offer', hash: '' }, { replaceState: () => {} }, broken)).toBe('zz');
    expect(linkToken({ search: '', pathname: '/offer', hash: '' }, { replaceState: () => {} }, broken)).toBe('');
  });
  it('الشاشات الأربع تقرأ الرمز بالدالة لا من العنوان مباشرة', () => {
    for (const f of ['Rater', 'Sponsor', 'Outcome', 'ExpertOffer']) {
      const s = read(`leaders-app/src/screens/${f}.jsx`);
      expect(s, f).toContain('useState(() => linkToken())');
      expect(s, f).not.toMatch(/URLSearchParams\(location\.search\)\.get\('t'\)/);
    }
  });
});

describe('حراس الخادم', () => {
  const admin = read('supabase/functions/leaders-api/admin.ts');
  const body = (s, name) => { const i = s.indexOf(`export async function ${name}(`); return s.slice(i, s.indexOf('\n}\n', i)); };
  it('N5: دعوات المقيّمين لها سقف يومي يشمل الملغاة، قبل أي إرسال', () => {
    const b = body(read('supabase/functions/leaders-api/impact.ts'), 'invite');
    expect(b).toContain(".eq('action', 'rater.invite')");
    expect(b).toContain('RATER_INVITES_PER_DAY');
    expect(b.indexOf('RATER_INVITES_PER_DAY')).toBeLessThan(b.indexOf('sendMail('));
    expect(b.indexOf('RATER_INVITES_PER_DAY')).toBeLessThan(b.indexOf('notifyConfirmers('));
  });
  it('N10: السير الذاتية وإجابات القياس تحتاج العامل الثاني', () => {
    for (const fn of ['evidenceUrl', 'assessmentAnswers']) expect(body(admin, fn), fn).toContain('requireWrite(a)');
  });
  it('N12: حساب «مفتاح المرور وحده» لا تُقبل له إلا جلسة مفتاح مرور', () => {
    expect(admin).toContain("live.passkey_only && s.meta?.method !== 'passkey'");
  });
});

describe('N6: مفاتيح الرؤية تُطبَّق في الأفعال المجاورة أيضًا', () => {
  const fn = (f) => read(`supabase/functions/leaders-api/${f}`);
  it('وثيقة المبادرة عند مسؤول الجهة خلف مفتاح coord_initiatives', () => {
    expect(fn('index.ts')).toMatch(/'coord\.capstone': async \(c, b\) => \{ VS\.requireVisible\(await VS\.visibilityOfOrg\(c\.organization_id\), 'coord_initiatives'\);/);
  });
  it('التقييم الختامي عند المستشار بلا مفتاح التحرير: الدرجة والقرار وحدهما', () => {
    const f = fn('file.ts');
    const b = f.slice(f.indexOf('export async function finalGet'), f.indexOf('\n}\n', f.indexOf('export async function finalGet')));
    expect(b).toContain('adv_final_edit !== false');
    expect(b).toContain('approval: null, vote_block: null, can_withdraw: false');
    expect(b).not.toMatch(/votes: r\.record|adjust: r\.record/);
  });
  it('قائمة مشاركي الخبير المسند ولوحته: المستوى والمؤشر ووسائل التواصل بمفاتيحها', () => {
    const f = fn('file.ts');
    expect(f).toContain('vis && vis.asg_levels === false ? null : overallLevel(');
    expect(f).toContain('vis && vis.asg_continuous === false ? null : st.continuous?.index ?? null');
    const e = fn('experts.ts');
    expect(e).toContain("vis.asg_contact === false ? null : x.participants?.email");
    expect(e).toContain("vis.asg_contact === false ? null : x.participants?.phone");
    expect(e).toContain("x.dimension && vis.asg_levels !== false");
  });
});

describe('N15: تقييم 360 لا يقبل تقديرًا بعد إغلاق دورته', () => {
  it('الإرسال يتحقق من أن الدورة مفتوحة قبل قراءة الإجابات', () => {
    const s = read('supabase/functions/leaders-api/impact.ts');
    const b = s.slice(s.indexOf('export async function raterSubmit'), s.indexOf('\n}\n', s.indexOf('export async function raterSubmit')));
    expect(b).toContain("cyc.status !== 'open'");
    expect(b.indexOf("cyc.status !== 'open'")).toBeLessThan(b.indexOf('raterQuestions('));
  });
});

describe('N11: تبديل الدور لا يمدّد السقف المطلق', () => {
  const sw = read('supabase/functions/leaders-api/switch.ts');
  it('الجلسة الجديدة ترث لحظة الدخول، وتنتهي عند سقفها، وجلسة تجاوزته لا تُبدَّل', () => {
    expect(sw).toContain("select('created_at').eq('id', sessionId)");
    expect(sw).toContain("issueSession(p.id, 'switch', { ip: ctx.ip, ua: ctx.ua ?? null } as any, bornAt)");
    expect(sw.match(/created_at: bornAt/g)?.length).toBe(2);
    expect(sw).toContain('expires_at: until(14)');
    expect(sw).toContain('if (hardEnd <= Date.now()) throw new Fail(');
    const p = read('supabase/functions/leaders-api/participant.ts');
    expect(p).toContain("...(bornAt ? { created_at: bornAt } : {})");
    expect(p).toContain('Math.min(Date.now() + CONFIG.sessionDays * 864e5, hardEnd)');
  });
  it('الأبواب الثلاثة تمرر جلستها وعنوان الشبكة', () => {
    const i = read('supabase/functions/leaders-api/index.ts');
    expect(i).toContain("'me.switch': (p, b, sid, ctx) => switchTo(p.email, 'participant', b.to, ctx, sid)");
    expect(i).toMatch(/'xp\.switch': \(e, b, sid, ctx\) => switchTo\(e\.email, 'expert', b\.to, \{ ip: ctx\?\.ip \?\? null, ua: ctx\?\.ua \?\? null \}, sid\)/);
    expect(i).toMatch(/'coord\.switch': \(c, b, sid, ctx\) => switchTo\(c\.email, 'org', b\.to, \{ ip: ctx\?\.ip \?\? null, ua: ctx\?\.ua \?\? null \}, sid\)/);
  });
});

describe('N17: سر المهمة الدورية يُقارن بزمن ثابت', () => {
  it('لا مقارنة مباشرة للسر في أي دالة', () => {
    for (const f of ['admin.ts', 'experts.ts', 'index.ts', 'system.ts', 'payments.ts']) {
      expect(read(`supabase/functions/leaders-api/${f}`), f).not.toMatch(/secret\s*!==\s*CONFIG\.cronSecret|CONFIG\.cronSecret\s*!==/);
    }
    expect(read('supabase/functions/leaders-api/admin.ts')).toContain('if (!secretEquals(b.secret, CONFIG.cronSecret))');
  });
});

describe('N8: قفل دخول الإدارة لكل شبكة، وسقف يومي لرموز البريد', () => {
  const a = read('supabase/functions/admin-api/index.ts');
  it('المحاولات الخاطئة تُسجَّل بعنوان شبكتها وتُحسب لها، وللبريد كله سقف أعلى', () => {
    expect(a).toContain('const MAX_FAILS_ALL = 20;');
    expect(a).toContain('fails().eq("ip", ip)');
    expect(a.match(/tooManyFails\(sb, \w+\)/g) || []).toEqual([]);
    expect(a.match(/from\("totp_attempts"\)\.insert\(\{[^}]*\}\)/g).every((x) => x.includes('ip:'))).toBe(true);
  });
  it('رمز الدخول ببريد واحد محدود في اليوم، والرد لا يكشف شيئًا', () => {
    const i = a.indexOf('if (action === "login-send")');
    const b = a.slice(i, a.indexOf('recovery-request', i));
    expect(b).toContain('OTP_PER_EMAIL_DAY');
    expect(b.indexOf('OTP_PER_EMAIL_DAY')).toBeLessThan(b.indexOf('await sendEmail('));
    expect(b).toMatch(/>= OTP_PER_EMAIL_DAY\) return json\(\{ success: true, message: SENT_MSG \}\)/);
  });
});

// تدقيق الجاهزية 14 نوفمبر (sec-authn-v-totp-enroll) ومراجعته المستقلة: جلسة رمز البريد عامل واحد، فلا تسجّل عاملًا ثانيًا لحساب
// له عامل، ولا تكتب ولا تدير المستخدمين؛ والحساب بلا عامل يسجّل أوله ويُبلَّغ المالكون؛ والتعطيل لا يُستعمل لإغراق البريد
describe('P1-02: جلسة رمز البريد لا ترتقي إلى عامل ثانٍ', () => {
  const a = read('supabase/functions/admin-api/index.ts');
  const totp = a.indexOf('TOTP self-management');
  const block = (from, to) => a.slice(a.indexOf(from), a.indexOf(to, a.indexOf(from)));
  it('الحراس قبل كتلة TOTP: حداثة دائمًا، ومن له مفتاح لا يسجّل TOTP إلا بجلسة مفتاح أو TOTP', () => {
    expect(a.indexOf('const fresh = ')).toBeLessThan(totp);
    expect(a.indexOf('const myPasskeys = ')).toBeLessThan(totp);
    expect(a).toContain('const SECOND_FACTOR = session.method === "passkey" || session.method === "totp";');
    const gate = block('const totpEnrollBlocked = ', 'const notifyAccountAndOwners = ');
    expect(gate).toMatch(/if \(!fresh\) return json\(STALE, 403\);/);
    expect(gate).toMatch(/if \(!SECOND_FACTOR && \(await myPasskeys\(\)\)\.length\) return json\(NEED_PASSKEY, 403\);/);
    expect(a).not.toContain('ownerResetWindow');
  });
  it('setup وreset يُحجزان قبل توليد السر، والتعطيل والإعادة على حساب بلا TOTP مرفوضان بلا بريد، والتأكيد مرة واحدة', () => {
    const b = a.slice(totp, a.indexOf('if (action === "confirm-totp")'));
    expect(b).toMatch(/if \(action !== "setup-totp" && !enabled\) return json\(\{ success: false, message: "TOTP غير مفعّل" \}\);/);
    expect(b.indexOf('totpEnrollBlocked()')).toBeLessThan(b.indexOf('const secret = genSecret()'));
    expect(b.indexOf('"TOTP غير مفعّل"')).toBeLessThan(b.indexOf('notifyAccountAndOwners('));
    const c = block('if (action === "confirm-totp")', 'await audit("confirm-totp")');
    expect(c).toContain('if (us?.[0]?.totp_enabled) return json({ success: false, message: "TOTP مفعّل بالفعل" });');
    expect(c.indexOf('NEED_PASSKEY')).toBeLessThan(c.indexOf('verifyTotp('));
    expect(c).toMatch(/\.in\("action", \["setup-totp", "reset-totp"\]\)/);
  });
  it('مفتاح المرور: من له مفتاح يضيف بجلسة مفتاح، ومن له TOTP يضيف أول مفتاح بجلسة TOTP، وأول مفتاح من غير جلسة مفتاح يبلغ المالكين', () => {
    const r = block('if (action === "passkey-register-options" || action === "passkey-register-verify")', 'if (action === "passkey-delete")');
    expect(r).toContain('if (existing.length && session.method !== "passkey") return json(NEED_PASSKEY, 403);');
    expect(r).toMatch(/if \(me\?\.\[0\]\?\.totp_enabled\) return json\(NEED_SECOND, 403\);/);
    expect(r).toMatch(/notifyAccountAndOwners\("أُضيف مفتاح مرور إلى حساب إدارة"/);
  });
  it('إدارة المستخدمين وكتابات admin-api بعامل ثانٍ وجلسة حديثة، والمالكون يُبلَّغون بالإضافة وتغيير الدور', () => {
    const u = block('if (action === "list-users" || action === "add-user" || action === "update-user")', 'if (action === "logout")');
    expect(u.indexOf('if (!SECOND_FACTOR) return json(NEED_SECOND, 403);')).toBeGreaterThan(u.indexOf('if (action === "list-users")'));
    expect(u.indexOf('if (!SECOND_FACTOR) return json(NEED_SECOND, 403);')).toBeLessThan(u.indexOf('if (action === "add-user")'));
    expect(u).toContain('if (!fresh) return json(STALE, 403);');
    expect(u).toMatch(/notifyAccountAndOwners\("أُضيف حساب إلى لوحة الإدارة"/);
    expect(u).toMatch(/if \(field === "role_id"\) await notifyAccountAndOwners\("تغيّر دور حساب إدارة"/);
    expect(a).toMatch(/WRITE_ACTIONS\.includes\(action\) && session\.method !== "passkey" && session\.method !== "totp"/);
  });
  it('إعادة الوصول تحذف مفاتيح الحساب القديمة بمعرّفه القانوني، وطلب الاستعادة يقبل صاحب المفتاح، والزر يظهر له', () => {
    const r = block('if (field === "reset_access")', 'return json({ success: true });');
    expect(r).toContain('const tid = String(t[0].id);');
    expect(r).toContain('await sb.from("admin_passkeys").delete().eq("admin_id", tid);');
    expect(r).toContain('await revokeSessions(sb, tid);');
    expect(r).toContain('await audit("reset-access", { targetId: tid });');
    expect(a).toMatch(/!\(user\.totp_enabled \|\| user\.passkey_only \|\| hasKey\)\) return reply;/);
    expect(read('admin-app/src/screens/Settings.jsx')).toContain('(u.totp_enabled || u.passkey_only || u.passkeys > 0)');
  });
});
