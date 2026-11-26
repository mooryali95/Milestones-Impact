// عنصر «ينتظرك» في صندوق الخبير رابط إلى موضع إنجازه في لوحة /x، بحسب بادئة مرجعه (ref في participant_notifications).
// العرض لا رابط له في الصندوق (رابطه برمزه في بريده وحده)، فيُفتح قسم «طلبات بانتظار ردك» في اللوحة
export const XP_ACTION_ANCHORS = Object.freeze({
  offer: 'xp-offers',
  peer: 'xp-peer',
  f360: 'a360-h',
  model: 'xp-reviews',
  'rater-confirm': 'xp-mine',
});
export const xpActionAnchor = (ref) => (ref ? XP_ACTION_ANCHORS[String(ref).split(':')[0]] || null : null);
