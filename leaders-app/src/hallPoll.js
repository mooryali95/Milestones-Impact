// فاصل استطلاع القاعة بحسب حالها: ثوانٍ قليلة حين يجري شيء (التقسيم والجولة والكشف)،
// وأطول في الانتظار وقبل أن تُفتح، فلا يضرب خمسون جوالًا الخادم كل ثلاث ثوانٍ طوال الورشة
export const POLL_FAST_MS = 3000;
export const POLL_SLOW_MS = 8000;
export const pollPeriod = (v) => (v?.session && ['split', 'round', 'reveal'].includes(v.session.stage) ? POLL_FAST_MS : POLL_SLOW_MS);

// سؤال الحالة يتكرر كل ثوانٍ، فإخفاق واحد عابر (بوابة الدوال ترد 500 أحيانًا تحت الحمل) يصلحه السؤال التالي ولا يُعرض.
// يُعرض الخطأ حين تتوالى الإخفاقات هذا العدد، ويزول عند أول نجاح. الحد نفسه يحكم اختبار الحمل (hall-load.mjs)
export const POLL_FAIL_LIMIT = 3;
