// الجولة الحيّة لحساب العرض: الخطوات الثماني عشرة ومراسيها في الشاشات وأفعالها
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_ACTS, TOUR_PEER_SAMPLE, TOUR_STEPS, spoken } from './tour-steps.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const SCREENS = ['App.jsx', 'screens/SignIn.jsx', 'screens/Profile.jsx', 'screens/Assessment.jsx', 'screens/Journey.jsx', 'screens/PeerRequests.jsx', 'screens/Handbook.jsx', 'screens/Capstone.jsx', 'screens/Hall.jsx'];
const src = SCREENS.map((f) => read(`leaders-app/src/${f}`)).join('\n');

describe('خطوات الجولة الحيّة', () => {
  it('ثماني عشرة خطوة بمفاتيح فريدة، تبدأ بالترحيب والدخول وتنتهي بالختام', () => {
    expect(TOUR_STEPS).toHaveLength(18);
    expect(new Set(TOUR_STEPS.map((s) => s.key)).size).toBe(18);
    expect(TOUR_STEPS[0].key).toBe('welcome');
    expect(TOUR_STEPS[1]).toMatchObject({ key: 'doors', act: 'login' });
    expect(TOUR_STEPS.at(-1).key).toBe('close');
  });
  it('كل مرساة تشير إلى عنصر حقيقي يحمل data-tour في الشاشات، أو مرساة التنقل', () => {
    for (const s of TOUR_STEPS) {
      if (!s.anchor) continue;
      if (s.anchor.startsWith('nav-')) { expect(src).toMatch(/data-tour=\{`nav-\$\{it\.key\}`\}/); continue; }
      expect(src, s.anchor).toContain(`data-tour="${s.anchor}"`);
    }
  });
  it('الأفعال من القائمة المعروفة ولكل فعل زر، والشاشات المقصودة أقسام قائمة', () => {
    for (const s of TOUR_STEPS) {
      if (s.act) { expect(TOUR_ACTS).toContain(s.act); expect(s.btn).toBeTruthy(); }
      if (s.go) expect(['home', 'handbook', 'capstone', 'hall', 'profile', 'impact']).toContain(s.go);
      expect(s.t.length).toBeGreaterThan(2);
      expect(s.d.length).toBeGreaterThan(80);
    }
    expect(TOUR_PEER_SAMPLE.length).toBeGreaterThanOrEqual(10);
  });
  it('الجولة مركّبة في التطبيق لحساب العرض وحده، وطلبات الأقران تعيد التحميل عند إشارتها', () => {
    const app = read('leaders-app/src/App.jsx');
    expect(app).toMatch(/import LiveTour, \{ captureDemoLink, demoPending \} from '\.\/LiveTour\.jsx'/);
    expect(app).toMatch(/\(demo \|\| me\?\.participant\?\.is_demo\) && <LiveTour/);
    expect(read('leaders-app/src/screens/PeerRequests.jsx')).toMatch(/addEventListener\('mi-tour-refresh'/);
    const tour = read('leaders-app/src/LiveTour.jsx');
    expect(tour).toMatch(/call\('peer\.ask', \{ text: TOUR_PEER_SAMPLE/);
    expect(tour).toMatch(/ArrowLeft[\s\S]*ArrowRight[\s\S]*Escape/);
    expect(tour).toMatch(/tour-spot/);
  });
  // نص الجولة الحيّة (d) يصح في الكود وقرارات اللجنة؛ والنص المسجَّل القديم يبقى في said وحده حتى يُعاد التسجيل
  it('نص الجولة الحيّة يصح في القرارات، والمسجَّل يبقى حيث يختلف وحده', () => {
    const live = TOUR_STEPS.map((s) => s.d).join(' ');
    const d = (k) => TOUR_STEPS.find((s) => s.key === k).d;
    expect(live).not.toMatch(/[-‐-―−ـ]/);
    expect(live).not.toMatch(/\d+\s*دقيقة|اثنتي عشرة دقيقة/);            // المدة من الأداة الفعالة على الشاشة (D03)
    expect(live).not.toContain('شهادة مشاركة');                          // «شهادة إتمام بنجاح» وحدها (D05)
    expect(live).not.toMatch(/بالأداة نفسها|بنفس الأداة|المكسب/);        // أداة مكافئة، والمكسب الفردي لا يدخل الدرجة (D06)
    expect(live).not.toMatch(/تُغطّى|رسومه تلقائيًا/);                    // الرعاية ضمن مقاعد العقد ومدته (D20)
    expect(d('doors')).not.toMatch(/تلقائيًا/);
    expect(live).not.toMatch(/أسبوعًا بعد أسبوع/);                       // الاتجاه آخر التقييمات بما قبلها
    expect(live).not.toMatch(/أيام عمل قليلة/);                          // اعتماد المسار خلال يومي عمل (D04)
    expect(live).not.toMatch(/عشر مراحل/);                               // عدد المراحل يُضبط من الإعداد
    expect(d('hall')).not.toMatch(/يُحتسب/);                             // القاعة للتعلم (D17)
    expect(d('continuous')).not.toMatch(/القاعة|وتقدير الخبير، وكلٌّ/);   // ليست مصدرًا، وتقدير الخبير انخراط خارج المؤشر
    for (const s of TOUR_STEPS) {
      expect(spoken(s)).toBe(s.said ?? s.d);
      if ('said' in s) expect(s.said, s.key).not.toBe(s.d);
    }
    const doc = read('docs/journey/2026-11-09-نص-الجولة-الحية-v2.md');
    for (const s of TOUR_STEPS) expect(doc, s.key).toContain(`**النص:** ${s.d}\n`);
    const tour = read('leaders-app/src/LiveTour.jsx');
    expect(tour).toMatch(/<p>\{step\.d\}<\/p>/);
    expect(tour).toMatch(/audioOk && !step\.said[\s\S]*TOUR_AUDIO && !step\.said && <audio/);
  });
});
