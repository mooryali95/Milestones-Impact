// ════════════════════════════════════════════════════════════════
// بوابات القبول: متى يُعرض الملف ومتى القياس
// ════════════════════════════════════════════════════════════════
// شاشة الملف تُكمل «بيانات الملف» (P-INFO) وحدها، وشاشة القياس تُكمل «إرسال القياس» (A-DONE) وحده.
// فالبوابة تُقرأ من متطلبها لا من اكتمال المرحلة كلها؛ وإلا صار أي متطلب إلزامي آخر يضيفه البرنامج
// في المرحلة نفسها (مثل «تسمية المبادرة») طريقًا مسدودًا لا يُكمَل من الشاشة ولا يُخرج منها.
// ما بقي من المرحلة يظهر في الرحلة ليكمله المشارك هناك.
export const GATE_CODE = { profile: 'P-INFO', assessment: 'A-DONE' };

const items = (me) => (me?.journey || []).flatMap((s) => s.items || []);
const stageDone = (me, key) => me?.journey?.find((s) => s.key === key)?.status === 'done';

export function gateDone(me, key) {
  const it = items(me).find((i) => i.code === GATE_CODE[key]);
  return it ? it.status === 'done' : stageDone(me, key);
}

// المرحلة التي فيها متطلب البوابة، وإلا المرحلة بالمفتاح نفسه: منها تُقرأ مدة الخطوة كما يعرضها الخادم
export function gateStage(me, key) {
  const journey = me?.journey || [];
  return journey.find((s) => (s.items || []).some((i) => i.code === GATE_CODE[key])) || journey.find((s) => s.key === key) || null;
}

// قسم «أثري» يُفتح حين تُفتح المرحلة التي فيها القياس البعدي (E-POST)، بالحكم نفسه الذي
// يطبقه الخادم في requirePostOpen: الأثر طور لا مرحلة، فلا يُبحث عن مرحلة باسمه
export function impactOpen(me) {
  const stage = (me?.journey || []).find((s) => (s.items || []).some((i) => i.code === 'E-POST'));
  return !stage || stage.status !== 'locked';
}
