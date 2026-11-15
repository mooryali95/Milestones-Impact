// فصل خدمة الرحلة عن لجان الكتاب (المرحلة 1، اعتمده المالك 2026-11-15): الأدوار للرحلة والعضوية للكتاب من السجل الواحد.
// قاعدة journeyApproved وشرط الاعتماد، وأن عضو اللجنة بلا دور لا يظهر في أي قائمة من الرحلة، والحارس على المصدر:
// كل موضع يقرأ الخبراء أو حالتهم المعتمدة في وحدات الخادم يمر بـjourneyApproved أو يُستثنى بتعليق مبرَّر.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coordTeamView, effectiveAdvisorId, EXPERT_APPROVED, journeyApproved, rankExperts, teamFirst, teamRows } from '../../supabase/functions/leaders-api/logic.js';
import { APPROVAL_NEEDS_AR, approvalBlock, CONTENT_NEEDS_DIM_AR, contentOnly, expertService } from '../../supabase/functions/leaders-api/committees.js';
import { bookAccess } from '../../supabase/functions/leaders-api/master-book.js';
import { rankForAdd } from '../../admin-app/src/team.js';
import { launchReadiness } from '../../supabase/functions/leaders-api/readiness.js';
import { cohortSetup } from '../../supabase/functions/leaders-api/cohort-setup.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const REVIEWER = { id: 'rv', full_name: 'هند', status: 'active', roles: [], committees: ['content'], dimensions: ['impact'], levels: ['beginner', 'intermediate', 'advanced'], weekly_hours: 10 };
const COACH = { id: 'co', full_name: 'سالم', status: 'active', roles: ['coach', 'advisor'], committees: [], dimensions: ['impact'], levels: ['beginner', 'intermediate', 'advanced'], weekly_hours: 10 };
const BOTH = { id: 'bo', full_name: 'نورة', status: 'active', roles: ['coach'], committees: ['content'], dimensions: ['impact'], levels: ['beginner'], weekly_hours: 10 };

describe('journeyApproved: معتمد وله دور', () => {
  it('الحالتان المعتمدتان مع دور واحد على الأقل، والثابت لا يتغير', () => {
    expect(EXPERT_APPROVED).toEqual(['active', 'paused']);
    expect(journeyApproved(COACH)).toBe(true);
    expect(journeyApproved({ ...COACH, status: 'paused' })).toBe(true);
    expect(journeyApproved(BOTH)).toBe(true);
    expect(journeyApproved(REVIEWER)).toBe(false);
    for (const status of ['invited', 'applied', 'suspended', 'rejected']) expect(journeyApproved({ ...COACH, status }), status).toBe(false);
    expect(journeyApproved({ status: 'active' })).toBe(false);
    expect(journeyApproved(null)).toBe(false);
    expect(journeyApproved(undefined)).toBe(false);
  });
  it('الخدمتان مشتقتان لا مخزنتان، والكتاب لعضو اللجنة وحده (bookAccess كما هي)', () => {
    expect(expertService(REVIEWER)).toEqual({ journey: false, content: true });
    expect(expertService(COACH)).toEqual({ journey: true, content: false });
    expect(expertService(BOTH)).toEqual({ journey: true, content: true });
    expect(contentOnly(REVIEWER)).toBe(true);
    expect(contentOnly(BOTH)).toBe(false);
    expect(contentOnly({ roles: [], committees: ['other'] })).toBe(false);
    expect(bookAccess(REVIEWER)).toBe(true);
    expect(bookAccess(COACH)).toBe(false);
    // الإيقاف والرفض يغلقان الخدمتين معًا
    for (const status of ['suspended', 'rejected']) {
      expect(bookAccess({ ...BOTH, status })).toBe(false);
      expect(journeyApproved({ ...BOTH, status })).toBe(false);
    }
  });
});

describe('شرط الاعتماد: دور أو لجنة، وإطار للجنة المحتوى', () => {
  it('approvalBlock', () => {
    expect(approvalBlock({ roles: [], committees: [] })).toBe(APPROVAL_NEEDS_AR);
    expect(APPROVAL_NEEDS_AR).toBe('حدّد دورًا في الرحلة أو عضوية في لجنة قبل الاعتماد');
    expect(approvalBlock({ roles: ['coach'], committees: [] })).toBe(null);
    expect(approvalBlock({ roles: [], committees: ['content'], dimensions: [] })).toBe(CONTENT_NEEDS_DIM_AR);
    expect(approvalBlock({ roles: [], committees: ['content'], dimensions: ['leadership'] })).toBe(null);
    expect(approvalBlock({ roles: [], committees: ['measurement'], dimensions: [] })).toBe(null);
    // قيمة غريبة في committees لا تُحسب عضوية
    expect(approvalBlock({ roles: [], committees: ['x'] })).toBe(APPROVAL_NEEDS_AR);
  });
  it('الخادم يعتمد بالقاعدة نفسها لا بشرط الأدوار القديم', () => {
    const src = read('supabase/functions/leaders-api/experts.ts');
    expect(src).not.toContain('حدّد دورًا واحدًا على الأقل قبل الاعتماد');
    expect(src).toMatch(/const block = to === 'active' \? approvalBlock\(e\) : null;/);
  });
});

describe('عضو اللجنة بلا دور لا يظهر في أي موضع من الرحلة', () => {
  const need = { role: 'coach', dimension: 'impact', level: 'beginner', sector: null };
  it('الترشيح و«اختر خبيرك» والعرض التلقائي (rankExperts ثم teamFirst)، ولو كان في فريق الدفعة', () => {
    const ranked = rankExperts([REVIEWER, COACH, BOTH], need);
    expect(ranked.map((e) => e.id).sort()).toEqual(['bo', 'co']);
    expect(teamFirst(ranked, ['rv']).map((e) => e.id)).not.toContain('rv');
  });
  it('المستشار الفعلي ومستشار المجموعة: المعتمدون للرحلة وحدهم', () => {
    const approved = [REVIEWER, COACH].filter(journeyApproved).map((e) => e.id);
    expect(effectiveAdvisorId({ group: 'rv', cohort: 'co' }, approved)).toBe('co');
    expect(effectiveAdvisorId({ group: null, cohort: 'rv' }, approved)).toBe(null);
  });
  it('«فريق البرنامج» عند منسق الجهة', () => {
    const rows = teamRows({ advisor_expert_id: 'rv' }, [{ expert_id: 'rv' }, { expert_id: 'co' }], [{ id: 'g', name: 'المجموعة', advisor_expert_id: 'rv' }]);
    const v = coordTeamView({ cohort: { name: 'د' }, rows, experts: [REVIEWER, COACH], groups: [{ id: 'g', name: 'المجموعة', advisor_expert_id: 'rv' }], members: [] }, { team: true });
    expect(v.advisor).toBeNull();
    expect(v.team.map((x) => x.full_name)).toEqual(['سالم']);
    expect(v.groups[0].expert).toBeNull();
  });
  it('البحث في «أضف إلى الفريق» في اللوحة', () => {
    const list = rankForAdd([REVIEWER, COACH, BOTH], { role: 'coach' }).map((e) => e.id);
    expect(list).toHaveLength(2);
    expect(list).not.toContain('rv');
    expect(rankForAdd([REVIEWER], { q: 'هند' })).toEqual([]);
  });
  it('قائمة الأقران وأفعال الرحلة في البوابة: حارس واحد في الموزع، وحارس في نطاق الملف', () => {
    const index = read('supabase/functions/leaders-api/index.ts');
    expect(index).toContain("if (E.portalWorking(e) && !journeyApproved(e) && !XP_NO_JOURNEY.has(action)) throw new Fail('هذا لخدمة الرحلة، ولوحتك للكتاب الأم', 403, 'journey');");
    expect(index).toContain("if (action.startsWith('xp.book')) await E.requirePledge(e);");
    // ما يُسمح به بلا خدمة رحلة: اللوحة والكتاب والملف والخروج والتبديل والاستبيان، لا مشارك ولا دفعة ولا قاعة
    const allowed = index.match(/const XP_NO_JOURNEY = new Set\(\[([^\]]+)\]\)/)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(allowed.sort()).toEqual(['xp.book', 'xp.book-comment', 'xp.book-comment-delete', 'xp.consent', 'xp.dashboard', 'xp.logout', 'xp.pledge', 'xp.profile-save', 'xp.sus-state', 'xp.sus-submit', 'xp.switch']);
    const file = read('supabase/functions/leaders-api/file.ts');
    for (const fn of ['export async function expertScope', 'async function requireAdvisorOf', 'async function requireAdvisorCohort']) {
      expect(file.slice(file.indexOf(fn), file.indexOf(fn) + 200), fn).toContain('requireJourney(e);');
    }
    expect(read('supabase/functions/leaders-api/peer.ts')).toContain('if (!journeyApproved(e)) return { cohorts: [] as any[], ids: new Set<string>() };');
  });
  it('البوابة: لا تكليفات ولا مشاركون ولا 360 لعضو اللجنة، ولا D18، والقارئ مباشرة بعد التعهد', () => {
    const index = read('supabase/functions/leaders-api/index.ts');
    expect(index).toContain('if (!d?.success || d.consent_needed || d.onboarding || !journeyApproved(e)) return d;');
    const portal = read('leaders-app/src/screens/ExpertPortal.jsx');
    expect(portal).toContain('const reading = book ?? (!!d.content_only && !!d.book_access);');
    expect(portal).toContain('if (reading && d.pledge_needed) {');
    expect(portal).toContain('if (d.content_only || d.no_service) return <ReviewerHome');
    // بعد التعهد تُعاد اللوحة كاملة (بطاقة الكتاب والتكليفات)، لا ردّ xp.pledge وحده
    expect(portal).toContain("const r = await xpCall('xp.pledge'); if (r.success) await load(); return r;");
  });
});

// ── حارس المصدر ──
// كل موضع يقرأ جدول الخبراء أو يفحص الحالة المعتمدة في وحدات الخادم يمر بـjourneyApproved داخل دالته، أو يحمل
// تعليق «journey-guard:» بسببه. ووحدات الكتاب الأم داخل الحارس منذ دمج #358: مواضعها قاعدة الكتاب (bookAccess) أو قائمة
// قرائه، فتحمل كل منها سببها بتعليق journey-guard لا باستثناء الوحدة كلها، فأي موضع جديد فيها بلا سبب يُمسك
const FN = join(root, 'supabase/functions/leaders-api');
// myParticipantIds يقرأ cohorts.advisor_expert_id لا جدول الخبراء، فمن يستدعيه يمر بالقاعدة كذلك (تسليمات المشاركين و360)
const SITE = /from\('experts'\)|EXPERT_APPROVED\.includes|\['active', 'paused'\]\.includes|\bAPPROVED\.includes\(|\bmyParticipantIds\(/;
const MODULE_EXEMPT = {
  'payments.ts': 'APPROVED فيه حالات المشارك المعتمد للدفع، لا حالة الخبير',
};
const DECL = /^(export\s+)?(async\s+)?function\s|^(export\s+)?const\s+\w+\s*(:[^=]+)?=|^\s{2}'[a-z0-9.-]+':\s/;
// حدود الدالة التي يقع فيها السطر: من تعليقاتها فوق التصريح إلى التصريح التالي في الملف
function enclosing(lines, i) {
  let d = i;
  while (d > 0 && !DECL.test(lines[d])) d--;
  let c = d;
  while (c > 0 && /^\s*\/\//.test(lines[c - 1])) c--;
  let e = i + 1;
  while (e < lines.length && !DECL.test(lines[e])) e++;
  return lines.slice(c, e).join('\n');
}
export function guardGaps(files) {
  const gaps = [];
  for (const [name, src] of files) {
    if (MODULE_EXEMPT[name]) continue;
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      if (!SITE.test(l) || /^\s*\/\//.test(l)) return;
      const body = enclosing(lines, i);
      // القاعدة في الشيفرة لا في تعليق يذكرها
      const code = body.split('\n').map((x) => x.replace(/(^|\s)\/\/.*$/, '')).join('\n');
      // موضع لكل قاعدة: دالة فيها موضعان وقاعدة واحدة تُمسك (إرجاع أحد مرشحَي cohortTeam دون الآخر)
      const sites = code.split('\n').filter((x) => SITE.test(x)).length;
      if ((code.match(/journeyApproved|requireJourney\(/g) || []).length >= sites) return;
      const why = body.match(/journey-guard:\s*(.+)/);
      if (why && why[1].trim().length >= 10) return;
      gaps.push(`${name}:${i + 1}`);
    });
  }
  return gaps;
}
describe('الكتاب الأم بعد دمج #358: المشاركة لأعضاء اللجان، والموقوف يقرأ، والعلامة المائية', () => {
  const mb = read('supabase/functions/leaders-api/master-book.ts');
  it('استعلام المشاركة يقرأ الأدوار ليُستبعد خبير الرحلة، ونافذة المشاركة لا تضيفه', () => {
    expect(mb).toContain("select('id, full_name, email, title, status, roles, committees')");
    expect(mb).toContain("select('id, full_name, status, roles, committees')");
    expect(mb).toContain("if (b?.on !== false && hasJourneyRole(e) && !hasCommittee(e)) throw");
  });
  it('العضو الموقوف مؤقتًا يقرأ ولا يكتب ولا يحذف، والعلامة المائية باسمه وبريده', () => {
    expect(mb).toContain("write: e.status === 'active', paused: e.status === 'paused', email: String(e.email || '')");
    expect(mb).toContain("if (v.kind === 'expert' && !v.write) throw new Fail('حسابك للقراءة فقط', 403, 'read_only');");
    expect(mb).toContain('watermark: watermark(v)');
    expect(read('shared/master-book/MasterBook.jsx')).toContain('<Watermark text={data.viewer.watermark} />');
    // السلوك نفسه في master_book_test.ts (Deno)؛ وهنا ما يُرى: فوق النوافذ وفي الطباعة
    const css = read('shared/master-book/master-book.css');
    expect(css).toMatch(/\.mb-wm \{[^}]*z-index: 70;/);
    expect(css).not.toMatch(/@media print \{ \.mb-wm \{ display: none/);
  });
});

describe('حارس الرحلة على المصدر', () => {
  const server = readdirSync(FN).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('_test.ts')).map((f) => [f, readFileSync(join(FN, f), 'utf8')]);
  const admin = ['admin-app/src/team.js', 'admin-app/src/screens/CohortTeam.jsx'].map((p) => [p, read(p)]);
  it('كل موضع في وحدات الخادم واللوحة يمر بـjourneyApproved أو يُستثنى بسبب مكتوب', () => {
    expect(guardGaps([...server, ...admin])).toEqual([]);
  });
  it('الحارس يمسك موضعًا جديدًا بلا القاعدة ولا سبب، ويقبل المستثنى بسبب', () => {
    const bad = "export async function leak() {\n  const { data } = await db.from('experts').select('id').eq('status', 'active');\n  return data;\n}\n";
    expect(guardGaps([['x.ts', bad]])).toEqual(['x.ts:2']);
    expect(guardGaps([['x.ts', bad.replace('export async', '// journey-guard: هوية صاحب البريد في مركز البريد\nexport async')]])).toEqual([]);
    expect(guardGaps([['x.ts', bad.replace('export async', '// journey-guard: لا\nexport async')]])).toEqual(['x.ts:3']);
    expect(guardGaps([['x.ts', bad.replace('return data;', 'return data.filter(journeyApproved);')]])).toEqual([]);
    // ذكر القاعدة في تعليق لا يكفي
    expect(guardGaps([['x.ts', bad.replace('return data;', '// يمر بـjourneyApproved لاحقًا\n  return data;')]])).toEqual(['x.ts:2']);
    expect(guardGaps([['y.ts', "const ok = list.filter((e) => EXPERT_APPROVED.includes(e.status));\n"]])).toEqual(['y.ts:1']);
    // موضعان في دالة واحدة بقاعدة واحدة: يُمسك الثاني
    const two = "export async function team() {\n  const a = (await db.from('experts').select('*')).data.filter(journeyApproved);\n  const b = (await db.from('experts').select('*')).data;\n  return [a, b];\n}\n";
    expect(guardGaps([['z.ts', two]])).toEqual(['z.ts:2', 'z.ts:3']);
    expect(guardGaps([['z.ts', two.replace('.data;', '.data.filter(journeyApproved);')]])).toEqual([]);
    // من يقرأ مشاركي المستشار من cohorts يمر بالقاعدة كذلك
    expect(guardGaps([['w.ts', "export async function reviews(e) {\n  const ids = await myParticipantIds(e.id);\n  return ids;\n}\n"]])).toEqual(['w.ts:2']);
  });
  it('الوحدات التي سمّاها التصور تمر بالقاعدة فعلًا لا بالاستثناء', () => {
    for (const f of ['advisor.ts', 'programs.ts', 'team.ts', 'activities.ts', 'peer.ts', 'insight.ts', 'experts.ts', 'file.ts', 'logic.js', 'index.ts']) {
      expect(read(`supabase/functions/leaders-api/${f}`), f).toContain('journeyApproved');
    }
    expect(read('supabase/functions/leaders-api/team.ts')).toMatch(/const EXPERT_COLS = '[^']*\bcommittees\b[^']*';/);
    expect(read('admin-app/src/team.js')).toContain('.filter(journeyApproved)');
    expect(read('admin-app/src/screens/CohortTeam.jsx')).toContain('journeyApproved(r.expert)');
  });
});

describe('جاهزية «المستشار الأساسي» لا تحتسب من لا يخدم في الرحلة', () => {
  const cohort = { id: 'c1', name: 'دفعة الهيئة', organization_id: 'o1', status: 'open', advisor_expert_id: 'x1' };
  it('بنود الإطلاق (م2): الإسناد على عضو لجنة بلا دور ناقص، وغياب القائمة يكتفي بالإسناد', () => {
    const rows = { organizations: [{ id: 'o1', name: 'الهيئة', status: 'active' }], cohorts: [cohort] };
    const adv = (r) => r.find((x) => x.key === 'advisor');
    expect(adv(launchReadiness({ ...rows, advisors: [] })).ok).toBe(false);
    expect(adv(launchReadiness({ ...rows, advisors: ['x1'] })).ok).toBe(true);
    expect(adv(launchReadiness(rows)).ok).toBe(true);
  });
  it('ملف الدفعة: المعيَّن الذي لا يخدم يُقال باسمه ولا يُحتسب', () => {
    const off = cohortSetup({ cohort, advisorName: 'هند', advisorServes: false }).find((x) => x.key === 'advisor');
    expect(off.ok).toBe(false);
    expect(off.detail).toContain('هند لا يخدم في الرحلة الآن');
    expect(cohortSetup({ cohort, advisorName: 'هند' }).find((x) => x.key === 'advisor').ok).toBe(true);
  });
});
