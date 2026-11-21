// الحساب التجريبي، المرحلة 1 من تصوره (2026-11-19): شارة «حساب تجريبي» وأدوات التخطي، ووسم المرحلة المتخطاة، ومعاينة
// الشهادة بعلامة «نموذج للعرض». المنطق الخالص هنا، والخادم في demo_skip_test.ts، والمتصفح في e2e/leaders-demo-skip.spec.js.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { demoBarState } from './DemoBar.jsx';
import { certificateHtml, SAMPLE_STAMP_AR } from '../../src/lib/brand/certificate.js';
import { DEMO_BADGE_LINE_AR, DEMO_NAME_AR, DEMO_NOT_REAL_AR, DEMO_SAMPLE_AR, DEMO_SHARED_LINE_AR, DEMO_SKIPPED_AR } from '../../supabase/functions/leaders-api/demo-stage.js';

// الشرطتان المتوسطة والطويلة برمزيهما، فلا يحملهما هذا الملف نفسه
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const item = (code, status) => ({ id: code, code, status });
const me = (over = {}) => ({
  profile: { approved: true },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', status: 'done', items: [item('P-INFO', 'done')] },
    { key: 'assessment', title_ar: 'تحديد المستوى', status: 'done', items: [item('A-DONE', 'done')] },
    { key: 'training', title_ar: 'التدريب', status: 'active', items: [] },
    { key: 'ojt', title_ar: 'التوجيه على رأس العمل', status: 'locked', items: [] },
    { key: 'ask', title_ar: 'اسأل خبيرًا', status: 'available', lane: 'service', items: [] },
  ],
  ...over,
});

describe('شريط الحساب التجريبي', () => {
  it('في الرحلة: الزر يتخطى المرحلة الحالية باسمها، و«افتح كل المراحل» ما بقيت مقفلة', () => {
    const s = demoBarState(me());
    expect([s.target.kind, s.target.title, s.canOpenAll, s.allOpen]).toEqual(['stage', 'التدريب', true, false]);
  });
  it('قبل الرحلة: الملف ثم القياس واعتماد المسار، ولا «افتح كل المراحل» قبل الاعتماد', () => {
    const fresh = me({ profile: { approved: false }, journey: [{ key: 'profile', title_ar: 'الملف الشخصي', status: 'active', items: [item('P-INFO', 'pending')] }, { key: 'assessment', title_ar: 'تحديد المستوى', status: 'locked', items: [item('A-DONE', 'pending')] }] });
    expect([demoBarState(fresh).target.kind, demoBarState(fresh).target.title, demoBarState(fresh).canOpenAll]).toEqual(['profile', 'الملف الشخصي', false]);
    fresh.journey[0].items[0].status = 'done';
    expect([demoBarState(fresh).target.kind, demoBarState(fresh).target.title, demoBarState(fresh).canOpenAll]).toEqual(['assessment', 'القياس واعتماد المسار', false]);
  });
  it('بعد فتح الكل لا يبقى زره، وبعد تخطي الكل لا يبقى زر التخطي (الخدمة لا تُتخطى)', () => {
    const open = me();
    open.journey[3].status = 'active';
    expect([demoBarState(open).canOpenAll, demoBarState(open).allOpen]).toEqual([false, true]);
    for (const s of open.journey) if (s.lane !== 'service') s.status = 'done';
    expect(demoBarState(open).target.kind).toBe('none');
  });
  it('النصوص: الاسم الموحد والسطور، بلا شرطة طويلة أو متوسطة', () => {
    expect([DEMO_NAME_AR, DEMO_BADGE_LINE_AR, DEMO_SKIPPED_AR, DEMO_SAMPLE_AR, SAMPLE_STAMP_AR]).toEqual(['حساب تجريبي', 'ما تفعله هنا لا يُحسب', 'تم تخطيها للعرض', 'نموذج للعرض', 'نموذج للعرض']);
    for (const t of [DEMO_NAME_AR, DEMO_BADGE_LINE_AR, DEMO_SHARED_LINE_AR, DEMO_SKIPPED_AR, DEMO_NOT_REAL_AR, read('./DemoBar.jsx')]) expect(t).not.toMatch(DASH);
  });
  it('المصدر: الشارة لكل جلسة للحساب التجريبي (من اللوحة أو برابط)، ولا زر يغلقها، والوسم للحساب التجريبي وحده', () => {
    const app = read('./App.jsx');
    expect(app).toContain('{me?.participant?.is_demo && <DemoBar me={me} shared={demoShared} onUpdate={accept} />}');
    expect(app).not.toContain('DemoSharedBar');
    const bar = read('./DemoBar.jsx');
    expect(bar).not.toMatch(/إغلاق|إخفاء|onClose|dismiss/);
    expect(bar).toContain("run('demo.skip-stage')");
    expect(bar).toContain("run('demo.open-all')");
    const journey = read('./screens/Journey.jsx');
    expect(journey).toContain('stage.skipped ? (demo ? <span className="chip demo-skip" data-testid="stage-skipped-demo">{DEMO_SKIPPED_AR}</span> : <span className="chip ok">أُعفيت منها</span>)');
    expect(journey).toContain('{participant.is_demo && approved && <DemoCertificateCard />}');
    // الشريط ثابت تحت الترويسة ولا يُطبع
    const css = read('./styles.css');
    expect(css).toContain('#root > .demo-bar { position: sticky; top: var(--topbar-h, 0px); z-index: 17; }');
  });
});

describe('معاينة الشهادة «نموذج للعرض»', () => {
  const snap = { name_ar: 'مشارك تجريبي', name_en: null, program_ar: 'برنامج القادة', program_en: 'Leaders Program', issued_at: '2026-11-21T08:00:00Z', start: '2026-11-01', end: '2026-12-31', signatories: [], kind: 'completion_success' };
  it('النموذج: العلامة ظاهرة، ولا رقم تسلسلي ولا رابط تحقق ولا رمز QR ولا زر LinkedIn', () => {
    const html = certificateHtml({ ...snap, serial: null, verify_url: null, sample: true }, '');
    expect(html).toContain('<div class="status"><span>نموذج للعرض</span></div>');
    expect(html).toContain('نموذج للعرض، بلا رقم');
    expect(html).toContain('لا رابط تحقق لهذا النموذج');
    expect(html).toContain('نموذج للعرض، لا يثبت إتمام البرنامج');
    expect(html).not.toMatch(/MI-LDR-/);
    expect(html).not.toContain('class="qr"');
    expect(html).not.toContain('data-act="linkedin"');
    expect(html).not.toContain('/v/');
    expect(html).not.toContain('null');
  });
  it('الشهادة الحقيقية كما كانت: رقمها ورابط تحققها ورمزها، بلا علامة النموذج', () => {
    const html = certificateHtml({ ...snap, serial: 'MI-LDR-2026-ABCDEF', verify_url: 'https://leaders.example/v/MI-LDR-2026-ABCDEF' }, '<svg id="qr"></svg>');
    expect(html).toContain('<dd class="ltr">MI-LDR-2026-ABCDEF</dd>');
    expect(html).toContain('leaders.example/v/MI-LDR-2026-ABCDEF');
    expect(html).toContain('<div class="qr"><svg id="qr"></svg></div>');
    expect(html).toContain('data-act="linkedin"');
    expect(html).not.toContain('نموذج للعرض');
  });
});
