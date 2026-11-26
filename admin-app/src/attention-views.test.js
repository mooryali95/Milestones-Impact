// العرض الافتراضي «يحتاج تدخلًا» في طلبات الإسناد، وتصفيتا «قيد البناء» و«الكل» في مشاريع التخرج (المرحلة 1 من تصور لوحة الإدارة)
import { applyFilters, presetCounts } from './filters.js';
import { ATTENTION, attentionRank, attentionReason, byAttention, needsAttention, REQ_PRESETS, requestView } from './screens/ExpertMatch.jsx';
import { CAP_PRESETS, capEmpty } from './screens/Capstones.jsx';
import { gridAfterBoardLink } from './screens/Experts.jsx';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const H = 36e5;
const at = (h) => new Date(NOW + h * H).toISOString();

describe('طلبات الإسناد: «يحتاج تدخلًا»', () => {
  const reqs = [
    { id: 'ok-offer', status: 'offered', expires_at: at(20), created_at: at(-4) },
    { id: 'acc-old', status: 'accepted', accepted_at: at(-24 * 40), created_at: at(-24 * 41) },
    { id: 'soon', status: 'offered', expires_at: at(2), created_at: at(-22) },
    { id: 'un-new', status: 'unmatched', created_at: at(-1) },
    { id: 'un-old', status: 'unmatched', created_at: at(-50) },
    { id: 'acc-new', status: 'accepted', accepted_at: at(-24 * 3), created_at: at(-24 * 4) },
    { id: 'open-stuck', status: 'open', created_at: at(-30) },
    { id: 'open-new', status: 'open', created_at: at(-1) },
    { id: 'done', status: 'completed', created_at: at(-24 * 90) },
    { id: 'gone', status: 'cancelled', created_at: at(-24 * 90) },
  ];

  it('الطلب بلا خبير يحتاج تدخلًا دائمًا، وهو ما كان العرض الافتراضي القديم «قائمة» يخفيه', () => {
    const live = REQ_PRESETS.find((p) => p.key === 'live');
    expect(live.test(reqs[3])).toBe(false);
    expect(needsAttention(reqs[3], NOW)).toBe(true);
  });

  it('المعروض يحتاج تدخلًا حين تقترب مهلته، والمقبول حين يطول، والمفتوح حين لم يُعرض بعد يوم', () => {
    const ids = reqs.filter((x) => needsAttention(x, NOW)).map((x) => x.id);
    expect(ids.sort()).toEqual(['acc-old', 'open-stuck', 'soon', 'un-new', 'un-old']);
    expect(attentionRank({ status: 'offered', expires_at: at(ATTENTION.offerHours) }, NOW)).toBe(1);
    expect(attentionRank({ status: 'offered', expires_at: at(ATTENTION.offerHours + 0.1) }, NOW)).toBeNull();
    expect(attentionRank({ status: 'offered', expires_at: at(-1) }, NOW)).toBe(1);
  });

  it('الترتيب: بلا خبير الأقدم أولًا، ثم المعروض الأقرب انتهاءً، ثم المفتوح العالق، ثم المقبول القديم', () => {
    const hit = applyFilters(reqs, { presets: REQ_PRESETS }, { view: 'attention' }, NOW);
    expect(byAttention(hit, NOW).map((x) => x.id)).toEqual(['un-old', 'un-new', 'soon', 'open-stuck', 'acc-old']);
  });

  it('العدد على الرقاقة يحسب بالوقت نفسه', () => {
    expect(presetCounts(reqs, REQ_PRESETS, NOW)).toMatchObject({ attention: 5, live: 6, offered: 2, unmatched: 2 });
    expect(REQ_PRESETS[0]).toMatchObject({ key: 'attention', label: 'يحتاج تدخلًا' });
  });

  it('عرض اللوحة من الرابط (?view=attention من «ينتظرني») يُقبل، وعرض شبكة الخبراء أو غيره لا', () => {
    expect(requestView('view=attention')).toBe('attention');
    expect(requestView('view=unmatched&q=x')).toBe('unmatched');
    expect(requestView('view=applied')).toBe('');
    expect(requestView('')).toBe('');
  });
});

describe('مشاريع التخرج: «قيد البناء» و«الكل» ورسالة الفراغ', () => {
  const caps = [{ status: 'draft' }, { status: 'draft' }, { status: 'submitted' }, { status: 'approved' }];

  it('للمسودات تصفية، و«الكل» يعرض كل الحالات', () => {
    expect(CAP_PRESETS.map((p) => p.label)).toEqual(['بانتظار مراجعتك', 'بانتظار الراعي', 'انتهت مهلة الراعي', 'أُعيد للتحسين', 'معتمد', 'قيد البناء', 'الكل']);
    expect(presetCounts(caps, CAP_PRESETS)).toMatchObject({ draft: 2, submitted: 1, all: 4 });
    expect(applyFilters(caps, { presets: CAP_PRESETS }, { view: 'all' })).toHaveLength(4);
  });

  it('رسالة الفراغ بسببها، ولا تحيل إلى حالة لا تصفية لها', () => {
    expect(capEmpty({ view: 'submitted' }, 0).title).toBe('لا وثائق بعد');
    expect(capEmpty({ view: 'submitted', q: '', org: '', scope: '' }, 4)).toMatchObject({ title: 'لا وثائق في «بانتظار مراجعتك» الآن' });
    expect(capEmpty({ view: 'submitted' }, 4).hint).toMatch(/«الكل»/);
    expect(capEmpty({ view: 'submitted', q: 'مبادرة' }, 4).title).toBe('لا وثائق لهذه الفلاتر');
    expect(capEmpty({ view: 'all', org: 'جهة' }, 4).title).toBe('لا وثائق لهذه الفلاتر');
  });
});

describe('سبب الظهور في «يحتاج تدخلًا»', () => {
  it('لكل رتبة سطر بكلام المالك يميّز الصف عن الصف السليم', () => {
    expect(attentionReason({ status: 'unmatched', created_at: at(-1) }, NOW)).toBe('لم يُطابق خبير بعد');
    expect(attentionReason({ status: 'offered', expires_at: at(2.5) }, NOW)).toBe('تنتهي مهلة العرض خلال ساعتين');
    expect(attentionReason({ status: 'offered', expires_at: at(5) }, NOW)).toBe('تنتهي مهلة العرض خلال 5 ساعات');
    expect(attentionReason({ status: 'offered', expires_at: at(0.5) }, NOW)).toBe('تنتهي مهلة العرض خلال أقل من ساعة');
    expect(attentionReason({ status: 'offered', expires_at: at(-1) }, NOW)).toBe('فاتت مهلة العرض');
    expect(attentionReason({ status: 'open', created_at: at(-30) }, NOW)).toBe('مفتوح منذ 30 ساعة بلا عرض');
    expect(attentionReason({ status: 'open', created_at: at(-24 * 3) }, NOW)).toBe('مفتوح منذ 3 أيام بلا عرض');
    expect(attentionReason({ status: 'accepted', accepted_at: at(-24 * 34) }, NOW)).toBe('مقبول منذ 34 يومًا بلا إغلاق');
  });
  it('الصف السليم بلا سبب', () => {
    expect(attentionReason({ status: 'offered', expires_at: at(20) }, NOW)).toBe('');
    expect(attentionReason({ status: 'completed', created_at: at(-24 * 90) }, NOW)).toBe('');
  });
});

describe('شبكة الخبراء بعد رابط «ينتظرني»', () => {
  const linked = { q: '', view: 'attention', role: '', dim: '', level: '', source: '', committee: '', sort: '' };
  it('يُرفع عرض اللوحة وتعود فلاتر الجلسة التي تركها المدير', () => {
    expect(gridAfterBoardLink(linked, { q: 'سارة', view: 'attention', role: 'coach', dim: 'M', sort: '-joined' }))
      .toEqual({ ...linked, q: 'سارة', view: '', role: 'coach', dim: 'M', sort: '-joined' });
  });
  it('عرض الشبكة المحفوظ يعود كما تُرك', () => {
    expect(gridAfterBoardLink(linked, { view: 'applied' }).view).toBe('applied');
  });
  it('بلا جلسة سابقة: الشبكة بلا فلاتر', () => {
    expect(gridAfterBoardLink(linked, null)).toEqual({ ...linked, view: '' });
  });
});
