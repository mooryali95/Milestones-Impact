// حراس المرحلة و: الموافقة تُسجَّل بنسختها، والمستويات لا تخرج للجهة بلا موافقة،
// والوثائق القانونية مربوطة من الدخول وبوابة الدفع والتذييل، والتنظيف الدوري موجود.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGAL_PATH, POLICY_VERSION } from '../../supabase/functions/leaders-api/labels.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);

describe('الموافقة', () => {
  const participant = api('participant.ts');
  it('نسخة السياسة بصيغة تاريخ، وتُسجَّل مع التسجيل بالبريد وبـGoogle وعند القبول اللاحق', () => {
    expect(POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(participant.match(/await recordConsent\(p\.id\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(participant).toMatch(/consent_version: POLICY_VERSION/);
    expect(api('index.ts')).toMatch(/'consent\.accept': \(p\) => P\.consentAccept\(p\)/);
  });
  it('غياب العمود قبل ترحيله لا يعطّل التسجيل', () => {
    expect(participant).toMatch(/error\.code !== '42703'\) console\.error\('consent:'/);
    expect(participant).toMatch(/consented_at: 'consented_at' in p \? p\.consented_at : undefined/);
  });
  it('الإشعار قبل زرّي التسجيل، وشاشة الموافقة لمن سبق تسجيله', () => {
    const signIn = read('leaders-app/src/screens/SignIn.jsx');
    expect(signIn.match(/<ConsentNote action=/g)?.length).toBe(2);
    expect(signIn).toMatch(/LEGAL_PATH\.privacy/);
    expect(read('leaders-app/src/App.jsx')).toMatch(/me\.participant\.consented_at === null && !me\.participant\.is_demo\) screen = <Consent/);
  });
});

describe('مشاركة المستويات مع الجهة بموافقة', () => {
  it('المنسق لا يرى المستويات إلا لمن وافق، في اللوحة وتقرير الأثر', () => {
    const coord = api('coordinator.ts');
    expect(coord).toMatch(/org_share_consented_at\)\.map\(\(r: any\) => r\.id\)\)/);
    expect(coord).toMatch(/levels: shared\.has\(p\.id\) \? levelsBy\[p\.id\] \|\| null : null/);
    expect(coord).toMatch(/p\.dimensions && shared\.has\(p\.id\)/);
  });
  it('المفتاح بيد المشارك في «ملفي»', () => {
    expect(api('index.ts')).toMatch(/'org\.share-consent': \(p, b\) => P\.orgShareConsent\(p, b\)/);
    expect(read('leaders-app/src/screens/Profile.jsx')).toMatch(/call\('org\.share-consent', \{ share: on \}\)/);
  });
});

describe('الوثائق القانونية والإفصاح', () => {
  it('صفحات الخصوصية والشروط والاسترداد في التطبيق بمساراتها، ومربوطة من التذييل وبوابة الدفع', () => {
    const legal = read('leaders-app/src/screens/Legal.jsx');
    for (const k of ['privacy', 'terms', 'refund']) expect(legal).toContain(LEGAL_PATH[k]);
    for (const s of ['Supabase', 'Resend', 'Creem', 'Google', 'Cloudflare', '90 يومًا', 'حماية البيانات الشخصية']) expect(legal).toContain(s);
    const app = read('leaders-app/src/App.jsx');
    expect(app).toMatch(/startsWith\(`\$\{LEGAL_PATH\.index\}\/`\)\) return <Shell tag="الخصوصية والشروط"><Legal \/>/);
    expect(app.match(/<LegalLink \/>/g)?.length).toBe(2);
    const paywall = read('leaders-app/src/screens/Paywall.jsx');
    expect(paywall).toMatch(/ضريبة القيمة المضافة/);
    expect(paywall).toMatch(/LEGAL_PATH\.refund/);
  });
});

describe('التنظيف الدوري', () => {
  it('مع التذكير الأسبوعي: التحديات والجلسات المنتهية وسجلات التحقق وعناوين القراءة بعد 90 يومًا', () => {
    const sys = api('system.ts');
    expect(sys).toMatch(/RETENTION_DAYS = 90/);
    for (const t of ['email_challenges', 'coordinator_challenges', 'expert_challenges', 'webauthn_challenges', 'auth_sessions', 'coordinator_sessions', 'expert_sessions', 'certificate_checks', 'handbook_views']) expect(sys).toContain(`'${t}'`);
    expect(api('index.ts')).toMatch(/purge: await S\.purge\(\)/);
  });
});
