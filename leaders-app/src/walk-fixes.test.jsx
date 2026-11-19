// جولة المشارك 2026-11-19: إصلاحات مؤكدة في تطبيق المشارك. هنا الدوال الصرفة (عد المراحل، وصياغة النتيجة الختامية،
// والمعدود العربي، وصيغة الموعد، وما بقي من قائمة التحقق)، ورسالة رفض الخادم بزر «حدّث»، وحراس على المصدر والأنماط.
// الرحلة في المتصفح على 390: e2e/leaders-walk-fixes.spec.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countedStages, finalView, fmtDay, fmtTime, fmtWhen, lateBannerAr, lateByAr, lateShortAr, leftToDo, stageTally } from './journey-copy.js';
import { journeyProgress } from '../../supabase/functions/leaders-api/logic.js';
import { CONTACT_EMAIL } from '../../supabase/functions/leaders-api/labels.js';
import { PHASES } from './labels.js';
import { createAppUpdate } from '../../shared/ui/app-update.js';
import UpdateRefusal, { NOT_YET_AR, UNSAVED_AR } from './UpdateRefusal.jsx';
import { DEFAULT_REFUSAL_AR, updateRefusal } from './update-refusal.js';
import { trackTopbarHeight } from './topbar-height.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const st = (key, phase, status, extra = {}) => ({ key, phase, status, items: [], done: 0, total: 0, ...extra });

afterEach(() => { updateRefusal.clear(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('عد المراحل: قاعدة واحدة للرأس ولعناوين الأطوار (البند 6)', () => {
  // رحلة الجولة: 3 قبول منجزة، 4 تأهيل منها اثنتان «عند الحاجة»، 3 أثر، ومعها مسار مستمر وخدمة
  const journey = [
    st('profile', 'admission', 'done'), st('assessment', 'admission', 'done'), st('approval', 'admission', 'done'),
    st('training', 'qualification', 'active'), st('ojt', 'qualification', 'locked'),
    st('consulting', 'qualification', 'locked', { stage_mode: 'on_demand' }), st('coaching', 'qualification', 'locked', { stage_mode: 'on_demand' }),
    st('track', 'qualification', 'active', { lane: 'track' }), st('svc', 'qualification', 'available', { lane: 'service' }),
    st('support', 'impact', 'locked'), st('evaluation', 'impact', 'locked'), st('report', 'impact', 'locked'),
  ];
  it('«عند الحاجة» والمسار المستمر والخدمة لا تُعد على المشارك: 3 من 8 لا من 10', () => {
    expect(stageTally(journey)).toEqual({ done: 3, total: 8 });
    expect(countedStages(journey).map((s) => s.key)).not.toContain('consulting');
  });
  it('مجموع عناوين الأطوار يساوي ما في الرأس', () => {
    const perPhase = PHASES.map((ph) => stageTally(journey.filter((s) => (s.phase || 'qualification') === ph.key)));
    expect(perPhase).toEqual([{ done: 3, total: 3 }, { done: 0, total: 2 }, { done: 0, total: 3 }]);
    expect(perPhase.reduce((n, t) => n + t.total, 0)).toBe(stageTally(journey).total);
    expect(perPhase.reduce((n, t) => n + t.done, 0)).toBe(stageTally(journey).done);
  });
  it('«عند الحاجة» تُحسب له إن أتمها، كما في نسبة التقدم (journeyProgress)', () => {
    const used = journey.map((s) => (s.key === 'consulting' ? { ...s, status: 'done' } : s));
    expect(stageTally(used)).toEqual({ done: 4, total: 9 });
    // القاعدة نفسها التي تحسب بها النسبة: منجزة من معدودة
    for (const j of [journey, used]) {
      const t = stageTally(j);
      expect(journeyProgress(j.map((s) => (s.status === 'active' ? { ...s, status: 'locked' } : s)))).toBe(Math.round((t.done / t.total) * 100));
    }
  });
  it('شاشة الرحلة تعد بالدالة نفسها في الرأس والطور، بلا عد ثانٍ مكتوب بجانبها', () => {
    const src = read('leaders-app/src/screens/Journey.jsx');
    expect(src).toContain('stageTally(journey)');
    expect(src).toContain('stageTally(stages)');
    expect(src).not.toContain('من {stages.length}');
    expect(src).not.toMatch(/const counted = journey\.filter/);
  });
});

describe('المعدود العربي في المعالم (البند 7)', () => {
  it('«معلمان متأخران» و«متأخر يومين»، لا «2 معالم» ولا «2 يومًا»', () => {
    expect(lateBannerAr(2, 12)).toBe('لديك معلمان متأخران، وأقصى التأخر 12 يومًا.');
    expect(lateBannerAr(1, 2)).toBe('لديك معلم متأخر يومين.');
    expect(lateBannerAr(3, 1)).toBe('لديك 3 معالم متأخرة، وأقصى التأخر يوم واحد.');
    expect(lateBannerAr(11, 3)).toBe('لديك 11 معلمًا متأخرًا، وأقصى التأخر 3 أيام.');
    expect([1, 2, 3, 10, 11, 12].map(lateByAr)).toEqual(['متأخر يومًا واحدًا', 'متأخر يومين', 'متأخر 3 أيام', 'متأخر 10 أيام', 'متأخر 11 يومًا', 'متأخر 12 يومًا']);
    expect([1, 2, 3, 11].map(lateShortAr)).toEqual(['واحد متأخر', 'اثنان متأخران', '3 متأخرة', '11 متأخرًا']);
  });
  it('الشاشة تقرأ من الدوال، ولا صيغة مكتوبة بالرقم', () => {
    const src = read('leaders-app/src/screens/Journey.jsx');
    expect(src).not.toContain('معالم متأخرة');
    expect(src).not.toContain('late_days} يومًا');
    expect(src).toContain('lateBannerAr(summary.late, summary.max_late)');
  });
});

describe('النتيجة الختامية: الرأس وسطر «التالي» يتبعان القرار (البند 3)', () => {
  const base = { approved: true, allDone: true, hasPolicy: true, firstName: 'سارة' };
  const of = (decision, decision_ar, notes = null) => finalView({ ...base, final: { decision, decision_ar, score: 50, notes } });
  it('«لم يجتز»: لا تهنئة ولا «أثرك موثّق»، والتالي بريد الإدارة وموضع طريقة المراجعة', () => {
    const v = of('fail', 'لم يجتز');
    expect(v.kind).toBe('fail');
    expect(`${v.title} ${v.line}`).not.toMatch(/مبارك|مفتوحة|أثرك الآن موثّق|أكملت الرحلة كاملة/);
    expect(v.line).toBe('أنهيت مراحل الرحلة، وقرار تقييمك الختامي: لم يجتز.');
    expect(v).toMatchObject({ contact: true, review: true });
    expect(v.next).toBe('للاستفسار عن نتيجتك وما بعدها راسل');
  });
  it('«تمديد»: يسمي ما حدث، ويبدأ بملاحظات الخبير إن وُجدت', () => {
    expect(of('extend', 'تمديد', 'ينقصك دليل الأثر').next).toBe('استكمل ما ينقص في مرحلتك الممددة، وابدأ بملاحظات خبيرك. لخطة الاستكمال راسل');
    const v = of('extend', 'تمديد');
    expect(v.next).toBe('استكمل ما ينقص في مرحلتك الممددة. لخطة الاستكمال راسل');
    expect(v).toMatchObject({ kind: 'extend', contact: true, review: true });
    expect(v.title).not.toMatch(/مبارك|مفتوحة/);
  });
  it('«اجتاز» و«اجتاز بملاحظات»: تهنئة، والتالي بطاقة الشهادة، بلا بريد ولا مراجعة', () => {
    expect(of('pass', 'اجتاز')).toMatchObject({ kind: 'pass', title: 'مبارك سارة، اجتزت التقييم الختامي', line: 'أكملت الرحلة كاملة. أثرك الآن موثّق.', contact: false, review: false });
    expect(of('pass_notes', 'اجتاز بملاحظات').title).toBe('مبارك سارة، اجتزت التقييم الختامي بملاحظات');
    expect(of('pass', 'اجتاز').next).toContain('شهادة الإتمام بنجاح');
  });
  it('لم تصدر النتيجة بعد: من أنهى مراحله وبرنامجه بتقييم ختامي لا يُقال له «أثرك موثّق»', () => {
    const v = finalView({ ...base, final: null });
    expect(v).toMatchObject({ kind: 'pending', next: null });
    expect(`${v.title} ${v.line}`).not.toMatch(/مبارك|أثرك الآن موثّق/);
    // وما زال في الطريق، أو برنامج بلا تقييم ختامي، أو لم يُعتمد مساره: نص الرحلة المعتاد كما هو
    expect(finalView({ ...base, final: null, allDone: false }).kind).toBeNull();
    expect(finalView({ ...base, final: null, hasPolicy: false })).toMatchObject({ kind: null, title: null, line: null });
    expect(finalView({ ...base, approved: false, final: { decision: 'fail' } }).kind).toBeNull();
  });
  it('لا مسار تظلم مخترع: المراجعة تُحال إلى «كيف يُقيَّم عملك» حين تُعرض وحدها، والبريد هو بريد الإدارة المعروض في التطبيق', () => {
    expect(finalView({ ...base, hasPolicy: false, final: { decision: 'fail', decision_ar: 'لم يجتز' } }).review).toBe(false);
    const src = read('leaders-app/src/screens/Journey.jsx');
    expect(src).toContain('data-testid="final-result"');
    expect(src).toContain('mailto:${CONTACT_EMAIL}');
    expect(CONTACT_EMAIL).toMatch(/@/);
    // النتيجة تحت الرأس: قبل بطاقة الشهادة وقبل عمودي الرحلة
    expect(src.indexOf('data-testid="final-result"')).toBeLessThan(src.indexOf('<CertificateCard participant'));
    expect(src.indexOf('data-testid="final-result"')).toBeLessThan(src.indexOf('className="j-layout"'));
  });
});

describe('صيغة الموعد واحدة (البند 10)', () => {
  it('بطاقة الجلسة وقائمة الجلسات من الدالتين نفسيهما، والساعة بلا صفر زائد', () => {
    const d = '2026-11-19T06:19:00Z';
    expect(fmtWhen(d)).toBe(`${fmtDay(d)}، ${fmtTime(d)}`);
    expect(fmtTime('2026-11-19T09:05:00')).toMatch(/^9:05/);
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain('fmtWhen(session.starts_at)');
    expect(read('leaders-app/src/screens/Journey.jsx')).not.toContain("hour: '2-digit'");
    expect(read('leaders-app/src/screens/Activities.jsx')).toContain("import { fmtDay, fmtTime } from '../journey-copy.js'");
  });
});

describe('«تكمل ما بقي من قائمة التحقق» فقط إن بقي شيء (البند 10)', () => {
  const it0 = (code, status, extra = {}) => ({ id: code, code, status, required: true, ...extra });
  it('اعتماد المسار ينتظر المستشار، والمقفل والمنجز لا يُحسبان', () => {
    const waiting = [st('profile', 'admission', 'done', { items: [it0('P-INFO', 'done')] }), st('approval', 'admission', 'active', { items: [it0('AP-OK', 'pending')] }),
      st('training', 'qualification', 'locked', { items: [it0('T-HB', 'pending')] })];
    expect(leftToDo(waiting)).toBe(false);
    expect(leftToDo([...waiting, st('extra', 'admission', 'active', { items: [it0('P-CV', 'pending')] })])).toBe(true);
    expect(leftToDo([st('x', 'admission', 'active', { items: [it0('X', 'returned')] })])).toBe(true);
    expect(leftToDo(undefined)).toBe(false);
  });
  it('البطاقة تختار الجملة بها', () => {
    const src = read('leaders-app/src/Onboarding.jsx');
    expect(src).toContain('leftToDo(me.journey)');
    expect(src).toContain('لا شيء مطلوب منك');
  });
});

describe('رسالة رفض الخادم update_required تحمل زر «حدّث» (البند 2)', () => {
  const mount = async (props) => {
    const host = document.body.appendChild(document.createElement('div'));
    const r = createRoot(host);
    await act(async () => { r.render(<UpdateRefusal {...props} />); });
    return { host, r, box: () => host.querySelector('[data-testid="update-refusal"]'), btn: () => host.querySelector('.update-bar-btn') };
  };
  const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  it('لا تظهر بلا رفض، وتظهر برسالة الخادم وزر «حدّث»، وتبقى حتى «إغلاق»', async () => {
    const u = createAppUpdate({ current: 'AAAA1111', fetchImpl: () => json({ build: 'BBBB2222' }) });
    const apply = vi.fn(() => Promise.resolve());
    const m = await mount({ update: () => u, apply, to: () => '/?tab=book', unsaved: () => false });
    expect(m.box()).toBeNull();
    await act(async () => { updateRefusal.set('حدّث الصفحة للمتابعة'); });
    expect(m.box().getAttribute('role')).toBe('alert');
    expect(m.box().textContent).toContain('حدّث الصفحة للمتابعة');
    expect(m.btn().textContent).toBe('حدّث');
    // على الموقع إصدار أحدث: «حدّث» يفتح القسم الحالي بفعل الشريط نفسه
    await act(async () => { m.btn().click(); });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0].to()).toBe('/?tab=book');
    await act(async () => { [...m.host.querySelectorAll('button')].find((b) => b.textContent === 'إغلاق').click(); });
    expect(m.box()).toBeNull();
    await act(async () => { m.r.unmount(); });
  });
  it('الموقع ما زال على البناء نفسه: لا إعادة تحميل لا تغيّر شيئًا، ويُقال ذلك ويبقى الزر', async () => {
    const u = createAppUpdate({ current: 'AAAA1111', fetchImpl: () => json({ build: 'AAAA1111' }) });
    const apply = vi.fn(() => Promise.resolve());
    const m = await mount({ update: () => u, apply, unsaved: () => false });
    await act(async () => { updateRefusal.set(''); });
    expect(m.box().textContent).toContain(DEFAULT_REFUSAL_AR);
    await act(async () => { m.btn().click(); });
    expect(apply).not.toHaveBeenCalled();
    expect(m.box().textContent).toContain(NOT_YET_AR);
    expect(m.btn().disabled).toBe(false);
    await act(async () => { m.r.unmount(); });
  });
  it('في الصفحة ما لم يُحفظ: أول نقرة تنبه، والثانية «حدّث دون حفظ»', async () => {
    const u = createAppUpdate({ current: 'AAAA1111', fetchImpl: () => json({ build: 'BBBB2222' }) });
    const apply = vi.fn(() => Promise.resolve());
    const m = await mount({ update: () => u, apply, unsaved: () => true });
    await act(async () => { updateRefusal.set('حدّث الصفحة للمتابعة'); });
    await act(async () => { m.btn().click(); });
    expect(apply).not.toHaveBeenCalled();
    expect(m.box().textContent).toContain(UNSAVED_AR);
    expect(m.btn().textContent).toBe('حدّث دون حفظ');
    await act(async () => { m.btn().click(); });
    expect(apply).toHaveBeenCalledTimes(1);
    await act(async () => { m.r.unmount(); });
  });
  it('api.js يكتب رسالة الرفض لرمز update_required وحده، ومنطق الإصدار لم يُمس', () => {
    const api = read('leaders-app/src/api.js');
    expect(api).toContain("if (res?.code === 'update_required') updateRefusal.set(res.message);");
    expect(api).toContain("if (res?.code === 'update_required' || res?.code === 'unknown_action') appUpdate()?.serverSaid(res.code);");
    expect(read('leaders-app/src/main.jsx')).toContain('<UpdateRefusal to={viewHref} />');
  });
});

describe('الشريطان ثابتان تحت الترويسة (البند 2)', () => {
  it('ارتفاع الترويسة يُكتب في ‎--topbar-h‎ ويتبع ظهورها وزوالها', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const rootEl = document.getElementById('root');
    const stop = trackTopbarHeight(window);
    expect(document.documentElement.style.getPropertyValue('--topbar-h')).toBe('0px');
    const bar = document.createElement('header'); bar.className = 'topbar';
    bar.getBoundingClientRect = () => ({ height: 67.4 });
    rootEl.appendChild(bar);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.style.getPropertyValue('--topbar-h')).toBe('67px');
    bar.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.style.getPropertyValue('--topbar-h')).toBe('0px');
    stop();
  });
  it('الأنماط: الشريطان sticky تحت الترويسة، وشريط التحديث يُرتَّب بعدها', () => {
    const css = read('leaders-app/src/styles.css');
    expect(css).toContain('#root > .update-bar, #root > .offline-bar { position: sticky; top: var(--topbar-h, 0px); }');
    expect(css).toContain('#root > .skip-link, #root > .topbar { order: -1; }');
  });
});

describe('حراس على المصدر والأنماط لبقية البنود', () => {
  const css = read('leaders-app/src/styles.css');
  const journey = read('leaders-app/src/screens/Journey.jsx');
  it('البند 1: صف باب القراءة عنوانه سطر كامل على الشاشة الضيقة كصف الجلسة', () => {
    expect(read('leaders-app/src/screens/Activities.jsx')).toContain('<li key={c.id} className="act-read">');
    expect(css).toContain('@media (max-width: 620px) { .act-read > .grow { flex-basis: 100%; } }');
  });
  it('البند 4: تلميح «يُفتح القياس البعدي» للمرحلة المقفلة وحدها', () => {
    expect(journey).toContain("!(item.code === 'E-POST' && open)");
  });
  it('البند 8: سؤال النص مربوط بحقله، والنجمة 44', () => {
    expect(journey).toContain('<label htmlFor={`sv-${item.id}-${q.key}`}>');
    expect(journey).toContain('<textarea id={`sv-${item.id}-${q.key}`}');
    expect(css).toContain('.rx-stars button { width: 44px; height: 44px;');
  });
  it('البند 9: «اذهب إليها» تحمل البند نفسه', () => {
    expect(journey).toContain('goTo(next.stage.key, next.item.id)');
    expect(journey).toContain('id={`item-${item.id}`}');
  });
});
