// «انضم كخبير محتوى» (تصور أجزاء الكتاب وخبير المحتوى، المرحلة 3، اعتمده المالك 2026-11-16): مسار مستقل عن خبير الرحلة.
// القواعد الخالصة في committees.js: المسار، والرابط الاختياري، وسبب الرفض قبل أي أثر، ووسم الطلب في اللوحة.
// والحارس على المصدر: الصفحة تبدأ ببطاقتي المسار، ونموذج المحتوى لا يسأل عن حقول الرحلة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyTrack, approvalBlock, COMMITTEE_NEEDED_AR, committeeApplication, committeeApplicationAr, CONTENT_DIM_AR, contentApplyError,
  JOURNEY_FIELDS_AR, WORK_URL_AR, workUrl,
} from '../../supabase/functions/leaders-api/committees.js';
import { bookAccess } from '../../supabase/functions/leaders-api/master-book.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const FORM = { full_name: 'هند', email: 'h@example.sa', committees: ['content'], dimensions: ['impact'], bio: 'x'.repeat(90) };

describe('applyTrack: المسار من الطلب', () => {
  it('الغائب مسار الرحلة كما كان، والمحتوى باسمه، وغيرهما مرفوض', () => {
    expect(applyTrack({})).toBe('journey');
    expect(applyTrack({ track: '' })).toBe('journey');
    expect(applyTrack({ track: 'journey' })).toBe('journey');
    expect(applyTrack({ track: 'content' })).toBe('content');
    expect(applyTrack({ track: 'admin' })).toBe(null);
    expect(applyTrack(null)).toBe('journey');
  });
});

describe('workUrl: رابط الأعمال أو السيرة', () => {
  it('https وحده، وhttp يُرفع إليه، والنطاق بلا بروتوكول يُكمَّل', () => {
    expect(workUrl('https://example.com/cv')).toBe('https://example.com/cv');
    expect(workUrl('http://example.com')).toBe('https://example.com/');
    expect(workUrl('example.com/works')).toBe('https://example.com/works');
    expect(workUrl('www.linkedin.com/in/hind')).toBe('https://www.linkedin.com/in/hind');
  });
  it('يرفض الفارغ والمسافات والبروتوكولات الأخرى والطويل وما ليس نطاقًا', () => {
    for (const v of ['', null, 'javascript:alert(1)', 'ftp://x.com', 'https://exa mple.com', 'localhost', `https://x.com/${'a'.repeat(300)}`]) expect(workUrl(v), String(v)).toBe(null);
  });
});

describe('contentApplyError: سبب الرفض قبل أي أثر', () => {
  it('الطلب الكامل يمر، ولجنة القياس بلا إطار تمر', () => {
    expect(contentApplyError(FORM)).toBe(null);
    expect(contentApplyError({ ...FORM, committees: ['measurement'], dimensions: [] })).toBe(null);
    expect(contentApplyError({ ...FORM, committees: ['content', 'measurement'] })).toBe(null);
    expect(contentApplyError({ ...FORM, work_url: 'https://example.com/cv' })).toBe(null);
  });
  it('لا أدوار في الطلب: تُرفض حقول الرحلة إن أُرسلت', () => {
    for (const extra of [{ roles: ['coach'] }, { levels: ['beginner'] }, { sectors: 'طاقة' }, { sectors: ['طاقة'] }, { weekly_hours: 4 }, { weekly_hours: '0' }]) {
      expect(contentApplyError({ ...FORM, ...extra }), JSON.stringify(extra)).toBe(JOURNEY_FIELDS_AR);
    }
    // الفارغ منها ليس إرسالًا
    expect(contentApplyError({ ...FORM, roles: [], levels: [], sectors: '', weekly_hours: '' })).toBe(null);
  });
  it('اللجنة شرط، والإطار شرط للجنة المحتوى، والرابط المكتوب يصح', () => {
    expect(contentApplyError({ ...FORM, committees: [] })).toBe(COMMITTEE_NEEDED_AR);
    expect(contentApplyError({ ...FORM, committees: ['journey'] })).toBe(COMMITTEE_NEEDED_AR);
    expect(contentApplyError({ ...FORM, dimensions: [] })).toBe(CONTENT_DIM_AR);
    expect(contentApplyError({ ...FORM, dimensions: ['finance'] })).toBe(CONTENT_DIM_AR);
    expect(contentApplyError({ ...FORM, work_url: 'javascript:alert(1)' })).toBe(WORK_URL_AR);
  });
});

describe('الطلب بانتظار المراجعة لا يفتح شيئًا، والاعتماد بقاعدته كما هي', () => {
  const app = { source: 'application', status: 'applied', roles: [], committees: ['content'], dimensions: ['leadership'] };
  it('لا كتاب قبل الاعتماد، وapprovalBlock يقبله بإطاره', () => {
    expect(bookAccess(app)).toBe(false);
    expect(bookAccess({ ...app, status: 'active' })).toBe(true);
    expect(approvalBlock(app)).toBe(null);
  });
  it('وسم «طلب عضوية لجنة» للطلب العام بلا دور، لا لمن دعته الإدارة ولا لخبير الرحلة', () => {
    expect(committeeApplication(app)).toBe(true);
    expect(committeeApplication({ ...app, source: 'admin' })).toBe(false);
    expect(committeeApplication({ ...app, roles: ['coach'] })).toBe(false);
    expect(committeeApplication({ ...app, committees: [] })).toBe(false);
  });
  it('اللجنة والإطار في سطر', () => {
    expect(committeeApplicationAr(app)).toBe('لجنة المحتوى · إطار تمكين القائد');
    expect(committeeApplicationAr({ ...app, committees: ['content', 'measurement'], dimensions: ['milestone', 'impact'] })).toBe('لجنة المحتوى ولجنة القياس · إطارا إدارة المشروعات وتحويل المشروع إلى أثر');
    expect(committeeApplicationAr({ ...app, committees: ['measurement'], dimensions: [] })).toBe('لجنة القياس');
  });
});

describe('الصفحة /expert: بطاقتا المسار، ونموذج المحتوى المختصر', () => {
  const src = read('leaders-app/src/screens/ExpertApply.jsx');
  it('بطاقتان بنصهما المعتمد، والمسار في العنوان', () => {
    expect(src).toContain("title: 'خبير رحلة', lead: 'يرافق القادة كوتشًا ومستشارًا ومقيّمًا.'");
    expect(src).toContain("title: 'خبير محتوى', lead: 'يراجع الكتاب الأم ومحتوى البرنامج ضمن لجنة المحتوى أو لجنة القياس.'");
    expect(src).toContain("q.set('track', t)");
  });
  it('نموذج المحتوى يرسل track: content بلا أدوار ولا مستويات ولا ساعات ولا قطاعات', () => {
    const form = src.slice(src.indexOf('const CONTENT_EMPTY'), src.indexOf('function JourneyForm'));
    expect(form).toContain("track: 'content'");
    for (const k of ['roles', 'levels', 'weekly_hours', 'sectors', 'EXPERT_ROLE_AR', 'LEVEL_AR']) expect(form, k).not.toContain(k);
  });
  it('لا شرطة طويلة ولا قصيرة في الصفحة', () => {
    expect(src).not.toMatch(/[–—]/);
    expect(read('supabase/functions/leaders-api/committees.js')).not.toMatch(/[–—]/);
  });
});
