// ════════════════════════════════════════════════════════════════
// معالج البداية: أربع خطوات تُشتق من حالة المشارك على الخادم، بلا عمود جديد
// ════════════════════════════════════════════════════════════════
// الخطوات: 1 أهلًا بك (الفيديو) ← 2 عرّفنا بك (الملف) ← 3 نقطة انطلاقك (القياس، وقبله رسومه لغير المرعي)
// ← 4 ما بعد ذلك (بطاقة في الرحلة حتى الاعتماد). المصدر الواحد لحالة 2 و3: بوابات gates.js نفسها
// التي توجّه App.jsx؛ وخطوتا 1 و4 راحة عرض تُغلق مرة واحدة بالمخزن المحلي (كبطاقة الترحيب).
// التصور: docs/journey/2026-11-05-تصور-الفيديو-التعريفي-ومعالج-البداية-v2.md
import React from 'react';
import { PARTICIPANT_VIDEO as VIDEO } from '../../shared/video/scenes.js';
import { gateDone, gateStage } from './gates.js';
import { nextSeen, welcomeSeen } from './api.js';
import IntroVideo, { IntroPlayer } from './IntroVideo.jsx';

// العدّاد الواحد لخطوات البداية: منه رأس الخطوات وحده، ولا تكتب الشاشات عدّادًا خاصًا بها.
// المدد من مصادرها: الفيديو من scenes.js، والقياس من مرحلته في الرحلة (يملؤها الخادم من est_minutes للأداة الفعالة)
export const ONBOARDING_STEPS = [
  { key: 'welcome', title: 'أهلًا بك', minutes: VIDEO.duration_ar },
  { key: 'profile', title: 'عرّفنا بك', minutes: 'دقيقتان' },
  { key: 'assessment', title: 'نقطة انطلاقك', minutes: null },
  { key: 'next', title: 'ما بعد ذلك', minutes: 'دقيقة' },
];
export const stepTitle = (key) => ONBOARDING_STEPS.find((s) => s.key === key)?.title;

// مدة القياس كما تعرضها الرحلة؛ رمز لم يُملأ أو غياب المرحلة لا يُظهر رقمًا مخترعًا
export function assessmentMinutes(me) {
  const label = gateStage(me, 'assessment')?.duration_label;
  return label && !label.includes('{') ? label : null;
}
// مدة الاعتماد من مرحلته، كما في بطاقة «ما بعد ذلك»
const approvalWait = (me) => me?.journey?.find((s) => s.key === 'approval')?.duration_label || 'أيام عمل قليلة';

// الخطوة الحالية أو null حين لا معالج (الرحلة مفتوحة أو الحساب ليس مشاركًا)
// flags: assessmentPaywall (بوابة الدفع تسبق القياس)، welcomeSeen وnextSeen (لاختبار الدالة بلا متصفح)
export function onboardingStep(me, flags = {}) {
  if (!me?.participant || !Array.isArray(me.journey)) return null;
  const seenWelcome = flags.welcomeSeen ?? !!welcomeSeen.get();
  const seenNext = flags.nextSeen ?? !!nextSeen.get();
  if (!gateDone(me, 'profile')) return step(me, seenWelcome ? 'profile' : 'welcome');
  if (!gateDone(me, 'assessment')) return step(me, 'assessment', flags.assessmentPaywall ? 'رسوم القياس' : undefined);
  if (!me.profile?.approved && !seenNext) return step(me, 'next');
  return null;
}
function step(me, key, title) {
  const index = ONBOARDING_STEPS.findIndex((s) => s.key === key);
  const steps = ONBOARDING_STEPS.map((s) => (s.key === 'assessment' ? { ...s, minutes: assessmentMinutes(me) } : s));
  return { ...steps[index], ...(title && { title }), index, n: index + 1, total: steps.length, steps };
}

// رأس الخطوات فوق شاشة الخطوة الحالية
export function OnboardingRail({ step }) {
  if (!step) return null;
  return (
    <nav className="onb" aria-label="خطوات البداية">
      <ol>
        {(step.steps || ONBOARDING_STEPS).map((s, i) => (
          <li key={s.key} className={i < step.index ? 'done' : i === step.index ? 'on' : ''} aria-current={i === step.index ? 'step' : undefined}>
            <span className="onb-dot" aria-hidden="true">{i < step.index ? '✓' : i + 1}</span>
            <span className="onb-title">{i === step.index ? step.title : s.title}</span>
            {s.minutes && <span className="onb-min small muted">{s.minutes}</span>}
          </li>
        ))}
      </ol>
      <p className="small muted onb-count">الخطوة {step.n} من {step.total}</p>
    </nav>
  );
}

// الخطوة 1: الترحيب والفيديو وما سيحدث
export function OnboardingWelcome({ me, step, onStart }) {
  const first = me.participant.full_name.split(' ')[0];
  const minutes = assessmentMinutes(me);
  return (
    <div className="page narrow">
      <OnboardingRail step={step} />
      <div className="card stack onb-welcome">
        <div>
          <p className="eyebrow">معالج البداية</p>
          <h1>أهلًا {first}، لنبدأ</h1>
          <p className="muted">{VIDEO.in_ar} ترى كيف تسير رحلتك، ثم ثلاث خطوات قصيرة تضعك فيها.</p>
        </div>
        <IntroPlayer />
        <ol className="onb-list">
          <li><b>عرّفنا بك</b> في دقيقتين، ليفهم المستشار سياقك.</li>
          <li><b>قياس مبدئي</b>{minutes ? ` في نحو ${minutes}` : ''} يحدد نقطة انطلاقك في كل إطار.</li>
          <li><b>اعتماد مسارك</b> خلال {approvalWait(me)}، ثم تُفتح رحلتك كاملة.</li>
        </ol>
        <button type="button" className="btn block" onClick={onStart}>لنبدأ</button>
      </div>
    </div>
  );
}

// الخطوة 4: بطاقة في الرحلة بعد إرسال القياس وحتى الاعتماد
export function OnboardingNextCard({ me, onClose }) {
  const wait = approvalWait(me);
  return (
    <div className="banner mist onb-next" role="status">
      <span className="ico" aria-hidden="true">🎯</span>
      <div className="grow">
        <b>أرسلت قياسك. ما بعد ذلك:</b>
        <ol className="small">
          <li>يراجع المستشار نتيجتك ويعتمد مسارك خلال {wait}، ويصلك بريد حين يكتمل.</li>
          <li>حتى ذلك الحين تكمل ما بقي من قائمة التحقق أدناه، وتفعّل مفتاح المرور لدخول أسرع.</li>
          <li>بعد الاعتماد تُفتح لك: كتيبك، ومبادرتك، والقاعة، وطلبات الأقران.</li>
        </ol>
        <IntroVideo className="link small" label="أعد مشاهدة الفيديو التعريفي" />
      </div>
      <button type="button" className="link small" onClick={onClose}>فهمت</button>
    </div>
  );
}
