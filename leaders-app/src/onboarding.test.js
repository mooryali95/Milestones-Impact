// معالج البداية والفيديو التعريفي: اشتقاق الخطوة من حالة الخادم، وحراس الملفات والمواضع
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onboardingStep, ONBOARDING_STEPS } from './Onboarding.jsx';
import { PARTICIPANT_VIDEO, PROGRAM_PAGE_VIDEO, VIDEO } from '../../shared/video/scenes.js';
import { TOUR_STEPS, spoken } from './tour-steps.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const me = ({ profile = false, assessment = false, approved = false } = {}) => ({
  participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد' },
  profile: { approved },
  journey: [
    { key: 'profile', status: profile ? 'done' : 'active', items: [{ code: 'P-INFO', status: profile ? 'done' : 'pending' }] },
    { key: 'assessment', status: assessment ? 'done' : 'locked', items: [{ code: 'A-DONE', status: assessment ? 'done' : 'pending' }] },
    { key: 'approval', status: 'locked', items: [], duration_label: 'يوما عمل' },
  ],
});

describe('اشتقاق خطوة المعالج', () => {
  it('أربع خطوات ثابتة بالترتيب', () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual(['welcome', 'profile', 'assessment', 'next']);
  });
  it('الترحيب أولًا ثم الملف بالعلم المحلي نفسه الذي تضبطه اختبارات المتصفح', () => {
    expect(onboardingStep(me(), { welcomeSeen: false })).toMatchObject({ key: 'welcome', n: 1, total: 4 });
    expect(onboardingStep(me(), { welcomeSeen: true })).toMatchObject({ key: 'profile', n: 2 });
  });
  it('القياس ثالثًا، وعنوانه «رسوم القياس» حين تسبقه بوابة الدفع', () => {
    expect(onboardingStep(me({ profile: true }), { welcomeSeen: true })).toMatchObject({ key: 'assessment', n: 3, title: 'نقطة انطلاقك' });
    expect(onboardingStep(me({ profile: true }), { welcomeSeen: true, assessmentPaywall: true })).toMatchObject({ key: 'assessment', title: 'رسوم القياس' });
  });
  it('«ما بعد ذلك» بعد القياس وحتى الاعتماد، مرة واحدة', () => {
    expect(onboardingStep(me({ profile: true, assessment: true }), { welcomeSeen: true, nextSeen: false })).toMatchObject({ key: 'next', n: 4 });
    expect(onboardingStep(me({ profile: true, assessment: true }), { welcomeSeen: true, nextSeen: true })).toBeNull();
    expect(onboardingStep(me({ profile: true, assessment: true, approved: true }), { welcomeSeen: true, nextSeen: false })).toBeNull();
  });
  it('لا معالج لغير المشارك', () => {
    expect(onboardingStep(null)).toBeNull();
    expect(onboardingStep({ expert: {} })).toBeNull();
  });
});

describe('الفيديو التعريفي', () => {
  it('الملفات الأربعة المسجَّلة من الواجهة موجودة وتحت سقف الحجم، والمدة تحت تسع دقائق', () => {
    for (const ext of ['mp4', 'webm', 'vtt', 'jpg', 'json']) {
      const p = join(root, `leaders-app/public/media/${VIDEO.file}.${ext}`);
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBeLessThanOrEqual(VIDEO.maxBytes);
    }
    const meta = JSON.parse(read(`leaders-app/public/media/${VIDEO.file}.json`));
    expect(meta.seconds).toBeLessThanOrEqual(540);
    expect(VIDEO.seconds).toBe(meta.seconds);
    expect(meta.marks).toHaveLength(TOUR_STEPS.length);
  });
  it('الترجمة من نص الجولة كما سُجّل (spoken من المصدر الواحد)، ومتصلة بالترتيب', () => {
    const vtt = read(`leaders-app/public/media/${VIDEO.file}.vtt`);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    for (const s of TOUR_STEPS) expect(vtt).toContain(spoken(s));
    const times = [...vtt.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/g)].map((m) => m.slice(1, 3));
    expect(times).toHaveLength(TOUR_STEPS.length);
    for (let i = 1; i < times.length; i++) expect(times[i][0] >= times[i - 1][1]).toBe(true);
  });
  it('المشغّل في شاشة الدخول وبطاقة الرحلة والترحيب، والصفحة الأم تحمّل الملف نفسه بسماح CSP', () => {
    expect(read('leaders-app/src/screens/SignIn.jsx')).toMatch(/<IntroVideo \/>/);
    expect(read('leaders-app/src/screens/Journey.jsx')).toMatch(/<IntroVideo className="link small" \/>[\s\S]*OnboardingNextCard/);
    expect(read('leaders-app/src/Onboarding.jsx')).toMatch(/<IntroPlayer \/>/);
    const home = read('home/leaders/index.html');
    // الصفحة الأم على ملف منشور (PROGRAM_PAGE_VIDEO): الحالي، أو السابق أثناء الانتقال (scenes.js)
    expect(home).toContain(`https://leaders.sunkvalue.com/media/${PROGRAM_PAGE_VIDEO.file}.mp4`);
    expect(home).toContain(`https://leaders.sunkvalue.com/media/${PROGRAM_PAGE_VIDEO.file}.vtt`);
    expect(read('home/_headers')).toMatch(/media-src 'self' https:\/\/leaders\.sunkvalue\.com/);
    expect(read('leaders-app/public/_headers')).toMatch(/\/media\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  });
  it('بطاقات أول فتح في الكتيب والقاعة والمبادرة بمكوّن واحد', () => {
    for (const [f, id] of [['Handbook', 'handbook'], ['Hall', 'hall'], ['Capstone', 'capstone']]) {
      expect(read(`leaders-app/src/screens/${f}.jsx`)).toMatch(new RegExp(`<FirstOpen id="${id}"`));
    }
  });
});
