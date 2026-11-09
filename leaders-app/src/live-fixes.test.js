// مرحلة الإصلاحات العاجلة (تقييم النضج 2026-11-06 §5): حراس تمنع رجوع العيوب الحية الاثني عشر.
// كل حارس يقرأ المصدر الواحد للمعلومة ويتحقق أن ما يُعرض مشتق منه، لا نسخة ثانية منه.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTICIPANT_VIDEO, VIDEO } from '../../shared/video/scenes.js';
import { AUTO_CHECKS } from '../../supabase/functions/leaders-api/logic.js';
import { assessmentMinutes, onboardingStep, ONBOARDING_STEPS, stepTitle } from './Onboarding.jsx';
import { TABS, tabFromSearch } from './deeplink.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const p = join(root, dir, f);
  return statSync(p).isDirectory() ? (f === 'assets' ? [] : walk(relative(root, p))) : [relative(root, p)];
});
const csp = (headers) => headers.match(/Content-Security-Policy: (.+)/)[1];
const directive = (policy, name) => (policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) || '').split(/\s+/).slice(1);

describe('الموقع العام فاتح دائمًا (العيب 2)', () => {
  const pages = walk('home').filter((p) => p.endsWith('.html'));

  it('كل صفحة تعلن النمط الفاتح وتقفل سمته، فلا يقلب نمط الجهاز الداكن رموز الألوان', () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const p of pages) {
      const html = read(p);
      expect(html, p).toMatch(/<html lang="ar" dir="rtl" data-theme="light">/);
      expect(html, p).toMatch(/<meta name="color-scheme" content="light"/);
    }
  });

  it('السمة الفاتحة معرّفة في رموز الهوية التي تبنى منها صفحات الموقع', () => {
    for (const css of ['home/assets/css/main.css', 'home/assets/program/css/main.css']) expect(read(css), css).toContain(':root[data-theme="light"]{');
  });
});

describe('صفحة البرنامج: الفيديو بغلافه وترجمته، وتباين قسم الدخول (العيبان 1 و9)', () => {
  const page = read('home/leaders/index.html');
  const leadersOrigin = 'https://leaders.sunkvalue.com';

  it('الفيديو من مصدره الواحد: الاسم والمدة من scenes.js، ويُطلب بـCORS ليحمّل ملف الترجمة', () => {
    const video = page.match(/<video[^>]*>[\s\S]*?<\/video>/)[0];
    expect(video).toContain('crossorigin="anonymous"');
    // صفحة البرنامج تعرض فيديو المشارك نفسه الذي في التطبيق
    for (const ext of ['jpg', 'webm', 'mp4', 'vtt']) expect(video).toContain(`${leadersOrigin}/media/${PARTICIPANT_VIDEO.file}.${ext}`);
    expect(page.match(/<figcaption>([^<]+)<\/figcaption>/)[1]).toContain(PARTICIPANT_VIDEO.duration_ar);
  });

  it('سياسة الموقع تسمح بالغلاف والوسائط من منصة القادة، ومنصة القادة تسمح بقراءة ملفات الوسائط العامة من أي نطاق للموقع', () => {
    const policy = csp(read('home/_headers'));
    expect(directive(policy, 'img-src')).toContain(leadersOrigin);
    expect(directive(policy, 'media-src')).toContain(leadersOrigin);
    // الفيديو بـcrossorigin يُطلب كله بـCORS: إذن بنطاق واحد يوقف تشغيله من نطاقات الموقع الأخرى، والملفات عامة بلا بيانات اعتماد
    for (const h of ['leaders-app/public/_headers', 'leaders/_headers']) {
      expect(read(h), h).toMatch(/^\/media\/\*\n(?: {2}.+\n)*? {2}Access-Control-Allow-Origin: \*$/m);
    }
  });

  it('نصوص الذهبي الصغيرة في قسم الدخول برموز التباين، لا بلون الهوية الخام', () => {
    expect(read('shared/css/tokens.css')).toMatch(/--gold-text-sand: color-mix\(in oklab, var\(--gold-text\) 90%, var\(--mi-graphite\)\)/);
    expect(page).toMatch(/\.enter__eyebrow\{[^}]*color:var\(--gold-text-sand\)/);
    expect(page).toMatch(/\.enter__card \.enter__go\{[^}]*color:var\(--gold-text\)/);
    expect(page).toMatch(/^\.enter__sub\{[^}]*color:var\(--mi-muted\)/m);
    expect(page).not.toMatch(/^\.enter__sub\{[^}]*opacity/m);
  });
});

describe('تطبيق القادة: التحليلات بلا سكربت مضمّن (العيب 3)', () => {
  for (const h of ['leaders-app/public/_headers', 'leaders/_headers']) {
    it(`سياسة المحتوى في ${h} تسمح بتحليلات Cloudflare وتمنع السكربت المضمّن`, () => {
      const policy = csp(read(h));
      expect(directive(policy, 'script-src')).toContain('https://static.cloudflareinsights.com');
      expect(directive(policy, 'connect-src')).toContain('https://cloudflareinsights.com');
      expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    });
  }

  it('سياسة الخصوصية تذكر الإحصاءات، ونسختها رُفعت مع النص', () => {
    expect(read('leaders-app/src/screens/Legal.jsx')).toContain('إحصاءات زيارات مجمّعة لا تتعرّف عليك ولا تستعمل كعكات');
    // النسخة صارت من سجل النسخ (D18)، وأي تغيير في النص يحتاج نسخة جديدة بحارس البصمة (consent-policy.test.js)
    expect(read('supabase/functions/leaders-api/labels.js')).toMatch(/\{ version: '2026-11-06', material: true,/);
  });
});

describe('البند الأخير في الرحلة يكتمل من مصدره (العيب 4)', () => {
  it('«استلام التقرير النهائي» يكتمل باعتماد التقييم الختامي أو بتقرير صادر، بقراءة واحدة لجدول التقييم', () => {
    expect(AUTO_CHECKS['R-ISSUE']({ reportIssued: true })).toBe(true);
    expect(AUTO_CHECKS['R-ISSUE']({ reportIssued: false })).toBe(false);
    const src = read('supabase/functions/leaders-api/participant.ts');
    expect(src).toMatch(/reportIssued: \(reports\.data \|\| \[\]\)\.length > 0 \|\| fe\?\.status === 'approved'/);
    expect(src.match(/from\('final_evaluations'\)/g)).toHaveLength(1);
  });
});

describe('رابط القسم من البريد (العيب 5)', () => {
  it('يُقرأ القسم ويُحذف من العنوان مع بقاء ما سواه، والقسم المجهول يقع على الرحلة', () => {
    expect(tabFromSearch('?tab=profile')).toEqual({ view: 'profile', search: '' });
    expect(tabFromSearch('?tab=profile&checkin=abc')).toEqual({ view: 'profile', search: '?checkin=abc' });
    expect(tabFromSearch('?tab=admin')).toEqual({ view: 'home', search: '' });
    expect(tabFromSearch('')).toBeNull();
    expect(tabFromSearch('?checkin=abc')).toBeNull();
  });

  it('كل قسم يرسله بريد الخادم مقروء في التطبيق', () => {
    const links = [...read('supabase/functions/leaders-api/core.ts').matchAll(/\/\?tab=([a-z]+)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const t of links) expect(TABS, t).toContain(t);
  });
});

describe('عدّاد واحد ومدد من مصادرها (العيب 10)', () => {
  const me = (label) => ({
    participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد' },
    profile: { approved: false },
    journey: [
      { key: 'profile', status: 'done', items: [{ code: 'P-INFO', status: 'done' }] },
      { key: 'assessment', status: 'active', duration_label: label, items: [{ code: 'A-DONE', status: 'pending' }] },
    ],
  });

  it('مدة الفيديو من scenes.js، ومدة القياس من مرحلته في الرحلة كما يملؤها الخادم', () => {
    expect(ONBOARDING_STEPS[0].minutes).toBe(PARTICIPANT_VIDEO.duration_ar);
    const step = onboardingStep(me('18 دقيقة'), { welcomeSeen: true });
    expect(step).toMatchObject({ key: 'assessment', n: 3, total: 4, minutes: '18 دقيقة' });
    expect(step.steps.map((s) => s.minutes)).toEqual([PARTICIPANT_VIDEO.duration_ar, 'دقيقتان', '18 دقيقة', 'دقيقة']);
  });

  it('رمز لم يُملأ أو مرحلة غائبة لا يُظهر رقمًا مخترعًا', () => {
    expect(assessmentMinutes(me('{assessment_minutes}'))).toBeNull();
    expect(assessmentMinutes({ journey: [] })).toBeNull();
  });

  it('لا تكتب شاشات القبول عدّادًا خاصًا ولا مدة ثابتة؛ العدّاد في رأس الخطوات وحده', () => {
    for (const f of ['screens/Profile.jsx', 'screens/Assessment.jsx', 'screens/Paywall.jsx', 'Onboarding.jsx']) {
      const src = read(`leaders-app/src/${f}`);
      expect(src, f).not.toMatch(/من 3 في القبول|12 دقيقة|دقيقة ونصف/);
    }
    expect(read('leaders-app/src/screens/Paywall.jsx')).toContain("eyebrow: stepTitle('assessment')");
    expect(stepTitle('assessment')).toBe('نقطة انطلاقك');
  });
});

describe('إمكانية الوصول (العيوب 6 و7 و8 و11 و12)', () => {
  it('حقل الملخص التنفيذي موسوم بعنوانه وموصوف بتلميحه', () => {
    expect(read('leaders-app/src/screens/Capstone.jsx')).toMatch(/<textarea[^<]*?aria-labelledby="cp-summary-h" aria-describedby="cp-summary-hint" \/>/);
  });

  it('شريط تقدم المعالم له اسم وقيمة مقروءة', () => {
    expect(read('leaders-app/src/screens/Journey.jsx')).toMatch(/className="ms-bar" role="progressbar" aria-label="نسبة إنجاز معالمك" aria-valuetext=/);
  });

  it('عرض القاعة مجموعة تحمل أشخاصًا تفاعليين، لا صورة تخفي ما بداخلها', () => {
    const src = read('shared/hall/HallView.jsx');
    expect(src).toMatch(/<svg className="hv"[^>]*role="group"/);
    expect(src).toContain("role={onPerson ? 'button' : 'img'} aria-label={personLabel(p, team)}");
  });

  it('لوحة الإدارة بخطوط محمّلة فعلًا: كل خط في رموزها معرّف في ملف خطوطها', () => {
    const tokens = read('admin-app/src/admin.css');
    const faces = new Set([...read('admin-app/public/fonts/fonts.css').matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]));
    for (const name of ['font-ar', 'font-en']) {
      const first = tokens.match(new RegExp(`--${name}:\\s*"([^"]+)"`))[1];
      expect(faces, name).toContain(first);
    }
    expect(tokens).not.toContain('Tajawal');
  });

  it('لوحة الخبير بعنوان رئيسي في كل حالاتها، وأقسام لوحاته بمستوى 2', () => {
    const src = read('leaders-app/src/screens/ExpertPortal.jsx');
    expect(src).toContain('<h1 className="as-h2">لوحة الخبير</h1>');
    expect(src).toContain('<h1 className="as-h2">ملفك بانتظار الاعتماد</h1>');
    expect(src).not.toMatch(/<h3/);
  });
});
