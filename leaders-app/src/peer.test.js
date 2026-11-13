// طلبات الأقران وتأكيد الخبير (المرحلة 8) وملف المشارك للخبير (المرحلة 9): المنطق النقي
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerBlock, authorNameFor, cleanPeerRequest, cleanPeerText, cleanSupervision, needsFor, PEER_NAMES, requestStatusFor, SUPERVISION_AR, SUPERVISION_DEFAULT } from '../../supabase/functions/leaders-api/logic.js';
import { CONTINUOUS_SOURCE_AR } from '../../supabase/functions/leaders-api/labels.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('نمط الإشراف ونص الطلب', () => {
  it('ثلاثة أنماط معروفة والافتراضي الأقران ويؤكّد الخبير', () => {
    expect(Object.keys(SUPERVISION_AR)).toEqual(['peers_expert', 'expert_only', 'mixed']);
    expect(cleanSupervision('expert_only')).toBe('expert_only');
    expect(cleanSupervision('x')).toBe(SUPERVISION_DEFAULT);
  });
  it('النص يُنظَّف ويُقصّ ويُرفض القصير', () => {
    expect(cleanPeerText('  كيف   أبدأ سجل المعالم؟ ')).toBe('كيف أبدأ سجل المعالم؟');
    expect(() => cleanPeerText('قصير')).toThrow(/قصير/);
    expect(cleanPeerText('ن'.repeat(3000)).length).toBe(2000);
  });
  it('الطلب: المصدر والمرجع والفريق، وفي «الخبير وحده» لا فريق', () => {
    const r = cleanPeerRequest({ text: 'سؤال عن بوابة المرحلة الأولى', source: 'sentence', ref_id: '11111111-1111-1111-1111-111111111111', target_team: 'guide' });
    expect(r).toEqual({ text: 'سؤال عن بوابة المرحلة الأولى', source: 'sentence', ref_id: '11111111-1111-1111-1111-111111111111', target_team: 'guide' });
    expect(cleanPeerRequest({ text: 'سؤال عن بوابة المرحلة الأولى', source: 'free', ref_id: '11111111-1111-1111-1111-111111111111', target_team: 'hacker' })).toMatchObject({ source: 'free', ref_id: null, target_team: null });
    expect(cleanPeerRequest({ text: 'سؤال عن بوابة المرحلة الأولى', target_team: 'guide' }, 'expert_only').target_team).toBeNull();
  });
});

describe('من يجيب وما حالة الطلب', () => {
  const req = { participant_id: 'p1', status: 'open', target_team: 'guide' };
  it('لا يجيب صاحب الطلب، ولا غير الفريق المستهدف، ولا أحد في «الخبير وحده»', () => {
    expect(answerBlock(req, { id: 'p1', team: 'guide' })).toMatch(/طلبك/);
    expect(answerBlock(req, { id: 'p2', team: 'support' })).toMatch(/فريق التوجيه/);
    expect(answerBlock(req, { id: 'p2', team: 'guide' })).toBeNull();
    expect(answerBlock({ ...req, target_team: null }, { id: 'p2', team: null })).toBeNull();
    expect(answerBlock(req, { id: 'p2', team: 'guide' }, 'expert_only')).toMatch(/الخبير وحده/);
    expect(answerBlock({ ...req, status: 'closed' }, { id: 'p2', team: 'guide' })).toMatch(/مغلق/);
  });
  it('الحالة من الإجابات: مفتوح، أُجيب، أكّده الخبير؛ والمخفي لا يُحسب، والمغلق يبقى', () => {
    expect(requestStatusFor([])).toBe('open');
    expect(requestStatusFor([{ status: 'pending' }])).toBe('answered');
    expect(requestStatusFor([{ status: 'hidden' }])).toBe('open');
    expect(requestStatusFor([{ status: 'pending' }, { status: 'corrected' }])).toBe('confirmed');
    expect(requestStatusFor([{ status: 'confirmed' }], 'closed')).toBe('closed');
  });
  it('الاسم يظهر على الإسهام (قرار التصور)، والسياسة قابلة للتبديل من ثابت واحد', () => {
    expect(PEER_NAMES).toBe('always');
    expect(authorNameFor({ status: 'pending' }, 'سارة الأحمد')).toBe('سارة الأحمد');
    expect(authorNameFor({ status: 'pending' }, '')).toBe('زميل');
  });
});

describe('«المطلوب منك الآن» في ملف المشارك (المرحلة 9)', () => {
  it('سطر لكل ما ينتظر الخبير، ولا شيء حين لا شيء', () => {
    expect(needsFor({})).toEqual([]);
    const n = needsFor({
      submissions: [{ status: 'submitted' }, { status: 'reviewed' }],
      milestones: [{ status: 'late', done: false }, { status: 'done', done: true, scores: {} }, { status: 'done', done: true, scores: { impact: 3 } }],
      final: { status: 'pending' }, peerAnswers: [{ status: 'pending' }, { status: 'confirmed' }], sessions: [{ to_rate: true }],
    });
    expect(n.map((x) => x.key)).toEqual(['submissions', 'milestones', 'rubric', 'final', 'peer', 'rate']);
    expect(n.find((x) => x.key === 'peer').text).toContain('إجابة من زملائه');
    expect(needsFor({ final: { status: 'returned' } })[0].key).toBe('final_returned');
  });
});

describe('الحراس: المصدر الواحد لطلبات الأقران والملف', () => {
  it('peer مصدر في التقييم المستمر ووزنه في إعداد البرنامج، والترحيل يسجّل نفسه', () => {
    expect(CONTINUOUS_SOURCE_AR.peer).toBeTruthy();
    expect(read('supabase/functions/leaders-api/final.js')).toMatch(/sources: \{ quizzes: 1, models: 1, milestones: 1, lab: 1, katon: 0, peer: 1 \}/);
    const mig = read('supabase/migrations/20261105170000_leaders_peer_requests.sql');
    expect(mig).toMatch(/supervision text not null default 'peers_expert'/);
    expect(mig).toMatch(/create table if not exists leaders\.peer_requests/);
    expect(mig).toMatch(/create table if not exists leaders\.peer_answers/);
    const programs = read('supabase/functions/leaders-api/programs.ts');
    expect(programs).toMatch(/row\.supervision = cleanSupervision\(b\.supervision\)/);
    expect(programs).toMatch(/const COHORT_COLS = '\*';/);   // عمود لم يُرحَّل بعد لا يُفشل قراءة الدفعات
  });
  it('إجراءات الخبير في المسار الصحيح: الملف والختامي والمعالم والقاعة والأقران على xp.*، والخبير فاعل system في السجل', () => {
    const idx = read('supabase/functions/leaders-api/index.ts');
    for (const a of ['xp.participants', 'xp.participant', 'xp.final-eval-vote', 'xp.final-eval-save', 'xp.milestone', 'xp.hall-open', 'xp.hall-close', 'xp.peer-list', 'xp.peer-review', 'xp.peer-answer', 'peer.ask', 'peer.answer', 'admin.peer']) expect(idx, a).toContain(`'${a}'`);
    expect(idx).toMatch(/'admin\.participant': \(_a, b\) => FL\.participantFile\(/);   // المصدر الواحد للملف: الإدارة والخبير
    const file = read('supabase/functions/leaders-api/file.ts');
    expect(file).toMatch(/actor: 'system'/);
    // التصويت لمستشار الدفعة وحده، وبمفتاح الرؤية adv_final_edit (visibility.js): الحارسان في requireFinalEdit
    expect(file).toMatch(/async function requireFinalEdit\(e: any, b: Body\) \{[^\n]*await requireAdvisorOf\(e, pid\);[^\n]*'adv_final_edit'\)/);
    expect(file).toMatch(/await requireFinalEdit\(e, b\); return F\.vote/);
    expect(read('supabase/functions/leaders-api/peer.ts')).toMatch(/audit\('system', e\.email, `peer\.\$\{status\}`/);
    // القاعة من مكوّن واحد في اللوحة والبوابة
    expect(read('admin-app/src/screens/Hall.jsx')).toContain("import HallControl from '../../../shared/hall/HallControl.jsx'");
    expect(read('leaders-app/src/screens/ExpertPortal.jsx')).toContain("import HallControl, { HALL_UI_APP } from '../../../shared/hall/HallControl.jsx'");
    // وعد «كاتون» صار حقيقيًا: الملاحظة تُرفع طلب توجيه
    expect(read('leaders-app/src/KatonAnswer.jsx')).not.toContain('ليراها خبيرك وفريقك');
    expect(read('leaders-app/src/KatonAnswer.jsx')).toMatch(/onAsk\(note\.trim\(\)\)/);
  });
});
