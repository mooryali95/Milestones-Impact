// ════════════════════════════════════════════════════════════════
// مراجعة نماذج مبادرتي: «بوابتان، والباقي ملاحظات» (قرار المالك 2026-11-23)
// ════════════════════════════════════════════════════════════════
// دوال صرفة يشترك فيها الخادم (model-digest.ts وadmin.ts) ولوحة الإدارة وبوابة الخبير، فلا تُكتب القاعدة مرتين:
// • التسليم يُحتسب فورًا، والمراجع يقرأ ويكتب ملاحظة أو يطلب تعديلًا. بطاقة المبادرة وحدها بوابة تنتظر الاعتماد.
// • المراجع مستشار المشارك الفعلي (advisorOf)، وبلا مستشار فريق البرنامج (الإدارة، بريد LEADERS_ALERT_EMAIL).
// • يصل المراجعَ ملخص يومي بما سُلّم منذ آخر ملخص، مجمّعًا بالمشارك. والبطاقة وحدها تُبلَّغ فور تسليمها لأنها تحبس المشارك.
import { CHARTER_KEY } from './capstone.js';

// ساعة الملخص اليومي بتوقيت الرياض: يخرج في أول تشغيل للمهمة الساعية بعدها (الدقيقة 17، فنحو 8:17)
export const MODEL_DIGEST_HOUR = 8;
export const MODEL_DIGEST_SUBJECT = 'ما سُلّم من نماذج منذ أمس';

// النموذج البوابة: بطاقة المبادرة، اعتمادها قرار يسبق بناء الوثيقة
export const isGateModel = (key) => key === CHARTER_KEY;

// فصل في وثيقة المبادرة غير البطاقة («الوثيقة الحية»، 2026-11-25): المراجع يكتب ملاحظة لا تقفله، ولا يُعاد وحده.
// m: { key, capstone_sort }. النموذج خارج الوثيقة يبقى كما كان (ملاحظة أو «يحتاج تعديلًا»)
export const chapterNoteOnly = (m) => !!m && m.capstone_sort != null && !isGateModel(m.key);

// من يراجع: advisor أو team
export const reviewerKind = (adv) => (adv ? 'advisor' : 'team');

// هل ينتظر التسليم الملخص؟ مسلَّم ولم يدخل ملخصًا بعد آخر تسليم له (إعادة التسليم بعد تعديل تدخل الملخص التالي)
// و«الوثيقة الحية»: فصل قرأه المراجع ثم عدّله المشارك يدخل الملخص أيضًا (تغيّر منذ قراءته)، مرة لكل تغيير
const ms = (x) => (x ? Date.parse(x) : 0);
export function needsDigest(s) {
  if (s?.status === 'reviewed' && s.updated_at && s.reviewed_at && ms(s.updated_at) > ms(s.reviewed_at) + 1000) return ms(s.digested_at) < ms(s.updated_at);
  if (s?.status !== 'submitted' || !s.submitted_at) return false;
  if (!s.digested_at) return true;
  return Date.parse(s.digested_at) < Date.parse(s.submitted_at);
}

// تجميع ما ينتظر الملخص بالمراجع ثم بالمشارك.
// rows: تسليمات بحقولها (participant_id, status, submitted_at, digested_at, participants{full_name,is_demo}, learning_models{key,title_ar})
// reviewers: Map معرّف المشارك ← خبيره (أو null: فريق البرنامج). مشارك غائب عن الخريطة لم يُعرف مراجعه الآن فيُترك لليوم التالي
// يعيد: [{ key, kind, reviewer, total, ids, participants: [{ id, name, count, titles }] }]، الفريق آخرًا، والمشاركون بالأحدث تسليمًا
export function digestGroups(rows, reviewers) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!needsDigest(r) || r.participants?.is_demo || isGateModel(r.learning_models?.key)) continue;
    if (!reviewers.has(r.participant_id)) continue;
    const adv = reviewers.get(r.participant_id);
    const key = adv ? adv.id : 'team';
    if (!groups.has(key)) groups.set(key, { key, kind: reviewerKind(adv), reviewer: adv || null, total: 0, ids: [], people: new Map() });
    const g = groups.get(key);
    g.total += 1;
    g.ids.push(r.id);
    if (!g.people.has(r.participant_id)) g.people.set(r.participant_id, { id: r.participant_id, name: r.participants?.full_name || '', count: 0, titles: [], last: '' });
    const p = g.people.get(r.participant_id);
    p.count += 1;
    if (r.learning_models?.title_ar) p.titles.push(r.learning_models.title_ar);
    if (String(r.submitted_at) > p.last) p.last = String(r.submitted_at);
  }
  return [...groups.values()]
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'team' ? 1 : -1))
    .map(({ people, ...g }) => ({ ...g, participants: [...people.values()].sort((a, b) => b.last.localeCompare(a.last)).map(({ last: _l, ...p }) => p) }));
}

// قائمة «للقراءة»: ما سُلّم ولم يُقرأ، مجمّعًا بالمشارك والأحدث أولًا. البطاقة تُستثنى لأنها قرار يُعتمد واحدًا واحدًا (gates)
// items: تسليمات القائمة كما يعيدها الخادم (participants وlearning_models مضمّنة). noAdvisor: Set معرّفات المشاركين بلا مستشار
export function readingList(items, noAdvisor = new Set()) {
  const groups = new Map();
  const gates = [];
  for (const x of items || []) {
    if (x.status !== 'submitted') continue;
    if (isGateModel(x.learning_models?.key)) { gates.push(x); continue; }
    if (!groups.has(x.participant_id)) groups.set(x.participant_id, { id: x.participant_id, name: x.participants?.full_name || '', org: x.participants?.organization_name || '', items: [], last: '', team: noAdvisor.has(x.participant_id) });
    const g = groups.get(x.participant_id);
    g.items.push(x);
    if (String(x.submitted_at || '') > g.last) g.last = String(x.submitted_at || '');
  }
  const list = [...groups.values()].sort((a, b) => b.last.localeCompare(a.last));
  for (const g of list) g.items.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
  return { groups: list, gates };
}

// العدّ الواحد لـ«للقراءة» وبطاقات الاعتماد: من readingList نفسها، فلا يختلف عدّاد الكتيب وصندوق «ينتظرني» عن القائمة.
// rows: تسليمات بـstatus وlearning_models{key} وparticipants{is_demo} إن قُرئت. الحساب التجريبي لا يُعدّ (كـlisted في الخادم)
// يعيد { read: عدد ما ينتظر القراءة (المسلَّم غير المقروء، بلا البطاقة)، gates: عدد بطاقات المبادرة بانتظار الاعتماد }
export function readingCounts(rows) {
  const live = (rows || []).filter((x) => !x.participants?.is_demo);
  const { groups, gates } = readingList(live);
  // optional-exempt: عدّ تسليمات نماذج في قائمة القراءة، لا بنود رحلة ولا نشاط اختياري
  return { read: groups.reduce((n, g) => n + g.items.length, 0), gates: gates.length };
}

// «قرأتها كلها»: معرّفات ما يُعلَّم مقروءًا لمشارك واحد. المسلَّم وحده، والبطاقة لا تُعتمد جملةً
export function bulkReadIds(items, participantId) {
  return (items || []).filter((x) => x.participant_id === participantId && x.status === 'submitted' && !isGateModel(x.learning_models?.key)).map((x) => x.id);
}
