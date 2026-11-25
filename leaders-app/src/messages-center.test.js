// مركز الرسائل وتفضيلات البريد والإلغاء بنقرة (اعتمده المالك 2026-11-25)
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { categoriesFor, MAIL_AUDIENCES, MAIL_CATEGORIES, mailAudience, mutableFor, MUTABLE_MAIL_CATEGORIES } from '../../supabase/functions/leaders-api/labels.js';
import { cleanMuted, mailPlan, prefsUrl, unsubHeaders, unsubToken, unsubUrl, verifyUnsubToken, withPrefsFooter } from '../../supabase/functions/leaders-api/mail-prefs.js';
import { TABS, tabFromSearch } from './deeplink.js';

const root = join(__dirname, '../..');
const API = join(root, 'supabase/functions/leaders-api');
const PID = '0b6f2a52-6a3e-4c1e-9d55-1f1e2a3b4c5d';

// كل نداء sendMail( بنص وسائطه كاملًا (موازنة الأقواس بلا تحليل النصوص: كافٍ لمواضع الإرسال)
function calls(src) {
  const out = [];
  let i = src.indexOf('sendMail(');
  while (i >= 0) {
    let d = 0, j = i + 8;
    for (; j < src.length; j++) { if (src[j] === '(') d++; else if (src[j] === ')' && --d === 0) break; }
    out.push({ at: src.slice(0, i).split('\n').length, text: src.slice(i, j + 1) });
    i = src.indexOf('sendMail(', j);
  }
  return out;
}

describe('فئات البريد', () => {
  it('كل موضع إرسال في leaders-api يسمي فئة من MAIL_CATEGORIES، إلا الرموز والتنبيهات', () => {
    const missing = [];
    let n = 0;
    for (const f of readdirSync(API).filter((x) => x.endsWith('.ts') && !x.endsWith('_test.ts'))) {
      for (const c of calls(readFileSync(join(API, f), 'utf8'))) {
        if (/export async function sendMail|function sendMail/.test(c.text) || /^sendMail\(to: string/.test(c.text)) continue;
        if (/kind: '(code|alert)'/.test(c.text)) continue;
        n++;
        // الفئة نص صريح، أو اختيار بين نصين صريحين (team ? 'ops' : 'expert_work')، أو متغير يحمل نصوصًا صريحة في ملفه
        const m = c.text.match(/category(?:: ([^,}]+))?[,}]/);
        const v = String(m?.[1] || '').trim();
        const pick = v.match(/\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'$/);
        const names = pick ? [pick[1], pick[2]] : [...v.matchAll(/^'([a-z_]+)'$/g)].map((x) => x[1]);
        if (!m || (m[1] && !names.length && !/^\w+$/.test(m[1].trim())) || names.some((k) => !MAIL_CATEGORIES[k])) missing.push(`${f}:${c.at}`);
      }
    }
    expect(n).toBeGreaterThan(60);
    expect(missing).toEqual([]);
  });
  it('الضروري وبريد الفريق لا يُكتمان، والباقي يُكتم', () => {
    expect(MAIL_CATEGORIES.essential.locked).toBe(true);
    expect(MUTABLE_MAIL_CATEGORIES).toEqual(['journey', 'sessions', 'experts', 'reminders']);
    expect(cleanMuted(['essential', 'journey', 'expert_digest', 'journey', 'x'])).toEqual(['journey']);
  });
  it('لكل فئة جمهور، وبريد الفريق مفكوك: التشغيلي مقفل والملخصات وحدها تُكتم (قرار المالك 2026-11-25)', () => {
    expect(MAIL_CATEGORIES.staff).toBeUndefined();
    for (const [k, c] of Object.entries(MAIL_CATEGORIES)) expect(MAIL_AUDIENCES, k).toContain(c.audience);
    expect(mutableFor('expert')).toEqual(['expert_digest']);
    expect(mutableFor('coordinator')).toEqual(['coord_digest']);
    // الإدارة تضبط ملخصاتها من الإعدادات، والطرف الخارجي طلبه معاملي: لا كتم لهما
    expect(mutableFor('ops')).toEqual([]);
    expect(mutableFor('external')).toEqual([]);
    expect(mailAudience('expert_work')).toBe('expert');
    expect(categoriesFor('participant').map((c) => c.key)).toEqual(['essential', 'journey', 'sessions', 'experts', 'reminders']);
  });
  it('التصنيف في مواضعه: التشغيلي مقفل، والملخص قابل للكتم، والإدارة ops، والخارجي request', () => {
    const src = (f) => readFileSync(join(API, f), 'utf8');
    expect(src('peer.ts')).toMatch(/طلب توجيه[\s\S]{0,400}category: 'expert_work'/);
    expect(src('feedback360.ts')).toMatch(/FEEDBACK_MAIL\.list[\s\S]{0,300}category: 'expert_work'/);
    expect(src('feedback360.ts')).toMatch(/FEEDBACK_MAIL\.ready[\s\S]{0,300}category: 'expert_digest'/);
    expect(src('model-digest.ts')).toMatch(/category: g\.kind === 'team' \? 'ops' : 'expert_digest'/);
    expect(src('coordinator.ts')).toMatch(/الأسبوعي`[\s\S]{0,200}category: 'coord_digest'/);
    expect(src('digest.ts')).toMatch(/category: 'ops'/);
    expect(src('cohort-pulse.ts')).toMatch(/category: 'ops'/);
    expect(src('impact.ts')).toMatch(/raterMail\(name[\s\S]{0,200}category: 'request'/);
  });
  it('رمز الدخول والإيصال والأمان في الفئة الضرورية', () => {
    const src = (f) => readFileSync(join(API, f), 'utf8');
    expect(src('core.ts')).toMatch(/sendMail\(to, subject, html, \[\], \{ kind: 'code'/);
    expect(src('payments.ts')).toMatch(/'وصلنا دفعك'[\s\S]{0,200}category: 'essential'/);
    expect(src('passkeys.ts')).toMatch(/category: 'essential'/);
    expect(src('participant.ts')).toMatch(/'دخول جديد إلى حسابك'[\s\S]{0,200}category: 'essential'/);
  });
});

describe('قرار الإرسال والتسجيل', () => {
  it('الفئة القابلة للكتم تُسجَّل دائمًا، وتُرسل بترويسة ما لم تُكتم', () => {
    expect(mailPlan('journey', [])).toEqual({ notify: true, send: true, headers: true });
    expect(mailPlan('journey', ['journey'])).toEqual({ notify: true, send: false, headers: false });
    expect(mailPlan('essential', ['essential'])).toEqual({ notify: false, send: true, headers: false });
    expect(mailPlan('expert_work', [])).toEqual({ notify: false, send: true, headers: false });
    expect(mailPlan(null, [])).toEqual({ notify: false, send: true, headers: false });
  });
  it('notify مدخل واحد لمركز الرسائل: لا prepareParticipantMail ولا نسخة ثانية للخبير (المرحلة 2أ)', () => {
    const core = readFileSync(join(API, 'core.ts'), 'utf8');
    expect(core).not.toMatch(/prepareParticipantMail|prepareStaffMail/);
    expect(core).toMatch(/export async function notify\(n: NotifyInput\)/);
    expect((core.match(/from\('participant_notifications'\)\.insert/g) || []).length).toBe(2);
    // إشعار بلا بريد: mail: false يكتب الإشعار emailed=false ولا يرسل
    expect(core).toMatch(/const decided = mail \? mailPlan\(category, pref\.data\?\.muted \|\| \[\], audience\) : \{ notify: true, send: false, headers: false \}/);
  });
  it('sendMail يمر بتفضيلات المشارك لغير الرموز والتنبيهات، ويكتب الإشعار قبل قرار الإرسال', () => {
    const core = readFileSync(join(API, 'core.ts'), 'utf8');
    expect(core).toMatch(/if \(kind !== 'code' && kind !== 'alert'\) \{\s*const prep = await notify\(\{ to, subject, html, category, ref: noteRef \?\? ref, recipient, about, actionUntil \}\)/);
    expect(core).toMatch(/participant_notifications'\)\.insert\([\s\S]{0,300}emailed: decided\.send/);
    expect(core).toMatch(/if \(!decided\.send\) return \{ send: false/);
  });
});

describe('الإلغاء بنقرة', () => {
  it('الرمز يصح لصاحبه وفئته وحدهما', async () => {
    const t = await unsubToken('s3cret', PID, 'sessions');
    expect(await verifyUnsubToken('s3cret', t)).toEqual({ kind: 'participant', id: PID, participantId: PID, category: 'sessions' });
    expect(await verifyUnsubToken('other', t)).toBeNull();
    expect(await verifyUnsubToken('s3cret', t.replace('sessions', 'journey'))).toBeNull();
    expect(await verifyUnsubToken('s3cret', t.slice(0, -2) + 'xx')).toBeNull();
    expect(await verifyUnsubToken('s3cret', (await unsubToken('s3cret', PID, 'essential')))).toBeNull();
    expect(await verifyUnsubToken('s3cret', 'garbage')).toBeNull();
  });
  it('الرمز رباعي الأجزاء للخبير والمنسق: لجمهوره وفئته القابلة للكتم وحدهما، ولا يصلح رمز جمهور لآخر', async () => {
    const e = await unsubToken('s3cret', PID, 'expert_digest', 'expert');
    expect(e.split('.').slice(0, 3)).toEqual(['e', PID, 'expert_digest']);
    expect(await verifyUnsubToken('s3cret', e)).toEqual({ kind: 'expert', id: PID, category: 'expert_digest' });
    expect(await verifyUnsubToken('s3cret', e.replace(/^e\./, 'c.'))).toBeNull();
    expect(await verifyUnsubToken('s3cret', e.replace('expert_digest', 'coord_digest'))).toBeNull();
    expect(await verifyUnsubToken('s3cret', await unsubToken('s3cret', PID, 'expert_work', 'expert'))).toBeNull();
    const c = await unsubToken('s3cret', PID, 'coord_digest', 'coordinator');
    expect(await verifyUnsubToken('s3cret', c)).toEqual({ kind: 'coordinator', id: PID, category: 'coord_digest' });
    // رمز المشارك بفئة خبير لا يصح
    expect(await verifyUnsubToken('s3cret', await unsubToken('s3cret', PID, 'expert_digest'))).toBeNull();
    expect(prefsUrl('https://leaders.sunkvalue.com', 'expert_digest', 'expert')).toBe('https://leaders.sunkvalue.com/x?tab=messages&prefs=expert_digest');
    expect(prefsUrl('https://leaders.sunkvalue.com', 'coord_digest', 'coordinator')).toBe('https://leaders.sunkvalue.com/org?tab=messages&prefs=coord_digest');
    expect(mailPlan('expert_digest', [], 'expert')).toEqual({ notify: true, send: true, headers: true });
    expect(mailPlan('expert_digest', ['expert_digest'], 'expert')).toEqual({ notify: true, send: false, headers: false });
    // فئة جمهور آخر تمر كما هي: ملخص الخبير لا يكتمه تفضيل المشارك
    expect(mailPlan('expert_digest', ['expert_digest'])).toEqual({ notify: false, send: true, headers: false });
    expect(cleanMuted(['expert_digest', 'journey', 'expert_work'], 'expert')).toEqual(['expert_digest']);
  });
  it('نسخة بيانات المشارك بعمود participant_id وحده: صفوف صناديق الخبراء والمنسقين لا تخرج فيها', () => {
    const priv = readFileSync(join(API, 'privacy.ts'), 'utf8');
    expect(priv).toMatch(/Object\.keys\(EXPORT_TABLES\)[\s\S]{0,200}\.eq\('participant_id', p\.id\)/);
    const base = readFileSync(join(root, 'supabase/schema/baseline.sql'), 'utf8');
    expect(base).toMatch(/participant_notifications_about_participant_id_fkey FOREIGN KEY \(about_participant_id\) REFERENCES leaders\.participants\(id\) ON DELETE CASCADE/);
  });
  it('مواضع الملخصات تسمي مستلمها صراحةً، ولا بحث بالعنوان لغير المشارك', () => {
    const src = (f) => readFileSync(join(API, f), 'utf8');
    expect(src('feedback360.ts')).toMatch(/category: 'expert_digest'[\s\S]{0,120}recipient: \{ kind: 'expert', id: adv\.id \}/);
    expect(src('model-digest.ts')).toMatch(/recipient: g\.reviewer\?\.id \? \{ kind: 'expert', id: g\.reviewer\.id \}/);
    expect(src('coordinator.ts')).toMatch(/category: 'coord_digest'[\s\S]{0,120}recipient: \{ kind: 'coordinator', id: c\.id \}/);
    const core = src('core.ts');
    expect(core).toMatch(/async function notifyStaff[\s\S]{0,200}if \(!category \|\| !recipient \|\| recipient\.kind !== audience/);
  });
  it('ترويستا RFC 8058 ورابط التفضيلات في الذيل', async () => {
    const url = unsubUrl('https://api.example.test', 'a.b.c');
    expect(url).toBe('https://api.example.test/functions/v1/leaders-api?unsubscribe=a.b.c');
    expect(unsubHeaders(url, 'mi@sunkvalue.com')).toEqual({
      'List-Unsubscribe': `<${url}>, <mailto:mi@sunkvalue.com?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    const p = prefsUrl('https://leaders.sunkvalue.com', 'journey');
    expect(p).toBe('https://leaders.sunkvalue.com/?tab=messages&prefs=journey');
    const html = withPrefsFooter('<html><body><p>x</p></body></html>', p);
    expect(html).toMatch(/<p>x<\/p><table[^]*tab=messages&prefs=journey[^]*<\/table><\/body>/);
  });
  it('الدالة تخدم الرابط قبل فحص POST وJSON، وGET لا يكتم شيئًا', () => {
    const idx = readFileSync(join(API, 'index.ts'), 'utf8');
    expect(idx.indexOf("searchParams.get('unsubscribe')")).toBeLessThan(idx.indexOf("if (req.method !== 'POST')"));
    const core = readFileSync(join(API, 'core.ts'), 'utf8');
    expect(core).toMatch(/if \(req\.method !== 'POST'\) return new Response\(null, \{ status: 303/);
  });
});

describe('مركز الرسائل في التطبيق', () => {
  it('رابط البريد يفتح القسم ويبقي الفئة', () => {
    expect(TABS).toContain('messages');
    expect(tabFromSearch('?tab=messages&prefs=journey')).toEqual({ view: 'messages', search: '?prefs=journey' });
  });
  it('زر الترويسة والقسم والأفعال الثلاثة', () => {
    const app = readFileSync(join(__dirname, 'App.jsx'), 'utf8');
    expect(app).toMatch(/view === 'messages'\) screen = <Messages/);
    expect(app).toMatch(/className=\{`msgs-btn/);
    const idx = readFileSync(join(API, 'index.ts'), 'utf8');
    for (const a of ['me.messages', 'me.messages-read', 'me.mail-prefs']) expect(idx).toContain(`'${a}': (p, b) => MS.`);
  });
});

describe('تفضيلات الخبير والمنسق في /x و/org (المرحلة 1ج)', () => {
  const read = (f) => readFileSync(join(__dirname, f), 'utf8');
  it('مكوّن مشترك واحد لثلاثة جماهير، ولا نسخة ثانية من المركز', () => {
    expect(read('screens/Messages.jsx')).toMatch(/<MessageCenter call=\{call\} actions=\{ACTIONS\}/);
    expect(read('screens/ExpertPortal.jsx')).toMatch(/<MessageCenter call=\{xpCall\} actions=\{XP_MESSAGES\}/);
    expect(read('screens/OrgPortal.jsx')).toMatch(/<MessageCenter call=\{coordCall\} actions=\{COORD_PREFS\} inbox=\{false\}/);
    for (const f of ['screens/ExpertPortal.jsx', 'screens/OrgPortal.jsx']) expect(read(f)).toMatch(/get\('tab'\) === 'messages'/);
    expect(read('screens/MessageCenter.jsx')).not.toMatch(/'me\.messages'/);
  });
  it('إجراءات الخادم تأخذ صاحب المركز من الجلسة وحدها', () => {
    const idx = readFileSync(join(API, 'index.ts'), 'utf8');
    for (const a of ['xp.messages', 'xp.messages-read', 'xp.mail-prefs']) expect(idx).toMatch(new RegExp(`'${a.replace('.', '\\.')}': \\(e, b\\) => MS\\.[a-zA-Z]+\\(MS\\.expertOwner\\(e\\), b\\)`));
    expect(idx).toContain("'coord.mail-prefs': (c, b) => MS.prefs(MS.coordinatorOwner(c), b)");
  });
});

describe('صندوق الخبير في /x (المرحلة 2ب)', () => {
  const src = (f) => readFileSync(join(API, f), 'utf8');
  it('عمل الخبير المقفل يُسجَّل في صندوقه بلا ترويسة، والمنسق بلا صندوق الآن', () => {
    expect(mailPlan('expert_work', [], 'expert')).toEqual({ notify: true, send: true, headers: false });
    expect(mailPlan('expert_work', ['expert_work'], 'expert')).toEqual({ notify: true, send: true, headers: false });
    expect(mailPlan('coord_work', [], 'coordinator')).toEqual({ notify: false, send: true, headers: false });
  });
  it('مواضع عمل الخبير تسمي مستلمها، ومرجع البريد باقٍ لمحو طابور المحذوف', () => {
    expect(src('peer.ts')).toMatch(/ref: `participant:\$\{p\.id\}`, noteRef: `peer:\$\{row\.id\}`,[\s\S]{0,60}recipient: \{ kind: 'expert', id: adv\.id \}, about: p\.id/);
    expect(src('feedback360.ts')).toMatch(/ref: `participant:\$\{p\.id\}`, noteRef: `f360:\$\{c\.id\}`,[\s\S]{0,60}recipient: \{ kind: 'expert', id: adv\.id \}, about: p\.id/);
    expect(src('experts.ts')).toMatch(/noteRef: `offer:\$\{req\.id\}`,[\s\S]{0,60}recipient: \{ kind: 'expert', id: e\.id \}/);
    expect(src('team.ts')).toMatch(/recipient: \{ kind: 'expert', id: e\.id \}/);
    expect(src('activities.ts')).toMatch(/recipient: \{ kind: 'expert', id: s\.expert_id \}/);
    expect(src('coaching-groups.ts')).toMatch(/recipient: \{ kind: 'expert', id: e\.id \}/);
    expect(src('model-digest.ts')).toMatch(/recipient: \{ kind: 'expert' as const, id: adv\.id \}, about: p\.id/);
  });
  it('شارة غير المقروء من اللوحة وعند عودة التركيز، بلا Realtime', () => {
    const idx = src('index.ts');
    expect(idx).toMatch(/d\.messages_unread = await MS\.unreadCount\(MS\.expertOwner\(e\)\)/);
    const xp = readFileSync(join(__dirname, 'screens/ExpertPortal.jsx'), 'utf8');
    expect(xp).toMatch(/xpCall\('xp\.messages-unread'\)/);
    expect(xp).toMatch(/className="la-chip xp-msgs-count"/);
    expect(xp).not.toMatch(/supabase\.channel|realtime/i);
  });
});

describe('«ينتظرك» في صندوق الخبير (المرحلة 2ج)', () => {
  const src = (f) => readFileSync(join(API, f), 'utf8');
  it('ما ينتظر فعلًا يحمل مهلته، ويُغلق في موضع إنجازه بالمرجع نفسه', () => {
    expect(src('peer.ts')).toMatch(/noteRef: `peer:\$\{row\.id\}`, actionUntil: actionDeadline\(\)/);
    expect(src('peer.ts').match(/await resolveNotes\(`peer:\$\{r\.id\}`\)/g)).toHaveLength(2);
    expect(src('feedback360.ts')).toMatch(/noteRef: `f360:\$\{c\.id\}`, actionUntil: actionDeadline\(\)/);
    expect(src('feedback360.ts')).toMatch(/export async function advisorDecide[\s\S]{0,600}await resolveNotes\(`f360:\$\{c\.id\}`\)/);
    expect(src('experts.ts')).toMatch(/noteRef: `offer:\$\{req\.id\}`, actionUntil: expires\.toISOString\(\)/);
    expect(src('experts.ts')).toMatch(/async function offerNext\(req: any, pick\?: any\) \{[\s\S]{0,200}await resolveNotes\(`offer:\$\{req\.id\}`\)/);
    expect(src('experts.ts')).toMatch(/'expert-request\.accepted'[\s\S]{0,120}await resolveNotes\(`offer:\$\{r\.id\}`\)/);
    expect(src('model-digest.ts')).toMatch(/noteRef: `model:\$\{p\.id\}:\$\{modelId\}`/);
    // الإغلاق في reviewSubmissionBy المشتركة، فتغلقه مراجعة المستشار ومراجعة الإدارة معًا
    expect(src('admin.ts')).toMatch(/export async function reviewSubmissionBy[\s\S]*?await resolveNotes\(`model:\$\{s\.participant_id\}:\$\{s\.model_id\}`\)[\s\S]*?\n}/);
    expect(src('advisor.ts')).toMatch(/reviewSubmissionBy\(e\.email/);
  });
  it('الواجهة: قسم «ينتظرك» بما لم يُغلق، الأقرب مهلةً أولًا، و«أُنجز» على المغلق', () => {
    const mc = readFileSync(join(__dirname, 'screens/MessageCenter.jsx'), 'utf8');
    expect(mc).toMatch(/filter\(\(i\) => i\.action_until && !i\.resolved_at\)/);
    expect(mc).toMatch(/m\.resolved_at \? ` · \$\{T\.resolved\}`/);
  });
});
