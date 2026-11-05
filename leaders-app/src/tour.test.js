// الجولة الحيّة لحساب العرض: الخطوات الثماني عشرة ومراسيها في الشاشات وأفعالها
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_ACTS, TOUR_PEER_SAMPLE, TOUR_STEPS } from './tour-steps.js';

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
});
