// «تحميل PDF» لوثيقة المبادرة من كل دور يصل إليها (قرار المالك 2026-11-24): المشارك، والخبير (المستشار)، والراعي، ومنسق الجهة، ورابط المشاركة، والإدارة.
// لكل دور الوثيقة التي تخصه (renderInitiative): الداخلي ملف العمل بملحقه، والخارجي المؤسسية (أو ملف العمل بلا ملحق قبل اكتمالها).
// يُتحقق أن الملف يُبنى فعلًا: PDF بحجم معتبر وعدد صفحات في مداه، وباسم عربي يدل عليه. الخلفية مُحاكاة.
// PDF_OUT=<مجلد>: تُحفظ الملفات فيه باسم الدور للمعاينة اليدوية.
import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const LEADERS = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const T = 't'.repeat(40);
const LOGO = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48"><rect width="48" height="48" rx="10" fill="#1F6F8B"/><text x="58" y="32" font-size="20" font-family="sans-serif" fill="#1F6F8B">Health</text></svg>').toString('base64')}`;
const FULL = JSON.parse(readFileSync('e2e/initiative-doc-fixture.json', 'utf8'));
FULL.meta.org = { ...FULL.meta.org, logo: LOGO };
// وثيقة تنقصها فصول: الوثيقة المؤسسية محجوبة
const PARTIAL = { ...FULL, sections: FULL.sections.slice(0, 2) };
const today = new Date();
const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const NAME = FULL.meta.initiative.replace(/\s+/g, '-');

const pagesOf = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

// النسخة المؤسسية تُسمّى باسم شكلها (document-forms.js): الوثيقة بلا doc_form تأخذ الشكل الكامل «حالة العمل»
const FORM_NAME = (FULL.meta.doc_form?.name || 'حالة العمل').replace(/\s+/g, '-');

async function check(d, role, { kind, min, max }) {
  expect(d.suggestedFilename()).toBe(`${kind === 'working' ? 'ملف-عمل-المبادرة' : FORM_NAME}-${NAME}-${ymd}-0042-V2.pdf`);
  const buf = readFileSync(await d.path());
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(150 * 1024);
  expect(buf.length).toBeLessThan(12 * 1024 * 1024);
  const n = pagesOf(buf);
  expect(n).toBeGreaterThanOrEqual(min);
  expect(n).toBeLessThanOrEqual(max);
  if (process.env.PDF_OUT) { mkdirSync(process.env.PDF_OUT, { recursive: true }); await d.saveAs(`${process.env.PDF_OUT}/${role}.pdf`); }
  return n;
}

// من نافذة الوثيقة: الزر في النافذة، والملف يُحفظ من نافذة المنصة التي فتحتها
async function fromWindow(page, opener) {
  const pop = page.waitForEvent('popup');
  await opener();
  const w = await pop;
  await expect(w.getByRole('button', { name: 'تحميل PDF' })).toBeVisible();
  const dl = page.waitForEvent('download', { timeout: 150000 });
  await w.getByRole('button', { name: 'تحميل PDF' }).click();
  return dl;
}

function route(page, re, replies) {
  return page.route(re, async (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    const v = typeof replies === 'function' ? replies(b) : replies[b.action];
    await r.fulfill({ json: v ?? { success: true } });
  });
}

const ME = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'beginner', track: { title: 'مسار' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
};
const S = (s) => ({ id: s.key, key: s.key, title: s.title, icon: '◆', dimension: s.dimension, complete: true, missing: 0, status: 'draft' });

async function participant(page, doc) {
  await route(page, /functions\/v1\/leaders-api/, {
    me: ME,
    'capstone.get': { success: true, initiative: doc.meta.initiative, scope: 'project', scope_title: 'مشروع', level: 'beginner', track: null,
      capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' }, sections: doc.sections.map(S), checks: [], readiness: 90, ready_min: 80,
      card: { state: 'approved', sla: 'يومي عمل' }, can_submit: false, blocker: 'x', rubric: [], examples: { doc: false } },
    'capstone.doc': { success: true, doc },
    certificate: { success: true, certificate: null },
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-pdf-0000000000000000000000'); });
  await page.goto(LEADERS);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

test.describe.configure({ timeout: 180000 });
// اسم الملف العربي يحفظه المتصفح بترميز النظام: بيئة بلا UTF-8 (LANG فارغ) تسقطه إلى «download»، فيُشغَّل المتصفح بـ UTF-8 كأي جهاز مستخدم
test.use({ launchOptions: { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } } });

test('المشارك: «تحميل PDF» مباشرة يعطي ملف العمل الكامل بملحقه، والوثيقة المؤسسية من نافذتها', async ({ page }) => {
  await participant(page, FULL);
  const dl = page.waitForEvent('download', { timeout: 150000 });
  // زر لكل نسخة (قرار المالك 2026-11-25): «تحميل ملف العمل PDF» و«تحميل <اسم الشكل> PDF»، والنافذة باسم الشكل
  await page.getByRole('button', { name: 'تحميل ملف العمل PDF' }).click();
  await check(await dl, 'participant-working', { kind: 'working', min: 12, max: 40 });
  await check(await fromWindow(page, () => page.getByRole('button', { name: 'الوثيقة المؤسسية', exact: true }).click()), 'participant-institutional', { kind: 'institutional', min: 6, max: 30 });
});

test('المشارك: الوثيقة المؤسسية محجوبة برسالة ما ينقص حين لم تكتمل، ولا نافذة ولا ملف', async ({ page }) => {
  await participant(page, PARTIAL);
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.getByRole('button', { name: 'الوثيقة المؤسسية', exact: true }).click();
  // الرسالة تسمي شكل الوثيقة (missingMessage بـ formOfDoc)
  await expect(page.getByText(new RegExp(`لا تُصدر ${FORM_NAME.replace(/-/g, ' ')} قبل أن تجيب عن`))).toBeVisible();
  expect(downloads).toBe(0);
});

test('الخبير (مستشار الدفعة): وثيقة القارئ من ملف المشارك، بلا ملحق ما ينقص', async ({ page }) => {
  await route(page, /functions\/v1\/leaders-api/, (b) => ({
    'xp.dashboard': { success: true, expert: { full_name: 'د. سارة الحربي', roles: ['advisor'] }, stats: { hours: 0, participants: 1, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر' }] },
    'xp.participants': { success: true, items: [{ id: 'p1', name: 'سارة الأحمد', first: 'سارة', status: 'enrolled', cohort: 'دفعة نوفمبر', advisor: true, level: 'intermediate', level_ar: 'متوسط', approved: true, progress: 40, late: 0, continuous: null, needs: 0 }], cohorts: [] },
    'xp.participant': { success: true, scope: 'advisor',
      participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', job_title: 'مديرة مشاريع', organization_name: 'التجمع الصحي الأول', status: 'enrolled' },
      profile: { approved: true, dimensions: [] }, journey: [], progress: 40, milestones: [], milestone_summary: { done: 0, total: 0, late: 0 }, group: null, continuous: null, program: { id: 'pr1' },
      assessments: [], models: [{ id: 'm1', title: 'بطاقة المبادرة', status_ar: 'مسلّم' }], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], sessions: [], expert_requests: [],
      peer: { requests: [], pending_answers: [], given: [] }, final: null, needs: [], cohort: { id: 'c1', name: 'دفعة نوفمبر' } },
    'xp.capstone-doc': { success: true, doc: FULL },
    'xp.nudge-ledger': { success: true, items: [] },
  }[b.action] ?? { success: true }));
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), T);
  await page.goto(`${LEADERS}x`);
  await page.getByRole('region', { name: /مشاركوك/ }).getByRole('button', { name: 'افتح الملف' }).click();
  await check(await fromWindow(page, () => page.getByRole('button', { name: 'اقرأ وثيقة المبادرة ↗' }).click()), 'expert', { kind: 'institutional', min: 6, max: 30 });
});

test('الراعي: الوثيقة من رابط التأييد', async ({ page }) => {
  await route(page, /functions\/v1\/leaders-api/, { 'sponsor.get': { success: true, done: false, sponsor: 'م. خالد', doc: FULL } });
  await page.goto(`${LEADERS}sponsor?t=${T}`);
  await check(await fromWindow(page, () => page.getByRole('button', { name: 'اقرأ الوثيقة كاملة' }).click()), 'sponsor', { kind: 'institutional', min: 6, max: 30 });
});

test('منسق الجهة: الوثيقة المؤسسية من محفظة المبادرات', async ({ page }) => {
  await route(page, /functions\/v1\/leaders-api/, {
    'coord.me': { success: true, coordinator: { full_name: 'منسقة' }, org: { name: 'التجمع الصحي الأول' } },
    'coord.dashboard': { success: true, org: { name: 'التجمع الصحي الأول', seats: 10 }, permissions: { scores: false, contact: false, export: true },
      kpis: { total: 1, joined_week: 0, active_week: 1, approved: 1, completed: 0, avg_progress: 60 }, funnel: { registered: 1, approved: 1 }, by_track: {}, by_via: {},
      participants: [{ id: 'p1', full_name: 'سارة الأحمد', status: 'enrolled', approved: true, progress: 60 }],
      initiatives: [{ participant_id: 'p1', initiative: FULL.meta.initiative, full_name: 'سارة الأحمد', scope: 'project', status: 'approved', status_title: 'معتمدة', cost: 100000 }] },
    'coord.sus-state': { success: true, ready: false },
    'coord.capstone': { success: true, doc: FULL },
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_coord_session', t), T);
  await page.goto(`${LEADERS}org`);
  await check(await fromWindow(page, () => page.getByRole('button', { name: 'الوثيقة', exact: true }).click()), 'org', { kind: 'institutional', min: 6, max: 30 });
});

test('رابط المشاركة: «تحميل PDF» في الصفحة نفسها', async ({ page }) => {
  await route(page, /functions\/v1\/leaders-api/, { 'share.get': { success: true, owner: 'سارة الأحمد', expires_at: '2026-12-15T00:00:00Z', allow_notes: false, allow_download: true, sections: [], doc: FULL } });
  await page.goto(`${LEADERS}i?t=${T}`);
  const dl = page.waitForEvent('download', { timeout: 150000 });
  await page.getByRole('button', { name: 'تحميل PDF' }).click();
  await check(await dl, 'shared', { kind: 'institutional', min: 6, max: 30 });
});

async function admin(page, doc) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await route(page, /functions\/v1\/leaders-api/, {
    'admin.capstone': { success: true, doc, capstone: { id: 'c1', status: 'submitted', revisions: 0 }, readiness: 90, checks: [], sections: [], rubric: [] },
    'admin.capstones': { success: true, items: [] },
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.goto(`${ADMIN}#/leaders/capstones/p1`);
  await page.reload();
}

test('الإدارة: ملف العمل الكامل والوثيقة المؤسسية من صفحة المراجعة', async ({ page }) => {
  await admin(page, FULL);
  await check(await fromWindow(page, () => page.getByRole('button', { name: 'ملف العمل الكامل' }).click()), 'admin-working', { kind: 'working', min: 12, max: 40 });
  await check(await fromWindow(page, () => page.getByRole('button', { name: 'الوثيقة المؤسسية' }).click()), 'admin-institutional', { kind: 'institutional', min: 6, max: 30 });
});

test('الإدارة: الوثيقة المؤسسية محجوبة بقائمة ما ينقص حين لم تكتمل', async ({ page }) => {
  await admin(page, PARTIAL);
  await page.getByRole('button', { name: 'الوثيقة المؤسسية' }).click();
  await expect(page.getByText('لا تُصدر الوثيقة المؤسسية بعد: تنقصها إجابات عن')).toBeVisible();
});
