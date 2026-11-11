// نطاق مستشار الدفعة (server-sec-7): myParticipantIds كان يقرأ تسجيلات كل مرشح وكل الدفعات بالتتابع (cohortOf داخل
// الحلقة، قراءتان لكل مشارك). صار ثلاث قراءات ثم advisorCohortParticipantIds في الذاكرة. هنا: الناتج مطابق للخوارزمية
// القديمة حرفيًا على حالات حدية وعلى مئات الحالات العشوائية، والمصدر لا يعود إلى القراءة لكل مشارك.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advisorCohortParticipantIds, pickCohort } from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');

// الخوارزمية القديمة كما كانت في advisor.ts، باستعلاماتها مترجمة إلى مصفوفات (cohortOf = pickCohort على تسجيلات المشارك وكل الدفعات)
function before(expertId, { cohorts, enrollments, participants }) {
  const mine = cohorts.filter((c) => c.advisor_expert_id === expertId);
  const ids = new Set();
  for (const c of mine) {
    enrollments.filter((e) => e.cohort_id === c.id).forEach((x) => ids.add(x.participant_id));
    const base = c.organization_id
      ? participants.filter((p) => p.organization_id === c.organization_id && !p.is_demo)
      : c.is_default ? participants.filter((p) => !p.is_demo) : [];
    for (const p of base) {
      if (ids.has(p.id)) continue;
      const { cohort } = pickCohort({ enrollments: enrollments.filter((e) => e.participant_id === p.id), cohorts, organizationId: p.organization_id || null });
      if (cohort?.id === c.id) ids.add(p.id);
    }
  }
  return [...ids].sort();
}
// الجديدة بالمدخلات التي تقرؤها advisor.ts: دفعاته، وكل الدفعات، وكل التسجيلات، والمرشحون بلا حساب العرض من نطاق دفعاته
function after(expertId, { cohorts, enrollments, participants }) {
  const mine = cohorts.filter((c) => c.advisor_expert_id === expertId).map(({ id, organization_id, is_default }) => ({ id, organization_id, is_default }));
  const orgs = new Set(mine.map((c) => c.organization_id).filter(Boolean));
  const open = mine.some((c) => !c.organization_id && c.is_default);
  const candidates = participants.filter((p) => !p.is_demo && (open || orgs.has(p.organization_id))).map(({ id, organization_id }) => ({ id, organization_id }));
  return advisorCohortParticipantIds(mine, cohorts, enrollments, candidates).sort();
}

const COHORTS = [
  { id: 'open', is_default: true, organization_id: null, status: 'running', advisor_expert_id: 'x1', created_at: '2026-10-01' },
  { id: 'orgA1', organization_id: 'A', status: 'running', advisor_expert_id: 'x1', starts_on: '2026-11-01' },
  { id: 'orgA0', organization_id: 'A', status: 'open', advisor_expert_id: 'x2', starts_on: '2026-10-01' },
  { id: 'orgB', organization_id: 'B', status: 'closed', advisor_expert_id: 'x2' },
  { id: 'free', organization_id: null, status: 'running', advisor_expert_id: 'x3' },
];

describe('نطاق مستشار الدفعة بلا قراءة لكل مشارك', () => {
  it('حالات حدية: التسجيل بأي حالة، والتبعية بالجهة والمفتوحة، وحساب العرض، والدفعة بلا جهة', () => {
    const data = {
      cohorts: COHORTS,
      participants: [
        { id: 'p-open' }, { id: 'p-A' , organization_id: 'A' }, { id: 'p-B', organization_id: 'B' },
        { id: 'p-A-enrolled-free', organization_id: 'A' }, { id: 'p-withdrawn', organization_id: 'A' },
        { id: 'demo', is_demo: true }, { id: 'demo-enrolled', is_demo: true },
      ],
      enrollments: [
        { participant_id: 'p-A-enrolled-free', cohort_id: 'free', status: 'active', created_at: '2026-11-02' },
        // المنسحب من دفعة المستشار: يبقى في نطاقه كما كان (القديمة تقرأ التسجيل بلا حالة)
        { participant_id: 'p-withdrawn', cohort_id: 'orgA0', status: 'withdrawn', created_at: '2026-11-02' },
        { participant_id: 'demo-enrolled', cohort_id: 'open', status: 'active', created_at: '2026-11-03' },
      ],
    };
    for (const x of ['x1', 'x2', 'x3', 'none']) expect(after(x, data), x).toEqual(before(x, data));
    // x1: المفتوحة (من لا جهة له، ودفعة جهة B مغلقة فيتبعها p-B، ومن سُجّل فيها ولو كان حساب العرض) ودفعة الجهة A الأحدث
    expect(after('x1', data)).toEqual(['demo-enrolled', 'p-A', 'p-B', 'p-open', 'p-withdrawn'].sort());
    expect(after('x2', data)).toEqual(['p-withdrawn']);
    expect(after('x3', data)).toEqual(['p-A-enrolled-free']);
  });

  it('مطابق للخوارزمية القديمة على 400 حالة عشوائية', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    for (let n = 0; n < 400; n += 1) {
      const orgs = ['A', 'B', 'C'];
      const cohorts = [
        ...(rnd() < 0.9 ? [{ id: 'd', is_default: true, organization_id: null, status: 'running', advisor_expert_id: pick(['x', 'y', null]), created_at: '2026-01-01' }] : []),
        ...Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => ({
          id: `c${i}`, organization_id: rnd() < 0.8 ? pick(orgs) : null, is_default: false,
          status: pick(['open', 'running', 'closed', 'draft']), advisor_expert_id: pick(['x', 'y', null]),
          starts_on: `2026-0${1 + Math.floor(rnd() * 9)}-01`, created_at: `2026-0${1 + Math.floor(rnd() * 9)}-02`,
        })),
      ];
      const participants = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, organization_id: rnd() < 0.6 ? pick(orgs) : null, is_demo: rnd() < 0.05 }));
      const enrollments = [];
      for (const p of participants) {
        const k = rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 2);
        for (let j = 0; j < k; j += 1) enrollments.push({ participant_id: p.id, cohort_id: pick([...cohorts.map((c) => c.id), 'gone']), status: pick(['active', 'withdrawn', 'nominated']), created_at: `2026-1${Math.floor(rnd() * 2)}-0${1 + Math.floor(rnd() * 9)}` });
      }
      const data = { cohorts, participants, enrollments };
      for (const x of ['x', 'y']) expect(after(x, data), `حالة ${n} للخبير ${x}`).toEqual(before(x, data));
    }
  });

  it('المصدر: myParticipantIds لا يقرأ دفعة كل مشارك داخل حلقة، ويقرأ بصفحات ثم يحسب في الذاكرة', () => {
    const src = readFileSync(join(root, 'supabase/functions/leaders-api/advisor.ts'), 'utf8');
    const body = src.slice(src.indexOf('export async function myParticipantIds'), src.indexOf('\n}\n', src.indexOf('export async function myParticipantIds')));
    expect(body).not.toMatch(/cohortOf\(/);
    expect(body).not.toMatch(/for \([^)]*\) \{[^}]*await /s);
    expect(body).toMatch(/advisorCohortParticipantIds\(/);
    expect(body.match(/all\(\(f, t\)/g)).toHaveLength(3);
  });
});
