// مشاركة وثيقة المبادرة برابط خاص، وملاحظات من يفتحه (Share.jsx وSharedInitiative.jsx وshare.ts)
// التصور: docs/content/2026-11-15-تصور-تصدير-المبادرة-ومشاركتها-v1.md
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP = 'http://localhost:4304/';
const T = 'tok-share-abcdefghijklmnopqrstuvwxyz0123';
// سياسة CSP كما تُرسل في الإنتاج: الوثيقة المضمّنة وملف PDF يعملان تحتها
const CSP = readFileSync('leaders-app/public/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const DOC = {
  meta: { ref: 'MI-CP-0042', version: 2, status: 'draft', status_title: 'قيد البناء', initiative: 'موعد أول أقرب', scope_title: 'مشروع', readiness: 60, participant: { name: 'سارة الأحمد' }, org: { name: 'التجمع الصحي' } },
  summary: 'رسالة القائد.', cost: null, checks: [], review: null, sponsor: null, rubric: [],
  sections: [{ key: 'initiative-charter', title: 'بطاقة المبادرة', dimension: 'milestone', fields: [{ key: 'objective', label: 'الهدف', type: 'textarea', value: 'خفض الانتظار' }] },
    { key: 'cost-plan', title: 'الموارد والتكلفة', dimension: 'milestone', fields: [{ key: 'funding', label: 'التمويل', type: 'text', value: 'موازنة التشغيل' }] }],
};
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'beginner', track: { title: 'مسار' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
};

function server({ allow_notes = true, allow_download = true, fail = null } = {}) {
  const calls = [];
  const shares = [{ id: 's1', label: 'لجنة الابتكار', allow_notes: true, allow_download: true, show_levels: false, expires_at: '2026-12-15T00:00:00Z', created_at: '2026-11-15T00:00:00Z', views: 4, last_viewed_at: '2026-11-15T10:00:00Z', state: 'active', notes: 1, unread: 1 }];
  const notes = [{ id: 'n1', share_id: 's1', share_label: 'لجنة الابتكار', author_name: 'خالد المطيري', author_role: 'مدير الإدارة', section_key: 'cost-plan', body: 'هل التمويل مؤكد في موازنة العام القادم؟', read_at: null, created_at: '2026-11-15T10:05:00Z' }];
  const reply = (b) => {
    calls.push(b);
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return { success: true, initiative: 'موعد أول أقرب', scope: 'project', scope_title: 'مشروع', level: 'beginner', track: null,
        capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' }, sections: [{ id: 'm1', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0 }, { id: 'm2', key: 'cost-plan', title: 'الموارد والتكلفة', icon: '◆', dimension: 'milestone', complete: false, missing: 1 }],
        checks: [], readiness: 60, ready_min: 80, card: { state: 'approved', sla: 'يومي عمل' }, can_submit: false, blocker: 'x', rubric: [], examples: { doc: false } };
      case 'capstone.shares': return { success: true, ready: true, enabled: true, notes_enabled: true, shares, notes, archived: 0 };
      case 'capstone.share-create': {
        const s = { id: 's2', label: b.label, allow_notes: b.allow_notes, allow_download: b.allow_download, show_levels: b.show_levels, expires_at: '2026-11-22T00:00:00Z', created_at: '2026-11-15T12:00:00Z', views: 0, state: 'active', notes: 0, unread: 0 };
        shares.unshift(s);
        return { success: true, share: s, url: `https://leaders.example/i?t=${T}` };
      }
      case 'capstone.share-update': Object.assign(shares.find((x) => x.id === b.id), b); return { success: true };
      case 'capstone.share-revoke': shares.find((x) => x.id === b.id).state = 'revoked'; return { success: true };
      case 'capstone.note-mark': for (const n of notes) if (b.ids.includes(n.id) && b.read !== undefined) n.read_at = b.read ? '2026-11-15T12:00:00Z' : null; return { success: true };
      case 'share.get': return fail || { success: true, owner: 'سارة الأحمد', expires_at: '2026-12-15T00:00:00Z', allow_notes, allow_download, sections: DOC.sections.map((s) => ({ key: s.key, title: s.title })), doc: DOC };
      case 'share.note': return { success: true };
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
  return { calls, reply };
}

async function route(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
}

async function owner(page, srv) {
  await route(page, srv);
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-share-owner-00000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

async function reader(page, srv) {
  await route(page, srv);
  // الصفحة تُخدم بسياسة الإنتاج نفسها
  await page.route((u) => u.pathname === '/i', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } }); });
  await page.goto(`${APP}i?t=${T}`);
}

test('صاحب الوثيقة: بطاقة المشاركة بملاحظتها الجديدة، ورابط جديد يظهر مرة واحدة بخياراته', async ({ page }) => {
  const srv = server();
  await owner(page, srv);
  const card = page.getByRole('region', { name: /المشاركة والملاحظات/ });
  await expect(card.locator('[data-unread]')).toHaveText('ملاحظة جديدة');
  await card.getByRole('button', { name: 'إدارة المشاركة والملاحظات' }).click();
  await expect(page.getByRole('heading', { name: 'شارك «موعد أول أقرب»' })).toBeVisible();
  const form = page.locator('form.sh-new');
  await form.getByLabel('لمن هذا الرابط؟').fill('مديري المباشر');
  await form.getByText('أسبوع', { exact: true }).click();
  await form.getByText('يرى مستواي ومساري').click();
  await page.getByRole('button', { name: 'أنشئ الرابط' }).click();
  // ينتظر وصول الطلب: كان يُقرأ فور النقر فيسقط أحيانًا تحت حمل التشغيل الكامل قبل أن يُسجَّل الطلب
  await expect.poll(() => srv.calls.find((c) => c.action === 'capstone.share-create'))
    .toMatchObject({ label: 'مديري المباشر', days: 7, allow_notes: true, allow_download: true, show_levels: true });
  await expect(page.getByText('الرابط جاهز: «مديري المباشر»')).toBeVisible();
  await expect(page.locator('.sh-url code')).toHaveText(`https://leaders.example/i?t=${T}`);
  await expect(page.getByText('يظهر هنا مرة واحدة فقط')).toBeVisible();
});

test('صاحب الوثيقة: يغيّر ما يسمح به الرابط ويلغيه، ويقرأ الملاحظات الخاصة به', async ({ page }) => {
  const srv = server();
  await owner(page, srv);
  await page.getByRole('button', { name: 'إدارة المشاركة والملاحظات' }).click();
  const link = page.locator('[data-share="active"]').filter({ hasText: 'لجنة الابتكار' });
  await expect(link).toContainText('4 مشاهدات');
  await link.getByText('يحمّل ملف PDF').click();
  await expect.poll(() => srv.calls.find((c) => c.action === 'capstone.share-update')).toMatchObject({ id: 's1', allow_download: false });
  page.once('dialog', (d) => d.accept());
  await link.getByRole('button', { name: 'ألغِ الرابط' }).click();
  await expect.poll(() => srv.calls.some((c) => c.action === 'capstone.share-revoke' && c.id === 's1')).toBe(true);

  await page.getByRole('tab', { name: /الملاحظات \(1 جديدة\)/ }).click();
  const note = page.locator('[data-note="new"]');
  await expect(note).toContainText('خالد المطيري');
  await expect(note).toContainText('مدير الإدارة');
  await expect(note).toContainText('عن «الموارد والتكلفة»');
  await expect(note).toContainText('هل التمويل مؤكد');
  await note.getByRole('button', { name: 'تمت القراءة' }).click();
  await expect.poll(() => srv.calls.find((c) => c.action === 'capstone.note-mark')).toMatchObject({ ids: ['n1'], read: true });
  await expect(page.locator('[data-note="read"]')).toHaveCount(1);
});

test('من يفتح الرابط: الوثيقة بتصميمها داخل الصفحة تحت سياسة الإنتاج، والرمز يُزال من العنوان، وملاحظة تصل صاحبها وحده', async ({ page }) => {
  const srv = server();
  const csp = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await reader(page, srv);
  await expect(page.getByRole('heading', { name: 'موعد أول أقرب', level: 1 })).toBeVisible();
  await expect(page.getByText('شاركك سارة الأحمد')).toBeVisible();
  expect(page.url()).not.toContain(T);
  const frame = page.frameLocator('iframe.si-frame');
  await expect(frame.getByText('ميثاق المبادرة').first()).toBeVisible();
  await expect(frame.getByText(/نسخة شاركها سارة الأحمد برابط خاص/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'تحميل PDF' })).toBeVisible();

  await page.getByRole('button', { name: 'اكتب ملاحظة لقائد المبادرة' }).click();
  await page.getByLabel('اسمك').fill('خالد المطيري');
  await page.getByLabel(/صفتك/).fill('مدير الإدارة');
  await page.getByLabel(/عن أي جزء/).selectOption('cost-plan');
  await page.getByLabel('ملاحظتك').fill('هل التمويل مؤكد؟');
  await page.getByRole('button', { name: 'أرسل الملاحظة' }).click();
  await expect(page.getByText('وصلت ملاحظتك إلى سارة الأحمد.')).toBeVisible();
  expect(srv.calls.find((c) => c.action === 'share.note')).toMatchObject({ t: T, name: 'خالد المطيري', role: 'مدير الإدارة', section: 'cost-plan', body: 'هل التمويل مؤكد؟' });
  expect(csp).toEqual([]);
});

test('من يفتح الرابط: ما لم يسمح به صاحبه لا يظهر، والرابط الملغى يقول ذلك', async ({ page }) => {
  await reader(page, server({ allow_notes: false, allow_download: false }));
  await expect(page.getByText('شاركك سارة الأحمد')).toBeVisible();
  await expect(page.getByRole('button', { name: 'تحميل PDF' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اكتب ملاحظة لقائد المبادرة' })).toHaveCount(0);

  const p2 = await page.context().newPage();
  await reader(p2, server({ fail: { success: false, message: 'ألغى قائد المبادرة هذا الرابط', code: 'revoked' } }));
  await expect(p2.getByRole('heading', { name: 'الرابط غير متاح' })).toBeVisible();
  await expect(p2.getByText('ألغى قائد المبادرة هذا الرابط')).toBeVisible();
});
