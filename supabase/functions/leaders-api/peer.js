// ════════════════════════════════════════════════════════════════
// طلبات الأقران وتأكيد الخبير (المرحلة 8): المنطق النقي المشترك بين الخادم والتطبيقين والاختبارات
// ════════════════════════════════════════════════════════════════
// المشارك يرفع «طلب توجيه» (سؤال أو جزء من مشروعه)، فيظهر لأعضاء الفريق المعني في دفعته فيجيبون،
// ثم يؤكّد الخبير الإجابة أو يصحّحها أو يخفيها. نمط الإشراف لكل دفعة (cohorts.supervision):
//   peers_expert  الأقران يجيبون ويؤكّد الخبير (الافتراضي)
//   expert_only   الطلب يذهب إلى مستشار الدفعة وحده ولا يجيب الأقران
//   mixed         الأقران والخبير يجيبان معًا
// الاسم يظهر دائمًا على الإسهام (قرار «احترام اسم صاحب الإسهام» في التصور المعتمد)؛ يُغيَّر من PEER_NAMES.
import { HALL_TEAMS, HALL_TEAM_AR } from './hall.js';

export const SUPERVISION_AR = {
  peers_expert: 'الأقران يجيبون ويؤكّد الخبير',
  expert_only: 'الخبير وحده يجيب',
  mixed: 'الأقران والخبير يجيبان معًا',
};
export const SUPERVISION_DEFAULT = 'peers_expert';
export const PEER_SOURCE_AR = { sentence: 'جملة في «كاتون»', milestone: 'معلم', capstone: 'المبادرة', free: 'سؤال حر' };
export const PEER_STATUS_AR = { open: 'بانتظار إجابة', answered: 'أُجيب، بانتظار تأكيد الخبير', confirmed: 'أكّده الخبير', closed: 'أُغلق' };
export const PEER_ANSWER_STATUS_AR = { pending: 'بانتظار تأكيد الخبير', confirmed: 'أكّده الخبير', corrected: 'صحّحه الخبير', hidden: 'أخفاه الخبير' };
// الإسهام المؤكَّد مصدر في التقييم المستمر: مؤكَّد كاملًا، ومصحَّح جزئيًا، والمخفي لا يُحتسب
export const PEER_PCT = { confirmed: 100, corrected: 60 };
export const PEER_NAMES = 'always';   // always | after_confirm
export const PEER_TEXT_MAX = 2000;

const TEXT_MIN = 10;

/** نص الطلب أو الإجابة: بلا فراغات زائدة، بين 10 و2000 حرف */
export function cleanPeerText(raw, what = 'النص') {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < TEXT_MIN) throw new Error(`${what} قصير جدًا؛ اكتب عشرة أحرف على الأقل`);
  return t.slice(0, PEER_TEXT_MAX);
}

/** نمط الإشراف كما يُحفظ: قيمة معروفة أو الافتراضي */
export const cleanSupervision = (v) => (Object.hasOwn(SUPERVISION_AR, v) ? v : SUPERVISION_DEFAULT);

/** الطلب كما يُحفظ: المصدر والمرجع والفريق المستهدف بحسب نمط الإشراف */
export function cleanPeerRequest(b, supervision = SUPERVISION_DEFAULT) {
  const text = cleanPeerText(b?.text, 'الطلب');
  const source = Object.hasOwn(PEER_SOURCE_AR, b?.source) ? b.source : 'free';
  const ref_id = source !== 'free' && /^[0-9a-f-]{36}$/.test(String(b?.ref_id || '')) ? String(b.ref_id) : null;
  // في «الخبير وحده» لا فريق: الطلب للمستشار مباشرة
  const target_team = supervision === 'expert_only' ? null : HALL_TEAMS.includes(b?.target_team) ? b.target_team : null;
  return { text, source, ref_id, target_team };
}

/** هل يحق لهذا العضو أن يجيب عن الطلب؟ null = نعم، وإلا السبب */
export function answerBlock(request, member, supervision = SUPERVISION_DEFAULT) {
  if (supervision === 'expert_only') return 'في هذه الدفعة يجيب الخبير وحده';
  if (!request || request.status === 'closed') return 'الطلب مغلق';
  if (request.participant_id === member?.id) return 'لا تجيب عن طلبك';
  if (request.target_team && member?.team !== request.target_team) return `الطلب موجّه إلى ${HALL_TEAM_AR[request.target_team]}`;
  return null;
}

/** حالة الطلب بعد تغيّر إجاباته
 * @param {any[]} [answers] */
export function requestStatusFor(answers = [], current = 'open') {
  if (current === 'closed') return 'closed';
  const live = answers.filter((a) => a.status !== 'hidden');
  if (live.some((a) => a.status === 'confirmed' || a.status === 'corrected')) return 'confirmed';
  return live.length ? 'answered' : 'open';
}

/** اسم المجيب كما يراه الآخرون بحسب سياسة الأسماء */
export function authorNameFor(answer, name) {
  if (PEER_NAMES === 'always' || answer?.status === 'confirmed' || answer?.status === 'corrected') return name || 'زميل';
  return 'زميل (يظهر اسمه بعد التأكيد)';
}

/** أحداث التقييم المستمر من إسهامات العضو المؤكَّدة
 * @param {any[]} [answers] */
export function peerEvents(answers = []) {
  return answers.filter((a) => Object.hasOwn(PEER_PCT, a.status)).map((a) => ({
    at: a.confirmed_at || a.updated_at, status: a.status, pct: PEER_PCT[a.status],
    label: a.status === 'corrected' ? 'إسهام صحّحه الخبير' : 'إسهام أكّده الخبير',
  }));
}

/** «المطلوب منك الآن» للخبير: سطر لكل ما ينتظر فعله في ملف المشارك
 * @param {{ submissions?: any[], milestones?: any[], final?: any, peerAnswers?: any[], sessions?: any[] }} [src] */
export function needsFor({ submissions = [], milestones = [], final = null, peerAnswers = [], sessions = [] } = {}) {
  const out = [];
  const sub = submissions.filter((s) => s.status === 'submitted').length;
  if (sub) out.push({ key: 'submissions', n: sub, text: `${sub} تسليم بانتظار تقييمك` });
  const late = milestones.filter((m) => m.status === 'late').length;
  if (late) out.push({ key: 'milestones', n: late, text: `${late} معلم متأخر بلا اعتماد` });
  const unrated = milestones.filter((m) => m.done && !Object.keys(m.scores || {}).length).length;
  if (unrated) out.push({ key: 'rubric', n: unrated, text: `${unrated} معلم منجز بلا تقييم بالمعيار` });
  if (final?.status === 'pending') out.push({ key: 'final', n: 1, text: 'تقييم ختامي بانتظار اعتمادك' });
  if (final?.status === 'returned') out.push({ key: 'final_returned', n: 1, text: 'تقييم ختامي أُعيد للمراجعة' });
  const pa = peerAnswers.filter((a) => a.status === 'pending').length;
  if (pa) out.push({ key: 'peer', n: pa, text: `${pa} إجابة من زملائه بانتظار تأكيدك` });
  const toRate = sessions.filter((s) => s.to_rate).length;
  if (toRate) out.push({ key: 'rate', n: toRate, text: `${toRate} جلسة بانتظار تقديرك` });
  return out;
}
