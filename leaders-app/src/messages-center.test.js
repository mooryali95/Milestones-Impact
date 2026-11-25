// مركز الرسائل وتفضيلات البريد والإلغاء بنقرة (اعتمده المالك 2026-11-25)
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAIL_CATEGORIES, MUTABLE_MAIL_CATEGORIES } from '../../supabase/functions/leaders-api/labels.js';
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
        const m = c.text.match(/category: '([a-z]+)'/);
        if (!m || !MAIL_CATEGORIES[m[1]]) missing.push(`${f}:${c.at}`);
      }
    }
    expect(n).toBeGreaterThan(60);
    expect(missing).toEqual([]);
  });
  it('الضروري وبريد الفريق لا يُكتمان، والباقي يُكتم', () => {
    expect(MAIL_CATEGORIES.essential.locked).toBe(true);
    expect(MUTABLE_MAIL_CATEGORIES).toEqual(['journey', 'sessions', 'experts', 'reminders']);
    expect(cleanMuted(['essential', 'journey', 'staff', 'journey', 'x'])).toEqual(['journey']);
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
    expect(mailPlan('staff', [])).toEqual({ notify: false, send: true, headers: false });
    expect(mailPlan(null, [])).toEqual({ notify: false, send: true, headers: false });
  });
  it('sendMail يمر بتفضيلات المشارك لغير الرموز والتنبيهات، ويكتب الإشعار قبل قرار الإرسال', () => {
    const core = readFileSync(join(API, 'core.ts'), 'utf8');
    expect(core).toMatch(/if \(kind !== 'code' && kind !== 'alert'\) \{\s*const prep = await prepareParticipantMail/);
    expect(core).toMatch(/participant_notifications'\)\.insert\([\s\S]{0,300}emailed: decided\.send/);
    expect(core).toMatch(/if \(!decided\.send\) return \{ send: false/);
  });
});

describe('الإلغاء بنقرة', () => {
  it('الرمز يصح لصاحبه وفئته وحدهما', async () => {
    const t = await unsubToken('s3cret', PID, 'sessions');
    expect(await verifyUnsubToken('s3cret', t)).toEqual({ participantId: PID, category: 'sessions' });
    expect(await verifyUnsubToken('other', t)).toBeNull();
    expect(await verifyUnsubToken('s3cret', t.replace('sessions', 'journey'))).toBeNull();
    expect(await verifyUnsubToken('s3cret', t.slice(0, -2) + 'xx')).toBeNull();
    expect(await verifyUnsubToken('s3cret', (await unsubToken('s3cret', PID, 'essential')))).toBeNull();
    expect(await verifyUnsubToken('s3cret', 'garbage')).toBeNull();
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
