// تدقيق الإنتاج، البند 4.4 (2026-11-10): كل فعل في leaders-api يتحقق من الدور على الخادم.
// يقرأ خريطة الأفعال في index.ts ويتحقق آليًا، فأي فعل كتابة جديد ينسى فحص صلاحيته يُسقط الاختبارات.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const fn = (p) => readFileSync(join(root, 'supabase/functions/leaders-api', p), 'utf8');
const index = fn('index.ts');
const modules = Object.fromEntries([...index.matchAll(/import \* as (\w+) from '\.\/([\w.-]+)';/g)].map((m) => [m[1], m[2]]));
// خريطة فعل باسمها: الأسطر بين «const <اسم>: Record» وإغلاقها
function mapOf(name) {
  const start = index.indexOf(`const ${name}: Record`);
  const end = index.indexOf('\n};', start);
  return [...index.slice(start, end).matchAll(/^\s*'([a-z0-9.-]+)':(.*)$/gm)].map((m) => ({ key: m[1], impl: m[2] }));
}
// جسم دالة مُصدَّرة في وحدتها (أول 1500 حرف)
function bodyOf(impl) {
  const m = impl.match(/(\w+)\.(\w+)\b/);
  if (!m || !modules[m[1]]) return null;
  const src = fn(modules[m[1]]);
  const d = src.match(new RegExp(`export (?:async )?function ${m[2]}\\b[^{]*\\{`));
  return d ? src.slice(d.index + d[0].length, d.index + d[0].length + 1500) : null;
}
// أفعال الإدارة للقراءة وحدها: تُفتح لكل أدوار اللوحة بما فيها «عرض فقط»
const ADMIN_READS = new Set(['health', 'inbox', 'mail-gallery', 'visits', 'trends', 'item-analysis', 'overview', 'participants', 'participant', 'peer', 'reviews', 'evidence-url',
  'participant-impact', 'sus', 'erasures', 'catalog', 'track', 'orgs', 'org', 'org-impact', 'org-finance', 'coordinator', 'coordinator-preview', 'org-journey', 'book-preview',
  'submissions', 'submission', 'lab', 'lab-preview', 'lab-cards', 'certificates', 'certificate', 'cert-preview', 'cert-settings', 'activities', 'workshop-qr', 'workshop-attendance', 'impact',
  'curriculum', 'programs', 'payments', 'sponsor-requests', 'experts', 'expert', 'expert-match', 'expert-requests', 'program', 'program-compare', 'milestones',
  'hall', 'katon', 'final-eval', 'cohort-groups', 'cohort-team', 'cohort-visibility', 'org-team', 'capstones', 'capstone', 'outcomes',
  // قراءة يحصرها الخادم في المدير ذي الكتابة كـevidence-url (answer-review.test.js يحرس الفحص)
  'assessment-answers',
  // تقييم 360: حالة الدورات وأعدادها بلا نتيجة فرد
  'f360']);

describe('4.4 صلاحيات الأدوار على الخادم', () => {
  it('لا فعل باسم واحد في خريطتين، فلا يُفتح فعل دور بجلسة دور آخر', () => {
    const seen = {};
    for (const m of ['open', 'participant', 'expert', 'coordinator', 'admin']) for (const { key } of mapOf(m)) (seen[key] ||= []).push(m);
    expect(Object.entries(seen).filter(([, v]) => v.length > 1)).toEqual([]);
  });
  it('كل فعل كتابة في الإدارة يفحص الصلاحية: بغلاف writer أو داخل دالته', () => {
    const gaps = [];
    for (const { key, impl } of mapOf('admin')) {
      if (/[Ww]riter/.test(impl) || ADMIN_READS.has(key.replace('admin.', ''))) continue;
      const body = bodyOf(impl);
      if (!body || !/requireWrite|requireSuper/.test(body)) gaps.push(key);
    }
    expect(gaps).toEqual([]);
  });
  it('كل فعل خبير يمس مشاركًا أو دفعة أو طلبًا محصور فيما أُسند إليه', () => {
    const scoped = /requireAdvisorOf|requireAdvisorCohort|requireEffectiveAdvisor|hallSessionOf|requestFor|myParticipantIds|advisorOf|advisorCohorts|cohortsOf|assigned|e\.id|expert_id|mine\(/;
    const gaps = mapOf('expert').filter(({ key, impl }) => !['xp.dashboard', 'xp.switch'].includes(key)).filter(({ impl }) => !scoped.test(bodyOf(impl) || impl)).map(({ key }) => key);
    expect(gaps).toEqual([]);
  });
  it('كل جلسة تُستخرج من جدولها: المشارك والخبير والمنسق والإدارة', () => {
    for (const s of ['P.participantFromToken(b.token)', 'E.expertFromToken(b.token)', 'C.fromToken(b.token)', 'A.adminFromToken(b.token)']) expect(index, s).toContain(s);
  });
});
