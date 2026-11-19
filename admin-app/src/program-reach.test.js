// P9: «يسري على» من الأعضاء الفعليين، ومحرر الرحلة يسمي الدفعات التي يصلها التعديل، و«برنامج جديد من هذا»، والبرنامج في الرابط
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { journeyAudience, journeyAudienceAr, programReach } from './program-reach.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const org = (id) => ({ o1: 'جمعية سفراء', o2: 'منظومة' }[id] || '');
const programs = [{ id: 'pa', versions: [{ id: 'v2', number: 2 }, { id: 'v1', number: 1 }] }, { id: 'pb', versions: [] }];
const cohorts = [
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', program_version_id: null, status: 'running', members: 30 },
  { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pa', program_version_id: 'v1', status: 'running', members: 12 },
  { id: 'c2', name: 'منظومة الربيع', organization_id: 'o2', program_id: 'pa', program_version_id: 'v2', status: 'planned', members: 0 },
  { id: 'c3', name: 'قديمة', organization_id: 'o2', program_id: 'pa', program_version_id: 'v1', status: 'closed', members: 40 },
];

describe('«يسري على» من الأعضاء الفعليين', () => {
  it('المجموع وتقسيمه بالدفعة، والمغلقة والفارغة خارجه', () => {
    const r = programReach({ id: 'pa' }, cohorts, org);
    expect(r).toMatchObject({ on: true, total: 42 });
    expect(r.text).toBe('يسري على 42 مشاركًا: الدفعة المفتوحة 30، جمعية سفراء 12');
    expect(r.text).not.toContain('منظومة');
  });
  it('المثنى بعد حرف الجر مجرور: «يسري على مشاركَين»', () => {
    const two = [{ id: 'c9', program_id: 'pa', status: 'open', name: 'دفعة', members: 2 }];
    expect(programReach({ id: 'pa' }, two, org).text).toBe('يسري على مشاركَين: «دفعة» 2');
  });
  it('دفعات بلا أعضاء لا تُعد سريانًا، وبرنامج بلا دفعة كما كان', () => {
    expect(programReach({ id: 'pa' }, [cohorts[2]], org)).toMatchObject({ on: false, total: 0, text: 'دفعته بلا أعضاء بعد، فلا يسري الآن على أي مشارك.' });
    expect(programReach({ id: 'pb' }, cohorts, org).on).toBe(false);
    expect(programReach({ id: 'pb' }, cohorts, org).text).toContain('لا توجد دفعة على هذا البرنامج بعد');
  });
});

describe('محرر الرحلة يسمي الدفعات التي يصلها التعديل', () => {
  it('غير المثبتة يصلها فورًا، والمثبتة بنسختها وأعضائها، والمغلقة لا تُذكر', () => {
    const a = journeyAudience('pa', programs, cohorts);
    expect(a.immediate.map((x) => x.name)).toEqual(['الدفعة المفتوحة']);
    expect(a.pinned.map((x) => [x.name, x.version])).toEqual([['سفراء 2026', 1], ['منظومة الربيع', 2]]);
    const [warn, info] = journeyAudienceAr(a);
    expect(warn.tone).toBe('warn');
    expect(warn.text).toContain('«الدفعة المفتوحة» (30 مشاركًا)');
    expect(info.text).toContain('«سفراء 2026» على النسخة 1 (12 مشاركًا)');
    expect(info.text).not.toContain('قديمة');
  });
  it('كلها مثبتة: لا «يظهر فورًا» لأحد', () => {
    const lines = journeyAudienceAr(journeyAudience('pa', programs, cohorts.slice(1)));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).not.toContain('فورًا');
  });
  it('بلا دفعة: الجملة تقول إن الدفعة الجديدة تُثبَّت على آخر نسخة', () => {
    expect(journeyAudienceAr(journeyAudience('pb', programs, cohorts))[0].text).toContain('تُثبَّت على آخر نسخة محفوظة');
  });
  it('الجملة القديمة «التي تتبع آخر تعديل» لا تعود إلى الشاشة', () => {
    expect(read('admin-app/src/screens/Methodology.jsx')).not.toContain('تتبع آخر تعديل');
    expect(read('admin-app/src/screens/Methodology.jsx')).toContain('<JourneyAudience pid={pid} data={pdata} />');
  });
});

describe('صفحة البرامج', () => {
  const src = read('admin-app/src/screens/Programs.jsx');
  it('«برنامج جديد من هذا» بدل «تكرار»، ويسبقه سؤال «لجهة بعينها؟»', () => {
    expect(src).not.toMatch(/>تكرار</);
    expect(src).toContain('>برنامج جديد من هذا</button>');
    expect(src).toMatch(/if \(from && !\(await confirm\(`لجهة بعينها؟ خصّص دفعتها بدل النسخ/);
  });
  it('«يسري على» من الدالة الواحدة', () => {
    expect(src).toContain('const reach = (p) => programReach(p, d.cohorts, orgName);');
  });
  it('البرنامج المختار في الرابط: ‎#/leaders/journey/<البرنامج>‎ مصدر الاختيار', () => {
    const l = read('admin-app/src/screens/Leaders.jsx');
    expect(l).toContain("const pickProgram = (id) => at('journey', id || null);");
    expect(l).toContain("const journeyPid = tab === 'journey' ? route.id || null : undefined;");
    expect(l).toContain('onEditJourney={pickProgram}');
  });
});
