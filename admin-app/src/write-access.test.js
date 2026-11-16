// المرحلة 2 من تصور لوحة الإدارة (الصدق في الجلسة): صلاحية الكتابة من الخادم، وتصفية الجلسات والتحليل بالدفعة،
// والإطار بالعربية وحدها في اللوحة
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeState } from './write-access.js';
import { cohortNameOf, cohortsOfProgram } from './screens/Activities.jsx';
import { focusedGroup, pipelineRows } from './screens/Insight.jsx';
import { pipelineBy } from '../../supabase/functions/leaders-api/insight.js';
import { pickCohort } from '../../supabase/functions/leaders-api/logic.js';

const read = (p) => readFileSync(join(__dirname, p), 'utf8');

describe('writeState: حكم الخادم أولًا، ولا حجب خاطئ للمدير', () => {
  const su = { role_id: 'super_admin' };
  it('رد «me» يحكم: جلسة رمز البريد للقراءة بالشريط، والعامل الثاني يكتب', () => {
    expect(writeState(su, { success: true, can_write: false, can_elevate: true })).toMatchObject({ canWrite: false, readOnly: true, source: 'server' });
    expect(writeState(su, { success: true, can_write: true, can_elevate: false })).toMatchObject({ canWrite: true, readOnly: false });
    // المراقب: لا كتابة ولا شريط تفعيل
    expect(writeState({ role_id: 'viewer' }, { success: true, can_write: false, can_elevate: false })).toMatchObject({ canWrite: false, readOnly: false });
  });
  it('قبل الرد: طريقة الدخول المحفوظة مع الجلسة', () => {
    expect(writeState({ ...su, method: 'email' }, null)).toMatchObject({ canWrite: false, readOnly: true, source: 'session' });
    expect(writeState({ ...su, method: 'passkey' }, null)).toMatchObject({ canWrite: true, readOnly: false });
    expect(writeState({ role_id: 'admin', method: 'totp' }, { success: false })).toMatchObject({ canWrite: true });
    expect(writeState({ role_id: 'viewer', method: 'email' }, null)).toMatchObject({ canWrite: false, readOnly: false });
  });
  it('خادم أقدم بلا «me» وجلسة بلا طريقة: الحكم القديم بالدور، فالمدير الأعلى يكتب', () => {
    expect(writeState(su, { success: false, message: 'action غير معروف' })).toMatchObject({ canWrite: true, readOnly: false, source: 'role' });
    expect(writeState({ role: 'admin' }, { success: true, contacts: [] })).toMatchObject({ canWrite: true, source: 'role' });
    expect(writeState({ role_id: 'viewer' }, null).canWrite).toBe(false);
  });
  it('App.jsx يأخذ canWrite من writeState لا من الدور، وشريط «للقراءة فقط» يفتح StepUp بغرض write', () => {
    const a = read('App.jsx');
    expect(a).toMatch(/const \{ canWrite, readOnly \} = writeState\(user, me\)/);
    expect(a).not.toMatch(/const canWrite = \(user\.role_id \|\| user\.role\) !== 'viewer'/);
    expect(a).toMatch(/<StepUp purpose="write"/);
    expect(a).toMatch(/فعّل الكتابة<\/button>/);
    // مصدر واحد للنافذة: Agent.jsx يستوردها ولا يعرّف نسخته
    expect(read('screens/Agent.jsx')).not.toMatch(/function StepUp/);
    expect(read('screens/Agent.jsx')).toMatch(/import StepUp from '\.\.\/StepUp\.jsx'/);
  });
});

describe('تصفية الجلسات بالدفعة (الحضور والجلسات)', () => {
  const cohorts = [
    { id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa' }, { id: 'c2', name: 'دفعة ديسمبر', program_id: 'pa' },
    { id: 'c3', name: 'دفعة برنامج آخر', program_id: 'pb' },
  ];
  it('نشاط البرنامج يعرض دفعات برنامجه وحده، فلا تُربط جلسة بدفعة برنامج آخر', () => {
    expect(cohortsOfProgram(cohorts, 'pa').map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(cohortsOfProgram(cohorts, 'pb').map((c) => c.id)).toEqual(['c3']);
    expect(cohortsOfProgram(cohorts, 'pz')).toEqual([]);
    expect(cohortsOfProgram(undefined, 'pa')).toEqual([]);
  });
  it('اسم دفعة الجلسة من دفعات برنامجها، والمغلقة باسمها العام', () => {
    const pa = cohortsOfProgram(cohorts, 'pa');
    expect(cohortNameOf(pa, 'c2')).toBe('دفعة ديسمبر');
    expect(cohortNameOf(pa, 'c3')).toBe('دفعة مغلقة');
  });
});

describe('تصفية التحليل بالدفعة (الرؤية الشاملة، «بالدفعة»)', () => {
  const cohorts = [
    { id: 'c1', name: 'دفعة نوفمبر', status: 'running', organization_id: 'o1' },
    { id: 'c2', name: 'دفعة ديسمبر', status: 'open', organization_id: 'o2' },
    { id: 'd0', name: 'الافتراضية', status: 'open', is_default: true },
  ];
  const enr = { p1: [{ participant_id: 'p1', cohort_id: 'c1', status: 'active' }], p2: [{ participant_id: 'p2', cohort_id: 'c2', status: 'active' }], p3: [{ participant_id: 'p3', cohort_id: 'c1', status: 'withdrawn' }] };
  const rows = [
    { id: 'p1', status: 'placed', onboarding: { stage: 'placed' } },
    { id: 'p2', status: 'registered', onboarding: { stage: 'profile' } },
    { id: 'p3', status: 'registered', organization_id: 'o2', onboarding: { stage: 'profile' } },
    { id: 'p4', status: 'registered', onboarding: { stage: 'profile' } },
  ];
  // كما في insight.ts: دفعة المشارك من pickCohort، ومن بلا دفعة في «بلا دفعة»
  const grouped = pipelineBy(rows, (p) => { const c = pickCohort({ enrollments: enr[p.id] || [], cohorts, organizationId: p.organization_id || null }).cohort; return c ? { key: c.id, name: c.name } : { key: 'none', name: 'بلا دفعة' }; });
  it('كل مشارك في دفعة واحدة: المنسحب من دفعة يُحسب في دفعة جهته، ومن بلا قيد ولا جهة في الافتراضية', () => {
    const by = Object.fromEntries(grouped.groups.map((g) => [g.key, g.total]));
    expect(by).toEqual({ c1: 1, c2: 2, d0: 1 });
    expect(grouped.total.total).toBe(rows.length);
  });
  it('الدفعة المختارة: صفها وحده في الجدول والبطاقات، وغيرها لا يتسرب', () => {
    const f = focusedGroup(grouped, 'c2');
    expect([f.key, f.total]).toEqual(['c2', 2]);
    expect(pipelineRows(grouped.groups, 'c2').map((g) => g.key)).toEqual(['c2']);
    expect(pipelineRows(grouped.groups, null)).toHaveLength(grouped.groups.length);
  });
  it('دفعة لا مشاركين فيها أو أُغلقت: null، فيظهر «لا مشاركين في هذه الدفعة» لا أرقام الجميع', () => {
    expect(focusedGroup(grouped, 'gone')).toBeNull();
    expect(focusedGroup(grouped, null)).toBeNull();
    expect(focusedGroup(undefined, 'c1')).toBeNull();
    expect(pipelineRows(grouped.groups, 'gone')).toEqual([]);
  });
});

describe('الإطار بالعربية وحدها في اللوحة', () => {
  const screens = readdirSync(join(__dirname, 'screens')).filter((f) => f.endsWith('.jsx')).map((f) => `screens/${f}`);
  it('لا DIM_EN ولا DIM_SHORT في شاشات اللوحة ولوحة الإجابات المشتركة', () => {
    for (const f of [...screens, 'leaders.js', '../../src/lib/AnswersPanel.jsx']) expect(/DIM_EN|DIM_SHORT/.test(read(f)), f).toBe(false);
  });
});
