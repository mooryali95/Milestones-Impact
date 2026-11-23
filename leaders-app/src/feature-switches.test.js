// مفاتيح الميزات P2 وP3: الأزرار في الإدارة والإخفاء في الواجهات، من حمولة الخادم لا من ثابت في الحزمة
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { afterApprovalAr, flagsOf, isFeatureOff, programPackageAr, shownView, tourStepsFor, viewShown } from './features.js';
import { TOUR_STEPS } from './tour-steps.js';
import { tabFromSearch } from './deeplink.js';
import { answerBlock, cleanPeerRequest, PEER_SOURCE_AR, peerTeamsOn } from '../../supabase/functions/leaders-api/peer.js';
import { FEATURE_TABS } from '../../admin-app/src/leaders-tabs.js';
import HowEvaluated from './screens/HowEvaluated.jsx';

const root = join(import.meta.dirname, '..', '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const OFF = { hall: false, katon: false, f360: false };
const ON = { hall: true, katon: true, f360: true };

describe('المفاتيح من حمولة الخادم', () => {
  it('ما غاب أو لم يكن true فمخفي', () => {
    expect(flagsOf(null)).toEqual(OFF);
    expect(flagsOf({})).toEqual(OFF);
    expect(flagsOf({ features: { hall: 'yes', katon: 1, f360: null } })).toEqual(OFF);
    expect(flagsOf({ features: ON })).toEqual(ON);
  });
  it('الشاشة المخفية تقع على الرحلة، ورابط ?tab=hall كذلك', () => {
    expect(viewShown('hall', OFF)).toBe(false);
    expect(viewShown('handbook', OFF)).toBe(true);
    expect(shownView(tabFromSearch('?tab=hall').view, OFF)).toBe('home');
    expect(shownView(tabFromSearch('?tab=hall').view, ON)).toBe('hall');
    for (const v of ['katon', 'f360']) { expect(shownView(v, OFF)).toBe('home'); expect(shownView(v, ON)).toBe(v); }
  });
  it('رموز الرفض نهائية، وما سواها عارض', () => {
    for (const code of ['hall_off', 'katon_off', 'f360_off']) expect(isFeatureOff({ success: false, code })).toBe(true);
    expect(isFeatureOff({ success: false, code: 'network' })).toBe(false);
    expect(isFeatureOff({ success: true, code: 'hall_off' })).toBe(false);
  });
  it('لا ثابت بناء للظهور في الواجهة: App وPaywall يقرآن me.features', () => {
    for (const f of ['leaders-app/src/App.jsx', 'leaders-app/src/screens/Paywall.jsx']) expect(read(f)).not.toContain('KATON_ENABLED');
    const app = read('leaders-app/src/App.jsx');
    expect(app).toContain('ft.hall && { key: \'hall\'');
    expect(app).toContain('ft.katon && { key: \'katon\'');
    expect(app).toContain('onHall={ft.hall ? () => go(\'hall\') : undefined}');
    expect(app).toMatch(/ft\.f360 && <Feedback360Entry/);
  });
});

describe('الجولة الحيّة والنصوص', () => {
  it('خطوة القاعة تُحذف قبل العداد حين تُخفى', () => {
    expect(tourStepsFor(TOUR_STEPS, OFF).some((s) => s.key === 'hall')).toBe(false);
    expect(tourStepsFor(TOUR_STEPS, OFF)).toHaveLength(TOUR_STEPS.length - 1);
    expect(tourStepsFor(TOUR_STEPS, ON)).toHaveLength(TOUR_STEPS.length);
  });
  it('حين تُخفى القاعة لا تذكرها الجولة ولا فرقها في أي خطوة، وتبقى كما هي حين تظهر', () => {
    const off = tourStepsFor(TOUR_STEPS, OFF);
    for (const s of off) {
      expect(s.d, s.key).not.toMatch(/القاعة|على فريقه|فريق آخر/);   // «أعضاء فريقه» في الأثر فريق عمله لا فرق القاعة
      expect(s.d.length, s.key).toBeGreaterThan(80);
      expect(s.d, s.key).not.toMatch(/[-‐-―−ـ]/);
    }
    expect(tourStepsFor(TOUR_STEPS, ON).map((s) => s.d)).toEqual(TOUR_STEPS.map((s) => s.d));
    expect(TOUR_STEPS.filter((s) => s.noHall).map((s) => s.key).sort()).toEqual(['peer', 'portals']);
  });
  it('حين يُطفأ 360 لا تذكر خطوة الأثر تقدير المدير والزملاء، وتبقى كما هي حين يظهر، وقبل الدخول مطفأ', () => {
    const impactOf = (f) => tourStepsFor(TOUR_STEPS, f).find((s) => s.key === 'impact');
    expect(impactOf({ hall: true, katon: true, f360: false }).d).not.toMatch(/مدير|زملاؤه|زميل/);
    expect(impactOf({ hall: true, katon: true, f360: false }).d).not.toMatch(/[-‐-―−ـ]/);
    expect(impactOf({ hall: true, katon: true, f360: true }).d).toBe(TOUR_STEPS.find((s) => s.key === 'impact').d);
    expect(TOUR_STEPS.filter((s) => s.noF360).map((s) => s.key)).toEqual(['impact']);
    const tour = read('leaders-app/src/LiveTour.jsx');
    expect(tour).toContain('const f360On = !!me && flagsOf(me).f360;');
    expect(tour).not.toMatch(/f360: true \}/);
  });
  it('الجولة قبل الدخول تعامل القاعة مخفية، وتبقى على خطوتها بمفتاحها حين تتغير الخطوات، والصوت برقم الخطوة الأصلي', () => {
    const tour = read('leaders-app/src/LiveTour.jsx');
    expect(tour).toContain('const hallOn = !!me && flagsOf(me).hall;');
    expect(tour).not.toContain('!me || flagsOf(me).hall');
    expect(tour).toMatch(/findIndex\(\(s\) => s\.key === key\)/);
    expect(tour).toMatch(/TOUR_AUDIO_BASE\}\$\{TOUR_STEPS\.findIndex/);
  });
  it('ما يُفتح بعد الاعتماد ونص الباقة لا يذكران المخفي', () => {
    expect(afterApprovalAr(OFF)).toBe('كتابك، ومبادرتك، وطلبات التوجيه');
    expect(afterApprovalAr(ON)).toBe('كتابك، ومبادرتك، والقاعة، وطلبات التوجيه');
    expect(programPackageAr(OFF)).toBe('الكتاب والمبادرة والتقييم والشهادة');
    expect(programPackageAr({ hall: true, katon: false })).toBe('الكتاب والقاعة والمبادرة والتقييم والشهادة');
    expect(programPackageAr(ON)).toBe('الكتاب و«كاتون» والقاعة والمبادرة والتقييم والشهادة');
  });
  it('«كيف يُقيَّم» لا يسمّي القاعة ولا كاتون', () => {
    const html = renderToStaticMarkup(React.createElement(HowEvaluated, { policy: { weights: { a: 50, b: 50 }, thresholds: {}, version: 'v1' } }));
    expect(html).toContain('أنشطة التعلم التفاعلية');
    expect(html).not.toMatch(/كاتون|القاعة/);
  });
});

describe('طلبات الأقران حين تُخفى القاعة: الطلب إلى الجميع', () => {
  const req = { participant_id: 'a', status: 'open', target_team: 'guide' };
  it('اختيار الفريق للقاعة الظاهرة ولمن له فريق', () => {
    expect(peerTeamsOn(true, 'guide')).toBe(true);
    expect(peerTeamsOn(false, 'guide')).toBe(false);
    expect(peerTeamsOn(true, null)).toBe(false);
  });
  it('الطلب الجديد إلى الجميع، والقديم الموجّه إلى فريق يجيبه الجميع', () => {
    expect(cleanPeerRequest({ text: 'سؤال عن بوابة المرحلة الأولى', target_team: 'guide' }, 'peers_expert', { teams: false }).target_team).toBeNull();
    expect(cleanPeerRequest({ text: 'سؤال عن بوابة المرحلة الأولى', target_team: 'guide' }).target_team).toBe('guide');
    expect(answerBlock(req, { id: 'b', team: null })).toMatch(/موجّه/);
    expect(answerBlock(req, { id: 'b', team: null }, 'peers_expert', { teams: false })).toBeNull();
  });
  it('مصدر الجملة بوسم محايد', () => {
    expect(PEER_SOURCE_AR.sentence).toBe('جملة نقاش');
    expect(read('leaders-app/src/screens/PeerRequests.jsx')).toContain('d.team_pick !== false');
  });
});

describe('الإدارة: الميزات قيد البناء', () => {
  it('ثلاثة مفاتيح متجاورة، و360 هو feedback360.enabled ولا يُعرض مرتين', async () => {
    const { FEATURE_SWITCHES } = await import('../../admin-app/src/screens/AppSettings.jsx');
    expect(FEATURE_SWITCHES.map((s) => `${s.group}.${s.field}`)).toEqual(['features.hall', 'features.katon', 'feedback360.enabled']);
    const src = read('admin-app/src/screens/AppSettings.jsx');
    expect(src).toContain("IN_FEATURES = { feedback360: new Set(['enabled']) }");
    expect(src).toContain('role="switch"');
  });
  it('شارة «مخفي عن المستخدمين» وشريط على أقسام القاعة وكاتون و360', () => {
    expect(FEATURE_TABS).toEqual({ hall: 'hall', katon: 'katon', f360: 'f360' });
    const src = read('admin-app/src/screens/Leaders.jsx');
    // نقطة بتلميح ونص مسموع بدل الشارة العريضة التي كانت تكسر سطر الاسم (تدقيق اللوحة 2026-11-23)
    expect(src).toContain('<span className="ft-hidden-dot" title="مخفي عن المستخدمين"><span className="sr-only">مخفي عن المستخدمين</span></span>');
    expect(read('admin-app/src/admin.css').match(/\.ft-hidden-dot \{[^}]*\}/)[0]).toContain('var(--st-warn-text)');
    expect(src).toContain('data-testid="feature-hidden-banner"');
  });
});

describe('الخبير والمقيّم', () => {
  it('بطاقتا القاعة و360 في بوابة الخبير بمفتاحيهما من لوحته', () => {
    const src = read('leaders-app/src/screens/ExpertPortal.jsx');
    expect(src).toContain('{flagsOf(d).hall && <ExpertHall');
    expect(src).toContain('{show360 && <Advisor360');
  });
  it('مقيّم 360 المتوقف يرى صفحة صادقة لا نموذجًا', () => {
    const src = read('leaders-app/src/screens/Rater.jsx');
    expect(src).toContain('if (data.paused)');
    expect(src).toContain('else if (res.paused) setData(res)');
  });
});

describe('مفاتيح الإدارة: الصياغة والتباين', () => {
  it('حال كل مفتاح بجنس اسمه كما في عنوان حقله، والشارة بلون نص يحقق التباين', () => {
    const src = read('admin-app/src/screens/AppSettings.jsx');
    expect(src).toContain("title: 'القاعة الحية', on_ar: 'ظاهرة للمستخدمين', off_ar: 'مخفية عن المستخدمين'");
    expect(src).toContain("title: 'كاتون', on_ar: 'ظاهر للمستخدمين', off_ar: 'مخفي عن المستخدمين'");
    expect(src).toContain("title: 'تقييم 360', on_ar: 'ظاهر للمستخدمين', off_ar: 'مخفي عن المستخدمين'");
    expect(src).not.toMatch(/on \? 'ظاهرة للمستخدمين' : 'مخفية عن المستخدمين'/);
    const badge = read('admin-app/src/admin.css').match(/\.ft-hidden-badge \{[^}]*\}/)[0];
    expect(badge).toContain('color: var(--st-warn-text)');
    expect(badge).not.toMatch(/color: var\(--st-warn\);/);
  });
});
